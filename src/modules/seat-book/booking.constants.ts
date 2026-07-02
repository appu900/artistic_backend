/** Hold duration while user completes payment (7 minutes). */
export const BOOKING_HOLD_TTL_SECONDS = 420;
export const BOOKING_HOLD_MS = BOOKING_HOLD_TTL_SECONDS * 1000;

/** Idempotency key cache TTL (24 hours). */
export const BOOKING_IDEMPOTENCY_TTL_SECONDS = 86400;
