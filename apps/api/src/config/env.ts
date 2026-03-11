/**
 * Environment Configuration
 *
 * Validates all environment variables at startup using Zod.
 * If any required variable is missing or invalid, the application
 * will fail fast with a clear error message.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url().default('http://localhost:3001'),
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Ollama
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('gpt-oss:120b-cloud'),

  // Transcription Sidecar
  TRANSCRIPTION_SERVICE_URL: z.string().url().default('http://localhost:5001'),

  // AWS S3 / Cloudflare R2
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().default('bd-pipeline-uploads'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // SendGrid
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().optional(),
  SENDGRID_FROM_NAME: z.string().default('BD Pipeline'),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),

  // Google APIs
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // Lead Enrichment & Discovery
  CLEARBIT_API_KEY: z.string().optional(),
  HUNTER_API_KEY: z.string().optional(),
  APOLLO_API_KEY: z.string().optional(),
  // Web search for AI lead discovery (use at least one for real results)
  TAVILY_API_KEY: z.string().optional(),   // https://tavily.com — free 1000 req/mo
  SERPAPI_KEY: z.string().optional(),       // https://serpapi.com — $50/mo, 5000 req
  // SearXNG meta-search engine (self-hosted, free, no API key)
  SEARXNG_URL: z.string().url().optional().default('http://searxng:8080'),
  // Ollama model aliases (docker env sets OLLAMA_PRIMARY_MODEL etc.)
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),
  OLLAMA_FAST_MODEL: z.string().default('llama3.1:8b'),
  OLLAMA_PRIMARY_MODEL: z.string().default('llama3.1:8b'),

  // Sentry
  SENTRY_DSN: z.string().optional(),

  // PostHog
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
  LOG_SLOW_THRESHOLD_MS: z.coerce.number().default(3000),
  LOG_DB_SLOW_THRESHOLD_MS: z.coerce.number().default(500),
  LOG_REQUEST_BODY: z.coerce.boolean().default(false),
  LOG_RESPONSE_BODY: z.coerce.boolean().default(false),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws with detailed error messages on failure.
 */
function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const errors = Object.entries(formatted)
      .filter(([key]) => key !== '_errors')
      .map(([key, value]) => {
        const err = value as { _errors?: string[] };
        return `  ${key}: ${err._errors?.join(', ') ?? 'Invalid'}`;
      })
      .join('\n');

    console.error(`\n❌ Environment validation failed:\n${errors}\n`);
    process.exit(1);
  }

  return result.data;
}

/** Validated environment variables — access anywhere via import */
export const env = validateEnv();
