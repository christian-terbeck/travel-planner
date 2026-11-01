// Update check against the GitHub releases: at start once a day when the user turned it on, or
// on request in the settings. The result is shared through the query cache.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { UpdateCheck } from "@/api/bindings/UpdateCheck";
import { api, inDesktopApp } from "@/api/client";
import { usePrefs } from "./prefs";

const CHECK_AFTER_MS = 24 * 3600_000;
export const UPDATE_KEY = ["update"] as const;

export function useUpdateCheckAtStart() {
  const { ready, updates } = usePrefs();
  const qc = useQueryClient();
  const tried = useRef(false);
  useEffect(() => {
    if (!inDesktopApp || !ready || !updates.enabled || tried.current) return;
    const last = updates.checkedAt ? Date.parse(updates.checkedAt) : 0;
    if (Date.now() - last < CHECK_AFTER_MS) return;
    tried.current = true;
    // Offline is normal: a failed check waits for the next start.
    void api.checkUpdate().then(
      (r) => qc.setQueryData(UPDATE_KEY, r),
      () => undefined,
    );
  }, [ready, updates.enabled, updates.checkedAt, qc]);
}

/** The latest known check result (none until a check ran in this session). */
export function useUpdateResult(): UpdateCheck | undefined {
  return useQuery<UpdateCheck>({ queryKey: UPDATE_KEY, queryFn: api.checkUpdate, enabled: false }).data;
}

/** A newer version the user has not chosen to skip. */
export function availableUpdate(result: UpdateCheck | undefined, skipped: string | null) {
  const latest = result?.newer ? result.latest : null;
  return latest && latest.version !== skipped ? latest : null;
}
