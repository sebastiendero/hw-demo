/* Master — Actualité, « À la une » : les sujets du moment, du plus repris au moins repris.
 *
 * Un sujet est un groupe de titres de presse (thème « actualite ») repris par au moins deux médias différents
 * (regroupement par mots communs, sur 48 h). Les plus repris sont en tête. Filtres : mots, pays, thème, taille du
 * sujet (nombre de médias), période, détail. Un sujet s'ouvre en lecture complète (récit rédigé par le modèle quand
 * il existe, impact pays par pays, chronologie de toutes les dépêches) et peut être confié à Maestro, qui l'explique.
 * Tout texte de données passe par textContent ; liens http(s) seulement.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const S = () => window.MASTER_SITUATION;
  const STOPW = new Set(("the a an of to in on for and or with at by from as is are was were be been has have had it its this that these those after over "
    + "into about amid says said new will not no but more than up out off le la les de des du un une et en au aux pour par sur dans avec est sont qui que").split(" "));
  const THEMES = [  // première qui correspond, dans cet ordre (titres et extraits, anglais et français)
    ["securite", "Conflits & sécurité", "hot", /\b(attack|strike|killed|dead|deaths|missile|drone|bomb|army|troops|soldier|military|war\b|clash|fighting|terror|shooting|raid|navy|ceasefire|attaque|frappe|tués?|morts?|armée|militaire|guerre|combats?|cessez-le-feu)/i],
    ["diplomatie", "Diplomatie", "talk", /\b(talks|negotiat|summit|envoy|embassy|diplomat|treaty|agreement|deal|sanction|foreign minister|visit|united nations|\bun\b|négoci|sommet|émissaire|ambassad|traité|accord|visite|onu)/i],
    ["economie", "Économie & énergie", "cool", /\b(econom|gdp|inflation|oil|crude|gas\b|lng|opec|energy|trade|tariff|export|import|market|stock|bank|currency|budget|debt|invest|price|growth|company|shipping|tanker|économ|pétrole|gaz|énergie|commerce|marché|bourse|banque|prix|croissance|entreprise)/i],
    ["politique", "Politique", "acc", /\b(election|vote|president|prime minister|parliament|government|party|opposition|minister|law\b|court|protest|reform|campaign|élection|présiden|premier ministre|parlement|gouvernement|parti|ministre|loi|tribunal|manifest|réforme)/i],
  ];
  const themeOf = (text) => (THEMES.find(([, , , rx]) => rx.test(text)) || ["societe", "Société", "mute"]).slice(0, 3);
  const SIZES = [["2", "Tous les sujets"], ["3", "3 médias et plus"], ["5", "5 médias et plus"]];
  const PERIODS = [["24", "24 h"], ["48", "48 h"], ["", "Tout"]];
  const st = (() => { try { return { theme: "", country: "", size: "2", period: "48", detail: "resume", q: "", ...JSON.parse(localStorage.getItem("master-sujets") || "{}") }; } catch { return { theme: "", country: "", size: "2", period: "48", detail: "resume", q: "" }; } })();
  const save = () => { try { const { q, ...keep } = st; localStorage.setItem("master-sujets", JSON.stringify(keep)); } catch { /* non mémorisé */ } };
  const flagOf = (iso) => (iso && /^[a-z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");

  // Confier un sujet à Maestro : la question part avec les titres des dépêches, la conversation s'ouvre.
  function askMaestro(question) {
    try { localStorage.setItem("master-maestro-ask", JSON.stringify({ q: question, at: Date.now() })); } catch { /* ignoré */ }
    location.hash = "#maestro";
  }
  const brief = (t) => t.items.slice(0, 8).map((x) => `- ${x.source}, ${x.time.slice(0, 16).replace("T", " ")} UTC : ${x.title}`).join("\n");

  async function viewSujets(root, seg) {
    const ui = U(), s = S();
    const { el, api, badge } = ui;
    const [press, notesResp] = await Promise.all([api("/api/events?theme=actualite&limit=3000").catch(() => []),
      api("/api/research/notes?source=developpement&limit=200").catch(() => ({ notes: [] })),
      window.MASTER_MONDE_LOAD ? window.MASTER_MONDE_LOAD().catch(() => null) : null]);
    const written = new Map();  // lien d'une dépêche → récit rédigé du sujet
    for (const n of (notesResp && notesResp.notes) || []) for (const x of (n.data && n.data.sources) || []) if (!written.has(x.url)) written.set(x.url, n);

    // ---- sujets : titres voisins (mots communs) sur 48 h, au moins deux médias
    const words = (t) => new Set((t.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) || []).filter((w) => !STOPW.has(w)));
    const near = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n >= 4 && n >= 0.5 * Math.min(a.size, b.size); };
    const rss = press.filter((e) => !s.isOsint(e)).sort((a, b) => (a.time < b.time ? 1 : -1));
    const groups = [];
    for (const e of rss) {
      const w = words(e.title);
      const g = groups.find((x) => Math.abs(Date.parse(x.items[0].time) - Date.parse(e.time)) < 2 * 864e5 && x.items.some((y) => near(y._w, w)));
      e._w = w;
      if (g) g.items.push(e); else groups.push({ items: [e] });
    }
    const countriesIn = window.MASTER_MONDE_COUNTRIES || (() => []);
    const topics = groups.map((g) => {
      const outlets = [...new Set(g.items.map((x) => x.source))];
      const note = g.items.map((x) => written.get(x.url)).find(Boolean) || null;
      const nd = (note && note.data) || {};
      const text = g.items.map((x) => `${x.title} ${(x.data && x.data.summary) || ""}`).join(" ");
      const isos = [...new Set([...(nd.impact || []).map((i) => i.pays), ...countriesIn(g.items.map((x) => x.title).join(" ")).map((c) => c.iso)])];
      const last = g.items[0].time, first = g.items[g.items.length - 1].time;
      const ageH = (Date.now() - Date.parse(last)) / 36e5;
      return { ...g, outlets, note, nd, isos, theme: themeOf(text), last, first,
        title: note && note.summary ? note.summary : g.items[0].title,
        lead: (nd.paragraphes && nd.paragraphes[0] && nd.paragraphes[0].texte) || (g.items.find((x) => x.data && x.data.summary) || {}).data?.summary || "",
        score: outlets.length * 10 + g.items.length - Math.min(48, ageH) / 4 + (note ? 5 : 0) };
    }).filter((t) => t.outlets.length >= 2).sort((a, b) => b.score - a.score);

    // ---- barre de filtres
    const label = (iso) => (window.MASTER_MONDE_NAME ? window.MASTER_MONDE_NAME(iso) : iso.toUpperCase());
    const box = el("div", "suj");
    root.append(box);
    const bar = el("div", "suj-bar");
    const q = el("input", "suj-q"); q.type = "search"; q.placeholder = "Chercher un mot, un pays, une personne…"; q.value = st.q; q.setAttribute("aria-label", "Chercher");
    const sel = (opts, key, aria) => {
      const x = el("select"); x.setAttribute("aria-label", aria);
      for (const [v, l] of opts) { const o = el("option", null, l); o.value = v; o.selected = st[key] === v; x.append(o); }
      x.onchange = () => { st[key] = x.value; save(); draw(); };
      return x;
    };
    const ccount = {};
    for (const t of topics) for (const i of t.isos) ccount[i] = (ccount[i] || 0) + 1;
    const countryOpts = [["", "Tous les pays"], ...Object.entries(ccount).sort((a, b) => b[1] - a[1]).map(([i, n]) => [i, `${flagOf(i)} ${label(i)} · ${n}`])];
    if (st.country && !ccount[st.country]) st.country = "";
    const themeBar = el("div", "suj-themes");
    const detail = ui.seg([["resume", "Résumé"], ["complet", "Complet"]], st.detail, (v) => { st.detail = v; save(); draw(); }, "Détail");
    bar.append(q, sel(countryOpts, "country", "Pays"), sel(SIZES, "size", "Taille du sujet"), sel(PERIODS, "period", "Période"), detail, ...(seg ? [seg] : []));
    box.append(bar, themeBar);
    let timer = null;
    q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { st.q = q.value; draw(); }, 200); };
    const list = el("div", "suj-list");
    box.append(list);

    function visible(ignoreTheme) {
      const ws = (st.q || "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
      const since = st.period ? Date.now() - Number(st.period) * 36e5 : 0;
      return topics.filter((t) => (ignoreTheme || !st.theme || t.theme[0] === st.theme) && (!st.country || t.isos.includes(st.country))
        && t.outlets.length >= Number(st.size) && Date.parse(t.last) >= since
        && (!ws.length || ws.every((w) => `${t.title} ${t.items.map((x) => x.title).join(" ")} ${t.isos.map(label).join(" ")}`.toLowerCase().includes(w))));
    }

    function draw() {
      // thèmes, avec le nombre de sujets de chacun parmi les autres filtres
      const base = visible(true);
      themeBar.replaceChildren();
      const all = [["", "Tous", "acc"], ...THEMES.map(([k, l, tone]) => [k, l, tone]), ["societe", "Société", "mute"]];
      for (const [k, l, tone] of all) {
        const n = k ? base.filter((t) => t.theme[0] === k).length : base.length;
        const b = el("button", `suj-theme ${tone}`, `${l} ${n}`); b.type = "button"; b.setAttribute("aria-pressed", String(st.theme === k)); b.disabled = !n && !!k;
        b.onclick = () => { st.theme = st.theme === k ? "" : k; save(); draw(); };
        themeBar.append(b);
      }
      const shown = visible(false);
      list.replaceChildren();
      if (!shown.length) { list.append(el("p", "muted", "Aucun sujet pour ces filtres : élargir la période, la taille ou le pays.")); return; }
      list.append(el("p", "suj-count", `${shown.length} sujet${shown.length > 1 ? "s" : ""} · ${rss.length} titres lus · du plus repris au moins repris`));
      const hero = el("div", "suj-hero"), grid = el("div", "suj-grid");
      shown.slice(0, 3).forEach((t) => hero.append(card(t, true)));
      shown.slice(3, 90).forEach((t) => grid.append(card(t, false)));
      list.append(hero, grid);
    }

    function card(t, big) {
      const c = el("article", `suj-card${big ? " big" : ""}`);
      c.tabIndex = 0;
      const top = el("div", "suj-top");
      top.append(el("span", `suj-tag ${t.theme[2]}`, t.theme[1]),
        el("span", "suj-meta", `${t.outlets.length} médias · ${s.ago(t.last)}`));
      c.append(top);
      if (t.isos.length) {
        const fl = el("div", "suj-flags");
        for (const i of t.isos.slice(0, 6)) {
          const b = el("button", "suj-flag", `${flagOf(i)} ${label(i)}`); b.type = "button"; b.title = `Sujets sur : ${label(i)}`;
          b.onclick = (e) => { e.stopPropagation(); st.country = i; save(); draw(); list.scrollIntoView({ block: "start" }); };
          fl.append(b);
        }
        c.append(fl);
      }
      c.append(el("h2", null, t.title));
      if (st.detail === "complet" && t.nd.paragraphes && t.nd.paragraphes.length) {
        for (const p of t.nd.paragraphes) { const para = el("p", "suj-lead"); if (p.intertitre) para.append(el("b", null, `${p.intertitre} : `)); para.append(document.createTextNode(p.texte)); c.append(para); }
      } else if (t.lead) c.append(el("p", "suj-lead clamp", t.lead));
      const src = el("p", "suj-src");
      src.append(el("b", null, t.outlets.slice(0, 4).join(" · ")), document.createTextNode(t.outlets.length > 4 ? ` et ${t.outlets.length - 4} autres` : ""));
      c.append(src);
      const act = el("div", "suj-act");
      const read = el("button", "suj-btn", "Lire le sujet"); read.type = "button";
      const ai = el("button", "suj-btn ia", "✦ Expliquer avec Maestro"); ai.type = "button";
      read.onclick = (e) => { e.stopPropagation(); openReader(t); };
      ai.onclick = (e) => { e.stopPropagation(); askMaestro(`Explique-moi ce sujet d'actualité simplement : « ${t.title} ». Quel est le contexte, qui sont les acteurs, pourquoi c'est important et quelles suites possibles ? Dépêches :\n${brief(t)}`); };
      act.append(read, ai);
      if (t.note) act.append(el("span", "suj-written", "récit rédigé"));
      c.append(act);
      c.onclick = () => openReader(t);
      c.onkeydown = (e) => { if (e.key === "Enter") openReader(t); };
      return c;
    }

    // ---- lecture complète d'un sujet, par-dessus la page
    function openReader(t) {
      const ov = el("div", "suj-reader");
      const panel = el("div", "suj-panel");
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", t.title);
      const close = el("button", "suj-close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer");
      const shut = () => { ov.remove(); document.removeEventListener("keydown", esc); };
      const esc = (e) => { if (e.key === "Escape") shut(); };
      close.onclick = shut; ov.onclick = (e) => { if (e.target === ov) shut(); };
      document.addEventListener("keydown", esc);
      panel.append(close);
      const top = el("div", "suj-top");
      top.append(el("span", `suj-tag ${t.theme[2]}`, t.theme[1]), el("span", "suj-meta", `${t.nd.lieu ? `${t.nd.lieu} · ` : ""}${t.outlets.length} médias · ${t.items.length} dépêches · du ${s.dayShort(t.first)} ${s.hm(t.first)} au ${s.dayShort(t.last)} ${s.hm(t.last)} UTC`));
      panel.append(top, el("h1", null, t.title));
      if (t.nd.paragraphes && t.nd.paragraphes.length) {
        for (const p of t.nd.paragraphes) { const para = el("p", "suj-body"); if (p.intertitre) para.append(el("b", null, `${p.intertitre} : `)); para.append(document.createTextNode(p.texte)); panel.append(para); }
        if ((t.nd.impact || []).length) {
          panel.append(el("h3", null, "Impact probable, pays par pays"));
          const tb = el("div", "suj-impact");
          const EFF = { negatif: ["▼ négatif", "down"], mixte: ["◆ mixte", "mute"], positif: ["▲ positif", "up"] };
          for (const i of t.nd.impact) {
            const r = el("div", "suj-imp-row");
            const b = el("button", "suj-flag", `${flagOf(i.pays)} ${label(i.pays)}`); b.type = "button";
            b.onclick = () => { shut(); st.country = i.pays; save(); draw(); };
            r.append(b, el("span", `suj-eff ${(EFF[i.effet] || ["", ""])[1]}`, (EFF[i.effet] || [i.effet])[0]), el("span", "suj-why", i.pourquoi || ""));
            tb.append(r);
          }
          panel.append(tb);
        }
        if (t.note.coherence === "incoherente") panel.append(el("p", "suj-warn", `Contrôle automatique : ${(t.note.issues || []).join(" ; ")}`));
        panel.append(el("p", "suj-ai", t.nd.disclaimer || "Recherche automatisée par modèles d'IA ; à vérifier ; pas un conseil en investissement."));
      } else {
        const p = el("p", "suj-body");
        p.append(el("b", null, "Pas encore de récit rédigé : "), document.createTextNode("le modèle rédige les sujets nouveaux toutes les 2 h. Les dépêches ci-dessous racontent le sujet ; Maestro peut l'expliquer tout de suite."));
        panel.append(p);
      }
      // chaîne d'événements (l'« Event Nexus » de SitDeck) : sujets liés (mêmes pays, mots communs), avant et après
      const kw = new Set([...t.items.flatMap((x) => [...(x._w || [])])]);
      const related = topics.filter((o) => o !== t && o.isos.some((i) => t.isos.includes(i))
        && [...new Set(o.items.flatMap((x) => [...(x._w || [])]))].filter((w) => kw.has(w)).length >= 2);
      if (related.length) {
        panel.append(el("h3", null, "La chaîne : ce qui précède et ce qui suit"));
        const chain = el("ol", "suj-chain");
        const all = [...related, t].sort((a, b) => (a.first < b.first ? -1 : 1));
        for (const o of all.slice(-9)) {
          const li = el(o === t ? "li" : "li", o === t ? "here" : "");
          const b = el(o === t ? "span" : "button", "suj-chain-b"); if (o !== t) { b.type = "button"; b.onclick = () => { shut(); openReader(o); }; }
          b.append(el("span", "suj-tl-h", `${s.dayShort(o.first)} ${s.hm(o.first)}`), el("b", null, o === t ? `▶ ${o.title}` : o.title), el("span", "suj-meta", `${o.outlets.length} médias`));
          li.append(b); chain.append(li);
        }
        panel.append(chain);
      }
      // demander à Maestro
      panel.append(el("h3", null, "Demander à Maestro"));
      const asks = el("div", "suj-asks");
      const ctx = `Sujet : « ${t.title} ». Dépêches :\n${brief(t)}`;
      for (const [l, qq] of [["Explique-moi simplement", "Explique-moi simplement ce sujet : ce qui s'est passé et pourquoi c'est important."],
        ["Le contexte et l'histoire", "Quel est le contexte historique et politique de ce sujet ?"], ["Qui sont les acteurs ?", "Qui sont les acteurs de ce sujet et que veulent-ils ?"],
        ["Et pour les marchés ?", "Quelles conséquences possibles pour les marchés (pétrole, devises, actions concernées), en restant prudent ?"],
        ["Et pour Ormuz ?", "Ce sujet a-t-il un lien avec le détroit d'Ormuz ou l'énergie ? Vérifie dans les données du portail."],
        ["Retracer la chaîne", "Retrace la chaîne cause → effet de ce sujet avec l'outil nexus : ce qui l'a précédé, ce qui a suivi, les acteurs qui reviennent."]]) {
        const b = el("button", "suj-btn ia", `✦ ${l}`); b.type = "button";
        b.onclick = () => { shut(); askMaestro(`${qq}\n\n${ctx}`); };
        asks.append(b);
      }
      panel.append(asks);
      // chronologie de toutes les dépêches
      panel.append(el("h3", null, `Toutes les dépêches · ${t.items.length}`));
      const tl = el("ol", "suj-tl");
      for (const x of t.items.slice().sort((a, b) => (a.time < b.time ? -1 : 1))) {
        const li = el("li");
        const url = s.safeUrl(x.url);
        const a = el(url ? "a" : "span", "suj-tl-t", x.title);
        if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
        li.append(el("span", "suj-tl-h", `${s.dayShort(x.time)} ${s.hm(x.time)}`), el("b", null, x.source), a, badge(x.level || "non_confirme"));
        tl.append(li);
      }
      panel.append(tl, el("p", "muted", "Regroupement automatique par mots communs dans les titres : deux sujets voisins peuvent être réunis par erreur. Les liens ouvrent l'article d'origine."));
      ov.append(panel);
      box.append(ov);
      close.focus();
    }

    draw();
  }

  window.MASTER_SUJETS = viewSujets;
})();
