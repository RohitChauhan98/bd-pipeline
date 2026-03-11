/**
 * Documents Service — Business Logic
 *
 * File upload management, document metadata, and AI scan triggers
 * for client onboarding documents.
 */

import { Prisma } from '@bd-pipeline/db';
import { prisma } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';
import { s3Service } from '../../services/s3.service.js';

export const documentsService = {
  /** List documents for a client with filtering */
  async listByClient(
    clientId: string,
    query: { page: number; limit: number; category?: string },
  ) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError('Client');

    const where: Prisma.DocumentWhereInput = { clientId };
    if (query.category) where.category = query.category as Prisma.EnumDocumentCategoryFilter;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        ...paginate(query.page, query.limit),
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.document.count({ where }),
    ]);

    return { documents, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  /** Get a single document */
  async getById(docId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, companyName: true } },
      },
    });
    if (!doc) throw new NotFoundError('Document');
    return doc;
  },

  /** Upload a document — creates metadata and returns a presigned upload URL */
  async upload(data: {
    clientId: string;
    name: string;
    fileType: string;
    fileSizeKb: number;
    category?: string;
    expiryDate?: Date;
    uploadedById: string;
  }) {
    const client = await prisma.client.findUnique({
      where: { id: data.clientId },
      include: { onboardingPipeline: true },
    });
    if (!client) throw new NotFoundError('Client');

    // Generate S3 key
    const key = `documents/${data.clientId}/${Date.now()}-${data.name}`;
    const uploadUrl = await s3Service.getUploadUrl(key, data.fileType);

    const document = await prisma.document.create({
      data: {
        clientId: data.clientId,
        pipelineId: client.onboardingPipeline?.id ?? null,
        name: data.name,
        fileUrl: key,
        fileType: data.fileType,
        fileSizeKb: data.fileSizeKb,
        category: (data.category ?? 'OTHER') as never,
        expiryDate: data.expiryDate,
        uploadedById: data.uploadedById,
      },
    });

    logger.info({ docId: document.id, clientId: data.clientId }, 'Document uploaded');
    return { document, uploadUrl };
  },

  /** Delete a document */
  async delete(docId: string) {
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundError('Document');

    await prisma.document.delete({ where: { id: docId } });
    logger.info({ docId }, 'Document deleted');
    return { deleted: true };
  },

  /** Trigger an AI scan on a document */
  async triggerScan(docId: string) {
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundError('Document');

    if (doc.scanStatus === 'SCANNING') {
      throw new BadRequestError('Scan already in progress');
    }

    await prisma.document.update({
      where: { id: docId },
      data: { scanStatus: 'SCANNING' },
    });

    // TODO: Queue actual AI scan via BullMQ
    // For now, simulate scan completion
    logger.info({ docId }, 'Document scan triggered');
    return { docId, scanStatus: 'SCANNING' };
  },

  /** Get scan results for a document */
  async getScanResult(docId: string) {
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundError('Document');

    return {
      docId: doc.id,
      name: doc.name,
      scanStatus: doc.scanStatus,
      scanResult: doc.scanResult,
    };
  },

  /** Get download URL for a document */
  async getDownloadUrl(docId: string) {
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) throw new NotFoundError('Document');

    const downloadUrl = await s3Service.getDownloadUrl(doc.fileUrl);
    return { docId: doc.id, name: doc.name, downloadUrl };
  },
};
