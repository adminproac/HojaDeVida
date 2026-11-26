import { handleDataRequest } from './api.js';
import { handleOauthRequest } from './exchange.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/oauth/exchange') return handleOauthRequest(request, env);
    if (url.pathname.startsWith('/api/')) return handleDataRequest(request, env);
    return new Response('Not found', { status: 404 });
  },
};
