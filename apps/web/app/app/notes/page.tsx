import { redirect } from "next/navigation";

/**
 * `/app/notes` has been merged into `/app/evidence` — the new combined
 * page shows portal-confirmed metadata + the grounds quiz + evidence
 * upload + the optional-notes textarea in one screen. This redirect
 * keeps any old bookmarks / Continue buttons working.
 */
export default function NotesRedirect(): never {
  redirect("/app/evidence");
}
