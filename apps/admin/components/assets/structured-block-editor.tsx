'use client';

import type { LandingPageBlock } from '@bric/storefront-core/landing-pages';
import { Plus, X } from 'lucide-react';
import * as React from 'react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import type { LandingWorkspaceCopy } from './landing-copy';

const variants: Record<LandingPageBlock['type'], string[]> = {
  'product-hero': ['media-left', 'media-right', 'media-background', 'product-stage', 'editorial'],
  'benefit-grid': ['icons', 'numbered', 'compact'],
  'media-feature': ['media-left', 'media-right'],
  specifications: ['table', 'cards'],
  faq: ['accordion'],
  'editorial-intro': ['centered', 'split', 'statement'],
  'image-gallery': ['spotlight', 'mosaic', 'filmstrip'],
  'use-cases': ['cards', 'editorial', 'mosaic'],
  comparison: ['table', 'spotlight'],
  process: ['horizontal', 'vertical', 'timeline'],
  'trust-band': ['ribbon', 'cards', 'minimal'],
  'commerce-panel': ['spotlight', 'compact', 'image-led'],
  'final-cta': ['solid', 'split'],
};

const labels: Record<'en' | 'fr' | 'ar', Record<string, string>> = {
  en: {
    heading: 'Heading',
    body: 'Body',
    subheading: 'Subheading',
    eyebrow: 'Eyebrow',
    imageUrl: 'Image URL',
    imageAlt: 'Image description',
    primaryCtaLabel: 'Primary action label',
    showAddToCart: 'Show add to cart',
    bullets: 'Bullet points',
    highlights: 'Highlights',
    items: 'Items',
    images: 'Images',
    steps: 'Steps',
    title: 'Title',
    description: 'Description',
    icon: 'Icon',
    label: 'Label',
    value: 'Value',
    question: 'Question',
    answer: 'Answer',
    caption: 'Caption',
    productLabel: 'Product heading',
    alternativeLabel: 'Alternative heading',
    productValue: 'Product value',
    alternativeValue: 'Alternative value',
    footnote: 'Footnote',
  },
  fr: {
    heading: 'Titre',
    body: 'Texte',
    subheading: 'Sous-titre',
    eyebrow: 'Surtitre',
    imageUrl: 'URL de l’image',
    imageAlt: 'Description de l’image',
    primaryCtaLabel: 'Libellé de l’action',
    showAddToCart: 'Afficher l’ajout au panier',
    bullets: 'Points clés',
    highlights: 'Mises en avant',
    items: 'Éléments',
    images: 'Images',
    steps: 'Étapes',
    title: 'Titre',
    description: 'Description',
    icon: 'Icône',
    label: 'Libellé',
    value: 'Valeur',
    question: 'Question',
    answer: 'Réponse',
    caption: 'Légende',
    productLabel: 'Titre du produit',
    alternativeLabel: 'Titre de l’alternative',
    productValue: 'Valeur du produit',
    alternativeValue: 'Valeur de l’alternative',
    footnote: 'Note',
  },
  ar: {
    heading: 'العنوان',
    body: 'النص',
    subheading: 'العنوان الفرعي',
    eyebrow: 'العنوان التمهيدي',
    imageUrl: 'رابط الصورة',
    imageAlt: 'وصف الصورة',
    primaryCtaLabel: 'نص الإجراء الرئيسي',
    showAddToCart: 'إظهار الإضافة إلى السلة',
    bullets: 'النقاط',
    highlights: 'النقاط البارزة',
    items: 'العناصر',
    images: 'الصور',
    steps: 'الخطوات',
    title: 'العنوان',
    description: 'الوصف',
    icon: 'الأيقونة',
    label: 'التسمية',
    value: 'القيمة',
    question: 'السؤال',
    answer: 'الإجابة',
    caption: 'التعليق',
    productLabel: 'عنوان المنتج',
    alternativeLabel: 'عنوان البديل',
    productValue: 'قيمة المنتج',
    alternativeValue: 'قيمة البديل',
    footnote: 'ملاحظة',
  },
};

