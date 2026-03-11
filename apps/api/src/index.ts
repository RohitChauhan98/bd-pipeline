/**
 * BD Pipeline — Express Application Entry Point
 *
 * Bootstraps the Express server with all middleware, routes, and services.
 * Run: pnpm --filter @bd-pipeline/api dev
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './config/db.js';
import { registerRepeatableJobs } from './config/queue.js';
import { setupSwagger } from './config/swagger.js';

// Middleware
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { generalLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';

// Routes
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { leadsRoutes } from './modules/leads/leads.routes.js';
import { outreachRoutes } from './modules/outreach/outreach.routes.js';
import { clientsRoutes } from './modules/clients/clients.routes.js';
import { callsRoutes } from './modules/calls/calls.routes.js';
import { proposalsRoutes } from './modules/proposals/proposals.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { aiEmailRoutes } from './modules/ai/ai-email.routes.js';
import { dealsRoutes } from './modules/deals/deals.routes.js';
import agentRoutes from './modules/agent/agent.routes.js';
import { onboardingRoutes } from './modules/onboarding/onboarding.routes.js';
import { documentsRoutes } from './modules/documents/documents.routes.js';
import { meetingsRoutes } from './modules/meetings/meetings.routes.js';
import { npsRoutes } from './modules/nps/nps.routes.js';
import { successRoutes } from './modules/success/success.routes.js';

// Shutdown
import { registerShutdownHandlers } from './utils/graceful-shutdown.js';

// ── Create Express App ───────────────────────

const app = express();

// ── Global Middleware ────────────────────────

app.set('trust proxy', 1);

// Request ID must be first to ensure all logs have requestId
app.use(requestId);

// pino-http for HTTP request logging (use our custom logger for more control)
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url?.includes('/health') || req.url?.includes('/api/docs'),
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} - ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} - ${res.statusCode} - ${err.message}`;
  },
}));

// Additional structured request logging
app.use(requestLogger);

app.use(cors({
  origin: env.CORS_ORIGIN ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(generalLimiter);

// ── API Documentation ────────────────────────

setupSwagger(app);

// ── API Routes ───────────────────────────────

const API_PREFIX = '/api/v1';

app.use(API_PREFIX, healthRoutes);
app.use(API_PREFIX, authRoutes);
app.use(API_PREFIX, leadsRoutes);
app.use(API_PREFIX, outreachRoutes);
app.use(API_PREFIX, clientsRoutes);
app.use(API_PREFIX, callsRoutes);
app.use(API_PREFIX, proposalsRoutes);
app.use(API_PREFIX, aiRoutes);
app.use(API_PREFIX, aiEmailRoutes);
app.use(API_PREFIX, dealsRoutes);
app.use(API_PREFIX, onboardingRoutes);
app.use(API_PREFIX, documentsRoutes);
app.use(API_PREFIX, meetingsRoutes);
app.use(API_PREFIX, npsRoutes);
app.use(API_PREFIX, successRoutes);
app.use(`${API_PREFIX}/agent`, agentRoutes);

// ── Error Handling ───────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ── Start Server ─────────────────────────────

async function bootstrap() {
  // Verify database connection
  await prisma.$connect();
  logger.info('Database connected');

  // Register repeatable BullMQ jobs (SLA check, follow-up processor)
  await registerRepeatableJobs();
  logger.info('Repeatable jobs registered');

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'BD Pipeline API server started');
    logger.info(`API docs: http://localhost:${env.PORT}/api/docs`);
  });

  // Register graceful shutdown handlers
  registerShutdownHandlers(server);
}

bootstrap().catch((error) => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});

export { app };
