"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronRight,
  Clapperboard,
  Film,
  LayoutDashboard,
  Library,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const workspaceNavItems: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Studio", href: "/", icon: LayoutDashboard },
  { label: "Series library", href: "/series", icon: Library },
];

const mobileNavItems: { label: string; href: string; icon: LucideIcon }[] = [
  ...workspaceNavItems,
  { label: "New production", href: "/series/new", icon: Plus },
];

function NavItem({
  label,
  href,
  icon: Icon,
  active,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4 transition-colors",
          active ? "text-primary" : "text-sidebar-foreground/50",
        )}
      />
      <span>{label}</span>
      {active ? (
        <span className="ml-auto size-1.5 rounded-full bg-primary" />
      ) : null}
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
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center gap-3" onClick={onNavigate}>
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary via-primary to-[oklch(0.65_0.18_32)] text-primary-foreground shadow-[0_10px_30px_-12px_oklch(0.81_0.16_78/0.8)]">
            <Clapperboard className="size-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">
              SeriesForge
            </span>
            <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              AI series studio
            </span>
          </span>
        </Link>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7"
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
            New production
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 pt-2 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Studio
        </p>
        {workspaceNavItems.map((item) => (
          <NavItem
            key={item.label}
            {...item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
          />
        ))}

        <div className="mt-6 rounded-xl border border-sidebar-border bg-gradient-to-br from-primary/[0.07] to-transparent p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-primary" />
            <p className="text-[11px] font-medium">How a series is made</p>
          </div>
          <ol className="mt-2.5 space-y-1.5 text-[11px] text-muted-foreground">
            {[
              "Paste your script",
              "Answer the gap questions",
              "Shape episodes & hooks",
              "Approve the storyboard",
              "Render and deliver",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-2">
                <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-sidebar-border font-mono text-[9px] text-primary/80">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <a
          href="http://127.0.0.1:8000/docs"
          target="_blank"
          rel="noreferrer"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <BookOpen className="size-4" />
          API docs
        </a>
        <div className="flex items-center gap-2 px-3 pb-1 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          Local studio · connected
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
    ? "New production"
    : isAllSeries
      ? "Series library"
      : isSeriesWorkspace
        ? "Production"
        : "Studio";

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    if (href === "/series") {
      return (
        pathname === "/series" ||
        (pathname.startsWith("/series/") && pathname !== "/series/new")
      );
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

        <div className="studio-canvas flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/70 backdrop-blur-xl">
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
                <Clapperboard className="size-4 text-primary" />
                <span className="text-sm font-semibold">SeriesForge</span>
              </Link>

              <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
                <Film className="size-3.5 text-primary/70" />
                <Link
                  href="/"
                  className="transition-colors hover:text-foreground"
                >
                  Studio
                </Link>
                <ChevronRight className="size-3" />
                <span className="text-foreground">{pageLabel}</span>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="hidden gap-1.5 border-emerald-500/30 text-[10px] text-emerald-300 sm:inline-flex"
                >
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  Local
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
                      ? "bg-primary/15 text-foreground"
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
