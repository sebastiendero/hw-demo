/* Master — moteur du calculateur de salaire v2 (France politique, F10 + v2), port JavaScript de master/france/salaire.py.
   Même calcul, mêmes opérations dans le même ordre (résultats identiques au centime, vérifiés par un test croisé
   Python/JS sur 400 cas tirés au hasard) ; il lit les paramètres normalisés et les effets validés de
   /api/france/salaire/regles. Sert à la version en ligne (calcul dans le navigateur) et à node pour le test croisé.
   Aucune donnée n'est inventée ici : textes de méthode, avertissements et messages viennent aussi des règles. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MASTER_SALAIRE = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const BRUT_MAX = 100000;
  const ENFANTS_MAX = 10;
  const AGE_ENFANT_DEFAUT = 8;
  const AGE_ENFANT_MAX = 25;
  const HEURES_SUP_MAX = 200;
  const ITERATIONS = 100;
  const SITUATIONS = ["seul", "couple"];
  const EFFECTIFS = ["moins_11", "11_49", "50_plus"];
  const EFFECTIF_DEFAUT = "11_49";

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);
  const roundN = (v, n) => { const f = Math.pow(10, n); return Math.round(v * f) / f; };
  const cent = (x) => Math.floor(x * 100 + 0.5) / 100;  // arrondi au centime, identique en Python

  function checkBrut(v, nom) {
    if (!isNum(v) || v < 0 || v > BRUT_MAX) throw new Error(`${nom || "brut"} : nombre entre 0 et ${BRUT_MAX} € par mois attendu`);
    return v;
  }

  function checkEffectif(v) {
    if (v === undefined || v === null) return EFFECTIF_DEFAUT;
    if (!EFFECTIFS.includes(v)) throw new Error("effectif : « moins_11 », « 11_49 » ou « 50_plus »");
    return v;
  }

  function checkHeuresSup(v) {
    if (v === undefined || v === null) return 0;
    if (!isNum(v) || v < 0 || v > HEURES_SUP_MAX) throw new Error(`heures supplémentaires : nombre entre 0 et ${HEURES_SUP_MAX} h par mois attendu`);
    return v;
  }

  function checkTauxAtMp(v) {
    if (v === undefined || v === null) return null;
    if (!isNum(v) || v < 0 || v > 20) throw new Error("taux AT/MP : pourcentage entre 0 et 20 attendu");
    return v / 100;
  }

  function checkFoyer(f, brutConjoint) {
    if (!f || typeof f !== "object" || !SITUATIONS.includes(f.situation)) throw new Error("situation : « seul » ou « couple »");
    const n = f.enfants === undefined ? 0 : f.enfants;
    if (!Number.isInteger(n) || n < 0 || n > ENFANTS_MAX) throw new Error(`enfants : entier entre 0 et ${ENFANTS_MAX}`);
    const iso = f.parent_isole === undefined ? false : f.parent_isole;
    if (typeof iso !== "boolean") throw new Error("parent isolé : oui ou non");
    if (iso && (f.situation !== "seul" || n < 1)) throw new Error("parent isolé : personne seule avec au moins un enfant");
    if (f.situation === "seul" && brutConjoint > 0) throw new Error("brut du conjoint : seulement en couple");
    let ages;
    if (f.ages_enfants === undefined || f.ages_enfants === null) {
      ages = Array(n).fill(AGE_ENFANT_DEFAUT);
    } else {
      if (!Array.isArray(f.ages_enfants) || f.ages_enfants.length !== n || !f.ages_enfants.every((a) => Number.isInteger(a) && a >= 0 && a <= AGE_ENFANT_MAX)) {
        throw new Error(`ages_enfants : liste de ${n} entiers entre 0 et ${AGE_ENFANT_MAX} ans`);
      }
      ages = f.ages_enfants.slice();
    }
    return { situation: f.situation, enfants: n, parent_isole: iso, ages_enfants: ages };
  }

  // ------------------------------------------------------------ heures supplémentaires
  function heuresSupCalc(brutBase, hsMois, p, effectif, modeExo, plafondHeuresAn) {
    effectif = effectif || EFFECTIF_DEFAUT;
    const hsP = p.heures_sup || {};
    if (!hsP.calcule) {
      return { calcule: false, raison: hsP.raison || null, heures_mois: hsMois, brut_hs: 0, reduction_salariale: 0,
        net_imposable_hs_exonere: 0, net_imposable_hs_imposable: 0, deduction_patronale: 0 };
    }
    if (hsMois <= 0 || brutBase <= 0) {
      return { calcule: true, raison: null, heures_mois: 0, taux_horaire_base: brutBase > 0 ? brutBase / p.heures_mensuelles_35h : 0,
        heures_25: 0, heures_50: 0, brut_hs: 0, reduction_salariale: 0, net_imposable_hs_exonere: 0, net_imposable_hs_imposable: 0, deduction_patronale: 0 };
    }
    const tauxH = brutBase / p.heures_mensuelles_35h;
    const h25 = Math.min(hsMois, p.seuil_hs_25_mois);
    const h50 = Math.max(hsMois - p.seuil_hs_25_mois, 0);
    const brutHs = h25 * tauxH * (1 + hsP.maj_25) + h50 * tauxH * (1 + hsP.maj_50);
    const redSal = brutHs * hsP.taux_reduction_salariale;
    const csgDTaux = (p.csg.assiette_pct / 100) * (p.csg.deductible / 100);
    let exoMois, impMois;
    if (modeExo === "totale") {
      exoMois = brutHs;
      impMois = 0;
    } else {
      const netImpHs = brutHs * (1 - csgDTaux);
      let plafMois;
      if (modeExo === "ir" && plafondHeuresAn !== null && plafondHeuresAn !== undefined) {
        const partH = Math.min(1, (plafondHeuresAn / 12) / hsMois);
        const plafMesureMois = netImpHs * partH;
        plafMois = Math.max(hsP.plafond_ir_annuel / 12, plafMesureMois);
      } else {
        plafMois = hsP.plafond_ir_annuel / 12;
      }
      exoMois = Math.min(netImpHs, plafMois);
      impMois = Math.max(netImpHs - exoMois, 0);
    }
    const dedPatH = effectif === "moins_11" ? hsP.deduction_patronale_moins_20 : hsP.deduction_patronale_20_plus;
    const dedPat = hsMois * dedPatH;
    return {
      calcule: true, raison: null, heures_mois: hsMois, taux_horaire_base: tauxH, heures_25: h25, heures_50: h50,
      brut_hs: brutHs, reduction_salariale: redSal, net_imposable_hs_exonere: exoMois,
      net_imposable_hs_imposable: impMois, deduction_patronale: dedPat,
    };
  }

  // ------------------------------------------------------------ coût employeur et RGDU
  function coutEmployeurCalc(brutBase, cadre, p, effectif, heuresMois, tauxAtMp, exoHsTotale) {
    effectif = effectif || EFFECTIF_DEFAUT;
    heuresMois = heuresMois || 0;
    const pat = p.patronales || {};
    if (!pat.calcule) {
      return { calcule: false, raison: pat.raison || null, brut: brutBase, cotisations_brutes: 0, reduction_generale: 0,
        coefficient_rgdu: 0, deduction_hs: 0, cotisations_nettes: 0, cout_total: brutBase, lignes: [] };
    }
    const hs = heuresSupCalc(brutBase, heuresMois, p, effectif, exoHsTotale ? "totale" : null);
    const brutHs = hs.calcule ? hs.brut_hs : 0;
    const brutTotal = brutBase + brutHs;
    const assiettePat = exoHsTotale ? brutBase : brutTotal;
    if (assiettePat <= 0) {
      return { calcule: true, raison: null, effectif, brut_base: brutBase, brut_hs: brutHs, brut: brutTotal,
        cotisations_brutes: 0, coefficient_rgdu: 0, reduction_generale: 0, deduction_hs: 0, cotisations_nettes: 0,
        cout_total: 0, at_mp_taux_applique: 0, at_mp_indicatif: pat.at_mp_indicatif || null, lignes: [] };
    }
    const pss = p.pss_mois;
    const t1 = Math.min(assiettePat, pss);
    const t2 = Math.min(Math.max(assiettePat - pss, 0), (p.tranche_2_pss - 1) * pss);
    const p4 = Math.min(assiettePat, p.apec_pss * pss);
    const atTaux = tauxAtMp !== null && tauxAtMp !== undefined ? tauxAtMp : pat.at_mp_mutualise;
    const fnal50 = effectif === "50_plus";
    const fnalTaux = fnal50 ? pat.fnal_50_plus : pat.fnal_moins_50;
    const fnalBase = fnal50 ? assiettePat : t1;
    const formTaux = effectif === "moins_11" ? pat.formation_moins_11 : pat.formation_11_plus;

    const rawLignes = [
      ["Assurance maladie, maternité, invalidité, décès", assiettePat, pat.maladie],
      ["Assurance vieillesse plafonnée", t1, pat.vieillesse_plafonnee],
      ["Assurance vieillesse déplafonnée", assiettePat, pat.vieillesse_deplafonnee],
      ["Allocations familiales", assiettePat, pat.allocations_familiales],
      [tauxAtMp === null || tauxAtMp === undefined ? "Accidents du travail et maladies professionnelles (fraction mutualisée)" : "Accidents du travail et maladies professionnelles (AT/MP)", assiettePat, atTaux],
      ["Contribution solidarité autonomie (CSA)", assiettePat, pat.csa],
      ["Assurance chômage", p4, pat.chomage],
      ["Cotisation AGS", p4, pat.ags],
      ["Retraite complémentaire Agirc-Arrco tranche 1", t1, pat.retraite_t1],
      ["Retraite complémentaire Agirc-Arrco tranche 2", t2, pat.retraite_t2],
      ["Contribution d'équilibre général (CEG) tranche 1", t1, pat.ceg_t1],
      ["Contribution d'équilibre général (CEG) tranche 2", t2, pat.ceg_t2],
      ["Contribution d'équilibre technique (CET)", assiettePat > pss ? t1 + t2 : 0, pat.cet],
    ];
    if (cadre) {
      rawLignes.push(["Apec", p4, pat.apec]);
      rawLignes.push(["Prévoyance cadre minimale", t1, pat.prevoyance_cadre]);
    }
    rawLignes.push(
      ["Fonds national d'aide au logement (FNAL)", fnalBase, fnalTaux],
      ["Contribution à la formation professionnelle", assiettePat, formTaux],
      ["Taxe d'apprentissage (part principale et solde)", assiettePat, pat.taxe_apprentissage],
      ["Contribution au dialogue social", assiettePat, pat.dialogue_social],
    );
    const lignes = [];
    let cotBrutes = 0;
    for (const [nom, base, tauxFrac] of rawLignes) {
      const m = base * tauxFrac;
      cotBrutes += m;
      lignes.push({ nom, assiette: base, taux: roundN(tauxFrac * 100, 4), montant: m });
    }
    let smicRef = p.smic_brut_mois_01_01_2026;
    if (!exoHsTotale && heuresMois > 0) {
      const smicHorJan = smicRef / p.heures_mensuelles_35h;
      smicRef = smicRef + heuresMois * smicHorJan;
    }
    const seuilRgdu = pat.rgdu_seuil_smic * smicRef;
    const tDelta = fnal50 ? pat.rgdu_t_delta_50_plus : pat.rgdu_t_delta_moins_50;
    const tMax = fnal50 ? pat.rgdu_t_max_50_plus : pat.rgdu_t_max_moins_50;
    let coef = 0, rgdu = 0;
    if (assiettePat < seuilRgdu) {
      const ratio = 0.5 * (seuilRgdu / assiettePat - 1);
      const coefRaw = ratio > 0 ? pat.rgdu_t_min + tDelta * Math.pow(ratio, pat.rgdu_p) : pat.rgdu_t_min;
      coef = Math.min(tMax, Math.floor(coefRaw * 10000 + 0.5) / 10000);
      rgdu = assiettePat * coef;
    }
    const dedHs = exoHsTotale ? 0 : hs.deduction_patronale;
    const cotNettes = Math.max(0, cotBrutes - rgdu - dedHs);
    return {
      calcule: true, raison: null, effectif, brut_base: brutBase, brut_hs: brutHs, brut: brutTotal,
      cotisations_brutes: cotBrutes, coefficient_rgdu: coef, reduction_generale: rgdu, deduction_hs: dedHs,
      cotisations_nettes: cotNettes, cout_total: brutTotal + cotNettes,
      at_mp_taux_applique: roundN(atTaux * 100, 4), at_mp_indicatif: pat.at_mp_indicatif || null,
      at_mp_note: pat.at_mp_note || null, lignes,
    };
  }

  // ------------------------------------------------------------ net
  function netCalc(brutBase, cadre, p, csgDelta, heuresMois, effectif, modeExoHs, plafondHsAn, nomRedHs) {
    csgDelta = csgDelta || 0;
    heuresMois = heuresMois || 0;
    effectif = effectif || EFFECTIF_DEFAUT;
    const hs = heuresSupCalc(brutBase, heuresMois, p, effectif, modeExoHs, plafondHsAn);
    const brutHs = hs.calcule ? hs.brut_hs : 0;
    const brut = brutBase + brutHs;
    const assietteCot = modeExoHs === "totale" ? brutBase : brut;
    const pss = p.pss_mois;
    const t1 = Math.min(assietteCot, pss);
    const t2 = Math.min(Math.max(assietteCot - pss, 0), (p.tranche_2_pss - 1) * pss);
    const lignes = [];
    let cot = 0;
    for (const x of p.lignes) {
      if (x.cadres && !cadre) continue;
      let base;
      if (x.assiette === "tranche_1") base = t1;
      else if (x.assiette === "tranche_2") base = t2;
      else if (x.assiette === "t1_t2_si_depasse_pss") base = assietteCot > pss ? t1 + t2 : 0;
      else if (x.assiette === "plafond_4_pss") base = Math.min(assietteCot, p.apec_pss * pss);
      else base = assietteCot;
      const montant = base * x.taux / 100;
      cot += montant;
      lignes.push({ nom: x.nom, assiette: base, taux: x.taux, montant });
    }
    let redHs = modeExoHs === "totale" ? 0 : (hs.calcule ? hs.reduction_salariale : 0);
    redHs = Math.min(cot, redHs);
    if (redHs > 0) {
      cot -= redHs;
      lignes.push({ nom: nomRedHs || "Réduction de cotisations salariales sur heures supplémentaires", assiette: brutHs,
        taux: -roundN(p.heures_sup.taux_reduction_salariale * 100, 4), montant: -redHs });
    }
    const c = p.csg;
    const plafond = c.abattement_jusqu_a_pss * pss;
    const assiette = Math.min(assietteCot, plafond) * c.assiette_pct / 100 + Math.max(assietteCot - plafond, 0);
    const tot = c.deductible + c.non_deductible;
    const ded = c.deductible + csgDelta * c.deductible / tot;
    const nd = c.non_deductible + csgDelta * c.non_deductible / tot;
    const csgD = assiette * ded / 100, csgN = assiette * nd / 100, crds = assiette * c.crds / 100;
    const exoIrHs = hs.calcule ? hs.net_imposable_hs_exonere : 0;
    const netVal = brut - cot - csgD - csgN - crds;
    const netImp = Math.max(0, brut - cot - csgD - exoIrHs);
    return {
      brut, brut_base: brutBase, brut_hs: brutHs, heures_sup: hs, cadre, lignes, cotisations: cot,
      csg_crds: { assiette, taux_deductible: ded, taux_non_deductible: nd, taux_crds: c.crds, csg_deductible: csgD, csg_non_deductible: csgN, crds },
      net: netVal, net_imposable: netImp,
    };
  }

  function brutPourNet(cible, cadre, p, csgDelta, heuresMois, effectif, modeExoHs, plafondHsAn, nomRedHs) {
    let lo = 0, hi = cible * 2 + 100;
    for (let i = 0; i < ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (netCalc(mid, cadre, p, csgDelta, heuresMois, effectif, modeExoHs, plafondHsAn, nomRedHs).net >= cible) hi = mid; else lo = mid;
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

  // ------------------------------------------------------------ allocations familiales, ARS et prime d'activité
  function allocationsCalc(rncAnnuel, f, p, allocPremierEnfant) {
    const afP = p.allocations || {};
    if (!afP.calcule) {
      return { calcule: false, raison: afP.raison || null, allocations_familiales_mois: 0, ars_mois: 0, total_mois: 0 };
    }
    const n = f.enfants;
    const ages = f.ages_enfants;
    if (n <= 0) {
      return { calcule: true, raison: null, tranche: null, allocations_familiales_base_mois: 0, majoration_age_mois: 0,
        complement_degressif_mois: 0, allocations_familiales_mois: 0, ars_annuelle: 0, ars_mois: 0, total_mois: 0 };
    }
    const enfSupPlaf = Math.max(n - 2, 0);
    const plaf1 = afP.plafond_t1_2 + enfSupPlaf * afP.plafond_sup;
    const plaf2 = afP.plafond_t2_2 + enfSupPlaf * afP.plafond_sup;
    let tranche, div, plafDepasse;
    if (rncAnnuel <= plaf1) { tranche = 1; div = 1; plafDepasse = null; }
    else if (rncAnnuel <= plaf2) { tranche = 2; div = 2; plafDepasse = plaf1; }
    else { tranche = 3; div = 4; plafDepasse = plaf2; }

    if (allocPremierEnfant !== null && allocPremierEnfant !== undefined) {
      const baseT1 = allocPremierEnfant * n;
      const baseMod = baseT1 / div;
      let compl = 0;
      if (plafDepasse !== null) {
        const montantPrec = tranche === 2 ? baseT1 : baseT1 / 2;
        const diff = rncAnnuel - plafDepasse;
        if (diff < 12 * montantPrec) compl = Math.max(0, (plafDepasse + 12 * montantPrec - rncAnnuel) / 12 - baseMod);
      }
      const afMois = baseMod + compl;
      return { calcule: true, raison: null, tranche, allocations_familiales_base_mois: baseMod, majoration_age_mois: 0,
        complement_degressif_mois: compl, allocations_familiales_mois: afMois, ars_annuelle: 0, ars_mois: 0, total_mois: afMois };
    }

    let afBase = 0, majAge = 0, compl = 0, afMois = 0;
    if (n >= 2) {
      const baseT1 = afP.af_2 + Math.max(n - 2, 0) * afP.af_sup;
      afBase = baseT1 / div;
      const agesTries = ages.slice().sort((a, b) => b - a);
      const eligiblesAge = n === 2 ? agesTries.slice(1) : agesTries;
      let nbMaj = 0;
      for (const a of eligiblesAge) if (a >= afP.age_maj && a < 20) nbMaj++;
      const majUnit = tranche === 1 ? afP.maj_t1 : (tranche === 2 ? afP.maj_t2 : afP.maj_t3);
      majAge = nbMaj * majUnit;
      const montantAvantCompl = afBase + majAge;
      if (plafDepasse !== null) {
        const majPrec = tranche === 2 ? afP.maj_t1 : afP.maj_t2;
        const montantPrec = (tranche === 2 ? baseT1 : baseT1 / 2) + nbMaj * majPrec;
        const diff = rncAnnuel - plafDepasse;
        if (diff < 12 * montantPrec) compl = Math.max(0, (plafDepasse + 12 * montantPrec - rncAnnuel) / 12 - montantAvantCompl);
      }
      afMois = montantAvantCompl + compl;
    }

    const plafArs = afP.ars_plafond_1 + Math.max(n - 1, 0) * afP.ars_plafond_sup;
    let arsAn = 0;
    if (rncAnnuel <= plafArs) {
      for (const a of ages) {
        if (a >= 6 && a <= 10) arsAn += afP.ars_6_10;
        else if (a >= 11 && a <= 14) arsAn += afP.ars_11_14;
        else if (a >= 15 && a <= 18) arsAn += afP.ars_15_18;
      }
    }
    const arsMois = arsAn / 12;
    return {
      calcule: true, raison: null, tranche: n >= 2 ? tranche : null,
      allocations_familiales_base_mois: afBase, majoration_age_mois: majAge, complement_degressif_mois: compl,
      allocations_familiales_mois: afMois, ars_annuelle: arsAn, ars_mois: arsMois, total_mois: afMois + arsMois,
    };
  }

  function bonificationPa(revNet, bon) {
    if (revNet <= bon.seuil) return 0;
    if (revNet >= bon.plateau) return bon.max;
    return bon.max * (revNet - bon.seuil) / (bon.plateau - bon.seuil);
  }

  function primeActiviteCalc(revenusProNets, f, afMois, p) {
    const pa = p.prime_activite || {};
    if (!pa.calcule) return { calcule: false, raison: pa.raison || null, montant_mois: 0, eligible: false };
    let revTot = 0;
    for (const x of revenusProNets) revTot += Math.max(0, x);
    if (revTot <= 0) {
      return { calcule: true, raison: null, forfait_foyer: 0, bonifications: 0, forfait_logement: 0,
        montant_avant_seuil: 0, eligible: false, montant_mois: 0 };
    }
    const n = f.enfants;
    const nbPers = (f.situation === "couple" ? 2 : 1) + n;
    const base = pa.base;
    let forfait;
    if (f.parent_isole) {
      forfait = base * (pa.isole_base + n * pa.isole_par_enfant);
    } else {
      const persSup = nbPers - 1;
      let maj;
      if (persSup <= 0) maj = 0;
      else if (f.situation === "seul") maj = pa.taux_1ere + (n >= 2 ? pa.taux_2e_3e : 0) + Math.max(n - 2, 0) * pa.taux_enfant_sup;
      else maj = pa.taux_1ere + Math.min(n, 2) * pa.taux_2e_3e + Math.max(n - 2, 0) * pa.taux_enfant_sup;
      forfait = base * (1 + maj);
    }
    const flMap = pa.forfait_logement;
    const forfaitLog = nbPers === 1 ? flMap["1"] : (nbPers === 2 ? flMap["2"] : flMap["3_plus"]);
    let bonifs = 0;
    for (const x of revenusProNets) bonifs += bonificationPa(Math.max(0, x), pa.bonification);
    const ressources = revTot + (pa.af_dans_ressources ? afMois : 0) + forfaitLog;
    const avantSeuil = Math.max(0, forfait + pa.pente * revTot + bonifs - ressources);
    const eligible = avantSeuil >= pa.seuil_versement;
    return {
      calcule: true, raison: null, forfait_foyer: forfait, bonifications: bonifs, forfait_logement: forfaitLog,
      ressources_prises_en_compte: ressources, montant_avant_seuil: avantSeuil, eligible,
      montant_mois: eligible ? avantSeuil : 0,
    };
  }

  // ------------------------------------------------------------ décile et consommation
  function decileCalc(revenuDisponibleMois, f, p) {
    const decP = p.deciles || {};
    if (!decP.calcule) return { calcule: false, raison: decP.raison || null, uc: 1, niveau_de_vie_annuel: 0, decile: null, quintile: null };
    let uc = decP.uc_premier_adulte + (f.situation === "couple" ? decP.uc_14_plus : 0);
    for (const a of f.ages_enfants) uc += a >= 14 ? decP.uc_14_plus : decP.uc_moins_14;
    const ndvAn = Math.max(0, revenuDisponibleMois * 12) / uc;
    const seuils = decP.seuils_annuels_uc;
    let dNum = 10;
    for (let idx = 0; idx < seuils.length; idx++) {
      if (ndvAn <= seuils[idx]) { dNum = idx + 1; break; }
    }
    const qNum = Math.floor((dNum + 1) / 2);
    return {
      calcule: true, raison: null, uc: roundN(uc, 4), niveau_de_vie_annuel: ndvAn, niveau_de_vie_mois: ndvAn / 12,
      decile: dNum, code_decile: `D${dNum}`, quintile: qNum, code_quintile: `Q${qNum}`,
    };
  }

  function consommationCalc(revenuDisponibleMois, dec, p, etiq, tvaPoints, carburantCentimesLitre, electriciteFacturePct) {
    tvaPoints = tvaPoints || 0;
    carburantCentimesLitre = carburantCentimesLitre || 0;
    electriciteFacturePct = electriciteFacturePct || 0;
    const consoP = p.consommation || {};
    if (!consoP.calcule || !dec.calcule) {
      const raison = consoP.raison || dec.raison || "paramètres de consommation non disponibles";
      return { calcule: false, raison, etiquette: etiq, taxes_consommation_mois: 0, pouvoir_achat_mois: revenuDisponibleMois };
    }
    const dCode = dec.code_decile;
    const qCode = dec.code_quintile;
    let epargneBrut, sourceEpargne;
    if (consoP.taux_epargne_par_decile && isNum(consoP.taux_epargne_par_decile[dCode])) {
      epargneBrut = consoP.taux_epargne_par_decile[dCode];
      sourceEpargne = "décile";
    } else {
      epargneBrut = consoP.taux_epargne_par_quintile[qCode];
      sourceEpargne = "quintile Insee CND 2022 (décile non publié hors fichiers .xlsx)";
    }
    const tauxEpargne = Math.max(0, epargneBrut);
    const rdPositif = Math.max(0, revenuDisponibleMois);
    const revenuConsommeMois = rdPositif * (1 - tauxEpargne);
    const tauxTaxesRdb = consoP.taux_taxes_conso_rdb[dCode];
    const taxesBaseMois = rdPositif * tauxTaxesRdb;
    const partNorm = consoP.part_depenses_taux_normal;
    const tvaNorm = consoP.tva_taux_normal;
    const deltaTvaMois = tvaPoints ? revenuConsommeMois * partNorm * (tvaPoints / 100) / (1 + tvaNorm) : 0;
    const litresAn = consoP.carburant_litres_an_par_decile[dCode];
    const deltaCarbMois = carburantCentimesLitre ? (litresAn * (carburantCentimesLitre / 100)) / 12 : 0;
    const factElecAn = consoP.electricite_facture_ttc_an;
    const deltaElecMois = electriciteFacturePct ? (factElecAn * (electriciteFacturePct / 100)) / 12 : 0;
    const taxesTotalesMois = Math.max(0, taxesBaseMois + deltaTvaMois + deltaCarbMois + deltaElecMois);
    const pouvoirAchat = revenuDisponibleMois - taxesTotalesMois;
    return {
      calcule: true, raison: null, etiquette: etiq, decile: dec.decile, quintile: dec.quintile,
      taux_epargne_brut: epargneBrut, taux_epargne_retenu: tauxEpargne, source_epargne: sourceEpargne,
      revenu_consomme_mois: revenuConsommeMois, taux_taxes_conso_rdb: roundN(tauxTaxesRdb * 100, 2),
      taxes_base_mois: taxesBaseMois, delta_tva_mois: deltaTvaMois, delta_carburant_mois: deltaCarbMois,
      delta_electricite_mois: deltaElecMois, taxes_consommation_mois: taxesTotalesMois,
      carburant_litres_an: litresAn, electricite_facture_an: factElecAn,
      part_alimentation: consoP.part_alimentation_par_quintile[qCode], pouvoir_achat_mois: pouvoirAchat,
    };
  }

  function foyerCalc(sal, conj, empSal, empConj, f, p, etiqConso, partEntiereDes, allocPremierEnfant, tvaPoints, carburantCentimesLitre, electriciteFacturePct) {
    const revenus = [sal.net_imposable * 12].concat(conj ? [conj.net_imposable * 12] : []);
    const i = impotCalc(revenus, f, p, partEntiereDes);
    const nets = sal.net + (conj ? conj.net : 0);
    const rnc = i.revenu_net_imposable;
    const alloc = allocationsCalc(rnc, f, p, allocPremierEnfant);
    const revsPro = [sal.net].concat(conj && conj.brut > 0 ? [conj.net] : []);
    const pa = primeActiviteCalc(revsPro, f, alloc.allocations_familiales_mois, p);
    const prestationsMois = (alloc.calcule ? alloc.total_mois : 0) + (pa.calcule ? pa.montant_mois : 0);
    const revDispHorsPresta = nets - i.impot / 12;
    const revDisp = revDispHorsPresta + prestationsMois;
    const dec = decileCalc(revDisp, f, p);
    const conso = consommationCalc(revDisp, dec, p, etiqConso, tvaPoints, carburantCentimesLitre, electriciteFacturePct);
    const coutEmp = empSal.cout_total + (empConj ? empConj.cout_total : 0);
    const cotPat = empSal.cotisations_nettes + (empConj ? empConj.cotisations_nettes : 0);
    const cotSal = sal.cotisations + (conj ? conj.cotisations : 0);
    const csgTot = sal.csg_crds.csg_deductible + sal.csg_crds.csg_non_deductible + sal.csg_crds.crds
      + (conj ? conj.csg_crds.csg_deductible + conj.csg_crds.csg_non_deductible + conj.csg_crds.crds : 0);
    const irMois = i.impot / 12;
    const taxesConso = conso.taxes_consommation_mois;
    const pouvoirAchat = conso.pouvoir_achat_mois;
    return {
      salarie: sal, conjoint: conj,
      employeur: { salarie: empSal, conjoint: empConj, cotisations_nettes_mois: cotPat, cout_total_mois: coutEmp },
      impot: i, allocations: alloc, prime_activite: pa, prestations_mois: prestationsMois,
      decile: dec, consommation: conso, nets_mois: nets,
      revenu_disponible_hors_prestations_mois: revDispHorsPresta,
      revenu_disponible_mois: revDisp, pouvoir_achat_mois: pouvoirAchat,
      parts_anneau: {
        cout_employeur_mois: coutEmp, cotisations_patronales_mois: cotPat, cotisations_salariales_mois: cotSal,
        csg_crds_mois: csgTot, impot_revenu_mois: irMois, taxes_consommation_mois: taxesConso,
        pouvoir_achat_mois: pouvoirAchat, prestations_mois: prestationsMois,
      },
    };
  }

  function entrees(brut, foyer, brutConjoint, effectif, heuresSupMois, tauxAtMp) {
    const b = checkBrut(brut);
    const bc = checkBrut(brutConjoint || 0, "brut du conjoint");
    const f = checkFoyer(foyer, bc);
    const eff = checkEffectif(effectif);
    const hm = checkHeuresSup(heuresSupMois);
    const at = checkTauxAtMp(tauxAtMp);
    return [b, f, bc, eff, hm, at];
  }

  // ------------------------------------------------------------ API publique (mêmes noms que le module Python)
  function net(r, brut, cadre, heuresMois, effectif) {
    return netCalc(checkBrut(brut), !!cadre, r.parametres, 0, checkHeuresSup(heuresMois), checkEffectif(effectif), null, null, r.ligne_red_hs);
  }

  function cout_employeur(r, brut, cadre, effectif, heuresMois, tauxAtMp) {
    return coutEmployeurCalc(checkBrut(brut), !!cadre, r.parametres, checkEffectif(effectif), checkHeuresSup(heuresMois), checkTauxAtMp(tauxAtMp), false);
  }

  function heures_sup(r, brut, heuresMois, cadre, effectif) {
    return heuresSupCalc(checkBrut(brut), checkHeuresSup(heuresMois), r.parametres, checkEffectif(effectif));
  }

  function impot(r, revenus, foyer) {
    if (!Array.isArray(revenus) || revenus.length < 1 || revenus.length > 2 || !revenus.every((x) => isNum(x) && x >= 0)) throw new Error("revenus imposables : un ou deux montants positifs");
    return impotCalc(revenus, checkFoyer(foyer, 0), r.parametres);
  }

  function allocations(r, rncAnnuel, foyer) {
    if (!isNum(rncAnnuel) || rncAnnuel < 0) throw new Error("revenu net catégoriel annuel : montant positif attendu");
    return allocationsCalc(rncAnnuel, checkFoyer(foyer, 0), r.parametres);
  }

  function prime_activite(r, revenusProNets, foyer, afMois) {
    if (!Array.isArray(revenusProNets) || revenusProNets.length < 1 || revenusProNets.length > 2 || !revenusProNets.every((x) => isNum(x) && x >= 0)) throw new Error("revenus professionnels : un ou deux montants positifs");
    return primeActiviteCalc(revenusProNets, checkFoyer(foyer, 0), afMois || 0, r.parametres);
  }

  function decile(r, revenuDisponibleMois, foyer) {
    if (!isNum(revenuDisponibleMois)) throw new Error("revenu disponible mensuel : nombre attendu");
    return decileCalc(revenuDisponibleMois, checkFoyer(foyer, 0), r.parametres);
  }

  function consommation(r, revenuDisponibleMois, foyer) {
    if (!isNum(revenuDisponibleMois)) throw new Error("revenu disponible mensuel : nombre attendu");
    const f = checkFoyer(foyer, 0);
    const d = decileCalc(revenuDisponibleMois, f, r.parametres);
    return consommationCalc(revenuDisponibleMois, d, r.parametres, r.etiquette_estimation_conso || "estimation (moyenne de votre décile, source Insee)");
  }

  function revenu(r, brut, foyer, cadre, brutConjoint, effectif, heuresSupMois, tauxAtMp) {
    const [b, f, bc, eff, hm, at] = entrees(brut, foyer, brutConjoint, effectif, heuresSupMois, tauxAtMp);
    const p = r.parametres;
    const sal = netCalc(b, !!cadre, p, 0, hm, eff, null, null, r.ligne_red_hs);
    const empSal = coutEmployeurCalc(b, !!cadre, p, eff, hm, at, false);
    const conj = f.situation === "couple" ? netCalc(bc, !!cadre, p, 0, 0, eff, null, null, r.ligne_red_hs) : null;
    const empConj = f.situation === "couple" ? coutEmployeurCalc(bc, !!cadre, p, eff, 0, at, false) : null;
    return foyerCalc(sal, conj, empSal, empConj, f, p, r.etiquette_estimation_conso || "estimation (moyenne de votre décile, source Insee)");
  }

  // ------------------------------------------------------------ candidats
  function baisseCot(n, montant, pct, assiette, nom) {
    return { ...n, lignes: n.lignes.concat([{ nom, assiette, taux: -pct, montant: -montant }]),
      cotisations: n.cotisations - montant, net: n.net + montant, net_imposable: n.net_imposable + montant };
  }

  function salarie(brutBase, cadre, p, integres, cote, nomBaisse, nomRedHs, heuresMois, effectif, tauxAtMp) {
    heuresMois = heuresMois || 0;
    effectif = effectif || EFFECTIF_DEFAUT;
    const etats = {};
    let csg = 0, modeHs = null, plafHs = null;
    for (const e of integres) if (e.type === "csg_points") csg += e.valeur;
    integres.forEach((e, i) => {
      if (e.type === "heures_sup_exo") {
        if (heuresMois <= 0 || brutBase <= 0) etats[i] = "sans_effet";
        else { modeHs = e.mode; plafHs = e.plafond_heures_an; etats[i] = "retenu"; }
      }
    });
    const ref = netCalc(brutBase, cadre, p, 0, heuresMois, effectif, null, null, nomRedHs);
    if (brutBase <= 0) {
      integres.forEach((e, i) => {
        if (["net_euros_mois", "plancher_net_mois", "net_pct", "csg_points", "heures_sup_exo"].includes(e.type)) etats[i] = "sans_salaire";
      });
      return [ref, coutEmployeurCalc(0, cadre, p, effectif, 0, tauxAtMp, false), etats];
    }
    const base = csg || modeHs ? netCalc(brutBase, cadre, p, csg, heuresMois, effectif, modeHs, plafHs, nomRedHs) : ref;
    let pctSal = 0, pctCot = 0;
    integres.forEach((e, i) => {
      if (e.type === "csg_points") etats[i] = "retenu";
      else if (e.type === "net_pct") {
        const cap = e.jusqu_a_smic_x;
        if (cap !== null && cap !== undefined && brutBase > cent(cap * p.smic_brut_mois)) etats[i] = "hors_champ";
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
    const eff = {};
    for (const i of planchers) eff[i] = integres[i].nature === "smic" && brutBase < smic ? integres[i].valeur * brutBase / smic : integres[i].valeur;
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
    let out, brutEq;
    if (cible === nPre && pctSal === 0) {
      out = base;
      brutEq = brutBase;
    } else {
      brutEq = brutPourNet(cible - baisse, cadre, p, csg, heuresMois, effectif, modeHs, plafHs, nomRedHs);
      out = netCalc(brutEq, cadre, p, csg, heuresMois, effectif, modeHs, plafHs, nomRedHs);
    }
    const emp = coutEmployeurCalc(brutEq, cadre, p, effectif, heuresMois, tauxAtMp, modeHs === "totale");
    return [pctCot ? baisseCot(out, baisse, pctCot, ref.net, nomBaisse) : out, emp, etats];
  }

  function scenario(b, bc, f, cadre, p, integres, cote, nomBaisse, nomRedHs, etiqConso, eff, hm, at) {
    const [sal, empSal, es] = salarie(b, cadre, p, integres, cote, nomBaisse, nomRedHs, hm, eff, at);
    const [conj, empConj, ec] = f.situation === "couple" ? salarie(bc, cadre, p, integres, cote, nomBaisse, nomRedHs, 0, eff, at) : [null, null, null];
    let rang = null, alloc1er = null, tvaPts = 0, carbCl = 0, elecPct = 0;
    for (const e of integres) {
      if (e.type === "qf_part_entiere_des_enfant" && (rang === null || e.valeur < rang)) rang = e.valeur;
      else if (e.type === "allocations_premier_enfant" && (alloc1er === null || e.valeur > alloc1er)) alloc1er = e.valeur;
      else if (e.type === "tva_points") tvaPts += e.valeur;
      else if (e.type === "carburant_centimes_litre") carbCl += e.valeur;
      else if (e.type === "electricite_facture_pct") elecPct += e.valeur;
    }
    const res = foyerCalc(sal, conj, empSal, empConj, f, p, etiqConso, rang, alloc1er, tvaPts, carbCl, elecPct);
    integres.forEach((e, i) => {
      const t = e.type;
      if (t === "qf_part_entiere_des_enfant") es[i] = f.enfants >= e.valeur && e.valeur < p.ir.part_entiere_des_enfant ? "retenu" : "sans_effet";
      else if (t === "allocations_premier_enfant") es[i] = f.enfants >= 1 ? "retenu" : "sans_effet";
      else if (["tva_points", "carburant_centimes_litre", "electricite_facture_pct"].includes(t)) es[i] = "retenu";
      else if (t === "heures_sup_exo" && es[i] === "retenu" && e.mode === "ir") {
        const hsRef = heuresSupCalc(b, hm, p, eff);
        if (hsRef.net_imposable_hs_imposable <= 0) es[i] = "sans_effet";
      }
    });
    return [res, es, ec];
  }

  function contributionMesure(idx, b, bc, f, cadre, p, integres, nomBaisse, nomRedHs, etiqConso, eff, hm, at, ref) {
    const seulEffet = [integres[idx]];
    const basM = scenario(b, bc, f, cadre, p, seulEffet, "bas", nomBaisse, nomRedHs, etiqConso, eff, hm, at)[0];
    const hautM = integres[idx].type === "net_pct" && integres[idx].min !== integres[idx].max
      ? scenario(b, bc, f, cadre, p, seulEffet, "haut", nomBaisse, nomRedHs, etiqConso, eff, hm, at)[0]
      : basM;
    return {
      revenu_disponible_mois: {
        bas: basM.revenu_disponible_mois - ref.revenu_disponible_mois,
        haut: hautM.revenu_disponible_mois - ref.revenu_disponible_mois,
      },
      pouvoir_achat_mois: {
        bas: basM.pouvoir_achat_mois - ref.pouvoir_achat_mois,
        haut: hautM.pouvoir_achat_mois - ref.pouvoir_achat_mois,
      },
    };
  }

  function calcul(cid, nom, b, f, cadre, bc, r, ref, eff, hm, at) {
    const p = r.parametres;
    const etiq = r.etiquette_estimation_conso || "estimation (moyenne de votre décile, source Insee)";
    const e = r.effets[cid] || { integres: [], conditionnels: [], non_integres: [], non_quantifiables: [] };
    const integres = e.integres;
    const fourchette = integres.some((x) => x.type === "net_pct" && x.min !== x.max);
    const [bas, es, ec] = scenario(b, bc, f, cadre, p, integres, "bas", r.ligne_baisse, r.ligne_red_hs, etiq, eff, hm, at);
    const haut = fourchette ? scenario(b, bc, f, cadre, p, integres, "haut", r.ligne_baisse, r.ligne_red_hs, etiq, eff, hm, at)[0] : bas;
    const outInt = integres.map((x, i) => {
      let app;
      if (["qf_part_entiere_des_enfant", "allocations_premier_enfant", "tva_points", "carburant_centimes_litre", "electricite_facture_pct"].includes(x.type)) {
        app = { salarie: i in es ? es[i] : null, conjoint: null };
      } else {
        app = { salarie: i in es ? es[i] : null, conjoint: ec !== null && i in ec ? ec[i] : null };
      }
      const contrib = contributionMesure(i, b, bc, f, cadre, p, integres, r.ligne_baisse, r.ligne_red_hs, etiq, eff, hm, at, ref);
      return { ...x, application: app, contribution: contrib };
    });
    const outCond = e.conditionnels.map((x) => {
      if (x.requiert_enfant && f.enfants === 0) return { ...x, applicable: false, raison: r.raison_sans_enfant, si_concerne: null };
      let tvaPts = 0, carbCl = 0, elecPct = 0;
      for (const m of integres) {
        if (m.type === "tva_points") tvaPts += m.valeur;
        else if (m.type === "carburant_centimes_litre") carbCl += m.valeur;
        else if (m.type === "electricite_facture_pct") elecPct += m.valeur;
      }
      const si = {};
      for (const [k, s] of [["bas", bas], ["haut", haut]]) {
        const gain = s.impot.impot * x.valeur / 100;
        const rdSi = s.revenu_disponible_mois + gain / 12;
        const decSi = decileCalc(rdSi, f, p);
        const consoSi = consommationCalc(rdSi, decSi, p, etiq, tvaPts, carbCl, elecPct);
        si[k] = { impot: s.impot.impot - gain, gain_mois: gain / 12, revenu_disponible_mois: rdSi, pouvoir_achat_mois: consoSi.pouvoir_achat_mois };
      }
      return { ...x, applicable: true, raison: null, si_concerne: si };
    });
    const statut = integres.length ? "calcule" : (e.conditionnels.length || e.non_integres.length ? "non_integre" : "sans_effet");
    const message = integres.length ? null : (statut === "non_integre" ? r.message_non_integre : r.message_sans_effet);
    return {
      id: cid, nom: nom || cid, statut, message, fourchette, resultats: { bas, haut },
      gain_mois: { bas: bas.revenu_disponible_mois - ref.revenu_disponible_mois, haut: haut.revenu_disponible_mois - ref.revenu_disponible_mois },
      gain_pouvoir_achat_mois: { bas: bas.pouvoir_achat_mois - ref.pouvoir_achat_mois, haut: haut.pouvoir_achat_mois - ref.pouvoir_achat_mois },
      gain_consommation_mois: {
        bas: -(bas.consommation.taxes_consommation_mois - ref.consommation.taxes_consommation_mois),
        haut: -(haut.consommation.taxes_consommation_mois - ref.consommation.taxes_consommation_mois),
      },
      integres: outInt, conditionnels: outCond, non_integres: e.non_integres, non_quantifiables: e.non_quantifiables,
    };
  }

  function candidat(r, cid, brut, foyer, cadre, brutConjoint, nom, effectif, heuresSupMois, tauxAtMp) {
    const [b, f, bc, eff, hm, at] = entrees(brut, foyer, brutConjoint, effectif, heuresSupMois, tauxAtMp);
    const ref = revenu(r, b, f, cadre, bc, eff, hm, tauxAtMp);
    return { reference: ref, ...calcul(cid, nom, b, f, !!cadre, bc, r, ref, eff, hm, at), libelle: r.libelle, methode: r.methode, avertissements: r.avertissements };
  }

  function comparer(r, brut, foyer, cadre, brutConjoint, candidats, effectif, heuresSupMois, tauxAtMp) {
    const [b, f, bc, eff, hm, at] = entrees(brut, foyer, brutConjoint, effectif, heuresSupMois, tauxAtMp);
    const ref = revenu(r, b, f, cadre, bc, eff, hm, tauxAtMp);
    const list = candidats || Object.keys(r.effets).map((id) => ({ id, nom: id }));
    return {
      date: r.date,
      entree: { brut: b, cadre: !!cadre, ...f, brut_conjoint: bc, effectif: eff, heures_sup_mois: hm,
        taux_at_mp: tauxAtMp === undefined ? null : tauxAtMp },
      reference: ref,
      candidats: list.map((c) => calcul(c.id, c.nom, b, f, !!cadre, bc, r, ref, eff, hm, at)),
      libelle: r.libelle, methode: r.methode, avertissements: r.avertissements, erreurs: r.erreurs,
    };
  }

  return {
    net, cout_employeur, heures_sup, impot, allocations, prime_activite, decile, consommation,
    revenu, candidat, comparer, BRUT_MAX, ENFANTS_MAX, HEURES_SUP_MAX, AGE_ENFANT_DEFAUT, AGE_ENFANT_MAX, EFFECTIFS,
  };
});
