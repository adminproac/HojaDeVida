/**
 * Crea el primer administrador en D1.
 * Desde la carpeta worker:
 *   node scripts/create-user.mjs edgar
 * La contraseña se escribe y se ve en pantalla (PowerShell no muestra un prompt oculto).
 * También puede pasarla como argumento: node scripts/create-user.mjs edgar "su clave"
 * Agregue --local para la base de prueba de esta computadora.
 */
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hashPassword } from '../src/password.js';

const username = String(process.argv[2] || '').trim();
const local = process.argv.includes('--local');
const passwordArg = process.argv.slice(3).find((arg) => !arg.startsWith('--')) || '';

if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
  console.error('Uso: node scripts/create-user.mjs edgar');
  process.exit(1);
}

const password = passwordArg || await ask('Escriba la contraseña (se verá en pantalla): ');
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

const hashed = await hashPassword(password);
const id = `user-${crypto.randomUUID().slice(0, 8)}`;
const created = new Date().toISOString();
const sql = `INSERT INTO app_user (id, username, password_hash, salt, display_name, role, active, created_at, last_login_at, failed_attempts, locked_until) VALUES ('${id}', '${username.replaceAll("'", "''")}', '${hashed.passwordHash}', '${hashed.salt}', '${username.replaceAll("'", "''")}', 'admin', 1, '${created}', NULL, 0, NULL);`;

if (sql.includes(password)) {
  console.error('La contraseña quedó dentro del SQL. No se ejecuta.');
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), 'hojadevida-user-'));
const file = path.join(dir, 'user.sql');
writeFileSync(file, `${sql}\n`);
const wranglerArgs = ['d1', 'execute', 'hojadevida', local ? '--local' : '--remote', '--file', file];
const wrangler = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
const code = await run(wrangler, wranglerArgs);
const finalCode = code === -1 ? await run('npx', ['--yes', 'wrangler@4', ...wranglerArgs]) : code;
rmSync(dir, { recursive: true, force: true });
if (finalCode === 0) {
  console.log(`Usuario administrador ${username} creado. La contraseña no quedó guardada en texto plano.`);
  process.exit(0);
}
console.error('wrangler no pudo crear el usuario. Vuelva a ejecutar: node scripts/create-user.mjs ' + username);
process.exit(finalCode || 1);

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', () => resolve(-1));
    child.on('exit', (status) => resolve(status ?? 1));
  });
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}
