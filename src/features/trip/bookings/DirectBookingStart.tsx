import { useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { OptionBundle, Slot, SlotKind } from "@/domain/types";
import { useT } from "@/i18n";
import { newBundle, newSlot, SLOT_KINDS } from "@/lib/rows";
import { Button, Field, Select } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { useTrip } from "../TripLayout";

/** First step of a booking without prior alternatives: pick the slot it fills (or a new one). */
export function DirectBookingStart({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (slot: Slot, bundle: OptionBundle) => void;
}) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const [choice, setChoice] = useState<string>("new:flight");
  const start = async () => {
    let slot: Slot | undefined;
    if (choice.startsWith("new:")) {
      const kind = choice.slice(4) as SlotKind;
      slot = newSlot(m.graph.trip.id, kind, t(`slotDefault.${kind}`), m.graph.slots.length);
      const s = slot;
      if ((await run(() => api.save({ type: "slot", row: s }))) === undefined) return;
    } else slot = m.graph.slots.find((s) => s.id === choice);
    if (!slot) return;
    onStart(
      slot,
      newBundle(slot, m.graph.trip.currency, m.graph.options.filter((o) => o.slot_id === slot.id).length),
    );
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t("bookings.addDirect")}
      description={t("bookings.directHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={start}>
            {t("common.continue")}
          </Button>
        </>
      }
    >
      <Field label={t("bookings.directSlot")} htmlFor="db-slot">
        <Select id="db-slot" value={choice} onChange={(e) => setChoice(e.target.value)}>
          <optgroup label={t("bookings.newSlot")}>
            {SLOT_KINDS.map((k) => (
              <option key={k} value={`new:${k}`}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </optgroup>
          {m.graph.slots.length > 0 && (
            <optgroup label={t("bookings.existingSlot")}>
              {m.graph.slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
    </Dialog>
  );
}
