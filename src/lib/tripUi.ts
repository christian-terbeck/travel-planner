// Per-trip UI context that survives switching between the workspace views: the selected item
// and the scenario previewed in the calendar.

import { useCallback, useSyncExternalStore } from "react";

export interface TripUiState {
  selectedOptionId: string | null;
  /** Scenario shown as a preview in the itinerary instead of the current plan. */
  previewScenarioId: string | null;
}

const empty: TripUiState = { selectedOptionId: null, previewScenarioId: null };
const states = new Map<string, TripUiState>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Updates a trip's UI context, also from outside the trip (e.g. the global calendar). */
export function setTripUi(tripId: string, patch: Partial<TripUiState>) {
  states.set(tripId, { ...(states.get(tripId) ?? empty), ...patch });
  emit();
}

export function useTripUi(tripId: string) {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => states.get(tripId) ?? empty,
  );
  const update = useCallback((patch: Partial<TripUiState>) => setTripUi(tripId, patch), [tripId]);
  return [state, update] as const;
}
