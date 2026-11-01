import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { PlanItem } from "@/domain/items";
import type { PriceObservation } from "@/domain/types";
import { useT } from "@/i18n";
import { bundleOf } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { newId, nil, nowIso } from "@/lib/rows";
import { Button, Checkbox, Field, Input } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { MoneyInput } from "@/ui/inputs";
import { PriceChart } from "@/ui/PriceChart";
import { useTrip } from "../TripLayout";

export function PriceCheckDialog({ item, onClose }: { item: PlanItem | null; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const [price, setPrice] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [apply, setApply] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    setPrice(item?.option.price_minor ?? null);
    setNotes("");
    setApply(false);
    setTarget(item?.option.target_price_minor ?? null);
  }, [item]);
  const history = useMemo(
    () => (item ? m.graph.price_observations.filter((p) => p.option_id === item.option.id) : []),
    [item, m.graph],
  );
  if (!item) return null;
  const save = async () => {
    if (price === null) return;
    const obs: PriceObservation = {
      id: newId(),
      option_id: item.option.id,
      observed_at: nowIso(),
      price_minor: price,
      currency: item.option.currency,
      kind: "manual_check",
      provider: item.option.platform ?? item.option.provider,
      attributes: null,
      notes: nil(notes),
    };
    const ok = await run(async () => {
      await api.save({ type: "price_observation", row: obs });
      const targetChanged = target !== item.option.target_price_minor;
      if ((apply || targetChanged) && item.activeBookings.length === 0) {
        const option = apply
          ? { ...item.option, price_minor: price, price_verified_at: obs.observed_at }
          : item.option;
        await api.saveOption(
          { ...bundleOf(m, item), option: { ...option, target_price_minor: target } },
          false,
        );
      }
      return true;
    }, t("priceWatch.recorded"));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t("priceWatch.recordTitle", { title: item.option.title })}
      description={t("priceWatch.recordHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={price === null} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-fg-3 text-sm">
          {t("priceWatch.savedPrice")}:{" "}
          <span className="tabular text-fg">{f.minor(item.option.price_minor, item.option.currency)}</span>
        </div>
        <Field label={t("priceWatch.observedPrice")} htmlFor="pc-price">
          <MoneyInput id="pc-price" value={price} currency={item.option.currency} onChange={setPrice} />
        </Field>
        <Field label={t("option.notesField")} htmlFor="pc-notes">
          <Input
            id="pc-notes"
            value={notes}
            placeholder={t("priceWatch.notesPlaceholder")}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {item.activeBookings.length === 0 && (
          <>
            <Checkbox
              label={t("priceWatch.applyToOption")}
              checked={apply}
              onChange={(e) => setApply(e.target.checked)}
            />
            <Field label={t("priceWatch.target")} hint={t("priceWatch.targetHint")} htmlFor="pc-target">
              <MoneyInput
                id="pc-target"
                value={target}
                currency={item.option.currency}
                placeholder={t("common.notSet")}
                onChange={setTarget}
              />
            </Field>
          </>
        )}
        {history.length > 0 && (
          <div>
            <h4 className="mb-1 font-medium text-fg-2 text-xs">{t("priceWatch.history")}</h4>
            <PriceChart
              points={history
                .filter((h) => h.currency === item.option.currency)
                .map((h) => ({ at: h.observed_at, minor: h.price_minor }))}
              saved={item.option.price_minor}
              target={target}
              currency={item.option.currency}
              height={150}
            />
            <ul className="text-sm">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="tabular flex justify-between border-line border-b py-1 last:border-0"
                >
                  <span className="text-fg-3">{f.timestamp(h.observed_at)}</span>
                  <span>{f.minor(h.price_minor, h.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
