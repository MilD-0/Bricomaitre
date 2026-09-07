'use client';

import {
  BarChart3,
  Bot,
  Boxes,
  ChevronDown,
  ClipboardList,
  FolderKanban,
  Package2,
  PanelsTopLeft,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { AdminAiModelId } from '../../../lib/admin-ai-models';

import { navigationItems, type NavigationItem, type NavigationKey } from '../../../lib/navigation';
import { canAccessNavigationItem } from '../../../lib/navigation-access';
import { isBuiltInRole, type PermissionKey, type Role } from '../../../lib/permissions';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Spinner } from '../../ui/spinner';
import { useMediaQuery } from '../../ui/use-media-query';
import { useModal } from '../../ui/use-modal';

function getRoleDisplayLabel(
  role: Role,
  roleLabel: string | null,
  t: ReturnType<typeof useTranslations>,
) {
  if (isBuiltInRole(role)) {
    return t(`roles.${role}`);
  }

  return roleLabel ?? role;
}

export function getUserInitials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || '';

  if (!source) {
    return 'U';
  }

  const segments = source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2);

  return segments.map((segment) => segment[0]?.toUpperCase() ?? '').join('') || 'U';
}

const navIcons: Record<NavigationKey, React.ComponentType<{ className?: string }>> = {
  administration: ShieldCheck,
  products: Package2,
  aiProposals: Bot,
  orders: ClipboardList,
  inventory: Boxes,
  assets: FolderKanban,
  brandsCategories: PanelsTopLeft,
  stats: BarChart3,
  bulletin: Radio,
};

const desktopMediaQuery = '(min-width: 1024px)';

