export const ALLOWED_ORIGINS = new Set([
  'https://adminproac.github.io',
  'http://localhost:4200',
  'http://localhost:8787',
]);

export function corsFor(origin) {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
