"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Camera, Home, MessageCircle, ReceiptText, User } from "lucide-react";
import {
  TICKETS_BUCKET,
  clearKinds,
  subscribe,
  unreadCountForKinds,
} from "@/lib/client/notifications";

type Tab = {
  href: string;
  label: string;
  icon: typeof Home;
  /** Which notification-kind set drives the badge above this tab.
   *  `null` = no counter. Tapping the tab clears the listed kinds. */
  counterKinds?: typeof TICKETS_BUCKET;
};

const TABS: readonly Tab[] = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/tickets", label: "Tickets", icon: ReceiptText, counterKinds: TICKETS_BUCKET },
  { href: "/app/support", label: "Support", icon: MessageCircle },
  { href: "/app/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const [ticketsCount, setTicketsCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setTicketsCount(unreadCountForKinds(TICKETS_BUCKET));
    };
    refresh();
    return subscribe(refresh);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/app/tickets")) clearKinds(TICKETS_BUCKET);
  }, [pathname]);

  const countFor = (tab: Tab): number => {
    if (!tab.counterKinds) return 0;
    if (tab.counterKinds === TICKETS_BUCKET) return ticketsCount;
    return 0;
  };

  return (
    <nav className="parkingrabbit-glass-nav fixed bottom-0 inset-x-0 z-40 safe-bottom">
      <div className="mx-auto max-w-md flex items-center justify-around px-2 py-1.5">
        {TABS.slice(0, 2).map((tab) => renderTab(tab))}
        {/* Centre camera button — navigates to /app/scan so the user
         *  always lands on the Scan page first and chooses Camera /
         *  Upload picture / Input manually. The old behaviour of
         *  auto-opening the file picker has been removed. */}
        <Link
          href="/app/scan"
          aria-label="Scan a new ticket"
          className="-mt-6 size-14 rounded-full bg-parkingrabbit-primary flex items-center justify-center shadow-[0_8px_24px_-4px_rgba(0,122,255,0.45)] ring-4 ring-white hover:bg-parkingrabbit-primary-600 transition active:scale-95"
        >
          <Camera className="size-6 text-white" strokeWidth={2.25} />
        </Link>
        {TABS.slice(2).map((tab) => renderTab(tab))}
      </div>
    </nav>
  );

  function renderTab(tab: Tab) {
    const { href, label, icon: Icon } = tab;
    const active =
      href === "/app"
        ? pathname === "/app"
        : pathname?.startsWith(href);
    const count = countFor(tab);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (tab.counterKinds) clearKinds(tab.counterKinds);
        }}
        className={`flex flex-col items-center gap-0.5 px-3 py-1 transition ${
          active
            ? "text-parkingrabbit-primary"
            : "text-parkingrabbit-muted hover:text-parkingrabbit-navy"
        }`}
      >
        <span className="relative inline-flex">
          <Icon className="size-5" strokeWidth={1.75} />
          {count > 0 && (
            <span
              aria-label={`${count} unread`}
              className="absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-parkingrabbit-action text-white text-[9px] font-bold shadow"
            >
              {count > 9 ? "9+" : count}
            </span>
          )}
        </span>
        <span className="text-[10px] font-semibold">{label}</span>
      </Link>
    );
  }
}
