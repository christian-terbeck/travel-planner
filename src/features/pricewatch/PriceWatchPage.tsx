import { PlugZap, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTrips } from "@/api/queries";
import type { PlanOption } from "@/domain/types";
import { useT } from "@/i18n";
import { type TripModel, useTripModels } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { setTripUi } from "@/lib/tripUi";
import { Badge, Card, CardHeader, cn, EmptyState, PageHeader } from "@/ui/core";
import { PriceSparkline } from "@/ui/PriceChart";
import { KindIcon } from "@/ui/status";
import { ProviderLine } from "../trip/itemText";

const STALE_DAYS = 14;

/** Price the option was first saved with: the oldest logged price, or the current one. */
function originalPrice(m: TripModel, o: PlanOption): { minor: number; currency: string } | null {
  const first = m.graph.change_log.find(
    (c) => c.entity === "option" && c.entity_id === o.id && c.field === "price",
  );
  const raw = first ? first.old_value : null;
  if (raw) {
    const [v, cur] = raw.split(" ");
    if (v && cur) return { minor: Number(v), currency: cur };
  }
  return o.price_minor === null ? null : { minor: o.price_minor, currency: o.currency };
}

export function PriceWatchPage() {
  const t = useT();
  const f = useFormat();
  const navigate = useNavigate();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  const rows = useMemo(
    () =>
      models.flatMap((m) =>
        [...m.ctx.items.values()]
          .filter(
            (i) =>
              i.activeBookings.length === 0 &&
              i.option.decision !== "rejected" &&
              !["archived", "cancelled"].includes(i.option.status) &&
              (i.option.price_minor !== null || i.option.url),
          )
          .map((i) => {
            const obs = m.graph.price_observations
              .filter((p) => p.option_id === i.option.id)
              .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
            const verified = i.option.price_verified_at ?? obs.at(-1)?.observed_at ?? null;
            const ageDays = verified
              ? Math.floor((Date.now() - new Date(verified).getTime()) / 86_400_000)
              : null;
            return { m, i, obs, last: obs.at(-1) ?? null, original: originalPrice(m, i.option), ageDays };
          }),
      ),
    [models],
  );
  const open = (m: TripModel, optionId: string) => {
    setTripUi(m.graph.trip.id, { selectedOptionId: optionId });
    navigate(`/trips/${m.graph.trip.id}/planning`);
  };

  return (
    <div>
      <PageHeader title={t("nav.priceWatch")} subtitle={t("priceWatch.subtitle")} />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <EmptyState
            icon={<PlugZap />}
            title={t("priceWatch.noProviderTitle")}
            text={t("priceWatch.noProviderText")}
          />
        </Card>
        <Card>
          <CardHeader
            icon={<TrendingDown className="size-4" />}
            title={t("priceWatch.manual")}
            subtitle={t("priceWatch.manualHint", { days: STALE_DAYS })}
          />
          {rows.length === 0 ? (
            <p className="px-4 py-4 text-fg-3 text-sm">{t("priceWatch.empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-line border-b text-left text-fg-3 text-xs">
                  <th className="px-4 py-2 font-medium">{t("planning.col.option")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("priceWatch.original")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("priceWatch.saved")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("priceWatch.lastObserved")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("priceWatch.difference")}</th>
                  <th className="px-2 py-2 font-medium">{t("priceWatch.trend")}</th>
                  <th className="px-2 py-2 text-right font-medium">{t("priceWatch.target")}</th>
                  <th className="px-4 py-2 font-medium">{t("priceWatch.checked")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ m, i, last, original, ageDays, obs }) => {
                  const diff =
                    last && i.option.price_minor !== null && last.currency === i.option.currency
                      ? last.price_minor - i.option.price_minor
                      : null;
                  return (
                    <tr
                      key={i.option.id}
                      className="cursor-pointer border-line border-b last:border-0 hover:bg-surface-2"
                      onClick={() => open(m, i.option.id)}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          <KindIcon kind={i.kind} className="size-4 text-fg-3" />
                          {i.option.title}
                        </div>
                        <div className="text-fg-3 text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            {m.graph.trip.title} ·
                            <ProviderLine
                              provider={i.option.provider}
                              platform={i.option.platform}
                              url={i.option.url}
                              segments={i.segments.map((s) => s.segment)}
                              showUrl={false}
                              fallback="—"
                            />
                          </span>
                        </div>
                      </td>
                      <td className="tabular px-2 py-2 text-right text-fg-3">
                        {original ? f.money(original) : "—"}
                      </td>
                      <td className="tabular px-2 py-2 text-right">
                        {f.minor(i.option.price_minor, i.option.currency)}
                      </td>
                      <td className="tabular px-2 py-2 text-right">
                        {last ? f.minor(last.price_minor, last.currency) : "—"}
                        {last && (
                          <div className="text-[11px] text-fg-3">
                            {t(`observationKind.${last.kind}`)} · {obs.length}×
                          </div>
                        )}
                      </td>
                      <td
                        className={cn(
                          "tabular px-2 py-2 text-right",
                          diff !== null && diff < 0
                            ? "text-ok"
                            : diff !== null && diff > 0
                              ? "text-danger"
                              : "text-fg-3",
                        )}
                      >
                        {diff === null
                          ? "—"
                          : diff === 0
                            ? "±0"
                            : f.minor(diff, i.option.currency, { signed: true })}
                      </td>
                      <td className="px-2 py-2">
                        <PriceSparkline
                          currency={i.option.currency}
                          points={obs
                            .filter((p) => p.currency === i.option.currency)
                            .map((p) => ({ at: p.observed_at, minor: p.price_minor }))}
                        />
                      </td>
                      <td className="tabular px-2 py-2 text-right">
                        {i.option.target_price_minor === null ? (
                          <span className="text-fg-3">—</span>
                        ) : (
                          <>
                            {f.minor(i.option.target_price_minor, i.option.currency)}
                            {last &&
                              last.currency === i.option.currency &&
                              last.price_minor <= i.option.target_price_minor && (
                                <div>
                                  <Badge tone="ok">{t("priceWatch.targetReached")}</Badge>
                                </div>
                              )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {ageDays === null ? (
                          <Badge tone="warn">{t("priceWatch.never")}</Badge>
                        ) : ageDays > STALE_DAYS ? (
                          <Badge tone="warn">{t("priceWatch.daysAgo", { count: ageDays })}</Badge>
                        ) : (
                          <span className="text-fg-3 text-xs">
                            {t("priceWatch.daysAgo", { count: ageDays })}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
