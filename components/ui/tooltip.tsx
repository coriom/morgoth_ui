"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = ({
  className,
  sideOffset = 8,
  ...props
}: TooltipPrimitive.TooltipContentProps) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      sideOffset={sideOffset}
      className={cn("z-50 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-textPrimary shadow-lg", className)}
      {...props}
    />
  </TooltipPrimitive.Portal>
);
