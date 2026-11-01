import { Plus, Repeat, Trash2 } from "lucide-react";
import type { FlightSegment, OptionBundle, TransportMode } from "@/domain/types";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { newSegment, nil } from "@/lib/rows";
import { Button, Field, IconButton, Input, Select } from "@/ui/core";
import { DateTimeInput, LocationInput, TzInput } from "@/ui/inputs";
import { ModeIcon } from "@/ui/status";
import { Section } from "./Section";

export const MODES: TransportMode[] = ["train", "bus", "ferry", "transfer", "other"];

/** Segments of a train, bus, ferry or transfer journey; each segment has its own means. */
export function TransportSection({ b, setB }: { b: OptionBundle; setB: (b: OptionBundle) => void }) {
  const t = useT();
  const { timeZone } = usePrefs();
  const segs = b.segments;
  const set = (i: number, patch: Partial<FlightSegment>) =>
    setB({ ...b, segments: segs.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const add = () => {
    const last = segs.at(-1);
    setB({
      ...b,
      segments: [
        ...segs,
        {
          ...newSegment(b.option.id, segs.length + 1, last?.mode ?? "train"),
          from_place: last?.to_place ?? null,
          from_lat: last?.to_lat ?? null,
          from_lon: last?.to_lon ?? null,
          depart_tz: last?.arrive_tz ?? null,
        },
      ],
    });
  };
  const addReturn = () => {
    const first = segs[0];
    const last = segs.at(-1);
    if (!first || !last) return;
    setB({
      ...b,
      segments: [
        ...segs,
        {
          ...newSegment(b.option.id, segs.length + 1, first.mode ?? "train"),
          airline: first.airline,
          from_place: last.to_place,
          from_lat: last.to_lat,
          from_lon: last.to_lon,
          depart_tz: last.arrive_tz,
          to_place: first.from_place,
          to_lat: first.from_lat,
          to_lon: first.from_lon,
          arrive_tz: first.depart_tz,
        },
      ],
    });
  };
  return (
    <Section
      title={t("transport.segments")}
      actions={
        <div className="flex gap-2">
          <Button
            size="sm"
            icon={<Repeat className="size-3.5" />}
            onClick={addReturn}
            disabled={segs.length === 0}
          >
            {t("transport.addReturn")}
          </Button>
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={add}>
            {t("transport.addSegment")}
          </Button>
        </div>
      }
    >
      <p className="-mt-2 text-fg-3 text-xs">{t("transport.hint")}</p>
      {segs.map((s, i) => (
        <div key={s.id} className="rounded-lg border border-line bg-surface-2/50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-fg-2 text-xs">
              <ModeIcon mode={s.mode} className="size-3.5" />
              {t("flight.segment", { n: i + 1 })}
              {s.booking_id && <span className="ml-1 text-ok">· {t("flight.segmentBooked")}</span>}
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
            <Field label={t("transport.mode")} htmlFor={`t-mode-${i}`}>
              <Select
                id={`t-mode-${i}`}
                value={s.mode ?? "train"}
                onChange={(e) => set(i, { mode: e.target.value as TransportMode })}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`transportMode.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("transport.operator")} htmlFor={`t-op-${i}`}>
              <Input
                id={`t-op-${i}`}
                value={s.airline ?? ""}
                placeholder={t("transport.operatorPlaceholder")}
                onChange={(e) => set(i, { airline: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("transport.number")} htmlFor={`t-no-${i}`}>
              <Input
                id={`t-no-${i}`}
                value={s.flight_number ?? ""}
                placeholder="ICE 123"
                onChange={(e) => set(i, { flight_number: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("transport.class")} htmlFor={`t-cl-${i}`}>
              <Input
                id={`t-cl-${i}`}
                value={s.cabin ?? ""}
                placeholder={t("transport.classPlaceholder")}
                onChange={(e) => set(i, { cabin: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("transport.seat")} className="col-span-2" htmlFor={`t-seat-${i}`}>
              <Input
                id={`t-seat-${i}`}
                value={s.fare_class ?? ""}
                placeholder={t("transport.seatPlaceholder")}
                onChange={(e) => set(i, { fare_class: nil(e.target.value) })}
              />
            </Field>

            <Field label={t("transport.from")} className="col-span-2" htmlFor={`t-from-${i}`}>
              <Input
                id={`t-from-${i}`}
                value={s.from_place ?? ""}
                placeholder={t("transport.placePlaceholder")}
                onChange={(e) => set(i, { from_place: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("transport.departs")} className="col-span-2" htmlFor={`t-dep-${i}`}>
              <DateTimeInput
                id={`t-dep-${i}`}
                value={s.depart_local}
                onChange={(v) => set(i, { depart_local: v, depart_tz: s.depart_tz ?? timeZone })}
              />
            </Field>
            <Field label={t("flight.departTz")} htmlFor={`t-dtz-${i}`}>
              <TzInput id={`t-dtz-${i}`} value={s.depart_tz} onChange={(v) => set(i, { depart_tz: v })} />
            </Field>
            <Field label={t("stay.coordinates")} htmlFor={`t-fc-${i}`}>
              <LocationInput
                id={`t-fc-${i}`}
                lat={s.from_lat}
                lon={s.from_lon}
                query={s.from_place}
                onChange={(lat, lon) => set(i, { from_lat: lat, from_lon: lon })}
              />
            </Field>

            <Field label={t("transport.to")} className="col-span-2" htmlFor={`t-to-${i}`}>
              <Input
                id={`t-to-${i}`}
                value={s.to_place ?? ""}
                placeholder={t("transport.placePlaceholder")}
                onChange={(e) => set(i, { to_place: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("transport.arrives")} className="col-span-2" htmlFor={`t-arr-${i}`}>
              <DateTimeInput
                id={`t-arr-${i}`}
                value={s.arrive_local}
                onChange={(v) =>
                  set(i, { arrive_local: v, arrive_tz: s.arrive_tz ?? s.depart_tz ?? timeZone })
                }
              />
            </Field>
            <Field label={t("flight.arriveTz")} htmlFor={`t-atz-${i}`}>
              <TzInput id={`t-atz-${i}`} value={s.arrive_tz} onChange={(v) => set(i, { arrive_tz: v })} />
            </Field>
            <Field label={t("stay.coordinates")} htmlFor={`t-tc-${i}`}>
              <LocationInput
                id={`t-tc-${i}`}
                lat={s.to_lat}
                lon={s.to_lon}
                query={s.to_place}
                onChange={(lat, lon) => set(i, { to_lat: lat, to_lon: lon })}
              />
            </Field>
          </div>
        </div>
      ))}
    </Section>
  );
}
