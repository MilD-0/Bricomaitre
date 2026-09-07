'use client';
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { authClient } from '../../../lib/auth-client';
import { rootMotionTransition } from '../../../lib/design-tokens';
import { localeLabels, locales } from '../../../lib/i18n';
import { cn } from '../../../lib/utils';
import { AdminAiChat } from '../../admin-ai-chat';
import { AdminAiSurfaceProvider } from '../../admin-ai-surface-context';
import { ThemeToggle } from '../../theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Dialog, DialogContent } from '../../ui/dialog';
import { PageTransition, PendingInline } from '../../ui/motion';
import { Spinner } from '../../ui/spinner';
import { SidebarNavItem, getUserInitials, type useAppShell } from './use-shell';

export function AppShellView({
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
}: NonNullable<ReturnType<typeof useAppShell>['view']>) {
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
          ref={sidebarRef}
          data-desktop-navigation
          aria-label={t('adminWorkspace.products.selectionMore')}
          aria-modal={!isDesktop && sidebarOpen ? true : undefined}
          role={!isDesktop && sidebarOpen ? 'dialog' : undefined}
          inert={!isDesktop && !sidebarOpen ? true : undefined}
          className={cn(
            'fixed inset-0 z-40 flex w-full flex-col bg-background p-0 text-card-foreground shadow-[var(--shadow-vapor-strong)] transition-transform duration-[var(--duration-navigation)] lg:sticky lg:inset-auto lg:top-3 lg:h-[calc(100vh-1.5rem)] lg:w-[17rem] lg:rounded-xl lg:border lg:border-border/60 lg:bg-background/92 lg:shadow-sm lg:backdrop-blur-xl',
            sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-[110%] rtl:translate-x-[110%] lg:translate-x-0 rtl:lg:translate-x-0',
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

        <main className="min-w-0 flex-1 space-y-3 pb-24 sm:space-y-4">
          <div
            data-mobile-workflow-header
            className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-[var(--shape-radius-card)] border border-border/50 bg-[var(--glass-surface)] px-2.5 py-2 shadow-[var(--shadow-vapor)] backdrop-blur-xl sm:px-4 sm:py-3 lg:hidden"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Button
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
      {initialIsAllowed ? (
        <AdminAiChat permissions={permissions} modelIds={adminAiModelIds} />
      ) : null}
    </AdminAiSurfaceProvider>
  );
}
