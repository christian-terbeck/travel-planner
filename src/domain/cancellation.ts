// Where a booking stands with its cancellation terms at a given moment. No terms means
// "unknown", never "free".

import { type Money, percentOf } from "./money";
import { type Instant, minutesBetween, zoned } from "./time";
import type { Booking, CancellationPolicy } from "./types";

export type CancellationState =
  | "free" // free cancellation still possible
  | "with_fee" // cancellable, a fee applies
  | "partial" // only part is refunded
  | "non_refundable"
  | "deadline_passed" // free period is over; what applies now is not recorded
  | "unknown"
  | "cancelled";

export interface CancellationStatus {
  state: CancellationState;
  deadline: Instant | null;
  /** The deadline's zone was missing and the fallback zone was used. */
  deadlineApproximate: boolean;
  minutesLeft: number | null;
  /** Estimated amount refunded if cancelled now (null when it cannot be told). */
  refundable: Money | null;
  /** Fee if cancelled now, when known. */
  fee: Money | null;
  policy: CancellationPolicy | null;
}

export function cancellationStatus(
  booking: Booking,
  policy: CancellationPolicy | null,
  now: Instant,
  fallbackTz: string,
): CancellationStatus {
  const base: CancellationStatus = {
    state: "unknown",
    deadline: null,
    deadlineApproximate: false,
    minutesLeft: null,
    refundable: null,
    fee: null,
    policy,
  };
  if (booking.status === "cancelled") {
    const refund = booking.refund_final_minor;
    return {
      ...base,
      state: "cancelled",
      refundable: refund === null ? null : { minor: refund, currency: booking.currency },
    };
  }
  if (!policy || policy.policy_type === "unknown") return base;

  const price = booking.price_minor;
  const cur = policy.currency;
  const z = zoned(policy.deadline_local, policy.deadline_tz, fallbackTz);
  const deadline = z?.zdt.toInstant() ?? null;
  const minutesLeft = deadline ? minutesBetween(now, deadline) : null;
  const before = minutesLeft === null || minutesLeft > 0;
  const status = { ...base, deadline, deadlineApproximate: !!z?.approximate, minutesLeft };
  const amount = (minor: number | null) => (minor === null ? null : { minor, currency: cur });
  const afterDeadlineRefund = () => {
    if (policy.refundable_minor !== null) return amount(policy.refundable_minor);
    if (policy.refundable_percent !== null && price !== null)
      return amount(percentOf(price, policy.refundable_percent));
    return null;
  };

  switch (policy.policy_type) {
    case "free_until":
      if (deadline && !before) {
        const refundable = afterDeadlineRefund();
        return { ...status, state: refundable ? "partial" : "deadline_passed", refundable };
      }
      return { ...status, state: "free", refundable: amount(price), fee: amount(0) };
    case "with_fee": {
      if (deadline && !before)
        return { ...status, state: "deadline_passed", refundable: afterDeadlineRefund() };
      const fee = amount(policy.fee_minor);
      const refundable =
        price !== null && policy.fee_minor !== null ? amount(Math.max(0, price - policy.fee_minor)) : null;
      return { ...status, state: "with_fee", fee, refundable };
    }
    case "partially_refundable": {
      if (deadline && !before) return { ...status, state: "non_refundable", refundable: amount(0) };
      return { ...status, state: "partial", refundable: afterDeadlineRefund() };
    }
    case "non_refundable":
      return { ...status, state: "non_refundable", refundable: amount(0) };
    default:
      return status;
  }
}

/** Free cancellation ends within this many days → "approaching". */
export const APPROACHING_DAYS = 7;

export function isApproaching(s: CancellationStatus, days = APPROACHING_DAYS): boolean {
  return (
    s.minutesLeft !== null &&
    s.minutesLeft > 0 &&
    s.minutesLeft <= days * 24 * 60 &&
    ["free", "with_fee", "partial"].includes(s.state)
  );
}
