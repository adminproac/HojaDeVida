/**
 * Producción. El flujo de GitHub Pages reescribe este archivo con las variables
 * OAUTH_CLIENT_ID y OAUTH_PROXY_URL. No ponga aquí el Client Secret.
 * El proxy de ejemplo NO funciona hasta que Edgar pegue la URL real de su Worker.
 */
export const environment = {
  production: true,
  oauthClientId: '',
  oauthProxyUrl: 'https://hojadevida-oauth.<subdominio>.workers.dev',
  oauthScope: 'public_repo',
  repoOwner: 'adminproac',
  repoName: 'HojaDeVida',
  allowedLogins: [] as string[],
};
