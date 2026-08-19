import Image from 'next/image';
import Link from 'next/link';

import { FooterContactLink } from '@/components/footer-contact-link';
import { getLocale, getTranslations } from 'next-intl/server';

import logo from '../public/logo.png';

import { GlobalSearch } from '@/components/global-search';
import { NavigationActions } from '@/components/navigation-actions';
import { NavigationCategories } from '@/components/navigation-categories';
import { ShoppingAssistantLauncher } from '@/components/shopping-assistant-launcher';
import { isLocale, type Locale } from '@/i18n/config';
import {
  getStorefrontContent,
  getStorefrontSettings,
} from '@/lib/storefront-api';
import {
  defaultStorefrontSettingsResponse,
  type StorefrontSettingsResponse,
} from '@bric/storefront-core/contracts';

type PageShellProps = {
  children: React.ReactNode;
  locale?: Locale;
  contactSettings?: Pick<
    StorefrontSettingsResponse,
    'phoneDisplay' | 'phoneHref' | 'phoneEnabled' | 'aiAssistantEnabled'
  > &
    Partial<StorefrontSettingsResponse>;
};

export async function PageShell({
  children,
  locale: localeProp,
  contactSettings: contactSettingsProp,
}: PageShellProps) {
  const localeValue = localeProp ?? (await getLocale());
  const locale = isLocale(localeValue) ? localeValue : 'fr';
  const alternateLocale = locale === 'fr' ? 'ar' : 'fr';
  const t = await getTranslations({ locale, namespace: 'Navigation' });
  const assistant = await getTranslations({ locale, namespace: 'ShoppingAssistant' });
  const alternateLabel = alternateLocale === 'ar' ? 'العربية' : 'Français';
  const loadedContactSettings = contactSettingsProp
    ? contactSettingsProp
    : await getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse);
  const contactSettings = { ...defaultStorefrontSettingsResponse, ...loadedContactSettings };
  const storefrontContent = await getStorefrontContent(locale).catch(() => ({
    announcement: null,
  }));

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        {t('skip')}
      </a>
      {storefrontContent.announcement ? (
        <aside
          className="storefront-announcement"
          aria-label={storefrontContent.announcement.message}
        >
          <span>{storefrontContent.announcement.message}</span>
        </aside>
      ) : null}
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-header-primary">
            <a
              href={`/${locale}`}
              className="brand"
              aria-label={t('brandHome')}
              data-navigation-target="home"
            >
              <Image
                src={logo}
                alt="Bricomaitre"
                width={168}
                height={62}
                loading="eager"
                fetchPriority="high"
                sizes="(max-width: 600px) 112px, 144px"
              />
            </a>
            <div className="site-header-search">
              <GlobalSearch
                locale={locale}
                instanceId="header"
                labels={{
                  label: t('searchLabel'),
                  placeholder: t('searchPlaceholder'),
                  searching: t('searching'),
                  results: t('searchResults'),
                  noResults: t('noSearchResults'),
                  viewAll: t('viewAllProducts'),
                  inStock: t('inStock'),
                  outOfStock: t('outOfStock'),
                }}
              />
            </div>
            <NavigationActions
              locale={locale}
              alternateLocale={alternateLocale}
              alternateLabel={alternateLabel}
              categories={[]}
              labels={{
                menu: t('openMenu'),
                closeMenu: t('closeMenu'),
                cart: t('cart'),
                language: t('language'),
                home: t('home'),
                products: t('products'),
                offers: t('offers'),
                categories: t('categories'),
                brands: t('brands'),
                cartDrawer: {
                  title: t('cartTitle'),
                  close: t('cartClose'),
                  emptyTitle: t('cartEmptyTitle'),
                  emptyDescription: t('cartEmptyDescription'),
                  continueShopping: t('cartContinueShopping'),
                  subtotal: t('cartSubtotal'),
                  checkout: t('cartCheckout'),
                  quantity: t('cartQuantity'),
                  increase: t('cartIncrease'),
                  decrease: t('cartDecrease'),
                  remove: t('cartRemove'),
                },
                support: { title: t('drawerSupportTitle'), call: t('supportCall') },
              }}
              contact={contactSettings}
            />
          </div>
          <nav className="site-navigation" aria-label={t('label')}>
            <a href={`/${locale}`} data-navigation-target="home">
              {t('home')}
            </a>
            <a href={`/${locale}/products`} data-navigation-target="products">
              {t('products')}
            </a>
            <a href={`/${locale}/products?discounted=1`} data-navigation-target="offers">
              {t('offers')}
            </a>
            <NavigationCategories
              locale={locale}
              labels={{ categories: t('categories'), brands: t('brands') }}
            />
          </nav>
        </div>
      </header>
      <main id="main-content" className="site-main">
        {children}
      </main>
      <footer className="site-footer">
        <div className="site-footer-main">
          <div className="site-footer-brand">
            <a href={`/${locale}`} aria-label={t('brandHome')}>
              <Image
                src={logo}
                alt="Bricomaitre"
                width={168}
                height={62}
                sizes="128px"
                quality={60}
                loading="lazy"
              />
            </a>
            <p>{t('footerAbout')}</p>
          </div>
          <nav aria-labelledby="footer-browse-title">
            <h2 id="footer-browse-title">{t('footerBrowseTitle')}</h2>
            <a href={`/${locale}`}>{t('home')}</a>
            <a href={`/${locale}/products`}>{t('products')}</a>
            <a href={`/${locale}/checkout`}>{t('checkout')}</a>
          </nav>
          <section className="site-footer-contact" aria-labelledby="footer-contact-title">
            <h2 id="footer-contact-title">{t('footerContactTitle')}</h2>
            <ul>
              <li>
                <FooterContactLink icon="phone" href={contactSettings.phoneHref} direction="ltr">
                  {contactSettings.phoneDisplay}
                </FooterContactLink>
              </li>
              {contactSettings.contactEmail ? (
                <li>
                  <FooterContactLink icon="email" href={`mailto:${contactSettings.contactEmail}`}>
                    {contactSettings.contactEmail}
                  </FooterContactLink>
                </li>
              ) : null}
              {contactSettings.address ? (
                <li>
                  <FooterContactLink
                    icon="location"
                    href={contactSettings.mapUrl ?? '#'}
                    external={Boolean(contactSettings.mapUrl)}
                  >
                    {contactSettings.address}
                  </FooterContactLink>
                </li>
              ) : null}
              {contactSettings.facebookUrl ? (
                <li>
                  <FooterContactLink icon="external" href={contactSettings.facebookUrl} external>
                    Facebook
                  </FooterContactLink>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
        <div className="site-footer-bottom">
          <div aria-label={t('language')}>
            <Link href="/fr" hrefLang="fr" aria-current={locale === 'fr' ? 'page' : undefined}>
              FR
            </Link>
            <Link href="/ar" hrefLang="ar" aria-current={locale === 'ar' ? 'page' : undefined}>
              العربية
            </Link>
          </div>
        </div>
      </footer>
      {contactSettings.aiAssistantEnabled ? (
        <ShoppingAssistantLauncher
          locale={locale}
          labels={{
            open: assistant('open'),
            title: assistant('title'),
            close: assistant('close'),
            liveCatalog: assistant('liveCatalog'),
            newChat: assistant('newChat'),
            welcomeTitle: assistant('welcomeTitle'),
            welcomeDescription: assistant('welcomeDescription'),
            placeholder: assistant('placeholder'),
            send: assistant('send'),
            thinking: assistant('thinking'),
            error: assistant('error'),
            rateLimited: assistant('rateLimited'),
            fallback: assistant('fallback'),
            inStock: assistant('inStock'),
            outOfStock: assistant('outOfStock'),
            priceOnRequest: assistant('priceOnRequest'),
            viewProduct: assistant('viewProduct'),
            addToCart: assistant('addToCart'),
            addedToCart: assistant('addedToCart'),
            inputLabel: assistant('inputLabel'),
            quickPrompts: [
              assistant('quickPromptOne'),
              assistant('quickPromptTwo'),
              assistant('quickPromptThree'),
            ],
          }}
        />
      ) : null}
    </div>
  );
}
