import { ArrowRight, Pencil, Plus, Split, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { type Converted, convertTotals } from "@/domain/money";
import { settle } from "@/domain/splits";
import type { CostShare, Expense, ExpenseCategory, ExpenseKind } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat, usePrefs } from "@/lib/prefs";
import { newExpense, newId, nil } from "@/lib/rows";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  cn,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Stat,
  Textarea,
} from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { DateInput, MoneyInput, NumberInput } from "@/ui/inputs";
import { Certainty } from "@/ui/status";
import { useTrip } from "./TripLayout";

const CATEGORIES: ExpenseCategory[] = [
  "food",
  "fuel",
  "tolls",
  "public_transport",
  "parking",
  "fees",
  "shopping",
  "misc",
];
const KINDS: ExpenseKind[] = ["planned", "actual", "refund"];

export function BudgetView() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const b = m.budget;
  const cur = b.currency;
  const [expense, setExpense] = useState<Expense | null>(null);
  const [split, setSplit] = useState<{
    booking_id: string | null;
    expense_id: string | null;
    title: string;
  } | null>(null);
  const run = useAction();
  const confirm = useConfirm();

  const money = (c: Converted) => (
    <span>
      {f.minor(c.minor, cur)}
      {Object.keys(c.unconvertible).length > 0 && (
        <span className="ml-1 text-sm text-warn" title={t("budget.unconvertibleHint")}>
          + {f.totals(c.unconvertible)}
        </span>
      )}
    </span>
  );
  const delta = b.target !== null && b.plan.complete ? b.target - b.converted.expected.minor : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t("budget.target")}
          value={b.target !== null ? f.minor(b.target, cur) : t("common.notSet")}
          sub={b.maximum !== null ? t("budget.maximum", { amount: f.minor(b.maximum, cur) }) : undefined}
        />
        <Stat
          label={t("budget.plan")}
          value={money(b.converted.plan)}
          sub={
            <span className="flex items-center gap-1.5">
              <Certainty kind={b.plan.complete ? "estimate" : "incomplete"} />
              {b.planScenario?.name ?? t("budget.bookingsOnly")}
            </span>
          }
        />
        <Stat
          label={t("budget.cheapestScenario")}
          value={b.cheapestScenario ? f.minor(b.cheapestScenario.evaluation.converted.minor, cur) : "—"}
          sub={b.cheapestScenario ? b.cheapestScenario.scenario.name : t("budget.noCompleteScenario")}
        />
        <Stat
          label={t("budget.expected")}
          value={money(b.converted.expected)}
          sub={
            delta !== null
              ? delta >= 0
                ? t("scenario.belowBudget", { amount: f.minor(delta, cur, { compact: true }) })
                : t("scenario.aboveBudget", { amount: f.minor(-delta, cur, { compact: true }) })
              : t("budget.expectedHint")
          }
          tone={delta !== null && delta < 0 ? "danger" : undefined}
        />
        <Stat
          label={t("budget.confirmed")}
          value={money(b.converted.confirmed)}
          sub={<Certainty kind="confirmed" />}
        />
        <Stat
          label={t("budget.paid")}
          value={money(b.converted.paid)}
          sub={
            Object.keys(b.refunds).length
              ? t("budget.afterRefunds", { amount: f.totals(b.refunds) })
              : undefined
          }
          tone="ok"
        />
        <Stat
          label={t("budget.outstanding")}
          value={money(b.converted.outstanding)}
          tone={b.converted.outstanding.minor > 0 ? "warn" : undefined}
        />
        <Stat
          label={t("budget.actual")}
          value={money(b.converted.actual)}
          sub={<Certainty kind="actual" />}
        />
      </div>
      {Object.keys(b.cancellationCosts).length > 0 && (
        <p className="text-fg-2 text-sm">
          {t("budget.cancellationCosts", { amount: f.totals(b.cancellationCosts) })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("budget.breakdown")} subtitle={t("budget.breakdownHint")} />
          <BudgetBars />
        </Card>
        <SettlementCard onSplit={setSplit} />
      </div>

      <Card>
        <CardHeader
          title={t("budget.expenses")}
          subtitle={t("budget.expensesHint")}
          actions={
            <Button
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => setExpense(newExpense(m.graph.trip.id, cur))}
            >
              {t("budget.addExpense")}
            </Button>
          }
        />
        {m.graph.expenses.length === 0 ? (
          <EmptyState title={t("budget.noExpenses")} text={t("budget.noExpensesText")} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-line border-b text-left text-fg-3 text-xs">
                <th className="px-4 py-1.5 font-medium">{t("budget.col.date")}</th>
                <th className="px-2 py-1.5 font-medium">{t("budget.col.title")}</th>
                <th className="px-2 py-1.5 font-medium">{t("budget.col.category")}</th>
                <th className="px-2 py-1.5 font-medium">{t("budget.col.kind")}</th>
                <th className="px-2 py-1.5 font-medium">{t("payment.paidBy")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("budget.col.amount")}</th>
                <th className="w-24 px-4" />
              </tr>
            </thead>
            <tbody>
              {m.graph.expenses.map((e) => (
                <tr
                  key={e.id}
                  className={cn("border-line border-b last:border-0", e.kind === "planned" && "tentative")}
                >
                  <td className="px-4 py-2 text-fg-2">{f.date(e.spent_on, "short")}</td>
                  <td className="px-2 py-2">{e.title}</td>
                  <td className="px-2 py-2 text-fg-2">{t(`expenseCategory.${e.category}`)}</td>
                  <td className="px-2 py-2">
                    <Badge tone={e.kind === "planned" ? "neutral" : e.kind === "refund" ? "info" : "accent"}>
                      {t(`expenseKind.${e.kind}`)}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-fg-2">
                    {m.graph.travelers.find((x) => x.id === e.paid_by)?.name ?? "—"}
                  </td>
                  <td className="tabular px-2 py-2 text-right font-medium">
                    {f.minor(e.kind === "refund" ? -e.amount_minor : e.amount_minor, e.currency)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      {m.graph.travelers.length > 1 && (
                        <IconButton
                          label={t("budget.split")}
                          onClick={() => setSplit({ booking_id: null, expense_id: e.id, title: e.title })}
                        >
                          <Split className="size-3.5" />
                        </IconButton>
                      )}
                      <IconButton label={t("common.edit")} onClick={() => setExpense(e)}>
                        <Pencil className="size-3.5" />
                      </IconButton>
                      <IconButton
                        label={t("common.delete")}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: t("budget.deleteExpense", { title: e.title }),
                              confirm: t("common.delete"),
                              danger: true,
                            })
                          )
                            await run(() => api.remove("expense", e.id));
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <p className="text-fg-3 text-xs">
        {t("budget.ratesHint")}{" "}
        <Link to="/settings" className="text-primary hover:underline">
          {t("budget.manageRates")}
        </Link>
      </p>
      {expense && <ExpenseDialog expense={expense} onClose={() => setExpense(null)} />}
      {split && <SplitDialog target={split} onClose={() => setSplit(null)} />}
    </div>
  );
}

function BudgetBars() {
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

function SettlementCard({
  onSplit,
}: {
  onSplit: (t: { booking_id: string | null; expense_id: string | null; title: string }) => void;
}) {
  const t = useT();
  const f = useFormat();
  const { rates } = usePrefs();
  const m = useTrip();
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

function ExpenseDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const [e, setE] = useState(expense);
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setE({ ...e, [k]: v });
  const valid = e.title.trim() && e.amount_minor > 0;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={m.graph.expenses.some((x) => x.id === e.id) ? t("budget.editExpense") : t("budget.addExpense")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={async () =>
              (await run(() => api.save({ type: "expense", row: { ...e, title: e.title.trim() } }))) !==
                undefined && onClose()
            }
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("budget.col.title")} className="col-span-2" htmlFor="ex-title">
          <Input id="ex-title" autoFocus value={e.title} onChange={(x) => set("title", x.target.value)} />
        </Field>
        <Field label={t("budget.col.kind")} hint={t(`expenseKindHint.${e.kind}`)} htmlFor="ex-kind">
          <Select id="ex-kind" value={e.kind} onChange={(x) => set("kind", x.target.value as ExpenseKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`expenseKind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("budget.col.category")} htmlFor="ex-cat">
          <Select
            id="ex-cat"
            value={e.category}
            onChange={(x) => set("category", x.target.value as ExpenseCategory)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`expenseCategory.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("budget.col.amount")} htmlFor="ex-amount">
          <MoneyInput
            id="ex-amount"
            value={e.amount_minor || null}
            currency={e.currency}
            onChange={(v) => set("amount_minor", v ?? 0)}
            onCurrencyChange={(c) => set("currency", c)}
          />
        </Field>
        <Field label={t("budget.col.date")} htmlFor="ex-date">
          <DateInput id="ex-date" value={e.spent_on} onChange={(v) => set("spent_on", v)} />
        </Field>
        <Field label={t("payment.paidBy")} htmlFor="ex-by">
          <Select id="ex-by" value={e.paid_by ?? ""} onChange={(x) => set("paid_by", x.target.value || null)}>
            <option value="">{t("payment.unassigned")}</option>
            {m.graph.travelers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("budget.relatedBooking")} htmlFor="ex-bk">
          <Select
            id="ex-bk"
            value={e.booking_id ?? ""}
            onChange={(x) => set("booking_id", x.target.value || null)}
          >
            <option value="">—</option>
            {m.graph.bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {m.item(b.option_id)?.option.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("option.notesField")} className="col-span-2" htmlFor="ex-notes">
          <Textarea
            id="ex-notes"
            rows={2}
            value={e.notes ?? ""}
            onChange={(x) => set("notes", nil(x.target.value))}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function SplitDialog({
  target,
  onClose,
}: {
  target: { booking_id: string | null; expense_id: string | null; title: string };
  onClose: () => void;
}) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const existing = m.graph.cost_shares.filter((c) =>
    target.booking_id ? c.booking_id === target.booking_id : c.expense_id === target.expense_id,
  );
  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      m.graph.travelers.map((x) => [
        x.id,
        existing.length ? Number(existing.find((c) => c.traveler_id === x.id)?.weight ?? 0) : 1,
      ]),
    ),
  );
  const save = async () => {
    const ok = await run(async () => {
      for (const c of existing) await api.remove("cost_share", c.id);
      const equal = Object.values(weights).every((w) => w === 1);
      if (!equal) {
        for (const [traveler_id, weight] of Object.entries(weights)) {
          const row: CostShare = {
            id: newId(),
            booking_id: target.booking_id,
            expense_id: target.expense_id,
            traveler_id,
            weight,
          };
          await api.save({ type: "cost_share", row });
        }
      }
      return true;
    });
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t("split.dialogTitle", { title: target.title })}
      description={t("split.dialogHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={Object.values(weights).every((w) => w === 0)} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {m.graph.travelers.map((x) => (
          <div key={x.id} className="flex items-center gap-3">
            <span className="flex-1 text-sm">{x.name}</span>
            <div className="w-24">
              <NumberInput
                min={0}
                max={100}
                value={weights[x.id] ?? 0}
                onChange={(v) => setWeights({ ...weights, [x.id]: v ?? 0 })}
              />
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
