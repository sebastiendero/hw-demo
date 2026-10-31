/* Master — creuser et interroger les programmes, sans IA (France politique, F9) :
   - sous-vue « Explorer » de l'onglet Candidats : recherche plein texte dans toutes les mesures, filtres par candidat,
     thème et statut ;
   - « Dossier de la mesure » (#france/candidats/<id>/mesure/<mN>) : la mesure et tout ce qui s'y rattache, avec les six
     questions du contradicteur et les données disponibles (ou ce qui manque) ;
   - mode « Questions (sans IA) » de l'onglet Interroger : candidats et thèmes reconnus, mesures citées mot pour mot,
     et l'interprétation affichée ;
   - mode « Même question à tous » : une question libre posée à chaque candidat du registre (ordre du registre), les trois
     mesures les plus pertinentes citées mot pour mot ou « aucune mesure trouvée pour ces mots », les grandes questions
     reconnues d'abord (web/france-grandes-questions.js), ce qui a été compris, et un lien partageable (la question est
     dans l'adresse).
   Portail local : routes /api/france/recherche, /question, /a-tous et /mesure. En ligne : la recherche se fait ici, sur
   /api/france/index (règles identiques à master/france/explorer.py, envoyées avec l'index) ; le dossier complet reste
   local. Tout texte de données passe par textContent (U.el). */