export const blockLabels: Record<'en' | 'fr' | 'ar', Record<LandingPageBlock['type'], string>> = {
  en: {
    'product-hero': 'Product hero',
    'benefit-grid': 'Benefits',
    'media-feature': 'Media feature',
    specifications: 'Specifications',
    faq: 'FAQ',
    'editorial-intro': 'Editorial introduction',
    'image-gallery': 'Image gallery',
    'use-cases': 'Use cases',
    comparison: 'Comparison',
    process: 'Process',
    'trust-band': 'Trust band',
    'commerce-panel': 'Commerce panel',
    'final-cta': 'Final action',
  },
  fr: {
    'product-hero': 'Hero produit',
    'benefit-grid': 'Avantages',
    'media-feature': 'Média et argument',
    specifications: 'Caractéristiques',
    faq: 'Questions fréquentes',
    'editorial-intro': 'Introduction éditoriale',
    'image-gallery': 'Galerie',
    'use-cases': 'Cas d’usage',
    comparison: 'Comparaison',
    process: 'Étapes',
    'trust-band': 'Bandeau de confiance',
    'commerce-panel': 'Offre produit',
    'final-cta': 'Action finale',
  },
  ar: {
    'product-hero': 'واجهة المنتج',
    'benefit-grid': 'المزايا',
    'media-feature': 'ميزة مع صورة',
    specifications: 'المواصفات',
    faq: 'الأسئلة الشائعة',
    'editorial-intro': 'مقدمة تحريرية',
    'image-gallery': 'معرض الصور',
    'use-cases': 'حالات الاستخدام',
    comparison: 'المقارنة',
    process: 'الخطوات',
    'trust-band': 'شريط الثقة',
    'commerce-panel': 'عرض المنتج',
    'final-cta': 'الإجراء الختامي',
  },
};

const longFields = new Set(['body', 'subheading', 'description', 'answer', 'footnote']);
const hiddenFields = new Set(['id', 'type', 'surface', 'width', 'variant']);
const objectArrayFields = new Set(['items', 'images', 'steps']);
const campaignIcons = [
  'power',
  'shield',
  'delivery',
  'tool',
  'phone',
  'payment',
  'check',
  'layers',
  'target',
  'sparkles',
] as const;

function fallbackItem(type: LandingPageBlock['type'], key: string): Record<string, unknown> {
  if (type === 'specifications') return { label: '', value: '' };
  if (type === 'faq') return { question: '', answer: '' };
  if (type === 'image-gallery') return { imageUrl: null, imageAlt: '', caption: '' };
  if (type === 'comparison') return { label: '', productValue: '', alternativeValue: '' };
  if (type === 'process') return { title: '', description: '' };
  if (['benefit-grid', 'use-cases', 'trust-band'].includes(type))
    return { title: '', description: '', icon: 'tool' };
  return key === 'images' ? { imageUrl: null, imageAlt: '', caption: '' } : {};
}

function ScalarField({
  name,
  value,
  locale,
  onChange,
}: {
  name: string;
  value: unknown;
  locale: 'en' | 'fr' | 'ar';
  onChange: (value: unknown) => void;
}) {
  const label = labels[locale][name] ?? name.replace(/([A-Z])/g, ' $1');
  if (typeof value === 'boolean')
    return (
      <label className="flex items-center justify-between border-b border-border/55 py-3 text-sm font-medium">
        {label}
        <Switch checked={value} onCheckedChange={onChange} />
      </label>
    );
  const stringValue = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (name === 'icon')
    return (
      <label className="grid gap-1.5 text-sm font-medium">
        {label}
        <select
          className="h-10 rounded-md border border-input bg-background px-3"
          value={stringValue}
          onChange={(event) => onChange(event.target.value)}
        >
          {campaignIcons.map((icon) => (
            <option key={icon} value={icon}>
              {icon}
            </option>
          ))}
        </select>
      </label>
    );
  const Control = longFields.has(name) ? Textarea : Input;
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Control
        value={stringValue}
        onChange={(event) =>
          onChange(name === 'imageUrl' && !event.target.value.trim() ? null : event.target.value)
        }
      />
    </label>
  );
}

