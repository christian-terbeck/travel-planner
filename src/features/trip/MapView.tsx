import { AlertTriangle, Plane } from "lucide-react";
import { useState } from "react";
import { type LegMode, ROAD_FACTOR, type Route, type RoutePoint } from "@/domain/geo";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { useTripUi } from "@/lib/tripUi";
import { Card, CardHeader, EmptyState, Select, Spinner } from "@/ui/core";
import { approx, DistanceRow, groundLegs, LegsCard, PointCard, RoadStatus } from "./map/RouteCards";
import { modeColor, RouteMap, useWorld } from "./map/RouteMap";
import { useRoute } from "./map/route";
import { useTrip } from "./TripLayout";

export function MapView() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const [ui, setUi] = useTripUi(m.graph.trip.id);
  const { route, roads } = useRoute(m, ui.previewScenarioId);
  const world = useWorld();
  const [selected, setSelected] = useState<RoutePoint | null>(null);

  const km = (v: number) => `${f.number(Math.round(v))} km`;
  const roadHint = (r: Route, mode: LegMode) => {
    const legs = groundLegs(r, mode);
    const routed = legs.filter((l) => !l.estimated).length;
    if (routed === 0) return t("map.driveHint", { factor: f.number(ROAD_FACTOR) });
    return routed === legs.length
      ? t("map.roadHint")
      : t("map.roadPartlyHint", { routed, total: legs.length });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Select
          aria-label={t("itinerary.preview")}
          className="w-64"
          value={ui.previewScenarioId ?? ""}
          onChange={(e) => setUi({ previewScenarioId: e.target.value || null })}
        >
          <option value="">{t("itinerary.currentPlan")}</option>
          {m.graph.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {t("itinerary.previewOf", { name: s.name })}
            </option>
          ))}
        </Select>
        <p className="text-fg-3 text-sm">{t("map.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          {!route || !world ? (
            <div className="flex h-96 items-center justify-center gap-2 text-fg-3 text-sm">
              <Spinner /> {t("map.loading")}
            </div>
          ) : route.points.length === 0 ? (
            <EmptyState icon={<Plane />} title={t("map.noLegs")} className="h-96" />
          ) : (
            <RouteMap world={world} route={route} selected={selected} onSelect={setSelected} />
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title={t("map.distances")} />
            {route && (
              <dl className="flex flex-col gap-2 px-4 py-3 text-sm">
                <DistanceRow
                  color={modeColor.flight}
                  label={t("map.flight")}
                  value={km(route.km.flight)}
                  hint={t("map.flightHint")}
                />
                {route.km.transit > 0 && (
                  <DistanceRow
                    color={modeColor.transit}
                    label={t("map.transit")}
                    value={`≈ ${km(route.km.transit)}`}
                    hint={t("map.transitHint", { factor: f.number(ROAD_FACTOR) })}
                  />
                )}
                <DistanceRow
                  color={modeColor.drive}
                  label={t("map.drive")}
                  value={`${approx(route, "drive")}${km(route.km.drive)}`}
                  hint={roadHint(route, "drive")}
                />
                {route.km.ground > 0 && (
                  <DistanceRow
                    color={modeColor.ground}
                    label={t("map.ground")}
                    value={`${approx(route, "ground")}${km(route.km.ground)}`}
                    hint={`${t("map.groundHint")} · ${roadHint(route, "ground")}`}
                  />
                )}
                <div className="flex justify-between border-line border-t pt-2 font-semibold">
                  <dt>{t("map.total")}</dt>
                  <dd className="tabular">
                    {km(route.km.flight + route.km.transit + route.km.drive + route.km.ground)}
                  </dd>
                </div>
              </dl>
            )}
            {route && <RoadStatus route={route} roads={roads} />}
            {route &&
              (route.missingStays.length > 0 ||
                route.unknownAirports.length > 0 ||
                route.missingPlaces > 0) && (
                <div className="flex flex-col gap-1 border-line border-t px-4 py-2.5 text-warn text-xs">
                  {route.missingStays.length > 0 && (
                    <p className="flex gap-1.5">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      <span>
                        {t("map.missingLocations", { count: route.missingStays.length })} (
                        {route.missingStays.map((i) => i.option.title).join(", ")})
                      </span>
                    </p>
                  )}
                  {route.missingPlaces > 0 && (
                    <p className="flex gap-1.5">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      {t("map.missingPlaces", { count: route.missingPlaces })}
                    </p>
                  )}
                  {route.unknownAirports.length > 0 && (
                    <p className="flex gap-1.5">
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
                      {t("map.unknownAirports", { count: route.unknownAirports.length })}{" "}
                      {route.unknownAirports.join(", ")}
                    </p>
                  )}
                </div>
              )}
          </Card>
          {route && route.legs.length > 0 && <LegsCard legs={route.legs} tz={m.tz} />}
          {selected && <PointCard point={selected} />}
        </div>
      </div>
    </div>
  );
}
