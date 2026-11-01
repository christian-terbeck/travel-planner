import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, RefreshCcw } from "lucide-react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { Leg, LegMode, Route, RoutePoint } from "@/domain/geo";
import { useErrorText, useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { Card, CardHeader, Spinner } from "@/ui/core";
import { modeColor } from "./RouteMap";
import type { useRoute } from "./route";

export const groundLegs = (route: Route, mode?: LegMode) =>
  route.legs.filter((l) => (l.mode === "drive" || l.mode === "ground") && (!mode || l.mode === mode));

export const approx = (route: Route, mode: LegMode) =>
  groundLegs(route, mode).some((l) => l.estimated) ? "≈ " : "";

export function RoadStatus({ route, roads }: { route: Route; roads: ReturnType<typeof useRoute>["roads"] }) {
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

export function DistanceRow({
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

export function LegsCard({ legs, tz }: { legs: Leg[]; tz: string }) {
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

export function PointCard({ point }: { point: RoutePoint }) {
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
