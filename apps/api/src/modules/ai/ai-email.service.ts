/**
 * AI Email Service — Phase 2
 *
 * AI-generated email management: generation, approval workflow,
 * and sending via SendGrid.
 */

import { Prisma } from '@bd-pipeline/db';
import { prisma } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';
import { emailSendQueue } from '../../config/queue.js';

export const aiEmailService = {
  /** Generate an AI follow-up email */
  async generate(data: {
    clientId?: string;
    leadId?: string;
    type?: string;
    toEmail: string;
    context?: string;
    userId: string;
  }) {
    // Gather context for AI generation
    let contextData = data.context ?? '';
    if (data.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: data.clientId },
        include: { onboardingPipeline: true },
      });
      if (!client) throw new NotFoundError('Client');
      contextData += `\nClient: ${client.companyName}, Stage: ${client.onboardingPipeline?.currentStage ?? 'N/A'}`;
    }
    if (data.leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
      if (!lead) throw new NotFoundError('Lead');
      contextData += `\nLead: ${lead.companyName}, Status: ${lead.status}`;
    }

    // Generate email via AI
    let subject = 'Follow-up';
    let body = '';

    try {
      const { ChatOllama } = await import('@langchain/community/chat_models/ollama');
      const { ChatPromptTemplate } = await import('@langchain/core/prompts');
      const { StringOutputParser } = await import('@langchain/core/output_parsers');

      const model = new ChatOllama({
        model: process.env['OLLAMA_MODEL'] ?? 'gpt-oss:120b-cloud',
        baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://ollama-host:11434',
        temperature: 0.5,
      });

      const prompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `Write a professional business email. Return ONLY valid JSON with "subject" and "body" keys. Do not include any extra text.`,
        ],
        [
          'human',
          `Email type: {type}
Recipient: {toEmail}
Context: {context}`,
        ],
      ]);

      const chain = prompt.pipe(model).pipe(new StringOutputParser());
      const result = await chain.invoke({
        type: data.type ?? 'CUSTOM',
        toEmail: data.toEmail,
        context: contextData || 'General follow-up',
      });

      try {
        const parsed = JSON.parse(result);
        subject = parsed.subject ?? subject;
        body = parsed.body ?? result;
      } catch {
        body = result;
      }
    } catch (err) {
      logger.warn({ err }, 'AI email generation failed, creating draft with placeholder');
      subject = `${data.type ?? 'Follow-up'} Email`;
      body = `[AI generation unavailable — please write content manually]\n\nContext: ${contextData}`;
    }

    const email = await prisma.aiEmail.create({
      data: {
        clientId: data.clientId ?? null,
        leadId: data.leadId ?? null,
        type: (data.type ?? 'CUSTOM') as never,
        toEmail: data.toEmail,
        subject,
        body,
        status: 'DRAFT',
      },
    });

    logger.info({ emailId: email.id, type: data.type }, 'AI email generated');
    return email;
  },

  /** Edit an AI email */
  async edit(id: string, data: { subject?: string; body?: string }) {
    const email = await prisma.aiEmail.findUnique({ where: { id } });
    if (!email) throw new NotFoundError('AI Email');
    if (email.status === 'SENT') throw new BadRequestError('Cannot edit a sent email');

    return prisma.aiEmail.update({
      where: { id },
      data: { ...data, status: 'DRAFT' },
    });
  },

  /** Approve an AI email for sending */
  async approve(id: string, userId: string) {
    const email = await prisma.aiEmail.findUnique({ where: { id } });
    if (!email) throw new NotFoundError('AI Email');
    if (email.status === 'SENT') throw new BadRequestError('Email already sent');

    return prisma.aiEmail.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedById: userId,
        approvedAt: new Date(),
      },
    });
  },

  /** Reject an AI email */
  async reject(id: string, userId: string) {
    const email = await prisma.aiEmail.findUnique({ where: { id } });
    if (!email) throw new NotFoundError('AI Email');

    return prisma.aiEmail.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedById: userId,
      },
    });
  },

  /** Send an approved AI email via queue */
  async send(id: string) {
    const email = await prisma.aiEmail.findUnique({ where: { id } });
    if (!email) throw new NotFoundError('AI Email');
    if (email.status !== 'APPROVED') {
      throw new BadRequestError('Email must be approved before sending');
    }

    // Update status to pending and queue for delivery
    await prisma.aiEmail.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });

    await emailSendQueue.add('send-ai-email', {
      emailId: id,
      to: email.toEmail,
      subject: email.subject,
      body: email.body,
    });

    // Mark as sent (in production, the queue processor would do this)
    await prisma.aiEmail.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    logger.info({ emailId: id, to: email.toEmail }, 'AI email sent');
    return { emailId: id, status: 'SENT' };
  },

  /** List AI emails with filtering */
  async list(query: {
    page: number;
    limit: number;
    status?: string;
    type?: string;
  }) {
    const where: Prisma.AiEmailWhereInput = {};
    if (query.status) where.status = query.status as Prisma.EnumAiEmailStatusFilter;
    if (query.type) where.type = query.type as Prisma.EnumAiEmailTypeFilter;

    const [emails, total] = await Promise.all([
      prisma.aiEmail.findMany({
        where,
        ...paginate(query.page, query.limit),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, companyName: true } },
          lead: { select: { id: true, companyName: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.aiEmail.count({ where }),
    ]);

    return { emails, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  /** Get a single AI email */
  async getById(id: string) {
    const email = await prisma.aiEmail.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true } },
        lead: { select: { id: true, companyName: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!email) throw new NotFoundError('AI Email');
    return email;
  },
};
