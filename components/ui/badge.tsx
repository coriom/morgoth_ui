import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        default: "bg-surface2 text-textSecondary",
        running: "bg-action/20 text-action",
        idle: "bg-surface2 text-textSecondary",
        failed: "bg-error/20 text-error",
        paused: "bg-system/20 text-system",
        success: "bg-result/20 text-result",
        warning: "bg-system/20 text-system",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
