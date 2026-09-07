export type EvalToolReceipt = { toolName: string; output: unknown };

export function scenarioToolCoverage(expected: readonly string[], receipts: EvalToolReceipt[]) {
  const returned = new Set(receipts.map((receipt) => receipt.toolName));
  const dryRun = new Set(
    receipts
      .filter(
        ({ output }) =>
          output !== null &&
          typeof output === 'object' &&
          'kind' in output &&
          output.kind === 'evaluation_noop',
      )
      .map(({ toolName }) => toolName),
  );
  return {
    expected,
    returned: [...returned].sort(),
    dryRun: [...dryRun].sort(),
    missing: expected.filter((name) => !returned.has(name)),
    // A returned receipt is execution evidence, not an operator success verdict.
    writesVerified: false,
  };
}
