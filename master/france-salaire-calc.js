/* Master — moteur du calculateur de salaire (France politique, F10), port JavaScript de master/france/salaire.py.
   Même calcul, mêmes opérations dans le même ordre (résultats identiques au centime, vérifiés par un test croisé
   Python/JS) ; il lit les paramètres normalisés et les effets validés de /api/france/salaire/regles. Sert à la
   version en ligne (calcul dans le navigateur) et à node pour le test croisé. Aucune donnée n'est inventée ici :
   textes de méthode, avertissements et messages viennent aussi des règles. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MASTER_SALAIRE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const BRUT_MAX = 100000;
  const ENFANTS_MAX = 10;
  const ITERATIONS = 100;
  const SITUATIONS = ["seul", "couple"];

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  function checkBrut(v, nom) {
    if (!isNum(v) || v < 0 || v > BRUT_MAX) throw new Error(`${nom || "brut"} : nombre entre 0 et ${BRUT_MAX} € par mois attendu`);
    return v;
  }

  function checkFoyer(f, brutConjoint) {
    if (!f || typeof f !== "object" || !SITUATIONS.includes(f.situation)) throw new Error("situation : « seul » ou « couple »");
    const n = f.enfants === undefined ? 0 : f.enfants;
    if (!Number.isInteger(n) || n < 0 || n > ENFANTS_MAX) throw new Error(`enfants : entier entre 0 et ${ENFANTS_MAX}`);
    const iso = f.parent_isole === undefined ? false : f.parent_isole;
    if (typeof iso !== "boolean") throw new Error("parent isolé : oui ou non");
    if (iso && (f.situation !== "seul" || n < 1)) throw new Error("parent isolé : personne seule avec au moins un enfant");
    if (f.situation === "seul" && brutConjoint > 0) throw new Error("brut du conjoint : seulement en couple");
    return { situation: f.situation, enfants: n, parent_isole: iso };
  }

  // ------------------------------------------------------------ net
  function netCalc(brut, cadre, p, csgDelta) {
    csgDelta = csgDelta || 0;
    const pss = p.pss_mois;
    const t1 = Math.min(brut, pss);
    const t2 = Math.min(Math.max(brut - pss, 0), (p.tranche_2_pss - 1) * pss);
    const lignes = [];
    let cot = 0;
    for (const x of p.lignes) {
      if (x.cadres && !cadre) continue;
      let base;
      if (x.assiette === "tranche_1") base = t1;
      else if (x.assiette === "tranche_2") base = t2;
      else if (x.assiette === "t1_t2_si_depasse_pss") base = brut > pss ? t1 + t2 : 0;
      else if (x.assiette === "plafond_4_pss") base = Math.min(brut, p.apec_pss * pss);
      else base = brut;
      const montant = base * x.taux / 100;
      cot += montant;
      lignes.push({ nom: x.nom, assiette: base, taux: x.taux, montant });
    }
    const c = p.csg;
    const plafond = c.abattement_jusqu_a_pss * pss;
    const assiette = Math.min(brut, plafond) * c.assiette_pct / 100 + Math.max(brut - plafond, 0);
    const tot = c.deductible + c.non_deductible;
    const ded = c.deductible + csgDelta * c.deductible / tot;
    const nd = c.non_deductible + csgDelta * c.non_deductible / tot;
    const csgD = assiette * ded / 100, csgN = assiette * nd / 100, crds = assiette * c.crds / 100;
    return {
      brut, cadre, lignes, cotisations: cot,
      csg_crds: { assiette, taux_deductible: ded, taux_non_deductible: nd, taux_crds: c.crds, csg_deductible: csgD, csg_non_deductible: csgN, crds },
      net: brut - cot - csgD - csgN - crds, net_imposable: brut - cot - csgD,
    };
  }

  function brutPourNet(cible, cadre, p, csgDelta) {  // plus petit brut dont le net atteint la cible (dichotomie)
    let lo = 0, hi = cible * 2 + 100;
    for (let i = 0; i < ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (netCalc(mid, cadre, p, csgDelta).net >= cible) hi = mid; else lo = mid;
    }
    return hi;
  }

  // ------------------------------------------------------------ impôt sur le revenu
  function bareme(q, tranches) {
    let total = 0;
    for (const t of tranches) if (q > t.de) total += ((t.a === null ? q : Math.min(q, t.a)) - t.de) * t.taux / 100;
    return total;
  }

  function impotCalc(revenus, f, p, partEntiereDes) {
    const ir = p.ir;
    const rang = partEntiereDes || ir.part_entiere_des_enfant;
    const abatt = revenus.map((x) => (x > 0 ? Math.min(x, Math.max(ir.abattement_min, Math.min(ir.abattement_max, x * ir.abattement_pct / 100))) : 0));
    let rni = 0;
    revenus.forEach((x, i) => { rni += Math.max(x - abatt[i], 0); });
    const base = f.situation === "couple" ? 2 : 1;
    let enf = 0;
    for (let i = 1; i <= f.enfants; i++) enf += i >= rang ? 1 : 0.5;
    const parts = base + enf + (f.parent_isole ? 0.5 : 0);
    const demi = Math.round((parts - base) * 2);
    const plafond = f.parent_isole ? ir.plafond_parent_isole + ir.plafond_demi_part * Math.max(demi - 2, 0) : ir.plafond_demi_part * demi;
    const iParts = parts * bareme(rni / parts, ir.tranches);
    const iBase = base * bareme(rni / base, ir.tranches);
    const plafonne = iBase - iParts > plafond;
    const brut = plafonne ? iBase - plafond : iParts;
    const d = ir.decote;
    const [seuil, coef] = f.situation === "couple" ? [d.seuil_couple, d.coef_couple] : [d.seuil_celibataire, d.coef_celibataire];
    const decote = brut < seuil ? Math.min(brut, Math.max(coef - brut * d.taux / 100, 0)) : 0;
    const apres = brut - decote;
    const recouvre = apres >= ir.seuil_recouvrement;
    return {
      revenus, abattements: abatt, revenu_net_imposable: rni, parts, parts_base: base, impot_parts: iParts, impot_base: iBase,
      plafond_avantage: plafond, plafonnement: plafonne, impot_avant_decote: brut, decote, impot_apres_decote: apres,
      recouvrement: recouvre, impot: recouvre ? apres : 0,
    };
  }

  function foyerCalc(sal, conj, f, p, partEntiereDes) {
    const revenus = [sal.net_imposable * 12].concat(conj ? [conj.net_imposable * 12] : []);
    const i = impotCalc(revenus, f, p, partEntiereDes);
    const nets = sal.net + (conj ? conj.net : 0);
    return { salarie: sal, conjoint: conj, impot: i, nets_mois: nets, revenu_disponible_mois: nets - i.impot / 12 };
  }

  function entrees(brut, foyer, brutConjoint) {
    const b = checkBrut(brut);
    const bc = checkBrut(brutConjoint || 0, "brut du conjoint");
    return [b, checkFoyer(foyer, bc), bc];
  }

  // ------------------------------------------------------------ API publique (mêmes noms que le module Python)
  function net(r, brut, cadre) { return netCalc(checkBrut(brut), !!cadre, r.parametres); }

  function impot(r, revenus, foyer) {
    if (!Array.isArray(revenus) || revenus.length < 1 || revenus.length > 2 || !revenus.every((x) => isNum(x) && x >= 0)) throw new Error("revenus imposables : un ou deux montants positifs");
    return impotCalc(revenus, checkFoyer(foyer, 0), r.parametres);
  }

  function revenu(r, brut, foyer, cadre, brutConjoint) {
    const [b, f, bc] = entrees(brut, foyer, brutConjoint);
    const p = r.parametres;
    const conj = f.situation === "couple" ? netCalc(bc, !!cadre, p) : null;
    return foyerCalc(netCalc(b, !!cadre, p), conj, f, p);
  }

  // ------------------------------------------------------------ candidats
  const cent = (x) => Math.floor(x * 100 + 0.5) / 100;  // arrondi au centime, identique en Python

  function baisseCot(n, montant, pct, assiette, nom) {  // baisse des cotisations : brut inchangé, net et net imposable + montant
    return { ...n, lignes: n.lignes.concat([{ nom, assiette, taux: -pct, montant: -montant }]),
      cotisations: n.cotisations - montant, net: n.net + montant, net_imposable: n.net_imposable + montant };
  }

  function salarie(brut, cadre, p, integres, cote, nomBaisse) {
    const etats = {};
    let csg = 0;
    for (const e of integres) if (e.type === "csg_points") csg += e.valeur;
    const ref = netCalc(brut, cadre, p);
    if (brut <= 0) {
      integres.forEach((e, i) => { if (e.type !== "qf_part_entiere_des_enfant") etats[i] = "sans_salaire"; });
      return [ref, etats];
    }
    const base = csg ? netCalc(brut, cadre, p, csg) : ref;
    let pctSal = 0, pctCot = 0;
    integres.forEach((e, i) => {
      if (e.type === "csg_points") etats[i] = "retenu";
      else if (e.type === "net_pct") {
        const cap = e.jusqu_a_smic_x;
        if (cap !== null && cap !== undefined && brut > cent(cap * p.smic_brut_mois)) etats[i] = "hors_champ";
        else {
          const v = cote === "bas" ? e.min : e.max;
          if (e.mode === "baisse_cotisations") pctCot += v; else pctSal += v;
          etats[i] = "retenu";
        }
      }
    });
    const baisse = ref.net * pctCot / 100;
    const nPre = base.net + ref.net * pctSal / 100 + baisse;
    const euros = [], planchers = [];
    integres.forEach((e, i) => { if (e.type === "net_euros_mois") euros.push(i); else if (e.type === "plancher_net_mois") planchers.push(i); });
    const smic = p.smic_brut_mois;
    const eff = {};  // Smic cible : au prorata sous le Smic mensuel (temps partiel) ; plancher de revenu : en entier
    for (const i of planchers) eff[i] = integres[i].nature === "smic" && brut < smic ? integres[i].valeur * brut / smic : integres[i].valeur;
    let somme = 0;
    for (const i of euros) somme += integres[i].valeur;
    const hausse = nPre + somme;
    let plancher = null;
    for (const i of planchers) if (plancher === null || eff[i] > plancher) plancher = eff[i];
    const cible = plancher !== null ? Math.max(hausse, plancher) : hausse;
    for (const i of euros) etats[i] = plancher === null || hausse >= plancher ? "retenu" : "non_cumule";
    for (const i of planchers) {
      const v = eff[i];
      if (v <= nPre) etats[i] = "sans_effet";
      else if (v < plancher || hausse >= v) etats[i] = "non_cumule";
      else etats[i] = "retenu";
    }
    const out = cible === nPre && pctSal === 0 ? base : netCalc(brutPourNet(cible - baisse, cadre, p, csg), cadre, p, csg);
    return [pctCot ? baisseCot(out, baisse, pctCot, ref.net, nomBaisse) : out, etats];
  }

  function scenario(b, bc, f, cadre, p, integres, cote, nomBaisse) {
    const [sal, es] = salarie(b, cadre, p, integres, cote, nomBaisse);
    const [conj, ec] = f.situation === "couple" ? salarie(bc, cadre, p, integres, cote, nomBaisse) : [null, null];
    let rang = null;
    for (const e of integres) if (e.type === "qf_part_entiere_des_enfant" && (rang === null || e.valeur < rang)) rang = e.valeur;
    return [foyerCalc(sal, conj, f, p, rang), es, ec];
  }

  function calcul(cid, nom, b, f, cadre, bc, r, ref) {
    const p = r.parametres;
    const e = r.effets[cid] || { integres: [], conditionnels: [], non_integres: [], non_quantifiables: [] };
    const integres = e.integres;
    const fourchette = integres.some((x) => x.type === "net_pct" && x.min !== x.max);
    const [bas, es, ec] = scenario(b, bc, f, cadre, p, integres, "bas", r.ligne_baisse);
    const haut = fourchette ? scenario(b, bc, f, cadre, p, integres, "haut", r.ligne_baisse)[0] : bas;
    const outInt = integres.map((x, i) => {
      let app;
      if (x.type === "qf_part_entiere_des_enfant") {
        app = { salarie: f.enfants >= x.valeur && x.valeur < p.ir.part_entiere_des_enfant ? "retenu" : "sans_effet", conjoint: null };
      } else {
        app = { salarie: i in es ? es[i] : null, conjoint: ec !== null && i in ec ? ec[i] : null };
      }
      return { ...x, application: app };
    });
    const outCond = e.conditionnels.map((x) => {
      if (x.requiert_enfant && f.enfants === 0) return { ...x, applicable: false, raison: r.raison_sans_enfant, si_concerne: null };
      const si = {};
      for (const [k, s] of [["bas", bas], ["haut", haut]]) {
        const gain = s.impot.impot * x.valeur / 100;
        si[k] = { impot: s.impot.impot - gain, gain_mois: gain / 12, revenu_disponible_mois: s.revenu_disponible_mois + gain / 12 };
      }
      return { ...x, applicable: true, raison: null, si_concerne: si };
    });
    const statut = integres.length ? "calcule" : (e.conditionnels.length || e.non_integres.length ? "non_integre" : "sans_effet");
    const message = integres.length ? null : (statut === "non_integre" ? r.message_non_integre : r.message_sans_effet);
    return {
      id: cid, nom: nom || cid, statut, message, fourchette, resultats: { bas, haut },
      gain_mois: { bas: bas.revenu_disponible_mois - ref.revenu_disponible_mois, haut: haut.revenu_disponible_mois - ref.revenu_disponible_mois },
      integres: outInt, conditionnels: outCond, non_integres: e.non_integres, non_quantifiables: e.non_quantifiables,
    };
  }

  function candidat(r, cid, brut, foyer, cadre, brutConjoint, nom) {
    const ref = revenu(r, brut, foyer, cadre, brutConjoint);
    const [b, f, bc] = entrees(brut, foyer, brutConjoint);
    return { reference: ref, ...calcul(cid, nom, b, f, !!cadre, bc, r, ref), libelle: r.libelle, methode: r.methode, avertissements: r.avertissements };
  }

  function comparer(r, brut, foyer, cadre, brutConjoint, candidats) {
    const ref = revenu(r, brut, foyer, cadre, brutConjoint);
    const [b, f, bc] = entrees(brut, foyer, brutConjoint);
    const list = candidats || Object.keys(r.effets).map((id) => ({ id, nom: id }));
    return {
      date: r.date, entree: { brut: b, cadre: !!cadre, ...f, brut_conjoint: bc }, reference: ref,
      candidats: list.map((c) => calcul(c.id, c.nom, b, f, !!cadre, bc, r, ref)),
      libelle: r.libelle, methode: r.methode, avertissements: r.avertissements, erreurs: r.erreurs,
    };
  }

  return { net, impot, revenu, candidat, comparer, BRUT_MAX, ENFANTS_MAX };
});
