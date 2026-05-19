import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-snappeal-bg">
      <div className="mx-auto max-w-md min-h-screen pb-24 bg-snappeal-bg">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
