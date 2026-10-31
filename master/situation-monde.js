/* Master — rubrique Situation, mode « Monde » : notre version d'insidegeopolitics.com (mêmes écrans, mêmes fonctions).
 *
 * Mise en page et fonctionnement reproduits : suivi en direct d'un conflit à gauche, bande des développements clés,
 * globe 3D au centre (pays sélectionné rempli, calques, visite guidée), à droite les onglets « Derniers événements »,
 * « Profil du pays » et « Conflits armés », bandeau de dépêches en bas. Le code est le nôtre et les données viennent de
 * sources ouvertes (vendor/world/, PROVENANCE-*.md) et des titres collectés par le Master : rien n'est repris de ce site,
 * dont les contenus ne sont pas sous licence. Tout texte de données passe par textContent ; liens http(s) seulement.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const S = () => window.MASTER_SITUATION;
  const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Chemin des fichiers calculé à l'appel : dans la version en ligne, static.js se déclare après ce script.
  const base = () => (window.MASTER_STATIC ? "" : "/assets/");
  const nfi = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
  const flag = (iso2) => (iso2 && /^[a-z]{2}$/.test(iso2) ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
  const coord = (lon, lat) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "O"}`;

  async function getJSON(path) {
    const r = await fetch(base() + path, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`${path} : ${r.status}`);
    return r.json();
  }
  let WORLD = null;
  async function loadWorld() {
    if (WORLD) return WORLD;
    const opt = (p) => getJSON(p).catch(() => null);  // un jeu absent ne bloque pas les autres
    const [topo, lanes, conflicts, points, countries, bases, nuclear] = await Promise.all([
      getJSON("vendor/geo/countries-50m.json"), opt("vendor/world/shipping-lanes.json"), opt("vendor/world/conflicts.json"),
      opt("vendor/world/conflict-points.json"), opt("vendor/world/countries.json"), opt("vendor/world/bases.json"), opt("vendor/world/nuclear.json")]);
    // Codes pays en minuscules partout (les jeux pays les donnent en majuscules, les conflits en minuscules).
    const lo = (x) => (typeof x === "string" ? x.toLowerCase() : x);
    for (const c of Object.values((countries && (countries.countries || countries)) || {})) {
      if (!c || !c.iso2) continue;
      c.iso2 = lo(c.iso2);
      for (const k of ["un_vote_partners", "un_vote_adversaries"]) c[k] = (c[k] || []).map(lo);
      for (const k of ["export_partners", "import_partners"]) c[k] = (c[k] || []).map((x) => (Array.isArray(x) ? [lo(x[0]), x[1]] : lo(x)));
    }
    for (const b of (bases && (bases.bases || bases)) || []) { b.operator = lo(b.operator); b.host = lo(b.host); }
    for (const n of (nuclear && (nuclear.states || nuclear)) || []) n.iso2 = lo(n.iso2);
    const features = topojson.feature(topo, topo.objects.countries).features;
    const borders = topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b);
    const byIso = {}, idToIso = {};
    for (const [id, c] of Object.entries((countries && (countries.countries || countries)) || {})) {
      if (c && c.iso2) { byIso[c.iso2] = { ...c, id }; idToIso[String(Number(id))] = c.iso2; idToIso[id] = c.iso2; }
    }
    const featByIso = {};
    for (const f of features) { const iso = idToIso[String(f.id)] || idToIso[String(Number(f.id))]; if (iso) featByIso[iso] = f; }
    WORLD = { features, borders, lanes, conflicts: (conflicts && (conflicts.conflicts || conflicts)) || [],
      points: (points && (points.points || points)) || [], countries: byIso, featByIso,
      bases: (bases && (bases.bases || bases)) || [], nuclear: (nuclear && (nuclear.states || nuclear)) || [] };
    return WORLD;
  }
  const nameOf = (iso) => (WORLD && WORLD.countries[iso] && WORLD.countries[iso].name_fr)
    || (WORLD && WORLD.featByIso[iso] && WORLD.featByIso[iso].properties.name) || (iso || "").toUpperCase();

  // Noms à chercher dans les titres (anglais surtout) pour relier une dépêche à un pays.
  const ALIASES = {
    ua: ["Ukraine", "Ukrainian", "Kyiv", "Kiev", "Zelensky"], ru: ["Russia", "Russian", "Moscow", "Kremlin", "Putin", "Russie"],
    il: ["Israel", "Israeli", "IDF", "Netanyahu", "Israël"], ps: ["Gaza", "Palestinian", "Hamas", "West Bank", "Cisjordanie"],
    lb: ["Lebanon", "Lebanese", "Hezbollah", "Beirut", "Liban"], ir: ["Iran", "Iranian", "Tehran", "IRGC", "Téhéran"],
    ye: ["Yemen", "Yemeni", "Houthi", "Houthis", "Sanaa", "Taiz", "Yémen"], sd: ["Sudan", "Sudanese", "RSF", "Khartoum", "Darfur", "El Fasher", "Soudan"],
    ss: ["South Sudan"], mm: ["Myanmar", "Burma", "Burmese", "Birmanie"], cd: ["Congo", "DRC", "Kinshasa", "M23", "Goma", "RDC"],
    sy: ["Syria", "Syrian", "Damascus", "Syrie"], so: ["Somalia", "Somali", "Shabaab", "Mogadishu", "Somalie"], ml: ["Mali", "Malian", "Bamako"],
    bf: ["Burkina"], ne: ["Niger", "Nigerien", "Niamey"], ng: ["Nigeria", "Nigerian", "Boko Haram"],
    et: ["Ethiopia", "Ethiopian", "Amhara", "Tigray", "Éthiopie"], pk: ["Pakistan", "Pakistani", "Islamabad"], af: ["Afghanistan", "Afghan", "Taliban", "Kabul"],
    in: ["India", "Indian", "New Delhi", "Modi", "Inde"], us: ["United States", "U.S.", "US", "Washington", "Pentagon", "Trump", "Rubio", "États-Unis"],
    sa: ["Saudi", "Riyadh", "Arabie"], iq: ["Iraq", "Iraqi", "Baghdad", "Irak"], mx: ["Mexico", "Mexican", "Mexique"], co: ["Colombia", "Colombian", "Colombie"],
    ht: ["Haiti", "Haitian", "Haïti"], ve: ["Venezuela", "Venezuelan", "Caracas", "Maduro"], cu: ["Cuba", "Cuban", "Havana"],
    cn: ["China", "Chinese", "Beijing", "Xi Jinping", "Chine", "Pékin"], tw: ["Taiwan", "Taiwanese", "Taipei"], kp: ["North Korea", "Pyongyang", "Kim Jong"],
    kr: ["South Korea", "Seoul"], jp: ["Japan", "Japanese", "Tokyo", "Japon"], tr: ["Turkey", "Türkiye", "Turkish", "Ankara", "Erdogan", "Turquie"],
    fr: ["France", "French", "Paris", "Macron"], gb: ["Britain", "British", "UK", "London", "Starmer", "Royaume-Uni"], de: ["Germany", "German", "Berlin", "Allemagne"],
    eg: ["Egypt", "Egyptian", "Cairo", "Égypte"], jo: ["Jordan", "Jordanian", "Amman", "Jordanie"], ae: ["UAE", "Emirati", "Abu Dhabi", "Dubai"],
    qa: ["Qatar", "Qatari", "Doha"], om: ["Oman", "Omani", "Muscat"], ly: ["Libya", "Libyan", "Tripoli", "Libye"], ro: ["Romania", "Romanian", "Roumanie"],
    pl: ["Poland", "Polish", "Warsaw", "Pologne"], th: ["Thailand", "Thai", "Bangkok"], ph: ["Philippines", "Filipino", "Manila"],
    mz: ["Mozambique", "Cabo Delgado"], cm: ["Cameroon", "Cameroonian", "Cameroun"], td: ["Chad", "Chadian", "Tchad"], ec: ["Ecuador", "Ecuadorian", "Équateur"],
    bd: ["Bangladesh", "Bangladeshi"], ar: ["Argentina", "Argentine"], br: ["Brazil", "Brazilian", "Brésil"], by: ["Belarus", "Belarusian", "Minsk", "Biélorussie"],
    no: ["Norway", "Norwegian", "Norvège"], kz: ["Kazakhstan"], az: ["Azerbaijan", "Azerbaïdjan"], am: ["Armenia", "Arménie"],
  };
  const rxCache = {};
  function countryRx(iso) {
    if (rxCache[iso] !== undefined) return rxCache[iso];
    const names = [...(ALIASES[iso] || [])];
    const f = WORLD && WORLD.featByIso[iso];
    if (f && f.properties && f.properties.name) names.push(f.properties.name);
    if (WORLD && WORLD.countries[iso] && WORLD.countries[iso].name_fr) names.push(WORLD.countries[iso].name_fr);
    const esc = [...new Set(names)].filter((n) => n && n.length > 1).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    rxCache[iso] = esc.length ? new RegExp(`(^|[^A-Za-zÀ-ÿ])(${esc.join("|")})($|[^A-Za-zÀ-ÿ])`) : null;
    return rxCache[iso];
  }
  function countriesIn(text) {
    const out = [];
    const keys = new Set([...Object.keys(ALIASES), ...Object.keys((WORLD && WORLD.countries) || {})]);
    for (const iso of keys) { const rx = countryRx(iso); if (rx && rx.test(text)) out.push(iso); }
    return out;
  }
  // Catégorie d'une dépêche (comme « Escalation » / « Development ») : mots du titre, en anglais et en français.
  const ESC = /\b(attack|attacks|strike|strikes|struck|killed|kills|dead|deaths|missile|missiles|drone|drones|shelling|clash|clashes|bomb|bombing|offensive|raid|explosion|explosions|shot down|airstrike|troops|invasion|escalat\w*|fighting|siege|frappe\w*|attaque\w*|tués?|morts?|bombard\w*|explosion\w*|abattu|combats?)\b/i;
  const DIP = /\b(talks|deal|agreement|ceasefire|truce|summit|negotiat\w*|meets|meeting|visit|sanction\w*|envoy|treaty|accord|négoci\w*|cessez-le-feu|trêve|sommet|rencontre|émissaire)\b/i;
  function category(e) {
    if (e.kind && e.kind !== "headline") return S().tagOf(e) || ["Ormuz", "acc"];
    if (ESC.test(e.title)) return ["Escalade", "hot"];
    if (DIP.test(e.title)) return ["Diplomatie", "talk"];
    return ["Développement", "acc"];
  }
  const sourceName = (e) => (e.source || "").replace(/ \(Telegram\)| \(OSINT automatisé\)/, "");

  // ------------------------------------------------------------ état mémorisé
  const LAYERS = [
    ["conflits", "Conflits armés", true], ["routes", "Routes maritimes", true], ["partenaires", "Partenaires", false],
    ["adversaires", "Adversaires", false], ["exports", "Clients (exportations)", false], ["imports", "Fournisseurs (importations)", false],
    ["bases", "Bases à l'étranger", false], ["nucleaire", "Portée nucléaire", false],
    // couches en direct (couches.js, /api/layers)
    ["catastrophes", "Catastrophes (GDACS)", true], ["seismes", "Séismes M4,5+", false], ["nature", "Feux, tempêtes, volcans", false],
    ["avions-militaires", "Avions militaires", false], ["cables", "Câbles sous-marins", false],
  ];
  const LIVE_IDS = ["catastrophes", "seismes", "nature", "avions-militaires", "cables"];
  const COLORS = { partenaires: "#4cc38a", adversaires: "#e5484d", exports: "#93b4f0", imports: "#f0a35e", sel: "#e9d24a" };
  const state = { layers: Object.fromEntries(LAYERS.map(([k, , on]) => [k, on])), style: "retro", sel: null, tracked: 0, tour: true, tab: "events", intro: false };
  try {  // calques mémorisés fusionnés avec les défauts : un nouveau calque garde sa valeur par défaut
    const saved = JSON.parse(localStorage.getItem("master-monde") || "{}");
    Object.assign(state, saved, { layers: { ...state.layers, ...(saved.layers || {}) } });
  } catch { /* défauts */ }
  const save = () => { try { localStorage.setItem("master-monde", JSON.stringify({ layers: state.layers, style: state.style, intro: state.intro })); } catch { /* non mémorisé */ } };

  // ------------------------------------------------------------ vue
  async function viewMonde(root, sit) {
    const ui = U(), s = S();
    const { el, api, badge, nf2 } = ui;
    const box = el("div", "sit sit-monde");
    root.append(box);

    // Barre du haut : rubrique, modes, visite guidée, style, plein écran, zoom, images/s, heure
    const top = el("div", "sit-top");
    const brand = el("div", "sit-brand");
    brand.append(el("span", "sit-kicker", "[ SITUATION ]"), el("span", "sit-sub", "Le monde en direct"));
    const tour = el("div", "sit-tour");
    const prev = el("button", "sit-ghost", "‹"), play = el("button", "sit-ghost sit-play"), next = el("button", "sit-ghost", "›");
    for (const b of [prev, play, next]) b.type = "button";
    prev.setAttribute("aria-label", "Conflit précédent"); next.setAttribute("aria-label", "Conflit suivant");
    tour.append(prev, play, next);
    const tools = el("div", "sit-tools");
    const styles = el("div", "sit-modes");
    for (const [k, l] of [["retro", "Rétro"], ["nuit", "Nuit"], ["jour", "Jour"]]) {
      const b = el("button", "sit-ghost", l); b.type = "button"; b.setAttribute("aria-pressed", String(state.style === k));
      b.onclick = () => { state.style = k; save(); for (const x of styles.children) x.setAttribute("aria-pressed", String(x === b)); if (globe) globe.setStyle(k); };
      styles.append(b);
    }
    const tool = (txt, label, fn) => { const b = el("button", "sit-ghost sit-icon", txt); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.onclick = fn; return b; };
    const fpsEl = el("span", "sit-fps", "— IMG/S");
    tools.append(styles,
      tool("⛶", "Plein écran", () => { if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen(); }),
      tool("+", "Zoomer", () => globe && globe.zoomBy(1.25)), tool("−", "Dézoomer", () => globe && globe.zoomBy(0.8)), fpsEl);
    const clock = el("div", "sit-clock");
    let globe = null, draw = null;
    const tick = () => { clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`; if (globe) fpsEl.textContent = `${globe.fps} IMG/S`; };
    tick();
    sit.timer = setInterval(() => { if (!box.isConnected) { clearInterval(sit.timer); return; } tick(); }, 1000);
    top.append(brand, s.modeSwitch(el), tour, tools, clock);
    box.append(top);

    const [W, press, hormuz] = await Promise.all([loadWorld(),
      api("/api/events?theme=actualite&limit=500").catch(() => []), api("/api/events?theme=hormuz&limit=60").catch(() => [])]);
    const byTime = (a, b) => (a.time < b.time ? 1 : -1);
    const news = press.slice().sort(byTime);
    for (const e of news) e._iso = countriesIn(`${e.title} ${(e.data && e.data.summary) || ""}`);
    for (const e of hormuz) e._iso = [];
    const conflicts = W.conflicts.slice().sort((a, b) => (b.deaths_12m || 0) - (a.deaths_12m || 0));

    const left = el("aside", "sit-left");
    const strip = el("div", "sit-strip");
    const stage = el("div", "sit-stage");
    const right = el("aside", "sit-right sit-tabs");
    box.append(left, strip, stage, right);

    // ---- colonne de gauche : suivi en direct du conflit choisi
    let shown = 6;
    // Dépêches d'un conflit : elles citent son pays principal, ou au moins deux de ses pays (un titre sur la politique
    // intérieure américaine ne concerne pas pour autant chaque conflit où les États-Unis sont partie).
    const updatesOf = (c) => {
      const isos = c ? c.countries || [] : [];
      return news.filter((e) => e._iso.includes(isos[0]) || e._iso.filter((i) => isos.includes(i)).length >= 2);
    };
    function renderTracked() {
      left.replaceChildren();
      const c = conflicts[state.tracked];
      if (!c) { left.append(el("span", "sit-mono sit-dim", "DONNÉES DE CONFLITS INDISPONIBLES")); return; }
      const row = el("div", "sit-row");
      const prof = el("button", "sit-link sit-linkbtn", "PROFIL DU CONFLIT →"); prof.type = "button"; prof.onclick = () => openProfile(c);
      row.append(el("span", "sit-live", "● SUIVI EN DIRECT"), prof);
      const title = el("h1", "sit-title");
      title.append(document.createTextNode("Mises à jour en direct : "), el("em", null, c.name_fr || "—"));
      left.append(row, title);
      const ups = updatesOf(c);
      // chiffres du conflit : chacun ouvre le profil ; les pays ouvrent leur fiche
      const chips = el("div", "sit-chips");
      for (const i of (c.countries || []).slice(0, 6)) {
        const b = el("button", "sit-chip", `${flag(i)} ${nameOf(i)}`); b.type = "button"; b.title = "Profil du pays";
        b.onclick = () => { stopTour(); selectCountry(i, true); };
        chips.append(b);
      }
      left.append(chips);
      const facts = el("div", "sit-facts");
      const fact = (k, v, sub) => { const d = el("button", "dt-fact"); d.type = "button"; d.title = "Profil du conflit";
        d.append(el("span", "sit-mono sit-dim", k), el("b", null, v)); if (sub) d.append(el("span", "sit-mono sit-dim", sub));
        d.onclick = () => { stopTour(); openProfile(c); }; facts.append(d); };
      const rank = conflicts.indexOf(c) + 1;
      fact("MORTS · 12 MOIS", nfi.format(c.deaths_12m || 0), `${rank}E CONFLIT SUR ${conflicts.length}`);
      const disp = c.displaced ? (c.displaced.refugees || 0) + (c.displaced.idps || 0) : 0;
      fact("DÉPLACÉS", disp ? compact.format(disp) : "—", c.displaced && c.displaced.year ? `UNHCR ${c.displaced.year}` : "UNHCR");
      fact("DÉBUT", c.start ? String(c.start) : "—", (c.type || "").toUpperCase());
      fact("DÉPÊCHES", nfi.format(ups.length), "CITENT SES PAYS");
      left.append(facts);
      const months = (c.deaths_by_month || []).slice(-12);
      if (months.length) {
        const max = Math.max(1, ...months.map((m) => m[1]));
        const chart = el("div", "sit-bars dt-click"); chart.title = "Profil du conflit";
        for (const [m, n] of months) { const b = el("i"); b.style.height = `${Math.max(2, (n / max) * 100)}%`; b.title = `${m} : ${nfi.format(n)} morts`; chart.append(b); }
        chart.onclick = () => { stopTour(); openProfile(c); };
        left.append(el("span", "sit-mono sit-dim", "MORTS PAR MOIS · 12 MOIS · UCDP"), chart);
      }
      const uh = el("div", "sit-row");
      uh.append(el("span", "sit-mono sit-acc", `● MISES À JOUR · ${ups.length}`));
      left.append(uh);
      const list = el("ol", "sit-list");
      for (const e of ups.slice(0, shown)) {
        const li = el("li");
        const meta = el("div", "sit-meta");
        const today = Date.now() - Date.parse(e.time) < 864e5;
        meta.append(el("span", null, `${today ? "Aujourd'hui" : s.dayShort(e.time)} · ${s.hm(e.time)} UTC`));
        const [cat, tone] = category(e);
        if (tone === "hot") meta.append(el("span", "sit-esc", `▲ ${cat.toUpperCase()}`));
        const url = s.safeUrl(e.url);
        if (url) { const a = el("a", "sit-src", "SOURCE ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.append(a); }
        const p = el("p");
        if (e._iso.length) p.append(el("span", "sit-fl", e._iso.slice(0, 3).map(flag).join("")), document.createTextNode(" "));
        p.append(document.createTextNode(e.title));
        li.append(meta, p);
        li.tabIndex = 0; li.onclick = (ev) => { if (!ev.target.closest("a")) ui.openEvent(e); };
        li.onkeydown = (ev) => { if (ev.key === "Enter") ui.openEvent(e); };
        list.append(li);
      }
      if (!ups.length) list.append(el("li", "sit-dim", "Aucune dépêche récente ne cite les pays de ce conflit (presse collectée toutes les 20 min)."));
      if (ups.length > shown) {
        const more = el("button", "sit-more", `AFFICHER ${ups.length - shown} MISES À JOUR PLUS ANCIENNES`);
        more.type = "button"; more.onclick = () => { shown = ups.length; renderTracked(); };
        list.append(more);
      }
      left.append(list);
      const ft = el("div", "sit-foot-left");
      ft.append(el("span", "sit-mono sit-dim", `DERNIER ÉVÉNEMENT UCDP · ${c.last_event ? s.dayShort(c.last_event) : "—"}`),
        el("span", "sit-mono sit-acc", `MIS À JOUR · ${news[0] ? `${s.dayShort(news[0].time)} · ${s.hm(news[0].time)}` : "—"}`));
      left.append(ft);
    }

    // ---- profil du conflit (fenêtre au-dessus du globe)
    const profile = el("div", "g3-profile"); profile.hidden = true;
    function openProfile(c) {
      profile.replaceChildren(); profile.hidden = false;
      const close = el("button", "g3-close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer le profil");
      close.onclick = () => { profile.hidden = true; };
      profile.append(close, el("span", "sit-mono sit-acc", `PROFIL DU CONFLIT · ${conflicts.indexOf(c) + 1}E SUR ${conflicts.length} PAR NOMBRE DE MORTS`), el("h2", null, c.name_fr || ""));
      const pc = el("div", "sit-chips");
      for (const i of c.countries || []) {
        const n = news.filter((e) => e._iso.includes(i)).length;
        const b = el("button", "sit-chip", `${flag(i)} ${nameOf(i)}${n ? ` · ${n} dépêches` : ""}`); b.type = "button"; b.title = "Profil du pays";
        b.onclick = () => { profile.hidden = true; stopTour(); selectCountry(i, true); };
        pc.append(b);
      }
      profile.append(pc);
      const facts = el("div", "sit-facts");
      const fact = (k, v) => { const d = el("div"); d.append(el("span", "sit-mono sit-dim", k), el("b", null, v)); facts.append(d); };
      fact("MORTS · 12 MOIS", c.deaths_12m != null ? nfi.format(c.deaths_12m) : "—");
      if (c.deaths_12m_provisional) fact("DONT PROVISOIRES", nfi.format(c.deaths_12m_provisional));
      if (c.displaced && (c.displaced.refugees || c.displaced.idps)) {
        fact(`RÉFUGIÉS · ${c.displaced.year || ""}`, compact.format(c.displaced.refugees || 0));
        fact(`DÉPLACÉS INTERNES · ${c.displaced.year || ""}`, compact.format(c.displaced.idps || 0));
      }
      fact("DÉBUT", c.start ? (c.episode_start && c.episode_start !== c.start ? `${c.start} (épisode ${c.episode_start})` : String(c.start)) : "—");
      fact("TYPE", c.type || "—");
      profile.append(facts);
      const months = (c.deaths_by_month || []).slice(-24);
      if (months.length) {
        const max = Math.max(1, ...months.map((m) => m[1]));
        const chart = el("div", "sit-bars");
        chart.setAttribute("role", "img"); chart.setAttribute("aria-label", "Morts par mois, 24 derniers mois (UCDP)");
        for (const [m, n] of months) { const b = el("i"); b.style.height = `${Math.max(2, (n / max) * 100)}%`; b.title = `${m} : ${nfi.format(n)} morts`; chart.append(b); }
        const axis = el("div", "sit-row"); axis.append(el("span", "sit-mono sit-dim", months[0][0]), el("span", "sit-mono sit-dim", months[months.length - 1][0]));
        profile.append(el("span", "sit-mono sit-dim", "MORTS PAR MOIS · UCDP"), chart, axis);
      }
      const byType = Object.entries(c.deaths_12m_by_type || {}).filter(([, n]) => n);
      if (byType.length > 1) {
        const tot = byType.reduce((a, [, n]) => a + n, 0);
        profile.append(el("span", "sit-mono sit-dim", "MORTS PAR TYPE DE VIOLENCE · 12 MOIS"));
        for (const [k, n] of byType.sort((a, b) => b[1] - a[1])) {
          const r = el("div", "sit-row"); r.append(el("span", null, k), el("span", "sit-mono", `${nfi.format(n)} · ${Math.round((n / tot) * 100)} %`));
          const bar = el("i", "sit-confbar"); bar.style.width = `${Math.max(2, (n / tot) * 100)}%`;
          profile.append(r, bar);
        }
      }
      if (c.sides && (c.sides.a || c.sides.b)) {
        const sides = el("p", "sit-sides");
        sides.append(el("b", null, (c.sides.a || []).join(", ") || "—"), document.createTextNode("  contre  "), el("b", null, (c.sides.b || []).join(", ") || "—"));
        profile.append(el("span", "sit-mono sit-dim", "BELLIGÉRANTS (UCDP)"), sides);
      }
      if (c.summary_fr) {
        profile.append(el("p", "sit-summary", c.summary_fr));
        const src = s.safeUrl(c.summary_source);
        if (src) { const a = el("a", "sit-src", "WIKIPÉDIA · CC BY-SA 4.0 ↗"); a.href = src; a.target = "_blank"; a.rel = "noopener noreferrer"; profile.append(a); }
      }
      const srcs = el("div", "g3-srcs");
      for (const u of (c.sources || []).slice(0, 6)) {
        const url = s.safeUrl(u); if (!url) continue;
        const a = el("a", "sit-src", new URL(url).hostname.replace("www.", "")); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; srcs.append(a);
      }
      profile.append(el("span", "sit-mono sit-dim", "SOURCES"), srcs,
        el("p", "g3-note", "UCDP (Uppsala, CC BY 4.0) : morts estimées, données des derniers mois provisoires ; UNHCR : réfugiés et déplacés par pays d'origine."));
    }

    // ---- bande des développements clés (sujets repris par au moins deux médias)
    const keys = news.filter((e) => e.level === "probable" && !s.isOsint(e)).slice(0, 18);
    strip.append(el("span", "sit-vlabel", "DÉVELOPPEMENTS CLÉS"));
    const ticks = el("div", "sit-ticks");
    for (const e of keys) {
      const t = el("button", `sit-tick ${category(e)[1]}`); t.type = "button"; t.title = `${s.dayShort(e.time)} · ${e.title}`;
      t.onclick = () => { stopTour(); const iso = e._iso[0]; if (iso) selectCountry(iso, true); ui.openEvent(e); };
      ticks.append(t);
    }
    strip.append(ticks);

    // ---- colonne de droite : onglets verticaux
    const tabs = el("div", "sit-vtabs");
    const pane = el("div", "sit-pane");
    right.append(tabs, pane);
    const TABS = [["events", "DERNIERS ÉVÉNEMENTS"], ["country", "PROFIL DU PAYS"], ["conflicts", "CONFLITS ARMÉS"], ["stats", "STATS"]];
    function setTab(k) {
      state.tab = k;
      for (const b of tabs.children) b.setAttribute("aria-pressed", String(b.dataset.tab === k));
      pane.replaceChildren();
      if (k === "events") renderEvents(); else if (k === "country") renderCountry(); else if (k === "stats") renderStats(); else renderConflicts();
    }
    for (const [k, l] of TABS) { const b = el("button", "sit-vtab", l); b.type = "button"; b.dataset.tab = k; b.onclick = () => setTab(k); tabs.append(b); }

    // Portée du fil : le monde entier, ou le pays choisi (toutes rubriques, tous journaux).
    let scope = "monde", rub = "";
    const RUB = [["", "Tout"], ["politique", "Politique"], ["economie", "Économie"], ["securite", "Sécurité"], ["diplomatie", "Diplomatie"], ["societe", "Société"]];
    const RUB_TONE = { politique: "talk", economie: "cool", securite: "hot", diplomatie: "acc", societe: "mute" };
    const countryCache = {};
    async function countryNews(iso) {
      if (countryCache[iso]) return countryCache[iso];
      let data = null;
      // version en ligne : fil publié pour les pays les plus suivis (relu toutes les 3 h au plus)
      data = await api(`/api/news/country/${iso}`).catch(() => null);
      // plus les titres déjà collectés qui citent le pays dans leur titre (un extrait qui mentionne Paris en passant ne
      // fait pas d'un article sur Londres une nouvelle de France)
      const local = news.filter((e) => (e._isoT || (e._isoT = countriesIn(e.title))).includes(iso)).map((e) => ({ title: e.title, url: e.url, time: e.time, source: sourceName(e),
        summary: (e.data && e.data.summary) || "", rubrique: rubOf(e.title) }));
      const seen = new Set(), items = [];
      for (const x of [...((data && data.items) || []), ...local]) {
        const k = (x.url || "").split("?")[0], t = (x.title || "").toLowerCase().replace(/\W+/g, " ").trim();
        if (!k || seen.has(k) || seen.has(t)) continue;
        seen.add(k); seen.add(t); items.push(x);
      }
      items.sort((a, b) => (a.time < b.time ? 1 : -1));
      const per = {};
      for (const x of items) per[x.source] = (per[x.source] || 0) + 1;
      countryCache[iso] = { items, sources: Object.entries(per).sort((a, b) => b[1] - a[1]), live: !!data, fetched: data && data.fetched_at };
      return countryCache[iso];
    }
    function rubOf(text) {  // même classement que le serveur, pour les titres déjà collectés
      if (ESC.test(text)) return "securite";
      if (DIP.test(text)) return "diplomatie";
      if (/\b(econom|économ|inflation|oil|pétrole|trade|commerce|market|marché|bank|banque|budget|tariff|export|import|prix|price)/i.test(text)) return "economie";
      if (/\b(election|élection|president|présiden|minister|ministre|parliament|parlement|government|gouvernement|party|parti|vote)/i.test(text)) return "politique";
      return "societe";
    }
    function scopeBar() {
      const bar = el("div", "sit-scope");
      bar.dataset.scope = "1";
      const mk = (k, label) => { const b = el("button", "sit-ghost", label); b.type = "button"; b.setAttribute("aria-pressed", String(scope === k));
        b.onclick = () => { scope = k; rub = ""; setTab("events"); }; return b; };
      bar.append(mk("monde", "🌐 MONDE"));
      if (state.sel) bar.append(mk("pays", `${flag(state.sel)} ${nameOf(state.sel).toUpperCase()}`));
      else bar.append(el("span", "sit-mono sit-dim", "CLIQUER UN PAYS POUR SON FIL"));
      return bar;
    }
    async function renderCountryFeed(feed) {
      const iso = state.sel;
      feed.append(el("p", "sit-mono sit-dim", "LECTURE DES JOURNAUX…"));
      const data = await countryNews(iso);
      if (state.sel !== iso || scope !== "pays") return;
      feed.replaceChildren();
      const counts = {};
      for (const x of data.items) counts[x.rubrique] = (counts[x.rubrique] || 0) + 1;
      const chips = el("div", "sit-rubs");
      for (const [k, label] of RUB) {
        const n = k ? counts[k] || 0 : data.items.length;
        const b = el("button", `sit-rub ${RUB_TONE[k] || ""}`, `${label} ${n}`); b.type = "button";
        b.setAttribute("aria-pressed", String(rub === k)); b.disabled = !n && !!k;
        b.onclick = () => { rub = k; feed.replaceChildren(); renderCountryFeed(feed); };
        chips.append(b);
      }
      feed.append(chips);
      const status = !data.live ? (window.MASTER_STATIC ? " · TITRES DÉJÀ COLLECTÉS (FIL COMPLET PUBLIÉ POUR LES PAYS LES PLUS SUIVIS)" : " · TITRES DÉJÀ COLLECTÉS")
        : window.MASTER_STATIC && data.fetched ? ` · JOURNAUX LUS ${S().ago(data.fetched).toUpperCase()}` : "";
      feed.append(el("p", "sit-mono sit-dim", `${data.items.length} ARTICLES · ${data.sources.length} SOURCES${status}`));
      for (const x of data.items.filter((y) => !rub || y.rubrique === rub).slice(0, 80)) {
        const url = S().safeUrl(x.url);
        const c = el(url ? "a" : "article", "sit-card sit-news");
        if (url) { c.href = url; c.target = "_blank"; c.rel = "noopener noreferrer"; }
        const hd = el("div", "sit-row");
        hd.append(el("span", "sit-place", x.source), el("span", `sit-tag ${RUB_TONE[x.rubrique] || "mute"}`, (RUB.find((r) => r[0] === x.rubrique) || ["", ""])[1].toUpperCase()));
        c.append(hd, el("p", null, x.title));
        if (x.summary && !x.summary.startsWith(x.title.slice(0, 40))) c.append(el("p", "sit-news-sum", x.summary));
        c.append(el("span", "sit-mono sit-dim", `${S().ago(x.time)} · ARTICLE D'ORIGINE ↗`));
        feed.append(c);
      }
      if (!data.items.length) feed.append(el("p", "sit-dim", "Aucun article trouvé pour ce pays."));
      const srcs = el("details", "sit-srclist");
      srcs.append(el("summary", "sit-mono sit-dim", "JOURNAUX ET SOURCES"));
      for (const [name, n] of data.sources) srcs.append(el("p", null, `${name} · ${n}`));
      srcs.append(el("p", "g3-note", `Bing Actualités (flux RSS, usage personnel), The Guardian et France 24 (flux du pays), et les titres collectés par le Master. ${
        window.MASTER_STATIC ? "Version en ligne : relus au plus toutes les 3 h, à chaque publication." : "Lus au plus toutes les 20 min."}`));
      feed.append(srcs);
    }

    function renderEvents() {
      const feed = el("div", "sit-feed");
      feed.append(scopeBar());
      if (scope === "pays" && state.sel) { pane.append(feed); const list = el("div", "sit-feedlist"); feed.append(list); renderCountryFeed(list); return; }
      const marquants = hormuz.filter((x) => ["incident", "declaration", "transits_drop", "transits_rebound", "key_date"].includes(x.kind)).slice(0, 8);
      for (const e of [...news.slice(0, 60), ...marquants].sort(byTime).slice(0, 60)) {
        const [cat, tone] = category(e);
        const c = el("article", "sit-card");
        const hd = el("div", "sit-row");
        const place = el("span", "sit-place");
        const isos = e._iso || [];
        if (isos.length) place.append(el("span", "sit-fl", isos.slice(0, 2).map(flag).join("")), document.createTextNode(` ${isos.slice(0, 2).map(nameOf).join("–")}`));
        else place.textContent = e.kind === "headline" ? "Monde" : "Détroit d'Ormuz";
        hd.append(place, el("span", `sit-tag ${tone}`, cat.toUpperCase()));
        const ft = el("div", "sit-foot");
        ft.append(el("span", "sit-mono sit-dim", `${s.ago(e.time)} / Source : ${sourceName(e)}`), badge(e.level));
        c.append(hd, el("p", null, e.title), ft);
        c.tabIndex = 0;
        c.onclick = () => { if (isos[0]) selectCountry(isos[0], true, false); ui.openEvent(e); };
        c.onkeydown = (ev) => { if (ev.key === "Enter") ui.openEvent(e); };
        feed.append(c);
      }
      pane.append(feed);
    }

    function renderConflicts() {
      const feed = el("div", "sit-feed");
      feed.append(el("span", "sit-mono sit-dim", `${conflicts.length} CONFLITS ACTIFS · 12 DERNIERS MOIS · UCDP`));
      conflicts.forEach((c, i) => {
        const b = el("button", `sit-conf${i === state.tracked ? " on" : ""}`); b.type = "button";
        const r = el("span", "sit-row");
        r.append(el("span", "sit-fl", (c.countries || []).slice(0, 3).map(flag).join("")), el("span", "sit-mono sit-dim", `${nfi.format(c.deaths_12m || 0)} MORTS`));
        const bar = el("i", "sit-confbar"); bar.style.width = `${Math.max(2, ((c.deaths_12m || 0) / (conflicts[0].deaths_12m || 1)) * 100)}%`;
        b.append(r, el("b", null, c.name_fr || ""), bar);
        b.onclick = () => { stopTour(); track(i, true); };
        feed.append(b);
      });
      pane.append(feed);
    }

    // ---- statistiques du monde : chaque chiffre et chaque barre s'ouvrent
    function renderStats() {
      const feed = el("div", "sit-feed g3-country");
      const tiles = el("div", "dt-tiles");
      const tile = (k, v, sub, onClick) => { const b = el("button", "dt-tile"); b.type = "button";
        b.append(el("span", "sit-mono sit-dim", k), el("b", null, v), el("span", "sit-mono sit-dim", sub || ""));
        b.onclick = () => { stopTour(); onClick(); }; tiles.append(b); };
      const dead = conflicts.reduce((a, c) => a + (c.deaths_12m || 0), 0);
      const disp = conflicts.reduce((a, c) => a + (c.displaced ? (c.displaced.refugees || 0) + (c.displaced.idps || 0) : 0), 0);
      const day = Date.now() - 864e5;
      const n24 = news.filter((e) => Date.parse(e.time) >= day).length;
      const outlets = new Set(news.map(sourceName)).size;
      tile("CONFLITS ACTIFS", nfi.format(conflicts.length), "UCDP · 12 MOIS", () => setTab("conflicts"));
      tile("MORTS · 12 MOIS", compact.format(dead), "TOUS CONFLITS", () => setTab("conflicts"));
      tile("DÉPLACÉS", compact.format(disp), "PAR LES CONFLITS (UNHCR)", () => setTab("conflicts"));
      tile("DÉPÊCHES · 24 H", nfi.format(n24), `${nfi.format(outlets)} MÉDIAS ET CANAUX`, () => { scope = "monde"; setTab("events"); });
      feed.append(el("span", "sit-mono sit-acc", "LE MONDE EN CHIFFRES · CLIQUER POUR CREUSER"), tiles);
      const barList = (title, rows, onPick) => {  // [[libellé, valeur, info]]
        feed.append(el("span", "sit-mono sit-dim", title));
        const max = Math.max(1, ...rows.map((r) => r[1]));
        for (const [label, v, info, key] of rows) {
          const b = el("button", "sit-trade-row"); b.type = "button";
          const bar = el("i"); bar.style.width = `${Math.max(3, (v / max) * 100)}%`;
          b.append(el("span", null, label), el("span", "sit-mono", info || nfi.format(v)), bar);
          b.onclick = () => { stopTour(); onPick(key); };
          feed.append(b);
        }
      };
      barList("CONFLITS LES PLUS MEURTRIERS", conflicts.slice(0, 8).map((c, i) => [`${(c.countries || []).slice(0, 2).map(flag).join("")} ${c.name_fr}`, c.deaths_12m || 0, `${compact.format(c.deaths_12m || 0)} morts`, i]),
        (i) => track(i, true));
      const cited = {};
      for (const e of news) for (const i of e._iso) cited[i] = (cited[i] || 0) + 1;
      barList("PAYS LES PLUS CITÉS PAR LA PRESSE", Object.entries(cited).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([i, n]) => [`${flag(i)} ${nameOf(i)}`, n, `${n} dépêches`, i]),
        (i) => { scope = "pays"; rub = ""; selectCountry(i, true, false); setTab("events"); });
      barList("DÉPLACÉS PAR CONFLIT", conflicts.map((c, i) => [c, i]).filter(([c]) => c.displaced).sort((a, b) => ((b[0].displaced.refugees || 0) + (b[0].displaced.idps || 0)) - ((a[0].displaced.refugees || 0) + (a[0].displaced.idps || 0)))
        .slice(0, 6).map(([c, i]) => { const n = (c.displaced.refugees || 0) + (c.displaced.idps || 0); return [`${flag((c.countries || [])[0])} ${c.name_fr}`, n, compact.format(n), i]; }), (i) => track(i, true));
      barList("PUISSANCES NUCLÉAIRES · OGIVES (SIPRI)", W.nuclear.slice().sort((a, b) => (b.warheads || 0) - (a.warheads || 0)).map((n) => [`${flag(n.iso2)} ${nameOf(n.iso2)}`, n.warheads || 0, `≈ ${nfi.format(n.warheads || 0)}`, n.iso2]),
        (i) => { if (!state.layers.nucleaire) toggleLayer("nucleaire"); selectCountry(i, true); });
      const ops = {};
      for (const b of W.bases) ops[b.operator] = (ops[b.operator] || 0) + 1;
      barList("BASES À L'ÉTRANGER PAR PAYS (WIKIDATA)", Object.entries(ops).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([i, n]) => [`${flag(i)} ${nameOf(i)}`, n, `${n} bases`, i]),
        (i) => { if (!state.layers.bases) toggleLayer("bases"); selectCountry(i, true); });
      feed.append(el("p", "g3-note", "UCDP (Uppsala), UNHCR, SIPRI, Wikidata, presse collectée par le Master. Un pays « cité » apparaît dans le titre ou l'extrait d'une dépêche."));
      pane.append(feed);
    }

    function renderCountry() {
      const iso = state.sel;
      const card = el("div", "sit-feed g3-country");
      pane.append(card);
      if (!iso) { card.append(el("p", "sit-dim", "Cliquer sur un pays du globe pour afficher son profil.")); return; }
      const c = W.countries[iso];
      card.append(el("span", "sit-mono sit-acc", "PROFIL DU PAYS"), el("h2", null, `${flag(iso)} ${nameOf(iso)}`));
      if (iso === "fr") {
        const go = el("a", "sit-link", "CARTE DE FRANCE DÉTAILLÉE →");
        go.href = "#france/carte";
        card.append(go);
      }
      if (!c) { card.append(el("p", "sit-dim", "Profil indisponible (vendor/world/countries.json absent ou pays non couvert).")); return; }
      const dl = el("dl", "g3-dl");
      const add = (k, v) => { if (v != null && v !== "") dl.append(el("dt", null, k), el("dd", null, v)); };
      add("Capitale", c.capital && c.capital.name);
      add("Chef d'État", c.head_of_state);
      add("Gouvernement", c.head_of_government && c.head_of_government !== c.head_of_state ? c.head_of_government : null);
      const rankOf = (f) => {  // rang mondial du pays sur une mesure (1 = le plus élevé)
        const vals = Object.values(W.countries).map(f).filter((v) => v != null).sort((a, b) => b - a);
        const v = f(c); return v == null ? "" : ` · ${vals.indexOf(v) + 1}e sur ${vals.length}`;
      };
      add("Population", c.population && c.population.value ? `${compact.format(c.population.value)} (${c.population.year})${rankOf((x) => x.population && x.population.value)}` : null);
      add("PIB", c.gdp_usd && c.gdp_usd.value ? `${compact.format(c.gdp_usd.value)} $ (${c.gdp_usd.year})${rankOf((x) => x.gdp_usd && x.gdp_usd.value)}` : null);
      add("Défense", c.milex_pct_gdp && c.milex_pct_gdp.value != null ? `${String(Number(c.milex_pct_gdp.value).toFixed(1)).replace(".", ",")} % du PIB (${c.milex_pct_gdp.year})` : null);
      add("Blocs", (c.blocs || []).join(" · "));
      const nuke = W.nuclear.find((n) => n.iso2 === iso);
      add("Nucléaire", nuke ? `≈ ${nfi.format(nuke.warheads)} ogives (${nuke.warheads_year}) · portée ≈ ${nfi.format(nuke.max_range_km)} km` : null);
      const nb = W.bases.filter((b) => b.operator === iso).length;
      add("Bases à l'étranger", nb ? `${nb} (Wikidata)` : null);
      card.append(dl);
      const names = (list) => (list || []).slice(0, 8).map((x) => { const i = Array.isArray(x) ? x[0] : x; return `${flag(i)} ${nameOf(i)}`; }).join(", ");
      // partenaires : chaque pays s'ouvre ; montants du commerce en barres
      const rel = (label, list, key) => {
        if (!list || !list.length) return;
        const r = el("div", "g3-rel");
        const b = el("button", `g3-layer ${key}`, label); b.type = "button"; b.setAttribute("aria-pressed", String(!!state.layers[key]));
        b.title = "Afficher sur le globe"; b.onclick = () => toggleLayer(key);
        r.append(b);
        const items = list.slice(0, 8).map((x) => (Array.isArray(x) ? x : [x, null]));
        const max = Math.max(1, ...items.map((x) => x[1] || 0));
        const box = el("div", items[0][1] != null ? "sit-trade" : "sit-chips");
        for (const [i, v] of items) {
          const p = el("button", items[0][1] != null ? "sit-trade-row" : "sit-chip"); p.type = "button"; p.title = `Profil : ${nameOf(i)}`;
          if (v != null) {
            const bar = el("i"); bar.style.width = `${Math.max(3, (v / max) * 100)}%`;
            p.append(el("span", null, `${flag(i)} ${nameOf(i)}`), el("span", "sit-mono", `${compact.format(v)} $`), bar);
          } else p.textContent = `${flag(i)} ${nameOf(i)}`;
          p.onclick = () => { stopTour(); selectCountry(i, true); };
          box.append(p);
        }
        r.append(box);
        card.append(r);
      };
      rel("Partenaires (votes ONU)", c.un_vote_partners, "partenaires");
      rel("Adversaires (votes ONU)", c.un_vote_adversaries, "adversaires");
      rel(`Clients${c.trade_year ? ` (${c.trade_year})` : ""}`, c.export_partners, "exports");
      rel(`Fournisseurs${c.trade_year ? ` (${c.trade_year})` : ""}`, c.import_partners, "imports");
      if (c.summary_fr) {
        card.append(el("p", "g3-summary", c.summary_fr));
        const src = s.safeUrl(c.summary_source);
        if (src) { const a = el("a", "sit-src", "WIKIPÉDIA · CC BY-SA 4.0 ↗"); a.href = src; a.target = "_blank"; a.rel = "noopener noreferrer"; card.append(a); }
      }
      const inv = conflicts.filter((cf) => (cf.countries || []).includes(iso));
      if (inv.length) {
        card.append(el("span", "sit-mono sit-dim", "CONFLITS EN COURS"));
        for (const cf of inv.slice(0, 6)) {
          const b = el("button", "g3-conf", `${cf.name_fr} · ${nfi.format(cf.deaths_12m || 0)} morts / 12 mois`); b.type = "button";
          b.onclick = () => { stopTour(); track(conflicts.indexOf(cf), true); };
          card.append(b);
        }
      }
      const heads = news.filter((e) => e._iso.includes(iso)).slice(0, 5);
      if (heads.length) {
        const all = el("button", "sit-link sit-linkbtn", `TOUT LE FIL DU PAYS →`); all.type = "button";
        all.onclick = () => { scope = "pays"; rub = ""; setTab("events"); };
        const hr = el("div", "sit-row"); hr.append(el("span", "sit-mono sit-dim", "DERNIÈRES DÉPÊCHES"), all);
        card.append(hr);
        for (const e of heads) { const p = el("p", "g3-head"); p.append(el("b", null, `${sourceName(e)} · `), document.createTextNode(e.title)); p.onclick = () => ui.openEvent(e); card.append(p); }
      }
      card.append(el("p", "g3-note", "Partenaires et adversaires : proximité des votes à l'Assemblée générale de l'ONU, pas des alliances. Sources : Wikidata (CC0), Banque mondiale (CC BY 4.0), votes à l'ONU, commerce, Wikipédia (CC BY-SA 4.0) ; voir vendor/world/PROVENANCE-pays.md."));
    }

    // ---- bandeau du bas : cours et dépêches
    const wire = el("div", "sit-wire");
    wire.append(el("span", "sit-wire-label", "FIL"));
    const run = el("div", "sit-wire-run"), wtrack = el("div", "sit-wire-track");
    run.append(wtrack); wire.append(run); box.append(wire);
    const fillWire = (markets) => {
      const items = [];
      for (const m of markets || []) {
        if (!m.last) continue;
        const ch = s.lastChange(m.rows);
        const it = el("span", "sit-wire-item");
        it.append(el("b", null, m.label.toUpperCase()), document.createTextNode(` ${nf2.format(m.last.close)} ${m.currency || ""}`));
        if (ch != null) it.append(el("span", ch >= 0 ? "up" : "down", ` ${ch >= 0 ? "▲" : "▼"} ${nf2.format(Math.abs(ch))} %`));
        items.push(it);
      }
      for (const e of news.filter((x) => !s.isOsint(x)).slice(0, 30)) {
        const url = s.safeUrl(e.url);
        const it = el(url ? "a" : "span", "sit-wire-item");
        if (url) { it.href = url; it.target = "_blank"; it.rel = "noopener noreferrer"; }
        it.append(el("b", null, sourceName(e).toUpperCase()), document.createTextNode(` ${e.title}`));
        items.push(it);
      }
      wtrack.replaceChildren(...items, ...items.map((n) => n.cloneNode(true)));
      wtrack.style.animationDuration = `${Math.max(60, items.length * 6)}s`;
    };
    fillWire([]);
    s.loadMarkets(api, 10).then(fillWire, () => {});

    // ---- scène : globe, calques, profil de conflit
    const gbox = el("div", "g3");
    const layersBox = el("div", "g3-layers");
    stage.append(gbox, layersBox, profile);
    const lhead = el("button", "g3-layers-head", "CALQUES ▾"); lhead.type = "button";
    lhead.onclick = () => { layersBox.classList.toggle("folded"); lhead.textContent = layersBox.classList.contains("folded") ? "CALQUES ▸" : "CALQUES ▾"; };
    layersBox.append(lhead);
    if (window.innerWidth < 900) { layersBox.classList.add("folded"); lhead.textContent = "CALQUES ▸"; }  // petit écran : calques repliés
    for (const [k, label] of LAYERS) {
      if (k === "catastrophes") layersBox.append(el("span", "g3-layers-sep", "EN DIRECT"));
      const b = el("button", `g3-layer ${k}`, label); b.type = "button"; b.dataset.layer = k;
      b.setAttribute("aria-pressed", String(!!state.layers[k]));
      b.onclick = () => toggleLayer(k);
      layersBox.append(b);
    }
    function toggleLayer(k) {
      state.layers[k] = !state.layers[k]; save();
      for (const x of box.querySelectorAll(`.g3-layer.${k}`)) x.setAttribute("aria-pressed", String(state.layers[k]));
      drawLayers();
    }
    stage.append(el("span", "g3-credit", "NASA Blue Marble · Black Marble · GEBCO — routes : Benden 2022 (CC BY-NC 4.0) — frontières : Natural Earth — conflits : UCDP — direct : GDACS, USGS, NASA EONET, adsb.lol (ODbL), TeleGeography"));
    const liveCard = el("div", "g3-card"); liveCard.hidden = true; stage.append(liveCard);
    const liveData = {};
    function showLive(d) {
      const c = window.MASTER_LIVE && window.MASTER_LIVE.card(d, () => { liveCard.hidden = true; });
      if (!c) return;
      liveCard.replaceChildren(...c.childNodes); liveCard.hidden = false;
    }

    try {
      const mod = await import(`${window.MASTER_STATIC ? "./" : "/assets/"}globe3d.js?v=4f11ee7317`);
      globe = mod.createGlobe(gbox, {
        lon: 40, lat: 28, clickable: ["conflits", "bases", ...LIVE_IDS.map((k) => `live-${k}`)], autoSpin: () => !state.tour,
        onPickLonLat: ([lon, lat]) => {
          stopTour();
          if (draw && draw.handle([lon, lat])) return;  // outil de dessin actif : le clic est un lieu
          const f = W.features.find((x) => d3.geoContains(x, [lon, lat]));
          const hit = f && Object.entries(W.featByIso).find(([, g]) => g === f);
          if (hit && hit[0] === "fr") {  // France : vol jusqu'à elle, puis la carte de France détaillée (rubrique France politique)
            selectCountry("fr", false, false);
            if (globe) globe.flyTo(2.5, 46.6, 1.6, 1200);
            setTimeout(() => { if (box.isConnected) location.hash = "#france/carte"; }, 1300);
            return;
          }
          if (hit) { scope = "pays"; rub = ""; selectCountry(hit[0], false, false); setTab("events"); }
        },
        onPickPoint: (key, d) => {
          stopTour();
          if (key.startsWith("live-")) { showLive(d); return; }
          if (key === "conflits" && d) { const i = conflicts.findIndex((c) => c.id === d); if (i >= 0) track(i, true); }
        },
      });
      sit.world = globe;
      globe.setStyle(state.style);
      globe.setBorders(W.borders.coordinates || []);
      draw = window.MASTER_DRAW ? window.MASTER_DRAW.attach({ el, globe, stage, points: () => [
        ...(state.layers.conflits ? W.points.map((p) => ({ lon: p[0], lat: p[1], kind: "affrontements (UCDP)", title: `${p[2] || 1} morts` })) : []),
        ...news.filter((e) => e.lat != null).map((e) => ({ lon: e.lon, lat: e.lat, kind: "dépêches", title: e.title })),
        ...(state.layers.bases ? W.bases.map((b) => ({ lon: b.lon, lat: b.lat, kind: "bases étrangères", title: b.name })) : []),
        ...LIVE_IDS.filter((k) => state.layers[k] && liveData[k] && liveData[k].items && k !== "cables")
          .flatMap((k) => liveData[k].items.map((x) => ({ lon: x.lon, lat: x.lat, kind: { seismes: "séismes", catastrophes: "catastrophes", nature: "phénomènes naturels", "avions-militaires": "avions militaires" }[k], title: x.title || x.callsign || x.type || "" }))),
      ] }) : null;
      // lieu demandé par Maestro (« Voir sur le globe ») : calques allumés, pays choisi, vol vers le lieu
      let goto = null;
      try { goto = JSON.parse(localStorage.getItem("master-globe-goto") || "null"); localStorage.removeItem("master-globe-goto"); } catch { /* */ }
      if (goto && Date.now() - (goto.at || 0) < 120000) {
        state.tour = false;
        for (const k of goto.layers || []) if (k in state.layers) state.layers[k] = true;
        for (const b of box.querySelectorAll(".g3-layer[data-layer]")) b.setAttribute("aria-pressed", String(!!state.layers[b.dataset.layer]));
        if (goto.iso2) state.sel = goto.iso2;
        setTimeout(() => {
          if (goto.iso2) { scope = "pays"; rub = ""; selectCountry(goto.iso2, false, false); setTab("events"); } else drawLayers();
          globe.flyTo(goto.lon, goto.lat, goto.zoom || 1.4, 2400);
        }, 700);
      }
    } catch (err) {
      gbox.append(el("p", "sit-err", `Globe 3D indisponible : ${err.message}`));
    }

    function drawLayers() {
      if (!globe) return;
      const L = state.layers, sel = state.sel, c = sel && W.countries[sel];
      globe.setLanes(L.routes && W.lanes ? [...(W.lanes.major || []), ...(W.lanes.middle || [])] : []);
      globe.setPoints("conflits", L.conflits ? W.points.map((p) => ({ lon: p[0], lat: p[1], size: Math.min(26, 3 + Math.sqrt(p[2] || 1) * 0.9),
        color: "#e5484d", alpha: 0.55, data: p[3] })) : []);
      const fills = [];
      const rel = (key, list) => {
        const feats = L[key] && c ? (list || []).map((x) => W.featByIso[Array.isArray(x) ? x[0] : x]).filter(Boolean) : [];
        globe.setOutlines(key, feats, COLORS[key], 0.9);
        for (const f of feats) fills.push({ feature: f, color: COLORS[key], alpha: 0.32 });
      };
      rel("partenaires", c && c.un_vote_partners);
      rel("adversaires", c && c.un_vote_adversaries);
      rel("exports", c && c.export_partners);
      rel("imports", c && c.import_partners);
      if (sel && W.featByIso[sel]) fills.push({ feature: W.featByIso[sel], color: COLORS.sel, alpha: 0.62 });
      globe.setFills(fills);
      globe.setOutlines("sel", sel && W.featByIso[sel] ? [W.featByIso[sel]] : [], COLORS.sel, 1);
      globe.setPoints("bases", L.bases ? W.bases.filter((b) => !sel || b.operator === sel).map((b) => ({ lon: b.lon, lat: b.lat, size: 7,
        color: b.operator === sel ? "#e9d24a" : "#93b4f0", alpha: 0.9, data: b })) : []);
      const nukes = L.nucleaire ? W.nuclear.filter((n) => n.max_range_km && W.countries[n.iso2] && W.countries[n.iso2].capital) : [];
      globe.setCircles("nucleaire", (sel && nukes.some((n) => n.iso2 === sel) ? nukes.filter((n) => n.iso2 === sel) : nukes)
        .map((n) => ({ lon: W.countries[n.iso2].capital.lon, lat: W.countries[n.iso2].capital.lat, km: n.max_range_km })), "#f0a35e");
      // marqueurs : centres des conflits (étiquette pour les plus meurtriers) et pays sélectionné
      const marks = L.conflits ? conflicts.slice(0, 40).map((cf, i) => ({ id: cf.id, lon: cf.center[0], lat: cf.center[1],
        label: i < 6 || i === state.tracked ? cf.name_fr : "", tone: "hot", onClick: () => { stopTour(); track(i, true); } })) : [];
      const cc = c && c.capital;
      const ctr = sel && W.featByIso[sel] ? d3.geoCentroid(W.featByIso[sel]) : null;
      const at = cc ? [cc.lon, cc.lat] : ctr;
      if (sel && at) marks.push({ id: `sel-${sel}`, lon: at[0], lat: at[1], label: `${nameOf(sel).toUpperCase()} · ${coord(at[0], at[1])}`, tone: "sel",
        onClick: () => { stopTour(); scope = "pays"; rub = ""; setTab("events"); } });
      globe.setMarkers(marks);
      globe.selectMarker(conflicts[state.tracked] && conflicts[state.tracked].id);
      // couches en direct : chargées à la première activation
      for (const id of LIVE_IDS) {
        if (!window.MASTER_LIVE) break;
        if (L[id] && !liveData[id]) { liveData[id] = "…"; window.MASTER_LIVE.load(id).then((d) => { liveData[id] = d || { items: [] }; drawLayers(); }); }
        if (liveData[id] && liveData[id] !== "…") window.MASTER_LIVE.draw(globe, id, liveData[id], !!L[id]);
      }
    }

    function selectCountry(iso, fly, showTab = true) {
      state.sel = iso;
      drawLayers();
      if (showTab || state.tab === "country") setTab("country");
      else if (state.tab === "events" && scope === "pays") setTab("events");
      const c = W.countries[iso];
      const at = c && c.capital ? [c.capital.lon, c.capital.lat] : W.featByIso[iso] ? d3.geoCentroid(W.featByIso[iso]) : null;
      if (fly && globe && at) globe.flyTo(at[0], at[1], 1.3);
    }

    // ---- visite guidée des conflits (du plus meurtrier au moins meurtrier), comme leur « live tour »
    let tourTimer = null;
    function track(i, fly) {
      if (!conflicts.length) return;
      state.tracked = (i + conflicts.length) % conflicts.length;
      shown = 6;
      const c = conflicts[state.tracked];
      renderTracked();
      state.sel = (c.countries || [])[0] || null;
      drawLayers();
      if (globe && fly) globe.flyTo(c.center[0], c.center[1], 1.2);
      if (state.tab !== "events" || scope === "pays") setTab(state.tab);  // le fil du pays suit la sélection
      else { const old = pane.querySelector("[data-scope]"); if (old) old.replaceWith(scopeBar()); }
    }
    const paintPlay = () => { play.textContent = state.tour ? "❚❚ VISITE GUIDÉE" : "▶ VISITE GUIDÉE"; play.setAttribute("aria-pressed", String(state.tour)); };
    function stopTour() { state.tour = false; clearInterval(tourTimer); paintPlay(); }
    function startTour() {
      state.tour = true; clearInterval(tourTimer); paintPlay();
      tourTimer = setInterval(() => { if (!box.isConnected) { clearInterval(tourTimer); return; } track(state.tracked + 1, true); }, 12000);
    }
    play.onclick = () => (state.tour ? stopTour() : startTour());
    prev.onclick = () => { stopTour(); track(state.tracked - 1, true); };
    next.onclick = () => { stopTour(); track(state.tracked + 1, true); };

    setTab(state.tab || "events");
    drawLayers();
    if (conflicts.length) { track(Math.min(state.tracked, conflicts.length - 1), true); if (!STILL && state.tour) startTour(); else paintPlay(); }
    else { renderTracked(); paintPlay(); }

    // ---- accueil à la première visite (4 étapes)
    if (!state.intro) {
      const steps = [
        ["BIENVENUE DANS", "Situation", "Le monde en direct : conflits armés, dépêches de la presse et canaux OSINT, puissances et routes maritimes, sur un globe interactif."],
        ["À GAUCHE", "Le conflit suivi", "Les dernières dépêches qui citent ses pays, et son profil : morts par mois (UCDP), déplacés (UNHCR), belligérants."],
        ["AU CENTRE", "Le globe", "Glisser pour tourner, molette pour zoomer, clic sur un pays pour son profil. Les calques montrent partenaires, adversaires, commerce, bases et portée nucléaire."],
        ["À DROITE ET EN BAS", "Le fil", "Les derniers événements, classés escalade, diplomatie ou développement, avec leur niveau de confirmation ; le bandeau fait défiler cours et titres."],
      ];
      let k = 0;
      const modal = el("div", "sit-intro");
      const card = el("div", "sit-intro-card");
      modal.append(card); box.append(modal);
      const done = () => { state.intro = true; save(); modal.remove(); };
      const paint = () => {
        const [kick, h, p] = steps[k];
        const close = el("button", "g3-close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer"); close.onclick = done;
        const dots = el("div", "sit-dots");
        steps.forEach((_, i) => dots.append(el("i", i === k ? "on" : "")));
        const skip = el("button", "sit-ghost", "PASSER"); skip.type = "button"; skip.onclick = done;
        const nx = el("button", "sit-next", k < steps.length - 1 ? "SUIVANT" : "COMMENCER"); nx.type = "button";
        nx.onclick = () => { if (k < steps.length - 1) { k++; paint(); } else done(); };
        const row = el("div", "sit-row"); const btns = el("div", "sit-row"); btns.append(skip, nx); row.append(dots, btns);
        card.replaceChildren(close, el("span", "sit-mono sit-acc", kick), el("h2", null, h), el("p", null, p), row);
        nx.focus();
      };
      paint();
    }
  }

  window.MASTER_MONDE = viewMonde;
  window.MASTER_MONDE_LOAD = loadWorld;
  window.MASTER_MONDE_NAME = nameOf;  // nom français d'un pays (code à deux lettres), une fois les données chargées  // chargé à la demande (Situation, Développements), pas à chaque page
  // Pays cités dans un texte (pour les Développements) : [{iso, name}], une fois les données du monde chargées.
  window.MASTER_MONDE_COUNTRIES = (text) => (WORLD ? countriesIn(text).map((iso) => ({ iso, name: nameOf(iso) })) : []);
})();
