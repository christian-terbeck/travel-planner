import {
  Ban,
  BookmarkCheck,
  CircleCheck,
  Copy,
  LineChart,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { PlanItem } from "@/domain/items";
import { scenarioSelection } from "@/domain/scenarios";
import type { OptionBundle, Slot, SlotKind } from "@/domain/types";
import { useT } from "@/i18n";
import { bundleOf, type TripModel } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { newBundle, newScenario, newSlot, SLOT_KINDS } from "@/lib/rows";
import { useTripUi } from "@/lib/tripUi";
import { Badge, Button, Card, Checkbox, cn, EmptyState, IconButton, Segmented } from "@/ui/core";
import { useConfirm } from "@/ui/dialog";
import { CancellationBadge, Certainty, KindIcon, StatusBadge } from "@/ui/status";
import { BookingDialog } from "./BookingDialog";
import { ExternalUrl, useDuration, useWhen } from "./itemText";
import { OptionEditor } from "./OptionEditor";
import { PriceCheckDialog } from "./planning/PriceCheckDialog";
import { SlotDialog } from "./planning/SlotDialog";
import { ScenariosPanel } from "./ScenariosPanel";
import { useTrip } from "./TripLayout";

const KINDS = SLOT_KINDS;

/** Selects (or clears) an option for its slot in the preferred scenario, creating it if needed. */
export function useSelectInPlan(m: TripModel) {
  const run = useAction();
  const t = useT();
  return (slotId: string, optionId: string | null) => {
    const g = m.graph;
    const preferred = g.scenarios.find((s) => s.preferred);
    const scenario = preferred ?? { ...newScenario(g.trip.id, t("scenario.defaultName")), preferred: true };
    const sel = preferred ? scenarioSelection(g, preferred.id) : new Map<string, string | null>();
    if (optionId) sel.set(slotId, optionId);
    else sel.delete(slotId);
    const selections = [...sel].map(([slot_id, option_id]) => ({
      scenario_id: scenario.id,
      slot_id,
      option_id,
    }));
    return run(() => api.saveScenario(scenario, selections));
  };
}

export function PlanningView() {
  const t = useT();
  const [mode, setMode] = useState<"alternatives" | "compare">("alternatives");
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label={t("planning.mode")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "alternatives", label: t("planning.alternatives") },
          { value: "compare", label: t("planning.compare") },
        ]}
      />
      {mode === "alternatives" ? <Alternatives /> : <ScenariosPanel />}
    </div>
  );
}

