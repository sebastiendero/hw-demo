/* Master — Pulse : l'indice d'instabilité du Master (monde et pays), comme le « Global Pulse » de SitDeck mais mesuré.
 * Jauge du monde et ce qui la fait, classement des pays (cinq dimensions, variations 24 h et 30 jours, signaux),
 * vue des signaux par dimension. Un pays s'ouvre sur son détail ; « Situation » l'ouvre sur le globe.
 * Données : /api/pulse (master/pulse.py, formule rendue avec le résultat). Tout texte passe par textContent.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const DIMS = ["conflit", "violence", "humanitaire", "presse", "catastrophes"];
  const COLOR = { conflit: "#e5484d", violence: "#f0a35e", humanitaire: "#a78bfa", presse: "#60a5fa", catastrophes: "#22c55e" };
  const BAND_TONE = { critique: "bad", "élevé": "warn", tendu: "warn", "surveillé": "", calme: "ok" };
  const flag = (iso) => (iso && /^[a-z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
  const st = { view: "pays", sort: "score", q: "" };

  function gauge(el, score, band) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 120 120"); svg.setAttribute("class", "pl-gauge");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `Indice du monde : ${score} sur 100, ${band}`);
    const arc = (r, frac, cls) => {
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", "60"); c.setAttribute("cy", "60"); c.setAttribute("r", String(r)); c.setAttribute("class", cls);
      const len = 2 * Math.PI * r;
      c.setAttribute("stroke-dasharray", `${len * 0.75 * frac} ${len}`); c.setAttribute("transform", "rotate(135 60 60)");
      return c;
    };
    svg.append(arc(50, 1, "pl-g-bg"), arc(50, score / 100, `pl-g-fg b-${band.replace(/[^a-z]/g, "")}`));
    const box = el("div", "pl-gauge-box");
    box.append(svg, el("b", null, String(score).replace(".", ",")), el("span", null, band.toUpperCase()));
    return box;
  }
  const delta = (el, v) => el("span", `pl-d ${v == null ? "" : v > 0 ? "up" : v < 0 ? "down" : ""}`, v == null ? "—" : `${v > 0 ? "▲" : v < 0 ? "▼" : "="} ${Math.abs(v).toFixed(1).replace(".", ",")}`);
  function spark(el, hist) {
    const box = el("div", "pl-spark");
    if (!hist || hist.length < 2) { box.append(el("span", "muted", "historique en cours (depuis le 25/10)")); return box; }
    const max = Math.max(...hist.map((h) => h[1]), 1);
    for (const [d, v] of hist) { const i = el("i"); i.style.height = `${(v / max) * 100}%`; i.title = `${d} : ${v}`; box.append(i); }
    return box;
  }

  async function viewPulse(root) {
    const ui = U();
    const { el, api } = ui;
    const r = await api("/api/pulse");
    const tabs = ui.seg([["pays", "Pays"], ["signaux", "Signaux"], ["methode", "Méthode"]], st.view, (v) => { st.view = v; draw(); }, "Vue");
    root.append(ui.pageHead({ crumbs: ["Veille", "Pulse"], title: "Pulse", when: `calculé à ${r.generated_at.slice(11, 16)} UTC`,
      sub: "L'instabilité du monde en un chiffre de 0 à 100, et pays par pays, à partir des données du Master (conflits, violence récente, déplacés, presse, catastrophes).",
      actions: [tabs] }));

    // ---- le monde
    const top = el("div", "pl-top");
    const m = r.monde;
    const w = el("div", "card pl-world");
    w.append(gauge(el, m.score, m.band));
    const facts = el("div", "pl-facts");
    const fact = (k, v, sub) => { const d = el("div"); d.append(el("span", "muted", k), el("b", null, v)); if (sub) d.append(sub); facts.append(d); };
    fact("Variation 24 h", "", delta(el, m.move.d1)); fact("Variation 30 jours", "", delta(el, m.move.d30));
    fact("Pays les plus instables (moyenne des 20)", String(m.top20_moyenne).replace(".", ","));
    fact("Tension énergie", String(m.energie).replace(".", ","), el("span", "muted", `Ormuz ${m.energie_detail.ormuz_deficit != null ? `${m.energie_detail.ormuz_deficit} % sous la normale` : "—"} · Brent ${m.energie_detail.brent_20j_pct != null ? `${m.energie_detail.brent_20j_pct > 0 ? "+" : ""}${m.energie_detail.brent_20j_pct} % sur 20 séances` : "—"}`));
    w.append(facts, spark(el, m.move.history));
    const lead = el("div", "card pl-lead");
    lead.append(el("span", "muted", "LES PLUS INSTABLES"));
    for (const p of r.pays.slice(0, 6)) {
      const b = el("button", "pl-lead-row"); b.type = "button";
      b.append(el("span", null, `${flag(p.iso2)} ${p.name}`), el("b", null, String(p.score).replace(".", ",")), delta(el, p.move && p.move.d1));
      b.onclick = () => openCountry(p);
      lead.append(b);
    }
    top.append(w, lead);
    root.append(top);
    const body = el("div", "pl-body");
    root.append(body);
    const panel = el("div", "pl-panel"); panel.hidden = true;
    root.append(panel);

    function dimBars(p) {
      const box = el("div", "pl-dims");
      for (const k of DIMS) {
        const i = el("i"); i.style.width = `${p.dims[k]}%`; i.style.background = COLOR[k]; i.title = `${r.labels[k]} : ${p.dims[k]}`;
        const cell = el("span", "pl-dim"); cell.append(i); box.append(cell);
      }
      return box;
    }
    function draw() {
      body.replaceChildren();
      if (st.view === "methode") {
        const c = el("div", "card pl-method");
        c.append(el("h2", null, "Comment l'indice est calculé"));
        for (const line of r.formule.split("\n").map((x) => x.trim()).filter(Boolean)) c.append(el("p", null, line.replace(/^- /, "• ")));
        c.append(el("p", "muted", r.note));
        body.append(c);
        return;
      }
      if (st.view === "signaux") {
        const grid = el("div", "pl-sig");
        for (const k of DIMS) {
          const c = el("div", "card pl-sig-col");
          c.append(el("h2", null, r.labels[k]));
          const rows = r.pays.filter((p) => p.dims[k] > 0).sort((a, b) => b.dims[k] - a.dims[k]).slice(0, 12);
          for (const p of rows) {
            const b = el("button", "pl-sig-row"); b.type = "button";
            const bar = el("i"); bar.style.width = `${p.dims[k]}%`; bar.style.background = COLOR[k];
            b.append(el("span", null, `${flag(p.iso2)} ${p.name}`), el("b", null, String(Math.round(p.dims[k]))), bar);
            b.onclick = () => openCountry(p);
            c.append(b);
          }
          if (!rows.length) c.append(el("p", "muted", "Aucun signal."));
          grid.append(c);
        }
        body.append(grid);
        return;
      }
      // classement des pays
      const bar = el("div", "toolbar");
      const q = el("input"); q.type = "search"; q.placeholder = "Chercher un pays…"; q.value = st.q; q.setAttribute("aria-label", "Chercher un pays");
      q.oninput = () => { st.q = q.value; fill(); };
      const sortSel = el("select"); sortSel.setAttribute("aria-label", "Trier");
      for (const [v, l] of [["score", "Trier par indice"], ["d1", "Trier par variation 24 h"], ...DIMS.map((k) => [k, `Trier par ${r.labels[k].toLowerCase()}`])]) {
        const o = el("option", null, l); o.value = v; o.selected = st.sort === v; sortSel.append(o);
      }
      sortSel.onchange = () => { st.sort = sortSel.value; fill(); };
      const legend = el("div", "pl-legend");
      for (const k of DIMS) { const s = el("span"); const d = el("i"); d.style.background = COLOR[k]; s.append(d, document.createTextNode(r.labels[k])); legend.append(s); }
      bar.append(q, sortSel, legend);
      const table = el("div", "card pl-table");
      body.append(bar, table);
      function fill() {
        table.replaceChildren();
        const head = el("div", "pl-row pl-head");
        for (const h of ["Pays", "Indice", "24 h", "30 j", "Dimensions", "Signal principal"]) head.append(el("span", null, h));
        table.append(head);
        const val = (p) => (st.sort === "score" ? p.score : st.sort === "d1" ? Math.abs((p.move && p.move.d1) || 0) : p.dims[st.sort]);
        const ql = st.q.trim().toLowerCase();
        for (const p of r.pays.filter((x) => !ql || x.name.toLowerCase().includes(ql)).sort((a, b) => val(b) - val(a)).slice(0, 80)) {
          const row = el("button", "pl-row"); row.type = "button";
          const sc = el("span", "pl-score"); sc.append(el("b", null, String(p.score).replace(".", ",")), el("span", `tag ${BAND_TONE[p.band] || ""}`, p.band));
          row.append(el("span", "pl-name", `${flag(p.iso2)} ${p.name}`), sc, delta(el, p.move && p.move.d1), delta(el, p.move && p.move.d30), dimBars(p),
            el("span", "pl-signal", p.signals[0] || "—"));
          row.onclick = () => openCountry(p);
          table.append(row);
        }
      }
      fill();
    }

    function openCountry(p) {
      panel.replaceChildren(); panel.hidden = false;
      const close = el("button", "pl-close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer"); close.onclick = () => { panel.hidden = true; };
      const h = el("div", "pl-ph");
      h.append(el("h2", null, `${flag(p.iso2)} ${p.name}`), gauge(el, p.score, p.band));
      panel.append(close, h);
      const mv = el("p", "muted");
      mv.append(document.createTextNode("Variation 24 h "), delta(el, p.move && p.move.d1), document.createTextNode(" · 30 jours "), delta(el, p.move && p.move.d30));
      panel.append(mv, spark(el, p.move && p.move.history));
      for (const k of DIMS) {
        const r2 = el("div", "pl-dimrow");
        const bar = el("span", "pl-dim big"); const i = el("i"); i.style.width = `${p.dims[k]}%`; i.style.background = COLOR[k]; bar.append(i);
        r2.append(el("span", null, r.labels[k]), bar, el("b", null, String(Math.round(p.dims[k]))));
        panel.append(r2);
      }
      const raw = el("dl", "pl-raw");
      const add = (k, v) => raw.append(el("dt", null, k), el("dd", null, v));
      add("Morts sur 12 mois (UCDP)", ui.nf0.format(p.raw.morts_12m)); add("Événements GDELT sur 7 jours", ui.nf0.format(p.raw.gdelt_7j));
      add("Réfugiés et déplacés (UNHCR)", ui.nf0.format(p.raw.deplaces)); add("Titres en 48 h", ui.nf0.format(p.raw.titres_48h));
      add("Points de catastrophes", ui.nf0.format(p.raw.catastrophes_pts));
      panel.append(el("h3", null, "Les chiffres"), raw, el("h3", null, "Les signaux"));
      for (const s of p.signals) panel.append(el("p", "pl-sigline", s));
      const go = el("div", "actions");
      const a = el("a", "btn", "Voir sur le globe"); a.href = "#situation";
      a.onclick = () => { try { const x = JSON.parse(localStorage.getItem("master-monde") || "{}"); x.sel = p.iso2; localStorage.setItem("master-monde", JSON.stringify(x)); } catch { /* */ } };
      const ask = el("button", "btn ia", "✦ Expliquer avec Maestro"); ask.type = "button";
      ask.onclick = () => {
        try { localStorage.setItem("master-maestro-ask", JSON.stringify({ q: `Pourquoi l'indice d'instabilité de ${p.name} est-il à ${p.score}/100 (${p.band}) ? Explique les signaux : ${p.signals.join(" ; ")}. Que surveiller dans les prochains jours ?`, at: Date.now() })); } catch { /* */ }
        location.hash = "#maestro";
      };
      go.append(a, ask);
      panel.append(go);
    }

    draw();
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { pulse: viewPulse });
})();
