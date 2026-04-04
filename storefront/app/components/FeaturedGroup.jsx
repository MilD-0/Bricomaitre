"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Embla from "./Embla";
import { Skeleton } from "./ui";

function FeaturedGroupSkeleton() {
  return (
    <div className="sf-card overflow-hidden px-2 py-3">
      <div className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="h-[12rem] rounded-[1.5rem]" />
            <Skeleton className="h-4 w-5/6 mx-auto" />
            <Skeleton className="h-4 w-2/3 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FeaturedGroup({ title, groupId, cta, ctaAr, link, locale }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadGroup = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/homepage/featured-groups/${groupId}`, {
          cache: "force-cache",
        });

        if (!response.ok) {
          if (!cancelled) {
            setProducts([]);
          }
          return;
        }

        const group = await response.json();
        if (!cancelled) {
          setProducts(Array.isArray(group?.products) ? group.products : []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadGroup();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (!loading && !products.length) {
    return null;
  }

  const localizedCta = locale === "ar" ? (ctaAr || cta) : cta;
  const hasCta = Boolean(localizedCta && link);

  return (
    <section className="overflow-hidden">
      <div className="sf-container text-center">
        <h1 className="sf-title text-3xl lg:text-4xl">
          {title}
        </h1>
      </div>
      <div className="sf-container mt-6">
        {loading ? <FeaturedGroupSkeleton /> : (
          <div className="sf-card overflow-hidden px-2 py-3">
            <Embla products={products} />
          </div>
        )}
      </div>
      {hasCta ? (
        <div className="sf-container mt-4 flex justify-center">
          <Link
            href={link}
            className="sf-button min-w-[12rem] justify-center px-8 py-3 text-base md:min-w-[18rem]"
          >
            {localizedCta}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
