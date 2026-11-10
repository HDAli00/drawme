import Link from "next/link";
import type { Profile } from "@/lib/types";
import { displayName, initials } from "@/lib/profile";
import { PenIcon } from "./Icons";
import { MainNav, UserMenu } from "./AppHeaderClient";

export default function AppHeader({ profile }: { profile: Profile }) {
  const isAdmin = profile.role === "admin";
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2.5"
          aria-label="drawme home"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
            <PenIcon className="size-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            drawme
          </span>
        </Link>

        <MainNav isAdmin={isAdmin} />

        <div className="ml-auto">
          <UserMenu
            name={displayName(profile)}
            email={profile.email}
            initials={initials(profile)}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </header>
  );
}
