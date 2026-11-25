/**
 * Escribe src/environments/environment.prod.ts antes del build de Pages.
 * Variables del repositorio (Settings → Secrets and variables → Actions → Variables):
 *   OAUTH_CLIENT_ID, OAUTH_PROXY_URL y, opcional, OAUTH_ALLOWED_LOGINS.
 * Si faltan, el sitio se publica igual y muestra el aviso en español.
 */
const fs = require('node:fs');
const path = require('node:path');

const clientId = String(process.env.OAUTH_CLIENT_ID || '').trim();
const proxyUrl = String(process.env.OAUTH_PROXY_URL || '').trim();
const allowed = String(process.env.OAUTH_ALLOWED_LOGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const file = `/**
 * Generado en el build. No edite a mano: use las variables del repositorio.
 */
export const environment = {
  production: true,
  oauthClientId: ${JSON.stringify(clientId)},
  oauthProxyUrl: ${JSON.stringify(proxyUrl || 'https://hojadevida-oauth.<subdominio>.workers.dev')},
  oauthScope: 'public_repo',
  repoOwner: 'adminproac',
  repoName: 'HojaDeVida',
  allowedLogins: ${JSON.stringify(allowed)},
};
`;

const target = path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts');
fs.writeFileSync(target, file);
if (!clientId || !proxyUrl) {
  console.warn('::warning::Falta configurar el inicio de sesión con GitHub. Defina las variables del repositorio OAUTH_CLIENT_ID y OAUTH_PROXY_URL (ver README). El sitio se publicará con el aviso en la pantalla de entrada.');
} else {
  console.log('[oauth] Client ID y URL del Worker listos para el build.');
}
