// Keeps the ECB reference rates current when the user enabled them: fetched at start when the
// last fetch is older than half a day (the ECB publishes once per working day).

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api, inDesktopApp } from "@/api/client";
import { usePrefs } from "./prefs";

const REFRESH_AFTER_MS = 12 * 3600_000;

export function useReferenceRateRefresh() {
  const { ready, ecbRates, ecbFetchedAt } = usePrefs();
  const qc = useQueryClient();
  const tried = useRef(false);
  useEffect(() => {
    if (!inDesktopApp || !ready || !ecbRates || tried.current) return;
    const last = ecbFetchedAt ? Date.parse(ecbFetchedAt) : 0;
    if (Date.now() - last < REFRESH_AFTER_MS) return;
    tried.current = true;
    // Offline is normal for this app: a failed refresh waits for the next start or a manual fetch.
    void api.fetchReferenceRates().then(
      () => qc.invalidateQueries(),
      () => undefined,
    );
  }, [ready, ecbRates, ecbFetchedAt, qc]);
}
