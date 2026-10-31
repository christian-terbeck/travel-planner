import { describe, expect, it } from "vitest";
import {
  convert,
  convertTotals,
  currencyDigits,
  formatMoney,
  parseAmount,
  percentOf,
  toMajorString,
} from "./money";
import type { ExchangeRate } from "./types";

const rate = (base: string, quote: string, r: string, as_of = "2027-01-01"): ExchangeRate => ({
  id: `${base}${quote}${as_of}`,
  base,
  quote,
  rate: r,
  as_of,
  source: null,
  created_at: "2027-01-01T00:00:00Z",
});

describe("parseAmount", () => {
  it.each([
    ["280", "EUR", 28000],
    ["280,50", "EUR", 28050],
    ["280.5", "EUR", 28050],
    ["1.234,56", "EUR", 123456],
    ["1,234.56", "EUR", 123456],
    ["1.234", "EUR", 123400],
    ["1 234,5", "EUR", 123450],
    ["€ 99", "EUR", 9900],
    ["12000", "JPY", 12000],
    ["1,500", "JPY", 1500],
    ["0,05", "EUR", 5],
  ])("%s %s → %d", (text, cur, minor) => {
    expect(parseAmount(text, cur)).toBe(minor);
  });

  it.each(["", "abc", "1.2.3", "12,345,6", "1.234.5"])("rejects %s", (text) => {
    expect(parseAmount(text, "EUR")).toBeNull();
  });
});

describe("formatting", () => {
  it("knows minor-unit digits", () => {
    expect(currencyDigits("EUR")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
  });

  it("formats without floating point drift", () => {
    expect(formatMoney({ minor: 123456, currency: "EUR" }, "de-DE")).toBe("1.234,56 €");
    expect(formatMoney({ minor: 1999, currency: "USD" }, "en-US")).toBe("$19.99");
    expect(toMajorString(28050, "EUR")).toBe("280.50");
    expect(toMajorString(28000, "EUR")).toBe("280");
    expect(toMajorString(-5, "EUR")).toBe("-0.05");
  });
});

describe("conversion", () => {
  const rates = [
    rate("EUR", "USD", "1.08"),
    rate("EUR", "USD", "1.10", "2027-03-01"),
    rate("EUR", "JPY", "160"),
  ];

  it("uses the latest explicit rate and exact rounding", () => {
    expect(convert({ minor: 10000, currency: "EUR" }, "USD", rates)).toEqual({
      minor: 11000,
      currency: "USD",
    });
    expect(convert({ minor: 10000, currency: "EUR" }, "USD", rates, "2027-02-01")).toEqual({
      minor: 10800,
      currency: "USD",
    });
  });

  it("inverts rates and respects minor units", () => {
    expect(convert({ minor: 11000, currency: "USD" }, "EUR", rates)).toEqual({
      minor: 10000,
      currency: "EUR",
    });
    expect(convert({ minor: 100, currency: "EUR" }, "JPY", rates)).toEqual({ minor: 160, currency: "JPY" });
    expect(convert({ minor: 1, currency: "EUR" }, "USD", [rate("EUR", "USD", "1.5")])).toEqual({
      minor: 2,
      currency: "USD",
    });
  });

  it("never sums currencies without a rate", () => {
    const r = convertTotals({ EUR: 10000, GBP: 5000, USD: 1100 }, "EUR", rates);
    expect(r.minor).toBe(11000);
    expect(r.unconvertible).toEqual({ GBP: 5000 });
  });

  it("computes percentages exactly", () => {
    expect(percentOf(62000, 50)).toBe(31000);
    expect(percentOf(999, 33)).toBe(330);
  });
});
