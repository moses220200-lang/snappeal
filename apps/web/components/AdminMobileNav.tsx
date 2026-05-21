"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/appeals", label: "Appeals" },
  { href: "/admin/councils", label: "Councils" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/inbound", label: "Inbound mail" },
  { href: "/admin/jobs", label: "Job queue" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/health", label: "System health" },
  { href: "/admin/wiki", label: "Wiki" },
];

/**
 * Mobile-only hamburger + drawer for the admin nav. The desktop sidebar
 * (in app/admin/layout.tsx) renders side-by-side on md+. This component
 * shows up only on small viewports.
 */
export function AdminMobileNav({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        type="button"
        aria-label="Open admin menu"
        onClick={() => setOpen(true)}
        className="md:hidden size-9 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/15 transition"
      >
        <Menu className="size-5" />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-snappeal-navy text-white flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-base font-bold">ParkingRabbit Admin</p>
                <p className="text-[11px] text-white/60">{email}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="size-8 rounded-full bg-white/10 text-white flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col px-3 py-4 gap-1">
              {NAV.map((n) => {
                const active = n.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={`rounded-xl px-3 py-2.5 text-sm transition ${
                      active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-5 py-4 border-t border-white/10 text-xs">
              <Link href="/app" className="text-white/60 hover:text-white">
                ← Back to the app
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
