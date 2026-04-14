import { cn } from "@/lib/utils/cn";

export function PageWrapper({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto w-full max-w-[1600px] p-6", className)}>{children}</div>;
}
