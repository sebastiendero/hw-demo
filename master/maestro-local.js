/* Master — Maestro dans la version en ligne : la conversation tourne dans le navigateur.
 *
 * La page en ligne n'a pas de serveur. Les consignes, les agents, la liste des outils et la clé OpenAI viennent de
 * l'instantané chiffré (« /maestro/config », déchiffré par static.js avec le mot de passe). Le navigateur appelle
 * OpenAI directement et exécute ici les outils, en LECTURE SEULE, sur les données publiées (mêmes noms et mêmes
 * réponses que master/maestro.py). Aucune analyse ne peut être lancée d'ici. La clé ne quitte jamais la mémoire de
 * l'onglet : elle n'est ni affichée, ni enregistrée.
 */
(() => {
  "use strict";
  const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
  const api = (p) => window.__masterApi(p);
  const opt = (p) => api(p).catch(() => null);
  const norm = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const int = (v, d, lo = 1, hi = 365) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const count = (xs) => { const c = {}; for (const x of xs) c[x] = (c[x] || 0) + 1; return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1])); };
  const words = (q) => (norm(q).match(/[\w'-]{3,}/g) || []);
  const has = (text, ws) => { const t = norm(text); return ws.every((w) => t.includes(w)); };

  // ------------------------------------------------------------ données de référence (fichiers publics du globe)
  let WORLD = null;
  async function world() {
    if (WORLD) return WORLD;
    const get = (f) => fetch(f, { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null), () => null);
    const [countries, conflicts, topo] = await Promise.all([get("vendor/world/countries.json"), get("vendor/world/conflicts.json"),
      get("vendor/geo/countries-110m.json")]);
    const en = {};
    for (const g of ((topo && topo.objects && topo.objects.countries && topo.objects.countries.geometries) || [])) en[String(Number(g.id))] = (g.properties || {}).name;
    const byIso = {};
    for (const [id, c] of Object.entries((countries && (countries.countries || countries)) || {})) {
      if (c && c.iso2) byIso[c.iso2.toLowerCase()] = { ...c, en: en[String(Number(id))] || "" };
    }
    WORLD = { byIso, conflicts: (conflicts && (conflicts.conflicts || conflicts)) || [] };
    return WORLD;
  }
  async function country(name) {
    const W = await world(), k = norm(name);
    if (k.length === 2 && W.byIso[k]) return [k, W.byIso[k]];
    const all = Object.entries(W.byIso);
    return all.find(([, c]) => k === norm(c.name_fr) || k === norm(c.en))
      || all.find(([, c]) => k && (norm(c.name_fr).includes(k) || norm(c.en).includes(k))) || null;
  }
  const ALIASES = { brent: "BRENT", wti: "WTI", total: "TTE.PA", totalenergies: "TTE.PA", frontline: "FRO", dht: "DHT", bitcoin: "BTC", btc: "BTC", bno: "BNO", uso: "USO" };
  async function instrument(name) {
    const list = (await opt("/api/instruments")) || [];
    const k = norm(name), sym = ALIASES[k.replace(/ /g, "")];
    return list.find((i) => sym === i.symbol || [norm(i.symbol), norm(i.provider_id), norm(i.label)].includes(k) || (k && norm(i.label).includes(k))) || null;
  }

  // ------------------------------------------------------------ outils (mêmes noms et mêmes réponses que le serveur)
  const events = async () => (await opt("/api/events?limit=100000")) || [];  // sans limite : tout le journal publié
  const T = {
    async hormuz_status() {
      const o = await opt("/api/overview");
      if (!o || !o.hormuz) return { erreur: "Hormuz Watch indisponible dans la publication" };
      const { health, ...rest } = o.hormuz; return rest;
    },
    async recent_events({ kind, level, days = 7, limit = 30 } = {}) {
      const since = daysAgo(int(days, 7)), lv = level ? String(level).split(/[,;]/).map((x) => norm(x).replace(/ /g, "_")) : null;
      let evs = (await events()).filter((e) => e.theme === "hormuz" && e.time >= since && (kind ? e.kind === kind : e.kind !== "crossing"));
      const all = evs;
      if (lv) evs = evs.filter((e) => lv.includes(e.level));
      const pick = (e) => ({ time: e.time, kind: e.kind, level: e.level, title: e.title, source: e.source });
      if (!evs.length) return [{ info: `aucun événement pour type=${kind || "tous"}, niveau=${level || "tous"}, ${int(days, 7)} derniers jours` }, ...all.slice(0, 30).map(pick)];
      return evs.slice(0, int(limit, 30, 1, 60)).map(pick);
    },
    async world_news({ query, days = 2, limit = 40 } = {}) {
      const since = daysAgo(int(days, 2, 1, 30)), ws = words(query);
      const rows = (await events()).filter((e) => e.theme === "actualite" && e.kind === "headline" && e.time >= since
        && (!ws.length || has(`${e.title} ${(e.data && e.data.summary) || ""}`, ws)));
      return { periode_jours: int(days, 2, 1, 30), nombre: rows.length, par_media: count(rows.map((e) => e.source)),
        titres: rows.slice(0, int(limit, 40, 1, 80)).map((e) => ({ heure: e.time.slice(0, 16), media: e.source, niveau: e.level, titre: e.title })) };
    },
    async search({ query, days = 30 } = {}) {
      const ws = words(query), since = daysAgo(int(days, 30));
      if (!ws.length) return { info: "recherche vide : donner un ou plusieurs mots", resultats: [] };
      const hits = (await events()).filter((e) => e.time >= since && has(`${e.title} ${(e.data && e.data.summary) || ""}`, ws));
      return { nombre: hits.length, par_source: count(hits.map((e) => e.source)),
        resultats: hits.slice(0, 40).map((e) => ({ date: e.time.slice(0, 16), type: e.kind, niveau: e.level, source: e.source, titre: e.title })) };
    },
    async country_news({ country: name } = {}) {
      const c = await country(name || "");
      if (!c) return { erreur: `pays inconnu : ${name}` };
      const [iso, fiche] = c;
      const d = await opt(`/api/news/country/${iso}`);
      if (d) return { pays: fiche.name_fr, lu_le: d.fetched_at, nombre: d.items.length, journaux: d.sources.slice(0, 15),
        rubriques: count(d.items.map((x) => x.rubrique)),
        titres: d.items.slice(0, 30).map((x) => ({ heure: (x.time || "").slice(0, 16), media: x.source, rubrique: x.rubrique, titre: x.title })) };
      const ws = [norm(fiche.name_fr), norm(fiche.en)].filter(Boolean);
      const rows = (await events()).filter((e) => e.kind === "headline" && ws.some((w) => norm(e.title).includes(w)));
      return { pays: fiche.name_fr, info: "fil complet non publié pour ce pays : titres collectés qui le citent",
        titres: rows.slice(0, 30).map((e) => ({ heure: e.time.slice(0, 16), media: e.source, titre: e.title })) };
    },
    async developments({ limit = 10 } = {}) {
      const d = await opt("/api/research/notes?source=developpement&limit=200");
      const notes = ((d && d.notes) || []).slice(0, int(limit, 10, 1, 30));
      return notes.length ? notes.map((n) => ({ date: n.created_at.slice(0, 16), titre: n.summary, lieu: (n.data || {}).lieu, controle: n.coherence,
        texte: ((n.data || {}).paragraphes || []).map((p) => p.texte || "").join(" ").slice(0, 700), impact: (n.data || {}).impact,
        nombre_de_depeches: (n.data || {}).n_sources })) : [{ info: "aucun développement rédigé pour l'instant" }];
    },
    async conflicts({ country: name, limit = 15 } = {}) {
      let rows = (await world()).conflicts;
      if (name) {
        const c = await country(name);
        if (!c) return [{ erreur: `pays inconnu : ${name}` }];
        rows = rows.filter((x) => (x.countries || []).map((y) => y.toLowerCase()).includes(c[0]));
      }
      rows = rows.slice().sort((a, b) => (b.deaths_12m || 0) - (a.deaths_12m || 0)).slice(0, int(limit, 15, 1, 40));
      return rows.length ? rows.map((c) => ({ conflit: c.name_fr, pays: c.countries, morts_12_mois: c.deaths_12m, morts_provisoires: c.deaths_12m_provisional,
        debut: c.start, type: c.type, deplaces: c.displaced, dernier_evenement: c.last_event, belligerants: c.sides, source: "UCDP (Uppsala), UNHCR" }))
        : [{ info: "aucun conflit suivi pour ce pays" }];
    },
    async country_profile({ country: name } = {}) {
      const c = await country(name || "");
      if (!c) return { erreur: `pays inconnu : ${name}` };
      const [iso, f] = c, out = { iso2: iso, nom: f.name_fr };
      for (const k of ["capital", "head_of_state", "head_of_government", "population", "gdp_usd", "milex_pct_gdp", "blocs", "un_vote_partners",
        "un_vote_adversaries", "export_partners", "import_partners", "trade_year", "summary_fr"]) if (f[k] != null && f[k] !== "") out[k] = f[k];
      out.sources = "Wikidata, Banque mondiale, votes à l'ONU, CEPII BACI, Wikipédia (résumé)";
      return out;
    },
    async hormuz_ships() {
      const m = await opt("/api/hormuz/map");
      if (!m) return { erreur: "carte d'Hormuz Watch absente de la publication" };
      const v = m.vessels || [];
      return { donnees_du: m.generated_at, trafic: m.status, navires_visibles: v.length, par_cargaison: count(v.map((x) => x.seg || "other")),
        en_mouvement: v.filter((x) => (x.speed || 0) >= 1).length, balises_coupees_probables: (m.silent || []).length,
        zones: (m.zones || []).map((z) => ({ name: z.name, count: z.count, tankers: z.tankers, hn_median_h: z.hn_median_h, side: z.side })).sort((a, b) => (b.count || 0) - (a.count || 0)),
        derniers_passages: (m.crossings || []).slice(0, 12), feux_en_mer: m.fires_at_sea,
        source: "hormuz.now (AIS, CC BY 4.0), IMF PortWatch ; coupures déduites par Hormuz Watch" };
    },
    async price({ symbol_or_name, days = 30 } = {}) {
      const i = await instrument(symbol_or_name);
      if (!i) return { erreur: `instrument inconnu : ${symbol_or_name}`, connus: ((await opt("/api/instruments")) || []).map((x) => `${x.label} (${x.symbol})`) };
      const p = await opt(`/api/prices/${encodeURIComponent(i.symbol)}`), rows = (p && p.rows) || [];
      if (!rows.length) return { symbol: i.symbol, erreur: "pas de cours publiés" };
      const [d, last] = rows[rows.length - 1], out = { symbol: i.symbol, label: i.label, devise: i.currency, derniere_cloture: last, date: d };
      for (const n of [1, 5, 20, 60]) if (rows.length > n) out[`variation_${n}_seances_pct`] = Math.round((last / rows[rows.length - 1 - n][1] - 1) * 10000) / 100;
      const recent = rows.slice(-int(days, 30, 1, 2000)).map((r) => r[1]);
      out.min_periode = Math.min(...recent); out.max_periode = Math.max(...recent);
      return out;
    },
    async research({ symbol } = {}) {
      const i = await instrument(symbol);
      if (!i) return { erreur: `instrument inconnu : ${symbol}` };
      const r = (await opt(`/api/research?symbol=${encodeURIComponent(i.symbol)}`)) || {};
      const note = (n) => (n ? { date: n.created_at, position: n.stance, controle: n.coherence, problemes: n.issues, resume: (n.summary || "").slice(0, 600) } : null);
      return { symbol: i.symbol, tradingagents: note((r.notes || {}).tradingagents), macro: note((r.notes || {}).macro),
        prevision_kronos: r.forecast ? { faite_le: r.forecast.made_on, fin: r.forecast.rows[r.forecast.rows.length - 1], fiabilite_testee: r.forecast_eval || null } : null,
        note: "Recherche automatisée par IA ; Kronos n'est pas fiable tant que son test sur le passé ne l'est pas." };
    },
    async strategies() {
      const s = await opt("/api/strategies");
      return ((s && s.strategies) || []).map((x) => ({ nom: x.spec.name, instrument: x.spec.symbol, dernier_resultat: x.last, simulation_depuis: x.paper_since }));
    },
    async data_series({ name } = {}) {
      const cat = (await opt("/api/series")) || {};
      if (!name || !cat[name]) return { series_disponibles: Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, v.description])), ...(name ? { erreur: `série inconnue : ${name}` } : {}) };
      const s = await opt(`/api/series/${encodeURIComponent(name)}`), rows = (s && s.rows) || [];
      if (!rows.length) return { nom: name, erreur: "aucune donnée publiée" };
      return { nom: name, description: cat[name].description, derniere_date: rows[rows.length - 1][0], derniere_valeur: rows[rows.length - 1][1], points: rows.length, "12_derniers": rows.slice(-12) };
    },
    async sources_health() {
      const s = await opt("/api/sources");
      return ((s && s.master) || []).map((h) => ({ source: h.key, derniere_reussite: h.last_success, donnee_du: h.data_time, erreur: h.error }));
    },
    async digest() {
      const d = await opt("/api/digest");
      if (!d || !d.sections) return { info: "pas de synthèse publiée" };
      return { jour: d.day, sections: d.sections.map((s) => ({ titre: s.title, phrases: s.sentences.map((x) => x.text + (x.quote ? ` « ${x.quote} »` : "")) })), alertes_de_controle: d.flags };
    },
    async instruments() { return ((await opt("/api/instruments")) || []).map((i) => ({ symbole: i.symbol, nom: i.label, devise: i.currency })); },
    async agents() {
      const r = await opt("/api/agents"), cfg = await config();
      return [...((r && r.agents) || []).map((a) => ({ id: a.id, nom: a.name, role: a.role, modeles: a.models, rythme: a.schedule, derniere_execution: a.last_run,
        fiabilite: { value: a.reliability.value, level: a.reliability.level, measure: a.reliability.measure, n: a.reliability.n }, sante: a.health.state, erreur: a.health.error })),
      { info: `on peut parler à chacun avec @nom ; personnages ai-hedge-fund : ${Object.values(cfg.agents).filter((a) => a.persona).map((a) => a.name).join(", ")}` }];
    },
    async agent({ agent_id, symbol } = {}) {
      const cfg = await config(), k = norm(agent_id);
      const key = cfg.agents[k] ? k : Object.keys(cfg.agents).find((x) => cfg.agents[x].aliases.includes(k));
      if (!key) return { erreur: `agent inconnu : ${agent_id}`, agents: Object.keys(cfg.agents) };
      const a = cfg.agents[key], reg = (((await opt("/api/agents")) || {}).agents || []).find((x) => x.id === (a.registry || key)) || {};
      const out = { agent: a.name, role: reg.role, rythme: reg.schedule, derniere_execution: reg.last_run, fiabilite_mesuree: reg.reliability, sante: (reg.health || {}).state };
      const insts = symbol ? [await instrument(symbol)].filter(Boolean) : ((await opt("/api/instruments")) || []);
      let notes = [];
      if (a.notes === "developpement") notes = ((await opt("/api/research/notes?source=developpement&limit=200")) || {}).notes || [];
      else if (a.notes) for (const i of insts) notes.push(...((((await opt(`/api/research/notes?symbol=${encodeURIComponent(i.symbol)}`)) || {}).notes) || []));
      notes = notes.filter((n) => n.source === a.notes && (!a.persona || (n.data || {}).persona === a.persona)).sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
      if (notes.length) out.derniers_travaux = notes.slice(0, 6).map((n) => ({ date: n.created_at.slice(0, 16), instrument: n.symbol, position: n.stance || null,
        controle: n.coherence, problemes: (n.issues || []).length ? n.issues : null, resume: (n.summary || "").slice(0, 500) }));
      if (key === "kronos") {
        out.previsions = {};
        for (const i of insts) { const f = await opt(`/api/forecast/${encodeURIComponent(i.symbol)}`); if (f && f.rows) out.previsions[i.symbol] = { faite_le: f.made_on, fin: f.rows[f.rows.length - 1] }; }
      }
      if (!out.derniers_travaux && !(out.previsions && Object.keys(out.previsions).length)) out.info = `aucun travail publié récemment pour cet agent${symbol ? ` sur ${symbol}` : ""}`;
      out.avertissement = cfg.disclaimer;
      return out;
    },
  };

  // ------------------------------------------------------------ outils repris de SitDeck et d'OSIRIS (données publiées)
  const PLACES = { ormuz: [56.3, 26.5, 14], hormuz: [56.3, 26.5, 14], fujairah: [56.4, 25.2, 30], "golfe persique": [52, 27, 6], "bab el-mandeb": [43.4, 12.6, 9],
    "mer rouge": [38, 20, 4], suez: [32.5, 30.4, 9], malacca: [100.3, 3.1, 7], bosphore: [29.05, 41.1, 12], "mer de chine": [114, 14, 3], taiwan: [121, 23.7, 5], "mer noire": [34, 43.5, 4] };
  Object.assign(T, {
    async live_layer({ layer, west, south, east, north, limit = 30 } = {}) {
      const d = await opt(`/api/layers/${encodeURIComponent(layer || "")}`);
      if (!d) return { erreur: `couche indisponible : ${layer}` };
      let items = d.items || [];
      if ([west, south, east, north].every((x) => typeof x === "number")) items = items.filter((x) => x.lon != null && x.lon >= west && x.lon <= east && x.lat >= south && x.lat <= north);
      return { couche: d.label, source: d.source, lu_le: d.fetched_at, nombre: items.length, elements: items.slice(0, int(limit, 30, 1, 80)) };
    },
    async sanctions() {
      const d = await opt("/api/sanctions/hormuz");
      if (!d) return { erreur: "liste non publiée" };
      return { source: d.source, liste_du: d.list_date, note: "version en ligne : seulement les navires vus à Ormuz (pas de recherche libre)",
        ormuz: { nombre: d.matches.length, navires: d.matches.slice(0, 40).map((h) => ({ nom: h.vessel.name, pavillon: h.vessel.flag, balise_coupee: !!h.vessel.silent,
          niveau: h.level, methode: h.method, programmes: h.entry.programs, liste: h.entry.name, lie_a: h.entry.linked })) } };
    },
    async pulse({ country, limit = 15 } = {}) {
      const r = await opt("/api/pulse");
      if (!r) return { erreur: "indice non publié" };
      if (country) { const c = await country_(country); const row = c && r.pays.find((x) => x.iso2 === c[0]); return row || { info: `pas de signal mesuré pour ${country}` }; }
      return { monde: r.monde, pays: r.pays.slice(0, int(limit, 15, 1, 40)).map((x) => ({ name: x.name, score: x.score, band: x.band, dims: x.dims, signals: x.signals })), methode: r.formule };
    },
    async nexus({ query, days = 14 } = {}) {
      const ws = words(query); if (!ws.length) return { erreur: "donner un sujet" };
      const since = daysAgo(int(days, 14, 1, 60));
      const rows = (await events()).filter((e) => e.time >= since && has(`${e.title} ${(e.data && e.data.summary) || ""}`, ws)).sort((a, b) => (a.time < b.time ? -1 : 1));
      const acteurs = count(rows.flatMap((e) => e.title.match(/\b[A-Z][a-zà-ÿ]+(?: [A-Z][a-zà-ÿ]+)+\b/g) || []));
      return { sujet: query, nombre: rows.length, par_jour: count(rows.map((e) => e.time.slice(0, 10))), acteurs_lies: Object.fromEntries(Object.entries(acteurs).slice(0, 12)),
        chronologie: (rows.length > 40 ? [...rows.slice(0, 12), ...rows.slice(-28)] : rows).map((e) => ({ date: e.time.slice(0, 16), theme: e.theme, type: e.kind, niveau: e.level, source: e.source, titre: e.title })) };
    },
    async show_on_map({ place, layers } = {}) {
      const k = norm(place);
      let lon, lat, zoom, iso2 = null, name = place;
      if (PLACES[k]) [lon, lat, zoom] = PLACES[k];
      else { const c = await country_(place); if (!c || !c[1].capital) return { erreur: `lieu inconnu : ${place}` }; [iso2] = c; name = c[1].name_fr; lon = c[1].capital.lon; lat = c[1].capital.lat; zoom = 1.4; }
      return { carte: { lieu: name, lon, lat, zoom, iso2, calques: (layers || []).filter((x) => ["conflits", "routes", "bases", "nucleaire", "catastrophes", "seismes", "nature", "avions-militaires", "cables"].includes(x)) } };
    },
  });
  const country_ = (n) => country(n);

  // ------------------------------------------------------------ conversation
  let CFG = null;
  async function config() {
    if (!CFG) CFG = await api("/maestro/config");
    return CFG;
  }
  function mentioned(text, cfg) {
    for (const m of String(text || "").matchAll(/@([\w-]+)/g)) {
      const k = norm(m[1]);
      for (const [key, a] of Object.entries(cfg.agents)) if (k === key || a.aliases.includes(k)) return key;
    }
    return null;
  }
  function label(cfg, name, args) {
    let detail = args.query || args.country || args.symbol_or_name || args.symbol || args.name;
    if (name === "agent") detail = (cfg.agents[norm(args.agent_id)] || {}).name || args.agent_id;
    const base = cfg.labels[name] || name;
    return detail ? `${base} · ${detail}` : base;
  }
  async function openai(cfg, messages, signal) {
    const r = await fetch(OPENAI_URL, { method: "POST", signal, referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` },
      body: JSON.stringify({ model: cfg.model, messages, tools: cfg.tools }) });
    if (!r.ok) {
      let detail = "";
      try { detail = ((await r.json()).error || {}).message || ""; } catch { /* réponse non JSON */ }
      throw new Error(`OpenAI refuse la requête (${r.status}) ${detail.split(cfg.api_key).join("***").slice(0, 160)}`);
    }
    const d = await r.json();
    return ((d.choices || [{}])[0].message) || {};
  }

  // Mêmes événements que l'API du Mac : start, step (outil consulté), puis answer ou error.
  async function run(question, history, emit, signal) {
    let cfg;
    try { cfg = await config(); } catch { emit({ type: "error", text: "Maestro n'est pas configuré dans cette publication (clé OpenAI absente sur le Mac)." }); return; }
    const agent = mentioned(question, cfg);
    let system = `${cfg.system.replace("{today}", new Date().toISOString().slice(0, 10))}\n\n${cfg.static_note}`;
    if (agent) {
      const reg = (((await opt("/api/agents")) || {}).agents || []).find((x) => x.id === (cfg.agents[agent].registry || agent)) || {};
      system += `\n\n${cfg.agent_prompt.replace(/\{name\}/g, cfg.agents[agent].name).replace(/\{id\}/g, agent).replace(/\{role\}/g, reg.role || "agent du portail")}`;
    }
    const messages = [{ role: "system", content: system },
      ...(history || []).slice(-10).filter((h) => ["user", "assistant"].includes(h.role) && typeof h.content === "string").map((h) => ({ role: h.role, content: h.content.slice(0, 3000) })),
      { role: "user", content: question.slice(0, 4000) }];
    emit({ type: "start", agent, agent_name: agent ? cfg.agents[agent].name : null, model: cfg.model });
    const actions = [];
    try {
      for (let round = 0; round < cfg.max_rounds; round++) {
        const msg = await openai(cfg, messages, signal);
        const calls = msg.tool_calls || [];
        if (!calls.length) { emit({ type: "answer", text: (msg.content || "").trim() || "Je n'ai pas de réponse.", tools: [], actions, agent, disclaimer: cfg.disclaimer }); return; }
        messages.push({ role: "assistant", content: msg.content || "", tool_calls: calls });
        for (const c of calls) {
          const name = (c.function || {}).name;
          let args = {};
          try { args = JSON.parse((c.function || {}).arguments || "{}") || {}; } catch { args = {}; }
          emit({ type: "step", tool: name, label: label(cfg, name, args) });
          let result;
          try { result = T[name] ? await T[name](args) : { erreur: `outil inconnu : ${name}` }; } catch (e) { result = { erreur: `${e.name} : ${e.message}`.slice(0, 300) }; }
          if (name === "show_on_map" && result && result.carte) actions.push({ kind: "map", ...result.carte, label: `Voir sur le globe : ${result.carte.lieu}` });
          messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, cfg.max_tool_chars) });
        }
      }
      emit({ type: "answer", text: "Je n'ai pas pu conclure en assez peu d'étapes. Reformulez ou précisez la question.", tools: [], actions: [], agent, disclaimer: cfg.disclaimer });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      emit({ type: "error", text: `Maestro n'a pas pu répondre : ${e.message}` });
    }
  }

  window.MASTER_MAESTRO_LOCAL = { run, tools: T };
})();
