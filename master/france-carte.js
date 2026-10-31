/* Master — onglet « Carte » de la rubrique France politique (france.js) : régions, départements, circonscriptions,
   communes d'un département (arrondissements à Paris, Lyon, Marseille), colorés selon une couche (député par groupe ou
   par nuance 2024, municipales 2026, présidentielle 2022, européennes 2024, législatives 2024). Une couche électorale
   peut aussi être colorée par la marge du premier sur le second (échelle séquentielle à une teinte, 5 classes).
   d3-geo : projection conique conforme de Lambert pour la métropole, encarts pour l'outre-mer ; SVG pour les
   départements et les circonscriptions, canvas pour les communes. Couleurs : seules les 4 valeurs les plus
   fréquentes en France ont une couleur (palette validée, toutes paires) ; les autres sont « Autres », une valeur
   absente est « Sans donnée » ; un clic dans la légende met n'importe quelle valeur en évidence. Infobulle, fiche
   et tableau doublent toujours la couleur. Tout texte passe par textContent. */
(() => {
  "use strict";
  const LEVELS = [["regions", "Régions"], ["departements", "Départements"], ["circonscriptions", "Circonscriptions"], ["communes", "Communes"]];
  const MARGES = [[5, "moins de 5 points"], [10, "5 à 10 points"], [20, "10 à 20 points"], [30, "20 à 30 points"], [Infinity, "30 points ou plus"]];
  const INDIC_FMT = { population: (v) => U.nf0.format(v), niveau_vie_median: (v) => `${U.nf0.format(v)} €`,
    taux_pauvrete: (v) => `${U.nf1.format(v)} %`, chomage_rp: (v) => `${U.nf1.format(v)} %`, chomage_bit: (v) => `${U.nf1.format(v)} %` };
  const OUTRE_MER = { 971: "Guadeloupe", 972: "Martinique", 973: "Guyane", 974: "La Réunion", 975: "S.-P.-et-Miquelon", 976: "Mayotte" };
  const SLOTS = 4;  // au-delà, les couleurs ne restent pas distinctes deux à deux sur une carte (validateur, toutes paires)
  const PROVENANCE = "Contours : Etalab (Licence Ouverte) ; circonscriptions : J. Desboeufs, data.gouv.fr (compte personnel, "
    + "non certifié), dérivé des données du ministère de l'Intérieur et de l'INSEE.";
  const SANS_NUANCE = "Sans nuance : commune de 3 500 habitants ou moins, hors chef-lieu d'arrondissement (circulaire du 02/02/2026).";
  let U = null;

  // #france/carte/{niveau}/{couche}[/marge] ou #france/carte/communes/{dep}/{couche}[/marge]
  function readHash() {
    const p = location.hash.slice(1).split("/").slice(2).map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
    const niveau = LEVELS.some(([k]) => k === p[0]) ? p[0] : "departements";
    return niveau === "communes" ? { niveau, dep: p[1] || null, couche: p[2] || null, mode: p[3] === "marge" ? "marge" : "tete" }
      : { niveau, dep: null, couche: p[1] || null, mode: p[2] === "marge" ? "marge" : "tete" };
  }
  const hashFor = (s) => `#france/carte/${s.niveau}${s.niveau === "communes" ? `/${encodeURIComponent(s.dep || "")}` : ""}/${encodeURIComponent(s.couche)}${s.mode === "marge" ? "/marge" : ""}`;
  const margeClass = (m) => (m == null ? -1 : MARGES.findIndex(([max]) => m < max));
  const isOutreMer = (dep) => /^97/.test(dep);

  function palette() {
    return { slots: [1, 2, 3, 4].map((i) => U.cssVar(`--fr-c${i}`)), other: U.cssVar("--fr-other"), none: U.cssVar("--fr-none"),
      acc: U.cssVar("--acc"), seq: [1, 2, 3, 4, 5].map((i) => U.cssVar(`--fr-s${i}`)) };
  }

  // Marge : classe de l'écart du premier sur le second (une teinte, du clair au foncé) ; mise en évidence d'une classe.
  function margeColorer(highlight) {
    const pal = palette();
    return (x) => {
      const k = margeClass(x ? x.marge : null);
      if (highlight !== null) return k === highlight && k >= 0 ? pal.acc : pal.none;
      return k < 0 ? pal.none : pal.seq[k];
    };
  }

  function colorer(ordre, highlight) {
    const pal = palette();
    const slot = new Map(ordre.slice(0, SLOTS).map((v, i) => [v, pal.slots[i]]));
    return (v) => {
      if (highlight !== null) return v === highlight ? pal.acc : pal.none;
      if (v === null || v === undefined) return pal.none;
      return slot.get(v) || pal.other;
    };
  }

  function legendItems(values, ordre) {
    const counts = new Map();
    let none = 0;
    for (const x of Object.values(values)) {
      if (x.valeur === null || x.valeur === undefined) none++; else counts.set(x.valeur, (counts.get(x.valeur) || 0) + 1);
    }
    const rank = (v) => { const i = ordre.indexOf(v); return i < 0 ? 1e6 : i; };
    const items = [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]).map(([v, n]) => ({ v, n }));
    return { items, none };
  }

  function projections(features, width, height) {
    const metro = features.filter((f) => !isOutreMer(f.properties.dep));
    const om = [...new Set(features.filter((f) => isOutreMer(f.properties.dep)).map((f) => f.properties.dep))].sort();
    const insetH = om.length ? 96 : 0;
    const main = d3.geoConicConformal().parallels([44, 49]).rotate([-3, 0])
      .fitExtent([[8, 8], [width - 8, height - insetH - 8]], { type: "FeatureCollection", features: metro });
    const insets = om.map((dep, i) => {
      const w = width / om.length;
      const box = [[i * w + 6, height - insetH + 18], [(i + 1) * w - 6, height - 6]];
      const fc = { type: "FeatureCollection", features: features.filter((f) => f.properties.dep === dep) };
      return { dep, box, proj: d3.geoMercator().fitExtent(box, fc) };
    });
    return { projOf: (f) => (isOutreMer(f.properties.dep) ? (insets.find((x) => x.dep === f.properties.dep) || {}).proj : main), insets };
  }

  function tooltip(box) {
    const t = U.el("div", "fr-tip");
    t.hidden = true;
    box.append(t);
    return {
      show(ev, text) {
        const r = box.getBoundingClientRect();
        t.textContent = text; t.hidden = false;
        t.style.left = `${Math.min(ev.clientX - r.left + 12, r.width - 240)}px`; t.style.top = `${ev.clientY - r.top + 12}px`;
      },
      hide() { t.hidden = true; },
    };
  }

  function label(f, x) {
    const v = x ? (x.valeur ?? (x.sans_nuance ? "sans nuance" : x.motif ? "nuance 2024 sans objet" : "sans donnée")) : "sans donnée";
    const lib = x && x.libelle && x.libelle !== x.valeur ? ` (${x.libelle})` : "";
    const part = x && x.part != null ? ` · ${U.nf1.format(x.part)} %` : "";
    const marge = x && x.marge != null ? ` · marge ${U.nf1.format(x.marge)} pts` : "";
    const whole = x && x.commune_entiere ? " · valeur de la ville entière" : "";
    return `${f.properties.nom} (${f.properties.code}) — ${v}${lib}${part}${marge}${whole}`;
  }

  const SVG = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, text) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function drawSvg(box, features, values, color, onClick) {
    const width = box.clientWidth || 900, height = Math.min(760, Math.max(520, width * 0.92));
    const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "fr-svg", role: "img", "aria-label": "Carte de France" });
    box.append(svg);
    const { projOf, insets } = projections(features, width, height);
    for (const i of insets) {
      svg.append(svgEl("rect", { class: "fr-inset", x: i.box[0][0] - 4, y: i.box[0][1] - 14,
        width: i.box[1][0] - i.box[0][0] + 8, height: i.box[1][1] - i.box[0][1] + 18 }));
      svg.append(svgEl("text", { class: "fr-inset-l", x: i.box[0][0], y: i.box[0][1] - 3 }, OUTRE_MER[i.dep] || i.dep));
    }
    const tip = tooltip(box);
    for (const f of features) {
      const proj = projOf(f);
      if (!proj) continue;
      const x = values[f.properties.code];
      const p = svgEl("path", { d: d3.geoPath(proj)(f) || "", fill: color(x), class: "fr-shape",
        tabindex: 0, "aria-label": label(f, x), "data-code": f.properties.code });
      p.addEventListener("mousemove", (ev) => tip.show(ev, label(f, x)));
      p.addEventListener("mouseleave", () => tip.hide());
      p.addEventListener("click", () => onClick(f));
      p.addEventListener("keydown", (ev) => { if (ev.key === "Enter") onClick(f); });
      svg.append(p);
    }
  }

  function drawCanvas(box, features, values, color, onClick) {
    const width = box.clientWidth || 900, height = Math.min(760, Math.max(520, width * 0.8));
    const dpr = window.devicePixelRatio || 1;
    const c = U.el("canvas", "fr-canvas");
    c.width = width * dpr; c.height = height * dpr; c.style.width = `${width}px`; c.style.height = `${height}px`;
    box.append(c);
    const fc = { type: "FeatureCollection", features };
    const proj = (isOutreMer(features[0].properties.dep) ? d3.geoMercator() : d3.geoConicConformal().parallels([44, 49]).rotate([-3, 0]))
      .fitExtent([[8, 8], [width - 8, height - 8]], fc);
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    const path = d3.geoPath(proj, ctx);
    const line = U.cssVar("--card");
    for (const f of features) {
      const x = values[f.properties.code];
      ctx.beginPath(); path(f);
      ctx.fillStyle = color(x); ctx.fill();
      ctx.lineWidth = 0.6; ctx.strokeStyle = line; ctx.stroke();
    }
    const at = (ev) => {
      const r = c.getBoundingClientRect();
      const p = proj.invert([ev.clientX - r.left, ev.clientY - r.top]);
      return p && features.find((f) => d3.geoContains(f, p));
    };
    const tip = tooltip(box);
    c.addEventListener("mousemove", (ev) => { const f = at(ev); if (f) tip.show(ev, label(f, values[f.properties.code])); else tip.hide(); });
    c.addEventListener("mouseleave", () => tip.hide());
    c.addEventListener("click", (ev) => { const f = at(ev); if (f) onClick(f); });
  }

  function margeLegend(host, values, highlight, onPick) {
    const counts = MARGES.map(() => 0);
    let none = 0;
    for (const x of Object.values(values)) { const k = margeClass(x.marge); if (k < 0) none++; else counts[k]++; }
    const color = margeColorer(null);
    const box = U.el("div", "fr-legend-map");
    box.append(U.el("span", "muted fr-leg-title", "Marge du premier sur le second (points de suffrages exprimés) :"));
    MARGES.forEach(([, lib], k) => {
      const b = U.el("button", "fr-leg");
      b.type = "button";
      b.setAttribute("aria-pressed", String(highlight === k));
      const sw = U.el("i"); sw.style.background = color({ marge: k === 0 ? 0 : MARGES[k - 1][0] });
      b.append(sw, U.el("span", null, `${lib} · ${U.nf0.format(counts[k])}`));
      b.onclick = () => onPick(highlight === k ? null : k);
      box.append(b);
    });
    if (none) { const sw = U.el("i"); sw.style.background = color(null); const s = U.el("span", "fr-leg"); s.append(sw, U.el("span", null, `Sans donnée · ${U.nf0.format(none)}`)); box.append(s); }
    host.append(box);
  }

  function legend(host, values, ordre, highlight, onPick, libelles) {
    const { items, none } = legendItems(values, ordre);
    const color = colorer(ordre, null);
    const box = U.el("div", "fr-legend-map");
    const entry = (text, fill, v) => {
      const b = U.el("button", "fr-leg");
      b.type = "button";
      b.setAttribute("aria-pressed", String(highlight !== null && highlight === v));
      const sw = U.el("i"); sw.style.background = fill;
      b.append(sw, U.el("span", null, text));
      b.onclick = () => onPick(highlight === v ? null : v);
      return b;
    };
    for (const { v, n } of items) box.append(entry(`${v}${libelles && libelles[v] ? ` (${libelles[v]})` : ""} · ${U.nf0.format(n)}`, color(v), v));
    if (none) box.append(entry(`Sans donnée · ${U.nf0.format(none)}`, color(null), undefined));
    if (items.length > SLOTS) box.append(U.el("p", "muted fr-leg-note", `Au-delà des ${SLOTS} premières valeurs en France, couleur commune « Autres » ; cliquez une valeur pour la voir seule.`));
    host.append(box);
  }

  function resultBlock(eid, r, libelle) {
    const d = U.el("div", "fr-res");
    d.append(U.el("h4", null, libelle));
    if (!r) { d.append(U.el("p", "muted", "Sans donnée.")); return d; }
    const head = r.en_tete ? `${r.en_tete}${r.libelle && r.libelle !== r.en_tete ? ` (${r.nuance}, ${r.libelle})` : r.libelle ? ` (${r.nuance})` : ""}${r.part != null ? ` · ${U.nf1.format(r.part)} %` : ""}` : "—";
    d.append(U.el("p", null, head));
    if (r.marge != null && r.en_tete) d.append(U.el("p", "muted", `Marge sur le second : ${U.nf1.format(r.marge)} points`));
    if (r.elu) d.append(U.el("p", null, `Élu : ${r.elu.nom}${r.elu.nuance ? ` (${r.elu.nuance})` : ""}`));
    if (eid === "muni2026") {
      d.append(U.el("p", "muted", r.sans_nuance ? SANS_NUANCE : `Nuance ${r.nuance} · bloc ${r.bloc || "non classé"} · ${r.sieges} sièges`));
    }
    if (r.egalite) d.append(U.el("p", "fr-warn", "Égalité en tête : départagée par le numéro de panneau."));
    const ol = U.el("ol", "fr-top5");
    for (const x of r.detail || []) ol.append(U.el("li", null, `${x.nom}${x.nuance && x.nuance !== x.nom ? ` (${x.nuance})` : ""} — ${U.nf0.format(x.voix)} voix${x.part != null ? ` (${U.nf1.format(x.part)} %)` : ""}`));
    d.append(ol);
    return d;
  }

  async function fiche(panel, niveau, code, couches) {
    panel.replaceChildren(U.el("p", "muted", "Chargement…"));
    let t;
    try { t = await U.api(`/api/france/territoire/${niveau}/${encodeURIComponent(code)}`); } catch (e) {
      panel.replaceChildren(U.callout("info", "Fiche indisponible", niveau === "communes" ? "Les communes ne sont consultables que dans le portail local." : e.message));
      return;
    }
    const out = [U.el("h3", null, t.nom), U.el("p", "muted", t.code)];
    if (t.commune) out.push(U.el("p", "muted", `Arrondissement de ${t.commune.nom} (${t.commune.code})`));
    if (t.region && t.region.nom) out.push(U.el("p", "muted", `Région : ${t.region.nom}`));
    const e = t.elus || {};
    if (e.depute) {
      out.push(U.el("p", null, e.depute.vacant ? "Député : siège vacant" : `Député : ${e.depute.nom} (${e.depute.groupe || "sans groupe"}), depuis le ${U.dmy(e.depute.depuis)}`));
      if (e.depute.nuance_2024) out.push(U.el("p", "muted", `Nuance de candidature 2024 (ministère de l'Intérieur) : ${e.depute.nuance_2024.nuance} (${e.depute.nuance_2024.libelle || "libellé inconnu"})`));
      else if (e.depute.motif_nuance) out.push(U.el("p", "muted", e.depute.motif_nuance));
    }
    if (e.maire) out.push(U.el("p", null, e.maire.absent ? "Maire : absent du Répertoire national des élus"
      : `${e.maire.de_la_commune ? `Maire de ${t.commune ? t.commune.nom : "la commune"}` : "Maire"} : ${e.maire.nom}${e.maire.depuis ? `, depuis le ${U.dmy(e.maire.depuis)}` : ""}`));
    if (e.president) {
      const quoi = niveau === "regions" ? "Président du conseil régional" : "Président du conseil départemental";
      out.push(U.el("p", null, e.president.absent ? `${quoi} : absent du Répertoire national des élus (collectivité à statut particulier ou fonction non renseignée)`
        : `${quoi} : ${e.president.nom}${e.president.depuis ? `, depuis le ${U.dmy(e.president.depuis)}` : ""}${e.president.collectivite && /Alsace/.test(e.president.collectivite) ? ` (${e.president.collectivite})` : ""}`));
    }
    if (e.senateurs) {
      out.push(U.el("h4", null, `Sénateurs (${e.senateurs.length})`));
      if (!e.senateurs.length) out.push(U.el("p", "muted", "Aucun sénateur dans la liste du Sénat pour ce département."));
      const ul = U.el("ul", "fr-src");
      for (const x of e.senateurs) {
        const li = U.el("li");
        li.append(x.lien && x.lien.startsWith("https://") ? Object.assign(U.el("a", "fr-link", x.nom), { href: x.lien, target: "_blank", rel: "noopener noreferrer" }) : U.el("span", null, x.nom),
          document.createTextNode(` — ${x.groupe || "sans groupe"}`));
        ul.append(li);
      }
      out.push(ul);
    }
    if ((t.indicateurs || []).length) {
      out.push(U.el("h4", null, "Indicateurs locaux (INSEE)"));
      const dl = U.el("dl", "fr-indic");
      for (const i of t.indicateurs) {
        const v = i.valeur != null ? INDIC_FMT[i.cle](i.valeur) : i.secret ? "secret statistique" : "sans donnée";
        const when = i.periode ? ` · ${i.periode}` : i.annee ? ` · ${i.annee}` : "";
        const scope = i.portee === "département" && t.niveau === "communes" ? " · taux du département" : "";
        const dt = U.el("dt", null, i.libelle);
        const dd = U.el("dd", null, `${v}${when}${scope}`);
        if (i.source && i.source.titre) dd.title = i.source.titre;
        dl.append(dt, dd);
      }
      out.push(dl);
    }
    const lib = Object.fromEntries(couches.map((c) => [c.id === "maire2026" ? "muni2026" : c.id,
      c.statut === "provisoire" ? `${c.libelle} (résultats provisoires${c.partiel ? ", partiels" : ""})` : c.libelle]));
    for (const [eid, r] of Object.entries(t.resultats || {})) out.push(resultBlock(eid, r, lib[eid] || eid));
    if (t.articles_portee !== undefined) {
      out.push(U.el("h4", null, "Articles récents"));
      out.push(U.el("p", "muted", `${t.articles_portee ? `${t.articles_portee[0].toUpperCase()}${t.articles_portee.slice(1)}` : "Aucun lieu à chercher"} (7 derniers jours, étiquetage par règles sur les noms de lieux).`));
      if (!(t.articles || []).length) out.push(U.el("p", "muted", "Aucun article ne cite ce lieu."));
      const ul = U.el("ul", "fr-src");
      for (const a of t.articles || []) {
        const li = U.el("li");
        const first = (a.articles || [])[0];
        li.append(first && first.url && first.url.startsWith("https://") ? Object.assign(U.el("a", "fr-link", a.titre), { href: first.url, target: "_blank", rel: "noopener noreferrer" }) : U.el("span", null, a.titre),
          document.createTextNode(` — ${(a.medias || []).join(", ")}, ${U.dmy(a.time)}`));
        ul.append(li);
      }
      out.push(ul);
    }
    const src = U.el("ul", "fr-src");
    for (const s of t.sources || []) {
      const li = U.el("li");
      if (typeof s.lien === "string" && s.lien.startsWith("https://")) { const a = U.el("a", "fr-link", s.titre); a.href = s.lien; a.target = "_blank"; a.rel = "noopener noreferrer"; li.append(a); } else li.append(U.el("span", null, s.titre));
      src.append(li);
    }
    out.push(U.el("h4", null, "Sources"), src);
    panel.replaceChildren(...out);
  }

  function table(features, values) {
    const rows = features.map((f) => ({ code: f.properties.code, nom: f.properties.nom, ...(values[f.properties.code] || {}) }))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    return U.table(rows, [["nom", "Territoire"], ["code", "Code"], ["valeur", "Valeur", (v, r) => v ?? (r.sans_nuance ? "sans nuance" : "sans donnée")],
      ["part", "Part", (v) => (v == null ? "—" : `${U.nf1.format(v)} %`)], ["marge", "Marge", (v) => (v == null ? "—" : `${U.nf1.format(v)} pts`)]]);
  }

  async function carte(root) {
    U = window.MASTER_UI;
    const s = readHash();
    let couches;
    try { couches = (await U.api("/api/france/couches")).couches; } catch (e) { couches = []; }
    const avail = couches.filter((c) => c.disponible && c.niveaux.includes(s.niveau));
    if (s.niveau === "communes" && !s.dep) {
      root.append(U.seg(LEVELS, s.niveau, (v) => { location.hash = hashFor({ niveau: v, couche: s.couche || "pres2022_t1" }); }, "Niveau"),
        U.callout("info", "Choisissez un département", "Cliquez un département sur la carte des départements pour voir ses communes."));
      return;
    }
    if (!avail.length) {
      root.append(U.callout("info", "Carte en préparation", "Les contours sont téléchargés en arrière-plan ; revenez dans quelques minutes."));
      return;
    }
    const layer = avail.find((c) => c.id === s.couche) || avail[0];
    const geoPath = s.niveau === "communes" ? `/api/france/geo/communes/${encodeURIComponent(s.dep)}` : `/api/france/geo/${s.niveau}`;
    const valPath = s.niveau === "communes" ? `/api/france/couche/${layer.id}/communes/${encodeURIComponent(s.dep)}` : `/api/france/couche/${layer.id}/${s.niveau}`;
    const controls = U.el("div", "fr-controls");
    controls.append(U.seg(LEVELS, s.niveau, (v) => {
      const next = couches.find((c) => c.disponible && c.niveaux.includes(v) && c.id === layer.id) || couches.find((c) => c.disponible && c.niveaux.includes(v));
      location.hash = hashFor({ niveau: v, dep: s.dep, couche: next ? next.id : layer.id, mode: s.mode });
    }, "Niveau"));
    const sel = U.el("select", "fr-select");
    sel.setAttribute("aria-label", "Couche");
    for (const c of avail) sel.append(new Option(c.libelle, c.id));
    sel.value = layer.id;
    sel.onchange = () => { location.hash = hashFor({ ...s, couche: sel.value }); };
    controls.append(sel);
    const mode = layer.marge ? s.mode : "tete";
    if (layer.marge) controls.append(U.seg([["tete", "En tête"], ["marge", "Marge"]], mode, (v) => { location.hash = hashFor({ ...s, couche: layer.id, mode: v }); }, "Couleur"));
    root.append(controls);
    if (layer.note) root.append(U.el("p", "muted", layer.note));
    if (layer.statut === "provisoire") {
      root.append(U.callout("attention", layer.partiel ? "Résultats provisoires et partiels" : "Résultats provisoires",
        `${layer.partiel ? `Remontée en cours : ${U.nf0.format(layer.communes || 0)} communes lues. ` : ""}Chiffres de la soirée électorale publiés par le ministère de l'Intérieur, avant les résultats définitifs ; la carte se met à jour d'elle-même.`));
    }
    let fc, values;
    try { [fc, values] = await Promise.all([U.api(geoPath), U.api(valPath).then((x) => x.valeurs)]); } catch (e) {
      root.append(U.callout("info", s.niveau === "communes" ? "Communes indisponibles" : "Carte en préparation", s.niveau === "communes"
        ? "Les communes ne sont consultables que dans le portail local (contours trop lourds pour la version en ligne)."
        : "Les contours sont téléchargés en arrière-plan ; revenez dans quelques minutes."));
      return;
    }
    const tableBtn = U.el("button", "fr-table-btn", "Tableau");
    tableBtn.type = "button";
    controls.append(tableBtn);
    // Paris, Lyon, Marseille : les arrondissements sont dessinés à la place de la commune (gardée pour sa fiche).
    const drawnFeatures = fc.features.filter((f) => !f.properties.plm);
    const nArr = fc.features.filter((f) => f.properties.commune).length;
    const nCom = fc.features.length - nArr;
    if (s.niveau === "communes") root.append(U.el("p", "muted", `Communes du département ${s.dep} · ${nCom} commune${nCom > 1 ? "s" : ""}${nArr ? ` · ${nArr} arrondissements municipaux dessinés à la place de leur ville` : ""}`));
    const plmCodes = new Set(fc.features.filter((f) => f.properties.plm).map((f) => f.properties.code));
    const legendValues = Object.fromEntries(Object.entries(values).filter(([k]) => !plmCodes.has(k)));
    const grid = U.el("div", "fr-map-grid");
    const mapBox = U.el("div", "fr-map");
    const side = U.el("aside", "card fr-fiche");
    side.append(U.el("p", "muted", s.niveau === "departements" && !window.MASTER_STATIC ? "Cliquez un département pour voir ses communes." : "Cliquez un territoire pour ouvrir sa fiche."));
    grid.append(mapBox, side);
    const legendBox = U.el("div");
    const tableBox = U.el("div", "fr-table");
    tableBox.hidden = true;
    const drawn = new Set(fc.features.map((f) => f.properties.code));
    const offMap = Object.entries(values).filter(([code]) => !drawn.has(code)).map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const offBox = U.el("div");
    if (offMap.length) {
      const p = U.panel(`Sans contour sur la carte (${offMap.length})`, { sub: "Français de l'étranger et collectivités d'outre-mer : leurs circonscriptions n'ont pas de contour dans la source." });
      const deputy = layer.id === "depute" || layer.id === "depute_nuance";
      p.body.append(U.table(offMap, [["code", "Circonscription"], deputy ? ["nom", "Député"] : ["en_tete", "En tête", (v, r) => v ?? r.valeur ?? "—"],
        ["valeur", deputy ? (layer.id === "depute" ? "Groupe" : "Nuance 2024") : "Valeur", (v) => v ?? "—"]]));
      offBox.append(p.el);
    }
    root.append(grid, legendBox, offBox, tableBox, U.el("p", "muted fr-prov", PROVENANCE),
      U.el("p", "muted fr-prov", `Source de la couche : ${layer.source.titre}${layer.date ? ` · préparée le ${U.dmy(layer.date)}` : ""}.`));
    tableBtn.onclick = () => { tableBox.hidden = !tableBox.hidden; if (!tableBox.hidden && !tableBox.childElementCount) tableBox.append(table(drawnFeatures, values)); };
    const online = !!window.MASTER_STATIC;  // version en ligne : pas de communes dans l'instantané
    const onClick = (f) => {
      if (s.niveau === "departements" && !online) {
        const next = couches.find((c) => c.disponible && c.niveaux.includes("communes") && c.id === layer.id)
          || couches.find((c) => c.disponible && c.niveaux.includes("communes"));
        location.hash = hashFor({ niveau: "communes", dep: f.properties.code, couche: next ? next.id : layer.id });
      } else fiche(side, s.niveau, f.properties.code, couches);
    };
    let highlight = null;
    const draw = () => {
      mapBox.replaceChildren(); legendBox.replaceChildren();
      let color;
      if (mode === "marge") color = margeColorer(highlight);
      else { const c = colorer(layer.ordre || [], highlight); color = (x) => c(x ? x.valeur : null); }
      (s.niveau === "communes" ? drawCanvas : drawSvg)(mapBox, drawnFeatures, values, color, onClick);
      if (mode === "marge") margeLegend(legendBox, legendValues, highlight, (k) => { highlight = k; draw(); });
      else legend(legendBox, legendValues, layer.ordre || [], highlight, (v) => { highlight = v === undefined ? null : v; draw(); }, layer.libelles);
      if (Object.values(values).some((x) => x.commune_entiere)) legendBox.append(U.el("p", "muted fr-leg-note", "Arrondissements : pas de résultat par arrondissement pour cette couche, la couleur est celle de la ville entière."));
    };
    requestAnimationFrame(draw);  // la carte a besoin de sa largeur réelle
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { carte });
})();
