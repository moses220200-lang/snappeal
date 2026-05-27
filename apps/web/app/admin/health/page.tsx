/**
 * /admin/health — back-compat redirect.
 *
 * The system-health snapshot moved into `/admin/settings` (top section)
 * so there's ONE admin surface for operator concerns. This route exists
 * only to forward bookmarked URLs.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminHealthRedirect(): never {
  redirect("/admin/settings");
}
