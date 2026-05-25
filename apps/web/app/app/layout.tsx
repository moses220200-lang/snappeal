import { BottomNav } from "@/components/BottomNav";
import { NotificationWatcher } from "@/components/NotificationWatcher";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-snappeal-bg">
      <NotificationWatcher />
      <div className="mx-auto max-w-md min-h-screen bg-snappeal-bg snappeal-content-bottom">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
