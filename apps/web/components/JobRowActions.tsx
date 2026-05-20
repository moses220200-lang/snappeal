"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCw, XCircle } from "lucide-react";

export function JobRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"retry" | "cancel" | null>(null);

  const act = async (action: "retry" | "cancel") => {
    setBusy(action);
    try {
      await fetch(`/api/admin/jobs/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const canRetry = status === "failed" || status === "done";
  const canCancel = status === "queued" || status === "running";

  return (
    <span className="inline-flex items-center gap-2">
      {canRetry && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act("retry")}
          className="inline-flex items-center gap-1 text-snappeal-primary hover:text-snappeal-primary-700 font-semibold text-[11px] disabled:opacity-60"
        >
          {busy === "retry" ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
          Retry
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => act("cancel")}
          className="inline-flex items-center gap-1 text-red-700 hover:text-red-800 font-semibold text-[11px] disabled:opacity-60"
        >
          {busy === "cancel" ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
          Cancel
        </button>
      )}
    </span>
  );
}
