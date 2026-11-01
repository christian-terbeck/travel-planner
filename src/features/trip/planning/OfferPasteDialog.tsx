import { ClipboardPaste, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type { OptionBundle, Slot } from "@/domain/types";
import { useErrorText, useT } from "@/i18n";
import { useAirports } from "@/lib/airports";
import { bundleFromExtraction } from "@/lib/confirmationImport";
import { bundleFromOffer, offerFound, parseOffer } from "@/lib/offerLink";
import { useFormat, usePrefs } from "@/lib/prefs";
import { fillFromUrl } from "@/lib/providers";
import { Button, Field, Spinner, Textarea } from "@/ui/core";
import { Dialog } from "@/ui/dialog";
import { useTrip } from "../TripLayout";

/** Below this much text besides the link there is nothing for Claude to read. */
const MIN_AI_TEXT = 40;

/**
 * Turns a pasted offer link or offer text into a new alternative. Links are read offline; longer
 * text can be read by Claude when the import is turned on. The result opens in the option form.
 */
export function OfferPasteDialog({
  slot,
  onClose,
  onResult,
}: {
  slot: Slot | null;
  onClose: () => void;
  onResult: (bundle: OptionBundle) => void;
}) {
  const t = useT();
  const f = useFormat();
  const m = useTrip();
  const errorText = useErrorText();
  const { aiImport, language } = usePrefs();
  const airports = useAirports();
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (slot) {
      setText("");
      setError(null);
      setReading(false);
    }
  }, [slot]);

  const parsed = useMemo(() => parseOffer(text), [text]);
  if (!slot) return null;
  const sort = m.graph.options.filter((o) => o.slot_id === slot.id).length;
  const datesNote = (a: string, b: string | null) =>
    b ? t("offer.datesNote", { dates: f.dateRange(a, b) }) : t("offer.dateNote", { date: f.date(a) });
  const canAi = aiImport && parsed.rest.length >= MIN_AI_TEXT;

  const fillOffline = () => onResult(bundleFromOffer(parsed, slot, m.graph.trip.currency, sort, datesNote));

  const readWithClaude = async () => {
    setReading(true);
    setError(null);
    try {
      const e = await api.extractOffer(text, slot.kind, language);
      const offline = bundleFromOffer(parsed, slot, m.graph.trip.currency, sort, datesNote);
      const b = bundleFromExtraction(e, {
        slot,
        tripCurrency: m.graph.trip.currency,
        sort,
        airportTz: (code) => airports?.get(code)?.tz ?? null,
        source: offline.option.source ?? t("offer.pasted"),
      });
      // The link and what it says about the provider are known for sure; Claude fills the rest.
      const names = fillFromUrl({ provider: b.option.provider, platform: b.option.platform }, parsed.url);
      b.option = {
        ...b.option,
        ...names,
        url: parsed.url,
        title: b.option.title || offline.option.title,
        party_size: offline.option.party_size,
        price_verified_at: b.option.price_minor !== null ? offline.option.price_verified_at : null,
      };
      if (b.accommodation && offline.accommodation)
        b.accommodation = {
          ...b.accommodation,
          check_in: b.accommodation.check_in ?? offline.accommodation.check_in,
          check_out: b.accommodation.check_out ?? offline.accommodation.check_out,
        };
      if (b.segments.length === 0) b.segments = offline.segments;
      onResult(b);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setReading(false);
    }
  };

  const found: Array<[string, string]> = [];
  if (parsed.title) found.push([t("option.title"), parsed.title]);
  if (parsed.from && parsed.to) found.push([t("offer.route"), `${parsed.from} → ${parsed.to}`]);
  if (parsed.start)
    found.push([t("offer.dates"), parsed.end ? f.dateRange(parsed.start, parsed.end) : f.date(parsed.start)]);
  const people = (parsed.adults ?? 0) + (parsed.children ?? 0);
  if (people > 0) found.push([t("offer.people"), String(people)]);
  if (parsed.price)
    found.push([t("option.price"), `${parsed.price.amount.toLocaleString()} ${parsed.price.currency}`]);

  return (
    <Dialog
      open={!!slot}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <ClipboardPaste className="size-4" aria-hidden />
          {t("offer.title", { slot: slot.title })}
        </span>
      }
      description={t("offer.hint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {aiImport && (
            <Button
              icon={reading ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
              disabled={!canAi || reading}
              onClick={readWithClaude}
            >
              {t("offer.readWithClaude")}
            </Button>
          )}
          <Button variant="primary" disabled={!text.trim() || reading} onClick={fillOffline}>
            {t("offer.use")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <Field label={t("offer.text")} htmlFor="offer-text">
          <Textarea
            id="offer-text"
            autoFocus
            rows={6}
            value={text}
            placeholder={t("offer.placeholder")}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        {text.trim() &&
          (offerFound(parsed) ? (
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <p className="mb-1 font-medium text-xs">{t("offer.found")}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-fg-2 text-xs">
                {found.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-fg-3 text-xs">{t("offer.nothingFound")}</p>
          ))}
        {reading && <p className="text-fg-2 text-xs">{t("offer.reading")}</p>}
        {error && <p className="text-danger text-xs">{error}</p>}
        <p className="text-fg-3 text-xs">{aiImport ? t("offer.privacyAi") : t("offer.privacy")}</p>
      </div>
    </Dialog>
  );
}
