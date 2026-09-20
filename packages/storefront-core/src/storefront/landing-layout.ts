import type { LandingPageBlock, LandingPageDocument } from './landing-pages';

export function landingPageOutline(document: LandingPageDocument): Array<LandingPageBlock | null> {
  const rows: Array<LandingPageBlock | null> = [...document.blocks];
  rows.splice(document.checkoutPosition ?? rows.length, 0, null);
  return rows;
}

export function moveLandingPageRow(
  document: LandingPageDocument,
  index: number,
  offset: number,
): LandingPageDocument {
  const rows = landingPageOutline(document);
  const target = index + offset;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return document;
  [rows[index], rows[target]] = [rows[target]!, rows[index]!];
  return {
    ...document,
    schemaVersion: 3,
    checkoutPosition: rows.indexOf(null),
    blocks: rows.filter((row) => row !== null),
  };
}

// Retain placement next to surviving content when an AI edit replaces the block list.
export function preserveCheckoutPosition(
  document: LandingPageDocument,
  blocks: LandingPageBlock[],
) {
  if (document.checkoutPosition === undefined) return undefined;
  if (document.checkoutPosition === document.blocks.length) return blocks.length;
  for (const block of document.blocks.slice(document.checkoutPosition)) {
    const index = blocks.findIndex((item) => item.id === block.id);
    if (index >= 0) return index;
  }
  return Math.min(document.checkoutPosition, blocks.length);
}
