// Server state. All data is local and small, so every change simply refetches everything,
// which keeps every view consistent with what is persisted.

import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useErrorText } from "@/i18n";
import { useToast } from "@/ui/toast";
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

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}
