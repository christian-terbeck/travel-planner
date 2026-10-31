import { AlertTriangle, Plus, Repeat, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { parseCoordinates } from "@/domain/geo";
import { accommodationNights, rentalDays } from "@/domain/items";
import type {
  AccommodationDetails,
  AccommodationType,
  ActivityDetails,
  DayRule,
  Decision,
  FlightSegment,
  OptionBundle,
  OptionStatus,
  PlanOption,
  PriceBasis,
  RentalCarDetails,
  Slot,
} from "@/domain/types";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { newFee, newPolicy, newSegment, nil, nowIso } from "@/lib/rows";
import { Button, Checkbox, Field, IconButton, Input, Select, Textarea } from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import {
  AirportInput,
  DateInput,
  DateTimeInput,
  LocationInput,
  MoneyInput,
  NumberInput,
  TimeInput,
  TzInput,
} from "@/ui/inputs";
import { KindIcon } from "@/ui/status";
import { PolicyEditor } from "./PolicyEditor";

const BASES: PriceBasis[] = ["total", "per_person", "per_night", "per_day"];
const DECISIONS: Decision[] = ["none", "favorite", "rejected"];
const ACC_TYPES: AccommodationType[] = [
  "hotel",
  "apartment",
  "vacation_rental",
  "hostel",
  "campsite",
  "other",
];

/** Platform names recognised from a pasted link (offline, by domain). */
const PLATFORMS: Array<[RegExp, string]> = [
  [/(^|\.)booking\.com$/, "Booking.com"],
  [/(^|\.)airbnb\./, "Airbnb"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)check24\.de$/, "Check24"],
  [/(^|\.)expedia\./, "Expedia"],
  [/(^|\.)skyscanner\./, "Skyscanner"],
  [/(^|\.)kayak\./, "Kayak"],
  [/(^|\.)mietwagenbilliger\.de$/, "MietwagenBilliger.de"],
  [/(^|\.)billiger-mietwagen\.de$/, "billiger-mietwagen.de"],
  [/(^|\.)budget\./, "Budget"],
  [/(^|\.)sixt\./, "Sixt"],
  [/(^|\.)europcar\./, "Europcar"],
  [/(^|\.)getyourguide\./, "GetYourGuide"],
  [/(^|\.)viator\.com$/, "Viator"],
  [/(^|\.)hotels\.com$/, "Hotels.com"],
  [/(^|\.)vrbo\.com$/, "Vrbo"],
  [/(^|\.)flytap\.com$/, "TAP Air Portugal"],
  [/(^|\.)lufthansa\.com$/, "Lufthansa"],
  [/(^|\.)ryanair\.com$/, "Ryanair"],
  [/(^|\.)easyjet\.com$/, "easyJet"],
  [/(^|\.)eurowings\.com$/, "Eurowings"],
];

export function platformFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PLATFORMS.find(([re]) => re.test(host))?.[1] ?? null;
  } catch {
    return null;
  }
}

