// Travel companion: one self-contained HTML file for the phone. Day by day with local times,
// booking references, contacts and map links; the key facts on top. No external resources, so
// it opens offline from a mail attachment or a cloud folder and prints to PDF.

import type { TFunction } from "i18next";
import { itemPosition } from "@/domain/geo";
import { MODE_SYMBOL, type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import { compareDate, dateRange, type PlainDate } from "@/domain/time";
import { brandSource, membershipsFor } from "./loyalty";
import type { TripModel } from "./model";
import type { makeFormat } from "./prefs";

type Fmt = ReturnType<typeof makeFormat>;

const esc = (s: string | number | null | undefined) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

interface Entry {
  day: PlainDate;
  /** Local "HH:MM" for ordering within the day; empty sorts first. */
  time: string;
  icon: string;
  title: string;
  lines: string[];
  item: PlanItem;
}

const hhmm = (local: string | null | undefined) => (local && local.length >= 16 ? local.slice(11, 16) : "");

function mapLinks(lat: number | null | undefined, lon: number | null | undefined, t: TFunction): string {
  if (lat === null || lat === undefined || lon === null || lon === undefined) return "";
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  return ` <a href="${esc(osm)}">${esc(t("companion.map"))}</a> · <a href="geo:${lat},${lon}">${esc(t("companion.navigate"))}</a>`;
}

/** Day entries of one plan item: segments on their departure day, stays on check-in and check-out, … */
function entries(i: PlanItem, f: Fmt, t: TFunction): Entry[] {
  const out: Entry[] = [];
  const refs = i.activeBookings.map((b) => b.reference).filter(Boolean);
  const ref = refs.length
    ? `${t("booking.reference")}: <span class="ref">${refs.map(esc).join(", ")}</span>`
    : "";
  const contact = i.activeBookings.find((b) => b.contact)?.contact ?? i.option.contact;
  const extra = [ref, contact ? `☎ ${esc(contact)}` : ""].filter(Boolean);
  const add = (day: PlainDate | null, time: string, icon: string, title: string, lines: string[]) => {
    if (day) out.push({ day, time, icon, title, lines: lines.filter(Boolean), item: i });
  };
  for (const s of i.segments) {
    const seg = s.segment;
    const from = segmentFrom(seg) ?? "?";
    const to = segmentTo(seg) ?? "?";
    add(
      s.departDate,
      hhmm(seg.depart_local),
      MODE_SYMBOL[seg.mode ?? "flight"],
      `${hhmm(seg.depart_local)} ${from} → ${hhmm(seg.arrive_local)} ${to}`,
      [
        [seg.airline, seg.flight_number].filter(Boolean).map(esc).join(" "),
        [seg.cabin, seg.fare_class, seg.baggage].filter(Boolean).map(esc).join(" · "),
        s.arriveDate && s.departDate && !s.arriveDate.equals(s.departDate)
          ? esc(t("companion.arrivesOn", { date: f.date(s.arriveDate, "weekday") }))
          : "",
        mapLinks(seg.from_lat, seg.from_lon, t).trim(),
        ...extra,
      ],
    );
  }
  const geo = itemPosition(i);
  if (i.accommodation) {
    const a = i.accommodation;
    const where = [a.address ? esc(a.address) : "", mapLinks(geo?.lat, geo?.lon, t)].join("");
    add(i.startDate, a.check_in_time ?? "15:00", "🛏", `${t("itinerary.checkIn")}: ${i.option.title}`, [
      a.check_in_time ? esc(t("companion.from", { time: a.check_in_time })) : "",
      where,
      [a.room_type, a.meal_plan].filter(Boolean).map(esc).join(" · "),
      ...extra,
    ]);
    add(i.endDate, a.check_out_time ?? "11:00", "🧳", `${t("itinerary.checkOut")}: ${i.option.title}`, [
      a.check_out_time ? esc(t("companion.until", { time: a.check_out_time })) : "",
    ]);
  }
  if (i.rentalCar) {
    const r = i.rentalCar;
    add(
      i.startDate,
      hhmm(r.pickup_local),
      "🚗",
      `${hhmm(r.pickup_local)} ${t("itinerary.carPickup")}: ${i.option.title}`,
      [
        esc(r.pickup_location),
        [r.vehicle_category, r.vehicle_model].filter(Boolean).map(esc).join(" · "),
        ...extra,
      ],
    );
    add(
      i.endDate,
      hhmm(r.return_local),
      "🚗",
      `${hhmm(r.return_local)} ${t("itinerary.carReturn")}: ${i.option.title}`,
      [esc(r.return_location ?? r.pickup_location)],
    );
  }
  if (i.activity && i.kind !== "insurance") {
    const a = i.activity;
    const icon = i.kind === "parking" ? "🅿" : "🎟";
    // A span over several days shows its end time on the last day only.
    const multiDay = !!(i.endDate && i.startDate && !i.endDate.equals(i.startDate));
    const time = a.start_time ? `${a.start_time}${a.end_time && !multiDay ? `–${a.end_time}` : ""} ` : "";
    add(i.startDate, a.start_time ?? "", icon, `${time}${i.option.title}`, [
      [a.location ? esc(a.location) : "", mapLinks(geo?.lat, geo?.lon, t)].join(""),
      ...extra,
    ]);
    if (i.kind === "parking" && multiDay)
      add(i.endDate, a.end_time ?? "", icon, `${a.end_time ?? ""} ${i.option.title}`.trim(), []);
  }
  return out;
}

export function companionHtml(m: TripModel, f: Fmt, t: TFunction, today: PlainDate): string {
  const g = m.graph;
  const plan = m.plan;
  const all = plan.items.flatMap((i) => entries(i, f, t));
  const { start, end } = plan.period;
  const days = start && end ? dateRange(start, end.add({ days: 1 })) : [];
  // Entries outside the period (e.g. parking before the flight day) still get their own day.
  for (const e of all) if (!days.some((d) => d.equals(e.day))) days.push(e.day);
  days.sort(compareDate);

  const stayOn = (d: PlainDate) =>
    plan.items.find(
      (i) =>
        i.accommodation &&
        i.startDate &&
        i.endDate &&
        compareDate(i.startDate, d) <= 0 &&
        compareDate(i.endDate, d) > 0,
    );
  const dayHtml = days
    .map((d, n) => {
      const list = all.filter((e) => e.day.equals(d)).sort((a, b) => a.time.localeCompare(b.time));
      const stay = stayOn(d);
      const gap = plan.nights.gaps.some((x) => x.equals(d));
      const isToday = d.equals(today);
      return `<section class="day${isToday ? " today" : ""}" id="d${esc(d.toString())}">
<h3>${esc(t("itinerary.day", { n: n + 1 }))} <span>${esc(f.date(d, "long"))}</span>${isToday ? ` <b class="badge">${esc(t("calendar.today"))}</b>` : ""}</h3>
${list
  .map(
    (e) =>
      `<div class="entry"><div class="icon">${e.icon}</div><div><div class="title">${esc(e.title)}${e.item.activeBookings.length ? "" : ` <small class="planned">${esc(t("companion.notBooked"))}</small>`}</div>${e.lines.map((l) => `<div class="line">${l}</div>`).join("")}</div></div>`,
  )
  .join("")}
${stay ? `<div class="night">🌙 ${esc(stay.option.title)}</div>` : gap ? `<div class="night gap">🌙 ${esc(t("itinerary.nightGap"))}</div>` : ""}
</section>`;
    })
    .join("\n");

  const bookings = plan.items
    .flatMap((i) => i.activeBookings.map((b) => ({ i, b })))
    .map(({ i, b }) => {
      const c = m.cancellation(b);
      const deadline = c.deadline && c.minutesLeft !== null && c.minutesLeft > 0;
      const loyalty = membershipsFor(brandSource(i), g)
        .map(
          ({ membership: l, travelerName }) =>
            `${esc(travelerName)} · ${esc(l.program)} <span class="ref">${esc(l.number)}</span>`,
        )
        .join("<br>");
      return `<li><b>${esc(i.option.title)}</b><br>${[`<span class="ref">${esc(b.reference ?? "—")}</span>`, ...[b.provider ?? i.option.provider, b.platform].filter(Boolean).map(esc)].join(" · ")}${b.contact ? `<br>☎ ${esc(b.contact)}` : ""}${loyalty ? `<br><small>${loyalty}</small>` : ""}${deadline ? `<br><small>${esc(t("cancellation.state.free"))} ${esc(t("cancellation.until", { date: f.dateTime(c.deadline, c.policy?.deadline_tz ?? m.tz) }))}</small>` : ""}</li>`;
    })
    .join("");
  const tasks = g.tasks
    .filter((x) => !x.done_at)
    .map(
      (x) =>
        `<li>☐ ${esc(x.title)}${x.due_date ? ` <small>${esc(t("tasks.due", { date: f.date(x.due_date, "short") }))}</small>` : ""}</li>`,
    )
    .join("");
  const inTrip = days.some((d) => d.equals(today));
  const travelers = g.travelers.map((x) => x.name).join(", ");

  return `<!doctype html><html lang="${esc(f.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(g.trip.title)}</title><style>
:root{--bg:#f6f5f1;--card:#fff;--text:#1c2224;--muted:#6b7477;--line:#e2ded4;--accent:#0f5c5d;--warn:#9a6200}
@media(prefers-color-scheme:dark){:root{--bg:#121617;--card:#1a2022;--text:#e8ecec;--muted:#93a0a3;--line:#2c3538;--accent:#4fb3ad;--warn:#e0a647}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{position:sticky;top:0;z-index:1;background:var(--accent);color:#fff;padding:12px 16px}header h1{margin:0;font-size:18px}header p{margin:2px 0 0;opacity:.85;font-size:13px}
nav{display:flex;gap:8px;padding:10px 16px;overflow-x:auto}nav a{flex:none;padding:6px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);color:var(--text);text-decoration:none;font-size:13px}
main{padding:0 12px 24px;max-width:720px;margin:0 auto}h2{font-size:15px;margin:20px 4px 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.day,.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:10px 0}.day.today{border:2px solid var(--accent)}
.day h3{margin:0 0 8px;font-size:15px}.day h3 span{color:var(--muted);font-weight:500}.badge{background:var(--accent);color:#fff;border-radius:6px;padding:1px 6px;font-size:11px}
.entry{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--line)}.entry:first-of-type{border-top:0}.icon{width:22px;text-align:center;font-size:17px}
.title{font-weight:600}.line{color:var(--muted);font-size:13px;margin-top:2px;overflow-wrap:anywhere}.planned{color:var(--warn);font-weight:500}
.ref{font-family:ui-monospace,Consolas,monospace;font-weight:700;color:var(--text);letter-spacing:.05em;user-select:all}
.night{color:var(--muted);font-size:13px;padding-top:8px;border-top:1px dashed var(--line);margin-top:4px}.gap{color:var(--warn)}
ul{margin:0;padding-left:0;list-style:none}li{padding:8px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}small{color:var(--muted)}a{color:var(--accent)}
footer{color:var(--muted);font-size:12px;text-align:center;padding:16px}
@media print{header{position:static;background:none;color:var(--text)}nav{display:none}.day,.card{break-inside:avoid}}
</style></head><body>
<header><h1>${esc(g.trip.title)}</h1><p>${esc([g.trip.destination, f.dateRange(start, end), travelers].filter(Boolean).join(" · "))}</p></header>
<nav>${inTrip ? `<a href="#d${esc(today.toString())}">${esc(t("calendar.today"))}</a>` : ""}<a href="#days">${esc(t("itinerary.days"))}</a><a href="#bookings">${esc(t("export.doc.bookings"))}</a>${tasks ? `<a href="#tasks">${esc(t("tasks.title"))}</a>` : ""}</nav>
<main>
<h2 id="bookings">${esc(t("export.doc.bookings"))}</h2><div class="card">${bookings ? `<ul>${bookings}</ul>` : `<small>${esc(t("bookings.emptyTitle"))}</small>`}</div>
${tasks ? `<h2 id="tasks">${esc(t("tasks.title"))}</h2><div class="card"><ul>${tasks}</ul></div>` : ""}
<h2 id="days">${esc(t("itinerary.days"))}</h2>
${dayHtml || `<div class="card"><small>${esc(t("itinerary.noPeriodText"))}</small></div>`}
</main>
<footer>${esc(t("companion.footer", { date: f.date(today, "medium") }))}</footer>
</body></html>`;
}
