// Status indicators. Every status has a color, an icon and a label, never color alone.

import {
  AlertTriangle,
  Archive,
  Ban,
  BedDouble,
  Bus,
  Calendar,
  Car,
  CarTaxiFront,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleDollarSign,
  Clock,
  Flag,
  HelpCircle,
  Info,
  Lightbulb,
  Plane,
  RotateCcw,
  Route,
  ShieldCheck,
  ShieldOff,
  Ship,
  SquareParking,
  Star,
  Ticket,
  TrainFront,
  Umbrella,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CancellationState } from "@/domain/cancellation";
import type { Severity } from "@/domain/conflicts";
import type { PaymentStatus, SlotKind, TransportMode, TripStatus } from "@/domain/types";
import { useT } from "@/i18n";
import type { EffectiveStatus } from "@/lib/model";
import { Badge, type Tone } from "./core";

export const statusStyle: Record<EffectiveStatus, { tone: Tone; icon: ReactNode }> = {
  idea: { tone: "idea", icon: <Lightbulb /> },
  planned: { tone: "neutral", icon: <CircleDashed /> },
  preferred: { tone: "primary", icon: <Star /> },
  booked: { tone: "ok", icon: <CheckCircle2 /> },
  cancelled: { tone: "danger", icon: <XCircle /> },
  completed: { tone: "neutral", icon: <Flag /> },
  archived: { tone: "neutral", icon: <Archive /> },
  rejected: { tone: "neutral", icon: <Ban /> },
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  const t = useT();
  const s = statusStyle[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

const paymentStyle: Record<PaymentStatus, { tone: Tone; icon: ReactNode }> = {
  not_applicable: { tone: "neutral", icon: <Circle /> },
  unpaid: { tone: "warn", icon: <CircleDollarSign /> },
  partially_paid: { tone: "warn", icon: <CircleDollarSign /> },
  paid: { tone: "ok", icon: <CheckCircle2 /> },
  refunded: { tone: "info", icon: <RotateCcw /> },
  partially_refunded: { tone: "info", icon: <RotateCcw /> },
  unknown: { tone: "neutral", icon: <HelpCircle /> },
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const t = useT();
  const s = paymentStyle[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`payment.${status}`)}
    </Badge>
  );
}

const cancelStyle: Record<CancellationState, { tone: Tone; icon: ReactNode }> = {
  free: { tone: "ok", icon: <ShieldCheck /> },
  with_fee: { tone: "warn", icon: <ShieldCheck /> },
  partial: { tone: "warn", icon: <ShieldCheck /> },
  non_refundable: { tone: "danger", icon: <ShieldOff /> },
  deadline_passed: { tone: "danger", icon: <Clock /> },
  unknown: { tone: "neutral", icon: <HelpCircle /> },
  cancelled: { tone: "neutral", icon: <XCircle /> },
};

export function CancellationBadge({ state }: { state: CancellationState }) {
  const t = useT();
  const s = cancelStyle[state];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`cancellation.state.${state}`)}
    </Badge>
  );
}

const tripStyle: Record<TripStatus, { tone: Tone; icon: ReactNode }> = {
  idea: { tone: "idea", icon: <Lightbulb /> },
  planning: { tone: "info", icon: <CircleDashed /> },
  booked: { tone: "ok", icon: <CheckCircle2 /> },
  ongoing: { tone: "accent", icon: <Plane /> },
  completed: { tone: "neutral", icon: <Flag /> },
  cancelled: { tone: "danger", icon: <XCircle /> },
  archived: { tone: "neutral", icon: <Archive /> },
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const t = useT();
  const s = tripStyle[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`tripStatus.${status}`)}
    </Badge>
  );
}

export const severityTone: Record<Severity, Tone> = { critical: "danger", warning: "warn", info: "info" };

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const t = useT();
  const label = t(`severity.${severity}`);
  if (severity === "info") return <Info className={className ?? "size-4 text-info"} aria-label={label} />;
  return (
    <AlertTriangle
      className={className ?? `size-4 ${severity === "critical" ? "text-danger" : "text-warn"}`}
      aria-label={label}
    />
  );
}

export function KindIcon({ kind, className = "size-4" }: { kind: SlotKind; className?: string }) {
  const icons: Record<SlotKind, ReactNode> = {
    flight: <Plane className={className} aria-hidden />,
    accommodation: <BedDouble className={className} aria-hidden />,
    rental_car: <Car className={className} aria-hidden />,
    activity: <Ticket className={className} aria-hidden />,
    transport: <TrainFront className={className} aria-hidden />,
    parking: <SquareParking className={className} aria-hidden />,
    insurance: <Umbrella className={className} aria-hidden />,
    other: <Calendar className={className} aria-hidden />,
  };
  return icons[kind];
}

export function ModeIcon({ mode, className = "size-4" }: { mode: TransportMode | null; className?: string }) {
  switch (mode) {
    case null:
      return <Plane className={className} aria-hidden />;
    case "train":
      return <TrainFront className={className} aria-hidden />;
    case "bus":
      return <Bus className={className} aria-hidden />;
    case "ferry":
      return <Ship className={className} aria-hidden />;
    case "transfer":
      return <CarTaxiFront className={className} aria-hidden />;
    case "other":
      return <Route className={className} aria-hidden />;
  }
}

/** Marks a value as an estimate, unverified or incomplete so it never looks like a fact. */
export function Certainty({
  kind,
}: {
  kind: "estimate" | "incomplete" | "confirmed" | "actual" | "unverified";
}) {
  const t = useT();
  const tone: Record<typeof kind, Tone> = {
    estimate: "neutral",
    incomplete: "warn",
    confirmed: "ok",
    actual: "info",
    unverified: "warn",
  };
  const icon: Record<typeof kind, ReactNode> = {
    estimate: <CircleDashed />,
    incomplete: <AlertTriangle />,
    confirmed: <CheckCircle2 />,
    actual: <CircleDollarSign />,
    unverified: <HelpCircle />,
  };
  return (
    <Badge tone={tone[kind]} icon={icon[kind]}>
      {t(`certainty.${kind}`)}
    </Badge>
  );
}
