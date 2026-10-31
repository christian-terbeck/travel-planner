import type { CancellationPolicy, PolicyType } from "@/domain/types";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { nil, nowIso } from "@/lib/rows";
import { Button, Field, Input, Select, Textarea } from "@/ui/core";
import { DateTimeInput, MoneyInput, NumberInput, TzInput } from "@/ui/inputs";

const TYPES: PolicyType[] = ["unknown", "free_until", "with_fee", "partially_refundable", "non_refundable"];

/** Cancellation terms. `null` means nothing recorded, which is shown as "unknown". */
export function PolicyEditor({
  policy,
  onChange,
  create,
  defaultTz,
}: {
  policy: CancellationPolicy | null;
  onChange: (p: CancellationPolicy | null) => void;
  create: () => CancellationPolicy;
  defaultTz?: string | null;
}) {
  const t = useT();
  const f = useFormat();
  const p = policy;
  const set = <K extends keyof CancellationPolicy>(k: K, v: CancellationPolicy[K]) =>
    p && onChange({ ...p, [k]: v });
  const type = p?.policy_type ?? "unknown";
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label={t("policy.type")} htmlFor="pol-type">
        <Select
          id="pol-type"
          value={type}
          onChange={(e) => {
            const v = e.target.value as PolicyType;
            if (v === "unknown" && !p) return;
            const base = p ?? { ...create(), deadline_tz: defaultTz ?? null };
            onChange({ ...base, policy_type: v });
          }}
        >
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`policy.types.${x}`)}
            </option>
          ))}
        </Select>
      </Field>
      {p && type !== "unknown" && type !== "non_refundable" && (
        <>
          <Field
            label={type === "free_until" ? t("policy.freeUntil") : t("policy.deadline")}
            htmlFor="pol-dl"
          >
            <DateTimeInput id="pol-dl" value={p.deadline_local} onChange={(v) => set("deadline_local", v)} />
          </Field>
          <Field label={t("policy.deadlineTz")} hint={t("policy.deadlineTzHint")} htmlFor="pol-tz">
            <TzInput id="pol-tz" value={p.deadline_tz} onChange={(v) => set("deadline_tz", v)} />
          </Field>
        </>
      )}
      {p && type === "with_fee" && (
        <Field label={t("policy.fee")} htmlFor="pol-fee">
          <MoneyInput
            id="pol-fee"
            value={p.fee_minor}
            currency={p.currency}
            onChange={(v) => set("fee_minor", v)}
          />
        </Field>
      )}
      {p && (type === "partially_refundable" || type === "free_until") && (
        <>
          <Field
            label={type === "free_until" ? t("policy.refundAfter") : t("policy.refundable")}
            htmlFor="pol-ra"
          >
            <MoneyInput
              id="pol-ra"
              value={p.refundable_minor}
              currency={p.currency}
              placeholder={t("common.notSet")}
              onChange={(v) => set("refundable_minor", v)}
            />
          </Field>
          <Field label={t("policy.refundablePercent")} htmlFor="pol-rp">
            <NumberInput
              id="pol-rp"
              min={0}
              max={100}
              value={p.refundable_percent}
              onChange={(v) => set("refundable_percent", v)}
            />
          </Field>
        </>
      )}
      {p && (
        <>
          <Field label={t("policy.source")} htmlFor="pol-src">
            <Input
              id="pol-src"
              value={p.source ?? ""}
              placeholder={t("policy.sourcePlaceholder")}
              onChange={(e) => set("source", nil(e.target.value))}
            />
          </Field>
          <Field label={t("policy.checkedAt")} htmlFor="pol-chk">
            <div className="flex items-center gap-2">
              <span id="pol-chk" className="tabular text-sm">
                {p.checked_at ? f.timestamp(p.checked_at) : t("policy.notChecked")}
              </span>
              <Button size="sm" onClick={() => set("checked_at", nowIso())}>
                {t("policy.checkedNow")}
              </Button>
            </div>
          </Field>
          <Field label={t("policy.text")} className="col-span-3" htmlFor="pol-text">
            <Textarea
              id="pol-text"
              rows={2}
              value={p.policy_text ?? ""}
              onChange={(e) => set("policy_text", nil(e.target.value))}
            />
          </Field>
        </>
      )}
      {type === "unknown" && (
        <p className="col-span-2 self-end pb-2 text-fg-3 text-xs">{t("policy.unknownHint")}</p>
      )}
    </div>
  );
}
