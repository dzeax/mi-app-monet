"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MiniModal from "@/components/ui/MiniModal";
import { showError, showSuccess } from "@/utils/toast";

type Rule = {
  id?: string;
  priority: number;
  brand: string;
  scope: string;
  touchpoint: string;
  markets: string;
  hours_master_template: number;
  hours_translations: number;
  hours_copywriting: number;
  hours_assets: number;
  hours_revisions: number;
  hours_build: number;
  hours_prep: number;
  hours_prep_mode: "fixed" | "percent";
  hours_prep_percent: number;
  active: boolean;
};

type ApiRule = Partial<Rule> & {
  markets: string[] | null;
};

type Props = {
  clientSlug: string;
  onClose: () => void;
};

const emptyRule = (priority: number): Rule => ({
  priority,
  brand: "",
  scope: "",
  touchpoint: "",
  markets: "",
  hours_master_template: 0,
  hours_translations: 0,
  hours_copywriting: 0,
  hours_assets: 0,
  hours_revisions: 0,
  hours_build: 0,
  hours_prep: 0,
  hours_prep_mode: "fixed",
  hours_prep_percent: 0,
  active: true,
});

const parseList = (val: string) =>
  val
    .split(/[,\s]+/)
    .map((m) => m.trim())
    .filter(Boolean);

const parseMarkets = (val: string) => parseList(val);
const parseTouchpoints = (val: string) => {
  const parts = val.split(",").map((t) => t.trim()).filter(Boolean);
  return Array.from(new Set(parts));
};

const MARKET_BY_BRAND: Record<string, string[]> = {
  Europcar: ["COM", "AU", "NZ", "FR", "IE", "PT", "ES", "IT", "DE", "NO", "UK", "NL", "BE", "BF", "BN"],
  Goldcar: ["EN", "IT", "FR", "ES", "DE", "PT"],
};

const BRAND_OPTIONS = ["", "Europcar", "Goldcar"];
const SCOPE_OPTIONS = ["", "Global", "Local"];
const TOUCHPOINT_OPTIONS = ["Launch", "Repush", "Last Call"];

const getMarketsForBrand = (brand: string) => {
  const opts = MARKET_BY_BRAND[brand];
  if (opts && Array.isArray(opts)) return opts;
  // Fallback: all known markets if no brand (wildcard)
  return Array.from(new Set(Object.values(MARKET_BY_BRAND).flat())).sort();
};

const baseHours = (r: Rule) =>
  r.hours_master_template +
  r.hours_translations +
  r.hours_copywriting +
  r.hours_assets +
  r.hours_revisions +
  r.hours_build;

const prepEffective = (r: Rule) => {
  if (r.hours_prep_mode === "percent") {
    const percent = Number(r.hours_prep_percent ?? 0);
    return Number(((baseHours(r) * percent) / 100).toFixed(2));
  }
  return r.hours_prep;
};

const totalHours = (r: Rule) => baseHours(r) + prepEffective(r);

const toNumber = (value: string) => {
  const normalized = value.replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
};
const DECIMAL_RE = /^[0-9]*[.,]?[0-9]*$/;

