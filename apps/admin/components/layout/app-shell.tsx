'use client';

import {
  BarChart3,
  Bot,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FolderKanban,
  LogOut,
  Menu,
  Package2,
  PanelsTopLeft,
  Radio,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { authClient } from '../../lib/auth-client';
import { rootMotionTransition } from '../../lib/design-tokens';
import { navigationItems, type NavigationItem, type NavigationKey } from '../../lib/navigation';
import { canAccessNavigationItem } from '../../lib/navigation-access';
import { isBuiltInRole, type PermissionKey, type Role } from '../../lib/permissions';
import { localeLabels, locales } from '../../lib/i18n';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/app-store';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Dialog, DialogContent } from '../ui/dialog';
import { PageTransition, PendingInline } from '../ui/motion';
import { Spinner } from '../ui/spinner';
import { useMediaQuery } from '../ui/use-media-query';
import { ThemeToggle } from '../theme-toggle';
import { AdminAiChat } from '../admin-ai-chat';
import { AdminAiSurfaceProvider } from '../admin-ai-surface-context';

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
  stats: BarChart3,
  bulletin: Radio,
};

const desktopMediaQuery = '(min-width: 1024px)';

export function AppShell({
  children,
  initialPermissions,
  initialRole,
  initialIsAllowed = true,
  initialRoleLabel = null,
  initialUserEmail = null,
  initialUserImage = null,
  initialUserName = null,
}: {
  children: React.ReactNode;
  initialPermissions: PermissionKey[];
  initialRole: Role;
  initialIsAllowed?: boolean;
  initialRoleLabel?: string | null;
  initialUserEmail?: string | null;
  initialUserImage?: string | null;
  initialUserName?: string | null;
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
  const isDesktop = useMediaQuery(desktopMediaQuery);
  const [isNavigating, startNavigationTransition] = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const sidebarNavigationRef = useRef<HTMLElement>(null);
  const previousPathnameRef = useRef(pathname);
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
    [initialIsAllowed, permissions, role],
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

  return (
    <AdminAiSurfaceProvider className="min-h-screen bg-background text-foreground">
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
          data-desktop-navigation
          aria-label={t('adminWorkspace.products.selectionMore')}
          aria-modal={!isDesktop && sidebarOpen ? true : undefined}
          role={!isDesktop && sidebarOpen ? 'dialog' : undefined}
          inert={!isDesktop && !sidebarOpen ? true : undefined}
          className={cn(
            'fixed inset-0 z-40 flex w-full flex-col bg-background p-0 text-card-foreground shadow-[var(--shadow-vapor-strong)] transition-transform duration-[var(--duration-navigation)] lg:sticky lg:inset-auto lg:top-3 lg:h-[calc(100vh-1.5rem)] lg:w-[17rem] lg:rounded-xl lg:border lg:border-border/60 lg:bg-background/92 lg:shadow-sm lg:backdrop-blur-xl',
            sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-[110%] rtl:translate-x-[110%] lg:translate-x-0',
            sidebarCollapsed ? 'lg:w-[4.75rem]' : 'lg:w-[17rem]',
          )}
          animate={{ opacity: sidebarOpen ? 1 : 0.98 }}
          transition={rootMotionTransition()}
        >
          <motion.div
            layout
            className="flex items-center justify-between gap-2 border-b border-border/60 bg-background px-4 py-3 lg:min-h-16 lg:bg-transparent lg:px-3"
          >
            <div className="min-w-0 flex-1">
              <div
                aria-label="BricAdmin"
                className={cn(
                  'truncate leading-none font-semibold tracking-[var(--type-tracking-n050)] antialiased',
                  sidebarCollapsed
                    ? 'lg:text-center lg:text-xl'
                    : 'text-[length:var(--type-size-brand)]',
                )}
              >
                <span className={cn(sidebarCollapsed && 'lg:hidden')}>
                  <span className="text-foreground/88">Bric</span>
                  <span className="bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                    Admin
                  </span>
                </span>
                <span className={cn('hidden text-primary', sidebarCollapsed && 'lg:inline')}>
                  B
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="lg:hidden">
                <ThemeToggle />
              </div>
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
                variant="ghost"
                size="sm"
                className="hidden size-9 px-0 lg:inline-flex"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {sidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
              </Button>
            </div>
          </motion.div>

          <nav
            ref={sidebarNavigationRef}
            data-desktop-navigation-list
            className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-2.5"
          >
            <div className="flex flex-col gap-1">
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
          </nav>

          <div className="flex flex-col gap-3 border-t border-border/60 bg-background p-3 lg:bg-transparent">
            <button
              type="button"
              className={cn(
                'flex items-center gap-3 rounded-lg px-1 py-1.5 text-start transition-colors hover:bg-muted hover:text-foreground',
                sidebarCollapsed && 'lg:justify-center',
              )}
              aria-controls="sidebar-profile-drawer"
              aria-expanded={profileOpen}
              aria-label={t('labels.userProfile')}
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

            <div
              className={cn(
                'flex items-center gap-2 border-t border-border/50 pt-3',
                sidebarCollapsed && 'lg:flex-col',
              )}
            >
              <div className="hidden lg:block">
                <ThemeToggle />
              </div>
              <div
                className={cn(
                  'ms-auto flex items-center gap-1',
                  sidebarCollapsed && 'lg:ms-0 lg:flex-col',
                )}
              >
                {locales.map((l) => {
                  const localePending =
                    isNavigating && pendingHref === pathname.replace(`/${locale}`, `/${l}`);

                  return (
                    <button
                      key={l}
                      type="button"
                      aria-label={localeLabels[l]}
                      aria-pressed={l === locale}
                      className={cn(
                        'relative grid size-9 cursor-pointer place-items-center rounded-sm text-xs font-bold tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50',
                        l === locale &&
                          'text-foreground after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
                      )}
                      disabled={isNavigating}
                      onClick={() => switchLocale(l)}
                    >
                      {localePending ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <span dir="ltr">{l.toUpperCase()}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.aside>

        <main className="min-w-0 flex-1 space-y-3 sm:space-y-4">
          <div
            data-mobile-workflow-header
            className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-[var(--shape-radius-card)] border border-border/50 bg-[var(--glass-surface)] px-2.5 py-2 shadow-[var(--shadow-vapor)] backdrop-blur-xl sm:px-4 sm:py-3 lg:hidden"
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
                className="rounded-full focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
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

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent
          id="sidebar-profile-drawer"
          className="max-w-sm rounded-[var(--shape-radius-overlay)] bg-[var(--glass-surface)] p-4 sm:ml-auto sm:mr-4 sm:mt-auto"
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
        </DialogContent>
      </Dialog>
      {initialIsAllowed ? <AdminAiChat permissions={permissions} /> : null}
    </AdminAiSurfaceProvider>
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
