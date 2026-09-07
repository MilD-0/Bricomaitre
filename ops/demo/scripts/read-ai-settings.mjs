import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// This file is dotenv data, including operator display names and credentials.
// Never evaluate it as shell code while restoring the database settings.
const values = parseEnv(readFileSync(process.argv[2], 'utf8'));
const settings = [
  String(values.AI_ENABLED === 'true' || values.AI_ENABLED === '1'),
  values.AI_STOREFRONT_MODEL ?? 'openai/gpt-5.6-luna',
  values.AI_STOREFRONT_FALLBACK_MODEL ?? '',
];
if (settings.some((value) => /[\r\n\0]/u.test(value))) {
  throw new Error('Demo AI settings must be single-line values');
}
process.stdout.write(`${settings.join('\n')}\n`);
