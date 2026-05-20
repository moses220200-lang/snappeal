import { Check } from "lucide-react";

type Step = {
  id: string;
  label: string;
  state: "completed" | "in_progress" | "pending";
  at: string | null;
};

function formatDate(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function HorizontalTimeline({
  steps,
  showDates = false,
}: {
  steps: Step[];
  showDates?: boolean;
}) {
  return (
    <ol
      className="grid gap-1 relative"
      style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}
    >
      {steps.map((s, i) => {
        const done = s.state === "completed";
        const active = s.state === "in_progress";
        const next = steps[i + 1];
        // Connector colour reflects the transition into the NEXT step:
        //  - green when this and next are both completed
        //  - blue when this is completed and next is in-progress (the
        //    "leading edge" of progress)
        //  - grey otherwise
        let connectorClass = "bg-slate-200";
        if (next) {
          if (done && next.state === "completed") connectorClass = "bg-snappeal-success";
          else if (done && next.state === "in_progress") connectorClass = "bg-snappeal-primary";
        }
        return (
          <li key={s.id} className="relative flex flex-col items-center text-center">
            <span
              className={`size-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                done
                  ? "bg-snappeal-success text-white"
                  : active
                    ? "bg-snappeal-primary text-white ring-4 ring-snappeal-primary-100"
                    : "bg-slate-100 text-slate-400 border border-slate-200"
              }`}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <p
              className={`mt-2 text-[11px] leading-tight ${
                done || active
                  ? "text-snappeal-navy font-semibold"
                  : "text-snappeal-muted"
              }`}
            >
              {s.label}
            </p>
            {showDates && (
              <p
                className={`mt-0.5 text-[10px] leading-tight ${
                  active ? "text-snappeal-primary font-semibold" : "text-snappeal-muted"
                }`}
              >
                {active ? "In progress" : s.at ? formatDate(s.at) : ""}
              </p>
            )}
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-3.5 left-[calc(50%+14px)] right-[calc(-50%+14px)] h-0.5 ${connectorClass}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
