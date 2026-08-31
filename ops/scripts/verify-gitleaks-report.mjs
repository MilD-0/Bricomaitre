#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: verify-gitleaks-report.mjs <report.json>');
  process.exit(64);
}

const allowedFixturePaths = [
  'apps/admin/app/api/ai/chat/route.integration.test.ts',
  'apps/admin/components/admin-ai-chat.test.tsx',
  'apps/admin/lib/admin-ai-chat-stream.test.ts',
  'apps/admin/lib/admin-ai-runtime.test.ts',
  'apps/admin/tests/browser/admin-ai-assistant.spec.ts',
  'adminstration/app/api/ai/chat/route.integration.test.ts',
  'adminstration/components/admin-ai-chat.test.tsx',
  'adminstration/lib/admin-ai-chat-stream.test.ts',
];
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let findings;
try {
  findings = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Could not read the Gitleaks JSON report: ${String(error)}`);
  process.exit(1);
}

if (!Array.isArray(findings)) {
  console.error('Gitleaks produced an invalid report: expected a JSON array.');
  process.exit(1);
}

function isExactTestFixture(finding) {
  if (
    typeof finding !== 'object' ||
    finding === null ||
    finding.RuleID !== 'generic-api-key' ||
    typeof finding.Secret !== 'string' ||
    !uuidV4.test(finding.Secret) ||
    typeof finding.File !== 'string'
  ) {
    return false;
  }

  const normalizedPath = finding.File.replaceAll('\\', '/');
  return allowedFixturePaths.some(
    (allowedPath) => normalizedPath === allowedPath || normalizedPath.endsWith(`/${allowedPath}`),
  );
}

const unexpectedFindings = findings.filter((finding) => !isExactTestFixture(finding));
if (unexpectedFindings.length > 0) {
  console.error(`Gitleaks found ${unexpectedFindings.length} unapproved potential secret(s):`);
  for (const finding of unexpectedFindings) {
    const rule = typeof finding?.RuleID === 'string' ? finding.RuleID : 'unknown-rule';
    const file = typeof finding?.File === 'string' ? finding.File : 'unknown-file';
    const line = Number.isInteger(finding?.StartLine) ? finding.StartLine : 'unknown-line';
    console.error(`- ${rule} at ${JSON.stringify(file)}:${line}`);
  }
  process.exit(1);
}

if (findings.length > 0) {
  console.log(
    `Accepted ${findings.length} deterministic UUIDv4 finding(s) in exact AI test fixtures.`,
  );
}
