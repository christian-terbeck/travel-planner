import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { api, inDesktopApp } from "@/api/client";
import { useAction } from "@/api/queries";
import type { ReminderSettings } from "@/domain/reminders";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { Button, Card, CardHeader, Checkbox, Field } from "@/ui/core";
import { NumberInput } from "@/ui/inputs";

export function RemindersCard() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const [r, setR] = useState<ReminderSettings>(prefs.reminders);
  const keys: Array<keyof ReminderSettings> = [
    "cancellationDays",
    "departureDays",
    "paymentDays",
    "activityDays",
    "missingDays",
    "taskDays",
  ];
  return (
    <Card>
      <CardHeader
        icon={<Bell className="size-4" />}
        title={t("settings.reminders")}
        subtitle={t("settings.remindersHint")}
      />
      <NotificationOptions />
      <div className="grid grid-cols-3 gap-4 border-line border-t p-4">
        {keys.map((k) => (
          <Field key={k} label={t(`settings.reminder.${k}`)} htmlFor={`rem-${k}`}>
            <NumberInput
              id={`rem-${k}`}
              min={0}
              max={365}
              value={r[k]}
              onChange={(v) => setR({ ...r, [k]: v ?? 0 })}
            />
          </Field>
        ))}
      </div>
      <div className="flex justify-end border-line border-t px-4 py-2.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => run(() => api.setSetting("reminders", JSON.stringify(r)), t("settings.saved"))}
        >
          {t("common.save")}
        </Button>
      </div>
    </Card>
  );
}

function NotificationOptions() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    if (inDesktopApp) void api.autostartEnabled().then(setAutostart, () => setAutostart(null));
  }, []);
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  return (
    <div className="flex flex-col gap-2 p-4">
      <Checkbox
        label={<span className="font-medium">{t("settings.notifications.enable")}</span>}
        checked={prefs.notifications}
        onChange={(e) => set("notifications", e.target.checked ? null : "0")}
      />
      <p className="pl-6 text-fg-3 text-xs">{t("settings.notifications.hint")}</p>
      <Checkbox
        label={t("settings.notifications.tray")}
        checked={prefs.closeToTray}
        onChange={(e) => set("close_to_tray", e.target.checked ? "1" : null)}
      />
      <Checkbox
        label={t("settings.notifications.autostart")}
        checked={autostart ?? false}
        disabled={autostart === null}
        onChange={(e) => {
          const on = e.target.checked;
          void run(async () => {
            await api.setAutostart(on);
            // Started with Windows, the app waits in the tray, so closing must not quit it.
            if (on) await api.setSetting("close_to_tray", "1");
            setAutostart(on);
          });
        }}
      />
      <p className="pl-6 text-fg-3 text-xs">{t("settings.notifications.autostartHint")}</p>
    </div>
  );
}