(() => {
  "use strict";
  let U = null, C = null;
  let INDEX = null;  // index de la version en ligne, chargé une fois

  // ------------------------------------------------------------ règles de master/france/explorer.py
  const norm = (s) => String(s || "").replace(/[œŒ]/g, "oe").replace(/[æÆ]/g, "ae").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  const fold = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/’/g, "'").toLowerCase();  // actu._fold
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function rules(ix) {
    const vides = new Set(ix.mots_vides);
    const mots = (t) => (norm(t).match(/[a-z0-9]+/g) || []).filter((w) => !vides.has(w) && (w.length > 1 || /^\d+$/.test(w)));
    const racine = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w).slice(0, ix.racine);
    const racines = (t) => mots(t).map(racine);
    const rang = Object.fromEntries(ix.candidats.map((c, i) => [c.id, i]));
    const noms = Object.fromEntries(ix.candidats.map((c) => [c.id, c.nom]));
    const num = (id) => (/^m\d{1,4}$/.test(id) ? Number(id.slice(1)) : 1e6);
    const corpus = ix.mesures.map((m) => ({ candidat: m.c, nom: noms[m.c], id: m.id, theme: m.t, statut: m.s, resume: m.r,
      citation: m.q, source: m.u, date: m.d, cout_candidat_md_eur: m.k, verification: m.v,
      _r: racines(m.r), _q: racines(m.q) }));
    const pub = (m, score) => {
      const o = {};
      for (const k of ["candidat", "nom", "id", "theme", "statut", "resume", "citation", "source", "date", "cout_candidat_md_eur", "verification"]) o[k] = m[k] ?? null;
      if (score != null) o.pertinence = score;
      return o;
    };
    function chercher(cles, cands, themes, statut) {
      const want = new Set(cles), hits = [];
      for (const m of corpus) {
        if ((cands && !cands.has(m.candidat)) || (themes && !themes.has(m.theme)) || (statut && m.statut !== statut)) continue;
        let score = 0;
        if (want.size) {
          score = 2 * m._r.filter((r) => want.has(r)).length + m._q.filter((r) => want.has(r)).length;
          if (!score) continue;
        } else if (!(cands || themes || statut)) continue;
        hits.push([m, score]);
      }
      const key = ([m, s]) => [-s, ix.statuts.indexOf(m.statut), rang[m.candidat], num(m.id)];
      hits.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
      return hits;
    }
    const uniq = (a) => [...new Set(a)];
    function rechercher(q, { candidat = null, theme = null, statut = null, limit = 50 } = {}) {
      const cles = uniq(racines(q));
      const hits = chercher(cles, candidat ? new Set([candidat]) : null, theme ? new Set([theme]) : null, statut);
      return { q: q || "", racines: cles, filtres: { candidat, theme, statut }, total: hits.length,
        resultats: hits.slice(0, limit).map(([m, s]) => pub(m, s)), methode: ix.methode, releve: ix.releve };
    }
    // Formes d'un nom : trait d'union et espace équivalents (explorer._nom_rx).
    const nomRx = (formes, flags) => new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${formes.map((f) => f.split(/[\s-]+/).filter(Boolean).map(escapeRe).join("[\\s-]+")).join("|")})(?![\\p{L}\\p{N}_-])`, flags);
    const hors = new Set(ix.hors_themes);
    function comprendre(question, limit = 50) {
      let texte = fold(question);
      const found = [], sans = [], ambigus = [];
      for (const p of ix.formes_registre) {
        const hit = texte.match(nomRx(p.formes, "u"));
        if (!hit) continue;
        (p.programme ? found : sans).push({ id: p.id, nom: p.nom, forme: hit[0] });
        texte = texte.replace(nomRx(p.formes, "gu"), " ");
        for (const tok of p.noms) texte = texte.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(tok)}(?![\\p{L}\\p{N}_])`, "gu"), " ");
      }
      for (const a of ix.noms_ambigus) {
        if (nomRx([a.forme], "u").test(texte)) { ambigus.push(a); texte = texte.replace(nomRx([a.forme], "gu"), " "); }
      }
      const ws = mots(texte), rs = ws.map(racine), used = rs.map(() => false), bloque = ws.map((w) => hors.has(w)), themes = {};
      const phrases = [];
      for (const [t, list] of Object.entries(ix.mots_themes)) for (const p of list) if (p.racines.length) phrases.push([t, p.racines, p.expression]);
      phrases.sort((a, b) => b[1].length - a[1].length);  // tri stable, comme sorted() en Python
      for (const [t, p, src] of phrases) {
        for (let i = 0; i + p.length <= rs.length; i++) {
          if (used.slice(i, i + p.length).some(Boolean) || bloque.slice(i, i + p.length).some(Boolean) || p.some((r, j) => rs[i + j] !== r)) continue;
          for (let j = i; j < i + p.length; j++) used[j] = true;
          themes[t] = themes[t] || [];
          if (!themes[t].includes(src)) themes[t].push(src);
        }
      }
      const cles = uniq(rs.filter((_, i) => !used[i]));
      const th = ix.themes.filter((t) => themes[t]).map((t) => ({ id: t, mots: themes[t] }));
      const cands = found.length ? new Set(found.map((c) => c.id)) : null;
      const tset = th.length ? new Set(th.map((t) => t.id)) : null;
      const avert = [...sans.map((c) => `${c.nom} : aucun programme relevé.`),
        ...ambigus.map((a) => `« ${a.forme} » seul ne suffit pas (prénom courant ou nom partagé) : précisez le nom complet (${a.noms.join(", ")}).`)];
      let hits = [], repli = null, filtre = null;
      if (!(!found.length && (sans.length || ambigus.length))) {
        hits = chercher(cles, cands, tset, null);
        if (!hits.length && cles.length) {
          repli = `Aucune mesure relevée ne contient : ${cles.join(", ")}.`;
          if (tset) {
            repli = `${repli.slice(0, -1)} ; voici les mesures des thèmes reconnus${cands ? " pour les candidats reconnus." : "."}`;
            hits = chercher([], cands, tset, null);
          }
        } else if (hits.length && cles.length && (cands || tset)) {
          const n0 = chercher([], cands, tset, null).length;
          if (n0 > hits.length) filtre = `Filtré par les mots-clés : ${cles.join(", ")} (${hits.length} sur ${n0} mesures des candidats et thèmes reconnus).`;
        }
      }
      const par = found.map((c) => { const own = hits.filter(([m]) => m.candidat === c.id); return { candidat: c.id, nom: c.nom, total: own.length, mesures: own.slice(0, 20).map(([m, s]) => pub(m, s)) }; });
      return { question: question || "", compris: { candidats: found, sans_programme: sans, ambigus, themes: th, mots_cles: cles },
        avertissements: avert, repli, filtre, total: hits.length,
        resultats: hits.slice(0, limit).map(([m, s]) => pub(m, s)), par_candidat: par, methode: ix.methode, releve: ix.releve,
        suite: "Pour aller plus loin, Maestro (IA) répond avec les mêmes données, en citant ses sources." };
    }
    // Grandes questions reconnues dans une question libre : toutes les racines d'au moins une expression de `mots`
    // (grandes_questions.correspondances). `qs` : questions de /api/france/grandes-questions.
    function correspondances(question, qs) {
      const roots = new Set(racines(question));
      if (!roots.size) return [];
      return qs.filter((q) => q.mots.some((m) => { const r = racines(m); return r.length && r.every((x) => roots.has(x)); })).map((q) => q.id);
    }
    // La même question posée à chaque personne du registre (explorer.a_tous) : ce qui a été compris, puis pour chacune les
    // `par` mesures les plus pertinentes. Les noms reconnus ne filtrent pas ; mots-clés d'abord, sinon le thème reconnu.
    function aTous(question, qs) {
      const base = comprendre(question, 1), compris = base.compris, cles = compris.mots_cles;
      const themes = new Set(compris.themes.map((t) => t.id));
      const message = cles.length || themes.size ? null : ix.a_tous.message;
      const par = ix.formes_registre.map((p) => {
        if (!p.programme) return { candidat: p.id, nom: p.nom, programme: false, total: 0, mesures: [] };
        const hits = message ? [] : chercher(cles, new Set([p.id]), cles.length ? null : themes, null);
        return { candidat: p.id, nom: p.nom, programme: true, total: hits.length, mesures: hits.slice(0, ix.a_tous.par).map(([m, s]) => pub(m, s)) };
      });
      return { question: question || "", compris, avertissements: base.avertissements, message, grandes_questions: correspondances(question, qs),
        par_candidat: par, par_candidat_max: ix.a_tous.par, methode: ix.methode, releve: ix.releve };
    }
    return { racines, rechercher, comprendre, aTous, correspondances, corpus, noms };
  }

  async function local() {
    INDEX = INDEX || rules(await U.api("/api/france/index"));
    return INDEX;
  }
  const qs = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  async function rechercher(q, f) {
    if (window.MASTER_STATIC) return (await local()).rechercher(q, f);
    return U.api(`/api/france/recherche?${qs({ q, candidat: f.candidat, theme: f.theme, statut: f.statut })}`);
  }
  async function comprendre(q) {
    if (window.MASTER_STATIC) return (await local()).comprendre(q);
    return U.api(`/api/france/question?${qs({ q })}`);
  }

  async function aTousRequest(q) {  // local : le serveur ; en ligne : ce navigateur, sur l'index et les mots des grandes questions
    if (window.MASTER_STATIC) {
      const [ix, d] = await Promise.all([local(), window.MASTER_FRANCE_GQ.data().catch(() => ({ questions: [] }))]);
      return ix.aTous(q, d.questions);
    }
    return U.api(`/api/france/a-tous?${qs({ q })}`);
  }

  // ------------------------------------------------------------ éléments communs
  const themeLabel = (t) => C.THEMES[t] || t;
  const ficheLink = (cid, nom) => { const a = U.el("a", "fr-link", nom); a.href = `#france/candidats/${encodeURIComponent(cid)}`; return a; };
  function card(m) {  // mesure d'un résultat : candidat et thème, puis la carte de l'onglet Candidats (avec « Creuser »)
    const box = U.el("div", "fr-hit");
    const h = U.el("p", "fr-hit-h");
    h.append(ficheLink(m.candidat, m.nom || m.candidat), document.createTextNode(` · ${themeLabel(m.theme)} · ${m.id}`));
    box.append(h, C.mesure(m, m.candidat));
    return box;
  }
  function stateFromHash(minParts) {  // dernier segment de l'adresse : paramètres de la recherche (encodés)
    const segs = location.hash.slice(1).split("/");
    if (segs.length <= minParts) return new URLSearchParams();
    try { return new URLSearchParams(decodeURIComponent(segs[minParts])); } catch (e) { return new URLSearchParams(); }
  }
  function keepInHash(base, params) {  // garde la recherche dans l'adresse sans recharger la vue
    const s = qs(params);
    history.replaceState(null, "", s ? `${base}/${encodeURIComponent(s)}` : base);
  }
  function select(label, options, value) {
    const s = U.el("select", "fr-select");
    s.setAttribute("aria-label", label);
    for (const [v, l] of options) s.append(new Option(l, v));
    s.value = value || "";
    return s;
  }

  // ------------------------------------------------------------ Explorer
  async function explorer(root, nav) {
    U = window.MASTER_UI; C = window.MASTER_FRANCE_CANDIDATS;
    const [reg, cmp] = await Promise.all([U.api("/api/france/candidats"), U.api("/api/france/comparateur").catch(() => ({ candidats: {} }))]);
    const people = [...reg.candidats, ...reg.autres].filter((c) => cmp.candidats[c.id]);
    const st = stateFromHash(3);
    root.append(nav, U.callout("info", "Recherche sans IA.", "Mots sans accents ni casse, réduits à leur racine (6 lettres) ; pertinence = 2 × occurrences dans le résumé + 1 × dans la citation ; à égalité, engagements puis annonces puis pistes. Chaque mesure est citée mot pour mot avec sa source."));
    const form = U.el("form", "fr-ask fr-explorer");
    const input = U.el("input", "fr-input");
    input.type = "search"; input.maxLength = 500; input.placeholder = "Mots à chercher dans toutes les mesures (ex. : nucléaire, smic, 62 ans)";
    input.setAttribute("aria-label", "Recherche"); input.value = st.get("q") || "";
    const csel = select("Candidat", [["", "Tous les candidats"], ...people.map((c) => [c.id, c.nom])], st.get("candidat"));
    const tsel = select("Thème", [["", "Tous les thèmes"], ...Object.entries(C.THEMES)], st.get("theme"));
    const ssel = select("Statut", [["", "Tous les statuts"], ...Object.entries(C.STATUT)], st.get("statut"));
    const go = U.el("button", null, "Chercher");
    go.type = "submit";
    form.append(input, csel, tsel, ssel, go);
    const out = U.el("div", "fr-results");
    root.append(form, out);
    let seq = 0;  // seule la dernière recherche lancée s'affiche (une réponse lente ne remplace pas une plus récente)
    async function run() {
      const ticket = ++seq;
      const f = { candidat: csel.value || null, theme: tsel.value || null, statut: ssel.value || null };
      keepInHash("#france/candidats/explorer", { q: input.value.trim(), ...f });
      out.replaceChildren(U.el("p", "muted", "Recherche…"));
      let r;
      try { r = await rechercher(input.value.trim(), f); } catch (e) { if (ticket === seq) out.replaceChildren(U.callout("erreur", "Recherche impossible.", e.message)); return; }
      if (ticket !== seq) return;
      const head = U.el("p", "fr-count", r.total ? `${r.total} mesure${r.total > 1 ? "s" : ""} trouvée${r.total > 1 ? "s" : ""}${r.total > r.resultats.length ? ` (les ${r.resultats.length} premières)` : ""}` : "");
      out.replaceChildren(head);
      if (!r.total) out.append(U.el("p", "muted", r.racines.length || f.candidat || f.theme || f.statut ? "Aucune mesure relevée ne correspond." : "Saisissez des mots ou choisissez un filtre."));
      if (r.racines.length) head.append(U.el("span", "muted", ` · racines cherchées : ${r.racines.join(", ")}`));
      for (const m of r.resultats) out.append(card(m));
    }
    form.onsubmit = (ev) => { ev.preventDefault(); run(); };
    for (const s of [csel, tsel, ssel]) s.onchange = run;
    if (input.value || csel.value || tsel.value || ssel.value) await run();
    else out.append(U.el("p", "muted", "Saisissez des mots ou choisissez un filtre."));
  }

  // ------------------------------------------------------------ dossier d'une mesure
  const sign = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${U.nf2.format(Math.abs(v))}`;
  function list(items, render) {
    const ul = U.el("ul", "fr-list");
    for (const it of items) { const li = U.el("li"); render(li, it); ul.append(li); }
    return ul;
  }
  function dataLine(li, d) {
    li.append(document.createTextNode(d.texte));
    if (d.source) li.append(document.createTextNode(" · "), C.link("source", d.source));
  }

  // Grandes questions auxquelles répond la mesure : fournies par le dossier local, sinon lues dans l'instantané.
  function grandesQuestions(root, cid, mid, list) {
    const G = window.MASTER_FRANCE_GQ;
    if (!G) return;
    const slot = U.el("div");
    root.append(slot);
    (list ? Promise.resolve(list) : G.duMesure(cid, mid)).then((l) => { slot.append(G.mesurePanel(l)); }, () => {});
  }

  async function dossierStatic(root, cid, mid) {  // en ligne : ce que contient l'instantané (index et fiche du candidat)
    const ix = await local();
    const m = ix.corpus.find((x) => x.candidat === cid && x.id === mid);
    if (!m) { root.append(U.callout("erreur", "Mesure introuvable", `${cid}/${mid}`)); return; }
    const head = U.panel(`${m.nom} · mesure ${m.id}`, { sub: `Dossier de la mesure · ${themeLabel(m.theme)}` });
    head.body.append(U.callout("ia", "Programme relevé par IA.", ix.releve), C.mesure(m));
    head.body.querySelector(".fr-creuser")?.remove();
    root.append(head.el);
    grandesQuestions(root, cid, mid, null);
    root.append(U.callout("info", "Version en ligne.", "Le dossier complet (diagnostic, effet simulé sur la dette, actualité, scrutins et textes de loi liés, questions du contradicteur) est sur le portail local ; ici : la mesure, les autres mesures du thème et les chiffrages."));
    const fiche = await U.api(`/api/france/candidat/${encodeURIComponent(cid)}`).catch(() => null);
    if (fiche && fiche.chiffrages.length) {
      const p = U.panel("Chiffrages indépendants relevés pour ce candidat", { sub: "Négatif : coût ; positif : économie ou recette. Le rattachement à cette mesure n'est pas vérifié." });
      p.body.append(U.table(fiche.chiffrages, [["mesure", "Mesure chiffrée"], ["institut", "Institut"], ["montant_md_eur", "Md€", (v) => (v == null ? "—" : U.nf1.format(v))], ["source", "Source", (v) => C.link("source", v)]]));
      root.append(p.el);
    }
    const same = ix.corpus.filter((x) => x.theme === m.theme && !(x.candidat === cid && x.id === mid));
    sameTheme(root, m, same.filter((x) => x.candidat === cid), groupBy(same.filter((x) => x.candidat !== cid)));
  }
  function groupBy(ms) {
    const g = new Map();
    for (const x of ms) { if (!g.has(x.candidat)) g.set(x.candidat, { candidat: x.candidat, nom: x.nom, mesures: [] }); g.get(x.candidat).mesures.push(x); }
    return [...g.values()];
  }
  function sameTheme(root, m, own, others) {
    const p = U.panel(`Même thème : ${themeLabel(m.theme)}`, { sub: "Autres mesures du candidat, puis celles des autres candidats (même gabarit pour tous)." });
    p.body.append(U.el("h3", "fr-theme-h", `${m.nom} (${own.length})`));
    if (!own.length) p.body.append(U.el("p", "muted", "Aucune autre mesure relevée sur ce thème."));
    for (const x of own) p.body.append(C.mesure(x, x.candidat));
    p.body.append(U.el("h3", "fr-theme-h", `Autres candidats (${others.length})`));
    if (!others.length) p.body.append(U.el("p", "muted", "Aucun autre candidat n'a de mesure relevée sur ce thème."));
    for (const g of others) {
      const d = U.el("details", "fr-group");
      d.append(U.el("summary", null, `${g.nom} · ${g.mesures.length} mesure${g.mesures.length > 1 ? "s" : ""}`));
      for (const x of g.mesures) d.append(C.mesure(x, g.candidat));
      p.body.append(d);
    }
    root.append(p.el);
  }

  async function dossier(root, nav, cid, mid) {
    U = window.MASTER_UI; C = window.MASTER_FRANCE_CANDIDATS;
    root.append(nav);
    if (window.MASTER_STATIC) return dossierStatic(root, cid, mid);
    let d;
    try { d = await U.api(`/api/france/mesure/${encodeURIComponent(cid)}/${encodeURIComponent(mid)}`); } catch (e) {
      root.append(U.callout("erreur", "Mesure introuvable", e.message)); return;
    }
    const m = { ...d.mesure, nom: d.candidat.nom };
    const head = U.panel(`${d.candidat.nom} · mesure ${m.id}`, { sub: `Dossier de la mesure · ${themeLabel(m.theme)}` });
    head.body.append(U.callout("ia", "Programme relevé par IA.", d.releve), C.mesure(m));
    head.body.querySelector(".fr-creuser")?.remove();
    const back = U.el("p");
    back.append(ficheLink(d.candidat.id, `Fiche de ${d.candidat.nom}`), document.createTextNode(" · "));
    const ask = U.el("a", "fr-link", "Aller plus loin avec Maestro (IA)");
    ask.href = "#france/interroger";
    back.append(ask);
    head.body.append(back);
    root.append(head.el);
    grandesQuestions(root, cid, mid, d.grandes_questions);

    const pq = U.panel("Les six questions du contradicteur", { sub: "Les mêmes pour toutes les mesures et tous les candidats. Réponses tirées des données du portail, sans IA ; ce qui manque est dit." });
    const ol = U.el("ol", "fr-questions");
    for (const q of d.contradicteur) {
      const li = U.el("li");
      li.append(U.el("p", "fr-q", q.question));
      if (q.donnees.length) li.append(list(q.donnees, dataLine));
      if (q.manque) li.append(U.el("p", "muted", `Manque : ${q.manque}`));
      ol.append(li);
    }
    pq.body.append(ol);
    root.append(pq.el);

    const grid = U.el("div", "fr-grid");
    const pc = U.panel("Chiffrages", { sub: d.chiffrages.note });
    if (d.mesure.cout_candidat_md_eur != null) pc.body.append(U.el("p", null, `Chiffrage du candidat : ${sign(d.mesure.cout_candidat_md_eur)} Md€ (positif : économie ou recette ; négatif : coût)${d.cout_citation ? ` ; « ${d.cout_citation} »` : ""}`));
    else pc.body.append(U.el("p", "muted", "Le candidat ne chiffre pas cette mesure."));
    const rows = [...d.chiffrages.candidat.map((c) => ({ ...c, quand: "2027" })), ...d.chiffrages.anterieurs.map((c) => ({ ...c, quand: c.periode || "antérieur" }))];
    if (rows.length) pc.body.append(U.table(rows, [["mesure", "Mesure chiffrée"], ["institut", "Institut"], ["montant_md_eur", "Md€", (v) => (v == null ? "—" : U.nf1.format(v))],
      ["quand", "Campagne"], ["proche", "Proche", (v) => (v ? "oui (indication)" : "non")], ["source", "Source", (v) => C.link("source", v)]]));
    else pc.body.append(U.el("p", "muted", "Aucun chiffrage indépendant relevé pour ce candidat."));
    const pp = U.panel("Effet isolé simulé sur la dette", { sub: d.projection.avertissement });
    const pr = d.projection;
    if (pr.ecart_dette_pib) {
      pp.body.append(U.el("p", "fr-v", `${sign(pr.ecart_dette_pib.central)} pt`), U.el("p", null,
        `de PIB de dette en ${pr.annee} (cas central ; favorable ${sign(pr.ecart_dette_pib.favorable)}, défavorable ${sign(pr.ecart_dette_pib.defavorable)}), par rapport à la référence officielle (${U.nf1.format(pr.dette_pib_reference)} % du PIB).`));
    }
    pp.body.append(U.el("p", "muted", pr.note));
    const pd = U.panel("Diagnostic des institutions", { sub: d.diagnostic.note });
    if (!d.diagnostic.leviers.length) pd.body.append(U.el("p", "muted", "Aucun levier du diagnostic rattaché."));
    for (const lv of d.diagnostic.leviers) {
      const box = U.el("div", "fr-levier");
      box.append(U.el("h3", "fr-theme-h", `${lv.titre} · délai ${lv.delai || "—"}`));
      if (lv.description) box.append(U.el("p", null, lv.description));
      if (lv.effet) box.append(U.el("p", null, `Effet : ${lv.effet}`));
      if (lv.risques) box.append(U.el("p", null, `Risques : ${lv.risques}`));
      if (lv.gagnants_perdants) box.append(U.el("p", null, `Gagnants et perdants : ${lv.gagnants_perdants}`));
      for (const pos of lv.positions || []) box.append(U.el("p", null, `Position (${pos.ecole}) : ${pos.these}`));
      if ((lv.positions_manquantes || []).length) box.append(U.el("p", "muted", `Positions connues, pas encore sourcées : ${lv.positions_manquantes.join(" ; ")}`));
      if (lv.sens) box.append(U.el("p", "fr-resume", lv.sens === "inverse" ? "Cette mesure va en sens contraire du levier." : "Cette mesure va dans le sens du levier."));
      if (lv.justification) box.append(U.el("p", "muted", `Rapprochement (IA, non relu) : ${lv.justification}`));
      const src = U.el("p", "muted fr-src-line");
      (lv.sources || []).forEach((s, i) => { if (i) src.append(document.createTextNode(" · ")); src.append(C.link(s.institution || "source", s.url)); });
      box.append(src);
      pd.body.append(box);
    }
    grid.append(pc.el, pp.el, pd.el);
    root.append(grid);

    const own = d.meme_theme.candidat.map((x) => ({ ...x, nom: d.candidat.nom }));
    sameTheme(root, m, own, d.meme_theme.autres);

    const links = U.el("div", "fr-grid");
    const pa = U.panel("Actualité liée (indications)", { sub: d.actualite.note });
    if (!d.actualite.sujets.length) pa.body.append(U.el("p", "muted", "Aucun sujet des 7 derniers jours n'a deux racines en commun avec la mesure."));
    pa.body.append(list(d.actualite.sujets, (li, s) => {
      li.append(C.link(s.titre, s.url), document.createTextNode(` · ${s.medias.join(", ")} · ${U.dmy(s.time)} · en commun : ${s.racines_communes.join(", ")}`));
    }));
    const ps = U.panel("Scrutins liés (indications)", { sub: d.scrutins.note });
    if (!d.scrutins.scrutins.length) ps.body.append(U.el("p", "muted", "Aucun scrutin marquant n'a deux racines en commun avec la mesure."));
    else ps.body.append(U.table(d.scrutins.scrutins, [["date", "Date", (v) => U.dmy(v)], ["titre", "Scrutin", (v, r) => C.link(v, r.url)], ["sort", "Résultat"],
      ...(d.scrutins.depute ? [["vote", `Vote de ${d.candidat.nom}`, (v, r) => `${v || "—"}${r.delegation ? " (délégation)" : ""}`]] : []),
      ["racines_communes", "En commun", (v) => v.join(", ")]]));
    if (d.scrutins.depute === null) ps.body.append(U.el("p", "muted", "Données des députés non chargées : on ne sait pas si le candidat est député."));
    else if (!d.scrutins.depute) ps.body.append(U.el("p", "muted", "Pas député en exercice : aucun vote à l'Assemblée relevé."));
    const pl = U.panel("Textes de loi liés (indications)", { sub: d.lois ? d.lois.note : "" });
    const lois = d.lois ? d.lois.textes : [];
    if (!lois.length) pl.body.append(U.el("p", "muted", "Aucun texte en cours ou promulgué n'a deux racines en commun avec la mesure."));
    else pl.body.append(U.table(lois, [["titre", "Texte (indication)", (v, r) => C.link(v, r.url)], ["statut", "Statut"],
      ["chambres", "Chambres", (v) => (v.length ? v.join(", ") : "—")], ["date", "Dernière étape", (v) => (v ? U.dmy(v) : "—"), "nw"],
      ["jo", "Journal officiel", (v) => (v ? C.link("Texte publié", v.url) : "—")], ["racines_communes", "En commun", (v) => v.join(", ")]]));
    links.append(pa.el, ps.el);
    root.append(links, pl.el);  // pleine largeur : six colonnes
  }

  // ------------------------------------------------------------ Questions (sans IA), onglet Interroger
  function compris(r) {
    const p = U.panel("Ce qui a été compris", { sub: r.methode });
    const dl = U.el("dl", "fr-dl");
    const row = (k, v) => { dl.append(U.el("dt", null, k), U.el("dd", null, v)); };
    const named = r.compris.sans_programme.length || r.compris.ambigus.length;
    row("Candidats", r.compris.candidats.length ? r.compris.candidats.map((c) => `${c.nom} (« ${c.forme} »)`).join(", ") : named ? "aucun avec un programme relevé" : "aucun : tous les candidats");
    if (r.compris.sans_programme.length) row("Sans programme relevé", r.compris.sans_programme.map((c) => `${c.nom} (« ${c.forme} »)`).join(", "));
    if (r.compris.ambigus.length) row("Nom à préciser", r.compris.ambigus.map((a) => `« ${a.forme} »`).join(", "));
    row("Thèmes", r.compris.themes.length ? r.compris.themes.map((t) => `${themeLabel(t.id)} (« ${t.mots.join(" », « ")} »)`).join(", ") : "aucun : tous les thèmes");
    row("Mots-clés", r.compris.mots_cles.length ? r.compris.mots_cles.join(", ") : "aucun");
    p.body.append(dl);
    return p.el;
  }
  async function questions(root) {
    U = window.MASTER_UI; C = window.MASTER_FRANCE_CANDIDATS;
    const st = stateFromHash(3);
    root.append(U.callout("info", "Réponse par recherche, sans IA.", "Les candidats sont reconnus par leur nom (complet, ou nom seul s'il est sans ambiguïté), les thèmes par une table de mots déclarée ; le reste sert de mots-clés. Les mesures sont citées mot pour mot, avec leur source, et l'interprétation est affichée."));
    const form = U.el("form", "fr-ask");
    const input = U.el("input", "fr-input");
    input.type = "text"; input.maxLength = 2000; input.placeholder = "Ex. : Que proposent X et Y sur les retraites ?";
    input.setAttribute("aria-label", "Question"); input.value = st.get("q") || "";
    const send = U.el("button", null, "Chercher");
    send.type = "submit";
    form.append(input, send);
    const out = U.el("div", "fr-results");
    root.append(form, out);
    async function run() {
      const q = input.value.trim();
      keepInHash("#france/interroger/questions", { q });
      if (!q) { out.replaceChildren(); return; }
      out.replaceChildren(U.el("p", "muted", "Recherche…"));
      let r;
      try { r = await comprendre(q); } catch (e) { out.replaceChildren(U.callout("erreur", "Recherche impossible.", e.message)); return; }
      out.replaceChildren(U.el("p", "fr-q", r.question), compris(r));
      for (const a of r.avertissements) out.append(U.callout("attention", "À noter.", a));
      if (r.repli) out.append(U.callout("attention", "Mots-clés absents.", r.repli));
      if (r.filtre) out.append(U.callout("info", "Réponse restreinte.", r.filtre));
      if (r.par_candidat.length) {
        for (const g of r.par_candidat) {
          const p = U.panel(g.nom, { sub: `${g.total} mesure${g.total > 1 ? "s" : ""} trouvée${g.total > 1 ? "s" : ""}${g.total > g.mesures.length ? ` (les ${g.mesures.length} premières)` : ""}` });
          if (!g.mesures.length) p.body.append(U.el("p", "muted", "Aucune mesure relevée ne correspond."));
          for (const m of g.mesures) p.body.append(C.mesure(m, g.candidat));
          out.append(p.el);
        }
      } else {
        const p = U.panel(`${r.total} mesure${r.total > 1 ? "s" : ""} trouvée${r.total > 1 ? "s" : ""}`, { sub: r.total > r.resultats.length ? `Les ${r.resultats.length} premières.` : "" });
        if (!r.total && !r.repli) p.body.append(U.el("p", "muted", r.avertissements.length ? "Aucune recherche faite : voir ci-dessus." : "Aucune mesure relevée ne correspond."));
        for (const m of r.resultats) p.body.append(card(m));
        out.append(p.el);
      }
      const more = U.el("p", "muted", r.suite);
      if (!window.MASTER_STATIC) { const a = U.el("a", "fr-link", " Mode Maestro (IA)"); a.href = "#france/interroger"; more.append(a); }
      out.append(more);
    }
    form.onsubmit = (ev) => { ev.preventDefault(); run(); };
    if (input.value) await run();
  }

  // ------------------------------------------------------------ Même question à tous (sans IA), onglet Interroger
  async function tous(root) {
    U = window.MASTER_UI; C = window.MASTER_FRANCE_CANDIDATS;
    const G = window.MASTER_FRANCE_GQ;
    const st = stateFromHash(3);
    root.append(U.callout("info", "La même question, posée à chaque candidat, sans IA.", "Chaque candidat du registre reçoit la même recherche, dans l'ordre du registre : les trois mesures les plus pertinentes, citées mot pour mot avec leur source, ou « aucune mesure trouvée pour ces mots ». Les noms de candidats cités dans la question ne filtrent pas. Si la question correspond à une grande question, ses positions s'affichent d'abord. L'interprétation est montrée."));
    const form = U.el("form", "fr-ask");
    const input = U.el("input", "fr-input");
    input.type = "text"; input.maxLength = 2000; input.placeholder = "Ex. : Que prévoient-ils sur le nucléaire ? sur l'âge légal de la retraite ?";
    input.setAttribute("aria-label", "Question posée à tous"); input.value = st.get("q") || "";
    const send = U.el("button", null, "Poser à tous");
    send.type = "submit";
    form.append(input, send);
    const out = U.el("div", "fr-results fr-tous");
    root.append(form, out);
    let seq = 0;  // seule la dernière question lancée s'affiche
    async function run() {
      const q = input.value.trim(), ticket = ++seq;
      keepInHash("#france/interroger/tous", { q });
      if (!q) { out.replaceChildren(); return; }
      out.replaceChildren(U.el("p", "muted", "Recherche…"));
      let r, gq = null;
      try { r = await aTousRequest(q); if (r.grandes_questions.length && G) gq = await G.data(); } catch (e) { if (ticket === seq) out.replaceChildren(U.callout("erreur", "Recherche impossible.", e.message)); return; }
      if (ticket !== seq) return;
      out.replaceChildren(U.el("p", "fr-q", r.question), compris(r));
      for (const a of r.avertissements) out.append(U.callout("attention", "À noter.", a));
      if (r.message) { out.append(U.callout("attention", "Rien à chercher.", r.message)); return; }
      if (gq) for (const id of r.grandes_questions) { const g = gq.questions.find((x) => x.id === id); if (g) out.append(G.positionsPanel(g, gq)); }
      const sec = U.el("section", "fr-tous-groupes");
      sec.append(U.el("h3", "fr-theme-h", `Réponse candidat par candidat (ordre du registre, ${r.par_candidat_max} mesures au plus)`));
      for (const g of r.par_candidat) {
        const box = U.el("div", "fr-tous-g");
        box.dataset.candidat = g.candidat;
        const h = U.el("h4");
        h.append(ficheLink(g.candidat, g.nom));
        if (g.programme && g.total) h.append(U.el("span", "muted", ` · ${g.total} mesure${g.total > 1 ? "s" : ""} trouvée${g.total > 1 ? "s" : ""}${g.total > g.mesures.length ? ` (les ${g.mesures.length} premières)` : ""}`));
        box.append(h);
        if (!g.programme) box.append(U.el("p", "fr-gq-none", "aucun programme relevé"));
        else if (!g.mesures.length) box.append(U.el("p", "fr-gq-none", "aucune mesure trouvée pour ces mots"));
        for (const m of g.mesures) box.append(C.mesure(m, g.candidat));
        sec.append(box);
      }
      out.append(sec, U.el("p", "muted", `${r.releve} ${r.suite || "Pour aller plus loin, Maestro (IA) répond avec les mêmes données, en citant ses sources."}`));
    }
    form.onsubmit = (ev) => { ev.preventDefault(); run(); };
    if (input.value) await run();
  }

  window.MASTER_FRANCE_EXPLORER = { explorer, dossier, questions, tous, _rules: rules };
})();
