import { describe, expect, it } from "vitest";
import { LOGOS } from "./providerLogos";
import {
  airlineFromCode,
  fillFromUrl,
  findProvider,
  monogram,
  needsDarkInk,
  PROVIDERS,
  providerColor,
  providerFromUrl,
  resolveProviders,
  segmentAirline,
} from "./providers";

describe("provider registry", () => {
  it("has unique ids, IATA codes and existing logos", () => {
    expect(new Set(PROVIDERS.map((p) => p.id)).size).toBe(PROVIDERS.length);
    const codes = PROVIDERS.flatMap((p) => p.iata ?? []);
    expect(new Set(codes).size).toBe(codes.length);
    for (const p of PROVIDERS) {
      if (p.logo) expect(LOGOS[p.logo], p.id).toBeDefined();
      expect(providerColor(p), p.id).toMatch(/^#[0-9A-F]{6}$/i);
      expect(() => new URL(p.url), p.id).not.toThrow();
    }
  });

  it("recognises links, including subdomains and other top-level domains", () => {
    expect(providerFromUrl("https://www.booking.com/hotel/pt/casa.html")?.id).toBe("booking");
    expect(providerFromUrl("https://www.airbnb.de/rooms/123")?.id).toBe("airbnb");
    expect(providerFromUrl("https://www.sixt.co.uk/")?.id).toBe("sixt");
    expect(providerFromUrl("https://www.google.com/travel/flights?q=x")?.id).toBe("google");
    expect(providerFromUrl("lufthansa.com/de/de/buchen")?.id).toBe("lufthansa");
    expect(providerFromUrl("https://notbooking.com")).toBeNull();
    expect(providerFromUrl("https://example.org")).toBeNull();
    expect(providerFromUrl("not a url")).toBeNull();
  });

  it("finds names by leading words only", () => {
    expect(findProvider("Lufthansa")?.id).toBe("lufthansa");
    expect(findProvider("sixt Portugal")?.id).toBe("sixt");
    expect(findProvider("TUI fly")?.id).toBe("tuifly");
    expect(findProvider("TUI")?.id).toBe("tui");
    expect(findProvider("Booking.com")?.id).toBe("booking");
    expect(findProvider("Aeromexico")?.id).toBe("aeromexico");
    expect(findProvider("Holiday Inn Express Porto")?.id).toBe("ihg");
    expect(findProvider("Hotel Booking Service")).toBeNull();
    expect(findProvider("")).toBeNull();
  });

  it("reads the airline from a flight number but not from train numbers", () => {
    expect(airlineFromCode("LH 1234")?.id).toBe("lufthansa");
    expect(airlineFromCode("u24711")?.id).toBe("easyjet");
    expect(airlineFromCode("TP")?.id).toBe("tap");
    expect(airlineFromCode("ICE 123")).toBeNull();
    expect(segmentAirline({ airline: null, flight_number: "FR 88" })?.id).toBe("ryanair");
    expect(segmentAirline({ airline: null, flight_number: "EC 123", mode: "train" })).toBeNull();
    expect(segmentAirline({ airline: "FlixBus", flight_number: "N 40", mode: "bus" })?.id).toBe("flixbus");
  });

  it("separates the provider from the platform it was booked on", () => {
    const viaBooking = resolveProviders({ provider: null, platform: null, url: "https://booking.com/x" });
    expect(viaBooking.providers).toEqual([]);
    expect(viaBooking.platform?.id).toBe("booking");

    const direct = resolveProviders({ provider: null, platform: null, url: "https://www.sixt.de/x" });
    expect(direct.providers.map((p) => p.id)).toEqual(["sixt"]);

    const legs = resolveProviders({ provider: null, platform: "Google Flights", url: null }, [
      { airline: null, flight_number: "LH 1172" },
      { airline: "TAP", flight_number: "TP 571" },
      { airline: null, flight_number: "LH 1173" },
    ]);
    expect(legs.providers.map((p) => p.id)).toEqual(["lufthansa", "tap"]);
    expect(legs.platform?.id).toBe("google");

    // A typed but unknown provider is not replaced by a guess.
    const own = resolveProviders({ provider: "Casa do Rio", platform: null, url: "https://www.sixt.de" });
    expect(own.providers).toEqual([]);
  });

  it("fills only empty fields from a link", () => {
    expect(fillFromUrl({ provider: null, platform: null }, "https://www.airbnb.com/rooms/1")).toEqual({
      provider: null,
      platform: "Airbnb",
    });
    expect(fillFromUrl({ provider: null, platform: null }, "https://www.europcar.pt")).toEqual({
      provider: "Europcar",
      platform: null,
    });
    expect(fillFromUrl({ provider: "Mine", platform: "Theirs" }, "https://www.hertz.com")).toEqual({
      provider: "Mine",
      platform: "Theirs",
    });
  });

  it("picks readable ink and short monograms", () => {
    expect(needsDarkInk("#FFD100")).toBe(true);
    expect(needsDarkInk("#002157")).toBe(false);
    expect(monogram(findProvider("Sixt") as never)).toBe("S");
    expect(monogram(findProvider("Finnair") as never)).toBe("AY");
    expect(PROVIDERS.every((p) => monogram(p).length <= 3)).toBe(true);
  });
});
