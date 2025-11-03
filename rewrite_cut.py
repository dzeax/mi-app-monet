import pathlib
path=pathlib.Path(r"components/campaign-planning/CampaignPlanningDrawer.tsx")
text=path.read_text(encoding='utf-8')
needle='              <section className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.06)]">\n'
pos=text.find(needle)
if pos==-1:
    raise SystemExit('needle not found')
path.write_text(text[:pos], encoding='utf-8')
