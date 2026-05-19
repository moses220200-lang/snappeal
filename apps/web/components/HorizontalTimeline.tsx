import { Check } from "lucide-react";

type Step = {
  id: string;
  label: string;
  state: "completed" | "in_progress" | "pending";
  at: string | null;
};

export function HorizontalTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid gap-1 relative" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
      {steps.map((s, i) => {
        const done = s.state === "completed";
        const active = s.state === "in_progress";
        return (
          <li key={s.id} className="relative flex flex-col items-center text-center">
            <span
              className={`size-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                done
                  ? "bg-snappeal-success text-white"
                  : active
                    ? "bg-snappeal-primary text-white ring-4 ring-snappeal-primary-100"
                    : "bg-slate-200 text-slate-500"
              }`}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <p
              className={`mt-1 text-[10px] leading-tight ${
                done || active
                  ? "text-snappeal-navy font-semibold"
                  : "text-snappeal-muted"
              }`}
            >
              {s.label}
            </p>
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-3 left-[calc(50%+12px)] right-[calc(-50%+12px)] h-0.5 ${
                  done ? "bg-snappeal-success" : "bg-slate-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
