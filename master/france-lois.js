/* Master — onglet « Lois » de la rubrique France politique (france.js) : textes des deux chambres (navette fusionnée par
   dossier, lien vers le Journal officiel), Journal officiel (lois, ordonnances, décrets majeurs), amendements notables,
   scrutins marquants de l'Assemblée et du Sénat (résultat, décompte, position des groupes) et vote des candidats à la
   présidentielle qui sont députés ou sénateurs. Tout vient des données ouvertes de l'Assemblée, du Sénat et de la DILA ;
   rien n'est interprété. Texte via textContent. */
(() => {
  "use strict";
  const STATUTS = [["tous", "Tous"], ["en cours", "En cours"], ["promulgué", "Promulgués"], ["rejeté", "Rejetés"]];
  const CHAMBRES = [["toutes", "Les deux chambres"], ["Assemblée nationale", "Assemblée"], ["Sénat", "Sénat"]];
  const VOTE_CLS = { pour: "ok", contre: "bad", abstention: "warn", "non-votant": "neutral", "pour la censure": "neutral" };
  const NIVEAU = { declaration: "déclaration", confirme: "confirmé" };
  let U = null;

  function link(text, href) {
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", null, text);
    const a = U.el("a", "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  function both(...nodes) {
    const s = U.el("span");
    nodes.filter(Boolean).forEach((n, i) => { if (i) s.append(document.createTextNode(" · ")); s.append(n); });
    return s;
  }

  function chambres(t) {
    const an = t.chambres.includes("Assemblée nationale") ? link("AN", t.dossier.startsWith("senat:") ? t.url_an : t.url) : null;
    const sn = t.senat ? link("Sénat", t.senat.url) : t.chambres.includes("Sénat") ? U.el("span", null, "Sénat") : null;
    return both(an, sn);
  }

  function etape(e) {
    const txt = `${e.libelle}${e.statut ? ` : ${e.statut}` : ""} · ${U.dmy(e.date)}`;
    return e.niveau === "declaration" ? both(U.el("span", null, txt), U.status("neutral", "déclaration (dépôt)")) : txt;
  }

  function textes(list) {
    let filtre = "tous", chambre = "toutes";
    const p = U.panel(`Textes de loi (${list.length})`, { sub: "Projets et propositions de loi avec une étape au-delà du dépôt dans les 12 derniers mois, vus de l'Assemblée et du Sénat (même dossier fusionné) ; une loi promulguée renvoie au texte publié au Journal officiel. Un dépôt est une déclaration ; un vote, une promulgation, une publication au JO sont confirmés par la source officielle." });
    const box = U.el("div");
    const draw = () => {
      const rows = list.filter((t) => (filtre === "tous" || t.statut === filtre) && (chambre === "toutes" || t.chambres.includes(chambre)));
      box.replaceChildren(U.table(rows, [["titre", "Texte", (v, r) => link(v, r.url)], ["chambres", "Chambres", (v, r) => chambres(r), "nw"],
        ["statut", "Statut"], ["derniere_etape", "Dernière étape", (e) => etape(e)],
        ["scrutins", "Scrutins marquants", (s) => `AN ${s.an.length} · Sénat ${s.senat.length}`],
        ["jo", "Journal officiel", (j) => (j ? link(`${j.titre.split(" du ")[0]}${j.date ? ` · JO du ${U.dmy(j.date)}` : ""}`, j.url) : "—")]],
      null, { empty: "Aucun texte pour ce filtre." }));
    };
    const ctl = U.el("div", "fr-tags");
    ctl.append(U.seg(STATUTS, filtre, (v) => { filtre = v; draw(); }, "Statut"), U.seg(CHAMBRES, chambre, (v) => { chambre = v; draw(); }, "Chambre"));
    p.head.append(ctl);
    p.body.append(box);
    draw();
    return p.el;
  }

  function journal(jo) {
    const p = U.panel(`Journal officiel (${jo.lois.length} lois et ordonnances, ${jo.decrets.length} décrets)`, { sub: `${jo.criteres}${jo.depuis ? ` Archives du flux lues depuis le ${U.dmy(jo.depuis)} (un sommaire plus ancien republié dans ces archives est aussi pris).` : ""}` });
    if (!jo.lois.length && !jo.decrets.length) {
      p.body.append(U.el("p", "muted", "Sommaires du Journal officiel pas encore lus (téléchargés en arrière-plan, quelques archives à chaque passage)."));
      return p.el;
    }
    p.body.append(U.el("h3", "fr-h3", "Lois et ordonnances"));
    p.body.append(U.table(jo.lois, [["date", "Publié le", (v) => U.dmy(v), "nw"], ["titre", "Texte au JO", (v, r) => link(v, r.url)],
      ["dossier", "Dossier", (v, r) => (r.dossier_url ? link("Dossier législatif", r.dossier_url) : "—")]], null, { empty: "Aucune." }));
    p.body.append(U.el("h3", "fr-h3", "Décrets majeurs ou d'application d'une loi suivie"));
    p.body.append(U.table(jo.decrets, [["date", "Publié le", (v) => U.dmy(v), "nw"], ["titre", "Décret", (v, r) => link(v, r.url)],
      ["majeur", "Critère", (v, r) => (v ? "décret majeur" : `cite la loi ${r.lois_citees.join(", ")}`)]], null, { empty: "Aucun." }));
    return p.el;
  }

  function amendements(a) {
    const p = U.panel("Amendements notables (Assemblée)", { sub: a.criteres });
    if (!a.textes.length) {
      p.body.append(U.el("p", "muted", "Amendements pas encore lus (téléchargés en arrière-plan)."));
      return p.el;
    }
    for (const t of a.textes) {
      const s = U.el("article", "fr-sujet");
      const h = U.el("h3");
      h.append(link(t.titre || t.dossier, t.url));
      s.append(h, U.el("p", "muted", `${U.nf0.format(t.adoptes_seance)} amendements adoptés en séance ; ${U.nf0.format(t.retenus)} retenus selon les critères${t.marquant ? " · texte retenu pour son scrutin solennel" : ""}.`));
      if (t.amendements.length) {
        s.append(U.table(t.amendements, [["numero", "N°", (v, r) => link(v, r.url)], ["article", "Article"], ["auteur", "Auteur"],
          ["groupe", "Groupe (actuel)", (v) => v || "non reconnu"], ["criteres", "Critères", (v) => v.join(", ")],
          ["scrutin", "Scrutin public", (v) => (v ? link(`n° ${v.scrutin} du ${U.dmy(v.date)}`, v.url) : "—")]]));
      }
      p.body.append(s);
    }
    return p.el;
  }

  function scrutin(s, cands, senat) {
    const c = U.el("article", "fr-sujet");
    const h = U.el("div", "fr-sujet-h");
    const type = senat ? (/^sur la motion/i.test(s.titre) ? "Motion" : "Vote sur l'ensemble ou une partie")
      : s.type === "MOC" ? "Motion de censure" : s.type === "SPS" ? "Scrutin solennel" : "Vote sur l'ensemble";
    h.append(U.status("neutral", s.sort), U.el("span", "fr-date", U.dmy(s.date)), U.el("span", "muted", `${senat ? "Sénat" : "Assemblée"} · ${type}`));
    c.append(h, U.el("h3", null, s.titre));
    c.append(U.el("p", "muted", `Pour ${U.nf0.format(s.decompte.pour)} · contre ${U.nf0.format(s.decompte.contre)} · abstentions ${U.nf0.format(s.decompte.abstentions)}${senat ? " (décompte annoncé en séance ; résultat : majorité absolue des suffrages exprimés)" : ""}`));
    const g = U.el("div", "fr-tags");
    for (const [grp, pos] of Object.entries(s.groupes)) g.append(U.el("span", "fr-tag", `${grp} : ${pos}`));
    c.append(g);
    const ids = Object.keys(s.candidats || {});
    if (ids.length) {
      const v = U.el("div", "fr-tags");
      for (const id of ids) {
        const x = s.candidats[id];
        const tag = U.el("span", "fr-tag fr-vote");
        tag.append(U.status(VOTE_CLS[x.vote] || "neutral", `${cands[id] || id} : ${x.vote}${x.delegation ? " (par délégation)" : ""}${x.statut ? ` (${x.statut})` : ""}${x.mise_au_point ? ` · mise au point : ${x.mise_au_point}` : ""}`));
        v.append(tag);
      }
      c.append(v);
    }
    c.append(link(senat ? "Scrutin sur le site du Sénat" : "Scrutin sur le site de l'Assemblée", s.url));
    return c;
  }

  function scrutins(d, cands) {
    let ch = "an";
    const p = U.panel("Scrutins marquants", { sub: "Assemblée : scrutins solennels, motions de censure, votes sur l'ensemble d'un texte, position majoritaire de chaque groupe telle que publiée. Sénat : votes sur l'ensemble, l'article unique, une partie d'un texte budgétaire, les motions ; position de chaque groupe calculée sur les votes publiés de ses membres (le Sénat publie l'analyse par groupe sur la page du scrutin)." });
    const box = U.el("div");
    const draw = () => {
      const list = ch === "an" ? d.scrutins : d.scrutins_senat;
      box.replaceChildren(...(list.length ? list.map((s) => scrutin(s, cands, ch === "senat")) : [U.el("p", "muted", "Aucun scrutin chargé pour cette chambre.")]));
    };
    p.head.append(U.seg([["an", `Assemblée (${d.scrutins.length})`], ["senat", `Sénat (${d.scrutins_senat.length})`]], ch, (v) => { ch = v; draw(); }, "Chambre"));
    p.body.append(box);
    draw();
    return p.el;
  }

  async function lois(root) {
    U = window.MASTER_UI;
    const d = await U.api("/api/france/parlement");
    if (!d.scrutins.length && !d.textes.length) {
      root.append(U.callout("info", "Données en préparation", "Les archives de l'Assemblée sont téléchargées en arrière-plan ; revenez dans quelques minutes."));
      return;
    }
    const cands = Object.fromEntries([...d.candidats_deputes, ...(d.candidats_senateurs || [])].map((c) => [c.id, c.nom]));
    const dep = d.candidats_deputes.map((c) => `${c.nom} (député, ${c.circo})`);
    const sen = (d.candidats_senateurs || []).map((c) => `${c.nom} (sénateur${c.circonscription ? `, ${c.circonscription}` : ""})`);
    root.append(U.callout("info", "Candidats parlementaires.", dep.length || sen.length
      ? `${[...dep, ...sen].join(", ")} : leur vote est indiqué sous chaque scrutin de leur chambre, tel que publié (« n'a pas pris part au vote » : ne figure dans aucune liste ; une délégation, un statut ou une mise au point publiés sont signalés).`
      : "Aucun candidat inclus n'a été reconnu parmi les députés ou sénateurs en exercice (données peut-être en cours de mise à jour)."));
    root.append(textes(d.textes));
    root.append(journal(d.journal_officiel || { lois: [], decrets: [], criteres: "" }));
    root.append(amendements(d.amendements || { textes: [], criteres: "" }));
    root.append(scrutins({ ...d, scrutins_senat: d.scrutins_senat || [] }, cands));
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { lois });
})();
