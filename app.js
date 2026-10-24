/* Hormuz Watch — tableau de bord.
 *
 * Lit data.json (en local) ou data.enc (lien protégé : déchiffré dans le navigateur
 * avec le mot de passe), puis se met à jour en place toutes les 30 secondes.
 * Tout le texte venant des données passe par textContent : aucune injection HTML.
 */
(() => {
  "use strict";

  // ------------------------------------------------------------ utilitaires
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDays = (d) => (d == null ? "—" : d < 1 ? `${Math.round(d * 24)} h` : `${nf1.format(d)} j`);
  const fmtHours = (h) => (h == null ? "—" : h < 48 ? `${Math.round(h)} h` : `${nf1.format(h / 24)} j`);
  const pad = (n) => String(n).padStart(2, "0");
  const toDate = (iso) => new Date(iso);
  const hm = (iso) => { const d = toDate(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const dmhm = (iso) => { const d = toDate(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${hm(iso)}`; };
  const SIDE = { gulf: "côté Golfe", oman: "côté golfe d'Oman", strait: "dans le détroit" };
  const COLORS = { s1: "#3987e5", s2: "#d95926", anchored: "#8f8e86", unknown: "#94938a" };
  // Flux : trois teintes validées (bleu, vert d'eau, orange réservé aux navires sans balise),
  // le gaz et les autres cargos se distinguent par la luminosité (blanc, gris).
  const SEG = {
    crude: { label: "Pétrole brut", color: "#3987e5" },
    products: { label: "Produits et chimie", color: "#199e70" },
    gas: { label: "Gaz (GNL, GPL)", color: "#f2f1ec" },
    other: { label: "Vrac, conteneurs, cargo", color: "#8f8e86" },
  };
  const segColor = ["match", ["get", "seg"], "crude", SEG.crude.color, "products", SEG.products.color,
    "gas", SEG.gas.color, SEG.other.color];

  // ------------------------------------------------------------ données
  let DATA = null;
  let mode = "json";          // "json" en local, "enc" sur le lien protégé
  let password = sessionStorage.getItem("hw-pw");
  const staleMin = () => (mode === "json" ? 10 : 30);

  async function decrypt(b64, pw) {
    const raw = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
    const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)));
  }

  async function fetchData() {
    if (mode === "json") {
      const r = await fetch("data.json", { cache: "no-store" });
      if (r.ok) return r.json();
      mode = "enc";
    }
    const r = await fetch("data.enc", { cache: "no-store" });
    if (!r.ok) throw new Error("données indisponibles");
    if (!password) throw new Error("mot de passe requis");
    return decrypt(await r.text(), password);
  }

  function askPassword() {
    return new Promise((resolve) => {
      $("gate").hidden = false;
      $("report-link").hidden = true;
      $("gate-pw").focus();
      $("gate-form").onsubmit = async (e) => {
        e.preventDefault();
        $("gate-err").textContent = "Déchiffrement…";
        password = $("gate-pw").value;
        try {
          const d = await fetchData();
          sessionStorage.setItem("hw-pw", password);
          $("gate").hidden = true;
          $("report-link").hidden = false;
          resolve(d);
        } catch {
          password = null;
          $("gate-err").textContent = "Mot de passe incorrect.";
        }
      };
    });
  }

  // ------------------------------------------------------------ carte
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/dark",
    center: [56.45, 25.75],
    zoom: 7.3,
    attributionControl: { compact: true, customAttribution:
      "Données : hormuz.now (CC BY 4.0) · IMF PortWatch · Copernicus Sentinel-1" },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "nautical" }), "bottom-left");
  // Bouton 2D/3D (barre du haut) : incline la carte en perspective ou la remet à plat, nord en haut.
  {
    const b = $("tilt");
    const paint = () => { const tilted = map.getPitch() > 5; b.textContent = tilted ? "Vue 2D" : "Vue 3D";
      b.title = tilted ? "Revenir à la vue à plat" : "Incliner la carte (vue en perspective)"; };
    b.onclick = () => { const flat = map.getPitch() <= 5; map.easeTo({ pitch: flat ? 55 : 0, bearing: flat ? -18 : 0, duration: 800 }); };
    map.on("pitchend", paint);
    paint();
  }
  const mapReady = new Promise((res) => map.on("load", res));

  const FLOW_SPAN = 0.12;  // part récente des sillages (≈ 45 min sur 6 h) qui reçoit le flux animé
  const fc = (features) => ({ type: "FeatureCollection", features });
  const pt = (lon, lat, props) => ({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props });

  function circlePolygon(lat, lon, km, n = 64) {
    const coords = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const dLat = (km / 110.54) * Math.sin(a);
      const dLon = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a);
      coords.push([lon + dLon, lat + dLat]);
    }
    return { type: "Polygon", coordinates: [coords] };
  }

  const LAYER_GROUPS = [
    ...Object.entries(SEG).map(([k, v]) => ({ key: k, label: v.label, swatch: v.color, seg: true })),
    { key: "silent", label: "Balise coupée", swatch: COLORS.s2, ring: true, layers: ["v-silent", "v-silent-dot"] },
    { key: "trails", label: "Traces 6 h", swatch: "#c3c2b7", line: true, layers: ["trails", "trails-flow"] },
    { key: "radar", label: "Radar Sentinel-1", swatch: "#c3c2b7", ring: true, layers: ["radar-dets"], images: true },
    { key: "zones", label: "Zones", swatch: "#57564f", layers: ["zones-fill", "zones-line", "zones-label"] },
    { key: "optical", label: "Optique Sentinel-2", swatch: "#c9b48a", layers: [], optical: true },
    { key: "incidents", label: "Incidents", swatch: "#d03b3b", layers: ["incidents"] },
    { key: "fires", label: "Feux (NASA)", swatch: "#fab219", layers: ["fires"] },
  ];
  const visible = Object.fromEntries(LAYER_GROUPS.map((g) => [g.key, g.key !== "optical"]));
  let opticalIds = [];
  let radarShown = new Set();  // images radar à afficher pour l'instant choisi
  let radarImageIds = [];

  // Fond de carte « nuit marine » : mer bleu nuit, terre quasi noire, trait de côte lumineux ; routes, bâtiments et
  // occupation du sol retirés pour que les navires dominent ; noms de lieux discrets.
  function styleBasemap() {
    const paint = (id, k, v) => { if (map.getLayer(id)) map.setPaintProperty(id, k, v); };
    paint("background", "background-color", "#0a0c10");
    paint("water", "fill-color", "#0c1a28");
    paint("waterway", "line-color", "#0c1a28");
    for (const l of map.getStyle().layers) {
      if (/^(highway_|road_|railway|aeroway|building|landuse|landcover)/.test(l.id)) map.setLayoutProperty(l.id, "visibility", "none");
      if (/^place_|^water_name/.test(l.id)) { paint(l.id, "text-color", "#5d6b7c"); paint(l.id, "text-halo-color", "rgba(5,8,12,0.85)"); }
    }
    if (!map.getLayer("coast")) map.addLayer({ id: "coast", type: "line", source: "openmaptiles", "source-layer": "water",
      paint: { "line-color": "rgba(110,170,230,0.35)", "line-width": 1, "line-blur": 0.6 } }, map.getLayer("water_name") ? "water_name" : undefined);
  }

  function setupLayers() {
    const font = ["Noto Sans Regular"];
    styleBasemap();
    map.addSource("zones", { type: "geojson", data: fc([]) });
    map.addSource("zone-labels", { type: "geojson", data: fc([]) });  // un point par zone : un seul libellé (pas un par tuile)
    map.addSource("gate", { type: "geojson", data: fc([{ type: "Feature", properties: { label: "ligne de comptage" },
      geometry: { type: "LineString", coordinates: [[56.37, 26.38], [56.31, 26.93]] } }]) });
    map.addSource("vessels", { type: "geojson", data: fc([]) });
    map.addSource("silent", { type: "geojson", data: fc([]) });
    map.addSource("dets", { type: "geojson", data: fc([]) });
    map.addSource("selected", { type: "geojson", data: fc([]) });
    map.addSource("trails", { type: "geojson", data: fc([]) });
    map.addSource("estim", { type: "geojson", data: fc([]) });
    map.addSource("focus", { type: "geojson", data: fc([]) });
    map.addSource("incidents", { type: "geojson", data: fc([]) });
    map.addSource("fires", { type: "geojson", data: fc([]) });

    map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: { "fill-color": "#6aa8e6", "fill-opacity": 0.035 } });
    map.addLayer({ id: "zones-line", type: "line", source: "zones",
      paint: { "line-color": "#3b5068", "line-width": 1, "line-opacity": 0.6, "line-dasharray": [3, 3] } });
    map.addLayer({ id: "gate-line", type: "line", source: "gate",
      paint: { "line-color": "#c3c2b7", "line-width": 1.5, "line-dasharray": [1, 2], "line-opacity": 0.8 } });
    map.addLayer({ id: "gate-label", type: "symbol", source: "gate",
      layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": font, "text-size": 11 },
      paint: { "text-color": "#c3c2b7", "text-halo-color": "#0c0c0c", "text-halo-width": 1.5 } });

    map.addLayer({ id: "radar-dets", type: "circle", source: "dets", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3, 10, 6, 13, 10],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 1,
      "circle-stroke-color": ["match", ["get", "state"], "ais", COLORS.s1, "dark", COLORS.s2, COLORS.unknown],
      "circle-stroke-opacity": ["match", ["get", "state"], "dark", 0.8, 0.4] } });

    // Flèche (icône SDF, coloriée par flux) pour les navires en route, orientée selon le cap.
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(16, 2); g.lineTo(27, 29); g.lineTo(16, 22); g.lineTo(5, 29); g.closePath(); g.fill();
    map.addImage("hw-arrow", { width: 32, height: 32, data: g.getImageData(0, 0, 32, 32).data }, { sdf: true });

    // Sillages : chaque tronçon porte son âge relatif « a » (0 = maintenant, 1 = il y a 6 h) et s'estompe avec lui ;
    // la partie récente reçoit un flux de tirets animé dans le sens de la marche.
    map.addLayer({ id: "trails", type: "line", source: "trails", layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": segColor, "line-width": ["interpolate", ["linear"], ["coalesce", ["get", "a"], 0], 0, 2, 1, 0.8],
        "line-opacity": ["interpolate", ["linear"], ["coalesce", ["get", "a"], 0], 0, 0.8, 1, 0.06], "line-blur": 0.6 } });
    // Lueur douce, de la couleur de la cargaison, sous les navires en route.
    map.addLayer({ id: "v-glow", type: "circle", source: "vessels", filter: [">=", ["get", "speed"], 1],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 7, 10, 14], "circle-blur": 1,
        "circle-color": segColor, "circle-opacity": 0.45 } });
    map.addLayer({ id: "trails-flow", type: "line", source: "trails", filter: ["<", ["coalesce", ["get", "a"], 1], FLOW_SPAN],
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 1.6, "line-opacity": 0.55, "line-dasharray": [0, 4, 3] } });
    // Pointillé entre le dernier relevé AIS et la position estimée : la partie estimée se voit comme telle.
    map.addLayer({ id: "estim", type: "line", source: "estim",
      paint: { "line-color": segColor, "line-width": 1.2, "line-opacity": 0.7, "line-dasharray": [1, 1.5] } });
    // Pulsation discrète autour des navires en route (rayon et opacité animés par animate()).
    map.addLayer({ id: "v-pulse", type: "circle", source: "vessels", filter: [">=", ["get", "speed"], 1],
      paint: { "circle-radius": 6, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1.2, "circle-stroke-color": segColor,
        "circle-stroke-opacity": 0 } });
    const size = (base) => ["interpolate", ["linear"], ["get", "length"], 0, base, 120, base * 1.25, 250, base * 1.6, 330, base * 1.9];
    map.addLayer({ id: "v-anchored", type: "circle", source: "vessels", filter: ["<", ["get", "speed"], 1],
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, ["*", size(1.6), 0.7], 9, size(2.2), 12, ["*", size(2.2), 1.8]],
        "circle-color": segColor, "circle-opacity": 0.7,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0, 11, 1], "circle-stroke-color": "#0a0c10" } });
    map.addLayer({ id: "v-moving", type: "symbol", source: "vessels", filter: [">=", ["get", "speed"], 1],
      layout: { "icon-image": "hw-arrow", "icon-rotate": ["get", "course"], "icon-rotation-alignment": "map",
        "icon-allow-overlap": true, "icon-ignore-placement": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 6, ["*", size(0.28), 0.8], 9, size(0.32), 12, ["*", size(0.32), 1.6]] },
      paint: { "icon-color": segColor, "icon-halo-color": "#0c0c0c", "icon-halo-width": 1,
        "icon-opacity": ["interpolate", ["linear"], ["coalesce", ["get", "age"], 0], 15, 1, 90, 0.45] } });
    map.addLayer({ id: "v-silent-dot", type: "circle", source: "silent",
      paint: { "circle-radius": 1.6, "circle-color": COLORS.s2 } });
    map.addLayer({ id: "v-silent", type: "circle", source: "silent", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 10, 6, 13, 9],
      "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1.4, "circle-stroke-color": COLORS.s2,
      "circle-stroke-opacity": ["case", ["get", "likely"], 0.9, 0.3] } });
    map.addLayer({ id: "fires", type: "circle", source: "fires", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 11, 6], "circle-color": "#fab219",
      "circle-opacity": ["case", ["get", "persistent"], 0.35, 0.95], "circle-stroke-width": 1, "circle-stroke-color": "#0c0c0c" } });
    map.addLayer({ id: "incidents", type: "circle", source: "incidents", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 5, 11, 9], "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2.5, "circle-stroke-color": ["match", ["get", "severity"], "high", "#d03b3b", "medium", "#fab219", "#c3c2b7"] } });
    map.addLayer({ id: "focus", type: "line", source: "focus", layout: { "line-cap": "round" },
      paint: { "line-color": "#ffffff", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
    map.addLayer({ id: "selected", type: "circle", source: "selected", paint: {
      "circle-radius": 16, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" } });
    map.addLayer({ id: "zones-label", type: "symbol", source: "zone-labels", layout: {
      "text-field": ["get", "label"], "text-font": font, "text-size": 11, "text-offset": [0, 0],
      "text-variable-anchor": ["top", "bottom"], "text-radial-offset": 0.6, "text-allow-overlap": false },
      paint: { "text-color": "#c3c2b7", "text-halo-color": "#0c0c0c", "text-halo-width": 1.5 } });

    // Survol et clic.
    const tip = $("tip");
    const hoverLayers = ["incidents", "fires", "v-moving", "v-anchored", "v-silent", "radar-dets"];
    map.on("mousemove", (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: hoverLayers.filter((l) => map.getLayer(l)) })[0];
      map.getCanvas().style.cursor = f ? "pointer" : "";
      if (!f) { tip.hidden = true; return; }
      tip.replaceChildren();
      const p = f.properties;
      if (f.layer.id === "incidents") {
        tip.append(el("b", null, p.title), el("div", "sub", `${dmhm(p.time)} UTC · ${p.source || ""}`));
      } else if (f.layer.id === "fires") {
        tip.append(el("b", null, p.persistent ? "Feu permanent (torchère probable)" : "Feu détecté"), el("div", "sub", `${dmhm(p.time)} UTC · NASA FIRMS`));
      } else if (f.layer.id === "radar-dets") {
        tip.append(el("b", null, `Coque d'environ ${p.len_m} m`), el("div", "sub",
          p.state === "ais" ? "balise AIS au même moment" : p.state === "dark" ? "aucune balise AIS : navire sans balise probable"
            : "pas de relevé AIS au moment de l'image"), el("div", "sub", `radar du ${dmhm(p.time)} UTC`));
      } else {
        tip.append(el("b", null, p.name), el("div", "sub", `${p.type || ""} · ${p.length ? p.length + " m" : "longueur inconnue"}`),
          el("div", "sub", f.layer.id === "v-silent" ? `silencieux depuis ${fmtHours(p.silent_h)}` :
            `${nf1.format(p.speed)} nd · ${p.zone}`));
      }
      tip.hidden = false;
      const r = $("map").getBoundingClientRect();
      tip.style.left = Math.min(e.point.x + 14, r.width - 290) + "px";
      tip.style.top = e.point.y + 14 + "px";
    });
    map.on("mouseout", () => { tip.hidden = true; });
    map.on("click", (e) => {
      const q = (layers) => map.queryRenderedFeatures(e.point, { layers: layers.filter((l) => map.getLayer(l)) })[0];
      const inc = q(["incidents"]);
      if (inc) return incidentView(JSON.parse(inc.properties.raw));
      const fire = q(["fires"]);
      if (fire) return fireView(fire.properties);
      const v = q(["v-silent", "v-moving", "v-anchored"]);
      if (v) return openVessel(v.properties.id);
      const d = q(["radar-dets"]);
      if (d) return detectionView(d.properties);
      const z = q(["zones-fill"]);
      if (z) return zoneView(z.properties.id);
    });
  }

  // ------------------------------------------------------------ calques
  function renderLayerToggles() {
    const box = $("layers");
    box.replaceChildren();
    for (const g of LAYER_GROUPS) {
      const b = el("button", visible[g.key] ? "on" : "");
      const sw = el("span", "sw" + (g.ring ? " ring" : ""));
      if (g.ring) sw.style.borderColor = g.swatch; else sw.style.background = g.swatch;
      if (g.line) { sw.style.height = "2px"; sw.style.borderRadius = "1px"; }
      b.append(sw, el("span", null, g.label));
      b.setAttribute("aria-pressed", String(visible[g.key]));
      b.onclick = () => { visible[g.key] = !visible[g.key]; applyVisibility(); renderLayerToggles(); };
      box.append(b);
    }
  }
  function applyVisibility() {
    const segs = Object.keys(SEG).filter((k) => visible[k]);
    const segFilter = ["in", ["get", "seg"], ["literal", segs]];
    if (map.getLayer("v-anchored")) map.setFilter("v-anchored", ["all", ["<", ["get", "speed"], 1], segFilter]);
    if (map.getLayer("v-moving")) map.setFilter("v-moving", ["all", [">=", ["get", "speed"], 1], segFilter]);
    if (map.getLayer("trails")) map.setFilter("trails", segFilter);
    if (map.getLayer("trails-flow")) map.setFilter("trails-flow", ["all", ["<", ["coalesce", ["get", "a"], 1], FLOW_SPAN], segFilter]);
    if (map.getLayer("estim")) map.setFilter("estim", segFilter);
    if (map.getLayer("v-glow")) map.setFilter("v-glow", ["all", [">=", ["get", "speed"], 1], segFilter]);
    if (map.getLayer("v-pulse")) map.setFilter("v-pulse", ["all", [">=", ["get", "speed"], 1], segFilter]);
    for (const g of LAYER_GROUPS) {
      if (g.seg) continue;
      let on = visible[g.key];
      if (g.key === "silent" && replayIndex !== null) on = false;  // les coupures ne sont connues qu'en direct
      const v = on ? "visible" : "none";
      for (const id of g.layers) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
      if (g.images) for (const id of radarImageIds) if (map.getLayer(id))
        map.setLayoutProperty(id, "visibility", on && radarShown.has(id) ? "visible" : "none");
      if (g.optical) for (const id of opticalIds) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }
  function renderLegend() {
    const L = $("legend");
    L.replaceChildren();
    const t = el("button", "legend-toggle");  // repli de la légende (état dans applyLayout)
    t.id = "toggle-legend"; t.type = "button";
    t.onclick = () => { layout.legend = !layout.legend; applyLayout(); };
    L.append(t);
    const row = (color, kind, text) => {
      const d = el("div");
      const sw = el("span", kind === "tri" ? "tri" : "sw" + (kind === "ring" ? " ring" : ""));
      if (kind === "tri") sw.style.borderBottomColor = color;
      else if (kind === "ring") sw.style.borderColor = color; else sw.style.background = color;
      d.append(sw, el("span", null, text));
      return d;
    };
    for (const v of Object.values(SEG)) L.append(row(v.color, "dot", v.label));
    L.append(el("hr"), row("#c3c2b7", "tri", "En route (flèche = cap)"), row("#c3c2b7", "dot", "À l'arrêt"),
      row(COLORS.s2, "ring", "Balise coupée (dernière position)"), el("hr"),
      row(COLORS.s1, "ring", "Radar : coque avec AIS"), row(COLORS.s2, "ring", "Radar : coque sans balise"),
      row(COLORS.unknown, "ring", "Radar : non comparée à l'AIS"), el("hr"),
      row("#d03b3b", "ring", "Incident (straits.live)"), row("#fab219", "dot", "Feu détecté (NASA FIRMS)"));
    applyLayout();
  }

  // ------------------------------------------------------------ mise à jour carte
  function pickRadar(passes) {
    const picked = {};
    for (const r of passes) {
      for (const [zid, z] of Object.entries(r.zones)) {
        const good = (z.coverage ?? 1) >= 0.6;
        const prev = picked[zid];
        if (!prev || good || !prev.good) picked[zid] = { r, z, good };
      }
    }
    return picked;
  }

  function updateMap(d) {
    if (replayIndex === null) showLiveVessels(d);
    updateExtras(d);
    map.getSource("silent").setData(fc(d.beacon_off.silent.filter((s) => s.lat != null)
      .map((s) => pt(s.lon, s.lat, { id: s.id, name: s.name, type: s.type, length: s.length,
        silent_h: s.silent_h, likely: s.likely_switch_off, speed: s.speed, zone: s.zone }))));

    const counts = Object.fromEntries(d.zones.map((z) => [z.id, z.count]));
    map.getSource("zones").setData(fc(d.zone_shapes.map((z) => ({ type: "Feature",
      geometry: circlePolygon(z.lat, z.lon, z.radius_km),
      properties: { id: z.id, label: `${z.name}  ${counts[z.id] ?? 0}` } }))));
    map.getSource("zone-labels").setData(fc(d.zone_shapes.map((z) => pt(z.lon, z.lat, { id: z.id, label: `${z.name}  ${counts[z.id] ?? 0}` }))));

    updateRadar(d.radar.passes || []);
  }

  function updateRadar(passes) {
    // Images radar : pour chaque zone, le passage récent qui la couvre le mieux.
    const picked = pickRadar(passes);
    const dets = [];
    radarShown = new Set();
    for (const [zid, { r, z }] of Object.entries(picked)) {
      const [lon0, lat0, lon1, lat1] = z.bbox;
      const srcId = `radar-${zid}`;
      const coords = [[lon0, lat1], [lon1, lat1], [lon1, lat0], [lon0, lat0]];
      if (!z.image) {  // passage ancien : seules les coques sont gardées
        if (map.getLayer(srcId)) map.setLayoutProperty(srcId, "visibility", "none");
      } else if (map.getSource(srcId)) { map.getSource(srcId).updateImage({ url: z.image, coordinates: coords }); radarShown.add(srcId); }
      else {
        radarShown.add(srcId);
        map.addSource(srcId, { type: "image", url: z.image, coordinates: coords });
        map.addLayer({ id: srcId, type: "raster", source: srcId,
          paint: { "raster-opacity": 0.16, "raster-saturation": -1, "raster-contrast": 0.25, "raster-fade-duration": 0 } }, "zones-fill");
        radarImageIds.push(srcId);
      }
      for (const det of z.detections) {
        dets.push(pt(det.lon, det.lat, { len_m: det.len_m, time: r.datetime,
          state: !r.ais_available ? "unknown" : det.ais ? "ais" : "dark" }));
      }
    }
    map.getSource("dets").setData(fc(dets));
    applyVisibility();
  }

  function updateExtras(d) {
    map.getSource("incidents").setData(fc((d.incidents || []).filter((x) => x.lat != null && x.lon != null)
      .map((x) => pt(x.lon, x.lat, { title: x.title, time: x.time, source: x.source, severity: x.severity, raw: JSON.stringify(x) }))));
    map.getSource("fires").setData(fc((d.fires || []).map((x) => pt(x.lon, x.lat, x))));
    for (const [zid, o] of Object.entries(d.optical || {})) {
      const [lon0, lat0, lon1, lat1] = o.bbox;
      const id = `optical-${zid}`;
      const coords = [[lon0, lat1], [lon1, lat1], [lon1, lat0], [lon0, lat0]];
      if (map.getSource(id)) map.getSource(id).updateImage({ url: o.image, coordinates: coords });
      else {
        map.addSource(id, { type: "image", url: o.image, coordinates: coords });
        map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.9, "raster-fade-duration": 0 } },
          radarImageIds[0] || "zones-fill");
        opticalIds.push(id);
      }
    }
  }

  function showLiveVessels(d) {
    const silentIds = new Set(d.beacon_off.silent.map((s) => s.id));
    LIVE = { vessels: d.vessels.filter((v) => !silentIds.has(v.id)), at: Date.parse(d.generated_at) || Date.now() };
    map.getSource("vessels").setData(fc(liveFeatures()));
    map.getSource("trails").setData(fc(REPLAY ? trailsAt(REPLAY.states.length - 1) : []));
  }

  // ------------------------------------------------------------ rejeu 24 h
  let REPLAY = null;        // { names, times[], states[] (Map id → [lat, lon, vitesse, cap]), tracks }
  let replayIndex = null;   // null = direct ; sinon index de l'image affichée
  let replayLoadedAt = 0;
  let replayRange = "24h";
  const RANGES = { "24h": "24 h", "7j": "7 j", "30j": "30 j" };
  let playing = null;

  async function fetchReplay() {
    if (mode === "json") {
      const r = await fetch(`replay-${replayRange}.json`, { cache: "no-store" });
      if (r.ok) return r.json();
    }
    const r = await fetch(`replay-${replayRange}.enc`, { cache: "no-store" });
    if (!r.ok || !password) return null;
    return decrypt(await r.text(), password);
  }

  // La frise mêle deux sources : les relevés AIS (positions nommées, depuis le début de notre enregistrement)
  // et les passages radar Sentinel-1 (coques, sur toute la période, y compris avant l'enregistrement AIS).
  function buildReplay(doc) {
    const aisStates = [], aisTimes = [];
    let cur = new Map();
    for (const f of doc.frames) {
      cur = new Map(cur);
      for (const id of f.gone || []) cur.delete(id);
      for (const [id, lat, lon, speed, course] of f.v) cur.set(id, [lat, lon, speed, course]);
      aisStates.push(cur);
      aisTimes.push(f.t);
    }
    const radar = (doc.radar || []).map((r) => ({
      datetime: r.t, ais_available: r.ais, platform: r.platform,
      zones: Object.fromEntries(Object.entries(r.zones).map(([zid, z]) => [zid, { ...z, detections: z.dets.map(([lat, lon, len_m, st]) =>
        ({ lat, lon, len_m, ais: st === "a" ? {} : null, state: st })) }])),
    }));
    const entries = [...aisTimes.map((t, k) => ({ t, ais: k })), ...radar.map((r, k) => ({ t: r.datetime, radar: k }))]
      .sort((x, y) => toDate(x.t) - toDate(y.t));
    const states = [], times = [], kinds = [], tracks = new Map();
    const empty = new Map();
    let lastAis = -1;
    entries.forEach((e, i) => {
      if (e.ais !== undefined) lastAis = e.ais;
      const fresh = lastAis >= 0 && toDate(e.t) - toDate(aisTimes[lastAis]) <= 2 * 3.6e6;
      const st = fresh ? aisStates[lastAis] : empty;
      states.push(st);
      times.push(e.t);
      kinds.push(e.ais !== undefined ? "ais" : "radar");
      if (e.ais !== undefined) {
        for (const [id, [lat, lon]] of st) {
          if (!tracks.has(id)) tracks.set(id, []);
          const tr = tracks.get(id);
          const last = tr[tr.length - 1];
          if (!last || last[1] !== lon || last[2] !== lat) tr.push([i, lon, lat]);
        }
      }
    });
    return { names: doc.names, states, times, kinds, tracks, radar, step: doc.step_min || 10, hours: doc.hours || 24,
      aisFrom: aisTimes[0], radarFrom: radar[0]?.datetime };
  }

  // ------------------------------------------------------------ mouvement (direct seulement)
  // Position estimée : un navire en route avance selon sa vitesse et son cap depuis son dernier relevé AIS,
  // 20 min au plus (au-delà, on n'invente pas la route) ; un relevé de plus d'une heure reste à sa place.
  let LIVE = null;
  const KM_PER_KN_MIN = 1.852 / 60;
  function estimate(v, minutes) {
    if (!(v.speed >= 1) || v.course == null || (v.age_min || 0) > 60) return [v.lon, v.lat];
    const km = v.speed * KM_PER_KN_MIN * Math.min(minutes, 20), a = (v.course * Math.PI) / 180;
    return [v.lon + (km * Math.sin(a)) / (111.32 * Math.cos((v.lat * Math.PI) / 180)), v.lat + (km * Math.cos(a)) / 110.54];
  }
  const phase = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 997; return h / 997; };
  function liveFeatures() {
    const since = Math.max(0, (Date.now() - LIVE.at) / 60000);
    const lines = [];
    const out = LIVE.vessels.map((v) => {
      const age = (v.age_min || 0) + since;
      const [lon, lat] = estimate(v, age);
      if (lon !== v.lon || lat !== v.lat) lines.push({ type: "Feature", properties: { seg: v.seg },
        geometry: { type: "LineString", coordinates: [[v.lon, v.lat], [lon, lat]] } });
      return pt(lon, lat, { ...v, age: Math.round(age), ph: phase(v.id) });
    });
    map.getSource("estim")?.setData(fc(lines));
    return out;
  }
  // Animation : flux des sillages (~12 images/s), pulsation (~20 images/s), positions estimées (toutes les 2 s).
  // Arrêtée en rejeu, onglet caché, ou si « réduire les animations » est demandé.
  const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DASHES = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
    [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]];
  let flowStep = 0, lastFlow = 0, lastPulse = 0, lastMove = 0;
  function animate(t) {
    requestAnimationFrame(animate);
    if (STILL || document.hidden || !map.getLayer("v-pulse")) return;
    if (t - lastFlow > 80) {
      lastFlow = t; flowStep = (flowStep + 1) % DASHES.length;
      map.setPaintProperty("trails-flow", "line-dasharray", DASHES[flowStep]);
    }
    if (t - lastPulse > 50) {
      lastPulse = t;
      const frac = ["%", ["+", (t % 2600) / 2600, ["coalesce", ["get", "ph"], 0]], 1];
      map.setPaintProperty("v-pulse", "circle-radius", ["+", 5, ["*", 13, frac]]);
      map.setPaintProperty("v-pulse", "circle-stroke-opacity", ["*", 0.5, ["-", 1, frac]]);
    }
    if (replayIndex === null && LIVE && t - lastMove > 2000) { lastMove = t; map.getSource("vessels").setData(fc(liveFeatures())); }
  }
  if (!STILL) mapReady.then(() => requestAnimationFrame(animate));

  function featuresAt(i) {
    const out = [];
    for (const [id, [lat, lon, speed, course]] of REPLAY.states[i]) {
      const [name, type, seg, length] = REPLAY.names[id] || ["(sans nom)", "", "other", 0];
      out.push(pt(lon, lat, { id, name, type, seg, length, speed, course, zone: "" }));
    }
    return out;
  }

  function trailsAt(i, span = Math.round(360 / (REPLAY.step || 10))) {  // 6 h de trace
    const out = [];
    for (const [id, pts] of REPLAY.tracks) {
      const seg = (REPLAY.names[id] || [])[2] || "other";
      const p = pts.filter(([k]) => k <= i && k >= i - span);
      for (let j = 1; j < p.length; j++) {
        if (p[j][1] === p[j - 1][1] && p[j][2] === p[j - 1][2]) continue;  // navire immobile : pas de tronçon
        out.push({ type: "Feature", properties: { seg, a: (i - p[j][0]) / span },
          geometry: { type: "LineString", coordinates: [[p[j - 1][1], p[j - 1][2]], [p[j][1], p[j][2]]] } });
      }
    }
    return out;
  }

  function renderTimeline() {
    if (!REPLAY) return;
    const n = REPLAY.times.length;
    const range = $("tl-range");
    const t0 = toDate(REPLAY.times[0]).getTime(), t1 = toDate(REPLAY.times[n - 1]).getTime();
    REPLAY.t0 = t0;
    range.max = String(Math.max(1, Math.round((t1 - t0) / 60000)));
    if (replayIndex === null) range.value = range.max;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const W = 1000, H = 26;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "none");
    const xOf = (t) => ((t - t0) / Math.max(t1 - t0, 1)) * W;
    if (REPLAY.hours > 24) {
      // Flux quotidien des passages : PortWatch (par type), puis passages visibles (hormuz.now) pour les jours pas encore publiés.
      const days = new Map();
      for (const p of DATA.portwatch) days.set(p.date, { total: p.transits, tankers: p.tankers, src: "PortWatch" });
      for (const d of DATA.daily_visible || []) if (!days.has(d.date)) days.set(d.date, { total: d.total, tankers: d.tankers, src: "hormuz.now (AIS visible)", partial: d.partial });
      const shown = [...days.entries()].filter(([date]) => { const t = toDate(date + "T00:00:00Z").getTime(); return t + 86400e3 > t0 && t < t1; });
      const max = Math.max(...shown.map(([, v]) => v.total), 1);
      const bw = (86400e3 / Math.max(t1 - t0, 1)) * W;
      for (const [date, v] of shown) {
        const x = xOf(toDate(date + "T00:00:00Z").getTime());
        const hT = (v.total / max) * (H - 2), hK = (v.tankers / max) * (H - 2);
        const mk = (y, h, cls) => { const r = document.createElementNS(ns, "rect"); r.setAttribute("x", Math.max(x, 0) + 0.6);
          r.setAttribute("width", Math.max(bw - 1.2, 0.8)); r.setAttribute("y", y); r.setAttribute("height", Math.max(h, 0)); r.setAttribute("class", cls); return r; };
        const g = document.createElementNS(ns, "g");
        g.append(mk(H - hT, hT - hK, v.src === "PortWatch" ? "bar-other" : "bar-other light"), mk(H - hK, hK, v.src === "PortWatch" ? "bar-tank" : "bar-tank light"));
        const title = document.createElementNS(ns, "title");
        title.textContent = `${date.split("-").reverse().join("/")} : ${v.total} passages dont ${v.tankers} pétroliers · ${v.src}${v.partial ? " (journée en cours)" : ""}`;
        g.append(title);
        svg.append(g);
      }
      $("tl-spark").title = "Passages quotidiens du détroit : pétroliers (bleu) et autres navires (gris). Teinte claire : AIS visible, en attendant PortWatch.";
    } else {
      // 24 h : navires en route à chaque relevé AIS.
      const pts = REPLAY.times.map((t, i) => { if (REPLAY.kinds[i] !== "ais") return null; let k = 0;
        for (const v of REPLAY.states[i].values()) if (v[2] >= 1) k++; return [xOf(toDate(t).getTime()), k]; }).filter(Boolean);
      const max = Math.max(...pts.map((p) => p[1]), 1);
      const path = document.createElementNS(ns, "path");
      path.setAttribute("class", "area");
      if (pts.length) path.setAttribute("d", `M${pts[0][0]},${H} ` + pts.map(([x, c]) => `L${x},${H - (c / max) * (H - 2)}`).join(" ") + ` L${pts.at(-1)[0]},${H} Z`);
      svg.append(path);
      $("tl-spark").title = `Navires en route à chaque relevé (jusqu'à ${max})`;
    }
    $("tl-spark").replaceChildren(svg);
    // Repères d'événements.
    const ticks = $("tl-ticks");
    ticks.replaceChildren();
    for (const r of REPLAY.radar || []) {  // passages radar : repères blancs plus hauts
      const t = toDate(r.datetime).getTime();
      const s = el("span");
      s.style.left = `${((t - t0) / Math.max(t1 - t0, 1)) * 100}%`;
      s.style.background = "#ffffff";
      s.style.height = "12px";
      s.style.top = "-4px";
      s.title = `${dmhm(r.datetime)} · passage radar Sentinel-1 · ${Object.values(r.zones).reduce((a, z) => a + z.count, 0)} coques`;
      ticks.append(s);
    }
    for (const ev of DATA.events) {
      const t = toDate(ev.time).getTime();
      if (t < t0 || t > t1) continue;
      const s = el("span");
      s.style.left = `${((t - t0) / Math.max(t1 - t0, 1)) * 100}%`;
      s.style.background = ev.kind === "silent" ? COLORS.s2 : ev.kind === "crossing" ? COLORS.s1 : "#c3c2b7";
      s.title = `${dmhm(ev.time)} · ${ev.name} : ${ev.text}`;
      ticks.append(s);
    }
    const axis = $("tl-axis");
    axis.replaceChildren();
    const longSpan = t1 - t0 > 2 * 86400e3;
    for (let k = 0; k <= 4; k++) {
      const t = new Date(t0 + ((t1 - t0) * k) / 4);
      const s = el("span", null, longSpan ? `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}` : `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`);
      s.style.left = `${k * 25}%`;
      axis.append(s);
    }
    updateTimeLabel();
  }

  function updateTimeLabel() {
    const live = replayIndex === null;
    $("timebar").classList.toggle("replay", !live);
    $("golive").classList.toggle("on", live);
    if (!REPLAY) return;
    const i = live ? REPLAY.times.length - 1 : replayIndex;
    $("tl-time").textContent = live ? "Direct" : `${dmhm(REPLAY.times[i])}`;
    const first = REPLAY.times[0];
    const span = (toDate(REPLAY.times.at(-1)) - toDate(first)) / 3.6e6;
    let partial = "";
    if (REPLAY.aisFrom && toDate(REPLAY.aisFrom) - toDate(first) > 3.6e6) {
      partial = ` · radar depuis ${dmhm(first).slice(0, 5)}, positions AIS depuis ${dmhm(REPLAY.aisFrom)}`;
    } else if (span < REPLAY.hours * 0.95) {
      const full = new Date(toDate(first).getTime() + REPLAY.hours * 3.6e6);
      partial = ` · ${fmtHours(span)} enregistrées (depuis ${dmhm(first)}), complet le ${dmhm(full.toISOString()).slice(0, 5)}`;
    }
    if (!live && REPLAY.kinds[i] === "radar") partial = " · image radar (coques), pas de positions AIS à cet instant" + partial;
    $("tl-sub").textContent = (live ? `glisser pour remonter ${RANGES[replayRange]}` : `rejeu · pas ${REPLAY.step} min`) + partial;
    const box = $("tl-ranges");
    box.replaceChildren();
    for (const [k, label] of Object.entries(RANGES)) {
      const b = el("button", k === replayRange ? "on" : "", label);
      b.onclick = async () => { if (k === replayRange) return; replayRange = k; goLive(); await refreshReplay(true); };
      box.append(b);
    }
  }

  function showFrame(i) {
    replayIndex = i;
    map.getSource("estim")?.setData(fc([]));
    map.getSource("vessels").setData(fc(featuresAt(i)));
    map.getSource("trails").setData(fc(trailsAt(i)));
    // Radar : le dernier passage antérieur à l'instant affiché.
    const t = REPLAY.times[i];
    const source = REPLAY.radar && REPLAY.radar.length ? REPLAY.radar : (DATA.radar.passes || []);
    // Seul un passage de moins de 3 jours avant l'instant choisi est montré : une coque ancienne n'est plus une information.
    updateRadar(source.filter((r) => toDate(r.datetime) <= toDate(t) && toDate(t) - toDate(r.datetime) <= 3 * 86400e3));
    applyVisibility();
    renderFeed(DATA);
    updateTimeLabel();
    tickClock();
  }

  function goLive() {
    if (playing) { clearInterval(playing); playing = null; $("play").textContent = "▶"; }
    replayIndex = null;
    $("tl-range").value = $("tl-range").max;
    updateMap(DATA);
    renderFeed(DATA);
    updateTimeLabel();
    tickClock();
  }

  // Image affichée pour une position du curseur : la dernière image antérieure à cet instant.
  function indexAt(minutes) {
    const t = REPLAY.t0 + minutes * 60000;
    let lo = 0, hi = REPLAY.times.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (toDate(REPLAY.times[mid]).getTime() <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  const minutesOf = (i) => Math.round((toDate(REPLAY.times[i]).getTime() - REPLAY.t0) / 60000);

  function setupTimeline() {
    const range = $("tl-range");
    range.oninput = () => {
      if (+range.value >= +range.max) { goLive(); return; }
      showFrame(indexAt(+range.value));
    };
    $("golive").onclick = goLive;
    $("play").onclick = () => {
      if (!REPLAY) return;
      if (playing) { clearInterval(playing); playing = null; $("play").textContent = "▶"; return; }
      let i = replayIndex === null ? 0 : replayIndex;
      $("play").textContent = "❚❚";
      playing = setInterval(() => {
        i += 1;
        if (i >= REPLAY.times.length - 1) { goLive(); return; }
        range.value = String(minutesOf(i));
        showFrame(i);
      }, 350);
    };
  }

  async function refreshReplay(force) {
    if (!force && Date.now() - replayLoadedAt < 9 * 60000) return;
    try {
      const doc = await fetchReplay();
      if (!doc || !doc.frames.length) return;
      REPLAY = buildReplay(doc);
      replayLoadedAt = Date.now();
      renderTimeline();
      if (replayIndex === null) map.getSource("trails").setData(fc(trailsAt(REPLAY.states.length - 1)));
    } catch { /* rejeu indisponible : la carte reste en direct */ }
  }

  // ------------------------------------------------------------ fiche navire
  function findVessel(id) {
    const s = DATA.beacon_off.silent.find((x) => x.id === id);
    const v = DATA.vessels.find((x) => x.id === id);
    return { v, s };
  }
  // ------------------------------------------------------------ panneau de détail
  // Tout élément cliquable (navire, zone, indicateur, événement, coque radar, passage) ouvre ici sa fiche.
  const detailStack = [];
  let currentView = null;

  function openDetail(view, push = true) {
    if (push && currentView) detailStack.push(currentView);
    currentView = view;
    $("detail").hidden = false;
    $("detail-kicker").textContent = view.kicker;
    $("detail-title").textContent = view.title;
    const body = $("detail-body");
    body.replaceChildren();
    view.render(body);
    body.scrollTop = 0;
    $("detail-back").hidden = !detailStack.length;
  }
  function closeDetail() {
    $("detail").hidden = true;
    detailStack.length = 0;
    currentView = null;
    map.getSource("selected")?.setData(fc([]));
    map.getSource("focus")?.setData(fc([]));
  }
  $("detail-close").onclick = closeDetail;
  $("detail-back").onclick = () => { const v = detailStack.pop(); if (v) openDetail(v, false); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

  const dlist = (pairs) => {
    const dl = el("dl");
    for (const [k, v] of pairs) if (v !== undefined && v !== null && v !== "") dl.append(el("dt", null, k), el("dd", null, v));
    return dl;
  };
  const stats = (items) => {
    const row = el("div", "stat-row");
    for (const [v, k] of items) { const d = el("div", "stat"); d.append(el("div", "v", v), el("div", "k", k)); row.append(d); }
    return row;
  };
  const list = (items, empty = "Rien pour l'instant.") => {
    if (!items.length) return el("p", null, empty);
    const ul = el("ul", "list");
    for (const it of items) {
      const li = el("li", it.go ? "go" : "");
      li.append(el("span", null, it.left), el("span", "r", it.right ?? ""));
      if (it.go) li.onclick = it.go;
      ul.append(li);
    }
    return ul;
  };
  const h4 = (t) => el("h4", null, t);
  function miniLine(values, labels) {
    const W = 360, H = 70;
    if (values.length < 2) return el("p", null, "Pas encore assez de relevés.");
    const max = Math.max(...values, 1);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pl = document.createElementNS(ns, "polyline");
    pl.setAttribute("points", values.map((v, i) => `${(i / (values.length - 1)) * W},${H - 4 - (v / max) * (H - 14)}`).join(" "));
    pl.setAttribute("fill", "none"); pl.setAttribute("stroke", COLORS.s1); pl.setAttribute("stroke-width", "2");
    svg.append(pl);
    const t = (x, anchor, txt) => { const n = document.createElementNS(ns, "text"); n.setAttribute("x", x); n.setAttribute("y", 9);
      n.setAttribute("text-anchor", anchor); n.setAttribute("fill", "#94938a"); n.setAttribute("font-size", "10"); n.textContent = txt; return n; };
    if (labels) svg.append(t(0, "start", labels[0]), t(W, "end", labels[1]));
    const box = el("div", "chart");
    box.append(svg);
    return box;
  }

  function findVessel(id) {
    const s = DATA.beacon_off.silent.find((x) => x.id === id);
    const v = DATA.vessels.find((x) => x.id === id);
    return { v, s };
  }

  function openVessel(id) {
    const { v, s } = findVessel(id);
    let base = v || s;
    const rep = REPLAY && REPLAY.names[id];
    if (!base && rep) {
      const last = [...REPLAY.states].reverse().find((st) => st.has(id))?.get(id);
      if (last) base = { id, name: rep[0], type: rep[1], seg: rep[2], length: rep[3], lat: last[0], lon: last[1], speed: last[2] };
    }
    if (!base || base.lat == null) return;
    map.getSource("selected").setData(fc([pt(base.lon, base.lat, {})]));
    // Trajet sur la période du rejeu, surligné sur la carte.
    const track = REPLAY?.tracks.get(id) || [];
    map.getSource("focus").setData(fc(track.length >= 2 ? [{ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: track.map(([, lon, lat]) => [lon, lat]) } }] : []));
    map.flyTo({ center: [base.lon, base.lat], zoom: Math.max(map.getZoom(), 9.5), speed: 1.4 });
    openDetail({ kicker: "Navire", title: base.name, render: (body) => {
      body.append(stats([[`${nf1.format(base.speed || 0)} nd`, "vitesse"], [base.length ? `${base.length} m` : "—", "longueur"],
        [base.dwt ? `${nf0.format(base.dwt / 1000)} kt` : "—", "port en lourd"]]));
      if (s) body.append(el("div", "flag", `${s.likely_switch_off ? "Coupure de balise probable" : "Silencieux (trou de couverture possible)"} · `
        + `depuis ${fmtHours(s.silent_h)} · dernier signal ${dmhm(s.last_signal)} UTC · ${s.neighbors} navires émettent à moins de 20 km`
        + (s.radar ? ` · radar : ${s.radar.present ? "coque toujours là" : "place vide"} (${dmhm(s.radar.t)})` : "")));
      body.append(h4("Identité"), dlist([["Type", base.type], ["Flux", SEG[base.seg]?.label], ["Pavillon", base.flag],
        ["Destination déclarée", base.dest || "—"], ["Identifiant", base.id]]));
      body.append(h4("Position"), dlist([["Zone", base.zone], ["Côté", SIDE[base.side]],
        ["Coordonnées", `${base.lat.toFixed(4)}° N, ${base.lon.toFixed(4)}° E`],
        ["Dernier signal", v ? (v.age_min < 2 ? "à l'instant" : `il y a ${fmtHours(v.age_min / 60)}`) : "—"]]));
      const q = [...DATA.queue_in.map((r) => ({ ...r, dir: "entrer dans le Golfe" })), ...DATA.queue_out.map((r) => ({ ...r, dir: "sortir du Golfe" }))]
        .find((r) => r.id === id);
      if (q) body.append(h4("File d'attente"), dlist([["Déclare vouloir", q.dir], ["Attente observée", q.hours ? fmtHours(q.hours) : "suivi en cours"]]));
      if (REPLAY && track.length) {
        const speeds = REPLAY.states.map((st) => st.get(id)?.[2] ?? null).filter((x) => x !== null);
        let dist = 0;
        for (let k = 1; k < track.length; k++) {
          const [, lo1, la1] = track[k - 1], [, lo2, la2] = track[k];
          dist += Math.hypot((lo2 - lo1) * 111.32 * Math.cos((la1 * Math.PI) / 180), (la2 - la1) * 110.54);
        }
        body.append(h4(`Sur ${RANGES[replayRange]}`), dlist([["Distance parcourue", `${nf0.format(dist)} km`],
          ["Relevés", `${speeds.length}`]]), miniLine(speeds, ["vitesse (nd)", ""]));
      }
      const evs = DATA.events.filter((e) => e.id === id);
      body.append(h4("Événements"), list(evs.map((e) => ({ left: e.text, right: dmhm(e.time) })), "Aucun événement récent."));
    } });
  }

  function zoneView(zoneId) {
    const z = DATA.zones.find((x) => x.id === zoneId) || DATA.zones.find((x) => x.name === zoneId);
    const shape = DATA.zone_shapes.find((x) => x.id === (z?.id ?? zoneId));
    if (!z && !shape) return;
    const name = z?.name || shape.name;
    if (shape) map.flyTo({ center: [shape.lon, shape.lat], zoom: 9.3, speed: 1.4 });
    const ships = DATA.vessels.filter((v) => v.zone === name);
    const still = ships.filter((v) => v.speed < 1).sort((a, b) => (b.dwt || 0) - (a.dwt || 0));
    const silent = DATA.beacon_off.silent.filter((x) => x.zone === name);
    openDetail({ kicker: "Zone de mouillage", title: name, render: (body) => {
      body.append(stats([[nf0.format(still.length), "à l'arrêt"], [nf0.format(ships.length - still.length), "en route"],
        [nf0.format(silent.length), "silencieux"]]));
      const bySeg = Object.fromEntries(Object.keys(SEG).map((k) => [k, still.filter((v) => v.seg === k).length]));
      const dwt = still.filter((v) => v.cat === "tanker").reduce((acc, v) => acc + (v.dwt || 0), 0);
      body.append(h4("Par flux (à l'arrêt)"), dlist(Object.entries(SEG).map(([k, v]) => [v.label, `${bySeg[k]} navires`])),
        dlist([["Capacité pétrolière", `${nf1.format(dwt / 1e6)} Mt de port en lourd`]]));
      if (z) body.append(h4("Attente"), dlist([["Médiane hormuz.now", fmtHours(z.hn_median_h)],
        ["Médiane Portcast (11–17/10)", z.portcast_d ? fmtDays(z.portcast_d) : "—"],
        ["Déclarent vouloir entrer / sortir", `${z.q_in} / ${z.q_out}`]]));
      body.append(h4(`Navires à l'arrêt (${still.length}), par taille`), list(still.slice(0, 60).map((v) => ({
        left: `${v.name} · ${SEG[v.seg]?.label || ""}`, right: v.dwt ? `${nf0.format(v.dwt / 1000)} kt` : "", go: () => openVessel(v.id) }))));
      if (silent.length) body.append(h4("Silencieux dans la zone"), list(silent.map((x) => ({
        left: x.name, right: `depuis ${fmtHours(x.silent_h)}`, go: () => openVessel(x.id) }))));
    } });
  }

  function passView(r) {
    openDetail({ kicker: "Passage radar Sentinel-1", title: `${dmhm(r.datetime)} UTC`, render: (body) => {
      const zs = Object.values(r.zones);
      body.append(stats([[nf0.format(zs.reduce((a, z) => a + z.count, 0)), "coques"],
        [nf0.format(zs.reduce((a, z) => a + z.big, 0)), "≥ 150 m"],
        [r.ais_available ? nf0.format(zs.reduce((a, z) => a + z.dark, 0)) : "—", "sans balise"]]));
      body.append(h4("Par zone"), list(zs.map((z) => ({ left: `${z.label} · couverture ${Math.round((z.coverage ?? 1) * 100)} %`,
        right: `${z.count} coques` }))));
      body.append(h4("Comparaison avec l'AIS"), el("p", null, r.ais_available
        ? `Positions AIS relevées ${r.ais_gap_min} min avant ou après l'image ; une coque sans balise AIS à moins de 1 km est comptée « sans balise ».`
        : "Aucun relevé AIS à moins de 30 min de l'image : comptage des coques seul."));
      body.append(dlist([["Satellite", r.platform], ["Orbite", r.orbit]]));
    } });
  }

  function detectionView(p) {
    const pass = (DATA.radar.passes || []).find((r) => r.datetime === p.time);
    openDetail({ kicker: "Coque détectée au radar", title: `Coque d'environ ${p.len_m} m`, render: (body) => {
      body.append(el("p", null, p.state === "ais" ? "Une balise AIS était à moins de 1 km au même moment : navire identifié."
        : p.state === "dark" ? "Aucune balise AIS à moins de 1 km au même moment : navire sans balise probable (ou structure fixe)."
          : "Pas de relevé AIS au moment de l'image : impossible de dire si ce navire émettait."));
      body.append(dlist([["Image", `${dmhm(p.time)} UTC`], ["Longueur estimée", `${p.len_m} m (± 15 %)`],
        ["Classe probable", p.len_m >= 300 ? "très grand pétrolier (VLCC)" : p.len_m >= 230 ? "Suezmax / Aframax" : p.len_m >= 150 ? "pétrolier moyen, vraquier" : "petit navire"]]));
      if (pass) { const b = el("button", "link", "Voir le passage radar"); b.onclick = () => passView(pass); body.append(b); }
    } });
  }

  const LEVEL = { confirme: ["Confirmé", "ok"], probable: ["Probable", "ancien"], non_confirme: ["Non confirmé", "erreur"],
    contredit: ["Contredit", "erreur"], declaration: ["Déclaration", "declaration"] };
  const levelBadge = (l) => el("span", `state ${(LEVEL[l] || LEVEL.non_confirme)[1]}`, (LEVEL[l] || LEVEL.non_confirme)[0]);
  const LEVEL_WHY = {
    confirme: "Vu par satellite (feu en pleine mer sur la position AIS d'un navire, au même moment) et rapporté par au moins un média indépendant.",
    probable: "Rapporté par au moins deux médias indépendants, ou revendiqué et appuyé par un feu sur un navire, mais sans les deux à la fois.",
    non_confirme: "Une seule source, ou seulement des reprises d'une revendication : aucune preuve indépendante pour l'instant.",
    contredit: "Des sources indépendantes disent le contraire.",
    declaration: "Une prise de position (diplomatie, menace) : on vérifie qui l'a dite, pas si elle est vraie.",
  };
  function clusterView(c) {
    openDetail({ kicker: "Incident · niveau de confirmation", title: c.title || "Incident", render: (body) => {
      const row = el("div");
      row.append(levelBadge(c.level), document.createTextNode(` ${LEVEL_WHY[c.level] || ""}`));
      body.append(row);
      body.append(stats([[nf0.format(c.n_articles), "articles"], [nf0.format(c.n_claims), "reprises d'une revendication"],
        [nf0.format(c.independent_outlets.length), "médias indépendants"], [nf0.format(c.n_fires), "feux sur un navire"]]));
      body.append(dlist([["Période", c.first === c.last ? `${dmhm(c.first)} UTC` : `${dmhm(c.first)} → ${dmhm(c.last)} UTC`],
        ["Médias d'État", c.state_media.join(", ")], ["Médias indépendants", c.independent_outlets.join(", ") || "aucun"]]));
      if (c.fires.length) body.append(h4("Feux en pleine mer sur un navire (NASA FIRMS × AIS)"), list(c.fires.map((f) => ({
        left: `${dmhm(f.time)} · navire à ${nf1.format(f.vessel.km)} km`, right: `${nf1.format(f.frp)} MW`, go: () => openVessel(f.vessel.id) }))));
      body.append(h4("Articles"), list(c.items.map((i) => ({ left: `${i.source || "?"}${i.claim ? " · relaie une revendication" : ""}`,
        right: dmhm(i.time), go: i.url ? () => window.open(i.url, "_blank", "noopener,noreferrer") : null }))));
      body.append(el("p", "note", "Les articles sur le même fait sont regroupés : vingt reprises d'une même déclaration restent une seule "
        + "revendication. Le classement « revendication » se fait sur le titre et la source (« Iran says », médias d'État) : il peut se tromper."));
    } });
  }
  function incidentView(x) {
    const c = (DATA.confirmations || []).find((k) => k.items.some((i) => i.title === x.title && i.time === x.time));
    openDetail({ kicker: "Incident", title: x.title || "Incident", render: (body) => {
      if (c) {
        const row = el("div");
        const b = el("button", "link", "Voir l'événement et toutes ses sources");
        b.onclick = () => clusterView(c);
        row.append(levelBadge(c.level), document.createTextNode(" "), b);
        body.append(row);
      }
      body.append(dlist([["Date", `${dmhm(x.time)} UTC`], ["Type", x.type], ["Gravité", x.severity], ["Source", x.source]]));
      if (x.description) body.append(el("p", null, x.description));
      if (x.url) { const a = el("a", null, "Lire la source"); a.href = x.url; a.target = "_blank"; a.rel = "noopener noreferrer"; body.append(a); }
      body.append(el("p", "note", "Incident relevé par straits.live avec sa source d'origine. Fiabilité selon la source : un média d'État "
        + "(IRNA, etc.) ou une revendication militaire n'est pas une confirmation indépendante."));
      if (x.lat != null) map.flyTo({ center: [x.lon, x.lat], zoom: 9, speed: 1.4 });
    } });
  }
  function fireView(p) {
    openDetail({ kicker: "Feu détecté par satellite", title: p.persistent ? "Feu permanent" : "Feu ponctuel", render: (body) => {
      body.append(dlist([["Détection", `${dmhm(p.time)} UTC`], ["Puissance radiative", `${nf1.format(+p.frp)} MW`], ["Confiance", p.confidence]]));
      const sea = (DATA.fires_at_sea || []).find((f) => f.time === p.time && f.lat === +p.lat && f.lon === +p.lon);
      body.append(el("p", null, p.persistent
        ? "Détecté au même endroit plusieurs jours de suite : très probablement une torchère de plateforme ou une installation à terre."
        : sea && sea.vessel ? `En pleine mer, à ${nf1.format(sea.vessel.km)} km de la position AIS d'un navire au même moment : navire en feu possible.`
        : sea && sea.fixed ? "En pleine mer, revu au même endroit sans navire à proximité : plateforme ou torchère probable."
        : sea ? "En pleine mer, sans navire AIS à proximité au même moment (navire sans balise, plateforme, ou relevé AIS manquant)."
        : "Feu nouveau, à terre ou près de la côte."));
      if (sea && sea.vessel) { const b = el("button", "link", "Voir le navire"); b.onclick = () => openVessel(sea.vessel.id); body.append(b); }
      body.append(el("p", "note", "NASA FIRMS (satellite VIIRS), quelques heures de délai. Les petits feux et ceux sous les nuages ne sont pas vus."));
    } });
  }
  function portsView(focus) {
    openDetail({ kicker: "Ports et contournement", title: focus ? focus.name : "Ports", render: (body) => {
      const ports = focus ? [focus] : DATA.ports;
      for (const p of ports) {
        body.append(h4(`${p.name} · ${p.role}`), dlist([
          ["Pétroliers par jour (7 j)", `${nf1.format(p.tanker_calls_7d || 0)} (avant-guerre ${nf1.format(p.tanker_calls_pre || 0)})`],
          ["Exportations pétrole (7 j)", `${nf0.format((p.export_t_7d || 0) / 1000)} kt/j (avant-guerre ${nf0.format((p.export_t_pre || 0) / 1000)} kt/j)`],
          ["Dernière donnée", p.last_date]]));
        if (p.flag) body.append(el("div", "flag", p.flag));
        body.append(miniLine(p.series.map((r) => r.export_t), [p.series[0]?.date, "exportations, 120 j"]));
      }
      body.append(el("p", "note", "IMF PortWatch : escales et volumes estimés par AIS, quelques jours de retard. Un navire sans balise n'y est pas compté."));
    } });
  }
  function sourcesView() {
    openDetail({ kicker: "Fiabilité", title: "Santé et recoupement des sources", render: (body) => {
      body.append(el("p", null, "Aucune source n'est garantie. L'outil vérifie en continu deux choses : que chaque source répond et est à jour, "
        + "et que ses chiffres concordent avec ceux d'une source indépendante. Une donnée n'est « confirmée » que si deux sources "
        + "indépendantes la recoupent."));
      body.append(h4("Santé des sources"));
      for (const h of DATA.health || []) {
        const row = el("div");
        row.append(el("span", `state ${h.state}`, h.state), document.createTextNode(` ${h.label} · ${h.what}`));
        body.append(row, el("p", "note", h.age_min == null ? (h.error || "jamais collectée") :
          `donnée vieille de ${fmtHours(h.age_min / 60)}${h.error ? " · dernière erreur : " + h.error : ""}`));
      }
      body.append(h4("Notre propre collecte"));
      const gaps = DATA.collector_gaps || [];
      body.append(gaps.length
        ? list(gaps.slice().reverse().map((g) => ({ left: `Interrompue du ${dmhm(g.from)} au ${dmhm(g.to)} UTC`, right: fmtHours(g.minutes / 60) })))
        : el("p", null, "Aucune interruption sur les 3 derniers jours."));
      body.append(el("p", "note", "Pendant une interruption (Mac en veille, réseau coupé), rien n'est observé : les durées et coupures "
        + "qui la chevauchent sont incertaines. Une collecte hébergée en ligne supprimerait ces trous."));
      body.append(h4("Recoupements"));
      for (const c of DATA.checks || []) {
        const row = el("div");
        row.append(levelBadge(c.level || (c.state === "ok" ? "confirme" : "contredit")),
          document.createTextNode(` ${c.what} : nous ${c.ours ?? "—"} · ${c.source} ${c.theirs ?? "—"}`));
        body.append(row, el("p", "note", c.note));
      }
    } });
  }

  function kpiView(key) {
    const sc = Object.fromEntries(DATA.throughput.scenarios.map((s) => [s.key, s]));
    if (key === "transits") openDetail({ kicker: "Indicateur", title: "Passages par jour", render: (body) => {
      body.append(stats([[nf1.format(DATA.status.visible_transits_per_day_7d), "balises allumées"], [nf1.format(sc.central.transits_per_day), "estimés"],
        [nf0.format(DATA.status.baseline_per_day), "avant-guerre"]]));
      body.append(h4("Scénarios"), list(DATA.throughput.scenarios.map((s) => ({ left: `${s.label} — ${s.source}`, right: `${nf1.format(s.transits_per_day)}/j` }))));
      const pts = DATA.portwatch.slice(-120);
      body.append(h4("PortWatch, 120 derniers jours"), miniLine(pts.map((p) => p.avg7), [pts[0].date, pts.at(-1).date]));
      body.append(h4("Passages identifiés (7 j)"), list(DATA.crossings.slice(0, 30).map((c) => ({ left: `${c.name} · ${c.direction === "in" ? "→ Golfe" : "→ golfe d'Oman"}`,
        right: dmhm(c.time) }))));
    } });
    if (key === "wait") openDetail({ kicker: "Indicateur", title: "Attente prévue", render: (body) => {
      body.append(el("p", null, "Loi de Little : attente ≈ (navires qui déclarent vouloir passer + 1) ÷ passages par jour dans le même sens."));
      body.append(h4("Par scénario de débit"), list(DATA.throughput.scenarios.map((s) => ({ left: s.label,
        right: `entrée ${fmtDays(s.wait_in_days)} · sortie ${fmtDays(s.wait_out_days)}` }))));
      body.append(h4(`File déclarée pour entrer (${DATA.queue_in.length})`), list(DATA.queue_in.map((r) => ({ left: `${r.name} → ${r.dest}`,
        right: r.zone_name, go: () => openVessel(r.id) }))));
      body.append(h4(`File déclarée pour sortir (${DATA.queue_out.length})`), list(DATA.queue_out.map((r) => ({ left: `${r.name} → ${r.dest}`,
        right: r.zone_name, go: () => openVessel(r.id) }))));
      body.append(h4("Limites"), el("p", null, "La plupart des navires à l'arrêt déclarent le mouillage comme destination : la file déclarée est un minimum, la prévision une borne basse."));
    } });
    if (key === "fleet") openDetail({ kicker: "Indicateur", title: "Flotte à l'arrêt", render: (body) => {
      body.append(stats([[nf0.format(DATA.fleet.stationary), "à l'arrêt"], [nf0.format(DATA.fleet.tankers), "pétroliers"],
        [nf0.format(DATA.fleet.stale_over_6h), "sans position > 6 h"]]));
      body.append(h4("Par zone"), list(DATA.zones.map((z) => ({ left: z.name, right: `${z.count} navires`, go: () => zoneView(z.id) }))));
    } });
    if (key === "silent") openDetail({ kicker: "Indicateur", title: "Balises coupées", render: (body) => {
      const bo = DATA.beacon_off;
      body.append(stats([[nf0.format(bo.silent.length), "silencieux"], [nf0.format(bo.silent.filter((x) => x.likely_switch_off).length), "coupures probables"],
        [nf0.format(bo.reappeared.length), "réapparitions"]]));
      body.append(el("p", null, "Silencieux : dernière position de plus de 2 h. Coupure probable : au moins 3 navires à moins de 20 km émettent encore."));
      const unconf = bo.reappeared.filter((x) => x.level === "non_confirme").length;
      if (unconf) body.append(el("p", "note", `${unconf} réapparitions sur ${bo.reappeared.length} sont « non confirmées » : moins de 2 h de silence `
        + "réellement observé, la coupure a surtout eu lieu pendant une interruption de notre collecte (le navire a peut-être toujours émis)."));
      body.append(h4("Coupures probables, les plus longues"), list(bo.silent.filter((x) => x.likely_switch_off).sort((a, b) => b.silent_h - a.silent_h)
        .slice(0, 50).map((x) => ({ left: `${x.name} · ${x.zone}`, right: fmtHours(x.silent_h), go: () => openVessel(x.id) }))));
      body.append(h4("Réapparitions"), list(bo.reappeared.slice(0, 40).map((x) => ({
        left: `${x.name} · ${x.verdict.toLowerCase()}${x.level === "non_confirme" ? " · non confirmé" : ""}`,
        right: fmtHours(x.gap_h), go: () => openVessel(x.id) }))));
    } });
    if (key === "radar") openDetail({ kicker: "Indicateur", title: "Radar satellite", render: (body) => {
      body.append(el("p", null, "Sentinel-1 (Copernicus) : une image environ tous les 1,5 jour. Les coques apparaissent balise allumée ou non."));
      body.append(h4("Passages analysés"), list([...(DATA.radar.passes || [])].reverse().map((r) => ({ left: `${dmhm(r.datetime)} UTC · ${r.platform}`,
        right: `${Object.values(r.zones).reduce((a, z) => a + z.count, 0)} coques`, go: () => passView(r) }))));
      body.append(h4("Prochains passages probables"), list((DATA.radar.next_passes || []).map((t) => ({ left: `${dmhm(t)} UTC` }))));
    } });
  }

  // ------------------------------------------------------------ panneau gauche
  function setText(id, text) {
    const n = $(id);
    if (n.textContent !== text) { n.textContent = text; n.classList.remove("flash"); void n.offsetWidth; n.classList.add("flash"); }
  }

  function rangeBar(container, lo, mid, hi, max, fmt) {
    container.replaceChildren();
    const x = (v) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    const track = el("div", "track");
    const span = el("div", "span");
    span.style.left = x(lo); span.style.width = `calc(${x(hi)} - ${x(lo)})`;
    const mark = el("div", "mark");
    mark.style.left = `calc(${x(mid)} - 1px)`;
    const l1 = el("div", "lab", fmt(lo)); l1.style.left = x(lo);
    const l2 = el("div", "lab", fmt(hi)); l2.style.left = `calc(${x(hi)} - 30px)`;
    container.append(track, span, mark, l1, l2);
    container.title = `fourchette ${fmt(lo)} – ${fmt(hi)}`;
  }

  function sparkline(container, series, baseline) {
    const W = 290, H = 64, T = 6, B = 14;
    const pts = series.slice(-240);
    const max = Math.max(baseline * 1.15, ...pts.map((p) => p.avg7));
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Passages quotidiens, moyenne sur 7 jours");
    const mk = (tag, attrs, text) => { const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; return n; };
    svg.append(mk("line", { x1: 0, x2: W, y1: y(baseline), y2: y(baseline), class: "ref" }));
    svg.append(mk("text", { x: W, y: y(baseline) - 3, class: "tick", "text-anchor": "end" }, `avant-guerre ${nf0.format(baseline)}/j`));
    svg.append(mk("polyline", { class: "line", points: pts.map((p, i) => `${x(i).toFixed(1)},${y(p.avg7).toFixed(1)}`).join(" ") }));
    svg.append(mk("text", { x: 0, y: H - 2, class: "tick" }, dmhm(pts[0].date + "T00:00:00Z").slice(0, 5)));
    svg.append(mk("text", { x: W, y: H - 2, class: "tick", "text-anchor": "end" }, dmhm(pts.at(-1).date + "T00:00:00Z").slice(0, 5)));
    container.replaceChildren(svg);
  }

  function updateLeft(d) {
    const st = d.status;
    const sc = Object.fromEntries(d.throughput.scenarios.map((s) => [s.key, s]));
    const status = $("status");
    const LABELS = { restricted: "Restreint", closed: "Fermé", open: "Ouvert", disrupted: "Perturbé", normal: "Normal" };
    status.replaceChildren(el("b", null, (LABELS[String(st.label).toLowerCase()] || st.label).toUpperCase()), document.createTextNode(` · ${nf0.format(st.pct_of_normal)} % du trafic normal`));

    setText("k-visible", nf1.format(st.visible_transits_per_day_7d));
    setText("k-estimated", nf1.format(sc.central.transits_per_day));
    rangeBar($("r-transits"), sc.bas.transits_per_day, sc.central.transits_per_day, sc.haut.transits_per_day,
      Math.max(sc.haut.transits_per_day * 1.1, 20), (v) => nf1.format(v));
    sparkline($("spark"), d.portwatch, st.baseline_per_day);
    $("spark-foot").textContent = `IMF PortWatch, moyenne 7 j · dernière donnée ${dmhm(d.portwatch.at(-1).date + "T00:00:00Z").slice(0, 5)}`;

    setText("w-in", fmtDays(sc.central.wait_in_days));
    setText("w-out", fmtDays(sc.central.wait_out_days));
    const maxW = Math.max(sc.bas.wait_in_days || 0, sc.bas.wait_out_days || 0, 3) * 1.1;
    rangeBar($("r-in"), sc.haut.wait_in_days, sc.central.wait_in_days, sc.bas.wait_in_days, maxW, fmtDays);
    rangeBar($("r-out"), sc.haut.wait_out_days, sc.central.wait_out_days, sc.bas.wait_out_days, maxW, fmtDays);

    setText("k-fleet", nf0.format(d.fleet.stationary));
    setText("k-tankers", nf0.format(d.fleet.tankers));
    const bars = $("zone-bars");
    bars.replaceChildren();
    const top = d.zones.slice(0, 7);
    const vmax = Math.max(...top.map((z) => z.count), 1);
    for (const z of top) {
      const row = el("div", "row");
      const track = el("div", "bar-track");
      const fill = el("div", "bar-fill");
      fill.style.width = `${(z.count / vmax) * 100}%`;
      track.append(fill);
      row.append(el("span", "name", z.name), track, el("span", "n", z.count));
      row.title = `${z.name} : ${z.count} navires à l'arrêt, dont ${z.tankers} pétroliers`;
      const shape = d.zone_shapes.find((s) => s.id === z.id);
      row.onclick = () => zoneView(z.id);
      bars.append(row);
    }

    const bo = d.beacon_off;
    setText("k-silent", nf0.format(bo.silent.length));
    setText("k-likely", nf0.format(bo.silent.filter((s) => s.likely_switch_off).length));
    setText("k-back", nf0.format(bo.reappeared.length));
    setText("k-dark", nf0.format(bo.reappeared.filter((r) => r.verdict === "Passage sans balise déduit").length));
    $("k-lost").textContent = bo.lost ? `${nf0.format(bo.lost)} perdus de vue : sortis de la zone, ou disparus pendant une interruption de notre collecte (non comptés).` : "";

    const portsBox = $("ports");
    portsBox.replaceChildren();
    for (const p of d.ports || []) {
      const row = el("div", "row");
      const n = el("span", "n", nf1.format(p.tanker_calls_7d || 0));
      n.append(el("small", null, ` (${nf1.format(p.tanker_calls_pre || 0)})`));
      if (p.flag) n.append(el("span", "warn", "⚠"));
      row.append(el("span", "name", `${p.name}`), n);
      row.title = p.flag || `${p.name} : ${p.role}`;
      row.onclick = (e) => { e.stopPropagation(); portsView(p); };
      portsBox.append(row);
    }
    const health = d.health || [];
    const bad = health.filter((h) => h.state === "erreur" || h.state === "absent").length;
    const warnN = health.filter((h) => h.state === "ancien").length + (d.checks || []).filter((c) => c.state === "ecart").length;
    const chip = $("srcchip");
    chip.className = "srcchip " + (bad ? "bad" : warnN ? "warn" : "ok");
    chip.textContent = `Sources · ${health.filter((h) => h.state === "ok").length}/${health.length} à jour${warnN ? ` · ${warnN} à vérifier` : ""}`;

    const passes = d.radar.passes || [];
    const line = $("radar-line");
    line.replaceChildren();
    if (passes.length) {
      const last = passes.at(-1);
      const n = Object.values(last.zones).reduce((a, z) => a + z.count, 0);
      const dark = Object.values(last.zones).reduce((a, z) => a + (z.dark || 0), 0);
      line.append(document.createTextNode("Dernier passage "), el("b", null, `${dmhm(last.datetime)} UTC`),
        document.createTextNode(` · `), el("b", null, nf0.format(n)), document.createTextNode(" coques"),
        document.createTextNode(last.ais_available ? ` · ${dark} sans balise` : " · pas d'AIS au même moment"));
    } else line.textContent = d.radar.note || "Aucun passage analysé.";
    const nxt = (d.radar.next_passes || []).map((t) => dmhm(t)).join(", ");
    $("radar-next").textContent = nxt ? `Prochains passages probables (UTC) : ${nxt}` : "";
  }

  // ------------------------------------------------------------ fil en direct
  const KINDS = { crossing: { label: "Passage", color: COLORS.s1 }, silent: { label: "Coupure", color: COLORS.s2 },
    back: { label: "Réapparition", color: "#c3c2b7" }, radar: { label: "Radar", color: COLORS.unknown },
    incident: { label: "Incident", color: "#d03b3b" } };
  let feedFilter = "all";
  const seenEvents = new Set();
  let firstFeed = true;

  function renderFeedFilter() {
    const box = $("feed-filter");
    box.replaceChildren();
    for (const [k, label] of [["all", "Tout"], ...Object.entries(KINDS).map(([k, v]) => [k, v.label])]) {
      const b = el("button", feedFilter === k ? "on" : "", label);
      b.onclick = () => { feedFilter = k; renderFeedFilter(); renderFeed(DATA); };
      box.append(b);
    }
  }
  function renderFeed(d) {
    const list = $("feed");
    list.replaceChildren();
    const until = replayIndex !== null && REPLAY ? toDate(REPLAY.times[replayIndex]).getTime() : Infinity;
    for (const ev of d.events) {
      if (feedFilter !== "all" && ev.kind !== feedFilter) continue;
      if (toDate(ev.time).getTime() > until) continue;
      const key = `${ev.kind}|${ev.id}|${ev.time}`;
      const li = el("li", (!firstFeed && !seenEvents.has(key)) ? "new" : "");
      seenEvents.add(key);
      const k = KINDS[ev.kind];
      const tag = el("div", "tag");
      const sw = el("span", "sw" + (ev.kind === "silent" ? " ring" : ""));
      if (ev.kind === "silent") sw.style.borderColor = k.color; else sw.style.background = k.color;
      tag.append(sw, el("span", null, k.label));
      if (ev.level && (ev.kind === "incident" || ev.level === "non_confirme")) tag.append(levelBadge(ev.level));
      const body = el("div");
      body.append(tag, el("div", "name", ev.name), el("div", "txt", ev.text));
      li.append(el("div", "t", dmhm(ev.time)), body);
      li.classList.add("go");
      li.onclick = () => {
        if (ev.kind === "incident") {
          const c = (d.confirmations || []).find((k) => k.first === ev.first && k.title === ev.text);
          if (c) clusterView(c);
        } else if (ev.kind === "radar") {
          const pass = (d.radar.passes || []).find((r) => r.datetime.slice(0, 16) === ev.time.slice(0, 16));
          if (pass) passView(pass);
        } else if (ev.id) openVessel(ev.id);
      };
      list.append(li);
    }
    firstFeed = false;
  }

  // ------------------------------------------------------------ tiroir
  const TABS = [
    { key: "queues", label: "Files d'attente" },
    { key: "silent", label: "Balises coupées", count: (d) => d.beacon_off.silent.length },
    { key: "back", label: "Réapparitions", count: (d) => d.beacon_off.reappeared.length },
    { key: "crossings", label: "Passages 7 j", count: (d) => d.crossings.length },
    { key: "history", label: "Historique" },
    { key: "radar", label: "Radar", count: (d) => (d.radar.passes || []).length },
    { key: "markets", label: "Marchés et recherche", count: (d) => (d.notes || []).length },
    { key: "method", label: "Méthode et sources" },
  ];
  let tab = "queues";
  const sortState = {};

  function renderTabs(d) {
    const nav = $("tabs");
    nav.replaceChildren();
    for (const t of TABS) {
      const b = el("button", t.key === tab ? "on" : "", t.label);
      b.setAttribute("role", "tab");
      if (t.count) b.append(el("span", "count", t.count(d)));
      b.onclick = () => { tab = t.key; renderTabs(DATA); renderTab(DATA); };
      nav.append(b);
    }
  }

  function table(rows, cols, opts = {}) {
    const wrap = el("div");
    if (!rows.length) { wrap.append(el("p", "foot", opts.empty || "Rien pour l'instant.")); return wrap; }
    const id = opts.id || cols.map((c) => c[0]).join();
    const st = sortState[id];
    if (st) {
      rows = [...rows].sort((a, b) => {
        const x = a[st.key], y = b[st.key];
        const r = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "fr");
        return st.dir * r;
      });
    }
    const t = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const [key, label] of cols) {
      const th = el("th", null, label + (st && st.key === key ? (st.dir > 0 ? " ▲" : " ▼") : ""));
      th.onclick = () => { sortState[id] = { key, dir: st && st.key === key ? -st.dir : -1 }; renderTab(DATA); };
      hr.append(th);
    }
    thead.append(hr);
    const tbody = el("tbody");
    for (const r of rows) {
      const tr = el("tr", opts.onRow ? "go" : "");
      for (const [key, , fmt, strong] of cols) tr.append(el("td", strong ? "strong" : "", fmt ? fmt(r[key], r) : (r[key] ?? "")));
      if (opts.onRow) tr.onclick = () => opts.onRow(r);
      tbody.append(tr);
    }
    t.append(thead, tbody);
    wrap.append(t);
    return wrap;
  }

  function priceChart(series, label) {
    const box = el("div", "chart");
    if (series.length < 2) { box.append(el("p", "foot", "Pas de données.")); return box; }
    const W = 700, H = 170, L = 36, R = 8, T = 10, B = 20;
    const vals = series.map((p) => p[1]);
    const lo = Math.floor(Math.min(...vals) / 10) * 10, hi = Math.ceil(Math.max(...vals) / 10) * 10;
    const x = (i) => L + ((W - L - R) * i) / (series.length - 1);
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / Math.max(hi - lo, 1));
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, text) => { const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; return n; };
    const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    for (let k = 0; k <= 4; k++) { const v = lo + ((hi - lo) * k) / 4;
      svg.append(mk("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }), mk("text", { x: L - 6, y: y(v) + 3, class: "tick", "text-anchor": "end" }, String(v))); }
    const war = series.findIndex((p) => p[0] >= "2026-02-28");
    if (war > 0) svg.append(mk("line", { x1: x(war), x2: x(war), y1: T, y2: H - B, class: "event" }));
    svg.append(mk("polyline", { class: "line", points: series.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ") }));
    svg.append(mk("text", { x: L, y: H - 4, class: "tick" }, series[0][0].split("-").reverse().join("/")),
      mk("text", { x: W - R, y: H - 4, class: "tick", "text-anchor": "end" }, `${series.at(-1)[0].split("-").reverse().join("/")} : ${nf1.format(series.at(-1)[1])} $`));
    box.append(svg);
    return box;
  }

  function noteView(n) {
    openDetail({ kicker: `Note de recherche · ${n.date}`, title: `${n.ticker} · ${n.rating || "—"}`, render: (body) => {
      body.append(el("div", "flag", n.disclaimer || "Recherche automatisée ; pas un conseil en investissement."));
      body.append(h4("Décision des agents"), el("p", null, n.decision || "—"));
      if (n.hormuz_report) body.append(h4("Rapport de l'analyste Ormuz"), el("p", null, n.hormuz_report));
      body.append(dlist([["Modèles", `${n.models?.quick || ""} / ${n.models?.deep || ""}`], ["Durée de l'analyse", `${n.seconds} s`],
        ["Générée", `${dmhm(n.generated_at)} UTC`]]));
    } });
  }

  function historyChart(d) {
    const box = el("div", "chart");
    const W = 1100, H = 170, L = 36, R = 10, T = 10, B = 20;
    const pts = d.portwatch;
    const base = d.status.baseline_per_day;
    const max = Math.max(110, ...pts.map((p) => p.avg7));
    const x = (i) => L + ((W - L - R) * i) / (pts.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const ns = "http://www.w3.org/2000/svg";
    const mk = (tag, attrs, text) => { const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; return n; };
    const svg = mk("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Passages quotidiens depuis janvier 2025" });
    for (const v of [0, 25, 50, 75, 100]) {
      svg.append(mk("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: "grid" }),
        mk("text", { x: L - 6, y: y(v) + 3, class: "tick", "text-anchor": "end" }, String(v)));
    }
    pts.forEach((p, i) => { if (p.date.endsWith("-01") && ["01", "04", "07", "10"].includes(p.date.slice(5, 7)))
      svg.append(mk("text", { x: x(i), y: H - 4, class: "tick", "text-anchor": "middle" }, `${p.date.slice(5, 7)}/${p.date.slice(0, 4)}`)); });
    svg.append(mk("line", { x1: L, x2: W - R, y1: y(base), y2: y(base), class: "ref" }),
      mk("text", { x: W - R, y: y(base) - 4, class: "note", "text-anchor": "end" }, `avant-guerre ${nf0.format(base)}/j`));
    const war = pts.findIndex((p) => p.date >= "2026-02-28");
    if (war > 0) svg.append(mk("line", { x1: x(war), x2: x(war), y1: T, y2: H - B, class: "event" }),
      mk("text", { x: x(war) + 5, y: T + 10, class: "note" }, "28/02 : début de la guerre"));
    svg.append(mk("polyline", { class: "line", points: pts.map((p, i) => `${x(i).toFixed(1)},${y(p.avg7).toFixed(1)}`).join(" ") }));
    const cross = mk("line", { class: "cross", y1: T, y2: H - B, x1: -10, x2: -10, visibility: "hidden" });
    const dot = mk("circle", { r: 4, fill: COLORS.s1, stroke: "#1a1a19", "stroke-width": 2, visibility: "hidden" });
    const hit = mk("rect", { x: L, y: T, width: W - L - R, height: H - T - B, class: "hit" });
    svg.append(cross, dot, hit);
    const tip = $("tip");
    hit.addEventListener("mousemove", (e) => {
      const box2 = svg.getBoundingClientRect();
      const sx = W / box2.width;
      const i = Math.round((((e.clientX - box2.left) * sx - L) / (W - L - R)) * (pts.length - 1));
      if (i < 0 || i >= pts.length) return;
      const p = pts[i];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(i)); dot.setAttribute("cy", y(p.avg7)); dot.setAttribute("visibility", "visible");
      tip.replaceChildren(el("b", null, p.date.split("-").reverse().join("/")),
        el("div", "sub", `${p.transits} passages ce jour · ${p.tankers} pétroliers`),
        el("div", "sub", `moyenne 7 j : ${nf1.format(p.avg7)}`));
      tip.hidden = false;
      const stage = document.querySelector(".stage").getBoundingClientRect();
      tip.style.left = Math.min(e.clientX - stage.left + 14, stage.width - 290) + "px";
      tip.style.top = e.clientY - stage.top - 70 + "px";
    });
    hit.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); });
    box.append(svg);
    return box;
  }

  function renderTab(d) {
    const body = $("tab-body");
    body.replaceChildren();
    const fly = (r) => openVessel(r.id);
    if (tab === "queues") {
      const two = el("div", "two-col");
      const left = el("div");
      left.append(el("h2", null, "Navires à l'arrêt par zone"), table(d.zones, [
        ["name", "Zone", null, true], ["side", "Côté", (v) => SIDE[v] || v], ["count", "À l'arrêt"], ["tankers", "Pétroliers"],
        ["q_in", "Veulent entrer"], ["q_out", "Veulent sortir"],
        ["hn_median_h", "Médiane hormuz.now", (v) => fmtHours(v)], ["portcast_d", "Médiane Portcast", (v) => (v ? fmtDays(v) : "—")]],
      { id: "zones", onRow: (r) => zoneView(r.id) }));
      const right = el("div");
      right.append(el("h2", null, "Scénarios de débit"), table(d.throughput.scenarios, [
        ["label", "Scénario", null, true], ["transits_per_day", "Passages/j", (v) => nf1.format(v)],
        ["wait_in_days", "Attente entrée", fmtDays], ["wait_out_days", "Attente sortie", fmtDays], ["source", "Source"]], { id: "sc" }));
      right.append(el("h2", null, "File déclarée pour entrer dans le Golfe"), table(d.queue_in, [
        ["name", "Navire", null, true], ["type", "Type"], ["zone_name", "Zone"], ["dest", "Destination"],
        ["dwt", "Port en lourd", (v) => nf0.format(v)], ["hours", "Attente observée", (v) => (v ? fmtHours(v) : "suivi en cours")]],
      { id: "qin", onRow: fly, empty: "Aucun navire ne déclare cette intention." }));
      right.append(el("h2", null, "File déclarée pour sortir du Golfe"), table(d.queue_out, [
        ["name", "Navire", null, true], ["type", "Type"], ["zone_name", "Zone"], ["dest", "Destination"],
        ["dwt", "Port en lourd", (v) => nf0.format(v)], ["hours", "Attente observée", (v) => (v ? fmtHours(v) : "suivi en cours")]],
      { id: "qout", onRow: fly, empty: "Aucun navire ne déclare cette intention." }));
      two.append(left, right);
      body.append(two);
    } else if (tab === "silent") {
      body.append(table(d.beacon_off.silent, [
        ["name", "Navire", null, true], ["type", "Type"], ["length", "Long. (m)"], ["zone", "Dernière position"],
        ["side", "Côté", (v) => SIDE[v] || v], ["speed", "Vitesse alors", (v) => `${nf1.format(v)} nd`],
        ["last_signal", "Dernier signal (UTC)", (v) => dmhm(v)], ["silent_h", "Silencieux depuis", fmtHours],
        ["likely_switch_off", "Lecture", (v, r) => (v ? `Coupure probable (${r.neighbors} voisins émettent)` : `Trou de couverture possible`)],
        ["radar", "Contrôle radar", (v) => (!v ? "prochain passage" : v.present ? `toujours là (${dmhm(v.t)})` : `parti (${dmhm(v.t)})`)]],
      { id: "silent", onRow: fly }));
    } else if (tab === "back") {
      body.append(table(d.beacon_off.reappeared, [
        ["name", "Navire", null, true], ["type", "Type"], ["off", "Coupure (UTC)", dmhm], ["on", "Réapparition (UTC)", dmhm],
        ["gap_h", "Durée", fmtHours], ["from", "De"], ["to", "À"], ["moved_km", "Déplacement", (v) => `${nf0.format(v)} km`],
        ["verdict", "Lecture"], ["observed_h", "Silence observé", fmtHours],
        ["level", "Niveau", (v) => (LEVEL[v] || LEVEL.probable)[0]]], { id: "back", onRow: fly, empty: "Aucune réapparition pour l'instant." }));
    } else if (tab === "crossings") {
      body.append(table(d.crossings, [
        ["time", "Date (UTC)", dmhm], ["name", "Navire", null, true], ["type", "Type"],
        ["direction", "Sens", (v) => (v === "in" ? "→ Golfe" : "→ golfe d'Oman")], ["dwt", "Port en lourd", (v) => nf0.format(v || 0)],
        ["destination", "Destination"], ["flag", "Pavillon"],
        ["signal_gap_min", "Trou de signal", (v) => (v >= 60 ? fmtHours(v / 60) : "—")],
        ["observation", "Passage", (v) => (v === "reconstitue" ? "reconstitué" : "observé")]],
      { id: "cross", onRow: (r) => { const ev = d.events.find((e) => e.kind === "crossing" && e.name === r.name); if (ev?.id) openVessel(ev.id); } }));
    } else if (tab === "history") {
      body.append(historyChart(d), el("p", "foot", "IMF PortWatch, moyenne sur 7 jours. PortWatch ne voit que les navires qui émettent : en guerre, il sous-compte."));
    } else if (tab === "radar") {
      const rows = [...(d.radar.passes || [])].reverse().map((r) => {
        const zs = Object.values(r.zones);
        return { datetime: r.datetime, platform: r.platform.replace("sentinel-", "Sentinel-").toUpperCase().replace("SENTINEL", "Sentinel"),
          zones: zs.map((z) => `${z.label} ${z.count}${(z.coverage ?? 1) < 0.6 ? " (partiel)" : ""}`).join(" · "),
          big: zs.reduce((a, z) => a + z.big, 0), dark: r.ais_available ? zs.reduce((a, z) => a + z.dark, 0) : null,
          check: (() => { const f = zs.reduce((a, z) => a + (z.ais_found || 0), 0), c = zs.reduce((a, z) => a + (z.ais_in_cover || 0), 0);
            return c ? `${f}/${c} (${Math.round((f / c) * 100)} %)` : "—"; })() };
      });
      body.append(table(rows, [["datetime", "Date (UTC)", dmhm, true], ["platform", "Satellite"], ["zones", "Coques par zone"],
        ["big", "Dont ≥ 150 m"], ["dark", "Sans balise AIS", (v) => (v == null ? "—" : v)], ["check", "Contrôle AIS retrouvés"]],
      { id: "radar", onRow: (row) => { const p = (d.radar.passes || []).find((r) => r.datetime === row.datetime); if (p) passView(p); } }),
      el("p", "foot", "Détection : points au moins 13 dB plus brillants que l'eau voisine, à plus de 1 km des côtes, 25 à 500 m. Images : Copernicus Sentinel-1 via Microsoft Planetary Computer."));
    } else if (tab === "markets") {
      const mk = d.markets || {};
      const two = el("div", "two-col");
      const left = el("div");
      left.append(el("h2", null, "Brent ($/baril)"), priceChart(mk.brent || [], "Brent"),
        el("p", "foot", "FRED (données de l'EIA), quotidien. Barre verticale : début de la guerre."));
      const c = d.correlations || {};
      left.append(el("h2", null, "Le Brent suit-il les passages du détroit ?"),
        el("p", null, `Sur ${c.n || 0} jours : corrélation des niveaux r = ${c.level_r == null ? "—" : nf2.format(c.level_r)}`
          + ` (depuis la guerre : ${c.level_r_war == null ? "—" : nf2.format(c.level_r_war)}). Variations décalées :`),
        list((c.lags || []).filter((l) => l.r != null && Math.abs(l.lag) <= 5).map((l) => ({
          left: l.lag === 0 ? "même jour" : l.lag > 0 ? `passages, puis Brent ${l.lag} j après` : `Brent, puis passages ${-l.lag} j après`,
          right: `r = ${nf2.format(l.r)}` }))),
        el("p", "foot", "Corrélation n'est pas causalité ; le prix dépend de nombreux autres facteurs."));
      const right = el("div");
      right.append(el("h2", null, "Notes de recherche (TradingAgents)"));
      right.append(list((d.notes || []).map((n) => ({ left: `${n.ticker} · ${n.date} · ${n.rating || "—"}`,
        right: "lire", go: () => noteView(n) })), "Aucune note pour l'instant."));
      right.append(el("p", "foot", "Agents d'IA, dont un analyste nourri par Hormuz Watch. Recherche uniquement, pas un conseil en investissement ; les faits sont à vérifier."));
      two.append(left, right);
      body.append(two);
    } else if (tab === "method") {
      const ul = el("ul", "method");
      for (const t of [
        "Positions AIS publiques (hormuz.now, CC BY 4.0, antennes terrestres) : ne voient pas les navires qui coupent leur balise.",
        "Prévision d'attente : loi de Little, (navires déclarant vouloir passer + 1) ÷ passages par jour dans le même sens, sous trois scénarios de débit datés (AIS visible ; PortWatch corrigé de 52 % de passages sans balise selon Windward en septembre ; niveau Lloyd's List fin septembre).",
        "Balises coupées : navire silencieux depuis plus de 2 h ; coupure probable si au moins 3 navires à moins de 20 km émettent encore. Réapparu de l'autre côté du détroit : passage sans balise déduit.",
        "Radar Sentinel-1 (Copernicus, gratuit) : un passage environ tous les 1,5 jour ; les coques sont comparées aux positions AIS relevées à moins de 30 min de l'image.",
        "Prototype : chiffres indicatifs, non destinés à une décision opérationnelle.",
      ]) ul.append(el("li", null, t));
      body.append(ul);
    }
  }

  // ------------------------------------------------------------ fraîcheur, horloge
  function tickClock() {
    const d = new Date();
    $("clock").textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    if (!DATA) return;
    const min = Math.round((Date.now() - toDate(DATA.generated_at)) / 60000);
    const live = $("live");
    if (replayIndex !== null && REPLAY) {
      live.className = "live replay";
      $("live-text").textContent = `Rejeu · ${dmhm(REPLAY.times[replayIndex])} UTC`;
      return;
    }
    const stale = min > staleMin();
    live.className = "live " + (stale ? "stale" : "on");
    $("live-text").textContent = stale ? `Données figées · ${min} min` : `En direct · ${min < 1 ? "à l'instant" : `il y a ${min} min`}`;
  }

  // ------------------------------------------------------------ cycle
  async function apply(d) {
    DATA = d;
    await mapReady;
    updateMap(d);
    if (replayIndex !== null && REPLAY) showFrame(replayIndex);
    updateLeft(d);
    renderFeed(d);
    renderTabs(d);
    renderTab(d);
    tickClock();
  }

  async function poll() {
    try {
      const d = await fetchData();
      if (!DATA || d.generated_at !== DATA.generated_at) { await apply(d); await refreshReplay(false); }
    } catch (e) { /* réseau ou source indisponible : nouvel essai au prochain tour */ }
  }

  // Panneaux repliables : gauche, droite, tiroir du bas, ou tout masquer pour ne garder que la carte.
  // L'état est mémorisé dans ce navigateur (aussi quand le tableau de bord est intégré au portail Master).
  const LAYOUT_KEY = "hw-layout";
  let layout = {};
  try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { layout = {}; }
  function applyLayout() {
    const b = document.body.classList;
    b.toggle("left-collapsed", !!layout.left);
    b.toggle("right-collapsed", !!layout.right);
    b.toggle("chrome-hidden", !!layout.all);
    b.toggle("drawer-collapsed", !!layout.drawer);
    b.toggle("timebar-collapsed", !!layout.timebar);
    b.toggle("legend-collapsed", !!layout.legend);
    $("drawer").classList.toggle("collapsed", !!layout.drawer);
    const side = (id, hidden, label, shown, folded) => {
      const t = $(id);
      t.textContent = hidden ? folded : shown;
      t.title = `${hidden ? "Afficher" : "Masquer"} ${label}`;
      t.setAttribute("aria-label", t.title);
      t.setAttribute("aria-expanded", String(!hidden));
    };
    side("toggle-left", layout.left, "les indicateurs", "‹", "›");
    side("toggle-right", layout.right, "le fil en direct", "›", "‹");
    $("toggle-all").textContent = layout.all ? "Afficher les panneaux" : "Masquer les panneaux";
    const tt = $("toggle-timebar");
    tt.textContent = layout.timebar ? "Frise du temps ▴" : "▾";
    tt.title = layout.timebar ? "Afficher la frise du temps" : "Masquer la frise du temps";
    tt.setAttribute("aria-label", tt.title); tt.setAttribute("aria-expanded", String(!layout.timebar));
    const lt = $("toggle-legend");
    if (lt) {
      lt.textContent = layout.legend ? "Légende ▴" : "Légende ▾";
      lt.title = layout.legend ? "Afficher la légende" : "Masquer la légende";
      lt.setAttribute("aria-expanded", String(!layout.legend));
    }
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* état non mémorisé */ }
  }
  const flip = (k) => () => { layout[k] = !layout[k]; applyLayout(); };
  $("drawer-toggle").onclick = flip("drawer");
  $("toggle-left").onclick = flip("left");
  $("toggle-right").onclick = flip("right");
  $("toggle-all").onclick = flip("all");
  $("toggle-timebar").onclick = flip("timebar");
  // Hauteur réelle de la frise (elle varie avec la largeur et quand on la replie) : la légende se pose au-dessus.
  new ResizeObserver(() => document.body.style.setProperty("--tb-h", `${$("timebar").offsetHeight}px`)).observe($("timebar"));
  document.addEventListener("keydown", (e) => {
    if ((e.key === "h" || e.key === "H") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.target.closest("input, textarea, select")) flip("all")();
  });
  applyLayout();

  function wireCards() {
    const map_ = { "k-visible": "transits", "w-in": "wait", "k-fleet": "fleet", "k-silent": "silent", "radar-line": "radar" };
    for (const [id, key] of Object.entries(map_)) {
      const card = $(id).closest(".card");
      card.classList.add("clickable");
      card.title = "Cliquer pour le détail";
      card.addEventListener("click", (e) => { if (!e.target.closest(".bars .row")) kpiView(key); });
    }
    $("srcchip").onclick = sourcesView;
    $("ports").closest(".card").classList.add("clickable");
    $("ports").closest(".card").addEventListener("click", () => portsView(null));
    $("status").classList.add("clickable");
    $("status").onclick = () => kpiView("transits");
  }

  async function start() {
    wireCards();
    renderLayerToggles();
    renderLegend();
    renderFeedFilter();
    mapReady.then(setupLayers);
    setInterval(tickClock, 1000);
    let d;
    try { d = await fetchData(); }
    catch { d = await askPassword(); }
    await mapReady;
    await apply(d);
    setupTimeline();
    await refreshReplay(true);
    setInterval(poll, 30000);
  }
  start();
})();
