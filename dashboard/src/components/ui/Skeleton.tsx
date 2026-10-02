import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse-slow rounded-md bg-[var(--bg-sunken)]", className)}
    />
  );
}
