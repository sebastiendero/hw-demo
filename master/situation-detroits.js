/* Master — rubrique Situation, mode « Focus détroits » : le détroit d'Ormuz en direct sur le globe 3D du mode Monde.
 *
 * Même mise en page que le mode Monde (sujet suivi à gauche, bande des événements clés, globe au centre avec ses
 * calques, onglets à droite, bandeau en bas), appliquée au détroit : navires vus par l'AIS (pétroliers par cargaison,
 * cargos), balises coupées, zones d'attente, feux en mer, routes du pétrole, et une image satellite du Golfe à 500 m
 * par pixel (NASA GIBS) collée sur le globe pour que le zoom reste net jusqu'au détroit. Les données viennent de
 * Hormuz Watch (/api/hormuz/map) et des événements du Master. Tout texte de données passe par textContent.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const S = () => window.MASTER_SITUATION;
  const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const base = () => (window.MASTER_STATIC ? "" : "/assets/");
  const nfi = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const coord = (lon, lat) => `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "O"}`;

  // Étapes de la visite guidée : Ormuz de près (données réelles), puis les autres grands passages (repères).
  const STOPS = [
    { id: "hormuz", name: "Détroit d'Ormuz", lon: 56.45, lat: 26.35, zoom: 16, live: true },
    { id: "fujairah", name: "Mouillages de Fujaïrah", lon: 56.5, lat: 25.25, zoom: 34, live: true },
    { id: "golfe", name: "Golfe Persique", lon: 53.6, lat: 26.4, zoom: 11, live: true },
    { id: "bab", name: "Bab el-Mandeb", lon: 43.4, lat: 12.6, zoom: 9 },
    { id: "suez", name: "Canal de Suez", lon: 32.55, lat: 30.4, zoom: 9 },
    { id: "malacca", name: "Détroit de Malacca", lon: 100.3, lat: 3.1, zoom: 7 },
    { id: "bosphore", name: "Bosphore", lon: 29.05, lat: 41.1, zoom: 12 },
    { id: "cap", name: "Cap de Bonne-Espérance", lon: 18.5, lat: -34.4, zoom: 7 },
  ];
  const STRAITS = STOPS.filter((x) => !["fujairah", "golfe"].includes(x.id));
  // Routes du pétrole au départ du Golfe (points de passage, tracées en grands cercles).
  const ROUTES = [
    [[56.3, 26.55], [58.6, 23.6], [61.5, 15.5], [79.5, 5.5], [95.5, 5.8], [100.3, 3.1], [104.2, 1.3], [114.5, 12.0], [121.5, 25.5], [131.0, 33.5]],
    [[56.3, 26.55], [58.6, 23.6], [51.0, 13.5], [43.4, 12.6], [38.6, 20.2], [33.6, 27.8], [32.55, 30.4], [31.5, 33.0], [20.0, 35.0], [-5.6, 35.95], [-9.5, 43.0], [3.0, 51.5]],
    [[56.3, 26.55], [58.6, 23.6], [55.0, 10.0], [45.0, -12.0], [35.5, -27.5], [18.5, -34.4], [8.0, -10.0], [-9.0, 15.0], [-12.0, 36.0], [3.0, 51.5]],
  ];
  const SEG = { crude: ["Brut", "#f0a35e"], products: ["Produits raffinés", "#e9d24a"], gas: ["Gaz (GNL, GPL)", "#4cc38a"], other: ["Cargo", "#93b4f0"] };
  const LAYERS = [
    ["petroliers", "Pétroliers", true], ["cargos", "Cargos", true], ["silence", "Balises coupées", true], ["zones", "Zones d'attente", true],
    ["petrole", "Routes du pétrole", true], ["routes", "Routes maritimes", false], ["feux", "Feux en mer (FIRMS)", true],
    ["osint", "Événements géolocalisés", true], ["bases", "Bases étrangères", false],
    ["radar", "Radar Sentinel-1 (coques)", true], ["imgradar", "Image radar", false], ["imgoptique", "Image satellite", false],
    ["sanctions", "Navires sanctionnés (OFAC)", true], ["avions-militaires", "Avions militaires", true], ["marines", "Navires militaires", true], ["seismes", "Séismes", false],
  ];
  const ONLINE = () => !!window.MASTER_STATIC;  // en ligne, les images radar et satellite restent sur le Mac
  const KEY_KINDS = ["incident", "declaration", "key_date", "transits_drop", "transits_rebound"];
  const state = { layers: Object.fromEntries(LAYERS.map(([k, , on]) => [k, on])), style: "nuit", stop: 0, tour: true, tab: "events" };
  try {  // calques mémorisés fusionnés avec les défauts : un nouveau calque garde sa valeur par défaut
    const saved = JSON.parse(localStorage.getItem("master-detroits") || "{}");
    Object.assign(state, saved, { layers: { ...state.layers, ...(saved.layers || {}) } });
  } catch { /* défauts */ }
  const save = () => { try { localStorage.setItem("master-detroits", JSON.stringify({ layers: state.layers, style: state.style, tab: state.tab })); } catch { /* non mémorisé */ } };

  async function viewDetroits(root, sit) {
    const ui = U(), s = S();
    const { el, api, badge, nf2 } = ui;
    const box = el("div", "sit sit-monde sit-detroits");
    root.append(box);

    // ---- barre du haut : rubrique, modes, visite guidée, style, plein écran, zoom, images/s, heure
    const top = el("div", "sit-top");
    const brand = el("div", "sit-brand");
    brand.append(el("span", "sit-kicker", "[ SITUATION ]"), el("span", "sit-sub", "Ormuz et les routes du pétrole"));
    const tour = el("div", "sit-tour");
    const prev = el("button", "sit-ghost", "‹"), play = el("button", "sit-ghost sit-play"), next = el("button", "sit-ghost", "›");
    for (const b of [prev, play, next]) b.type = "button";
    prev.setAttribute("aria-label", "Étape précédente"); next.setAttribute("aria-label", "Étape suivante");
    tour.append(prev, play, next);
    let globe = null, draw = null;
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
      tool("+", "Zoomer", () => globe && globe.zoomBy(1.4)), tool("−", "Dézoomer", () => globe && globe.zoomBy(0.7)), fpsEl);
    const clock = el("div", "sit-clock");
    const tick = () => { clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`; if (globe) fpsEl.textContent = `${globe.fps} IMG/S`; };
    tick();
    sit.timer = setInterval(() => { if (!box.isConnected) { clearInterval(sit.timer); return; } tick(); }, 1000);
    top.append(brand, s.modeSwitch(el), tour, tools, clock);
    box.append(top);

    // ---- données : résumé et carte d'Hormuz Watch, événements d'Ormuz, presse
    const sanc = api("/api/sanctions/hormuz").catch(() => null);  // sans attendre : la page s'affiche avant
    const navP = api("/api/hormuz/naval").catch(() => null);
    const [o, events, press, map, W, gulf] = await Promise.all([
      api("/api/overview").catch(() => ({})), api("/api/events?theme=hormuz&limit=150").catch(() => []),
      api("/api/events?theme=actualite&limit=300").catch(() => []), api("/api/hormuz/map").catch(() => null),
      window.MASTER_MONDE_LOAD ? window.MASTER_MONDE_LOAD().catch(() => null) : null,
      fetch(`${base()}vendor/world/textures/gulf.json`, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null), () => null)]);
    const h = o.hormuz;
    const byTime = (a, b) => (a.time < b.time ? 1 : -1);
    const osint = press.filter(s.isOsint);
    const gulfPress = press.filter((e) => !s.isOsint(e) && e.data && e.data.topic === "hormuz");
    const live = [...events.filter((e) => e.kind !== "crossing"), ...osint, ...gulfPress].sort(byTime);
    const keys = [...events.filter((e) => KEY_KINDS.includes(e.kind)), ...gulfPress.filter((e) => e.level === "probable")].sort(byTime);
    const vessels = (map && map.vessels) || [], silent = (map && map.silent) || [], zones = (map && map.zones) || [];
    const tankers = vessels.filter((v) => v.cat === "tanker");

    const left = el("aside", "sit-left");
    const strip = el("div", "sit-strip");
    const stage = el("div", "sit-stage");
    const right = el("aside", "sit-right sit-tabs");
    box.append(left, strip, stage, right);

    // ---- colonne de gauche : le détroit suivi
    let shown = 6;
    function renderLeft() {
      left.replaceChildren();
      const row = el("div", "sit-row");
      const det = el("button", "sit-link sit-linkbtn", "TABLEAU COMPLET ⛶"); det.type = "button";
      det.title = "Le tableau de bord complet d'Hormuz Watch : carte détaillée, replays, files d'attente, radar";
      det.onclick = openDashboard;
      row.append(el("span", "sit-live", "● SUIVI EN DIRECT"), det);
      const title = el("h1", "sit-title");
      title.append(document.createTextNode("Crise du "), el("em", null, "détroit d'Ormuz"));
      left.append(row, title);
      const st = (map && map.status) || {};
      const label = { restricted: "restreint", open: "ouvert", closed: "fermé", disrupted: "perturbé" }[String(st.label || (h && h.status_label) || "").toLowerCase()] || st.label || "—";
      const facts = el("div", "sit-facts");
      const fact = (k, v, sub, onClick) => {  // chaque chiffre s'ouvre sur son détail
        const d = el("button", "dt-fact"); d.type = "button"; d.title = "Voir le détail";
        d.append(el("span", "sit-mono sit-dim", k), el("b", null, v)); if (sub) d.append(el("span", "sit-mono sit-dim", sub));
        d.onclick = () => { stopTour(); onClick(); };
        facts.append(d);
      };
      const pct = st.pct_of_normal ?? (h && h.pct_of_normal);
      fact("TRAFIC", pct != null ? `${nf1.format(pct)} %` : "—", label.toUpperCase(), openTraffic);
      const perDay = st.visible_transits_per_day_7d ?? (h && h.transits_per_day_7d);
      fact("PASSAGES / JOUR", perDay != null ? nf1.format(perDay) : "—", `AVANT-GUERRE ${nfi.format(st.baseline_per_day ?? (h && h.baseline_per_day) ?? 0)}`, openTraffic);
      const central = ((map && map.scenarios) || []).find((x) => x.key === "central");
      const wIn = central ? central.wait_in_days : h && h.wait_in_days, wOut = central ? central.wait_out_days : h && h.wait_out_days;
      fact("ATTENTE PRÉVUE", wIn != null ? `${nf1.format(wIn)} j` : "—", `POUR ENTRER · SORTIR ${wOut != null ? `${nf1.format(wOut)} J` : "—"}`, () => setTab("attentes"));
      fact("À L'ARRÊT", h && h.stationary != null ? nfi.format(h.stationary) : "—", `DONT ${h && h.tankers != null ? nfi.format(h.tankers) : "—"} PÉTROLIERS`, openFleet);
      fact("NAVIRES SUIVIS", nfi.format(vessels.length), `${nfi.format(tankers.length)} PÉTROLIERS EN VUE`, openFleet);
      fact("BALISES COUPÉES", nfi.format(silent.length), "PROBABLES", () => setTab("balises"));
      left.append(facts);
      // trafic (IMF PortWatch) : moyenne de chaque semaine sur 12 mois, et le niveau d'avant-guerre
      const pw = ((map && map.portwatch) || []).filter((r) => r[1] != null).slice(-364);
      const weeks = [];
      for (let i = 0; i < pw.length; i += 7) {
        const w = pw.slice(i, i + 7);
        weeks.push([w[0][0], w.reduce((a, r) => a + r[1], 0) / w.length]);
      }
      if (weeks.length) {
        const baseLine = st.baseline_per_day || 0;
        const max = Math.max(1, baseLine, ...weeks.map((r) => r[1]));
        const chart = el("div", "sit-bars sit-bars-acc dt-click");
        chart.title = "Voir le détail du trafic"; chart.onclick = () => { stopTour(); openTraffic(); };
        chart.setAttribute("role", "img"); chart.setAttribute("aria-label", "Passages par jour, moyenne hebdomadaire sur 12 mois (IMF PortWatch)");
        for (const [d, n] of weeks) { const b = el("i"); b.style.height = `${Math.max(2, (n / max) * 100)}%`; b.title = `Semaine du ${d} : ${nf1.format(n)} passages/jour`; chart.append(b); }
        if (baseLine) { const ref = el("span", "sit-bars-ref"); ref.style.bottom = `${(baseLine / max) * 100}%`; ref.title = `Avant-guerre : ${nf1.format(baseLine)} passages/jour`; chart.append(ref); }
        const axis = el("div", "sit-row"); axis.append(el("span", "sit-mono sit-dim", weeks[0][0]), el("span", "sit-mono sit-dim", pw[pw.length - 1][0]));
        left.append(el("span", "sit-mono sit-dim", "PASSAGES PAR JOUR · 12 MOIS · IMF PORTWATCH"), chart, axis);
      }
      const uh = el("div", "sit-row");
      uh.append(el("span", "sit-mono sit-acc", `● MISES À JOUR · ${keys.length}`));
      left.append(uh);
      const list = el("ol", "sit-list");
      for (const e of keys.slice(0, shown)) {
        const li = el("li");
        const meta = el("div", "sit-meta");
        meta.append(el("span", null, `${Date.now() - Date.parse(e.time) < 864e5 ? "Aujourd'hui" : s.dayShort(e.time)} · ${s.hm(e.time)} UTC`));
        const url = s.safeUrl(e.url);
        if (url) { const a = el("a", "sit-src", "SOURCE ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.append(a); }
        li.append(meta, el("p", null, e.title));
        li.tabIndex = 0;
        li.onclick = (ev) => { if (!ev.target.closest("a")) ui.openEvent(e); };
        li.onkeydown = (ev) => { if (ev.key === "Enter") ui.openEvent(e); };
        list.append(li);
      }
      if (!keys.length) list.append(el("li", "sit-dim", "Aucune mise à jour récente."));
      if (keys.length > shown) {
        const more = el("button", "sit-more", `AFFICHER ${keys.length - shown} MISES À JOUR PLUS ANCIENNES`);
        more.type = "button"; more.onclick = () => { shown = keys.length; renderLeft(); };
        list.append(more);
      }
      left.append(list);
      const gen = (map && map.generated_at) || (h && h.generated_at);
      const ft = el("div", "sit-foot-left");
      ft.append(el("span", "sit-mono sit-dim", gen ? `HORMUZ WATCH · ${s.dayShort(gen)} · ${s.hm(gen)} UTC` : "HORMUZ WATCH INDISPONIBLE"),
        el("span", "sit-mono sit-dim", "AIS : HORMUZ.NOW (CC BY 4.0) · TRAFIC : IMF PORTWATCH"));
      left.append(ft);
    }
    renderLeft();

    // ---- bande verticale des événements clés
    strip.append(el("span", "sit-vlabel", "ÉVÉNEMENTS CLÉS"));
    const ticks = el("div", "sit-ticks");
    for (const e of keys.slice(0, 18)) {
      const t = el("button", `sit-tick ${(s.TAG[e.kind] || ["", "mute"])[1]}`);
      t.type = "button"; t.title = `${s.dayShort(e.time)} · ${e.title}`;
      t.onclick = () => { stopTour(); go(0); ui.openEvent(e); };
      ticks.append(t);
    }
    strip.append(ticks);

    // ---- colonne de droite : onglets verticaux
    const tabs = el("div", "sit-vtabs");
    const pane = el("div", "sit-pane");
    right.append(tabs, pane);
    // Ce que montrait le tableau de bord d'Hormuz Watch, réparti en onglets.
    const TABS = [["events", "ÉVÉNEMENTS"], ["navires", "NAVIRES"], ["attentes", "ATTENTES"], ["balises", "BALISES"],
      ["sanctions", "SANCTIONS"], ["radar", "RADAR"], ["ports", "PORTS"], ["marines", "MARINES"], ["controles", "CONTRÔLES"], ["stats", "STATS"]];
    const RENDER = { events: () => renderEvents(), navires: () => renderShips(), attentes: () => renderWaits(), balises: () => renderBeacons(),
      sanctions: () => renderSanctions(), radar: () => renderRadar(), ports: () => renderPorts(), marines: () => renderNaval(), controles: () => renderChecks(), stats: () => renderStats(), detroits: () => renderStats() };
    function setTab(k) {
      if (!RENDER[k]) k = "events";
      state.tab = k; save();
      for (const b of tabs.children) b.setAttribute("aria-pressed", String(b.dataset.tab === k));
      pane.replaceChildren();
      RENDER[k]();
    }
    for (const [k, l] of TABS) { const b = el("button", "sit-vtab", l); b.type = "button"; b.dataset.tab = k; b.onclick = () => setTab(k); tabs.append(b); }

    // Tous les flux, du plus récent au plus ancien : fil en direct d'Hormuz Watch (réapparitions, coupures, passages,
    // radar), journal du Master (incidents recoupés, déclarations, chutes de trafic, dates clés) et presse du Golfe.
    const HW_CAT = { back: "reap", silent: "coupure", crossing: "passage", radar: "radar" };
    const M_CAT = { incident: "incident", declaration: "declaration", dark_transit: "passage", transits_drop: "passage", transits_rebound: "passage", key_date: "incident" };
    const CAT = { passage: ["PASSAGE", "cool"], coupure: ["COUPURE", "hot"], reap: ["RÉAPPARITION", "talk"], radar: ["RADAR", "acc"],
      incident: ["INCIDENT", "hot"], declaration: ["DÉCLARATION", "talk"], presse: ["PRESSE", "mute"] };
    const flux = [
      ...((map && map.feed) || []).filter((e) => HW_CAT[e.kind]).map((e) => ({ time: e.time, cat: HW_CAT[e.kind], place: e.name || "Hormuz Watch",
        title: e.text, level: e.level, sub: e.type, vessel: e.id, src: "Hormuz Watch" })),
      ...events.filter((e) => M_CAT[e.kind]).map((e) => ({ time: e.time, cat: M_CAT[e.kind], place: "Détroit d'Ormuz", title: e.title, level: e.level, ev: e, src: e.source })),
      ...[...osint, ...gulfPress].map((e) => ({ time: e.time, cat: "presse", place: (e.source || "").replace(/ \(Telegram\)| \(OSINT automatisé\)/, ""), title: e.title, level: e.level, ev: e })),
    ].sort(byTime);
    let evFilter = "";
    const EV_FILTERS = [["", "Tout"], ["passage", "Passages"], ["coupure", "Coupures"], ["reap", "Réapparitions"], ["radar", "Radar"],
      ["incident", "Incidents"], ["declaration", "Déclarations"], ["presse", "Presse"]];
    function renderEvents() {
      const feed = el("div", "sit-feed");
      const chips = el("div", "sit-rubs");
      for (const [k, label] of EV_FILTERS) {
        const n = k ? flux.filter((x) => x.cat === k).length : flux.length;
        const b = el("button", "sit-rub", `${label} ${n}`); b.type = "button"; b.setAttribute("aria-pressed", String(evFilter === k)); b.disabled = !n;
        b.onclick = () => { evFilter = k; setTab("events"); };
        chips.append(b);
      }
      feed.append(chips);
      for (const x of flux.filter((y) => !evFilter || y.cat === evFilter).slice(0, 80)) {
        const [tag, tone] = CAT[x.cat];
        const c = el("article", "sit-card");
        const hd = el("div", "sit-row");
        hd.append(el("span", "sit-place", x.place), el("span", `sit-tag ${tone}`, tag));
        const ft = el("div", "sit-foot");
        ft.append(el("span", "sit-mono sit-dim", `${s.ago(x.time)}${x.sub ? ` · ${x.sub}` : x.src && x.cat !== "presse" ? ` · ${x.src}` : ""}`), badge(x.level || "non_confirme"));
        c.append(hd, el("p", null, x.title), ft);
        c.tabIndex = 0;
        const open = () => { stopTour(); if (x.vessel) flyToVessel(x.vessel, x.place); else if (x.cat === "radar") setTab("radar"); else if (x.ev) ui.openEvent(x.ev); };
        c.onclick = open;
        c.onkeydown = (ev) => { if (ev.key === "Enter") open(); };
        feed.append(c);
      }
      if (!flux.length) feed.append(el("p", "sit-dim", "Aucun événement récent."));
      note(feed, "Cliquer : un navire est retrouvé sur le globe ; un événement du journal ouvre sa fiche (sources, niveau de confirmation).");
      pane.append(feed);
    }

    function renderShips() {
      const feed = el("div", "sit-feed g3-country");
      feed.append(el("span", "sit-mono sit-acc", "FLOTTE VISIBLE (AIS)"));
      const bySeg = {};
      for (const v of vessels) bySeg[v.seg || "other"] = (bySeg[v.seg || "other"] || 0) + 1;
      const legend = el("div", "dt-legend");
      for (const [k, [label, color]] of Object.entries(SEG)) {
        const r = el("span", "dt-key"); const dot = el("i"); dot.style.background = color;
        r.append(dot, document.createTextNode(`${label} · ${nfi.format(bySeg[k] || 0)}`)); legend.append(r);
      }
      const r = el("span", "dt-key"); const dot = el("i", "dt-ring"); r.append(dot, document.createTextNode(`Balise coupée · ${nfi.format(silent.length)}`)); legend.append(r);
      feed.append(legend);
      feed.append(el("span", "sit-mono sit-dim", "ZONES D'ATTENTE"));
      const zs = zones.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
      const maxZ = Math.max(1, ...zs.map((z) => z.count || 0));
      for (const z of zs) {
        const b = el("button", "sit-conf"); b.type = "button";
        const row = el("span", "sit-row");
        row.append(el("b", null, z.name), el("span", "sit-mono sit-dim", `${nfi.format(z.count || 0)} NAVIRES · ${nfi.format(z.tankers || 0)} PÉTROLIERS`));
        const bar = el("i", "sit-confbar dt-bar"); bar.style.width = `${Math.max(2, ((z.count || 0) / maxZ) * 100)}%`;
        b.append(row, bar);
        if (z.hn_median_h != null) b.append(el("span", "sit-mono sit-dim", `ATTENTE MÉDIANE ≈ ${nf1.format(z.hn_median_h)} H · ${z.side === "gulf" ? "CÔTÉ GOLFE" : "CÔTÉ OMAN"}`));
        b.onclick = () => { stopTour(); if (globe) globe.flyTo(z.lon, z.lat, 48); };
        feed.append(b);
      }
      const cross = (map && map.crossings) || [];
      if (cross.length) {
        feed.append(el("span", "sit-mono sit-dim", "DERNIERS PASSAGES DU DÉTROIT"));
        for (const c of cross.slice(0, 14)) {
          const p = el("p", "g3-head");
          p.append(el("b", null, `${s.dayShort(c.time)} ${s.hm(c.time)} · ${c.direction === "in" ? "→ GOLFE" : "→ OMAN"} · `),
            document.createTextNode(`${c.name} (${c.type || "?"}${c.observation === "reconstitue" ? ", passage reconstitué" : ""})`));
          feed.append(p);
        }
      }
      feed.append(el("p", "g3-note", "Positions AIS publiques (hormuz.now, CC BY 4.0) : un navire qui coupe sa balise n'y figure plus ; les coupures probables sont déduites par Hormuz Watch (dernier signal, voisins, trous de notre collecte)."));
      pane.append(feed);
    }

    const nf0 = (v) => (v == null ? "—" : nfi.format(v));
    const head = (feed, t) => feed.append(el("span", "sit-mono sit-acc", t));
    const note = (feed, t) => feed.append(el("p", "g3-note", t));
    const rowsOf = (feed, list, fmt, onPick) => {
      for (const x of list) {
        const p = el(onPick ? "button" : "p", onPick ? "g3-head dt-row" : "g3-head"); const [b, rest] = fmt(x);
        p.append(el("b", null, b), document.createTextNode(rest));
        if (onPick) { p.type = "button"; p.onclick = () => { stopTour(); onPick(x); }; }
        feed.append(p);
      }
    };
    const pickVessel = (v) => flyToVessel(v.id, v.name);

    function renderWaits() {
      const feed = el("div", "sit-feed g3-country");
      head(feed, "ATTENTE PRÉVUE (LOI DE LITTLE)");
      const dl = el("dl", "g3-dl dt-dl3");
      dl.append(el("dt", null, "Hypothèse"), el("dd", null, "entrer · sortir"));
      for (const x of (map && map.scenarios) || []) dl.append(el("dt", null, x.label), el("dd", null, `${nf1.format(x.wait_in_days)} j · ${nf1.format(x.wait_out_days)} j`));
      feed.append(dl);
      note(feed, "Attente = navires en file ÷ passages par jour. Trois hypothèses de débit, de la plus prudente (balises allumées seulement) à la plus haute (Lloyd's List, navires sans balise compris).");
      for (const [side, label] of [["in", "FILE POUR ENTRER DANS LE GOLFE"], ["out", "FILE POUR SORTIR"]]) {
        const q = ((map && map.queues) || {})[side] || [];
        head(feed, `${label} · ${nf0(side === "in" ? map && map.queue_in : map && map.queue_out)} NAVIRES`);
        rowsOf(feed, q.slice(0, 15), (v) => [`${nf1.format(v.hours || 0)} h · `, `${v.name} (${v.type || "?"}, ${v.flag || "?"}) · ${v.zone_name || ""}${v.dest ? ` → ${v.dest}` : ""}`], pickVessel);
        if (!q.length) feed.append(el("p", "sit-dim", "Aucun navire en file."));
      }
      const sig = (map && map.signals) || [];
      if (sig.length) {
        head(feed, "CE QUE DÉCLARENT LES NAVIRES (AIS)");
        rowsOf(feed, sig, (x) => [`${nf0(x.count)} · `, x.label]);
      }
      note(feed, "Temps d'attente mesurés depuis le début du suivi : ce sont des minimums.");
      pane.append(feed);
    }

    function renderBeacons() {
      const feed = el("div", "sit-feed g3-country");
      head(feed, `BALISES COUPÉES · ${nf0(silent.length)} PROBABLES`);
      rowsOf(feed, silent.slice().sort((a, b) => (b.silent_h || 0) - (a.silent_h || 0)).slice(0, 25),
        (v) => [`${nf1.format(v.silent_h || 0)} h · `, `${v.name} (${v.type || "?"}) · ${v.zone || ""}`], pickVessel);
      const re = (map && map.reappeared) || {};
      const verdicts = Object.entries(re.verdicts || {}).sort((a, b) => b[1] - a[1]);
      if (verdicts.length) {
        head(feed, "BALISES RALLUMÉES : CE QU'ON EN DÉDUIT");
        rowsOf(feed, verdicts, ([k, n]) => [`${nf0(n)} · `, k || "—"]);
        head(feed, "DERNIÈRES RÉAPPARITIONS");
        rowsOf(feed, (re.recent || []).slice(0, 15), (x) => [`${x.on ? `${s.dayShort(x.on)} ${s.hm(x.on)}` : "—"} · `, `${x.name} : ${x.verdict} après ${nf1.format(x.gap_h || 0)} h${x.moved_km ? `, ${nf1.format(x.moved_km)} km plus loin` : ""}`], pickVessel);
      }
      note(feed, `Suivi depuis ${map && map.tracking_since ? s.dayShort(map.tracking_since) : "—"}. Un trou de notre propre collecte n'est pas compté comme une coupure (Hormuz Watch le retire).`);
      pane.append(feed);
    }

    // ---- navires sanctionnés (liste SDN de l'OFAC), croisés par numéro IMO, MMSI ou nom
    let sanctions = null;
    const sanctionOf = (v) => (sanctions && v ? sanctions.matches.find((m) => String(m.vessel.id) === String(v.id)) : null);
    sanc.then((d) => { sanctions = d; drawLayers(); if (state.tab === "sanctions" || state.tab === "stats") setTab(state.tab); });
    const METHOD = { confirme: "même numéro", probable: "même nom et pavillon", non_confirme: "même nom seulement" };
    function renderSanctions() {
      const feed = el("div", "sit-feed g3-country");
      if (!sanctions) { feed.append(el("p", "sit-dim", window.MASTER_STATIC && !sanctions ? "Liste non publiée." : "Lecture de la liste de l'OFAC…")); pane.append(feed); return; }
      const ms = sanctions.matches || [];
      const by = (l) => ms.filter((m) => m.level === l);
      head(feed, `NAVIRES SANCTIONNÉS EN VUE · ${ms.length}`);
      const tiles = el("div", "dt-tiles");
      for (const [l, t] of [["confirme", "CONFIRMÉS (IMO OU MMSI)"], ["probable", "NOM ET PAVILLON"], ["non_confirme", "NOM SEULEMENT"]]) {
        const b = el("div", "dt-tile"); b.append(el("span", "sit-mono sit-dim", t), el("b", null, nfi.format(by(l).length)));
        tiles.append(b);
      }
      feed.append(tiles);
      const silentHits = ms.filter((m) => m.vessel.silent).length;
      if (silentHits) feed.append(el("p", "g3-note", `${silentHits} d'entre eux ont coupé leur balise (dernière position connue).`));
      for (const [l, t] of [["confirme", "CONFIRMÉS"], ["probable", "PROBABLES"], ["non_confirme", "À VÉRIFIER (NOM SEULEMENT)"]]) {
        const list = by(l);
        if (!list.length) continue;
        head(feed, `${t} · ${list.length}`);
        for (const m of list) {
          const b = el("button", "sit-conf"); b.type = "button";
          const row = el("span", "sit-row");
          row.append(el("b", null, `${m.vessel.name}${m.vessel.silent ? " · balise coupée" : ""}`), badge(m.level));
          b.append(row, el("span", "sit-mono sit-dim", `${(m.entry.programs || []).join(" · ")} · ${METHOD[m.level]} (${m.method})`),
            el("span", "sit-mono sit-dim", `LISTE : ${m.entry.name}${m.entry.imo ? ` · IMO ${m.entry.imo}` : ""}${m.entry.flag ? ` · ${m.entry.flag}` : ""}${(m.entry.linked || []).length ? ` · LIÉ À ${m.entry.linked[0]}` : ""}`));
          b.onclick = () => { stopTour(); flyToVessel(m.vessel.id, m.vessel.name); };
          feed.append(b);
        }
      }
      note(feed, `Liste SDN de l'OFAC (Trésor américain, domaine public), lue le ${sanctions.list_date ? s.dayShort(sanctions.list_date) : "—"} : ${nfi.format(sanctions.vessels_listed || 0)} navires désignés. Programmes : IRAN-EO13902 (pétrole iranien), SDGT (terrorisme), RUSSIA-EO14024… Un nom identique sans numéro ne prouve rien : à vérifier.`);
      pane.append(feed);
    }

    function renderRadar() {
      const feed = el("div", "sit-feed g3-country");
      const r = (map && map.radar) || {}, last = r.last;
      if (!last) { feed.append(el("p", "sit-dim", "Pas encore de passage radar traité.")); pane.append(feed); return; }
      head(feed, `DERNIER PASSAGE · ${(last.platform || "").toUpperCase()} · ${s.dayShort(last.datetime)} ${s.hm(last.datetime)} UTC`);
      for (const z of last.zones) {
        const b = el("button", "sit-conf"); b.type = "button";
        const row = el("span", "sit-row");
        row.append(el("b", null, z.label), el("span", "sit-mono sit-dim", `${nf0(z.count)} COQUES · ${nf0(z.dark)} SANS BALISE`));
        b.append(row, el("span", "sit-mono sit-dim", `${nf0(z.big)} GRANDS NAVIRES · ZONE COUVERTE ${Math.round((z.coverage || 0) * 100)} %`));
        if (z.bbox) b.onclick = () => { stopTour(); if (globe) globe.flyTo((z.bbox[0] + z.bbox[2]) / 2, (z.bbox[1] + z.bbox[3]) / 2, 40); };
        feed.append(b);
      }
      if (!last.ais_available) note(feed, "Pas de positions AIS au moment du passage : les coques n'ont pas pu être rapprochées des balises.");
      if ((r.history || []).length) {
        head(feed, "PASSAGES PRÉCÉDENTS");
        rowsOf(feed, r.history.slice().reverse().slice(0, 8), (x) => [`${s.dayShort(x.datetime)} · `,
          Object.values(x.zones || {}).map((z) => `${z.label} ${nf0(z.count)} (${nf0(z.dark)} sans balise)`).join(" · ")]);
      }
      if ((r.next_passes || []).length) feed.append(el("p", "sit-mono sit-dim", `PROCHAINS PASSAGES : ${r.next_passes.map((t) => `${s.dayShort(t)} ${s.hm(t)}`).join(" · ")}`));
      note(feed, `Copernicus Sentinel-1 (radar, voit à travers les nuages) : coques détectées par Hormuz Watch, puis rapprochées des positions AIS. Calques « Radar » et « Image radar » sur le globe${ONLINE() ? " (images sur le portail du Mac)" : ""}.`);
      pane.append(feed);
    }

    function renderPorts() {
      const feed = el("div", "sit-feed g3-country");
      head(feed, "PORTS · ESCALES SUR 7 JOURS (IMF PORTWATCH)");
      for (const x of (map && map.ports) || []) {
        const b = el("button", "sit-conf"); b.type = "button"; b.onclick = () => { stopTour(); openPort(x); };
        const row = el("span", "sit-row");
        const ch = x.tanker_calls_pre ? (x.tanker_calls_7d / x.tanker_calls_pre - 1) * 100 : null;
        row.append(el("b", null, x.name), el("span", `sit-mono ${ch != null && ch < -25 ? "sit-esc" : "sit-dim"}`, ch == null ? "" : `PÉTROLIERS ${ch >= 0 ? "+" : ""}${nfi.format(ch)} % VS AVANT`));
        b.append(row, el("span", "sit-mono sit-dim", `${nf1.format(x.calls_7d || 0)} ESCALES/J · ${nf1.format(x.tanker_calls_7d || 0)} PÉTROLIERS/J · EXPORT ${nfi.format((x.export_t_7d || 0) / 1000)} KT/J (AVANT ${nfi.format((x.export_t_pre || 0) / 1000)})`),
          el("span", "sit-mono sit-dim", `${(x.role || "").toUpperCase()} · DONNÉE DU ${x.last_date ? s.dayShort(x.last_date) : "—"}`));
        feed.append(b);
      }
      note(feed, "IMF PortWatch publie avec 4 à 10 jours de retard. « Avant » : moyenne d'avant la crise.");
      pane.append(feed);
    }

    function renderChecks() {
      const feed = el("div", "sit-feed g3-country");
      head(feed, "NOS CHIFFRES FACE AUX AUTRES SOURCES");
      for (const x of (map && map.checks) || []) {
        const b = el("div", "sit-conf");
        const row = el("span", "sit-row");
        row.append(el("b", null, x.what), badge(x.level));
        b.append(row, el("span", "sit-mono sit-dim", `NOUS ${x.ours ?? "—"} · ${String(x.source || "").toUpperCase()} ${x.theirs ?? "—"}`));
        if (x.note) b.append(el("span", "g3-note", x.note));
        feed.append(b);
      }
      note(feed, "Un écart ne dit pas qui a raison : il signale ce qu'il faut vérifier.");
      pane.append(feed);
    }

    // ---- détail d'un chiffre, par-dessus le globe (comme le profil d'un conflit dans le mode Monde)
    function openDetail(kicker, title, build) {
      stage.querySelectorAll(".dt-detail").forEach((x) => x.remove());
      card.hidden = true;  // un seul panneau à la fois
      const d = el("div", "g3-profile dt-detail");
      const close = el("button", "g3-close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer"); close.onclick = () => d.remove();
      d.append(close, el("span", "sit-mono sit-acc", kicker), el("h2", null, title));
      build(d);
      stage.append(d);
    }
    const bars = (rows, max, cls, label) => {  // [[libellé, valeur, info]] → petit histogramme
      const c = el("div", `sit-bars ${cls || "sit-bars-acc"}`); c.setAttribute("role", "img"); c.setAttribute("aria-label", label);
      for (const [k, v, info] of rows) { const b = el("i"); b.style.height = `${Math.max(2, ((v || 0) / (max || 1)) * 100)}%`; b.title = `${k} : ${info || nfi.format(v || 0)}`; c.append(b); }
      return c;
    };
    function breakdown(d, label, x) {
      if (!x) return;
      const dl = el("dl", "g3-dl dt-dl3");
      const add = (k, v) => dl.append(el("dt", null, k), el("dd", null, v == null ? "—" : nfi.format(v)));
      add("Passages (entrée · sortie)", null); dl.lastChild.textContent = `${nfi.format(x.total || 0)} (${nfi.format(x.in || 0)} · ${nfi.format(x.out || 0)})`;
      add("Pétroliers", x.tankers); add("dont brut", x.crude); add("dont produits", x.products); add("GNL · GPL", null); dl.lastChild.textContent = `${nfi.format(x.lng || 0)} · ${nfi.format(x.lpg || 0)}`;
      add("Cargos", x.cargo); add("dont conteneurs", x.container); add("dont vrac", x.bulk);
      add("Port en lourd (t)", x.dwt);
      d.append(el("span", "sit-mono sit-dim", label), dl);
    }
    function openTraffic() {
      openDetail("TRAFIC DU DÉTROIT", "Passages par jour", (d) => {
        const st = (map && map.status) || {};
        const daily = (map && map.daily) || [];
        if (daily.length) {
          const max = Math.max(1, ...daily.map((r) => r.total || 0));
          d.append(el("span", "sit-mono sit-dim", "7 DERNIERS JOURS · PASSAGES VUS (AIS) · CLIQUER UN JOUR"));
          const row = el("div", "dt-days");
          for (const r of daily) {
            const b = el("button", "dt-day"); b.type = "button";
            const col = el("div", "dt-col"); const i = el("i", "in"); const o = el("i", "out");
            i.style.height = `${((r.in || 0) / max) * 100}%`; o.style.height = `${((r.out || 0) / max) * 100}%`;
            if (!r.in) i.hidden = true; if (!r.out) o.hidden = true;
            col.append(o, i);
            b.append(el("b", null, nfi.format(r.total || 0)), col, el("span", "sit-mono sit-dim", r.date.slice(5).split("-").reverse().join("/")));
            b.title = `${r.date} : ${r.in} entrées, ${r.out} sorties, ${r.tankers} pétroliers${r.partial ? " (journée incomplète)" : ""}`;
            b.onclick = () => { evFilter = "passage"; setTab("events"); };
            row.append(b);
          }
          d.append(row, el("p", "g3-note", "Barre jaune : entrées dans le Golfe ; bleue : sorties. Passages des navires dont la balise est allumée ; les passages sans balise sont estimés à part."));
        }
        breakdown(d, "DERNIÈRES 24 HEURES", st.last24h);
        breakdown(d, "7 DERNIERS JOURS", st.last7d);
        const pw = ((map && map.portwatch) || []).filter((r) => r[1] != null);
        if (pw.length) {
          const last = pw.slice(-120);
          const top = Math.max(st.baseline_per_day || 0, ...last.map((r) => r[1]));
          const chart = bars(last.map((r) => [r[0], r[1], `${r[1]} passages (moy. 7 j ${nf1.format(r[2] || 0)})`]), top, "sit-bars-acc dt-tall", "PortWatch");
          if (st.baseline_per_day) { const ref = el("span", "sit-bars-ref"); ref.style.bottom = `${(st.baseline_per_day / top) * 100}%`; chart.append(ref); }
          const axis = el("div", "sit-row"); axis.append(el("span", "sit-mono sit-dim", last[0][0]), el("span", "sit-mono sit-dim", last[last.length - 1][0]));
          d.append(el("span", "sit-mono sit-dim", "IMF PORTWATCH · 120 DERNIERS JOURS (AVEC RETARD DE 4 À 10 JOURS)"), chart, axis);
        }
        const c = (map && map.correlation) || {};
        if (c.n) d.append(el("p", "g3-note", `Brent et passages : corrélation ${nf1.format(c.level_r)} sur ${nfi.format(c.n)} jours (${nf1.format(c.level_r_war)} depuis la crise). Une corrélation ne dit pas qui entraîne l'autre.`));
        const go = el("button", "sit-ghost dt-go", "VOIR LES PASSAGES DANS LE FIL →"); go.type = "button"; go.onclick = () => { evFilter = "passage"; setTab("events"); };
        d.append(go);
      });
    }
    function openFleet() {
      openDetail("FLOTTE AUTOUR D'ORMUZ", "Où sont les navires", (d) => {
        const f = (map && map.fleet) || {};
        const dl = el("dl", "g3-dl dt-dl3");
        const add = (k, v) => dl.append(el("dt", null, k), el("dd", null, v == null ? "—" : nfi.format(v)));
        add("Navires visibles (AIS)", vessels.length); add("À l'arrêt", f.stationary); add("dont pétroliers", f.tankers);
        add("En mouvement (≥ 1 nœud)", vessels.filter((v) => (v.speed || 0) >= 1).length); add("Position de plus de 6 h", f.stale_over_6h);
        add("Balises coupées probables", silent.length);
        d.append(dl);
        const bySeg = {};
        for (const v of vessels) bySeg[v.seg || "other"] = (bySeg[v.seg || "other"] || 0) + 1;
        d.append(el("span", "sit-mono sit-dim", "PAR CARGAISON · CLIQUER POUR N'AFFICHER QU'ELLE"));
        for (const [k, [label, color]] of Object.entries(SEG)) {
          const b = el("button", "dt-row g3-head"); b.type = "button";
          const dot = el("i", "dt-dot"); dot.style.background = color;
          b.append(dot, el("b", null, `${nfi.format(bySeg[k] || 0)} · `), document.createTextNode(label));
          b.onclick = () => { only = only === k ? null : k; drawLayers(); };
          d.append(b);
        }
        d.append(el("span", "sit-mono sit-dim", "PAR ZONE D'ATTENTE · CLIQUER POUR Y ALLER"));
        const t = el("table", "dt-table");
        const hr = el("tr"); for (const x of ["Zone", "À l'arrêt", "Pétroliers", "Entrer", "Sortir", "Médiane"]) hr.append(el("th", null, x)); t.append(hr);
        for (const z of zones.slice().sort((a, b) => (b.count || 0) - (a.count || 0))) {
          const tr = el("tr"); tr.tabIndex = 0;
          for (const v of [z.name, nfi.format(z.count || 0), nfi.format(z.tankers || 0), nfi.format(z.q_in || 0), nfi.format(z.q_out || 0), z.hn_median_h != null ? `${nf1.format(z.hn_median_h)} h` : "—"]) tr.append(el("td", null, v));
          tr.onclick = () => { stage.querySelectorAll(".dt-detail").forEach((x) => x.remove()); if (globe) globe.flyTo(z.lon, z.lat, 48); };
          t.append(tr);
        }
        d.append(t);
      });
    }
    function openPort(x) {
      openDetail("PORT · IMF PORTWATCH", x.name, (d) => {
        d.append(el("p", "g3-note", `${x.role || ""} · donnée du ${x.last_date ? s.dayShort(x.last_date) : "—"}`));
        const dl = el("dl", "g3-dl dt-dl3");
        const add = (k, v) => dl.append(el("dt", null, k), el("dd", null, v));
        add("Escales par jour (7 j)", nf1.format(x.calls_7d || 0));
        add("Pétroliers par jour (7 j · avant)", `${nf1.format(x.tanker_calls_7d || 0)} · ${nf1.format(x.tanker_calls_pre || 0)}`);
        add("Exportations par jour (7 j · avant)", `${nfi.format((x.export_t_7d || 0) / 1000)} kt · ${nfi.format((x.export_t_pre || 0) / 1000)} kt`);
        d.append(dl);
        const sr = x.series || [];
        if (sr.length) {
          d.append(el("span", "sit-mono sit-dim", "PÉTROLIERS PAR JOUR · 120 JOURS"), bars(sr.map((r) => [r[0], r[1]]), Math.max(1, ...sr.map((r) => r[1] || 0)), "sit-bars-acc dt-tall", "Pétroliers"),
            el("span", "sit-mono sit-dim", "EXPORTATIONS (TONNES) · 120 JOURS"), bars(sr.map((r) => [r[0], r[2], `${nfi.format(r[2] || 0)} t`]), Math.max(1, ...sr.map((r) => r[2] || 0)), "dt-blue dt-tall", "Exportations"));
          const axis = el("div", "sit-row"); axis.append(el("span", "sit-mono sit-dim", sr[0][0]), el("span", "sit-mono sit-dim", sr[sr.length - 1][0]));
          d.append(axis);
        }
      });
    }

    function renderStats() {
      const feed = el("div", "sit-feed g3-country");
      const st = (map && map.status) || {}, f = (map && map.fleet) || {};
      const tile = (k, v, sub, onClick) => {
        const b = el("button", "dt-tile"); b.type = "button";
        b.append(el("span", "sit-mono sit-dim", k), el("b", null, v), el("span", "sit-mono sit-dim", sub || ""));
        b.onclick = () => { stopTour(); onClick(); };
        return b;
      };
      const grid = el("div", "dt-tiles");
      const l24 = st.last24h || {}, l7 = st.last7d || {};
      const rz = ((map && map.radar && map.radar.last) || {}).zones || [];
      const rc = rz.reduce((a, z) => a + (z.count || 0), 0), rd = rz.reduce((a, z) => a + (z.dark || 0), 0);
      const ports = (map && map.ports) || [];
      const tNow = ports.reduce((a, x) => a + (x.tanker_calls_7d || 0), 0), tPre = ports.reduce((a, x) => a + (x.tanker_calls_pre || 0), 0);
      const re = ((map && map.reappeared) || {}).verdicts || {};
      const okSrc = ((map && map.health) || []).filter((x) => x.state === "ok").length;
      grid.append(
        tile("PASSAGES 24 H", nfi.format(l24.total || 0), `${nfi.format(l24.in || 0)} ENTRÉES · ${nfi.format(l24.out || 0)} SORTIES`, openTraffic),
        tile("PASSAGES 7 J", nfi.format(l7.total || 0), `${nfi.format(l7.tankers || 0)} PÉTROLIERS`, openTraffic),
        tile("À L'ARRÊT", nfi.format(f.stationary || 0), `${nfi.format(f.tankers || 0)} PÉTROLIERS`, openFleet),
        tile("EN MOUVEMENT", nfi.format(vessels.filter((v) => (v.speed || 0) >= 1).length), `SUR ${nfi.format(vessels.length)} VISIBLES`, openFleet),
        tile("BALISES COUPÉES", nfi.format(silent.length), `${nfi.format(Object.values(re).reduce((a, n) => a + n, 0))} RALLUMÉES`, () => setTab("balises")),
        tile("RADAR : SANS BALISE", rc ? `${nfi.format((rd / rc) * 100)} %` : "—", `${nfi.format(rd)} COQUES SUR ${nfi.format(rc)}`, () => setTab("radar")),
        tile("PÉTROLIERS AUX PORTS", tPre ? `${(tNow / tPre - 1) * 100 >= 0 ? "+" : ""}${nfi.format((tNow / tPre - 1) * 100)} %` : "—", "PAR RAPPORT À AVANT LA CRISE", () => setTab("ports")),
        tile("SOURCES", `${okSrc}/${((map && map.health) || []).length}`, "À JOUR", () => setTab("controles")),
      );
      feed.append(el("span", "sit-mono sit-acc", "STATISTIQUES · CLIQUER POUR CREUSER"), grid);
      const scen = (map && map.scenarios) || [];
      if (scen.length) {
        feed.append(el("span", "sit-mono sit-dim", "ATTENTE PRÉVUE SELON LE DÉBIT"));
        rowsOf(feed, scen, (x) => [`${nf1.format(x.wait_in_days)} j · ${nf1.format(x.wait_out_days)} j · `, x.label], () => setTab("attentes"));
      }
      feed.append(el("span", "sit-mono sit-dim", "AUTRES DÉTROITS DU PÉTROLE"));
      rowsOf(feed, STRAITS.filter((x) => !x.live), (x) => [`${x.name} · `, "repère, pas encore suivi"], (x) => go(STOPS.indexOf(x)));
      pane.append(feed);
    }

    function renderStraits() {
      const feed = el("div", "sit-feed");
      feed.append(el("span", "sit-mono sit-dim", "GRANDS PASSAGES DU PÉTROLE"));
      for (const x of STRAITS) {
        const b = el("button", `sit-conf${STOPS[state.stop] && STOPS[state.stop].id === x.id ? " on" : ""}`); b.type = "button";
        const row = el("span", "sit-row");
        row.append(el("b", null, x.name), el("span", `sit-mono ${x.live ? "sit-acc" : "sit-dim"}`, x.live ? "● SUIVI EN DIRECT" : "○ REPÈRE"));
        b.append(row, el("span", "sit-mono sit-dim", x.live && map ? `${nf1.format((map.status || {}).pct_of_normal || 0)} % DU TRAFIC NORMAL · ${nfi.format(vessels.length)} NAVIRES VISIBLES` : coord(x.lon, x.lat)));
        b.onclick = () => { stopTour(); go(STOPS.indexOf(x)); };
        feed.append(b);
      }
      feed.append(el("p", "g3-note", "Seul Ormuz est suivi en direct (Hormuz Watch) ; les autres passages sont des repères des routes du pétrole, qui seront suivis de la même façon plus tard."));
      pane.append(feed);
    }

    // ---- bandeau du bas : cours et titres
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
      for (const e of press.filter((x) => !s.isOsint(x)).sort(byTime).slice(0, 24)) {
        const url = s.safeUrl(e.url);
        const it = el(url ? "a" : "span", "sit-wire-item");
        if (url) { it.href = url; it.target = "_blank"; it.rel = "noopener noreferrer"; }
        it.append(el("b", null, (e.source || "").toUpperCase()), document.createTextNode(` ${e.title}`));
        items.push(it);
      }
      wtrack.replaceChildren(...items, ...items.map((n) => n.cloneNode(true)));
      wtrack.style.animationDuration = `${Math.max(60, items.length * 6)}s`;
    };
    fillWire([]);
    s.loadMarkets(api, 10).then(fillWire, () => {});

    // ---- scène : globe, calques, fiche du navire
    const gbox = el("div", "g3");
    const layersBox = el("div", "g3-layers");
    const card = el("div", "g3-card");
    card.hidden = true;
    stage.append(gbox, layersBox, card);
    const lhead = el("button", "g3-layers-head", "CALQUES ▾"); lhead.type = "button";
    lhead.onclick = () => { layersBox.classList.toggle("folded"); lhead.textContent = layersBox.classList.contains("folded") ? "CALQUES ▸" : "CALQUES ▾"; };
    layersBox.append(lhead);
    if (window.innerWidth < 900) { layersBox.classList.add("folded"); lhead.textContent = "CALQUES ▸"; }
    for (const [k, label] of LAYERS) {
      const b = el("button", `g3-layer dt-${k}`, label); b.type = "button";
      b.setAttribute("aria-pressed", String(!!state.layers[k]));
      b.onclick = () => { state.layers[k] = !state.layers[k]; save(); b.setAttribute("aria-pressed", String(state.layers[k])); drawLayers(); };
      layersBox.append(b);
    }
    stage.append(el("span", "g3-credit", "Golfe : NASA EOSDIS GIBS — AIS : hormuz.now (CC BY 4.0) — radar et optique : Copernicus Sentinel-1/2 — routes : Benden 2022 (CC BY-NC 4.0) — feux : NASA FIRMS"));

    // ---- tableau de bord complet d'Hormuz Watch, par-dessus la page (carte détaillée, replays) ; Échap ou ✕ pour revenir
    function openDashboard() {
      const ov = el("div", "dt-hw");
      const bar = el("div", "dt-hw-bar");
      const back = el("button", "sit-ghost", "← RETOUR AU GLOBE"); back.type = "button";
      bar.append(el("span", "sit-kicker", "[ HORMUZ WATCH ]"), el("span", "sit-sub", "tableau complet : carte détaillée, replays, files d'attente, radar · panneaux repliables (touche H)"), back);
      const f = el("iframe", "dt-hw-frame"); f.title = "Hormuz Watch"; f.src = window.MASTER_HW_URL ? window.MASTER_HW_URL() : "http://127.0.0.1:8765/";
      ov.append(bar, f);
      box.append(ov);
      const close = () => { ov.remove(); document.removeEventListener("keydown", esc); };
      const esc = (e) => { if (e.key === "Escape") close(); };
      back.onclick = close;
      document.addEventListener("keydown", esc);
      back.focus();
    }

    // Retrouver un navire (liste, fil, file d'attente) : vol vers sa position et sa fiche.
    function flyToVessel(id, name) {
      const sv = silent.find((v) => id && String(v.id) === String(id));
      const v = vessels.find((x) => id && String(x.id) === String(id)) || sv || vessels.find((x) => name && x.name === name) || silent.find((x) => name && x.name === name);
      if (!v) { showCard("absent", { name: name || "Navire", lon: null, lat: null }); return; }
      stage.querySelectorAll(".dt-detail").forEach((x) => x.remove());
      if (globe) globe.flyTo(v.lon, v.lat, 52, 1800);
      showCard(silent.includes(v) ? "silence" : v.cat === "tanker" ? "petroliers" : "cargos", v);
    }
    let only = null;  // cargaison seule affichée (détail de la flotte)

    function showCard(key, d) {
      if (!d) return;
      card.replaceChildren();
      const close = el("button", "g3-close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fermer");
      close.onclick = () => { card.hidden = true; if (globe) globe.selectMarker(null); drawMarkers(null); };
      const dl = el("dl", "g3-dl");
      const add = (k, v) => { if (v != null && v !== "") dl.append(el("dt", null, k), el("dd", null, String(v))); };
      if (key === "absent") {
        card.replaceChildren(close, el("span", "sit-mono sit-dim", "NAVIRE"), el("h2", null, d.name),
          el("p", "g3-note", "Pas de position dans les données AIS actuelles : balise coupée depuis longtemps ou navire sorti de la zone suivie."));
        card.hidden = false;
        return;
      }
      if (key === "radar") {
        card.append(close, el("span", `sit-mono ${d.ais ? "sit-acc" : "sit-esc"}`, d.ais ? "COQUE RADAR · BALISE CORRESPONDANTE" : "COQUE RADAR · AUCUNE BALISE"),
          el("h2", null, d.zone || "Radar"));
        add("Passage", d.when ? `${s.dayShort(d.when)} · ${s.hm(d.when)} UTC` : null); add("Longueur estimée", d.len_m ? `${nfi.format(d.len_m)} m` : null);
        add("Position", coord(d.lon, d.lat));
        card.append(dl, el("p", "g3-note", d.ais ? "Une position AIS se trouvait à moins d'un kilomètre." : "Aucune position AIS à proximité au moment du passage : navire probablement balise coupée (ou petite embarcation)."));
      } else if (key === "marines" && d.kind === "zone") {
        card.append(close, el("span", "sit-mono sit-acc", "NAVIRES MILITAIRES · ZONE DÉCLARÉE"), el("h2", null, d.zone));
        const t = (naval && naval.tracker) || {};
        add("Source", "US Navy, via USNI News Fleet Tracker"); add("Publié", t.date ? `${s.dayShort(t.date)}${naval.tracker_age_days != null ? ` (il y a ${Math.round(naval.tracker_age_days)} j)` : ""}` : null);
        add("Navires", d.ships.length);
        card.append(badge("declaration"), dl);
        const ul = el("div", "g3-list");
        for (const sh of d.ships) ul.append(el("p", "sit-mono", `${sh.name} (${sh.hull}) · ${sh.type}`));
        card.append(ul, el("p", "g3-note", "Une zone, pas une position : le cercle marque la région citée par l'US Navy, pas l'emplacement des navires."));
      } else if (key === "marines") {
        card.append(close, el("span", "sit-mono sit-acc", "BALISE MILITAIRE (PROBABLE)"), el("h2", null, d.name || "—"));
        add("Pavillon", d.flag); add("MMSI", d.mmsi); add("Indice", d.why); add("Vitesse", d.speed != null ? `${nf1.format(d.speed)} nœuds` : null); add("Position", coord(d.lon, d.lat));
        card.append(badge("probable"), dl, el("p", "g3-note", "Signalé d'après le type ou le nom déclarés par la balise AIS : une balise peut se tromper ou être usurpée."));
      } else if (key === "bases") {
        card.append(close, el("span", "sit-mono sit-acc", "BASE ÉTRANGÈRE"), el("h2", null, d.name || "—"));
        add("Opérée par", (d.operator || "").toUpperCase()); add("Pays hôte", (d.host || "").toUpperCase());
        card.append(dl, el("p", "g3-note", "Wikidata (CC0) : liste incomplète."));
      } else if (key === "feux") {
        card.append(close, el("span", "sit-mono sit-acc", "FEU EN MER · NASA FIRMS"), el("h2", null, coord(d.lon, d.lat)));
        add("Détecté", d.time ? `${s.dayShort(d.time)} · ${s.hm(d.time)} UTC` : null); add("Puissance", d.frp != null ? `${nf1.format(d.frp)} MW` : null);
        add("Navire proche", d.vessel || "aucun"); add("Installation fixe", d.fixed ? "oui" : "non");
        card.append(dl);
      } else {
        const isSilent = key === "silence";
        card.append(close, el("span", `sit-mono ${isSilent ? "sit-esc" : "sit-acc"}`, isSilent ? "BALISE COUPÉE (PROBABLE)" : `NAVIRE · ${(SEG[d.seg] || SEG.other)[0].toUpperCase()}`), el("h2", null, d.name || "—"));
        add("Type", d.type); add("Pavillon", d.flag); add("Destination déclarée", d.dest); add("Zone", d.zone);
        if (d.dwt) add("Port en lourd", `${nfi.format(d.dwt)} t`);
        if (isSilent) { add("Silence", d.silent_h != null ? `${nf1.format(d.silent_h)} h` : null); add("Dernier signal", d.last_signal ? `${s.dayShort(d.last_signal)} · ${s.hm(d.last_signal)} UTC` : null); }
        else { add("Vitesse", d.speed != null ? `${nf1.format(d.speed)} nœuds` : null); add("Cap", d.course != null ? `${d.course}°` : null); add("Position vue", d.age_min != null ? `il y a ${nfi.format(d.age_min)} min` : null); }
        add("Position", coord(d.lon, d.lat));
        card.append(dl);
        if (isSilent && d.level) card.append(badge(d.level));
        const sm = sanctionOf(d);
        if (sm) {
          const w = el("div", "dt-sanc");
          w.append(el("b", null, `SANCTIONNÉ · OFAC ${(sm.entry.programs || []).join(" · ")}`), badge(sm.level),
            el("span", null, `${METHOD[sm.level]} (${sm.method}) : « ${sm.entry.name} »${sm.entry.imo ? `, IMO ${sm.entry.imo}` : ""}${(sm.entry.linked || []).length ? `, lié à ${sm.entry.linked.join(", ")}` : ""}.`));
          card.append(w);
        }
      }
      card.hidden = false;
      drawMarkers({ lon: d.lon, lat: d.lat, label: d.name || coord(d.lon, d.lat) });
    }

    function drawMarkers(pick) {
      if (!globe) return;
      const marks = STRAITS.map((x) => ({ id: x.id, lon: x.lon, lat: x.lat, tone: x.live ? "hot" : "", maxZoom: x.live ? 10 : undefined,
        label: x.live ? `${x.name} · ${map ? `${nf1.format((map.status || {}).pct_of_normal || 0)} % DU TRAFIC` : "EN DIRECT"}` : x.name,
        onClick: () => { stopTour(); go(STOPS.indexOf(x)); } }));
      if (state.layers.zones) for (const z of zones) marks.push({ id: `z-${z.id}`, lon: z.lon, lat: z.lat, tone: "dt-zone", minZoom: 26,
        label: `${z.name} · ${nfi.format(z.count || 0)}`, onClick: () => { stopTour(); globe.flyTo(z.lon, z.lat, 48); } });
      if (pick) marks.push({ id: "pick", lon: pick.lon, lat: pick.lat, tone: "sel", label: pick.label });
      globe.setMarkers(marks);
      globe.selectMarker(pick ? "pick" : STOPS[state.stop] && STOPS[state.stop].id);
    }

    const liveLayers = {};
    function drawLayers() {
      if (!globe) return;
      const L = state.layers;
      const ship = (v) => ({ lon: v.lon, lat: v.lat, size: v.speed >= 1 ? 6.5 : 4.5, color: (SEG[v.seg] || SEG.other)[1], alpha: v.speed >= 1 ? 0.95 : 0.6, data: v });
      const keep = (v) => !only || (v.seg || "other") === only;
      globe.setPoints("petroliers", L.petroliers ? tankers.filter(keep).map(ship) : [], 1.0012, true);
      globe.setPoints("cargos", L.cargos ? vessels.filter((v) => v.cat !== "tanker" && keep(v)).map(ship) : [], 1.0012, true);
      globe.setPoints("silence", L.silence ? silent.map((v) => ({ lon: v.lon, lat: v.lat, size: 9, color: "#e5484d", alpha: 0.9, data: v })) : [], 1.0013, true);
      const sm = (sanctions && sanctions.matches) || [];
      globe.setPoints("sanctions", L.sanctions ? sm.filter((m) => m.level !== "non_confirme" && m.vessel.lat != null).map((m) => ({ lon: m.vessel.lon, lat: m.vessel.lat,
        size: m.level === "confirme" ? 15 : 11, color: "#ff2d55", alpha: 0.95, data: { ...m.vessel, sanction: m } })) : [], 1.0015, true);
      for (const id of ["avions-militaires", "seismes"]) {
        if (!window.MASTER_LIVE) break;
        if (L[id] && !liveLayers[id]) { liveLayers[id] = "…"; window.MASTER_LIVE.load(id).then((dd) => { liveLayers[id] = dd || { items: [] }; drawLayers(); }); }
        if (liveLayers[id] && liveLayers[id] !== "…") window.MASTER_LIVE.draw(globe, id, liveLayers[id], !!L[id], id === "seismes" ? [40, 10, 75, 40] : null);
      }
      globe.setCircles("marines-zones", L.marines ? navZones().map((z) => ({ lon: z.lon, lat: z.lat, km: 260 })) : [], "#6f9cf2");
      globe.setPoints("marines", L.marines ? [...navZones().map((z) => ({ lon: z.lon, lat: z.lat, size: 14, color: "#6f9cf2", alpha: 0.95, data: { ...z, kind: "zone" } })),
        ...((naval && naval.ais) || []).map((v) => ({ lon: v.lon, lat: v.lat, size: 10, color: "#c58af9", alpha: 0.95, data: { ...v, kind: "ais" } }))] : [], 1.0015, true);
      globe.setPoints("feux", L.feux ? ((map && map.fires_at_sea) || []).map((f) => ({ lon: f.lon, lat: f.lat, size: 12, color: "#ff6a2b", alpha: 0.95, data: f })) : [], 1.0014);
      globe.setPoints("osint", L.osint ? press.filter((e) => e.lat != null && e.lon != null).map((e) => ({ lon: e.lon, lat: e.lat, size: 8, color: "#e5484d", alpha: 0.5, data: e })) : [], 1.0014);
      globe.setPoints("bases", L.bases && W ? W.bases.map((b) => ({ lon: b.lon, lat: b.lat, size: 8, color: "#93b4f0", alpha: 0.9, data: b })) : [], 1.0014);
      globe.setCircles("zones", L.zones ? zones.map((z) => ({ lon: z.lon, lat: z.lat, km: z.radius_km || 20 })) : [], "#e9d24a");
      const rz = ((map && map.radar && map.radar.last) || {}).zones || [];
      globe.setPoints("radar", L.radar ? rz.flatMap((z) => z.detections.map((x) => ({ lon: x.lon, lat: x.lat, size: x.ais ? 5 : 9,
        color: x.ais ? "#ecebe4" : "#d946ef", alpha: 0.95, data: { ...x, zone: z.label, when: map.radar.last.datetime } }))) : [], 1.0014, true);
      const img = (name) => `/api/hormuz/image/${encodeURIComponent(name)}`;
      globe.setOverlays(ONLINE() ? [] : [
        ...(L.imgoptique ? ((map && map.optical) || []).filter((o) => o.bbox).map((o) => ({ bbox: o.bbox, url: img(o.image), opacity: 0.95 })) : []),
        ...(L.imgradar ? rz.filter((z) => z.image && z.bbox).map((z) => ({ bbox: z.bbox, url: img(z.image), opacity: 0.85 })) : []),
      ]);
      globe.setLanes(L.petrole ? ROUTES : []);
      globe.setOutlines("routes", L.routes && W && W.lanes ? [...(W.lanes.major || []), ...(W.lanes.middle || [])].map((c) => ({ geometry: { type: "LineString", coordinates: c } })) : [], "#a3a199", 0.35);
      drawMarkers(null);
    }

    // ---- visite guidée
    function go(i) {
      state.stop = (i + STOPS.length) % STOPS.length;
      const x = STOPS[state.stop];
      if (globe) { globe.flyTo(x.lon, x.lat, x.zoom, 2600); globe.selectMarker(x.id); }
      if (state.tab === "detroits") setTab("detroits");
    }
    let tourTimer = null;
    const paintPlay = () => { play.textContent = state.tour ? "❚❚ VISITE GUIDÉE" : "▶ VISITE GUIDÉE"; play.setAttribute("aria-pressed", String(state.tour)); };
    function stopTour() { state.tour = false; clearInterval(tourTimer); paintPlay(); }
    function startTour() {
      state.tour = true; clearInterval(tourTimer); paintPlay();
      tourTimer = setInterval(() => { if (!box.isConnected) { clearInterval(tourTimer); return; } go(state.stop + 1); }, 11000);
    }
    play.onclick = () => (state.tour ? stopTour() : startTour());
    prev.onclick = () => { stopTour(); go(state.stop - 1); };
    // ---- navires militaires : zones déclarées par l'US Navy (USNI News) et balises militaires vues par l'AIS
    let naval = null;
    navP.then((d) => { naval = d; drawLayers(); if (state.tab === "marines") setTab("marines"); });
    const navZones = () => ((naval && naval.tracker && naval.tracker.zones) || []);
    const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//.test(u) ? u : null);
    function renderNaval() {
      const feed = el("div", "sit-feed g3-country");
      if (!naval) { feed.append(el("p", "sit-dim", window.MASTER_STATIC ? "Non publié." : "Lecture du Fleet Tracker…")); pane.append(feed); return; }
      const t = naval.tracker;
      const ships = navZones().reduce((n, z) => n + z.ships.length, 0);
      head(feed, `NAVIRES MILITAIRES · ${ships} DÉCLARÉS · ${(naval.ais || []).length} BALISES`);
      if (t) {
        const age = naval.tracker_age_days;
        const meta = el("p", "g3-note", `${t.title} · publié ${t.date ? s.dayShort(t.date) : "—"}${age != null ? ` (il y a ${Math.round(age)} j)` : ""}`);
        feed.append(meta);
        if (age != null && age > 10) feed.append(el("p", "g3-note sit-esc", `Données anciennes : le dernier relevé publié date de ${Math.round(age)} jours ; les navires ont pu bouger depuis.`));
        for (const z of navZones()) {
          head(feed, `${z.zone.toUpperCase()} · ${z.ships.length}`);
          const b = el("button", "sit-conf"); b.type = "button";
          const row = el("span", "sit-row"); row.append(el("b", null, z.zone), badge(naval.tracker_level || "declaration"));
          b.append(row);
          for (const sh of z.ships) b.append(el("span", "sit-mono sit-dim", `${sh.name} (${sh.hull}) · ${sh.type}`));
          b.onclick = () => { stopTour(); if (globe) globe.flyTo(z.lon, z.lat, 8); showCard("marines", { ...z, kind: "zone" }); };
          feed.append(b);
        }
        const u = safeUrl(t.url);
        if (u) { const a = el("a", "sit-link", "Lire le Fleet Tracker (USNI News)"); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer"; feed.append(a); }
      } else feed.append(el("p", "sit-dim", naval.error ? `Fleet Tracker injoignable (${naval.error}).` : "Pas de Fleet Tracker lu."));
      head(feed, `BALISES MILITAIRES (AIS) · ${(naval.ais || []).length}`);
      if (!(naval.ais || []).length) feed.append(el("p", "sit-dim", "Aucune balise militaire dans la dernière photo AIS : les navires de guerre naviguent en général balise coupée."));
      for (const v of naval.ais || []) {
        const b = el("button", "sit-conf"); b.type = "button";
        const row = el("span", "sit-row"); row.append(el("b", null, v.name || "—"), badge(v.level));
        b.append(row, el("span", "sit-mono sit-dim", `${v.flag || "?"} · ${v.why}`));
        b.onclick = () => { stopTour(); if (globe) globe.flyTo(v.lon, v.lat, 40); showCard("marines", { ...v, kind: "ais" }); };
        feed.append(b);
      }
      note(feed, naval.note || "");
      pane.append(feed);
    }
    next.onclick = () => { stopTour(); go(state.stop + 1); };

    setTab(state.tab || "events");
    try {
      const mod = await import(`${window.MASTER_STATIC ? "./" : "/assets/"}globe3d.js?v=4f11ee7317`);
      globe = mod.createGlobe(gbox, {
        lon: 56.4, lat: 26.2, maxZoom: 60, autoSpin: () => false,
        clickable: ["sanctions", "marines", "live-avions-militaires", "live-seismes", "radar", "silence", "petroliers", "cargos", "feux", "bases"],
        onPickLonLat: (ll) => { if (draw) draw.handle(ll); },
        onPickPoint: (key, d) => {
          stopTour();
          if (key === "sanctions") { showCard(d.silent ? "silence" : "petroliers", { ...(vessels.find((v) => String(v.id) === String(d.id)) || silent.find((v) => String(v.id) === String(d.id)) || d) }); return; }
          if (key.startsWith("live-")) { const c = window.MASTER_LIVE.card(d, () => { card.hidden = true; }); if (c) { card.replaceChildren(...c.childNodes); card.hidden = false; } return; }
          showCard(key, d);
        },
      });
      sit.world = globe;
      globe.setStyle(state.style);
      if (W) globe.setBorders(W.borders.coordinates || []);
      if (gulf && gulf.bbox) globe.setPatch({ bbox: gulf.bbox, day: "gulf-day.jpg", night: "gulf-night.jpg" });
      draw = window.MASTER_DRAW ? window.MASTER_DRAW.attach({ el, globe, stage, points: () => [
        ...vessels.map((v) => ({ lon: v.lon, lat: v.lat, kind: v.cat === "tanker" ? "pétroliers" : "cargos", title: `${v.name} (${v.type || "?"})` })),
        ...silent.map((v) => ({ lon: v.lon, lat: v.lat, kind: "balises coupées", title: v.name })),
        ...(((sanctions && sanctions.matches) || []).filter((m) => m.vessel.lat != null).map((m) => ({ lon: m.vessel.lon, lat: m.vessel.lat, kind: "navires sanctionnés", title: `${m.vessel.name} (${m.level})` }))),
        ...((((map && map.radar && map.radar.last) || {}).zones || []).flatMap((z) => z.detections.map((x) => ({ lon: x.lon, lat: x.lat, kind: x.ais ? "coques radar avec balise" : "coques radar sans balise", title: z.label })))),
        ...((map && map.fires_at_sea) || []).map((f) => ({ lon: f.lon, lat: f.lat, kind: "feux en mer", title: f.time || "" })),
        ...((naval && naval.ais) || []).map((v) => ({ lon: v.lon, lat: v.lat, kind: "balises militaires", title: v.name })),
        ...Object.entries(liveLayers).filter(([, d]) => d && d.items).flatMap(([k, d]) => d.items.map((x) => ({ lon: x.lon, lat: x.lat, kind: k === "seismes" ? "séismes" : "avions militaires", title: x.title || x.callsign || "" }))),
      ] }) : null;
      drawLayers();
      let goto = null;
      try { goto = JSON.parse(localStorage.getItem("master-globe-goto") || "null"); localStorage.removeItem("master-globe-goto"); } catch { /* */ }
      if (goto && Date.now() - (goto.at || 0) < 120000) { state.tour = false; globe.flyTo(goto.lon, goto.lat, goto.zoom || 14, 2400); }
      else go(0);
      if (!STILL && state.tour) startTour(); else paintPlay();
    } catch (err) {
      gbox.append(el("p", "sit-err", `Globe 3D indisponible : ${err.message}`));
      paintPlay();
    }
    if (!map) stage.append(el("p", "dt-warn", "Hormuz Watch ne répond pas : navires et zones indisponibles, le reste de la page reste à jour."));
  }

  window.MASTER_DETROITS = viewDetroits;
})();
