import { useQuery, useQueryClient } from "@tanstack/react-query";
import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { AlertTriangle, ExternalLink, Minus, Plane, Plus, RefreshCcw, RotateCcw } from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldUrl from "world-atlas/countries-50m.json?url";
import { api, inDesktopApp } from "@/api/client";
import { useAction } from "@/api/queries";
import {
  applyRoads,
  buildRoute,
  type Leg,
  type LegMode,
  ROAD_FACTOR,
  type Route,
  type RoutePoint,
  roadQueries,
} from "@/domain/geo";
import { evaluate, scenarioSelection } from "@/domain/scenarios";
import { useErrorText, useT } from "@/i18n";
import { useAirports } from "@/lib/airports";
import type { TripModel } from "@/lib/model";
import { useFormat, usePrefs } from "@/lib/prefs";
import { useTripUi } from "@/lib/tripUi";
import { Card, CardHeader, cn, EmptyState, IconButton, Select, Spinner } from "@/ui/core";
import { useTrip } from "./TripLayout";

const W = 960;
const H = 600;

let worldCache: Promise<FeatureCollection<Geometry>> | null = null;
function loadWorld() {
  worldCache ??= fetch(worldUrl)
    .then((r) => r.json() as Promise<Topology<{ countries: GeometryCollection }>>)
    .then((topo) => feature(topo, topo.objects.countries) as FeatureCollection<Geometry>);
  return worldCache;
}

function useWorld() {
  const [world, setWorld] = useState<FeatureCollection<Geometry> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadWorld().then((w) => alive && setWorld(w));
    return () => {
      alive = false;
    };
  }, []);
  return world;
}

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

