"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import MiniModal from "@/components/ui/MiniModal";

import { showError, showSuccess } from "@/utils/toast";

import { TIME_PROFILES } from "@/lib/crm/timeProfiles";



const BRAND_MARKETS: Record<string, string[]> = {

  Europcar: ["COM", "AU", "NZ", "FR", "IE", "PT", "ES", "IT", "DE", "NO", "UK", "NL", "BE", "BF", "BN"],

  Goldcar: ["EN", "IT", "FR", "ES", "DE", "PT"],

};



const BRAND_SEGMENTS: Record<string, string[]> = {

  Europcar: ["Publics", "Privilege"],

  Goldcar: ["User", "Clubber"],

};

const TOUCHPOINT_OPTIONS = ["Launch", "Repush", "Last Call"] as const;



type Props = {

  clientSlug: string;

  onClose: () => void;

};



type JiraInfo = {

  key: string;

  title: string;

  status?: string | null;

  url?: string | null;

  summary?: string | null;

  description?: string | null;

};



const parseList = (value: string): string[] =>

  value

    .split(/[,\n]/g)

    .map((v) => v.trim())

    .filter((v) => v.length > 0);



const normalizeMarket = (v: string) => v.trim().toUpperCase();

const normalizeSegment = (v: string) => v.trim();

type MultiSelectOption = { label: string; value: string };

