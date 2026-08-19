'use client';

import {
  BarChart3,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  FolderKanban,
  LogOut,
  Menu,
  Package2,
  PanelsTopLeft,
  Radio,
  ShieldCheck,
  TrendingUp,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';

import { cn } from '../../lib/utils';
import { serializeLegacyUiPreference } from '../../lib/admin-ui-preference';
import { authClient } from '../../lib/auth-client';
import {
  navigationItemsForUi,
  type NavigationItem,
  type NavigationKey,
} from '../../lib/navigation';
import { canAccessNavigationItem } from '../../lib/navigation-access';
import { isBuiltInRole, type PermissionKey, type Role } from '../../lib/permissions';
import { localeLabels, locales } from '../../lib/i18n';
import { useAppStore } from '../../store/app-store';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Dialog, DialogContent } from '../ui/dialog';
import { PageTransition, PendingInline } from '../ui/motion';
import { Separator } from '../ui/separator';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { ThemeToggle } from '../theme-toggle';
import { AdminAiChat } from '../admin-ai-chat';

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

function getUserInitials(name: string | null, email: string | null) {
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
  analytics2: TrendingUp,
  stats: BarChart3,
  bulletin: Radio,
};

const desktopMediaQuery = '(min-width: 1024px)';
const mobileDockKeys: NavigationKey[] = ['products', 'orders', 'inventory'];

function useDesktopLayout() {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const query = window.matchMedia(desktopMediaQuery);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () =>
      typeof window.matchMedia === 'function'
        ? window.matchMedia(desktopMediaQuery).matches
        : false,
    () => false,
  );
}

