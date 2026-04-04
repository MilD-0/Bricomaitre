"use client";

import { Link } from "@/i18n/navigation";

function PhoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path
        d="M5.25 4.75h3.1c.43 0 .81.29.92.71l.74 2.81a1 1 0 0 1-.28.99l-1.45 1.45a14.4 14.4 0 0 0 5.08 5.08l1.45-1.45a1 1 0 0 1 .99-.28l2.81.74c.42.11.71.49.71.92v3.1a1 1 0 0 1-.91 1c-1 .08-2.01.02-3-.16A15.5 15.5 0 0 1 4.41 8.66c-.18-.99-.24-2-.16-3a1 1 0 0 1 1-.91Z"
      />
    </svg>
  );
}

export default function PhoneBadge({ className = "" }) {
  return (
    <Link
      dir="ltr"
      href="tel:0795 34 28 26"
      className={`inline-flex items-center gap-2 rounded-full bg-[#22c55e] px-4 py-2 text-sm font-semibold text-emerald-50 shadow-sm transition-colors duration-200 hover:bg-[#16a34a] ${className}`.trim()}
      aria-label="Call 0795 34 28 26"
    >
      <PhoneIcon className="h-4 w-4" />
      <span className="whitespace-nowrap">0795 34 28 26</span>
    </Link>
  );
}
