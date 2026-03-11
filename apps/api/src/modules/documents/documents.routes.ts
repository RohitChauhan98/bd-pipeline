/**
 * Documents Routes
 *
 * Document upload, listing, deletion, AI scanning, and download.
 */

import { Router } from 'express';
import { documentsController } from './documents.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  uploadDocumentSchema,
  documentListQuerySchema,
  docIdParam,
  clientIdParam,
} from '@bd-pipeline/shared';

const router = Router();

// ── Document CRUD ─────────────────────────────

router.post(
  '/documents/upload',
  authenticate,
  validate({ body: uploadDocumentSchema }),
  documentsController.upload,
);

router.get(
  '/documents/:clientId',
  authenticate,
  validate({ params: clientIdParam, query: documentListQuerySchema }),
  documentsController.listByClient,
);

router.get(
  '/documents/detail/:docId',
  authenticate,
  validate({ params: docIdParam }),
  documentsController.getById,
);

router.delete(
  '/documents/:docId',
  authenticate,
  validate({ params: docIdParam }),
  documentsController.delete,
);

// ── AI Document Scanning ──────────────────────

router.post(
  '/documents/:docId/scan',
  authenticate,
  validate({ params: docIdParam }),
  documentsController.triggerScan,
);

router.get(
  '/documents/:docId/scan/result',
  authenticate,
  validate({ params: docIdParam }),
  documentsController.getScanResult,
);

// ── Download ──────────────────────────────────

router.get(
  '/documents/:docId/download',
  authenticate,
  validate({ params: docIdParam }),
  documentsController.getDownloadUrl,
);

export { router as documentsRoutes };
