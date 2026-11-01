import { describe, expect, it } from "vitest";
import { bundleFromOffer, findPrice, offerFound, parseAmount, parseDate, parseOffer } from "./offerLink";
import { newSlot } from "./rows";

const note = (a: string, b: string | null) => `dates ${a}–${b ?? ""}`;

describe("offer links", () => {
  it("reads dates, travellers and the hotel name from a Booking.com link", () => {
    const p = parseOffer(
      "https://www.booking.com/hotel/pt/casa-do-alfama.de.html?aid=1&checkin=2027-06-10&checkout=2027-06-14&group_adults=2&group_children=1",
    );
    expect(p).toMatchObject({
      title: "Casa Do Alfama",
      start: "2027-06-10",
      end: "2027-06-14",
      adults: 2,
      children: 1,
      price: null,
    });
    const slot = newSlot("t", "accommodation", "Stay Lisbon", 0);
    const b = bundleFromOffer(p, slot, "EUR", 0, note);
    expect(b.accommodation).toMatchObject({ check_in: "2027-06-10", check_out: "2027-06-14" });
    expect(b.option).toMatchObject({ platform: "Booking.com", party_size: 3, source: "booking.com" });
  });

  it("understands split Booking.com dates, Airbnb and Expedia links", () => {
    expect(
      parseOffer(
        "https://www.booking.com/hotel/de/x.html?checkin_year=2027&checkin_month=6&checkin_monthday=10&checkout_year=2027&checkout_month=6&checkout_monthday=12",
      ),
    ).toMatchObject({ start: "2027-06-10", end: "2027-06-12" });
    expect(
      parseOffer("https://www.airbnb.de/rooms/12345?check_in=2027-08-01&check_out=2027-08-08&adults=4"),
    ).toMatchObject({ start: "2027-08-01", end: "2027-08-08", adults: 4, title: null });
    expect(
      parseOffer("https://www.expedia.de/h.Hotel?chkin=6%2F10%2F2027&chkout=6%2F14%2F2027"),
    ).toMatchObject({
      start: "2027-06-10",
      end: "2027-06-14",
    });
  });

  it("reads airports and dates from flight search links", () => {
    const k = parseOffer("https://www.kayak.de/flights/FRA-LIS/2027-06-10/2027-06-17/2adults?sort=price_a");
    expect(k).toMatchObject({ from: "FRA", to: "LIS", start: "2027-06-10", end: "2027-06-17" });
    const s = parseOffer("https://www.skyscanner.de/transport/flights/fra/lis/270610/?adults=1");
    expect(s).toMatchObject({ from: "FRA", to: "LIS", start: "2027-06-10", end: null, adults: 1 });

    const slot = newSlot("t", "flight", "Flights", 0);
    const b = bundleFromOffer(k, slot, "EUR", 0, note);
    expect(b.segments.map((g) => `${g.from_airport}-${g.to_airport}`)).toEqual(["FRA-LIS", "LIS-FRA"]);
    expect(b.segments.every((g) => g.depart_local === null)).toBe(true);
    expect(b.option.notes).toBe("dates 2027-06-10–2027-06-17");
  });

  it("keeps the pasted text and finds a clearly stated price", () => {
    const p = parseOffer(
      "Casa do Alfama\nhttps://example.com/offer/1?arrival=10.06.2027\n4 Nächte, 155 € pro Nacht\nGesamtpreis: 620,00 €",
    );
    expect(p.title).toBe("Casa do Alfama");
    expect(p.start).toBe("2027-06-10");
    expect(p.price).toEqual({ amount: 620, currency: "EUR" });
    expect(p.rest).not.toContain("https://");
    expect(offerFound(parseOffer("https://example.com/"))).toBe(false);
  });

  it("parses amounts and dates in common formats", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1 234")).toBe(1234);
    expect(parseAmount("620")).toBe(620);
    expect(findPrice("EUR 280.50")).toEqual({ amount: 280.5, currency: "EUR" });
    expect(findPrice("$ 199")).toEqual({ amount: 199, currency: "USD" });
    expect(findPrice("Flug A 280 € · Flug B 340 €"), "two different prices, no total").toBeNull();
    expect(findPrice("Total: CHF 1'000")).toEqual({ amount: 1000, currency: "CHF" });
    expect(parseDate("2027-02-30")).toBeNull();
    expect(parseDate("20270610")).toBe("2027-06-10");
    expect(parseDate("6/10/2027")).toBe("2027-06-10");
  });

  it("never treats a return before the outbound as a date range", () => {
    expect(parseOffer("https://x.com/?checkin=2027-06-10&checkout=2027-06-01").end).toBeNull();
  });
});
