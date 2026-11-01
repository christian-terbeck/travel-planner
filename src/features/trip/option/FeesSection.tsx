import { Plus, Trash2 } from "lucide-react";
import type { OptionBundle } from "@/domain/types";
import { useT } from "@/i18n";
import { newFee } from "@/lib/rows";
import { Button, Checkbox, IconButton, Input } from "@/ui/core";
import { MoneyInput } from "@/ui/inputs";
import { Section } from "./Section";

export function FeesSection({ b, setB }: { b: OptionBundle; setB: (b: OptionBundle) => void }) {
  const t = useT();
  const o = b.option;
  return (
    <Section
      title={t("option.fees")}
      actions={
        <Button
          size="sm"
          icon={<Plus className="size-3.5" />}
          onClick={() => setB({ ...b, fees: [...b.fees, newFee(o.id, o.currency, b.fees.length)] })}
        >
          {t("option.addFee")}
        </Button>
      }
    >
      {b.fees.length === 0 ? (
        <p className="text-fg-3 text-xs">{t("option.noFees")}</p>
      ) : (
        b.fees.map((fee, i) => (
          <div key={fee.id} className="grid grid-cols-[1fr_220px_auto_auto] items-center gap-3">
            <Input
              aria-label={t("option.feeLabel")}
              placeholder={t("option.feeLabel")}
              value={fee.label}
              onChange={(e) =>
                setB({
                  ...b,
                  fees: b.fees.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                })
              }
            />
            <MoneyInput
              value={fee.amount_minor}
              currency={fee.currency}
              onChange={(v) =>
                setB({ ...b, fees: b.fees.map((x, j) => (j === i ? { ...x, amount_minor: v } : x)) })
              }
              onCurrencyChange={(c) =>
                setB({ ...b, fees: b.fees.map((x, j) => (j === i ? { ...x, currency: c } : x)) })
              }
            />
            <Checkbox
              label={t("option.feeIncluded")}
              checked={fee.included}
              onChange={(e) =>
                setB({
                  ...b,
                  fees: b.fees.map((x, j) => (j === i ? { ...x, included: e.target.checked } : x)),
                })
              }
            />
            <IconButton
              label={t("common.remove")}
              onClick={() => setB({ ...b, fees: b.fees.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))
      )}
    </Section>
  );
}
