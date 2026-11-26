import { HttpInterceptorFn } from '@angular/common/http';

/** Opaque session token for this tab. Also kept in sessionStorage by SessionService. */
let apiSessionToken: string | null = null;

export function setApiSessionToken(token: string | null) {
  apiSessionToken = token;
}

export function getApiSessionToken() {
  return apiSessionToken;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!apiSessionToken || !req.url.startsWith('/api')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${apiSessionToken}` } }));
};
