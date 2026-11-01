import { ArrowRight, HandCoins, Split, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import { convertTotals } from "@/domain/money";
import { settle } from "@/domain/splits";
import { useT } from "@/i18n";
import { useFormat, usePrefs } from "@/lib/prefs";
import { newSettlement } from "@/lib/rows";
import { Button, Card, CardHeader, cn, EmptyState, IconButton } from "@/ui/core";
import { useTrip } from "../TripLayout";

export function BudgetBars() {
  const t = useT();
  const f = useFormat();
  const { rates } = usePrefs();
  const m = useTrip();
  const b = m.budget;
  const cur = b.currency;
  const rows: Array<{
    label: string;
    value: number;
    tone: string;
    certainty: "estimate" | "confirmed" | "actual";
  }> = [
    {
      label: t("budget.plan"),
      value: b.converted.plan.minor,
      tone: "bg-primary/30 border border-dashed border-primary",
      certainty: "estimate",
    },
    {
      label: t("budget.plannedExpenses"),
      value: convertTotals(b.plannedExpenses, cur, rates).minor,
      tone: "bg-muted-soft border border-dashed border-line-strong",
      certainty: "estimate",
    },
    {
      label: t("budget.confirmed"),
      value: b.converted.confirmed.minor,
      tone: "bg-ok/70",
      certainty: "confirmed",
    },
    { label: t("budget.paid"), value: b.converted.paid.minor, tone: "bg-ok", certainty: "confirmed" },
    { label: t("budget.actual"), value: b.converted.actual.minor, tone: "bg-accent", certainty: "actual" },
  ];
  const max = Math.max(1, b.target ?? 0, b.maximum ?? 0, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[150px_1fr_110px] items-center gap-3 text-sm">
          <span className="text-fg-2">{r.label}</span>
          <div className="relative h-3 rounded bg-surface-2">
            <div
              className={cn("h-3 rounded", r.tone)}
              style={{ width: `${Math.min(100, (r.value / max) * 100)}%` }}
            />
            {b.target !== null && (
              <div
                className="absolute top-[-3px] h-4.5 w-0.5 bg-fg"
                style={{ left: `${(b.target / max) * 100}%` }}
                title={t("budget.target")}
              />
            )}
          </div>
          <span className="tabular text-right font-medium">{f.minor(r.value, cur, { compact: true })}</span>
        </div>
      ))}
      {b.target !== null && (
        <p className="flex items-center gap-1.5 text-fg-3 text-xs">
          <span className="inline-block h-3 w-0.5 bg-fg" />{" "}
          {t("budget.targetLine", { amount: f.minor(b.target, cur) })}
        </p>
      )}
      <table className="mt-2 text-sm">
        <tbody>
          {(["transport", "accommodation", "rental_car", "activity", "other", "fees"] as const).map((c) => {
            const cost = b.plan.costs[c];
            if (Object.keys(cost.totals).length === 0 && cost.missing.length === 0) return null;
            return (
              <tr key={c} className="border-line border-t">
                <td className="py-1 text-fg-2">{t(`costCategory.${c}`)}</td>
                <td className="tabular py-1 text-right">
                  {f.cost(cost, cur)}
                  {cost.missing.length > 0 && (
                    <span className="ml-1 text-warn text-xs">
                      {t("budget.missingPrices", { count: cost.missing.length })}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SettlementCard({
  onSplit,
}: {
  onSplit: (t: { booking_id: string | null; expense_id: string | null; title: string }) => void;
}) {
  const t = useT();
  const f = useFormat();
  const { rates } = usePrefs();
  const m = useTrip();
  const run = useAction();
  const remove = useRemove();
  const travelers = m.graph.travelers;
  if (travelers.length < 2) {
    return (
      <Card>
        <CardHeader title={t("split.title")} />
        <EmptyState title={t("split.needTravelers")} text={t("split.needTravelersText")} />
      </Card>
    );
  }
  const s = settle(m.graph, m.budget.currency, rates);
  const name = (id: string) => travelers.find((x) => x.id === id)?.name ?? "?";
  return (
    <Card>
      <CardHeader title={t("split.title")} subtitle={t("split.hint")} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-line border-b text-left text-fg-3 text-xs">
            <th className="px-4 py-1.5 font-medium">{t("split.traveler")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("split.share")}</th>
            <th className="px-2 py-1.5 text-right font-medium">{t("split.paid")}</th>
            <th className="px-4 py-1.5 text-right font-medium">{t("split.balance")}</th>
          </tr>
        </thead>
        <tbody>
          {s.balances.map((x) => (
            <tr key={x.travelerId} className="border-line border-b last:border-0">
              <td className="px-4 py-1.5">{name(x.travelerId)}</td>
              <td className="tabular px-2 py-1.5 text-right">{f.minor(x.share, s.currency)}</td>
              <td className="tabular px-2 py-1.5 text-right">{f.minor(x.paid, s.currency)}</td>
              <td
                className={cn(
                  "tabular px-4 py-1.5 text-right font-medium",
                  x.balance > 0 ? "text-ok" : x.balance < 0 ? "text-danger" : "",
                )}
              >
                {f.minor(x.balance, s.currency, { signed: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-line border-t px-4 py-2.5">
        {s.transfers.length === 0 ? (
          <p className="text-fg-3 text-sm">{t("split.settled")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {s.transfers.map((x) => (
              <li key={`${x.from}-${x.to}`} className="flex items-center gap-2">
                {name(x.from)} <ArrowRight className="size-3.5 text-fg-3" aria-hidden /> {name(x.to)}
                <span className="tabular ml-auto font-medium">{f.minor(x.minor, s.currency)}</span>
                <Button
                  size="sm"
                  icon={<HandCoins className="size-3.5" />}
                  onClick={() =>
                    run(
                      () =>
                        api.save({ type: "settlement", row: newSettlement(m.graph.trip.id, x, s.currency) }),
                      t("split.recorded", { from: name(x.from), to: name(x.to) }),
                    )
                  }
                >
                  {t("split.markPaid")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {s.unattributed !== 0 && (
          <p className="mt-2 text-warn text-xs">
            {t("split.unattributed", { amount: f.minor(s.unattributed, s.currency) })}
          </p>
        )}
        {Object.keys(s.unconvertible).length > 0 && (
          <p className="mt-1 text-warn text-xs">
            {t("split.unconvertible", { amount: f.totals(s.unconvertible) })}
          </p>
        )}
      </div>
      {m.graph.settlements.length > 0 && (
        <details className="border-line border-t px-4 py-2 text-sm">
          <summary className="cursor-pointer text-fg-2">
            {t("split.done", { count: m.graph.settlements.length })}
          </summary>
          <ul className="mt-1">
            {m.graph.settlements.map((x) => (
              <li key={x.id} className="flex items-center gap-2 py-1">
                <span className="text-fg-3 text-xs">{f.date(x.paid_on)}</span>
                {name(x.from_traveler_id)} <ArrowRight className="size-3.5 text-fg-3" aria-hidden />{" "}
                {name(x.to_traveler_id)}
                <span className="tabular ml-auto">{f.minor(x.amount_minor, x.currency)}</span>
                <IconButton
                  label={t("split.deleteSettlement")}
                  onClick={() => void remove("settlement", [x.id], t("split.settlementDeleted"))}
                >
                  <Trash2 className="size-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
        </details>
      )}
      {m.graph.bookings.length > 0 && (
        <details className="border-line border-t px-4 py-2 text-sm">
          <summary className="cursor-pointer text-fg-2">{t("split.bookingShares")}</summary>
          <ul className="mt-1">
            {m.graph.bookings.map((bk) => {
              const shares = m.graph.cost_shares.filter((c) => c.booking_id === bk.id);
              return (
                <li key={bk.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1 truncate">{m.item(bk.option_id)?.option.title}</span>
                  <span className="text-fg-3 text-xs">
                    {shares.length
                      ? shares.map((c) => `${name(c.traveler_id)} ×${c.weight}`).join(", ")
                      : t("split.equal")}
                  </span>
                  <IconButton
                    label={t("budget.split")}
                    onClick={() =>
                      onSplit({
                        booking_id: bk.id,
                        expense_id: null,
                        title: m.item(bk.option_id)?.option.title ?? "",
                      })
                    }
                  >
                    <Split className="size-3.5" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Card>
  );
}
