'use client';
import {
  landingPageDocumentSchema,
  type LandingPageDocument,
} from '@bric/storefront-core/landing-pages';

export type LocalLandingDraft = {
  version: 1;
  baseRevision: number;
  active: boolean;
  document: LandingPageDocument;
};

export function readLocalDraft(value: string | null): LocalLandingDraft | null {
  if (!value) return null;
  try {
    const draft = JSON.parse(value) as LocalLandingDraft;
    if (
      draft.version !== 1 ||
      !Number.isSafeInteger(draft.baseRevision) ||
      draft.baseRevision < 1 ||
      typeof draft.active !== 'boolean'
    )
      return null;
    const parsed = landingPageDocumentSchema.safeParse(draft.document);
    // Drafts can contain empty required text, unfinished URLs and incomplete
    // lists. Reject broken structure, while retaining those editable values.
    if (
      !parsed.success &&
      parsed.error.issues.some(
        (issue) => !['too_small', 'too_big', 'invalid_format', 'custom'].includes(issue.code),
      )
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}
