// Price history of one alternative: checked prices over time, with the saved price and the
// target price as labelled reference lines. One series, so no legend; a crosshair shows each check.

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";

export interface PricePoint {
  /** UTC timestamp of the check. */
  at: string;
  minor: number;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 64 };
/** Room right of the plot for the reference-line labels, so they never sit under a point. */
const LABEL_W = 84;

export function PriceChart({
  points,
  saved,
  target,
  currency,
  height = 180,
}: {
  points: PricePoint[];
  saved: number | null;
  target: number | null;
  currency: string;
  height?: number;
}) {
  const t = useT();
  const f = useFormat();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted = useMemo(() => [...points].sort((a, b) => a.at.localeCompare(b.at)), [points]);
  const times = sorted.map((p) => Date.parse(p.at));
  const values = [...sorted.map((p) => p.minor), saved, target].filter((v): v is number => v !== null);
  if (sorted.length === 0 || values.length === 0) return null;

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
  const y0 = lo - span * 0.15;
  const y1 = hi + span * 0.15;
  const t0 = times[0] as number;
  const t1 = times[times.length - 1] as number;
  const refs = [
    { v: saved, label: t("priceChart.saved"), color: "var(--text-3)" },
    { v: target, label: t("priceChart.target"), color: "var(--ok)" },
  ].filter((r): r is { v: number; label: string; color: string } => r.v !== null);
  const right = PAD.right + (refs.length > 0 ? LABEL_W : 0);
  const w = width - PAD.left - right;
  const h = height - PAD.top - PAD.bottom;
  const x = (ms: number) => PAD.left + (t1 === t0 ? w / 2 : ((ms - t0) / (t1 - t0)) * w);
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * h;
  const money = (v: number) => f.minor(v, currency);
  const line = sorted.map((p, i) => `${i ? "L" : "M"}${x(times[i] as number)},${y(p.minor)}`).join(" ");
  const ticks = [lo, (lo + hi) / 2, hi].filter((v, i, a) => a.indexOf(v) === i);

  const nearest = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < times.length; i++)
      if (Math.abs(x(times[i] as number) - px) < Math.abs(x(times[best] as number) - px)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? sorted[hover] : undefined;
  const last = sorted[sorted.length - 1] as PricePoint;

  return (
    <div ref={box} className="relative w-full select-none">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={t("priceChart.summary", {
          count: sorted.length,
          last: money(last.minor),
          low: money(Math.min(...sorted.map((p) => p.minor))),
        })}
        onPointerMove={(e) => nearest(e.clientX)}
        onPointerLeave={() => setHover(null)}
        className="block touch-none"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + w}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(v)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill="var(--text-3)"
              className="tabular"
            >
              {f.minor(Math.round(v), currency, { compact: true })}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={height - 6} fontSize={11} fill="var(--text-3)">
          {f.date(new Date(t0).toISOString().slice(0, 10), "short")}
        </text>
        {t1 !== t0 && (
          <text x={PAD.left + w} y={height - 6} fontSize={11} fill="var(--text-3)" textAnchor="end">
            {f.date(new Date(t1).toISOString().slice(0, 10), "short")}
          </text>
        )}

        {refs.map((r, i) => {
          // Two labels closer than a line of text are pushed apart.
          const other = refs[1 - i];
          const gap = other ? y(r.v) - y(other.v) : 99;
          const shift = Math.abs(gap) < 26 ? (gap >= 0 ? 1 : -1) * (13 - Math.abs(gap) / 2) : 0;
          const ly = y(r.v) + shift;
          return (
            <g key={r.label}>
              <line
                x1={PAD.left}
                x2={PAD.left + w}
                y1={y(r.v)}
                y2={y(r.v)}
                stroke={r.color}
                strokeWidth={1.5}
                strokeDasharray="5 4"
              />
              <text x={PAD.left + w + 8} y={ly - 2} fontSize={11} fill="var(--text-2)">
                {r.label}
              </text>
              <text x={PAD.left + w + 8} y={ly + 11} fontSize={11} fill="var(--text-2)" className="tabular">
                {money(r.v)}
              </text>
            </g>
          );
        })}

        <path d={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
        {sorted.map((p, i) => (
          <circle
            key={p.at + String(i)}
            cx={x(times[i] as number)}
            cy={y(p.minor)}
            r={hover === i ? 5 : 4}
            fill="var(--primary)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        ))}
        {hp && hover !== null && (
          <line
            x1={x(times[hover] as number)}
            x2={x(times[hover] as number)}
            y1={PAD.top}
            y2={PAD.top + h}
            stroke="var(--text-3)"
            strokeWidth={1}
          />
        )}
      </svg>
      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-lg"
          style={{
            left: Math.min(x(times[hover] as number) + 8, width - 150),
            top: Math.max(0, y(hp.minor) - 44),
          }}
        >
          <div className="text-fg-3">{f.timestamp(hp.at)}</div>
          <div className="tabular font-semibold">{money(hp.minor)}</div>
        </div>
      )}
    </div>
  );
}

/** Tiny trend line for tables; the newest check is marked. */
export function PriceSparkline({ points, currency }: { points: PricePoint[]; currency: string }) {
  const f = useFormat();
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const W = 72;
  const H = 22;
  const vs = sorted.map((p) => p.minor);
  const lo = Math.min(...vs);
  const span = Math.max(...vs) - lo || 1;
  const pts = sorted.map((p, i) => [
    2 + (i / (sorted.length - 1)) * (W - 4),
    3 + (1 - (p.minor - lo) / span) * (H - 6),
  ]);
  const end = pts[pts.length - 1] as number[];
  return (
    <svg width={W} height={H} className="inline-block align-middle" aria-hidden>
      <title>
        {sorted.map((p) => `${f.date(p.at.slice(0, 10), "short")}: ${f.minor(p.minor, currency)}`).join("\n")}
      </title>
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <circle cx={end[0]} cy={end[1]} r={2.5} fill="var(--primary)" />
    </svg>
  );
}
