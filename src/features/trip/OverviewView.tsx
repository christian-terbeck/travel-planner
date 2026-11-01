import {
  BedDouble,
  Bell,
  CalendarRange,
  Car,
  CheckCircle2,
  MapPin,
  Plus,
  Route,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { api } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import type { Station } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { newStation, nil } from "@/lib/rows";
import { Badge, Button, Card, CardHeader, Field, IconButton, Input, Stat } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput } from "@/ui/inputs";
import { Certainty, SeverityIcon } from "@/ui/status";
import { useRoute } from "./MapView";
import { useTrip } from "./TripLayout";
import { DismissedList, useReminderText, WarningList } from "./warnings";

export function OverviewView() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const trip = m.graph.trip;
  const b = m.budget;
  const plan = m.plan;
  const reminderText = useReminderText();
  const confirmedNights = m.confirmed.items
    .filter((i) => i.accommodation)
    .reduce((s, i) => s + (i.nights ?? 0), 0);
  const tasksOpen = m.graph.tasks.filter((x) => !x.done_at).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          icon={<CalendarRange />}
          label={t("overview.period")}
          value={plan.period.start ? f.dateRange(plan.period.start, plan.period.end) : t("trips.noDates")}
          sub={
            plan.travelDays
              ? t("overview.daysNights", { days: plan.travelDays, nights: plan.nights.required.length })
              : t(`period.source.${plan.period.source}`)
          }
        />
        <Stat
          icon={<CheckCircle2 />}
          label={t("overview.confirmedPeriod")}
          value={
            m.confirmed.period.start ? f.dateRange(m.confirmed.period.start, m.confirmed.period.end) : "—"
          }
          sub={
            m.confirmed.travelDays
              ? t("overview.daysNightsBooked", { days: m.confirmed.travelDays, nights: confirmedNights })
              : t("overview.nothingBooked")
          }
        />
        <Stat
          icon={<Wallet />}
          label={t("budget.plan")}
          value={plan.items.length ? f.minor(b.converted.plan.minor, b.currency) : "—"}
          sub={
            <span className="flex items-center gap-1.5">
              {plan.items.length > 0 && <Certainty kind={plan.complete ? "estimate" : "incomplete"} />}
              {trip.budget_target_minor !== null &&
                t("overview.ofTarget", {
                  target: f.minor(trip.budget_target_minor, b.currency, { compact: true }),
                })}
            </span>
          }
          tone={plan.budgetDelta !== null && plan.budgetDelta < 0 ? "danger" : undefined}
        />
        <Stat
          icon={<CheckCircle2 />}
          label={t("budget.confirmed")}
          value={f.minor(b.converted.confirmed.minor, b.currency)}
          sub={t("overview.paidOutstanding", {
            paid: f.minor(b.converted.paid.minor, b.currency, { compact: true }),
            open: f.minor(b.converted.outstanding.minor, b.currency, { compact: true }),
          })}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title={t("overview.plan")}
              subtitle={
                m.scenario ? t("overview.basedOn", { name: m.scenario.name }) : t("overview.noScenario")
              }
              actions={
                <Link to={`/trips/${trip.id}/planning`} className="text-primary text-sm hover:underline">
                  {t("overview.toPlanning")}
                </Link>
              }
            />
            {plan.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-fg-3 text-sm">{t("overview.planEmpty")}</p>
            ) : (
              <PlanSummary />
            )}
          </Card>
          <Card>
            <CardHeader title={t("overview.attention")} subtitle={t("overview.attentionHint")} />
            <WarningList model={m} warnings={plan.warnings} />
            <DismissedList model={m} />
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              icon={<Bell className="size-4" />}
              title={t("overview.reminders")}
              subtitle={t("reminder.inAppOnly")}
            />
            {m.reminders.length === 0 ? (
              <p className="px-4 py-3 text-fg-3 text-sm">{t("reminder.none")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {m.reminders.map((r) => (
                  <li key={r.key} className="flex items-start gap-2.5 px-4 py-2.5 text-sm">
                    <SeverityIcon
                      severity={r.severity}
                      className={`mt-0.5 size-4 shrink-0 ${r.severity === "critical" ? "text-danger" : r.severity === "warning" ? "text-warn" : "text-info"}`}
                    />
                    <span>{reminderText(r)}</span>
                  </li>
                ))}
              </ul>
            )}
            {tasksOpen > 0 && (
              <Link
                to={`/trips/${trip.id}/documents`}
                className="block border-line border-t px-4 py-2 text-primary text-sm hover:underline"
              >
                {t("overview.openTasks", { count: tasksOpen })}
              </Link>
            )}
          </Card>
          <StationsCard />
        </div>
      </div>
    </div>
  );
}

