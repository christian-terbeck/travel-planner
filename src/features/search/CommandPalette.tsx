import {
  Backpack,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckSquare,
  CircleDollarSign,
  FileText,
  Layers,
  LayoutDashboard,
  Luggage,
  MapPin,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Ticket,
  TrendingDown,
  User,
  Zap,
} from "lucide-react";
import { Dialog as D } from "radix-ui";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { TripGraph } from "@/domain/types";
import { useT } from "@/i18n";
import { buildIndex, normalize, type SearchKind, search } from "@/lib/search";
import { setTripUi } from "@/lib/tripUi";
import { cn } from "@/ui/core";

interface Command {
  id: string;
  icon: ReactNode;
  title: string;
  detail?: string | null;
  group: string;
  run: () => void;
}

const KIND_ICON: Record<SearchKind, ReactNode> = {
  trip: <Luggage />,
  slot: <Layers />,
  option: <Sparkles />,
  booking: <Ticket />,
  traveler: <User />,
  station: <MapPin />,
  expense: <CircleDollarSign />,
  task: <CheckSquare />,
  note: <StickyNote />,
  document: <FileText />,
  packing: <Backpack />,
  journal: <BookOpen />,
};

/** Opens with Ctrl+K (⌘K) anywhere, or with "/" outside of text fields. */
export function useCommandPaletteShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export function CommandPalette({
  open,
  onOpenChange,
  graphs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graphs: TripGraph[];
}) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const index = useMemo(() => (open ? buildIndex(graphs) : []), [open, graphs]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => navigate(path);
    const pages: Command[] = [
      {
        id: "p:new",
        icon: <Plus />,
        title: t("trips.new"),
        run: () => navigate("/trips", { state: { create: true } }),
      },
      { id: "p:dash", icon: <LayoutDashboard />, title: t("nav.dashboard"), run: go("/") },
      { id: "p:trips", icon: <Luggage />, title: t("nav.trips"), run: go("/trips") },
      { id: "p:cal", icon: <CalendarDays />, title: t("nav.calendar"), run: go("/calendar") },
      { id: "p:canc", icon: <ShieldAlert />, title: t("nav.cancellations"), run: go("/cancellations") },
      { id: "p:price", icon: <TrendingDown />, title: t("nav.priceWatch"), run: go("/price-watch") },
      { id: "p:stats", icon: <BarChart3 />, title: t("nav.stats"), run: go("/stats") },
      { id: "p:set", icon: <Settings />, title: t("nav.settings"), run: go("/settings") },
    ].map((c) => ({ ...c, group: t("search.pages") }));
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      const recent = [...graphs]
        .sort((a, b) => b.trip.updated_at.localeCompare(a.trip.updated_at))
        .slice(0, 6)
        .map<Command>((g) => ({
          id: `t:${g.trip.id}`,
          icon: <Luggage />,
          title: g.trip.title,
          detail: g.trip.destination,
          group: t("search.recentTrips"),
          run: go(`/trips/${g.trip.id}`),
        }));
      return [...recent, ...pages];
    }
    // Actions per trip are found by typing, e.g. "expense lisbon".
    const actions = [...graphs]
      .sort((a, b) => b.trip.updated_at.localeCompare(a.trip.updated_at))
      .map<Command>((g) => ({
        id: `qe:${g.trip.id}`,
        icon: <Zap />,
        title: t("quickExpense.palette", { trip: g.trip.title }),
        group: t("search.actions"),
        run: () => navigate(`/trips/${g.trip.id}/budget`, { state: { quickExpense: true } }),
      }));
    const matchingPages = [...pages, ...actions]
      .filter((c) => words.every((w) => normalize(c.title).includes(w)))
      .slice(0, 10);
    const results = search(index, query).map<Command>((e) => ({
      id: `${e.kind}:${e.id}`,
      icon: KIND_ICON[e.kind],
      title: e.title || t("common.notSet"),
      detail: [t(`search.kind.${e.kind}`), e.kind === "trip" ? null : e.tripTitle, e.detail]
        .filter(Boolean)
        .join(" · "),
      group: t("search.results"),
      run: () => {
        if (e.optionId) setTripUi(e.tripId, { selectedOptionId: e.optionId });
        navigate(`/trips/${e.tripId}${e.view ? `/${e.view}` : ""}`);
      },
    }));
    return [...results, ...matchingPages];
  }, [query, index, graphs, t, navigate]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onOpenChange(false);
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(commands[active]);
    }
  };

  let lastGroup = "";
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]" />
        <D.Content
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl focus:outline-none"
          onKeyDown={onKeyDown}
        >
          <D.Title className="sr-only">{t("search.title")}</D.Title>
          <D.Description className="sr-only">{t("search.hint")}</D.Description>
          <div className="flex items-center gap-2 border-line border-b px-4">
            <Search className="size-4 shrink-0 text-fg-3" aria-hidden />
            <input
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-3"
              placeholder={t("search.placeholder")}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={commands[active] ? `${listId}-${active}` : undefined}
              aria-label={t("search.title")}
            />
            <kbd className="rounded border border-line px-1.5 text-[11px] text-fg-3">Esc</kbd>
          </div>
          <div ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {commands.length === 0 ? (
              <p className="px-3 py-6 text-center text-fg-3 text-sm">{t("search.none")}</p>
            ) : (
              commands.map((c, i) => {
                const header = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {header && (
                      <div className="px-2.5 pt-2 pb-1 font-medium text-[11px] text-fg-3 uppercase tracking-wide">
                        {header}
                      </div>
                    )}
                    <div
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === active}
                      tabIndex={-1}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-3",
                        i === active && "bg-primary-soft",
                      )}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(c)}
                      onKeyDown={() => {}}
                    >
                      {c.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{c.title}</span>
                        {c.detail && <span className="block truncate text-fg-3 text-xs">{c.detail}</span>}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
