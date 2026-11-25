import { HttpInterceptorFn } from '@angular/common/http';

/** GitHub OAuth token for this tab. Memory only; sent to the local API, never stored. */
let apiSessionToken: string | null = null;

export function setApiSessionToken(token: string | null) {
  apiSessionToken = token;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!apiSessionToken || !req.url.startsWith('/api')) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${apiSessionToken}` } }));
};
