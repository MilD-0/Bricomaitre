import { spawn } from 'node:child_process';

const commands = [
  ['pnpm', ['run', 'dev']],
  ['pnpm', ['run', 'worker']],
] as const;

const children = commands.map(([command, args]) =>
  spawn(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
);

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(exitCode);
}

for (const child of children) {
  child.on('exit', (code) => shutdown(code ?? 1));
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
