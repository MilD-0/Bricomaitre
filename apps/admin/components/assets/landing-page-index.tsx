'use client';

import { ExternalLink, Eye, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { requestJson } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { SearchField } from '../search-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Switch } from '../ui/switch';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
  WorkspaceToolbar,
} from '../ui/workspace';
import { getAssetsWorkspaceCopy } from './assets-workspace';
import { getLandingWorkspaceCopy } from './landing-copy';
import { RemoteProductPicker } from './remote-product-picker';

export type LandingPageSummary = {
  id: number;
  productId: number;
  productTitle: string;
  productSlug: string;
  locale: 'fr' | 'ar';
  slug: string;
  active: boolean;
  currentRevision: number;
  updatedAt: string;
};

export function LandingPageIndex({
  initialItems,
  storefrontBaseUrl,
}: {
  initialItems: LandingPageSummary[];
  storefrontBaseUrl: string;
}) {
  const locale = useLocale();
  const params = useParams<{ locale?: string }>();
  const adminLocale = params.locale ?? locale;
  const router = useRouter();
  const assetsCopy = getAssetsWorkspaceCopy(adminLocale);
  const t = getLandingWorkspaceCopy(adminLocale);
  const [items, setItems] = React.useState(initialItems);
  const [query, setQuery] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [pendingIds, setPendingIds] = React.useState<number[]>([]);
  const mutationVersion = React.useRef(0);
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [contentLocale, setContentLocale] = React.useState<'fr' | 'ar'>('fr');

  React.useEffect(() => {
    const controller = new AbortController();
    const version = mutationVersion.current;
    void requestJson<{ items: LandingPageSummary[] }>('/api/landing-pages?view=index', {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted && mutationVersion.current === version)
          setItems(result.items);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          toast.error(error instanceof Error ? error.message : t.validation);
      });
    return () => controller.abort();
  }, [t.validation]);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      `${item.productTitle} ${item.slug} ${item.locale}`.toLocaleLowerCase().includes(normalized),
    );
  }, [items, query]);

  const routes = [
    { label: assetsCopy.banners, href: '/assets' },
    { label: assetsCopy.groups, href: '/assets/featured-groups' },
    { label: assetsCopy.cards, href: '/assets/product-cards' },
    { label: assetsCopy.landingPages, href: '/assets/landing-pages', active: true },
  ];

  const toggle = async (item: LandingPageSummary, active: boolean) => {
    if (pendingIds.includes(item.id)) return;
    mutationVersion.current += 1;
    setPendingIds((current) => [...current, item.id]);
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, active } : row)));
    try {
      await requestJson(`/api/landing-pages/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'set-active',
          active,
          expectedRevision: item.currentRevision,
        }),
      });
    } catch (error) {
      setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
      toast.error(error instanceof Error ? error.message : t.validation);
    } finally {
      setPendingIds((current) => current.filter((id) => id !== item.id));
    }
  };

  const create = async () => {
    const productId = productIds[0];
    if (!productId) return;
    setPending(true);
    try {
      const created = await requestJson<{ id: number }>('/api/landing-pages', {
        method: 'POST',
        body: JSON.stringify({ productId, locale: contentLocale }),
      });
      setCreating(false);
      router.push(`/${adminLocale}/assets/landing-pages/${created.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t.validation);
    } finally {
      setPending(false);
    }
  };

  return (
    <WorkspaceFrame data-assets-workspace="landing-pages">
      <WorkspaceHeader>
        <WorkspaceHeading title={assetsCopy.title} meta={`${t.landingPages} · ${items.length}`} />
        <WorkspaceActions>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t.create}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceNavigation aria-label={assetsCopy.title}>
        {routes.map((route) => (
          <WorkspaceNavigationLink
            key={route.href}
            href={`/${adminLocale}${route.href}`}
            active={route.active}
          >
            {route.label}
          </WorkspaceNavigationLink>
        ))}
      </WorkspaceNavigation>

      <WorkspaceToolbar>
        <SearchField
          value={query}
          label={t.search}
          placeholder={t.search}
          className="max-w-xl"
          onChange={setQuery}
        />
      </WorkspaceToolbar>

      <div className="divide-y divide-border/60 border-b border-border/60">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_5rem_7rem_8rem_auto] sm:px-3 lg:px-4"
          >
            <div className="min-w-0">
              <Link
                href={`/${adminLocale}/assets/landing-pages/${item.id}`}
                className="block max-w-full truncate text-sm font-medium hover:text-primary sm:text-base"
              >
                {item.productTitle}
              </Link>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                /{item.locale}/landing/{item.slug}
              </p>
              <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                {item.locale.toUpperCase()} · {t.revision} {item.currentRevision} ·{' '}
                {new Date(item.updatedAt).toLocaleDateString(adminLocale)}
              </p>
            </div>
            <span className="hidden text-xs font-medium uppercase text-muted-foreground sm:block">
              {item.locale}
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {t.revision} {item.currentRevision}
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              {new Date(item.updatedAt).toLocaleDateString(adminLocale)}
            </span>
            <div className="flex items-center gap-2">
              <a
                href={`/api/landing-pages/${item.id}?view=preview`}
                target="_blank"
                rel="noreferrer"
                aria-label={`${t.preview} · ${item.productTitle}`}
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Eye className="size-4" aria-hidden="true" />
              </a>
              {item.active ? (
                <a
                  href={`${storefrontBaseUrl}/${item.locale}/landing/${encodeURIComponent(item.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${t.live} · ${item.productTitle}`}
                  className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              ) : null}
              <Switch
                aria-label={`${item.active ? t.active : t.inactive} · ${item.productTitle}`}
                checked={item.active}
                disabled={pendingIds.includes(item.id)}
                onCheckedChange={(active) => void toggle(item, active)}
              />
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">{t.noPages}</p>
        ) : null}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.createTitle}</DialogTitle>
            <DialogDescription>{t.createDescription}</DialogDescription>
          </DialogHeader>
          <div className="mt-5 space-y-5">
            <RemoteProductPicker
              label={t.product}
              selectedIds={productIds}
              required
              copy={{
                search: t.productSearch,
                empty: t.productEmpty,
                selected: t.selected,
                inactive: t.inactive,
                remove: t.remove,
              }}
              onChange={setProductIds}
            />
            <label className="grid gap-2 text-sm font-medium">
              {t.locale}
              <select
                className="h-10 rounded-md border border-input bg-background px-3"
                value={contentLocale}
                onChange={(event) => setContentLocale(event.target.value as 'fr' | 'ar')}
              >
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t.cancel}
            </Button>
            <Button disabled={pending || productIds.length === 0} onClick={() => void create()}>
              {t.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkspaceFrame>
  );
}
