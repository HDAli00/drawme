import Link from "next/link";
import type { Profile } from "@/lib/types";

export default function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          drawme
        </Link>
        <nav className="flex items-center gap-4 text-sm text-zinc-600">
          <Link href="/dashboard" className="hover:text-zinc-900">
            Drawings
          </Link>
          <Link href="/libraries" className="hover:text-zinc-900">
            Libraries
          </Link>
          {profile.role === "admin" && (
            <Link href="/admin" className="hover:text-zinc-900">
              Admin
            </Link>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-500">
          {profile.display_name || profile.email}
          {profile.role === "admin" && (
            <span className="ml-1 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
              admin
            </span>
          )}
        </span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
