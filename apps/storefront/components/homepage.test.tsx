import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { homepageFixtureResponse } from '@/test/fixtures/homepage';
import {
  Homepage,
  selectCarouselTaxonomy,
  selectHomepageBrands,
  selectHomepageCategories,
} from './homepage';

const data = {
  banners: [],
  topProducts: [],
  categories: [],
  productCards: [],
  brands: [],
  featuredGroups: [],
};

const contact = {
  phoneDisplay: '0795 34 28 26',
  phoneHref: 'tel:+213795342826',
  phoneEnabled: true,
  aiAssistantEnabled: true,
};

describe('Homepage trust signals', () => {
  it('shows rapid delivery and the configured contact number', () => {
    render(<Homepage data={data} locale="fr" contact={contact} />);

    expect(screen.getByText('Livraison rapide partout en Algérie')).toBeVisible();
    expect(screen.getByText('0795 34 28 26')).toBeVisible();
    expect(screen.queryByText('Conseil par téléphone')).not.toBeInTheDocument();
  });

  it('keeps homepage taxonomy payloads bounded to visible and product-relevant records', () => {
    const sample = homepageFixtureResponse.categories[0]!;
    const categories = Array.from({ length: 105 }, (_, index) => ({
      ...sample,
      id: index + 1,
      parentId: index < 18 ? null : 1,
    }));
    const visible = selectHomepageCategories(categories);
    const taxonomy = selectCarouselTaxonomy(
      homepageFixtureResponse.topProducts.slice(0, 1),
      homepageFixtureResponse.brands,
      homepageFixtureResponse.categories,
    );

    expect(visible).toHaveLength(16);
    expect(visible.every((category) => category.parentId === null)).toBe(true);
    expect(taxonomy.brands.map((brand) => brand.id)).toEqual([1]);
    expect(taxonomy.categories.map((category) => category.id)).toEqual([1]);
  });

  it('shows only featured brands with brand artwork', () => {
    const sample = homepageFixtureResponse.brands[0]!;
    const brands = [
      sample,
      { ...sample, id: 2, featured: false },
      { ...sample, id: 3, featured: true, image: null },
    ];

    expect(selectHomepageBrands(brands).map((brand) => brand.id)).toEqual([sample.id]);
  });
});
