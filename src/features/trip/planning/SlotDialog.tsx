import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import type { Slot, SlotKind } from "@/domain/types";
import { useT } from "@/i18n";
import { nil, SLOT_KINDS } from "@/lib/rows";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { useTrip } from "../TripLayout";

export function SlotDialog({
  state,
  onClose,
}: {
  state: { slot: Slot; isNew: boolean } | null;
  onClose: () => void;
}) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const removeRow = useRemove();
  const confirm = useConfirm();
  const [s, setS] = useState<Slot | null>(null);
  useEffect(() => setS(state?.slot ?? null), [state]);
  if (!s || !state) return null;
  const hasOptions = m.graph.options.some((o) => o.slot_id === s.id);
  const save = async () => {
    if ((await run(() => api.save({ type: "slot", row: { ...s, title: s.title.trim() } }))) !== undefined)
      onClose();
  };
  const remove = async () => {
    if (
      !(await confirm({
        title: t("slot.deleteTitle", { title: s.title }),
        text: t("slot.deleteText"),
        confirm: t("common.delete"),
        danger: true,
      }))
    )
      return;
    if (await removeRow("slot", [s.id], t("slot.deleted"))) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={state.isNew ? t("slot.newTitle", { kind: t(`kind.${s.kind}`) }) : t("slot.edit")}
      description={state.isNew ? t("slot.newHint") : undefined}
      footer={
        <>
          {!state.isNew && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={remove}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!s.title.trim()} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t("slot.title")} htmlFor="slot-title">
          <Input
            id="slot-title"
            autoFocus
            value={s.title}
            onChange={(e) => setS({ ...s, title: e.target.value })}
          />
        </Field>
        <Field
          label={t("slot.kind")}
          hint={hasOptions ? t("slot.kindLocked") : undefined}
          htmlFor="slot-kind"
        >
          <Select
            id="slot-kind"
            value={s.kind}
            disabled={hasOptions}
            onChange={(e) => setS({ ...s, kind: e.target.value as SlotKind })}
          >
            {SLOT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("slot.station")} htmlFor="slot-st">
          <Select
            id="slot-st"
            value={s.station_id ?? ""}
            onChange={(e) => setS({ ...s, station_id: e.target.value || null })}
          >
            <option value="">{t("slot.noStation")}</option>
            {m.graph.stations.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          label={t("slot.required")}
          checked={s.required}
          onChange={(e) => setS({ ...s, required: e.target.checked })}
        />
        <p className="-mt-2 pl-6 text-fg-3 text-xs">{t("slot.requiredHint")}</p>
        <Field label={t("option.notesField")} htmlFor="slot-notes">
          <Textarea
            id="slot-notes"
            rows={2}
            value={s.notes ?? ""}
            onChange={(e) => setS({ ...s, notes: nil(e.target.value) })}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/** Records a manually checked price. It never replaces the saved price unless asked to. */
