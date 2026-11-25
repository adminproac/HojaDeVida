import { HttpInterceptorFn } from '@angular/common/http';

/** Local API session id. Kept in memory; the GitHub token is not sent here. */
let apiSessionToken: string | null = null;

export function setApiSessionToken(token: string | null) {
  apiSessionToken = token;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!apiSessionToken || !req.url.startsWith('/api')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${apiSessionToken}` } }));
};
