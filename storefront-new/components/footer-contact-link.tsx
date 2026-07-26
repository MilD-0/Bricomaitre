import { ArrowUpRight, AtSign, ExternalLink, MapPin, Phone } from 'lucide-react';
import type { ReactNode } from 'react';

type ContactIcon = 'phone' | 'email' | 'location' | 'external';

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
  const Icon = staticIcons[icon];

  return (
    <a
      className="site-footer-contact-link"
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      dir={direction}
      data-contact-icon={icon}
    >
      <span className="site-footer-contact-icon" aria-hidden="true">
        <div><Icon size={16} /></div>
      </span>
      <span>{children}</span>
      {external ? <ExternalLink className="site-footer-external-icon" aria-hidden="true" size={12} /> : null}
    </a>
  );
}