function Alternatives() {
  const t = useT();
  const m = useTrip();
  const run = useAction();
  const confirm = useConfirm();
  const [slotEdit, setSlotEdit] = useState<{ slot: Slot; isNew: boolean } | null>(null);
  const [optionEdit, setOptionEdit] = useState<{ bundle: OptionBundle; slot: Slot; booked: boolean } | null>(
    null,
  );
  const [booking, setBooking] = useState<PlanItem | null>(null);
  const [priceCheck, setPriceCheck] = useState<PlanItem | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const g = m.graph;

  const slots = [...g.slots].sort(
    (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || Number(a.sort) - Number(b.sort),
  );

  const addSlot = (kind: SlotKind) =>
    setSlotEdit({ slot: newSlot(g.trip.id, kind, t(`slotDefault.${kind}`), g.slots.length), isNew: true });

  const duplicate = async (item: PlanItem) => {
    await run(
      () => api.duplicateOption(item.option.id, t("option.copyOf", { title: item.option.title })),
      t("option.duplicated"),
    );
  };
  const remove = async (item: PlanItem) => {
    if (
      !(await confirm({
        title: t("option.deleteTitle", { title: item.option.title }),
        text: t("option.deleteText"),
        confirm: t("common.delete"),
        danger: true,
      }))
    )
      return;
    await run(() => api.remove("option", item.option.id), t("option.deleted"));
  };
  const setDecision = (item: PlanItem, decision: "none" | "favorite" | "rejected") =>
    run(() => api.saveOption({ ...bundleOf(m, item), option: { ...item.option, decision } }, false));

  return (
    <>
      <div className="flex items-center gap-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="primary" icon={<Plus className="size-4" />}>
              {t("planning.addSlot")}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 text-sm shadow-lg"
            >
              {KINDS.map((k) => (
                <DropdownMenu.Item
                  key={k}
                  onSelect={() => addSlot(k)}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2"
                >
                  <KindIcon kind={k} />
                  {t(`kind.${k}`)}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <p className="flex-1 text-fg-3 text-sm">{t("planning.hint")}</p>
        <Checkbox
          label={t("planning.showRejected")}
          checked={showRejected}
          onChange={(e) => setShowRejected(e.target.checked)}
        />
      </div>

      {slots.length === 0 ? (
        <Card>
          <EmptyState
            title={t("planning.emptyTitle")}
            text={t("planning.emptyText")}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {KINDS.slice(0, 4).map((k) => (
                  <Button key={k} icon={<KindIcon kind={k} />} onClick={() => addSlot(k)}>
                    {t(`kind.${k}`)}
                  </Button>
                ))}
              </div>
            }
          />
        </Card>
      ) : (
        slots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            showRejected={showRejected}
            onEditSlot={() => setSlotEdit({ slot, isNew: false })}
            onAdd={() =>
              setOptionEdit({
                bundle: newBundle(
                  slot,
                  g.trip.currency,
                  g.options.filter((o) => o.slot_id === slot.id).length,
                ),
                slot,
                booked: false,
              })
            }
            onEdit={(item) =>
              setOptionEdit({ bundle: bundleOf(m, item), slot, booked: item.activeBookings.length > 0 })
            }
            onDuplicate={duplicate}
            onDelete={remove}
            onBook={setBooking}
            onPriceCheck={setPriceCheck}
            onDecision={setDecision}
          />
        ))
      )}

      <SlotDialog state={slotEdit} onClose={() => setSlotEdit(null)} />
      <OptionEditor
        open={!!optionEdit}
        onOpenChange={(o) => !o && setOptionEdit(null)}
        bundle={optionEdit?.bundle ?? null}
        slot={optionEdit?.slot ?? null}
        booked={optionEdit?.booked ?? false}
      />
      <BookingDialog item={booking} onClose={() => setBooking(null)} />
      <PriceCheckDialog item={priceCheck} onClose={() => setPriceCheck(null)} />
    </>
  );
}

function SlotCard({
  slot,
  showRejected,
  onEditSlot,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  onBook,
  onPriceCheck,
  onDecision,
}: {
  slot: Slot;
  showRejected: boolean;
  onEditSlot: () => void;
  onAdd: () => void;
  onEdit: (i: PlanItem) => void;
  onDuplicate: (i: PlanItem) => void;
  onDelete: (i: PlanItem) => void;
  onBook: (i: PlanItem) => void;
  onPriceCheck: (i: PlanItem) => void;
  onDecision: (i: PlanItem, d: "none" | "favorite" | "rejected") => void;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const when = useWhen();
  const duration = useDuration();
  const selectInPlan = useSelectInPlan(m);
  const [ui, setUi] = useTripUi(m.graph.trip.id);
  const selectedRef = useRef<HTMLTableRowElement>(null);
  const items = [...m.ctx.items.values()].filter((i) => i.slot.id === slot.id);
  const visible = items.filter(
    (i) => showRejected || i.option.decision !== "rejected" || i.activeBookings.length > 0,
  );
  const hidden = items.length - visible.length;
  const chosen = m.plan.selection.get(slot.id);
  const station = m.graph.stations.find((s) => s.id === slot.station_id);

  // Cheapest priced option in the slot (same currency only), to show differences.
  const priced = visible.filter(
    (i) => i.estimate.missing.length === 0 && Object.keys(i.estimate.totals).length === 1,
  );
  const chosenItem = chosen ? m.item(chosen) : undefined;
  const refCurrency = chosenItem ? Object.keys(chosenItem.estimate.totals)[0] : undefined;
  const refTotal =
    chosenItem && refCurrency && chosenItem.estimate.missing.length === 0
      ? chosenItem.estimate.totals[refCurrency]
      : undefined;

  useEffect(() => {
    if (ui.selectedOptionId && items.some((i) => i.option.id === ui.selectedOptionId)) {
      selectedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [ui.selectedOptionId, items]);

  return (
    <Card>
      <div className="flex items-center gap-2 border-line border-b px-4 py-2.5">
        <span className="text-fg-3">
          <KindIcon kind={slot.kind} />
        </span>
        <h3 className="font-semibold text-sm">{slot.title}</h3>
        {station && <Badge tone="primary">{station.name}</Badge>}
        {!slot.required && <Badge>{t("slot.optional")}</Badge>}
        {!chosen && slot.required && items.length > 0 && <Badge tone="warn">{t("slot.noneSelected")}</Badge>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={onAdd}>
            {t("planning.addOption")}
          </Button>
          <IconButton label={t("slot.edit")} onClick={onEditSlot}>
            <Pencil className="size-3.5" />
          </IconButton>
        </div>
      </div>
      {visible.length === 0 ? (
        <p className="px-4 py-4 text-fg-3 text-sm">
          {hidden > 0 ? t("planning.onlyRejected", { count: hidden }) : t("planning.noOptions")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-line border-b text-left text-fg-3 text-xs">
                <th className="w-8 px-3 py-1.5 font-medium">
                  <span className="sr-only">{t("planning.inPlan")}</span>
                </th>
                <th className="px-2 py-1.5 font-medium">{t("planning.col.option")}</th>
                <th className="px-2 py-1.5 font-medium">{t("planning.col.when")}</th>
                <th className="px-2 py-1.5 font-medium">{t("planning.col.duration")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("planning.col.price")}</th>
                <th className="px-2 py-1.5 font-medium">{t("planning.col.cancellation")}</th>
                <th className="px-2 py-1.5 font-medium">{t("planning.col.status")}</th>
                <th className="w-24 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const status = m.effectiveStatus(item);
                const isChosen = chosen === item.option.id;
                const booked = item.activeBookings.length > 0;
                const cur = Object.keys(item.estimate.totals)[0];
                const total = cur ? item.estimate.totals[cur] : undefined;
                const diff =
                  refTotal !== undefined &&
                  total !== undefined &&
                  cur === refCurrency &&
                  !isChosen &&
                  item.estimate.missing.length === 0
                    ? total - refTotal
                    : null;
                const lastObs = m.graph.price_observations
                  .filter((p) => p.option_id === item.option.id)
                  .at(-1);
                const firstBooking = item.activeBookings[0];
                const policy = firstBooking
                  ? m.cancellation(firstBooking).state
                  : item.policy
                    ? item.policy.policy_type
                    : "unknown";
                const selected = ui.selectedOptionId === item.option.id;
                return (
                  <tr
                    key={item.option.id}
                    ref={selected ? selectedRef : undefined}
                    onClick={() => setUi({ selectedOptionId: item.option.id })}
                    className={cn(
                      "border-line border-b last:border-0",
                      selected && "bg-primary-soft/50",
                      status === "rejected" || status === "cancelled" ? "text-fg-3" : "",
                      (status === "planned" || status === "idea") && "tentative",
                    )}
                  >
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        disabled={booked}
                        onClick={(e) => {
                          e.stopPropagation();
                          void selectInPlan(slot.id, isChosen ? null : item.option.id);
                        }}
                        className={cn(
                          "rounded p-0.5",
                          isChosen ? "text-primary" : "text-fg-3 hover:text-fg",
                          booked && "cursor-default",
                        )}
                        aria-pressed={isChosen}
                        aria-label={isChosen ? t("planning.removeFromPlan") : t("planning.addToPlan")}
                        title={
                          booked
                            ? t("planning.bookedInPlan")
                            : isChosen
                              ? t("planning.removeFromPlan")
                              : t("planning.addToPlan")
                        }
                      >
                        {booked ? (
                          <BookmarkCheck className="size-4 text-ok" />
                        ) : (
                          <CircleCheck className={cn("size-4", isChosen && "fill-primary-soft")} />
                        )}
                      </button>
                    </td>
                    <td className="max-w-64 px-2 py-2 align-top">
                      <div
                        className={cn(
                          "flex items-center gap-1.5 font-medium",
                          (status === "rejected" || status === "cancelled") && "line-through",
                        )}
                      >
                        {item.option.decision === "favorite" && (
                          <Star
                            className="size-3.5 shrink-0 fill-accent text-accent"
                            aria-label={t("decision.favorite")}
                          />
                        )}
                        <span className="truncate">{item.option.title}</span>
                        {item.option.rating ? (
                          <span className="text-accent text-xs">
                            {"★".repeat(Number(item.option.rating))}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-fg-3 text-xs">
                        {[item.option.provider, item.option.platform].filter(Boolean).join(" · ")}
                        <ExternalUrl url={item.option.url} />
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top text-xs">{when(item)}</td>
                    <td className="whitespace-nowrap px-2 py-2 align-top text-xs">{duration(item)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right align-top">
                      {booked ? (
                        <div className="tabular font-medium">
                          {f.totals(
                            Object.fromEntries(
                              item.activeBookings
                                .filter((b) => b.price_minor !== null)
                                .map((b) => [b.currency, b.price_minor as number]),
                            ),
                          )}
                        </div>
                      ) : (
                        <div className="tabular font-medium">
                          {Object.keys(item.estimate.totals).length
                            ? f.totals(item.estimate.totals, { compact: true })
                            : "—"}
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-1 text-[11px] text-fg-3">
                        {booked ? (
                          <Certainty kind="confirmed" />
                        ) : item.estimate.missing.length > 0 ? (
                          <Certainty kind="incomplete" />
                        ) : !item.option.price_verified_at ? (
                          <Certainty kind="unverified" />
                        ) : (
                          <span
                            title={t("option.verifiedAt", { at: f.timestamp(item.option.price_verified_at) })}
                          >
                            {f.date(item.option.price_verified_at.slice(0, 10), "short")}
                          </span>
                        )}
                        {diff !== null && diff !== 0 && (
                          <span className={diff < 0 ? "text-ok" : "text-danger"}>
                            {f.minor(diff, cur as string, { signed: true, compact: true })}
                          </span>
                        )}
                      </div>
                      {lastObs && !booked && (
                        <div className="text-[11px] text-fg-3" title={t("priceWatch.lastObserved")}>
                          {t("priceWatch.observedShort", {
                            price: f.minor(lastObs.price_minor, lastObs.currency, { compact: true }),
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <CancellationBadge state={policyState(policy)} />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-center justify-end gap-0.5">
                        {!booked && (
                          <Button
                            size="sm"
                            variant="subtle"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBook(item);
                            }}
                          >
                            {t("planning.book")}
                          </Button>
                        )}
                        <OptionMenu
                          item={item}
                          onEdit={onEdit}
                          onDuplicate={onDuplicate}
                          onDelete={onDelete}
                          onPriceCheck={onPriceCheck}
                          onDecision={onDecision}
                          onBook={onBook}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {priced.length > 1 && (
            <p className="border-line border-t px-4 py-1.5 text-[11px] text-fg-3">{t("planning.diffHint")}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function policyState(p: string) {
  const map: Record<string, Parameters<typeof CancellationBadge>[0]["state"]> = {
    free_until: "free",
    with_fee: "with_fee",
    partially_refundable: "partial",
    non_refundable: "non_refundable",
    unknown: "unknown",
  };
  return map[p] ?? (p as Parameters<typeof CancellationBadge>[0]["state"]);
}

function OptionMenu({
  item,
  onEdit,
  onDuplicate,
  onDelete,
  onPriceCheck,
  onDecision,
  onBook,
}: {
  item: PlanItem;
  onEdit: (i: PlanItem) => void;
  onDuplicate: (i: PlanItem) => void;
  onDelete: (i: PlanItem) => void;
  onPriceCheck: (i: PlanItem) => void;
  onDecision: (i: PlanItem, d: "none" | "favorite" | "rejected") => void;
  onBook: (i: PlanItem) => void;
}) {
  const t = useT();
  const cls =
    "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-fg-3";
  const booked = item.bookings.length > 0;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={t("common.more")} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 text-sm shadow-lg"
        >
          <DropdownMenu.Item className={cls} onSelect={() => onEdit(item)}>
            <Pencil /> {t("common.edit")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cls} onSelect={() => onDuplicate(item)}>
            <Copy /> {t("option.duplicate")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cls} onSelect={() => onPriceCheck(item)}>
            <LineChart /> {t("priceWatch.record")}
          </DropdownMenu.Item>
          {item.activeBookings.length > 0 &&
            item.kind === "flight" &&
            item.segments.some((s) => !s.segment.booking_id) && (
              <DropdownMenu.Item className={cls} onSelect={() => onBook(item)}>
                <BookmarkCheck /> {t("booking.bookRemaining")}
              </DropdownMenu.Item>
            )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {item.option.decision !== "favorite" && (
            <DropdownMenu.Item className={cls} onSelect={() => onDecision(item, "favorite")}>
              <Star /> {t("decision.markFavorite")}
            </DropdownMenu.Item>
          )}
          {item.option.decision !== "rejected" && item.activeBookings.length === 0 && (
            <DropdownMenu.Item className={cls} onSelect={() => onDecision(item, "rejected")}>
              <Ban /> {t("decision.markRejected")}
            </DropdownMenu.Item>
          )}
          {item.option.decision !== "none" && (
            <DropdownMenu.Item className={cls} onSelect={() => onDecision(item, "none")}>
              <span className="size-4" /> {t("decision.clear")}
            </DropdownMenu.Item>
          )}
          {!booked && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                className={cn(cls, "text-danger [&_svg]:text-danger")}
                onSelect={() => onDelete(item)}
              >
                <Trash2 /> {t("common.delete")}
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
