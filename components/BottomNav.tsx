"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const icon = (d: ReactNode) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-6 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const ITEMS = [
  { href: "/", label: "Início", icon: icon(<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />) },
  { href: "/contas", label: "Contas", icon: icon(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>) },
  { href: "/metas", label: "Metas", icon: icon(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>) },
  { href: "/ajustes", label: "Ajustes", icon: icon(<><path d="M5 7h9M18 7h1M5 17h1M10 17h9" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>) },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="sticky bottom-0 border-t border-line bg-surface px-2 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-brand" : "text-muted"}`}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
