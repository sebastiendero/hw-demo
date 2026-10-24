/* Master — rubrique « Stratégies » (simulation uniquement, aucun ordre réel).
 *
 * Fichier à part : la rubrique s'enregistre dans window.MASTER_EXTRA_VIEWS et utilise les utilitaires exposés par
 * app.js (window.MASTER_UI). Tout texte venant des données passe par textContent.
 */
(() => {
  "use strict";
  const state = { selected: null, editing: null, charts: [] };
  const DIRECTION = { long: "Achat (hausse attendue)", short: "Vente à découvert (baisse attendue)" };
  const REASON = { duree: "durée atteinte", stop: "stop", objectif: "objectif", en_cours: "en cours" };
  const RULES = "Règles de la simulation : entrée et sortie à la clôture ; entrée au plus tôt la séance suivant celle "
    + "où l'événement était connu (les chutes et reprises des passages PortWatch ne sont connues que 10 jours après leur date) ; "
    + "stop et objectif vérifiés sur les clôtures seulement ; coûts déduits à l'entrée et à la sortie ; une seule position "
    + "à la fois. Limite : le niveau de confirmation retenu est celui d'aujourd'hui, pas celui du jour de l'événement. "
    + "Les performances passées ne préjugent pas de l'avenir.";

  async function send(method, path, body) {
    const r = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401) { location.href = "/login"; throw new Error("session expirée"); }
    if (!r.ok) {
      let msg = `${r.status}`;
      try { msg = (await r.json()).detail || msg; } catch { /* réponse non JSON */ }
      throw new Error(msg);
    }
    return r.status === 204 ? null : r.json();
  }

  function metricCards(U, m, warning) {
    const box = U.el("div", "cards");
    const card = (v, k) => { const c = U.el("div", "card"); c.append(U.el("div", "v", v), U.el("div", "k", k)); box.append(c); };
    card(U.pct(m.total_return_pct), "résultat de la stratégie");
    card(U.pct(m.benchmark_return_pct), "achat-conservation, même période");
    card(m.n_trades ?? "—", "trades");
    card(m.hit_rate == null ? "—" : `${U.nf0.format(m.hit_rate * 100)} %`, "trades gagnants");
    card(U.pct(m.max_drawdown_pct), "perte maximale depuis un sommet");
    card(m.sharpe == null ? "—" : U.nf2.format(m.sharpe), "ratio de Sharpe (annualisé)");
    const frag = document.createDocumentFragment();
    if (warning) frag.append(U.el("p", "warn", warning));
    frag.append(box);
    return frag;
  }

  function equityChart(U, box, run) {
    if (!run.equity.length || !window.LightweightCharts) return;
    const chart = LightweightCharts.createChart(box, { autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#c3c2b7", attributionLogo: true },
      grid: { vertLines: { color: "#2a2a28" }, horzLines: { color: "#2a2a28" } },
      timeScale: { borderColor: "#2e2e2c" }, rightPriceScale: { borderColor: "#2e2e2c" } });
    state.charts.push(chart);
    const line = chart.addSeries(LightweightCharts.LineSeries, { color: "#3987e5", lineWidth: 2, title: "stratégie" });
    line.setData(run.equity.map(([d, v]) => ({ time: d, value: v })));
    if (run.benchmark && run.benchmark.length) {
      const bench = chart.addSeries(LightweightCharts.LineSeries, { color: "#94938a", lineWidth: 1, lineStyle: 2,
        title: "achat-conservation", priceLineVisible: false, lastValueVisible: false });
      bench.setData(run.benchmark.map(([d, v]) => ({ time: d, value: v })));
    }
    const marks = run.trades.map((t) => ({ time: t.entry_date, position: "belowBar", shape: "arrowUp",
      color: t.ret_pct >= 0 ? "#0ca30c" : "#d03b3b", size: 1 }));
    LightweightCharts.createSeriesMarkers(line, marks.sort((a, b) => (a.time < b.time ? -1 : 1)));
    chart.timeScale().fitContent();
  }

  async function withBenchmark(U, run, symbol) {
    // Référence : l'instrument acheté et conservé sur la même période, ramené à 100 au départ.
    try {
      const p = await U.api(`/api/prices/${encodeURIComponent(symbol)}`);
      const first = run.equity.length ? run.equity[0][0] : null;
      const rows = p.rows.filter(([d]) => first && d >= first && d <= run.equity[run.equity.length - 1][0]);
      run.benchmark = rows.length ? rows.map(([d, c]) => [d, (c / rows[0][1]) * 100]) : [];
    } catch { run.benchmark = []; }
    return run;
  }

  // Vérification indépendante : la même stratégie rejouée dans le moteur de nautilus_trader, trade par trade.
  function crosscheckNote(U, c) {
    const p = U.el("p", "strat-check");
    if (!c) {
      p.append(U.status("neutral", "pas encore vérifié"), document.createTextNode(" par nautilus_trader (vérification toutes les 10 minutes)"));
      return p;
    }
    if (c.identiques) {
      p.append(U.status("ok", "Vérifié par nautilus_trader"), document.createTextNode(
        ` ${c.version || ""} : mêmes ${c.n} trade(s), dates, prix et résultats (à ${U.nf2.format(c.tolerance_pts)} point près) · ${U.dmyhm(c.checked_at)} UTC`));
      return p;
    }
    p.append(U.status("bad", "Écart avec nautilus_trader"), document.createTextNode(` ${c.version || ""} · ${U.dmyhm(c.checked_at)} UTC`));
    const d = U.el("details");
    d.append(U.el("summary", null, `${c.ecarts.length} différence(s), affichées telles quelles`));
    d.append(U.table(c.ecarts, [["trade", "Trade", (v) => (v == null ? "—" : `n° ${v}`)], ["champ", "Champ"],
      ["nous", "Notre moteur", (v) => (v == null ? "—" : String(v))], ["nautilus", "nautilus_trader", (v) => (v == null ? "—" : String(v))]]));
    const box = U.el("div"); box.append(p, d);
    return box;
  }

  // freqtrade (simulation seulement) : son test sur le passé comparé au nôtre, puis ses trades simulés en continu.
  const FREQTRADE_ID = "bitcoin-choc-brent-freqtrade";
  function freqtradeView(U, root, ft) {
    root.append(U.el("h2", null, "Robot freqtrade (simulation, aucun ordre réel)"));
    if (!ft) { root.append(U.el("p", "muted", "Pas encore exécuté (toutes les 6 heures).")); return; }
    const p = U.el("p", "strat-check");
    p.append(ft.identiques ? U.status("ok", "Même résultat que notre moteur") : U.status("bad", "Écart avec notre moteur"),
      document.createTextNode(` freqtrade ${ft.version || ""} sur ${ft.candles} bougies Kraken : ${ft.backtest.length} trade(s)`
        + `${ft.identiques ? `, mêmes dates, prix et résultats (à ${U.nf2.format(ft.tolerance_pts)} point près)` : ""} · ${U.dmyhm(ft.checked_at)} UTC`));
    root.append(p);
    if (!ft.identiques) {
      root.append(U.table(ft.ecarts, [["trade", "Trade", (v) => (v == null ? "—" : `n° ${v}`)], ["champ", "Champ"],
        ["nous", "Notre moteur", (v) => (v == null ? "—" : String(v))], ["freqtrade", "freqtrade", (v) => (v == null ? "—" : String(v))]]));
    }
    const live = ft.dry_run || [];
    root.append(U.el("h3", null, "Simulation continue de freqtrade"));
    // Le robot écrit dans son journal au moins une fois par minute : au-delà de 10 minutes de silence, il est arrêté.
    const fresh = ft.dry_run_seen && (new Date(ft.checked_at) - new Date(ft.dry_run_seen)) < 10 * 60e3;
    const st = U.el("p", "strat-check");
    st.append(!ft.dry_run_seen ? U.status("neutral", "Robot pas encore démarré")
      : fresh ? U.status("ok", "Robot actif") : U.status("bad", "Robot arrêté"),
      document.createTextNode(ft.dry_run_seen ? ` dernière activité le ${U.dmyhm(ft.dry_run_seen)} UTC (vu au contrôle du ${U.dmyhm(ft.checked_at)} UTC) ; portefeuille fictif de 1 000 €.` : ""));
    root.append(st);
    if (ft.dry_run_error) root.append(U.el("p", "warn", ft.dry_run_error));
    root.append(U.table(live.slice().reverse(), [["open_date", "Entrée", (v) => U.dmyhm(v)], ["open_rate", "Prix", (v) => U.nf2.format(v)],
      ["close_date", "Sortie", (v) => (v ? U.dmyhm(v) : "en cours")], ["close_rate", "Prix", (v) => (v == null ? "—" : U.nf2.format(v))],
      ["close_profit", "Résultat", (v) => (v == null ? "—" : U.pct(v * 100))], ["exit_reason", "Motif", (v) => (v ? REASON[v] || v : "—")]],
      null, { empty: "Aucun trade simulé pour l'instant : le robot attend le prochain choc du Brent." }));
  }

  function runView(U, root, s, run, title) {
    root.append(U.el("h2", null, title));
    if (!run) { root.append(U.el("p", "muted", "Pas encore d'exécution.")); return; }
    root.append(U.el("p", "muted", `Calculé le ${U.dmyhm(run.created_at)} UTC${run.start ? ` · depuis le ${U.dmy(run.start)}` : ""}`
      + `${run.skipped ? ` · ${run.skipped} signal(s) ignoré(s) pendant une position` : ""}`));
    root.append(crosscheckNote(U, run.crosscheck));
    root.append(metricCards(U, run.metrics, run.warning));
    const chartBox = U.el("div", "chart strat-chart");
    root.append(chartBox);
    equityChart(U, chartBox, run);
    root.append(U.table(run.trades.slice().reverse(), [["event_date", "Événement", (v) => U.dmy(v)],
      ["event_level", "Niveau", (v) => (v ? U.badge(v) : "—")], ["entry_date", "Entrée", (v) => U.dmy(v)],
      ["entry_price", "Prix", (v) => U.nf2.format(v)], ["exit_date", "Sortie", (v) => U.dmy(v)],
      ["exit_price", "Prix", (v) => U.nf2.format(v)], ["ret_pct", "Résultat", U.pct], ["reason", "Motif", (v) => REASON[v] || v]],
      async (t) => {
        const evs = await U.api(`/api/events?limit=5000`);
        const e = evs.find((x) => x.id === t.event_id);
        if (e) U.openEvent(e);
      }));
  }

  function editor(U, root, instruments, kinds, spec) {
    const f = U.el("form", "strat-form");
    const field = (label, input) => { const l = U.el("label", "strat-field"); l.append(U.el("span", null, label), input); f.append(l); return input; };
    const text = (v) => { const i = U.el("input"); i.value = v ?? ""; return i; };
    const num = (v, step = "1") => { const i = U.el("input"); i.type = "number"; i.step = step; i.value = v ?? ""; return i; };
    const name = field("Nom", text(spec.name));
    const sym = U.el("select");
    for (const i of instruments) { const o = U.el("option", null, `${i.label} (${i.symbol})`); o.value = i.symbol; o.selected = i.symbol === spec.symbol; sym.append(o); }
    field("Instrument", sym);
    const kindBox = U.el("div", "strat-checks");
    for (const k of kinds) {
      const l = U.el("label", "chk"); const c = U.el("input"); c.type = "checkbox"; c.value = k;
      c.checked = (spec.event_kinds || []).includes(k); l.append(c, document.createTextNode(U.kindLabel(k))); kindBox.append(l);
    }
    field("Déclencheurs", kindBox);
    const levelBox = U.el("div", "strat-checks");
    for (const [k, [label]] of Object.entries(U.LEVEL)) {
      const l = U.el("label", "chk"); const c = U.el("input"); c.type = "checkbox"; c.value = k;
      c.checked = (spec.levels || ["confirme", "probable"]).includes(k); l.append(c, document.createTextNode(label)); levelBox.append(l);
    }
    field("Niveaux acceptés", levelBox);
    const dir = U.el("select");
    for (const [k, label] of Object.entries(DIRECTION)) { const o = U.el("option", null, label); o.value = k; o.selected = (spec.direction || "long") === k; dir.append(o); }
    field("Sens", dir);
    const delay = field("Délai (séances après l'événement)", num(spec.delay ?? 1));
    const hold = field("Durée (séances)", num(spec.hold ?? 20));
    const stop = field("Stop (% de perte, vide = aucun)", num(spec.stop_pct, "0.1"));
    const target = field("Objectif (% de gain, vide = aucun)", num(spec.target_pct, "0.1"));
    const cost = field("Coûts (points de base par côté)", num(spec.cost_bps ?? 10, "0.5"));
    const msg = U.el("p", "msg");
    const save = U.el("button", null, "Enregistrer");
    save.type = "submit";
    const cancel = U.el("button", "link", "Annuler");
    cancel.type = "button";
    cancel.onclick = () => { state.editing = null; render(); };
    f.append(save, cancel, msg);
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const numOrNull = (i) => (i.value === "" ? null : Number(i.value));
      const body = { name: name.value.trim(), symbol: sym.value, direction: dir.value,
        event_kinds: [...kindBox.querySelectorAll("input:checked")].map((c) => c.value),
        levels: [...levelBox.querySelectorAll("input:checked")].map((c) => c.value),
        delay: Number(delay.value), hold: Number(hold.value), stop_pct: numOrNull(stop), target_pct: numOrNull(target),
        cost_bps: Number(cost.value) };
      if (spec.id) body.id = spec.id;
      try {
        const r = await send("POST", "/api/strategies", body);
        state.editing = null; state.selected = r.id;
        await send("POST", `/api/strategies/${encodeURIComponent(r.id)}/backtest`, {});
        render();
      } catch (e) { msg.textContent = e.message; }
    };
    root.append(f);
  }

  let render = () => {};

  async function viewStrategies(root) {
    const U = window.MASTER_UI;
    const ro = !!window.MASTER_STATIC;
    state.charts.forEach((c) => c.remove());
    state.charts = [];
    render = () => { window.dispatchEvent(new HashChangeEvent("hashchange")); };
    const data = await U.api("/api/strategies");
    const head = U.el("div", "toolbar");
    head.append(U.el("h1", null, "Stratégies"));
    if (!ro) {
      const add = U.el("button", null, "Nouvelle stratégie");
      add.onclick = () => { state.editing = {}; render(); };
      head.append(add);
    }
    root.append(head);
    root.append(U.el("p", "warn", data.disclaimer));
    root.append(U.el("p", "muted", RULES));

    if (state.editing && !ro) {
      const inst = await U.api("/api/instruments");
      root.append(U.el("h2", null, state.editing.id ? "Modifier la stratégie" : "Nouvelle stratégie"));
      editor(U, root, inst, data.kinds, state.editing);
      return;
    }
    const rows = data.strategies.map((s) => ({ ...s.spec, id: s.id, paper_since: s.paper_since,
      bt: s.last.backtest && s.last.backtest.metrics, paper: s.last.paper && s.last.paper.metrics }));
    if (!state.selected && rows.length) state.selected = rows[0].id;
    root.append(U.table(rows, [["name", "Stratégie"], ["symbol", "Instrument"],
      ["event_kinds", "Déclencheurs", (v) => v.map(U.kindLabel).join(", ")],
      ["bt", "Sur le passé", (m) => (m ? `${U.pct(m.total_return_pct)} (${m.n_trades} trades)` : "pas testée")],
      ["bt", "Achat-conservation", (m) => (m ? U.pct(m.benchmark_return_pct) : "—")],
      ["paper_since", "Simulation continue", (v, r) => (v ? `depuis le ${U.dmy(v)}${r.paper ? ` : ${U.pct(r.paper.total_return_pct)}` : ""}` : "arrêtée")]],
      (r) => { state.selected = r.id; render(); }));

    const s = data.strategies.find((x) => x.id === state.selected);
    if (!s) return;
    const sp = s.spec;
    root.append(U.el("h2", null, sp.name));
    root.append(U.el("p", null, `${DIRECTION[sp.direction]} sur ${sp.symbol}, ${sp.delay} séance(s) après : `
      + `${sp.event_kinds.map(U.kindLabel).join(", ")} (niveaux : ${sp.levels.map((l) => U.LEVEL[l][0]).join(", ")}) ; `
      + `durée ${sp.hold} séances${sp.stop_pct ? `, stop ${U.nf1.format(sp.stop_pct)} %` : ""}`
      + `${sp.target_pct ? `, objectif ${U.nf1.format(sp.target_pct)} %` : ""} ; coûts ${U.nf1.format(sp.cost_bps)} pb par côté.`));
    if (!ro) {
      const bar = U.el("div", "toolbar");
      const msg = U.el("span", "muted");
      const test = U.el("button", null, "Tester sur le passé");
      test.onclick = async () => { msg.textContent = "Calcul…"; try { await send("POST", `/api/strategies/${encodeURIComponent(s.id)}/backtest`, {}); render(); } catch (e) { msg.textContent = e.message; } };
      const paper = U.el("button", null, s.paper_since ? "Arrêter la simulation continue" : "Lancer la simulation continue");
      paper.onclick = async () => { try { await send("POST", `/api/strategies/${encodeURIComponent(s.id)}/paper`, { on: !s.paper_since }); render(); } catch (e) { msg.textContent = e.message; } };
      const edit = U.el("button", "link", "Modifier");
      edit.onclick = () => { state.editing = { ...sp, id: s.id }; render(); };
      const del = U.el("button", "link", "Supprimer");
      del.onclick = async () => { if (confirm(`Supprimer « ${sp.name} » ?`)) { await send("DELETE", `/api/strategies/${encodeURIComponent(s.id)}`); state.selected = null; render(); } };
      bar.append(test, paper, edit, del, msg);
      root.append(bar);
    }
    let bt = null, pp = null;
    try { bt = await withBenchmark(U, await U.api(`/api/strategies/${encodeURIComponent(s.id)}/runs/backtest`), sp.symbol); } catch { /* aucune */ }
    runView(U, root, s, bt, "Sur le passé");
    if (s.id === FREQTRADE_ID) {
      let ft = null;
      try { ft = await U.api("/api/freqtrade"); } catch { /* pas encore */ }
      freqtradeView(U, root, ft);
    }
    if (s.paper_since) {
      try { pp = await U.api(`/api/strategies/${encodeURIComponent(s.id)}/runs/paper`); } catch { /* aucune */ }
      if (pp) pp.benchmark = [];
      const sub = U.el("div");
      root.append(sub);
      runView(U, sub, s, pp, `Simulation continue (depuis le ${U.dmy(s.paper_since)})`);
    }
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { strategies: viewStrategies });
})();
