/* Master — Marchés, onglet « Prédictions » : probabilités des marchés de prédiction (Kalshi, argent réel ; Manifold,
 * argent fictif) sur la géopolitique, l'énergie et l'économie (le widget « Prediction markets » de SitDeck).
 * Données : /api/predictions (master/adapters/predictions.py). Une probabilité de marché n'est pas une information
 * confirmée : la page le dit. Tout texte passe par textContent ; liens https vers la fiche du marché.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const st = { q: "", src: "", sort: "volume" };
  const CHIPS = ["Iran", "Israel", "Hormuz", "oil", "Russia", "Ukraine", "China", "Taiwan", "Gaza", "ceasefire", "NATO", "recession", "Fed"];

  async function viewPredictions(root) {
    const ui = U();
    const { el, api } = ui;
    const d = await api("/api/predictions").catch(() => ({ items: [] }));
    const bar = el("div", "toolbar");
    const q = el("input"); q.type = "search"; q.placeholder = "Chercher (en anglais) : Iran, oil, Taiwan…"; q.value = st.q; q.setAttribute("aria-label", "Chercher un marché");
    const src = ui.seg([["", "Tous"], ["Kalshi", "Kalshi (argent réel)"], ["Manifold", "Manifold (fictif)"]], st.src, (v) => { st.src = v; draw(); }, "Source");
    const sort = ui.seg([["volume", "Plus échangés"], ["prob", "Plus probables"], ["close", "Échéance proche"]], st.sort, (v) => { st.sort = v; draw(); }, "Tri");
    bar.append(q, src, sort);
    const chips = el("div", "pr-chips");
    for (const c of CHIPS) { const b = el("button", "pr-chip", c); b.type = "button"; b.onclick = () => { q.value = st.q = st.q === c ? "" : c; draw(); }; chips.append(b); }
    const info = el("p", "muted", `${(d.items || []).length} marchés suivis · lus ${d.fetched_at ? ui.dmyhm(d.fetched_at) : "—"} UTC · ${d.note || ""}`);
    const grid = el("div", "pr-grid");
    root.append(bar, chips, info, grid);
    q.oninput = () => { st.q = q.value; draw(); };
    function draw() {
      const ws = st.q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
      const rows = (d.items || []).filter((x) => (!st.src || x.source === st.src) && ws.every((w) => `${x.event} ${x.question} ${x.outcome}`.toLowerCase().includes(w)))
        .sort((a, b) => (st.sort === "prob" ? b.prob - a.prob : st.sort === "close" ? String(a.close).localeCompare(String(b.close)) : (b.volume || 0) - (a.volume || 0)));
      grid.replaceChildren();
      for (const x of rows.slice(0, 120)) {
        const c = el(x.url ? "a" : "div", "card pr-card");
        if (x.url) { c.href = x.url; c.target = "_blank"; c.rel = "noopener noreferrer"; }
        const top = el("div", "pr-top");
        top.append(el("span", `tag ${x.money === "réel" ? "ok" : ""}`, `${x.source} · ${x.money === "réel" ? "argent réel" : "argent fictif"}`),
          el("span", "muted", x.close && !x.close.startsWith("2099") ? `échéance ${ui.dmy(x.close)}` : ""));
        const pct = Math.round(x.prob * 100);
        const gauge = el("div", "pr-gauge"); const fill = el("i"); fill.style.width = `${pct}%`; gauge.append(fill);
        c.append(top, el("p", "pr-event", x.event && x.event !== x.question ? x.event : ""), el("b", "pr-q", x.outcome && x.source === "Kalshi" && x.event ? `${x.outcome}` : x.question),
          el("div", "pr-prob", ""), gauge);
        c.querySelector(".pr-prob").append(el("b", null, `${pct} %`), el("span", "muted", x.volume ? ` · volume ${ui.nf0.format(x.volume)}${x.source === "Manifold" ? " M$" : " $"}` : ""));
        grid.append(c);
      }
      if (!rows.length) grid.append(el("p", "muted", "Aucun marché pour cette recherche."));
    }
    draw();
  }

  window.MASTER_PREDICTIONS = viewPredictions;
})();
