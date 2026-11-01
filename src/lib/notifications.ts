// Windows notifications for reminders, checked at start and every quarter of an hour while the
// app runs (also hidden in the tray). What was shown is remembered in the settings.

import { useEffect, useRef, useState } from "react";
import { api, inDesktopApp } from "@/api/client";
import { dueNotifications, keepSent } from "@/domain/notify";
import { reminders } from "@/domain/reminders";
import { Temporal } from "@/domain/time";
import { useReminderText } from "@/features/trip/warnings";
import { useT } from "@/i18n";
import type { TripModel } from "./model";
import { usePrefs } from "./prefs";

const CHECK_EVERY_MS = 15 * 60_000;
/** More due at once (e.g. the first start) are announced as one summary. */
const MAX_SINGLE = 3;

export function useOsNotifications(models: TripModel[], loaded: boolean) {
  const prefs = usePrefs();
  const t = useT();
  // Formatting changes identity on every render; the check itself runs only when data or time moves.
  const reminderText = useReminderText();
  const text = useRef(reminderText);
  text.current = reminderText;
  const sent = useRef<Set<string> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-runs the check over time.
  useEffect(() => {
    if (!inDesktopApp || !prefs.ready || !loaded || !prefs.notifications) return;
    sent.current ??= new Set(prefs.notifiedKeys);
    const done = sent.current;
    const now = Temporal.Now.instant();
    const today = now.toZonedDateTimeISO(prefs.timeZone).toPlainDate();
    const all = models.flatMap((m) =>
      reminders(m.ctx, now, m.tz, prefs.reminders).map((r) => ({ r, title: m.graph.trip.title })),
    );
    const due = dueNotifications(
      all.map((x) => x.r),
      done,
      today,
    );
    if (due.length === 0) return;
    if (due.length > MAX_SINGLE) {
      void api.notify("Travel Planner", t("notifications.summary", { count: due.length }));
    } else {
      for (const n of due) {
        const title = all.find((x) => x.r === n.reminder)?.title ?? "Travel Planner";
        void api.notify(title, text.current(n.reminder));
      }
    }
    for (const n of due) done.add(n.key);
    const keep = keepSent(
      done,
      all.map((x) => x.r),
    );
    void api.setSetting("notified_keys", JSON.stringify(keep)).catch(() => undefined);
  }, [models, loaded, prefs, tick, t]);
}
