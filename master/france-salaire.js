/* Master — « Calculateur de salaire » de la rubrique France politique (F10) : pour un salaire brut, le net, l'impôt
   sur le revenu et le revenu disponible avec les règles de 2026, puis le même calcul si tel candidat applique ses
   mesures chiffrées touchant le revenu d'un salarié. Un candidat ou tous, dans l'ordre du registre, jamais triés par
   gain. Chaque effet renvoie à sa mesure (citation exacte, source, fiche du candidat). Classement des mesures par
   IA, non relu : la page le dit. En local, le calcul est fait par le portail (/api/france/salaire) ; en ligne, dans
   le navigateur par le même moteur porté en JavaScript (france-salaire-calc.js). Tout texte passe par textContent.

   Sous-vue de l'onglet Projections (#france/projections/salaire) : window.MASTER_FRANCE_PROJ_VIEWS.salaire(root),
   montée par france-projections.js. Chaque effet mène au dossier de sa mesure (F9). */
(() => {
  "use strict";
  let U = null;
  const ETAT = {
    retenu: "retenu", non_cumule: "non cumulé : le plus favorable des effets du candidat est retenu",
    sans_effet: "sans effet à ce salaire", hors_champ: "hors champ à ce salaire", sans_salaire: "pas de salaire",
  };
  const HORS_CHAMP = {
    plancher_net_mois: "brut inférieur au Smic mensuel : temps partiel supposé, le plancher ne s'applique pas",
    net_pct: "brut au-delà du plafond de la mesure",
  };
  const STATUT_MESURE = { engagement: "engagement écrit", annonce: "annonce", piste: "piste" };

  const NBSP = "\u00a0";  // le montant et « € » restent sur la même ligne
  const eur = (v) => `${U.nf0.format(Math.round(v))}${NBSP}€`;
  const eur2 = (v) => `${U.nf2.format(v)}${NBSP}€`;
  const signed = (v) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${U.nf0.format(Math.abs(r))}${NBSP}€`; };
  const range = (a, b, f) => (Math.round(a) === Math.round(b) ? f(a) : `${f(a)} à ${f(b)}`);
  const pctTxt = (v) => `${String(v).replace(".", ",")}${NBSP}%`;

  function link(text, href) {  // lien externe seulement en https ; sinon le texte seul
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", null, text);
    const a = U.el("a", "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }
  function sourceOf(sources, text) {  // lien court ; le titre complet de la source en infobulle
    const s = (sources || [])[0];
    if (!s) return U.el("span", "muted", "—");
    const a = link(text || "source", s.url);
    if (s.titre) a.title = s.titre;
    return a;
  }
  function ficheLink(cid, text) {
    const a = U.el("a", "fr-link", text);
    a.href = `#france/candidats/${encodeURIComponent(cid)}`;
    return a;
  }
  function dossierLink(cid, mid) {  // dossier de la mesure (F9) : citation, vérification, chiffrages, actualité
    const a = U.el("a", "fr-link", `Creuser : dossier de la mesure ${mid}`);
    a.href = `#france/candidats/${encodeURIComponent(cid)}/mesure/${encodeURIComponent(mid)}`;
    return a;
  }

  // ------------------------------------------------------------ formulaire
  function field(label, input) {
    const l = U.el("label", "fr-sal-field");
    l.append(U.el("span", "muted", label), input);
    return l;
  }
  function numberInput(value, min, max, step, aria) {
    const i = U.el("input", "fr-input");
    i.type = "number"; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
    i.setAttribute("aria-label", aria);
    return i;
  }

  function form(R, state, onChange) {
    const box = U.el("form", "fr-controls fr-sal-form");
    box.noValidate = true;
    const brut = numberInput(state.brut, 0, window.MASTER_SALAIRE.BRUT_MAX, 0.01, "Salaire brut mensuel (€)");
    const enfants = numberInput(state.enfants, 0, window.MASTER_SALAIRE.ENFANTS_MAX, 1, "Nombre d'enfants à charge");
    const conj = numberInput(state.brut_conjoint, 0, window.MASTER_SALAIRE.BRUT_MAX, 0.01, "Salaire brut mensuel du conjoint (€)");
    const iso = U.el("input");
    iso.type = "checkbox"; iso.checked = state.parent_isole;
    const isoLabel = U.el("label", "fr-sal-check");
    isoLabel.append(iso, document.createTextNode(" Parent isolé"));
    const conjField = field("Brut mensuel du conjoint", conj);
    const sel = U.el("select", "fr-select");
    sel.setAttribute("aria-label", "Candidat");
    sel.append(new Option("Tous les candidats (ordre du registre)", "tous"));
    for (const c of R.candidats || []) sel.append(new Option(c.nom, c.id));
    sel.value = state.candidat;
    const sync = () => {
      conjField.hidden = state.situation !== "couple";
      const isoOk = state.situation === "seul" && state.enfants >= 1;
      iso.disabled = !isoOk;
      if (!isoOk) { iso.checked = false; state.parent_isole = false; }
    };
    const read = () => {
      state.brut = brut.valueAsNumber;
      state.enfants = enfants.valueAsNumber;
      state.brut_conjoint = state.situation === "couple" ? (Number.isNaN(conj.valueAsNumber) ? 0 : conj.valueAsNumber) : 0;
      state.parent_isole = iso.checked;
      state.candidat = sel.value;
      sync();
      onChange();
    };
    for (const i of [brut, enfants, conj]) i.addEventListener("change", read);
    iso.addEventListener("change", read);
    sel.addEventListener("change", read);
    box.addEventListener("submit", (e) => { e.preventDefault(); read(); });
    const statut = U.seg([["non_cadre", "Non cadre"], ["cadre", "Cadre"]], state.cadre ? "cadre" : "non_cadre", (v) => { state.cadre = v === "cadre"; read(); }, "Statut");
    const sit = U.seg([["seul", "Seul"], ["couple", "Marié·e ou pacsé·e (imposition commune)"]], state.situation, (v) => { state.situation = v; read(); }, "Situation");
    const go = U.el("button", null, "Calculer");
    go.type = "submit";
    box.append(field("Brut mensuel", brut), statut, sit, field("Enfants à charge", enfants), isoLabel, conjField, sel, go);
    sync();
    return box;
  }

  // ------------------------------------------------------------ bulletin et impôt (référence 2026)
  function bulletin(R, n, titre) {
    const p = U.panel(titre, { sub: `Brut ${eur2(n.brut)} par mois${n.cadre ? ", cadre" : ", non cadre"}` });
    const src = {};
    for (const l of R.parametres.lignes) src[l.nom] = l.sources;
    const rows = n.lignes.map((l) => ({ k: l.nom, a: eur2(l.assiette), t: pctTxt(l.taux), m: `−${NBSP}${eur2(l.montant)}`, s: sourceOf(src[l.nom]) }));
    const c = n.csg_crds, cs = R.parametres.csg.sources;
    rows.push({ k: "CSG déductible", a: eur2(c.assiette), t: pctTxt(Math.round(c.taux_deductible * 1000) / 1000), m: `−${NBSP}${eur2(c.csg_deductible)}`, s: sourceOf(cs) });
    rows.push({ k: "CSG non déductible", a: eur2(c.assiette), t: pctTxt(Math.round(c.taux_non_deductible * 1000) / 1000), m: `−${NBSP}${eur2(c.csg_non_deductible)}`, s: sourceOf(cs) });
    rows.push({ k: "CRDS", a: eur2(c.assiette), t: pctTxt(c.taux_crds), m: `−${NBSP}${eur2(c.crds)}`, s: sourceOf(cs) });
    rows.push({ k: "Net à payer (avant impôt)", a: "", t: "", m: eur2(n.net), s: "" });
    rows.push({ k: "Net imposable", a: "", t: "", m: eur2(n.net_imposable), s: "" });
    p.body.append(U.table(rows, [["k", "Ligne"], ["a", "Assiette"], ["t", "Taux"], ["m", "Montant"], ["s", "Source", (v) => (v instanceof Node ? v : U.el("span", null, v))]]));
    return p.el;
  }

  function impotPanel(R, i, f, titre) {
    const p = U.panel(titre, { sub: `Barème des revenus ${R.parametres.ir.revenus || "—"}, ${i.parts} part${i.parts > 1 ? "s" : ""}` });
    const rows = [];
    i.revenus.forEach((x, k) => {
      const who = k === 0 ? "salarié" : "conjoint";
      rows.push({ k: `Net imposable annuel (${who})`, v: eur(x) });
      rows.push({ k: `Abattement de 10 % (${who})`, v: `−${NBSP}${eur(i.abattements[k])}` });
    });
    rows.push({ k: "Revenu net imposable du foyer", v: eur(i.revenu_net_imposable) });
    rows.push({ k: "Parts de quotient familial", v: U.nf1.format(i.parts) });
    rows.push({ k: "Impôt selon le barème (avec les parts)", v: eur(i.impot_parts) });
    if (i.parts > i.parts_base) {
      rows.push({ k: `Impôt sans les demi-parts supplémentaires (${i.parts_base} part${i.parts_base > 1 ? "s" : ""})`, v: eur(i.impot_base) });
      rows.push({ k: "Plafonnement du quotient familial", v: i.plafonnement ? `appliqué (avantage limité à ${eur(i.plafond_avantage)})` : `non atteint (plafond ${eur(i.plafond_avantage)})` });
    }
    rows.push({ k: "Impôt avant décote", v: eur(i.impot_avant_decote) });
    rows.push({ k: "Décote", v: i.decote ? `−${NBSP}${eur(i.decote)}` : "aucune" });
    if (!i.recouvrement && i.impot_apres_decote > 0) rows.push({ k: "Mise en recouvrement", v: `non : moins de ${eur(R.parametres.ir.seuil_recouvrement)}` });
    rows.push({ k: "Impôt sur le revenu annuel", v: eur(i.impot) });
    p.body.append(U.table(rows, [["k", "Étape"], ["v", "Montant"]]));
    const srcs = U.el("p", "fr-src-line");
    srcs.append(document.createTextNode("Sources : "));
    (R.parametres.ir.sources || []).slice(0, 3).forEach((s, k) => { if (k) srcs.append(document.createTextNode(" · ")); srcs.append(link(s.titre || "source", s.url)); });
    p.body.append(srcs);
    if (R.parametres.ir.statut) p.body.append(U.el("p", "fr-warn", R.parametres.ir.statut));
    return p.el;
  }

  function reference(R, d) {
    const ref = d.reference;
    const wrap = U.el("div", "fr-body");
    const k = U.el("div", "kpis");
    k.append(U.kpi({ label: "Net mensuel (2026)", value: eur(ref.nets_mois), ctx: ref.conjoint ? "salarié et conjoint" : "avant impôt" }),
      U.kpi({ label: "Impôt sur le revenu annuel", value: eur(ref.impot.impot), ctx: `${U.nf1.format(ref.impot.parts)} parts` }),
      U.kpi({ label: "Revenu disponible mensuel", value: eur(ref.revenu_disponible_mois), ctx: "nets − impôt / 12, hors prime d'activité" }));
    wrap.append(U.el("h3", "fr-theme-h", "Référence : règles de 2026"), k);
    const grid = U.el("div", "fr-grid");
    grid.append(bulletin(R, ref.salarie, "Bulletin du salarié"));
    if (ref.conjoint) grid.append(bulletin(R, ref.conjoint, "Bulletin du conjoint"));
    grid.append(impotPanel(R, ref.impot, d.entree, "Impôt sur le revenu du foyer"));
    wrap.append(grid);
    return wrap;
  }

  // ------------------------------------------------------------ effets d'un candidat
  function effetTitre(e) {
    switch (e.type) {
      case "net_euros_mois": return `Hausse du net : +${U.nf0.format(e.valeur)} € par mois`;
      case "plancher_net_mois": return `Plancher du net : ${U.nf0.format(e.valeur)} € par mois`;
      case "net_pct": return `Hausse du net : ${e.min === e.max ? `+${pctTxt(e.min)}` : `+${pctTxt(e.min)} à +${pctTxt(e.max)}`}${e.jusqu_a_smic_x ? ` jusqu'à ${e.jusqu_a_smic_x} Smic brut` : ""}`;
      case "csg_points": return `CSG sur les revenus d'activité : ${e.valeur > 0 ? "+" : "−"}${pctTxt(Math.abs(e.valeur)).replace(`${NBSP}%`, " points")}`;
      case "qf_part_entiere_des_enfant": return `Quotient familial : part entière dès l'enfant n° ${e.valeur}`;
      case "ir_baisse_pct": return `Impôt sur le revenu : −${pctTxt(e.valeur)}, sous condition`;
      default: return `${e.categorie_libelle || "autre"} : ${e.description || ""}`;
    }
  }
  function etatTxt(e, etat) {
    if (!etat) return null;
    return etat === "hors_champ" ? `hors champ (${HORS_CHAMP[e.type] || "à ce salaire"})` : ETAT[etat] || etat;
  }

  function mesureBlock(cid, e, extra) {
    const b = U.el("article", "fr-mesure");
    b.append(U.el("p", "fr-resume", effetTitre(e)));
    if (extra) for (const x of extra) if (x) b.append(x);
    if (e.resume) b.append(U.el("p", "muted", `Mesure : ${e.resume}`));
    b.append(U.el("blockquote", "fr-citation", `« ${e.citation} »`));
    if (e.justification) b.append(U.el("p", "muted", `Lecture de l'IA : ${e.justification}`));
    if (e.conversion) b.append(U.el("p", "muted", `Conversion (plan F10) : ${e.conversion}`));
    const s = U.el("p", "fr-src-line");
    s.append(link("source", e.source), document.createTextNode(" · "),
      dossierLink(cid, e.mesure));
    if (e.statut_mesure) s.append(document.createTextNode(` · ${STATUT_MESURE[e.statut_mesure] || e.statut_mesure}`));
    if (e.date_mesure) s.append(document.createTextNode(` · ${U.dmy(e.date_mesure)}`));
    else if ("date_mesure" in e) s.append(document.createTextNode(" · source non datée"));
    b.append(s);
    return b;
  }

  function effets(c) {
    const box = U.el("div", "fr-body");
    if (c.message) box.append(U.callout("info", c.nom, `: ${c.message}.`));
    const sec = (title, list, render, empty) => {
      const p = U.panel(`${title} (${list.length})`);
      if (!list.length) p.body.append(U.el("p", "muted", empty));
      for (const e of list) p.body.append(render(e));
      box.append(p.el);
    };
    sec("Effets intégrés au calcul", c.integres, (e) => {
      const a = e.application || {};
      const t = [etatTxt(e, a.salarie) && U.el("p", null, `Pour le salarié : ${etatTxt(e, a.salarie)}`),
        a.conjoint && U.el("p", null, `Pour le conjoint : ${etatTxt(e, a.conjoint)}`)];
      return mesureBlock(c.id, e, t);
    }, "Aucun.");
    sec("Effets conditionnels, hors total", c.conditionnels, (e) => {
      if (!e.applicable) return mesureBlock(c.id, e, [U.el("p", null, `Si vous êtes concerné (${e.condition}) : non applicable (${e.raison}).`)]);
      const s = e.si_concerne;
      const t = U.el("p", null, `Si vous êtes concerné (${e.condition}) : revenu disponible ${range(s.bas.revenu_disponible_mois, s.haut.revenu_disponible_mois, eur)} par mois, soit ${range(s.bas.gain_mois, s.haut.gain_mois, signed)}.`);
      return mesureBlock(c.id, e, [t]);
    }, "Aucun.");
    sec("Effets chiffrés non intégrés", c.non_integres, (e) => mesureBlock(c.id, e, [U.el("p", "muted", "Listé sans montant : effet sur les prix, les heures ou des aides, hors du calcul d'un salaire.")]), "Aucun.");
    sec("Mesures non chiffrables", c.non_quantifiables, (q) => {
      const b = U.el("article", "fr-mesure");
      b.append(U.el("p", "fr-resume", q.raison));
      if (q.resume) b.append(U.el("p", "muted", `Mesure : ${q.resume}`));
      b.append(U.el("blockquote", "fr-citation", `« ${q.citation} »`));
      const s = U.el("p", "fr-src-line");
      s.append(link("source", q.source), document.createTextNode(" · "), dossierLink(c.id, q.mesure));
      b.append(s);
      return b;
    }, "Aucune relevée.");
    return box;
  }

  function comparaison(d, c) {
    const ref = d.reference, bas = c.resultats.bas, haut = c.resultats.haut;
    const two = (f) => (c.fourchette ? range(f(bas), f(haut), eur) : eur(f(bas)));
    const rows = [
      bas.salarie.brut === ref.salarie.brut && haut.salarie.brut === ref.salarie.brut
        ? { k: "Brut mensuel", a: eur2(ref.salarie.brut), b: "inchangé" }  // CSG, baisse de cotisations, quotient familial
        : { k: "Brut mensuel (équivalent)", a: eur2(ref.salarie.brut), b: c.fourchette ? range(bas.salarie.brut, haut.salarie.brut, eur2) : eur2(bas.salarie.brut) },
      { k: "Net mensuel du salarié", a: eur(ref.salarie.net), b: two((s) => s.salarie.net) },
    ];
    if (ref.conjoint) rows.push({ k: "Net mensuel du conjoint", a: eur(ref.conjoint.net), b: two((s) => s.conjoint.net) });
    rows.push({ k: "Net imposable du salarié", a: eur(ref.salarie.net_imposable), b: two((s) => s.salarie.net_imposable) },
      { k: "Parts de quotient familial", a: U.nf1.format(ref.impot.parts), b: U.nf1.format(bas.impot.parts) },
      { k: "Impôt sur le revenu annuel", a: eur(ref.impot.impot), b: two((s) => s.impot.impot) },
      { k: "Revenu disponible mensuel", a: eur(ref.revenu_disponible_mois), b: two((s) => s.revenu_disponible_mois) },
      { k: "Écart avec 2026, par mois", a: "", b: range(c.gain_mois.bas, c.gain_mois.haut, signed) });
    const p = U.panel(`Si ${c.nom} est élu(e) et applique ses mesures intégrées`, { sub: "Effet direct annoncé, hors financement, hors effets sur l'emploi et les prix." });
    p.body.append(U.table(rows, [["k", "Ligne"], ["a", "2026"], ["b", c.nom]]));
    const s = U.el("p", "fr-src-line");
    s.append(ficheLink(c.id, "Fiche du candidat et programme complet"));
    p.body.append(s);
    return p.el;
  }

  function tous(d, onPick) {
    const p = U.panel(`Tous les candidats (${d.candidats.length})`, { sub: "Ordre du registre, jamais trié par gain. Cliquez sur une ligne pour le détail et les citations." });
    const rows = d.candidats.map((c) => ({ ...c,
      // « — » quand rien n'est intégré (sans effet ou non intégré) ; 0 € seulement si un effet intégré vaut 0 ici.
      rd: c.statut !== "calcule" ? "—" : range(c.resultats.bas.revenu_disponible_mois, c.resultats.haut.revenu_disponible_mois, eur),
      ecart: c.statut !== "calcule" ? "—" : range(c.gain_mois.bas, c.gain_mois.haut, signed),
      n: `${c.integres.length} / ${c.conditionnels.length} / ${c.non_integres.length} / ${c.non_quantifiables.length}`,
      note: c.message || "" }));
    p.body.append(U.table(rows, [["nom", "Candidat"], ["rd", "Revenu disponible / mois"], ["ecart", "Écart avec 2026"],
      ["n", "Intégrés / conditionnels / non intégrés / non chiffrables"], ["note", "Remarque"]], (r) => onPick(r.id)));
    return p.el;
  }

  function methode(R) {
    const p = U.panel("Méthode et limites", { sub: R.releve && R.releve.conversion ? R.releve.conversion : null });
    const ul = U.el("ul", "fr-src");
    for (const m of R.methode || []) ul.append(U.el("li", null, m));
    p.body.append(ul);
    if (R.releve && R.releve.releve) p.body.append(U.el("p", "muted", R.releve.releve));
    const src = U.el("p", "fr-src-line");
    src.append(document.createTextNode("Smic : "), sourceOf(R.parametres.smic_sources, R.parametres.smic_sources[0] && R.parametres.smic_sources[0].titre),
      document.createTextNode(" · plafond de la Sécurité sociale : "), sourceOf(R.parametres.pss_sources, R.parametres.pss_sources[0] && R.parametres.pss_sources[0].titre));
    p.body.append(src);
    return p.el;
  }

  // ------------------------------------------------------------ vue
  async function salaire(root) {
    U = window.MASTER_UI;
    const S = window.MASTER_SALAIRE;
    let R;
    try { R = await U.api("/api/france/salaire/regles"); } catch (e) {
      root.append(U.callout("info", "Calculateur indisponible", "Les barèmes de 2026 ne sont pas chargés.")); return;
    }
    root.append(U.callout("ia", `${R.libelle}.`, "Les mesures de chaque candidat qui touchent le revenu d'un salarié ont été classées par IA à partir des citations de son programme ; chaque effet renvoie à sa citation exacte et à sa source."));
    const warn = U.el("div", "callout attention");
    const ul = U.el("ul", "fr-src");
    for (const w of R.avertissements || []) ul.append(U.el("li", null, w));
    const wp = U.el("div");
    wp.append(U.el("b", null, "À lire avant les chiffres."), ul);
    warn.append(U.icon("alert"), wp);
    root.append(warn);
    if ((R.erreurs || []).length) root.append(U.callout("attention", `${R.erreurs.length} entrée(s) du relevé écartée(s) à la validation :`, R.erreurs.join(" ; ")));
    const state = { brut: R.parametres.smic_brut_mois, cadre: false, situation: "seul", enfants: 0, parent_isole: false, brut_conjoint: 0, candidat: "tous" };
    const out = U.el("div", "fr-body");
    let seq = 0;
    const pick = (cid) => { state.candidat = cid; sel().value = cid; run(); };
    const sel = () => root.querySelector(".fr-sal-form select");
    async function run() {
      const n = ++seq;
      const foyer = { situation: state.situation, enfants: state.enfants, parent_isole: state.parent_isole };
      const cands = state.candidat === "tous" ? R.candidats : R.candidats.filter((c) => c.id === state.candidat);
      let d;
      try {
        S.revenu(R, state.brut, foyer, state.cadre, state.brut_conjoint);  // même validation que le portail, message lisible
        if (window.MASTER_STATIC) d = S.comparer(R, state.brut, foyer, state.cadre, state.brut_conjoint, cands);
        else {
          const q = new URLSearchParams({ brut: String(state.brut), cadre: state.cadre ? "1" : "0", situation: state.situation,
            enfants: String(state.enfants), parent_isole: state.parent_isole ? "1" : "0", brut_conjoint: String(state.brut_conjoint), candidat: state.candidat });
          d = await U.api(`/api/france/salaire?${q}`);
        }
      } catch (e) {
        if (n === seq) out.replaceChildren(U.callout("erreur", "Entrée à corriger.", e.message));
        return;
      }
      if (n !== seq) return;
      const parts = [reference(R, d)];
      if (state.candidat === "tous") parts.push(U.el("h3", "fr-theme-h", "Si le candidat est élu"), tous(d, pick));
      else for (const c of d.candidats) parts.push(U.el("h3", "fr-theme-h", `Si ${c.nom} est élu(e)`), ...(c.statut === "calcule" ? [comparaison(d, c)] : []), effets(c));
      parts.push(methode(R));
      out.replaceChildren(...parts);
    }
    root.append(form(R, state, run), out);
    await run();
  }

  window.MASTER_FRANCE_PROJ_VIEWS = Object.assign(window.MASTER_FRANCE_PROJ_VIEWS || {}, { salaire: (root) => salaire(root) });
})();
