import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FileSearch, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ExtractedBooking } from "@/api/bindings/ExtractedBooking";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { useErrorText, useT } from "@/i18n";
import { useAirports } from "@/lib/airports";
import { bookingFromExtraction, bundleFromExtraction, slotKindOf } from "@/lib/confirmationImport";
import { usePrefs } from "@/lib/prefs";
import { newSlot } from "@/lib/rows";
import { Button, Field, Select, Spinner } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { KindIcon } from "@/ui/status";
import type { BookingDraft } from "./BookingDialog";
import { useTrip } from "./TripLayout";

type Step =
  | { k: "idle" }
  | { k: "reading"; path: string }
  | { k: "review"; path: string; result: ExtractedBooking }
  | { k: "failed"; message: string };

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * Reads a booking confirmation with Claude and hands the proposal to the normal booking forms,
 * where the user checks and completes it. The file is sent only after the user picked it here.
 */
export function ConfirmationImport({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (draft: BookingDraft) => void;
}) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const errorText = useErrorText();
  const { language } = usePrefs();
  const airports = useAirports();
  const [step, setStep] = useState<Step>({ k: "idle" });
  const [target, setTarget] = useState("new");

  const close = () => {
    setStep({ k: "idle" });
    onClose();
  };
  const pick = async () => {
    const path = await openDialog({
      multiple: false,
      filters: [
        {
          name: t("confirmation.files"),
          extensions: ["pdf", "png", "jpg", "jpeg", "webp", "eml", "txt", "html", "htm"],
        },
      ],
    });
    if (typeof path !== "string") return;
    setStep({ k: "reading", path });
    try {
      const result = await api.extractConfirmation(path, language);
      setTarget("new");
      setStep((s) => (s.k === "reading" && s.path === path ? { k: "review", path, result } : s));
    } catch (e) {
      setStep({ k: "failed", message: errorText(e) });
    }
  };

  const proceed = async () => {
    if (step.k !== "review") return;
    const e = step.result;
    const kind = slotKindOf(e);
    let slot = m.graph.slots.find((s) => s.id === target);
    if (!slot) {
      const s = newSlot(m.graph.trip.id, kind, e.title || t(`slotDefault.${kind}`), m.graph.slots.length);
      if ((await run(() => api.save({ type: "slot", row: s }))) === undefined) return;
      slot = s;
    }
    const bundle = bundleFromExtraction(e, {
      slot,
      tripCurrency: m.graph.trip.currency,
      sort: m.graph.options.filter((o) => o.slot_id === slot.id).length,
      airportTz: (code) => airports?.get(code)?.tz ?? null,
      source: fileName(step.path),
    });
    onStart({ bundle, slot, booking: bookingFromExtraction(e, bundle), attachPath: step.path });
    setStep({ k: "idle" });
  };

  const result = step.k === "review" ? step.result : null;
  const kind = result ? slotKindOf(result) : null;
  const sameKind = kind ? m.graph.slots.filter((s) => s.kind === kind) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden />
          {t("confirmation.title")}
        </span>
      }
      description={t("confirmation.hint")}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          {result ? (
            <Button variant="primary" onClick={proceed}>
              {t("confirmation.review")}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<FileSearch className="size-4" />}
              disabled={step.k === "reading"}
              onClick={pick}
            >
              {t("confirmation.pick")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {step.k === "idle" && <p className="text-fg-3 text-xs">{t("confirmation.privacy")}</p>}
        {step.k === "reading" && (
          <p className="flex items-center gap-2 text-fg-2">
            <Spinner className="size-4" />
            {t("confirmation.reading", { file: fileName(step.path) })}
          </p>
        )}
        {step.k === "failed" && <p className="text-danger">{step.message}</p>}
        {result && kind && (
          <>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <div className="flex items-center gap-2 font-medium">
                <KindIcon kind={kind} className="size-4 text-fg-3" />
                {result.title}
              </div>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-fg-2 text-xs">
                <dt>{t("slot.kind")}</dt>
                <dd>{t(`kind.${kind}`)}</dd>
                <dt>{t("booking.reference")}</dt>
                <dd className="font-mono">{result.reference ?? "—"}</dd>
                <dt>{t("option.price")}</dt>
                <dd className="tabular">
                  {result.price !== null
                    ? `${result.price} ${result.currency ?? ""}`
                    : t("common.unknownPrice")}
                </dd>
              </dl>
              {result.notes && <p className="mt-2 text-warn text-xs">{result.notes}</p>}
            </div>
            <Field label={t("confirmation.target")} htmlFor="ci-target">
              <Select id="ci-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">{t("confirmation.newSlot", { kind: t(`kind.${kind}`) })}</option>
                {sameKind.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-fg-3 text-xs">{t("confirmation.check")}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
