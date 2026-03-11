/**
 * Outreach Service — Business Logic
 *
 * Handles AI pitch generation via LangChain + Ollama, pitch approval workflow,
 * email sending, and follow-up sequence management.
 */

import { prisma } from '../../config/db.js';
import { emailSendQueue, followUpQueue } from '../../config/queue.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';

export const outreachService = {
  /**
   * Generate an AI pitch for a lead using LangChain + ChatOllama.
   */
  async generatePitch(
    leadId: string,
    userId: string,
    channel: 'EMAIL' | 'LINKEDIN' | 'WHATSAPP',
    tone: string,
    template?: string,
    context?: string,
  ) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError('Lead');

    // Lazy-load LangChain to keep startup fast
    const { ChatOllama } = await import('@langchain/community/chat_models/ollama');
    const { ChatPromptTemplate } = await import('@langchain/core/prompts');
    const { StringOutputParser } = await import('@langchain/core/output_parsers');

    const model = new ChatOllama({
      model: process.env['OLLAMA_MODEL'] ?? 'gpt-oss:120b-cloud',
      baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://ollama-host:11434',
      temperature: 0.7,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are an expert B2B sales copywriter. Write a personalized outreach email.
Tone: {tone}
${template ? `Template style: ${template}` : ''}
Keep it concise, professional, and compelling. Include a clear CTA.`,
      ],
      [
        'human',
        `Write an outreach pitch for this company:
Company: {companyName}
Industry: {industry}
Contact: {contactName} ({contactTitle})
Email: {contactEmail}
Revenue: {revenue}
Employee Count: {employeeCount}
${context ? `Additional context: ${context}` : ''}

Generate a subject line and email body.`,
      ],
    ]);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const result = await chain.invoke({
      tone,
      companyName: lead.companyName,
      industry: lead.industry ?? 'Unknown',
      contactName: lead.contactName ?? 'Decision Maker',
      contactTitle: lead.contactTitle ?? '',
      contactEmail: lead.contactEmail ?? '',
      revenue: lead.revenue ? `$${lead.revenue}` : 'Unknown',
      employeeCount: lead.employeeCount ?? 'Unknown',
    });

    // Parse subject and body from AI response
    const { subject, body } = parsePitchResponse(result);

    const pitch = await prisma.outreachPitch.create({
      data: {
        leadId,
        channel,
        subject,
        body,
        status: 'DRAFT',
      },
    });

    logger.info({ pitchId: pitch.id, leadId }, 'AI pitch generated');
    return pitch;
  },

  /** Get a pitch by ID */
  async getPitch(id: string) {
    const pitch = await prisma.outreachPitch.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, companyName: true, contactName: true, contactEmail: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    if (!pitch) throw new NotFoundError('Pitch');
    return pitch;
  },

  /** Edit a draft pitch */
  async editPitch(id: string, data: { subject?: string; body?: string }) {
    const pitch = await prisma.outreachPitch.findUnique({ where: { id } });
    if (!pitch) throw new NotFoundError('Pitch');
    if (pitch.status === 'SENT') throw new BadRequestError('Cannot edit a sent pitch');

    return prisma.outreachPitch.update({ where: { id }, data });
  },

  /** Approve a pitch for sending */
  async approvePitch(id: string, userId: string) {
    const pitch = await prisma.outreachPitch.findUnique({ where: { id } });
    if (!pitch) throw new NotFoundError('Pitch');
    if (pitch.status !== 'DRAFT') throw new BadRequestError('Pitch is not in DRAFT status');

    return prisma.outreachPitch.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: userId, approvedAt: new Date() },
    });
  },

  /**
   * Send a pitch via email. Queues the email for async delivery.
   */
  async sendPitch(id: string, sendVia: string) {
    const pitch = await prisma.outreachPitch.findUnique({
      where: { id },
      include: { lead: true },
    });
    if (!pitch) throw new NotFoundError('Pitch');
    if (pitch.status !== 'APPROVED') throw new BadRequestError('Pitch must be approved first');
    if (!pitch.lead.contactEmail) throw new BadRequestError('Lead has no contact email');

    // Queue email send
    await emailSendQueue.add('send-pitch', {
      pitchId: pitch.id,
      to: pitch.lead.contactEmail,
      subject: pitch.subject,
      body: pitch.body,
      sendVia,
    });

    await prisma.outreachPitch.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });

    logger.info({ pitchId: id, to: pitch.lead.contactEmail }, 'Pitch queued for sending');
    return { message: 'Email queued for delivery' };
  },

  /**
   * Schedule a follow-up sequence for a lead.
   */
  async scheduleFollowup(
    leadId: string,
    _userId: string,
    steps: Array<{ channel: 'EMAIL' | 'LINKEDIN' | 'WHATSAPP'; delayHours: number; subject?: string; body: string }>,
  ) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError('Lead');

    const sequence = await prisma.followupSequence.create({
      data: {
        leadId,
        status: 'ACTIVE',
        totalSteps: steps.length,
        steps: {
          create: steps.map((step, index) => ({
            stepNumber: index + 1,
            channel: step.channel,
            delayHours: step.delayHours,
            subject: step.subject,
            body: step.body,
            status: 'PENDING',
          })),
        },
      },
      include: { steps: true },
    });

    // Schedule first step in the follow-up queue
    const firstStep = sequence.steps[0];
    if (firstStep) {
      await followUpQueue.add(
        'send-followup-step',
        { sequenceId: sequence.id, stepId: firstStep.id, leadId },
        { delay: firstStep.delayHours * 60 * 60 * 1000 },
      );
    }

    logger.info({ sequenceId: sequence.id, stepCount: steps.length }, 'Follow-up sequence created');
    return sequence;
  },

  /** Get a follow-up sequence with steps */
  async getFollowupSequence(id: string) {
    const sequence = await prisma.followupSequence.findUnique({
      where: { id },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        lead: { select: { id: true, companyName: true, contactEmail: true } },
      },
    });
    if (!sequence) throw new NotFoundError('Follow-up sequence');
    return sequence;
  },

  /** Cancel a follow-up sequence */
  async cancelFollowup(id: string) {
    const sequence = await prisma.followupSequence.findUnique({ where: { id } });
    if (!sequence) throw new NotFoundError('Follow-up sequence');

    await prisma.$transaction([
      prisma.followupSequence.update({
        where: { id },
        data: { status: 'CANCELLED' },
      }),
      prisma.followupStep.updateMany({
        where: { sequenceId: id, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      }),
    ]);

    logger.info({ sequenceId: id }, 'Follow-up sequence cancelled');
    return { message: 'Follow-up sequence cancelled' };
  },

  /** Get outreach analytics — pitch counts, response rates, etc. */
  async getAnalytics() {
    const [totalPitches, sentPitches, activeFollowups, pitchesByStatus] = await Promise.all([
      prisma.outreachPitch.count(),
      prisma.outreachPitch.count({ where: { status: 'SENT' } }),
      prisma.followupSequence.count({ where: { status: 'ACTIVE' } }),
      prisma.outreachPitch.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      totalPitches,
      sentPitches,
      activeFollowups,
      pitchesByStatus: pitchesByStatus.map((g) => ({ status: g.status, count: g._count })),
    };
  },
};

/**
 * Parse the AI output into subject line and body.
 * Expects format: "Subject: ..." followed by the body.
 */
function parsePitchResponse(text: string): { subject: string; body: string } {
  const lines = text.trim().split('\n');
  let subject = 'Follow-up from our team';
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.toLowerCase().startsWith('subject:')) {
      subject = line.replace(/^subject:\s*/i, '').trim();
      bodyStart = i + 1;
      break;
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();
  return { subject, body: body || text.trim() };
}
