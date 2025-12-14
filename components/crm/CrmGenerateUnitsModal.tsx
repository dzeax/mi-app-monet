"use client";



import { useEffect, useMemo, useRef, useState } from "react";

import MiniModal from "@/components/ui/MiniModal";

import { showError, showSuccess } from "@/utils/toast";

import { TIME_PROFILES } from "@/lib/crm/timeProfiles";



const BRAND_MARKETS: Record<string, string[]> = {

  Europcar: ["COM", "AU", "NZ", "FR", "IE", "PT", "ES", "IT", "DE", "NO", "UK", "NL", "BE", "BF", "BN"],

  Goldcar: ["EN", "IT", "FR", "ES", "DE", "PT"],

};



const BRAND_SEGMENTS: Record<string, string[]> = {

  Europcar: ["Publics", "Privilege"],

  Goldcar: ["Users", "Clubbers"],

};



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



export default function CrmGenerateUnitsModal({ clientSlug, onClose }: Props) {

  const [step, setStep] = useState<1 | 2>(1);



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
  const sendDateInputRef = useRef<HTMLInputElement | null>(null);
  const touchpointDateRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);


  useEffect(() => {

    let active = true;

    const loadOwners = async () => {

      try {

        const res = await fetch(`/api/crm/catalogs?client=${clientSlug}&kind=owner`);

        const body = await res.json().catch(() => null);

        if (res.ok && Array.isArray(body?.items) && active) {

          const labels = body.items
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



  const canProceedStep1 =
    jiraTicket.trim().length > 0 &&
    campaignName.trim().length > 0 &&
    brand.trim().length > 0 &&
    owner.trim().length > 0 &&
    sendDate.trim().length === 10 &&
    markets.length > 0 &&
    touchpoints.length > 0;



  const handleFetchJira = async () => {

    const ticket = jiraTicket.trim();

    if (!ticket) {

      setJiraError("Please enter a JIRA ticket key.");

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
    if (!canProceedStep1) return;
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
      title="Generate campaign email units"
    >
      <div className="space-y-4 text-sm text-[color:var(--color-text)]">
        {step === 1 ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-xl bg-[color:var(--color-surface-2)]/70 px-3 py-2 text-xs text-[color:var(--color-text)]/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[color:var(--color-text)]/70">
                  <button
                    type="button"
                    className={`font-semibold hover:text-[color:var(--color-text)] ${
                      activeSubtab === "basics" ? "text-[color:var(--color-text)]" : ""
                    }`}
                    onClick={() => setActiveSubtab("basics")}
                  >
                    1/2 Basics
                  </button>
                  <button
                    type="button"
                    className={`font-semibold hover:text-[color:var(--color-text)] ${
                      activeSubtab === "audience" ? "text-[color:var(--color-text)]" : ""
                    }`}
                    onClick={() => setActiveSubtab("audience")}
                  >
                    2/2 Audience & sends
                  </button>
                </div>
                <span className="text-[color:var(--color-text)]/60">
                  Client: <strong className="text-[color:var(--color-text)]">{clientSlug.toUpperCase()}</strong>
                </span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-[color:var(--color-border)]/60">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-[color:var(--color-accent)] transition-all"
                  style={{ width: activeSubtab === "audience" ? "100%" : "50%" }}
                />
              </div>
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
                        className="input h-9 w-full pr-10"
                        placeholder="CRM-1701"
                        value={jiraTicket}
                        onChange={(e) => setJiraTicket(e.target.value)}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md transition hover:bg-[color:var(--color-surface-2)]/60 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={handleFetchJira}
                        disabled={loadingJira || !jiraTicket.trim()}
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
                        if (BRAND_MARKETS[next]) {
                          setSelectedMarkets(BRAND_MARKETS[next]);
                        } else setSelectedMarkets([]);
                        if (BRAND_SEGMENTS[next]) setSelectedSegments(BRAND_SEGMENTS[next]);
                        else setSelectedSegments([]);
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
                    <input
                      list="crm-generate-owners"
                      className="input h-9 w-full placeholder:text-[12px]"
                      placeholder="Who builds these emails?"
                      inputMode="text"
                      value={owner}
                      onChange={(e) => setOwner(e.target.value)}
                    />
                    {ownersCatalog.length > 0 ? (
                      <datalist id="crm-generate-owners">
                        {ownersCatalog.map((o) => (
                          <option key={o} value={o} />
                        ))}
                      </datalist>
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
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-sm opacity-70 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
                      aria-label="Open calendar"
                      onClick={openDatePicker}
                    >
                      Cal
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[color:var(--color-text)]">
                      Markets
                    </label>
                    <div className="input flex min-h-[42px] flex-wrap items-center gap-2">
                      {markets.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
                        >
                          {m}
                          <button
                            type="button"
                            className="text-[color:var(--color-accent)]"
                            onClick={() => setSelectedMarkets((prev) => prev.filter((x) => x !== m))}
                          >
                            x
                          </button>
                        </span>
                      ))}
                      <input
                        className="h-8 flex-1 min-w-[120px] bg-transparent outline-none"
                        placeholder={brand ? "Search or add markets (AU, NZ...)" : "Select a brand first"}
                        value={marketsSearch}
                        onChange={(e) => setMarketsSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = normalizeMarket(marketsSearch);
                            if (!val) return;
                            setSelectedMarkets((prev) => (prev.includes(val) ? prev : [...prev, val]));
                            setMarketsSearch("");
                          }
                        }}
                        disabled={!brand}
                      />
                    </div>
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
                                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-text)]"
                                    : "border-[color:var(--color-border)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-accent)]")
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
                        Select a brand to load the available markets.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[color:var(--color-text)]">
                      Segments (optional)
                    </label>
                    <div className="input flex min-h-[42px] flex-wrap items-center gap-2">
                      {segments.map((s) => (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
                        >
                          {s}
                          <button
                            type="button"
                            className="text-[color:var(--color-accent)]"
                            onClick={() =>
                              setSelectedSegments((prev) => prev.filter((x) => x !== s))
                            }
                          >
                            x
                          </button>
                        </span>
                      ))}
                      <input
                        className="h-8 flex-1 min-w-[120px] bg-transparent outline-none"
                        placeholder={brand ? "Search or add segments" : "Select a brand first"}
                        value={segmentsSearch}
                        onChange={(e) => setSegmentsSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = normalizeSegment(segmentsSearch);
                            if (!val) return;
                            setSelectedSegments((prev) => (prev.includes(val) ? prev : [...prev, val]));
                            setSegmentsSearch("");
                          }
                        }}
                        disabled={!brand}
                      />
                    </div>
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
                                    ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-text)]"
                                    : "border-[color:var(--color-border)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-accent)]")
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
                        Select a brand to load the available segments.
                      </p>
                    )}
                    <p className="text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty to avoid splitting by segment. Selected: {segments.length}.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[color:var(--color-text)]">
                      Touchpoints
                    </label>
                    <div className="input flex min-h-[42px] flex-wrap items-center gap-2">
                      {touchpoints.map((tp) => (
                        <span
                          key={tp}
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
                        >
                          {tp}
                          <button
                            type="button"
                            className="text-[color:var(--color-accent)]"
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
                    <div className="flex flex-wrap gap-2">
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
                                  ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-text)]"
                                  : "border-[color:var(--color-border)] text-[color:var(--color-text)]/80 hover:border-[color:var(--color-accent)]")
                              }
                              onClick={() => toggleTouchpoint(t)}
                            >
                              {t}
                            </button>
                          );
                        })}
                    </div>
                    {touchpoints.length ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[color:var(--color-text)]/70">
                          <span>Send date per touchpoint (defaults to Sending date above).</span>
                          {Object.keys(touchpointDates).length > 0 ? (
                            <button
                              type="button"
                              className="text-[color:var(--color-accent)] underline-offset-2 hover:underline"
                              onClick={() => setTouchpointDates({})}
                            >
                              Reset overrides
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {touchpoints.map((tp) => {
                            const dateValue = resolvedTouchpointDate(tp);
                            return (
                              <div
                                key={tp}
                                className="flex items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1"
                              >
                                <span className="text-xs font-semibold text-[color:var(--color-text)]">
                                  {tp}
                                </span>
                                <div className="relative">
                                  <input
                                    ref={(el) => {
                                      touchpointDateRefs.current[tp] = el;
                                    }}
                                    type="date"
                                    className="input h-8 w-[140px] pr-8 text-xs"
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
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[13px] opacity-70 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
                                    aria-label={`Choose date for ${tp}`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      openTouchpointDatePicker(tp);
                                    }}
                                  >
                                    Cal
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  className="text-[color:var(--color-accent)]"
                                  onClick={() => removeTouchpoint(tp)}
                                  aria-label={`Remove ${tp}`}
                                >
                                  x
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[color:var(--color-text)]/60">
                        At least one touchpoint is required.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--color-text)]">
                      Variants (optional)
                    </label>
                    <textarea
                      className="input min-h-[80px] w-full"
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
            </section>
            ) : null}

            <div className="flex justify-between items-center pt-2">

              <button

                type="button"

                className="btn-ghost"

                onClick={() => setStep(1)}

                disabled={submitting}

              >

                Back

              </button>

              <div className="flex gap-2">

                <button

                  type="button"

                  className="btn-ghost"

                  onClick={onClose}

                  disabled={submitting}

                >

                  Cancel

                </button>

                <button

                  type="button"

                  className="btn-primary"

                  disabled={submitting || rowsCount === 0 || !canProceedStep1}

                  onClick={handleSubmit}

                >

                  {submitting ? "Generating..." : "Generate units"}

                </button>

              </div>

            </div>
            {submitError ? (
              <div className="mt-3 rounded-md border border-[color:var(--color-accent)]/50 bg-[color:var(--color-surface)] p-2 text-xs text-[color:var(--color-accent)] shadow-sm">
                {submitError}
              </div>
            ) : null}
          </div>

        ) : null}

      </div>

    </MiniModal>

  );

}
