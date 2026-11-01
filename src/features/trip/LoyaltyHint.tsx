import { Award, Copy } from "lucide-react";
import { useT } from "@/i18n";
import { type BrandSource, membershipsFor } from "@/lib/loyalty";
import { IconButton } from "@/ui/core";
import { useToast } from "@/ui/toast";
import { useTrip } from "./TripLayout";

/** The travelers' loyalty numbers that fit this booking, ready to copy into the provider's form. */
export function LoyaltyHint({ src }: { src: BrandSource }) {
  const t = useT();
  const m = useTrip();
  const toast = useToast();
  const found = membershipsFor(src, m.graph);
  if (found.length === 0) return null;
  const copy = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      toast.show({ kind: "success", text: t("loyalty.copied", { number }) });
    } catch {
      toast.show({ kind: "error", text: t("loyalty.copyFailed") });
    }
  };
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-xs">
        <Award className="size-3.5 text-fg-3" aria-hidden />
        {t("loyalty.forBooking")}
      </div>
      <ul className="flex flex-col gap-0.5">
        {found.map(({ membership: l, travelerName }) => (
          <li key={l.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              {travelerName} · {l.program}
              {l.tier && <span className="text-fg-3"> · {l.tier}</span>}
            </span>
            <span className="tabular font-mono text-xs">{l.number}</span>
            <IconButton label={t("loyalty.copy", { program: l.program })} onClick={() => void copy(l.number)}>
              <Copy className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
