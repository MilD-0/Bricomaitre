import { getDb, hasDb } from '@bric/db/client';

import { AiProposalWorkspace } from '@/components/products/ai-proposal-workspace';
import {
  aiProposalInboxQuerySchema,
  loadAiProposalInbox,
  parseAiProposalInboxQuery,
} from '@/lib/ai-proposal-inbox';
import { requirePageAccess } from '@/lib/page-access';

export default async function AiProposalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requirePageAccess(locale, 'aiProposals');
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
  return (
    <AiProposalWorkspace
      key={JSON.stringify(data.query)}
      initialData={data}
      now={new Date().toISOString()}
    />
  );
}
