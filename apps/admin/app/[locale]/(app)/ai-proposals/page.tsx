import { getDb, hasDb } from '@bric/db/client';

import { AiProposalInbox } from '../../../../components/products/ai-proposal-inbox';
import { AiProposalWorkspace } from '../../../../components/products/ai-proposal-workspace';
import {
  aiProposalInboxQuerySchema,
  loadAiProposalInbox,
  parseAiProposalInboxQuery,
} from '../../../../lib/ai-proposal-inbox';
import { requireAiProposalPageAccess } from '../../../../lib/page-access';
import { readLegacyUiPreference } from '../../../../lib/admin-ui-preference.server';

export default async function AiProposalInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requireAiProposalPageAccess(locale);
  const query = parseAiProposalInboxQuery(await searchParams);
  const emptyData = {
    items: [],
    query,
    pagination: { page: 1, pageSize: query.pageSize, total: 0, totalPages: 1 },
    facets: { proposalTypes: [], entityTypes: [], models: [] },
  };
  const data = hasDb()
    ? await loadAiProposalInbox(getDb(), query)
    : { ...emptyData, query: aiProposalInboxQuerySchema.parse(query) };
  const legacyUi = await readLegacyUiPreference();

  return legacyUi ? (
    <AiProposalInbox initialData={data} />
  ) : (
    <AiProposalWorkspace
      key={JSON.stringify(data.query)}
      initialData={data}
      now={new Date().toISOString()}
    />
  );
}
