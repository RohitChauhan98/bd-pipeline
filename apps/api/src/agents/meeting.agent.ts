/**
 * Meeting Agent — Phase 2
 *
 * Schedules follow-up meetings based on onboarding stage,
 * sends reminders, auto-creates meeting note templates,
 * and tracks meeting completion rate.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { EVENTS } from '../services/event-bus.service.js';
import { prisma } from '../config/db.js';

class MeetingAgent extends BaseAgent {
  constructor() {
    super('meeting');
  }

  async initialize(): Promise<void> {
    // Listen for stage changes to suggest follow-up meetings
    this.subscribeToEvent(EVENTS.STAGE_CHANGED, async (event) => {
      const clientId = event.payload['clientId'] as string;
      const toStage = event.payload['toStage'] as string;
      if (clientId && toStage) {
        await this.suggestStageFollowUp(clientId, toStage);
      }
    });

    // Listen for completed meetings to create note templates
    this.subscribeToEvent(EVENTS.MEETING_COMPLETED, async (event) => {
      const meetingId = event.payload['meetingId'] as string;
      if (meetingId) {
        await this.createNoteTemplate(meetingId);
      }
    });

    this.logger.info('Meeting Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'send-reminders': {
          const result = await this.sendUpcomingReminders();
          return { success: true, data: result };
        }

        case 'suggest-followup': {
          const clientId = task.payload['clientId'] as string;
          const stage = task.payload['stage'] as string;
          const result = await this.suggestStageFollowUp(clientId, stage);
          return { success: true, data: result };
        }

        case 'completion-report': {
          const result = await this.getCompletionReport();
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'Meeting task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(_config: Record<string, unknown>): Promise<AgentResult> {
    const [reminderResults, completionResults] = await Promise.all([
      this.sendUpcomingReminders(),
      this.markPastMeetingsCompleted(),
    ]);

    return {
      success: true,
      data: { reminders: reminderResults, completed: completionResults },
    };
  }

  // ── Private Methods ─────────────────────────

  private async sendUpcomingReminders() {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Get meetings in next 24 hours
    const upcomingMeetings = await prisma.meeting.findMany({
      where: {
        status: 'UPCOMING',
        scheduledAt: { gte: now, lte: twentyFourHoursFromNow },
      },
      include: {
        organizedBy: { select: { id: true, name: true } },
        client: { select: { companyName: true } },
        lead: { select: { companyName: true } },
      },
    });

    let sent = 0;
    for (const meeting of upcomingMeetings) {
      const hoursUntil = (meeting.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      const isUrgent = meeting.scheduledAt <= oneHourFromNow;
      const entity = meeting.client?.companyName ?? meeting.lead?.companyName ?? 'Unknown';

      await prisma.notification.create({
        data: {
          userId: meeting.organizedById,
          type: 'MEETING_REMINDER',
          title: isUrgent
            ? `Meeting in ${Math.round(hoursUntil * 60)} min: ${meeting.title}`
            : `Meeting tomorrow: ${meeting.title}`,
          body: `${meeting.title} with ${entity} at ${meeting.scheduledAt.toISOString()}`,
        },
      });
      sent++;

      await this.logAction(
        'send_reminder',
        'meeting',
        meeting.id,
        'success',
        `Reminder sent — ${Math.round(hoursUntil)}h before meeting`,
      );
    }

    this.logger.info({ sent }, 'Meeting reminders sent');
    return { remindersSent: sent };
  }

  private async suggestStageFollowUp(clientId: string, stage: string) {
    // Map stage to suggested meeting type
    const stageMeetingMap: Record<string, { type: string; title: string }> = {
      KICKOFF: { type: 'KICKOFF', title: 'Client Kickoff Meeting' },
      REQUIREMENTS_GATHERING: { type: 'REQUIREMENTS', title: 'Requirements Discovery Session' },
      TESTING_UAT: { type: 'REVIEW', title: 'UAT Review Meeting' },
      TRAINING: { type: 'TRAINING', title: 'Training Session' },
      GO_LIVE: { type: 'REVIEW', title: 'Go-Live Review' },
    };

    const suggestion = stageMeetingMap[stage];
    if (!suggestion) return { suggested: false };

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { companyName: true, assignedManagerId: true },
    });
    if (!client?.assignedManagerId) return { suggested: false };

    // Check if a meeting is already scheduled for this stage
    const existingMeeting = await prisma.meeting.findFirst({
      where: {
        clientId,
        type: suggestion.type as never,
        status: 'UPCOMING',
      },
    });

    if (existingMeeting) return { suggested: false, reason: 'Meeting already scheduled' };

    // Create a notification suggesting the meeting
    await prisma.notification.create({
      data: {
        userId: client.assignedManagerId,
        type: 'APPROVAL_REQUEST',
        title: `Schedule: ${suggestion.title}`,
        body: `${client.companyName} has moved to ${stage} — consider scheduling a ${suggestion.title}`,
      },
    });

    await this.logAction(
      'suggest_meeting',
      'client',
      clientId,
      'success',
      `Suggested ${suggestion.title} for ${stage} stage`,
    );

    return { suggested: true, meetingType: suggestion.type, title: suggestion.title };
  }

  private async createNoteTemplate(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { client: true },
    });
    if (!meeting) return;

    // Create a template note
    await prisma.meetingNote.create({
      data: {
        meetingId,
        body: `## ${meeting.title} — Notes\n\n### Attendees\n- \n\n### Discussion Points\n- \n\n### Action Items\n- [ ] \n\n### Next Steps\n- `,
        writtenById: meeting.organizedById,
      },
    });

    await this.logAction(
      'create_note_template',
      'meeting',
      meetingId,
      'success',
      'Auto-created meeting notes template',
    );
  }

  private async markPastMeetingsCompleted() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await prisma.meeting.updateMany({
      where: {
        status: 'UPCOMING',
        scheduledAt: { lt: oneHourAgo },
      },
      data: { status: 'COMPLETED' },
    });

    if (result.count > 0) {
      this.logger.info({ count: result.count }, 'Past meetings marked as completed');
    }

    return { completedCount: result.count };
  }

  private async getCompletionReport() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, completed, cancelled] = await Promise.all([
      prisma.meeting.count({ where: { scheduledAt: { gte: thirtyDaysAgo } } }),
      prisma.meeting.count({ where: { scheduledAt: { gte: thirtyDaysAgo }, status: 'COMPLETED' } }),
      prisma.meeting.count({ where: { scheduledAt: { gte: thirtyDaysAgo }, status: 'CANCELLED' } }),
    ]);

    return {
      period: '30 days',
      total,
      completed,
      cancelled,
      upcoming: total - completed - cancelled,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}

export const meetingAgent = new MeetingAgent();
