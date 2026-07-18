import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type SkeletonProps = ComponentPropsWithoutRef<'span'>;

/** A layout-reserving, decorative placeholder for data that is still streaming. */
export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return <span aria-hidden="true" {...props} className={`storefront-skeleton ${className}`.trim()} />;
}

function SkeletonShell({ children, page }: { children: ReactNode; page: string }) {
  return (
    <div className="site-shell storefront-skeleton-shell" data-skeleton-page={page} aria-busy="true">
      <header className="storefront-skeleton-header"><Skeleton /><Skeleton /><Skeleton /></header>
      <main id="main-content" className="site-main">{children}</main>
      <footer className="storefront-skeleton-footer"><Skeleton /><Skeleton /><Skeleton /></footer>
    </div>
  );
}

export function CatalogCardSkeleton() {
  return (
    <article className="catalog-card catalog-card-skeleton" aria-hidden="true">
      <Skeleton className="catalog-card-skeleton-media" />
      <div className="catalog-card-skeleton-body"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>
    </article>
  );
}

export function HomePageSkeleton() {
  return (
    <SkeletonShell page="home">
      <div className="home-page home-page-skeleton">
        <Skeleton className="home-skeleton-banner" />
        <div className="home-skeleton-trust"><Skeleton /><Skeleton /><Skeleton /></div>
        {[0, 1, 2].map((section) => (
          <section className="home-skeleton-section" key={section}>
            <Skeleton className="home-skeleton-heading" />
            <div className="home-skeleton-cards">{Array.from({ length: 4 }, (_, index) => <CatalogCardSkeleton key={index} />)}</div>
          </section>
        ))}
      </div>
    </SkeletonShell>
  );
}

export function CatalogPageSkeleton() {
  return (
    <SkeletonShell page="catalog">
      <div className="catalog-loading" aria-hidden="true">
        <div><Skeleton /><Skeleton /></div>
        <div className="catalog-skeleton-layout">
          <aside><Skeleton /><Skeleton /><Skeleton /><Skeleton /></aside>
          <section><div className="catalog-skeleton-toolbar"><Skeleton /><Skeleton /></div><div className="catalog-grid">{Array.from({ length: 8 }, (_, index) => <CatalogCardSkeleton key={index} />)}</div></section>
        </div>
      </div>
    </SkeletonShell>
  );
}

export function ProductPageSkeleton() {
  return (
    <SkeletonShell page="product">
      <div className="product-page-loading" aria-hidden="true">
        <Skeleton className="product-skeleton-breadcrumbs" />
        <div className="product-skeleton-layout"><Skeleton className="product-skeleton-media" /><section className="product-skeleton-summary"><Skeleton /><Skeleton /><Skeleton /><Skeleton /><Skeleton /></section></div>
        <section className="product-skeleton-similar"><Skeleton /><div className="catalog-grid">{Array.from({ length: 4 }, (_, index) => <CatalogCardSkeleton key={index} />)}</div></section>
      </div>
    </SkeletonShell>
  );
}

export function LandingPageSkeleton() {
  return (
    <SkeletonShell page="landing">
      <div className="landing-page" aria-hidden="true">
        <div className="landing-hero">
          <Skeleton className="landing-hero-media" />
          <div className="landing-hero-copy">
            <Skeleton style={{ height: '0.8rem', width: '7rem' }} />
            <Skeleton style={{ height: '4rem', marginTop: '1rem' }} />
            <Skeleton style={{ height: '1rem', marginTop: '1rem' }} />
            <Skeleton style={{ height: '3.2rem', marginTop: '1.5rem' }} />
          </div>
        </div>
      </div>
    </SkeletonShell>
  );
}

export function CheckoutPageSkeleton() {
  return (
    <SkeletonShell page="checkout">
      <CheckoutContentSkeleton />
    </SkeletonShell>
  );
}

export function ThankYouPageSkeleton() {
  return (
    <SkeletonShell page="thank-you">
      <ThankYouContentSkeleton />
    </SkeletonShell>
  );
}

export function CheckoutContentSkeleton() {
  return <div className="checkout-page checkout-page-skeleton" aria-busy="true" aria-label="Loading checkout"><Skeleton className="checkout-skeleton-heading" /><div className="checkout-layout"><section className="checkout-form-panel">{Array.from({ length: 7 }, (_, index) => <Skeleton key={index} className="checkout-skeleton-field" />)}</section><aside className="checkout-summary"><Skeleton /><Skeleton /><Skeleton /><Skeleton /><Skeleton /></aside></div></div>;
}

export function ThankYouContentSkeleton() {
  return <div className="thank-you-page thank-you-page-skeleton" aria-busy="true" aria-label="Loading order confirmation"><section className="thank-you-skeleton-hero"><Skeleton /><div><Skeleton /><Skeleton /><Skeleton /></div></section><div className="thank-you-grid"><section><Skeleton /><Skeleton /><Skeleton /><Skeleton /></section><section><Skeleton /><Skeleton /><Skeleton /></section></div></div>;
}

export function SimilarProductsSkeleton() {
  return <section className="similar-products similar-products-skeleton" aria-hidden="true"><Skeleton /><div className="catalog-grid similar-products-grid">{Array.from({ length: 4 }, (_, index) => <CatalogCardSkeleton key={index} />)}</div></section>;
}

export function SearchResultsSkeleton() {
  return <ul className="global-search-skeleton" aria-hidden="true">{Array.from({ length: 3 }, (_, index) => <li key={index}><Skeleton /><div><Skeleton /><Skeleton /></div><Skeleton /></li>)}</ul>;
}
