import { Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import { suggestedPaymentStatus } from "@/domain/budget";
import type { Booking, CancellationPolicy, OptionBundle, Payment, PaymentStatus } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { fillFromUrl } from "@/lib/providers";
import { newPayment, newPolicy, nil, nowIso } from "@/lib/rows";
import { Badge, Button, Checkbox, Field, IconButton, Input, Select, Textarea } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput, DateTimeInput, MoneyInput } from "@/ui/inputs";
import { ProviderInput } from "@/ui/provider";
import { PAYMENT_STATUSES, PaymentFields } from "../BookingDialog";
import { PolicyEditor } from "../PolicyEditor";
import { useTrip } from "../TripLayout";
import { CancellationCell } from "./CancellationCell";

export function BookingEditDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const [b, setB] = useState(booking);
  const [policy, setPolicy] = useState<CancellationPolicy | null>(
    m.graph.cancellation_policies.find((p) => p.booking_id === booking.id) ?? null,
  );
  const set = <K extends keyof Booking>(k: K, v: Booking[K]) => setB({ ...b, [k]: v });
  const snapshot = (() => {
    try {
      return JSON.parse(b.snapshot) as OptionBundle;
    } catch {
      return null;
    }
  })();
  const history = m.graph.change_log.filter((c) => c.entity_id === b.id || c.entity_id === b.option_id);
  const save = async () => {
    if (
      (await run(
        () => api.updateBooking(b, policy ? { ...policy, currency: b.currency } : null),
        t("bookings.saved"),
      )) !== undefined
    )
      onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t("bookings.editTitle", { title: m.item(b.option_id)?.option.title ?? "" })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {snapshot && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-fg-2 text-sm">
            {t("bookings.snapshot", {
              price: f.minor(snapshot.option.price_minor, snapshot.option.currency),
              date: f.timestamp(b.created_at),
            })}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("booking.price")} htmlFor="be-price">
            <MoneyInput
              id="be-price"
              value={b.price_minor}
              currency={b.currency}
              onChange={(v) => set("price_minor", v)}
              onCurrencyChange={(c) => set("currency", c)}
            />
          </Field>
          <Field label={t("booking.reference")} htmlFor="be-ref">
            <Input
              id="be-ref"
              value={b.reference ?? ""}
              onChange={(e) => set("reference", nil(e.target.value))}
            />
          </Field>
          <Field label={t("booking.bookedOn")} htmlFor="be-on">
            <DateInput id="be-on" value={b.booked_on} onChange={(v) => set("booked_on", v)} />
          </Field>
          <Field label={t("option.provider")} htmlFor="be-prov">
            <ProviderInput
              id="be-prov"
              value={b.provider ?? ""}
              onChange={(e) => set("provider", nil(e.target.value))}
            />
          </Field>
          <Field label={t("option.platform")} htmlFor="be-plat">
            <ProviderInput
              id="be-plat"
              value={b.platform ?? ""}
              onChange={(e) => set("platform", nil(e.target.value))}
            />
          </Field>
          <Field label={t("booking.paymentStatus")} htmlFor="be-ps">
            <Select
              id="be-ps"
              value={b.payment_status}
              onChange={(e) => set("payment_status", e.target.value as PaymentStatus)}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`payment.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("option.url")} className="col-span-2" htmlFor="be-url">
            <Input
              id="be-url"
              type="url"
              value={b.url ?? ""}
              onChange={(e) => {
                const url = nil(e.target.value);
                setB({ ...b, ...fillFromUrl(b, url), url });
              }}
            />
          </Field>
          <Field label={t("option.contact")} htmlFor="be-contact">
            <Input
              id="be-contact"
              value={b.contact ?? ""}
              onChange={(e) => set("contact", nil(e.target.value))}
            />
          </Field>
        </div>
        <section>
          <h4 className="mb-2 font-semibold text-sm">{t("booking.cancellation")}</h4>
          <PolicyEditor
            policy={policy}
            onChange={setPolicy}
            create={() => newPolicy({ booking_id: b.id }, b.currency)}
          />
        </section>
        <Field label={t("option.notesField")} htmlFor="be-notes">
          <Textarea
            id="be-notes"
            rows={2}
            value={b.notes ?? ""}
            onChange={(e) => set("notes", nil(e.target.value))}
          />
        </Field>
        <PaymentsList booking={b} />
        {history.length > 0 && (
          <details>
            <summary className="cursor-pointer font-semibold text-sm">
              {t("bookings.history", { count: history.length })}
            </summary>
            <ul className="mt-2 text-xs">
              {history.map((h) => (
                <li key={h.id} className="flex gap-3 border-line border-b py-1 last:border-0">
                  <span className="w-36 shrink-0 text-fg-3">{f.timestamp(h.at)}</span>
                  <span className="w-32 shrink-0">{t(`history.${h.field}`, { defaultValue: h.field })}</span>
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {h.old_value ?? "—"} → {h.new_value ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Dialog>
  );
}

function PaymentsList({ booking }: { booking: Booking }) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const remove = useRemove();
  const pays = m.graph.payments.filter((p) => p.booking_id === booking.id);
  if (pays.length === 0) return null;
  return (
    <section>
      <h4 className="mb-1 font-semibold text-sm">{t("bookings.payments")}</h4>
      <ul className="text-sm">
        {pays.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-line border-b py-1.5 last:border-0">
            <span className="w-24 text-fg-3">{f.date(p.paid_on, "short")}</span>
            <Badge tone={p.kind === "refund" ? "info" : "neutral"}>{t(`payment.kinds.${p.kind}`)}</Badge>
            <span className="flex-1 text-fg-3 text-xs">
              {[m.graph.travelers.find((x) => x.id === p.traveler_id)?.name, p.method]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="tabular font-medium">
              {f.minor(p.kind === "refund" ? -p.amount_minor : p.amount_minor, p.currency)}
            </span>
            <IconButton label={t("common.delete")} onClick={() => remove("payment", [p.id])}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PaymentDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  // Prefilled with what is still open on the booking.
  const [p, setP] = useState<Payment>(() => {
    const own = m.graph.payments.filter(
      (x) => x.booking_id === booking.id && x.currency === booking.currency,
    );
    const net = own.reduce((sum, x) => sum + (x.kind === "refund" ? -x.amount_minor : x.amount_minor), 0);
    const open = (booking.price_minor ?? 0) - net;
    return { ...newPayment(booking.id, booking.currency), amount_minor: Math.max(open, 0) };
  });
  const [updateStatus, setUpdateStatus] = useState(true);
  const existing = m.graph.payments.filter(
    (x) => x.booking_id === booking.id && x.currency === booking.currency,
  );
  const sum = (kind: string, extra: number) =>
    existing.filter((x) => x.kind === kind).reduce((s, x) => s + x.amount_minor, 0) + extra;
  const suggestion = suggestedPaymentStatus(
    booking.price_minor,
    sum("payment", p.kind === "payment" ? p.amount_minor : 0),
    sum("refund", p.kind === "refund" ? p.amount_minor : 0),
  );
  const save = async () => {
    const ok = await run(async () => {
      await api.save({ type: "payment", row: { ...p, currency: booking.currency, created_at: nowIso() } });
      if (updateStatus && suggestion !== booking.payment_status) {
        await api.updateBooking(
          { ...booking, payment_status: suggestion },
          m.graph.cancellation_policies.find((x) => x.booking_id === booking.id) ?? null,
        );
      }
      return true;
    }, t("payment.recorded"));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("bookings.addPayment")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={p.amount_minor <= 0} onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <PaymentFields payment={p} onChange={setP} currency={booking.currency} />
        <Checkbox
          label={t("payment.updateStatus", { status: t(`payment.${suggestion}`) })}
          checked={updateStatus}
          onChange={(e) => setUpdateStatus(e.target.checked)}
        />
      </div>
    </Dialog>
  );
}

export function CancelDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const status = m.cancellation(booking);
  const [cancelledAt, setCancelledAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [refund, setRefund] = useState<number | null>(status.refundable?.minor ?? null);
  const [recordRefund, setRecordRefund] = useState(true);
  const [notes, setNotes] = useState("");
  const save = async () => {
    const ok = await run(async () => {
      await api.cancelBooking({
        booking_id: booking.id,
        requested_at: null,
        cancelled_at: new Date(cancelledAt).toISOString().replace(/\.\d{3}Z$/, "Z"),
        refund_final_minor: refund,
        notes: nil(notes),
      });
      if (recordRefund && refund && refund > 0) {
        await api.save({
          type: "payment",
          row: {
            ...newPayment(booking.id, booking.currency),
            kind: "refund",
            amount_minor: refund,
            notes: t("bookings.refundNote"),
          },
        });
      }
      return true;
    }, t("bookings.cancelledToast"));
    if (ok) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("bookings.cancelTitle", { title: m.item(booking.option_id)?.option.title ?? "" })}
      description={t("bookings.cancelHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.back")}
          </Button>
          <Button variant="danger" onClick={save}>
            {t("bookings.cancelConfirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <CancellationCell s={status} />
          {status.state === "unknown" && (
            <p className="mt-1 text-fg-3 text-xs">{t("bookings.cancelUnknown")}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("bookings.cancelledAt")} htmlFor="cx-at">
            <DateTimeInput
              id="cx-at"
              value={cancelledAt}
              onChange={(v) => setCancelledAt(v ?? cancelledAt)}
            />
          </Field>
          <Field
            label={t("bookings.refundFinal")}
            hint={
              status.refundable
                ? t("bookings.refundExpected", { amount: f.money(status.refundable) })
                : undefined
            }
            htmlFor="cx-ref"
          >
            <MoneyInput
              id="cx-ref"
              value={refund}
              currency={booking.currency}
              placeholder={t("common.notSet")}
              onChange={setRefund}
            />
          </Field>
        </div>
        <Checkbox
          label={t("bookings.recordRefund")}
          checked={recordRefund}
          onChange={(e) => setRecordRefund(e.target.checked)}
        />
        <Field label={t("option.notesField")} htmlFor="cx-notes">
          <Textarea id="cx-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