const modeColor: Record<LegMode, string> = {
  flight: "var(--info)",
  drive: "var(--primary)",
  ground: "var(--accent)",
};

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
                  <dd className="tabular">{km(route.km.flight + route.km.drive + route.km.ground)}</dd>
                </div>
              </dl>
            )}
            {route && <RoadStatus route={route} roads={roads} />}
            {route && (route.missingStays.length > 0 || route.unknownAirports.length > 0) && (
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

const groundLegs = (route: Route, mode?: LegMode) =>
  route.legs.filter((l) => l.mode !== "flight" && (!mode || l.mode === mode));

const approx = (route: Route, mode: LegMode) =>
  groundLegs(route, mode).some((l) => l.estimated) ? "≈ " : "";

function RoadStatus({ route, roads }: { route: Route; roads: ReturnType<typeof useRoute>["roads"] }) {
  const t = useT();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const run = useAction();
  const legs = groundLegs(route);
  if (legs.length === 0) return null;
  const routed = legs.filter((l) => !l.estimated).length;
  const failed = roads.data?.filter((r) => r.status === "failed").length ?? 0;
  const noRoute = roads.data?.filter((r) => r.status === "no_route").length ?? 0;
  const retry = () => void qc.invalidateQueries({ queryKey: ["roads"] });
  const open = (url: string) => () => run(() => api.openUrl(url));
  return (
    <div className="flex flex-col gap-1 border-line border-t px-4 py-2.5 text-fg-3 text-xs">
      {!roads.enabled ? (
        <p>{t("map.roads.off")}</p>
      ) : roads.isFetching ? (
        <p className="flex items-center gap-1.5">
          <Spinner /> {t("map.roads.loading", { count: legs.length })}
        </p>
      ) : roads.isError ? (
        <p className="flex items-center gap-1.5 text-warn">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {errorText(roads.error)}
        </p>
      ) : (
        <p>{t("map.roads.routed", { routed, total: legs.length })}</p>
      )}
      {noRoute > 0 && <p>{t("map.roads.noRoute", { count: noRoute })}</p>}
      {failed > 0 && !roads.isFetching && (
        <p className="flex items-center gap-1.5 text-warn">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {t("map.roads.failed", { count: failed })}
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={retry}
          >
            <RefreshCcw className="size-3" aria-hidden /> {t("map.roads.retry")}
          </button>
        </p>
      )}
      {routed > 0 && (
        <p>
          {t("map.roads.attribution")}{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={open("https://www.openstreetmap.org/copyright")}
          >
            © OpenStreetMap
          </button>
          {" · "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={open("https://www.openstreetmap.org/fixthemap")}
          >
            {t("map.roads.fixTheMap")}
          </button>
        </p>
      )}
    </div>
  );
}

function DistanceRow({
  color,
  label,
  value,
  hint,
}: {
  color: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <dt className="flex items-center gap-2">
          <span className="inline-block h-1 w-4 rounded" style={{ background: color }} />
          {label}
        </dt>
        <dd className="tabular font-medium">{value}</dd>
      </div>
      <p className="pl-6 text-[11px] text-fg-3">{hint}</p>
    </div>
  );
}

function LegsCard({ legs, tz }: { legs: Leg[]; tz: string }) {
  const t = useT();
  const f = useFormat();
  return (
    <Card>
      <CardHeader title={t("map.legs")} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-line border-b text-left text-fg-3 text-xs">
            <th className="px-4 py-1.5 font-medium">{t("map.col.date")}</th>
            <th className="px-2 py-1.5 font-medium">
              {t("map.col.from")} → {t("map.col.to")}
            </th>
            <th className="px-4 py-1.5 text-right font-medium">{t("map.col.km")}</th>
          </tr>
        </thead>
        <tbody>
          {legs.map((l, i) => (
            <tr key={i} className="border-line border-b last:border-0">
              <td className="whitespace-nowrap px-4 py-1.5 text-fg-3 text-xs">
                {l.at ? f.date(l.at.toZonedDateTimeISO(tz).toPlainDate(), "short") : "—"}
              </td>
              <td className="px-2 py-1.5">
                <span
                  className="mr-1.5 inline-block h-1 w-3 rounded align-middle"
                  style={{ background: modeColor[l.mode] }}
                  title={t(`map.modes.${l.mode}`)}
                />
                <span className="truncate">
                  {l.from.label} → {l.to.label}
                </span>
              </td>
              <td className="tabular whitespace-nowrap px-4 py-1.5 text-right">
                {l.estimated ? "≈ " : ""}
                {f.number(Math.round(l.km))}
                {l.minutes !== null && (
                  <span className="block text-[11px] text-fg-3">{f.duration(l.minutes)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-line border-t px-4 py-1.5 text-[11px] text-fg-3">≈ {t("map.estimated")}</p>
    </Card>
  );
}

function PointCard({ point }: { point: RoutePoint }) {
  const t = useT();
  const run = useAction();
  const url = `https://www.openstreetmap.org/?mlat=${point.pos.lat}&mlon=${point.pos.lon}#map=14/${point.pos.lat}/${point.pos.lon}`;
  return (
    <Card className="px-4 py-3 text-sm">
      <p className="font-semibold">{point.label}</p>
      <p className="tabular text-fg-3 text-xs">
        {point.pos.lat.toFixed(4)}, {point.pos.lon.toFixed(4)}
      </p>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 text-primary text-xs hover:underline"
        onClick={() => run(() => api.openUrl(url))}
      >
        <ExternalLink className="size-3" aria-hidden /> {t("map.openOsm")}
      </button>
    </Card>
  );
}

function RouteMap({
  world,
  route,
  selected,
  onSelect,
}: {
  world: FeatureCollection<Geometry>;
  route: Route;
  selected: RoutePoint | null;
  onSelect: (p: RoutePoint | null) => void;
}) {
  const t = useT();
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { path, project } = useMemo(() => {
    const coords = route.points.map((p) => [p.pos.lon, p.pos.lat] as [number, number]);
    // A small frame around the points so a single city is not zoomed in to street level.
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const pad = Math.max(
      1.5,
      (Math.max(...lons) - Math.min(...lons)) * 0.08,
      (Math.max(...lats) - Math.min(...lats)) * 0.08,
    );
    const frame: Feature<Geometry> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPoint",
        coordinates: [
          ...coords,
          [Math.min(...lons) - pad, Math.min(...lats) - pad],
          [Math.max(...lons) + pad, Math.max(...lats) + pad],
        ],
      },
    };
    const projection = geoMercator().fitExtent(
      [
        [30, 30],
        [W - 30, H - 30],
      ],
      frame,
    );
    return {
      path: geoPath(projection),
      project: (p: RoutePoint) => projection([p.pos.lon, p.pos.lat]) ?? [0, 0],
    };
  }, [route]);

  const countries = useMemo(
    () => world.features.map((ft, i) => <path key={i} d={path(ft) ?? undefined} />),
    [world, path],
  );

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };
  const zoom = (factor: number, cx = W / 2, cy = H / 2) =>
    setView((v) => {
      const k = Math.min(40, Math.max(1, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    drag.current = { x: p.x, y: p.y, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const p = toSvg(e.clientX, e.clientY);
    const d = drag.current;
    setView((v) => ({ ...v, x: d.vx + p.x - d.x, y: d.vy + p.y - d.y }));
  };
  const s = 1 / view.k;
  let stayNo = 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full cursor-grab touch-none select-none bg-info-soft/40 active:cursor-grabbing"
        role="img"
        aria-label={t("map.title")}
        onWheel={(e) => {
          const p = toSvg(e.clientX, e.clientY);
          zoom(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={0.6 * s}>
            {countries}
          </g>
          {route.legs.map((l, i) => (
            <path
              key={i}
              d={
                path({
                  type: "LineString",
                  coordinates: l.path ?? [
                    [l.from.pos.lon, l.from.pos.lat],
                    [l.to.pos.lon, l.to.pos.lat],
                  ],
                }) ?? undefined
              }
              fill="none"
              stroke={modeColor[l.mode]}
              strokeWidth={(l.mode === "flight" ? 2 : l.path ? 2.5 : 3) * s}
              strokeLinejoin="round"
              strokeDasharray={
                l.mode === "flight"
                  ? `${6 * s} ${4 * s}`
                  : l.mode === "ground"
                    ? `${2 * s} ${3 * s}`
                    : undefined
              }
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}
          {route.points.map((p) => {
            const [x, y] = project(p);
            const active = selected?.key === p.key;
            const n = p.kind === "stay" ? ++stayNo : 0;
            return (
              <g
                key={p.key}
                transform={`translate(${x},${y}) scale(${s})`}
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={p.label}
                aria-pressed={active}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(active ? null : p)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(active ? null : p)}
              >
                <title>{p.label}</title>
                {p.kind === "airport" && (
                  <>
                    <circle r={6} fill="var(--surface)" stroke="var(--info)" strokeWidth={2.5} />
                    <text
                      y={-10}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="var(--text)"
                      stroke="var(--surface)"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {p.label}
                    </text>
                  </>
                )}
                {p.kind === "stay" && (
                  <>
                    <circle
                      r={active ? 11 : 9}
                      fill="var(--primary)"
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                    <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--primary-text)">
                      {n}
                    </text>
                    <text
                      x={13}
                      y={4}
                      fontSize={11}
                      fill="var(--text)"
                      stroke="var(--surface)"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {p.label}
                    </text>
                  </>
                )}
                {p.kind === "activity" && (
                  <rect
                    x={-5}
                    y={-5}
                    width={10}
                    height={10}
                    transform="rotate(45)"
                    fill="var(--accent)"
                    stroke="var(--surface)"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-md border border-line bg-surface p-0.5 shadow-card">
        <IconButton label="+" onClick={() => zoom(1.5)}>
          <Plus className="size-4" />
        </IconButton>
        <IconButton label="−" onClick={() => zoom(1 / 1.5)}>
          <Minus className="size-4" />
        </IconButton>
        <IconButton label={t("calendar.today")} onClick={() => setView({ k: 1, x: 0, y: 0 })}>
          <RotateCcw className="size-4" />
        </IconButton>
      </div>
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-line bg-surface/90 px-2.5 py-1.5 text-[11px] text-fg-2">
        <Legend color={modeColor.flight} dashed label={t("map.modes.flight")} />
        <Legend color={modeColor.drive} label={t("map.modes.drive")} />
        <Legend color={modeColor.ground} dashed label={t("map.modes.ground")} />
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full border-2 border-info" />{" "}
          {t("map.legend.airport")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full bg-primary" /> {t("map.legend.stay")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rotate-45 bg-accent" /> {t("map.legend.activity")}
        </span>
      </div>
    </div>
  );
}

function Legend({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn("inline-block w-4 border-t-2", dashed && "border-dashed")}
        style={{ borderColor: color }}
      />
      {label}
    </span>
  );
}
