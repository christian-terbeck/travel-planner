import { describe, expect, it } from "vitest";
import type { ExtractedBooking } from "@/api/bindings/ExtractedBooking";
import { bookingFromExtraction, bundleFromExtraction, slotKindOf } from "./confirmationImport";
import { newSlot } from "./rows";

const flightSegment = {
  mode: "flight",
  carrier: "TAP",
  number: "TP 571",
  from: "FRA",
  to: "Lisbon",
  depart_local: "2027-06-10T07:00",
  depart_tz: null,
  arrive_local: "10.06.2027 09:00",
  arrive_tz: "Mars/Olympus",
  cabin: "Economy",
  seat: null,
  baggage: "23 kg",
};

const base: ExtractedBooking = {
  kind: "flight",
  title: "TAP Frankfurt – Lisbon",
  provider: "TAP",
  platform: null,
  reference: "ABC123",
  booked_on: "2027-03-01",
  price: 280.5,
  currency: "EUR",
  paid: true,
  contact: null,
  segments: [flightSegment],
  stay: null,
  car: null,
  span: null,
  cancellation: {
    policy_type: "free_until",
    deadline_local: "2027-06-01T23:59",
    fee: null,
    text: "Free until 1 June",
  },
  travelers: [],
  notes: "Seat not assigned yet",
};

const ctx = (kind: Parameters<typeof newSlot>[1]) => ({
  slot: newSlot("t", kind, "Need", 0),
  tripCurrency: "EUR",
  sort: 0,
  airportTz: (c: string) => (c === "FRA" ? "Europe/Berlin" : null),
  source: "ticket.pdf",
});

describe("confirmation import", () => {
  it("keeps valid values and drops the ones that do not fit", () => {
    const b = bundleFromExtraction(base, ctx("flight"));
    expect(b.option.price_minor).toBe(28_050);
    expect(b.option.source).toBe("ticket.pdf");
    const [s] = b.segments;
    expect(s?.mode).toBeNull();
    expect(s?.from_airport).toBe("FRA");
    expect(s?.depart_tz).toBe("Europe/Berlin");
    expect(s?.to_airport).toBeNull();
    expect(s?.arrive_local).toBeNull();
    expect(s?.arrive_tz).toBeNull();
    expect(b.policy?.policy_type).toBe("free_until");
    expect(b.policy?.deadline_tz).toBe("Europe/Berlin");
    const booking = bookingFromExtraction(base, b);
    expect(booking.reference).toBe("ABC123");
    expect(booking.payment_status).toBe("paid");
    expect(booking.price_minor).toBe(28_050);
  });

  it("maps trains to places and stays to their dates", () => {
    const train = bundleFromExtraction(
      {
        ...base,
        kind: "transport",
        segments: [{ ...flightSegment, mode: "train", from: "Lisboa Oriente" }],
      },
      ctx("transport"),
    );
    expect(train.segments[0]?.mode).toBe("train");
    expect(train.segments[0]?.from_place).toBe("Lisboa Oriente");
    expect(train.segments[0]?.from_airport).toBeNull();

    const stay = bundleFromExtraction(
      {
        ...base,
        kind: "accommodation",
        segments: [],
        price: 412,
        currency: "JPY",
        stay: {
          address: "Rua 1",
          check_in: "2027-06-10",
          check_out: "June 14",
          check_in_time: "15:00",
          check_out_time: "11h",
          room: null,
          meals: null,
        },
      },
      ctx("accommodation"),
    );
    expect(stay.segments).toEqual([]);
    expect(stay.option.price_minor).toBe(412);
    expect(stay.accommodation?.check_in).toBe("2027-06-10");
    expect(stay.accommodation?.check_out).toBeNull();
    expect(stay.accommodation?.check_out_time).toBeNull();
  });

  it("falls back to other for unknown kinds", () => {
    expect(slotKindOf({ ...base, kind: "spaceship" })).toBe("other");
  });
});
