import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api, inDesktopApp } from "@/api/client";
import { applyRoads, buildRoute, type Route, roadQueries } from "@/domain/geo";
import { evaluate, scenarioSelection } from "@/domain/scenarios";
import { useAirports } from "@/lib/airports";
import type { TripModel } from "@/lib/model";
import { usePrefs } from "@/lib/prefs";

/** The plan's route (or a previewed scenario's), with airports from the offline list. */
function useBaseRoute(m: TripModel, previewScenarioId?: string | null): Route | null {
  const airports = useAirports();
  return useMemo(() => {
    if (!airports) return null;
    let items = m.plan.items;
    if (previewScenarioId && m.graph.scenarios.some((s) => s.id === previewScenarioId)) {
      const sel = scenarioSelection(m.graph, previewScenarioId);
      for (const i of m.ctx.items.values()) if (i.activeBookings.length > 0) sel.set(i.slot.id, i.option.id);
      items = evaluate(m.ctx, sel).items;
    }
    return buildRoute(items, (c) => airports.get(c) ?? null, m.tz);
  }, [airports, m, previewScenarioId]);
}

/** Road routes for the ground legs, when the user turned on the online route service. */
function useRoads(route: Route | null) {
  const { routing } = usePrefs();
  const queries = useMemo(() => (route ? roadQueries(route) : []), [route]);
  const enabled = routing.enabled && inDesktopApp && queries.length > 0;
  const q = useQuery({
    queryKey: ["roads", routing.url, queries],
    queryFn: () => api.roadRoutes(queries),
    enabled,
  });
  return { ...q, enabled };
}

/** The route with road distances where the route service has them, estimates elsewhere. */
export function useRoute(m: TripModel, previewScenarioId?: string | null) {
  const base = useBaseRoute(m, previewScenarioId);
  const roads = useRoads(base);
  const route = useMemo(() => (base && roads.data ? applyRoads(base, roads.data) : base), [base, roads.data]);
  return { route, roads };
}
