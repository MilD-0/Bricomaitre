import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const limit = 500;
const extensions = new Set(['.ts', '.tsx', '.mjs', '.sh', '.css']);
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  {
    encoding: 'utf8',
  },
).split('\0');
const violations = [];
for (const file of new Set(files)) {
  if (!extensions.has(extname(file))) continue;
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue; // Tracked deletion in the worktree.
    throw error;
  }
  const lines = source.length === 0 ? 0 : source.split('\n').length - Number(source.endsWith('\n'));
  if (lines > limit) violations.push(`${file}: ${lines} lines (maximum ${limit})`);
}
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Authored source and test files satisfy the ${limit}-line limit.`);
}
