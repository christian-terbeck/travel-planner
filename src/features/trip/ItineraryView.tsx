import { AlertTriangle, BedDouble, Eye, Moon, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { PlanItem } from "@/domain/items";
import { evaluate, scenarioSelection } from "@/domain/scenarios";
import { compareDate, dateRange, type PlainDate, Temporal, todayIn } from "@/domain/time";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { useTripUi } from "@/lib/tripUi";
import { Badge, Button, Card, Checkbox, cn, EmptyState, Segmented, Select } from "@/ui/core";
import { KindIcon, StatusBadge } from "@/ui/status";
import { type CalEvent, startOfWeek, tripEvents, unscheduled } from "../calendar/events";
import { AgendaView, eventClass, Legend, MonthView, WeekView } from "../calendar/views";
import { useTrip } from "./TripLayout";
import { useWarningText } from "./warnings";

type Mode = "days" | "month" | "week" | "agenda";

export function ItineraryView() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const [ui, setUi] = useTripUi(m.graph.trip.id);
  const [mode, setMode] = useState<Mode>("days");
  const [alternatives, setAlternatives] = useState(false);
  const previewScenario = m.graph.scenarios.find((s) => s.id === ui.previewScenarioId) ?? null;
  const previewSelection = useMemo(() => {
    if (!previewScenario) return null;
    const sel = scenarioSelection(m.graph, previewScenario.id);
    return sel;
  }, [previewScenario, m.graph]);
  const evaluation = useMemo(
    () => (previewSelection ? evaluate(m.ctx, new Map([...previewSelection, ...bookedOnly(m)])) : m.plan),
    [previewSelection, m],
  );
  const events = useMemo(
    () =>
      tripEvents(m, {
        previewSelection: evaluation === m.plan ? null : evaluation.selection,
        includeAlternatives: alternatives,
      }),
    [m, evaluation, alternatives],
  );
  const today = todayIn(() => Temporal.Now.instant(), m.tz);
  const start = evaluation.period.start ?? today;
  const [cursor, setCursor] = useState<PlainDate>(start);
  const open = (e: CalEvent) => setUi({ selectedOptionId: e.optionId });
  const selected = m.item(ui.selectedOptionId);
  const delta =
    evaluation !== m.plan && evaluation.complete && m.plan.complete
      ? evaluation.converted.minor - m.plan.converted.minor
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label={t("calendar.view")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "days", label: t("itinerary.days") },
            { value: "month", label: t("calendar.month") },
            { value: "week", label: t("calendar.week") },
            { value: "agenda", label: t("calendar.agenda") },
          ]}
        />
        <Select
          aria-label={t("itinerary.preview")}
          className="w-64"
          value={ui.previewScenarioId ?? ""}
          onChange={(e) => setUi({ previewScenarioId: e.target.value || null })}
        >
          <option value="">{t("itinerary.currentPlan")}</option>
          {m.graph.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {t("itinerary.previewOf", { name: s.name })}
              {s.preferred ? " ★" : ""}
            </option>
          ))}
        </Select>
        <Checkbox
          label={t("calendar.showAlternatives")}
          checked={alternatives}
          onChange={(e) => setAlternatives(e.target.checked)}
        />
        <div className="ml-auto">
          <Legend />
        </div>
      </div>

      {previewScenario && (
        <div className="flex items-center gap-3 rounded-lg border border-accent/50 bg-accent-soft px-4 py-2.5 text-sm">
          <Eye className="size-4 text-accent" aria-hidden />
          <span className="flex-1">
            {t("itinerary.previewBanner", { name: previewScenario.name })}
            {delta !== null && delta !== 0 && (
              <span className={cn("ml-2 font-medium", delta < 0 ? "text-ok" : "text-danger")}>
                {t("itinerary.previewDelta", { amount: f.minor(delta, m.budget.currency, { signed: true }) })}
              </span>
            )}
          </span>
          {!previewScenario.preferred && (
            <Button
              size="sm"
              icon={<Star className="size-3.5" />}
              onClick={() =>
                run(
                  () => api.setPreferredScenario(m.graph.trip.id, previewScenario.id),
                  t("scenario.preferredSet"),
                )
              }
            >
              {t("scenario.makePreferred")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="size-3.5" />}
            onClick={() => setUi({ previewScenarioId: null })}
          >
            {t("itinerary.endPreview")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {mode === "days" && (
            <DayByDay
              evaluation={evaluation}
              events={events}
              onOpen={open}
              selectedId={ui.selectedOptionId}
            />
          )}
          {mode === "month" && (
            <MonthNav cursor={cursor} setCursor={setCursor}>
              <MonthView
                month={Temporal.PlainYearMonth.from({ year: cursor.year, month: cursor.month })}
                events={events}
                today={today}
                onOpen={open}
                highlight={(d) => {
                  const k = d.toString();
                  if (evaluation.nights.gaps.some((g) => g.toString() === k)) return "gap";
                  if (
                    evaluation.period.start &&
                    evaluation.period.end &&
                    compareDate(d, evaluation.period.start) >= 0 &&
                    compareDate(d, evaluation.period.end) <= 0
                  )
                    return "trip";
                  return null;
                }}
              />
            </MonthNav>
          )}
          {mode === "week" && (
            <MonthNav cursor={cursor} setCursor={setCursor} week>
              <WeekView
                weekStart={startOfWeek(cursor)}
                events={events}
                today={today}
                tz={evaluation.period.journeys[0]?.segments.at(-1)?.segment.arrive_tz ?? m.tz}
                onOpen={open}
              />
            </MonthNav>
          )}
          {mode === "agenda" && <AgendaView events={events} onOpen={open} />}
        </div>
        <aside className="flex flex-col gap-4">
          {selected ? (
            <SelectedCard item={selected} onClose={() => setUi({ selectedOptionId: null })} />
          ) : (
            <UnscheduledCard />
          )}
        </aside>
      </div>
    </div>
  );
}

function bookedOnly(m: ReturnType<typeof useTrip>) {
  const out = new Map<string, string | null>();
  for (const i of m.ctx.items.values()) if (i.activeBookings.length > 0) out.set(i.slot.id, i.option.id);
  return out;
}

function MonthNav({
  cursor,
  setCursor,
  week,
  children,
}: {
  cursor: PlainDate;
  setCursor: (d: PlainDate) => void;
  week?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const f = useFormat();
  const ws = startOfWeek(cursor);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCursor(week ? cursor.subtract({ weeks: 1 }) : cursor.subtract({ months: 1 }))}
        >
          ‹ {t("calendar.previous")}
        </Button>
        <span className="font-semibold text-sm">
          {week ? f.dateRange(ws, ws.add({ days: 6 })) : f.month(cursor.year, cursor.month)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCursor(week ? cursor.add({ weeks: 1 }) : cursor.add({ months: 1 }))}
        >
          {t("calendar.next")} ›
        </Button>
      </div>
      {children}
    </div>
  );
}

/** The trip day by day: transport, stays, activities, and nights without a bed. */
function DayByDay({
  evaluation,
  events,
  onOpen,
  selectedId,
}: {
  evaluation: ReturnType<typeof useTrip>["plan"];
  events: CalEvent[];
  onOpen: (e: CalEvent) => void;
  selectedId: string | null;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const warningText = useWarningText(m);
  const { start, end } = evaluation.period;
  if (!start || !end) {
    return (
      <Card>
        <EmptyState title={t("itinerary.noPeriodTitle")} text={t("itinerary.noPeriodText")} />
      </Card>
    );
  }
  const days = dateRange(start, end.add({ days: 1 }));
  const gapSet = new Set(evaluation.nights.gaps.map(String));
  const openSet = new Set(evaluation.nights.open.map(String));
  const transitSet = new Set(evaluation.nights.transit.map(String));
  const stayFor = (d: PlainDate) =>
    evaluation.items.filter(
      (i) =>
        i.accommodation &&
        i.startDate &&
        i.endDate &&
        compareDate(i.startDate, d) <= 0 &&
        compareDate(i.endDate, d) > 0,
    );
  const dayWarnings = (d: PlainDate) =>
    evaluation.warnings.filter((w) => w.date === d.toString() && w.code !== "accommodation_gap");
  return (
    <ol className="flex flex-col gap-3">
      {days.map((d, i) => {
        const k = d.toString();
        const todays = events
          .filter((e) =>
            e.allDay
              ? e.firstDay.equals(d) || e.lastDay.equals(d)
              : e.firstDay.equals(d) || (e.kind === "flight" && e.lastDay.equals(d) && !e.firstDay.equals(d)),
          )
          .sort((a, b) => (a.start?.epochMilliseconds ?? 0) - (b.start?.epochMilliseconds ?? 0));
        const stays = stayFor(d);
        const lastDay = i === days.length - 1;
        return (
          <li key={k}>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-3 border-line border-b bg-surface-2 px-4 py-1.5">
                <span className="font-semibold text-sm">{t("itinerary.day", { n: i + 1 })}</span>
                <span className="text-fg-2 text-sm">{f.date(d, "long")}</span>
              </div>
              <ul className="divide-y divide-line">
                {todays.map((e) => {
                  const isEnd = e.allDay && e.lastDay.equals(d) && !e.firstDay.equals(d);
                  const label =
                    e.kind === "accommodation"
                      ? isEnd
                        ? t("itinerary.checkOut")
                        : t("itinerary.checkIn")
                      : e.kind === "rental_car"
                        ? isEnd
                          ? t("itinerary.carReturn")
                          : t("itinerary.carPickup")
                        : null;
                  const item = m.item(e.optionId);
                  const time =
                    e.kind === "flight"
                      ? e.firstDay.equals(d)
                        ? f.time(e.start, e.tz)
                        : f.time(
                            e.end,
                            item?.segments.find((s) => s.segment.id === e.key)?.segment.arrive_tz ?? e.tz,
                          )
                      : isEnd
                        ? f.time(e.end, e.tz)
                        : f.time(e.start, e.tz);
                  return (
                    <li key={`${e.key}-${k}`}>
                      <button
                        type="button"
                        onClick={() => onOpen(e)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-2",
                          selectedId === e.optionId && "bg-primary-soft/50",
                        )}
                      >
                        <span className="tabular w-12 shrink-0 text-fg-3 text-xs">{time}</span>
                        <span
                          className={cn(
                            "inline-flex size-6 shrink-0 items-center justify-center rounded",
                            eventClass(e),
                          )}
                        >
                          <KindIcon kind={e.kind} className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          {label && <span className="mr-1.5 text-fg-3 text-xs">{label}</span>}
                          <span className="font-medium">{e.title}</span>
                          {e.kind === "flight" && !e.firstDay.equals(d) && (
                            <span className="ml-1.5 text-fg-3 text-xs">({t("itinerary.arrives")})</span>
                          )}
                          {e.subtitle && <span className="ml-2 text-fg-3 text-xs">{e.subtitle}</span>}
                        </span>
                        {e.attention && (
                          <AlertTriangle className="size-4 text-warn" aria-label={t("calendar.attention")} />
                        )}
                        {item && <StatusBadge status={e.preview ? "preferred" : m.effectiveStatus(item)} />}
                        {e.preview && <Badge tone="accent">{t("calendar.preview")}</Badge>}
                      </button>
                    </li>
                  );
                })}
                {dayWarnings(d).map((w) => (
                  <li key={w.key} className="flex items-center gap-2 px-4 py-1.5 text-warn text-xs">
                    <AlertTriangle className="size-3.5" aria-hidden /> {warningText(w)}
                  </li>
                ))}
                {!lastDay && (
                  <li className="flex items-center gap-3 px-4 py-2 text-sm">
                    <Moon className="size-4 shrink-0 text-fg-3" aria-hidden />
                    {transitSet.has(k) ? (
                      <span className="text-fg-3">{t("itinerary.nightTransit")}</span>
                    ) : stays.length > 0 ? (
                      <span className="flex items-center gap-1.5">
                        <BedDouble className="size-3.5 text-fg-3" aria-hidden />
                        {stays.map((s) => s.option.title).join(" + ")}
                        {stays.length > 1 && <Badge tone="warn">{t("itinerary.doubleBooked")}</Badge>}
                      </span>
                    ) : gapSet.has(k) ? (
                      <span className="flex flex-1 items-center gap-2 text-warn">
                        {t("itinerary.nightGap")}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() =>
                            run(() =>
                              api.save({
                                type: "open_night",
                                row: { trip_id: m.graph.trip.id, night: k, note: null },
                              }),
                            )
                          }
                        >
                          {t("itinerary.markOpen")}
                        </Button>
                      </span>
                    ) : openSet.has(k) ? (
                      <span className="flex flex-1 items-center gap-2 text-fg-3">
                        {t("itinerary.nightOpen")}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => run(() => api.remove("open_night", m.graph.trip.id, k))}
                        >
                          {t("itinerary.unmarkOpen")}
                        </Button>
                      </span>
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </li>
                )}
              </ul>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function SelectedCard({ item, onClose }: { item: PlanItem; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  return (
    <Card>
      <div className="flex items-start gap-2 border-line border-b px-4 py-2.5">
        <KindIcon kind={item.kind} className="mt-0.5 size-4 text-fg-3" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm">{item.option.title}</h3>
          <p className="text-fg-3 text-xs">{item.slot.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-fg-3 hover:text-fg"
          aria-label={t("common.close")}
        >
          <X className="size-4" />
        </button>
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
        <dt className="text-fg-3">{t("planning.col.status")}</dt>
        <dd>
          <StatusBadge status={m.effectiveStatus(item)} />
        </dd>
        <dt className="text-fg-3">{t("planning.col.price")}</dt>
        <dd className="tabular">
          {item.activeBookings.length
            ? f.totals(Object.fromEntries(item.activeBookings.map((b) => [b.currency, b.price_minor ?? 0])))
            : f.totals(item.estimate.totals)}
        </dd>
        {item.segments.map((s) => (
          <div key={s.segment.id} className="contents">
            <dt className="text-fg-3">{`${s.segment.from_airport}→${s.segment.to_airport}`}</dt>
            <dd className="text-xs">
              {f.local(s.segment.depart_local, s.segment.depart_tz)}
              <br />
              {f.local(s.segment.arrive_local, s.segment.arrive_tz)}
            </dd>
          </div>
        ))}
        {item.accommodation && (
          <>
            <dt className="text-fg-3">{t("stay.checkIn")}</dt>
            <dd>{f.date(item.accommodation.check_in, "weekday")}</dd>
            <dt className="text-fg-3">{t("stay.checkOut")}</dt>
            <dd>{f.date(item.accommodation.check_out, "weekday")}</dd>
          </>
        )}
        {item.rentalCar && (
          <>
            <dt className="text-fg-3">{t("car.pickup")}</dt>
            <dd className="text-xs">{f.local(item.rentalCar.pickup_local, item.rentalCar.pickup_tz)}</dd>
            <dt className="text-fg-3">{t("car.return")}</dt>
            <dd className="text-xs">{f.local(item.rentalCar.return_local, item.rentalCar.return_tz)}</dd>
          </>
        )}
        {item.activeBookings.map((b) => (
          <div key={b.id} className="contents">
            <dt className="text-fg-3">{t("booking.reference")}</dt>
            <dd className="font-mono text-xs">{b.reference ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function UnscheduledCard() {
  const t = useT();
  const m = useTrip();
  const list = unscheduled(m);
  return (
    <Card>
      <div className="border-line border-b px-4 py-2.5">
        <h3 className="font-semibold text-sm">{t("itinerary.unscheduled")}</h3>
        <p className="text-fg-3 text-xs">{t("itinerary.unscheduledHint")}</p>
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("itinerary.noUnscheduled")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((i) => (
            <li key={i.option.id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <KindIcon kind={i.kind} className="size-4 text-fg-3" />
              <span className="flex-1">{i.option.title}</span>
              <StatusBadge status={m.effectiveStatus(i)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
