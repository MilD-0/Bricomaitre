import { createSlugAssigner, slugify } from '../../lib/slug';
import {
  type ImportedBrandRow,
  type ImportedCategoryRow,
  type MongoBrandDocument,
  type MongoCategoryDocument,
} from './mongo-import-contract';
import { readMongoDate, readMongoId, trimNullableText } from './mongo-import-values';

export function slugifyImportName(value: string) {
  return slugify(value);
}

export function mapMongoBrandToCurrentSchema(brand: MongoBrandDocument): ImportedBrandRow | null {
  const name = trimNullableText(brand.name);

  if (!name) {
    return null;
  }

  return {
    mongoId: readMongoId(brand._id),
    name,
    slug: slugifyImportName(name),
    image: trimNullableText(brand.image),
    isActive: true,
    featured: Boolean(brand.featured),
    createdBy: null,
    createdByName: null,
    updatedBy: null,
    updatedByName: null,
    createdAt: readMongoDate(brand.createdAt),
    updatedAt: readMongoDate(brand.updatedAt),
  };
}

export function mapMongoCategoryToCurrentSchema(
  category: MongoCategoryDocument,
  parentId: number | null,
): ImportedCategoryRow | null {
  const name = trimNullableText(category.name);

  if (!name) {
    return null;
  }

  return {
    mongoId: readMongoId(category._id),
    name,
    slug: slugifyImportName(name),
    nameEn: trimNullableText(category.name_en),
    nameAr: trimNullableText(category.name_ar),
    image: trimNullableText(category.image),
    isActive: true,
    parentId,
    properties: Array.isArray(category.properties) ? category.properties : [],
    featured: Boolean(category.featured),
    createdBy: null,
    createdByName: null,
    updatedBy: null,
    updatedByName: null,
    createdAt: readMongoDate(category.createdAt),
    updatedAt: readMongoDate(category.updatedAt),
  };
}

export async function importMongoBrands(
  mongoBrands: MongoBrandDocument[],
  insertBrand: (row: ImportedBrandRow) => Promise<number>,
) {
  const brandIdByMongoId = new Map<string, number>();
  const assignSlug = createSlugAssigner();

  for (const mongoBrand of mongoBrands) {
    const mongoId = readMongoId(mongoBrand._id);
    const row = mapMongoBrandToCurrentSchema(mongoBrand);

    if (!mongoId || !row) {
      continue;
    }

    const insertedId = await insertBrand({
      ...row,
      slug: assignSlug(row.name),
    });
    brandIdByMongoId.set(mongoId, insertedId);
  }

  return brandIdByMongoId;
}

export async function importMongoCategories(
  mongoCategories: MongoCategoryDocument[],
  insertCategory: (row: ImportedCategoryRow) => Promise<number>,
) {
  const pending = [...mongoCategories];
  const categoryIdByMongoId = new Map<string, number>();
  const assignSlug = createSlugAssigner();
  let progressed = true;

  while (pending.length > 0 && progressed) {
    progressed = false;

    for (let index = 0; index < pending.length; index += 1) {
      const mongoCategory = pending[index];
      const mongoId = readMongoId(mongoCategory._id);
      const parentMongoId = readMongoId(mongoCategory.parent);

      if (parentMongoId && !categoryIdByMongoId.has(parentMongoId)) {
        continue;
      }

      const row = mapMongoCategoryToCurrentSchema(
        mongoCategory,
        parentMongoId ? (categoryIdByMongoId.get(parentMongoId) ?? null) : null,
      );

      pending.splice(index, 1);
      index -= 1;
      progressed = true;

      if (!mongoId || !row) {
        continue;
      }

      const insertedId = await insertCategory({
        ...row,
        slug: assignSlug(row.name),
      });
      categoryIdByMongoId.set(mongoId, insertedId);
    }
  }

  for (const mongoCategory of pending) {
    const mongoId = readMongoId(mongoCategory._id);
    const row = mapMongoCategoryToCurrentSchema(mongoCategory, null);

    if (!mongoId || !row) {
      continue;
    }

    const insertedId = await insertCategory({
      ...row,
      slug: assignSlug(row.name),
    });
    categoryIdByMongoId.set(mongoId, insertedId);
  }

  return categoryIdByMongoId;
}
