/* Master — Cinéma : le globe plein écran qui tourne et où chaque événement s'allume là où il a lieu, en direct (le
 * « Cinema Globe Mode » de SitDeck). Sources géolocalisées du Master : combats, coercition et manifestations (GDELT),
 * phénomènes naturels, séismes (USGS), catastrophes (GDACS), avions militaires, presse géolocalisée. Les points
 * pâlissent avec l'âge ; frise de 1 h à 3 jours ; son facultatif à chaque nouveauté ; fil défilant à droite.
 * Rechargé chaque minute. Tout texte passe par textContent.
 */
(() => {
  "use strict";
  const short = (t) => {  // « 13 min », « 4 h », « 3 j »
    const m = (Date.now() - Date.parse(t)) / 60000;
    if (!(m >= 1)) return "maintenant";
    return m < 60 ? `${Math.round(m)} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`;
  };
  const U = () => window.MASTER_UI;
  const S = () => window.MASTER_SITUATION;
  const KIND = {
    conflit: ["Combats", "#e5484d"], coercition: ["Coercition", "#f0a35e"], manifestation: ["Manifestations", "#e9d24a"],
    nature: ["Phénomènes naturels", "#4cc38a"], seisme: ["Séismes", "#fb923c"], catastrophe: ["Catastrophes", "#ff2d55"],
    avion: ["Avions militaires", "#5eead4"], presse: ["Presse géolocalisée", "#93b4f0"],
  };
  const st = (() => { try { return { hours: 24, sound: false, off: [], ...JSON.parse(localStorage.getItem("master-cinema") || "{}") }; } catch { return { hours: 24, sound: false, off: [] }; } })();
  const save = () => { try { localStorage.setItem("master-cinema", JSON.stringify(st)); } catch { /* */ } };
  let timer = null, globe = null, audio = null;

  function beep() {
    try {
      audio = audio || new AudioContext();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.06, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.26);
    } catch { /* son indisponible */ }
  }

  async function collect(api) {
    const opt = (p) => api(p).catch(() => null);
    const since = new Date(Date.now() - 72 * 36e5).toISOString().slice(0, 19);
    const [ev, quakes, gdacs, mil] = await Promise.all([opt(`/api/events?since=${since}&limit=3000`), opt("/api/layers/seismes"),
      opt("/api/layers/catastrophes"), opt("/api/layers/avions-militaires")]);
    const out = [];
    for (const e of ev || []) {
      if (e.lat == null || e.lon == null) continue;
      const k = e.theme === "geopolitique" ? (KIND[e.kind] ? e.kind : "conflit") : e.theme === "nature" ? "nature" : "presse";
      out.push({ id: e.id, k, lon: e.lon, lat: e.lat, time: e.time, title: e.title, src: e.source, ev: e });
    }
    for (const q of (quakes && quakes.items) || []) out.push({ id: `usgs:${q.time}`, k: "seisme", lon: q.lon, lat: q.lat, time: q.time, title: `Séisme M${q.mag} · ${q.title}`, src: "USGS", live: { layer: "seismes", ...q } });
    for (const g of (gdacs && gdacs.items) || []) out.push({ id: `gdacs:${g.title}`, k: "catastrophe", lon: g.lon, lat: g.lat, time: g.to || g.from, title: `${g.type} · ${g.title}`, src: "GDACS", live: { layer: "catastrophes", ...g } });
    const now = (mil && mil.fetched_at) || new Date().toISOString();
    for (const a of (mil && mil.items) || []) out.push({ id: `mil:${a.hex}`, k: "avion", lon: a.lon, lat: a.lat, time: now, title: `${a.callsign || a.hex} · ${a.type || "avion militaire"}`, src: "adsb.lol", live: { layer: "avions-militaires", ...a } });
    return out.filter((x) => x.time).sort((a, b) => (a.time < b.time ? 1 : -1));
  }

  async function viewCinema(root) {
    const ui = U(), s = S();
    const { el, api } = ui;
    clearInterval(timer);
    if (globe) { globe.destroy(); globe = null; }
    const box = el("div", "cin");
    root.append(box);
    const stage = el("div", "cin-stage");
    const top = el("div", "cin-top");
    const side = el("aside", "cin-side");
    const card = el("div", "g3-card cin-card"); card.hidden = true;
    box.append(stage, top, side, card);
    const count = el("span", "cin-count", "…");
    const clock = el("span", "cin-clock");
    const hours = ui.seg([["1", "1 h"], ["6", "6 h"], ["24", "24 h"], ["72", "3 j"]], String(st.hours), (v) => { st.hours = Number(v); save(); draw(); }, "Période");
    const sound = el("button", "cin-btn", st.sound ? "🔊 Son" : "🔇 Son"); sound.type = "button"; sound.setAttribute("aria-pressed", String(st.sound));
    sound.onclick = () => { st.sound = !st.sound; save(); sound.textContent = st.sound ? "🔊 Son" : "🔇 Son"; sound.setAttribute("aria-pressed", String(st.sound)); if (st.sound) beep(); };
    const full = el("button", "cin-btn", "⛶"); full.type = "button"; full.title = "Plein écran"; full.setAttribute("aria-label", "Plein écran");
    full.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen(); };
    const kinds = el("div", "cin-kinds");
    for (const [k, [label, color]] of Object.entries(KIND)) {
      const b = el("button", "cin-kind"); b.type = "button"; b.setAttribute("aria-pressed", String(!st.off.includes(k)));
      const dot = el("i"); dot.style.background = color; b.append(dot, document.createTextNode(label));
      b.onclick = () => { st.off = st.off.includes(k) ? st.off.filter((x) => x !== k) : [...st.off, k]; save(); b.setAttribute("aria-pressed", String(!st.off.includes(k))); draw(); };
      kinds.append(b);
    }
    top.append(el("span", "cin-title", "CINÉMA"), count, hours, sound, full, clock);
    box.append(kinds);

    let items = [], seen = null;
    const show = (it) => {
      const c = it.live && window.MASTER_LIVE ? window.MASTER_LIVE.card(it.live, () => { card.hidden = true; }) : null;
      if (c) { card.replaceChildren(...c.childNodes); card.hidden = false; return; }
      if (it.ev) ui.openEvent(it.ev);
    };
    function visible() {
      const since = Date.now() - st.hours * 36e5;
      return items.filter((x) => !st.off.includes(x.k) && Date.parse(x.time) >= since);
    }
    function draw() {
      const v = visible();
      count.textContent = `${v.length} événements · ${st.hours < 24 ? `${st.hours} h` : st.hours === 24 ? "24 h" : "3 jours"}`;
      if (globe) {
        const span = st.hours * 36e5;
        for (const k of Object.keys(KIND)) {
          globe.setPoints(`cin-${k}`, v.filter((x) => x.k === k).map((x) => {
            const age = Math.min(1, (Date.now() - Date.parse(x.time)) / span);
            const fresh = seen && !seen.has(x.id);
            return { lon: x.lon, lat: x.lat, size: fresh ? 18 : k === "avion" ? 5 : 9 - age * 4, color: KIND[k][1], alpha: 1 - age * 0.65, data: x };
          }), 1.0016, true);
        }
        globe.setMarkers(v.filter((x) => seen && !seen.has(x.id)).slice(0, 12).map((x) => ({ id: x.id, lon: x.lon, lat: x.lat, tone: "hot", label: x.title.slice(0, 48), onClick: () => show(x) })));
      }
      side.replaceChildren(el("div", "cin-side-h", "EN DIRECT"));
      for (const x of v.filter((y) => y.k !== "avion").slice(0, 60)) {
        const b = el("button", `cin-row${seen && !seen.has(x.id) ? " new" : ""}`); b.type = "button";
        const dot = el("i"); dot.style.background = KIND[x.k][1];
        b.append(dot, el("span", "cin-t", short(x.time)), el("span", "cin-txt", x.title));
        b.onclick = () => { if (globe) globe.flyTo(x.lon, x.lat, 3, 1800); show(x); };
        side.append(b);
      }
    }
    async function refresh() {
      if (!box.isConnected) { clearInterval(timer); return; }
      items = await collect(api);
      const fresh = seen ? items.filter((x) => !seen.has(x.id) && x.k !== "avion") : [];
      draw();
      if (fresh.length && st.sound) beep();
      seen = new Set(items.map((x) => x.id));
      clock.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
    }
    try {
      const mod = await import(`${window.MASTER_STATIC ? "./" : "/assets/"}globe3d.js`);
      globe = mod.createGlobe(stage, { lon: 35, lat: 25, clickable: Object.keys(KIND).map((k) => `cin-${k}`),
        onPickPoint: (key, d) => show(d) });
      globe.setStyle("nuit");
      const W = window.MASTER_MONDE_LOAD ? await window.MASTER_MONDE_LOAD().catch(() => null) : null;
      if (W) globe.setBorders(W.borders.coordinates || []);
    } catch (err) {
      stage.append(el("p", "sit-err", `Globe 3D indisponible : ${err.message}`));
    }
    await refresh();
    timer = setInterval(refresh, 60000);
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { cinema: viewCinema });
})();
