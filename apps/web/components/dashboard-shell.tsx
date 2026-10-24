"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  ChevronRight,
  Clapperboard,
  LayoutDashboard,
  Library,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const workspaceNavItems: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "All series", href: "/series", icon: Library },
];

const mobileNavItems: { label: string; href: string; icon: LucideIcon }[] = [
  ...workspaceNavItems,
  { label: "New series", href: "/series/new", icon: Plus },
];

const secondaryNav: {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
}[] = [
  {
    label: "API docs",
    href: "http://127.0.0.1:8000/docs",
    icon: BookOpen,
    external: true,
  },
];

function NavItem({
  label,
  href,
  icon: Icon,
  active,
  external,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  external?: boolean;
  onNavigate?: () => void;
}) {
  const className = cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
  );

  const content = (
    <>
      <Icon className="size-4" />
      <span>{label}</span>
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={onNavigate}
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onNavigate}>
      {content}
    </Link>
  );
}

function SidebarContent({
  isActive,
  onNavigate,
  onClose,
}: {
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-5">
        <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
          <Clapperboard className="size-4" />
          <span className="text-sm font-semibold tracking-tight">
            SeriesForge
          </span>
        </Link>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          Local
        </Badge>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 size-7"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="p-3">
        <Button className="w-full justify-start" asChild>
          <Link href="/series/new" onClick={onNavigate}>
            <Plus className="size-4" />
            New series
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-2 pb-2 pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {workspaceNavItems.map((item) => (
          <NavItem
            key={item.label}
            {...item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
          />
        ))}
        <p className="px-2 pb-2 pt-6 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          System
        </p>
        {secondaryNav.map((item) => (
          <NavItem
            key={item.label}
            {...item}
            active={false}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-lg border bg-background/60 p-3">
          <div className="flex items-center gap-2">
            <Clapperboard className="size-4 text-muted-foreground" />
            <p className="text-xs font-medium">Credits</p>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              —
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Usage appears after your first render.
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-secondary">
            <Users className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">Workspace</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Local preview
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7"
            aria-label="Account menu"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isNewSeries = pathname === "/series/new";
  const isAllSeries = pathname === "/series";
  const isSeriesWorkspace = pathname.startsWith("/series/") && !isNewSeries;
  const pageLabel = isNewSeries
    ? "New series"
    : isAllSeries
      ? "All series"
      : isSeriesWorkspace
        ? "Series workspace"
        : "Overview";

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    if (href === "/series") {
      return pathname === "/series";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
            isCollapsed ? "w-0 border-r-0" : "w-64",
          )}
        >
          <div className="flex h-full w-64 shrink-0 flex-col overflow-y-auto">
            <SidebarContent isActive={isActive} />
          </div>
        </aside>

        {isMobileOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen(false)}
              aria-label="Close sidebar"
            />
            <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar lg:hidden">
              <SidebarContent
                isActive={isActive}
                onNavigate={() => setIsMobileOpen(false)}
                onClose={() => setIsMobileOpen(false)}
              />
            </aside>
          </>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
            <div className="flex h-14 items-center gap-3 px-4 md:px-6">
              <Button
                variant="ghost"
                size="icon"
                className="size-8 lg:hidden"
                onClick={() => setIsMobileOpen(true)}
                aria-label="Open sidebar"
              >
                <Menu className="size-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="hidden size-8 lg:inline-flex"
                onClick={() => setIsCollapsed((value) => !value)}
                aria-label={
                  isCollapsed ? "Expand sidebar" : "Collapse sidebar"
                }
              >
                {isCollapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </Button>

              <Link href="/" className="flex items-center gap-2 lg:hidden">
                <Clapperboard className="size-4" />
                <span className="text-sm font-semibold">SeriesForge</span>
              </Link>

              <div className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
                <Link
                  href="/"
                  className="transition-colors hover:text-foreground"
                >
                  Workspace
                </Link>
                <ChevronRight className="size-3.5" />
                <span className="text-foreground">{pageLabel}</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="relative hidden md:block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search series..."
                    className="h-8 w-52 pl-8 text-xs"
                  />
                </div>
                <Badge
                  variant="outline"
                  className="hidden text-[10px] sm:inline-flex"
                >
                  Local API
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  asChild
                >
                  <a
                    href="http://127.0.0.1:8000/docs"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="API docs"
                  >
                    <BookOpen className="size-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Notifications"
                >
                  <Bell className="size-4" />
                </Button>
                <div className="flex size-8 items-center justify-center rounded-full bg-secondary lg:hidden">
                  <Users className="size-4 text-muted-foreground" />
                </div>
              </div>
            </div>

            <nav className="flex gap-1 overflow-x-auto border-t px-3 py-2 lg:hidden">
              {mobileNavItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
                    isActive(item.href)
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