const MarketsSelect = ({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (vals: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const allSelected = values.length === options.length && options.length > 0;
  const display =
    values.length === 0
      ? "Select market"
      : values.length <= 3
      ? values.join(", ")
      : `${values.length} selected`;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase to ensure we hear the event even if it stops bubbling
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, []);

  const toggle = (val: string) => {
    if (values.includes(val)) onChange(values.filter((v) => v !== val));
    else onChange([...values, val]);
  };

  return (
    <div className="relative" ref={ref}>
      <label className="text-[11px] text-[color:var(--color-text)]/70">{label}</label>
      <button
        type="button"
        className="input flex h-9 w-full items-center justify-between px-2 text-left text-xs"
        onClick={() => setOpen((v) => !v)}
        title={display}
      >
        <span className="truncate">{display}</span>
        <span
          aria-hidden="true"
          className="ml-2 inline-block h-2 w-2 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[color:var(--color-text)]/70"
        />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
          <button
            className="block w-full px-3 py-2 text-left text-xs hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              if (allSelected) onChange([]);
              else onChange([...options]);
            }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <div className="max-h-48 overflow-auto">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-[color:var(--color-surface-2)]"
              >
                <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
                <span className="flex-1">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const TouchpointsSelect = ({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (vals: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const allSelected = values.length === options.length && options.length > 0;
  const display =
    values.length === 0
      ? "Select touchpoint"
      : values.length <= 3
      ? values.join(", ")
      : `${values.length} selected`;

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("touchstart", handler, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("touchstart", handler, true);
    };
  }, []);

  const toggle = (val: string) => {
    if (values.includes(val)) onChange(values.filter((v) => v !== val));
    else onChange([...values, val]);
  };

  return (
    <div className="relative" ref={ref}>
      <label className="text-[11px] text-[color:var(--color-text)]/70">{label}</label>
      <button
        type="button"
        className="input flex h-9 w-full items-center justify-between px-2 text-left text-xs"
        onClick={() => setOpen((v) => !v)}
        title={display}
      >
        <span className="truncate">{display}</span>
        <span
          aria-hidden="true"
          className="ml-2 inline-block h-2 w-2 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[color:var(--color-text)]/70"
        />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-lg">
          <button
            className="block w-full px-3 py-2 text-left text-xs hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              if (allSelected) onChange([]);
              else onChange([...options]);
            }}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
          <div className="max-h-48 overflow-auto">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs hover:bg-[color:var(--color-surface-2)]"
              >
                <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
                <span className="flex-1">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default function CrmEffortRulesModal({ clientSlug, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [inputBuffer, setInputBuffer] = useState<Record<number, Record<string, string>>>({});
  const [openRuleId, setOpenRuleId] = useState<string | number | null>(null);
  const [savingRuleId, setSavingRuleId] = useState<string | number | null>(null);
  const [ruleNotices, setRuleNotices] = useState<
    Record<string | number, { type: "success" | "error"; text: string }>
  >({});

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/effort-rules?client=${encodeURIComponent(clientSlug)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed (${res.status})`);
      const mapped = ((body?.rules ?? []) as ApiRule[]).map((r) => {
        const hoursPrepMode =
          (r as ApiRule & { hours_prep_mode?: string }).hours_prep_mode === "percent" ? "percent" : "fixed";
        const hoursPrepPercent = Number(
          (r as ApiRule & { hours_prep_percent?: number }).hours_prep_percent ?? 0,
        );
        const baseRule: Rule = {
          id: r.id,
          priority: Number(r.priority ?? 100),
          brand: r.brand || "",
          scope: r.scope || "",
          touchpoint: r.touchpoint || "",
          markets: Array.isArray(r.markets) ? r.markets.join(", ") : "",
          hours_master_template: Number(r.hours_master_template ?? 0),
          hours_translations: Number(r.hours_translations ?? 0),
          hours_copywriting: Number(r.hours_copywriting ?? 0),
          hours_assets: Number(r.hours_assets ?? 0),
          hours_revisions: Number(r.hours_revisions ?? 0),
          hours_build: Number(r.hours_build ?? 0),
          hours_prep: Number(r.hours_prep ?? 0),
          hours_prep_mode: hoursPrepMode,
          hours_prep_percent: hoursPrepPercent,
          active: r.active ?? true,
        };
        return baseRule;
      });
      const withDerived = mapped.map((r) => {
        const base = baseHours(r);
        const derivedPct = base > 0 ? Number(((r.hours_prep ?? 0) / base) * 100) : 0;
        return {
          ...r,
          hours_prep_mode: r.hours_prep_mode || "fixed",
          hours_prep_percent: r.hours_prep_percent || derivedPct,
        };
      });
      setRules(withDerived);
      setOpenRuleId(withDerived[0]?.id ?? null);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load effort rules");
    } finally {
      setLoading(false);
    }
  }, [clientSlug]);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const addRule = () => {
    const nextPriority = (rules[rules.length - 1]?.priority ?? 100) + 1;
    const newRule = emptyRule(nextPriority);
    const key = newRule.id ?? `new-${Date.now()}`;
    setRules((prev) => [...prev, newRule]);
    setOpenRuleId(key);
  };

  const updateRule = (idx: number, patch: Partial<Rule>) => {
    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const updateBuffer = (idx: number, key: string, val: string) => {
    setInputBuffer((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] || {}), [key]: val },
    }));
  };

  const getDisplayValue = (idx: number, key: string, fallback: number | string) => {
    const buffered = inputBuffer[idx]?.[key];
    if (buffered !== undefined) return buffered;
    return fallback === undefined || fallback === null ? "" : String(fallback);
  };

  const removeMarketFromRule = (idx: number, market: string) => {
    const existing = parseMarkets(rules[idx]?.markets || "");
    const next = existing.filter((m) => m !== market);
    updateRule(idx, { markets: next.join(", ") });
  };

  const removeTouchpointFromRule = (idx: number, touchpoint: string) => {
    const existing = parseTouchpoints(rules[idx]?.touchpoint || "");
    const next = existing.filter((t) => t !== touchpoint);
    updateRule(idx, { touchpoint: next.join(", ") });
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
    if (openRuleId && rules[idx]?.id === openRuleId) setOpenRuleId(null);
  };


  const saveRule = async (idx: number) => {
    const rule = rules[idx];
    if (!rule) return;
    const key = rule.id ?? idx;
    setSavingRuleId(key);
    setRuleNotices((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const payloadRule = {
        ...rule,
        markets: parseMarkets(rule.markets),
        hours_prep: prepEffective(rule),
      };
      const res = await fetch("/api/crm/effort-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: clientSlug, rules: [payloadRule] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Effort rules save failed", {
          status: res.status,
          statusText: res.statusText,
          body,
          payloadCount: 1,
        });
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      setRuleNotices((prev) => ({ ...prev, [key]: { type: "success" as const, text: "Saved" } }));
      showSuccess("Effort rule saved");
      await fetchRules();
    } catch (err) {
      console.error("Effort rules save error", err);
      const msg = err instanceof Error ? err.message : "Unable to save rules";
      showError(msg);
      setRuleNotices((prev) => ({ ...prev, [key]: { type: "error" as const, text: msg } }));
    } finally {
      setSavingRuleId(null);
    }
  };

  const sortedRules = useMemo(() => [...rules].sort((a, b) => a.priority - b.priority), [rules]);

  return (
    <MiniModal
      title="Effort rules"
      onClose={onClose}
      widthClass="w-full max-w-6xl"
      bodyClassName="max-h-[80vh] overflow-hidden"
    >
      <div className="flex flex-col gap-4 text-sm text-[color:var(--color-text)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-base font-semibold text-[color:var(--color-text)]">
              Brand / Scope / Touchpoint / Market to hours
            </p>
            <p className="text-[color:var(--color-text)]/70">
              Top priority wins. Blank fields act as wildcards.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost h-10 px-4"
            onClick={addRule}
            disabled={loading}
          >
            Add rule
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-auto pb-2">
          {!sortedRules.length && !loading ? (
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 text-center text-[color:var(--color-text)]/70">
              No rules yet. Add your first rule.
            </div>
          ) : null}


          
          {sortedRules.map((rule, idx) => {
            const key = rule.id ?? idx;
            const isOpen = openRuleId === key;
            const marketsList = parseMarkets(rule.markets);
            const marketsLabel = marketsList.length ? marketsList.join(", ") : "Any market";
            const touchpointsList = parseTouchpoints(rule.touchpoint);
            const touchpointsLabel = touchpointsList.length ? touchpointsList.join(", ") : "Any touchpoint";

            return (
              <div
                key={key}
                className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-sm"
              >
                <div
                  className="flex flex-wrap items-center gap-3 cursor-pointer"
                  onClick={() => setOpenRuleId(isOpen ? null : key)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[color:var(--color-text)]/60">Priority</span>
                    <input
                      className="input h-8 w-16 px-2 text-xs"
                      type="number"
                      value={rule.priority}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateRule(idx, { priority: Number(e.target.value || 0) })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[color:var(--color-text)]/60">Active</span>
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateRule(idx, { active: e.target.checked })}
                    />
                  </div>
                  <div className="flex-1 text-xs text-[color:var(--color-text)]/80 flex flex-wrap items-center gap-2">
                    <span>Brand: {rule.brand || "Any"}</span>
                    <span className="text-[color:var(--color-text)]/60">| Scope: {rule.scope || "Any"}</span>
                    <span className="text-[color:var(--color-text)]/60">| Touchpoint: {touchpointsLabel}</span>
                    <span className="text-[color:var(--color-text)]/60">| Markets: {marketsLabel}</span>
                    <span className="font-semibold">| {totalHours(rule).toFixed(2)}h ({(totalHours(rule) / 7).toFixed(2)}d)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ruleNotices[key] ? (
                      <span
                        className={`rounded-md px-2 py-1 text-[10px] ${
                          ruleNotices[key].type === "success"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {ruleNotices[key].text}
                      </span>
                    ) : null}
                    <button
                      className="btn-primary h-8 px-3 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        saveRule(idx);
                      }}
                      disabled={savingRuleId === key}
                    >
                      {savingRuleId === key ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="btn-ghost h-8 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenRuleId(isOpen ? null : key);
                      }}
                    >
                      {isOpen ? "Collapse" : "Expand"}
                    </button>
                    <button
                      className="btn-ghost h-8 px-2 text-xs text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRule(idx);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text)]/70">
                          Conditions
                        </p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-2">
                          <div>
                            <label className="text-[11px] text-[color:var(--color-text)]/70">Brand</label>
                            <div className="relative">
                              <select
                                className="input h-9 w-full pr-8 pl-2 text-xs appearance-none"
                                value={rule.brand}
                                onChange={(e) => updateRule(idx, { brand: e.target.value })}
                              >
                                {BRAND_OPTIONS.map((opt, i) => (
                                  <option key={opt || `placeholder-${i}`} value={opt}>
                                    {opt || "Select brand"}
                                  </option>
                                ))}
                              </select>
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute right-3 top-1/2 inline-block h-2 w-2 -translate-y-1/2 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[color:var(--color-text)]/70"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[11px] text-[color:var(--color-text)]/70">Scope</label>
                            <div className="relative">
                              <select
                                className="input h-9 w-full pr-8 pl-2 text-xs appearance-none"
                                value={rule.scope}
                                onChange={(e) => updateRule(idx, { scope: e.target.value })}
                              >
                                {SCOPE_OPTIONS.map((opt, i) => (
                                  <option key={opt || `placeholder-${i}`} value={opt}>
                                    {opt || "Select scope"}
                                  </option>
                                ))}
                              </select>
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute right-3 top-1/2 inline-block h-2 w-2 -translate-y-1/2 rotate-45 border-b-[2.5px] border-r-[2.5px] border-[color:var(--color-text)]/70"
                              />
                            </div>
                          </div>
                          <div>
                            <TouchpointsSelect
                              label="Touchpoint"
                              options={TOUCHPOINT_OPTIONS}
                              values={parseTouchpoints(rule.touchpoint)}
                              onChange={(vals) => updateRule(idx, { touchpoint: vals.join(", ") })}
                            />
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {parseTouchpoints(rule.touchpoint).map((t) => (
                                <span
                                  key={t}
                                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[10px]"
                                >
                                  {t}
                                  <button
                                    type="button"
                                    className="text-[color:var(--color-accent)]"
                                    onClick={() => removeTouchpointFromRule(idx, t)}
                                    aria-label={`Remove ${t}`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                              {!parseTouchpoints(rule.touchpoint).length ? (
                                <span className="text-[10px] text-[color:var(--color-text)]/50">No touchpoint (wildcard)</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-ghost h-7 px-2 text-[11px]"
                                  onClick={() => updateRule(idx, { touchpoint: "" })}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <MarketsSelect
                              label="Markets"
                              options={getMarketsForBrand(rule.brand)}
                              values={parseMarkets(rule.markets)}
                              onChange={(vals) => updateRule(idx, { markets: vals.join(", ") })}
                            />
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {parseMarkets(rule.markets).map((m) => (
                                <span
                                  key={m}
                                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-2 py-0.5 text-[10px]"
                                >
                                  {m}
                                  <button
                                    type="button"
                                    className="text-[color:var(--color-accent)]"
                                    onClick={() => removeMarketFromRule(idx, m)}
                                    aria-label={`Remove ${m}`}
                                  >
                                    x
                                  </button>
                                </span>
                              ))}
                              {!parseMarkets(rule.markets).length ? (
                                <span className="text-[10px] text-[color:var(--color-text)]/50">No markets (wildcard)</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-ghost h-7 px-2 text-[11px]"
                                  onClick={() => updateRule(idx, { markets: "" })}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-text)]/70">
                          Effort (hours)
                        </p>
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                          {(
                            [
                              { key: "hours_master_template", label: "H. Template" },
                              { key: "hours_translations", label: "H. Transl." },
                              { key: "hours_copywriting", label: "H. Copy" },
                              { key: "hours_assets", label: "H. Assets" },
                              { key: "hours_revisions", label: "H. Revis." },
                              { key: "hours_build", label: "H. Build" },
                            ] as const
                          ).map((field) => (
                            <div key={field.key}>
                              <label className="text-[11px] text-[color:var(--color-text)]/70">{field.label}</label>
                              <input
                                className="input h-9 w-full px-2 text-xs"
                                type="text"
                                inputMode="decimal"
                                value={getDisplayValue(idx, field.key, rule[field.key])}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (next === "" || DECIMAL_RE.test(next)) {
                                    updateRule(idx, { [field.key]: toNumber(next || "0") } as Partial<Rule>);
                                    updateBuffer(idx, field.key, next);
                                  }
                                }}
                              />
                            </div>
                          ))}
                          <div className="lg:col-span-1 col-span-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] text-[color:var(--color-text)]/70">H. Prep</label>
                              <div className="flex rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] overflow-hidden">
                                {["fixed", "percent"].map((mode) => (
                                  <button
                                    key={mode}
                                    type="button"
                                    className={`px-3 py-1 text-[10px] transition ${
                                      rule.hours_prep_mode === mode
                                        ? "bg-[color:var(--color-accent)]/10 font-semibold text-[color:var(--color-text)]"
                                        : "text-[color:var(--color-text)]/60"
                                    }`}
                                    onClick={() =>
                                      updateRule(idx, {
                                        hours_prep_mode: mode as "fixed" | "percent",
                                      })
                                    }
                                  >
                                    {mode === "fixed" ? "Hours" : "%"}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {rule.hours_prep_mode === "percent" ? (
                              <div className="space-y-1">
                                <div className="relative">
                                  <input
                                    className="input h-9 w-full pr-6 pl-2 text-xs"
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.,]?[0-9]*"
                                    value={getDisplayValue(idx, "hours_prep_percent", rule.hours_prep_percent ?? "")}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      if (next === "" || DECIMAL_RE.test(next)) {
                                        updateRule(idx, { hours_prep_percent: toNumber(next || "0") });
                                        updateBuffer(idx, "hours_prep_percent", next);
                                      }
                                    }}
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--color-text)]/60">
                                    %
                                  </span>
                                </div>
                                <p className="text-[11px] text-[color:var(--color-text)]/60">
                                  Effective: {prepEffective(rule).toFixed(2)}h (base {baseHours(rule).toFixed(2)}h)
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="relative">
                                  <input
                                    className="input h-9 w-full pr-6 pl-2 text-xs"
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.,]?[0-9]*"
                                    value={getDisplayValue(idx, "hours_prep", rule.hours_prep ?? "")}
                                    onChange={(e) => {
                                      const next = e.target.value;
                                      if (next === "" || DECIMAL_RE.test(next)) {
                                        updateRule(idx, { hours_prep: toNumber(next || "0") });
                                        updateBuffer(idx, "hours_prep", next);
                                      }
                                    }}
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[color:var(--color-text)]/60">
                                    h
                                  </span>
                                </div>
                                <p className="text-[11px] text-[color:var(--color-text)]/60">
                                  ~ {baseHours(rule) > 0 ? ((rule.hours_prep / baseHours(rule)) * 100).toFixed(0) : "0"}% of base {baseHours(rule).toFixed(2)}h
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[color:var(--color-text)]/70">
                          <span>Total hours: {totalHours(rule).toFixed(2)}</span>
                          <span>Days (@7h): {(totalHours(rule) / 7).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </MiniModal>
  );
}
