/** Pure inactivity rules so the timeout can be tested without a browser timer. */

export const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
export const SESSION_WARN_MS = 30 * 1000;

export type SessionClock = 'active' | 'warning' | 'expired';

export function sessionClock(lastActivity: number, now: number): SessionClock {
  const idle = now - lastActivity;
  if (idle >= SESSION_TIMEOUT_MS) return 'expired';
  if (SESSION_TIMEOUT_MS - idle <= SESSION_WARN_MS) return 'warning';
  return 'active';
}
