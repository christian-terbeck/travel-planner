import { useQuery } from "@tanstack/react-query";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Sun,
  Thermometer,
} from "lucide-react";
import type { ReactNode } from "react";
import type { DayWeather } from "@/api/bindings/DayWeather";
import { api } from "@/api/client";
import { useErrorText, useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { type WeatherKind, weatherKind, weatherPlaces } from "@/lib/weather";
import { Badge, Card, CardHeader, Spinner } from "@/ui/core";
import { useTrip } from "./TripLayout";

const ICONS: Record<WeatherKind, ReactNode> = {
  clear: <Sun className="text-warn" />,
  partly: <CloudSun className="text-warn" />,
  cloudy: <Cloud className="text-fg-3" />,
  fog: <CloudFog className="text-fg-3" />,
  drizzle: <CloudDrizzle className="text-info" />,
  rain: <CloudRain className="text-info" />,
  showers: <CloudSunRain className="text-info" />,
  snow: <CloudSnow className="text-info" />,
  thunder: <CloudLightning className="text-danger" />,
};

/** Daily weather at the stays of the plan (only when the weather service is turned on). */
export function WeatherCard() {
  const t = useT();
  const m = useTrip();
  const prefs = usePrefs();
  const errorText = useErrorText();
  const places = weatherPlaces(m.plan.items);
  const dayLabel = new Intl.DateTimeFormat(prefs.locale, { weekday: "short", day: "numeric" });
  const queries = places.map((p) => p.query);
  const weather = useQuery({
    queryKey: ["weather", queries],
    queryFn: () => api.weather(queries),
    enabled: prefs.weather && queries.length > 0,
  });
  if (!prefs.weather) return null;

  return (
    <Card>
      <CardHeader
        icon={<Thermometer className="size-4" />}
        title={t("weather.title")}
        subtitle={t("weather.attribution")}
      />
      {places.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("weather.noPlaces")}</p>
      ) : weather.isPending ? (
        <div className="flex justify-center p-4">
          <Spinner />
        </div>
      ) : weather.isError ? (
        <p className="px-4 py-3 text-danger text-sm" role="alert">
          {errorText(weather.error)}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {places.map((p, i) => {
            const r = weather.data?.[i];
            return (
              <li key={p.item.option.id} className="px-4 py-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-sm">{p.item.option.title}</span>
                  {r && (
                    <Badge tone={r.source === "forecast" ? "primary" : "neutral"}>
                      {t(`weather.source.${r.source}`)}
                    </Badge>
                  )}
                </div>
                {r ? (
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {r.days.map((d) => (
                      <Day key={d.date} day={d} label={dayLabel.format(new Date(`${d.date}T12:00:00`))} />
                    ))}
                  </div>
                ) : (
                  <p className="text-fg-3 text-xs">{t("weather.unavailable")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Day({ day, label }: { day: DayWeather; label: string }) {
  const t = useT();
  const kind = weatherKind(day.code);
  const deg = (v: number | null) => (v === null ? "–" : `${Math.round(v)}°`);
  return (
    <div
      className="flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-md bg-surface-2 px-1 py-1.5 text-center"
      title={kind ? t(`weather.kind.${kind}`) : undefined}
    >
      <span className="w-full truncate text-[11px] text-fg-3">{label}</span>
      <span className="[&_svg]:size-5" aria-label={kind ? t(`weather.kind.${kind}`) : undefined} role="img">
        {kind ? ICONS[kind] : <Cloud className="text-fg-3" />}
      </span>
      <span className="tabular text-xs">
        <span className="font-semibold">{deg(day.t_max)}</span>{" "}
        <span className="text-fg-3">{deg(day.t_min)}</span>
      </span>
      {day.precipitation_mm !== null && day.precipitation_mm >= 0.5 && (
        <span className="tabular text-[11px] text-info">
          {t("weather.mm", { mm: Math.round(day.precipitation_mm) })}
        </span>
      )}
    </div>
  );
}