function MultiSelectDropdown({
  label,
  options,
  values,
  onChange,
  placeholder = "0 selected",
  disabled = false,
  disabledText = "Select brand to enable",
}: {
  label: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledText?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLLabelElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const toggle = useCallback(
    (val: string) => {
      if (values.includes(val)) onChange(values.filter((v) => v !== val));
      else onChange([...values, val]);
    },
    [values, onChange],
  );

  const allSelected = options.length > 0 && values.length === options.length;
  const display =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label || values[0]
        : `${values.length} selected`;

  useEffect(() => {
    const handler = (e: Event) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Use capture so we still get the event even if the modal stops propagation on mousedown.
    // Prefer pointer events when available.
    const opts: AddEventListenerOptions = { capture: true };
    if (typeof window !== "undefined" && "PointerEvent" in window) {
      window.addEventListener("pointerdown", handler, opts);
      return () => {
        window.removeEventListener("pointerdown", handler, opts);
      };
    }

    window.addEventListener("mousedown", handler, opts);
    window.addEventListener("touchstart", handler, opts);
    return () => {
      window.removeEventListener("mousedown", handler, opts);
      window.removeEventListener("touchstart", handler, opts);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setActiveIdx(0);
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((idx) => {
          const next = (idx + 1) % options.length;
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((idx) => {
          const next = (idx - 1 + options.length) % options.length;
          itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const opt = options[activeIdx];
        if (opt) toggle(opt.value);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, options, activeIdx, toggle]);

  return (
    <div className="relative" ref={ref}>
      <label className="text-xs font-medium text-[color:var(--color-text)]/70">
        {label}
      </label>
      <button
        type="button"
        className={[
          "input relative h-9 w-full pr-10 text-left truncate transition focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)]",
          disabled ? "cursor-not-allowed opacity-70" : "",
          values.length > 0 ? "ring-1 ring-[color:var(--color-primary)]/40" : "",
        ].join(" ")}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        title={disabled ? disabledText : display}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="inline-flex items-center gap-2">
          {disabled ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-[color:var(--color-text)]/60"
            >
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <rect x="3" y="11" width="18" height="11" rx="2" />
            </svg>
          ) : null}
          <span className="text-[color:var(--color-text)]/80">
            {disabled ? disabledText : display}
          </span>
        </span>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text)]/60">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={[
              "h-4 w-4 transition-transform",
              open ? "rotate-180" : "",
            ].join(" ")}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>
      {open && !disabled ? (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              if (allSelected) onChange([]);
              else onChange(options.map((o) => o.value));
            }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <div className="max-h-48 overflow-auto">
            {options.map((opt, idx) => (
              <label
                key={opt.value}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className={[
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]",
                  activeIdx === idx ? "bg-[color:var(--color-surface-2)]" : "",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={values.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                />
                <span className="flex-1">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}



export default function CrmGenerateUnitsModal({ clientSlug, onClose }: Props) {

  const [jiraTicket, setJiraTicket] = useState("");

  const [jiraInfo, setJiraInfo] = useState<JiraInfo | null>(null);

  const [loadingJira, setLoadingJira] = useState(false);

  const [jiraError, setJiraError] = useState<string | null>(null);



  const [campaignName, setCampaignName] = useState("");

  const [brand, setBrand] = useState("");

  const [owner, setOwner] = useState("");

  const [ownersCatalog, setOwnersCatalog] = useState<string[]>([]);

  const [scope, setScope] = useState("Global");

  const [status, setStatus] = useState("Planned");

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [sendDate, setSendDate] = useState(todayIso);



  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);

  const [marketsSearch, setMarketsSearch] = useState("");

  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);

  const [segmentsSearch, setSegmentsSearch] = useState("");

  const [selectedTouchpoints, setSelectedTouchpoints] = useState<string[]>([]);
  const [touchpointDates, setTouchpointDates] = useState<Record<string, string>>({});
  const [touchpointsSearch, setTouchpointsSearch] = useState("");

  const [variantsInput, setVariantsInput] = useState("A");



  const profileKey = "standard";
  const [submitting, setSubmitting] = useState(false);
  const [activeSubtab, setActiveSubtab] = useState<"basics" | "audience">("basics");
  const jiraTicketInputRef = useRef<HTMLInputElement | null>(null);
  const sendDateInputRef = useRef<HTMLInputElement | null>(null);
  const touchpointDateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);


  useEffect(() => {

    let active = true;

    const loadOwners = async () => {

      try {
        const resPeople = await fetch(`/api/crm/people?client=${clientSlug}`);
        const bodyPeople = await resPeople.json().catch(() => null);
        if (resPeople.ok && Array.isArray(bodyPeople?.people) && bodyPeople.people.length > 0 && active) {
          const labels = bodyPeople.people
            .map((p: { displayName?: string | null }) => String(p?.displayName ?? "").trim())
            .filter(Boolean);
          setOwnersCatalog(Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b)));
          return;
        }

        const res = await fetch(`/api/crm/campaign-owner-rates?client=${clientSlug}`);
        const body = await res.json().catch(() => null);
        const ownersFromRates = body?.rates && typeof body.rates === "object" ? Object.keys(body.rates) : [];

        if (res.ok && Array.isArray(ownersFromRates) && ownersFromRates.length > 0 && active) {
          const labels = ownersFromRates.map((o: string) => String(o ?? "").trim()).filter(Boolean);
          setOwnersCatalog(Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b)));
          return;
        }

        const fallback = await fetch(`/api/crm/catalogs?client=${clientSlug}&kind=owner`);
        const fallbackBody = await fallback.json().catch(() => null);
        if (fallback.ok && Array.isArray(fallbackBody?.items) && active) {
          const labels = fallbackBody.items
            .map((i: { label?: string | null }) => String(i?.label ?? "").trim())
            .filter(Boolean);
          setOwnersCatalog(Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b)));
        }

      } catch {

        /* ignore */

      }

    };

    void loadOwners();

    return () => {

      active = false;

    };

  }, [clientSlug]);



  const brandMarkets = useMemo(() => BRAND_MARKETS[brand] ?? [], [brand]);

  const brandSegments = useMemo(() => BRAND_SEGMENTS[brand] ?? [], [brand]);



  const markets = useMemo(

    () => Array.from(new Set(selectedMarkets.map(normalizeMarket))),

    [selectedMarkets],

  );

  const segments = useMemo(

    () => Array.from(new Set(selectedSegments.map(normalizeSegment).filter(Boolean))),

    [selectedSegments],

  );

  const touchpoints = useMemo(

    () =>

      Array.from(

        new Set(

          selectedTouchpoints

            .map((t) => t.trim())

            .filter((t) => t.length > 0),

        ),

      ),

    [selectedTouchpoints],

  );

  const variants = useMemo(

    () => Array.from(new Set(parseList(variantsInput))),

    [variantsInput],

  );



  const effectiveSegments = useMemo(() => (segments.length > 0 ? segments : [""]), [segments]);

  const effectiveVariants = useMemo(() => (variants.length > 0 ? variants : ["A"]), [variants]);



  const rowsCount = useMemo(() => {
    if (!markets.length || !touchpoints.length) return 0;
    return markets.length * effectiveSegments.length * touchpoints.length * effectiveVariants.length;
  }, [markets.length, touchpoints.length, effectiveSegments.length, effectiveVariants.length]);



