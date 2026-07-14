'use client';

import { ArrowUpRight, AtSign, ExternalLink, MapPin, Phone } from 'lucide-react';
import type { ComponentType, ReactNode, Ref } from 'react';
import { useEffect, useRef, useState } from 'react';

type ContactIcon = 'phone' | 'email' | 'location' | 'external';
type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void };
type AnimatedIcon = ComponentType<{ size?: number; className?: string; ref?: Ref<AnimatedIconHandle> }>;

const iconLoaders: Record<ContactIcon, () => Promise<AnimatedIcon>> = {
  phone: () => import('@/components/ui/phone').then(({ PhoneIcon }) => PhoneIcon as AnimatedIcon),
  email: () => import('@/components/ui/at-sign').then(({ AtSignIcon }) => AtSignIcon as AnimatedIcon),
  location: () => import('@/components/ui/map-pin').then(({ MapPinIcon }) => MapPinIcon as AnimatedIcon),
  external: () => import('@/components/ui/arrow-up-right').then(({ ArrowUpRightIcon }) => ArrowUpRightIcon as AnimatedIcon),
};

const staticIcons = { phone: Phone, email: AtSign, location: MapPin, external: ArrowUpRight };

export function FooterContactLink({
  icon,
  href,
  children,
  external = false,
  direction,
}: {
  icon: ContactIcon;
  href: string;
  children: ReactNode;
  external?: boolean;
  direction?: 'ltr' | 'rtl';
}) {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const iconRef = useRef<AnimatedIconHandle>(null);
  const [AnimatedIcon, setAnimatedIcon] = useState<AnimatedIcon | null>(null);
  const StaticIcon = staticIcons[icon];

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    let active = true;
    const load = () => {
      void iconLoaders[icon]().then((Icon) => {
        if (active) setAnimatedIcon(() => Icon);
      });
    };
    if (typeof window.IntersectionObserver !== 'function') {
      load();
      return () => { active = false; };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: '160px' });
    observer.observe(anchor);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [icon]);

  function startAnimation() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    iconRef.current?.startAnimation();
  }

  function stopAnimation() {
    iconRef.current?.stopAnimation();
  }

  return (
    <a
      ref={anchorRef}
      className="site-footer-contact-link"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      dir={direction}
      onMouseEnter={startAnimation}
      onMouseLeave={stopAnimation}
      onFocus={startAnimation}
      onBlur={stopAnimation}
    >
      <span className="site-footer-contact-icon" aria-hidden="true">
        {AnimatedIcon ? <AnimatedIcon ref={iconRef} size={16} /> : <StaticIcon size={16} />}
      </span>
      <span>{children}</span>
      {external ? <ExternalLink className="site-footer-external-icon" aria-hidden="true" size={12} /> : null}
    </a>
  );
}
