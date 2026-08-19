'use client';

import type {
  LandingPageBlock,
  LandingPageDocument,
  LandingPageRecord,
} from '@bric/storefront-core/landing-pages';
import { ArrowDown, ArrowUp, Eye, LayoutTemplate, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AssetMetaProduct } from '../lib/assets';
import { ProductPickerField } from './product-picker-field';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';

type PageItem = LandingPageRecord & { productTitle: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? 'La requête a échoué.');
  return payload as T;
}

function blockLabel(block: LandingPageBlock) {
  return (
    {
      'product-hero': 'Hero produit',
      'benefit-grid': 'Avantages',
      'media-feature': 'Média + argument',
      specifications: 'Caractéristiques',
      faq: 'Questions fréquentes',
      'editorial-intro': 'Introduction éditoriale',
      'image-gallery': 'Galerie produit',
      'use-cases': 'Cas d’usage',
      comparison: 'Comparaison',
      process: 'Étapes',
      'trust-band': 'Bandeau de confiance',
      'commerce-panel': 'Offre produit dynamique',
      'final-cta': 'CTA final',
    } as const
  )[block.type];
}

function textValue(block: LandingPageBlock) {
  if (block.type === 'product-hero') return block.subheading;
  if (block.type === 'media-feature') return [block.body, ...block.bullets].join('\n');
  if (block.type === 'final-cta') return block.body;
  if (block.type === 'editorial-intro') return [block.body, ...block.highlights].join('\n');
  if (block.type === 'image-gallery')
    return block.images
      .map((item) => `${item.imageUrl ?? ''} | ${item.imageAlt} | ${item.caption}`)
      .join('\n');
  if (block.type === 'use-cases' || block.type === 'trust-band')
    return block.items.map((item) => `${item.title} | ${item.description}`).join('\n');
  if (block.type === 'comparison')
    return block.items
      .map((item) => `${item.label} | ${item.productValue} | ${item.alternativeValue}`)
      .join('\n');
  if (block.type === 'process')
    return block.steps.map((item) => `${item.title} | ${item.description}`).join('\n');
  if (block.type === 'commerce-panel') return [block.body, ...block.bullets].join('\n');
  if (block.type === 'benefit-grid')
    return block.items.map((item) => `${item.title} | ${item.description}`).join('\n');
  if (block.type === 'specifications')
    return block.items.map((item) => `${item.label} | ${item.value}`).join('\n');
  return block.items.map((item) => `${item.question} | ${item.answer}`).join('\n');
}

function updateBlockText(block: LandingPageBlock, value: string): LandingPageBlock {
  if (block.type === 'product-hero') return { ...block, subheading: value };
  if (block.type === 'media-feature') {
    const [body = '', ...bullets] = value.split('\n').map((line) => line.trim());
    return { ...block, body, bullets: bullets.filter(Boolean).slice(0, 6) };
  }
  if (block.type === 'final-cta') return { ...block, body: value };
  if (block.type === 'editorial-intro') {
    const [body = '', ...highlights] = value.split('\n').map((line) => line.trim());
    return { ...block, body, highlights: highlights.filter(Boolean).slice(0, 4) };
  }
  if (block.type === 'commerce-panel') {
    const [body = '', ...bullets] = value.split('\n').map((line) => line.trim());
    return { ...block, body, bullets: bullets.filter(Boolean).slice(0, 5) };
  }
  const lines = value
    .split('\n')
    .map((line) => line.split('|').map((part) => part.trim()))
    .filter((parts) => parts[0] && parts[1]);
  if (block.type === 'image-gallery')
    return {
      ...block,
      images: lines.slice(0, 8).map(([imageUrl, imageAlt = '', caption = '']) => ({
        imageUrl: imageUrl || null,
        imageAlt,
        caption,
      })),
    };
  if (block.type === 'use-cases')
    return {
      ...block,
      items: lines.slice(0, 6).map(([title, description], index) => ({
        title,
        description,
        icon: block.items[index]?.icon ?? 'target',
      })),
    };
  if (block.type === 'comparison')
    return {
      ...block,
      items: lines
        .filter((parts) => parts[2])
        .slice(0, 8)
        .map(([label, productValue, alternativeValue]) => ({
          label,
          productValue,
          alternativeValue,
        })),
    };
  if (block.type === 'process')
    return {
      ...block,
      steps: lines.slice(0, 6).map(([title, description]) => ({ title, description })),
    };
  if (block.type === 'trust-band')
    return {
      ...block,
      items: lines.slice(0, 5).map(([title, description], index) => ({
        title,
        description,
        icon: block.items[index]?.icon ?? 'shield',
      })),
    };
  if (block.type === 'benefit-grid')
    return {
      ...block,
      items: lines.slice(0, 6).map(([title, description], index) => ({
        title,
        description,
        icon: block.items[index]?.icon ?? 'tool',
      })),
    };
  if (block.type === 'specifications')
    return {
      ...block,
      items: lines.slice(0, 20).map(([label, itemValue]) => ({ label, value: itemValue })),
    };
  return {
    ...block,
    items: lines.slice(0, 12).map(([question, answer]) => ({ question, answer })),
  };
}

