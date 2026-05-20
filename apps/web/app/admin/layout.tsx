import Link from "next/link";
import { requireAdminPage } from "@/lib/server/admin";
import { AdminMobileNav } from "@/components/AdminMobileNav";

/**
 * Wiki page rendered inside the admin shell at /admin/wiki. The page
 * itself embeds the MkDocs build via iframe so admins never leave the
 * admin layout — full-bleed content with the same sidebar nav.
 */
const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/appeals", label: "Appeals" },
  { href: "/admin/councils", label: "Councils" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/inbound", label: "Inbound mail" },
  { href: "/admin/jobs", label: "Job queue" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/health", label: "System health" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/wiki", label: "Wiki" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  return (
    <div className="min-h-screen bg-snappeal-bg flex">
      <aside className="hidden md:flex w-64 flex-col bg-snappeal-navy text-white">
        <div className="px-6 py-6 border-b border-white/10">
          <Link href="/admin" className="flex items-center gap-2">
            <ShieldP />
            <div>
              <p className="text-base font-bold">Snappeal Admin</p>
              <p className="text-[11px] text-white/60">{user.email}</p>
            </div>
          </Link>
        </div>
        <nav className="flex-1 flex flex-col px-3 py-4 gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-xl px-3 py-2 text-sm text-white/85 hover:bg-white/10 hover:text-white transition"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-white/10 text-[11px] text-white/40">
          <Link href="/app" className="hover:text-white">
            ← Back to the app
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden bg-snappeal-navy text-white px-5 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <AdminMobileNav email={user.email} />
            <p className="text-base font-bold">Snappeal Admin</p>
          </div>
          <Link href="/app" className="text-xs text-white/70">
            ← App
          </Link>
        </header>
        {/* Inner content padding — gives every admin page consistent gutters
         *  against the sidebar (desktop) and viewport (mobile) so cards never
         *  press against the edge. */}
        <div className="flex-1 px-5 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-[1400px] w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

function ShieldP() {
  return (
    <svg width="32" height="36" viewBox="0 0 34 38" aria-hidden>
      <path
        d="M17 1.5 L31.5 6.5 V21 C31.5 29 25 35 17 36.5 C9 35 2.5 29 2.5 21 V6.5 Z"
        fill="#ffffff"
      />
      <text
        x="17"
        y="24"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="18"
        fontWeight={800}
        textAnchor="middle"
        fill="#0a1929"
        letterSpacing={-0.5}
      >
        P
      </text>
    </svg>
  );
}
