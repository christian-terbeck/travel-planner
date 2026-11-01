import { BarChart3, CalendarDays, Globe2, Leaf, Luggage, Moon, Plane, Route, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useTrips } from "@/api/queries";
import type { Converted } from "@/domain/money";
import { Temporal, todayIn } from "@/domain/time";
import { useT } from "@/i18n";
import { useAirports } from "@/lib/airports";
import { useTripModels } from "@/lib/model";
import { useFormat, usePrefs } from "@/lib/prefs";
import { byYear, type Summary, summarize, type TripStats, tripStats } from "@/lib/stats";
import { Card, CardHeader, EmptyState, PageHeader, Segmented, Spinner, Stat } from "@/ui/core";

export function StatsPage() {
  const t = useT();
  const f = useFormat();
  const prefs = usePrefs();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  const airports = useAirports();
  const [year, setYear] = useState("all");
  const today = todayIn(() => Temporal.Now.instant(), prefs.timeZone);
  const all = useMemo(
    () =>
      airports
        ? models
            .map((m) => tripStats(m, airports, prefs.currency, prefs.rates, today))
            .filter((s): s is TripStats => s !== null)
        : [],
    [models, airports, prefs.currency, prefs.rates, today],
  );
  const years = useMemo(() => byYear(all, prefs.currency), [all, prefs.currency]);
  const shown = year === "all" ? all : (years.find((y) => String(y.year) === year)?.trips ?? []);
  const summary = summarize(shown, prefs.currency);
  const regions = useMemo(() => new Intl.DisplayNames([prefs.locale], { type: "region" }), [prefs.locale]);
  const money = (c: Converted) =>
    `${f.minor(c.minor, c.currency)}${Object.keys(c.unconvertible).length ? ` + ${f.totals(c.unconvertible)}` : ""}`;

  if (!airports || trips.isPending)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div>
      <PageHeader title={t("nav.stats")} subtitle={t("stats.hint")} />
      <div className="flex flex-col gap-6 p-6">
        {all.length === 0 ? (
          <Card>
            <EmptyState icon={<BarChart3 />} title={t("stats.emptyTitle")} text={t("stats.emptyText")} />
          </Card>
        ) : (
          <>
            {years.length > 1 && (
              <Segmented
                label={t("stats.year")}
                value={year}
                onChange={setYear}
                options={[
                  { value: "all", label: t("stats.allYears") },
                  ...years.map((y) => ({ value: String(y.year), label: String(y.year) })),
                ]}
              />
            )}
            <Tiles s={summary} money={money} countryName={(c) => regions.of(c) ?? c} />
            {year === "all" && years.length > 1 && (
              <Card>
                <CardHeader title={t("stats.byYear")} />
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-line border-b text-left text-fg-3 text-xs">
                      <th className="px-4 py-1.5 font-medium">{t("stats.year")}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{t("stats.trips")}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{t("stats.days")}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{t("stats.km")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("stats.countries")}</th>
                      <th className="px-4 py-1.5 text-right font-medium">{t("stats.spent")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map(({ year: y, summary: s }) => (
                      <tr key={y} className="border-line border-b last:border-0">
                        <td className="px-4 py-1.5 font-medium">{y}</td>
                        <td className="tabular px-2 py-1.5 text-right">{s.trips}</td>
                        <td className="tabular px-2 py-1.5 text-right">{s.days}</td>
                        <td className="tabular px-2 py-1.5 text-right">
                          {f.number(Math.round(s.km.flight + s.km.ground))}
                        </td>
                        <td className="px-2 py-1.5 text-fg-2 text-xs">
                          {s.countries.map((c) => regions.of(c) ?? c).join(", ") || "—"}
                        </td>
                        <td className="tabular px-4 py-1.5 text-right">{money(s.spent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
            <Card>
              <CardHeader title={t("stats.tripList")} />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-line border-b text-left text-fg-3 text-xs">
                    <th className="px-4 py-1.5 font-medium">{t("stats.trip")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("stats.when")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t("stats.days")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t("stats.km")}</th>
                    <th className="px-2 py-1.5 text-right font-medium">{t("stats.spent")}</th>
                    <th className="px-4 py-1.5 text-right font-medium">{t("stats.perDay")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...shown]
                    .sort((a, b) => b.start.toString().localeCompare(a.start.toString()))
                    .map((s) => (
                      <tr key={s.tripId} className="border-line border-b last:border-0">
                        <td className="px-4 py-1.5">
                          <Link to={`/trips/${s.tripId}`} className="font-medium hover:underline">
                            {s.title}
                          </Link>
                          {s.countries.length > 0 && (
                            <div className="text-fg-3 text-xs">
                              {s.countries.map((c) => regions.of(c) ?? c).join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                          {f.dateRange(s.start, s.end)}
                        </td>
                        <td className="tabular px-2 py-1.5 text-right">{s.days}</td>
                        <td className="tabular px-2 py-1.5 text-right">
                          {f.number(Math.round(s.km.flight + s.km.ground))}
                        </td>
                        <td className="tabular whitespace-nowrap px-2 py-1.5 text-right">{money(s.spent)}</td>
                        <td className="tabular whitespace-nowrap px-4 py-1.5 text-right text-fg-2">
                          {f.minor(Math.round(s.spent.minor / s.days), s.spent.currency)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
            <p className="text-fg-3 text-xs">{t("stats.basis")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function Tiles({
  s,
  money,
  countryName,
}: {
  s: Summary;
  money: (c: Converted) => string;
  countryName: (code: string) => string;
}) {
  const t = useT();
  const f = useFormat();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      <Stat icon={<Luggage />} label={t("stats.trips")} value={s.trips} />
      <Stat
        icon={<CalendarDays />}
        label={t("stats.days")}
        value={s.days}
        sub={t("stats.nights", { count: s.nights })}
      />
      <Stat
        icon={<Globe2 />}
        label={t("stats.countries")}
        value={s.countries.length}
        sub={s.countries.map(countryName).join(", ") || undefined}
      />
      <Stat
        icon={<Wallet />}
        label={t("stats.spent")}
        value={money(s.spent)}
        sub={
          s.days > 0
            ? t("stats.perDayValue", {
                amount: f.minor(Math.round(s.spent.minor / s.days), s.spent.currency),
              })
            : undefined
        }
      />
      <Stat
        icon={<Plane />}
        label={t("stats.flightKm")}
        value={f.number(Math.round(s.km.flight))}
        sub={t("stats.flights", { count: s.flights })}
      />
      <Stat icon={<Route />} label={t("stats.groundKm")} value={f.number(Math.round(s.km.ground))} />
      <Stat
        icon={<Moon />}
        label={t("stats.avgLength")}
        value={s.trips > 0 ? t("stats.daysValue", { count: Math.round(s.days / s.trips) }) : "—"}
      />
      <Stat
        icon={<Leaf />}
        label={t("stats.co2")}
        value={t("stats.co2Value", { tonnes: f.number(Math.round(s.co2 / 100) / 10) })}
        sub={t("stats.co2Hint")}
      />
      <Stat
        icon={<Globe2 />}
        label={t("stats.aroundEarth")}
        value={`${f.number(Math.round(((s.km.flight + s.km.ground) / 40_075) * 100) / 100)}×`}
      />
    </div>
  );
}
