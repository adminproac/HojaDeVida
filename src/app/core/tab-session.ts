import { sessionClock } from './session-clock';

export const TAB_SESSION_KEY = 'resume-admin.authSession';

export interface TabSession {
  token: string;
  username: string;
  displayName: string;
  role: 'admin' | 'editor';
  lastActivity: number;
}

export function parseTabSession(raw: string | null, now: number): TabSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<TabSession>;
    if (typeof data.token !== 'string' || !data.token) return null;
    if (typeof data.username !== 'string' || !data.username) return null;
    if (typeof data.lastActivity !== 'number') return null;
    if (sessionClock(data.lastActivity, now) === 'expired') return null;
    const role = data.role === 'admin' ? 'admin' : 'editor';
    return {
      token: data.token,
      username: data.username,
      displayName: typeof data.displayName === 'string' && data.displayName ? data.displayName : data.username,
      role,
      lastActivity: data.lastActivity,
    };
  } catch {
    return null;
  }
}
