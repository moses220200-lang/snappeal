import { Check } from "lucide-react";
import type { TimelineStep } from "@/lib/mock-data";
import { formatDate } from "@/lib/mock-data";

export function HorizontalTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative grid grid-flow-col auto-cols-fr items-start">
      {/* Connector line behind the dots */}
      <span
        aria-hidden
        className="absolute left-[10%] right-[10%] top-3 h-0.5 bg-snappeal-border"
      />

      {steps.map((s) => (
        <li
          key={s.id}
          className="relative flex flex-col items-center text-center px-1"
        >
          <span className="relative z-10 mb-2">
            {s.state === "completed" && (
              <span className="block size-6 rounded-full bg-snappeal-primary text-white flex items-center justify-center shadow-sm">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            )}
            {s.state === "in_progress" && (
              <span className="block size-6 rounded-full bg-snappeal-primary text-white ring-4 ring-snappeal-primary/25 relative">
                <span className="absolute inset-0 m-auto size-2 rounded-full bg-white" />
              </span>
            )}
            {s.state === "pending" && (
              <span className="block size-6 rounded-full bg-white border-2 border-snappeal-border" />
            )}
          </span>
          <p
            className={`text-[11px] font-semibold leading-tight ${
              s.state === "in_progress"
                ? "text-snappeal-primary"
                : "text-snappeal-navy"
            }`}
          >
            {s.label}
          </p>
          <p className="text-[10px] text-snappeal-muted mt-0.5 leading-tight">
            {s.state === "pending"
              ? "Pending"
              : formatDate(s.at) /* completed or in-progress show date */}
          </p>
        </li>
      ))}
    </ol>
  );
}
