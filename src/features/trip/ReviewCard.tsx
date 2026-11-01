import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, CircleDollarSign, Lightbulb, ListChecks, ShieldAlert, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { TripReview } from "@/api/bindings/TripReview";
import { api } from "@/api/client";
import { Temporal } from "@/domain/time";
import { useErrorText, useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { reviewInput } from "@/lib/tripReview";
import { Badge, Button, Card, CardHeader, Spinner, type Tone } from "@/ui/core";
import { useTrip } from "./TripLayout";

const KIND_ICON: Record<string, ReactNode> = {
  missing: <ListChecks />,
  cost: <CircleDollarSign />,
  timing: <AlarmClock />,
  risk: <ShieldAlert />,
  idea: <Lightbulb />,
};
const TONE: Record<string, Tone> = { high: "danger", medium: "warn", low: "neutral" };

/** Advice from Claude on the current plan, on request (only when trip reviews are turned on). */
export function ReviewCard() {
  const t = useT();
  const m = useTrip();
  const prefs = usePrefs();
  const errorText = useErrorText();
  const qc = useQueryClient();
  const key = ["review", m.graph.trip.id];
  // Kept for the session, so switching views does not lose it.
  const review = useQuery<TripReview>({
    queryKey: key,
    queryFn: () => Promise.reject(),
    enabled: false,
  }).data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);
  if (!prefs.aiReview) return null;

  const input = () =>
    JSON.stringify(reviewInput(m, Temporal.Now.plainDateISO(prefs.timeZone).toString()), null, 1);
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      qc.setQueryData(key, await api.reviewTrip(input(), prefs.language));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Sparkles className="size-4" />}
        title={t("review.title")}
        subtitle={t("review.hint")}
        actions={
          <Button
            size="sm"
            onClick={start}
            disabled={busy}
            icon={busy ? <Spinner className="size-4" /> : undefined}
          >
            {review ? t("review.again") : t("review.start")}
          </Button>
        }
      />
      <div className="flex flex-col gap-3 px-4 py-3 text-sm">
        {busy && <p className="text-fg-3">{t("review.busy")}</p>}
        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger" role="alert">
            {error}
          </p>
        )}
        {review && (
          <>
            <p>{review.summary}</p>
            {review.findings.length === 0 ? (
              <p className="text-fg-3">{t("review.nothing")}</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {review.findings.map((f, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="mt-0.5 text-fg-3 [&_svg]:size-4" title={t(`review.kind.${f.kind}`)}>
                      {KIND_ICON[f.kind] ?? <Lightbulb />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{f.title}</span>
                        <Badge tone={TONE[f.importance] ?? "neutral"}>
                          {t(`review.importance.${f.importance}`)}
                        </Badge>
                      </div>
                      <p className="text-fg-2">{f.detail}</p>
                      {f.related.length > 0 && <p className="text-fg-3 text-xs">{f.related.join(" · ")}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {review.assumptions.length > 0 && (
              <div className="text-fg-3 text-xs">
                <span className="font-medium">{t("review.assumptions")}</span>
                <ul className="list-disc pl-4">
                  {review.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <p className="text-fg-3 text-xs">
          {t("review.privacy")}{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setShowInput((v) => !v)}
          >
            {showInput ? t("review.hideInput") : t("review.showInput")}
          </button>
        </p>
        {showInput && (
          <pre className="max-h-64 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug">
            {input()}
          </pre>
        )}
      </div>
    </Card>
  );
}
