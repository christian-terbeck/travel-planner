import { Ban, CirclePlus, FileText, MoreHorizontal, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useRemove } from "@/api/queries";
import { type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import type { Booking, OptionBundle } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat, usePrefs } from "@/lib/prefs";
import { SLOT_KINDS } from "@/lib/rows";
import { Badge, Button, Card, cn, EmptyState, IconButton, Segmented } from "@/ui/core";
import { useConfirm } from "@/ui/dialog";
import { KindIcon, PaymentBadge } from "@/ui/status";
import { BookingDialog, type BookingDraft } from "./BookingDialog";
import { BookingEditDialog, CancelDialog, PaymentDialog } from "./bookings/BookingDialogs";
import { CancellationCell } from "./bookings/CancellationCell";
import { DirectBookingStart } from "./bookings/DirectBookingStart";
import { ConfirmationImport } from "./ConfirmationImport";
import { ProviderLine, useWhen } from "./itemText";
import { OptionEditor } from "./OptionEditor";
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
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [drafting, setDrafting] = useState<BookingDraft | null>(null);
  const [importing, setImporting] = useState(false);
  const { aiImport } = usePrefs();
  // A confirmation dropped on the trip arrives here as navigation state and is read at once.
  const location = useLocation();
  const navigate = useNavigate();
  const [dropped, setDropped] = useState<string | null>(null);
  useEffect(() => {
    const path = (location.state as { importPath?: string } | null)?.importPath;
    if (!path) return;
    setDropped(path);
    setImporting(true);
    navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);
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
        {aiImport && (
          <Button icon={<Sparkles className="size-4" />} onClick={() => setImporting(true)}>
            {t("confirmation.button")}
          </Button>
        )}
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
          if (drafting) setDraft({ ...drafting, bundle });
          setDrafting(null);
        }}
      />
      <BookingDialog draft={draft} onClose={() => setDraft(null)} />
      <ConfirmationImport
        open={importing}
        initialPath={dropped}
        onClose={() => {
          setImporting(false);
          setDropped(null);
        }}
        onStart={(d) => {
          setImporting(false);
          setDropped(null);
          setDrafting(d);
        }}
      />
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
  const remove = useRemove();
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
                    <ProviderLine
                      provider={b.provider}
                      platform={b.platform}
                      url={b.url}
                      segments={(segs.length ? segs : (item?.segments ?? [])).map((s) => s.segment)}
                    />
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
                              await remove("booking", [b.id], t("bookings.deleted"));
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

function plannedPrice(b: Booking): number | null {
  try {
    const snap = JSON.parse(b.snapshot) as OptionBundle;
    return snap.option.currency === b.currency ? snap.option.price_minor : null;
  } catch {
    return null;
  }
}
