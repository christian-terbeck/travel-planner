import { Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { api } from "@/api/client";
import { useAction, useTrips } from "@/api/queries";
import type { Traveler, TravelerCategory, TravelerDocument, Trip, TripGraph } from "@/domain/types";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { newId, newTraveler, newTrip, nil } from "@/lib/rows";
import { Button, Field, IconButton, Input, Select, Textarea } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { CurrencySelect, DateInput, MoneyInput, NumberInput } from "@/ui/inputs";

const CATEGORIES: TravelerCategory[] = ["adult", "child", "infant", "senior", "student", "other"];

/** Creates a trip (only the title is required) or edits its constraints, budget and travelers. */
export function TripForm({
  open,
  onOpenChange,
  graph,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  graph?: TripGraph;
  onCreated?: (id: string) => void;
}) {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const [trip, setTrip] = useState<Trip>(() => graph?.trip ?? newTrip(prefs.currency));
  const [travelers, setTravelers] = useState<Traveler[]>(graph?.travelers ?? []);
  const known = useKnownTravelers(trip.id);
  const namesId = useId();
  const [titleError, setTitleError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTrip(graph?.trip ?? newTrip(prefs.currency));
      setTravelers(graph?.travelers ?? []);
      setTitleError(false);
    }
  }, [open, graph, prefs.currency]);

  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setTrip((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (!trip.title.trim()) {
      setTitleError(true);
      return;
    }
    setBusy(true);
    const ok = await run(
      async () => {
        await api.save({ type: "trip", row: { ...trip, title: trip.title.trim() } });
        const keep = travelers.filter((x) => x.name.trim());
        for (const [i, tr] of keep.entries()) {
          const isNew = !graph?.travelers.some((x) => x.id === tr.id);
          const same = isNew ? known.get(tr.name.trim().toLocaleLowerCase()) : undefined;
          await api.save({
            type: "traveler",
            row: {
              ...tr,
              name: tr.name.trim(),
              sort: i,
              birth_date: tr.birth_date ?? same?.traveler.birth_date ?? null,
            },
          });
          // Someone who travelled before brings their documents along.
          for (const d of same?.documents ?? [])
            await api.save({ type: "traveler_document", row: { ...d, id: newId(), traveler_id: tr.id } });
        }
        for (const old of graph?.travelers ?? []) {
          if (!keep.some((k) => k.id === old.id)) await api.remove("traveler", old.id);
        }
        return true;
      },
      graph ? t("trip.saved") : t("trip.created"),
    );
    setBusy(false);
    if (ok) {
      onOpenChange(false);
      if (!graph) onCreated?.(trip.id);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={graph ? t("trip.editTitle") : t("trip.newTitle")}
      description={graph ? undefined : t("trip.newHint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} busy={busy}>
            {graph ? t("common.save") : t("trip.create")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t("trip.title")}
            error={titleError ? t("errors.required") : undefined}
            className="col-span-2"
            htmlFor="trip-title"
          >
            <Input
              id="trip-title"
              autoFocus
              value={trip.title}
              placeholder={t("trip.titlePlaceholder")}
              onChange={(e) => set("title", e.target.value)}
              aria-invalid={titleError}
            />
          </Field>
          <Field label={t("trip.destination")} htmlFor="trip-dest">
            <Input
              id="trip-dest"
              value={trip.destination ?? ""}
              placeholder={t("trip.destinationPlaceholder")}
              onChange={(e) => set("destination", nil(e.target.value))}
            />
          </Field>
          <Field label={t("trip.style")} htmlFor="trip-style">
            <Input
              id="trip-style"
              value={trip.travel_style ?? ""}
              placeholder={t("trip.stylePlaceholder")}
              onChange={(e) => set("travel_style", nil(e.target.value))}
            />
          </Field>
          <Field label={t("trip.description")} className="col-span-2" htmlFor="trip-desc">
            <Textarea
              id="trip-desc"
              rows={2}
              value={trip.description ?? ""}
              onChange={(e) => set("description", nil(e.target.value))}
            />
          </Field>
        </div>

        <section>
          <h4 className="mb-1 font-semibold text-sm">{t("trip.dates")}</h4>
          <p className="mb-3 text-fg-3 text-xs">{t("trip.datesHint")}</p>
          <div className="grid grid-cols-4 gap-3">
            <Field label={t("trip.earliestDeparture")} htmlFor="t-ed">
              <DateInput
                id="t-ed"
                value={trip.earliest_departure}
                onChange={(v) => set("earliest_departure", v)}
              />
            </Field>
            <Field label={t("trip.latestReturn")} htmlFor="t-lr">
              <DateInput
                id="t-lr"
                value={trip.latest_return}
                min={trip.earliest_departure ?? undefined}
                onChange={(v) => set("latest_return", v)}
              />
            </Field>
            <Field label={t("trip.preferredStart")} htmlFor="t-ps">
              <DateInput id="t-ps" value={trip.preferred_start} onChange={(v) => set("preferred_start", v)} />
            </Field>
            <Field label={t("trip.preferredEnd")} htmlFor="t-pe">
              <DateInput
                id="t-pe"
                value={trip.preferred_end}
                min={trip.preferred_start ?? undefined}
                onChange={(v) => set("preferred_end", v)}
              />
            </Field>
            <Field label={t("trip.preferredMonth")} htmlFor="t-pm">
              <Input
                id="t-pm"
                type="month"
                value={trip.preferred_month ?? ""}
                onChange={(e) => set("preferred_month", e.target.value || null)}
              />
            </Field>
            <Field label={t("trip.minNights")} htmlFor="t-min">
              <NumberInput
                id="t-min"
                min={0}
                value={trip.min_nights}
                onChange={(v) => set("min_nights", v)}
              />
            </Field>
            <Field label={t("trip.maxNights")} htmlFor="t-max">
              <NumberInput
                id="t-max"
                min={0}
                value={trip.max_nights}
                onChange={(v) => set("max_nights", v)}
              />
            </Field>
            <Field label={t("trip.homeAirports")} hint={t("trip.homeAirportsHint")} htmlFor="t-ha">
              <Input
                id="t-ha"
                className="uppercase"
                value={trip.home_airports ?? ""}
                placeholder="FRA,DUS"
                onChange={(e) =>
                  set("home_airports", nil(e.target.value.toUpperCase().replace(/[^A-Z,]/g, "")))
                }
              />
            </Field>
          </div>
        </section>

        <section>
          <h4 className="mb-3 font-semibold text-sm">{t("trip.budget")}</h4>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("trip.currency")} htmlFor="t-cur">
              <CurrencySelect
                id="t-cur"
                value={trip.currency}
                onChange={(c) => set("currency", c)}
                className="w-full"
              />
            </Field>
            <Field label={t("trip.budgetTarget")} htmlFor="t-bt">
              <MoneyInput
                id="t-bt"
                value={trip.budget_target_minor}
                currency={trip.currency}
                placeholder={t("common.notSet")}
                onChange={(v) => set("budget_target_minor", v)}
              />
            </Field>
            <Field label={t("trip.budgetMax")} htmlFor="t-bm">
              <MoneyInput
                id="t-bm"
                value={trip.budget_max_minor}
                currency={trip.currency}
                placeholder={t("common.notSet")}
                onChange={(v) => set("budget_max_minor", v)}
              />
            </Field>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm">{t("trip.travelers")}</h4>
              <p className="text-fg-3 text-xs">{t("trip.travelersHint")}</p>
            </div>
            <Button
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => setTravelers((l) => [...l, newTraveler(trip.id, l.length)])}
            >
              {t("trip.addTraveler")}
            </Button>
          </div>
          <datalist id={namesId}>
            {[...known.values()].map((k) => (
              <option key={k.traveler.id} value={k.traveler.name} />
            ))}
          </datalist>
          <div className="flex flex-col gap-2">
            {travelers.map((tr, i) => (
              <div key={tr.id} className="flex items-center gap-2">
                <Input
                  aria-label={t("trip.travelerName")}
                  placeholder={t("trip.travelerName")}
                  list={namesId}
                  value={tr.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const same = known.get(name.trim().toLocaleLowerCase());
                    setTravelers((l) =>
                      l.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              name,
                              category:
                                same && !graph?.travelers.some((g) => g.id === x.id)
                                  ? same.traveler.category
                                  : x.category,
                            }
                          : x,
                      ),
                    );
                  }}
                />
                <Select
                  aria-label={t("trip.travelerCategory")}
                  className="w-40"
                  value={tr.category}
                  onChange={(e) =>
                    setTravelers((l) =>
                      l.map((x, j) => (j === i ? { ...x, category: e.target.value as TravelerCategory } : x)),
                    )
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`travelerCategory.${c}`)}
                    </option>
                  ))}
                </Select>
                <IconButton
                  label={t("common.remove")}
                  onClick={() => setTravelers((l) => l.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="mb-1 font-semibold text-sm">{t("trip.buffers")}</h4>
          <p className="mb-3 text-fg-3 text-xs">{t("trip.buffersHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("trip.arrivalBuffer")} htmlFor="t-ab">
              <NumberInput
                id="t-ab"
                min={0}
                value={trip.arrival_buffer_min}
                onChange={(v) => set("arrival_buffer_min", v ?? 0)}
              />
            </Field>
            <Field label={t("trip.departureBuffer")} htmlFor="t-db">
              <NumberInput
                id="t-db"
                min={0}
                value={trip.departure_buffer_min}
                onChange={(v) => set("departure_buffer_min", v ?? 0)}
              />
            </Field>
          </div>
        </section>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Travelers of other trips by lower-case name, the most recently changed trip first. */
function useKnownTravelers(tripId: string) {
  const trips = useTrips();
  return useMemo(() => {
    const out = new Map<string, { traveler: Traveler; documents: TravelerDocument[] }>();
    const graphs = [...(trips.data ?? [])].sort((a, b) => b.trip.updated_at.localeCompare(a.trip.updated_at));
    for (const g of graphs) {
      if (g.trip.id === tripId) continue;
      for (const p of g.travelers) {
        const key = p.name.trim().toLocaleLowerCase();
        if (!out.has(key))
          out.set(key, {
            traveler: p,
            documents: g.traveler_documents.filter((d) => d.traveler_id === p.id),
          });
      }
    }
    return out;
  }, [trips.data, tripId]);
}
