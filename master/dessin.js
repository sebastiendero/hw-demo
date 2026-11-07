/* Master — outils de dessin des globes (le « Drawing & Markup », l'« Area Intelligence » de SitDeck et le « Save an
 * area » d'OSIRIS) : mesurer une distance, tracer une zone puis obtenir ce qu'elle contient, un rapport de Maestro et un
 * export GeoJSON, et poser l'image satellite du jour (NASA GIBS) autour d'un point. Zones gardées dans ce navigateur.
 * Chaque vue branche le module : MASTER_DRAW.attach({ el, globe, stage, points }) ; points() rend les éléments datés
 * et situés de la vue ([{lon, lat, kind, title}]). Le clic d'un lieu passe d'abord par handle([lon, lat]).
 */
(() => {
  "use strict";
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  function km(a, b) {  // distance de grand cercle
    const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function areaKm2(poly) {  // aire sphérique approchée (formule de l'excès, assez juste pour une zone de quelques centaines de km)
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const [l1, p1] = poly[i], [l2, p2] = poly[(i + 1) % poly.length];
      s += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
    }
    return Math.abs((s * R * R) / 2);
  }
  function inside(pt, poly) {  // point dans le polygone (lon, lat, sans passage par l'antiméridien)
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const loadZones = () => { try { return JSON.parse(localStorage.getItem("master-zones") || "[]"); } catch { return []; } };
  const saveZones = (z) => { try { localStorage.setItem("master-zones", JSON.stringify(z.slice(-30))); } catch { /* */ } };

  function attach({ el, globe, stage, points }) {
    let mode = null, pts = [];
    const bar = el("div", "drw-bar");
    const panel = el("div", "g3-card drw-panel"); panel.hidden = true;
    stage.append(bar, panel);
    const tool = (txt, title, m) => {
      const b = el("button", "drw-btn", txt); b.type = "button"; b.title = title; b.setAttribute("aria-pressed", "false");
      b.onclick = () => setMode(mode === m ? null : m);
      b.dataset.mode = m; bar.append(b);
      return b;
    };
    tool("📏", "Mesurer une distance (cliquer deux points)", "measure");
    tool("⬠", "Tracer une zone (cliquer les sommets, puis Terminer)", "area");
    tool("🛰", "Image satellite du jour (cliquer un point)", "image");
    const zbtn = el("button", "drw-btn", "★"); zbtn.type = "button"; zbtn.title = "Zones enregistrées"; zbtn.onclick = () => listZones(); bar.append(zbtn);
    const hint = el("span", "drw-hint"); bar.append(hint);

    function setMode(m) {
      mode = m; pts = [];
      for (const b of bar.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", String(b.dataset.mode === m));
      globe.setDrawMode(!!m);
      hint.textContent = m === "measure" ? "cliquer le départ, puis l'arrivée" : m === "area" ? "cliquer les sommets de la zone" : m === "image" ? "cliquer un point" : "";
      if (m !== "image") redraw();
    }
    function redraw() {
      const line = mode === "area" && pts.length > 2 ? [...pts, pts[0]] : pts;
      globe.setOutlines("drw", line.length > 1 ? [{ geometry: { type: "LineString", coordinates: line } }] : [], "#e9d24a", 1);
      globe.setPoints("drw-pts", pts.map((p) => ({ lon: p[0], lat: p[1], size: 8, color: "#e9d24a", alpha: 1 })), 1.0018, true);
    }
    function show(nodes) {
      panel.replaceChildren();
      const x = el("button", "g3-close", "✕"); x.type = "button"; x.setAttribute("aria-label", "Fermer");
      x.onclick = () => { panel.hidden = true; setMode(null); globe.setOutlines("drw", [], "#e9d24a", 1); globe.setPoints("drw-pts", []); };
      panel.append(x, ...nodes); panel.hidden = false;
    }

    function handle(lonlat) {
      if (!mode) return false;
      if (mode === "image") { image(lonlat); setMode(null); return true; }
      pts.push(lonlat); redraw();
      if (mode === "measure" && pts.length === 2) {
        const d = km(pts[0], pts[1]);
        show([el("span", "sit-mono sit-acc", "DISTANCE"), el("h2", null, `${nf.format(d)} km`),
          el("p", "g3-note", `${nf.format(d / 1.852)} milles nautiques · à 12 nœuds, ${nf.format(d / 1.852 / 12)} h de mer · grand cercle`)]);
        mode = null; globe.setDrawMode(false); for (const b of bar.querySelectorAll("[data-mode]")) b.setAttribute("aria-pressed", "false");
      }
      if (mode === "area" && pts.length >= 3) {
        const done = el("button", "drw-done", "Terminer la zone"); done.type = "button";
        done.onclick = () => finishArea(pts.slice());
        show([el("span", "sit-mono sit-acc", `ZONE · ${pts.length} SOMMETS`), el("p", "g3-note", "Ajouter des sommets, ou terminer."), done]);
      }
      return true;
    }

    function finishArea(poly, name) {
      setMode(null);
      pts = poly; mode = "area"; redraw(); mode = null; globe.setDrawMode(false);
      const items = (points() || []).filter((p) => p.lon != null && inside([p.lon, p.lat], poly));
      const by = {};
      for (const it of items) by[it.kind] = (by[it.kind] || 0) + 1;
      const lons = poly.map((p) => p[0]), lats = poly.map((p) => p[1]);
      const box = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((v) => Math.round(v * 100) / 100);
      const nodes = [el("span", "sit-mono sit-acc", "ZONE"), el("h2", null, name || `${nf.format(areaKm2(poly))} km²`)];
      const dl = el("dl", "g3-dl");
      for (const [k, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) dl.append(el("dt", null, k), el("dd", null, nf.format(n)));
      if (!items.length) dl.append(el("dt", null, "Éléments"), el("dd", null, "aucun dans cette zone"));
      nodes.push(dl);
      for (const it of items.slice(0, 6)) nodes.push(el("p", "g3-head", `${it.kind} · ${it.title}`));
      const acts = el("div", "drw-acts");
      const ask = el("button", "drw-done ia", "✦ Rapport de zone (Maestro)"); ask.type = "button";
      ask.onclick = () => {
        const q = `Fais-moi un rapport sur cette zone (bornes : ouest ${box[0]}, sud ${box[1]}, est ${box[2]}, nord ${box[3]}) : ce qui s'y passe, `
          + `les navires, avions, séismes, catastrophes et événements qu'elle contient, et ce qu'il faut surveiller. Dans la zone : ${Object.entries(by).map(([k, n]) => `${n} ${k}`).join(", ") || "rien de répertorié"}.`
          + (items.length ? ` Exemples : ${items.slice(0, 8).map((x) => x.title).join(" ; ")}.` : "");
        try { localStorage.setItem("master-maestro-ask", JSON.stringify({ q, at: Date.now() })); } catch { /* */ }
        location.hash = "#maestro";
      };
      const exp = el("button", "drw-done", "Exporter GeoJSON"); exp.type = "button";
      exp.onclick = () => {
        const gj = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: name || "zone", source: "Master" }, geometry: { type: "Polygon", coordinates: [[...poly, poly[0]]] } },
          ...items.map((it) => ({ type: "Feature", properties: { kind: it.kind, title: it.title }, geometry: { type: "Point", coordinates: [it.lon, it.lat] } }))] };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(gj, null, 1)], { type: "application/geo+json" }));
        a.download = `zone-${new Date().toISOString().slice(0, 10)}.geojson`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      const keep = el("button", "drw-done", "★ Enregistrer"); keep.type = "button";
      keep.onclick = () => {
        const z = loadZones(); z.push({ name: `Zone du ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, poly }); saveZones(z);
        keep.textContent = "Enregistrée"; keep.disabled = true;
      };
      const alert = el("button", "drw-done", "🔔 M'alerter ici"); alert.type = "button";
      alert.onclick = async () => {
        if (window.MASTER_STATIC) { alert.textContent = "Alertes sur le Mac seulement"; return; }
        try {
          const r = await fetch("/api/alerts/rules", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name ? `Zone : ${name}` : `Zone (${nf.format(areaKm2(poly))} km²)`, type: "zone", poly: poly.map((p) => p.map((v) => Math.round(v * 1000) / 1000)), channels: ["macos", "telegram"], enabled: true }) });
          alert.textContent = r.ok ? "Alerte créée (voir Alertes)" : `Refusé (${r.status})`; alert.disabled = r.ok;
        } catch (e) { alert.textContent = `Échec : ${e.message}`; }
      };
      acts.append(ask, exp, keep, alert);
      nodes.push(acts, el("p", "g3-note", "Les éléments comptés sont ceux affichés par cette page (calques allumés)."));
      show(nodes);
    }
    function listZones() {
      const z = loadZones();
      const nodes = [el("span", "sit-mono sit-acc", "ZONES ENREGISTRÉES"), el("h2", null, `${z.length} zone${z.length > 1 ? "s" : ""}`)];
      if (!z.length) nodes.push(el("p", "g3-note", "Tracer une zone (⬠), puis « Enregistrer »."));
      z.forEach((zone, i) => {
        const r = el("div", "sit-row");
        const open = el("button", "drw-done", zone.name); open.type = "button";
        open.onclick = () => { const c = zone.poly.reduce((a, p) => [a[0] + p[0] / zone.poly.length, a[1] + p[1] / zone.poly.length], [0, 0]); globe.flyTo(c[0], c[1], 6, 1600); finishArea(zone.poly, zone.name); };
        const del = el("button", "g3-close drw-del", "✕"); del.type = "button"; del.setAttribute("aria-label", `Supprimer ${zone.name}`);
        del.onclick = () => { const zz = loadZones(); zz.splice(i, 1); saveZones(zz); listZones(); };
        r.append(open, del); nodes.push(r);
      });
      show(nodes);
    }
    async function image(lonlat) {
      const [lon, lat] = lonlat.map((v) => Math.round(v * 100) / 100);
      if (window.MASTER_STATIC) { show([el("span", "sit-mono sit-acc", "IMAGE SATELLITE"), el("p", "g3-note", "Disponible sur le portail du Mac seulement (le portail relaie l'image de la NASA).")]); return; }
      const dateIn = el("input"); dateIn.type = "date"; dateIn.max = new Date().toISOString().slice(0, 10);
      dateIn.value = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const sensor = el("select"); for (const [v, l] of [["modis", "MODIS Terra (250 m)"], ["viirs", "VIIRS (375 m)"]]) { const o = el("option", null, l); o.value = v; sensor.append(o); }
      const go = el("button", "drw-done", "Afficher"); go.type = "button";
      const status = el("p", "g3-note", "");
      const load = async () => {
        status.textContent = "Lecture de l'image NASA…";
        const url = `/api/imagery?lon=${lon}&lat=${lat}&date=${dateIn.value}&sensor=${sensor.value}&half=1`;
        try {
          const r = await fetch(url, { credentials: "same-origin" });
          if (!r.ok) throw new Error(`${r.status}`);
          const box = (r.headers.get("X-Bbox") || "").split(",").map(Number);
          const blobUrl = URL.createObjectURL(await r.blob());
          globe.setOverlays([{ bbox: box, url: blobUrl, opacity: 0.95 }]);
          globe.flyTo(lon, lat, 20, 1600);
          status.textContent = `Image du ${dateIn.value} posée sur le globe (NASA EOSDIS GIBS). Les nuages et les bandes noires sont normaux.`;
        } catch (e) { status.textContent = `Image indisponible (${e.message}) : essayer la veille.`; }
      };
      go.onclick = load;
      const clear = el("button", "drw-done", "Retirer l'image"); clear.type = "button"; clear.onclick = () => { globe.setOverlays([]); status.textContent = ""; };
      show([el("span", "sit-mono sit-acc", "IMAGE SATELLITE DU JOUR"), el("h2", null, `${lat}°, ${lon}°`), dateIn, sensor, el("div", "drw-acts"), status]);
      panel.querySelector(".drw-acts").append(go, clear);
      load();
    }
    return { handle };
  }

  window.MASTER_DRAW = { attach, km, inside };
})();
