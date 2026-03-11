/**
 * Document Agent — Phase 2
 *
 * Monitors document uploads, auto-triggers AI scans,
 * validates document completeness, alerts on approaching expiry dates,
 * and flags documents with issues.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { EVENTS } from '../services/event-bus.service.js';
import { prisma } from '../config/db.js';

class DocumentAgent extends BaseAgent {
  constructor() {
    super('document');
  }

  async initialize(): Promise<void> {
    // Subscribe to document upload events
    this.subscribeToEvent(EVENTS.DOCUMENT_UPLOADED, async (event) => {
      const docId = event.payload['docId'] as string;
      if (docId) {
        this.logger.info({ docId }, 'Document uploaded — triggering auto-scan');
        await this.autoScan(docId);
      }
    });

    this.logger.info('Document Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'auto-scan': {
          const docId = task.payload['docId'] as string;
          const result = await this.autoScan(docId);
          return { success: true, data: result };
        }

        case 'check-completeness': {
          const clientId = task.payload['clientId'] as string;
          const result = await this.checkCompleteness(clientId);
          return { success: true, data: result };
        }

        case 'check-expiry': {
          const result = await this.checkExpiringDocuments();
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'Document task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(_config: Record<string, unknown>): Promise<AgentResult> {
    const [expiryResults, issueResults] = await Promise.all([
      this.checkExpiringDocuments(),
      this.flagDocumentsWithIssues(),
    ]);

    return {
      success: true,
      data: { expiring: expiryResults, issues: issueResults },
    };
  }

  // ── Private Methods ─────────────────────────

  private async autoScan(docId: string) {
    const doc = await prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return { error: 'Document not found' };
    if (doc.scanStatus === 'SCANNING') return { status: 'already_scanning' };

    await prisma.document.update({
      where: { id: docId },
      data: { scanStatus: 'SCANNING' },
    });

    // Simulate AI scan — in production, queue to BullMQ for actual processing
    try {
      // Basic validation checks
      const issues: string[] = [];
      if (doc.fileSizeKb === 0) issues.push('Empty file');
      if (!doc.name) issues.push('Missing filename');

      const scanResult = {
        scannedAt: new Date().toISOString(),
        fileType: doc.fileType,
        fileSizeKb: doc.fileSizeKb,
        issues,
        status: issues.length > 0 ? 'ISSUES_FOUND' : 'OK',
      };

      await prisma.document.update({
        where: { id: docId },
        data: {
          scanStatus: issues.length > 0 ? 'ISSUES_FOUND' : 'OK',
          scanResult: scanResult as never,
        },
      });

      await this.logAction(
        'auto_scan',
        'document',
        docId,
        'success',
        issues.length > 0 ? `Issues found: ${issues.join(', ')}` : 'Scan passed',
      );

      return { docId, scanStatus: scanResult.status, issues };
    } catch (err) {
      await prisma.document.update({
        where: { id: docId },
        data: { scanStatus: 'NOT_SCANNED' },
      });
      throw err;
    }
  }

  private async checkCompleteness(clientId: string) {
    const documents = await prisma.document.findMany({ where: { clientId } });

    const requiredCategories = ['CONTRACT', 'KYC'];
    const existingCategories = new Set(documents.map((d) => d.category));

    const missing = requiredCategories.filter((c) => !existingCategories.has(c));
    const withIssues = documents.filter((d) => d.scanStatus === 'ISSUES_FOUND');

    if (missing.length > 0 || withIssues.length > 0) {
      // Notify the client's manager
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { assignedManagerId: true, companyName: true },
      });

      if (client?.assignedManagerId) {
        const body = [
          missing.length > 0 ? `Missing: ${missing.join(', ')}` : '',
          withIssues.length > 0 ? `Issues in ${withIssues.length} document(s)` : '',
        ].filter(Boolean).join('. ');

        await prisma.notification.create({
          data: {
            userId: client.assignedManagerId,
            type: 'APPROVAL_REQUEST',
            title: `Document issues: ${client.companyName}`,
            body,
          },
        });
      }
    }

    return {
      clientId,
      totalDocuments: documents.length,
      missingCategories: missing,
      documentsWithIssues: withIssues.length,
      isComplete: missing.length === 0 && withIssues.length === 0,
    };
  }

  private async checkExpiringDocuments() {
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const expiring = await prisma.document.findMany({
      where: {
        expiryDate: { lte: thirtyDaysFromNow, gte: new Date() },
      },
      include: {
        client: { select: { id: true, companyName: true, assignedManagerId: true } },
      },
    });

    for (const doc of expiring) {
      if (doc.client.assignedManagerId) {
        const daysLeft = Math.ceil(
          (doc.expiryDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );

        await prisma.notification.create({
          data: {
            userId: doc.client.assignedManagerId,
            type: 'SLA_ALERT',
            title: `Document expiring: ${doc.name}`,
            body: `${doc.name} for ${doc.client.companyName} expires in ${daysLeft} days`,
          },
        });
      }

      await this.logAction(
        'expiry_alert',
        'document',
        doc.id,
        'success',
        `Document expiring soon`,
      );
    }

    return { expiringCount: expiring.length };
  }

  private async flagDocumentsWithIssues() {
    const withIssues = await prisma.document.findMany({
      where: { scanStatus: 'ISSUES_FOUND' },
      include: { client: { select: { companyName: true } } },
    });

    return {
      documentsWithIssues: withIssues.length,
      documents: withIssues.map((d) => ({
        id: d.id,
        name: d.name,
        client: d.client.companyName,
        scanResult: d.scanResult,
      })),
    };
  }
}

export const documentAgent = new DocumentAgent();
