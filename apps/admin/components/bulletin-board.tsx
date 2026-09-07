'use client';
import { BulletinBoardView } from './bulletin/bulletin-view';
import { useBulletinBoard } from './bulletin/use-bulletin';
export function BulletinBoard(...args: Parameters<typeof useBulletinBoard>) {
  const model = useBulletinBoard(...args);
  if (model.view === null) return model.fallback;
  return <BulletinBoardView {...model.view} />;
}
