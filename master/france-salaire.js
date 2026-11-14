/* Master — « Calculateur de salaire » v2 de la rubrique France politique (F10 + v2) : du coût total du travail pour
   l'employeur jusqu'au pouvoir d'achat restant après les taxes sur la consommation estimées, en intégrant les heures
   supplémentaires, la prime d'activité, les allocations familiales et l'allocation de rentrée scolaire. Deux anneaux
   SVG côte à côte (« Règles 2026 » et « Si <candidat> applique ses mesures ») avec la même échelle (surface
   proportionnelle au coût employeur), 6 parts dans un ordre fixe (--fr-l1..6) et un arc extérieur pour les prestations.
   Un candidat ou tous, dans l'ordre du registre, jamais triés par gain. Chaque effet renvoie à sa mesure (citation
   exacte, source, fiche du candidat, dossier de la mesure). Classement des mesures par IA, non relu : la page le dit.
   En local, le calcul est fait par le portail (/api/france/salaire) ; en ligne, dans le navigateur par le même moteur
   porté en JavaScript (france-salaire-calc.js). Tout texte passe par textContent, les SVG par createElementNS. */
(() => {
  "use strict";
  let U = null;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ETAT = {
    retenu: "retenu", non_cumule: "non cumulé : le plus favorable des effets du candidat est retenu",
    sans_effet: "sans effet à ce salaire ou pour ce foyer", hors_champ: "hors champ à ce salaire", sans_salaire: "pas de salaire",
  };
  const HORS_CHAMP = {
    plancher_net_mois: "brut inférieur au Smic mensuel : temps partiel supposé, le plancher ne s'applique pas",
    net_pct: "brut au-delà du plafond de la mesure",
  };
  const STATUT_MESURE = { engagement: "engagement écrit", annonce: "annonce", piste: "piste" };
  const PARTS_ORDRE = [
    { key: "cotisations_patronales_mois", label: "Cotisations patronales", short: "Cot. patronales", color: "var(--fr-l1)" },
    { key: "cotisations_salariales_mois", label: "Cotisations salariales", short: "Cot. salariales", color: "var(--fr-l2)" },
    { key: "csg_crds_mois", label: "CSG‑CRDS", short: "CSG‑CRDS", color: "var(--fr-l3)" },
    { key: "impot_revenu_mois", label: "Impôt sur le revenu", short: "Impôt revenu", color: "var(--fr-l4)" },
    { key: "taxes_consommation_mois", label: "Taxes sur la consommation (estimées)", short: "Taxes conso.", color: "var(--fr-l5)" },
    { key: "pouvoir_achat_mois", label: "Pouvoir d'achat restant", short: "Pouvoir d'achat", color: "var(--fr-l6)" },
  ];

  const NBSP = "\u00a0";  // le montant et « € » restent sur la même ligne
  const eur = (v) => `${U.nf0.format(Math.round(v))}${NBSP}€`;
  const eur2 = (v) => `${U.nf2.format(v)}${NBSP}€`;
  const signed = (v) => { const r = Math.round(v); return `${r > 0 ? "+" : r < 0 ? "−" : ""}${U.nf0.format(Math.abs(r))}${NBSP}€`; };
  const range = (a, b, f) => (Math.round(a) === Math.round(b) ? f(a) : `${f(a)} à ${f(b)}`);
  const pctTxt = (v) => `${String(v).replace(".", ",")}${NBSP}%`;

  function svgEl(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

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
  function numberInput(value, min, max, step, aria, cls) {
    const i = U.el("input", cls ? `fr-input ${cls}` : "fr-input");
    i.type = "number"; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
    i.setAttribute("aria-label", aria);
    return i;
  }

  function form(R, state, onChange) {
    const S = window.MASTER_SALAIRE;
    const box = U.el("form", "fr-controls fr-sal-form");
    box.noValidate = true;
    const brut = numberInput(state.brut, 0, S.BRUT_MAX, 0.01, "Salaire brut mensuel (€)");
    const hs = numberInput(state.heures_sup, 0, S.HEURES_SUP_MAX || 200, 0.5, "Heures supplémentaires par mois", "fr-input-sm");
    const enfants = numberInput(state.enfants, 0, S.ENFANTS_MAX, 1, "Nombre d'enfants à charge", "fr-input-sm");
    const conj = numberInput(state.brut_conjoint, 0, S.BRUT_MAX, 0.01, "Salaire brut mensuel du conjoint (€)");
    const effSel = U.el("select", "fr-select");
    effSel.setAttribute("aria-label", "Effectif de l'entreprise");
    effSel.append(
      new Option("Moins de 11 salariés", "moins_11"),
      new Option("11 à 49 salariés", "11_49"),
      new Option("50 salariés et plus", "50_plus"),
    );
    effSel.value = state.effectif;
    const agesWrap = U.el("div", "fr-sal-ages");
    const agesField = field("Âge des enfants (ans)", agesWrap);
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

    const rebuildAges = (n) => {
      const count = Number.isInteger(n) && n >= 0 && n <= S.ENFANTS_MAX ? n : 0;
      while (state.ages_enfants.length < count) state.ages_enfants.push(S.AGE_ENFANT_DEFAUT || 8);
      if (state.ages_enfants.length > count) state.ages_enfants.length = count;
      agesField.hidden = count === 0;
      agesWrap.replaceChildren();
      for (let idx = 0; idx < count; idx++) {
        const inp = numberInput(state.ages_enfants[idx], 0, S.AGE_ENFANT_MAX || 25, 1, `Âge de l'enfant ${idx + 1} (ans)`);
        inp.addEventListener("change", () => {
          state.ages_enfants[idx] = Number.isNaN(inp.valueAsNumber) ? (S.AGE_ENFANT_DEFAUT || 8) : Math.trunc(inp.valueAsNumber);
          onChange();
        });
        agesWrap.append(inp);
      }
    };

    const sync = () => {
      conjField.hidden = state.situation !== "couple";
      const isoOk = state.situation === "seul" && state.enfants >= 1;
      iso.disabled = !isoOk;
      if (!isoOk) { iso.checked = false; state.parent_isole = false; }
      rebuildAges(state.enfants);
    };
    const read = () => {
      state.brut = brut.valueAsNumber;
      state.heures_sup = Number.isNaN(hs.valueAsNumber) ? 0 : hs.valueAsNumber;
      state.effectif = effSel.value;
      state.enfants = enfants.valueAsNumber;
      state.brut_conjoint = state.situation === "couple" ? (Number.isNaN(conj.valueAsNumber) ? 0 : conj.valueAsNumber) : 0;
      state.parent_isole = iso.checked;
      state.candidat = sel.value;
      sync();
      onChange();
    };
    for (const i of [brut, hs, enfants, conj]) i.addEventListener("change", read);
    effSel.addEventListener("change", read);
    iso.addEventListener("change", read);
    sel.addEventListener("change", read);
    box.addEventListener("submit", (e) => { e.preventDefault(); read(); });
    const statut = U.seg([["non_cadre", "Non cadre"], ["cadre", "Cadre"]], state.cadre ? "cadre" : "non_cadre", (v) => { state.cadre = v === "cadre"; read(); }, "Statut");
    const sit = U.seg([["seul", "Seul"], ["couple", "Marié·e ou pacsé·e (imposition commune)"]], state.situation, (v) => { state.situation = v; read(); }, "Situation");
    const go = U.el("button", null, "Calculer");
    go.type = "submit";
    box.append(
      field("Brut mensuel", brut),
      field("Heures sup. / mois", hs),
      field("Effectif entreprise", effSel),
      statut, sit,
      field("Enfants à charge", enfants),
      agesField,
      isoLabel, conjField,
      field("Candidat", sel),
      go,
    );
    sync();
    return box;
  }

  // ------------------------------------------------------------ anneaux SVG (createElementNS)
  function polar(cx, cy, r, a) {
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function donutPath(cx, cy, rOut, rIn, a0, a1) {
    const span = a1 - a0;
    if (span <= 0) return "";
    if (span >= Math.PI * 2 - 1e-4) a1 = a0 + Math.PI * 2 - 1e-4;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = polar(cx, cy, rOut, a0);
    const [x1, y1] = polar(cx, cy, rOut, a1);
    const [x2, y2] = polar(cx, cy, rIn, a1);
    const [x3, y3] = polar(cx, cy, rIn, a0);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rOut.toFixed(2)} ${rOut.toFixed(2)} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} A ${rIn.toFixed(2)} ${rIn.toFixed(2)} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
  }

  function renderRingCard(title, subText, scenarioObj, maxCost) {
    const card = U.el("div", "fr-ring-card");
    card.append(U.el("h4", "fr-ring-title", title), U.el("p", "fr-ring-sub", subText));
    const tip = U.el("div", "fr-tip");
    tip.hidden = true;

    const pa = scenarioObj.parts_anneau;
    const cost = Math.max(0, pa.cout_employeur_mois || 0);
    const presta = Math.max(0, pa.prestations_mois || 0);
    // Retrait de la part financée par les prestations dans le pouvoir d'achat de l'anneau intérieur pour que la somme
    // des 6 parts de l'anneau intérieur soit exactement égale au coût employeur, tandis que l'arc extérieur montre « + prestations ».
    const paDuSalaire = Math.max(0, (pa.pouvoir_achat_mois || 0) - presta);
    const rawVals = PARTS_ORDRE.map((p) => {
      const v = p.key === "pouvoir_achat_mois" ? paDuSalaire : Math.max(0, pa[p.key] || 0);
      return { ...p, val: v, fullVal: Math.max(0, pa[p.key] || 0) };
    });
    const sumParts = rawVals.reduce((s, x) => s + x.val, 0);

    const cx = 210, cy = 155;
    const scale = maxCost > 0 && cost > 0 ? Math.max(0.68, Math.sqrt(cost / maxCost)) : 1;
    const rOut = 104 * scale;
    const rIn = 66 * scale;
    const svg = svgEl("svg", { viewBox: "0 0 420 310", class: "fr-ring-svg", role: "img", "aria-label": `${title} : pouvoir d'achat restant ${eur(pa.pouvoir_achat_mois)} par mois` });

    const showTip = (label, montant, pctCost, ev) => {
      tip.textContent = `${label} : ${eur2(montant)} / mois (${pctTxt(Math.round(pctCost * 10) / 10)} du coût employeur)`;
      tip.hidden = false;
      if (ev && typeof ev.clientX === "number") {
        const rect = card.getBoundingClientRect();
        tip.style.left = `${Math.min(rect.width - 180, Math.max(8, ev.clientX - rect.left + 10))}px`;
        tip.style.top = `${Math.max(8, ev.clientY - rect.top - 28)}px`;
      } else {
        tip.style.left = "12px";
        tip.style.top = "36px";
      }
    };
    const hideTip = () => { tip.hidden = true; };

    const rMid = (rOut + rIn) / 2;
    const gapAngle = rMid > 0 ? 2 / rMid : 0.02;  // 2 px d'espace entre les parts
    const active = rawVals.filter((x) => x.val > 0.005);
    let curA = -Math.PI / 2;
    const totalGap = active.length > 1 ? active.length * gapAngle : 0;
    const availAngle = Math.max(0.1, Math.PI * 2 - totalGap);

    for (const sl of rawVals) {
      if (sl.val <= 0.005 || sumParts <= 0) continue;
      const frac = sl.val / sumParts;
      const span = frac * availAngle;
      const a0 = curA + (active.length > 1 ? gapAngle / 2 : 0);
      const a1 = a0 + span;
      curA += span + (active.length > 1 ? gapAngle : 0);
      const pctCost = cost > 0 ? (sl.fullVal / cost) * 100 : 0;
      const path = svgEl("path", {
        d: donutPath(cx, cy, rOut, rIn, a0, a1),
        fill: sl.color,
        class: "fr-ring-slice",
        tabindex: "0",
        role: "button",
        "aria-label": `${sl.label} : ${eur2(sl.fullVal)} par mois (${pctTxt(Math.round(pctCost * 10) / 10)} du coût employeur)`,
      });
      path.addEventListener("mousemove", (e) => showTip(sl.label, sl.fullVal, pctCost, e));
      path.addEventListener("mouseleave", hideTip);
      path.addEventListener("focus", () => showTip(sl.label, sl.fullVal, pctCost));
      path.addEventListener("blur", hideTip);
      svg.append(path);

      // Étiquette directe si l'arc est assez grand (>= 9 %), sinon repli dans la légende sous l'anneau.
      if (frac >= 0.09) {
        const aMid = (a0 + a1) / 2;
        const [lx, ly] = polar(cx, cy, rOut + (presta > 0 ? 22 : 14), aMid);
        const anchor = Math.cos(aMid) > 0.15 ? "start" : (Math.cos(aMid) < -0.15 ? "end" : "middle");
        svg.append(svgEl("text", { x: lx.toFixed(1), y: ly.toFixed(1), "text-anchor": anchor, "dominant-baseline": "central", class: "fr-ring-lbl" },
          `${sl.short} ${Math.round(pctCost)}${NBSP}%`));
      }
    }

    // Arc extérieur fin « + prestations » de la même échelle quand il y en a.
    if (presta > 0.005 && cost > 0) {
      const fracPresta = Math.min(0.98, presta / cost);
      const spanP = fracPresta * Math.PI * 2;
      const a0 = -Math.PI / 2;
      const a1 = a0 + spanP;
      const rPIn = rOut + 5;
      const rPOut = rOut + 12;
      const pctPresta = (presta / cost) * 100;
      const pArc = svgEl("path", {
        d: donutPath(cx, cy, rPOut, rPIn, a0, a1),
        fill: "var(--fr-l7)",
        class: "fr-ring-slice",
        tabindex: "0",
        role: "button",
        "aria-label": `+ Prestations : ${eur2(presta)} par mois (${pctTxt(Math.round(pctPresta * 10) / 10)} du coût employeur)`,
      });
      pArc.addEventListener("mousemove", (e) => showTip("+ Prestations (prime d'activité, allocations)", presta, pctPresta, e));
      pArc.addEventListener("mouseleave", hideTip);
      pArc.addEventListener("focus", () => showTip("+ Prestations (prime d'activité, allocations)", presta, pctPresta));
      pArc.addEventListener("blur", hideTip);
      svg.append(pArc);
    }

    // Centre : le pouvoir d'achat restant par mois, en grand.
    svg.append(
      svgEl("text", { x: cx, y: cy - 5, "text-anchor": "middle", "dominant-baseline": "central", class: "fr-ring-center-val" }, eur(pa.pouvoir_achat_mois)),
      svgEl("text", { x: cx, y: cy + 14, "text-anchor": "middle", "dominant-baseline": "central", class: "fr-ring-center-sub" }, "/ mois restant"),
    );

    const leg = U.el("div", "fr-ring-legend");
    for (const sl of rawVals) {
      const pctCost = cost > 0 ? Math.round((sl.fullVal / cost) * 100) : 0;
      const item = U.el("span", "fr-ring-key");
      const dot = U.el("i", "fr-ring-dot");
      dot.style.background = sl.color;
      item.append(dot, document.createTextNode(`${sl.label} : ${eur(sl.fullVal)} (${pctCost}${NBSP}%)`));
      leg.append(item);
    }
    if (presta > 0.005) {
      const pctP = cost > 0 ? Math.round((presta / cost) * 100) : 0;
      const item = U.el("span", "fr-ring-key");
      item.append(U.el("i", "fr-ring-dot fr-ring-dot-presta"), document.createTextNode(`+ Prestations : +${eur(presta)} (${pctP}${NBSP}%)`));
      leg.append(item);
    }

    card.append(svg, leg, tip);
    return card;
  }

  function anneauxSection(d, cand) {
    const ref = d.reference;
    const wrap = U.el("section", "fr-rings-wrap");
    const grid = U.el("div", "fr-rings");
    const candScen = cand ? cand.resultats.bas : null;
    const maxCost = Math.max(
      ref.parts_anneau.cout_employeur_mois || 0,
      candScen ? (candScen.parts_anneau.cout_employeur_mois || 0) : 0,
    );
    grid.append(renderRingCard(
      "Règles 2026",
      `Coût employeur : ${eur(ref.parts_anneau.cout_employeur_mois)} / mois · Revenu disponible : ${eur(ref.revenu_disponible_mois)} / mois`,
      ref,
      maxCost,
    ));
    if (cand && candScen) {
      const subCand = cand.fourchette
        ? `Coût employeur : ${range(cand.resultats.bas.parts_anneau.cout_employeur_mois, cand.resultats.haut.parts_anneau.cout_employeur_mois, eur)} / mois · Hypothèse basse affichée`
        : `Coût employeur : ${eur(candScen.parts_anneau.cout_employeur_mois)} / mois · Revenu disponible : ${eur(candScen.revenu_disponible_mois)} / mois`;
      grid.append(renderRingCard(
        `Si ${cand.nom} applique ses mesures`,
        subCand,
        candScen,
        maxCost,
      ));
    }
    const note = U.el("p", "fr-ring-scale-note",
      `Même échelle pour les deux anneaux : la surface suit le coût total du travail pour l'employeur. Taxes sur la consommation : ${ref.consommation.etiquette || "estimation (moyenne de votre décile, source Insee)"}.`);
    wrap.append(grid, note);
    return wrap;
  }

  // ------------------------------------------------------------ bulletin, coût employeur, impôt, prestations, consommation (référence 2026)
  function coutEmployeurPanel(R, emp, titre) {
    if (!emp || !emp.calcule) {
      const p = U.panel(titre, { sub: "Non calculé" });
      p.body.append(U.el("p", "muted", `Coût employeur non calculé : ${(emp && emp.raison) || "paramètre manquant"}.`));
      return p.el;
    }
    const effLib = emp.effectif === "moins_11" ? "moins de 11 salariés" : (emp.effectif === "50_plus" ? "50 salariés et plus" : "11 à 49 salariés");
    const p = U.panel(titre, { sub: `Brut total ${eur2(emp.brut)} (${effLib})` });
    const rows = emp.lignes.map((l) => ({ k: l.nom, a: eur2(l.assiette), t: pctTxt(l.taux), m: eur2(l.montant) }));
    rows.push({ k: "Cotisations patronales brutes", a: "", t: "", m: eur2(emp.cotisations_brutes) });
    if (emp.reduction_generale > 0) {
      rows.push({ k: "Réduction générale dégressive unique (RGDU 2026)", a: eur2(emp.brut), t: `coeff. ${U.nf2 ? emp.coefficient_rgdu.toFixed(4).replace(".", ",") : emp.coefficient_rgdu}`, m: `−${NBSP}${eur2(emp.reduction_generale)}` });
    }
    if (emp.deduction_hs > 0) {
      rows.push({ k: "Déduction forfaitaire patronale sur heures supplémentaires", a: "", t: "", m: `−${NBSP}${eur2(emp.deduction_hs)}` });
    }
    rows.push({ k: "Cotisations patronales nettes", a: "", t: "", m: eur2(emp.cotisations_nettes) });
    rows.push({ k: "Coût total employeur mensuel", a: "", t: "", m: eur2(emp.cout_total) });
    p.body.append(U.table(rows, [["k", "Ligne"], ["a", "Assiette"], ["t", "Taux"], ["m", "Montant"]]));
    if (emp.at_mp_note) p.body.append(U.el("p", "muted", emp.at_mp_note));
    return p.el;
  }

  function bulletin(R, n, titre) {
    const subHs = n.brut_hs > 0 ? ` (dont ${eur2(n.brut_hs)} d'heures sup.)` : "";
    const p = U.panel(titre, { sub: `Brut ${eur2(n.brut)} par mois${subHs}${n.cadre ? ", cadre" : ", non cadre"}` });
    const src = {};
    for (const l of R.parametres.lignes) src[l.nom] = l.sources;
    const rows = n.lignes.map((l) => ({
      k: l.nom, a: eur2(l.assiette), t: pctTxt(l.taux),
      m: l.montant < 0 ? `+${NBSP}${eur2(Math.abs(l.montant))}` : `−${NBSP}${eur2(l.montant)}`,
      s: sourceOf(src[l.nom] || (R.parametres.heures_sup && R.parametres.heures_sup.sources)),
    }));
    const c = n.csg_crds, cs = R.parametres.csg.sources;
    rows.push({ k: "CSG déductible", a: eur2(c.assiette), t: pctTxt(Math.round(c.taux_deductible * 1000) / 1000), m: `−${NBSP}${eur2(c.csg_deductible)}`, s: sourceOf(cs) });
    rows.push({ k: "CSG non déductible", a: eur2(c.assiette), t: pctTxt(Math.round(c.taux_non_deductible * 1000) / 1000), m: `−${NBSP}${eur2(c.csg_non_deductible)}`, s: sourceOf(cs) });
    rows.push({ k: "CRDS", a: eur2(c.assiette), t: pctTxt(c.taux_crds), m: `−${NBSP}${eur2(c.crds)}`, s: sourceOf(cs) });
    rows.push({ k: "Net à payer (avant impôt)", a: "", t: "", m: eur2(n.net), s: "" });
    if (n.heures_sup && n.heures_sup.net_imposable_hs_exonere > 0) {
      rows.push({ k: "Heures supplémentaires exonérées d'IR", a: "", t: "", m: `−${NBSP}${eur2(n.heures_sup.net_imposable_hs_exonere)}`, s: "" });
    }
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

  function prestationsEtConsoPanel(R, ref) {
    const al = ref.allocations, pa = ref.prime_activite, dec = ref.decile, co = ref.consommation;
    const p = U.panel("Prestations, décile et taxes sur la consommation (estimées)", {
      sub: dec.calcule ? `Décile ${dec.code_decile} (${dec.uc} UC, niveau de vie ${eur(dec.niveau_de_vie_mois)} / mois par UC)` : "Non calculé",
    });
    const rows = [
      { k: "Prime d'activité mensuelle", v: pa.calcule ? eur2(pa.montant_mois) : `non calculée (${pa.raison})` },
      { k: "Allocations familiales mensuelles", v: al.calcule ? eur2(al.allocations_familiales_mois) : `non calculées (${al.raison})` },
      { k: "Allocation de rentrée scolaire (moyenne / 12 mois)", v: al.calcule ? eur2(al.ars_mois) : "non calculée" },
      { k: "Total des prestations mensuelles", v: eur2(ref.prestations_mois) },
      { k: "Revenu disponible mensuel (nets + prestations − IR/12)", v: eur2(ref.revenu_disponible_mois) },
    ];
    if (co.calcule) {
      rows.push(
        { k: `Taux d'épargne retenu (${co.source_epargne})`, v: pctTxt(Math.round(co.taux_epargne_retenu * 1000) / 10) },
        { k: `Taxes sur la consommation (${co.etiquette})`, v: `−${NBSP}${eur2(co.taxes_consommation_mois)} (${pctTxt(co.taux_taxes_conso_rdb)} du RDB)` },
        { k: "Pouvoir d'achat restant mensuel", v: eur2(ref.pouvoir_achat_mois) },
      );
    } else {
      rows.push({ k: "Taxes sur la consommation", v: `non calculées (${co.raison})` });
    }
    p.body.append(U.table(rows, [["k", "Poste"], ["v", "Montant / valeur"]]));
    return p.el;
  }

  function reference(R, d) {
    const ref = d.reference;
    const wrap = U.el("div", "fr-rings-wrap");
    const k = U.el("div", "kpis");
    k.append(
      U.kpi({ label: "Coût employeur mensuel", value: ref.employeur.salarie.calcule ? eur(ref.employeur.cout_total_mois) : "non calculé", ctx: `dont ${eur(ref.employeur.cotisations_nettes_mois)} de cotisations patronales` }),
      U.kpi({ label: "Net mensuel (2026)", value: eur(ref.nets_mois), ctx: ref.conjoint ? "salarié et conjoint" : "avant impôt" }),
      U.kpi({ label: "Prestations mensuelles", value: `+${eur(ref.prestations_mois)}`, ctx: "prime d'activité, AF et ARS / 12" }),
      U.kpi({ label: "Revenu disponible mensuel", value: eur(ref.revenu_disponible_mois), ctx: `après ${eur(ref.impot.impot / 12)} d'IR / mois` }),
      U.kpi({ label: "Pouvoir d'achat restant", value: eur(ref.pouvoir_achat_mois), ctx: `après ${eur(ref.consommation.taxes_consommation_mois)} de taxes conso. (${ref.decile.code_decile || "—"})` }),
    );
    wrap.append(U.el("h3", "fr-theme-h", " Synthèse : du coût employeur au pouvoir d'achat (2026)"), k);

    const det = U.el("details", "fr-details");
    det.append(U.el("summary", null, "Détail ligne par ligne (coût employeur, bulletin, impôt, prestations et consommation)"));
    const grid = U.el("div", "fr-grid");
    grid.append(coutEmployeurPanel(R, ref.employeur.salarie, "Coût employeur (salarié)"), bulletin(R, ref.salarie, "Bulletin du salarié"));
    if (ref.conjoint) {
      grid.append(coutEmployeurPanel(R, ref.employeur.conjoint, "Coût employeur (conjoint)"), bulletin(R, ref.conjoint, "Bulletin du conjoint"));
    }
    grid.append(impotPanel(R, ref.impot, d.entree, "Impôt sur le revenu du foyer"), prestationsEtConsoPanel(R, ref));
    det.append(grid);
    wrap.append(det);
    return wrap;
  }

  // ------------------------------------------------------------ effets d'un candidat et tableau « Ce qui change »
  function effetTitre(e) {
    switch (e.type) {
      case "net_euros_mois": return `Hausse du net : +${U.nf0.format(e.valeur)} € par mois`;
      case "plancher_net_mois": return `Plancher du net : ${U.nf0.format(e.valeur)} € par mois`;
      case "net_pct": return `Hausse du net : ${e.min === e.max ? `+${pctTxt(e.min)}` : `+${pctTxt(e.min)} à +${pctTxt(e.max)}`}${e.jusqu_a_smic_x ? ` jusqu'à ${e.jusqu_a_smic_x} Smic brut` : ""}`;
      case "csg_points": return `CSG sur les revenus d'activité : ${e.valeur > 0 ? "+" : "−"}${pctTxt(Math.abs(e.valeur)).replace(`${NBSP}%`, " points")}`;
      case "qf_part_entiere_des_enfant": return `Quotient familial : part entière dès l'enfant n° ${e.valeur}`;
      case "tva_points": return `TVA générale : ${e.valeur > 0 ? "+" : "−"}${pctTxt(Math.abs(e.valeur)).replace(`${NBSP}%`, " points")}`;
      case "carburant_centimes_litre": return `Prix des carburants / accise : ${e.valeur > 0 ? "+" : "−"}${Math.abs(e.valeur)} centimes / litre`;
      case "electricite_facture_pct": return `Facture d'électricité : ${e.valeur > 0 ? "+" : "−"}${pctTxt(Math.abs(e.valeur))}`;
      case "heures_sup_exo": return e.mode === "totale"
        ? "Heures supplémentaires : exonération totale de cotisations sociales et d'impôt sur le revenu"
        : `Heures supplémentaires : défiscalisation dans la limite de ${e.plafond_heures_an} h / an`;
      case "allocations_premier_enfant": return `Allocation familiale unique : ${U.nf0.format(e.valeur)} € / mois dès le 1er enfant (modulée selon le revenu)`;
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
    if (e.conversion) b.append(U.el("p", "muted", `Conversion : ${e.conversion}`));
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
    const box = U.el("div", "fr-rings-wrap");
    if (c.message) box.append(U.callout("info", c.nom, `: ${c.message}.`));
    const sec = (title, list, render, empty) => {
      const p = U.panel(`${title} (${list.length})`);
      if (!list.length) p.body.append(U.el("p", "muted", empty));
      for (const e of list) p.body.append(render(e));
      box.append(p.el);
    };
    sec("Effets intégrés au calcul", c.integres, (e) => {
      const a = e.application || {};
      const contrib = e.contribution && e.contribution.pouvoir_achat_mois;
      const contribLine = contrib
        ? U.el("p", null, `Contribution à l'écart de pouvoir d'achat : ${range(contrib.bas, contrib.haut, signed)} / mois (${range(contrib.bas * 12, contrib.haut * 12, signed)} / an)`)
        : null;
      const t = [
        contribLine,
        etatTxt(e, a.salarie) && U.el("p", null, `Pour le salarié : ${etatTxt(e, a.salarie)}`),
        a.conjoint && U.el("p", null, `Pour le conjoint : ${etatTxt(e, a.conjoint)}`),
      ];
      return mesureBlock(c.id, e, t);
    }, "Aucun.");
    sec("Effets conditionnels, hors total", c.conditionnels, (e) => {
      if (!e.applicable) return mesureBlock(c.id, e, [U.el("p", null, `Si vous êtes concerné (${e.condition}) : non applicable (${e.raison}).`)]);
      const s = e.si_concerne;
      const t = U.el("p", null, `Si vous êtes concerné (${e.condition}) : revenu disponible ${range(s.bas.revenu_disponible_mois, s.haut.revenu_disponible_mois, eur)} par mois, soit ${range(s.bas.gain_mois, s.haut.gain_mois, signed)}.`);
      return mesureBlock(c.id, e, [t]);
    }, "Aucun.");
    sec("Effets chiffrés non intégrés", c.non_integres, (e) => mesureBlock(c.id, e, [U.el("p", "muted", "Listé sans montant : assiette non ventilée dans les sources officielles ou dispositif hors du calculateur.")]), "Aucun.");
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
    const diffMois = (f) => range(f(bas) - f(ref), f(haut) - f(ref), signed);
    const diffAn = (f) => range((f(bas) - f(ref)) * 12, (f(haut) - f(ref)) * 12, signed);
    const rows = [
      bas.salarie.brut === ref.salarie.brut && haut.salarie.brut === ref.salarie.brut
        ? { k: "Brut mensuel", a: eur2(ref.salarie.brut), b: "inchangé", dm: `0${NBSP}€`, da: `0${NBSP}€` }
        : { k: "Brut mensuel (équivalent)", a: eur2(ref.salarie.brut), b: c.fourchette ? range(bas.salarie.brut, haut.salarie.brut, eur2) : eur2(bas.salarie.brut), dm: diffMois((s) => s.salarie.brut), da: diffAn((s) => s.salarie.brut) },
      { k: "Coût employeur mensuel", a: eur(ref.parts_anneau.cout_employeur_mois), b: two((s) => s.parts_anneau.cout_employeur_mois), dm: diffMois((s) => s.parts_anneau.cout_employeur_mois), da: diffAn((s) => s.parts_anneau.cout_employeur_mois) },
      { k: "Cotisations patronales nettes", a: eur(ref.parts_anneau.cotisations_patronales_mois), b: two((s) => s.parts_anneau.cotisations_patronales_mois), dm: diffMois((s) => s.parts_anneau.cotisations_patronales_mois), da: diffAn((s) => s.parts_anneau.cotisations_patronales_mois) },
      { k: "Cotisations salariales", a: eur(ref.parts_anneau.cotisations_salariales_mois), b: two((s) => s.parts_anneau.cotisations_salariales_mois), dm: diffMois((s) => s.parts_anneau.cotisations_salariales_mois), da: diffAn((s) => s.parts_anneau.cotisations_salariales_mois) },
      { k: "CSG‑CRDS", a: eur(ref.parts_anneau.csg_crds_mois), b: two((s) => s.parts_anneau.csg_crds_mois), dm: diffMois((s) => s.parts_anneau.csg_crds_mois), da: diffAn((s) => s.parts_anneau.csg_crds_mois) },
      { k: "Net mensuel du salarié", a: eur(ref.salarie.net), b: two((s) => s.salarie.net), dm: diffMois((s) => s.salarie.net), da: diffAn((s) => s.salarie.net) },
    ];
    if (ref.conjoint) rows.push({ k: "Net mensuel du conjoint", a: eur(ref.conjoint.net), b: two((s) => s.conjoint.net), dm: diffMois((s) => s.conjoint.net), da: diffAn((s) => s.conjoint.net) });
    rows.push(
      { k: "Net imposable du salarié", a: eur(ref.salarie.net_imposable), b: two((s) => s.salarie.net_imposable), dm: diffMois((s) => s.salarie.net_imposable), da: diffAn((s) => s.salarie.net_imposable) },
      { k: "Parts de quotient familial", a: U.nf1.format(ref.impot.parts), b: U.nf1.format(bas.impot.parts), dm: "—", da: "—" },
      { k: "Impôt sur le revenu annuel", a: eur(ref.impot.impot), b: two((s) => s.impot.impot), dm: diffMois((s) => s.impot.impot / 12), da: diffAn((s) => s.impot.impot / 12) },
      { k: "Prestations mensuelles (PA, AF, ARS)", a: eur(ref.prestations_mois), b: two((s) => s.prestations_mois), dm: diffMois((s) => s.prestations_mois), da: diffAn((s) => s.prestations_mois) },
      { k: "Revenu disponible mensuel", a: eur(ref.revenu_disponible_mois), b: two((s) => s.revenu_disponible_mois), dm: range(c.gain_mois.bas, c.gain_mois.haut, signed), da: range(c.gain_mois.bas * 12, c.gain_mois.haut * 12, signed) },
      { k: `Taxes sur la consommation (${ref.consommation.etiquette || "estimées"})`, a: eur(ref.parts_anneau.taxes_consommation_mois), b: two((s) => s.parts_anneau.taxes_consommation_mois), dm: diffMois((s) => s.parts_anneau.taxes_consommation_mois), da: diffAn((s) => s.parts_anneau.taxes_consommation_mois) },
      { k: "Pouvoir d'achat restant mensuel", a: eur(ref.pouvoir_achat_mois), b: two((s) => s.pouvoir_achat_mois), dm: range(c.gain_pouvoir_achat_mois.bas, c.gain_pouvoir_achat_mois.haut, signed), da: range(c.gain_pouvoir_achat_mois.bas * 12, c.gain_pouvoir_achat_mois.haut * 12, signed) },
    );
    const p = U.panel(`Ce qui change si ${c.nom} est élu(e) et applique ses mesures intégrées`, { sub: "Effet direct annoncé et taxes sur la consommation estimées, hors financement, hors effets sur l'emploi et les prix." });
    p.body.append(U.table(rows, [["k", "Ligne"], ["a", "2026"], ["b", c.nom], ["dm", "Écart / mois"], ["da", "Écart / an"]]));
    const s = U.el("p", "fr-src-line");
    s.append(ficheLink(c.id, "Fiche du candidat et programme complet"));
    p.body.append(s);
    return p.el;
  }

  function tous(d, onPick) {
    const p = U.panel(`Tous les candidats (${d.candidats.length})`, { sub: "Ordre du registre, jamais trié par gain. Cliquez sur une ligne pour afficher l'anneau du candidat, le détail et les citations." });
    const rows = d.candidats.map((c) => ({
      ...c,
      // « — » quand rien n'est intégré (sans effet ou non intégré) ; 0 € seulement si un effet intégré vaut 0 ici.
      pa: c.statut !== "calcule" ? "—" : range(c.resultats.bas.pouvoir_achat_mois, c.resultats.haut.pouvoir_achat_mois, eur),
      ecart_pa: c.statut !== "calcule" ? "—" : range(c.gain_pouvoir_achat_mois.bas, c.gain_pouvoir_achat_mois.haut, signed),
      dont_direct: c.statut !== "calcule" ? "—" : range(c.gain_mois.bas, c.gain_mois.haut, signed),
      dont_conso: c.statut !== "calcule" ? "—" : range(c.gain_consommation_mois.bas, c.gain_consommation_mois.haut, signed),
      n: `${c.integres.length} / ${c.conditionnels.length} / ${c.non_integres.length} / ${c.non_quantifiables.length}`,
      note: c.message || "",
    }));
    p.body.append(U.table(rows, [
      ["nom", "Candidat"],
      ["pa", "Pouvoir d'achat / mois"],
      ["ecart_pa", "Écart pouvoir d'achat"],
      ["dont_direct", "Dont direct (revenu disp.)"],
      ["dont_conso", "Dont consommation (estimé)"],
      ["n", "Intégrés / conditionnels / non intégrés / non chiffrables"],
      ["note", "Remarque"],
    ], (r) => onPick(r.id)));
    return p.el;
  }

  function methode(R) {
    const det = U.el("details", "fr-details");
    det.append(U.el("summary", null, "Méthode détaillée, sources et limites"));
    if (R.releve && R.releve.conversion) det.append(U.el("p", "muted", R.releve.conversion));
    const ul = U.el("ul", "fr-src");
    for (const m of R.methode || []) ul.append(U.el("li", null, m));
    det.append(ul);
    if ((R.parametres.manques || []).length) {
      const mTitle = U.el("h4", "fr-h3", "Paramètres absents des pages officielles accessibles (non inventés)");
      const mUl = U.el("ul", "fr-src");
      for (const mq of R.parametres.manques) mUl.append(U.el("li", null, `${mq.parametre} : ${mq.raison}`));
      det.append(mTitle, mUl);
    }
    if (R.releve && R.releve.releve) det.append(U.el("p", "muted", R.releve.releve));
    const src = U.el("p", "fr-src-line");
    src.append(
      document.createTextNode("Smic : "), sourceOf(R.parametres.smic_sources, R.parametres.smic_sources[0] && R.parametres.smic_sources[0].titre),
      document.createTextNode(" · plafond de la Sécurité sociale : "), sourceOf(R.parametres.pss_sources, R.parametres.pss_sources[0] && R.parametres.pss_sources[0].titre),
    );
    if (R.parametres.consommation && (R.parametres.consommation.sources || []).length) {
      src.append(document.createTextNode(" · consommation et déciles : "), sourceOf(R.parametres.consommation.sources, R.parametres.consommation.sources[0].titre));
    }
    det.append(src);
    return det;
  }

  // ------------------------------------------------------------ vue
  async function salaire(root) {
    U = window.MASTER_UI;
    const S = window.MASTER_SALAIRE;
    let R;
    try { R = await U.api("/api/france/salaire/regles"); } catch (e) {
      root.append(U.callout("info", "Calculateur indisponible", "Les barèmes de 2026 ne sont pas chargés.")); return;
    }
    root.append(U.callout("ia", `${R.libelle}.`, "Les mesures de chaque candidat qui touchent le revenu ou la consommation d'un salarié ont été classées par IA à partir des citations de son programme ; chaque effet renvoie à sa citation exacte et à sa source."));
    const warn = U.el("div", "callout attention");
    const ul = U.el("ul", "fr-src");
    for (const w of R.avertissements || []) ul.append(U.el("li", null, w));
    const wp = U.el("div");
    wp.append(U.el("b", null, "À lire avant les chiffres."), ul);
    warn.append(U.icon("alert"), wp);
    root.append(warn);
    if ((R.erreurs || []).length) root.append(U.callout("attention", `${R.erreurs.length} entrée(s) du relevé écartée(s) à la validation :`, R.erreurs.join(" ; ")));
    const state = {
      brut: R.parametres.smic_brut_mois, cadre: false, effectif: "11_49", heures_sup: 0,
      situation: "seul", enfants: 0, ages_enfants: [], parent_isole: false, brut_conjoint: 0, candidat: "tous",
    };
    const out = U.el("div", "fr-body");
    let seq = 0;
    const sel = () => root.querySelector('.fr-sal-form select[aria-label="Candidat"]');
    const pick = (cid) => { state.candidat = cid; if (sel()) sel().value = cid; run(); };
    async function run() {
      const n = ++seq;
      const foyer = { situation: state.situation, enfants: state.enfants, parent_isole: state.parent_isole, ages_enfants: state.ages_enfants.slice() };
      const cands = state.candidat === "tous" ? R.candidats : R.candidats.filter((c) => c.id === state.candidat);
      let d;
      try {
        S.revenu(R, state.brut, foyer, state.cadre, state.brut_conjoint, state.effectif, state.heures_sup);
        if (window.MASTER_STATIC) {
          d = S.comparer(R, state.brut, foyer, state.cadre, state.brut_conjoint, cands, state.effectif, state.heures_sup);
        } else {
          const q = new URLSearchParams({
            brut: String(state.brut), cadre: state.cadre ? "1" : "0", situation: state.situation,
            enfants: String(state.enfants), parent_isole: state.parent_isole ? "1" : "0",
            brut_conjoint: String(state.brut_conjoint), effectif: state.effectif,
            heures_sup: String(state.heures_sup), ages_enfants: state.ages_enfants.join(","),
            candidat: state.candidat,
          });
          d = await U.api(`/api/france/salaire?${q}`);
        }
      } catch (e) {
        if (n === seq) out.replaceChildren(U.callout("erreur", "Entrée à corriger.", e.message));
        return;
      }
      if (n !== seq) return;
      const pickedCand = state.candidat !== "tous" ? d.candidats[0] : null;
      const parts = [anneauxSection(d, pickedCand), reference(R, d)];
      if (state.candidat === "tous") {
        parts.push(U.el("h3", "fr-theme-h", "Si le candidat est élu"), tous(d, pick));
      } else {
        for (const c of d.candidats) {
          parts.push(U.el("h3", "fr-theme-h", `Si ${c.nom} est élu(e)`), ...(c.statut === "calcule" ? [comparaison(d, c)] : []), effets(c));
        }
      }
      parts.push(methode(R));
      out.replaceChildren(...parts);
    }
    root.append(form(R, state, run), out);
    await run();
  }

  window.MASTER_FRANCE_PROJ_VIEWS = Object.assign(window.MASTER_FRANCE_PROJ_VIEWS || {}, { salaire: (root) => salaire(root) });
})();
