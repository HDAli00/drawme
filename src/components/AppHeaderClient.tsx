"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDownIcon,
  GridIcon,
  LogOutIcon,
  PlugIcon,
  SettingsIcon,
  ShapesIcon,
  ShieldIcon,
} from "./Icons";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  match: (path: string) => boolean;
};

function navItems(isAdmin: boolean): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Workspace",
      icon: GridIcon,
      match: (p) => p.startsWith("/dashboard"),
    },
    {
      href: "/libraries",
      label: "Libraries",
      icon: ShapesIcon,
      match: (p) => p.startsWith("/libraries"),
    },
    {
      href: "/settings",
      label: "Settings",
      icon: SettingsIcon,
      match: (p) => p.startsWith("/settings"),
    },
  ];
  if (isAdmin) {
    items.push({
      href: "/admin",
      label: "Admin",
      icon: ShieldIcon,
      match: (p) => p.startsWith("/admin"),
    });
  }
  return items;
}

export function MainNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";
  return (
    <nav className="hidden h-full items-stretch gap-1 md:flex" aria-label="Main">
      {navItems(isAdmin).map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-2 px-3 text-sm font-medium transition-colors ${
              active ? "text-slate-900" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <Icon className="size-4" />
            {item.label}
            <span
              className={`absolute inset-x-3 -bottom-px h-0.5 rounded-full ${
                active ? "bg-indigo-600" : "bg-transparent"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}

export function UserMenu({
  name,
  email,
  initials,
  isAdmin,
}: {
  name: string;
  email: string;
  initials: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on navigation, outside click and Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-3 rounded-full py-1 pr-2 pl-1 transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none sm:rounded-lg sm:pr-3"
      >
        <Avatar initials={initials} />
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block max-w-40 truncate text-sm font-medium text-slate-900">
            {name}
          </span>
          <span className="block max-w-40 truncate text-xs text-slate-500">
            {isAdmin ? "Administrator" : "Member"}
          </span>
        </span>
        <ChevronDownIcon
          className={`hidden size-4 text-slate-400 transition sm:block ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <Avatar initials={initials} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {name}
              </p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
          </div>

          {/* On small screens the main nav lives here. */}
          <div className="border-b border-slate-100 py-1 md:hidden">
            {navItems(isAdmin).map((item) => (
              <MenuLink key={item.href} href={item.href} icon={item.icon}>
                {item.label}
              </MenuLink>
            ))}
          </div>

          <div className="py-1">
            <MenuLink href="/settings#profile" icon={SettingsIcon} desktopOnly>
              Account settings
            </MenuLink>
            <MenuLink href="/settings#mcp" icon={PlugIcon}>
              MCP access
            </MenuLink>
            <MenuLink href="/libraries" icon={ShapesIcon} desktopOnly>
              Shape libraries
            </MenuLink>
          </div>

          <form
            action="/auth/signout"
            method="post"
            className="border-t border-slate-100 py-1"
          >
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-red-50 hover:text-red-700"
            >
              <LogOutIcon className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  desktopOnly,
  children,
}: {
  href: string;
  icon: (p: { className?: string }) => React.ReactNode;
  // Hidden on small screens, where the same page is already listed above.
  desktopOnly?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className={`${desktopOnly ? "hidden md:flex" : "flex"} items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900`}
    >
      <Icon className="size-4 text-slate-400" />
      {children}
    </Link>
  );
}

export function Avatar({
  initials,
  size = "md",
}: {
  initials: string;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 font-semibold text-white ring-2 ring-white ${
        size === "lg" ? "size-10 text-sm" : "size-8 text-xs"
      }`}
    >
      {initials}
    </span>
  );
}