function updateHeading(block: LandingPageBlock, heading: string): LandingPageBlock {
  return { ...block, heading } as LandingPageBlock;
}

function blockVariants(block: LandingPageBlock) {
  if (block.type === 'product-hero')
    return ['media-left', 'media-right', 'media-background', 'product-stage', 'editorial'];
  if (block.type === 'benefit-grid') return ['icons', 'numbered', 'compact'];
  if (block.type === 'media-feature') return ['media-left', 'media-right'];
  if (block.type === 'specifications') return ['table', 'cards'];
  if (block.type === 'editorial-intro') return ['centered', 'split', 'statement'];
  if (block.type === 'image-gallery') return ['spotlight', 'mosaic', 'filmstrip'];
  if (block.type === 'use-cases') return ['cards', 'editorial', 'mosaic'];
  if (block.type === 'comparison') return ['table', 'spotlight'];
  if (block.type === 'process') return ['horizontal', 'vertical', 'timeline'];
  if (block.type === 'trust-band') return ['ribbon', 'cards', 'minimal'];
  if (block.type === 'commerce-panel') return ['spotlight', 'compact', 'image-led'];
  if (block.type === 'final-cta') return ['solid', 'split'];
  return ['accordion'];
}

function createBlock(type: LandingPageBlock['type'], locale: 'fr' | 'ar'): LandingPageBlock {
  const ar = locale === 'ar';
  const id = `${type}-${Date.now().toString(36)}`;
  const treatment = { surface: 'plain' as const, width: 'wide' as const };
  if (type === 'benefit-grid')
    return {
      id,
      type,
      ...treatment,
      variant: 'icons',
      heading: ar ? 'المزايا' : 'Les avantages',
      items: [
        {
          title: ar ? 'ميزة أولى' : 'Premier avantage',
          description: ar ? 'اشرح الفائدة للعميل.' : 'Expliquez le bénéfice client.',
          icon: 'tool',
        },
        {
          title: ar ? 'ميزة ثانية' : 'Deuxième avantage',
          description: ar ? 'اشرح الفائدة للعميل.' : 'Expliquez le bénéfice client.',
          icon: 'tool',
        },
      ],
    };
  if (type === 'media-feature')
    return {
      id,
      type,
      ...treatment,
      variant: 'media-left',
      heading: ar ? 'ميزة مهمة' : 'Un avantage concret',
      body: ar ? 'اشرح كيف يساعد المنتج العميل.' : 'Expliquez comment le produit aide le client.',
      imageUrl: null,
      imageAlt: '',
      bullets: [],
    };
  if (type === 'specifications')
    return {
      id,
      type,
      ...treatment,
      variant: 'table',
      heading: ar ? 'المواصفات' : 'Caractéristiques',
      items: [{ label: ar ? 'الخاصية' : 'Caractéristique', value: ar ? 'القيمة' : 'Valeur' }],
    };
  if (type === 'faq')
    return {
      id,
      type,
      ...treatment,
      variant: 'accordion',
      heading: ar ? 'أسئلة شائعة' : 'Questions fréquentes',
      items: [
        {
          question: ar ? 'السؤال؟' : 'Votre question ?',
          answer: ar ? 'الإجابة.' : 'Votre réponse.',
        },
      ],
    };
  if (type === 'editorial-intro')
    return {
      id,
      type,
      ...treatment,
      variant: 'statement',
      eyebrow: '',
      heading: ar ? 'فكرة الحملة' : 'Le parti pris de la campagne',
      body: ar ? 'قدّم المنتج من زاوية واضحة.' : 'Présentez le produit sous un angle clair.',
      highlights: [],
    };
  if (type === 'image-gallery')
    return {
      id,
      type,
      ...treatment,
      variant: 'mosaic',
      heading: ar ? 'شاهد التفاصيل' : 'Voyez chaque détail',
      images: [
        { imageUrl: null, imageAlt: '', caption: '' },
        { imageUrl: null, imageAlt: '', caption: '' },
      ],
    };
  if (type === 'use-cases')
    return {
      id,
      type,
      ...treatment,
      variant: 'cards',
      heading: ar ? 'مصمم لأعمالكم' : 'Pensé pour vos travaux',
      body: '',
      items: [
        {
          title: ar ? 'الاستخدام الأول' : 'Premier usage',
          description: ar ? 'استخدم معلومة موثقة.' : 'Utilisez une information vérifiée.',
          icon: 'target',
        },
        {
          title: ar ? 'الاستخدام الثاني' : 'Deuxième usage',
          description: ar ? 'استخدم معلومة موثقة.' : 'Utilisez une information vérifiée.',
          icon: 'tool',
        },
      ],
    };
  if (type === 'comparison')
    return {
      id,
      type,
      ...treatment,
      variant: 'table',
      heading: ar ? 'قارن بوضوح' : 'Comparez clairement',
      productLabel: ar ? 'هذا المنتج' : 'Ce produit',
      alternativeLabel: ar ? 'البديل' : 'Alternative',
      items: [
        {
          label: ar ? 'المعيار الأول' : 'Premier critère',
          productValue: ar ? 'القيمة' : 'Valeur',
          alternativeValue: ar ? 'القيمة' : 'Valeur',
        },
        {
          label: ar ? 'المعيار الثاني' : 'Deuxième critère',
          productValue: ar ? 'القيمة' : 'Valeur',
          alternativeValue: ar ? 'القيمة' : 'Valeur',
        },
      ],
      footnote: '',
    };
  if (type === 'process')
    return {
      id,
      type,
      ...treatment,
      variant: 'horizontal',
      heading: ar ? 'كيف يعمل؟' : 'Comment ça marche ?',
      body: '',
      steps: [
        {
          title: ar ? 'الخطوة الأولى' : 'Première étape',
          description: ar ? 'اشرح الخطوة.' : 'Expliquez cette étape.',
        },
        {
          title: ar ? 'الخطوة الثانية' : 'Deuxième étape',
          description: ar ? 'اشرح الخطوة.' : 'Expliquez cette étape.',
        },
      ],
    };
  if (type === 'trust-band')
    return {
      id,
      type,
      ...treatment,
      variant: 'ribbon',
      heading: '',
      items: [
        {
          title: ar ? 'الدفع عند الاستلام' : 'Paiement à la livraison',
          description: '',
          icon: 'payment',
        },
        {
          title: ar ? 'توصيل سريع في كل الجزائر' : 'Livraison rapide partout en Algérie',
          description: '',
          icon: 'delivery',
        },
      ],
    };
  if (type === 'commerce-panel')
    return {
      id,
      type,
      ...treatment,
      variant: 'spotlight',
      heading: ar ? 'اطلب منتجك' : 'Commandez votre produit',
      body: '',
      bullets: [],
      imageUrl: null,
      imageAlt: '',
      primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
      showAddToCart: true,
    };
  if (type === 'product-hero')
    return {
      id,
      type,
      ...treatment,
      variant: 'media-left',
      heading: ar ? 'عنوان الحملة' : 'Titre de campagne',
      subheading: '',
      imageUrl: null,
      imageAlt: '',
      primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
      showAddToCart: true,
    };
  return {
    id,
    type,
    ...treatment,
    variant: 'solid',
    heading: ar ? 'هل أنت مستعد؟' : 'Prêt à commander ?',
    body: '',
    primaryCtaLabel: ar ? 'اطلب الآن' : 'Commander maintenant',
    imageUrl: null,
    imageAlt: '',
  };
}

