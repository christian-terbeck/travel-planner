import { Pencil, Plus, Split, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useRemove } from "@/api/queries";
import type { Converted } from "@/domain/money";
import type { Expense } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { newExpense } from "@/lib/rows";
import { Badge, Button, Card, CardHeader, cn, EmptyState, IconButton, Stat } from "@/ui/core";
import { useConfirm } from "@/ui/dialog";
import { Certainty } from "@/ui/status";
import { BudgetBars, SettlementCard } from "./budget/BudgetCards";
import { ExpenseDialog, SplitDialog } from "./budget/ExpenseDialogs";
import { QuickExpenseDialog } from "./budget/QuickExpenseDialog";
import { useTrip } from "./TripLayout";

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
  const remove = useRemove();
  const confirm = useConfirm();
  // Opened from the dashboard or the command palette with { quickExpense: true }.
  const location = useLocation();
  const navigate = useNavigate();
  const [quick, setQuick] = useState(false);
  useEffect(() => {
    if (!(location.state as { quickExpense?: boolean } | null)?.quickExpense) return;
    setQuick(true);
    navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);

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
            <div className="flex gap-1.5">
              <Button size="sm" icon={<Zap className="size-3.5" />} onClick={() => setQuick(true)}>
                {t("quickExpense.button")}
              </Button>
              <Button
                size="sm"
                icon={<Plus className="size-3.5" />}
                onClick={() => setExpense(newExpense(m.graph.trip.id, cur))}
              >
                {t("budget.addExpense")}
              </Button>
            </div>
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
                            await remove("expense", [e.id]);
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
      {quick && <QuickExpenseDialog model={m} onClose={() => setQuick(false)} />}
    </div>
  );
}
