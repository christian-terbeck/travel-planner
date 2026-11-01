import { useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { useT } from "@/i18n";
import { useFormat, usePrefs } from "@/lib/prefs";
import { UPDATE_KEY, useUpdateResult } from "@/lib/updates";
import { Button, Card, CardHeader, Checkbox } from "@/ui/core";

export function UpdatesCard() {
  const t = useT();
  const f = useFormat();
  const { updates } = usePrefs();
  const qc = useQueryClient();
  const run = useAction();
  const result = useUpdateResult();
  const [checking, setChecking] = useState(false);
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  const check = async () => {
    setChecking(true);
    const r = await run(() => api.checkUpdate());
    setChecking(false);
    if (r) qc.setQueryData(UPDATE_KEY, r);
  };
  const latest = result?.latest;
  return (
    <Card>
      <CardHeader icon={<Download className="size-4" />} title={t("updates.title")} />
      <div className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex flex-col gap-1">
          <Checkbox
            label={<span className="font-medium">{t("updates.enable")}</span>}
            checked={updates.enabled}
            onChange={(e) => set("update_check_enabled", e.target.checked ? "1" : null)}
          />
          <p className="pl-6 text-fg-3 text-xs">{t("updates.hint")}</p>
        </div>
        {result && (
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            {result.newer && latest ? (
              <>
                <p className="font-medium">
                  {t("updates.newer", { version: latest.version, current: result.current })}
                </p>
                {latest.notes && (
                  <p className="mt-1 line-clamp-4 whitespace-pre-line text-fg-2 text-xs">{latest.notes}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void run(() => api.openUrl(latest.page_url))}
                  >
                    {t("updates.open")}
                  </Button>
                  {updates.skipped !== latest.version && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void set("update_skipped", latest.version)}
                    >
                      {t("updates.skip")}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p>{t("updates.current", { version: result.current })}</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={check} disabled={checking}>
            {t("updates.check")}
          </Button>
          {updates.checkedAt && (
            <span className="text-fg-3 text-xs">
              {t("updates.checkedAt", { date: f.timestamp(updates.checkedAt) })}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