export function useAppShell({
  children,
  initialPermissions: permissions,
  initialRole: role,
  initialIsAllowed = true,
  initialRoleLabel: roleLabel = null,
  initialUserEmail = null,
  initialUserImage = null,
  initialUserName = null,
  adminAiModelIds,
}: {
  children: React.ReactNode;
  initialPermissions: PermissionKey[];
  initialRole: Role;
  initialIsAllowed?: boolean;
  initialRoleLabel?: string | null;
  initialUserEmail?: string | null;
  initialUserImage?: string | null;
  initialUserName?: string | null;
  adminAiModelIds?: readonly AdminAiModelId[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isDesktop = useMediaQuery(desktopMediaQuery);
  const [isNavigating, startNavigationTransition] = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const sidebarNavigationRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef(pathname);
  const displayName = initialUserName?.trim() || initialUserEmail?.trim() || t('auth.unknownUser');
  const displayEmail = initialUserEmail?.trim() || t('settings.general.missingEmail');
  const avatarAlt = initialUserName?.trim() || initialUserEmail?.trim() || t('labels.userProfile');
  const roleDisplayLabel = getRoleDisplayLabel(role, roleLabel, t);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    queueMicrotask(() => setSidebarOpen(false));
  }, [pathname]);

  useEffect(() => {
    if (!isDesktop && !sidebarOpen) return;

    const animationFrame = window.requestAnimationFrame(() => {
      const currentNavigationItem = sidebarNavigationRef.current?.querySelector<HTMLElement>(
        '[data-navigation-current="true"]',
      );
      currentNavigationItem?.scrollIntoView?.({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isDesktop, pathname, sidebarOpen]);

  useEffect(() => {
    queueMicrotask(() => {
      setProfileOpen(false);
      setPendingHref(null);
    });
  }, [currentHash, pathname]);

  useEffect(() => {
    const syncHash = () => setCurrentHash(window.location.hash);

    syncHash();
    window.addEventListener('hashchange', syncHash);

    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const items = useMemo(
    () =>
      navigationItems
        .filter((item) =>
          canAccessNavigationItem({
            isAllowed: initialIsAllowed,
            key: item.key,
            permissions,
          }),
        )
        .map((item) => ({
          ...item,
          subItems: item.subItems?.filter(
            (subItem) =>
              !subItem.requiredPermissions ||
              subItem.requiredPermissions.every((permission) => permissions.includes(permission)),
          ),
        })),
    [initialIsAllowed, permissions],
  );
  const analyticsQuery = useMemo(() => {
    if (pathname !== `/${locale}/stats` && !pathname.startsWith(`/${locale}/stats/`)) return '';
    const params = new URLSearchParams();
    const range = searchParams.get('range');
    if (range) params.set('range', range);
    if (range === 'custom') {
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
    }
    const grain = searchParams.get('grain');
    if (grain) params.set('grain', grain);
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [locale, pathname, searchParams]);
  const activeNavigation = useMemo(() => {
    const item =
      pathname === `/${locale}/archive`
        ? items.find((candidate) => candidate.key === 'products')
        : items.find((candidate) => {
            const baseHref = `/${locale}${candidate.href}`;
            return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
          });
    const subItem = item?.subItems
      ? [...item.subItems]
          .sort(
            (left, right) =>
              (right.href.split('#')[0]?.length ?? 0) - (left.href.split('#')[0]?.length ?? 0),
          )
          .find((candidate) => {
            const [candidatePath, candidateHash] = candidate.href.split('#');
            const baseHref = `/${locale}${candidatePath}`;
            const pathMatches = pathname === baseHref || pathname.startsWith(`${baseHref}/`);
            return pathMatches && (!candidateHash || currentHash === `#${candidateHash}`);
          })
      : undefined;

    return {
      item,
      title: subItem
        ? t(subItem.translationKey)
        : item
          ? t(`nav.${item.key}`)
          : t('nav.administration'),
      parent: subItem && item ? t(`nav.${item.key}`) : null,
    };
  }, [currentHash, items, locale, pathname, t]);
  useModal(!isDesktop && sidebarOpen, sidebarRef, setSidebarOpen, sidebarCloseRef);

  const navigate = (href: string) => {
    setPendingHref(href);
    startNavigationTransition(() => {
      router.push(href);
    });
  };

  const switchLocale = (nextLocale: string) => {
    const query = searchParams.toString();
    navigate(
      `${pathname.replace(`/${locale}`, `/${nextLocale}`)}${query ? `?${query}` : ''}${currentHash}`,
    );
  };

  return {
    view: {
      sidebarOpen,
      setSidebarOpen,
      sidebarRef,
      t,
      isDesktop,
      sidebarCollapsed,
      sidebarCloseRef,
      setSidebarCollapsed,
      sidebarNavigationRef,
      items,
      locale,
      pathname,
      currentHash,
      pendingHref,
      analyticsQuery,
      navigate,
      profileOpen,
      setProfileOpen,
      initialUserImage,
      avatarAlt,
      initialUserName,
      initialUserEmail,
      displayName,
      displayEmail,
      isNavigating,
      switchLocale,
      activeNavigation,
      children,
      roleDisplayLabel,
      router,
      initialIsAllowed,
      permissions,
      adminAiModelIds,
    } as const,
    fallback: null,
  };
}

export function SidebarNavItem({
  item,
  locale,
  pathname,
  currentHash,
  collapsed,
  pendingHref,
  analyticsQuery,
  t,
  onNavigate,
}: {
  item: NavigationItem;
  locale: string;
  pathname: string;
  currentHash: string;
  collapsed: boolean;
  pendingHref: string | null;
  analyticsQuery: string;
  t: ReturnType<typeof useTranslations>;
  onNavigate: (href: string) => void;
}) {
  const belongsToProductArchive = item.key === 'products' && pathname === `/${locale}/archive`;
  const [open, setOpen] = useState(
    belongsToProductArchive ||
      pathname === `/${locale}${item.href}` ||
      pathname.startsWith(`/${locale}${item.href}/`),
  );
  const baseHref = `/${locale}${item.href}`;
  const href = item.key === 'stats' ? `${baseHref}${analyticsQuery}` : baseHref;
  const active =
    belongsToProductArchive || pathname === baseHref || pathname.startsWith(`${baseHref}/`);
  const Icon = navIcons[item.key];
  const hasSubItems = Boolean(item.subItems?.length);
  const isPending = pendingHref === href;

  useEffect(() => {
    if (active) {
      queueMicrotask(() => setOpen(true));
    }
  }, [active]);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <Link
          href={href}
          prefetch={item.key === 'stats' ? !active : null}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.altKey ||
              event.ctrlKey ||
              event.shiftKey
            ) {
              return;
            }

            event.preventDefault();
            onNavigate(href);
          }}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-[background-color,color,transform,opacity]',
            active
              ? 'bg-primary/10 font-medium text-foreground'
              : 'bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            isPending && 'scale-[0.99] opacity-80',
            collapsed && 'lg:justify-center',
          )}
          title={collapsed ? t(`nav.${item.key}`) : undefined}
          data-navigation-active={active ? 'true' : undefined}
        >
          <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
          {isPending ? <Spinner className="size-3.5 shrink-0" /> : null}
          <span
            className={cn(
              'min-w-0 whitespace-normal break-words text-left leading-5',
              collapsed && 'lg:hidden',
            )}
          >
            {t(`nav.${item.key}`)}
          </span>
        </Link>
        {hasSubItems ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('size-8 shrink-0 px-0 text-muted-foreground', collapsed && 'lg:hidden')}
            aria-label={`${open ? 'Hide' : 'Show'} ${t(`nav.${item.key}`)} submenu`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </Button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {hasSubItems && open && !collapsed ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="ms-[1.15rem] overflow-hidden"
          >
            <div className="flex flex-col gap-0.5 border-s border-border/70 py-1 ps-3">
              {item.subItems?.map((subItem) => {
                const baseSubHref = `/${locale}${subItem.href}`;
                const subHref = `${baseSubHref}${analyticsQuery}`;
                const subHash = `#${subItem.href.split('#')[1] ?? ''}`;
                return (
                  <Link
                    key={subItem.key}
                    href={subHref}
                    prefetch={item.key === 'stats' ? false : null}
                    onClick={(event) => {
                      if (
                        event.defaultPrevented ||
                        event.button !== 0 ||
                        event.metaKey ||
                        event.altKey ||
                        event.ctrlKey ||
                        event.shiftKey
                      ) {
                        return;
                      }

                      event.preventDefault();
                      onNavigate(subHref);
                    }}
                    className={cn(
                      'rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
                      pendingHref === subHref && 'opacity-70',
                      pathname === baseSubHref ||
                        (pathname === `/${locale}${item.href}` && currentHash === subHash)
                        ? 'bg-muted font-medium text-foreground'
                        : '',
                    )}
                    data-navigation-current={
                      pathname === baseSubHref ||
                      (pathname === `/${locale}${item.href}` && currentHash === subHash)
                        ? 'true'
                        : undefined
                    }
                  >
                    {t(subItem.translationKey)}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
