import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { Decision, OptionBundle, OptionStatus, PlanOption, PriceBasis, Slot } from "@/domain/types";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { newPolicy, nil, nowIso } from "@/lib/rows";
import { Button, Field, Input, Select, Textarea } from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { MoneyInput, NumberInput } from "@/ui/inputs";
import { KindIcon } from "@/ui/status";
import { AccommodationSection } from "./option/AccommodationSection";
import { ActivitySection } from "./option/ActivitySection";
import { FeesSection } from "./option/FeesSection";
import { FlightSection } from "./option/FlightSection";
import { platformFromUrl } from "./option/platforms";
import { RentalSection } from "./option/RentalSection";
import { Section } from "./option/Section";
import { TransportSection } from "./option/TransportSection";
import { PolicyEditor } from "./PolicyEditor";

const BASES: PriceBasis[] = ["total", "per_person", "per_night", "per_day"];
const DECISIONS: Decision[] = ["none", "favorite", "rejected"];

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
        {slot.kind === "transport" && <TransportSection b={b} setB={setB} />}
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
        {b.activity && (
          <ActivitySection a={b.activity} kind={slot.kind} onChange={(a) => setB({ ...b, activity: a })} />
        )}
        <FeesSection b={b} setB={setB} />

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
