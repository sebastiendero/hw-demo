/* Master — « Grandes questions » de France politique (mode de l'onglet Interroger, #france/interroger/grandes-questions) :
   une trentaine de questions clés avec l'état actuel du droit (source et citation exacte), puis, pour chaque candidat du
   registre et dans l'ordre du registre, sa position quand une mesure relevée y répond explicitement, avec la citation de la
   mesure et le lien « Creuser » vers son dossier ; sinon « pas de position relevée », en gris neutre (jamais une déduction).
   Une matrice candidats × questions donne un symbole de présence, sans couleur de jugement, sans note, sans classement.
   Données : /api/france/grandes-questions (local et instantané en ligne). Les positions sont classées par IA à partir des
   mesures relevées et non relues : l'étiquette est affichée. Tout texte de données passe par textContent (U.el). */
(() => {
  "use strict";
  let U = null, C = null;
  let DATA = null;  // une seule lecture par page

  const init = () => { U = window.MASTER_UI; C = window.MASTER_FRANCE_CANDIDATS; };
  const themeLabel = (t) => C.THEMES[t] || String(t || "autre").replace(/_/g, " ");
  const href = (qid, cid) => `#france/interroger/grandes-questions${qid ? `/${encodeURIComponent(qid)}${cid ? `/${encodeURIComponent(cid)}` : ""}` : ""}`;
  const ficheLink = (c) => { const a = U.el("a", "fr-link", c.nom); a.href = `#france/candidats/${encodeURIComponent(c.id)}`; return a; };
  const plural = (n, un, plus) => `${n} ${n > 1 ? plus : un}`;

  async function data() {
    init();
    DATA = DATA || U.api("/api/france/grandes-questions");
    try { return await DATA; } catch (e) { DATA = null; throw e; }
  }

  function etatActuel(q) {  // la règle en vigueur, avec chaque source et sa citation exacte
    const box = U.el("div", "fr-gq-etat");
    const p = U.el("p");
    p.append(U.el("b", null, "État actuel. "), document.createTextNode(q.etat_actuel.texte));
    box.append(p);
    for (const s of q.etat_actuel.sources) {
      box.append(U.el("blockquote", "fr-citation", s.citation));
      const l = U.el("p", "muted fr-src-line");
      l.append(document.createTextNode(`${s.institution}${s.date ? ` · ${U.dmy(s.date)}` : ""} · `), C.link("source", s.url));
      box.append(l);
    }
    return box;
  }

  function statutTag(statut) { return U.el("span", "fr-tag", C.STATUT[statut] || statut); }

  function row(q, c) {  // une ligne par candidat, dans l'ordre du registre
    const r = U.el("div", "fr-gq-row");
    r.dataset.candidat = c.id;
    const h = U.el("h4");
    h.append(ficheLink(c));
    if (c.parti) h.append(U.el("span", "muted", ` · ${c.parti}`));
    r.append(h);
    const p = q.positions[c.id];
    if (!p) {
      r.append(U.el("p", "fr-gq-none", c.programme ? "pas de position relevée" : "pas de position relevée (aucun programme relevé)"));
      return r;
    }
    const line = U.el("p");
    line.append(U.el("span", "fr-gq-pos", p.position), document.createTextNode(" "), statutTag(p.statut));
    if (p.anterieure) line.append(document.createTextNode(" "), U.status("neutral", "source antérieure à la campagne 2027"));
    r.append(line);
    for (const m of p.mesures) r.append(C.mesure({ ...m, candidat: c.id }, c.id));
    return r;
  }

  function rows(q, d, cible) {
    const box = U.el("div", "fr-gq-rows");
    for (const c of d.candidats) {
      const r = row(q, c);
      if (cible === c.id) r.classList.add("fr-cible");
      box.append(r);
    }
    return box;
  }

  function resume(q) {
    return `${plural(q.nb_positions, "position relevée", "positions relevées")} sur ${plural(q.nb_candidats, "candidat avec programme", "candidats avec programme")}`;
  }

  // Positions d'une grande question, pour la question posée à tous : seuls ceux qui ont une position, puis les autres en une ligne.
  function positionsPanel(q, d) {
    const p = U.panel(`Grande question : ${q.question}`, { sub: `${themeLabel(q.theme)} · ${resume(q)}` });
    p.el.classList.add("fr-gq-first");
    p.el.dataset.question = q.id;
    p.body.append(etatActuel(q));
    const box = U.el("div", "fr-gq-rows");
    for (const c of d.candidats) if (q.positions[c.id]) box.append(row(q, c));
    p.body.append(box);
    const none = d.candidats.filter((c) => !q.positions[c.id]);
    if (none.length) {
      const det = U.el("details", "fr-group");
      det.append(U.el("summary", null, `Pas de position relevée (${none.length})`));
      det.append(U.el("p", "fr-gq-none", none.map((c) => c.nom).join(", ")));
      p.body.append(det);
    }
    const more = U.el("p", "muted");
    const a = U.el("a", "fr-link", "Toutes les positions, candidat par candidat");
    a.href = href(q.id);
    more.append(a, document.createTextNode(` · ${d.releve}`));
    p.body.append(more);
    return p.el;
  }

  function card(q) {
    const c = U.el("article", "fr-gq-card");
    c.id = `gq-${q.id}`;
    c.dataset.question = q.id;
    const h = U.el("h3");
    const a = U.el("a", "fr-link", q.question);
    a.href = href(q.id);
    h.append(a);
    c.append(h, etatActuel(q));
    const f = U.el("p", "muted");
    f.append(document.createTextNode(`${resume(q)} · `));
    const b = U.el("a", "fr-link", "Voir les positions");
    b.href = href(q.id);
    f.append(b);
    c.append(f);
    return c;
  }

  function listByTheme(d) {
    const box = U.el("div", "fr-gq-list");
    for (const t of d.themes) {
      const qs = d.questions.filter((q) => q.theme === t);
      if (!qs.length) continue;
      const sec = U.el("section");
      sec.append(U.el("h3", "fr-gq-theme", `${themeLabel(t)} (${qs.length})`));
      for (const q of qs) sec.append(card(q));
      box.append(sec);
    }
    return box;
  }

  function matrix(d) {  // candidats (avec programme) × questions : ● = une position relevée, · = pas de position relevée
    const order = d.themes.flatMap((t) => d.questions.filter((q) => q.theme === t));
    const people = d.candidats.filter((c) => c.programme);
    const p = U.panel("Candidats × grandes questions", { sub: "● : une position relevée (cliquez pour la lire) · : pas de position relevée. Aucune note, aucun classement ; ordre du registre. Une case vide ne veut pas dire « contre »." });
    const wrap = U.el("div", "table-wrap fr-matrix-wrap");
    const t = U.el("table", "fr-matrix fr-gq-matrix");
    const head = U.el("tr");
    head.append(U.el("th", null, "Candidat"));
    order.forEach((q, i) => {
      const th = U.el("th", "fr-mx-h", String(i + 1));
      th.title = q.question; th.scope = "col"; th.setAttribute("aria-label", q.question);
      head.append(th);
    });
    t.append(head);
    for (const c of people) {
      const tr = U.el("tr");
      const td0 = U.el("td");
      td0.append(ficheLink(c));
      tr.append(td0);
      for (const q of order) {
        const pos = q.positions[c.id];
        const td = U.el("td", `fr-mx${pos ? " go" : " muted"}`, pos ? "●" : "·");
        if (pos) {
          td.tabIndex = 0;
          td.setAttribute("role", "link");
          td.setAttribute("aria-label", `${c.nom} — ${q.question} : ${pos.position}`);
          td.title = `${c.nom} : ${pos.position}`;
          const go = () => { location.hash = href(q.id, c.id); };
          td.onclick = go;
          td.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
        }
        tr.append(td);
      }
      t.append(tr);
    }
    wrap.append(t);
    p.body.append(wrap);
    const leg = U.el("ol", "fr-gq-legend muted");
    for (const q of order) leg.append(U.el("li", null, q.question));
    p.body.append(leg);
    const sans = d.candidats.filter((c) => !c.programme);
    if (sans.length) p.body.append(U.el("p", "muted", `Sans programme relevé, donc absents de la matrice : ${sans.map((c) => c.nom).join(", ")}.`));
    return p.el;
  }

  async function vue(root, qid, cid) {
    init();
    let d;
    try { d = await data(); } catch (e) { root.append(U.callout("erreur", "Grandes questions indisponibles.", e.message)); return; }
    root.append(U.callout("ia", `${d.releve}.`, "Une position n'est relevée que si une mesure répond explicitement à la question ; sinon « pas de position relevée » (jamais une déduction). Aucune note, aucun classement."));
    if (d.erreurs.length) root.append(U.callout("attention", "Entrées écartées du fichier :", d.erreurs.join(" · ")));
    if (!d.questions.length) { root.append(U.callout("info", "Aucune grande question disponible.", "")); return; }
    const q = qid ? d.questions.find((x) => x.id === qid) : null;
    if (qid && !q) root.append(U.callout("attention", "Question inconnue.", qid));
    if (q) {
      const p = U.panel(q.question, { sub: `${themeLabel(q.theme)} · ${resume(q)}` });
      p.el.classList.add("fr-gq-detail");
      p.el.dataset.question = q.id;
      p.body.append(etatActuel(q), U.el("h3", "fr-theme-h", "Positions relevées, candidat par candidat (ordre du registre)"), rows(q, d, cid));
      const back = U.el("p");
      const a = U.el("a", "fr-link", "Toutes les grandes questions");
      a.href = href();
      back.append(a);
      p.body.append(back);
      root.append(p.el);
      const target = cid ? p.el.querySelector(`.fr-gq-row[data-candidat="${CSS.escape(cid)}"]`) : null;
      if (target && target.scrollIntoView) requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
    }
    root.append(matrix(d));
    const lp = U.panel("Les grandes questions", { sub: `${d.questions.length} questions, par thème. Cliquez une question pour lire la position de chaque candidat.` });
    lp.body.append(listByTheme(d));
    if ((d.methode || []).length) {
      const det = U.el("details", "fr-source");
      det.append(U.el("summary", null, "Méthode du classement (identique pour tous les candidats)"));
      const ul = U.el("ul");
      for (const m of d.methode) ul.append(U.el("li", null, m));
      det.append(ul);
      lp.body.append(det);
    }
    root.append(lp.el);
  }

  // Dossier d'une mesure : les grandes questions auxquelles elle répond (position et statut).
  function mesurePanel(list) {
    init();
    const p = U.panel("Grandes questions auxquelles répond cette mesure", { sub: "Classement par IA, non relu : la mesure porte la position d'au moins un candidat sur la question." });
    p.el.classList.add("fr-gq-mesure");
    if (!list.length) { p.body.append(U.el("p", "muted", "Aucune grande question ne s'appuie sur cette mesure.")); return p.el; }
    const ul = U.el("ul", "fr-list");
    for (const g of list) {
      const li = U.el("li");
      const a = U.el("a", "fr-link", g.question);
      a.href = href(g.id);
      li.append(a, document.createTextNode(` · ${g.position} `), statutTag(g.statut));
      ul.append(li);
    }
    p.body.append(ul);
    return p.el;
  }

  async function duMesure(cid, mid) {  // en ligne comme en local : dérivé de /api/france/grandes-questions
    const d = await data();
    return d.questions.filter((q) => q.positions[cid] && q.positions[cid].mesures.some((m) => m.id === mid))
      .map((q) => ({ id: q.id, theme: q.theme, question: q.question, position: q.positions[cid].position, statut: q.positions[cid].statut }));
  }

  window.MASTER_FRANCE_GQ = { vue, positionsPanel, mesurePanel, duMesure, data };
})();
