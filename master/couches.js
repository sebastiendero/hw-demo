/* Master — couches en direct des globes (séismes, catastrophes, phénomènes naturels, avions militaires, câbles,
 * météo spatiale), partagées par les modes Monde et Ormuz de Situation. Données : /api/layers/<id> (live_layers.py),
 * lues à la demande et gardées pour la page. Chaque point s'ouvre sur une fiche. Tout texte passe par textContent.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const cache = {};
  const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
  const nfi = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

  // [id, libellé du calque, couleur]
  const LIVE = [
    ["catastrophes", "Catastrophes (GDACS)", "#ff6a2b"],
    ["seismes", "Séismes M4,5+ (USGS)", "#f0a35e"],
    ["nature", "Feux, tempêtes, volcans (NASA)", "#4cc38a"],
    ["avions-militaires", "Avions militaires (adsb.lol)", "#5eead4"],
    ["cables", "Câbles sous-marins", "#93b4f0"],
  ];
  const NATURE_COLOR = { feu: "#ff6a2b", "tempête": "#93b4f0", volcan: "#e5484d", glace: "#cbd5e1" };

  async function load(id) {
    if (!cache[id]) cache[id] = U().api(`/api/layers/${id}`).catch(() => null);
    return cache[id];
  }

  // Points, tracés et marqueurs d'une couche pour globe3d (key = id de la couche)
  function draw(globe, id, data, on, bbox) {
    const inBox = (x) => !bbox || (x.lon >= bbox[0] && x.lon <= bbox[2] && x.lat >= bbox[1] && x.lat <= bbox[3]);
    const items = on && data ? (data.items || []).filter((x) => x.lon == null || inBox(x)) : [];
    if (id === "cables") {
      globe.setOutlines("live-cables", items.flatMap((c) => c.lines.map((l) => ({ geometry: { type: "LineString", coordinates: l } }))), "#93b4f0", 0.45);
      return;
    }
    const style = {
      seismes: (x) => ({ size: 5 + Math.max(0, x.mag - 4.5) * 5, color: x.alert === "red" ? "#e5484d" : "#f0a35e", alpha: 0.85 }),
      catastrophes: (x) => ({ size: x.level === "red" ? 16 : 11, color: x.level === "red" ? "#e5484d" : "#ff6a2b", alpha: 0.9 }),
      nature: (x) => ({ size: 7, color: NATURE_COLOR[x.category] || "#4cc38a", alpha: 0.85 }),
      "avions-militaires": () => ({ size: 6, color: "#5eead4", alpha: 0.95 }),
    }[id];
    globe.setPoints(`live-${id}`, items.map((x) => ({ lon: x.lon, lat: x.lat, data: { layer: id, ...x }, ...style(x) })), 1.0016, true);
  }

  // Fiche d'un point (élément DOM) ; null si la couche n'a pas de fiche
  function card(d, close) {
    const { el } = U();
    const box = el("div");
    const dl = el("dl", "g3-dl");
    const add = (k, v) => { if (v != null && v !== "") dl.append(el("dt", null, k), el("dd", null, String(v))); };
    const when = (t) => (t ? `${String(t).slice(0, 16).replace("T", " ")} UTC` : null);
    let kicker = "", title = "";
    if (d.layer === "seismes") {
      kicker = "SÉISME · USGS"; title = `M ${nf.format(d.mag)} · ${d.title}`;
      add("Heure", when(d.time)); add("Profondeur", d.depth_km != null ? `${nfi.format(d.depth_km)} km` : null);
      add("Alerte PAGER", d.alert); add("Tsunami", d.tsunami ? "message émis" : null);
    } else if (d.layer === "catastrophes") {
      kicker = `ALERTE ${d.level === "red" ? "ROUGE" : "ORANGE"} · GDACS`; title = d.title;
      add("Type", d.type); add("Pays", d.countries); add("Gravité", d.severity); add("Du", when(d.from)); add("Au", when(d.to));
    } else if (d.layer === "nature") {
      kicker = `${(d.category || "").toUpperCase()} · NASA EONET`; title = d.title;
      add("Dernière observation", when(d.time)); add("Ampleur", d.magnitude != null ? `${nfi.format(d.magnitude)} ${d.unit || ""}` : null);
    } else if (d.layer === "avions-militaires") {
      kicker = "AVION MILITAIRE · ADSB.LOL"; title = d.callsign || d.reg || d.hex;
      add("Type", d.type); add("Immatriculation", d.reg); add("Code", d.hex); add("Altitude", d.alt_ft != null ? `${nfi.format(d.alt_ft)} ft` : null);
      add("Vitesse", d.speed_kt != null ? `${nfi.format(d.speed_kt)} nœuds` : null); add("Cap", d.track != null ? `${nfi.format(d.track)}°` : null);
    } else return null;
    const x = el("button", "g3-close", "✕"); x.type = "button"; x.setAttribute("aria-label", "Fermer"); x.onclick = close;
    box.append(x, el("span", "sit-mono sit-acc", kicker), el("h2", null, title), dl);
    const url = d.url && /^https?:\/\//.test(d.url) ? d.url : null;
    if (url) { const a = el("a", "sit-src", "SOURCE ↗"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; box.append(a); }
    if (d.layer === "avions-militaires") box.append(el("p", "g3-note", "Position diffusée par le transpondeur (ADS-B) ; beaucoup d'avions militaires ne l'émettent pas."));
    return box;
  }

  // Indice Kp de la météo spatiale (dernier relevé), pour la barre du haut
  async function kp() {
    const d = await load("meteo-spatiale");
    const last = d && d.items && d.items[d.items.length - 1];
    return last ? last.kp : null;
  }

  window.MASTER_LIVE = { LIVE, load, draw, card, kp };
})();
