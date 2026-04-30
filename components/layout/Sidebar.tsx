"use client";

import {
  Bot,
  Brain,
  ChevronLeft,
  MessageSquare,
  Network,
  Settings,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

const NAV_ITEMS = [
  { href: "/", icon: Brain, label: "Consciousness" },
  { href: "/mind", icon: Network, label: "Mind" },
  { href: "/evolution", icon: TrendingUp, label: "Evolution" },
  { href: "/warroom", icon: Bot, label: "War Room" },
  { href: "/chat", icon: MessageSquare, label: "Direct Link" },
  { href: "/admin", icon: Settings, label: "Control" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        className={cn(
          "flex h-[calc(100vh-3rem)] flex-col border-r border-border bg-surface px-3 py-4 transition-all",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="mb-4 flex h-9 items-center justify-center rounded-lg border border-border bg-surface2 text-textSecondary transition hover:text-textPrimary"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
        <nav className="space-y-2">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            const link = (
              <Link
                href={href}
                className={cn(
                  "flex h-11 items-center rounded-lg border-l-2 px-3 text-sm transition",
                  collapsed ? "justify-center px-0" : "gap-3",
                  active
                    ? "border-primary bg-primaryGlow text-textPrimary shadow-glow"
                    : "border-transparent text-textSecondary hover:bg-surface2 hover:text-textPrimary",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                {!collapsed ? <span>{label}</span> : null}
              </Link>
            );

            if (!collapsed) {
              return <div key={href}>{link}</div>;
            }

            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
