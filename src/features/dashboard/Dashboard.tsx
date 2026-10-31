import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Luggage,
  Plus,
  ShieldAlert,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTrips } from "@/api/queries";
import { addTo, type Totals } from "@/domain/money";
import { daysBetween, Temporal, todayIn } from "@/domain/time";
import { useT } from "@/i18n";
import { type TripModel, useTripModels } from "@/lib/model";
import { useFormat, usePrefs } from "@/lib/prefs";
import { setTripUi } from "@/lib/tripUi";
import { Button, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/ui/core";
import { CancellationBadge, Certainty, SeverityIcon, TripStatusBadge } from "@/ui/status";
import { useReminderText, useWarningText } from "../trip/warnings";
import { TripForm } from "../trips/TripForm";

const PAST = ["completed", "cancelled", "archived"];

export function Dashboard() {
  const t = useT();
  const f = useFormat();
  const prefs = usePrefs();
  const navigate = useNavigate();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  const [creating, setCreating] = useState(false);
  const today = todayIn(() => Temporal.Now.instant(), prefs.timeZone);
  const active = models.filter((m) => !PAST.includes(m.status));
  const upcoming = active
    .filter((m) => m.plan.period.start && daysBetween(today, m.plan.period.end ?? m.plan.period.start) >= 0)
    .sort((a, b) =>
      (a.plan.period.start as Temporal.PlainDate)
        .toString()
        .localeCompare((b.plan.period.start as Temporal.PlainDate).toString()),
    );
  const planning = active.filter((m) => m.status === "planning" || m.status === "idea");

  const outstanding = useMemo(() => {
    const t: Totals = {};
    for (const m of active)
      for (const [c, v] of Object.entries(m.budget.outstanding)) addTo(t, { minor: v, currency: c });
    return t;
  }, [active]);
  const deadlines = active
    .flatMap((m) =>
      m.graph.bookings.filter((b) => b.status === "active").map((b) => ({ m, b, s: m.cancellation(b) })),
    )
    .filter(
      (x) =>
        x.s.deadline &&
        x.s.minutesLeft !== null &&
        x.s.minutesLeft > 0 &&
        ["free", "with_fee", "partial"].includes(x.s.state),
    )
    .sort((a, b) => (a.s.minutesLeft ?? 0) - (b.s.minutesLeft ?? 0))
    .slice(0, 6);
  const observations = active
    .flatMap((m) => m.graph.price_observations.map((o) => ({ m, o })))
    .sort((a, b) => b.o.observed_at.localeCompare(a.o.observed_at))
    .slice(0, 5);

  if (models.length === 0) {
    return (
      <div>
        <PageHeader title={t("nav.dashboard")} />
        <div className="p-6">
          <Card>
            <EmptyState
              icon={<Luggage />}
              title={t("dashboard.welcomeTitle")}
              text={t("dashboard.welcomeText")}
              action={
                <Button
                  variant="primary"
                  icon={<Plus className="size-4" />}
                  onClick={() => setCreating(true)}
                >
                  {t("trips.new")}
                </Button>
              }
            />
          </Card>
        </div>
        <TripForm open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/trips/${id}`)} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("nav.dashboard")}
        subtitle={f.date(today, "long")}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t("trips.new")}
          </Button>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat
            icon={<Luggage />}
            label={t("dashboard.upcoming")}
            value={upcoming.length}
            sub={upcoming[0] ? t("dashboard.nextTrip", { title: upcoming[0].graph.trip.title }) : undefined}
          />
          <Stat icon={<CalendarClock />} label={t("dashboard.planning")} value={planning.length} />
          <Stat
            icon={<ShieldAlert />}
            label={t("dashboard.deadlines")}
            value={deadlines.filter((d) => (d.s.minutesLeft ?? 0) < 7 * 1440).length}
            sub={t("dashboard.deadlinesSub")}
            tone={deadlines.some((d) => (d.s.minutesLeft ?? 0) < 2 * 1440) ? "danger" : undefined}
          />
          <Stat
            icon={<Wallet />}
            label={t("budget.outstanding")}
            value={Object.keys(outstanding).length ? f.totals(outstanding) : f.minor(0, prefs.currency)}
            tone={Object.keys(outstanding).length ? "warn" : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_400px]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                icon={<Luggage className="size-4" />}
                title={t("dashboard.trips")}
                actions={
                  <Link to="/trips" className="text-primary text-sm hover:underline">
                    {t("dashboard.allTrips")}
                  </Link>
                }
              />
              <ul className="divide-y divide-line">
                {[...upcoming, ...active.filter((m) => !upcoming.includes(m))].slice(0, 6).map((m) => (
                  <TripRow key={m.graph.trip.id} m={m} today={today} />
                ))}
              </ul>
            </Card>
            <AttentionCard models={active} />
          </div>
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                icon={<ShieldAlert className="size-4" />}
                title={t("dashboard.cancellationDeadlines")}
                actions={
                  <Link to="/cancellations" className="text-primary text-sm hover:underline">
                    {t("dashboard.all")}
                  </Link>
                }
              />
              {deadlines.length === 0 ? (
                <p className="px-4 py-3 text-fg-3 text-sm">{t("dashboard.noDeadlines")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {deadlines.map(({ m, b, s }) => (
                    <li key={b.id} className="px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {m.item(b.option_id)?.option.title}
                        </span>
                        <CancellationBadge state={s.state} />
                      </div>
                      <div className="text-fg-3 text-xs">
                        {m.graph.trip.title} ·{" "}
                        {t("cancellation.until", {
                          date: f.dateTime(s.deadline, s.policy?.deadline_tz ?? prefs.timeZone),
                        })}{" "}
                        ({f.relativeDays(Math.floor((s.minutesLeft ?? 0) / 1440))})
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <RemindersCard models={active} />
            <Card>
              <CardHeader icon={<TrendingDown className="size-4" />} title={t("dashboard.prices")} />
              {observations.length === 0 ? (
                <p className="px-4 py-3 text-fg-3 text-sm">{t("dashboard.noPrices")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {observations.map(({ m, o }) => {
                    const opt = m.item(o.option_id)?.option;
                    const diff =
                      opt?.price_minor !== null &&
                      opt?.price_minor !== undefined &&
                      opt.currency === o.currency
                        ? o.price_minor - opt.price_minor
                        : null;
                    return (
                      <li key={o.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">{opt?.title}</span>
                        <span className="tabular">{f.minor(o.price_minor, o.currency)}</span>
                        {diff !== null && diff !== 0 && (
                          <span className={diff < 0 ? "text-ok text-xs" : "text-danger text-xs"}>
                            {f.minor(diff, o.currency, { signed: true })}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
      <TripForm open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`/trips/${id}`)} />
    </div>
  );
}

function TripRow({ m, today }: { m: TripModel; today: Temporal.PlainDate }) {
  const t = useT();
  const f = useFormat();
  const start = m.plan.period.start;
  const days = start ? daysBetween(today, start) : null;
  const b = m.budget;
  const required = m.graph.slots.filter((s) => s.required).length;
  const covered = m.graph.slots.filter((s) => s.required && m.plan.selection.has(s.id)).length;
  const booked = m.graph.slots.filter((s) =>
    m.graph.options.some((o) => o.slot_id === s.id && o.status === "booked"),
  ).length;
  return (
    <li>
      <Link to={`/trips/${m.graph.trip.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2">
        <div className="w-16 shrink-0 text-center">
          {days !== null && days >= 0 ? (
            <>
              <div className="tabular font-semibold text-lg leading-5">{days}</div>
              <div className="text-[11px] text-fg-3">{t("dashboard.daysLeft", { count: days })}</div>
            </>
          ) : days !== null ? (
            <div className="text-accent text-xs">{t("tripStatus.ongoing")}</div>
          ) : (
            <div className="text-fg-3 text-xs">{t("trips.noDates")}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{m.graph.trip.title}</span>
            <TripStatusBadge status={m.status} />
          </div>
          <div className="text-fg-3 text-xs">
            {start ? f.dateRange(start, m.plan.period.end) : (m.graph.trip.destination ?? "")} ·{" "}
            {t("dashboard.progress", { chosen: covered, required, booked })}
          </div>
          {required > 0 && (
            <div
              className="mt-1.5 flex h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-surface-2"
              role="img"
              aria-label={t("dashboard.progress", { chosen: covered, required, booked })}
            >
              <div className="bg-ok" style={{ width: `${(Math.min(booked, required) / required) * 100}%` }} />
              <div
                className="bg-primary/40"
                style={{ width: `${(Math.max(0, covered - booked) / required) * 100}%` }}
              />
            </div>
          )}
        </div>
        <div className="text-right text-sm">
          <div className="tabular font-medium">
            {m.plan.items.length ? f.minor(b.converted.plan.minor, b.currency, { compact: true }) : "—"}
          </div>
          <div className="flex items-center justify-end gap-1 text-fg-3 text-xs">
            {m.plan.items.length > 0 && !m.plan.complete ? <Certainty kind="incomplete" /> : t("budget.plan")}
          </div>
          <div className="tabular text-ok text-xs">
            {t("dashboard.confirmedShort", {
              amount: f.minor(b.converted.confirmed.minor, b.currency, { compact: true }),
            })}
          </div>
        </div>
      </Link>
    </li>
  );
}

function AttentionCard({ models }: { models: TripModel[] }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader
        icon={<AlertTriangle className="size-4" />}
        title={t("dashboard.attention")}
        subtitle={t("dashboard.attentionHint")}
      />
      {models.every((m) => m.plan.warnings.filter((w) => w.severity !== "info").length === 0) ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("warning.none")}</p>
      ) : (
        models.map((m) => (
          <TripWarnings
            key={m.graph.trip.id}
            m={m}
            onOpen={(optionId) => {
              if (optionId) setTripUi(m.graph.trip.id, { selectedOptionId: optionId });
              navigate(`/trips/${m.graph.trip.id}/planning`);
            }}
          />
        ))
      )}
    </Card>
  );
}

function TripWarnings({ m, onOpen }: { m: TripModel; onOpen: (optionId: string | undefined) => void }) {
  const text = useWarningText(m);
  const list = m.plan.warnings.filter((w) => w.severity !== "info");
  if (list.length === 0) return null;
  return (
    <div className="border-line border-b last:border-0">
      <div className="px-4 pt-2 font-medium text-fg-3 text-xs">{m.graph.trip.title}</div>
      <ul>
        {list.slice(0, 5).map((w) => (
          <li key={w.key}>
            <button
              type="button"
              onClick={() => onOpen(w.optionIds[0])}
              className="flex w-full items-start gap-2 px-4 py-1.5 text-left text-sm hover:bg-surface-2"
            >
              <SeverityIcon
                severity={w.severity}
                className={`mt-0.5 size-4 shrink-0 ${w.severity === "critical" ? "text-danger" : "text-warn"}`}
              />
              {text(w)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RemindersCard({ models }: { models: TripModel[] }) {
  const t = useT();
  const text = useReminderText();
  const list = models
    .flatMap((m) => m.reminders.map((r) => ({ m, r })))
    .sort((a, b) => a.r.date.localeCompare(b.r.date));
  return (
    <Card>
      <CardHeader
        icon={<Bell className="size-4" />}
        title={t("overview.reminders")}
        subtitle={t("reminder.inAppOnly")}
      />
      {list.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("reminder.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.slice(0, 8).map(({ m, r }) => (
            <li key={`${m.graph.trip.id}-${r.key}`}>
              <Link
                to={`/trips/${m.graph.trip.id}`}
                className="flex items-start gap-2 px-4 py-2 text-sm hover:bg-surface-2"
              >
                <SeverityIcon
                  severity={r.severity}
                  className={`mt-0.5 size-4 shrink-0 ${r.severity === "critical" ? "text-danger" : r.severity === "warning" ? "text-warn" : "text-info"}`}
                />
                <span>
                  {text(r)}
                  <span className="block text-fg-3 text-xs">{m.graph.trip.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
