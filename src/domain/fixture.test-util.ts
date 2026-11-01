// Builders for deterministic test graphs.

import type {
  AccommodationDetails,
  ActivityDetails,
  Booking,
  CancellationPolicy,
  FlightSegment,
  Payment,
  PlanOption,
  RentalCarDetails,
  Slot,
  SlotKind,
  TransportMode,
  Trip,
  TripGraph,
} from "./types";

export const NOW = "2027-05-01T10:00:00Z";
let seq = 0;
export const id = (p: string) => `${p}-${++seq}`;

export function trip(over: Partial<Trip> = {}): Trip {
  return {
    id: "trip",
    title: "Portugal Road Trip",
    description: null,
    destination: null,
    status_override: null,
    earliest_departure: null,
    latest_return: null,
    preferred_start: null,
    preferred_end: null,
    preferred_month: null,
    min_nights: null,
    max_nights: null,
    home_airports: null,
    budget_target_minor: 250_000,
    budget_max_minor: null,
    currency: "EUR",
    travel_style: null,
    notes: null,
    arrival_buffer_min: 60,
    departure_buffer_min: 120,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
}

export function graph(t: Trip = trip()): TripGraph {
  return {
    trip: t,
    travelers: [],
    stations: [],
    slots: [],
    options: [],
    flight_segments: [],
    accommodation_details: [],
    rental_car_details: [],
    activity_details: [],
    option_fees: [],
    cancellation_policies: [],
    bookings: [],
    payments: [],
    expenses: [],
    cost_shares: [],
    scenarios: [],
    scenario_selections: [],
    price_observations: [],
    tasks: [],
    dismissed_warnings: [],
    open_nights: [],
    documents: [],
    notes: [],
    change_log: [],
  };
}

export function addSlot(g: TripGraph, kind: SlotKind, over: Partial<Slot> = {}): Slot {
  const s: Slot = {
    id: id(kind),
    trip_id: g.trip.id,
    station_id: null,
    kind,
    title: kind,
    required: true,
    notes: null,
    sort: 0,
    created_at: NOW,
    ...over,
  };
  g.slots.push(s);
  return s;
}

export function addOption(
  g: TripGraph,
  slot: Slot,
  price: number | null,
  over: Partial<PlanOption> = {},
): PlanOption {
  const o: PlanOption = {
    id: id("opt"),
    slot_id: slot.id,
    title: "Option",
    status: "planned",
    decision: "none",
    rating: null,
    provider: null,
    platform: null,
    url: null,
    price_minor: price,
    currency: "EUR",
    price_basis: "total",
    party_size: null,
    included_services: null,
    pros: null,
    cons: null,
    notes: null,
    source: null,
    price_verified_at: null,
    contact: null,
    sort: 0,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
  g.options.push(o);
  return o;
}

type Leg = [from: string, to: string, depart: string, arrive: string, departTz?: string, arriveTz?: string];

export function addFlight(
  g: TripGraph,
  slot: Slot,
  price: number | null,
  legs: Leg[],
  over: Partial<PlanOption> = {},
): PlanOption {
  const o = addOption(g, slot, price, over);
  legs.forEach(([from, to, dep, arr, dtz, atz], i) => {
    const s: FlightSegment = {
      id: id("seg"),
      option_id: o.id,
      booking_id: null,
      seq: i + 1,
      airline: null,
      flight_number: `TP${i + 1}`,
      from_airport: from,
      to_airport: to,
      depart_local: dep,
      depart_tz:
        dtz ?? (from === "LIS" || from === "OPO" || from === "FAO" ? "Europe/Lisbon" : "Europe/Berlin"),
      arrive_local: arr,
      arrive_tz: atz ?? (to === "LIS" || to === "OPO" || to === "FAO" ? "Europe/Lisbon" : "Europe/Berlin"),
      cabin: null,
      fare_class: null,
      baggage: null,
      notes: null,
      mode: null,
      from_place: null,
      to_place: null,
      from_lat: null,
      from_lon: null,
      to_lat: null,
      to_lon: null,
    };
    g.flight_segments.push(s);
  });
  return o;
}

type Ride = [
  from: string,
  to: string,
  depart: string,
  arrive: string,
  coords?: [number, number, number, number],
];

/** Train/bus/ferry option; places are names, coordinates optional, all times in Lisbon. */
export function addTransport(
  g: TripGraph,
  slot: Slot,
  price: number | null,
  rides: Ride[],
  mode: TransportMode = "train",
): PlanOption {
  const o = addOption(g, slot, price);
  rides.forEach(([from, to, dep, arr, c], i) => {
    g.flight_segments.push({
      id: id("seg"),
      option_id: o.id,
      booking_id: null,
      seq: i + 1,
      airline: null,
      flight_number: null,
      from_airport: null,
      to_airport: null,
      depart_local: dep,
      depart_tz: "Europe/Lisbon",
      arrive_local: arr,
      arrive_tz: "Europe/Lisbon",
      cabin: null,
      fare_class: null,
      baggage: null,
      notes: null,
      mode,
      from_place: from,
      to_place: to,
      from_lat: c?.[0] ?? null,
      from_lon: c?.[1] ?? null,
      to_lat: c?.[2] ?? null,
      to_lon: c?.[3] ?? null,
    });
  });
  return o;
}

export function addStay(
  g: TripGraph,
  slot: Slot,
  price: number | null,
  checkIn: string,
  checkOut: string,
  over: Partial<PlanOption> = {},
): PlanOption {
  const o = addOption(g, slot, price, over);
  const a: AccommodationDetails = {
    option_id: o.id,
    accommodation_type: "hotel",
    address: null,
    map_url: null,
    check_in: checkIn,
    check_out: checkOut,
    check_in_time: null,
    check_out_time: null,
    tz: "Europe/Lisbon",
    room_type: null,
    meal_plan: null,
    lat: null,
    lon: null,
  };
  g.accommodation_details.push(a);
  return o;
}

export function addCar(
  g: TripGraph,
  slot: Slot,
  price: number | null,
  pickup: string,
  ret: string,
  over: Partial<RentalCarDetails> = {},
): PlanOption {
  const o = addOption(g, slot, price);
  const r: RentalCarDetails = {
    option_id: o.id,
    vehicle_category: null,
    vehicle_model: null,
    pickup_location: "LIS",
    pickup_local: pickup,
    pickup_tz: "Europe/Lisbon",
    return_location: "LIS",
    return_local: ret,
    return_tz: "Europe/Lisbon",
    mileage: null,
    fuel_policy: null,
    insurance: null,
    excess_minor: null,
    deposit_minor: null,
    additional_driver_fee_minor: null,
    day_rule: "24h",
    grace_minutes: 59,
    ...over,
  };
  g.rental_car_details.push(r);
  return o;
}

export function addActivity(
  g: TripGraph,
  slot: Slot,
  price: number | null,
  date: string,
  start: string | null,
  end: string | null,
  endDate: string | null = null,
): PlanOption {
  const o = addOption(g, slot, price);
  const a: ActivityDetails = {
    option_id: o.id,
    category: null,
    location: null,
    start_date: date,
    start_time: start,
    end_date: endDate,
    end_time: end,
    tz: "Europe/Lisbon",
    duration_min: null,
    flexible: false,
    lat: null,
    lon: null,
  };
  g.activity_details.push(a);
  return o;
}

export function addBooking(
  g: TripGraph,
  option: PlanOption,
  price: number | null,
  over: Partial<Booking> = {},
): Booking {
  const b: Booking = {
    id: id("bk"),
    option_id: option.id,
    status: "active",
    provider: null,
    platform: null,
    reference: null,
    booked_on: "2027-04-01",
    price_minor: price,
    currency: "EUR",
    payment_status: "unpaid",
    contact: null,
    url: null,
    notes: null,
    snapshot: "{}",
    cancellation_requested_at: null,
    cancelled_at: null,
    refund_final_minor: null,
    created_at: NOW,
    updated_at: NOW,
    ...over,
  };
  option.status = b.status === "active" ? "booked" : "cancelled";
  g.bookings.push(b);
  return b;
}

export function addPayment(g: TripGraph, b: Booking, amount: number, over: Partial<Payment> = {}): Payment {
  const p: Payment = {
    id: id("pay"),
    booking_id: b.id,
    kind: "payment",
    amount_minor: amount,
    currency: "EUR",
    paid_on: "2027-04-01",
    method: null,
    traveler_id: null,
    notes: null,
    created_at: NOW,
    ...over,
  };
  g.payments.push(p);
  return p;
}

export function policy(over: Partial<CancellationPolicy>): CancellationPolicy {
  return {
    id: id("pol"),
    option_id: null,
    booking_id: null,
    policy_type: "unknown",
    deadline_local: null,
    deadline_tz: "Europe/Lisbon",
    fee_minor: null,
    refundable_minor: null,
    refundable_percent: null,
    currency: "EUR",
    policy_text: null,
    source: null,
    checked_at: null,
    notes: null,
    updated_at: NOW,
    ...over,
  };
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}
