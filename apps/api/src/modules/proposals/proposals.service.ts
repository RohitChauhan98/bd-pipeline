/**
 * Proposals Service — Business Logic
 *
 * AI proposal generation, editing, approval, and deal closing workflow.
 * Deal close converts a lead into a client and starts the onboarding pipeline.
 */

import { prisma } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';

export const proposalsService = {
  /**
   * Generate an AI proposal for a lead using discovery call insights.
   */
  async generate(
    leadId: string,
    userId: string,
    requirements?: string,
    budget?: string,
    timeline?: string,
  ) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        discoveryCalls: {
          where: { transcript: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!lead) throw new NotFoundError('Lead');

    // Lazy-load LangChain
    const { ChatOllama } = await import('@langchain/community/chat_models/ollama');
    const { ChatPromptTemplate } = await import('@langchain/core/prompts');
    const { StringOutputParser } = await import('@langchain/core/output_parsers');

    const model = new ChatOllama({
      model: process.env['OLLAMA_MODEL'] ?? 'gpt-oss:120b-cloud',
      baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://ollama-host:11434',
      temperature: 0.4,
    });

    const callSummary = lead.discoveryCalls[0]?.transcript ?? 'No discovery call summary available';

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are a professional business proposal writer. Create a structured project proposal.
Include: Executive Summary, Scope, Deliverables, Timeline, Pricing, Terms & Conditions.
Be professional and detailed but concise.`,
      ],
      [
        'human',
        `Generate a proposal for:
Company: {companyName}
Industry: {industry}
Contact: {contactName}
Discovery Call Summary: {callSummary}
Requirements: {requirements}
Budget: {budget}
Timeline: {timeline}`,
      ],
    ]);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const content = await chain.invoke({
      companyName: lead.companyName,
      industry: lead.industry ?? 'Unknown',
      contactName: lead.contactName ?? 'Client',
      callSummary,
      requirements: requirements ?? 'To be discussed',
      budget: budget ?? 'To be discussed',
      timeline: timeline ?? 'To be discussed',
    });

    const proposal = await prisma.proposal.create({
      data: {
        leadId,
        title: `Proposal for ${lead.companyName}`,
        body: content,
        status: 'DRAFT',
      },
    });

    logger.info({ proposalId: proposal.id, leadId }, 'AI proposal generated');
    return proposal;
  },

  /** Get a single proposal */
  async getById(id: string) {
    const proposal = await prisma.proposal.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, companyName: true, contactName: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
    if (!proposal) throw new NotFoundError('Proposal');
    return proposal;
  },

  /** Edit a draft proposal */
  async edit(id: string, data: { content?: string; status?: string }) {
    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundError('Proposal');
    if (proposal.status === 'ACCEPTED') throw new BadRequestError('Cannot edit accepted proposal');

    // Map content → body if provided
    const updateData: Record<string, unknown> = { ...data };
    if (updateData['content']) {
      updateData['body'] = updateData['content'];
      delete updateData['content'];
    }
    return prisma.proposal.update({ where: { id }, data: updateData as never });
  },

  /** Approve a proposal (mark as SENT) */
  async approve(id: string) {
    const proposal = await prisma.proposal.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundError('Proposal');
    if (proposal.status !== 'DRAFT') throw new BadRequestError('Proposal must be in DRAFT');

    return prisma.proposal.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  },

  /** List proposals for a lead */
  async listByLead(leadId: string) {
    return prisma.proposal.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Close a deal — transition lead to WON, create a Client, start onboarding pipeline.
   */
  async closeDeal(data: {
    leadId: string;
    proposalId: string;
    dealValue: number;
    accountManagerId: string;
    userId: string;
  }) {
    const lead = await prisma.lead.findUnique({ where: { id: data.leadId } });
    if (!lead) throw new NotFoundError('Lead');
    if (lead.status === 'DEAL_CLOSED') throw new BadRequestError('Deal already closed');

    const proposal = await prisma.proposal.findUnique({ where: { id: data.proposalId } });
    if (!proposal) throw new NotFoundError('Proposal');

    const result = await prisma.$transaction(async (tx) => {
      // Mark lead as WON
      await tx.lead.update({
        where: { id: data.leadId },
        data: { status: 'DEAL_CLOSED' },
      });

      // Mark proposal as ACCEPTED
      await tx.proposal.update({
        where: { id: data.proposalId },
        data: { status: 'ACCEPTED' },
      });

      // Create the client
      const client = await tx.client.create({
        data: {
          companyName: lead.companyName,
          primaryContactName: lead.contactName ?? lead.companyName,
          primaryContactEmail: lead.contactEmail ?? '',
          primaryContactPhone: lead.contactPhone,
          contractValue: data.dealValue,
          assignedManagerId: data.accountManagerId,
          leadId: data.leadId,
        },
      });

      // Create onboarding pipeline
      const pipeline = await tx.onboardingPipeline.create({
        data: {
          clientId: client.id,
          currentStage: 'DEAL_CLOSED',
        },
      });

      // Create initial stage log
      await tx.onboardingStageLog.create({
        data: {
          pipelineId: pipeline.id,
          fromStage: 'DEAL_CLOSED',
          toStage: 'DEAL_CLOSED',
          transitionedById: data.userId,
          notes: 'Deal closed — onboarding initiated',
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: data.userId,
          action: 'DEAL_CLOSED',
          resourceType: 'Client',
          resourceId: client.id,
          metadata: {
            leadId: data.leadId,
            proposalId: data.proposalId,
            dealValue: data.dealValue,
          },
        },
      });

      return client;
    });

    logger.info(
      { clientId: result.id, leadId: data.leadId, dealValue: data.dealValue },
      'Deal closed — client created',
    );

    return result;
  },
};
