/**
 * Event Bus Service — Redis Pub/Sub
 *
 * Provides a lightweight event system for the agent layer.
 * Events are published to Redis pub/sub for cross-service communication
 * and also stored in a Redis list for short-term persistence (24h TTL).
 *
 * Used by all agents to emit and react to system events.
 */

import Redis from 'ioredis';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

// ── Event Type Constants ─────────────────────

export const EVENTS = {
  // Lead events (Phase 1)
  LEAD_DISCOVERED: 'lead:discovered',
  LEAD_ENRICHED: 'lead:enriched',
  LEAD_SCORED: 'lead:scored',
  LEAD_QUALIFIED: 'lead:qualified',
  LEAD_REJECTED: 'lead:rejected',
  LEAD_ASSIGNED: 'lead:assigned',

  // Outreach events (Phase 1)
  PITCH_GENERATED: 'outreach:pitch-generated',
  PITCH_APPROVED: 'outreach:pitch-approved',
  PITCH_SENT: 'outreach:pitch-sent',
  FOLLOWUP_SENT: 'outreach:followup-sent',

  // Deal events (Phase 1)
  DEAL_CLOSED: 'deal:closed',
  DEAL_WON: 'deal:won',
  DEAL_LOST: 'deal:lost',

  // Onboarding events (Phase 2)
  STAGE_CHANGED: 'onboarding:stage-changed',
  STAGE_ADVANCED: 'onboarding:stage-advanced',
  CHECKLIST_COMPLETED: 'onboarding:checklist-completed',
  DOCUMENT_UPLOADED: 'onboarding:document-uploaded',
  DOCUMENT_SCANNED: 'onboarding:document-scanned',
  SLA_BREACH: 'onboarding:sla-breach',
  ONBOARDING_COMPLETED: 'onboarding:completed',
  MEETING_COMPLETED: 'meeting:completed',

  // Success events (Phase 3)
  NPS_SUBMITTED: 'success:nps-submitted',
  NPS_DETRACTOR: 'success:nps-detractor',
  CHURN_DETECTED: 'success:churn-detected',
  UPSELL_DETECTED: 'success:upsell-detected',
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

// ── Types ────────────────────────────────────

export interface EventData {
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  source?: string;
}

type EventHandler = (data: EventData) => Promise<void>;

// ── Event Bus Implementation ─────────────────

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private subscriber: Redis | null = null;
  private initialized = false;

  /**
   * Initialize the event bus — sets up Redis pub/sub subscription.
   * Call once during application startup.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.subscriber = redis.duplicate();

      await this.subscriber.psubscribe('agent:*');
      this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
        try {
          const eventType = channel.replace('agent:', '');
          const payload = JSON.parse(message);
          const eventData: EventData = {
            type: eventType,
            payload,
            timestamp: new Date(),
            source: 'redis-pubsub',
          };
          this.emit(eventType, eventData);
        } catch (err) {
          logger.error({ err, channel }, 'Failed to process pub/sub message');
        }
      });

      this.initialized = true;
      logger.info('Event bus initialized — listening for agent events');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize event bus');
    }
  }

  /**
   * Publish an event — stores in Redis list + publishes via pub/sub + emits locally.
   */
  async publish(event: string, data: Record<string, unknown>, source?: string): Promise<void> {
    const eventData: EventData = {
      type: event,
      payload: data,
      timestamp: new Date(),
      source: source ?? 'local',
    };

    try {
      // Store in Redis list for short-term persistence
      await redis.lpush(`events:${event}`, JSON.stringify(eventData));
      await redis.expire(`events:${event}`, 86400); // 24h TTL

      // Publish via Redis pub/sub for cross-service delivery
      await redis.publish(`agent:${event}`, JSON.stringify(data));

      // Emit locally for same-process handlers
      await this.emit(event, eventData);

      logger.debug({ event, source }, 'Event published');
    } catch (err) {
      logger.error({ err, event }, 'Failed to publish event');
    }
  }

  /**
   * Subscribe a handler to a specific event type.
   * Use '*' to subscribe to all events.
   */
  subscribe(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
    logger.debug({ event }, 'Event handler subscribed');
  }

  /**
   * Unsubscribe a handler from an event type.
   */
  unsubscribe(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  /**
   * Get recent events of a specific type (from Redis list).
   */
  async getRecentEvents(event: string, limit = 50): Promise<EventData[]> {
    const raw = await redis.lrange(`events:${event}`, 0, limit - 1);
    return raw.map((r: string) => JSON.parse(r) as EventData);
  }

  /**
   * Get recent events across all event types.
   */
  async getAllRecentEvents(limit = 50): Promise<EventData[]> {
    const allEvents: EventData[] = [];

    // Fetch from all known event types
    for (const event of Object.values(EVENTS)) {
      const raw = await redis.lrange(`events:${event}`, 0, 9);
      for (const r of raw) {
        allEvents.push(JSON.parse(r) as EventData);
      }
    }

    // Sort by timestamp descending and limit
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return allEvents.slice(0, limit);
  }

  /**
   * Cleanup — close subscriber connection.
   */
  async shutdown(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.punsubscribe('agent:*');
      await this.subscriber.disconnect();
      this.subscriber = null;
    }
    this.handlers.clear();
    this.initialized = false;
    logger.info('Event bus shut down');
  }

  // ── Internal ─────────────────────────────

  private async emit(event: string, data: EventData): Promise<void> {
    const handlers = this.handlers.get(event) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];

    const allHandlers = [...handlers, ...wildcardHandlers];
    if (allHandlers.length === 0) return;

    await Promise.allSettled(
      allHandlers.map((h) =>
        h(data).catch((err) => {
          logger.error({ err, event }, 'Event handler failed');
        }),
      ),
    );
  }
}

export const eventBus = new EventBus();
