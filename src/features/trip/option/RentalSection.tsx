import { useMemo } from "react";
import { rentalDays } from "@/domain/items";
import type { DayRule, RentalCarDetails } from "@/domain/types";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { nil } from "@/lib/rows";
import { Field, Input, Select } from "@/ui/core";
import { DateTimeInput, MoneyInput, NumberInput, TzInput } from "@/ui/inputs";
import { Section } from "./Section";

export function RentalSection({
  r,
  currency,
  onChange,
}: {
  r: RentalCarDetails;
  currency: string;
  onChange: (r: RentalCarDetails) => void;
}) {
  const t = useT();
  const { timeZone } = usePrefs();
  const set = <K extends keyof RentalCarDetails>(k: K, v: RentalCarDetails[K]) => onChange({ ...r, [k]: v });
  const days = useMemo(() => rentalDays(r, timeZone), [r, timeZone]);
  return (
    <Section title={t("car.title")}>
      <div className="grid grid-cols-4 gap-3">
        <Field label={t("car.category")} htmlFor="c-cat">
          <Input
            id="c-cat"
            value={r.vehicle_category ?? ""}
            placeholder={t("car.categoryPlaceholder")}
            onChange={(e) => set("vehicle_category", nil(e.target.value))}
          />
        </Field>
        <Field label={t("car.model")} htmlFor="c-model">
          <Input
            id="c-model"
            value={r.vehicle_model ?? ""}
            placeholder={t("car.modelPlaceholder")}
            onChange={(e) => set("vehicle_model", nil(e.target.value))}
          />
        </Field>
        <Field
          label={t("car.dayRule")}
          hint={days ? t("car.chargeableDays", { count: days }) : undefined}
          htmlFor="c-rule"
        >
          <Select id="c-rule" value={r.day_rule} onChange={(e) => set("day_rule", e.target.value as DayRule)}>
            <option value="24h">{t("car.rule24h")}</option>
            <option value="calendar">{t("car.ruleCalendar")}</option>
          </Select>
        </Field>
        <Field label={t("car.grace")} htmlFor="c-grace">
          <NumberInput
            id="c-grace"
            min={0}
            value={r.grace_minutes}
            onChange={(v) => set("grace_minutes", v ?? 0)}
          />
        </Field>
        <Field label={t("car.pickupLocation")} htmlFor="c-pl">
          <Input
            id="c-pl"
            value={r.pickup_location ?? ""}
            onChange={(e) => set("pickup_location", nil(e.target.value))}
          />
        </Field>
        <Field label={t("car.pickup")} className="col-span-2" htmlFor="c-pt">
          <DateTimeInput id="c-pt" value={r.pickup_local} onChange={(v) => set("pickup_local", v)} />
        </Field>
        <Field label={t("car.tz")} htmlFor="c-ptz">
          <TzInput id="c-ptz" value={r.pickup_tz} onChange={(v) => set("pickup_tz", v)} />
        </Field>
        <Field label={t("car.returnLocation")} htmlFor="c-rl">
          <Input
            id="c-rl"
            value={r.return_location ?? ""}
            placeholder={r.pickup_location ?? ""}
            onChange={(e) => set("return_location", nil(e.target.value))}
          />
        </Field>
        <Field label={t("car.return")} className="col-span-2" htmlFor="c-rt">
          <DateTimeInput id="c-rt" value={r.return_local} onChange={(v) => set("return_local", v)} />
        </Field>
        <Field label={t("car.tz")} htmlFor="c-rtz">
          <TzInput id="c-rtz" value={r.return_tz} onChange={(v) => set("return_tz", v)} />
        </Field>
        <Field label={t("car.mileage")} htmlFor="c-mil">
          <Input
            id="c-mil"
            value={r.mileage ?? ""}
            placeholder={t("car.mileagePlaceholder")}
            onChange={(e) => set("mileage", nil(e.target.value))}
          />
        </Field>
        <Field label={t("car.fuel")} htmlFor="c-fuel">
          <Input
            id="c-fuel"
            value={r.fuel_policy ?? ""}
            placeholder={t("car.fuelPlaceholder")}
            onChange={(e) => set("fuel_policy", nil(e.target.value))}
          />
        </Field>
        <Field label={t("car.excess")} htmlFor="c-ex">
          <MoneyInput
            id="c-ex"
            value={r.excess_minor}
            currency={currency}
            placeholder={t("common.notSet")}
            onChange={(v) => set("excess_minor", v)}
          />
        </Field>
        <Field label={t("car.deposit")} htmlFor="c-dep">
          <MoneyInput
            id="c-dep"
            value={r.deposit_minor}
            currency={currency}
            placeholder={t("common.notSet")}
            onChange={(v) => set("deposit_minor", v)}
          />
        </Field>
        <Field label={t("car.driverFee")} htmlFor="c-drv">
          <MoneyInput
            id="c-drv"
            value={r.additional_driver_fee_minor}
            currency={currency}
            placeholder={t("common.notSet")}
            onChange={(v) => set("additional_driver_fee_minor", v)}
          />
        </Field>
        <Field label={t("car.insurance")} className="col-span-3" htmlFor="c-ins">
          <Input
            id="c-ins"
            value={r.insurance ?? ""}
            onChange={(e) => set("insurance", nil(e.target.value))}
          />
        </Field>
      </div>
      <p className="text-fg-3 text-xs">{t("car.depositHint")}</p>
    </Section>
  );
}
