// Server state. All data is local and small, so every change simply refetches everything,
// which keeps every view consistent with what is persisted.

import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useErrorText, useT } from "@/i18n";
import { useToast } from "@/ui/toast";
import type { EntityKind } from "./bindings/EntityKind";
import { ApiError, api } from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
  },
});

export function useAppInfo() {
  return useQuery({ queryKey: ["app"], queryFn: api.appInfo });
}

export function useTrips() {
  return useQuery({ queryKey: ["trips"], queryFn: api.listTrips });
}

export function useTripGraph(id: string | undefined) {
  return useQuery({ queryKey: ["trip", id], queryFn: () => api.getTrip(id as string), enabled: !!id });
}

/**
 * Runs a change against the core, refreshes all data afterwards and reports failures as a toast.
 * Resolves to the result, or `undefined` if the change failed (the toast already explained why).
 */
export function useAction() {
  const qc = useQueryClient();
  const toast = useToast();
  const errorText = useErrorText();
  const m = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSettled: () => qc.invalidateQueries(),
  });
  return useCallback(
    async <T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const result = (await m.mutateAsync(fn)) as T;
        if (success) toast.show({ kind: "success", text: success });
        return result;
      } catch (e) {
        toast.show({ kind: "error", text: errorText(e) });
        return undefined;
      }
    },
    [m, toast, errorText],
  );
}

/**
 * Deletes a row and offers to undo it in the confirmation toast. Resolves to whether the
 * deletion happened.
 */
export function useRemove() {
  const run = useAction();
  const toast = useToast();
  const t = useT();
  return useCallback(
    async (kind: EntityKind, keys: string[], text?: string): Promise<boolean> => {
      const undoId = await run(() => api.remove(kind, ...keys));
      if (undoId === undefined) return false;
      toast.show({
        kind: "success",
        text: text ?? t("common.deleted"),
        action: {
          label: t("common.undo"),
          run: () => void run(() => api.undoDelete(undoId), t("common.restored")),
        },
      });
      return true;
    },
    [run, toast, t],
  );
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
