import { CheckCircle2, Circle, MessageCircle } from "lucide-react";

type TimelineState = "completed" | "in_progress" | "pending";
const STEPS: { label: string; state: TimelineState }[] = [
  { label: "Ticket Uploaded", state: "completed" },
  { label: "Information Collected", state: "completed" },
  { label: "Appeal Written", state: "in_progress" },
  { label: "Appeal Submitted", state: "pending" },
];

export function PhoneMockup() {
  return (
    <div className="relative w-[280px] sm:w-[320px] mx-auto">
      {/* Phone frame */}
      <div className="relative rounded-[40px] bg-parkingrabbit-navy p-2 shadow-2xl shadow-parkingrabbit-primary/30 ring-1 ring-parkingrabbit-navy">
        <div className="relative rounded-[32px] bg-white overflow-hidden h-[600px]">
          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-3 pb-2 text-parkingrabbit-navy">
            <span className="text-xs font-semibold">9:41</span>
            <div className="absolute left-1/2 top-1 -translate-x-1/2 h-6 w-24 rounded-full bg-parkingrabbit-navy" />
            <div className="flex items-center gap-1 text-[10px] font-medium">
              <span>●●●●</span>
              <span className="ml-1">📶</span>
              <span className="ml-1">🔋</span>
            </div>
          </div>

          {/* App content */}
          <div className="px-5 pt-3 pb-4 space-y-4">
            <div>
              <h3 className="text-xl font-bold text-parkingrabbit-navy">
                Hello, Alex 👋
              </h3>
              <p className="text-xs text-parkingrabbit-muted mt-0.5">
                Here&apos;s your appeal overview
              </p>
            </div>

            {/* In-progress card */}
            <div className="rounded-2xl bg-parkingrabbit-primary p-4 text-white">
              <p className="text-sm font-semibold">
                Your appeal is in progress
              </p>
              <p className="text-xs/relaxed text-white/85 mt-1">
                We&apos;re working on your case
              </p>
              <button className="mt-3 rounded-full bg-white text-parkingrabbit-primary text-xs font-semibold px-3.5 py-1.5">
                View My Case
              </button>
            </div>

            {/* Progress timeline */}
            <div>
              <p className="text-xs font-semibold text-parkingrabbit-navy mb-2">
                Your Progress
              </p>
              <ol className="space-y-2.5">
                {STEPS.map((s, i) => (
                  <li key={s.label} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex-shrink-0 relative">
                      {s.state === "completed" && (
                        <CheckCircle2
                          className="size-4 text-parkingrabbit-success"
                          strokeWidth={2.5}
                          fill="currentColor"
                          stroke="white"
                        />
                      )}
                      {s.state === "in_progress" && (
                        <span className="block size-4 rounded-full bg-parkingrabbit-primary ring-4 ring-parkingrabbit-primary-100 relative">
                          <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-white" />
                        </span>
                      )}
                      {s.state === "pending" && (
                        <Circle
                          className="size-4 text-slate-300"
                          strokeWidth={2}
                        />
                      )}
                      {i < STEPS.length - 1 && (
                        <span
                          className={`absolute left-1/2 -translate-x-1/2 top-4 w-0.5 h-3 ${
                            s.state === "completed"
                              ? "bg-parkingrabbit-success"
                              : s.state === "in_progress"
                                ? "bg-parkingrabbit-primary"
                                : "bg-slate-200"
                          }`}
                        />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[13px] font-semibold ${
                          s.state === "in_progress"
                            ? "text-parkingrabbit-primary"
                            : "text-parkingrabbit-navy"
                        }`}
                      >
                        {s.label}
                      </p>
                      <p className="text-[10px] text-parkingrabbit-muted">
                        {s.state === "completed"
                          ? "Completed"
                          : s.state === "in_progress"
                            ? "In Progress"
                            : "Pending"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Support card */}
            <div className="rounded-2xl bg-parkingrabbit-primary-50 p-3 flex items-start gap-3">
              <div className="flex-1">
                <p className="text-xs font-semibold text-parkingrabbit-navy">
                  Need help?
                </p>
                <p className="text-[11px] text-parkingrabbit-muted mt-0.5">
                  We&apos;re here if anything&apos;s unclear.
                </p>
                <button className="mt-2 rounded-full bg-white border border-parkingrabbit-border text-[11px] font-medium text-parkingrabbit-navy px-2.5 py-1">
                  Contact Support
                </button>
              </div>
              <MessageCircle className="size-5 text-parkingrabbit-primary mt-1" />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
