/**
 * Desarrollo local. El Client ID público sale de GET /api/oauth/config (.env).
 * El Client Secret no vive en este archivo.
 */
export const environment = {
  production: false,
  oauthClientId: '',
  oauthProxyUrl: '',
  oauthScope: 'public_repo',
  repoOwner: 'adminproac',
  repoName: 'HojaDeVida',
  allowedLogins: [] as string[],
};
