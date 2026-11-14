/* Master — rubrique « Données » : séries hors cours de bourse (OpenBB : CFTC, JODI…). Lecture seule, aussi en ligne. */
(() => {
  "use strict";
  const state = { name: null, charts: [] };

  async function viewDonnees(root) {
    const U = window.MASTER_UI;
    state.charts.forEach((c) => c.remove()); state.charts = [];
    const cat = await U.api("/api/series");
    const names = Object.keys(cat);
    root.append(U.pageHead({ crumbs: ["Marchés", "Données"], title: "Données",
      sub: "Séries publiques sans clé, récupérées par OpenBB : positions des spéculateurs sur le pétrole (CFTC) et exportations de brut des producteurs du Golfe (JODI)." }));
    if (!names.length) { root.append(U.callout("info", "Pas encore de données.", "La collecte OpenBB tourne une fois par jour.")); return; }
    if (!state.name || !cat[state.name]) state.name = names[0];
    const list = U.panel("Séries");
    list.body.append(U.table(names.map((n) => ({ n, ...cat[n] })), [["description", "Série"], ["points", "Points"],
      ["last", "Dernière valeur", (v) => (v ? `${U.nf1.format(v[1])} (${U.dmy(v[0])})` : "—")]],
      (r) => { state.name = r.n; window.dispatchEvent(new HashChangeEvent("hashchange")); }));
    root.append(list.el);
    const s = await U.api(`/api/series/${encodeURIComponent(state.name)}`);
    const p = U.panel(s.description, { sub: `Source : ${s.source} · ${s.points} points` });
    const box = U.el("div", "chart");
    box.style.height = "360px";
    p.body.append(box);
    root.append(p.el);
    if (window.LightweightCharts && s.rows.length) {
      const theme = U.chartTheme ? U.chartTheme() : {};
      const chart = LightweightCharts.createChart(box, { autoSize: true, ...theme,
        layout: { ...(theme.layout || {}), attributionLogo: true } });
      state.charts.push(chart);
      const line = chart.addSeries(LightweightCharts.LineSeries, { lineWidth: 2 });
      line.setData(s.rows.map(([d, v]) => ({ time: d, value: v })));
      chart.timeScale().fitContent();
    }
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { donnees: viewDonnees });
})();
