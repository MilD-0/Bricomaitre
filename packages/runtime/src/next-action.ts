export const NEXT_ACTION_HEADER = 'next-action';

export function hasUnexpectedNextAction(headers: Pick<Headers, 'has'>) {
  return headers.has(NEXT_ACTION_HEADER);
}
