import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { parseDate } from "@/domain/time";
import { useT } from "@/i18n";
import type { TripModel } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { Button, Checkbox, Field, Input } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { DateInput } from "@/ui/inputs";

/** Plans the same trip again: a copy without bookings, payments and documents, dates moved. */
export function CopyTripDialog({ model, onClose }: { model: TripModel; onClose: () => void }) {
  const t = useT();
  const f = useFormat();
  const run = useAction();
  const navigate = useNavigate();
  const ids = { title: useId(), start: useId() };
  const trip = model.graph.trip;
  const start =
    model.plan.period.start ?? parseDate(trip.earliest_departure) ?? parseDate(trip.preferred_start) ?? null;
  const [title, setTitle] = useState(t("copyTrip.defaultTitle", { title: trip.title }));
  // A year later on the same weekday, which keeps weekend trips on weekends.
  const [newStart, setNewStart] = useState<string | null>(start?.add({ weeks: 52 }).toString() ?? null);
  const [options, setOptions] = useState(true);
  const [travelers, setTravelers] = useState(true);
  const [tasks, setTasks] = useState(true);

  const target = parseDate(newStart);
  const shift = start && target ? start.until(target, { largestUnit: "days" }).days : 0;

  const save = async () => {
    const id = await run(
      () =>
        api.copyTrip({
          trip_id: trip.id,
          title,
          shift_days: shift,
          include_options: options,
          include_travelers: travelers,
          include_tasks_and_notes: tasks,
        }),
      t("copyTrip.done"),
    );
    if (id) {
      onClose();
      navigate(`/trips/${id}`);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("copyTrip.title")}
      description={t("copyTrip.description")}
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void save()}>
            {t("copyTrip.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t("copyTrip.name")} htmlFor={ids.title}>
          <Input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {start && (
          <Field
            label={t("copyTrip.newStart")}
            htmlFor={ids.start}
            hint={
              shift === 0
                ? t("copyTrip.sameDates")
                : t("copyTrip.shiftHint", { from: f.date(start), count: shift })
            }
          >
            <DateInput id={ids.start} value={newStart} onChange={setNewStart} />
          </Field>
        )}
        <div className="flex flex-col gap-2">
          <Checkbox
            label={t("copyTrip.includeOptions")}
            checked={options}
            onChange={(e) => setOptions(e.target.checked)}
          />
          <Checkbox
            label={t("copyTrip.includeTravelers")}
            checked={travelers}
            onChange={(e) => setTravelers(e.target.checked)}
          />
          <Checkbox
            label={t("copyTrip.includeTasks")}
            checked={tasks}
            onChange={(e) => setTasks(e.target.checked)}
          />
        </div>
        <p className="text-fg-3 text-xs">{t("copyTrip.leftBehind")}</p>
      </div>
    </Dialog>
  );
}
