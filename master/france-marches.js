/* Master — onglet « Marchés » de la rubrique France politique (france.js).
   - CAC 40, grandes banques cotées et valeurs exposées aux décisions publiques, en base 100 (une seule échelle),
     annotés des signaux politiques (censure, 49.3, sondages, dissolution, notation) posés sur la courbe du CAC 40 ;
   - écart OAT-Bund (BCE, mensuel) et moyenne des sondages des quatre premiers, dans deux graphiques séparés ;
   - composition sourcée du panier, revues des agences de notation, liste des signaux transmis aux desks.
   Un mouvement simultané n'est pas une causalité ; aucune position n'est prise ici. */
(() => {
  "use strict";
  let U = null;
  // Lettre du marqueur et libellé de chaque type de signal (data.type des événements « signal_politique »).
  const TYPE = { censure: ["C", "Motion de censure"], "49.3": ["49", "49.3"], sondage: ["S", "Sondages"],
    tete: ["S", "Sondages (tête)"], dissolution: ["D", "Dissolution"], notation: ["N", "Notation"] };
  const GROUPE = { indice: "Indice", banques: "Banque", exposees: "Exposée" };
  const STATUT = { decision: "décision publiée", prevue: "revue prévue", non_relevee: "résultat non relevé" };
  const VIEWS = [["paniers", "Paniers"], ["banques", "Banques"], ["exposees", "Valeurs exposées"]];
  const NOTES = [["tous", "Tous les signaux"], ["sans_sondages", "Sans les sondages"], ["aucun", "Aucun"]];

  function link(text, href) {
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", null, text);
    const a = U.el("a", "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }
  function host(href) {
    try { return new URL(href).hostname.replace(/^www\./, ""); } catch { return "source"; }
  }
  function lines(box, series, names) {
    if (!window.LightweightCharts) return;
    const c = LightweightCharts.createChart(box, U.chartTheme());
    series.forEach(([id, pts], i) => {
      const s = c.addSeries(LightweightCharts.LineSeries, { color: U.cssVar(`--fr-l${(i % 8) + 1}`), lineWidth: 2, priceLineVisible: false, title: names[id] || id });
      const byDay = new Map(pts.map(([d, v]) => [d, v]));
      s.setData([...byDay.entries()].sort().map(([d, v]) => ({ time: d, value: v })));
    });
    c.timeScale().fitContent();
  }

  // Lignes à tracer pour une période et une vue : le CAC 40 d'abord (il porte les marqueurs), puis les autres.
  function linesFor(mk, period, view) {
    const label = Object.fromEntries(mk.titres.map((t) => [t.symbol, t.label]));
    const out = [];
    if (period.series.CAC40) out.push({ id: "CAC40", label: "CAC 40", pts: period.series.CAC40 });
    if (view === "paniers") {
      for (const [g, name] of Object.entries(mk.groupes)) {
        if ((period.paniers[g] || []).length) out.push({ id: g, label: name.replace(/ \(.*\)$/, ""), pts: period.paniers[g] });
      }
    } else {
      for (const t of mk.titres) if (t.groupe === view && period.series[t.symbol]) out.push({ id: t.symbol, label: label[t.symbol], pts: period.series[t.symbol] });
    }
    return out;
  }

  function signalsFor(signaux, mode) {
    return signaux.filter((e) => {
      const ty = (e.data || {}).type;
      if (mode === "aucun") return false;
      if (mode === "sans_sondages" && (ty === "sondage" || ty === "tete")) return false;
      return true;
    });
  }

  function base100(state) {
    const { box, tip, legend, sub, mk, signaux } = state;
    if (state.chart) { state.chart.remove(); state.chart = null; }
    legend.replaceChildren();
    const period = mk.periodes.find((p) => p.id === state.period) || mk.periodes[0];
    const rows = period ? linesFor(mk, period, state.view) : [];
    sub.textContent = period && period.base
      ? `Base 100 au ${U.dmy(period.base)} (dernière clôture connue ce jour-là). ${mk.source}.`
      : `Pas de cours du CAC 40 sur cette période. ${mk.source}.`;
    if (!rows.length || !window.LightweightCharts) return;
    const c = LightweightCharts.createChart(box, U.chartTheme());
    state.chart = c;
    const series = rows.map((r, i) => {
      const s = c.addSeries(LightweightCharts.LineSeries, { color: U.cssVar(`--fr-l${(i % 8) + 1}`), lineWidth: i === 0 ? 2 : 1.5,
        priceLineVisible: false, lastValueVisible: true, title: r.label });
      s.setData(r.pts.map(([d, v]) => ({ time: d, value: v })));
      const item = U.el("span", "fr-key");
      item.append(U.el("i", `fr-sw fr-sw${(i % 8) + 1}`), document.createTextNode(r.label));
      legend.append(item);
      return s;
    });
    series[0].createPriceLine({ price: 100, color: U.cssVar("--line-2"), lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    // Marqueurs : première séance du CAC 40 à partir de la date du signal, dans la période.
    const days = rows[0].pts.map(([d]) => d);
    const sessionOf = (iso) => {
      const d = iso.slice(0, 10);
      let lo = 0, hi = days.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (days[m] < d) lo = m + 1; else hi = m; }
      return days[lo];
    };
    const byId = new Map();
    const marks = [];
    for (const e of signalsFor(signaux, state.notes)) {
      if (!days.length || e.time.slice(0, 10) < days[0]) continue;
      const t = sessionOf(e.time);
      if (!t) continue;
      byId.set(e.id, e);
      const ty = TYPE[(e.data || {}).type] || ["•", "Signal"];
      marks.push({ time: t, position: "aboveBar", shape: "circle", size: 1, id: e.id, text: ty[0],
        color: U.cssVar(`--lv-${e.level}`) || U.cssVar("--ink-3") });
    }
    marks.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    LightweightCharts.createSeriesMarkers(series[0], marks);
    c.subscribeCrosshairMove((p) => {
      const e = p.hoveredObjectId && byId.get(p.hoveredObjectId);
      if (!e || !p.point) { tip.hidden = true; return; }
      const ty = TYPE[(e.data || {}).type] || ["", "Signal"];
      tip.replaceChildren(U.el("span", "when", `${U.dmy(e.time)} · ${ty[1]}`), U.el("b", null, e.title), U.badge(e.level));
      tip.hidden = false;
      tip.style.left = `${Math.min(Math.max(8, p.point.x + 14), box.clientWidth - 270)}px`;
      tip.style.top = `${Math.max(4, p.point.y - 20)}px`;
    });
    c.timeScale().fitContent();
  }

  function compositionTable(mk) {
    return U.table(mk.titres, [
      ["label", "Titre", null, "nw"], ["groupe", "Groupe", (v) => GROUPE[v] || v, "nw"],
      ["motif", "Motif", (v) => v || "Référence du marché"],
      ["citation", "Citation (presse économique)", (v, r) => (v ? link(`« ${v} »`, r.source) : U.el("span", "muted", "—"))],
      ["dernier", "Dernière clôture", (v) => (v ? `${U.nf2.format(v.close)} € · ${U.dmy(v.date)}` : U.el("span", "muted", "pas encore collectée")), "nw"],
    ], null, { empty: "Aucun titre." });
  }

  function ratingsTable(nt) {
    return U.table(nt.revues, [
      ["agence", "Agence", null, "nw"], ["date_decision", "Date", (v, r) => U.dmy(v || r.date_revue), "t"],
      ["statut", "Statut", (v) => STATUT[v] || v, "nw"],
      ["note", "Note", (v) => v || "—", "nw"], ["perspective", "Perspective", (v) => v || "—", "nw"],
      ["citation", "Source", (v, r) => link(`« ${v} » (${host(r.source)})`, r.source)],
    ], null, { empty: "Aucune revue relevée." });
  }

  async function marches(root) {
    U = window.MASTER_UI;
    const [m, reg] = await Promise.all([U.api("/api/france/marches"), U.api("/api/france/candidats")]);
    const names = Object.fromEntries([...reg.candidats, ...reg.autres].map((c) => [c.id, c.nom]));
    const mk = m.marches;
    root.append(U.callout("attention", "À lire avec prudence.", `${m.avertissement} Aucune position n'est prise ici : les desks décident selon leurs règles.`));
    if (mk && (mk.perime || mk.manquants.length)) {
      root.append(U.callout("info", "Cours incomplets.", [mk.perime ? "La dernière clôture du CAC 40 a plus de 7 jours." : "",
        mk.manquants.length ? `Pas encore de cours pour : ${mk.titres.filter((t) => mk.manquants.includes(t.symbol)).map((t) => t.label).join(", ")}.` : ""].join(" ").trim()));
    }

    // Base 100, annotée
    if (mk) {
      const state = { mk, signaux: m.signaux, period: mk.periodes[0] && mk.periodes[0].id, view: "paniers", notes: "tous", chart: null };
      const controls = U.el("div", "fr-controls");
      controls.append(U.seg(mk.periodes.map((p) => [p.id, p.label]), state.period, (v) => { state.period = v; base100(state); }, "Période"),
        U.seg(VIEWS, state.view, (v) => { state.view = v; base100(state); }, "Titres"),
        U.seg(NOTES, state.notes, (v) => { state.notes = v; base100(state); }, "Annotations"));
      const p = U.panel("Bourse de Paris en base 100, annotée des signaux politiques", { sub: "…" });
      state.sub = p.head.querySelector(".muted");
      const wrap = U.el("div", "chart-wrap");
      state.box = U.el("div", "fr-chart fr-chart-lg fr-base100");
      state.tip = U.el("div", "tip"); state.tip.hidden = true;
      wrap.append(state.box, state.tip);
      state.legend = U.el("div", "fr-legend");
      const key = U.el("p", "muted fr-note", "Marqueurs sur le CAC 40 : C censure · 49 article 49.3 · S sondages · D dissolution · N notation ; "
        + "couleur = niveau de confirmation (survoler pour le détail). " + mk.note);
      p.body.append(controls, wrap, state.legend, key);
      root.append(p.el);
      requestAnimationFrame(() => base100(state));
    }

    const grid = U.el("div", "fr-grid");
    const p1 = U.panel("Écart OAT-Bund à 10 ans (points)", { sub: m.source_ecart });
    const b1 = U.el("div", "fr-chart fr-chart-lg");
    p1.body.append(b1);
    const p2 = U.panel("Sondages : les quatre premiers de la moyenne (%)", { sub: "Une courbe par candidat, un point par sondage ; voir l'onglet Candidats pour la méthode." });
    const b2 = U.el("div", "fr-chart fr-chart-lg");
    const noPolls = !Object.keys(m.sondages || {}).length;
    p2.body.append(m.sondages_masques ? U.callout("attention", null, m.message_sondages)
      : noPolls ? U.el("p", "muted", "Aucun sondage dont le terrain finit dans les 30 derniers jours : pas de moyenne à afficher.") : b2);
    grid.append(p1.el, p2.el);
    root.append(grid);
    requestAnimationFrame(() => { lines(b1, [["FR", m.ecart_oat_bund]], { FR: "OAT − Bund" }); if (!noPolls) lines(b2, Object.entries(m.sondages), names); });

    if (mk) {
      const pc = U.panel("Composition : pourquoi ces titres", { sub: "Panier déclaré et sourcé (mécanisme qui lie l'activité à une décision publique), pas une recommandation. Les citations datent des réactions de marché relevées par la presse." });
      pc.body.append(compositionTable(mk));
      root.append(pc.el);
    }
    if (m.notations) {
      const pn = U.panel("Agences de notation : calendrier et décisions", { sub: `${m.notations.note} Relevé dans la presse quand la page de l'agence n'est pas lisible : niveau « probable ».` });
      pn.body.append(ratingsTable(m.notations));
      root.append(pn.el);
    }
    const ps = U.panel(`Signaux politiques (${m.signaux.length})`, { sub: "Transmis aux desks Macro et Géopolitique : motions de censure, 49.3, mouvements nets des sondages, dissolution, notations." });
    ps.body.append(U.table(m.signaux, [["time", "Date", (v) => U.dmy(v)], ["data", "Type", (v) => (TYPE[(v || {}).type] || ["", "—"])[1]],
      ["title", "Signal", (v, r) => link(v, r.url)], ["level", "Niveau", (v) => U.badge(v)], ["source", "Source"]], null, { empty: "Aucun signal pour l'instant." }));
    root.append(ps.el);
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { marches });
})();
