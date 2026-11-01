import { Check } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { CostShare, ExpenseCategory } from "@/domain/types";
import { useT } from "@/i18n";
import type { TripModel } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { newExpense, newId } from "@/lib/rows";
import { Button, cn, Field, Input } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput, MoneyInput } from "@/ui/inputs";

const QUICK_CATEGORIES: ExpenseCategory[] = [
  "food",
  "public_transport",
  "fuel",
  "parking",
  "tolls",
  "shopping",
  "fees",
  "misc",
];

/** The currency, payer and category used last in this trip, so repeated entries need fewer taps. */
function lastUsed(m: TripModel) {
  const last = m.graph.expenses
    .filter((e) => e.kind === "actual")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
  return {
    currency: last?.currency ?? m.graph.trip.currency,
    paidBy: last?.paid_by ?? m.graph.travelers[0]?.id ?? null,
  };
}

/**
 * Records money spent on the way in a few taps: amount, what for, who paid and for whom. Saved as
 * an actual expense; a split other than "everyone" is stored as equal shares of those chosen.
 */
export function QuickExpenseDialog({ model: m, onClose }: { model: TripModel; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const run = useAction();
  const travelers = m.graph.travelers;
  const fresh = () => {
    const l = lastUsed(m);
    return {
      ...newExpense(m.graph.trip.id, l.currency),
      category: "food" as ExpenseCategory,
      paid_by: l.paidBy,
    };
  };
  const [e, setE] = useState(fresh);
  const [forWhom, setForWhom] = useState<string[]>(() => travelers.map((x) => x.id));
  const [saved, setSaved] = useState(0);

  const [missing, setMissing] = useState(false);
  // The amount is taken when its field is left, so the buttons stay enabled and check it here.
  const valid = travelers.length <= 1 || forWhom.length > 0;
  const save = async (again: boolean) => {
    if (e.amount_minor <= 0) {
      setMissing(true);
      document.getElementById("qe-amount")?.focus();
      return;
    }
    setMissing(false);
    const title = e.title.trim() || t(`expenseCategory.${e.category}`);
    const row = { ...e, title };
    const everyone = forWhom.length === travelers.length;
    const ok = await run(
      async () => {
        await api.save({ type: "expense", row });
        if (!everyone)
          for (const traveler_id of forWhom) {
            const share: CostShare = {
              id: newId(),
              booking_id: null,
              expense_id: row.id,
              traveler_id,
              weight: 1,
            };
            await api.save({ type: "cost_share", row: share });
          }
        return true;
      },
      t("quickExpense.saved", { amount: f.minor(row.amount_minor, row.currency), title }),
    );
    if (!ok) return;
    if (!again) return onClose();
    setE({ ...fresh(), currency: row.currency, paid_by: row.paid_by, spent_on: row.spent_on });
    setSaved((n) => n + 1);
    requestAnimationFrame(() => document.getElementById("qe-amount")?.focus());
  };
  const toggle = (id: string) => setForWhom((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  const chip = (on: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm transition-colors",
      on ? "border-primary bg-primary-soft text-primary" : "border-line text-fg-2 hover:bg-surface-2",
    );

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t("quickExpense.title", { trip: m.graph.trip.title })}
      description={saved > 0 ? t("quickExpense.savedCount", { count: saved }) : t("quickExpense.hint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button disabled={!valid} onClick={() => save(true)}>
            {t("quickExpense.saveNext")}
          </Button>
          <Button
            variant="primary"
            icon={<Check className="size-4" />}
            disabled={!valid}
            onClick={() => save(false)}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("budget.col.amount")}
            htmlFor="qe-amount"
            error={missing ? t("quickExpense.amountMissing") : undefined}
          >
            <MoneyInput
              id="qe-amount"
              autoFocus
              value={e.amount_minor || null}
              currency={e.currency}
              placeholder="0"
              invalid={missing}
              onChange={(v) => setE((x) => ({ ...x, amount_minor: v ?? 0 }))}
              onCurrencyChange={(c) => setE((x) => ({ ...x, currency: c }))}
            />
          </Field>
          <Field label={t("budget.col.date")} htmlFor="qe-date">
            <DateInput
              id="qe-date"
              value={e.spent_on}
              onChange={(v) => setE((x) => ({ ...x, spent_on: v }))}
            />
          </Field>
          <Field label={t("quickExpense.what")} className="col-span-2" htmlFor="qe-title">
            <Input
              id="qe-title"
              value={e.title}
              placeholder={t(`expenseCategory.${e.category}`)}
              onChange={(x) => setE({ ...e, title: x.target.value })}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 font-medium text-fg-2 text-xs">{t("budget.col.category")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={e.category === c}
                className={chip(e.category === c)}
                onClick={() => setE({ ...e, category: c })}
              >
                {t(`expenseCategory.${c}`)}
              </button>
            ))}
          </div>
        </fieldset>
        {travelers.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 font-medium text-fg-2 text-xs">{t("payment.paidBy")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {travelers.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={e.paid_by === x.id}
                  className={chip(e.paid_by === x.id)}
                  onClick={() => setE({ ...e, paid_by: x.id })}
                >
                  {x.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {travelers.length > 1 && (
          <fieldset>
            <legend className="mb-1.5 font-medium text-fg-2 text-xs">{t("quickExpense.forWhom")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {travelers.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={forWhom.includes(x.id)}
                  className={chip(forWhom.includes(x.id))}
                  onClick={() => toggle(x.id)}
                >
                  {x.name}
                </button>
              ))}
            </div>
            {forWhom.length === 0 && <p className="mt-1 text-danger text-xs">{t("quickExpense.nobody")}</p>}
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}
