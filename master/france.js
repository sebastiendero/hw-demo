/* Master — rubrique « France politique » : état économique de la France face à ses voisins (onglet Économie, par
   section : finances publiques, croissance, emploi et revenus, prix, commerce extérieur, long terme, notations ;
   #france/economie/<section>), budget de l'année au Parlement (étapes, chiffres clés par lecture, avis des
   institutions ; #france/budget/avis). Les autres onglets viennent de france-*.js. Lecture
   seule, aussi en ligne. Une valeur absente est affichée absente, une valeur trop ancienne « périmée » ; rien n'est
   estimé. */
(() => {
  "use strict";
  const TABS = [
    ["economie", "Économie"], ["budget", "Budget 2027"], ["candidats", "Candidats"], ["carte", "Carte"],
    ["actualite", "Actualité"], ["lois", "Lois"], ["diagnostic", "Diagnostic"], ["projections", "Projections"], ["marches", "Marchés"],
    ["interroger", "Interroger"],
  ];
  const PLANNED = {};
  const POLL_TABS = new Set(["candidats", "marches", "interroger"]);  // onglets qui montrent des sondages
  const PEERS = { FR: "France", DE: "Allemagne", IT: "Italie", ES: "Espagne", EA21: "Zone euro", EA: "Zone euro" };
  let U = null;

  const period = (iso, freq) => {  // date d'observation (début de période) → « T2 2026 », « 09/2026 », « S1 2026 », « 2025 »
    const [y, m] = iso.split("-");
    if (freq === "A") return y;
    if (freq === "S") return `S${Number(m) <= 6 ? 1 : 2} ${y}`;
    return freq === "T" ? `T${Math.ceil(Number(m) / 3)} ${y}` : `${m}/${y}`;
  };
  const FMT = {};
  const fmt = (d) => (FMT[d] = FMT[d] || new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const num = (v, ind) => fmt(ind.decimals == null ? 1 : ind.decimals).format(v);
  const md = (v) => (v == null ? "—" : fmt(1).format(v));  // montants du commerce, en Md€
  let regionNames = null;
  const country = (code) => {  // nom du pays en français (navigateur) ; sinon le code tel quel
    try { regionNames = regionNames || new Intl.DisplayNames(["fr"], { type: "region" }); return regionNames.of(code) || code; } catch { return code; }
  };

  function link(text, href) {  // lien externe seulement en https ; sinon le texte seul
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", null, text);
    const a = U.el("a", "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  function planned(root, tab) {
    root.append(U.callout("info", "Prévu", `Cette rubrique arrive en phase ${PLANNED[tab]}.`));
  }

  function chart(box, ind) {
    if (!window.LightweightCharts) return;
    const theme = U.chartTheme();
    const c = LightweightCharts.createChart(box, theme);
    const muted = [U.cssVar("--ink-2"), U.cssVar("--ink-3"), U.cssVar("--line-2"), U.cssVar("--ink-2")];
    let i = 0;
    for (const [geo, rows] of Object.entries(ind.series)) {
      const fr = geo === "FR";
      const s = c.addSeries(LightweightCharts.LineSeries, {
        color: fr ? U.cssVar("--acc") : muted[i++ % muted.length], lineWidth: fr ? 2 : 1,
        lineStyle: geo.startsWith("EA") ? 2 : 0, priceLineVisible: false, lastValueVisible: fr, title: fr ? "" : geo,
        priceFormat: { type: "price", precision: ind.decimals == null ? 1 : ind.decimals, minMove: 10 ** -(ind.decimals == null ? 1 : ind.decimals) },
      });
      s.setData(rows.map(([d, v]) => ({ time: d, value: v })));
    }
    c.timeScale().fitContent();
  }

  function indicatorCard(ind) {
    const p = U.panel(ind.label, { sub: ind.source });
    p.el.classList.add("fr-ind");
    p.el.dataset.id = ind.id;
    const top = U.el("div", "fr-top");
    if (ind.latest) {
      const v = U.el("div", "fr-v", num(ind.latest.value, ind));
      v.append(U.el("small", null, ` ${ind.unit}`));
      top.append(v, U.el("div", "muted", `${period(ind.latest.date, ind.freq)} · connu le ${U.dmy(ind.latest.known)}`));
    } else {
      top.append(U.el("div", "fr-v", "—"));
    }
    if (!ind.latest) top.append(U.status("bad", "absent"));
    else if (ind.stale) top.append(U.status("warn", "périmé"));
    p.body.append(top);
    const others = Object.entries(ind.peers || {}).filter(([g]) => g !== "FR");
    if (others.length) {  // dernière valeur de chaque voisin, avec sa période (elles peuvent différer)
      const cmp = U.el("div", "fr-peers");
      cmp.append(U.el("span", "muted", "Voisins : "));
      cmp.append(U.el("span", null, others.map(([g, x]) => `${PEERS[g] || g} ${num(x.value, ind)} (${period(x.date, ind.freq)})`).join(" · ")));
      p.body.append(cmp);
    }
    const geos = Object.keys(ind.series);
    if (geos.length) {
      const box = U.el("div", "fr-chart");
      p.body.append(box);
      if (geos.length > 1) {
        const leg = U.el("div", "fr-legend");
        for (const g of geos) leg.append(U.el("span", g === "FR" ? "fr-fr" : null, `${g} ${PEERS[g] || ""}`.trim()));
        p.body.append(leg);
      }
      requestAnimationFrame(() => chart(box, ind));  // le graphique a besoin de sa taille réelle
    }
    p.body.append(U.el("div", "fr-seuil muted", `Périmé si la dernière période a commencé il y a plus de ${ind.stale_days} jours.`));
    return p.el;
  }

  function sourcesHealth(d) {  // santé de chaque source du tableau de bord, telle que la collecte l'a notée
    const box = U.el("div", "fr-sources");
    box.append(U.el("span", "muted", "Sources : "));
    for (const s of d.sources || []) {
      const label = s.error ? `${s.label} : en erreur` : s.last_success ? `${s.label} : collecté le ${U.dmy(s.last_success.slice(0, 10))}` : `${s.label} : jamais collecté`;
      const st = U.status(s.error ? "bad" : s.last_success ? "ok" : "neutral", label);
      if (s.error) st.title = s.error;
      box.append(st);
    }
    return box;
  }

  function commercePanels(c) {
    const out = [];
    if (!c || c.annee == null) {
      out.push(U.callout("info", "Commerce par partenaire et par produit :", "pas encore collecté (Eurostat Comext)."));
      return out;
    }
    const tot = c.total;
    const sub = `${c.source} · année ${c.annee}` + (tot ? ` · total : exportations ${md(tot.export)} Md€, importations ${md(tot.import)} Md€, solde ${md(tot.solde)} Md€` : "");
    const p1 = U.panel(`Premiers partenaires commerciaux en ${c.annee} (biens)`, { sub });
    p1.el.classList.add("fr-commerce");
    p1.body.append(U.table(c.partenaires, [
      ["code", "Pays", (v) => country(v)], ["export", "Exportations (Md€)", md, "num"], ["import", "Importations (Md€)", md, "num"],
      ["solde", "Solde (Md€)", md, "num"], ["part_export", "Part des exportations", (v) => (v == null ? "—" : `${fmt(1).format(v)} %`), "num"],
    ], null, { empty: "Aucun partenaire connu à cette date." }));
    const p2 = U.panel(`Échanges par grande catégorie de produits en ${c.annee}`, { sub: "Sections de la classification type pour le commerce international (CTCI)" });
    p2.el.classList.add("fr-commerce");
    p2.body.append(U.table(c.produits, [
      ["libelle", "Catégorie"], ["export", "Exportations (Md€)", md, "num"], ["import", "Importations (Md€)", md, "num"], ["solde", "Solde (Md€)", md, "num"],
    ], null, { empty: "Aucune catégorie connue à cette date." }));
    out.push(p1.el, p2.el);
    return out;
  }

  function retraitesPanel(r) {
    if (!r || !r.chiffres || !r.chiffres.length) return U.callout("attention", "Retraites (COR) :", "chiffres indisponibles.");
    const p = U.panel("Retraites : solde et projections du COR", { sub: `${r.rapport} · publié le ${U.dmy(r.publie_le)}` });
    p.el.classList.add("fr-cor");
    p.body.append(U.callout("info", "Projections du COR, pas du Master.", (r.hypotheses && r.hypotheses.texte) || ""));
    p.body.append(U.table(r.chiffres, [
      ["libelle", "Grandeur"], ["annee", "Année"], ["valeur", "Valeur", (v, x) => `${fmt(Math.abs(v) < 10 && !Number.isInteger(v * 10) ? 2 : 1).format(v)} ${x.unite}`, "num"],
      ["nature", "Nature"], ["citation", "Citation (synthèse du rapport)", (v, x) => link(`« ${v} »`, x.url)],
    ]));
    p.body.append(link("Rapport complet (PDF)", r.url_rapport));
    return p.el;
  }

  function notationsPanels(n) {
    const out = [];
    if (n.releve) out.push(U.callout("info", "Relevé daté.", n.releve));
    const p = U.panel("Notes souveraines de la France", { sub: `Dernière action connue de chaque agence · relevé du ${n.date_releve ? U.dmy(n.date_releve) : "—"}` });
    p.el.classList.add("fr-notations");
    const next = (a) => (a.prochaines.length ? a.prochaines.map((c) => U.dmy(c.date)).join(", ") : "aucune date relevée");
    p.body.append(U.table(n.agences, [
      ["agence", "Agence"],
      ["actuelle", "Note", (v) => (v ? v.note : "non relevée")],
      ["actuelle", "Perspective", (v) => (v ? v.perspective : "—")],
      ["actuelle", "Dernière action", (v) => (v ? `${U.dmy(v.date)} : ${v.action}` : "—")],
      ["actuelle", "Source", (v) => (v ? link(v.source.media, v.source.url) : "—")],
      ["prochaines", "Prochaine revue prévue", (v, a) => next(a)],
    ]));
    out.push(p.el);
    const hist = n.agences.flatMap((a) => a.historique.map((h) => ({ ...h, agence: a.agence }))).sort((x, y) => (x.date < y.date ? 1 : -1));
    const p2 = U.panel("Actions relevées", { sub: "Chaque ligne cite sa source telle quelle" });
    p2.body.append(U.table(hist, [
      ["date", "Date", (v) => U.dmy(v)], ["agence", "Agence"], ["note", "Note"], ["perspective", "Perspective"], ["action", "Action"],
      ["source", "Citation", (v) => link(`« ${v.citation} » (${v.media})`, v.url)],
    ]));
    out.push(p2.el);
    const notes = [];
    if (n.calendrier_2027 && n.calendrier_2027.note) notes.push(n.calendrier_2027.note);
    if (n.regle_calendrier) notes.push(`« ${n.regle_calendrier.citation} » (${n.regle_calendrier.media})`);
    if (notes.length) out.push(U.callout("info", "Calendrier des revues.", notes.join(" ")));
    if (n.erreurs && n.erreurs.length) out.push(U.callout("attention", "Entrées écartées :", n.erreurs.join(" · ")));
    return out;
  }

  async function economie(root) {
    const sub = location.hash.slice(1).split("/")[2];  // #france/economie/<section>
    const [d, extra] = await Promise.all([U.api("/api/france/indicateurs"), U.api("/api/france/economie").catch(() => null)]);
    const sections = d.sections.map((s) => [s.id, s.label]);
    const cur = sections.some(([k]) => k === sub) ? sub : sections[0][0];
    root.append(U.callout("info", "Lecture datée.",
      "Chaque valeur est celle connue à la date indiquée ; la France est mise en avant, comparée à l'Allemagne, l'Italie, l'Espagne et la zone euro quand la source le permet."));
    root.append(sourcesHealth(d));
    root.append(U.seg(sections, cur, (v) => { location.hash = `#france/economie/${v}`; }, "Sections de l'économie"));
    const inds = d.indicators.filter((i) => i.section === cur);
    if (inds.length) {
      const grid = U.el("div", "fr-grid");
      for (const ind of inds) grid.append(indicatorCard(ind));
      root.append(grid);
    }
    if (!extra && ["commerce", "long_terme", "notations"].includes(cur)) {
      root.append(U.callout("attention", "Compléments indisponibles :", "notations, retraites et détail du commerce n'ont pas pu être lus."));
      return;
    }
    if (cur === "commerce") root.append(...commercePanels(extra.commerce));
    if (cur === "long_terme") root.append(retraitesPanel(extra.retraites));
    if (cur === "notations") root.append(...notationsPanels(extra.notations));
  }

  const ETAT_LECTURE = { depose: "déposé", en_cours: "en cours", adopte: "adopté", rejete: "rejeté", transmis: "transmis" };
  const ETAT_VIDE = { supprime: "supprimé par ce texte", rejete: "texte rejeté", absent: "non fixé", non_publie: "non publié" };
  const fmtVal = (v, dec, unite) => `${fmt(dec).format(v)} ${unite}`;
  const sgn = (v, dec) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmt(dec).format(Math.abs(v))}`;

  function stepsPanels(d) {  // étapes du PLF et du PLFSS dans les données ouvertes de l'Assemblée
    if (!d.textes.length) return [U.callout("info", "Aucun texte budgétaire 2027 trouvé dans les données de l'Assemblée.")];
    return d.textes.map((t) => {
      const last = t.derniere_etape;
      const p = U.panel(t.titre || t.texte, { sub: `Dernière étape : ${last.title} · ${U.dmy(last.time)}` });
      p.el.classList.add("fr-etapes");
      const list = U.el("ol", "fr-steps");
      for (const e of t.etapes) {
        const li = U.el("li");
        li.append(U.el("span", "fr-date", U.dmy(e.time)), U.el("span", null, e.title));
        if (e.data && e.data.lecture) li.append(U.el("span", "muted", e.data.lecture));
        list.append(li);
      }
      p.body.append(list, link("Dossier à l'Assemblée nationale", t.url));
      return p.el;
    });
  }

  function chiffresPanels(c) {  // « Chiffres clés et évolution par lecture » : une colonne par lecture, une ligne par chiffre
    const out = [];
    if (!c.tableaux.length) return [U.callout("attention", "Chiffres clés indisponibles :", "le fichier des chiffres du budget n'a pas pu être lu.")];
    for (const t of c.tableaux) {
      const p = U.panel("Chiffres clés et évolution par lecture", { sub: `${t.titre} · relevé du ${c.releve ? U.dmy(c.releve.date) : "—"}` });
      p.el.classList.add("fr-chiffres");
      const cols = [["libelle", "Chiffre", (v, r) => `${v} (${r.unite})`]];
      t.colonnes.forEach((col, i) => cols.push(["cellules", `${col.lecture} · ${U.dmy(col.date)}`, (cells, r) => {
        const cell = cells[i];
        if (cell.valeur == null) return U.el("span", "muted", ETAT_VIDE[cell.etat] || "—");
        const box = U.el("span", "fr-val");
        box.append(link(fmt(r.decimales).format(cell.valeur), cell.url));
        if (cell.ecart != null) box.append(U.el("small", "muted", ` ${sgn(cell.ecart, r.decimales)}`));
        return box;
      }, "num"]));
      p.body.append(U.table(t.lignes, cols, null, { empty: "Aucun chiffre relevé." }));
      p.body.append(U.el("p", "muted fr-legende", "Chaque valeur renvoie au document officiel ; la variation est celle avec la dernière valeur connue d'une lecture précédente. « — » : le texte ne fixe pas ce chiffre, il n'est pas estimé."));
      for (const col of t.colonnes) {
        const line = U.el("p", "fr-lecture");
        line.append(U.el("strong", null, `${col.lecture} (${ETAT_LECTURE[col.etat] || col.etat}, ${U.dmy(col.date)}) : `), link(col.source.titre, col.source.document || col.source.url));
        if (col.note) line.append(U.el("span", "muted", ` ${col.note}`));
        p.body.append(line);
      }
      const quotes = [];
      for (const r of t.lignes) t.colonnes.forEach((col, i) => { const cell = r.cellules[i]; if (cell.citation) quotes.push({ chiffre: r.libelle, lecture: col.lecture, cell }); });
      const q = U.panel("Citations exactes des documents", { sub: t.titre });
      q.body.append(U.table(quotes, [
        ["chiffre", "Chiffre"], ["lecture", "Lecture"],
        ["cell", "Citation", (cell) => link(`« ${cell.citation} »`, cell.url)],
      ]));
      out.push(p.el, q.el);
    }
    if (c.erreurs && c.erreurs.length) out.push(U.callout("attention", "Entrées écartées :", c.erreurs.join(" · ")));
    return out;
  }

  function avisPanels(a) {  // citations exactes, regroupées par institution ; aucun résumé ni classement
    const out = [U.callout("info", "Citations reproduites telles quelles.",
      "Le Master ne les résume pas et ne classe pas les institutions : chaque citation renvoie au document et à la page où elle a été retrouvée.")];
    if (!a.avis.length) {
      out.push(U.callout("attention", "Avis indisponibles :", "le fichier des avis n'a pas pu être lu."));
    }
    const byId = Object.fromEntries(a.avis.map((x) => [x.id, x]));
    for (const inst of a.institutions) {
      const p = U.panel(inst.institution, { sub: `${inst.avis.length} document${inst.avis.length > 1 ? "s" : ""}` });
      p.el.classList.add("fr-avis");
      p.el.dataset.institution = inst.institution;
      for (const id of inst.avis) {
        const x = byId[id];
        const art = U.el("article", "fr-doc");
        const h = U.el("h4");
        h.append(link(x.titre, x.url));
        art.append(h, U.el("div", "muted", `${U.dmy(x.date)} · ${x.portee || ""}`));
        for (const c of x.citations) {
          const bq = U.el("blockquote", "fr-quote");
          bq.append(U.el("span", "fr-sujet", c.sujet_libelle), U.el("span", null, `« ${c.texte} »`));
          art.append(bq);
        }
        const v = U.el("div", "muted fr-verif");
        v.append(document.createTextNode("Citations retrouvées dans : "), link(new URL(x.verification.url).hostname.replace(/^www\./, ""), x.verification.url));
        if (x.document) { v.append(document.createTextNode(" · document : "), link("PDF", x.document)); }
        if (x.verification.note) v.append(U.el("div", null, x.verification.note));
        art.append(v);
        p.body.append(art);
      }
      out.push(p.el);
    }
    if (a.erreurs && a.erreurs.length) out.push(U.callout("attention", "Entrées écartées :", a.erreurs.join(" · ")));
    return out;
  }

  async function budget(root) {
    const d = await U.api("/api/france/budget");
    const sub = location.hash.slice(1).split("/")[2];  // #france/budget/<section>
    const cur = sub === "avis" ? "avis" : "suivi";
    root.append(U.seg([["suivi", "Étapes et chiffres clés"], ["avis", "Avis des institutions"]], cur, (v) => { location.hash = `#france/budget/${v}`; }, "Sections du budget"));
    const m = d.mise_a_jour;
    if (m && !m.a_jour) {
      const c = U.callout("attention", "Chiffres à mettre à jour :", `${m.message.replace(/^chiffres à mettre à jour : /, "")}. Une étape plus récente que le dernier relevé existe ; aucun chiffre n'est estimé en attendant.`);
      c.classList.add("fr-maj");
      root.append(c);
    }
    root.append(...(cur === "avis" ? avisPanels(d.avis) : [...stepsPanels(d), ...chiffresPanels(d.chiffres)]));
  }

  const VIEWS = { economie, budget };  // les autres onglets viennent de france-*.js (window.MASTER_FRANCE_TABS)

  async function viewFrance(root) {
    U = window.MASTER_UI;
    root.classList.add("fr-view");  // portée des styles de france.css : cette vue seulement
    const tab = location.hash.slice(1).split("/")[1] || "economie";
    const cur = TABS.some(([k]) => k === tab) ? tab : "economie";
    root.append(U.pageHead({ crumbs: ["France politique", TABS.find(([k]) => k === cur)[1]], title: "France politique",
      sub: "Présidentielle 2027, budget et Parlement, état économique de la France." }));
    root.append(U.seg(TABS, cur, (v) => { location.hash = `#france/${v}`; }, "Rubriques"));
    const body = U.el("div", "fr-body");
    root.append(body);
    if (POLL_TABS.has(cur)) {  // veille et jour de scrutin (loi du 19 juillet 1977) : bandeau ; en ligne, sondages masqués
      const ban = await U.api("/api/france/interdiction").catch(() => null);
      if (ban && ban.active) {
        const c = U.callout("attention", null, ban.message);
        if (ban.loi) { const p = c.querySelector("p"); p.append(document.createTextNode(" "), link("Loi n° 77-808, article 11", ban.loi.url)); }
        body.append(c);
      }
    }
    const view = VIEWS[cur] || (window.MASTER_FRANCE_TABS || {})[cur];  // onglets ajoutés par d'autres fichiers (france-carte.js)
    if (view) await view(body); else planned(body, cur);
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { france: viewFrance });
})();
