/* Master — rubriques « Situation » (globe et fil en direct) et « Développements » (frise des événements clés).
 *
 * Inspiré de la mise en page d'insidegeopolitics.com (globe au centre, sujet suivi à gauche, fil à droite, bandeau de
 * titres en bas), reconstruite ici avec nos propres données et notre propre code : globe dessiné en 2D (d3-geo,
 * projection orthographique) sur le fond de pays world-atlas (Natural Earth), copiés et vérifiés dans vendor/geo.
 * Tout texte venant des données passe par textContent ; les liens externes ne sont rendus qu'en http(s).
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (iso) => { const d = new Date(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const dayShort = (iso) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso)).toUpperCase();
  function ago(iso) {
    const m = (Date.now() - Date.parse(iso)) / 60000;
    if (!(m >= 1)) return "à l'instant";
    if (m < 60) return `il y a ${Math.round(m)} min`;
    if (m < 48 * 60) return `il y a ${Math.round(m / 60)} h`;
    return `il y a ${Math.round(m / 1440)} j`;
  }
  const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
  const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Étiquette de chaque type d'événement dans le fil (et sa teinte).
  const TAG = {
    incident: ["Escalade", "hot"], transits_drop: ["Chute du trafic", "hot"], dark_transit: ["Balise coupée", "warm"],
    price_spike: ["Choc de prix", "warm"], price_drop: ["Choc de prix", "warm"], transits_rebound: ["Reprise", "cool"],
    crossing: ["Passage", "mute"], declaration: ["Déclaration", "talk"], key_date: ["Date clé", "acc"],
    headline: ["Presse", "mute"],
  };
  const isOsint = (e) => e.kind === "headline" && e.data && (e.data.channel === "telegram" || e.data.channel === "json-irw");
  const tagOf = (e) => (e.data && e.data.channel === "json-irw" ? ["OSINT · IA", "warm"] : isOsint(e) ? ["OSINT", "talk"] : e.kind === "headline" && e.level === "probable" ? ["Recoupé", "cool"] : TAG[e.kind]);
  const PLACE = { hormuz: "Détroit d'Ormuz" };
  // Événements clés : ceux qui font l'actualité (les passages sans balise, très nombreux, restent dans le fil de droite).
  const KEY_KINDS = ["incident", "declaration", "key_date", "transits_drop", "transits_rebound", "price_spike", "price_drop"];

  // Points du globe : Ormuz porte les données ; les autres grands passages maritimes sont des repères, pas encore suivis.
  const HOTSPOTS = [
    { id: "hormuz", name: "Détroit d'Ormuz", lon: 56.3, lat: 26.55, live: true },
    { id: "bab", name: "Bab el-Mandeb", lon: 43.4, lat: 12.6 },
    { id: "suez", name: "Canal de Suez", lon: 32.55, lat: 30.4 },
    { id: "malacca", name: "Détroit de Malacca", lon: 100.3, lat: 3.1 },
    { id: "bosphore", name: "Bosphore", lon: 29.05, lat: 41.1 },
    { id: "cap", name: "Cap de Bonne-Espérance", lon: 18.5, lat: -34.4 },
  ];
  // Routes du pétrole au départ du Golfe (points de passage, tracées en grands cercles).
  const ROUTES = [
    [[56.3, 26.55], [58.6, 23.6], [61.5, 15.5], [79.5, 5.5], [95.5, 5.8], [100.3, 3.1], [104.2, 1.3], [114.5, 12.0], [121.5, 25.5], [131.0, 33.5]],
    [[56.3, 26.55], [58.6, 23.6], [51.0, 13.5], [43.4, 12.6], [38.6, 20.2], [33.6, 27.8], [32.55, 30.4], [31.5, 33.0], [20.0, 35.0], [-5.6, 35.95], [-9.5, 43.0], [3.0, 51.5]],
    [[56.3, 26.55], [58.6, 23.6], [55.0, 10.0], [45.0, -12.0], [35.5, -27.5], [18.5, -34.4], [8.0, -10.0], [-9.0, 15.0], [-12.0, 36.0], [3.0, 51.5]],
  ];

  // ------------------------------------------------------------ globe (canvas 2D, projection orthographique)
  let WORLD = null;
  async function loadWorld() {
    if (WORLD) return WORLD;
    const base = window.MASTER_STATIC ? "vendor/geo/" : "/assets/vendor/geo/";  // version en ligne : chemins relatifs
    const get = async (f) => { const r = await fetch(base + f, { credentials: "same-origin" }); if (!r.ok) throw new Error(`${f} : ${r.status}`); return r.json(); };
    const [lo, hi] = await Promise.all([get("countries-110m.json"), get("countries-50m.json")]);
    WORLD = {
      lo: topojson.feature(lo, lo.objects.countries), loBorders: topojson.mesh(lo, lo.objects.countries, (a, b) => a !== b),
      hi: topojson.feature(hi, hi.objects.countries), hiBorders: topojson.mesh(hi, hi.objects.countries, (a, b) => a !== b),
    };
    return WORLD;
  }

  function makeGlobe(canvas, opts) {
    const ctx = canvas.getContext("2d");
    const proj = d3.geoOrthographic().clipAngle(90).precision(0.4);
    const path = d3.geoPath(proj, ctx);
    const graticule = d3.geoGraticule10();
    const routes = ROUTES.map((pts) => ({ type: "LineString", coordinates: pts }));
    const st = { rot: [-56, -22], zoom: 1, sel: "hormuz", moving: false, dragging: false, lastUser: 0, flight: null, dash: 0, t0: performance.now() };
    let W = 0, H = 0, R = 0, dpr = 1, raf = 0, alive = true;

    function size() {
      dpr = window.devicePixelRatio || 1;
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.42;
    }
    function visible(lon, lat) { return d3.geoDistance([lon, lat], [-st.rot[0], -st.rot[1]]) < Math.PI / 2 - 0.02; }

    function draw(now) {
      const r = R * st.zoom;
      proj.scale(r).translate([W / 2, H / 2]).rotate([st.rot[0], st.rot[1], 0]);
      ctx.clearRect(0, 0, W, H);
      // halo d'atmosphère
      const halo = ctx.createRadialGradient(W / 2, H / 2, r * 0.92, W / 2, H / 2, r * 1.22);
      halo.addColorStop(0, "rgba(233,210,74,0.10)"); halo.addColorStop(1, "rgba(233,210,74,0)");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(W / 2, H / 2, r * 1.22, 0, 2 * Math.PI); ctx.fill();
      // sphère (océan) avec un léger éclairage
      const sea = ctx.createRadialGradient(W / 2 - r * 0.35, H / 2 - r * 0.4, r * 0.1, W / 2, H / 2, r);
      sea.addColorStop(0, "#15171a"); sea.addColorStop(1, "#060707");
      ctx.fillStyle = sea; ctx.beginPath(); path({ type: "Sphere" }); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 0.6; ctx.beginPath(); path(graticule); ctx.stroke();
      // terres et frontières (fond fin à l'arrêt, plus léger en mouvement)
      const fine = !st.moving && !st.dragging && st.zoom > 1.25;
      const land = fine ? WORLD.hi : WORLD.lo, borders = fine ? WORLD.hiBorders : WORLD.loBorders;
      ctx.fillStyle = "#1d1e1b"; ctx.beginPath(); path(land); ctx.fill();
      ctx.strokeStyle = "rgba(236,235,228,0.16)"; ctx.lineWidth = 0.55; ctx.beginPath(); path(borders); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.beginPath(); path({ type: "Sphere" }); ctx.stroke();
      // routes du pétrole, tirets qui défilent vers la destination
      ctx.save();
      ctx.strokeStyle = "rgba(233,210,74,0.55)"; ctx.lineWidth = 1.2; ctx.setLineDash([2, 6]); ctx.lineDashOffset = -st.dash;
      for (const g of routes) { ctx.beginPath(); path(g); ctx.stroke(); }
      ctx.restore();
      // événements géolocalisés (presse OSINT) : petits points rouges, plus vifs quand ils sont récents
      for (const p of opts.points()) {
        if (!visible(p.lon, p.lat)) continue;
        const [x, y] = proj([p.lon, p.lat]);
        const age = Math.min(1, (Date.now() - Date.parse(p.time)) / 864e5 / 2);
        ctx.fillStyle = `rgba(229,72,77,${0.95 - age * 0.6})`;
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = `rgba(229,72,77,${0.35 - age * 0.25})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI); ctx.stroke();
      }
      // points chauds
      const tsec = (now - st.t0) / 1000;
      for (const h of HOTSPOTS) {
        if (!visible(h.lon, h.lat)) continue;
        const [x, y] = proj([h.lon, h.lat]);
        const col = h.live ? opts.color(h) : "rgba(236,235,228,0.55)";
        if (h.live && !STILL) {
          for (let k = 0; k < 2; k++) {
            const f = ((tsec / 2.4) + k / 2) % 1;
            ctx.strokeStyle = col.replace("ALPHA", String(0.7 * (1 - f))); ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(x, y, 5 + f * 26, 0, 2 * Math.PI); ctx.stroke();
          }
        }
        ctx.fillStyle = col.replace("ALPHA", "1");
        ctx.beginPath(); ctx.arc(x, y, h.live ? 4.5 : 2.6, 0, 2 * Math.PI); ctx.fill();
        if (st.sel === h.id) {  // repère de sélection et étiquette
          ctx.strokeStyle = "rgba(233,210,74,0.9)"; ctx.lineWidth = 1;
          ctx.strokeRect(x - 11, y - 11, 22, 22);
          ctx.beginPath(); ctx.moveTo(x + 11, y - 11); ctx.lineTo(x + 34, y - 30); ctx.lineTo(x + 46, y - 30); ctx.stroke();
          ctx.font = "500 10.5px 'Geist Mono', ui-monospace, monospace"; ctx.fillStyle = "#ecebe4";
          ctx.fillText(h.name.toUpperCase(), x + 50, y - 33);
          ctx.fillStyle = "rgba(236,235,228,0.5)";
          ctx.fillText(`${Math.abs(h.lat).toFixed(2)}°${h.lat >= 0 ? "N" : "S"} ${Math.abs(h.lon).toFixed(2)}°${h.lon >= 0 ? "E" : "O"}`, x + 50, y - 20);
        }
      }
    }

    function tick(now) {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden || !WORLD) return;
      if (st.flight) {  // vol vers un point : interpolation de la rotation et du zoom
        const f = Math.min(1, (now - st.flight.t) / st.flight.ms), e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        const c = st.flight.interp(e);
        st.rot = [-c[0], -c[1]];
        st.zoom = st.flight.z0 + (st.flight.z1 - st.flight.z0) * e;
        st.moving = f < 1;
        if (f >= 1) st.flight = null;
      } else if (!STILL && !st.dragging && now - st.lastUser > 15000 && opts.autoSpin()) {
        st.rot = [st.rot[0] + 0.035, st.rot[1]];  // rotation lente au repos
        st.moving = true;
      } else st.moving = false;
      if (!STILL) st.dash = (st.dash + 0.25) % 64;
      draw(now);
    }

    function flyTo(h, zoom = 1.9, ms = 2200) {
      st.sel = h.id;
      const from = [-st.rot[0], -st.rot[1]];
      st.flight = { interp: d3.geoInterpolate(from, [h.lon, h.lat - 8]), t: performance.now(), ms: STILL ? 1 : ms, z0: st.zoom, z1: zoom };
    }

    // Glisser pour tourner, molette pour zoomer, clic sur un point pour le choisir.
    let start = null;
    canvas.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY, rot: st.rot.slice(), moved: false }; st.dragging = true; st.flight = null; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointermove", (e) => {
      if (!start) { canvas.style.cursor = pick(e) ? "pointer" : "grab"; return; }
      const k = 70 / (R * st.zoom) * 2.2;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
      st.rot = [start.rot[0] + dx * k, Math.max(-80, Math.min(80, start.rot[1] - dy * k))];
      st.lastUser = performance.now();
    });
    const end = (e) => { if (start && !start.moved) { const h = pick(e); if (h) opts.onPick(h); } start = null; st.dragging = false; st.lastUser = performance.now(); };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); st.zoom = Math.max(0.7, Math.min(6, st.zoom * Math.exp(-e.deltaY * 0.0015))); st.lastUser = performance.now(); }, { passive: false });
    function pick(e) {
      const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      for (const h of HOTSPOTS) {
        if (!visible(h.lon, h.lat)) continue;
        const [px, py] = proj([h.lon, h.lat]);
        if ((px - x) ** 2 + (py - y) ** 2 < 14 ** 2) return h;
      }
      return null;
    }
    const ro = new ResizeObserver(() => { size(); draw(performance.now()); });
    ro.observe(canvas);
    size();
    raf = requestAnimationFrame(tick);
    return {
      flyTo, select: (id) => { st.sel = id; },
      destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); },
      get alive() { return alive && canvas.isConnected; },
    };
  }

  // ------------------------------------------------------------ données communes
  async function loadMarkets(api, days = 40) {  // dernier cours et variation de chaque instrument (le bandeau)
    const instruments = await api("/api/instruments");
    const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
    const out = await Promise.all(instruments.map(async (i) => {
      try {
        // version en ligne : l'instantané n'enregistre que la réponse complète (sans « since »)
        const p = await api(window.MASTER_STATIC ? `/api/prices/${i.symbol}` : `/api/prices/${encodeURIComponent(i.symbol)}?since=${since}`);
        return { ...i, rows: p.rows || [] };
      } catch { return { ...i, rows: [] }; }  // version en ligne : seules les réponses enregistrées existent
    }));
    return out;
  }
  function lastChange(rows) {
    if (!rows || rows.length < 2) return null;
    return (rows[rows.length - 1][1] / rows[rows.length - 2][1] - 1) * 100;
  }

  // ------------------------------------------------------------ Situation
  const sit = { globe: null, tour: true, stop: 0, timer: null };

  async function viewSituation(root) {
    const ui = U();
    const { el, api, badge, nf1, nf2 } = ui;
    if (sit.globe) { sit.globe.destroy(); sit.globe = null; }
    clearInterval(sit.timer);
    // Événements d'Ormuz (Hormuz Watch, dérivés) et titres de presse (médias et canaux OSINT, thème « actualite »).
    const [o, events, press] = await Promise.all([api("/api/overview"), api("/api/events?theme=hormuz&limit=150"),
      api("/api/events?theme=actualite&limit=300").catch(() => [])]);
    const h = o.hormuz;
    const byTime = (a, b) => (a.time < b.time ? 1 : -1);
    const osint = press.filter(isOsint);
    const gulfPress = press.filter((e) => !isOsint(e) && e.data && e.data.topic === "hormuz");
    const live = [...events.filter((e) => e.kind !== "crossing"), ...osint, ...gulfPress].sort(byTime);
    // Mises à jour du sujet suivi : événements clés d'Ormuz et titres sur le Golfe recoupés par au moins deux médias.
    const keys = [...events.filter((e) => KEY_KINDS.includes(e.kind) && !e.kind.startsWith("price_")),
      ...gulfPress.filter((e) => e.level === "probable")].sort(byTime);

    const box = el("div", "sit");
    root.append(box);

    // Barre du haut : rubrique, visite guidée, heure
    const top = el("div", "sit-top");
    const brand = el("div", "sit-brand");
    brand.append(el("span", "sit-kicker", "[ SITUATION ]"), el("span", "sit-sub", "Vue d'ensemble · crises suivies et routes du pétrole"));
    const tour = el("div", "sit-tour");
    const prev = el("button", "sit-ghost", "‹"), next = el("button", "sit-ghost", "›"), play = el("button", "sit-ghost sit-play");
    for (const b of [prev, next, play]) b.type = "button";
    prev.setAttribute("aria-label", "Point précédent"); next.setAttribute("aria-label", "Point suivant");
    tour.append(prev, play, next);
    const clock = el("div", "sit-clock");
    const tick = () => { clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`; };
    tick();
    sit.timer = setInterval(() => { if (!box.isConnected) { clearInterval(sit.timer); return; } tick(); }, 1000);
    top.append(brand, tour, clock);
    box.append(top);

    // Colonne de gauche : le sujet suivi et ses mises à jour
    const left = el("aside", "sit-left");
    const lh = el("div", "sit-row");
    lh.append(el("span", "sit-live", "● SUIVI EN DIRECT"));
    const det = el("a", "sit-link", "Fiche détroit →"); det.href = "#detroits"; lh.append(det);
    const title = el("h1", "sit-title");
    title.append(document.createTextNode("Crise du "), el("em", null, "détroit d'Ormuz"), document.createTextNode(" : trafic, incidents et marchés"));
    left.append(lh, title);
    if (h) {
      const s = el("p", "sit-status");
      const label = { restricted: "restreint", open: "ouvert", closed: "fermé", disrupted: "perturbé" }[String(h.status_label || "").toLowerCase()] || h.status_label || "—";
      s.append(el("b", null, `Trafic ${label}`), document.createTextNode(` · ${nf1.format(h.pct_of_normal || 0)} % du normal · ${nf1.format(h.transits_per_day_7d || 0)} passages/jour (avant-guerre ${Math.round(h.baseline_per_day || 0)}) · ${h.stationary ?? "—"} navires à l'arrêt`));
      left.append(s);
    }
    const ul = el("div", "sit-updates");
    const uhead = el("div", "sit-row");
    uhead.append(el("span", "sit-mono sit-acc", `● MISES À JOUR · ${keys.length}`));
    ul.append(uhead);
    const list = el("ol", "sit-list");
    const renderUpdates = (n) => {
      list.replaceChildren();
      for (const e of keys.slice(0, n)) {
        const li = el("li");
        const meta = el("div", "sit-meta");
        meta.append(el("span", null, `${Date.now() - Date.parse(e.time) < 864e5 ? "Aujourd'hui" : dayShort(e.time)} · ${hm(e.time)} UTC`));
        const url = safeUrl(e.url);
        if (url) { const a = el("a", "sit-src", "SOURCE ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.append(a); }
        const p = el("p", null, e.title);
        li.append(meta, p);
        li.tabIndex = 0;
        li.onclick = (ev) => { if (!ev.target.closest("a")) ui.openEvent(e); };
        li.onkeydown = (ev) => { if (ev.key === "Enter") ui.openEvent(e); };
        list.append(li);
      }
      if (keys.length > n) {
        const more = el("button", "sit-more", `AFFICHER ${keys.length - n} MISES À JOUR PLUS ANCIENNES`);
        more.type = "button"; more.onclick = () => renderUpdates(keys.length); list.append(more);
      }
    };
    renderUpdates(6);
    ul.append(list);
    left.append(ul);
    if (h) left.append(el("div", "sit-mono sit-dim", `DONNÉES HORMUZ WATCH · ${dayShort(h.generated_at)} ${hm(h.generated_at)} UTC`));
    box.append(left);

    // Bande verticale des événements clés (cliquables)
    const strip = el("div", "sit-strip");
    strip.append(el("span", "sit-vlabel", "ÉVÉNEMENTS CLÉS"));
    const ticks = el("div", "sit-ticks");
    for (const e of keys.slice(0, 14)) {
      const t = el("button", `sit-tick ${(TAG[e.kind] || ["", "mute"])[1]}`);
      t.type = "button"; t.title = `${dayShort(e.time)} · ${e.title}`;
      t.onclick = () => { stopTour(); sit.globe && sit.globe.flyTo(HOTSPOTS[0]); ui.openEvent(e); };
      ticks.append(t);
    }
    strip.append(ticks);
    box.append(strip);

    // Globe
    const stage = el("div", "sit-stage");
    const canvas = el("canvas", "sit-globe");
    canvas.setAttribute("aria-label", "Globe : points chauds et routes du pétrole");
    canvas.setAttribute("role", "img");
    const cap = el("div", "sit-caption");
    stage.append(canvas, cap);
    box.append(stage);

    // Colonne de droite : derniers événements
    const right = el("aside", "sit-right");
    right.append(el("span", "sit-vlabel sit-vlabel-r", "DERNIERS ÉVÉNEMENTS"));
    const feed = el("div", "sit-feed");
    for (const e of live.slice(0, 40)) {
      const [tag, tone] = tagOf(e) || [ui.kindLabel(e.kind), "mute"];
      const c = el("article", "sit-card");
      const hd = el("div", "sit-row");
      hd.append(el("span", "sit-place", e.kind === "headline" ? e.source : PLACE[e.theme] || e.theme || "—"), el("span", `sit-tag ${tone}`, tag.toUpperCase()));
      const ft = el("div", "sit-foot");
      ft.append(el("span", "sit-mono sit-dim", e.kind === "headline" ? ago(e.time) : `${ago(e.time)} · ${e.source || "source ?"}`), badge(e.level));
      c.append(hd, el("p", null, e.title), ft);
      c.tabIndex = 0;
      c.onclick = () => ui.openEvent(e);
      c.onkeydown = (ev) => { if (ev.key === "Enter") ui.openEvent(e); };
      feed.append(c);
    }
    right.append(feed);
    box.append(right);

    // Bandeau du bas : derniers titres et cours
    const wire = el("div", "sit-wire");
    wire.append(el("span", "sit-wire-label", "FIL"));
    const run = el("div", "sit-wire-run");
    const track = el("div", "sit-wire-track");
    run.append(track);
    wire.append(run);
    box.append(wire);
    const fillWire = (markets) => {
      const items = [];
      for (const m of markets) {
        if (!m.last) continue;
        const ch = lastChange(m.rows);
        const it = el("span", "sit-wire-item");
        it.append(el("b", null, m.label.toUpperCase()), document.createTextNode(` ${nf2.format(m.last.close)} ${m.currency || ""}`));
        if (ch != null) it.append(el("span", ch >= 0 ? "up" : "down", ` ${ch >= 0 ? "▲" : "▼"} ${nf2.format(Math.abs(ch))} %`));
        items.push(it);
      }
      // Titres des médias (comme le bandeau « Wire » d'insidegeopolitics.com) ; à défaut, les derniers événements.
      const wireNews = press.filter((e) => !isOsint(e)).sort(byTime).slice(0, 24);
      for (const e of wireNews.length ? wireNews : live.slice(0, 12)) {
        const url = safeUrl(e.url);
        const it = el(url ? "a" : "span", "sit-wire-item");
        if (url) { it.href = url; it.target = "_blank"; it.rel = "noopener noreferrer"; }
        it.append(el("b", null, (e.source || "").toUpperCase()), document.createTextNode(` ${e.title}`));
        items.push(it);
      }
      // deux copies pour un défilement sans couture
      track.replaceChildren(...items, ...items.map((n) => n.cloneNode(true)));
      track.style.animationDuration = `${Math.max(40, items.length * 6)}s`;
    };
    fillWire([]);
    loadMarkets(api, 10).then(fillWire, () => {});

    // Légende des étapes de la visite : Ormuz (données réelles), puis les autres passages (repères)
    const worst = (() => {
      const lv = keys.slice(0, 8).map((e) => e.level);
      return lv.includes("confirme") ? "confirme" : lv.includes("probable") ? "probable" : "non_confirme";
    })();
    const colorOf = () => (worst === "confirme" ? "rgba(229,72,77,ALPHA)" : "rgba(233,210,74,ALPHA)");
    function caption(hs) {
      cap.replaceChildren();
      cap.append(el("span", "sit-mono sit-acc", hs.live ? "● POINT CHAUD SUIVI" : "○ REPÈRE · PAS ENCORE SUIVI"), el("h2", null, hs.name));
      if (hs.live && h) cap.append(el("p", null, `${nf1.format(h.pct_of_normal || 0)} % du trafic normal · ${h.silent_likely ?? 0} coupures de balise probables · ${keys.length} mises à jour`));
      else if (hs.live) cap.append(el("p", null, "Hormuz Watch ne répond pas : dernières mises à jour à gauche."));
      else cap.append(el("p", null, "Passage maritime clé des routes du pétrole ; il sera suivi comme Ormuz dans une prochaine étape."));
    }
    function go(i) {
      sit.stop = (i + HOTSPOTS.length) % HOTSPOTS.length;
      const hs = HOTSPOTS[sit.stop];
      sit.globe && sit.globe.flyTo(hs, hs.live ? 2.1 : 1.6);
      caption(hs);
    }
    let tourTimer = null;
    const paintPlay = () => { play.textContent = sit.tour ? "❚❚ VISITE GUIDÉE" : "▶ VISITE GUIDÉE"; play.setAttribute("aria-pressed", String(sit.tour)); };
    function stopTour() { sit.tour = false; clearInterval(tourTimer); paintPlay(); }
    function startTour() {
      sit.tour = true; clearInterval(tourTimer); paintPlay();
      tourTimer = setInterval(() => { if (!box.isConnected) { clearInterval(tourTimer); return; } go(sit.stop + 1); }, 9000);
    }
    play.onclick = () => (sit.tour ? stopTour() : startTour());
    prev.onclick = () => { stopTour(); go(sit.stop - 1); };
    next.onclick = () => { stopTour(); go(sit.stop + 1); };

    try {
      await loadWorld();
      const geoPoints = press.filter((e) => e.lat != null && e.lon != null);
      sit.globe = makeGlobe(canvas, { color: colorOf, points: () => geoPoints, autoSpin: () => !sit.tour, onPick: (hs) => { stopTour(); go(HOTSPOTS.indexOf(hs)); } });
      go(0);
      if (!STILL && sit.tour) startTour(); else paintPlay();
    } catch (err) {
      stage.append(el("p", "sit-err", `Globe indisponible : ${err.message}`));
    }
  }

  // ------------------------------------------------------------ Développements
  async function viewDeveloppements(root) {
    const ui = U();
    const { el, api, badge, nf2 } = ui;
    const [events, markets] = await Promise.all([api("/api/events?theme=hormuz&limit=600"), loadMarkets(api, 400)]);
    const keys = events.filter((e) => KEY_KINDS.includes(e.kind));
    root.append(ui.pageHead({ crumbs: ["Veille", "Développements"], title: "Développements",
      sub: "Les événements clés, du plus récent au plus ancien, avec la réaction observée des marchés liés le jour même." }));

    // Impact observé : variation de chaque instrument lié entre la dernière clôture avant l'événement et la première après.
    const linked = markets.filter((m) => (m.themes || []).includes("hormuz") && m.rows.length > 1);
    function impact(e) {
      const d = e.time.slice(0, 10), out = [];
      for (const m of linked) {
        let i = m.rows.findIndex((r) => r[0] >= d);
        if (i <= 0) continue;
        const ch = (m.rows[i][1] / m.rows[i - 1][1] - 1) * 100;
        out.push({ m, ch });
      }
      return out.sort((a, b) => a.ch - b.ch);
    }

    const wrap = el("div", "dev");
    const bar = el("div", "dev-bar");
    const scroller = el("div", "dev-scroll");
    const days = [...new Set(keys.map((e) => e.time.slice(0, 10)))];
    const dayBtns = el("div", "dev-days");
    for (const d of days.slice(0, 40)) {
      const b = el("button", "dev-day", dayShort(`${d}T00:00:00Z`));
      b.type = "button";
      b.onclick = () => { const t = scroller.querySelector(`[data-day="${d}"]`); if (t) t.scrollIntoView({ behavior: STILL ? "auto" : "smooth", inline: "start", block: "nearest" }); };
      dayBtns.append(b);
    }
    bar.append(el("span", "dev-mono", "JOURS"), dayBtns);
    wrap.append(bar);

    let lastDay = null;
    for (const e of keys.slice(0, 120)) {
      const d = e.time.slice(0, 10);
      if (d !== lastDay) {
        lastDay = d;
        const sep = el("div", "dev-sep"); sep.dataset.day = d;
        sep.append(el("span", null, dayShort(`${d}T00:00:00Z`)));
        scroller.append(sep);
      }
      const [tag, tone] = TAG[e.kind] || [ui.kindLabel(e.kind), "mute"];
      const c = el("article", "dev-card");
      const hd = el("div", "dev-row");
      hd.append(el("span", "dev-place", (PLACE[e.theme] || e.theme || "").toUpperCase()), el("span", `sit-tag ${tone}`, tag.toUpperCase()));
      c.append(hd, el("h2", null, e.title));
      const facts = el("p", "dev-text");
      facts.append(el("b", null, "Niveau : "), badge(e.level), document.createTextNode(`  ${(ui.LEVEL[e.level] || ui.LEVEL.non_confirme)[1]}`));
      c.append(facts);
      const imp = impact(e);
      const ib = el("div", "dev-impact");
      ib.append(el("div", "dev-mono dev-acc", "RÉACTION OBSERVÉE DES MARCHÉS LIÉS · LE JOUR MÊME"));
      if (imp.length) {
        const up = imp.filter((x) => x.ch > 0.3).length, down = imp.filter((x) => x.ch < -0.3).length;
        ib.append(el("p", "dev-verdict", down > up * 2 ? `Surtout en baisse (${down} sur ${imp.length})` : up > down * 2
          ? `Surtout en hausse (${up} sur ${imp.length})` : `Réaction mixte (${up} en hausse, ${down} en baisse)`));
        const max = Math.max(1, ...imp.map((x) => Math.abs(x.ch)));
        const list = el("div", "dev-bars");
        for (const { m, ch } of imp) {
          const row = el("div", "dev-bar-row");
          row.title = `${m.label} : ${ch >= 0 ? "+" : ""}${nf2.format(ch)} %`;
          const track = el("span", "dev-track"), fill = el("i", ch >= 0 ? "up" : "down");
          const w = (Math.abs(ch) / max) * 50;
          fill.style.width = `${Math.max(w, 1)}%`;
          fill.style.left = ch >= 0 ? "50%" : `${50 - w}%`;
          track.append(fill);
          row.append(el("span", "dev-sym", m.symbol), track, el("span", `dev-val ${ch >= 0 ? "up" : "down"}`, `${ch >= 0 ? "+" : "−"}${nf2.format(Math.abs(ch))} %`));
          list.append(row);
        }
        ib.append(list);
      } else ib.append(el("p", "dev-dim", "Pas encore de séance après l'événement, ou cours indisponibles."));
      c.append(ib);
      const ft = el("div", "dev-row");
      const url = safeUrl(e.url);
      const src = el(url ? "a" : "span", "dev-src", "SOURCE");
      if (url) { src.href = url; src.target = "_blank"; src.rel = "noopener noreferrer"; }
      ft.append(src, el("span", "dev-mono dev-dim", `${dayShort(e.time)}${/T00:00/.test(e.time) ? "" : ` · ${hm(e.time)} UTC`} · ${e.source || ""}`));
      c.append(ft);
      c.tabIndex = 0;
      c.onclick = (ev) => { if (!ev.target.closest("a")) ui.openEvent(e); };
      scroller.append(c);
    }
    if (!keys.length) scroller.append(el("p", "dev-dim", "Aucun événement clé pour l'instant."));
    wrap.append(scroller);
    root.append(wrap);
    root.append(el("p", "muted", "Corrélation n'est pas causalité : un cours bouge pour bien d'autres raisons le même jour."));
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { situation: viewSituation, developpements: viewDeveloppements });
})();
