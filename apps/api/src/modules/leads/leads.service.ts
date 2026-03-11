/**
 * Leads Service — Business Logic
 *
 * Handles all lead-related operations including CRUD, search job creation,
 * scoring, review workflow, and enrichment.
 */

import { prisma } from '../../config/db.js';
import { leadSearchQueue, aiScoringQueue } from '../../config/queue.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';
import { leadDiscoveryService, type SearchFilters } from '../../services/lead-discovery.service.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';
import type { Prisma } from '@bd-pipeline/db';

export const leadsService = {
  /**
   * Create a new lead manually.
   */
  async create(data: Prisma.LeadCreateInput & { assignedToId?: string }, userId: string) {
    const { assignedToId, ...rest } = data as any;
    const lead = await prisma.lead.create({
      data: {
        ...rest,
        source: rest.source ?? 'MANUAL',
        status: rest.status ?? 'DISCOVERED',
        assignedTo: assignedToId ? { connect: { id: assignedToId } } : { connect: { id: userId } },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    logger.info({ leadId: lead.id }, 'Lead created manually');
    return lead;
  },

  /**
   * List leads with pagination, filtering, and sorting.
   */
  async list(query: {
    page: number;
    limit: number;
    status?: string;
    searchJobId?: string;
    minScore?: number;
    maxScore?: number;
    assignedTo?: string;
    search?: string;
    sortBy: string;
    sortOrder: string;
  }) {
    const where: Prisma.LeadWhereInput = {};

    // Apply filters
    if (query.status) where.status = query.status as never;
    if (query.searchJobId) where.searchJobId = query.searchJobId;
    if (query.assignedTo) where.assignedToId = query.assignedTo;
    if (query.minScore !== undefined || query.maxScore !== undefined) {
      where.aiScore = {};
      if (query.minScore !== undefined) where.aiScore.gte = query.minScore;
      if (query.maxScore !== undefined) where.aiScore.lte = query.maxScore;
    }
    if (query.search) {
      where.OR = [
        { companyName: { contains: query.search, mode: 'insensitive' } },
        { contactName: { contains: query.search, mode: 'insensitive' } },
        { contactEmail: { contains: query.search, mode: 'insensitive' } },
        { industry: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        ...paginate(query.page, query.limit),
        orderBy: { [query.sortBy]: query.sortOrder },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return {
      leads,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  /**
   * Get a single lead by ID with full enrichment data.
   */
  async getById(id: string) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true } },
        pitches: { orderBy: { createdAt: 'desc' }, take: 5 },
        discoveryCalls: { orderBy: { createdAt: 'desc' }, take: 5 },
        proposals: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!lead) throw new NotFoundError('Lead');
    return lead;
  },

  /**
   * Update lead fields.
   */
  async update(id: string, data: Record<string, unknown>) {
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Lead');

    // Map schema field names to Prisma model fields
    const { notes, ...rest } = data;
    const prismaData: Record<string, unknown> = { ...rest };
    if (notes !== undefined) prismaData.reviewNotes = notes;

    return prisma.lead.update({ where: { id }, data: prismaData as Prisma.LeadUpdateInput });
  },

  /**
   * Soft-delete a lead by setting status to LOST.
   */
  async remove(id: string) {
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Lead');

    // Soft delete — archive rather than hard delete
    return prisma.lead.update({
      where: { id },
      data: { status: 'LOST' },
    });
  },

  /**
   * Trigger an autonomous AI lead search job.
   * Returns the job ID for polling status.
   */
  async triggerSearch(userId: string, filters: Record<string, unknown>) {
    // Build a human-readable search brief from the filters
    const briefParts: string[] = [];
    if (filters['naturalQuery']) briefParts.push(String(filters['naturalQuery']));
    else {
      if (filters['industry']) briefParts.push(String(filters['industry']));
      if (filters['location']) briefParts.push(`in ${filters['location']}`);
      if (filters['companySize']) briefParts.push(`${filters['companySize']} employees`);
      if (Array.isArray(filters['keywords']) && filters['keywords'].length)
        briefParts.push(`keywords: ${(filters['keywords'] as string[]).join(', ')}`);
    }
    const searchBrief = briefParts.length > 0
      ? briefParts.join(' · ')
      : `AI Search — ${new Date().toLocaleDateString()}`;

    const job = await prisma.leadSearchJob.create({
      data: {
        triggeredById: userId,
        filters: filters as Prisma.JsonObject,
        searchBrief,
        status: 'QUEUED',
      },
    });

    // Enqueue the search job for async processing
    await leadSearchQueue.add('lead-search', {
      jobId: job.id,
      filters,
      userId,
    });

    logger.info({ jobId: job.id, userId, searchBrief }, 'Lead search job queued');

    return { jobId: job.id, status: 'QUEUED' };
  },

  /**
   * Get the status of a lead search job.
   */
  async getSearchStatus(jobId: string) {
    const job = await prisma.leadSearchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Search job');
    return job;
  },

  /**
   * Trigger re-enrichment of a specific lead.
   * Queues the enrichment for async processing.
   */
  async enrich(id: string) {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundError('Lead');

    // Queue enrichment job
    await leadSearchQueue.add('lead-enrich', { leadId: id });
    logger.info({ leadId: id }, 'Lead enrichment queued');

    return { message: 'Enrichment queued', leadId: id };
  },

  /**
   * Queue AI scoring for a batch of leads.
   */
  async scoreBatch(leadIds?: string[]) {
    // If no IDs provided, score all unscored leads
    const where: Prisma.LeadWhereInput = leadIds
      ? { id: { in: leadIds } }
      : { aiScore: null, status: { in: ['DISCOVERED', 'PENDING_REVIEW'] } };

    const leads = await prisma.lead.findMany({
      where,
      select: { id: true },
    });

    if (leads.length === 0) {
      throw new BadRequestError('No leads found to score');
    }

    // Queue scoring jobs
    const jobs = leads.map((lead) => ({
      name: 'score-lead',
      data: { leadId: lead.id },
    }));
    await aiScoringQueue.addBulk(jobs);

    logger.info({ count: leads.length }, 'Batch scoring queued');

    return { message: `Scoring queued for ${leads.length} leads`, count: leads.length };
  },

  /**
   * Get AI score breakdown for a single lead.
   */
  async getScore(id: string) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: {
        id: true,
        companyName: true,
        aiScore: true,
        scoreBreakdown: true,
        humanScoreOverride: true,
      },
    });

    if (!lead) throw new NotFoundError('Lead');
    return lead;
  },

  /**
   * Human override of AI score with reason.
   */
  async overrideScore(id: string, userId: string, score: number, reason: string) {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundError('Lead');

    return prisma.lead.update({
      where: { id },
      data: {
        humanScoreOverride: score,
        scoreBreakdown: {
          ...(lead.scoreBreakdown as Record<string, unknown> ?? {}),
          humanOverride: { score, reason, overriddenBy: userId, at: new Date().toISOString() },
        },
      },
    });
  },

  /**
   * Get all leads pending human review.
   */
  async getReviewQueue() {
    return prisma.lead.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: [{ aiScore: 'desc' }, { createdAt: 'asc' }],
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Review a single lead — approve, reject, or hold.
   */
  async reviewLead(id: string, userId: string, decision: string, notes?: string) {
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundError('Lead');

    return prisma.lead.update({
      where: { id },
      data: {
        status: decision as never,
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });
  },

  /**
   * Run an AI lead search inline, emitting SSE-style progress events.
   *
   * Uses the multi-source leadDiscoveryService which tries:
   *   1. LLM query expansion (always runs via Ollama)
   *   2. Web search via Tavily / SerpAPI / DuckDuckGo (when keys are configured)
   *   3. Apollo.io database (when APOLLO_API_KEY is configured)
   *   4. Fallback: pure LLM-generated candidate list when no external sources available
   *
   * After discovery, all new leads are automatically queued for AI scoring.
   */
  async runSearchWithProgress(
    jobId: string,
    emit: (data: { step: string; progress: number; message: string; resultCount?: number }) => void,
  ) {
    const job = await prisma.leadSearchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundError('Search job');

    // Already finished — just replay the final event
    if (job.status === 'COMPLETED') {
      emit({ step: 'complete', progress: 100, message: `Found ${job.leadsFound ?? 0} lead${job.leadsFound !== 1 ? 's' : ''}.`, resultCount: job.leadsFound ?? 0 });
      return;
    }
    if (job.status === 'FAILED') {
      emit({ step: 'error', progress: 0, message: job.errorMessage ?? 'Search failed' });
      return;
    }

    const rawFilters = job.filters as Record<string, unknown>;
    const preferences = (rawFilters['preferences'] as { factor: string; label: string; weight: number }[] | undefined) ?? [];
    const filters: SearchFilters = {
      industry: rawFilters['industry'] as string | undefined,
      location: rawFilters['location'] as string | undefined,
      companySize: rawFilters['companySize'] as string | undefined,
      keywords: rawFilters['keywords'] as string[] | undefined,
      naturalQuery: rawFilters['naturalQuery'] as string | undefined,
      maxResults: (rawFilters['maxResults'] as number | undefined) ?? 20,
      preferences,
    };

    await prisma.leadSearchJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    try {
      emit({ step: 'init', progress: 3, message: 'Starting AI-powered lead discovery…' });

      // Run the multi-source AI discovery pipeline
      const discovered = await leadDiscoveryService.discover(filters, (progress) => {
        emit(progress);
      });

      emit({
        step: 'saving',
        progress: 88,
        message: `Saving ${discovered.length} lead${discovered.length !== 1 ? 's' : ''} to database…`,
      });

      // Persist all discovered leads with source provenance + search job link
      const createdLeads: { id: string; data: typeof discovered[0] }[] = [];
      for (const candidate of discovered) {
        try {
          const lead = await prisma.lead.create({
            data: {
              companyName: candidate.companyName,
              contactName: candidate.contactName ?? undefined,
              contactEmail: candidate.contactEmail ?? undefined,
              contactLinkedin: candidate.contactLinkedin ?? undefined,
              website: candidate.website ?? undefined,
              industry: candidate.industry ?? filters.industry ?? undefined,
              location: candidate.location ?? filters.location ?? undefined,
              source: 'AI_SEARCH',
              discoverySource: candidate.discoverySource,
              discoveryReason: candidate.discoveryReason ?? undefined,
              searchJobId: jobId,
              status: 'DISCOVERED',
              assignedToId: job.triggeredById,
            },
            select: { id: true },
          });
          createdLeads.push({ id: lead.id, data: candidate });
        } catch (saveErr) {
          logger.error({ saveErr, company: candidate.companyName }, 'Failed to save discovered lead');
        }
      }

      // ── Inline preference-based scoring ──────────────────
      if (createdLeads.length > 0) {
        emit({
          step: 'scoring',
          progress: 92,
          message: `Scoring ${createdLeads.length} lead${createdLeads.length !== 1 ? 's' : ''} against your preferences…`,
        });

        const defaultPrefs = [
          { factor: 'industry_match', label: 'Industry Match', weight: 30 },
          { factor: 'location_match', label: 'Location Match', weight: 25 },
          { factor: 'company_size_fit', label: 'Company Size Fit', weight: 20 },
          { factor: 'contact_info', label: 'Has Contact Info', weight: 15 },
          { factor: 'source_quality', label: 'Source Quality', weight: 10 },
        ];
        const activePrefs = preferences.length > 0 ? preferences : defaultPrefs;
        const totalWeight = activePrefs.reduce((s, p) => s + p.weight, 0) || 1;

        for (const { id: leadId, data: candidate } of createdLeads) {
          try {
            const breakdown: Record<string, number> = {};
            let rawScore = 0;

            for (const pref of activePrefs) {
              let factorScore = 0; // 0-100 per factor

              switch (pref.factor) {
                case 'industry_match':
                  if (filters.industry && candidate.industry) {
                    const match = candidate.industry.toLowerCase().includes(filters.industry.toLowerCase())
                      || filters.industry.toLowerCase().includes(candidate.industry.toLowerCase());
                    factorScore = match ? 100 : 30;
                  } else {
                    factorScore = 50;
                  }
                  break;

                case 'location_match':
                  if (filters.location && candidate.location) {
                    const match = candidate.location.toLowerCase().includes(filters.location.toLowerCase())
                      || filters.location.toLowerCase().includes(candidate.location.toLowerCase());
                    factorScore = match ? 100 : 20;
                  } else {
                    factorScore = 50;
                  }
                  break;

                case 'company_size_fit':
                  if (filters.companySize && candidate.employeeCount) {
                    const parts = filters.companySize.replace(/[^0-9-]/g, '').split('-').map(Number);
                    const [low, high] = parts.length >= 2 ? [parts[0], parts[1]] : [0, parts[0] || 1000];
                    factorScore = (candidate.employeeCount >= (low || 0) && candidate.employeeCount <= (high || 100000)) ? 100 : 25;
                  } else {
                    factorScore = 50;
                  }
                  break;

                case 'contact_info': {
                  let contactScore = 0;
                  if (candidate.contactName) contactScore += 25;
                  if (candidate.contactEmail) contactScore += 35;
                  if (candidate.contactLinkedin) contactScore += 25;
                  if (candidate.website) contactScore += 15;
                  factorScore = contactScore;
                  break;
                }

                case 'source_quality':
                  factorScore = candidate.discoverySource === 'apollo' ? 100 : 90; // web_search
                  break;

                default:
                  // Custom user-defined factor — use LLM or default 50
                  factorScore = 50;
                  break;
              }

              breakdown[pref.factor] = Math.round(factorScore);
              rawScore += (factorScore * pref.weight) / totalWeight;
            }

            const finalScore = Math.round(Math.min(100, Math.max(0, rawScore)));

            await prisma.lead.update({
              where: { id: leadId },
              data: {
                aiScore: finalScore,
                scoreBreakdown: { ...breakdown, _total: finalScore, _preferences: activePrefs } as never,
                status: finalScore >= 60 ? 'APPROVED' : 'PENDING_REVIEW',
              },
            });
          } catch (scoreErr) {
            logger.warn({ scoreErr, leadId }, 'Inline scoring failed for lead');
          }
        }
      }

      await prisma.leadSearchJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', completedAt: new Date(), leadsFound: createdLeads.length },
      });

      logger.info({ jobId, leadsFound: createdLeads.length }, 'Lead search stream completed');

      emit({
        step: 'complete',
        progress: 100,
        message: `Done! Found ${createdLeads.length} lead${createdLeads.length !== 1 ? 's' : ''}.`,
        resultCount: createdLeads.length,
      });
    } catch (error) {
      logger.error({ error, jobId }, 'Lead search stream failed');
      await prisma.leadSearchJob
        .update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: String(error) } })
        .catch(() => {});
      throw error;
    }
  },

  /**
   * List recent search jobs with lead counts.
   */
  async listSearchJobs(limit = 20) {
    const jobs = await prisma.leadSearchJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        triggeredBy: { select: { id: true, name: true } },
        _count: { select: { leads: true } },
      },
    });

    return jobs.map((j) => ({
      id: j.id,
      searchBrief: j.searchBrief,
      status: j.status,
      leadsFound: j.leadsFound ?? j._count.leads,
      filters: j.filters,
      triggeredBy: j.triggeredBy,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
    }));
  },

  /**
   * Bulk approve or reject multiple leads.
   */
  async bulkReview(userId: string, leadIds: string[], decision: string, notes?: string) {
    const result = await prisma.lead.updateMany({
      where: { id: { in: leadIds } },
      data: {
        status: decision as never,
        reviewedById: userId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    logger.info(
      { count: result.count, decision, userId },
      'Bulk lead review completed',
    );

    return { updated: result.count };
  },
};
