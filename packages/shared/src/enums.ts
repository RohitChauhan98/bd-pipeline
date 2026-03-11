/**
 * Shared Enums
 *
 * These mirror the Prisma enums and are used across the entire stack
 * for consistent type-safe references without importing from @prisma/client.
 */

export const UserRole = {
  ADMIN: 'ADMIN',
  BD_MANAGER: 'BD_MANAGER',
  ONBOARDING_MANAGER: 'ONBOARDING_MANAGER',
  PARTNER: 'PARTNER',
} as const;

export const LeadSource = {
  AI_SEARCH: 'AI_SEARCH',
  MANUAL: 'MANUAL',
  REFERRAL: 'REFERRAL',
  INBOUND: 'INBOUND',
} as const;

export const LeadStatus = {
  DISCOVERED: 'DISCOVERED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  ON_HOLD: 'ON_HOLD',
  CONTACTED: 'CONTACTED',
  RESPONDED: 'RESPONDED',
  IN_DISCOVERY: 'IN_DISCOVERY',
  PROPOSAL_SENT: 'PROPOSAL_SENT',
  DEAL_CLOSED: 'DEAL_CLOSED',
  LOST: 'LOST',
} as const;

export const OutreachChannel = {
  EMAIL: 'EMAIL',
  LINKEDIN: 'LINKEDIN',
  WHATSAPP: 'WHATSAPP',
} as const;

export const PitchStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  REJECTED: 'REJECTED',
} as const;

export const ProposalStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
} as const;

export const ClientStatus = {
  ONBOARDING: 'ONBOARDING',
  ACTIVE: 'ACTIVE',
  AT_RISK: 'AT_RISK',
  CHURNED: 'CHURNED',
} as const;

export const OnboardingStage = {
  DEAL_CLOSED: 'DEAL_CLOSED',
  KICKOFF: 'KICKOFF',
  REQUIREMENTS_GATHERING: 'REQUIREMENTS_GATHERING',
  DOCUMENTATION: 'DOCUMENTATION',
  TECHNICAL_SETUP: 'TECHNICAL_SETUP',
  TESTING_UAT: 'TESTING_UAT',
  GO_LIVE: 'GO_LIVE',
  TRAINING: 'TRAINING',
  COMPLETED: 'COMPLETED',
} as const;

export const HealthStatus = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  OVERDUE: 'OVERDUE',
  STALLED: 'STALLED',
} as const;

export const MeetingType = {
  DISCOVERY: 'DISCOVERY',
  KICKOFF: 'KICKOFF',
  REQUIREMENTS: 'REQUIREMENTS',
  REVIEW: 'REVIEW',
  TRAINING: 'TRAINING',
  OTHER: 'OTHER',
} as const;

export const NotificationType = {
  SLA_ALERT: 'SLA_ALERT',
  APPROVAL_REQUEST: 'APPROVAL_REQUEST',
  STAGE_CHANGE: 'STAGE_CHANGE',
  NEW_LEAD: 'NEW_LEAD',
  UPSELL_SIGNAL: 'UPSELL_SIGNAL',
  MEETING_REMINDER: 'MEETING_REMINDER',
  EMAIL_APPROVAL: 'EMAIL_APPROVAL',
} as const;

export const DocumentCategory = {
  CONTRACT: 'CONTRACT',
  KYC: 'KYC',
  TECHNICAL_SPEC: 'TECHNICAL_SPEC',
  NDA: 'NDA',
  OTHER: 'OTHER',
} as const;

export const ScanStatus = {
  NOT_SCANNED: 'NOT_SCANNED',
  SCANNING: 'SCANNING',
  OK: 'OK',
  ISSUES_FOUND: 'ISSUES_FOUND',
} as const;

export const MeetingStatus = {
  UPCOMING: 'UPCOMING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  RESCHEDULED: 'RESCHEDULED',
} as const;

export const AiEmailType = {
  FOLLOWUP: 'FOLLOWUP',
  ONBOARDING_UPDATE: 'ONBOARDING_UPDATE',
  PROPOSAL: 'PROPOSAL',
  PITCH: 'PITCH',
  CUSTOM: 'CUSTOM',
} as const;

export const AiEmailStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  REJECTED: 'REJECTED',
} as const;

/** Ordered list of onboarding stages for pipeline progression */
export const ONBOARDING_STAGE_ORDER: readonly string[] = [
  OnboardingStage.DEAL_CLOSED,
  OnboardingStage.KICKOFF,
  OnboardingStage.REQUIREMENTS_GATHERING,
  OnboardingStage.DOCUMENTATION,
  OnboardingStage.TECHNICAL_SETUP,
  OnboardingStage.TESTING_UAT,
  OnboardingStage.GO_LIVE,
  OnboardingStage.TRAINING,
  OnboardingStage.COMPLETED,
] as const;
