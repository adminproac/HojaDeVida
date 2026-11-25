import { handleOauthRequest } from './exchange.js';

export default {
  async fetch(request, env) {
    return handleOauthRequest(request, env);
  },
};
