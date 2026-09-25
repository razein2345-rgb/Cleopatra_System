import type { CallDirection, CallOutcome } from '@cleopatra/shared';
import type { StatusTone } from '@/components/cleopatra';

/** Shared by the Call Center screen and the customer's calls tab so the two never drift apart. */
export const DIRECTION_LABELS: Record<CallDirection, string> = { INBOUND: 'وارد', OUTBOUND: 'صادر' };
export const OUTCOME_LABELS: Record<CallOutcome, string> = { RESOLVED: 'تم الحل', NEEDS_FOLLOWUP: 'محتاج متابعة' };
export const OUTCOME_TONES: Record<CallOutcome, StatusTone> = { RESOLVED: 'success', NEEDS_FOLLOWUP: 'warning' };
