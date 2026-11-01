import { useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { CostShare, Expense, ExpenseCategory, ExpenseKind } from "@/domain/types";
import { useT } from "@/i18n";
import { newId, nil } from "@/lib/rows";
import { Button, Field, Input, Select, Textarea } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput, MoneyInput, NumberInput } from "@/ui/inputs";
import { useTrip } from "../TripLayout";

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

export function ExpenseDialog({ expense, onClose }: { expense: Expense; onClose: () => void }) {
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

export function SplitDialog({
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
