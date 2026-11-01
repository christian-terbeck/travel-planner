// Human-readable exports produced in the UI (the core writes them to the chosen file).

import type { TFunction } from "i18next";
import { isJourney, MODE_SYMBOL, type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import { compareInstant, dateRange, Temporal } from "@/domain/time";
import type { TripModel } from "./model";
import type { useFormat } from "./prefs";

type Fmt = ReturnType<typeof useFormat>;

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

function itemLine(i: PlanItem, f: Fmt): string {
  if (isJourney(i)) {
    return i.segments
      .map(
        (s) =>
          `${MODE_SYMBOL[s.segment.mode ?? "flight"]} ${esc(s.segment.flight_number ?? "")} ${esc(segmentFrom(s.segment))} → ${esc(segmentTo(s.segment))}, ${esc(f.local(s.segment.depart_local, s.segment.depart_tz))} – ${esc(f.local(s.segment.arrive_local, s.segment.arrive_tz))}`,
      )
      .join("<br>");
  }
  if (i.accommodation)
    return `${esc(f.dateRange(i.startDate, i.endDate))}${i.nights ? ` (${i.nights})` : ""}${i.accommodation.address ? `<br>${esc(i.accommodation.address)}` : ""}`;
  if (i.rentalCar)
    return `${esc(i.rentalCar.pickup_location)} ${esc(f.local(i.rentalCar.pickup_local, i.rentalCar.pickup_tz))} → ${esc(i.rentalCar.return_location)} ${esc(f.local(i.rentalCar.return_local, i.rentalCar.return_tz))}`;
  if (i.activity)
    return `${esc(f.date(i.activity.start_date, "long"))} ${esc(i.activity.start_time ?? "")}${i.activity.location ? ` · ${esc(i.activity.location)}` : ""}`;
  return "";
}

export function itineraryHtml(m: TripModel, f: Fmt, t: TFunction): string {
  const g = m.graph;
  const plan = m.plan;
  const cur = m.budget.currency;
  const items = [...plan.items].sort((a, b) =>
    a.start && b.start ? compareInstant(a.start, b.start) : a.start ? -1 : 1,
  );
  const bookingRows = g.bookings
    .map((b) => {
      const item = m.item(b.option_id);
      const c = m.cancellation(b);
      return `<tr><td>${esc(item?.option.title)}</td><td>${esc(b.status === "cancelled" ? t("status.cancelled") : t("status.booked"))}</td><td>${esc([b.provider, b.platform].filter(Boolean).join(" · "))}</td><td class="mono">${esc(b.reference ?? "—")}</td><td class="num">${esc(f.minor(b.price_minor, b.currency))}</td><td>${esc(t(`payment.${b.payment_status}`))}</td><td>${esc(t(`cancellation.state.${c.state}`))}${c.deadline ? `<br><small>${esc(f.dateTime(c.deadline, c.policy?.deadline_tz ?? m.tz))}</small>` : ""}</td></tr>`;
    })
    .join("");
  const days =
    plan.period.start && plan.period.end
      ? dateRange(plan.period.start, plan.period.end.add({ days: 1 }))
          .map((d, idx) => {
            const todays = items.filter(
              (i) => i.startDate?.equals(d) || (i.endDate?.equals(d) && (i.accommodation || i.rentalCar)),
            );
            const stay = plan.items.find(
              (i) =>
                i.accommodation &&
                i.startDate &&
                i.endDate &&
                Temporal.PlainDate.compare(i.startDate, d) <= 0 &&
                Temporal.PlainDate.compare(i.endDate, d) > 0,
            );
            return `<section class="day"><h3>${esc(t("itinerary.day", { n: idx + 1 }))} · ${esc(f.date(d, "long"))}</h3><ul>${todays
              .map(
                (i) =>
                  `<li><strong>${esc(i.option.title)}</strong> <span class="status">${esc(t(`status.${m.effectiveStatus(i)}`))}</span><br>${itemLine(i, f)}</li>`,
              )
              .join(
                "",
              )}${stay ? `<li class="night">🌙 ${esc(stay.option.title)}</li>` : plan.nights.gaps.some((x) => x.equals(d)) ? `<li class="gap">🌙 ${esc(t("itinerary.nightGap"))}</li>` : ""}</ul></section>`;
          })
          .join("")
      : `<p>${esc(t("itinerary.noPeriodText"))}</p>`;
  const b = m.budget;
  return `<!doctype html><html lang="${esc(f.locale)}"><head><meta charset="utf-8"><title>${esc(g.trip.title)}</title><style>
body{font:14px/1.45 "Segoe UI",system-ui,sans-serif;color:#1c2224;max-width:900px;margin:32px auto;padding:0 24px}
h1{margin:0 0 4px;font-size:26px}h2{margin:32px 0 8px;font-size:18px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{margin:0 0 6px;font-size:14px}
.meta{color:#666}.day{border:1px solid #e2ded4;border-radius:8px;padding:10px 14px;margin:10px 0;break-inside:avoid}.day ul{margin:0;padding-left:18px}
.status{color:#0f5c5d;font-size:12px}.night{color:#555}.gap{color:#9a6200}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left;vertical-align:top}
.num{text-align:right;font-variant-numeric:tabular-nums}.mono{font-family:Consolas,monospace}small{color:#666}.note{color:#666;font-size:12px}
</style></head><body>
<h1>${esc(g.trip.title)}</h1>
<p class="meta">${esc(g.trip.destination ?? "")} · ${esc(f.dateRange(plan.period.start, plan.period.end))}${g.travelers.length ? ` · ${esc(g.travelers.map((x) => x.name).join(", "))}` : ""}</p>
<h2>${esc(t("export.doc.itinerary"))}</h2>${days}
<h2>${esc(t("export.doc.bookings"))}</h2>
${g.bookings.length ? `<table><thead><tr><th>${esc(t("bookings.col.booking"))}</th><th>${esc(t("planning.col.status"))}</th><th>${esc(t("option.provider"))}</th><th>${esc(t("booking.reference"))}</th><th class="num">${esc(t("bookings.col.price"))}</th><th>${esc(t("bookings.col.payment"))}</th><th>${esc(t("planning.col.cancellation"))}</th></tr></thead><tbody>${bookingRows}</tbody></table>` : `<p>${esc(t("bookings.emptyTitle"))}</p>`}
<h2>${esc(t("export.doc.finances"))}</h2>
<table><tbody>
<tr><td>${esc(t("budget.target"))}</td><td class="num">${esc(b.target !== null ? f.minor(b.target, cur) : "—")}</td></tr>
<tr><td>${esc(t("budget.plan"))} (${esc(t(plan.complete ? "certainty.estimate" : "certainty.incomplete"))})</td><td class="num">${esc(f.minor(b.converted.plan.minor, cur))}</td></tr>
<tr><td>${esc(t("budget.confirmed"))}</td><td class="num">${esc(f.minor(b.converted.confirmed.minor, cur))}</td></tr>
<tr><td>${esc(t("budget.paid"))}</td><td class="num">${esc(f.minor(b.converted.paid.minor, cur))}</td></tr>
<tr><td>${esc(t("budget.outstanding"))}</td><td class="num">${esc(f.minor(b.converted.outstanding.minor, cur))}</td></tr>
<tr><td>${esc(t("budget.plannedExpenses"))}</td><td class="num">${esc(f.totals(b.plannedExpenses))}</td></tr>
<tr><td>${esc(t("budget.actual"))}</td><td class="num">${esc(f.minor(b.converted.actual.minor, cur))}</td></tr>
</tbody></table>
<p class="note">${esc(t("export.doc.generated", { date: new Date().toLocaleString(f.locale) }))}</p>
</body></html>`;
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Bookings, payments and expenses as CSV (amounts as decimal strings with their currency). */
export function financesCsv(
  m: TripModel,
  t: TFunction,
  major: (minor: number, currency: string) => string,
): string {
  const rows: Array<Array<string | number | null>> = [
    ["type", "date", "title", "category", "status", "amount", "currency", "reference", "traveler"],
  ];
  const traveler = (id: string | null) => m.graph.travelers.find((x) => x.id === id)?.name ?? "";
  for (const b of m.graph.bookings) {
    rows.push([
      "booking",
      b.booked_on,
      m.item(b.option_id)?.option.title ?? "",
      m.item(b.option_id)?.kind ?? "",
      b.status,
      b.price_minor === null ? "" : major(b.price_minor, b.currency),
      b.currency,
      b.reference,
      "",
    ]);
  }
  for (const p of m.graph.payments) {
    const b = m.graph.bookings.find((x) => x.id === p.booking_id);
    rows.push([
      p.kind,
      p.paid_on,
      m.item(b?.option_id)?.option.title ?? "",
      "",
      "",
      major(p.kind === "refund" ? -p.amount_minor : p.amount_minor, p.currency),
      p.currency,
      b?.reference ?? "",
      traveler(p.traveler_id),
    ]);
  }
  for (const e of m.graph.expenses) {
    rows.push([
      `expense_${e.kind}`,
      e.spent_on,
      e.title,
      t(`expenseCategory.${e.category}`),
      "",
      major(e.kind === "refund" ? -e.amount_minor : e.amount_minor, e.currency),
      e.currency,
      "",
      traveler(e.paid_by),
    ]);
  }
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "trip";
}
