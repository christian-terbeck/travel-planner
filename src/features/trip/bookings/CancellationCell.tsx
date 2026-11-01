import type { CancellationStatus } from "@/domain/cancellation";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { cn } from "@/ui/core";
import { CancellationBadge } from "@/ui/status";

/** Cancellation state of a booking: badge, deadline, refundable amount and when it was checked. */
export function CancellationCell({ s }: { s: CancellationStatus }) {
  const t = useT();
  const f = useFormat();
  return (
    <div>
      <CancellationBadge state={s.state} />
      {s.deadline && s.state !== "cancelled" && (
        <div
          className={cn(
            "mt-0.5 text-[11px]",
            s.minutesLeft !== null && s.minutesLeft > 0 && s.minutesLeft < 7 * 1440
              ? "text-warn"
              : "text-fg-3",
          )}
        >
          {s.minutesLeft !== null && s.minutesLeft > 0
            ? t("cancellation.until", { date: f.dateTime(s.deadline, s.policy?.deadline_tz ?? "UTC") })
            : t("cancellation.ended", { date: f.date(s.deadline.toString().slice(0, 10), "short") })}
          {s.deadlineApproximate && ` (${t("cancellation.tzUnknown")})`}
        </div>
      )}
      {s.refundable && s.state !== "cancelled" && s.state !== "non_refundable" && (
        <div className="tabular text-[11px] text-fg-3">
          {t("cancellation.refundable", { amount: f.money(s.refundable) })}
        </div>
      )}
      {s.policy?.checked_at && (
        <div className="text-[11px] text-fg-3">
          {t("cancellation.checked", { date: f.date(s.policy.checked_at.slice(0, 10), "short") })}
        </div>
      )}
    </div>
  );
}
