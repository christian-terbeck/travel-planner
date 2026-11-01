import { parseCoordinates } from "@/domain/geo";
import { accommodationNights } from "@/domain/items";
import type { AccommodationDetails, AccommodationType } from "@/domain/types";
import { useT } from "@/i18n";
import { nil } from "@/lib/rows";
import { Field, Input, Select } from "@/ui/core";
import { DateInput, LocationInput, TimeInput, TzInput } from "@/ui/inputs";
import { Section } from "./Section";

const ACC_TYPES: AccommodationType[] = [
  "hotel",
  "apartment",
  "vacation_rental",
  "hostel",
  "campsite",
  "other",
];

export function AccommodationSection({
  a,
  onChange,
}: {
  a: AccommodationDetails;
  onChange: (a: AccommodationDetails) => void;
}) {
  const t = useT();
  const set = <K extends keyof AccommodationDetails>(k: K, v: AccommodationDetails[K]) =>
    onChange({ ...a, [k]: v });
  const nights = accommodationNights(a);
  return (
    <Section title={t("stay.title")}>
      <div className="grid grid-cols-4 gap-3">
        <Field label={t("stay.type")} htmlFor="a-type">
          <Select
            id="a-type"
            value={a.accommodation_type}
            onChange={(e) => set("accommodation_type", e.target.value as AccommodationType)}
          >
            {ACC_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`accommodationType.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("stay.checkIn")} htmlFor="a-in">
          <DateInput id="a-in" value={a.check_in} onChange={(v) => set("check_in", v)} />
        </Field>
        <Field
          label={t("stay.checkOut")}
          hint={nights ? t("item.nights", { count: nights }) : undefined}
          htmlFor="a-out"
        >
          <DateInput
            id="a-out"
            value={a.check_out}
            min={a.check_in ?? undefined}
            onChange={(v) => set("check_out", v)}
          />
        </Field>
        <Field label={t("stay.tz")} htmlFor="a-tz">
          <TzInput id="a-tz" value={a.tz} onChange={(v) => set("tz", v)} />
        </Field>
        <Field label={t("stay.checkInTime")} htmlFor="a-int">
          <TimeInput id="a-int" value={a.check_in_time} onChange={(v) => set("check_in_time", v)} />
        </Field>
        <Field label={t("stay.checkOutTime")} htmlFor="a-outt">
          <TimeInput id="a-outt" value={a.check_out_time} onChange={(v) => set("check_out_time", v)} />
        </Field>
        <Field label={t("stay.room")} htmlFor="a-room">
          <Input
            id="a-room"
            value={a.room_type ?? ""}
            onChange={(e) => set("room_type", nil(e.target.value))}
          />
        </Field>
        <Field label={t("stay.meals")} htmlFor="a-meal">
          <Input
            id="a-meal"
            value={a.meal_plan ?? ""}
            placeholder={t("stay.mealsPlaceholder")}
            onChange={(e) => set("meal_plan", nil(e.target.value))}
          />
        </Field>
        <Field label={t("stay.address")} className="col-span-2" htmlFor="a-addr">
          <Input id="a-addr" value={a.address ?? ""} onChange={(e) => set("address", nil(e.target.value))} />
        </Field>
        <Field label={t("stay.mapUrl")} className="col-span-2" htmlFor="a-map">
          <Input
            id="a-map"
            type="url"
            value={a.map_url ?? ""}
            placeholder="https://maps.google.com/…"
            onChange={(e) => {
              const map_url = nil(e.target.value);
              const c = a.lat === null ? parseCoordinates(map_url) : null;
              onChange({ ...a, map_url, ...(c ? { lat: c.lat, lon: c.lon } : {}) });
            }}
          />
        </Field>
        <Field
          label={t("stay.coordinates")}
          hint={t("stay.coordinatesHint")}
          className="col-span-2"
          htmlFor="a-loc"
        >
          <LocationInput
            id="a-loc"
            lat={a.lat}
            lon={a.lon}
            onChange={(lat, lon) => onChange({ ...a, lat, lon })}
          />
        </Field>
      </div>
    </Section>
  );
}
