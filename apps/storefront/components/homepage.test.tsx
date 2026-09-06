import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { homepageFixtureResponse } from '@/test/fixtures/homepage';
import { Homepage, selectCarouselTaxonomy, selectHomepageCategories } from './homepage';

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

  it.each(['svg', 'jpg'])(
    'prioritizes the responsive %s banner over product images, and products when no banner is published',
    (extension) => {
      const featured = { ...data, topProducts: homepageFixtureResponse.topProducts.slice(0, 2) };
      const container = document.createElement('div');
      container.innerHTML = renderToStaticMarkup(
        <Homepage
          data={{
            ...featured,
            banners: [
              {
                ...homepageFixtureResponse.banners[0]!,
                imageUrl: `/hero.${extension}`,
                imageUrlLandscape: `/hero.${extension}`,
                imageUrlPortrait: `/hero-mobile.${extension}`,
              },
            ],
          }}
          locale="fr"
          contact={contact}
        />,
      );
      const mobilePreload = container.querySelector(
        'link[rel="preload"][media="(max-width: 620px)"]',
      );
      const desktopPreload = container.querySelector(
        'link[rel="preload"][media="not all and (max-width: 620px)"]',
      );
      expect(mobilePreload).toHaveAttribute('media', '(max-width: 620px)');
      expect(desktopPreload).toHaveAttribute('media', 'not all and (max-width: 620px)');
      if (extension === 'jpg') {
        expect(mobilePreload?.getAttribute('imagesrcset')).toBe(
          container.querySelector('picture source')?.getAttribute('srcset'),
        );
        expect(desktopPreload?.getAttribute('imagesrcset')).toBe(
          container.querySelector('picture img')?.getAttribute('srcset'),
        );
      }
      expect(container.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(2);
      expect(container.querySelector('.home-banner img')).toHaveAttribute('loading', 'eager');
      expect(container.querySelectorAll('.catalog-card img[loading="eager"]')).toHaveLength(0);
      expect(container.querySelectorAll('.catalog-card img[loading="lazy"]')).toHaveLength(2);
      container.innerHTML = renderToStaticMarkup(
        <Homepage data={featured} locale="fr" contact={contact} />,
      );
      expect(container.querySelectorAll('.catalog-card img[loading="eager"]')).toHaveLength(2);
    },
  );

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
});
