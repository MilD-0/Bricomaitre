import { expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildMetaCatalogWorkbook, toCsvBuffer, toXlsxBuffer } from './meta-catalog';

it('preserves Meta field order, Unicode, quoted text and price values in CSV and XLSX exports', () => {
  const rows = [
    {
      id: '42',
      contentId: '42',
      title: 'Perceuse مثقاب',
      description: 'Outil, "professionnel"\nSans fil',
      availability: 'in stock' as const,
      condition: 'new' as const,
      price: '1200 DZD',
      salePrice: '1000 DZD',
      link: 'https://bricomaitre.com/products/perceuse',
      imageLink: 'https://cdn.example/42.jpg',
      brand: 'Bricomaitre',
    },
  ];
  const workbook = XLSX.read(toXlsxBuffer(buildMetaCatalogWorkbook(rows)), { type: 'buffer' });
  const csv = XLSX.read(toCsvBuffer(rows).toString('utf8'), { type: 'string', raw: true });
  const expected = [
    [
      'id',
      'content_id',
      'title',
      'description',
      'availability',
      'condition',
      'price',
      'sale_price',
      'link',
      'image_link',
      'brand',
    ],
    [
      '42',
      '42',
      'Perceuse مثقاب',
      'Outil, "professionnel"\nSans fil',
      'in stock',
      'new',
      '1200 DZD',
      '1000 DZD',
      'https://bricomaitre.com/products/perceuse',
      'https://cdn.example/42.jpg',
      'Bricomaitre',
    ],
  ];
  expect(workbook.SheetNames).toEqual(['Meta Catalog']);
  expect(XLSX.utils.sheet_to_json(workbook.Sheets['Meta Catalog']!, { header: 1 })).toEqual(
    expected,
  );
  expect(XLSX.utils.sheet_to_json(csv.Sheets[csv.SheetNames[0]!]!, { header: 1 })).toEqual(
    expected,
  );
});