function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{title}</h4>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function OptionEditor({
  bundle: initial,
  slot,
  booked,
  open,
  onOpenChange,
  onDraft,
}: {
  bundle: OptionBundle | null;
  slot: Slot | null;
  booked: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Returns the edited option instead of saving it (used when booking a new option directly). */
  onDraft?: (b: OptionBundle) => void;
}) {
  const t = useT();
  const run = useAction();
  const confirm = useConfirm();
  const { timeZone } = usePrefs();
  const [b, setB] = useState<OptionBundle | null>(initial);
  const [titleError, setTitleError] = useState(false);
  useEffect(() => {
    if (open) {
      setB(initial);
      setTitleError(false);
    }
  }, [open, initial]);
  if (!b || !slot) return null;
  const o = b.option;
  const setO = <K extends keyof PlanOption>(k: K, v: PlanOption[K]) =>
    setB({ ...b, option: { ...o, [k]: v } });
  const isNew = o.title === "" && !booked;

  const save = async () => {
    if (!o.title.trim()) {
      setTitleError(true);
      return;
    }
    if (booked) {
      const ok = await confirm({
        title: t("option.bookedEditTitle"),
        text: t("option.bookedEditText"),
        confirm: t("option.bookedEditConfirm"),
      });
      if (!ok) return;
    }
    const segments = b.segments.map((s, i) => ({ ...s, seq: i + 1 }));
    const fees = b.fees
      .filter((x) => x.label.trim())
      .map((x, i) => ({ ...x, sort: i, currency: x.currency || o.currency }));
    const policy = b.policy ? { ...b.policy, currency: o.currency } : null;
    if (onDraft) {
      onDraft({ ...b, option: { ...o, title: o.title.trim() }, segments, fees, policy });
      return;
    }
    const result = await run(
      () => api.saveOption({ ...b, option: { ...o, title: o.title.trim() }, segments, fees, policy }, booked),
      t("option.saved"),
    );
    if (result !== undefined) onOpenChange(false);
  };

  const statuses: OptionStatus[] = booked
    ? ["booked", "completed", "archived"]
    : ["idea", "planned", "archived"];
  if (!statuses.includes(o.status)) statuses.unshift(o.status);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <KindIcon kind={slot.kind} />
          {isNew ? t("option.newTitle", { slot: slot.title }) : t("option.editTitle", { title: o.title })}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={save}>
            {onDraft ? t("common.continue") : t("common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {booked && (
          <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("option.bookedBanner")}
          </div>
        )}
        <Section title={t("option.general")}>
          <div className="grid grid-cols-4 gap-3">
            <Field
              label={t("option.title")}
              error={titleError ? t("errors.required") : undefined}
              className="col-span-2"
              htmlFor="o-title"
            >
              <Input
                id="o-title"
                autoFocus
                value={o.title}
                placeholder={t(`option.titlePlaceholder.${slot.kind}`)}
                onChange={(e) => setO("title", e.target.value)}
                aria-invalid={titleError}
              />
            </Field>
            <Field label={t("option.provider")} htmlFor="o-prov">
              <Input
                id="o-prov"
                value={o.provider ?? ""}
                placeholder={t(`option.providerPlaceholder.${slot.kind}`)}
                onChange={(e) => setO("provider", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.platform")} htmlFor="o-plat">
              <Input
                id="o-plat"
                value={o.platform ?? ""}
                placeholder="Booking.com, Google Flights…"
                onChange={(e) => setO("platform", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.url")} className="col-span-2" hint={t("option.urlHint")} htmlFor="o-url">
              <Input
                id="o-url"
                type="url"
                value={o.url ?? ""}
                placeholder="https://"
                onChange={(e) => {
                  const url = nil(e.target.value);
                  const platform = url && !o.platform ? platformFromUrl(url) : null;
                  setB({ ...b, option: { ...o, url, platform: platform ?? o.platform } });
                }}
              />
            </Field>
            <Field label={t("option.price")} htmlFor="o-price">
              <MoneyInput
                id="o-price"
                value={o.price_minor}
                currency={o.currency}
                onChange={(v) => setO("price_minor", v)}
                onCurrencyChange={(c) => setO("currency", c)}
              />
            </Field>
            <Field label={t("option.priceBasis")} htmlFor="o-basis">
              <Select
                id="o-basis"
                value={o.price_basis}
                onChange={(e) => setO("price_basis", e.target.value as PriceBasis)}
              >
                {BASES.map((x) => (
                  <option key={x} value={x}>
                    {t(`priceBasis.${x}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("option.partySize")} hint={t("option.partySizeHint")} htmlFor="o-party">
              <NumberInput
                id="o-party"
                min={1}
                max={99}
                value={o.party_size}
                onChange={(v) => setO("party_size", v)}
              />
            </Field>
            <Field label={t("option.verified")} htmlFor="o-ver">
              <div className="flex items-center gap-2">
                <span id="o-ver" className="text-fg-2 text-sm">
                  {o.price_verified_at
                    ? new Date(o.price_verified_at).toLocaleString()
                    : t("option.notVerified")}
                </span>
                <Button size="sm" onClick={() => setO("price_verified_at", nowIso())}>
                  {t("option.verifiedNow")}
                </Button>
              </div>
            </Field>
            <Field label={t("option.source")} htmlFor="o-src">
              <Input
                id="o-src"
                value={o.source ?? ""}
                placeholder={t("option.sourcePlaceholder")}
                onChange={(e) => setO("source", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.status")} htmlFor="o-status">
              <Select
                id="o-status"
                value={o.status}
                onChange={(e) => setO("status", e.target.value as OptionStatus)}
              >
                {statuses.map((s) => (
                  <option key={s} value={s} disabled={(s === "booked" || s === "cancelled") && !booked}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("option.decision")} htmlFor="o-dec">
              <Select
                id="o-dec"
                value={o.decision}
                onChange={(e) => setO("decision", e.target.value as Decision)}
              >
                {DECISIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`decision.${d}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("option.rating")} htmlFor="o-rate">
              <Select
                id="o-rate"
                value={o.rating ?? ""}
                onChange={(e) => setO("rating", e.target.value === "" ? null : Number(e.target.value))}
              >
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        {slot.kind === "flight" && <FlightSection b={b} setB={setB} />}
        {b.accommodation && (
          <AccommodationSection a={b.accommodation} onChange={(a) => setB({ ...b, accommodation: a })} />
        )}
        {b.rental_car && (
          <RentalSection
            r={b.rental_car}
            currency={o.currency}
            onChange={(r) => setB({ ...b, rental_car: r })}
          />
        )}
        {b.activity && <ActivitySection a={b.activity} onChange={(a) => setB({ ...b, activity: a })} />}

        <Section
          title={t("option.fees")}
          actions={
            <Button
              size="sm"
              icon={<Plus className="size-3.5" />}
              onClick={() => setB({ ...b, fees: [...b.fees, newFee(o.id, o.currency, b.fees.length)] })}
            >
              {t("option.addFee")}
            </Button>
          }
        >
          {b.fees.length === 0 ? (
            <p className="text-fg-3 text-xs">{t("option.noFees")}</p>
          ) : (
            b.fees.map((fee, i) => (
              <div key={fee.id} className="grid grid-cols-[1fr_220px_auto_auto] items-center gap-3">
                <Input
                  aria-label={t("option.feeLabel")}
                  placeholder={t("option.feeLabel")}
                  value={fee.label}
                  onChange={(e) =>
                    setB({
                      ...b,
                      fees: b.fees.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    })
                  }
                />
                <MoneyInput
                  value={fee.amount_minor}
                  currency={fee.currency}
                  onChange={(v) =>
                    setB({ ...b, fees: b.fees.map((x, j) => (j === i ? { ...x, amount_minor: v } : x)) })
                  }
                  onCurrencyChange={(c) =>
                    setB({ ...b, fees: b.fees.map((x, j) => (j === i ? { ...x, currency: c } : x)) })
                  }
                />
                <Checkbox
                  label={t("option.feeIncluded")}
                  checked={fee.included}
                  onChange={(e) =>
                    setB({
                      ...b,
                      fees: b.fees.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)),
                    })
                  }
                />
                <IconButton
                  label={t("common.remove")}
                  onClick={() => setB({ ...b, fees: b.fees.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ))
          )}
        </Section>

        <Section title={t("option.cancellation")}>
          <PolicyEditor
            policy={b.policy}
            onChange={(p) => setB({ ...b, policy: p })}
            create={() => newPolicy({ option_id: o.id }, o.currency)}
            defaultTz={b.accommodation?.tz ?? b.rental_car?.pickup_tz ?? b.segments[0]?.depart_tz ?? timeZone}
          />
        </Section>

        <Section title={t("option.notes")}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("option.pros")} htmlFor="o-pros">
              <Textarea
                id="o-pros"
                rows={2}
                value={o.pros ?? ""}
                onChange={(e) => setO("pros", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.cons")} htmlFor="o-cons">
              <Textarea
                id="o-cons"
                rows={2}
                value={o.cons ?? ""}
                onChange={(e) => setO("cons", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.included")} htmlFor="o-inc">
              <Textarea
                id="o-inc"
                rows={2}
                value={o.included_services ?? ""}
                onChange={(e) => setO("included_services", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.contact")} htmlFor="o-contact">
              <Textarea
                id="o-contact"
                rows={2}
                value={o.contact ?? ""}
                onChange={(e) => setO("contact", nil(e.target.value))}
              />
            </Field>
            <Field label={t("option.notesField")} className="col-span-2" htmlFor="o-notes">
              <Textarea
                id="o-notes"
                rows={3}
                value={o.notes ?? ""}
                onChange={(e) => setO("notes", nil(e.target.value))}
              />
            </Field>
          </div>
        </Section>
      </div>
    </Dialog>
  );
}

function FlightSection({ b, setB }: { b: OptionBundle; setB: (b: OptionBundle) => void }) {
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
              <Input
                id={`s-al-${i}`}
                value={s.airline ?? ""}
                onChange={(e) => set(i, { airline: nil(e.target.value) })}
              />
            </Field>
            <Field label={t("flight.number")} htmlFor={`s-fn-${i}`}>
              <Input
                id={`s-fn-${i}`}
                value={s.flight_number ?? ""}
                placeholder="TP 571"
                onChange={(e) => set(i, { flight_number: nil(e.target.value) })}
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

function AccommodationSection({
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

function RentalSection({
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

function ActivitySection({ a, onChange }: { a: ActivityDetails; onChange: (a: ActivityDetails) => void }) {
  const t = useT();
  const set = <K extends keyof ActivityDetails>(k: K, v: ActivityDetails[K]) => onChange({ ...a, [k]: v });
  return (
    <Section title={t("activity.title")}>
      <div className="grid grid-cols-4 gap-3">
        <Field label={t("activity.category")} htmlFor="ac-cat">
          <Input
            id="ac-cat"
            value={a.category ?? ""}
            placeholder={t("activity.categoryPlaceholder")}
            onChange={(e) => set("category", nil(e.target.value))}
          />
        </Field>
        <Field label={t("activity.location")} className="col-span-2" htmlFor="ac-loc">
          <Input
            id="ac-loc"
            value={a.location ?? ""}
            onChange={(e) => set("location", nil(e.target.value))}
          />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox
            label={t("activity.flexible")}
            checked={a.flexible}
            onChange={(e) => set("flexible", e.target.checked)}
          />
        </div>
        <Field label={t("activity.date")} htmlFor="ac-d">
          <DateInput id="ac-d" value={a.start_date} onChange={(v) => set("start_date", v)} />
        </Field>
        <Field label={t("activity.start")} htmlFor="ac-s">
          <TimeInput id="ac-s" value={a.start_time} onChange={(v) => set("start_time", v)} />
        </Field>
        <Field label={t("activity.end")} htmlFor="ac-e">
          <TimeInput id="ac-e" value={a.end_time} onChange={(v) => set("end_time", v)} />
        </Field>
        <Field label={t("activity.endDate")} hint={t("activity.endDateHint")} htmlFor="ac-ed">
          <DateInput
            id="ac-ed"
            value={a.end_date}
            min={a.start_date ?? undefined}
            onChange={(v) => set("end_date", v)}
          />
        </Field>
        <Field label={t("activity.duration")} hint={t("activity.durationHint")} htmlFor="ac-dur">
          <NumberInput id="ac-dur" min={0} value={a.duration_min} onChange={(v) => set("duration_min", v)} />
        </Field>
        <Field label={t("activity.tz")} htmlFor="ac-tz">
          <TzInput id="ac-tz" value={a.tz} onChange={(v) => set("tz", v)} />
        </Field>
        <Field
          label={t("stay.coordinates")}
          hint={t("stay.coordinatesHint")}
          className="col-span-2"
          htmlFor="ac-loc"
        >
          <LocationInput
            id="ac-loc"
            lat={a.lat}
            lon={a.lon}
            onChange={(lat, lon) => onChange({ ...a, lat, lon })}
          />
        </Field>
      </div>
    </Section>
  );
}
