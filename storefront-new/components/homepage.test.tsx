import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Homepage } from './homepage';

const data = {
  banners: [], topProducts: [], categories: [], productCards: [], brands: [], featuredGroups: [],
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
});