export function LandingDraftPreview({
  document,
  locale,
  mobile,
}: {
  document: LandingPageDocument;
  locale: 'fr' | 'ar';
  mobile: boolean;
}) {
  const ar = locale === 'ar';
  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={`mx-auto isolate overflow-hidden rounded-2xl border border-[#d8dfdd] bg-[#f5f5f3] text-[#202529] shadow-inner [color-scheme:light] ${mobile ? 'max-w-[23rem]' : 'max-w-5xl'}`}
    >
      <div className="flex h-12 items-center justify-between border-b border-[#d8dfdd] bg-white px-4 text-xs font-bold text-[#202529]">
        <span>BRICOMAITRE</span>
        <span>{locale === 'ar' ? 'اتصل بنا' : 'Nous appeler'}</span>
      </div>
      <div className="space-y-4 p-3">
        {document.blocks.map((block) => {
          const surface =
            block.surface === 'dark'
              ? 'bg-[#20292c] text-white'
              : block.surface === 'soft'
                ? 'bg-[#e9efed] text-[#202529]'
                : block.surface === 'accent'
                  ? 'bg-[#dcefed] text-[#202529]'
                  : 'bg-white text-[#202529]';
          const split =
            !mobile &&
            ['product-hero', 'media-feature', 'commerce-panel', 'editorial-intro'].includes(
              block.type,
            );
          const lines = textValue(block).split('\n').filter(Boolean).slice(0, 8);
          return (
            <section
              key={block.id}
              className={`rounded-2xl p-4 ${surface} ${block.width === 'narrow' ? 'mx-auto max-w-2xl' : ''} ${split ? 'grid grid-cols-2 gap-4' : ''}`}
            >
              <div className="space-y-2">
                <span className="text-[.6rem] font-bold uppercase tracking-wider text-[#007f82]">
                  {blockLabel(block)} · {block.variant}
                </span>
                <h3
                  className={`${block.type === 'editorial-intro' && block.variant === 'statement' ? 'text-2xl' : 'text-lg'} font-semibold`}
                >
                  {block.heading || blockLabel(block)}
                </h3>
                {[
                  'product-hero',
                  'media-feature',
                  'final-cta',
                  'editorial-intro',
                  'commerce-panel',
                ].includes(block.type) ? (
                  <p className="text-xs leading-5 opacity-70">{lines[0]}</p>
                ) : (
                  <div
                    className={`grid gap-2 ${mobile || block.type === 'process' ? '' : block.type === 'image-gallery' ? 'grid-cols-2' : 'grid-cols-3'}`}
                  >
                    {lines.map((line, itemIndex) => (
                      <span
                        key={`${block.id}-${itemIndex}`}
                        className="rounded-xl bg-black/5 p-2 text-[.68rem]"
                      >
                        {line}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {['product-hero', 'media-feature', 'image-gallery', 'commerce-panel'].includes(
                block.type,
              ) ? (
                <div className="grid min-h-32 place-items-center rounded-xl bg-white text-xs text-[#657074]">
                  {block.type === 'image-gallery'
                    ? 'Composition des images'
                    : 'Image produit + données live'}
                </div>
              ) : null}
            </section>
          );
        })}
        <section
          aria-label={ar ? 'نموذج الطلب الدائم' : 'Formulaire de commande permanent'}
          className="rounded-2xl border border-[#b6d9d5] bg-white p-4 text-[#202529]"
        >
          <span className="text-[.6rem] font-bold uppercase tracking-wider text-[#007f82]">
            {ar ? 'قسم دائم' : 'Section permanente'}
          </span>
          <h3 className="mt-2 text-lg font-semibold">
            {ar ? 'إتمام الطلب' : 'Finaliser votre commande'}
          </h3>
          <p className="mt-1 text-xs text-[#657074]">
            {ar
              ? 'بيانات العميل، التوصيل وملخص الطلب.'
              : 'Coordonnées, livraison et résumé de la commande.'}
          </p>
          <div className={`mt-3 grid gap-2 ${mobile ? '' : 'grid-cols-2'}`}>
            <span className="h-9 rounded-xl bg-[#e8edeb]" />
            <span className="h-9 rounded-xl bg-[#e8edeb]" />
            <span className="h-9 rounded-xl bg-[#e8edeb]" />
            <span className="h-9 rounded-xl bg-[#e8edeb]" />
          </div>
          <span className="mt-3 grid h-10 place-items-center rounded-xl bg-[#f26a21] text-xs font-bold text-[#202529]">
            {ar ? 'تأكيد الطلب' : 'Confirmer ma commande'}
          </span>
        </section>
      </div>
    </div>
  );
}

export function LandingPageManager({
  initialItems,
  products,
  storefrontBaseUrl,
}: {
  initialItems: PageItem[];
  products: AssetMetaProduct[];
  storefrontBaseUrl: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [selectedId, setSelectedId] = useState<number | null>(initialItems[0]?.id ?? null);
  const [draft, setDraft] = useState<LandingPageDocument | null>(initialItems[0]?.document ?? null);
  const [active, setActive] = useState(initialItems[0]?.status === 'published');
  const [productId, setProductId] = useState(0);
  const [locale, setLocale] = useState<'fr' | 'ar'>('fr');
  const [busy, setBusy] = useState(false);
  const [previewMobile, setPreviewMobile] = useState(false);
  const [newBlockType, setNewBlockType] = useState<LandingPageBlock['type']>('media-feature');
  const [message, setMessage] = useState('');
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const creationProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );
  const pickerProducts = useMemo(
    () =>
      products.map((product) => ({
        id: product.id,
        label: product.title,
        imageUrl: product.images[0] ?? null,
        description: product.slug,
      })),
    [products],
  );

  function selectPage(page: PageItem) {
    setSelectedId(page.id);
    setDraft(structuredClone(page.document));
    setActive(page.status === 'published');
    setMessage('');
  }
  function patchDocument(updater: (current: LandingPageDocument) => LandingPageDocument) {
    setDraft((current) => (current ? updater(current) : current));
  }
  function patchBlock(index: number, block: LandingPageBlock) {
    patchDocument((current) => ({
      ...current,
      schemaVersion: 2,
      blocks: current.blocks.map((item, itemIndex) => (itemIndex === index ? block : item)),
    }));
  }
  function move(index: number, offset: number) {
    patchDocument((current) => {
      const blocks = [...current.blocks];
      const target = index + offset;
      if (target < 0 || target >= blocks.length) return current;
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...current, blocks };
    });
  }

  async function reload(preferredId?: number) {
    const result = await api<{ items: PageItem[] }>('/api/landing-pages');
    setItems(result.items);
    const page = result.items.find((item) => item.id === preferredId) ?? result.items[0] ?? null;
    setSelectedId(page?.id ?? null);
    setDraft(page ? structuredClone(page.document) : null);
    setActive(page?.status === 'published');
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ id: number }>('/api/landing-pages', {
        method: 'POST',
        body: JSON.stringify({ productId, locale }),
      });
      await reload(result.id);
      setProductId(0);
      setMessage('Page créée.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Création impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected || !draft) return;
    setBusy(true);
    setMessage('');
    try {
      await api(`/api/landing-pages/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'save-active',
          document: { ...draft, seo: { ...draft.seo, indexable: false } },
          active,
          expectedRevision: selected.draftRevision,
        }),
      });
      await reload(selected.id);
      setMessage('Page enregistrée.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Mise à jour impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Landing pages produit</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Créez et modifiez des expériences produit ciblées pour le storefront.
          </p>
        </div>
      </header>
      <section className="overflow-hidden rounded-[1.75rem] bg-background/95 shadow-sm">
        <div className="flex items-start gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LayoutTemplate className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Nouvelle landing page</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choisissez un produit. Son slug canonique devient automatiquement l’URL de la landing
              page.
            </p>
          </div>
        </div>
        <form
          onSubmit={create}
          className="grid items-start gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]"
        >
          <ProductPickerField
            label="Produit"
            items={pickerProducts}
            selectedId={productId || null}
            searchPlaceholder="Rechercher par nom ou slug…"
            emptyLabel="Aucun produit ne correspond à cette recherche."
            onChange={(value) => setProductId(value ?? 0)}
          />
          <div className="space-y-4 rounded-2xl bg-muted/20 p-4">
            <label className="grid gap-2 text-sm font-medium">
              Langue
              <select
                className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm"
                value={locale}
                onChange={(event) => setLocale(event.target.value as 'fr' | 'ar')}
              >
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </select>
            </label>
            <div>
              <p className="text-sm font-medium">Adresse générée</p>
              <p className="mt-2 break-all rounded-xl border border-dashed border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {creationProduct
                  ? `/${locale}/landing/${creationProduct.slug}`
                  : 'Sélectionnez un produit'}
              </p>
            </div>
            <Button className="w-full" disabled={busy || !productId}>
              <Plus />
              Créer la page
            </Button>
          </div>
        </form>
      </section>
      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="space-y-2 self-start rounded-[1.75rem] bg-background/95 p-3 shadow-sm">
          {items.length ? (
            items.map((page) => (
              <button
                type="button"
                key={page.id}
                onClick={() => selectPage(page)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${page.id === selectedId ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted/50'}`}
              >
                <strong className="block text-sm">{page.productTitle}</strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  /{page.locale}/landing/{page.slug}
                </span>
                <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-1 text-[.65rem] font-semibold">
                  {page.status === 'published' ? 'Active' : 'Inactive'}
                </span>
              </button>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Aucune landing page.</p>
          )}
        </aside>
        {selected && draft ? (
          <section className="space-y-4 rounded-[1.75rem] bg-background/95 p-4 shadow-sm [&_article]:border-0 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{selected.productTitle}</h2>
                <p className="text-xs text-muted-foreground">Révision {selected.draftRevision}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-xl border border-border/70 px-3 text-sm font-medium">
                  Active
                  <Switch aria-label="Active" checked={active} onCheckedChange={setActive} />
                </label>
                <Button onClick={() => void save()} disabled={busy}>
                  <Save />
                  Enregistrer
                </Button>
                {storefrontBaseUrl && selected.status === 'published' ? (
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-secondary-foreground"
                    href={`${storefrontBaseUrl}/${selected.locale}/landing/${selected.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Eye className="size-4" />
                    Voir
                  </a>
                ) : selected.status === 'published' ? (
                  <Button variant="outline" disabled title="Configurez STOREFRONT_BASE_URL">
                    <Eye className="size-4" />
                    Voir
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">
                Titre SEO
                <Input
                  value={draft.seo.title}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      seo: { ...current.seo, title: event.target.value, indexable: false },
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Description SEO
                <Input
                  value={draft.seo.description}
                  onChange={(event) =>
                    patchDocument((current) => ({
                      ...current,
                      seo: { ...current.seo, description: event.target.value, indexable: false },
                    }))
                  }
                />
              </label>
              <select
                className="h-10 rounded-xl border bg-background px-3 text-sm"
                value={draft.theme.accent}
                onChange={(event) =>
                  patchDocument((current) => ({
                    ...current,
                    theme: {
                      ...current.theme,
                      accent: event.target.value as LandingPageDocument['theme']['accent'],
                    },
                  }))
                }
              >
                <option value="orange">Orange commerce</option>
                <option value="teal">Teal marque</option>
                <option value="graphite">Graphite</option>
              </select>
            </div>
            <div className="rounded-2xl bg-muted/20 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong className="text-sm">Aperçu de la page</strong>
                  <p className="text-xs text-muted-foreground">
                    Le prix, le stock et les frais seront résolus en direct. Le formulaire de
                    commande est toujours inclus.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={!previewMobile ? 'default' : 'outline'}
                    onClick={() => setPreviewMobile(false)}
                  >
                    Desktop
                  </Button>
                  <Button
                    size="sm"
                    variant={previewMobile ? 'default' : 'outline'}
                    onClick={() => setPreviewMobile(true)}
                  >
                    Mobile
                  </Button>
                </div>
              </div>
              <LandingDraftPreview
                document={draft}
                locale={selected.locale}
                mobile={previewMobile}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl p-3">
              <select
                className="h-9 rounded-xl border bg-background px-3 text-sm"
                value={newBlockType}
                onChange={(event) =>
                  setNewBlockType(event.target.value as LandingPageBlock['type'])
                }
              >
                <option value="editorial-intro">Introduction éditoriale</option>
                <option value="image-gallery">Galerie produit</option>
                <option value="use-cases">Cas d’usage</option>
                <option value="comparison">Comparaison</option>
                <option value="process">Étapes</option>
                <option value="trust-band">Bandeau de confiance</option>
                <option value="commerce-panel">Offre produit dynamique</option>
                <option value="benefit-grid">Avantages</option>
                <option value="media-feature">Média + argument</option>
                <option value="specifications">Caractéristiques</option>
                <option value="faq">FAQ</option>
              </select>
              <Button
                size="sm"
                onClick={() =>
                  patchDocument((current) => ({
                    ...current,
                    schemaVersion: 2,
                    blocks: [
                      ...current.blocks.slice(0, -1),
                      createBlock(newBlockType, selected.locale),
                      current.blocks.at(-1)!,
                    ],
                  }))
                }
              >
                <Plus />
                Ajouter un bloc
              </Button>
            </div>
            <div className="space-y-3">
              {draft.blocks.map((block, index) => (
                <article key={block.id} className="rounded-2xl border bg-background p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <strong className="text-sm">{blockLabel(block)}</strong>
                      <span className="ml-2 text-xs text-muted-foreground">{block.id}</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="px-2"
                        variant="ghost"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label="Monter"
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="sm"
                        className="px-2"
                        variant="ghost"
                        onClick={() => move(index, 1)}
                        disabled={index === draft.blocks.length - 1}
                        aria-label="Descendre"
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        size="sm"
                        className="px-2"
                        variant="ghost"
                        onClick={() =>
                          patchDocument((current) => ({
                            ...current,
                            blocks: current.blocks.filter((_, itemIndex) => itemIndex !== index),
                          }))
                        }
                        disabled={block.type === 'product-hero' || block.type === 'final-cta'}
                        aria-label="Supprimer"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
                      <Input
                        value={block.heading}
                        onChange={(event) =>
                          patchBlock(index, updateHeading(block, event.target.value))
                        }
                      />
                      <select
                        className="h-10 rounded-xl border bg-background px-3 text-sm"
                        value={block.variant}
                        onChange={(event) =>
                          patchBlock(index, {
                            ...block,
                            variant: event.target.value,
                          } as LandingPageBlock)
                        }
                      >
                        {blockVariants(block).map((variant) => (
                          <option key={variant} value={variant}>
                            {variant}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">
                        Surface
                        <select
                          className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                          value={block.surface}
                          onChange={(event) =>
                            patchBlock(index, {
                              ...block,
                              surface: event.target.value,
                            } as LandingPageBlock)
                          }
                        >
                          <option value="plain">Sans fond</option>
                          <option value="white">Blanc élevé</option>
                          <option value="soft">Teinte douce</option>
                          <option value="dark">Sombre</option>
                          <option value="accent">Accent</option>
                        </select>
                      </label>
                      <label className="text-xs font-semibold">
                        Largeur
                        <select
                          className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                          value={block.width}
                          onChange={(event) =>
                            patchBlock(index, {
                              ...block,
                              width: event.target.value,
                            } as LandingPageBlock)
                          }
                        >
                          <option value="narrow">Éditoriale</option>
                          <option value="wide">Large</option>
                          <option value="full">Pleine</option>
                        </select>
                      </label>
                    </div>
                    {block.type === 'comparison' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          placeholder="Libellé produit"
                          value={block.productLabel}
                          onChange={(event) =>
                            patchBlock(index, { ...block, productLabel: event.target.value })
                          }
                        />
                        <Input
                          placeholder="Libellé comparaison"
                          value={block.alternativeLabel}
                          onChange={(event) =>
                            patchBlock(index, { ...block, alternativeLabel: event.target.value })
                          }
                        />
                      </div>
                    ) : null}
                    <Textarea
                      rows={
                        [
                          'benefit-grid',
                          'specifications',
                          'faq',
                          'image-gallery',
                          'use-cases',
                          'comparison',
                          'process',
                          'trust-band',
                        ].includes(block.type)
                          ? 5
                          : 3
                      }
                      value={textValue(block)}
                      onChange={(event) =>
                        patchBlock(index, updateBlockText(block, event.target.value))
                      }
                    />
                    {'imageUrl' in block ? (
                      <Input
                        type="url"
                        placeholder="URL d’image (vide = image produit)"
                        value={block.imageUrl ?? ''}
                        onChange={(event) =>
                          patchBlock(index, {
                            ...block,
                            imageUrl: event.target.value || null,
                          } as LandingPageBlock)
                        }
                      />
                    ) : null}
                    {'primaryCtaLabel' in block ? (
                      <Input
                        placeholder="Texte du bouton principal"
                        value={block.primaryCtaLabel}
                        onChange={(event) =>
                          patchBlock(index, {
                            ...block,
                            primaryCtaLabel: event.target.value,
                          } as LandingPageBlock)
                        }
                      />
                    ) : null}
                    {block.type === 'product-hero' || block.type === 'commerce-panel' ? (
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={block.showAddToCart}
                          onCheckedChange={(checked) =>
                            patchBlock(index, { ...block, showAddToCart: checked })
                          }
                        />
                        Afficher Ajouter au panier
                      </label>
                    ) : null}
                    <p className="text-[.68rem] text-muted-foreground">
                      Listes: une ligne par élément. Utilisez titre | description, ou critère |
                      produit | alternative pour une comparaison. Galerie: URL | texte alternatif |
                      légende.
                    </p>
                  </div>
                </article>
              ))}
            </div>
            {message ? (
              <p role="status" className="rounded-xl bg-muted p-3 text-sm">
                {message}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
