/* Master — onglet « Candidats » de la rubrique France politique (france.js) : liste et règle d'inclusion, fiche de
   chaque candidat (programme mesure par mesure avec citation exacte, source et vérification automatique ; mandats,
   soutiens, chiffrages, sondages, couverture médiatique, votes à l'Assemblée et au Sénat), comparateur par thème, sondages.
   Même gabarit pour tous les candidats. Programmes relevés par IA, non relus : affiché sur chaque fiche. */
(() => {
  "use strict";
  const THEMES = { economie: "Économie", finances_publiques: "Finances publiques", fiscalite: "Fiscalité",
    emploi_travail: "Emploi et travail", retraites: "Retraites", sante: "Santé", education: "Éducation", logement: "Logement",
    securite_justice: "Sécurité et justice", immigration: "Immigration", ecologie_energie: "Écologie et énergie",
    agriculture: "Agriculture", institutions: "Institutions", europe_international: "Europe et international",
    defense: "Défense", social_famille: "Social et famille", culture_numerique: "Culture et numérique", autre: "Autre" };
  const STATUT = { engagement: "engagement (programme écrit)", annonce: "annonce (discours, entretien)", piste: "piste (évoquée)" };
  const CHECK = { verifiee: ["ok", "citation retrouvée dans la source"], introuvable: ["warn", "citation non retrouvée automatiquement dans la page"],
    illisible: ["neutral", "source illisible automatiquement"] };
  const SUBS = [["liste", "Liste"], ["explorer", "Explorer"], ["comparer", "Comparer"], ["sondages", "Sondages"]];
  const LINES = 8;  // palette catégorielle validée (paires adjacentes) : au plus 8 courbes
  let U = null;

  const parts = () => location.hash.slice(1).split("/").slice(2).map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
  function link(text, href, cls) {
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", cls || null, text);
    const a = U.el("a", cls || "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }
  const nav = (cur) => U.seg(SUBS, cur, (v) => { location.hash = v === "liste" ? "#france/candidats" : `#france/candidats/${v}`; }, "Vue");
  // Montant d'un chiffrage : convention négatif = coût pour les finances publiques, positif = économie ou recette.
  const montant = (v) => `${v < 0 ? "coût" : v > 0 ? "économie ou recette" : "effet nul"} de ${U.nf1.format(Math.abs(v))} Md€`;
  function chiffrageLigne(x, tete) {  // un chiffrage indépendant rattaché à la mesure, sous la mesure
    const p = U.el("p", "muted fr-src-line fr-chiffrage-mesure");
    p.append(document.createTextNode(`${tete} : ${x.institut}, ${montant(x.montant_md_eur)} (${x.horizon})${x.date ? `, ${U.dmy(x.date)}` : ""} · `),
      link("source", x.source));
    return p;
  }

  async function liste(root) {
    const [reg, cmp, polls] = await Promise.all([U.api("/api/france/candidats"), U.api("/api/france/comparateur").catch(() => ({ candidats: {} })),
      U.api("/api/france/sondages").catch(() => ({ candidats: {} }))]);
    root.append(nav("liste"), U.callout("info", "Règle d'inclusion.", reg.regle));
    if (reg.erreurs.length) root.append(U.callout("erreur", "Entrées écartées du registre :", reg.erreurs.join(" · ")));
    const since = (c) => (c.depuis_precision === "attesté" ? `attesté au ${U.dmy(c.depuis)}` : c.depuis_precision === "mois" ? c.depuis.slice(0, 7).split("-").reverse().join("/") : U.dmy(c.depuis));
    const rows = reg.candidats.map((c) => ({ ...c, mesures: (cmp.candidats[c.id] || {}).mesures || 0, moyenne: (polls.candidats[c.id] || {}).moyenne,
      marge: (polls.candidats[c.id] || {}).marge_pts }));
    const cols = [["nom", "Nom", (v, r) => { const a = U.el("a", "fr-link", v); a.href = `#france/candidats/${encodeURIComponent(r.id)}`; return a; }],
      ["parti", "Parti"], ["depuis", "Depuis", (_, c) => since(c)], ["mesures", "Mesures relevées"],
      ["moyenne", "Sondages (moyenne 30 j)", (v, r) => (v == null ? "—" : `${U.nf1.format(v)} %${r.marge != null ? ` (± ${U.nf1.format(r.marge)})` : ""}`)],
      ["source", "Source", (v) => link("source", v)]];
    const p = U.panel(`Candidats (${rows.length})`, { sub: "Cliquez un nom pour ouvrir sa fiche. Même gabarit pour tous." });
    p.body.append(U.table(rows, cols, null, { empty: "Aucun candidat enregistré." }));
    root.append(p.el);
    if (reg.autres.length) {
      const o = U.panel(`Autres (${reg.autres.length})`, { sub: "Retirés, ou pas encore dans la règle" });
      o.body.append(U.table(reg.autres, [cols[0], cols[1], ["raison", "Pourquoi"], cols[5]]));
      root.append(o.el);
    }
  }

  function mesure(m, cid) {  // cid : candidat de la mesure, pour le lien « Creuser » vers son dossier
    const c = U.el("article", "fr-mesure");
    const h = U.el("div", "fr-sujet-h");
    h.append(U.el("span", "fr-tag", STATUT[m.statut] || m.statut));
    const chk = CHECK[m.verification];
    h.append(chk ? U.status(chk[0], chk[1]) : U.status("neutral", "non vérifiée"));
    if (m.anterieure) h.append(U.status("neutral", "source antérieure à la campagne 2027"));
    c.append(h, U.el("p", "fr-resume", m.resume));
    c.append(U.el("blockquote", "fr-citation", m.citation));
    const f = U.el("p", "muted fr-src-line");
    f.append(link("source", m.source), document.createTextNode(` · ${m.date ? U.dmy(m.date) : "source non datée"}`));
    if (m.connu_depuis) f.append(document.createTextNode(` · relevée le ${U.dmy(m.connu_depuis)}`));
    if (m.remplace_le) f.append(document.createTextNode(` · version remplacée le ${U.dmy(m.remplace_le)}`));
    if (m.retiree_le) f.append(document.createTextNode(` · absente du relevé du ${U.dmy(m.retiree_le)}`));
    if (m.cout_candidat_md_eur != null) {
      const v = m.cout_candidat_md_eur;  // convention : négatif = coût pour les finances publiques
      const sens = v < 0 ? "coût" : v > 0 ? "économie ou recette" : "effet nul";
      f.append(document.createTextNode(` · chiffrage du candidat : ${sens} de ${U.nf1.format(Math.abs(v))} Md€`));
    }
    const who = cid || m.candidat;
    if (who && m.id) {
      const a = U.el("a", "fr-link fr-creuser", "Creuser");
      a.href = `#france/candidats/${encodeURIComponent(who)}/mesure/${encodeURIComponent(m.id)}`;
      f.append(document.createTextNode(" · "), a);
    }
    c.append(f);
    for (const x of m.chiffrages_independants || []) c.append(chiffrageLigne(x, "Chiffrage indépendant"));
    for (const x of m.chiffrages_anterieurs || []) c.append(chiffrageLigne(x, `Chiffrage d'une version antérieure (${x.periode || "campagne précédente"})`));
    return c;
  }

  function lineChart(box, series, names) {
    if (!window.LightweightCharts) return;
    const chart = LightweightCharts.createChart(box, U.chartTheme());
    series.forEach(([id, pts], i) => {
      const s = chart.addSeries(LightweightCharts.LineSeries, { color: U.cssVar(`--fr-l${(i % LINES) + 1}`), lineWidth: 2,
        priceLineVisible: false, lastValueVisible: true, title: names[id] || id });
      const byDay = new Map(pts.map(([d, v]) => [d, v]));  // un point par jour (dernier sondage du jour)
      s.setData([...byDay.entries()].sort().map(([d, v]) => ({ time: d, value: v })));
    });
    chart.timeScale().fitContent();
  }

  function versionBar(f, cid, horsLigne) {  // sélecteur de date : « ce que proposait X le 1er décembre », tel que relevé
    const box = U.el("div", "fr-versions");
    const go = (d) => { location.hash = d ? `#france/candidats/${encodeURIComponent(cid)}/date/${d}` : `#france/candidats/${encodeURIComponent(cid)}`; };
    const row = U.el("div", "fr-controls");
    const lab = U.el("label", "muted", "Programme tel que relevé le ");
    const inp = U.el("input", "fr-select fr-version-date");
    inp.type = "date";
    inp.min = f.premier_releve || "";
    inp.max = new Date().toISOString().slice(0, 10);
    inp.value = f.date_programme || "";
    inp.setAttribute("aria-label", "Date du programme");
    inp.onchange = () => { if (/^\d{4}-\d{2}-\d{2}$/.test(inp.value)) go(inp.value); };
    lab.append(inp);
    row.append(lab);
    if (f.date_programme) {
      const b = U.el("button", "fr-leg", "Version actuelle");
      b.type = "button";
      b.onclick = () => go(null);
      row.append(b);
    }
    box.append(row);
    const vs = (f.versions || []).map((d) => U.dmy(d)).join(", ");
    box.append(U.el("p", "muted", `Versions relevées : ${vs || "aucune"}. Une mesure modifiée garde sa version précédente ; une mesure disparue reste consultable aux dates où elle était relevée. C'est le programme connu du Master à cette date (date du relevé), pas la date à laquelle le candidat l'a proposé.`));
    if (horsLigne) box.append(U.callout("info", "Programme du jour seulement.", "La version en ligne ne reconstitue pas un programme passé : ouvrez le portail local pour choisir une date."));
    return box;
  }

  // Programme à une date (#france/candidats/<id>/date/AAAA-MM-JJ) : calculé par le portail local ; en ligne, la fiche
  // du jour seulement, et c'est dit.
  async function fiche(root, id, cible, date) {  // cible : identifiant de mesure (#france/candidats/<id>/<mesure>, lien du diagnostic)
    const base = `/api/france/candidat/${encodeURIComponent(id)}`;
    let f, horsLigne = false;
    try { f = await U.api(date ? `${base}?date=${encodeURIComponent(date)}` : base); } catch (e) {
      if (date && window.MASTER_STATIC) {
        horsLigne = true;
        try { f = await U.api(base); } catch (e2) { root.append(nav("liste"), U.callout("erreur", "Fiche introuvable", e2.message)); return; }
      } else { root.append(nav("liste"), U.callout(date ? "info" : "erreur", date ? "Date refusée" : "Fiche introuvable", e.message)); return; }
    }
    const c = f.candidat;
    root.append(nav("liste"));
    const head = U.panel(c.nom, { sub: `${c.parti} · ${c.statut === "declare" ? "déclaré·e" : c.statut}` });
    head.body.append(U.callout("ia", "Programme relevé par IA.", f.releve));
    if (f.programme && f.programme.url) head.body.append(U.el("p", null, ""), link(`Programme : ${f.programme.titre || "document du candidat"}`, f.programme.url));
    else head.body.append(U.el("p", "muted", "Aucun programme complet publié à la date du relevé."));
    if (f.recherche && f.recherche.note) head.body.append(U.el("p", "muted", `Recherche du ${U.dmy(f.recherche.date)} : ${f.recherche.note}`));
    root.append(head.el);
    const grid = U.el("div", "fr-grid");
    const marge = f.sondages.marge_pts != null ? `, marge indicative ± ${U.nf1.format(f.sondages.marge_pts)} point` : "";
    const ps = U.panel("Sondages", { sub: f.sondages.masque ? f.sondages.message : f.sondages.moyenne == null ? "Aucun sondage dans les 30 derniers jours."
      : `Moyenne 30 jours : ${U.nf1.format(f.sondages.moyenne)} % (${f.sondages.n_sondages} sondages${marge})` });
    if (f.sondages.serie.length) { const box = U.el("div", "fr-chart"); ps.body.append(box); requestAnimationFrame(() => lineChart(box, [[c.id, f.sondages.serie]], { [c.id]: c.nom })); }
    const pc = U.panel("Couverture médiatique", { sub: `${f.couverture.sujets} sujets sur ${f.couverture.total_sujets} dans les 7 derniers jours` });
    for (const s of f.couverture.derniers) pc.body.append(U.el("p", null, ""), link(s.titre, (s.articles[0] || {}).url));
    const pm = U.panel("Mandats et soutiens", { sub: "Chaque ligne renvoie à sa source." });
    for (const m of f.mandats) { const p = U.el("p"); p.append(document.createTextNode(`${m.fonction} (depuis ${m.depuis}) · `), link("source", m.source)); pm.body.append(p); }
    for (const s of f.soutiens) { const p = U.el("p"); p.append(document.createTextNode(`Soutien : ${s.nom} · `), link("source", s.source)); pm.body.append(p); }
    if (!f.mandats.length && !f.soutiens.length) pm.body.append(U.el("p", "muted", "Rien de relevé."));
    grid.append(ps.el, pc.el, pm.el);
    root.append(grid);
    if (f.votes.length) {
      const pv = U.panel(`Votes à l'Assemblée (${f.votes.length})`, { sub: "Scrutins marquants ; « absent » : ne figure dans aucune liste publiée." });
      pv.body.append(U.table(f.votes, [["date", "Date", (v) => U.dmy(v)], ["titre", "Scrutin", (v, r) => link(v, r.url)],
        ["vote", "Vote", (v, r) => `${v}${r.delegation ? " (délégation)" : ""}`], ["sort", "Résultat"]]));
      root.append(pv.el);
    }
    if ((f.votes_senat || []).length) {
      const pvs = U.panel(`Votes au Sénat (${f.votes_senat.length})`, { sub: "Scrutins marquants du Sénat ; vote tel que publié, délégation et statut (président de séance…) signalés ; « n'a pas pris part au vote » : ne figure pas dans la liste." });
      pvs.body.append(U.table(f.votes_senat, [["date", "Date", (v) => U.dmy(v)], ["titre", "Scrutin", (v, r) => link(v, r.url)],
        ["vote", "Vote", (v, r) => `${v}${r.delegation ? " (délégation)" : ""}${r.statut ? ` (${r.statut})` : ""}`], ["sort", "Résultat"]]));
      root.append(pvs.el);
    }
    // Toujours affiché, même vide : chaque fiche montre le même panneau.
    const pch = U.panel("Chiffrages indépendants", { sub: "Négatif : coût pour les finances publiques ; positif : économie ou recette. Un chiffrage rattaché à une mesure s'affiche aussi sous cette mesure." });
    const rch = f.chiffrages_recherche || {};
    const lien = (mid) => { if (!mid) return U.el("span", "muted", "—"); const a = U.el("a", "fr-link", mid); a.href = `#france/candidats/${encodeURIComponent(c.id)}/${encodeURIComponent(mid)}`; return a; };
    const cols = [["mesure", "Chiffrage"], ["mesure_id", "Mesure du programme", (v) => lien(v)], ["institut", "Institut"],
      ["montant_md_eur", "Md€", (v) => U.nf1.format(v)], ["horizon", "Horizon"], ["source", "Source", (v) => link("source", v)]];
    if (f.chiffrages.length) pch.body.append(U.table(f.chiffrages, cols));
    else pch.body.append(U.el("p", "muted", `Aucun chiffrage indépendant publié pendant la campagne 2027 trouvé au ${U.dmy(rch.date || "2026-10-26")}.`));
    if ((f.chiffrages_anterieurs || []).length) {
      pch.body.append(U.el("h3", "fr-theme-h", `Chiffrages d'une version antérieure de la mesure (${f.chiffrages_anterieurs.length})`),
        U.el("p", "muted", "Campagne précédente (présidentielle 2022, ou législatives 2024 de la coalition du parti) : autre version de la mesure, affichée pour information, jamais utilisée dans les projections."),
        U.table(f.chiffrages_anterieurs, [cols[0], cols[1], ["periode", "Campagne"], cols[2], cols[3], cols[4], cols[5]]));
    }
    if ((rch.requetes || []).length) pch.body.append(U.el("p", "muted", `Recherche du ${U.dmy(rch.date)}, mêmes requêtes pour chaque candidat : ${rch.requetes.map((q) => `« ${q} »`).join(", ")}, puis les publications des instituts.`));
    if ((f.chiffrages_erreurs || []).length) pch.body.append(U.callout("attention", "Chiffrages écartés (format invalide) :", f.chiffrages_erreurs.join(" · ")));
    pch.body.append(U.el("p", "muted", "Relevé limité aux instituts et think tanks publiant une méthode ; leur absence ne dit rien du sérieux du programme."));
    root.append(pch.el);
    const byTheme = {};
    for (const m of f.mesures) (byTheme[m.theme] = byTheme[m.theme] || []).push(m);
    const quand = f.date_programme ? ` au ${U.dmy(f.date_programme)}` : "";
    const pp = U.panel(`Programme${quand} : ${f.mesures.length} mesures relevées`, { sub: "Résumé neutre, citation exacte, source, date, statut et vérification automatique de la citation." });
    pp.body.append(versionBar(f, c.id, horsLigne));
    if (f.mesures.some((m) => m.cout_candidat_md_eur != null)) pp.body.append(U.callout("attention", "Les chiffrages ne s'additionnent pas.",
      "Ce sont les montants annoncés par le candidat : un objectif d'ensemble peut englober d'autres mesures de la liste, et les horizons diffèrent (par an, première année, quinquennat)."));
    if (!f.mesures.length) pp.body.append(U.el("p", "muted", f.date_programme && f.date_programme < f.premier_releve
      ? `Aucun relevé avant le ${U.dmy(f.premier_releve)} : le Master ne sait pas ce que proposait ce candidat à cette date.` : "Aucune mesure relevée."));
    for (const t of Object.keys(THEMES)) {
      if (!byTheme[t]) continue;
      pp.body.append(U.el("h3", "fr-theme-h", `${THEMES[t]} (${byTheme[t].length})`));
      for (const m of byTheme[t]) { const a = mesure(m, c.id); a.id = `fr-mesure-${m.id}`; pp.body.append(a); }
    }
    if (f.erreurs.length) pp.body.append(U.callout("attention", "Mesures écartées (format invalide) :", f.erreurs.join(" · ")));
    root.append(pp.el);
    const target = cible ? document.getElementById(`fr-mesure-${cible}`) : null;
    if (target) { target.classList.add("fr-cible"); requestAnimationFrame(() => target.scrollIntoView({ block: "center" })); }
  }

  async function comparer(root) {
    const [, theme0, ids0] = parts();
    const [reg, cmp] = await Promise.all([U.api("/api/france/candidats"), U.api("/api/france/comparateur")]);
    root.append(nav("comparer"));
    const theme = THEMES[theme0] ? theme0 : "retraites";
    const ids = (ids0 || "").split(",").filter((x) => cmp.candidats[x]).slice(0, 4);
    const go = (t, list) => { location.hash = `#france/candidats/comparer/${t}/${list.join(",")}`; };
    const controls = U.el("div", "fr-controls");
    const tsel = U.el("select", "fr-select");
    tsel.setAttribute("aria-label", "Thème");
    for (const [k, v] of Object.entries(THEMES)) tsel.append(new Option(v, k));
    tsel.value = theme;
    tsel.onchange = () => go(tsel.value, ids);
    controls.append(tsel);
    const picks = U.el("div", "fr-tags");
    for (const c of reg.candidats) {
      if (!cmp.candidats[c.id]) continue;
      const b = U.el("button", "fr-leg", `${c.nom} · ${(cmp.candidats[c.id].themes || {})[theme] || 0}`);
      b.type = "button";
      b.setAttribute("aria-pressed", String(ids.includes(c.id)));
      b.onclick = () => { const next = ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id].slice(-4); go(theme, next); };
      picks.append(b);
    }
    root.append(controls, U.el("p", "muted", "Choisissez de 2 à 4 candidats ; le chiffre indique leur nombre de mesures sur ce thème."), picks);
    if (ids.length < 2) { root.append(U.callout("info", "Comparateur", "Sélectionnez au moins deux candidats.")); return; }
    let d;
    try { d = await U.api(`/api/france/comparateur?theme=${encodeURIComponent(theme)}&ids=${ids.map(encodeURIComponent).join(",")}`); } catch (e) {
      root.append(U.callout("info", "Comparateur indisponible", window.MASTER_STATIC ? "La version en ligne ne propose pas de comparaison à la demande." : e.message)); return;
    }
    root.append(U.callout("ia", "Programmes relevés par IA.", d.releve || "Relevé par IA, non relu."));
    if (d.releve_leviers) root.append(U.callout("ia", "Levier du diagnostic rattaché par IA.", `${d.releve_leviers} : à vérifier mesure par mesure.`));
    root.append(U.callout("attention", "Coût net annoncé.", `${d.avertissement_cout || "Montants annoncés, ne s'additionnent pas toujours, horizons différents."} Somme des chiffrages donnés par le candidat pour les mesures de ce thème ; négatif : coût pour les finances publiques, positif : économie ou recette.`));
    const cols = U.el("div", "fr-compare");
    for (const c of d.candidats) {
      const p = U.panel(c.nom, { sub: `${THEMES[theme]} · ${c.mesures.length} mesure${c.mesures.length > 1 ? "s" : ""}` });
      p.body.append(coutNet(c.cout_net));
      if (!c.mesures.length) p.body.append(U.el("p", "muted", "Aucune mesure relevée sur ce thème."));
      for (const m of c.mesures) { const a = mesure(m, c.id); a.append(levierLigne(m.levier, d.releve_leviers)); p.body.append(a); }
      cols.append(p.el);
    }
    root.append(cols);
  }

  function coutNet(k) {  // somme des chiffrages du candidat sur le thème, et ce qui n'est pas chiffré (jamais compté à zéro)
    const box = U.el("p", "fr-cout-net");
    if (!k) return box;
    const n = (x, mot) => `${x} mesure${x > 1 ? "s" : ""} ${mot}${x > 1 ? "s" : ""}`;
    if (k.somme_md_eur == null) box.append(document.createTextNode("Coût net annoncé : aucune mesure chiffrée par le candidat sur ce thème"));
    else {
      const v = k.somme_md_eur;
      const sens = v < 0 ? "coût" : v > 0 ? "économie ou recette" : "effet nul";
      box.append(document.createTextNode(`Coût net annoncé des ${n(k.chiffrees, "chiffrée")} : ${sens} de ${U.nf1.format(Math.abs(v))} Md€`));
    }
    box.append(document.createTextNode(` · ${n(k.non_chiffrees, "non chiffrée")}.`));
    return box;
  }

  function levierLigne(lv, releve) {
    if (!lv) return U.el("p", "muted fr-levier-ligne", releve ? "Levier du diagnostic : aucun levier rattaché à cette mesure." : "Levier du diagnostic : rattachement non disponible.");
    const p = U.el("p", "fr-levier-ligne");
    p.append(U.el("span", "fr-tag", `Levier ${lv.levier}`), document.createTextNode(
      ` ${lv.titre} · ${lv.sens === "inverse" ? "en sens contraire du levier" : "dans le sens du levier"}`));
    if (lv.justification) p.append(U.el("span", "muted", ` · rapprochement (IA, non relu) : ${lv.justification}`));
    return p;
  }

  async function sondages(root) {
    const [d, reg] = await Promise.all([U.api("/api/france/sondages"), U.api("/api/france/candidats")]);
    const known = Object.fromEntries([...reg.candidats, ...reg.autres].map((c) => [c.id, c.nom]));
    // Personne testée dans des sondages sans être au registre : nom lisible tiré de l'identifiant, marqué comme tel.
    const pretty = (id) => `${id.split("-").map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w)).join(" ")} (non déclaré·e)`;
    const names = new Proxy(known, { get: (t, id) => (id in t ? t[id] : typeof id === "string" ? pretty(id) : undefined) });
    root.append(nav("sondages"));
    const tour = parts()[1] === "second-tour" ? "2" : "1";
    root.append(U.seg([["1", "1er tour"], ["2", "2nd tour"]], tour, (v) => { location.hash = v === "2" ? "#france/candidats/sondages/second-tour" : "#france/candidats/sondages"; }, "Tour"));
    if (d.masque) { root.append(U.callout("attention", null, d.message)); return; }
    if (tour === "2") return secondTour(root, d.second_tour || { duels: [] }, names);
    const meth = U.callout("info", "Méthode.", d.methode);
    if (d.commission_marge) {  // ce que dit la Commission des sondages de la marge d'erreur des sondages par quotas
      meth.querySelector("p").append(U.el("br"), document.createTextNode(`Commission des sondages : « ${d.commission_marge.citation} » `),
        link("notice", d.commission_marge.url));
    }
    root.append(meth);
    const ranked = Object.entries(d.candidats).filter(([, c]) => c.moyenne != null).sort((a, b) => b[1].moyenne - a[1].moyenne);
    const p = U.panel(`Intentions de vote au 1er tour : les ${Math.min(LINES, ranked.length)} premiers`, { sub: "Un point par sondage (moyenne des hypothèses où le candidat figure)." });
    const box = U.el("div", "fr-chart fr-chart-lg");
    p.body.append(box);
    root.append(p.el);
    requestAnimationFrame(() => lineChart(box, ranked.slice(0, LINES).map(([id, c]) => [id, c.serie]), names));
    const avg = U.panel("Moyennes 30 jours", { sub: "Tous les candidats testés." });
    avg.body.append(U.table(ranked.map(([id, c]) => ({ id, nom: names[id] || id, ...c })), [["nom", "Candidat"],
      ["moyenne", "Moyenne", (v) => `${U.nf1.format(v)} %`],
      ["marge_pts", "Marge indicative (95 %)", (v) => (v == null ? "inconnue" : `± ${U.nf1.format(v)} pt`)], ["n_sondages", "Sondages"]]));
    const list = U.panel(`Sondages relevés (${d.sondages.length})`, { sub: "Source primaire : notice de la Commission des sondages quand elle a été retrouvée. Marge max. : à 50 %, sur l'échantillon des inscrits (indicative, méthode des quotas)." });
    list.body.append(U.table(d.sondages, [["institut", "Institut"], ["terrain_fin", "Fin du terrain", (v) => U.dmy(v)],
      ["echantillon", "Échantillon", (v) => (v ? U.nf0.format(v) : "—")],
      ["marge_max_pts", "Marge max. (95 %)", (v) => (v == null ? "—" : `± ${U.nf1.format(v)} pt`)], ["hypotheses", "Hypothèses"],
      ["non_recoupees", "Recoupement", (v, r) => (r.collecte_le ? U.status("warn", `collecte automatique du ${U.dmy(r.collecte_le)} (chiffres de Wikipédia, non recoupés)`)
        : !r.source_primaire ? U.status("neutral", "pas de notice retrouvée (chiffres de Wikipédia)")
        : v ? U.status("warn", `${v} sur ${r.hypotheses} non recoupée${v > 1 ? "s" : ""} avec la notice (chiffres de Wikipédia)`)
        : U.status("ok", "recoupé avec la notice"))],
      ["source_primaire", "Source", (v, r) => link(v ? "notice" : r.publication_institut ? "publication" : "page de recensement", v || r.publication_institut || r.source)]]));
    root.append(avg.el, list.el);
  }

  const recoupe = (v, r) => (!r.source_primaire ? U.status("neutral", r.collecte_le ? "collecte automatique, pas de notice rattachée" : "pas de notice retrouvée")
    : v === false ? U.status("warn", "non recoupé avec la notice (chiffres de Wikipédia)") : U.status("ok", "recoupé avec la notice"));

  function secondTour(root, t2, names) {  // un panneau par duel, sondage par sondage ; aucun classement des duels
    root.append(U.callout("info", "Méthode.", t2.methode || "Hypothèses de second tour telles que publiées."));
    if (!t2.duels.length) { root.append(U.el("p", "muted", "Aucune hypothèse de second tour relevée.")); return; }
    const grid = U.el("div", "fr-duels");
    for (const duel of t2.duels) {
      const [a, b] = duel.candidats;
      const pct = (v) => `${U.nf1.format(v)} %`;
      const sub = duel.moyenne ? `Moyenne 30 jours : ${names[a]} ${pct(duel.moyenne[a])}, ${names[b]} ${pct(duel.moyenne[b])} (${duel.n_sondages} sondage${duel.n_sondages > 1 ? "s" : ""}${duel.marge_pts != null ? `, marge indicative ± ${U.nf1.format(duel.marge_pts)} pt` : ""})`
        : `Aucun sondage dans les 30 derniers jours (dernier : ${U.dmy(duel.dernier)}).`;
      const p = U.panel(`${names[a]} – ${names[b]}`, { sub });
      p.body.append(U.table(duel.sondages, [["institut", "Institut"], ["terrain_fin", "Fin du terrain", (v) => U.dmy(v)],
        ["echantillon", "Échantillon", (v) => (v ? U.nf0.format(v) : "—")],
        ["a", names[a], (_, r) => pct(r.scores[a])], ["b", names[b], (_, r) => pct(r.scores[b])],
        ["marge_max_pts", "Marge max. (95 %)", (v) => (v == null ? "—" : `± ${U.nf1.format(v)} pt`)],
        ["recoupe_notice", "Recoupement", recoupe],
        ["source_primaire", "Source", (v, r) => link(v ? "notice" : r.publication_institut ? "publication" : "page de recensement", v || r.publication_institut || r.source)]]));
      grid.append(p.el);
    }
    root.append(U.el("p", "muted", `${t2.n_sondages} sondages avec au moins une hypothèse de second tour. Les duels sont ceux que les instituts ont testés : ils ne disent pas qui sera qualifié.`), grid);
  }

  async function candidats(root) {
    U = window.MASTER_UI;
    const [sub, kind, mid] = parts();
    const X = window.MASTER_FRANCE_EXPLORER;  // france-explorer.js : Explorer et dossier d'une mesure
    if (!sub) return liste(root);
    if (sub === "explorer" && X) return X.explorer(root, nav("explorer"));
    if (kind === "mesure" && X) return X.dossier(root, nav("liste"), sub, mid);
    if (sub === "comparer") return comparer(root);
    if (sub === "sondages") return sondages(root);
    if (kind === "date") return fiche(root, sub, null, /^\d{4}-\d{2}-\d{2}$/.test(mid || "") ? mid : null);
    return fiche(root, sub, kind);  // #france/candidats/<id>/<mesure> : fiche, mesure ciblée (diagnostic)
  }
  // Repris par france-explorer.js, y compris depuis l'onglet Interroger (U pas encore posé par candidats()).
  const ui = (f) => (...a) => { U = U || window.MASTER_UI; return f(...a); };
  window.MASTER_FRANCE_CANDIDATS = { THEMES, STATUT, mesure: ui(mesure), link: ui(link) };
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { candidats });
})();
