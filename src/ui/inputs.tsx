// Specialised inputs: money, currency, time zone, airport, dates.

import { useEffect, useId, useMemo, useState } from "react";
import { parseCoordinates } from "@/domain/geo";
import { currencyDigits, parseAmount, toMajorString } from "@/domain/money";
import { useT } from "@/i18n";
import { type Airport, searchAirports, useAirports } from "@/lib/airports";
import { usePrefs } from "@/lib/prefs";
import { cn, Input, Select } from "./core";

const COMMON = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "JPY",
  "CAD",
  "AUD",
  "NZD",
  "THB",
  "ISK",
];

export function allCurrencies(): string[] {
  try {
    const all =
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("currency") ??
      [];
    return [...COMMON, ...all.filter((c) => !COMMON.includes(c))];
  } catch {
    return COMMON;
  }
}

export function CurrencySelect({
  value,
  onChange,
  id,
  className,
}: {
  value: string;
  onChange: (c: string) => void;
  id?: string;
  className?: string;
}) {
  const list = useMemo(allCurrencies, []);
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-24", className)}
    >
      {list.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}

/**
 * Amount in minor units. Typing is free; the value is parsed on blur. `null` = unknown (empty).
 */
export function MoneyInput({
  value,
  currency,
  onChange,
  onCurrencyChange,
  id,
  placeholder,
  invalid,
}: {
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
  onCurrencyChange?: (c: string) => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
}) {
  const t = useT();
  const [text, setText] = useState(value === null ? "" : toMajorString(value, currency));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(value === null ? "" : toMajorString(value, currency));
  }, [value, currency]);
  const commit = () => {
    if (text.trim() === "") {
      setBad(false);
      onChange(null);
      return;
    }
    const minor = parseAmount(text, currency);
    if (minor === null || minor < 0) {
      setBad(true);
      return;
    }
    setBad(false);
    onChange(minor);
    setText(toMajorString(minor, currency));
  };
  return (
    <div className="flex gap-1.5">
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        placeholder={placeholder ?? t("common.unknownPrice")}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-invalid={bad || invalid}
        className="tabular text-right"
        title={bad ? t("errors.amount") : undefined}
      />
      {onCurrencyChange ? (
        <CurrencySelect value={currency} onChange={onCurrencyChange} />
      ) : (
        <span className="flex h-8.5 items-center px-1 text-fg-3 text-xs">{currency}</span>
      )}
      {bad && <span className="sr-only">{t("errors.amount")}</span>}
    </div>
  );
}

let zonesCache: string[] | null = null;
function zones(): string[] {
  zonesCache ??= (() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
        "timeZone",
      );
    } catch {
      return ["UTC"];
    }
  })();
  return zonesCache;
}

export function TzInput({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: string | null;
  onChange: (tz: string | null) => void;
  id?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const { timeZone } = usePrefs();
  const valid = !value || zones().includes(value) || value === "UTC";
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value ?? ""}
        placeholder={placeholder ?? timeZone}
        onChange={(e) => onChange(e.target.value.trim() || null)}
        aria-invalid={!valid}
      />
      <datalist id={listId}>
        {zones().map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </>
  );
}

/** IATA code input with offline lookup; reports the airport so callers can fill in its zone. */
export function AirportInput({
  value,
  onChange,
  onAirport,
  id,
}: {
  value: string | null;
  onChange: (code: string | null) => void;
  onAirport?: (a: Airport) => void;
  id?: string;
}) {
  const airports = useAirports();
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);
  useEffect(() => setQuery(value ?? ""), [value]);
  const matches = airports && open ? searchAirports(airports, query) : [];
  const current = value && airports?.get(value);
  const pick = (a: Airport) => {
    onChange(a.iata);
    onAirport?.(a);
    setQuery(a.iata);
    setOpen(false);
  };
  return (
    <div className="relative">
      <Input
        id={id}
        value={query}
        maxLength={40}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
          const code = query.trim().toUpperCase();
          if (/^[A-Z]{3}$/.test(code)) {
            onChange(code);
            const a = airports?.get(code);
            if (a && code !== value) onAirport?.(a);
          } else if (code === "") onChange(null);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className="uppercase"
        title={current ? `${current.name}, ${current.city}` : undefined}
      />
      {current && <p className="mt-0.5 truncate text-[11px] text-fg-3">{current.city || current.name}</p>}
      {matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-72 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-lg">
          {matches.map((a) => (
            <li key={a.iata}>
              <button
                type="button"
                className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(a)}
              >
                <span className="w-9 font-mono font-semibold">{a.iata}</span>
                <span className="min-w-0 flex-1 truncate">
                  {a.city ? `${a.city} · ` : ""}
                  <span className="text-fg-3">{a.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DateInput({
  value,
  onChange,
  id,
  min,
  max,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
  min?: string;
  max?: string;
}) {
  return (
    <Input
      id={id}
      type="date"
      value={value ?? ""}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function TimeInput({
  value,
  onChange,
  id,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
}) {
  return <Input id={id} type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
}

/** Local wall-clock date-time "YYYY-MM-DDTHH:MM". */
export function DateTimeInput({
  value,
  onChange,
  id,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
}) {
  return (
    <Input
      id={id}
      type="datetime-local"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? e.target.value.slice(0, 16) : null)}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  id,
  min,
  max,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  id?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      value={value ?? ""}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => {
        const n = e.target.value === "" ? null : Math.trunc(Number(e.target.value));
        onChange(n === null || Number.isNaN(n) ? null : n);
      }}
    />
  );
}

export function digitsFor(currency: string) {
  return currencyDigits(currency);
}

/** Latitude/longitude as "38.7139, -9.1334"; also accepts a pasted map link. */
export function LocationInput({
  lat,
  lon,
  onChange,
  id,
}: {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number | null, lon: number | null) => void;
  id?: string;
}) {
  const shown = lat !== null && lon !== null ? `${lat}, ${lon}` : "";
  const [text, setText] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (!text.trim()) {
      setBad(false);
      onChange(null, null);
      return;
    }
    const c = parseCoordinates(text);
    setBad(!c);
    if (c) onChange(Math.round(c.lat * 1e6) / 1e6, Math.round(c.lon * 1e6) / 1e6);
  };
  return (
    <Input
      id={id}
      value={text}
      placeholder="38.7139, -9.1334"
      aria-invalid={bad}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className="tabular"
    />
  );
}
