// Factories for new rows with sensible defaults, so forms always send complete records.

import type {
  AccommodationDetails,
  ActivityDetails,
  Booking,
  CancellationPolicy,
  Expense,
  FlightSegment,
  OptionBundle,
  OptionFee,
  Payment,
  PlanOption,
  RentalCarDetails,
  Scenario,
  Slot,
  SlotKind,
  Station,
  Task,
  TransportMode,
  Traveler,
  Trip,
} from "@/domain/types";

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export function newTrip(currency: string, over: Partial<Trip> = {}): Trip {
  const now = nowIso();
  return {
    id: newId(),
    title: "",
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
    budget_target_minor: null,
    budget_max_minor: null,
    currency,
    travel_style: null,
    notes: null,
    arrival_buffer_min: 60,
    departure_buffer_min: 120,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

export function newTraveler(tripId: string, sort: number): Traveler {
  return { id: newId(), trip_id: tripId, name: "", category: "adult", birth_date: null, notes: null, sort };
}

export function newStation(tripId: string, sort: number): Station {
  return {
    id: newId(),
    trip_id: tripId,
    name: "",
    location: null,
    arrive_date: null,
    depart_date: null,
    notes: null,
    sort,
  };
}

export function newSlot(tripId: string, kind: SlotKind, title: string, sort: number): Slot {
  return {
    id: newId(),
    trip_id: tripId,
    station_id: null,
    kind,
    title,
    required: kind === "flight" || kind === "accommodation" || kind === "rental_car" || kind === "transport",
    notes: null,
    sort,
    created_at: nowIso(),
  };
}

export function newOption(slot: Slot, currency: string, sort: number): PlanOption {
  const now = nowIso();
  return {
    id: newId(),
    slot_id: slot.id,
    title: "",
    status: "planned",
    decision: "none",
    rating: null,
    provider: null,
    platform: null,
    url: null,
    price_minor: null,
    currency,
    price_basis: "total",
    party_size: null,
    included_services: null,
    pros: null,
    cons: null,
    notes: null,
    source: null,
    price_verified_at: null,
    contact: null,
    sort,
    created_at: now,
    updated_at: now,
  };
}

export function newSegment(optionId: string, seq: number, mode: TransportMode | null = null): FlightSegment {
  return {
    id: newId(),
    option_id: optionId,
    booking_id: null,
    seq,
    airline: null,
    flight_number: null,
    from_airport: null,
    to_airport: null,
    depart_local: null,
    depart_tz: null,
    arrive_local: null,
    arrive_tz: null,
    cabin: null,
    fare_class: null,
    baggage: null,
    notes: null,
    mode,
    from_place: null,
    to_place: null,
    from_lat: null,
    from_lon: null,
    to_lat: null,
    to_lon: null,
  };
}

export function newAccommodation(optionId: string): AccommodationDetails {
  return {
    option_id: optionId,
    accommodation_type: "hotel",
    address: null,
    map_url: null,
    check_in: null,
    check_out: null,
    check_in_time: null,
    check_out_time: null,
    tz: null,
    room_type: null,
    meal_plan: null,
    lat: null,
    lon: null,
  };
}

export function newRentalCar(optionId: string): RentalCarDetails {
  return {
    option_id: optionId,
    vehicle_category: null,
    vehicle_model: null,
    pickup_location: null,
    pickup_local: null,
    pickup_tz: null,
    return_location: null,
    return_local: null,
    return_tz: null,
    mileage: null,
    fuel_policy: null,
    insurance: null,
    excess_minor: null,
    deposit_minor: null,
    additional_driver_fee_minor: null,
    day_rule: "24h",
    grace_minutes: 59,
  };
}

export function newActivity(optionId: string): ActivityDetails {
  return {
    option_id: optionId,
    category: null,
    location: null,
    start_date: null,
    start_time: null,
    end_date: null,
    end_time: null,
    tz: null,
    duration_min: null,
    flexible: false,
    lat: null,
    lon: null,
  };
}

export function newFee(optionId: string, currency: string, sort: number): OptionFee {
  return { id: newId(), option_id: optionId, label: "", amount_minor: null, currency, included: false, sort };
}

export function newPolicy(
  owner: { option_id?: string; booking_id?: string },
  currency: string,
): CancellationPolicy {
  return {
    id: newId(),
    option_id: owner.option_id ?? null,
    booking_id: owner.booking_id ?? null,
    policy_type: "unknown",
    deadline_local: null,
    deadline_tz: null,
    fee_minor: null,
    refundable_minor: null,
    refundable_percent: null,
    currency,
    policy_text: null,
    source: null,
    checked_at: null,
    notes: null,
    updated_at: nowIso(),
  };
}

export function newBundle(slot: Slot, currency: string, sort: number): OptionBundle {
  const option = newOption(slot, currency, sort);
  return {
    option,
    segments:
      slot.kind === "flight"
        ? [newSegment(option.id, 1)]
        : slot.kind === "transport"
          ? [newSegment(option.id, 1, "train")]
          : [],
    accommodation: slot.kind === "accommodation" ? newAccommodation(option.id) : null,
    rental_car: slot.kind === "rental_car" ? newRentalCar(option.id) : null,
    activity: usesActivityDetails(slot.kind) ? newActivity(option.id) : null,
    fees: [],
    policy: null,
  };
}

export function newBooking(option: PlanOption): Booking {
  const now = nowIso();
  return {
    id: newId(),
    option_id: option.id,
    status: "active",
    provider: option.provider,
    platform: option.platform,
    reference: null,
    booked_on: now.slice(0, 10),
    price_minor: option.price_minor,
    currency: option.currency,
    payment_status: "unpaid",
    contact: option.contact,
    url: option.url,
    notes: null,
    snapshot: "",
    cancellation_requested_at: null,
    cancelled_at: null,
    refund_final_minor: null,
    created_at: now,
    updated_at: now,
  };
}

export function newPayment(bookingId: string, currency: string): Payment {
  return {
    id: newId(),
    booking_id: bookingId,
    kind: "payment",
    amount_minor: 0,
    currency,
    paid_on: nowIso().slice(0, 10),
    method: null,
    traveler_id: null,
    notes: null,
    created_at: nowIso(),
  };
}

export function newExpense(tripId: string, currency: string): Expense {
  return {
    id: newId(),
    trip_id: tripId,
    booking_id: null,
    kind: "actual",
    category: "misc",
    title: "",
    amount_minor: 0,
    currency,
    spent_on: nowIso().slice(0, 10),
    paid_by: null,
    notes: null,
    created_at: nowIso(),
  };
}

export function newScenario(tripId: string, name: string): Scenario {
  const now = nowIso();
  return {
    id: newId(),
    trip_id: tripId,
    name,
    preferred: false,
    notes: null,
    created_at: now,
    updated_at: now,
  };
}

export function newTask(tripId: string, sort: number): Task {
  return {
    id: newId(),
    trip_id: tripId,
    option_id: null,
    title: "",
    due_date: null,
    done_at: null,
    notes: null,
    sort,
    created_at: nowIso(),
  };
}

/** Empty strings from inputs become null, so optional fields are stored as "not set". */
export function nil(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s ? s : null;
}

export function intOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/** Kinds whose options keep their time span and place in activity details. */
export function usesActivityDetails(kind: SlotKind): boolean {
  return kind === "activity" || kind === "parking" || kind === "insurance" || kind === "other";
}

/** Slot kinds in the order they are listed and offered. */
export const SLOT_KINDS: SlotKind[] = [
  "flight",
  "transport",
  "accommodation",
  "rental_car",
  "activity",
  "parking",
  "insurance",
  "other",
];
