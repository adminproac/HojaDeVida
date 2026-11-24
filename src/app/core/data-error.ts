import { ApiFieldError } from './models';

/** Error shaped like Angular's HttpErrorResponse so the forms can read `.error.message` and `.status`. */
export class DataError extends Error {
  readonly status: number;
  readonly error: { message: string; errors?: ApiFieldError[] };

  constructor(status: number, message: string, errors?: ApiFieldError[]) {
    super(message);
    this.name = 'DataError';
    this.status = status;
    this.error = errors ? { message, errors } : { message };
  }
}

export class ValidationError extends DataError {
  constructor(errors: ApiFieldError[]) {
    super(400, 'Validation failed', errors);
    this.name = 'ValidationError';
  }
}

/** "409 — message — details", without repeating the status when it is already in the message. */
export function githubMessage(status: number, body: { message?: unknown; errors?: unknown } | null | undefined): string {
  const raw = body && typeof body.message === 'string' ? body.message.trim() : '';
  const message = raw || 'GitHub request failed';
  const extra = Array.isArray(body?.errors)
    ? body.errors
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && 'message' in entry && typeof entry.message === 'string') return entry.message;
          return '';
        })
        .filter((entry) => entry && !message.includes(entry))
        .join('; ')
    : '';
  return extra ? `${status} — ${message} — ${extra}` : `${status} — ${message}`;
}

export function apiFieldErrors(e: unknown): ApiFieldError[] | undefined {
  const errors = (e as { error?: { errors?: ApiFieldError[] } })?.error?.errors;
  if (!Array.isArray(errors) || errors.some((item) => !item || typeof item.path !== 'string')) return undefined;
  return errors;
}

export function errorText(e: unknown): string {
  const err = e as { status?: number; message?: string; error?: { message?: string; errors?: { message?: string }[] } };
  const message = err?.error?.message || err?.message || 'Error';
  const status = typeof err?.status === 'number' && err.status > 0 ? err.status : 0;
  const extra = (err?.error?.errors ?? [])
    .map((item) => item?.message)
    .filter((item): item is string => !!item && !message.includes(item))
    .join(' — ');
  const head = status && !message.startsWith(String(status)) ? `${status} — ${message}` : message;
  return extra ? `${head} — ${extra}` : head;
}
