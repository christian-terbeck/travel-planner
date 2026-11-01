import { Ban, CirclePlus, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { suggestedPaymentStatus } from "@/domain/budget";
import type { CancellationStatus } from "@/domain/cancellation";
import { type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import type {
  Booking,
  CancellationPolicy,
  OptionBundle,
  Payment,
  PaymentStatus,
  Slot,
  SlotKind,
} from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { newBundle, newPayment, newPolicy, newSlot, nil, nowIso, SLOT_KINDS } from "@/lib/rows";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  cn,
  EmptyState,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Textarea,
} from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { DateInput, DateTimeInput, MoneyInput } from "@/ui/inputs";
import { CancellationBadge, KindIcon, PaymentBadge } from "@/ui/status";
import { BookingDialog, PAYMENT_STATUSES, PaymentFields } from "./BookingDialog";
import { ExternalUrl, useWhen } from "./itemText";
import { OptionEditor } from "./OptionEditor";
import { PolicyEditor } from "./PolicyEditor";
import { useTrip } from "./TripLayout";

type Filter = "active" | "cancelled" | "all";

export function BookingsView() {
  const t = useT();
  const m = useTrip();
  const [filter, setFilter] = useState<Filter>("active");
  const [edit, setEdit] = useState<Booking | null>(null);
  const [pay, setPay] = useState<Booking | null>(null);
  const [cancel, setCancel] = useState<Booking | null>(null);
  const [direct, setDirect] = useState(false);
  const [draft, setDraft] = useState<{ bundle: OptionBundle; slot: Slot } | null>(null);
  const [drafting, setDrafting] = useState<{ bundle: OptionBundle; slot: Slot } | null>(null);
  const bookings = m.graph.bookings.filter((b) => filter === "all" || b.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Segmented
          label={t("bookings.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: t("bookings.active") },
            { value: "cancelled", label: t("bookings.cancelled") },
            { value: "all", label: t("bookings.all") },
          ]}
        />
        <p className="flex-1 text-fg-3 text-sm">{t("bookings.hint")}</p>
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDirect(true)}>
          {t("bookings.addDirect")}
        </Button>
      </div>
      <Card>
        {bookings.length === 0 ? (
          <EmptyState title={t("bookings.emptyTitle")} text={t("bookings.emptyText")} />
        ) : (
          <BookingTable bookings={bookings} onEdit={setEdit} onPay={setPay} onCancel={setCancel} />
        )}
      </Card>
      {edit && <BookingEditDialog booking={edit} onClose={() => setEdit(null)} />}
      {pay && <PaymentDialog booking={pay} onClose={() => setPay(null)} />}
      {cancel && <CancelDialog booking={cancel} onClose={() => setCancel(null)} />}
      <DirectBookingStart
        open={direct}
        onClose={() => setDirect(false)}
        onStart={(slot, bundle) => {
          setDirect(false);
          setDrafting({ bundle, slot });
        }}
      />
      <OptionEditor
        open={!!drafting}
        onOpenChange={(o) => !o && setDrafting(null)}
        bundle={drafting?.bundle ?? null}
        slot={drafting?.slot ?? null}
        booked={false}
        onDraft={(bundle) => {
          if (drafting) setDraft({ bundle, slot: drafting.slot });
          setDrafting(null);
        }}
      />
      <BookingDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}

function BookingTable({
  bookings,
  onEdit,
  onPay,
  onCancel,
}: {
  bookings: Booking[];
  onEdit: (b: Booking) => void;
  onPay: (b: Booking) => void;
  onCancel: (b: Booking) => void;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const when = useWhen();
  const run = useAction();
  const confirm = useConfirm();
  const kinds = SLOT_KINDS;
  const sorted = [...bookings].sort((a, b) => {
    const ia = m.item(a.option_id);
    const ib = m.item(b.option_id);
    return (
      kinds.indexOf(ia?.kind ?? "other") - kinds.indexOf(ib?.kind ?? "other") ||
      (ia?.start?.epochMilliseconds ?? 0) - (ib?.start?.epochMilliseconds ?? 0)
    );
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-line border-b text-left text-fg-3 text-xs">
            <th className="px-4 py-2 font-medium">{t("bookings.col.booking")}</th>
            <th className="px-2 py-2 font-medium">{t("planning.col.when")}</th>
            <th className="px-2 py-2 font-medium">{t("booking.reference")}</th>
            <th className="px-2 py-2 text-right font-medium">{t("bookings.col.price")}</th>
            <th className="px-2 py-2 font-medium">{t("bookings.col.payment")}</th>
            <th className="px-2 py-2 font-medium">{t("planning.col.cancellation")}</th>
            <th className="w-10 px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const item = m.item(b.option_id) as PlanItem | undefined;
            const planned = plannedPrice(b);
            const diff = planned !== null && b.price_minor !== null ? b.price_minor - planned : null;
            const pays = m.graph.payments.filter((p) => p.booking_id === b.id);
            const paid = pays.reduce(
              (s, p) =>
                s +
                (p.currency === b.currency ? (p.kind === "refund" ? -p.amount_minor : p.amount_minor) : 0),
              0,
            );
            const cs = m.cancellation(b);
            const docs = m.graph.documents.filter((d) => d.booking_id === b.id).length;
            const segs = item?.segments.filter((s) => s.segment.booking_id === b.id) ?? [];
            return (
              <tr
                key={b.id}
                className={cn(
                  "border-line border-b align-top last:border-0",
                  b.status === "cancelled" && "text-fg-3",
                )}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 font-medium">
                    {item && <KindIcon kind={item.kind} className="size-4 text-fg-3" />}
                    <span className={cn(b.status === "cancelled" && "line-through")}>
                      {item?.option.title ?? "?"}
                    </span>
                    {b.status === "cancelled" && <Badge tone="danger">{t("status.cancelled")}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-fg-3 text-xs">
                    {[b.provider, b.platform].filter(Boolean).join(" · ")}
                    <ExternalUrl url={b.url} />
                    {docs > 0 && (
                      <span className="inline-flex items-center gap-0.5">
                        <FileText className="size-3" aria-hidden />
                        {docs}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-xs">
                  {segs.length > 0 && item && segs.length < item.segments.length
                    ? segs
                        .map(
                          (s) =>
                            `${segmentFrom(s.segment) ?? "?"}→${segmentTo(s.segment) ?? "?"} ${f.date(s.segment.depart_local?.slice(0, 10), "short")}`,
                        )
                        .join(" · ")
                    : item
                      ? when(item)
                      : "—"}
                </td>
                <td className="px-2 py-2.5 font-mono text-xs">
                  {b.reference ?? <span className="font-sans text-fg-3">{t("booking.noReference")}</span>}
                </td>
                <td className="tabular whitespace-nowrap px-2 py-2.5 text-right">
                  <div className="font-medium">{f.minor(b.price_minor, b.currency)}</div>
                  {diff !== null && diff !== 0 && (
                    <div
                      className={cn("text-[11px]", diff > 0 ? "text-danger" : "text-ok")}
                      title={t("bookings.vsPlanned")}
                    >
                      {f.minor(diff, b.currency, { signed: true })} {t("bookings.vsPlannedShort")}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <PaymentBadge status={b.payment_status} />
                  {b.price_minor !== null && b.status === "active" && (
                    <div className="tabular mt-0.5 text-[11px] text-fg-3">
                      {t("bookings.paidOf", {
                        paid: f.minor(paid, b.currency, { compact: true }),
                        total: f.minor(b.price_minor, b.currency, { compact: true }),
                      })}
                    </div>
                  )}
                  {b.status === "cancelled" && b.refund_final_minor !== null && (
                    <div className="tabular mt-0.5 text-[11px]">
                      {t("bookings.refunded", { amount: f.minor(b.refund_final_minor, b.currency) })}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <CancellationCell s={cs} />
                </td>
                <td className="px-4 py-2.5">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <IconButton label={t("common.more")}>
                        <MoreHorizontal className="size-4" />
                      </IconButton>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 text-sm shadow-lg"
                      >
                        <MenuItem icon={<Pencil />} onSelect={() => onEdit(b)}>
                          {t("bookings.edit")}
                        </MenuItem>
                        <MenuItem icon={<CirclePlus />} onSelect={() => onPay(b)}>
                          {t("bookings.addPayment")}
                        </MenuItem>
                        {b.status === "active" && (
                          <MenuItem icon={<Ban />} onSelect={() => onCancel(b)}>
                            {t("bookings.cancel")}
                          </MenuItem>
                        )}
                        <DropdownMenu.Separator className="my-1 h-px bg-line" />
                        <MenuItem
                          danger
                          icon={<Trash2 />}
                          onSelect={async () => {
                            if (
                              await confirm({
                                title: t("bookings.deleteTitle"),
                                text: t("bookings.deleteText"),
                                confirm: t("common.delete"),
                                danger: true,
                              })
                            ) {
                              await run(() => api.remove("booking", b.id), t("bookings.deleted"));
                            }
                          }}
                        >
                          {t("bookings.delete")}
                        </MenuItem>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onSelect,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-3",
        danger && "text-danger [&_svg]:text-danger",
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

export function CancellationCell({ s }: { s: CancellationStatus }) {
  const t = useT();
  const f = useFormat();
  return (
    <div>
      <CancellationBadge state={s.state} />
      {s.deadline && s.state !== "cancelled" && (
        <div
          className={cn(
            "mt-0.5 text-[11px]",
            s.minutesLeft !== null && s.minutesLeft > 0 && s.minutesLeft < 7 * 1440
              ? "text-warn"
              : "text-fg-3",
          )}
        >
          {s.minutesLeft !== null && s.minutesLeft > 0
            ? t("cancellation.until", { date: f.dateTime(s.deadline, s.policy?.deadline_tz ?? "UTC") })
            : t("cancellation.ended", { date: f.date(s.deadline.toString().slice(0, 10), "short") })}
          {s.deadlineApproximate && ` (${t("cancellation.tzUnknown")})`}
        </div>
      )}
      {s.refundable && s.state !== "cancelled" && s.state !== "non_refundable" && (
        <div className="tabular text-[11px] text-fg-3">
          {t("cancellation.refundable", { amount: f.money(s.refundable) })}
        </div>
      )}
      {s.policy?.checked_at && (
        <div className="text-[11px] text-fg-3">
          {t("cancellation.checked", { date: f.date(s.policy.checked_at.slice(0, 10), "short") })}
        </div>
      )}
    </div>
  );
}

function plannedPrice(b: Booking): number | null {
  try {
    const snap = JSON.parse(b.snapshot) as OptionBundle;
    return snap.option.currency === b.currency ? snap.option.price_minor : null;
  } catch {
    return null;
  }
}

function BookingEditDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
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
            <Input
              id="be-prov"
              value={b.provider ?? ""}
              onChange={(e) => set("provider", nil(e.target.value))}
            />
          </Field>
          <Field label={t("option.platform")} htmlFor="be-plat">
            <Input
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
              onChange={(e) => set("url", nil(e.target.value))}
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
  const run = useAction();
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
            <IconButton label={t("common.delete")} onClick={() => run(() => api.remove("payment", p.id))}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PaymentDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
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

function CancelDialog({ booking, onClose }: { booking: Booking; onClose: () => void }) {
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

const KINDS = SLOT_KINDS;

/** First step of a booking without prior alternatives: pick the slot it fills (or a new one). */
function DirectBookingStart({
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
            {KINDS.map((k) => (
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
