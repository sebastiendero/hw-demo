/* Master — rubriques « Situation » (aiguillage entre ses deux modes) et « Développements » (frise des événements clés).
 *
 * Situation a deux modes, tous deux sur le globe 3D (globe3d.js) : « Monde » (situation-monde.js) et « Focus
 * détroits » (situation-detroits.js). Ce fichier porte les outils communs (étiquettes, heures, cours du bandeau).
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
  const sit = { globe: null, world: null, tour: true, stop: 0, timer: null };

  // Deux modes, deux adresses : #situation (Monde, globe de toutes les crises) et #ormuz (Focus détroits,
  // situation-detroits.js, rangé dans le groupe « Énergie & détroits » du menu).
  const MODES = [["monde", "Monde", "#situation"], ["detroits", "Focus détroits", "#ormuz"]];
  const getMode = () => (location.hash === "#ormuz" ? "detroits" : "monde");
  function modeSwitch(el) {
    const box = el("div", "sit-modes");
    box.setAttribute("role", "group"); box.setAttribute("aria-label", "Mode");
    const cur = getMode();
    for (const [k, label, href] of MODES) {
      const b = el("a", "sit-ghost", label);
      b.href = href; b.setAttribute("aria-pressed", String(k === cur));
      if (k === cur) b.setAttribute("aria-current", "page");
      box.append(b);
    }
    return box;
  }
  window.MASTER_SITUATION = { modeSwitch, TAG, isOsint, tagOf, ago, hm, dayShort, safeUrl, loadMarkets, lastChange };

  async function viewSituation(root) {
    if (sit.world) { sit.world.destroy(); sit.world = null; }
    clearInterval(sit.timer);
    const mode = getMode();
    if (mode === "detroits" && window.MASTER_DETROITS) return window.MASTER_DETROITS(root, sit);
    return window.MASTER_MONDE(root, sit);
  }

  // ------------------------------------------------------------ Développements
  async function viewDeveloppements(root) {
    const ui = U();
    const { el, api, badge, nf2 } = ui;
    const devMode = (() => { try { return localStorage.getItem("master-dev") || "monde"; } catch { return "monde"; } })();
    const seg = ui.seg([["monde", "Monde"], ["detroits", "Focus détroits"]], devMode, (v) => {
      try { localStorage.setItem("master-dev", v); } catch { /* non mémorisé */ } window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, "Périmètre");
    if (devMode === "monde") {  // « À la une » : les sujets du moment (sujets.js)
      if (window.MASTER_SUJETS) return window.MASTER_SUJETS(root, seg);
      root.append(ui.callout("erreur", "La page des sujets n'a pas pu se charger."));
      return;
    }
    const [events, markets] = await Promise.all([api("/api/events?theme=hormuz&limit=600"), loadMarkets(api, 400)]);
    const keys = events.filter((e) => KEY_KINDS.includes(e.kind));
    root.append(ui.pageHead({ crumbs: ["Veille", "Développements"], title: "Développements",
      sub: "Les événements clés, du plus récent au plus ancien, avec la réaction observée des marchés liés le jour même.", actions: [seg] }));

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

  // Développements du monde : sujets repris par au moins deux médias différents (titres recoupés), regroupés.

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { situation: viewSituation, ormuz: viewSituation, developpements: viewDeveloppements });
})();
