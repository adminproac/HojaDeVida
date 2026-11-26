/**
 * Crea el administrador en D1.
 * Desde la carpeta worker, en PowerShell:
 *   node scripts/create-user.mjs edgar
 *   node scripts/create-user.mjs edgar "su contraseña"
 * La contraseña se ve en pantalla. No se guarda en Git.
 * --local usa la base de esta computadora, no Cloudflare.
 */
import { spawn } from 'node:child_process';
import { pbkdf2, randomBytes } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { wranglerLaunch } from '../src/wrangler-launch.js';

const ITERATIONS = 100_000;
const SQL_FILE = path.resolve('create-admin.sql');
const pbkdf2Async = promisify(pbkdf2);

try {
  const username = String(process.argv[2] || '').trim();
  const local = process.argv.includes('--local');
  const passwordArg = process.argv.slice(3).find((arg) => !arg.startsWith('--')) || '';

  if (!/^[A-Za-z0-9._-]{3,80}$/.test(username)) {
    console.error('Uso: node scripts/create-user.mjs edgar');
    console.error('  o: node scripts/create-user.mjs edgar "su contraseña"');
    process.exit(1);
  }

  const password = passwordArg || await askVisible('Escriba la contraseña (se verá en pantalla): ');
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    console.error('Ejemplo: node scripts/create-user.mjs edgar "su contraseña"');
    process.exit(1);
  }

  const salt = randomBytes(16);
  const hash = await pbkdf2Async(password, salt, ITERATIONS, 32, 'sha256');
  const id = `user-${crypto.randomUUID().slice(0, 8)}`;
  const created = new Date().toISOString();
  const sql = `INSERT INTO app_user (id, username, password_hash, salt, display_name, role, active, created_at, last_login_at, failed_attempts, locked_until) VALUES ('${id}', '${sqlText(username)}', '${hash.toString('base64')}', '${salt.toString('base64')}', '${sqlText(username)}', 'admin', 1, '${created}', NULL, 0, NULL);\n`;
  if (sql.includes(password)) {
    console.error('La contraseña quedó dentro del SQL. No se ejecuta.');
    process.exit(1);
  }

  writeFileSync(SQL_FILE, sql);
  const flag = local ? '--local' : '--remote';
  const code = await runWrangler(flag, SQL_FILE);
  if (code === 0) {
    rmSync(SQL_FILE, { force: true });
    console.log(`Usuario administrador ${username} creado. La contraseña no quedó en texto plano.`);
    process.exit(0);
  }
  printFallback(flag);
  process.exit(code || 1);
} catch (err) {
  console.error('No se pudo crear el usuario.');
  console.error(err instanceof Error ? err.message : err);
  printFallback(process.argv.includes('--local') ? '--local' : '--remote');
  process.exit(1);
}

function sqlText(value) {
  return String(value).replaceAll("'", "''");
}

function printFallback(flag) {
  console.error('');
  console.error('Si wrangler no terminó, en esta misma carpeta (worker) ejecute:');
  console.error(`wrangler d1 execute hojadevida ${flag} --file .\\create-admin.sql`);
  console.error('create-admin.sql solo tiene el hash, no la contraseña. Bórrelo después.');
}

function runWrangler(flag, file) {
  const plan = wranglerLaunch(process.platform, flag, file);
  return new Promise((resolve) => {
    let child;
    try {
      child = plan.args.length
        ? spawn(plan.command, plan.args, { stdio: 'inherit', shell: plan.shell, windowsHide: false })
        : spawn(plan.command, { stdio: 'inherit', shell: true, windowsHide: false });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      resolve(1);
      return;
    }
    child.on('error', (err) => {
      console.error(err instanceof Error ? err.message : err);
      resolve(1);
    });
    child.on('exit', (status) => resolve(status ?? 1));
  });
}

function askVisible(question) {
  if (!process.stdin.isTTY) {
    throw new Error('Esta ventana no acepta preguntas. Use: node scripts/create-user.mjs edgar "su contraseña"');
  }
  return new Promise((resolve, reject) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    let buf = '';
    const onData = (chunk) => {
      buf += chunk;
      const end = buf.search(/\r?\n/);
      if (end < 0) return;
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      resolve(buf.slice(0, end));
    };
    process.stdin.on('data', onData);
    process.stdin.on('error', reject);
  });
}
