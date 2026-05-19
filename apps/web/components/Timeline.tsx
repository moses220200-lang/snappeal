import { CheckCircle2, Circle } from "lucide-react";

type Step = {
  id: string;
  label: string;
  state: "completed" | "in_progress" | "pending";
  at: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-start gap-3 relative">
          <span className="flex-shrink-0 relative pt-0.5">
            {s.state === "completed" && (
              <CheckCircle2
                className="size-5 text-snappeal-success"
                strokeWidth={2.5}
                fill="currentColor"
                stroke="white"
              />
            )}
            {s.state === "in_progress" && (
              <span className="block size-5 rounded-full bg-snappeal-primary ring-4 ring-snappeal-primary-100 relative">
                <span className="absolute inset-0 m-auto size-2 rounded-full bg-white" />
              </span>
            )}
            {s.state === "pending" && (
              <Circle className="size-5 text-slate-300" strokeWidth={2} />
            )}
            {i < steps.length - 1 && (
              <span
                className={`absolute left-1/2 -translate-x-1/2 top-6 w-0.5 h-5 ${
                  s.state === "completed"
                    ? "bg-snappeal-success"
                    : s.state === "in_progress"
                      ? "bg-snappeal-primary"
                      : "bg-slate-200"
                }`}
              />
            )}
          </span>
          <div className="flex-1 min-w-0 pb-1">
            <p
              className={`text-sm font-semibold ${
                s.state === "in_progress"
                  ? "text-snappeal-primary"
                  : "text-snappeal-navy"
              }`}
            >
              {s.label}
            </p>
            <p className="text-xs text-snappeal-muted">
              {s.state === "completed"
                ? `Completed · ${formatDate(s.at)}`
                : s.state === "in_progress"
                  ? `In progress · started ${formatDate(s.at)}`
                  : "Pending"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
