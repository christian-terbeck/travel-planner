import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTrips } from "@/api/queries";
import { Temporal, todayIn } from "@/domain/time";
import { useT } from "@/i18n";
import { useTripModels } from "@/lib/model";
import { useFormat, usePrefs } from "@/lib/prefs";
import { setTripUi } from "@/lib/tripUi";
import { Button, Checkbox, IconButton, PageHeader, Segmented, Select } from "@/ui/core";
import { type CalEvent, startOfWeek, tripEvents } from "./events";
import { AgendaView, Legend, MonthView, WeekView } from "./views";

export type CalMode = "month" | "week" | "agenda";

export function CalendarPage() {
  const t = useT();
  const f = useFormat();
  const prefs = usePrefs();
  const navigate = useNavigate();
  const trips = useTrips();
  const models = useTripModels(trips.data);
  const today = todayIn(() => Temporal.Now.instant(), prefs.timeZone);
  const [mode, setMode] = useState<CalMode>("month");
  const [cursor, setCursor] = useState(today);
  const [tripFilter, setTripFilter] = useState("");
  const [alternatives, setAlternatives] = useState(false);

  const events = useMemo(
    () =>
      models
        .filter((m) => !tripFilter || m.graph.trip.id === tripFilter)
        .flatMap((m) => tripEvents(m, { includeAlternatives: alternatives })),
    [models, tripFilter, alternatives],
  );
  const month = Temporal.PlainYearMonth.from({ year: cursor.year, month: cursor.month });
  const week = startOfWeek(cursor);
  const open = (e: CalEvent) => {
    setTripUi(e.tripId, { selectedOptionId: e.optionId });
    navigate(`/trips/${e.tripId}/planning`);
  };
  const step = (dir: 1 | -1) =>
    setCursor(mode === "week" ? cursor.add({ weeks: dir }) : cursor.add({ months: dir }).with({ day: 1 }));

  return (
    <div>
      <PageHeader title={t("nav.calendar")} subtitle={t("calendar.subtitle")}>
        <div className="flex flex-wrap items-center gap-3 pb-3">
          <Segmented
            label={t("calendar.view")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "month", label: t("calendar.month") },
              { value: "week", label: t("calendar.week") },
              { value: "agenda", label: t("calendar.agenda") },
            ]}
          />
          {mode !== "agenda" && (
            <div className="flex items-center gap-1">
              <IconButton label={t("calendar.previous")} onClick={() => step(-1)}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <span className="min-w-44 text-center font-semibold text-sm">
                {mode === "month"
                  ? f.month(month.year, month.month)
                  : f.dateRange(week, week.add({ days: 6 }))}
              </span>
              <IconButton label={t("calendar.next")} onClick={() => step(1)}>
                <ChevronRight className="size-4" />
              </IconButton>
              <Button size="sm" variant="ghost" onClick={() => setCursor(today)}>
                {t("calendar.today")}
              </Button>
            </div>
          )}
          <Select
            aria-label={t("calendar.tripFilter")}
            className="w-56"
            value={tripFilter}
            onChange={(e) => setTripFilter(e.target.value)}
          >
            <option value="">{t("calendar.allTrips")}</option>
            {models.map((m) => (
              <option key={m.graph.trip.id} value={m.graph.trip.id}>
                {m.graph.trip.title}
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
      </PageHeader>
      <div className="p-6">
        {mode === "month" && (
          <MonthView month={month} events={events} today={today} onOpen={open} showTrip={!tripFilter} />
        )}
        {mode === "week" && (
          <WeekView
            weekStart={week}
            events={events}
            today={today}
            tz={prefs.timeZone}
            onOpen={open}
            showTrip={!tripFilter}
          />
        )}
        {mode === "agenda" && (
          <AgendaView events={events} onOpen={open} showTrip={!tripFilter} from={today} />
        )}
      </div>
    </div>
  );
}
