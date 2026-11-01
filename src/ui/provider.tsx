// Brand tiles for recognised providers: the simple-icons glyph on the brand colour, else the icon of
// the provider's website (when the user allowed fetching it), else a monogram.

import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { forwardRef, type InputHTMLAttributes, useState } from "react";
import { api, inDesktopApp } from "@/api/client";
import { useT } from "@/i18n";
import { usePrefs } from "@/lib/prefs";
import { LOGOS } from "@/lib/providerLogos";
import { findProvider, monogram, needsDarkInk, type Provider, providerColor } from "@/lib/providers";
import { Input } from "./core";

export function ProviderLogo({
  provider,
  size = "md",
  onOpen,
  className,
}: {
  provider: Provider;
  size?: "sm" | "md" | "lg";
  /** Opens the provider's website; the tile is a button when given. */
  onOpen?: (url: string) => void;
  className?: string;
}) {
  const t = useT();
  const bg = providerColor(provider);
  const ink = needsDarkInk(bg) ? "#111827" : "#FFFFFF";
  const glyph = provider.logo ? LOGOS[provider.logo] : undefined;
  const icon = useSiteIcon(provider, !glyph);
  const mono = monogram(provider);
  const box = { sm: "size-4 rounded-[4px]", md: "size-5 rounded-[5px]", lg: "size-8 rounded-lg" }[size];
  const text = {
    sm: mono.length > 1 ? "text-[6px]" : "text-[9px]",
    md: mono.length > 2 ? "text-[7px]" : mono.length > 1 ? "text-[8px]" : "text-[11px]",
    lg: mono.length > 2 ? "text-[10px]" : mono.length > 1 ? "text-xs" : "text-base",
  }[size];
  const content = icon ? (
    <img src={icon.src} alt="" className="size-[80%] object-contain" onError={icon.failed} />
  ) : glyph ? (
    <svg viewBox="0 0 24 24" className="size-[68%]" fill={ink} aria-hidden>
      <path d={glyph.path} />
    </svg>
  ) : (
    <span className={clsx("font-bold leading-none tracking-tight", text)} style={{ color: ink }} aria-hidden>
      {mono}
    </span>
  );
  const cls = clsx(
    "inline-flex shrink-0 select-none items-center justify-center overflow-hidden shadow-xs ring-1 ring-black/10 dark:ring-white/15",
    box,
    className,
  );
  if (!onOpen) {
    return (
      <span
        className={cls}
        style={{ backgroundColor: icon ? "#FFFFFF" : bg }}
        title={provider.name}
        role="img"
        aria-label={provider.name}
      >
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={clsx(cls, "transition-transform hover:scale-110 focus-visible:outline-2")}
      style={{ backgroundColor: icon ? "#FFFFFF" : bg }}
      title={t("provider.openWebsite", { name: provider.name })}
      aria-label={t("provider.openWebsite", { name: provider.name })}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(provider.url);
      }}
    >
      {content}
    </button>
  );
}

/** The website icon of a provider, fetched once by the core when the user enabled it. */
function useSiteIcon(provider: Provider, wanted: boolean) {
  const { siteIcons } = usePrefs();
  const [broken, setBroken] = useState(false);
  const q = useQuery({
    queryKey: ["siteIcon", provider.url],
    queryFn: () => api.siteIcon(provider.url),
    enabled: wanted && siteIcons && inDesktopApp,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!wanted || !siteIcons || broken || !q.data) return null;
  return { src: q.data, failed: () => setBroken(true) };
}

/** Text input that shows the logo of the provider it recognises in front of the typed name. */
export const ProviderInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { detected?: Provider | null }
>(function ProviderInput({ detected, className, value, ...rest }, ref) {
  const found = detected !== undefined ? detected : findProvider(typeof value === "string" ? value : null);
  return (
    <div className="relative">
      {found && (
        <ProviderLogo
          provider={found}
          size="sm"
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2"
        />
      )}
      <Input ref={ref} value={value} className={clsx(found && "pl-8", className)} {...rest} />
    </div>
  );
});
