/* Master — rubrique « Desks » : les équipes d'agents spécialisées, leur statut et, en tête, « La maison » (parts du CIO,
   valeur et perte maximale de chaque desk). Pour un desk actif : sa part, la liste courte du jour, les constats des
   analystes (IA, avec cohérence et problèmes), les décisions et les verdicts des deux risques, sa courbe de valeur, son
   bulletin (par agent aussi), ses positions simulées ; le desk Macro garde son régime (indicateurs datés : observation,
   date de connaissance, z-score).
   Lecture seule, aussi en ligne : cette page ne fait que lire l'API. Aucune position n'est réelle. Une lecture échouée
   est affichée « indisponible », jamais comme un zéro. Tout texte de donnée ou de modèle passe par textContent. */
(() => {
  "use strict";
  const DESK_STATUS = { actif: ["ok", "actif"], prévu: ["neutral", "prévu"] };
  const REGIME = { favorable: "ok", neutre: "neutral", défavorable: "bad", indéterminé: "warn" };
  const STATE = { "en attente": "neutral", ouverte: "ok", close: "neutral" };
  const REASON = { stop: "stop", objectif: "objectif", duree: "durée atteinte" };
  const SIDE = { long: "achat", short: "vente à découvert" };
  const VERDICT = { validée: "ok", réduite: "warn", refusée: "bad" };
  const DECISION = { décidée: "ok", refusée: "bad", aucune: "neutral" };
  const COHERENCE = { coherente: ["ok", "cohérent"], incoherente: ["bad", "incohérent"], non_verifiee: ["neutral", "non vérifié"] };
  const SENS = { hausse: "hausse", baisse: "baisse", neutre: "neutre", sans_reponse: "sans réponse" };
  const SVG_NS = "http://www.w3.org/2000/svg";
  let U = null;

  const signed = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${U.nf2.format(v)}`);
  const plural = (n, one, many) => `${U.nf0.format(n)} ${n > 1 ? many : one}`;
  const deskStatus = (d) => U.status(...(DESK_STATUS[d.status] || ["neutral", d.status]));
  const day = (v) => (v ? U.dmy(v) : "—");

  const nf3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const value3 = (v) => (v == null ? "—" : nf3.format(v));
  const lossPct = (v) => (v == null ? "—" : `${U.nf2.format(v)} %`);  // perte maximale : nombre positif, en %
  const aiTag = () => { const t = U.el("span", "tag dk-ia", "IA"); t.title = "Texte écrit par un modèle d'IA, à vérifier"; return t; };
  const stackOf = (...nodes) => { const b = U.el("div"); b.append(...nodes.filter(Boolean)); return b; };
  const small = (text) => (text ? U.el("div", "muted", text) : null);

  function link(text, href, cls) {
    const a = U.el("a", cls || null, text);
    a.href = href;
    return a;
  }

  // Courbe de valeur (base 1,0) en SVG simple : une ligne, le trait de la valeur 1,0 en pointillés. Aucun texte dans
  // le dessin (les bornes sont en légende) : il est étiré sans déformer de caractères.
  function curveChart(points, label) {
    const W = 600, H = 140, PAD = 8;
    const vals = points.map((p) => p[1]).concat([1]);
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const x = (i) => PAD + (points.length < 2 ? 0 : (i * (W - 2 * PAD)) / (points.length - 1));
    const y = (v) => H - PAD - ((v - lo) / span) * (H - 2 * PAD);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", String(H));
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
    svg.style.color = "var(--ink-2)";
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = label;
    const base = document.createElementNS(SVG_NS, "line");
    for (const [k, v] of Object.entries({ x1: PAD, x2: W - PAD, y1: y(1), y2: y(1), stroke: "currentColor", "stroke-width": 1,
      "stroke-dasharray": "4 4", "stroke-opacity": 0.5, "vector-effect": "non-scaling-stroke" })) base.setAttribute(k, String(v));
    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", points.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" "));
    for (const [k, v] of Object.entries({ fill: "none", stroke: "var(--ink)", "stroke-width": 1.75, "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke" })) line.setAttribute(k, String(v));
    svg.append(title, base, line);
    return svg;
  }

  // Courbe et légende ; au moins deux séances, sinon on le dit au lieu de dessiner une ligne vide.
  function curveBlock(points, who) {
    const box = U.el("div", "dk-curve");
    if (!points || points.length < 2) {
      box.append(U.el("div", "muted", points && points.length === 1
        ? "Une seule séance pour l'instant : la courbe apparaît dès la deuxième."
        : "Aucune position ouverte à ce jour : pas de courbe."));
      return box;
    }
    const first = points[0], last = points[points.length - 1];
    const vals = points.map((q) => q[1]);
    box.append(curveChart(points, `${who} : valeur de ${value3(first[1])} le ${day(first[0])} à ${value3(last[1])} le ${day(last[0])}`),
      U.el("div", "muted dk-legend",
        `du ${day(first[0])} au ${day(last[0])} · plus bas ${value3(Math.min(...vals))} · plus haut ${value3(Math.max(...vals))} · trait pointillé : valeur de départ 1,000`));
    return box;
  }

  const pauseCallout = () => U.callout("attention", "Desks en pause.",
    "L'interrupteur (desks.json) est actif : aucune nouvelle décision n'est prise, les positions déjà ouvertes continuent d'être suivies.");

  async function readFirm() {
    try { return await U.api("/api/firm"); } catch (err) { return null; }
  }

  function firmPanel(f, desks) {
    const p = U.panel("La maison", { sub: `Capital fictif réparti entre les desks actifs par le CIO, par règle écrite à l'avance (parts égales tant qu'aucun avantage n'est démontré). Valeur base 1,000, à la veille du ${day(f.asof)}.` });
    const kpis = U.el("div", "kpis");
    kpis.append(
      U.kpi({ label: "Valeur de la maison", icon: "chart", value: value3(f.value), ctx: `${U.pct((f.value - 1) * 100)} depuis le départ` }),
      U.kpi({ label: "Perte maximale", icon: "circle-alert", value: lossPct(f.max_drawdown_pct), ctx: "du plus haut au plus bas qui suit" }),
      U.kpi({ label: "Desks financés", icon: "bot", value: String(Object.keys(f.allocations).length), ctx: "les desks prévus n'ont aucune part" }));
    p.body.append(kpis);
    const labels = Object.fromEntries(desks.map((d) => [d.id, d.label]));
    const rows = Object.keys(f.allocations).map((id) => ({ id, ...f.allocations[id], ...(f.desks[id] || {}) }));
    p.body.append(U.table(rows, [
      ["id", "Desk", (v) => link(labels[v] || v, `#desks/${v}`, "dk-name")],
      ["share", "Part du CIO", (v) => `${U.nf0.format(v * 100)} %`, "nw"],
      ["raison", "Raison", (v) => U.el("span", "dk-why", v || "")],
      ["value", "Valeur", (v) => value3(v), "nw"],
      ["max_drawdown_pct", "Perte maximale", lossPct, "nw"],
      ["open", "Ouvertes", (v) => (v == null ? "—" : U.nf0.format(v)), "nw"],
      ["pending", "En attente", (v) => (v == null ? "—" : U.nf0.format(v)), "nw"],
    ], (r) => { location.hash = `#desks/${r.id}`; }, { empty: "Aucun desk actif." }));
    p.body.append(U.el("div", "th-h dk-gap", "Courbe de valeur de la maison"));
    p.body.append(curveBlock(f.curve, "Maison"));
    return p.el;
  }

  // ------------------------------------------------------------ liste
  async function viewList(root) {
    root.append(U.pageHead({ crumbs: ["Marchés", "Desks"], title: "Desks",
      sub: "Les équipes d'agents spécialisées du Master. Positions simulées seulement : aucun ordre réel. Un desk « prévu » n'est pas encore en marche." }));
    let r;
    try { r = await U.api("/api/desks"); } catch (err) {
      root.append(U.callout("attention", "Données indisponibles.", "La liste des desks n'a pas pu être lue."));
      return;
    }
    const firm = await readFirm();
    if (firm && firm.paused) root.append(pauseCallout());
    if (firm) root.append(firmPanel(firm, r.desks));
    else root.append(U.callout("attention", "La maison est indisponible.", "Les parts du CIO et la valeur de la maison n'ont pas pu être lues."));
    const sum = (k) => r.desks.reduce((s, d) => s + d.counts[k], 0);
    const kpis = U.el("div", "kpis");
    kpis.append(
      U.kpi({ label: "Desks actifs", icon: "bot", value: String(r.desks.filter((d) => d.status === "actif").length), unit: ` / ${r.desks.length}` }),
      U.kpi({ label: "Décisions en attente", icon: "clock", value: U.nf0.format(sum("pending")), ctx: "ouvertes à la prochaine clôture" }),
      U.kpi({ label: "Positions ouvertes", icon: "chart", value: U.nf0.format(sum("open")) }),
      U.kpi({ label: "Positions closes", icon: "list", value: U.nf0.format(sum("closed")) }));
    root.append(kpis);
    const p = U.panel("Desks", { sub: "Cliquer sur un desk pour voir son régime, ses positions et son bulletin." });
    p.body.append(U.table(r.desks, [
      ["label", "Desk", (v, d) => { const b = U.el("div"); b.append(link(v, `#desks/${d.id}`, "dk-name")); b.append(U.el("div", "muted", d.themes.length ? `thèmes : ${d.themes.join(", ")}` : "transverse")); return b; }],
      ["status", "Statut", (v, d) => deskStatus(d)],
      ["allocation", "Part du CIO", (v) => (v ? `${U.nf0.format(v.share * 100)} %` : U.el("span", "muted", "aucune")), "nw"],
      ["universe", "Univers · référence", (v, d) => `${v.length ? v.join(", ") : "à définir"} · ${d.benchmark || "à définir"}`],
      ["counts", "Positions", (v) => `${v.pending} en attente · ${v.open} ouverte${v.open > 1 ? "s" : ""} · ${v.closed} close${v.closed > 1 ? "s" : ""}`],
      ["latest_note", "Dernier avis", (v) => {
        if (!v) return U.el("span", "muted", "aucun");
        const b = U.el("div");
        b.append(U.status(REGIME[v.stance] || "neutral", v.stance || "—"), U.el("div", "muted", `au ${day(v.date)}`));
        return b;
      }],
    ], (d) => { location.hash = `#desks/${d.id}`; }));
    root.append(p.el);
  }

  // ------------------------------------------------------------ détail
  function regimePanel(note, desk) {
    const p = U.panel("Régime", { sub: "Calculé avec les seules valeurs connues à la date du régime (millésimes FRED/ALFRED)." });
    if (!note) {
      p.body.append(U.el("div", "muted", desk.status === "actif" ? "Aucun régime calculé pour l'instant." : "Ce desk ne publie pas encore d'avis."));
      return p.el;
    }
    const data = note.data || {};
    const kpis = U.el("div", "kpis");
    const tone = { bad: "alert", warn: "warn" }[REGIME[note.stance]] || null;  // tons de carte d'app.css
    kpis.append(
      U.kpi({ label: "Régime", icon: "gauge", value: note.stance || "—", tone, ctx: `au ${day(data.asof || note.date)}` }),
      U.kpi({ label: "Score", icon: "chart", value: data.score == null ? "absent" : signed(data.score), ctx: "moyenne de sens × z, bornée à ±3" }),
      U.kpi({ label: "Indicateurs absents", icon: "circle-alert", value: String((data.missing || []).length), unit: ` / ${Object.keys(data.indicators || {}).length}`,
        tone: (data.missing || []).length > 2 ? "warn" : null, ctx: "au-delà de 2 : régime indéterminé" }));
    p.body.append(kpis);
    const rows = Object.entries(data.indicators || {}).map(([id, x]) => ({ id, ...x }));
    p.body.append(U.table(rows, [
      ["label", "Indicateur", (v, x) => { const b = U.el("div"); b.append(U.el("b", null, v), U.el("div", "muted", x.id)); return b; }],
      ["sens", "Sens", (v) => (v > 0 ? "hausse favorable" : "hausse défavorable")],
      ["value", "Valeur", (v, x) => (v == null ? "absente" : `${x.kind === "variation" ? signed(v) : U.nf2.format(v)} ${x.unit || ""}`.trim()), "nw"],
      ["date", "Observation", day, "nw"],
      ["known", "Connue le", day, "nw"],
      ["z", "z-score", (v, x) => (v == null ? U.el("span", "muted", "absent du calcul") : signed(v)), "nw"],
      ["absent", "Remarque", (v) => v || ""],
    ], null, { empty: "Aucun indicateur dans cette note." }));
    if (data.decision) {
      const d = data.decision;
      p.body.append(U.el("p", "muted", `Décision du trader simulé : ${d.status}${d.raison ? ` (${d.raison})` : ""}.`));
    }
    return p.el;
  }

  function scorePanel(sc, min, desk) {
    const p = U.panel("Bulletin de notes", { sub: `Positions closes, notées à terme contre ${desk.benchmark || "aucune référence"} : rendement moyen de toutes ses fenêtres de même durée depuis la première ouverture, frais compris.` });
    const kpis = U.el("div", "kpis");
    kpis.append(
      U.kpi({ label: "Positions closes", icon: "list", value: U.nf0.format(sc.n), ctx: `${sc.compared} comparées, ${sc.excluded} exclues` }),
      U.kpi({ label: "Gagnantes", icon: "gauge", value: sc.hit_rate == null ? "—" : `${Math.round(sc.hit_rate * 100)} %` }),
      U.kpi({ label: "Résultat moyen", icon: "chart", value: U.pct(sc.avg_ret_pct) }),
      U.kpi({ label: `Écart à ${desk.benchmark || "la référence"}`, icon: "chart", value: sc.excess_pct == null ? "—" : `${signed(sc.excess_pct)} pts`,
        ctx: sc.benchmark_avg_ret_pct == null ? null : `référence : ${U.pct(sc.benchmark_avg_ret_pct)}` }));
    p.body.append(kpis);
    // Tant qu'il le faut : « edge non démontré : N positions closes sur 30 » (N = positions comparées à la référence).
    const edge = sc.edge === "démontré" ? "edge démontré"
      : desk.benchmark && sc.compared < min ? `edge non démontré : ${plural(sc.compared, "position close", "positions closes")} sur ${min}`
      : "edge non démontré";
    p.body.append(U.callout(sc.edge === "démontré" ? "info" : "attention", edge, sc.raison ? `(${sc.raison})` : ""));
    return p.el;
  }

  function positionsPanel(positions) {
    const p = U.panel("Positions simulées", { sub: "Une décision s'ouvre à la première clôture strictement après sa date ; stop et objectif vérifiés sur les clôtures." });
    const live = positions.filter((x) => x.state !== "close").reverse();
    const done = positions.filter((x) => x.state === "close").reverse();
    const common = [
      ["symbol", "Instrument", (v, x) => { const b = U.el("div"); b.append(U.el("b", null, v), U.el("div", "muted", SIDE[x.side] || x.side)); return b; }],
      ["decided", "Décidée le", day, "nw"],
      ["opened", "Ouverte le", (v, x) => (v ? `${day(v)} · ${U.nf2.format(x.open_price)}` : "—"), "nw"],
    ];
    p.body.append(U.el("div", "th-h", "En cours"));
    p.body.append(U.table(live, [...common,
      ["state", "État", (v) => U.status(STATE[v] || "neutral", v)],
      ["horizon", "Règles", (v, x) => `${v} séances${x.stop_pct != null ? ` · stop ${U.nf1.format(x.stop_pct)} %` : ""}${x.target_pct != null ? ` · objectif ${U.nf1.format(x.target_pct)} %` : ""}`],
      ["rationale", "Justification", (v) => U.el("span", "dk-why", v || "")],
    ], null, { empty: "Aucune décision en attente ni position ouverte." }));
    p.body.append(U.el("div", "th-h dk-gap", "Closes"));
    p.body.append(U.table(done, [...common,
      ["closed", "Close le", (v, x) => `${day(v)} · ${U.nf2.format(x.close_price)}`, "nw"],
      ["reason", "Motif", (v) => REASON[v] || v || "—"],
      ["ret_pct", "Résultat net", (v) => U.pct(v), "nw"],
    ], null, { empty: "Aucune position close pour l'instant." }));
    return p.el;
  }

  function allocationPanel(r, firm) {
    const d = r.desk;
    const p = U.panel("Part et valeur", { sub: `À la veille du ${day(r.asof)}. Valeur base 1,000 : mise de départ fixe, sans réinvestissement.` });
    const f = firm && firm.desks ? firm.desks[d.id] : null;
    const kpis = U.el("div", "kpis");
    kpis.append(
      U.kpi({ label: "Part du CIO", icon: "gauge", value: r.allocation ? `${U.nf0.format(r.allocation.share * 100)} %` : "aucune",
        ctx: r.allocation ? r.allocation.raison : "desk prévu : pas de capital fictif" }),
      U.kpi({ label: "Valeur du desk", icon: "chart", value: f ? value3(f.value) : (r.equity.length ? value3(r.equity[r.equity.length - 1][1]) : "—"),
        ctx: r.equity.length ? null : "aucune position ouverte" }),
      U.kpi({ label: "Perte maximale", icon: "circle-alert", value: f ? lossPct(f.max_drawdown_pct) : "—", ctx: "du plus haut au plus bas qui suit" }));
    p.body.append(kpis, curveBlock(r.equity, d.label));
    return p.el;
  }

  function shortlistPanel(list, asof) {
    const p = U.panel("Liste courte du jour", { sub: `Chaque soir, un filtre sans IA retient au plus 5 valeurs et dit pourquoi (liste du ${day(asof)}). Elle n'est jamais réécrite.` });
    p.body.append(U.table(list, [
      ["symbol", "Valeur", (v, x) => stackOf(U.el("b", null, v), small(x.label && x.label !== v ? x.label : null))],
      ["reasons", "Raisons", (v) => stackOf(...(v || []).map((q) => U.el("div", "dk-why", q.text || "")))],
    ], null, { empty: "Aucune liste courte à cette date." }));
    return p.el;
  }

  function analysesPanel(list) {
    const p = U.panel("Constats des analystes", { sub: "Écrits par un modèle d'IA à partir d'un dossier de faits ; chaque chiffre et chaque référence est contrôlé après coup. À vérifier." });
    p.body.append(U.table(list, [
      ["symbol", "Valeur", (v) => U.el("b", null, v)],
      ["stance", "Avis", (v, n) => {
        const dt = n.data || {};
        return stackOf(U.status(v === "hausse" ? "ok" : v === "baisse" ? "bad" : "neutral", SENS[v] || v || "—"),
          small(dt.conviction != null ? `conviction ${dt.conviction}/5 · horizon ${dt.horizon} séances` : null));
      }],
      ["coherence", "Cohérence", (v, n) => {
        const [kind, text] = COHERENCE[v] || ["neutral", v || "non vérifié"];
        return stackOf(U.status(kind, text), ...(n.issues || []).map((q) => U.el("div", "dk-why dk-issue", q)));
      }],
      ["body", "Constat", (v, n) => stackOf(aiTag(), v ? U.el("div", "dk-why", v) : small("aucun constat exploitable"),
        small((n.data || {}).refs && n.data.refs.length ? `${plural(n.data.refs.length, "référence", "références")} au dossier` : null))],
    ], null, { empty: "Aucun constat d'analyste à cette date." }));
    p.body.append(U.aiNotice());
    return p.el;
  }

  function verdictCell(v) {
    if (!v) return U.el("span", "muted", "—");
    return stackOf(U.status(VERDICT[v.verdict] || "neutral", `${v.verdict} · mise ${U.nf2.format(v.weight)}`),
      ...(v.raisons || []).map((q) => U.el("div", "dk-why", q)));
  }

  function decisionsPanel(note) {
    const data = note ? note.data || {} : null;
    const p = U.panel("Décisions du jour", { sub: "Trader simulé, puis risque du desk, puis risque central de la maison : chacun peut réduire la mise ou refuser. Positions simulées seulement." });
    if (!note) {
      p.body.append(U.el("div", "muted", "Aucune note du desk pour cette date : la matinée n'a pas (encore) tourné."));
      return p.el;
    }
    p.body.append(U.el("p", null, note.summary || ""));
    if (data.paused) p.body.append(pauseCallout());
    p.body.append(U.table(data.entries || [], [
      ["symbol", "Valeur", (v, e) => stackOf(U.el("b", null, v), small(e.label && e.label !== v ? e.label : null), small(e.status))],
      ["proposition", "Proposition", (v) => {
        if (!v) return U.el("span", "muted", "aucune");
        if (v.status !== "proposée") return U.el("span", "dk-why", `aucune : ${v.raison || "—"}`);
        return stackOf(U.el("div", null, `${SIDE[v.side] || v.side}, mise ${U.nf2.format(v.weight)}`),
          small(`${v.horizon} séances${v.stop_pct != null ? ` · stop ${U.nf1.format(v.stop_pct)} %` : ""}`));
      }],
      ["risque_desk", "Risque du desk", verdictCell],
      ["risque_central", "Risque central", verdictCell],
      ["decision", "Décision", (v) => (v ? stackOf(U.status(DECISION[v.status] || "neutral", v.status || "—"), v.raison ? U.el("div", "dk-why", v.raison) : null)
        : U.el("span", "muted", "—"))],
    ], null, { empty: "Aucune valeur à traiter ce jour-là." }));
    return p.el;
  }

  function agentsPanel(cards) {
    const p = U.panel("Bulletin par agent", { sub: "Même notation que le bulletin du desk, mais sur les seules positions de chaque agent." });
    const rows = Object.entries(cards || {}).map(([agent, c]) => ({ agent, ...c }));
    p.body.append(U.table(rows, [
      ["agent", "Agent", (v) => stackOf(U.el("b", null, v), v.startsWith("analyste_") ? aiTag() : null)],
      ["n", "Closes", (v, c) => `${U.nf0.format(v)} (${c.compared} comparées)`, "nw"],
      ["hit_rate", "Gagnantes", (v) => (v == null ? "—" : `${Math.round(v * 100)} %`), "nw"],
      ["avg_ret_pct", "Résultat moyen", (v) => U.pct(v), "nw"],
      ["excess_pct", "Écart à la référence", (v) => (v == null ? "—" : `${signed(v)} pts`), "nw"],
      ["edge", "Edge", (v) => U.status(v === "démontré" ? "ok" : "neutral", v === "démontré" ? "démontré" : "non démontré")],
    ], null, { empty: "Aucune position attribuée à un agent pour l'instant." }));
    return p.el;
  }

  function sourcesPanel(sources) {
    const p = U.panel("Sources", { sub: "Collectes dont dépend le desk (détail dans la rubrique Sources)." });
    p.body.append(U.table(sources, [
      ["key", "Clé"],
      ["error", "État", (v, s) => (!s.seen ? U.status("neutral", "jamais exécutée") : v ? U.status("bad", "en erreur") : U.status("ok", "en marche"))],
      ["last_success", "Dernière réussite", (v) => (v ? U.dmyhm(v) : "—"), "nw"],
      ["data_time", "Donnée la plus récente", (v) => v || "—", "nw"],
      ["error", "Dernière erreur", (v) => v || "", "err"],
    ], null, { empty: "Aucune source déclarée." }));
    return p.el;
  }

  async function viewDetail(root, did) {
    const fail = (title, text) => {
      const p = U.el("p");
      p.append(document.createTextNode(`${text} `), link("Retour aux desks", "#desks"));
      root.append(U.pageHead({ crumbs: ["Marchés", "Desks"], title }), p);
    };
    // Desk inconnu : absent de la liste (qui existe aussi en ligne). Toute autre panne est une donnée indisponible.
    let list;
    try { list = await U.api("/api/desks"); } catch (err) { return fail("Données indisponibles", "La liste des desks n'a pas pu être lue."); }
    if (!list.desks.some((d) => d.id === did)) return fail("Desk introuvable", `Le desk « ${did} » n'existe pas.`);
    let r;
    try { r = await U.api(`/api/desks/${encodeURIComponent(did)}`); } catch (err) {
      return fail("Données indisponibles", `Les données du desk « ${did} » n'ont pas pu être lues.`);
    }
    const d = r.desk;
    root.append(U.pageHead({ crumbs: ["Marchés", "Desks"], title: d.label,
      sub: `Univers : ${d.universe.length ? d.universe.join(", ") : "à définir"} · référence : ${d.benchmark || "à définir"}`,
      actions: [link("← Tous les desks", "#desks")] }));
    const head = U.el("div", "dk-status");
    head.append(deskStatus(d), U.el("span", "muted", d.themes.length ? `thèmes : ${d.themes.join(", ")}` : "desk transverse"));
    root.append(head);
    if (d.status !== "actif") root.append(U.callout("info", "Desk prévu.", "Il n'est pas encore en marche : ni régime, ni positions."));
    const firm = await readFirm();
    if (firm && firm.paused) root.append(pauseCallout());
    else if (!firm) root.append(U.callout("attention", "État de pause indisponible.", "La maison n'a pas pu être lue : on ne sait pas si les desks sont en pause."));
    // Desks à IA : la chaîne du jour (liste courte, constats, décisions) ; le desk Macro garde son régime.
    const chain = d.status === "actif" && d.id !== "macro";
    if (d.status === "actif") root.append(allocationPanel(r, firm));
    if (chain) root.append(shortlistPanel(r.shortlist || [], r.asof), analysesPanel(r.analyses || []), decisionsPanel(r.day_note));
    else root.append(regimePanel(r.latest_note, d));
    root.append(scorePanel(r.scorecard, r.min_positions, d));
    if (chain) root.append(agentsPanel(r.scorecards_by_agent));
    root.append(positionsPanel(r.positions), sourcesPanel(r.sources));
  }

  async function viewDesks(root) {
    U = window.MASTER_UI;
    root.classList.add("th-view");  // portée des styles de themes.css : cette vue seulement
    const did = decodeURIComponent(location.hash.slice(1).split("/").slice(1).join("/"));
    if (did) await viewDetail(root, did); else await viewList(root);
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { desks: viewDesks });
})();
