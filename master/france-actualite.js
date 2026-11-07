/* Master — onglet « Actualité » de la rubrique France politique (france.js) : sujets de la presse politique nationale et
   régionale, des institutions (communiqués : « déclaration ») et de GDELT (source secondaire, jamais une confirmation),
   regroupés (plusieurs médias indépendants = un sujet), filtres par candidat, parti, thème, lieu, institution et mesure
   (étiquetage par règles, sans IA), part des sujets qui citent chaque candidat, actionnariat des médias (relevé sur leurs
   mentions légales). Aucun média n'est classé politiquement.
   Titres et extraits restent ceux des flux, avec le lien vers l'article d'origine ; tout passe par textContent. */
(() => {
  "use strict";
  const THEME_LABEL = { economie: "Économie", securite: "Sécurité", immigration: "Immigration", ecologie: "Écologie",
    institutions: "Institutions", social: "Social", international: "International" };
  const TOP = 12;
  let U = null;

  function readHash() {
    const p = location.hash.slice(1).split("/").slice(2).map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
    const at = (i) => (p[i] && p[i] !== "tous" ? p[i] : null);
    return { candidat: at(0), theme: at(1), parti: at(2), lieu: at(3), institution: at(4), mesure: at(5) };
  }
  const hashFor = (s) => "#france/actualite/" + [s.candidat, s.theme, s.parti, s.lieu, s.institution, s.mesure]
    .map((x) => encodeURIComponent(x || "tous")).join("/");

  function link(text, href, cls) {
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", cls, text);
    const a = U.el("a", cls, text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }

  function coverage(d, names) {
    const p = U.panel("Couverture des candidats", { sub: `Part des ${U.nf0.format(d.total_sujets)} sujets des ${d.jours} derniers jours qui citent chaque candidat (un sujet repris par plusieurs médias compte une fois).` });
    const rows = Object.entries(d.couverture).slice(0, TOP);
    if (!rows.length) { p.body.append(U.el("p", "muted", "Aucun candidat cité sur la période.")); return p.el; }
    const max = Math.max(...rows.map(([, n]) => n));
    const box = U.el("div", "fr-bars");
    for (const [id, n] of rows) {
      const share = d.total_sujets ? (100 * n) / d.total_sujets : 0;
      const row = U.el("div", "fr-bar");
      const bar = U.el("i");
      bar.style.width = `${(100 * n) / max}%`;
      row.title = `${names[id] || id} : ${n} sujets sur ${d.total_sujets}`;
      row.append(U.el("span", "fr-bar-l", names[id] || id), U.el("span", "fr-bar-t"), U.el("span", "fr-bar-v", `${U.nf1.format(share)} % · ${n}`));
      row.children[1].append(bar);
      box.append(row);
    }
    p.body.append(box);
    return p.el;
  }

  const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  function sujet(s, names, lieuNames, instNames, mesNames) {
    const c = U.el("article", "fr-sujet");
    const h = U.el("div", "fr-sujet-h");
    const n = s.medias.length;
    h.append(U.badge(s.level), U.el("span", "fr-date", U.dmyhm(s.time)),
      U.el("span", "muted", n ? `${n} média${n > 1 ? "s" : ""}` : "aucun média : source secondaire seule"));
    if (!n && s.secondaires && s.secondaires.length) h.append(U.el("span", "fr-tag fr-tag-t", "source secondaire (GDELT)"));
    c.append(h, U.el("h3", null, s.titre));
    const arts = U.el("div", "fr-chips");
    for (const a of s.articles) {
      const cls = a.type === "secondaire" ? "fr-chip fr-chip-sec" : a.type === "institution" ? "fr-chip fr-chip-inst" : "fr-chip";
      const ch = link(a.media, a.url, cls);
      if (a.type === "secondaire") ch.title = "Article vu par GDELT (détection automatique, non vérifiée) : ne confirme rien";
      if (a.type === "institution") ch.title = "Communiqué de l'institution elle-même : sa parole, pas une confirmation";
      arts.append(ch);
    }
    c.append(arts);
    const tags = U.el("div", "fr-tags");
    for (const e of s.entites) {
      if (e.startsWith("cand:")) tags.append(U.el("span", "fr-tag", names[e.slice(5)] || e.slice(5)));
      else tags.append(U.el("span", "fr-tag muted", e.slice(6)));
    }
    for (const t of s.themes) tags.append(U.el("span", "fr-tag fr-tag-t", THEME_LABEL[t] || t));
    for (const l of s.lieux || []) tags.append(U.el("span", "fr-tag muted", `⌖ ${(lieuNames[l] && lieuNames[l].nom) || l}`));
    for (const i of s.institutions || []) tags.append(U.el("span", "fr-tag fr-tag-i", `institution : ${instNames[i.slice(5)] || i.slice(5)}`));
    for (const m of s.mesures || []) {
      const info = mesNames[m.slice(4)] || {};
      const t = U.el("span", "fr-tag fr-tag-m", `≈ mesure : ${names[info.candidat] || m.slice(4)}${info.resume ? ` — ${short(info.resume, 70)}` : ""}`);
      t.title = "Indication par mots-clés (au moins deux racines en commun et le nom du candidat) : peut se tromper. Résumé du programme relevé par IA, non relu.";
      tags.append(t);
    }
    if (tags.childElementCount) c.append(tags);
    return c;
  }

  function owners(medias) {
    const rows = Object.entries(medias).map(([k, m]) => ({ k, ...m }));
    const p = U.panel("Qui possède quoi", { sub: "Éditeur et actionnaire principal, relevés sur les mentions légales de chaque média et sur la presse spécialisée (phrases exactes dans medias.json). Les institutions parlent d'elles-mêmes." });
    p.body.append(U.table(rows, [["nom", "Média"], ["editeur", "Éditeur"], ["actionnaire", "Actionnaire"],
      ["sources", "Sources", (v) => { const s = U.el("span"); (v || []).forEach((u, i) => s.append(link(`source ${i + 1}`, u, "fr-link"), document.createTextNode(" "))); return s; }]],
    null, { empty: "Actionnariat non encore relevé." }));
    return p.el;
  }

  async function actualite(root) {
    U = window.MASTER_UI;
    const s = readHash();
    const reg = await U.api("/api/france/candidats").catch(() => ({ candidats: [], autres: [] }));
    const all = [...reg.candidats, ...(reg.autres || [])];
    const names = Object.fromEntries(all.map((c) => [c.id, c.nom]));
    const q = new URLSearchParams();
    if (s.candidat) q.set("candidat", s.candidat);
    if (s.theme) q.set("theme", s.theme);
    if (s.parti) q.set("parti", s.parti);
    if (s.lieu) q.set("lieu", s.lieu);
    if (s.institution) q.set("institution", s.institution);
    if (s.mesure) q.set("mesure", s.mesure);
    const path = `/api/france/actualite${q.toString() ? `?${q}` : ""}`;
    let d;
    try { d = await U.api(path); } catch (e) {
      root.append(U.callout("info", "Filtre indisponible", window.MASTER_STATIC ? "La version en ligne ne propose que le fil complet, sans filtre." : e.message));
      d = await U.api("/api/france/actualite");
    }
    const filters = U.el("div", "fr-controls");
    const sel = U.el("select", "fr-select");
    sel.setAttribute("aria-label", "Candidat");
    sel.append(new Option("Tous les candidats", "tous"));
    for (const c of reg.candidats) sel.append(new Option(c.nom, c.id));
    sel.value = s.candidat || "tous";
    sel.onchange = () => { location.hash = hashFor({ ...s, candidat: sel.value === "tous" ? null : sel.value }); };
    const psel = U.el("select", "fr-select");
    psel.setAttribute("aria-label", "Parti");
    psel.append(new Option("Tous les partis", "tous"));
    for (const p of d.partis || []) psel.append(new Option(p, p));
    psel.value = s.parti || "tous";
    psel.onchange = () => { location.hash = hashFor({ ...s, parti: psel.value === "tous" ? null : psel.value }); };
    const lsel = U.el("select", "fr-select");
    lsel.setAttribute("aria-label", "Lieu");
    lsel.append(new Option("Tous les lieux", "tous"));
    const cites = Object.entries(d.lieux_cites || {});
    if (s.lieu && !cites.some(([k]) => k === s.lieu)) lsel.append(new Option(s.lieu, s.lieu));
    for (const [k, v] of cites) lsel.append(new Option(`${v.nom} (${v.sujets})`, k));
    lsel.value = s.lieu || "tous";
    lsel.title = "Lieux cités dans les sujets des 7 derniers jours (régions, départements, communes de plus de 20 000 habitants ; étiquetage par règles sur les noms, sans IA)";
    lsel.onchange = () => { location.hash = hashFor({ ...s, lieu: lsel.value === "tous" ? null : lsel.value }); };
    const isel = U.el("select", "fr-select");
    isel.setAttribute("aria-label", "Institution");
    isel.append(new Option("Toutes les institutions", "tous"));
    for (const i of d.institutions || []) isel.append(new Option(i.nom, i.id));
    isel.value = s.institution || "tous";
    isel.title = "Institutions citées dans l'article ou qui en sont l'auteur (Élysée, Matignon, Assemblée, Sénat, Conseil constitutionnel, Conseil d'État, Cour des comptes) ; reconnues par leur nom, sans IA";
    isel.onchange = () => { location.hash = hashFor({ ...s, institution: isel.value === "tous" ? null : isel.value }); };
    const msel = U.el("select", "fr-select");
    msel.setAttribute("aria-label", "Mesure");
    msel.append(new Option("Toutes les mesures", "tous"));
    const mes = Object.entries(d.mesures_citees || {});
    if (s.mesure && !mes.some(([k]) => k === s.mesure)) msel.append(new Option(s.mesure, s.mesure));
    for (const [k, v] of mes) msel.append(new Option(`${names[v.candidat] || v.candidat} — ${short(v.resume || k, 60)} (${v.sujets})`, k));
    msel.value = s.mesure || "tous";
    msel.title = "Mesures de programme rattachées à des articles par mots-clés (indication : le nom du candidat et au moins deux racines en commun) ; peut se tromper";
    msel.onchange = () => { location.hash = hashFor({ ...s, mesure: msel.value === "tous" ? null : msel.value }); };
    filters.append(sel, psel, lsel, isel, msel, U.seg([["tous", "Tous les thèmes"], ...d.themes.map((t) => [t, THEME_LABEL[t] || t])], s.theme || "tous",
      (v) => { location.hash = hashFor({ ...s, theme: v === "tous" ? null : v }); }, "Thème"));
    root.append(filters, coverage(d, names));
    const list = U.panel(`Sujets (${d.sujets.length})`, { sub: "Les plus repris d'abord. « Probable » : traité par au moins deux médias indépendants (deux titres d'un même propriétaire comptent pour un) ; « déclaration » : propos d'un candidat, même repris par plusieurs médias, ou communiqué d'une institution. Les articles de GDELT (pointillés) sont une source secondaire : ils ne confirment rien. Titres et liens des flux." });
    if (!d.sujets.length) list.body.append(U.el("p", "muted", "Aucun sujet pour ce filtre."));
    const instNames = Object.fromEntries((d.institutions || []).map((i) => [i.id, i.nom]));
    for (const x of d.sujets) list.body.append(sujet(x, names, d.lieux_cites || {}, instNames, d.mesures_citees || {}));
    root.append(list.el, owners(d.medias || {}));
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { actualite });
})();
