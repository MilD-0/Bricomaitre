import { recoverActionHistory } from '../../../../../lib/action-history-api';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return recoverActionHistory((await params).id, 'redo');
}
