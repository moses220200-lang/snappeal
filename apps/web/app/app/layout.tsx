import { BottomNav } from "@/components/BottomNav";
import { WizardOnboarding } from "@/components/WizardOnboarding";

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
      {/* The AppHeader is sticky and provides its own safe-area-inset
       * padding (so it never collides with the status bar). The outer
       * wrapper reserves space for the floating bottom nav — tuned to
       * the nav's actual height (~64px on most devices) plus the iOS
       * home-indicator safe inset. */}
      <div className="mx-auto max-w-md min-h-screen bg-snappeal-bg snappeal-content-bottom">
        {children}
      </div>
      <BottomNav />
      <WizardOnboarding />
    </div>
  );
}
