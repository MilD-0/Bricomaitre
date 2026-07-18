'use client';

import { BarChart3, Boxes, ChevronLeft, ChevronRight, ChevronsUpDown, ClipboardList, FolderKanban, LogOut, Menu, Package2, PanelsTopLeft, Radio, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { cn } from '../../lib/utils';
import { navigationItems, type NavigationItem, type NavigationKey } from '../../lib/navigation';
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
import { ThemeToggle } from '../theme-toggle';
import { AdminAiChat } from '../admin-ai-chat';

function getRoleDisplayLabel(role: Role, roleLabel: string | null, t: ReturnType<typeof useTranslations>) {
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
  orders: ClipboardList,
  inventory: Boxes,
  assets: FolderKanban,
  brandsCategories: PanelsTopLeft,
  stats: BarChart3,
  bulletin: Radio,
};

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
  const router = useRouter();
  const [isNavigating, startNavigationTransition] = useTransition();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
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
    () => navigationItems.filter((item) => canAccessNavigationItem({
      isAllowed: initialIsAllowed,
      key: item.key,
      permissions,
      role,
    })),
    [initialIsAllowed, permissions, role],
  );

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

      <div className="flex w-full gap-4 p-3 sm:p-4">
        <motion.aside
          className={cn(
            'fixed inset-y-3 left-3 z-40 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-[1.75rem] bg-[var(--glass-surface)] p-3 text-card-foreground shadow-[var(--shadow-vapor-strong)] backdrop-blur-xl transition-transform duration-300 lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-[110%] lg:translate-x-0',
            sidebarCollapsed ? 'lg:w-24' : 'lg:w-80',
          )}
          animate={{ opacity: sidebarOpen ? 1 : 0.98 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div layout className="flex items-center justify-between gap-2 rounded-2xl bg-card/80 px-3 py-3 shadow-[var(--shadow-vapor)] backdrop-blur-xl">
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

          <div className="mt-4 flex-1 overflow-y-auto rounded-[1.25rem] bg-card/60 p-2 shadow-[var(--shadow-vapor)]">
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
                  t={t}
                  onNavigate={navigate}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-card/75 p-3 shadow-[var(--shadow-vapor)]">
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
                {initialUserImage ? <AvatarImage src={initialUserImage} alt={avatarAlt} referrerPolicy="no-referrer" /> : null}
                <AvatarFallback>{getUserInitials(initialUserName, initialUserEmail)}</AvatarFallback>
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
                  {isNavigating && pendingHref === pathname.replace(`/${locale}`, `/${l}`) ? <Spinner data-icon="inline-start" className="size-3.5" /> : null}
                  {sidebarCollapsed ? l.toUpperCase() : localeLabels[l]}
                </Button>
              ))}
            </div>
          </div>
        </motion.aside>

        <main className="min-w-0 flex-1 space-y-4">
          <div className="sticky top-3 z-20 flex items-center justify-between gap-3 rounded-[1.5rem] bg-[var(--glass-surface)] px-4 py-3 shadow-[var(--shadow-vapor)] backdrop-blur-xl lg:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                <Menu />
              </Button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{t('nav.administration')}</p>
                <p className="truncate text-xs text-muted-foreground">{t('pages.administration')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <PendingInline active={isNavigating} label={t('labels.loading')} />
              <ThemeToggle />
            </div>
          </div>
          <PageTransition routeKey={`${pathname}${currentHash}`}>{children}</PageTransition>
        </main>
      </div>

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
              onClick={() => void signOut({ callbackUrl: '/' })}
            >
              <LogOut className="size-4" />
              <span>{t('auth.signOut')}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {permissions.includes('ai_use') && permissions.some((permission) => permission.startsWith('ai_') && permission !== 'ai_use') ? <AdminAiChat /> : null}
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
  t,
  onNavigate,
}: {
  item: NavigationItem;
  locale: string;
  pathname: string;
  currentHash: string;
  collapsed: boolean;
  pendingHref: string | null;
  t: ReturnType<typeof useTranslations>;
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(
    Boolean(item.subItems?.length) || pathname === `/${locale}${item.href}` || pathname.startsWith(`/${locale}${item.href}/`),
  );
  const href = `/${locale}${item.href}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
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
            active ? 'bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]' : 'bg-transparent hover:bg-secondary/70 hover:text-foreground',
            isPending && 'scale-[0.99] opacity-80',
            collapsed && 'lg:justify-center',
          )}
        >
          <Icon className="size-4 shrink-0" />
          {isPending ? <Spinner className="size-3.5 shrink-0" /> : null}
          <span className={cn('min-w-0 whitespace-normal break-words text-left leading-5', collapsed && 'lg:hidden')}>{t(`nav.${item.key}`)}</span>
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
                const subHref = `/${locale}${subItem.href}`;
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
                      pathname === subHref || (pathname === `/${locale}${item.href}` && currentHash === subHash)
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
