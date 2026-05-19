"use client";

import { BackHeader } from "./BackHeader";

/**
 * Shared shell for /app/profile/* sub-pages — sticky glass back header
 * with the Profile route as the back target.
 */
export function ProfileSubPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <BackHeader title={title} subtitle={subtitle} back="/app/profile" />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">{children}</div>
    </>
  );
}
