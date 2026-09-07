import process from 'node:process';
import readline from 'node:readline/promises';
import { IMPORT_TARGET_LABELS, type ValidationReport } from './legacy-import-contract';
import {
  IMPORT_TARGETS,
  parseDropTables,
  type ImportTarget,
  type LegacyImportCliOptions,
} from './legacy-mongo-import-script';

export async function promptForDropPlan() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const scopeAnswer = await rl.question(
      'Choose destructive scope: [1] all workspace tables, [2] import tables only, [3] custom import tables: ',
    );

    if (scopeAnswer.trim() === '1') {
      return { dropScope: 'all' as const, dropTables: [] as ImportTarget[] };
    }

    if (scopeAnswer.trim() === '2') {
      return { dropScope: 'import' as const, dropTables: [] as ImportTarget[] };
    }

    if (scopeAnswer.trim() !== '3') {
      throw new Error('Invalid destructive scope selection.');
    }

    const tableAnswer = await rl.question(
      `Enter comma-separated import tables (${IMPORT_TARGETS.join(', ')}): `,
    );
    const selected = parseDropTables(tableAnswer);

    if (selected.length === 0) {
      throw new Error('Custom destructive scope requires at least one valid import table.');
    }

    return {
      dropScope: 'custom' as const,
      dropTables: [...new Set(selected)],
    };
  } finally {
    rl.close();
  }
}

export async function confirmWrite(options: LegacyImportCliOptions, report: ValidationReport) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return true;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const scopeDetail =
      options.dropScope === 'custom'
        ? `${options.dropScope} (${options.dropTables.join(', ')})`
        : options.dropScope;
    console.log(`\nWrite summary:`);
    console.log(`- Targets: ${report.targets.join(', ')}`);
    console.log(`- Drop scope: ${scopeDetail}`);
    console.log(
      `- Orders blocked by missing cart refs: ${report.orderDiagnostics.blockedByCart.length}`,
    );
    console.log(`- Skip blocked orders: ${options.skipBlockedOrders ? 'yes' : 'no'}`);

    const answer = await rl.question('Type "yes" to continue: ');
    return answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export function printReport(
  report: ValidationReport,
  options: LegacyImportCliOptions,
  files: Record<ImportTarget, string>,
) {
  console.log('Legacy import sources:');
  for (const target of IMPORT_TARGETS) {
    console.log(`- ${IMPORT_TARGET_LABELS[target]}: ${files[target]}`);
  }

  console.log('\nImport summary:');
  console.log(`- Mode: ${options.replace ? 'write' : 'dry-run'}`);
  console.log(`- Selected targets: ${report.targets.join(', ')}`);
  console.log(`- Tables to clear: ${report.replacement?.tables.join(', ')}`);
  console.log(
    `- Outside dependencies: ${report.replacement?.outsideDependencies.map((edge) => `${edge.table} references ${edge.references}`).join('; ') || 'none'}`,
  );
  console.log(`- Invalid selected documents: ${report.invalidDocuments.length}`);
  for (const document of report.invalidDocuments.slice(0, 10)) {
    console.log(`  - ${document.target} ${document.mongoId ?? '<unknown>'}: ${document.reason}`);
  }
  console.log(`- Invalid orders: ${report.orderDiagnostics.invalid.length}`);
  for (const order of report.orderDiagnostics.invalid.slice(0, 10)) {
    console.log(`  - ${order.mongoId ?? '<unknown>'}: ${order.reasons.join('; ')}`);
  }
  console.log(`- Skip blocked orders: ${options.skipBlockedOrders ? 'yes' : 'no'}`);
  for (const target of IMPORT_TARGETS) {
    const counts = report.counts[target];
    console.log(
      `- ${IMPORT_TARGET_LABELS[target]}: loaded=${counts.loaded} prepared=${counts.prepared} skipped=${counts.skipped}`,
    );
  }

  console.log('\nDiagnostics:');
  console.log(`- Product price fallbacks: ${report.productDiagnostics.priceFallbacks.length}`);
  console.log(`- Product old prices dropped: ${report.productDiagnostics.oldPriceDropped}`);
  console.log(
    `- Product purchase prices dropped: ${report.productDiagnostics.purchasePriceDropped}`,
  );
  console.log(
    `- Orders blocked by unresolved state: ${report.orderDiagnostics.skippedForState.length}`,
  );
  console.log(
    `- Orders blocked by unmatched cart refs: ${report.orderDiagnostics.blockedByCart.length}`,
  );

  if (report.productDiagnostics.priceFallbacks.length > 0) {
    console.log('\nProducts with fallback price:');
    for (const item of report.productDiagnostics.priceFallbacks.slice(0, 10)) {
      console.log(`- ${item.title} (${item.mongoId ?? 'no mongo id'})`);
    }
  }

  if (report.orderDiagnostics.skippedForState.length > 0) {
    console.log('\nOrders blocked by unresolved state:');
    for (const item of report.orderDiagnostics.skippedForState.slice(0, 10)) {
      console.log(`- ${item.mongoId ?? 'no mongo id'}: ${item.state ?? '<null>'}`);
    }
  }

  if (report.orderDiagnostics.blockedByCart.length > 0) {
    console.log('\nOrders blocked by unmatched cart refs:');
    for (const item of report.orderDiagnostics.blockedByCart.slice(0, 10)) {
      console.log(`- ${item.mongoId ?? 'no mongo id'}: ${item.missingRefs.join(', ')}`);
    }
  }
}
