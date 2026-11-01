import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldUrl from "world-atlas/countries-50m.json?url";
import type { LegMode, Route, RoutePoint } from "@/domain/geo";
import { useT } from "@/i18n";
import { cn, IconButton } from "@/ui/core";

const W = 960;

const H = 600;

let worldCache: Promise<FeatureCollection<Geometry>> | null = null;

function loadWorld() {
  worldCache ??= fetch(worldUrl)
    .then((r) => r.json() as Promise<Topology<{ countries: GeometryCollection }>>)
    .then((topo) => feature(topo, topo.objects.countries) as FeatureCollection<Geometry>);
  return worldCache;
}

export function useWorld() {
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

export const modeColor: Record<LegMode, string> = {
  flight: "var(--info)",
  transit: "var(--ok)",
  drive: "var(--primary)",
  ground: "var(--accent)",
};

export function RouteMap({
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
                {p.kind === "place" && (
                  <rect
                    x={-5}
                    y={-5}
                    width={10}
                    height={10}
                    rx={2}
                    fill="var(--surface)"
                    stroke="var(--ok)"
                    strokeWidth={2.5}
                  />
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
        <Legend color={modeColor.transit} label={t("map.modes.transit")} />
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
