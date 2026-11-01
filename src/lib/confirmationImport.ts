// Turns what Claude read from a booking confirmation into the normal rows of an option and a
// booking. Every value is checked; anything that does not fit the format is dropped rather than
// stored, so the user sees a gap instead of a wrong value. Nothing is saved here.

import type { ExtractedBooking } from "@/api/bindings/ExtractedBooking";
import { currencyDigits } from "@/domain/money";
import type {
  Booking,
  OptionBundle,
  PaymentStatus,
  PolicyType,
  Slot,
  SlotKind,
  TransportMode,
} from "@/domain/types";
import {
  newAccommodation,
  newActivity,
  newBooking,
  newOption,
  newPolicy,
  newRentalCar,
  newSegment,
  SLOT_KINDS,
  usesActivityDetails,
} from "./rows";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const LOCAL = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const IATA = /^[A-Z]{3}$/;
const MODES: TransportMode[] = ["train", "bus", "ferry", "transfer", "other"];
const POLICIES: PolicyType[] = [
  "free_until",
  "with_fee",
  "partially_refundable",
  "non_refundable",
  "unknown",
];

const text = (v: string | null | undefined, max = 500) => {
  const s = v?.trim();
  return s ? s.slice(0, max) : null;
};
const date = (v: string | null | undefined) => (v && DATE.test(v) ? v : null);
const time = (v: string | null | undefined) => (v && TIME.test(v) ? v : null);
const local = (v: string | null | undefined) => (v && LOCAL.test(v) ? v : null);

export function validTimeZone(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** Major units to minor units of the currency, or null when there is no usable amount. */
function minor(amount: number | null | undefined, currency: string): number | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 10 ** currencyDigits(currency));
}

export function slotKindOf(e: ExtractedBooking): SlotKind {
  return SLOT_KINDS.includes(e.kind as SlotKind) ? (e.kind as SlotKind) : "other";
}

export interface ImportContext {
  slot: Slot;
  tripCurrency: string;
  sort: number;
  /** Time zone of an airport from the offline list. */
  airportTz: (iata: string) => string | null;
  /** Where the proposal came from, kept as the option's source. */
  source: string;
}

export function bundleFromExtraction(e: ExtractedBooking, ctx: ImportContext): OptionBundle {
  const kind = ctx.slot.kind;
  const currency = e.currency && /^[A-Z]{3}$/.test(e.currency) ? e.currency : ctx.tripCurrency;
  const option = {
    ...newOption(ctx.slot, currency, ctx.sort),
    title: text(e.title, 200) ?? ctx.slot.title,
    provider: text(e.provider, 200),
    platform: text(e.platform, 200),
    contact: text(e.contact),
    price_minor: minor(e.price, currency),
    notes: text(e.notes, 4000),
    source: text(ctx.source, 200),
  };
  const id = option.id;

  const segments =
    kind === "flight" || kind === "transport"
      ? e.segments.map((s, i) => {
          const flight = kind === "flight";
          const mode = flight
            ? null
            : MODES.includes(s.mode as TransportMode)
              ? (s.mode as TransportMode)
              : "other";
          const from = text(s.from, 200);
          const to = text(s.to, 200);
          const fromCode = flight && from && IATA.test(from) ? from : null;
          const toCode = flight && to && IATA.test(to) ? to : null;
          return {
            ...newSegment(id, i + 1, mode),
            airline: text(s.carrier, 200),
            flight_number: text(s.number, 50),
            from_airport: fromCode,
            to_airport: toCode,
            from_place: flight ? null : from,
            to_place: flight ? null : to,
            depart_local: local(s.depart_local),
            depart_tz: validTimeZone(s.depart_tz) ?? (fromCode ? ctx.airportTz(fromCode) : null),
            arrive_local: local(s.arrive_local),
            arrive_tz: validTimeZone(s.arrive_tz) ?? (toCode ? ctx.airportTz(toCode) : null),
            cabin: text(s.cabin, 100),
            fare_class: text(s.seat, 100),
            baggage: text(s.baggage, 200),
          };
        })
      : [];

  const st = e.stay;
  const accommodation =
    kind === "accommodation"
      ? {
          ...newAccommodation(id),
          address: text(st?.address),
          check_in: date(st?.check_in),
          check_out: date(st?.check_out),
          check_in_time: time(st?.check_in_time),
          check_out_time: time(st?.check_out_time),
          room_type: text(st?.room, 200),
          meal_plan: text(st?.meals, 200),
        }
      : null;

  const c = e.car;
  const rental_car =
    kind === "rental_car"
      ? {
          ...newRentalCar(id),
          pickup_location: text(c?.pickup_location, 200),
          pickup_local: local(c?.pickup_local),
          return_location: text(c?.return_location, 200),
          return_local: local(c?.return_local),
          vehicle_model: text(c?.vehicle, 200),
          insurance: text(c?.insurance, 200),
        }
      : null;

  const sp = e.span;
  const activity = usesActivityDetails(kind)
    ? {
        ...newActivity(id),
        location: text(sp?.location, 200),
        start_date: date(sp?.start_date),
        start_time: kind === "insurance" ? null : time(sp?.start_time),
        end_date: date(sp?.end_date),
        end_time: kind === "insurance" ? null : time(sp?.end_time),
      }
    : null;

  const cx = e.cancellation;
  const policy = cx
    ? {
        ...newPolicy({ option_id: id }, currency),
        policy_type: POLICIES.includes(cx.policy_type as PolicyType)
          ? (cx.policy_type as PolicyType)
          : "unknown",
        deadline_local: local(cx.deadline_local),
        deadline_tz: local(cx.deadline_local) ? (segments[0]?.depart_tz ?? null) : null,
        fee_minor: minor(cx.fee, currency),
        policy_text: text(cx.text, 4000),
        source: text(ctx.source, 200),
      }
    : null;

  return { option, segments, accommodation, rental_car, activity, fees: [], policy };
}

/** The booked values read from the confirmation, for the booking form. */
export function bookingFromExtraction(e: ExtractedBooking, bundle: OptionBundle): Booking {
  const status: PaymentStatus = e.paid === true ? "paid" : e.paid === false ? "unpaid" : "unknown";
  return {
    ...newBooking(bundle.option),
    reference: text(e.reference, 100),
    booked_on: date(e.booked_on) ?? newBooking(bundle.option).booked_on,
    payment_status: status,
  };
}
