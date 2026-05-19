import Link from "next/link";
import {
  Camera,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Keyboard,
} from "lucide-react";

const METHODS = [
  {
    id: "scan",
    href: "/app/notes?from=scan",
    icon: Camera,
    title: "Scan Ticket",
    body: "Use your camera to scan the PCN. Fastest path.",
    primary: true,
  },
  {
    id: "upload",
    href: "/app/notes?from=upload",
    icon: ImageIcon,
    title: "Upload Photos",
    body: "Pick a photo of the PCN from your library.",
  },
  {
    id: "manual",
    href: "/app/notes?from=manual",
    icon: Keyboard,
    title: "Enter PCN",
    body: "Type the PCN reference and details by hand.",
  },
];

export default function CapturePage() {
  return (
    <div className="flex flex-col gap-5 pt-6 px-5">
      <header className="flex items-center gap-3">
        <Link
          href="/app"
          aria-label="Back"
          className="size-9 rounded-full border border-snappeal-border flex items-center justify-center text-snappeal-muted hover:text-snappeal-navy"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-bold text-snappeal-navy">
          Add your parking ticket
        </h1>
      </header>

      <p className="text-sm text-snappeal-muted">
        Pick the way that&apos;s easiest. We&apos;ll guide you from here.
      </p>

      <div className="flex flex-col gap-3">
        {METHODS.map(({ id, href, icon: Icon, title, body, primary }) => (
          <Link
            key={id}
            href={href}
            className={`rounded-2xl border p-4 flex items-start gap-4 transition ${
              primary
                ? "bg-snappeal-primary border-snappeal-primary text-white hover:bg-snappeal-primary-600"
                : "bg-white border-snappeal-border hover:border-snappeal-primary"
            }`}
          >
            <span
              className={`size-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                primary
                  ? "bg-white/20 text-white"
                  : "bg-snappeal-primary-100 text-snappeal-primary"
              }`}
            >
              <Icon className="size-6" />
            </span>
            <div className="flex-1">
              <p
                className={`text-base font-bold ${primary ? "text-white" : "text-snappeal-navy"}`}
              >
                {title}
              </p>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  primary ? "text-white/85" : "text-snappeal-muted"
                }`}
              >
                {body}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-snappeal-border p-4 flex items-start gap-3">
        <span className="size-9 rounded-full bg-snappeal-primary-100 text-snappeal-primary flex items-center justify-center flex-shrink-0">
          <FileText className="size-[1.125rem]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-snappeal-navy">
            What we read from the photo
          </p>
          <p className="text-xs text-snappeal-muted mt-0.5 leading-relaxed">
            Issuer · PCN reference · vehicle reg · contravention code ·
            location · date · amount. You&apos;ll review everything before we
            draft your letter.
          </p>
        </div>
      </div>
    </div>
  );
}