function ArrayField({
  name,
  value,
  type,
  locale,
  copy,
  onChange,
}: {
  name: string;
  value: unknown[];
  type: LandingPageBlock['type'];
  locale: 'en' | 'fr' | 'ar';
  copy: LandingWorkspaceCopy;
  onChange: (value: unknown[]) => void;
}) {
  const title = labels[locale][name] ?? name;
  const objectItems =
    objectArrayFields.has(name) || (value.length > 0 && typeof value[0] === 'object');
  const add = () => onChange([...value, objectItems ? fallbackItem(type, name) : '']);
  return (
    <fieldset className="border-t border-border/60 pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold">{title}</legend>
        <Button type="button" size="sm" variant="outline" onClick={add}>
          <Plus className="size-3.5" aria-hidden="true" />
          {copy.addItem}
        </Button>
      </div>
      <div className="divide-y divide-border/55 border-b border-border/55">
        {value.map((item, index) => (
          <div key={index} className="relative space-y-3 py-4 pe-10">
            {typeof item === 'object' && item !== null ? (
              Object.entries(item as Record<string, unknown>).map(([field, fieldValue]) => (
                <ScalarField
                  key={field}
                  name={field}
                  value={fieldValue}
                  locale={locale}
                  onChange={(next) =>
                    onChange(
                      value.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...(entry as Record<string, unknown>), [field]: next }
                          : entry,
                      ),
                    )
                  }
                />
              ))
            ) : (
              <ScalarField
                name={`${title} ${index + 1}`}
                value={item}
                locale={locale}
                onChange={(next) =>
                  onChange(value.map((entry, itemIndex) => (itemIndex === index ? next : entry)))
                }
              />
            )}
            <button
              type="button"
              aria-label={`${copy.removeItem} ${index + 1}`}
              className="absolute end-0 top-4 grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

export function StructuredBlockEditor({
  block,
  locale,
  copy,
  onChange,
}: {
  block: LandingPageBlock;
  locale: 'en' | 'fr' | 'ar';
  copy: LandingWorkspaceCopy;
  onChange: (block: LandingPageBlock) => void;
}) {
  const record = block as unknown as Record<string, unknown>;
  const patch = (name: string, value: unknown) =>
    onChange({ ...record, [name]: value } as unknown as LandingPageBlock);
  return (
    <div className="space-y-4">
      {Object.entries(record).map(([name, value]) => {
        if (hiddenFields.has(name)) return null;
        if (Array.isArray(value))
          return (
            <ArrayField
              key={name}
              name={name}
              value={value}
              type={block.type}
              locale={locale}
              copy={copy}
              onChange={(next) => patch(name, next)}
            />
          );
        return (
          <ScalarField
            key={name}
            name={name}
            value={value}
            locale={locale}
            onChange={(next) => patch(name, next)}
          />
        );
      })}
      <details className="border-t border-border/60 pt-4">
        <summary className="cursor-pointer text-sm font-semibold">{copy.advanced}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5 text-sm font-medium">
            {copy.variant}
            <select
              className="h-10 rounded-md border border-input bg-background px-3"
              value={block.variant}
              aria-label={copy.variant}
              onChange={(event) => patch('variant', event.target.value)}
            >
              {variants[block.type].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {copy.surface}
            <select
              className="h-10 rounded-md border border-input bg-background px-3"
              value={block.surface}
              aria-label={copy.surface}
              onChange={(event) => patch('surface', event.target.value)}
            >
              {['plain', 'white', 'soft', 'dark', 'accent'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {copy.width}
            <select
              className="h-10 rounded-md border border-input bg-background px-3"
              value={block.width}
              aria-label={copy.width}
              onChange={(event) => patch('width', event.target.value)}
            >
              {['narrow', 'wide', 'full'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </div>
  );
}
