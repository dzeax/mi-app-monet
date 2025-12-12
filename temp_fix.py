import pathlib
p = pathlib.Path('components/crm/CrmGenerateUnitsModal.tsx')
text = p.read_text(encoding='utf-8')
start = text.index('{activeSubtab === "audience"')
footer = text.rfind('            <div className="flex justify-between items-center pt-2">')
prefix = text[:start]
suffix = text[footer:]
new_block = """
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
                  <input
                    type="date"
                    className="input input-date h-9 w-full"
                    value={sendDate}
                    onChange={(e) => setSendDate(e.target.value)}
                    title="Applied to all generated rows"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-[color:var(--color-text)]">
                        Markets
                      </label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => setSelectedMarkets(brandMarkets)}
                          disabled={!brand || brandMarkets.length === 0}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => setSelectedMarkets([])}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <input
                      className="input h-9 w-full"
                      placeholder={brand ? "Search or add markets (AU, NZ...)" : "Select a brand first"}
                      value={marketsSearch}
                      onChange={(e) => setMarketsSearch(e.target.value)}
                      disabled={!brand}
                    />
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
                    <div className="flex gap-2">
                      <input
                        className="input h-9 flex-1"
                        placeholder="Add custom market (e.g., MX)"
                        value={customMarket}
                        onChange={(e) => setCustomMarket(e.target.value.toUpperCase())}
                        disabled={!brand}
                      />
                      <button
                        type="button"
                        className="btn-ghost h-9 px-3 text-xs"
                        disabled={!brand}
                        onClick={() => {
                          const norm = normalizeMarket(customMarket);
                          if (!norm) return;
                          setSelectedMarkets((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
                          setCustomMarket("");
                        }}
                      >
                        Add
                      </button>
                    </div>
                    {markets.length ? (
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {markets.map((m) => (
                          <span
                            key={m}
                            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface)] px-2 py-0.5"
                          >
                            {m}
                            <button
                              type="button"
                              className="text-[color:var(--color-accent)]"
                              onClick={() =>
                                setSelectedMarkets((prev) => prev.filter((x) => x !== m))
                              }
                            >
                              x
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-[color:var(--color-text)]/60">
                        No markets selected. At least one is required.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-[color:var(--color-text)]">
                        Segments (optional)
                      </label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => setSelectedSegments(brandSegments)}
                          disabled={!brand || brandSegments.length === 0}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => setSelectedSegments([])}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <input
                      className="input h-9 w-full"
                      placeholder={brand ? "Search or add segments" : "Select a brand first"}
                      value={segmentsSearch}
                      onChange={(e) => setSegmentsSearch(e.target.value)}
                      disabled={!brand}
                    />
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
                    <div className="flex gap-2">
                      <input
                        className="input h-9 flex-1"
                        placeholder="Add custom segment"
                        value={customSegment}
                        onChange={(e) => setCustomSegment(e.target.value)}
                        disabled={!brand}
                      />
                    
                      <button
                        type="button"
                        className="btn-ghost h-9 px-3 text-xs"
                        disabled={!brand}
                        onClick={() => {
                          const norm = normalizeSegment(customSegment);
                          if (!norm) return;
                          setSelectedSegments((prev) =>
                            prev.includes(norm) ? prev : [...prev, norm],
                          );
                          setCustomSegment("");
                        }}
                      >
                        Add
                      </button>
                    </div>
                    <p className="text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty to avoid splitting by segment. Selected: {segments.length}.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-[color:var(--color-text)]">
                        Touchpoints
                      </label>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => setSelectedTouchpoints(["Launch", "Repush", "Last Call"])}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => setSelectedTouchpoints([])}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <input
                      className="input h-9 w-full"
                      placeholder="Search or add touchpoints"
                      value={touchpointsSearch}
                      onChange={(e) => setTouchpointsSearch(e.target.value)}
                    />
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
                              onClick={() =>
                                setSelectedTouchpoints((prev) =>
                                  prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                                )
                              }
                            >
                              {t}
                            </button>
                          );
                        })}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input h-9 flex-1"
                        placeholder="Add custom touchpoint"
                        value={customTouchpoint}
                        onChange={(e) => setCustomTouchpoint(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-ghost h-9 px-3 text-xs"
                        onClick={() => {
                          const norm = customTouchpoint.strip();
                          if not norm:
                            return
                          setSelectedTouchpoints((prev) => prev if norm in prev else prev + [norm])
                          setCustomTouchpoint("")
                        }}
                      >
                        Add
                      </button>
                    </div>
                    {touchpoints.length ? (
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {touchpoints.map((tp) => (
                          <span
                            key={tp}
                            className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface)] px-2 py-0.5"
                          >
                            {tp}
                            <button
                              type="button"
                              className="text-[color:var(--color-accent)]"
                              onClick={() =>
                                setSelectedTouchpoints((prev) => prev.filter((x) => x !== tp))
                              }
                            >
                              x
                            </button>
                          </span>
                        ))}
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
                      className="input min-h-[60px] w-full"
                      value={variantsInput}
                      onChange={(e) => setVariantsInput(e.target.value)}
                      placeholder="A, B"
                    />
                    <p className="text-[11px] text-[color:var(--color-text)]/60">
                      Leave empty for a single variant. {" "}
                      {variants.length > 0 ? ${variants.length} variant(s) parsed. : "Default: A."}
                    </p>
                  </div>
                </div>
              </div>
            </section>
            ) : null}

"""
p.write_text(prefix + new_block + suffix, encoding='utf-8')
