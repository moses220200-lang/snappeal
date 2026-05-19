"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, FileText, Home, Lightbulb, User } from "lucide-react";

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  primary?: boolean;
};

const TABS: readonly Tab[] = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/tickets", label: "Tickets", icon: FileText },
  { href: "/app/capture", label: "Camera", icon: Camera, primary: true },
  { href: "/app/tips", label: "Tips", icon: Lightbulb },
  { href: "/app/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-snappeal-border bg-white/95 backdrop-blur safe-bottom">
      <div className="mx-auto max-w-md flex items-end justify-around px-2 pt-1.5 pb-2">
        {TABS.map(({ href, label, icon: Icon, primary }) => {
          const active =
            href === "/app"
              ? pathname === "/app"
              : pathname?.startsWith(href);
          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className="-mt-6 size-14 rounded-full bg-snappeal-primary flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(0,122,255,0.45)] ring-4 ring-white hover:bg-snappeal-primary-600 transition active:scale-95"
              >
                <Icon className="size-6 text-white" strokeWidth={2.25} />
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 ${
                active
                  ? "text-snappeal-primary"
                  : "text-snappeal-muted hover:text-snappeal-navy"
              }`}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
