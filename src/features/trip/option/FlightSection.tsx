import { Plus, Repeat, Trash2 } from "lucide-react";
import type { FlightSegment, OptionBundle } from "@/domain/types";
import { useT } from "@/i18n";
import { airlineFromCode, segmentAirline } from "@/lib/providers";
import { newSegment, nil } from "@/lib/rows";
import { Button, Field, IconButton, Input } from "@/ui/core";
import { AirportInput, DateTimeInput, TzInput } from "@/ui/inputs";
import { ProviderInput } from "@/ui/provider";
import { Section } from "./Section";

export function FlightSection({ b, setB }: { b: OptionBundle; setB: (b: OptionBundle) => void }) {
  const t = useT();
  const segs = b.segments;
  const set = (i: number, patch: Partial<FlightSegment>) =>
    setB({ ...b, segments: segs.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const add = () =>
    setB({
      ...b,
      segments: [
        ...segs,
        {
          ...newSegment(b.option.id, segs.length + 1),
          from_airport: segs.at(-1)?.to_airport ?? null,
          depart_tz: segs.at(-1)?.arrive_tz ?? null,
        },
      ],
    });
  // Adds the reverse of the first leg as a starting point for the return flight.
  const addReturn = () => {
    const first = segs[0];
    const last = segs.at(-1);
    if (!first || !last) return;
    setB({
      ...b,
      segments: [
        ...segs,
        {
          ...newSegment(b.option.id, segs.length + 1),
          airline: first.airline,
          from_airport: last.to_airport,
          depart_tz: last.arrive_tz,
          to_airport: first.from_airport,
          arrive_tz: first.depart_tz,
        },
      ],
    });
  };
  return (
    <Section
      title={t("flight.segments")}
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            icon={<Repeat className="size-3.5" />}
            onClick={addReturn}
            disabled={segs.length === 0}
          >
            {t("flight.addReturn")}
          </Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={add}>
            {t("flight.addSegment")}
          </Button>
        </div>
      }
    >
      <p className="-mt-2 text-fg-3 text-xs">{t("flight.hint")}</p>
      {segs.map((s, i) => (
        <div key={s.id} className="rounded-lg border border-line bg-surface-2/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-fg-2 text-xs">
              {t("flight.segment", { n: i + 1 })}
              {s.booking_id && <span className="ml-2 text-ok">· {t("flight.segmentBooked")}</span>}
            </span>
            <IconButton
              label={t("common.remove")}
              disabled={!!s.booking_id}
              onClick={() => setB({ ...b, segments: segs.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
          <div className="grid grid-cols-6 gap-3">
            <Field label={t("flight.airline")} htmlFor={`s-al-${i}`}>
              <ProviderInput
                id={`s-al-${i}`}
                detected={segmentAirline(s)}
                value={s.airline ?? ""}
                onChange={(e) => set(i, { airline: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("flight.number")} htmlFor={`s-fn-${i}`}>
              <Input
                id={`s-fn-${i}`}
                value={s.flight_number ?? ""}
                placeholder="TP 571"
                onChange={(e) => {
                  const flight_number = nil(e.target.value);
                  // Follow the flight number while the airline is empty or was filled in from it.
                  const before = airlineFromCode(s.flight_number)?.name;
                  const airline =
                    !s.airline || s.airline === before
                      ? (airlineFromCode(flight_number)?.name ?? (s.airline === before ? null : s.airline))
                      : s.airline;
                  set(i, { flight_number, airline });
                }}
              />
            </Field>
            <Field label={t("flight.from")} htmlFor={`s-from-${i}`}>
              <AirportInput
                id={`s-from-${i}`}
                value={s.from_airport}
                onChange={(v) => set(i, { from_airport: v })}
                onAirport={(a) => set(i, { from_airport: a.iata, depart_tz: a.tz })}
              />
            </Field>
            <Field label={t("flight.departs")} className="col-span-2" htmlFor={`s-dep-${i}`}>
              <DateTimeInput
                id={`s-dep-${i}`}
                value={s.depart_local}
                onChange={(v) => set(i, { depart_local: v })}
              />
            </Field>
            <Field label={t("flight.departTz")} htmlFor={`s-dtz-${i}`}>
              <TzInput id={`s-dtz-${i}`} value={s.depart_tz} onChange={(v) => set(i, { depart_tz: v })} />
            </Field>
            <Field label={t("flight.cabin")} htmlFor={`s-cab-${i}`}>
              <Input
                id={`s-cab-${i}`}
                value={s.cabin ?? ""}
                placeholder="Economy"
                onChange={(e) => set(i, { cabin: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("flight.fareClass")} htmlFor={`s-fc-${i}`}>
              <Input
                id={`s-fc-${i}`}
                value={s.fare_class ?? ""}
                onChange={(e) => set(i, { fare_class: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("flight.to")} htmlFor={`s-to-${i}`}>
              <AirportInput
                id={`s-to-${i}`}
                value={s.to_airport}
                onChange={(v) => set(i, { to_airport: v })}
                onAirport={(a) => set(i, { to_airport: a.iata, arrive_tz: a.tz })}
              />
            </Field>
            <Field label={t("flight.arrives")} className="col-span-2" htmlFor={`s-arr-${i}`}>
              <DateTimeInput
                id={`s-arr-${i}`}
                value={s.arrive_local}
                onChange={(v) => set(i, { arrive_local: v })}
              />
            </Field>
            <Field label={t("flight.arriveTz")} htmlFor={`s-atz-${i}`}>
              <TzInput id={`s-atz-${i}`} value={s.arrive_tz} onChange={(v) => set(i, { arrive_tz: v })} />
            </Field>
            <Field label={t("flight.baggage")} className="col-span-6" htmlFor={`s-bag-${i}`}>
              <Input
                id={`s-bag-${i}`}
                value={s.baggage ?? ""}
                placeholder={t("flight.baggagePlaceholder")}
                onChange={(e) => set(i, { baggage: nil(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      ))}
    </Section>
  );
}