const currentProfile = TIME_PROFILES[profileKey] ?? TIME_PROFILES.standard;

  useEffect(() => {
    // Clean up date overrides if a touchpoint is removed.
    setTouchpointDates((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach((tp) => {
        if (!touchpoints.includes(tp)) {
          delete next[tp];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [touchpoints]);

  const resolvedTouchpointDate = (tp: string) => touchpointDates[tp] || sendDate;
  const showTouchpointDates = touchpoints.length > 1 || Object.keys(touchpointDates).length > 0;



  const canProceedToAudience =
    jiraTicket.trim().length > 0 &&
    campaignName.trim().length > 0 &&
    brand.trim().length > 0 &&
    owner.trim().length > 0;

  const canGenerate =
    canProceedToAudience &&
    sendDate.trim().length === 10 &&
    markets.length > 0 &&
    touchpoints.length > 0;



  const handleFetchJira = async () => {

    const ticket = jiraTicket.trim();

    if (!ticket) {

      setJiraError("Please enter a JIRA ticket key.");
      jiraTicketInputRef.current?.focus();

      return;

    }

    setLoadingJira(true);

    setJiraError(null);

    setJiraInfo(null);

    try {

      const url = `/api/crm/jira-campaign?ticket=${encodeURIComponent(ticket)}&client=${encodeURIComponent(

        clientSlug,

      )}`;

      const res = await fetch(url);

      const body = await res.json().catch(() => null);

      if (!res.ok) {

        throw new Error(body?.error || `Failed (${res.status})`);

      }

      const info: JiraInfo = {

        key: body?.key || ticket,

        title: body?.title || body?.summary || "",

        status: body?.status || null,

        url: body?.url || null,

        summary: body?.summary || null,

        description: body?.description || null,

      };

      setJiraInfo(info);

      if (!campaignName.trim() && info.title) {

        setCampaignName(info.title);

      }

    } catch (err) {

      const msg = err instanceof Error ? err.message : "Unable to fetch JIRA ticket";

      setJiraError(msg);

      showError(msg);

    } finally {

      setLoadingJira(false);

    }

  };



  const handleSubmit = async () => {
    if (!canGenerate) {
      showError("Please complete the required fields before generating.");
      return;
    }
    if (rowsCount === 0) {
      showError("You must define at least one market and touchpoint.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {

      const payload = {

        client: clientSlug,

        jiraTicket: jiraTicket.trim(),

        campaignName: campaignName.trim(),

        brand: brand.trim(),

        scope: scope.trim() || "Global",

        status: status.trim() || "Planned",

        owner: owner.trim(),

        sendDate,

        markets,

        segments: segments,

        touchpoints,

        variants: variants,

        touchpointDates: Object.fromEntries(
          Object.entries(touchpointDates).filter(
            ([tp, date]) => tp && date && date !== sendDate,
          ),
        ),

        profileKey: currentProfile.key,

      };



      const res = await fetch("/api/crm/campaign-email-units", {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify(payload),

      });

      const rawText = await res.text();
      let body: unknown = null;
      try {
        body = JSON.parse(rawText);
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        const msg =
          (body as { error?: string } | null)?.error || rawText || `Generation failed (${res.status})`;
        // Log to dev console for quick debugging while the toast can be hidden by backdrop.
        console.error("Generate campaign units failed", {
          status: res.status,
          message: msg,
          payloadSummary: {
            jiraTicket: payload.jiraTicket,
            campaignName: payload.campaignName,
            markets: payload.markets?.length ?? 0,
            touchpoints: payload.touchpoints?.length ?? 0,
            segments: payload.segments?.length ?? 0,
            variants: payload.variants?.length ?? 0,
            sendDate: payload.sendDate,
            touchpointDates: payload.touchpointDates,
          },
        });
        setSubmitError(msg);
        throw new Error(msg);
      }

      const imported = body?.imported ?? rowsCount;

      showSuccess(`Generated ${imported} email units.`);

      if (typeof window !== "undefined") {

        window.dispatchEvent(

          new CustomEvent("crm:imported", {

            detail: { target: "campaigns", client: clientSlug },

          }),

        );

      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to generate units";
      console.error("Generate campaign units error", err);
      showError(msg);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openDatePicker = () => {
    const el = sendDateInputRef.current;
    if (!el) return;
    // Prefer native picker when available; otherwise focus the field.
    // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
    if (typeof el.showPicker === "function") {
      try {
        // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
        el.showPicker();
        return;
      } catch {
        /* ignore and fallback */
      }
    }
    el.focus();
  };

  const openTouchpointDatePicker = (tp: string) => {
    const el = touchpointDateRefs.current[tp];
    if (!el) return;
    // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
    if (typeof el.showPicker === "function") {
      try {
        // @ts-expect-error showPicker is not yet in lib.dom.d.ts everywhere
        el.showPicker();
        return;
      } catch {
        /* ignore and fallback */
      }
    }
    el.focus();
  };

  const removeTouchpoint = (tp: string) => {
    setSelectedTouchpoints((prev) => prev.filter((x) => x !== tp));
    setTouchpointDates((prev) => {
      const next = { ...prev };
      delete next[tp];
      return next;
    });
    delete touchpointDateRefs.current[tp];
  };

  const toggleTouchpoint = (tp: string) => {
    setSelectedTouchpoints((prev) => {
      if (prev.includes(tp)) {
        setTouchpointDates((dates) => {
          const next = { ...dates };
          delete next[tp];
          return next;
        });
        delete touchpointDateRefs.current[tp];
        return prev.filter((x) => x !== tp);
      }
      return [...prev, tp];
    });
  };

  return (
    <MiniModal
      onClose={onClose}
      title="Add units"
      widthClass="max-w-2xl"
    >
      <div className="space-y-4 text-sm text-[color:var(--color-text)]">
        <div className="space-y-4">
            <div className="rounded-xl bg-[color:var(--color-surface-2)]/60 px-3 py-2 text-xs text-[color:var(--color-text)]/80">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={[
                      "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[color:var(--color-surface)]/70",
                      activeSubtab === "basics"
                        ? "text-[color:var(--color-text)]"
                        : "text-[color:var(--color-text)]/70",
                    ].join(" ")}
                    onClick={() => setActiveSubtab("basics")}
                    aria-current={activeSubtab === "basics" ? "step" : undefined}
                  >
                    <span
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                        canProceedToAudience && activeSubtab === "audience"
                          ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)] text-white"
                          : activeSubtab === "basics"
                            ? "border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                            : canProceedToAudience
                              ? "border-[color:var(--color-primary)]/35 bg-[color:var(--color-surface)] text-[color:var(--color-primary)]/80"
                              : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/60",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      {canProceedToAudience && activeSubtab === "audience" ? (
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 0 1 0 1.414l-7.2 7.2a1 1 0 0 1-1.414 0l-3.2-3.2a1 1 0 1 1 1.414-1.414l2.493 2.493 6.493-6.493a1 1 0 0 1 1.414 0Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        "1"
                      )}
                    </span>
                    <span className="font-semibold">Basics</span>
                  </button>

                  <div
                    className={[
                      "h-px w-10",
                      canProceedToAudience
                        ? "bg-[color:var(--color-primary)]/25"
                        : "bg-[color:var(--color-border)]/60",
                    ].join(" ")}
                    aria-hidden="true"
                  />

                  <button
                    type="button"
                    className={[
                      "inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-[color:var(--color-surface)]/70 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                      activeSubtab === "audience"
                        ? "text-[color:var(--color-text)]"
                        : "text-[color:var(--color-text)]/70",
                    ].join(" ")}
                    onClick={() => {
                      if (!canProceedToAudience) return;
                      setActiveSubtab("audience");
                    }}
                    disabled={!canProceedToAudience}
                    aria-current={activeSubtab === "audience" ? "step" : undefined}
                    title={
                      canProceedToAudience
                        ? "Audience & sends"
                        : "Fill JIRA ticket, campaign name, brand and owner to continue"
                    }
                  >
                    <span
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                        activeSubtab === "audience"
                          ? "border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]"
                          : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/60",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      2
                    </span>
                    <span className="font-semibold">Audience & sends</span>
                  </button>
                </div>

                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 px-2 py-1 text-[10px] text-[color:var(--color-text)]/70">
                  Client:{" "}
                  <strong className="text-[color:var(--color-text)]">
                    {clientSlug.toUpperCase()}
                  </strong>
                </span>
              </div>

              <div className="mt-2 h-px bg-[color:var(--color-border)]/60" aria-hidden="true" />
            </div>

            {activeSubtab === "basics" ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">
                Ticket & campaign basics
              </h3>
              <div className="space-y-2 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)]/60 px-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-[color:var(--color-text)]/70 whitespace-nowrap">
                      JIRA ticket
                    </label>
                    <div className="relative">
                    <input
                      ref={jiraTicketInputRef}
                      className="input h-9 w-full pr-10"
                      placeholder="CRM-1701"
                      value={jiraTicket}
                      onChange={(e) => setJiraTicket(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition hover:bg-[color:var(--color-surface-2)]/60 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleFetchJira}
                      disabled={loadingJira}
                      title={loadingJira ? "Fetching from JIRA..." : "Fetch from JIRA"}
                      aria-label="Fetch from JIRA"
                    >
                        {loadingJira ? (
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[color:var(--color-border)] border-t-[color:var(--color-accent)]" />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src="/icons/ui/jira.png"
                            alt="Fetch from JIRA"
                            className="h-5 w-auto object-contain opacity-80"
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  {jiraError ? (
                    <p className="col-span-2 text-xs text-[color:var(--color-accent)]">{jiraError}</p>
                  ) : null}
                  {jiraInfo ? (
                    <div className="col-span-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/80 px-3 py-2 text-xs">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span className="font-semibold">
                          {jiraInfo.key} - {jiraInfo.title || "No title"}
                        </span>
                        {jiraInfo.status ? (
                          <span className="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text)]/70">
                            {jiraInfo.status}
                          </span>
                        ) : null}
                      </div>
                      {jiraInfo.url ? (
                        <a
                          href={jiraInfo.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-[color:var(--color-accent)]"
                        >
                          Open in JIRA
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="col-span-2 space-y-1">
                    <label className="text-xs font-medium text-[color:var(--color-text)]/70 whitespace-nowrap">
                      Campaign name
                    </label>
                    <input
                      className="input h-9 w-full"
                      placeholder="Black Friday 2025"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[color:var(--color-text)]/70 whitespace-nowrap">
                      Brand
                    </label>
                    <select
                      className="input h-9 w-full"
                      value={brand}
                      onChange={(e) => {
                        const next = e.target.value;
                        setBrand(next);
                        setSelectedMarkets([]);
                        setSelectedSegments([]);
                      }}
                    >
                      <option value="" disabled>
                        Select brand
                      </option>
                      <option value="Europcar">Europcar</option>
                      <option value="Goldcar">Goldcar</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[color:var(--color-text)]/70 whitespace-nowrap">
                      Owner (builder)
                    </label>
                    <select
                      className="input h-9 w-full"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                    >
                      <option value="" disabled>
                        Select owner
                      </option>
                      {owner && !ownersCatalog.includes(owner) ? (
                        <option value={owner}>{owner}</option>
                      ) : null}
                      {ownersCatalog.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    {ownersCatalog.length === 0 ? (
                      <p className="text-[11px] text-[color:var(--color-text)]/60">
                        No owners found. Add them in Manage rates.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="text-[11px] text-[color:var(--color-text)]/60">
                  Tip: Fetch from JIRA to prefill name/brand when available. Owner is required.
                </div>
              </div>
            </section>
            ) : null}

                                                
                        {activeSubtab === "audience" ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[color:var(--color-text)]">
                Audience & send date
              </h3>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                    Scope
                  </label>
                  <select
                    className="input h-9 w-full"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="Global">Global</option>
                    <option value="Local">Local</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                    Default status
                  </label>
                  <select
                    className="input h-9 w-full"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="Planned">Planned</option>
                    <option value="Sent">Sent</option>
                    <option value="Done">Done</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                    Sending date
                  </label>
                  <div className="relative w-full">
                    <input
                      ref={sendDateInputRef}
                      type="date"
                      className="input input-date h-9 w-full pr-10"
                      value={sendDate}
                      onChange={(e) => setSendDate(e.target.value)}
                      title="Applied to all generated rows"
                      onClick={openDatePicker}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]"
                      aria-label="Open calendar"
                      onClick={openDatePicker}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="M8 2v4" />
                        <path d="M16 2v4" />
                        <path d="M3 10h18" />
                        <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <MultiSelectDropdown
                      label="Markets"
                      options={brandMarkets.map((m) => ({ label: m, value: m }))}
                      values={markets}
                      onChange={(vals) => setSelectedMarkets(vals)}
                      disabled={!brand}
                      disabledText="Select brand to enable"
                      placeholder="0 selected"
                    />
                    {!brand ? (
                      <p className="text-[11px] text-[color:var(--color-text)]/60">
                        Select a brand to load the available markets.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <MultiSelectDropdown
                      label="Segments (optional)"
                      options={brandSegments.map((s) => ({ label: s, value: s }))}
                      values={segments}
                      onChange={(vals) => setSelectedSegments(vals)}
                      disabled={!brand}
                      disabledText="Select brand to enable"
                      placeholder="0 selected"
                    />
                    <p className="text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty to avoid splitting by segment.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <MultiSelectDropdown
                      label="Touchpoints"
                      options={TOUCHPOINT_OPTIONS.map((t) => ({ label: t, value: t }))}
                      values={touchpoints}
                      onChange={(vals) => setSelectedTouchpoints(vals)}
                      placeholder="0 selected"
                    />
                    <p className="text-[11px] text-[color:var(--color-text)]/60">
                      Select one or more touchpoints. If you select more than one, you can override dates below.
                    </p>

                    {touchpoints.length === 0 ? (
                      <p className="text-xs text-[color:var(--color-text)]/60">
                        At least one touchpoint is required.
                      </p>
                    ) : null}

                    {touchpoints.length > 0 ? (
                      showTouchpointDates ? (
                      <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 p-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[color:var(--color-text)]/70">
                          <span>Touchpoint dates (defaults to Sending date above).</span>
                          {Object.keys(touchpointDates).length > 0 ? (
                            <button
                              type="button"
                              className="text-[color:var(--color-primary)] underline-offset-2 hover:underline"
                              onClick={() => setTouchpointDates({})}
                            >
                              Reset overrides
                            </button>
                          ) : null}
                        </div>

                        <div className="mt-2 max-h-36 overflow-y-auto pr-1">
                          <div className="space-y-2">
                            {touchpoints.map((tp) => {
                              const dateValue = resolvedTouchpointDate(tp);
                              return (
                                <div
                                  key={tp}
                                  className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1"
                                >
                                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--color-text)]">
                                    {tp}
                                  </span>
                                  <div className="relative">
                                    <input
                                      ref={(el) => {
                                        touchpointDateRefs.current[tp] = el;
                                      }}
                                      type="date"
                                      className="input input-date h-8 w-[140px] pr-9 text-xs"
                                      value={dateValue}
                                      onChange={(e) => {
                                        const nextVal = e.target.value;
                                        setTouchpointDates((prev) => {
                                          if (!nextVal || nextVal === sendDate) {
                                            const next = { ...prev };
                                            delete next[tp];
                                            return next;
                                          }
                                          return { ...prev, [tp]: nextVal };
                                        });
                                      }}
                                      onClick={() => openTouchpointDatePicker(tp)}
                                    />
                                    <button
                                      type="button"
                                      className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]"
                                      aria-label={`Open calendar for ${tp}`}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        openTouchpointDatePicker(tp);
                                      }}
                                    >
                                      <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="h-4 w-4"
                                      >
                                        <path d="M8 2v4" />
                                        <path d="M16 2v4" />
                                        <path d="M3 10h18" />
                                        <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      ) : (
                        <p className="text-[11px] text-[color:var(--color-text)]/60">
                          Sending date above applies to all selected touchpoints.
                        </p>
                      )
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-[color:var(--color-text)]/70">
                      Variants (optional)
                    </label>
                    <textarea
                      className="input min-h-[120px] w-full resize-none"
                      value={variantsInput}
                      onChange={(e) => setVariantsInput(e.target.value)}
                      placeholder="A, B"
                    />
                    <p className="text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty for a single variant.{" "}
                      {variants.length > 0 ? `${variants.length} variant(s) parsed.` : "Default: A."}
                    </p>
                  </div>
                </div>
              </div>

              {false && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex h-[220px] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 p-3">
                    <div className="text-xs font-semibold text-[color:var(--color-text)]">Markets</div>
                    <div className="mt-2 relative">
                      <div
                        className={`input flex min-h-[42px] max-h-[92px] overflow-y-auto flex-wrap items-center gap-2 pr-16 transition-opacity duration-200 ${
                          brand ? "opacity-100" : "opacity-80"
                        }`}
                      >
                        {markets.map((m) => (
                          <span
                            key={m}
                            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
                          >
                            {m}
                            <button
                              type="button"
                              className="text-[color:var(--color-text)]/50 hover:text-[color:var(--color-text)]/80"
                              onClick={() =>
                                setSelectedMarkets((prev) => prev.filter((x) => x !== m))
                              }
                              disabled={!brand}
                            >
                              x
                            </button>
                          </span>
                        ))}
                        <input
                          className="h-8 flex-1 min-w-[120px] bg-transparent outline-none"
                          placeholder={brand ? "Search or add markets (AU, NZ...)" : ""}
                          value={marketsSearch}
                          onChange={(e) => setMarketsSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = normalizeMarket(marketsSearch);
                              if (!val) return;
                              setSelectedMarkets((prev) =>
                                prev.includes(val) ? prev : [...prev, val],
                              );
                              setMarketsSearch("");
                            }
                          }}
                          disabled={!brand}
                        />
                      </div>

                      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-text)]/60">
                        {markets.length} selected
                      </span>

                      <div
                        className={`absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-[color:var(--color-surface)]/70 text-xs text-[color:var(--color-text)]/70 backdrop-blur-sm transition-all duration-200 ${
                          brand
                            ? "pointer-events-none translate-y-1 scale-95 opacity-0"
                            : "translate-y-0 scale-100 opacity-100"
                        }`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                        </svg>
                        <span>Select brand to enable</span>
                      </div>
                    </div>

                    <div className="mt-2 flex-1 overflow-y-auto pr-1">
                      {brand ? (
                        <div className="flex flex-wrap gap-2">
                          {brandMarkets
                            .filter((m) =>
                              marketsSearch
                                ? m.toLowerCase().includes(marketsSearch.toLowerCase())
                                : true,
                            )
                            .map((m) => {
                              const selected = markets.includes(m);
                              return (
                                <button
                                  type="button"
                                  key={m}
                                  className={
                                    "rounded-full border px-3 py-1 text-xs transition " +
                                    (selected
                                      ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]"
                                      : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-primary)]/40")
                                  }
                                  onClick={() =>
                                    setSelectedMarkets((prev) =>
                                      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                                    )
                                  }
                                >
                                  {m}
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-xs text-[color:var(--color-text)]/60">
                          Select brand to enable markets.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex h-[220px] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 p-3">
                    <div className="text-xs font-semibold text-[color:var(--color-text)]">
                      Segments (optional)
                    </div>
                    <div className="mt-2 relative">
                      <div
                        className={`input flex min-h-[42px] max-h-[92px] overflow-y-auto flex-wrap items-center gap-2 pr-16 transition-opacity duration-200 ${
                          brand ? "opacity-100" : "opacity-80"
                        }`}
                      >
                        {segments.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
                          >
                            {s}
                            <button
                              type="button"
                              className="text-[color:var(--color-text)]/50 hover:text-[color:var(--color-text)]/80"
                              onClick={() =>
                                setSelectedSegments((prev) => prev.filter((x) => x !== s))
                              }
                              disabled={!brand}
                            >
                              x
                            </button>
                          </span>
                        ))}
                        <input
                          className="h-8 flex-1 min-w-[120px] bg-transparent outline-none"
                          placeholder={brand ? "Search or add segments" : ""}
                          value={segmentsSearch}
                          onChange={(e) => setSegmentsSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = normalizeSegment(segmentsSearch);
                              if (!val) return;
                              setSelectedSegments((prev) =>
                                prev.includes(val) ? prev : [...prev, val],
                              );
                              setSegmentsSearch("");
                            }
                          }}
                          disabled={!brand}
                        />
                      </div>

                      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-text)]/60">
                        {segments.length} selected
                      </span>

                      <div
                        className={`absolute inset-0 flex items-center justify-center gap-2 rounded-md bg-[color:var(--color-surface)]/70 text-xs text-[color:var(--color-text)]/70 backdrop-blur-sm transition-all duration-200 ${
                          brand
                            ? "pointer-events-none translate-y-1 scale-95 opacity-0"
                            : "translate-y-0 scale-100 opacity-100"
                        }`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                        >
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                        </svg>
                        <span>Select brand to enable</span>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty to avoid splitting by segment.
                    </p>

                    <div className="mt-2 flex-1 overflow-y-auto pr-1">
                      {brand ? (
                        <div className="flex flex-wrap gap-2">
                          {brandSegments
                            .filter((s) =>
                              segmentsSearch
                                ? s.toLowerCase().includes(segmentsSearch.toLowerCase())
                                : true,
                            )
                            .map((s) => {
                              const selected = segments.includes(s);
                              return (
                                <button
                                  type="button"
                                  key={s}
                                  className={
                                    "rounded-full border px-3 py-1 text-xs transition " +
                                    (selected
                                      ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]"
                                      : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-primary)]/40")
                                  }
                                  onClick={() =>
                                    setSelectedSegments((prev) =>
                                      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
                                    )
                                  }
                                >
                                  {s}
                                </button>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-xs text-[color:var(--color-text)]/60">
                          Select brand to enable segments.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex h-[220px] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 p-3">
                    <div className="text-xs font-semibold text-[color:var(--color-text)]">
                      Touchpoints
                    </div>

                    <div className="mt-2 relative">
                      <div className="input flex min-h-[42px] max-h-[92px] overflow-y-auto flex-wrap items-center gap-2 pr-16">
                        {touchpoints.map((tp) => (
                          <span
                            key={tp}
                            className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
                          >
                            {tp}
                            <button
                              type="button"
                              className="text-[color:var(--color-text)]/50 hover:text-[color:var(--color-text)]/80"
                              onClick={() => removeTouchpoint(tp)}
                            >
                              x
                            </button>
                          </span>
                        ))}
                        <input
                          className="h-8 flex-1 min-w-[120px] bg-transparent outline-none"
                          placeholder="Search or add touchpoints"
                          value={touchpointsSearch}
                          onChange={(e) => setTouchpointsSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const val = touchpointsSearch.trim();
                              if (!val) return;
                              setSelectedTouchpoints((prev) =>
                                prev.includes(val) ? prev : [...prev, val],
                              );
                              setTouchpointsSearch("");
                            }
                          }}
                        />
                      </div>

                      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[color:var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--color-text)]/60">
                        {touchpoints.length} selected
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {["Launch", "Repush", "Last Call"]
                        .filter((t) =>
                          touchpointsSearch
                            ? t.toLowerCase().includes(touchpointsSearch.toLowerCase())
                            : true,
                        )
                        .map((t) => {
                          const selected = touchpoints.includes(t);
                          return (
                            <button
                              type="button"
                              key={t}
                              className={
                                "rounded-full border px-3 py-1 text-xs transition " +
                                (selected
                                  ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary)]/10 text-[color:var(--color-text)]"
                                  : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-primary)]/40")
                              }
                              onClick={() => toggleTouchpoint(t)}
                            >
                              {t}
                            </button>
                          );
                        })}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[color:var(--color-text)]/70">
                      <span>Send date per touchpoint (defaults to Sending date above).</span>
                      {Object.keys(touchpointDates).length > 0 ? (
                        <button
                          type="button"
                          className="text-[color:var(--color-primary)] underline-offset-2 hover:underline"
                          onClick={() => setTouchpointDates({})}
                        >
                          Reset overrides
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-2 flex-1 overflow-y-auto pr-1">
                      {touchpoints.length ? (
                        <div className="space-y-2">
                          {touchpoints.map((tp) => {
                            const dateValue = resolvedTouchpointDate(tp);
                            return (
                              <div
                                key={tp}
                                className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1"
                              >
                                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[color:var(--color-text)]">
                                  {tp}
                                </span>
                                <div className="relative">
                                  <input
                                    ref={(el) => {
                                      touchpointDateRefs.current[tp] = el;
                                    }}
                                    type="date"
                                    className="input input-date h-8 w-[140px] pr-9 text-xs"
                                    value={dateValue}
                                    onChange={(e) => {
                                      const nextVal = e.target.value;
                                      setTouchpointDates((prev) => {
                                        if (!nextVal || nextVal === sendDate) {
                                          const next = { ...prev };
                                          delete next[tp];
                                          return next;
                                        }
                                        return { ...prev, [tp]: nextVal };
                                      });
                                    }}
                                    onClick={() => openTouchpointDatePicker(tp)}
                                  />
                                  <button
                                    type="button"
                                    className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--color-text)]/70 hover:bg-[color:var(--color-surface-2)]/60 hover:text-[color:var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-primary)]"
                                    aria-label={`Choose date for ${tp}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openTouchpointDatePicker(tp);
                                    }}
                                  >
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="h-4 w-4"
                                    >
                                      <path d="M8 2v4" />
                                      <path d="M16 2v4" />
                                      <path d="M3 10h18" />
                                      <path d="M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-[color:var(--color-text)]/60">
                          At least one touchpoint is required.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex h-[220px] flex-col overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 p-3">
                    <div className="text-xs font-semibold text-[color:var(--color-text)]">
                      Variants (optional)
                    </div>
                    <textarea
                      className="input mt-2 min-h-0 flex-1 w-full resize-none"
                      value={variantsInput}
                      onChange={(e) => setVariantsInput(e.target.value)}
                      placeholder="A, B"
                    />
                    <p className="mt-2 text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty for a single variant.{" "}
                      {variants.length > 0 ? `${variants.length} variant(s) parsed.` : "Default: A."}
                    </p>
                  </div>
                </div>
              </div>
              )}
            </section>
            ) : null}

            <div className="-mx-5 mt-2 border-t border-[color:var(--color-border)]/60 px-5 pt-3">
              <div className="flex items-center justify-between gap-3">
                {activeSubtab === "audience" ? (
                  <div
                    className="inline-flex items-center gap-2 text-[11px] tabular-nums text-[color:var(--color-text)]/60"
                    title={`Rows: ${rowsCount} (${markets.length} markets x ${touchpoints.length} touchpoints x ${effectiveSegments.length} segments x ${effectiveVariants.length} variants)`}
                  >
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)]/60 px-2 py-1">
                      Rows:{" "}
                      <strong className="text-[color:var(--color-text)]/80">{rowsCount}</strong>
                    </span>
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  {activeSubtab === "audience" ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setActiveSubtab("basics")}
                      disabled={submitting}
                    >
                      Back
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={onClose}
                    disabled={submitting}
                  >
                    Cancel
                  </button>

                  {activeSubtab === "basics" ? (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={submitting || !canProceedToAudience}
                      onClick={() => setActiveSubtab("audience")}
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={submitting || rowsCount === 0 || !canGenerate}
                      onClick={handleSubmit}
                    >
                      {submitting ? "Generating..." : "Generate"}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {submitError ? (
              <div className="mt-3 rounded-md border border-[color:var(--color-accent)]/50 bg-[color:var(--color-surface)] p-2 text-xs text-[color:var(--color-accent)] shadow-sm">
                {submitError}
              </div>
            ) : null}
          </div>
      </div>

    </MiniModal>

  );

}
