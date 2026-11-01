// Which loyalty memberships of the travelers belong to a booking: the programme's company is
// matched against the item's airline, company or platform. Well-known programmes know the
// companies whose bookings earn in them; any other programme matches by the company typed in.

import type { PlanItem } from "@/domain/items";
import type { LoyaltyMembership, TripGraph } from "@/domain/types";
import { findProvider, type Provider, resolveProviders, type SegmentLike, segmentAirline } from "./providers";

/** Programme name → provider IDs of the registry whose bookings count in it. */
const PROGRAMS: Array<{ names: string[]; providers: string[] }> = [
  {
    names: ["Miles & More", "Miles and More"],
    providers: ["lufthansa", "swiss", "austrian", "brussels", "eurowings", "discover", "edelweiss"],
  },
  { names: ["Flying Blue"], providers: ["airfrance", "klm", "transavia"] },
  {
    names: ["Executive Club", "British Airways Club", "Avios"],
    providers: ["britishairways", "iberia", "aerlingus", "vueling"],
  },
  { names: ["Iberia Club"], providers: ["iberia", "vueling"] },
  { names: ["TAP Miles&Go", "Miles&Go"], providers: ["tap"] },
  { names: ["SAS EuroBonus", "EuroBonus"], providers: ["sas"] },
  { names: ["Finnair Plus"], providers: ["finnair"] },
  { names: ["Miles&Smiles"], providers: ["turkish"] },
  { names: ["Skywards", "Emirates Skywards"], providers: ["emirates"] },
  { names: ["Privilege Club"], providers: ["qatar"] },
  { names: ["Etihad Guest"], providers: ["etihad"] },
  { names: ["MileagePlus"], providers: ["united"] },
  { names: ["AAdvantage"], providers: ["american"] },
  { names: ["SkyMiles"], providers: ["delta"] },
  { names: ["Aeroplan"], providers: ["aircanada"] },
  { names: ["KrisFlyer"], providers: ["singapore"] },
  { names: ["Marriott Bonvoy", "Bonvoy"], providers: ["marriott"] },
  { names: ["Hilton Honors"], providers: ["hilton"] },
  { names: ["World of Hyatt"], providers: ["hyatt"] },
  { names: ["IHG One Rewards"], providers: ["ihg"] },
  { names: ["ALL Accor", "Accor Live Limitless"], providers: ["accor"] },
  { names: ["Radisson Rewards"], providers: ["radisson"] },
  { names: ["Meliá Rewards", "MeliaRewards"], providers: ["melia"] },
  { names: ["NH Discovery"], providers: ["nh"] },
  { names: ["Genius"], providers: ["booking"] },
  { names: ["BahnBonus"], providers: ["db"] },
  { names: ["Hertz Gold Plus Rewards", "Gold Plus Rewards"], providers: ["hertz"] },
  { names: ["Avis Preferred"], providers: ["avis"] },
  { names: ["Europcar Privilege"], providers: ["europcar"] },
  { names: ["Sixt Loyalty", "Sixt"], providers: ["sixt"] },
];

const norm = (s: string) => s.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");

/** Programme names offered while typing. */
export const KNOWN_PROGRAMS = PROGRAMS.map((p) => p.names[0] as string);

/** Provider IDs a membership earns with. */
export function programProviders(m: Pick<LoyaltyMembership, "program" | "provider">): Set<string> {
  const out = new Set<string>();
  const program = norm(m.program);
  for (const p of PROGRAMS)
    if (p.names.some((n) => norm(n) === program || (program.length > 4 && program.includes(norm(n)))))
      for (const id of p.providers) out.add(id);
  for (const text of [m.provider, m.program]) {
    const p = findProvider(text);
    if (p) out.add(p.id);
  }
  return out;
}

/** What identifies the companies of a booking: as typed in a form, or taken from a plan item. */
export interface BrandSource {
  provider: string | null;
  platform: string | null;
  url: string | null;
  segments: SegmentLike[];
}

export function brandSource(item: PlanItem): BrandSource {
  const b = item.activeBookings[0];
  const o = item.option;
  return {
    provider: b?.provider ?? o.provider,
    platform: b?.platform ?? o.platform,
    url: b?.url ?? o.url,
    segments: item.segments.map((s) => s.segment),
  };
}

/** Companies behind a booking: the provider, the airlines of all its segments, the platform. */
function companies(src: BrandSource): Provider[] {
  const found = resolveProviders(src, src.segments);
  const airlines = src.segments.map(segmentAirline).filter((p): p is Provider => !!p);
  return [...found.providers, ...airlines, ...(found.platform ? [found.platform] : [])];
}

export interface MatchedMembership {
  membership: LoyaltyMembership;
  travelerName: string;
}

/** The travelers' memberships that a booking with these companies can earn in. */
export function membershipsFor(src: BrandSource, g: TripGraph): MatchedMembership[] {
  const ids = new Set(companies(src).map((p) => p.id));
  if (ids.size === 0) return [];
  return g.loyalty_memberships
    .filter((m) => [...programProviders(m)].some((id) => ids.has(id)))
    .map((m) => ({
      membership: m,
      travelerName: g.travelers.find((t) => t.id === m.traveler_id)?.name ?? "",
    }))
    .sort((a, b) => a.travelerName.localeCompare(b.travelerName));
}
