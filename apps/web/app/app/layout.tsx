import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-snappeal-bg">
      {/* `safe-top` reserves space for the iOS status bar when the PWA
       * runs in standalone mode (display: standalone in the manifest).
       * `pb-28 + safe-bottom` reserves room for the floating Camera
       * button + the iPhone home-indicator + the curved bottom edge. */}
      <div className="mx-auto max-w-md min-h-screen bg-snappeal-bg safe-top pt-3 pb-28">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
