import type { ActivityDetails, SlotKind } from "@/domain/types";
import { useT } from "@/i18n";
import { nil } from "@/lib/rows";
import { Checkbox, Field, Input } from "@/ui/core";
import { DateInput, LocationInput, NumberInput, TimeInput, TzInput } from "@/ui/inputs";
import { Section } from "./Section";

/**
 * Time span and place of activities, parking and insurance (all kept in activity details).
 * Parking is a timed span at a place; insurance is a date range without place or times.
 */
export function ActivitySection({
  a,
  kind,
  onChange,
}: {
  a: ActivityDetails;
  kind: SlotKind;
  onChange: (a: ActivityDetails) => void;
}) {
  const t = useT();
  const set = <K extends keyof ActivityDetails>(k: K, v: ActivityDetails[K]) => onChange({ ...a, [k]: v });
  if (kind === "insurance") {
    return (
      <Section title={t("insurance.title")}>
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("insurance.type")} className="col-span-2" htmlFor="ac-cat">
            <Input
              id="ac-cat"
              value={a.category ?? ""}
              placeholder={t("insurance.typePlaceholder")}
              onChange={(e) => set("category", nil(e.target.value))}
            />
          </Field>
          <Field label={t("insurance.from")} htmlFor="ac-d">
            <DateInput id="ac-d" value={a.start_date} onChange={(v) => set("start_date", v)} />
          </Field>
          <Field label={t("insurance.until")} htmlFor="ac-ed">
            <DateInput
              id="ac-ed"
              value={a.end_date}
              min={a.start_date ?? undefined}
              onChange={(v) => set("end_date", v)}
            />
          </Field>
        </div>
        <p className="text-fg-3 text-xs">{t("insurance.hint")}</p>
      </Section>
    );
  }
  const parking = kind === "parking";
  const p = parking ? "parking" : "activity";
  return (
    <Section title={t(`${p}.title`)}>
      <div className="grid grid-cols-4 gap-3">
        {!parking && (
          <Field label={t("activity.category")} htmlFor="ac-cat">
            <Input
              id="ac-cat"
              value={a.category ?? ""}
              placeholder={t("activity.categoryPlaceholder")}
              onChange={(e) => set("category", nil(e.target.value))}
            />
          </Field>
        )}
        <Field label={t(`${p}.location`)} className={parking ? "col-span-4" : "col-span-2"} htmlFor="ac-loc">
          <Input
            id="ac-loc"
            value={a.location ?? ""}
            placeholder={parking ? t("parking.locationPlaceholder") : undefined}
            onChange={(e) => set("location", nil(e.target.value))}
          />
        </Field>
        {!parking && (
          <div className="flex items-end pb-2">
            <Checkbox
              label={t("activity.flexible")}
              checked={a.flexible}
              onChange={(e) => set("flexible", e.target.checked)}
            />
          </div>
        )}
        <Field label={t(`${p}.date`)} htmlFor="ac-d">
          <DateInput id="ac-d" value={a.start_date} onChange={(v) => set("start_date", v)} />
        </Field>
        <Field label={t(`${p}.start`)} htmlFor="ac-s">
          <TimeInput id="ac-s" value={a.start_time} onChange={(v) => set("start_time", v)} />
        </Field>
        <Field
          label={t(`${p}.endDate`)}
          hint={parking ? undefined : t("activity.endDateHint")}
          htmlFor="ac-ed"
        >
          <DateInput
            id="ac-ed"
            value={a.end_date}
            min={a.start_date ?? undefined}
            onChange={(v) => set("end_date", v)}
          />
        </Field>
        <Field label={t(`${p}.end`)} htmlFor="ac-e">
          <TimeInput id="ac-e" value={a.end_time} onChange={(v) => set("end_time", v)} />
        </Field>
        {!parking && (
          <Field label={t("activity.duration")} hint={t("activity.durationHint")} htmlFor="ac-dur">
            <NumberInput
              id="ac-dur"
              min={0}
              value={a.duration_min}
              onChange={(v) => set("duration_min", v)}
            />
          </Field>
        )}
        <Field label={t("activity.tz")} htmlFor="ac-tz">
          <TzInput id="ac-tz" value={a.tz} onChange={(v) => set("tz", v)} />
        </Field>
        <Field
          label={t("stay.coordinates")}
          hint={t("stay.coordinatesHint")}
          className="col-span-2"
          htmlFor="ac-coords"
        >
          <LocationInput
            id="ac-coords"
            lat={a.lat}
            lon={a.lon}
            onChange={(lat, lon) => onChange({ ...a, lat, lon })}
          />
        </Field>
      </div>
    </Section>
  );
}
