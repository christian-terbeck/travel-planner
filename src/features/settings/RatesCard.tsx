import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import type { ExchangeRate } from "@/domain/types";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { newId, nil, nowIso } from "@/lib/rows";
import { Button, Card, CardHeader, Field, IconButton, Input } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { CurrencySelect, DateInput } from "@/ui/inputs";
import { useToast } from "@/ui/toast";

export function RatesCard() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const remove = useRemove();
  const toast = useToast();
  const [draft, setDraft] = useState<ExchangeRate | null>(null);
  const create = (): ExchangeRate => ({
    id: newId(),
    base: "EUR",
    quote: "USD",
    rate: "",
    as_of: nowIso().slice(0, 10),
    source: null,
    created_at: nowIso(),
  });
  const valid =
    draft && /^\d+(\.\d+)?$/.test(draft.rate) && Number(draft.rate) > 0 && draft.base !== draft.quote;
  return (
    <Card>
      <CardHeader
        icon={<RefreshCcw className="size-4" />}
        title={t("rates.title")}
        subtitle={t("rates.hint")}
        actions={
          <div className="flex gap-2">
            {prefs.ecbRates && (
              <Button
                size="sm"
                icon={<RefreshCcw className="size-3.5" />}
                onClick={async () => {
                  const n = await run(() => api.fetchReferenceRates());
                  if (n !== undefined)
                    toast.show({ kind: "success", text: t("rates.ecbFetched", { count: n }) });
                }}
              >
                {t("rates.ecbNow")}
              </Button>
            )}
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDraft(create())}>
              {t("rates.add")}
            </Button>
          </div>
        }
      />
      {prefs.rates.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("rates.empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {prefs.rates.map((r) => (
              <tr key={r.id} className="border-line border-b last:border-0">
                <td className="tabular px-4 py-2">
                  1 {r.base} = {r.rate} {r.quote}
                </td>
                <td className="px-2 py-2 text-fg-3">{t("rates.asOf", { date: r.as_of })}</td>
                <td className="px-2 py-2 text-fg-3">{r.source}</td>
                <td className="px-4 py-2 text-right">
                  <IconButton label={t("common.delete")} onClick={() => remove("exchange_rate", [r.id])}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {draft && (
        <Dialog
          open
          size="sm"
          onOpenChange={(o) => !o && setDraft(null)}
          title={t("rates.add")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!valid}
                onClick={async () =>
                  (await run(() => api.save({ type: "exchange_rate", row: draft }))) !== undefined &&
                  setDraft(null)
                }
              >
                {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("rates.base")} htmlFor="r-base">
              <CurrencySelect
                id="r-base"
                value={draft.base}
                onChange={(c) => setDraft({ ...draft, base: c })}
                className="w-full"
              />
            </Field>
            <Field label={t("rates.quote")} htmlFor="r-quote">
              <CurrencySelect
                id="r-quote"
                value={draft.quote}
                onChange={(c) => setDraft({ ...draft, quote: c })}
                className="w-full"
              />
            </Field>
            <Field
              label={t("rates.rate", { base: draft.base, quote: draft.quote })}
              hint={t("rates.rateHint")}
              htmlFor="r-rate"
            >
              <Input
                id="r-rate"
                inputMode="decimal"
                value={draft.rate}
                placeholder="1.0825"
                onChange={(e) => setDraft({ ...draft, rate: e.target.value.replace(",", ".").trim() })}
              />
            </Field>
            <Field label={t("rates.date")} htmlFor="r-date">
              <DateInput
                id="r-date"
                value={draft.as_of}
                onChange={(v) => setDraft({ ...draft, as_of: v ?? draft.as_of })}
              />
            </Field>
            <Field label={t("rates.source")} className="col-span-2" htmlFor="r-src">
              <Input
                id="r-src"
                value={draft.source ?? ""}
                placeholder={t("rates.sourcePlaceholder")}
                onChange={(e) => setDraft({ ...draft, source: nil(e.target.value) })}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </Card>
  );
}