function PlanSummary() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const plan = m.plan;
  const { route } = useRoute(m);
  const rows: Array<{ icon: React.ReactNode; label: string; value: string; note?: React.ReactNode }> = [
    {
      icon: <BedDouble className="size-4" />,
      label: t("overview.nights"),
      value: plan.nights.evaluable
        ? t("overview.nightsCovered", {
            covered: plan.nights.required.length - plan.nights.gaps.length - plan.nights.open.length,
            total: plan.nights.required.length,
          })
        : "—",
      note:
        plan.nights.gaps.length > 0 ? (
          <Badge tone="warn">{t("overview.gaps", { count: plan.nights.gaps.length })}</Badge>
        ) : undefined,
    },
    {
      icon: <Car className="size-4" />,
      label: t("overview.rentalDays"),
      value: plan.rentalDays !== null ? String(plan.rentalDays) : "—",
    },
    {
      icon: <Route className="size-4" />,
      label: t("overview.distance"),
      value: route?.legs.length
        ? t("overview.distanceValue", {
            flight: f.number(Math.round(route.km.flight)),
            ground: f.number(Math.round(route.km.drive + route.km.ground)),
          })
        : "—",
      note:
        route && route.missingStays.length > 0 ? (
          <Badge tone="warn">{t("certainty.incomplete")}</Badge>
        ) : undefined,
    },
  ];
  const cats = ["transport", "accommodation", "rental_car", "activity", "other", "fees"] as const;
  return (
    <div className="grid grid-cols-2 gap-6 px-4 py-3">
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="text-fg-3">{r.icon}</span>
            <span className="flex-1 text-fg-2">{r.label}</span>
            <span className="tabular font-medium">{r.value}</span>
            {r.note}
          </div>
        ))}
        {plan.period.arrival && (
          <div className="text-fg-3 text-xs">
            {t("overview.arrival")}:{" "}
            {f.dateTime(
              plan.period.arrival,
              plan.period.journeys[0]?.segments.at(-1)?.segment.arrive_tz ?? m.tz,
            )}
            {plan.period.departure && (
              <>
                {" · "}
                {t("overview.departure")}:{" "}
                {f.dateTime(
                  plan.period.departure,
                  plan.period.journeys.at(-1)?.segments[0]?.segment.depart_tz ?? m.tz,
                )}
              </>
            )}
          </div>
        )}
      </div>
      <table className="text-sm">
        <tbody>
          {cats.map((c) => {
            const cost = plan.costs[c];
            if (Object.keys(cost.totals).length === 0 && cost.missing.length === 0) return null;
            return (
              <tr key={c}>
                <td className="py-0.5 text-fg-2">{t(`costCategory.${c}`)}</td>
                <td className="tabular py-0.5 text-right">
                  {f.cost(cost, m.budget.currency)}
                  {cost.missing.length > 0 && <span className="ml-1 text-warn text-xs">+ ?</span>}
                </td>
              </tr>
            );
          })}
          <tr className="border-line border-t font-semibold">
            <td className="pt-1">{t("common.total")}</td>
            <td className="tabular pt-1 text-right">{f.cost(plan.total, m.budget.currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function StationsCard() {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const run = useAction();
  const remove = useRemove();
  const [edit, setEdit] = useState<Station | null>(null);
  const stations = m.graph.stations;
  const nightsAt = (id: string) =>
    m.plan.items
      .filter((i) => i.accommodation && i.slot.station_id === id)
      .reduce((s, i) => s + (i.nights ?? 0), 0);
  return (
    <Card>
      <CardHeader
        icon={<MapPin className="size-4" />}
        title={t("stations.title")}
        subtitle={t("stations.hint")}
        actions={
          <IconButton
            label={t("stations.add")}
            onClick={() => setEdit(newStation(m.graph.trip.id, stations.length))}
          >
            <Plus className="size-4" />
          </IconButton>
        }
      />
      {stations.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("stations.empty")}</p>
      ) : (
        <ol className="divide-y divide-line">
          {stations.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary-soft font-semibold text-[11px] text-primary">
                {i + 1}
              </span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdit(s)}>
                <div className="truncate font-medium text-sm">{s.name}</div>
                <div className="text-fg-3 text-xs">
                  {s.arrive_date ? f.dateRange(s.arrive_date, s.depart_date) : t("stations.noDates")} ·{" "}
                  {t("stations.nights", { count: nightsAt(s.id) })}
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
      <StationDialog
        station={edit}
        onClose={() => setEdit(null)}
        onSave={async (s) => {
          if ((await run(() => api.save({ type: "station", row: s }))) !== undefined) setEdit(null);
        }}
        onDelete={async (s) => {
          if (await remove("station", [s.id])) setEdit(null);
        }}
        isNew={!!edit && !stations.some((s) => s.id === edit.id)}
      />
    </Card>
  );
}

function StationDialog({
  station,
  onClose,
  onSave,
  onDelete,
  isNew,
}: {
  station: Station | null;
  onClose: () => void;
  onSave: (s: Station) => void;
  onDelete: (s: Station) => void;
  isNew: boolean;
}) {
  const t = useT();
  const [s, setS] = useState<Station | null>(station);
  if (station && s?.id !== station.id) setS(station);
  if (!s) return null;
  return (
    <Dialog
      open={!!station}
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? t("stations.add") : t("stations.edit")}
      size="sm"
      footer={
        <>
          {!isNew && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              onClick={() => onDelete(s)}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!s.name.trim()}
            onClick={() => onSave({ ...s, name: s.name.trim() })}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("stations.name")} className="col-span-2" htmlFor="st-name">
          <Input
            id="st-name"
            autoFocus
            value={s.name}
            placeholder={t("stations.namePlaceholder")}
            onChange={(e) => setS({ ...s, name: e.target.value })}
          />
        </Field>
        <Field label={t("stations.location")} className="col-span-2" htmlFor="st-loc">
          <Input
            id="st-loc"
            value={s.location ?? ""}
            onChange={(e) => setS({ ...s, location: nil(e.target.value) })}
          />
        </Field>
        <Field label={t("stations.arrive")} htmlFor="st-a">
          <DateInput id="st-a" value={s.arrive_date} onChange={(v) => setS({ ...s, arrive_date: v })} />
        </Field>
        <Field label={t("stations.depart")} htmlFor="st-d">
          <DateInput
            id="st-d"
            value={s.depart_date}
            min={s.arrive_date ?? undefined}
            onChange={(v) => setS({ ...s, depart_date: v })}
          />
        </Field>
      </div>
    </Dialog>
  );
}
