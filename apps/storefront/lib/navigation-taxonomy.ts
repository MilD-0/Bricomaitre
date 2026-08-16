export type NavigationTaxonomyCategory = {
  id: number;
  label: string;
  slug?: string | null;
  parentId: number | null;
};

export type NavigationTaxonomyNode = NavigationTaxonomyCategory & {
  children: NavigationTaxonomyNode[];
};

export function buildNavigationTaxonomy(
  categories: NavigationTaxonomyCategory[],
): NavigationTaxonomyNode[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const childrenByParent = new Map<number, NavigationTaxonomyCategory[]>();

  for (const category of categories) {
    if (
      category.parentId === null ||
      category.parentId === category.id ||
      !categoryById.has(category.parentId)
    )
      continue;
    const children = childrenByParent.get(category.parentId) ?? [];
    children.push(category);
    childrenByParent.set(category.parentId, children);
  }

  const materialize = (
    category: NavigationTaxonomyCategory,
    ancestors: ReadonlySet<number>,
  ): NavigationTaxonomyNode => {
    const nextAncestors = new Set(ancestors).add(category.id);
    return {
      ...category,
      children: (childrenByParent.get(category.id) ?? [])
        .filter((child) => !nextAncestors.has(child.id))
        .map((child) => materialize(child, nextAncestors)),
    };
  };

  const rootCategories = categories.filter(
    (category) =>
      category.parentId === null ||
      category.parentId === category.id ||
      !categoryById.has(category.parentId),
  );
  const roots = rootCategories.map((category) => materialize(category, new Set()));
  const visible = new Set<number>();
  const markVisible = (node: NavigationTaxonomyNode) => {
    visible.add(node.id);
    node.children.forEach(markVisible);
  };
  roots.forEach(markVisible);

  for (const category of categories) {
    if (visible.has(category.id)) continue;
    const root = materialize(category, new Set());
    roots.push(root);
    markVisible(root);
  }

  return roots;
}