export function AppShell({
  children,
  initialPermissions,
  initialRole,
  initialIsAllowed = true,
  initialRoleLabel = null,
  initialUserEmail = null,
  initialUserImage = null,
  initialUserName = null,
  initialLegacyUi = true,
}: {
  children: React.ReactNode;
  initialPermissions: PermissionKey[];
  initialRole: Role;
  initialIsAllowed?: boolean;
  initialRoleLabel?: string | null;
  initialUserEmail?: string | null;
  initialUserImage?: string | null;
  initialUserName?: string | null;
  initialLegacyUi?: boolean;
}) {
  const t = useTranslations();
  const permissions = useAppStore((s) => s.permissions);
  const role = useAppStore((s) => s.role);
  const roleLabel = useAppStore((s) => s.roleLabel);
  const setAccess = useAppStore((s) => s.setAccess);
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isDesktop = useDesktopLayout();
  const [isNavigating, startNavigationTransition] = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [legacyUi, setLegacyUi] = useState(initialLegacyUi);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const displayName = initialUserName?.trim() || initialUserEmail?.trim() || t('auth.unknownUser');
  const displayEmail = initialUserEmail?.trim() || t('settings.general.missingEmail');
  const avatarAlt = initialUserName?.trim() || initialUserEmail?.trim() || t('labels.userProfile');
  const roleDisplayLabel = getRoleDisplayLabel(role, roleLabel, t);

  useEffect(() => {
    setAccess({
      permissions: initialPermissions,
      role: initialRole,
      roleLabel: initialRoleLabel,
    });
  }, [initialPermissions, initialRole, initialRoleLabel, setAccess]);

  useEffect(() => {
    queueMicrotask(() => setSidebarOpen(false));
  }, [pathname]);

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
      navigationItemsForUi(legacyUi)
        .filter((item) =>
          canAccessNavigationItem({
            isAllowed: initialIsAllowed,
            key: item.key,
            permissions,
            role,
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
    [initialIsAllowed, legacyUi, permissions, role],
  );
  const analyticsQuery = useMemo(() => {
    if (!pathname.startsWith(`/${locale}/stats`) && pathname !== `/${locale}/stats`) return '';
    const params = new URLSearchParams();
    const range = searchParams.get('range');
    if (range) params.set('range', range);
    if (range === 'custom') {
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
    }
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [locale, pathname, searchParams]);
  const activeNavigation = useMemo(() => {
    const item = items.find((candidate) => {
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
  const mobileDockItems = useMemo(
    () => mobileDockKeys.map((key) => items.find((item) => item.key === key)).filter(Boolean),
    [items],
  ) as NavigationItem[];

  useEffect(() => {
    if (isDesktop || !sidebarOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const sidebarTrigger = sidebarTriggerRef.current;
    document.body.style.overflow = 'hidden';
    const animationFrame = window.requestAnimationFrame(() => sidebarCloseRef.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSidebarOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      (previousActiveElement ?? sidebarTrigger)?.focus();
    };
  }, [isDesktop, sidebarOpen]);

  const navigate = (href: string) => {
    setPendingHref(href);
    startNavigationTransition(() => {
      router.push(href);
    });
  };

  const switchLocale = (nextLocale: string) => {
    navigate(pathname.replace(`/${locale}`, `/${nextLocale}`));
  };

  const updateLegacyUi = (checked: boolean) => {
    setLegacyUi(checked);
    document.cookie = serializeLegacyUiPreference(checked, window.location.protocol === 'https:');
    startNavigationTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AnimatePresence>
        {sidebarOpen ? (
          <motion.button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-30 bg-foreground/10 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        ) : null}
      </AnimatePresence>

      <div className="flex w-full gap-2 p-2 sm:gap-4 sm:p-4">
        <motion.aside
          aria-label={t('adminWorkspace.products.selectionMore')}
          aria-modal={!isDesktop && sidebarOpen ? true : undefined}
          role={!isDesktop && sidebarOpen ? 'dialog' : undefined}
          inert={!isDesktop && !sidebarOpen ? true : undefined}
          className={cn(
            'fixed inset-0 z-40 flex w-full flex-col bg-background p-0 text-card-foreground shadow-[var(--shadow-vapor-strong)] transition-transform duration-300 lg:sticky lg:inset-auto lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-80 lg:rounded-[1.75rem] lg:bg-[var(--glass-surface)] lg:p-3 lg:backdrop-blur-xl',
            sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-[110%] rtl:translate-x-[110%] lg:translate-x-0',
            sidebarCollapsed ? 'lg:w-24' : 'lg:w-80',
          )}
          animate={{ opacity: sidebarOpen ? 1 : 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            layout
            className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-4 py-3 lg:rounded-2xl lg:border-b-0 lg:bg-card/80 lg:px-3 lg:shadow-[var(--shadow-vapor)] lg:backdrop-blur-xl"
          >
            <div className={cn('min-w-0 flex-1', sidebarCollapsed && 'lg:hidden')}>
              <h1 className="truncate text-[1.85rem] leading-none font-semibold tracking-[-0.05em] antialiased">
                <span className="text-foreground/88">Bric</span>
                <span className="bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                  Admin
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button
                ref={sidebarCloseRef}
                type="button"
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                <X />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="hidden lg:inline-flex"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
              </Button>
            </div>
          </motion.div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:mt-4 lg:rounded-[1.25rem] lg:bg-card/60 lg:p-2 lg:shadow-[var(--shadow-vapor)]">
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <SidebarNavItem
                  key={item.key}
                  item={item}
                  locale={locale}
                  pathname={pathname}
                  currentHash={currentHash}
                  collapsed={sidebarCollapsed}
                  pendingHref={pendingHref}
                  analyticsQuery={analyticsQuery}
                  t={t}
                  onNavigate={navigate}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 bg-background p-3 lg:mt-4 lg:rounded-2xl lg:border-t-0 lg:bg-card/75 lg:shadow-[var(--shadow-vapor)]">
            <button
              type="button"
              className={cn(
                'flex items-center gap-3 rounded-2xl bg-secondary/55 p-3 text-start transition-colors hover:bg-secondary hover:text-accent-foreground',
                sidebarCollapsed && 'lg:justify-center',
              )}
              aria-controls="sidebar-profile-drawer"
              aria-expanded={profileOpen}
              aria-label={t('labels.userProfile')}
              onClick={() => setProfileOpen(true)}
            >
              <Avatar className="size-11">
                {initialUserImage ? (
                  <AvatarImage
                    src={initialUserImage}
                    alt={avatarAlt}
                    referrerPolicy="no-referrer"
                  />
                ) : null}
                <AvatarFallback>
                  {getUserInitials(initialUserName, initialUserEmail)}
                </AvatarFallback>
              </Avatar>
              <div className={cn('min-w-0 flex-1', sidebarCollapsed && 'lg:hidden')}>
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
              </div>
              <ChevronRight className={cn('shrink-0', sidebarCollapsed && 'lg:hidden')} />
            </button>

            <Separator />

            <div className={cn('flex flex-wrap gap-1', sidebarCollapsed && 'lg:flex-col')}>
              {locales.map((l) => (
                <Button
                  key={l}
                  variant={l === locale ? 'default' : 'outline'}
                  size="sm"
                  className={cn(sidebarCollapsed && 'lg:w-full')}
                  disabled={isNavigating}
                  onClick={() => switchLocale(l)}
                >
                  {isNavigating && pendingHref === pathname.replace(`/${locale}`, `/${l}`) ? (
                    <Spinner data-icon="inline-start" className="size-3.5" />
                  ) : null}
                  {sidebarCollapsed ? l.toUpperCase() : localeLabels[l]}
                </Button>
              ))}
            </div>
          </div>
        </motion.aside>

        <main className="min-w-0 flex-1 space-y-3 pb-20 sm:space-y-4 lg:pb-0">
          <div
            data-mobile-workflow-header
            className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-[1rem] border border-border/50 bg-[var(--glass-surface)] px-2.5 py-2 shadow-[var(--shadow-vapor)] backdrop-blur-xl sm:px-4 sm:py-3 lg:hidden"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Button
                ref={sidebarTriggerRef}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{activeNavigation.title}</p>
                {activeNavigation.parent ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {activeNavigation.parent}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PendingInline active={isNavigating} label={t('labels.loading')} />
              <button
                type="button"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                aria-label={`${t('labels.userProfile')} · ${displayName}`}
                onClick={() => setProfileOpen(true)}
              >
                <Avatar className="size-9">
                  {initialUserImage ? (
                    <AvatarImage
                      src={initialUserImage}
                      alt={avatarAlt}
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <AvatarFallback className="text-xs">
                    {getUserInitials(initialUserName, initialUserEmail)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </div>
          </div>
          <PageTransition routeKey={`${pathname}${currentHash}`}>{children}</PageTransition>
        </main>
      </div>

      {mobileDockItems.length > 0 ? (
        <nav
          data-mobile-navigation-dock
          aria-label={t('adminWorkspace.products.selectionMore')}
          className="fixed inset-x-2 bottom-2 z-30 grid grid-flow-col auto-cols-fr rounded-[1rem] border border-border/55 bg-[var(--glass-surface)] p-1.5 shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl lg:hidden"
        >
          {mobileDockItems.map((item) => {
            const href = `/${locale}${item.href}`;
            const active = activeNavigation.item?.key === item.key;
            const Icon = navIcons[item.key];
            return (
              <Link
                key={item.key}
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(href);
                }}
                className={cn(
                  'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[0.7rem] px-1 py-1.5 text-[0.68rem] font-medium text-muted-foreground',
                  active && 'bg-primary text-primary-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="max-w-full truncate">{t(`nav.${item.key}`)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className={cn(
              'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[0.7rem] px-1 py-1.5 text-[0.68rem] font-medium text-muted-foreground',
              activeNavigation.item &&
                !mobileDockKeys.includes(activeNavigation.item.key) &&
                'bg-primary text-primary-foreground',
            )}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-4" aria-hidden="true" />
            <span className="max-w-full truncate">
              {t('adminWorkspace.products.selectionMore')}
            </span>
          </button>
        </nav>
      ) : null}

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent
          id="sidebar-profile-drawer"
          className="max-w-sm rounded-[1.5rem] bg-[var(--glass-surface)] p-4 sm:ml-auto sm:mr-4 sm:mt-auto"
        >
          <div className="flex items-center justify-between gap-3">
            <Badge variant="secondary" className="max-w-[12rem] truncate">
              {roleDisplayLabel}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => router.push('/'),
                  },
                })
              }
            >
              <LogOut className="size-4" />
              <span>{t('auth.signOut')}</span>
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/45 px-3 py-2.5">
            <label htmlFor="legacy-ui-preference" className="min-w-0">
              <span className="block text-sm font-medium">{t('profile.legacyUi')}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {t('profile.legacyUiDescription')}
              </span>
            </label>
            <Switch
              id="legacy-ui-preference"
              checked={legacyUi}
              disabled={isNavigating}
              aria-label={t('profile.legacyUi')}
              onCheckedChange={updateLegacyUi}
            />
          </div>
        </DialogContent>
      </Dialog>
      {initialIsAllowed ? <AdminAiChat /> : null}
    </div>
  );
}

function SidebarNavItem({
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
  const [open, setOpen] = useState(
    pathname === `/${locale}${item.href}` || pathname.startsWith(`/${locale}${item.href}/`),
  );
  const baseHref = `/${locale}${item.href}`;
  const href = item.key === 'stats' ? `${baseHref}${analyticsQuery}` : baseHref;
  const active = pathname === baseHref || pathname.startsWith(`${baseHref}/`);
  const Icon = navIcons[item.key];
  const hasSubItems = Boolean(item.subItems?.length);
  const isPending = pendingHref === href;

  useEffect(() => {
    if (active) {
      queueMicrotask(() => setOpen(true));
    }
  }, [active]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Link
          href={href}
          prefetch
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
            'flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-[background-color,color,box-shadow,transform,opacity]',
            active
              ? 'bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]'
              : 'bg-transparent hover:bg-secondary/70 hover:text-foreground',
            isPending && 'scale-[0.99] opacity-80',
            collapsed && 'lg:justify-center',
          )}
        >
          <Icon className="size-4 shrink-0" />
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
            variant="outline"
            size="sm"
            className={cn('shrink-0 bg-secondary/60', collapsed && 'lg:hidden')}
            aria-label={`${open ? 'Hide' : 'Show'} ${t(`nav.${item.key}`)} submenu`}
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronsUpDown className="size-4" />
          </Button>
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {hasSubItems && open && !collapsed ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            className="ml-4 overflow-hidden"
          >
            <div className="flex flex-col gap-1 rounded-[0.75rem] bg-muted/35 p-2">
              {item.subItems?.map((subItem) => {
                const baseSubHref = `/${locale}${subItem.href}`;
                const subHref = `${baseSubHref}${analyticsQuery}`;
                const subHash = `#${subItem.href.split('#')[1] ?? ''}`;
                return (
                  <Link
                    key={subItem.key}
                    href={subHref}
                    prefetch
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
                      'rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card/80 hover:text-accent-foreground',
                      pendingHref === subHref && 'opacity-70',
                      pathname === baseSubHref ||
                        (pathname === `/${locale}${item.href}` && currentHash === subHash)
                        ? 'bg-card text-foreground shadow-[var(--shadow-vapor)]'
                        : '',
                    )}
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
