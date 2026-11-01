import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
  /** A button in the toast, e.g. "Undo"; the toast stays longer and closes when it is used. */
  action?: { label: string; run: () => void };
}

const Ctx = createContext<{ show: (t: Omit<ToastItem, "id">) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (t: Omit<ToastItem, "id">) => {
      const id = Date.now() + Math.random();
      setItems((l) => [...l.slice(-3), { ...t, id }]);
      setTimeout(() => dismiss(id), t.kind === "error" || t.action ? 8000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-96 flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-lg"
          >
            {t.kind === "error" ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            )}
            <span className="flex-1">{t.text}</span>
            {t.action ? (
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => {
                  dismiss(t.id);
                  t.action?.run();
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="text-fg-3 hover:text-fg"
              onClick={() => dismiss(t.id)}
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
