import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useToastStore } from "@/store/toast-store";
import { cn } from "@/lib/utils";

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };
const TONE_CLASSES = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-brand-600 dark:text-brand-300",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            className="animate-in pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3 shadow-[var(--shadow-pop)]"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
            onClick={() => dismiss(toast.id)}
            role="status"
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONE_CLASSES[toast.tone])} />
            <p className="text-xs leading-5" style={{ color: "var(--text)" }}>
              {toast.message}
            </p>
          </div>
        );
      })}
    </div>
  );
}
