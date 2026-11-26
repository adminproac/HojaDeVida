/** Windows must launch wrangler through cmd.exe. Spawning wrangler.cmd directly throws EINVAL. */

export function wranglerLaunch(platform, flag, file) {
  const args = ['d1', 'execute', 'hojadevida', flag, '--file', file];
  if (platform === 'win32') {
    const quoted = args.map((arg) => (arg.includes(' ') || arg.includes('"') ? `"${arg.replaceAll('"', '')}"` : arg)).join(' ');
    return { command: `wrangler ${quoted}`, args: [], shell: true };
  }
  return { command: 'wrangler', args, shell: false };
}
