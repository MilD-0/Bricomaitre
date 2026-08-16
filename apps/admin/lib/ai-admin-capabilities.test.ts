import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb }));

import {
  AI_CATALOG_EDIT_FIELDS,
  AI_TAXONOMY_CREATE_FIELDS,
  AiAdminCapabilityError,
  buildTaxonomyCreateValues,
  proposeEntityEdit,
  reviewAdminProposal,
} from './ai-admin-capabilities';

describe('admin AI catalog capability schemas', () => {
  it('accepts the normal editable brand and category fields', () => {
    expect(
      AI_CATALOG_EDIT_FIELDS.brands.parse({
        name: 'Tolsen Pro',
        image: 'https://cdn.example.com/tolsen.png',
        isActive: false,
        featured: true,
      }),
    ).toEqual({
      name: 'Tolsen Pro',
      image: 'https://cdn.example.com/tolsen.png',
      isActive: false,
      featured: true,
    });
    expect(
      AI_CATALOG_EDIT_FIELDS.categories.parse({
        name: 'Power tools',
        nameEn: 'Power tools',
        nameAr: 'أدوات كهربائية',
        image: null,
        parentId: 12,
        isActive: true,
        featured: false,
      }),
    ).toMatchObject({ parentId: 12, nameAr: 'أدوات كهربائية', image: null });
  });

  it('rejects protected or unknown fields instead of letting the model mutate them', () => {
    expect(() => AI_CATALOG_EDIT_FIELDS.products.parse({ price: 1 })).toThrow();
    expect(() => AI_CATALOG_EDIT_FIELDS.brands.parse({ slug: 'model-controlled' })).toThrow();
    expect(() => AI_CATALOG_EDIT_FIELDS.categories.parse({ viewCount: 999 })).toThrow();
  });

  it('requires a name for creation and defaults approved taxonomy proposals to non-featured', () => {
    expect(AI_TAXONOMY_CREATE_FIELDS.brands.parse({ name: 'Wadfow' })).toEqual({
      name: 'Wadfow',
      featured: false,
    });
    expect(
      AI_TAXONOMY_CREATE_FIELDS.categories.parse({ name: 'Hand tools', parentId: null }),
    ).toEqual({
      name: 'Hand tools',
      parentId: null,
      featured: false,
    });
    expect(() => AI_TAXONOMY_CREATE_FIELDS.categories.parse({ featured: true })).toThrow();
  });

  it('builds approved taxonomy records as inactive drafts with audit ownership', () => {
    expect(
      buildTaxonomyCreateValues({
        entityType: 'brands',
        values: { name: 'Tolsen', featured: true },
        slug: 'tolsen',
        actorId: 'admin@example.com',
        actorName: 'Admin',
      }),
    ).toEqual({
      name: 'Tolsen',
      featured: true,
      slug: 'tolsen',
      isActive: false,
      createdBy: 'admin@example.com',
      createdByName: 'Admin',
      updatedBy: 'admin@example.com',
      updatedByName: 'Admin',
    });
  });
});

describe('admin AI proposal application verification', () => {
  const sourceUpdatedAt = new Date('2026-07-25T00:00:00.000Z');

  function databaseWithResults(updateResults: unknown[][]) {
    const selectResults = [
      [
        {
          id: 9,
          status: 'proposed',
          proposalType: 'entity_edit',
          entityType: 'products',
          entityId: 4,
          sourceUpdatedAt,
          payload: { changes: { active: false } },
          expiresAt: new Date('2099-07-27T00:00:00.000Z'),
        },
      ],
      [{ updatedAt: sourceUpdatedAt }],
    ];
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectResults.shift() ?? []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => updateResults.shift() ?? []),
          })),
        })),
      })),
    };
    return {
      tx,
      db: {
        transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
      },
    };
  }

  beforeEach(() => {
    mocks.getDb.mockReset();
  });

  it('returns verified only after both the entity and proposal status persist', async () => {
    const { db } = databaseWithResults([
      [{ id: 4, active: false }],
      [{ id: 9, status: 'applied' }],
    ]);
    mocks.getDb.mockReturnValue(db);

    await expect(reviewAdminProposal({ proposalId: 9, action: 'approve' })).resolves.toMatchObject({
      id: 9,
      status: 'applied',
      verified: true,
    });
  });

  it('rejects a mismatched write before marking the proposal applied', async () => {
    const { db, tx } = databaseWithResults([
      [{ id: 4, active: true }],
      [{ id: 9, status: 'applied' }],
    ]);
    mocks.getDb.mockReturnValue(db);

    await expect(reviewAdminProposal({ proposalId: 9, action: 'approve' })).rejects.toThrow(
      AiAdminCapabilityError,
    );
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it('rejects completion when the verified entity write cannot be recorded on the proposal', async () => {
    const { db } = databaseWithResults([[{ id: 4, active: false }], []]);
    mocks.getDb.mockReturnValue(db);

    await expect(reviewAdminProposal({ proposalId: 9, action: 'approve' })).rejects.toThrow(
      'proposal result could not be recorded',
    );
  });

  it('does not create a proposal when the requested values are already persisted', async () => {
    const insert = vi.fn();
    mocks.getDb.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: 4, active: false, updatedAt: sourceUpdatedAt }]),
          })),
        })),
      })),
      insert,
    });

    await expect(
      proposeEntityEdit({
        entityType: 'products',
        entityId: 4,
        changes: { active: false },
      }),
    ).rejects.toThrow('does not change');
    expect(insert).not.toHaveBeenCalled();
  });

  it('applies AI landing pages with the new landing-page id in the final slug', async () => {
    const proposal = {
      id: 15,
      status: 'proposed',
      proposalType: 'landing_page',
      entityType: 'products',
      entityId: 4,
      sourceUpdatedAt: null,
      payload: { productId: 4, locale: 'fr', slug: 'perceuse-20v', document: { schemaVersion: 2 } },
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    };
    const insertedPage = {
      id: 73,
      productId: 4,
      locale: 'fr',
      slug: expect.any(String),
      createdBy: null,
      updatedBy: null,
    };
    const insertValues: unknown[] = [];
    const updatedValues: unknown[] = [];
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => [proposal]) })) })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown) => {
          insertValues.push(values);
          return {
            returning: vi.fn(async () =>
              insertValues.length === 1
                ? [{ ...insertedPage, slug: (values as { slug: string }).slug }]
                : [{ ...(values as object), id: 90 }],
            ),
          };
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: unknown) => {
          updatedValues.push(values);
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () =>
                updatedValues.length === 1
                  ? [{ ...insertedPage, slug: (values as { slug: string }).slug }]
                  : [{ id: 15, status: 'applied' }],
              ),
            })),
          };
        }),
      })),
    };
    mocks.getDb.mockReturnValue({
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    });

    await expect(reviewAdminProposal({ proposalId: 15, action: 'approve' })).resolves.toMatchObject(
      { status: 'applied', verified: true },
    );
    expect(updatedValues[0]).toEqual({ slug: 'perceuse-20v-73' });
    expect((insertValues[0] as { slug: string }).slug).toMatch(/^perceuse-20v-\d+$/);
  });
});
