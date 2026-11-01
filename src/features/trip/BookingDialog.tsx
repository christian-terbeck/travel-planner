import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import type { Booking, CancellationPolicy, OptionBundle, Payment, PaymentStatus, Slot } from "@/domain/types";
import { useT } from "@/i18n";
import { bundleOf } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { newBooking, newId, newPayment, newPolicy, nil } from "@/lib/rows";
import { Button, Checkbox, Field, Input, Select, Textarea } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput, MoneyInput } from "@/ui/inputs";
import { PolicyEditor } from "./PolicyEditor";
import { useTrip } from "./TripLayout";

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid",
  "partially_paid",
  "paid",
  "not_applicable",
  "unknown",
  "refunded",
  "partially_refunded",
];

/** A booking of a new option, optionally prefilled from an imported confirmation. */
export interface BookingDraft {
  bundle: OptionBundle;
  slot: Slot;
  /** Booked values read from the confirmation (reference, date, payment status). */
  booking?: Booking;
  /** The confirmation file, attached to the booking once it is saved. */
  attachPath?: string;
}

/**
 * Turns a planned option into a confirmed booking (or books a new option directly). The planned
 * values stay on the option and in the booking's snapshot; the booked values are entered here.
 */
export function BookingDialog({
  item,
  draft,
  onClose,
}: {
  item?: PlanItem | null;
  draft?: BookingDraft | null;
  onClose: () => void;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const source: OptionBundle | null = item ? bundleOf(m, item) : (draft?.bundle ?? null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [policy, setPolicy] = useState<CancellationPolicy | null>(null);
  const [segments, setSegments] = useState<string[]>([]);
  const [payment, setPayment] = useState<Payment | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when a new target opens
  useEffect(() => {
    if (!source) return;
    const read = draft?.booking;
    const fresh = newBooking(source.option);
    const b = read
      ? {
          ...fresh,
          reference: read.reference,
          booked_on: read.booked_on,
          payment_status: read.payment_status,
          contact: read.contact ?? fresh.contact,
        }
      : fresh;
    setBooking(b);
    const offered = source.policy;
    setPolicy(offered ? { ...offered, id: newId(), option_id: null, booking_id: b.id } : null);
    setSegments(source.segments.filter((s) => !s.booking_id).map((s) => s.id));
    setPayment(null);
  }, [item?.option.id, draft?.bundle.option.id]);

  if (!source || !booking) return null;
  const o = source.option;
  const free = source.segments.filter((s) => !s.booking_id);
  const planned = item ? item.estimate : null;
  const plannedSame =
    planned &&
    planned.missing.length === 0 &&
    Object.keys(planned.totals).length === 1 &&
    planned.totals[booking.currency] !== undefined
      ? planned.totals[booking.currency]
      : null;
  const diff =
    plannedSame !== null && plannedSame !== undefined && booking.price_minor !== null
      ? booking.price_minor - plannedSame
      : null;
  const set = <K extends keyof Booking>(k: K, v: Booking[K]) => setBooking({ ...booking, [k]: v });

  const submit = async () => {
    const payments =
      payment && payment.amount_minor > 0
        ? [{ ...payment, booking_id: booking.id, currency: booking.currency }]
        : [];
    const id = await run(
      () =>
        api.createBooking({
          booking,
          policy: policy
            ? { ...policy, booking_id: booking.id, option_id: null, currency: booking.currency }
            : null,
          segment_ids: free.length > 1 ? segments : [],
          payments,
          new_option: draft ? draft.bundle : null,
        }),
      t("booking.created"),
    );
    if (id !== undefined && draft?.attachPath) {
      const path = draft.attachPath;
      await run(() => api.attachDocument(m.graph.trip.id, path, null, id), t("documents.attached"));
    }
    if (id !== undefined) onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={t("booking.title", { title: o.title })}
      description={t("booking.hint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} disabled={free.length > 1 && segments.length === 0}>
            {t("booking.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {item && (
          <div className="flex items-center gap-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
            <div>
              <div className="text-fg-3 text-xs">{t("booking.planned")}</div>
              <div className="tabular font-semibold">
                {planned && Object.keys(planned.totals).length
                  ? f.totals(planned.totals)
                  : t("common.unknownPrice")}
              </div>
            </div>
            <ArrowRight className="size-4 text-fg-3" aria-hidden />
            <div>
              <div className="text-fg-3 text-xs">{t("booking.actual")}</div>
              <div className="tabular font-semibold">{f.minor(booking.price_minor, booking.currency)}</div>
            </div>
            {diff !== null && diff !== 0 && (
              <div className={diff > 0 ? "text-danger" : "text-ok"}>
                {t(diff > 0 ? "booking.moreThanPlanned" : "booking.lessThanPlanned", {
                  amount: f.minor(Math.abs(diff), booking.currency),
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label={t("booking.price")} hint={t("booking.priceHint")} htmlFor="bk-price">
            <MoneyInput
              id="bk-price"
              value={booking.price_minor}
              currency={booking.currency}
              onChange={(v) => set("price_minor", v)}
              onCurrencyChange={(c) => set("currency", c)}
            />
          </Field>
          <Field label={t("option.provider")} htmlFor="bk-prov">
            <Input
              id="bk-prov"
              value={booking.provider ?? ""}
              onChange={(e) => set("provider", nil(e.target.value))}
            />
          </Field>
          <Field label={t("option.platform")} htmlFor="bk-plat">
            <Input
              id="bk-plat"
              value={booking.platform ?? ""}
              onChange={(e) => set("platform", nil(e.target.value))}
            />
          </Field>
          <Field label={t("booking.reference")} htmlFor="bk-ref">
            <Input
              id="bk-ref"
              autoFocus
              value={booking.reference ?? ""}
              placeholder="ABC123"
              onChange={(e) => set("reference", nil(e.target.value))}
            />
          </Field>
          <Field label={t("booking.bookedOn")} htmlFor="bk-on">
            <DateInput id="bk-on" value={booking.booked_on} onChange={(v) => set("booked_on", v)} />
          </Field>
          <Field label={t("booking.paymentStatus")} htmlFor="bk-ps">
            <Select
              id="bk-ps"
              value={booking.payment_status}
              onChange={(e) => set("payment_status", e.target.value as PaymentStatus)}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`payment.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("option.url")} className="col-span-2" htmlFor="bk-url">
            <Input
              id="bk-url"
              type="url"
              value={booking.url ?? ""}
              onChange={(e) => set("url", nil(e.target.value))}
            />
          </Field>
          <Field label={t("option.contact")} htmlFor="bk-contact">
            <Input
              id="bk-contact"
              value={booking.contact ?? ""}
              onChange={(e) => set("contact", nil(e.target.value))}
            />
          </Field>
        </div>

        {free.length > 1 && (
          <section>
            <h4 className="mb-1 font-semibold text-sm">{t("booking.segments")}</h4>
            <p className="mb-2 text-fg-3 text-xs">{t("booking.segmentsHint")}</p>
            <div className="flex flex-col gap-1.5">
              {free.map((s) => (
                <Checkbox
                  key={s.id}
                  checked={segments.includes(s.id)}
                  onChange={(e) =>
                    setSegments(e.target.checked ? [...segments, s.id] : segments.filter((x) => x !== s.id))
                  }
                  label={`${s.flight_number ?? ""} ${segmentFrom(s) ?? "?"} → ${segmentTo(s) ?? "?"} · ${f.local(s.depart_local, s.depart_tz)}`}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold text-sm">{t("booking.payment")}</h4>
            {!payment && (
              <Button
                size="sm"
                onClick={() =>
                  setPayment({
                    ...newPayment(booking.id, booking.currency),
                    amount_minor: booking.price_minor ?? 0,
                  })
                }
              >
                {t("booking.recordPayment")}
              </Button>
            )}
          </div>
          {payment ? (
            <PaymentFields payment={payment} onChange={setPayment} currency={booking.currency} />
          ) : (
            <p className="text-fg-3 text-xs">{t("booking.noPayment")}</p>
          )}
        </section>

        <section>
          <h4 className="mb-2 font-semibold text-sm">{t("booking.cancellation")}</h4>
          <PolicyEditor
            policy={policy}
            onChange={setPolicy}
            create={() => newPolicy({ booking_id: booking.id }, booking.currency)}
            defaultTz={source.policy?.deadline_tz}
          />
        </section>

        <Field label={t("option.notesField")} htmlFor="bk-notes">
          <Textarea
            id="bk-notes"
            rows={2}
            value={booking.notes ?? ""}
            onChange={(e) => set("notes", nil(e.target.value))}
          />
        </Field>
      </div>
    </Dialog>
  );
}

export function PaymentFields({
  payment,
  onChange,
  currency,
}: {
  payment: Payment;
  onChange: (p: Payment) => void;
  currency: string;
}) {
  const t = useT();
  const m = useTrip();
  return (
    <div className="grid grid-cols-4 gap-3">
      <Field label={t("payment.kind")} htmlFor="pay-kind">
        <Select
          id="pay-kind"
          value={payment.kind}
          onChange={(e) => onChange({ ...payment, kind: e.target.value as Payment["kind"] })}
        >
          <option value="payment">{t("payment.kinds.payment")}</option>
          <option value="refund">{t("payment.kinds.refund")}</option>
        </Select>
      </Field>
      <Field label={t("payment.amount")} htmlFor="pay-amount">
        <MoneyInput
          id="pay-amount"
          value={payment.amount_minor}
          currency={currency}
          onChange={(v) => onChange({ ...payment, amount_minor: v ?? 0 })}
        />
      </Field>
      <Field label={t("payment.date")} htmlFor="pay-date">
        <DateInput
          id="pay-date"
          value={payment.paid_on}
          onChange={(v) => onChange({ ...payment, paid_on: v })}
        />
      </Field>
      <Field label={t("payment.paidBy")} htmlFor="pay-by">
        <Select
          id="pay-by"
          value={payment.traveler_id ?? ""}
          onChange={(e) => onChange({ ...payment, traveler_id: e.target.value || null })}
        >
          <option value="">{t("payment.unassigned")}</option>
          {m.graph.travelers.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("payment.method")} className="col-span-4" htmlFor="pay-method">
        <Input
          id="pay-method"
          value={payment.method ?? ""}
          placeholder={t("payment.methodPlaceholder")}
          onChange={(e) => onChange({ ...payment, method: nil(e.target.value) })}
        />
      </Field>
    </div>
  );
}
