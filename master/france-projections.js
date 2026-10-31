/* Master — onglet « Projections » de la rubrique France politique (france.js) : simulation comptable transparente de
   la trajectoire 2027-2030 (dette, solde public, effet sur le PIB, intérêts supplémentaires) pour chaque candidat, en fourchette, face à une référence. Même
   moteur et mêmes hypothèses pour tous ; chaque hypothèse affiche sa source. Ce n'est pas une prévision.

   Sous-vues (#france/projections/<sous-vue>) : « Vue d'ensemble » (par défaut : tous les candidats du registre, dette
   et solde en fin de période, dans l'ordre du registre, jamais triés par résultat), « Par candidat »
   (#france/projections/candidat/<id>/<référence>/<engagements|annonces>/<candidat|mediane|pire>, avec des curseurs
   d'hypothèses en local), « Hypothèses », « Calculateur de salaire »
   (vue de france-salaire.js, window.MASTER_FRANCE_PROJ_VIEWS.salaire). Les anciennes adresses
   (#france/projections/<id>/…) ouvrent « Par candidat ». */
(() => {
  "use strict";
  const REFS = [["officielle", "Trajectoire du gouvernement"], ["legislation_constante", "À législation constante"]];
  const CASES = [["favorable", "favorable"], ["central", "central"], ["defavorable", "défavorable"]];
  const TYPE = { investissement_public: "investissement public", depenses_fonctionnement_transferts: "dépense courante ou transfert",
    impots_menages: "impôt des ménages", impots_entreprises: "impôt des entreprises" };
  const SUBS = [["ensemble", "Vue d'ensemble"], ["candidat", "Par candidat"], ["hypotheses", "Hypothèses"], ["salaire", "Calculateur de salaire"]];
  const PREVISION = "Par défaut, seules les mesures dont le candidat donne lui-même le coût sont simulées, en totalité dès 2027 ; les autres sont listées « non chiffrées ». Les jeux « médiane » et « pire » remplacent ce coût par les chiffrages indépendants rattachés à la mesure quand il y en a. Fourchette : favorable, central, défavorable.";
  const JEUX = [["candidat", "Chiffrage du candidat"], ["mediane", "Médiane indépendante"], ["pire", "Pire chiffrage indépendant"]];
  const JEU_AIDE = "Trois jeux de chiffrage, même moteur et mêmes hypothèses. « Chiffrage du candidat » : le montant qu'il annonce. « Médiane indépendante » : pour chaque mesure, la médiane des chiffrages publiés par des instituts et rattachés à cette mesure. « Pire chiffrage indépendant » : le chiffrage le plus défavorable au solde public. Seuls comptent les chiffrages indépendants de la campagne 2027, annuels et rattachés à une mesure ; une mesure sans chiffrage indépendant garde le chiffrage du candidat et est signalée. Les chiffrages d'une campagne précédente (autre version de la mesure) ne sont jamais utilisés.";
  const SOURCE = { candidat: "candidat", mediane_independante: "médiane indépendante", pire_independant: "pire indépendant" };
  let U = null;

  const parts = () => location.hash.slice(1).split("/").slice(2).map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
  function link(text, href) {
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", null, text);
    const a = U.el("a", "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }
  // Date de source : « 2026-07 » (mois seul) s'affiche 07/2026, sans inventer de jour.
  const srcDate = (x) => (/^\d{4}-\d{2}$/.test(x) ? `${x.slice(5, 7)}/${x.slice(0, 4)}` : /^\d{4}$/.test(x) ? x : U.dmy(x));
  const range = (rows, i, key, f) => CASES.map(([k]) => f(rows[k][i][key])).join(" / ");
  const yearPoints = (rows, key) => rows.map((r) => ({ time: `${r.annee}-12-31`, value: r[key] }));

  function chart(box, ref, cas, key) {
    if (!window.LightweightCharts) return;
    const c = LightweightCharts.createChart(box, U.chartTheme());
    const add = (rows, color, width, style, title) => {
      const s = c.addSeries(LightweightCharts.LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, title });
      s.setData(yearPoints(rows, key));
    };
    add(ref, U.cssVar("--ink-3"), 2, 2, "référence");
    if (cas) {
      add(cas.defavorable, U.cssVar("--fr-l2"), 1, 1, "défavorable");
      add(cas.central, U.cssVar("--acc"), 2, 0, "central");
      add(cas.favorable, U.cssVar("--fr-l3"), 1, 1, "favorable");
    }
    c.timeScale().fitContent();
  }

  function hypotheses(h) {
    const p = U.panel("Hypothèses (les mêmes pour tous)", { sub: "Chaque valeur renvoie à sa source." });
    const rows = [];
    const src = (s) => { const span = U.el("span"); (s || []).forEach((x, i) => span.append(link(x.titre || `source ${i + 1}`, x.url), document.createTextNode(" "))); return span; };
    if (h.pib_nominal_2026_md_eur) rows.push({ k: "PIB nominal 2026 (Md€), point de départ", v: String(h.pib_nominal_2026_md_eur.valeur), s: h.pib_nominal_2026_md_eur.sources });
    if (h.taux_nouvelle_dette) rows.push({ k: "Taux des nouveaux emprunts (%)", v: `${h.taux_nouvelle_dette.bas} / ${h.taux_nouvelle_dette.central} / ${h.taux_nouvelle_dette.haut}`, s: h.taux_nouvelle_dette.sources });
    const sc = h.sensibilite_charge_interets;
    if (sc && sc.md_eur_par_point) rows.push({ k: "Charge d'intérêts pour +1 point sur tous les taux (Md€)", v: `an 1 : ${sc.md_eur_par_point.annee_1} ; an 2 : ${sc.md_eur_par_point.annee_2}`, s: sc.sources });
    if (sc && sc.hypothese) rows.push({ k: "Hypothèse (non publiée) : au-delà de l'an 2", v: sc.hypothese, s: [] });
    if (h.semi_elasticite_solde) rows.push({ k: "Semi-élasticité du solde", v: String(h.semi_elasticite_solde.valeur), s: h.semi_elasticite_solde.sources });
    for (const [t, m] of Object.entries(h.multiplicateurs || {})) if (m && typeof m === "object") rows.push({ k: `Multiplicateur : ${TYPE[t] || t}`, v: `${m.bas} / ${m.central} / ${m.haut}`, s: m.sources });
    if (h.prime_de_risque) { const b = h.prime_de_risque.bp_par_point_de_deficit; rows.push({ k: "Prime de risque (pb par point de déficit, sur tous les emprunts nouveaux)", v: `${b.bas} / ${b.central} / ${b.haut}`, s: h.prime_de_risque.sources }); }
    p.body.append(U.table(rows, [["k", "Hypothèse"], ["v", "Valeur (bas / central / haut)"], ["s", "Sources", (v) => src(v)]]));
    p.body.append(U.el("p", "muted", "Fourchette : pour chaque hypothèse, le cas favorable prend la valeur qui allège la dette dans le sens du montant concerné (multiplicateur haut pour un coût, bas pour une économie ; taux et prime selon le signe de la dette et du déficit supplémentaires) ; le cas défavorable prend l'inverse."));
    return p.el;
  }

  // Curseurs d'hypothèses (portail local) : valeurs imposées, gardées d'un candidat à l'autre pendant la session pour
  // que tous soient lus avec les mêmes hypothèses. Vide = hypothèses sourcées (la référence).
  let surcharges = {};
  let CURS = [];  // description des curseurs (/api/france/projections)
  const fmtCur = (c, v) => (c.pas >= 1 ? U.nf0 : c.pas >= 0.1 ? U.nf1 : U.nf2).format(v);

  function curseurs(s, onChange) {
    const online = !!window.MASTER_STATIC;
    const p = U.panel("Curseurs d'hypothèses", { sub: online
      ? "Version en ligne : fourchettes précalculées avec les hypothèses sourcées ; curseurs sur le portail local seulement."
      : "Une valeur choisie s'applique aux trois cas (favorable, central, défavorable) et à tous les candidats ; les autres hypothèses restent sourcées." });
    if (online) p.body.append(U.callout("info", "Curseurs désactivés en ligne.", "La version en ligne est un instantané en lecture seule : le moteur de simulation tourne sur le portail local, qui seul peut recalculer avec d'autres hypothèses."));
    const grid = U.el("div", "fr-cur");
    const inputs = [];
    for (const c of s.curseurs || []) {
      const id = `fr-cur-${c.id}`;
      const lab = U.el("label", null, c.libelle);
      lab.htmlFor = id;
      const r = U.el("input");
      r.type = "range"; r.id = id; r.min = String(c.min); r.max = String(c.max); r.step = String(c.pas);
      r.value = String(c.id in surcharges ? surcharges[c.id] : c.sourcee.central);
      r.disabled = online;
      r.dataset.cur = c.id;
      const val = U.el("output", "fr-cur-v", fmtCur(c, Number(r.value)));
      val.htmlFor = id;
      const src = U.el("span", "muted", `sourcé : ${fmtCur(c, c.sourcee.bas)} / ${fmtCur(c, c.sourcee.central)} / ${fmtCur(c, c.sourcee.haut)}`);
      r.addEventListener("input", () => { val.textContent = fmtCur(c, Number(r.value)); });
      r.addEventListener("change", () => { surcharges[c.id] = Number(r.value); val.classList.add("fr-cur-mod"); onChange(); });
      if (c.id in surcharges) val.classList.add("fr-cur-mod");
      inputs.push([r, val, c]);
      grid.append(lab, r, val, src);
    }
    p.body.append(grid);
    const reset = U.el("button", "fr-cur-reset", "Revenir aux hypothèses sourcées");
    reset.type = "button";
    reset.disabled = online;
    reset.addEventListener("click", () => {
      surcharges = {};
      for (const [r, val, c] of inputs) { r.value = String(c.sourcee.central); val.textContent = fmtCur(c, c.sourcee.central); val.classList.remove("fr-cur-mod"); }
      onChange();
    });
    p.body.append(reset);
    return p.el;
  }

  function projectionUrl(cid, ref, annonces, jeu) {  // ordre des paramètres = adresses de l'instantané en ligne
    const q = new URLSearchParams();
    const mod = Object.keys(surcharges).length;
    const indep = jeu && jeu !== "candidat";
    if (ref !== "officielle" || annonces || mod || indep) { q.set("reference", ref); q.set("annonces", annonces ? "1" : "0"); }
    if (indep) q.set("jeu", jeu);
    for (const [k, v] of Object.entries(surcharges)) q.set(k, String(v));
    const qs = q.toString();
    return `/api/france/projection/${encodeURIComponent(cid)}${qs ? `?${qs}` : ""}`;
  }

  async function parCandidat(root, s, [cid0, ref0, ann0, jeu0]) {
    const ref = REFS.some(([k]) => k === ref0) && s.references[ref0] ? ref0 : "officielle";
    const annonces = ann0 === "annonces";
    const jeu = JEUX.some(([k]) => k === jeu0) ? jeu0 : "candidat";
    const cid = s.candidats.some((c) => c.id === cid0) ? cid0 : null;
    const go = (c, r, a, j) => { location.hash = `#france/projections/candidat/${encodeURIComponent(c || "")}/${r}/${a ? "annonces" : "engagements"}/${j || jeu}`; };
    const controls = U.el("div", "fr-controls");
    const sel = U.el("select", "fr-select");
    sel.setAttribute("aria-label", "Candidat");
    sel.append(new Option("Choisir un candidat", ""));
    for (const c of s.candidats) {
      const n = annonces && c.mesures_chiffrees_annonces != null ? c.mesures_chiffrees_annonces : c.mesures_chiffrees;
      sel.append(new Option(`${c.nom} · ${n} mesure${n > 1 ? "s" : ""} chiffrée${n > 1 ? "s" : ""}`, c.id));
    }
    sel.value = cid || "";
    sel.onchange = () => go(sel.value, ref, annonces);
    controls.append(sel, U.seg(REFS.filter(([k]) => s.references[k]), ref, (v) => go(cid, v, annonces), "Référence"),
      U.seg([["engagements", "Engagements"], ["annonces", "+ annonces"]], annonces ? "annonces" : "engagements", (v) => go(cid, ref, v === "annonces"), "Mesures"),
      U.seg(JEUX, jeu, (v) => go(cid, ref, annonces, v), "Chiffrage"));
    root.append(controls, U.callout("info", "Jeux de chiffrage.", JEU_AIDE));
    const R = s.references[ref];
    if (R.note) root.append(U.callout("info", "Référence.", R.note));
    const out = U.el("div", "fr-body");
    let seq = 0;
    async function refresh() {
      const mine = ++seq;  // un curseur bougé deux fois de suite : seule la dernière réponse est affichée
      let d = null, err = null, identique = false;
      if (cid) {
        try {
          d = await U.api(projectionUrl(cid, ref, annonces, "candidat"));
          // Sans chiffrage indépendant rattaché à une mesure simulable, les trois jeux sont identiques : pas de nouvelle requête.
          if (jeu !== "candidat" && d.mesures_avec_independant) d = await U.api(projectionUrl(cid, ref, annonces, jeu));
          else identique = jeu !== "candidat";
        } catch (e) { err = e; d = null; }
      }
      if (mine !== seq) return;
      out.replaceChildren();
      if (err) out.append(U.callout("info", "Projection indisponible", window.MASTER_STATIC ? "Cette projection n'est pas dans l'instantané en ligne." : err.message));
      render(out, R, d, identique, jeu);
    }
    if (cid && s.curseurs && s.curseurs.length) root.append(curseurs(s, refresh));
    root.append(out);
    await refresh();
    const pr = U.panel(`Référence : ${R.titre || ref}`, { sub: "Sources de la trajectoire de référence." });
    for (const x of R.sources || []) { const p = U.el("p"); p.append(link(x.titre || "source", x.url), document.createTextNode(x.date ? ` · ${srcDate(x.date)}` : "")); pr.body.append(p); }
    const hl = U.el("p", "fr-src-line");
    const a = U.el("a", "fr-link", "Hypothèses de la simulation et leurs sources →");
    a.href = "#france/projections/hypotheses";
    hl.append(a);
    root.append(pr.el, hl);
  }

  function render(root, R, d, identique, jeu) {
    if (d && d.candidat.surcharges && Object.keys(d.candidat.surcharges).length) {
      const names = {}; for (const c of CURS) names[c.id] = c;
      const txt = Object.entries(d.candidat.surcharges).map(([k, v]) => `${names[k] ? names[k].libelle : k} = ${names[k] ? fmtCur(names[k], v) : v}`).join(" ; ");
      root.append(U.callout("attention", "Hypothèses modifiées par les curseurs :", `${txt}. Les valeurs sourcées restent la référence (bouton « Revenir aux hypothèses sourcées »).`));
    }
    if (d && identique) root.append(U.callout("info", "Même trajectoire que le chiffrage du candidat.",
      `Aucune mesure simulée de ${d.nom} n'a de chiffrage indépendant 2027 rattaché à la date du relevé : le jeu « ${JEUX.find(([k]) => k === jeu)[1]} » reprend le chiffrage du candidat.`));
    const grid = U.el("div", "fr-grid");
    for (const [key, label] of [["dette_pib", "Dette publique (% du PIB)"], ["solde_pib", "Solde public (% du PIB, négatif = déficit)"]]) {
      const p = U.panel(label, { sub: d ? `${d.nom} — trait plein : central ; pointillés : favorable et défavorable ; tirets : référence` : "Référence seule (tirets) ; choisissez un candidat." });
      const box = U.el("div", "fr-chart fr-chart-lg");
      p.body.append(box);
      grid.append(p.el);
      requestAnimationFrame(() => chart(box, R.annees, d ? d.candidat.cas : null, key));
    }
    root.append(grid);
    if (d) {
      const c = d.candidat;
      if (!c.prises.length) root.append(U.callout("info", "Aucune mesure chiffrée.", c.avertissement));
      const idx = c.cas.central.map((r, i) => (r.annee >= 2027 ? i : -1)).filter((i) => i >= 0);
      const pe = U.panel("Effets par année", { sub: "Favorable / central / défavorable. Effet sur le niveau du PIB et intérêts supplémentaires par rapport à la référence." });
      pe.body.append(U.table(idx.map((i) => ({ i, annee: c.cas.central[i].annee })), [["annee", "Année"],
        ["i", "Effet sur le PIB (%)", (i) => range(c.cas, i, "effet_pib_pct", (v) => U.nf2.format(v))],
        ["i", "Intérêts supplémentaires (Md€)", (i) => range(c.cas, i, "interets_supp_md_eur", (v) => U.nf2.format(v))],
        ["i", "Solde (% du PIB)", (i) => range(c.cas, i, "solde_pib", (v) => U.nf1.format(v))],
        ["i", "Dette (% du PIB)", (i) => range(c.cas, i, "dette_pib", (v) => U.nf1.format(v))]], null, { empty: "Aucune année simulée." }));
      root.append(pe.el);
      const indep = (c.jeu || "candidat") !== "candidat";
      const pm = U.panel(`Mesures simulées (${c.prises.length})`, { sub: `Solde des mesures simulées (${indep ? JEUX.find(([k]) => k === c.jeu)[1].toLowerCase() : "chiffrage du candidat"}) : ${U.nf1.format(c.solde_mesures_md_eur)} Md€ par an (négatif = coût).` });
      const cols = [["resume", "Mesure"], ["type", "Type", (v) => TYPE[v] || v], ["cout_md_eur", "Md€ / an", (v) => U.nf1.format(v)]];
      if (indep) cols.push(["source_chiffrage", "Montant retenu", (v, r) => (v === "candidat" ? "candidat (aucun chiffrage indépendant)" : `${SOURCE[v] || v} (${r.n_independants} chiffrage${r.n_independants > 1 ? "s" : ""})`)],
        ["cout_candidat_md_eur", "Chiffrage du candidat", (v) => (v == null ? "non chiffrée" : U.nf1.format(v))]);
      else cols.push(["n_independants", "Chiffrages indépendants rattachés", (v) => (v ? String(v) : "aucun")]);
      pm.body.append(U.table(c.prises, cols, null, { empty: "Aucune mesure chiffrée." }));
      if (indep && (c.candidat_conserve || []).length) pm.body.append(U.callout("attention", `Chiffrage du candidat conservé pour ${c.candidat_conserve.length} mesure${c.candidat_conserve.length > 1 ? "s" : ""}.`,
        "Aucun chiffrage indépendant n'est rattaché à ces mesures : le montant du candidat est gardé tel quel (colonne « Montant retenu »)."));
      const pn = U.panel(`Non chiffrées (${c.non_chiffrees.length})`, { sub: "Mesures sans coût donné par le candidat : non simulées, jamais comptées à zéro." });
      pn.body.append(U.table(c.non_chiffrees, [["resume", "Mesure"], ["theme", "Thème"]], null, { empty: "Aucune." }));
      root.append(pm.el, pn.el);
      if (d.independants.length) {
        const pi = U.panel("Chiffrages indépendants du programme", { sub: "Solde net du programme selon l'institut (positif = économie), simulé avec le même moteur, comme une dépense courante, en totalité dès 2027." });
        const last = (x) => x.cas.central.length - 1;
        pi.body.append(U.table(d.independants, [["institut", "Institut"], ["mesure", "Chiffrage"], ["horizon", "Horizon"],
          ["montant_md_eur", "Md€ / an", (v) => U.nf1.format(v)],
          ["cas", "Dette finale (fav. / central / déf.)", (v, x) => `${range(v, last(x), "dette_pib", (y) => U.nf1.format(y))} %`],
          ["source", "Source", (v) => link("source", v)]]));
        root.append(pi.el);
      }
      if ((d.independants_non_simules || []).length) {
        const pn2 = U.panel("Chiffrages indépendants du programme non simulés", { sub: "Montant d'une seule année, ou écart à une autre référence : affiché, pas simulé comme un montant annuel." });
        pn2.body.append(U.table(d.independants_non_simules, [["institut", "Institut"], ["mesure", "Chiffrage"], ["horizon", "Horizon"],
          ["montant_md_eur", "Md€", (v) => U.nf1.format(v)], ["source", "Source", (v) => link("source", v)]]));
        root.append(pn2.el);
      }
    }
  }

  // ------------------------------------------------------------ vue d'ensemble
  async function ensemble(root, s, [ann0]) {
    const annonces = ann0 === "annonces";
    root.append(U.el("div", "fr-controls"));
    root.lastChild.append(U.seg([["engagements", "Engagements"], ["annonces", "+ annonces"]], annonces ? "annonces" : "engagements",
      (v) => { location.hash = `#france/projections/ensemble/${v}`; }, "Mesures"));
    const R = s.references.officielle;
    const last = R && R.annees.length ? R.annees[R.annees.length - 1] : null;
    const annee = (s.candidats.find((c) => c.fin) || {}).fin;
    const fy = annee ? annee.annee : last ? last.annee : "—";
    if (last) root.append(U.callout("info", `Référence (${R.titre || "trajectoire du gouvernement"}) en ${last.annee} :`,
      `dette ${U.nf1.format(last.dette_pib)} % du PIB, solde ${U.nf1.format(last.solde_pib)} % du PIB. Les candidats sont simulés face à cette référence.`));
    const pct = (v) => (v == null ? "—" : `${U.nf1.format(v)} %`);
    const two = (o) => (o ? `${pct(o.favorable)} / ${pct(o.defavorable)}` : "—");
    const rows = s.candidats.map((c) => {
      const f = annonces ? c.fin_annonces : c.fin;
      const n = annonces && c.mesures_chiffrees_annonces != null ? c.mesures_chiffrees_annonces : c.mesures_chiffrees;
      const nc = annonces && c.non_chiffrees_annonces != null ? c.non_chiffrees_annonces : c.non_chiffrees;
      return { ...c, n, nc, dc: f ? f.dette_pib.central : null, dr: f ? f.dette_pib : null, sc: f ? f.solde_pib.central : null, sr: f ? f.solde_pib : null,
        note: n ? "" : "aucune mesure chiffrée : référence" };
    });
    const p = U.panel(`Tous les candidats du registre (${rows.length}) : dette et solde en ${fy}`,
      { sub: `Référence officielle, ${annonces ? "engagements et annonces" : "engagements seulement"}. Ordre du registre, jamais trié par résultat. Cliquez sur une ligne pour le détail.` });
    const go = (c) => { location.hash = `#france/projections/candidat/${encodeURIComponent(c.id)}/officielle/${annonces ? "annonces" : "engagements"}`; };
    p.body.append(U.table(rows, [
      ["nom", "Candidat", (v, r) => { const a = U.el("a", "fr-link", v); a.href = `#france/projections/candidat/${encodeURIComponent(r.id)}/officielle/${annonces ? "annonces" : "engagements"}`; return a; }],
      ["dc", `Dette ${fy}, central`, pct], ["dr", "Favorable / défavorable", two],
      ["sc", `Solde ${fy}, central`, pct], ["sr", "Favorable / défavorable", two],
      ["n", "Mesures simulées"], ["nc", "Non chiffrées"], ["mesures_avec_independant", "Avec chiffrage indépendant", (v) => (v == null ? "—" : String(v))],
      ["note", "Remarque"]], go, { empty: "Aucun candidat dans le registre." }));
    root.append(p.el);
  }

  // ------------------------------------------------------------ hypothèses
  function hypothesesView(root, s) {
    root.append(hypotheses(s.hypotheses));
    for (const [k, label] of REFS) {
      const R = s.references[k];
      if (!R) continue;
      const pr = U.panel(`Référence : ${R.titre || label}`, { sub: label });
      if (R.note) pr.body.append(U.el("p", "muted", R.note));
      for (const x of R.sources || []) { const p = U.el("p"); p.append(link(x.titre || "source", x.url), document.createTextNode(x.date ? ` · ${srcDate(x.date)}` : "")); pr.body.append(p); }
      root.append(pr.el);
    }
  }

  // ------------------------------------------------------------ onglet
  function route() {  // [sous-vue, paramètres] ; les anciennes adresses #france/projections/<id>/… ouvrent « Par candidat »
    const ps = parts();
    if (SUBS.some(([k]) => k === ps[0])) return [ps[0], ps.slice(1)];
    if (ps[0] || ps.length > 1) return ["candidat", ps];
    return ["ensemble", []];
  }

  async function projections(root) {
    U = window.MASTER_UI;
    const [sub, rest] = route();
    root.append(U.seg(SUBS, sub, (v) => { location.hash = `#france/projections/${v}`; }, "Projections"));
    const body = U.el("div", "fr-body");
    root.append(body);
    if (sub === "salaire") {
      const view = (window.MASTER_FRANCE_PROJ_VIEWS || {}).salaire;
      if (view) await view(body); else body.append(U.callout("info", "Calculateur indisponible", "Le calculateur de salaire n'est pas chargé."));
      return;
    }
    let s;
    try { s = await U.api("/api/france/projections"); } catch (e) {
      body.append(U.callout("info", "Projections indisponibles", "Les paramètres de la simulation ne sont pas encore chargés.")); return;
    }
    body.append(U.callout("attention", "Simulation à hypothèses, pas une prévision.", PREVISION));
    CURS = s.curseurs || [];
    if (sub === "ensemble") await ensemble(body, s, rest);
    else if (sub === "hypotheses") hypothesesView(body, s);
    else await parCandidat(body, s, rest);
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { projections });
})();
