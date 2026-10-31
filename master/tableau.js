/* Master — Tableau : un tableau de bord à composer soi-même (l'« OSINT Ops Center » de SitDeck) : des modules à
 * ajouter, déplacer (glisser) et élargir, et plusieurs tableaux enregistrés dans ce navigateur. Les modules lisent les
 * données du portail (mêmes API que les autres pages) et se rechargent toutes les deux minutes. Le module « Directs »
 * lit les chaînes d'information en direct dans un lecteur YouTube sans cookies (youtube-nocookie.com).
 * Tout texte passe par textContent ; liens http(s).
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const S = () => window.MASTER_SITUATION;
  const KEY = "master-tableaux";
  const flag = (iso) => (iso && /^[a-z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "");
  const LIVE = [["UCQfwfsi5VrQ8yKZ-UWmAEFg", "France 24 (anglais)"], ["UCCCPCZNChQdGa9EkATeye4g", "France 24 (français)"], ["UCNye-wNBqNL5ZzHSJj3l8Bg", "Al Jazeera English"],
    ["UCknLrEdhRCp1aegoMqRaCZg", "DW News"], ["UCoMdktPbSTixAyNGwb-UYkQ", "Sky News"], ["UCSrZ3UV4jOidv8ppoVuvW9Q", "Euronews"]];
  const ZONES = [["UTC", "UTC"], ["Europe/Paris", "Paris"], ["America/New_York", "New York"], ["Asia/Tehran", "Téhéran"], ["Asia/Dubai", "Dubaï"], ["Asia/Shanghai", "Pékin"], ["Europe/Moscow", "Moscou"]];

  // Modules : id → [titre, fonction(boîte, api, ui) qui remplit la boîte]
  const W = {
    pulse: ["Pulse du monde", async (b, api, ui) => {
      const r = await api("/api/pulse"); const m = r.monde;
      const big = ui.el("div", "tb-big"); big.append(ui.el("b", null, String(m.score).replace(".", ",")), ui.el("span", null, `/ 100 · ${m.band}`)); b.append(big);
      for (const p of r.pays.slice(0, 6)) b.append(row(ui, `${flag(p.iso2)} ${p.name}`, String(p.score).replace(".", ","), "#pulse"));
    }],
    ormuz: ["Ormuz", async (b, api, ui) => {
      const o = await api("/api/overview"); const h = o.hormuz || {};
      const big = ui.el("div", "tb-big"); big.append(ui.el("b", null, `${ui.nf1.format(h.pct_of_normal || 0)} %`), ui.el("span", null, "du trafic normal")); b.append(big);
      b.append(row(ui, "Passages / jour (7 j)", ui.nf1.format(h.transits_per_day_7d || 0), "#ormuz"), row(ui, "Navires à l'arrêt", ui.nf0.format(h.stationary || 0), "#ormuz"),
        row(ui, "Balises coupées probables", ui.nf0.format(h.silent_likely || 0), "#ormuz"), row(ui, "Attente pour entrer", h.wait_in_days != null ? `${ui.nf1.format(h.wait_in_days)} j` : "—", "#ormuz"));
    }],
    sanctions: ["Navires sanctionnés à Ormuz", async (b, api, ui) => {
      const r = await api("/api/sanctions/hormuz"); const conf = r.matches.filter((m) => m.level === "confirme");
      const big = ui.el("div", "tb-big"); big.append(ui.el("b", null, String(conf.length)), ui.el("span", null, `confirmés · ${r.matches.length} au total`)); b.append(big);
      for (const m of conf.slice(0, 6)) b.append(row(ui, m.vessel.name, (m.entry.programs || [])[0] || "", "#ormuz"));
    }],
    une: ["À la une", async (b, api, ui) => {
      const ev = await api("/api/events?theme=actualite&limit=400");
      const by = {}; for (const e of ev) if (e.level === "probable") by[e.title] = e;
      for (const e of Object.values(by).slice(0, 8)) b.append(link(ui, e.title, e.source, e.url));
    }],
    depeches: ["Dernières dépêches", async (b, api, ui) => {
      const ev = await api("/api/events?theme=actualite&limit=40");
      for (const e of ev.slice(0, 12)) b.append(link(ui, e.title, `${S().ago(e.time)} · ${e.source}`, e.url));
    }],
    catastrophes: ["Catastrophes et séismes", async (b, api, ui) => {
      const [g, q] = await Promise.all([api("/api/layers/catastrophes").catch(() => null), api("/api/layers/seismes").catch(() => null)]);
      for (const x of ((g && g.items) || []).slice(0, 5)) b.append(row(ui, `${x.type} · ${x.title}`, x.level === "red" ? "rouge" : "orange", "#cinema"));
      for (const x of ((q && q.items) || []).slice(0, 5)) b.append(row(ui, x.title, `M${x.mag}`, "#cinema"));
    }],
    avions: ["Avions militaires", async (b, api, ui) => {
      const d = await api("/api/layers/avions-militaires"); const ac = d.items || [];
      const big = ui.el("div", "tb-big"); big.append(ui.el("b", null, String(ac.length)), ui.el("span", null, "visibles dans le monde (ADS-B)")); b.append(big);
      for (const [n, w, s, e, nn] of [["Golfe & Moyen-Orient", 24, 12, 64, 42], ["Europe & Ukraine", -12, 35, 45, 72], ["Asie-Pacifique", 64, -15, 180, 55], ["Amériques", -170, -60, -30, 72]])
        b.append(row(ui, n, String(ac.filter((a) => a.lon >= w && a.lon <= e && a.lat >= s && a.lat <= nn).length), "#cinema"));
    }],
    marches: ["Marchés", async (b, api, ui) => {
      const ms = await S().loadMarkets(api, 10);
      for (const m of ms.filter((x) => x.last).slice(0, 10)) { const ch = S().lastChange(m.rows); b.append(row(ui, m.label, `${ui.nf2.format(m.last.close)} ${ch == null ? "" : `${ch >= 0 ? "▲" : "▼"} ${ui.nf2.format(Math.abs(ch))} %`}`, "#marches", ch == null ? "" : ch >= 0 ? "up" : "down")); }
    }],
    predictions: ["Marchés de prédiction", async (b, api, ui) => {
      const d = await api("/api/predictions"); for (const x of (d.items || []).filter((y) => y.source === "Kalshi").slice(0, 8)) b.append(link(ui, x.event ? `${x.event} — ${x.outcome}` : x.question, `${Math.round(x.prob * 100)} %`, x.url));
    }],
    cyber: ["Cyber (vulnérabilités exploitées)", async (b, api, ui) => {
      const d = await api("/api/layers/cyber"); for (const v of (d.items || []).slice(0, 8)) b.append(link(ui, `${v.cve} · ${v.vendor} ${v.product}`, v.ransomware ? "rançongiciel" : v.added, v.url));
    }],
    rapport: ["Dernier rapport de situation", async (b, api, ui) => {
      const d = await api("/api/sitreps"); const n = (d.reports || [])[0];
      if (!n) { b.append(ui.el("p", "muted", "Aucun rapport : suivre un sujet dans Rapports.")); return; }
      b.append(ui.el("p", "muted", `${n.summary} · ${ui.dmyhm(n.created_at)}`));
      const body = ui.el("div", "tb-md md"); body.append(window.MASTER_MD ? window.MASTER_MD.render((n.body || "").slice(0, 900)) : document.createTextNode(n.body || "")); b.append(body);
    }],
    previsions: ["Prévisions", async (b, api, ui) => {
      const d = await api("/api/previsions"); for (const n of (d.forecasts || []).slice(0, 6)) b.append(row(ui, n.summary, `${Math.round((n.data || {}).probability * 100)} %`, "#previsions"));
      if (!(d.forecasts || []).length) b.append(ui.el("p", "muted", "Aucune prévision."));
    }],
    horloges: ["Horloges", async (b, _api, ui) => {
      for (const [tz, n] of ZONES) b.append(row(ui, n, new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit", weekday: "short" }).format(new Date())));
    }],
    espace: ["Météo spatiale", async (b, api, ui) => {
      const d = await api("/api/layers/meteo-spatiale"); const it = d.items || []; const last = it[it.length - 1];
      const big = ui.el("div", "tb-big"); big.append(ui.el("b", null, last ? String(last.kp).replace(".", ",") : "—"), ui.el("span", null, "indice Kp (≥ 5 : tempête géomagnétique)")); b.append(big);
      const sp = ui.el("div", "pl-spark"); for (const x of it.slice(-40)) { const i = ui.el("i"); i.style.height = `${(x.kp / 9) * 100}%`; i.title = `${x.time} : Kp ${x.kp}`; sp.append(i); } b.append(sp);
    }],
    directs: ["Directs (chaînes d'information)", async (b, _api, ui, cfg, persist) => {
      if (window.MASTER_STATIC) { b.append(ui.el("p", "muted", "Lecteur disponible sur le portail du Mac.")); return; }
      const sel = ui.el("select"); sel.setAttribute("aria-label", "Chaîne");
      for (const [id, n] of LIVE) { const o = ui.el("option", null, n); o.value = id; o.selected = id === (cfg.channel || LIVE[0][0]); sel.append(o); }
      const f = ui.el("iframe", "tb-live"); f.title = "Chaîne d'information en direct"; f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      f.referrerPolicy = "strict-origin-when-cross-origin";
      const play = () => { f.src = `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(sel.value)}&mute=1&autoplay=1`; cfg.channel = sel.value; persist(); };
      sel.onchange = play; b.append(sel, f); play();
    }],
  };
  const DEFAULT = [["pulse", 1], ["ormuz", 1], ["sanctions", 1], ["une", 2], ["marches", 1], ["catastrophes", 1], ["avions", 1], ["predictions", 1], ["horloges", 1]];
  function row(ui, a, b, href, cls) { const r = ui.el(href ? "a" : "div", "tb-row"); if (href) r.href = href; r.append(ui.el("span", null, a), ui.el("b", cls || null, b || "")); return r; }
  function link(ui, a, b, url) { const ok = url && /^https?:\/\//.test(url); const r = ui.el(ok ? "a" : "div", "tb-row tb-link"); if (ok) { r.href = url; r.target = "_blank"; r.rel = "noopener noreferrer"; } r.append(ui.el("span", null, a), ui.el("b", null, b || "")); return r; }

  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && d.boards && d.boards.length) return d; } catch { /* */ } return { current: 0, boards: [{ name: "Mon tableau", items: DEFAULT.map(([id, w]) => ({ id, w })) }] }; };
  let timer = null;

  async function viewTableau(root) {
    const ui = U();
    const { el, api } = ui;
    clearInterval(timer);
    const st = load();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* */ } };
    const board = () => st.boards[st.current] || st.boards[0];
    const tabs = el("div", "tb-tabs");
    const add = el("select", "tb-add"); add.setAttribute("aria-label", "Ajouter un module");
    root.append(ui.pageHead({ crumbs: ["Veille", "Tableau"], title: "Tableau",
      sub: "Votre tableau de bord : ajouter des modules, les glisser pour les ranger, les élargir ; plusieurs tableaux possibles.", actions: [tabs, add] }));
    const grid = el("div", "tb-grid");
    root.append(grid);
    function drawTabs() {
      tabs.replaceChildren();
      st.boards.forEach((bd, i) => {
        const b = el("button", "tb-tab", bd.name); b.type = "button"; b.setAttribute("aria-pressed", String(i === st.current));
        b.onclick = () => { st.current = i; save(); draw(); drawTabs(); };
        b.ondblclick = () => { const n = prompt("Nom du tableau", bd.name); if (n && n.trim()) { bd.name = n.trim().slice(0, 30); save(); drawTabs(); } };
        tabs.append(b);
      });
      const plus = el("button", "tb-tab", "+"); plus.type = "button"; plus.title = "Nouveau tableau";
      plus.onclick = () => { st.boards.push({ name: `Tableau ${st.boards.length + 1}`, items: [] }); st.current = st.boards.length - 1; save(); draw(); drawTabs(); };
      tabs.append(plus);
      if (st.boards.length > 1) {
        const del = el("button", "tb-tab", "Supprimer ce tableau"); del.type = "button";
        del.onclick = () => { st.boards.splice(st.current, 1); st.current = 0; save(); draw(); drawTabs(); };
        tabs.append(del);
      }
    }
    function fillAdd() {
      add.replaceChildren(el("option", null, "+ Ajouter un module"));
      add.firstChild.value = "";
      for (const [id, [t]] of Object.entries(W)) { const o = el("option", null, t); o.value = id; add.append(o); }
    }
    add.onchange = () => { if (add.value) { board().items.push({ id: add.value, w: 1 }); save(); draw(); } add.value = ""; };
    let drag = null;
    function fill(body, it) {
      body.replaceChildren();
      W[it.id][1](body, api, ui, it.cfg || (it.cfg = {}), save).catch((err) => body.append(el("p", "muted", `Indisponible : ${err.message}`)));
    }
    function draw() {
      grid.replaceChildren();
      board().items.forEach((it, idx) => {
        const def = W[it.id]; if (!def) return;
        const card = el("section", `card tb-card w${it.w || 1}`);
        card.draggable = true;
        card.ondragstart = (e) => { drag = idx; card.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; };
        card.ondragend = () => card.classList.remove("drag");
        card.ondragover = (e) => { e.preventDefault(); card.classList.add("over"); };
        card.ondragleave = () => card.classList.remove("over");
        card.ondrop = (e) => { e.preventDefault(); card.classList.remove("over"); if (drag == null || drag === idx) return; const [m] = board().items.splice(drag, 1); board().items.splice(idx, 0, m); drag = null; save(); draw(); };
        const h = el("div", "tb-h");
        const grip = el("span", "tb-grip", "⠿"); grip.title = "Glisser pour déplacer";
        const wide = el("button", "tb-ico", it.w === 3 ? "⇤" : "⇥"); wide.type = "button"; wide.title = "Élargir / réduire";
        wide.onclick = () => { it.w = it.w >= 3 ? 1 : (it.w || 1) + 1; save(); draw(); };
        const x = el("button", "tb-ico", "✕"); x.type = "button"; x.title = "Retirer"; x.setAttribute("aria-label", `Retirer ${def[0]}`);
        x.onclick = () => { board().items.splice(idx, 1); save(); draw(); };
        h.append(grip, el("h2", null, def[0]), wide, x);
        const body = el("div", "tb-body");
        card.append(h, body);
        grid.append(card);
        body.dataset.id = it.id;
        fill(body, it);
      });
      if (!board().items.length) grid.append(el("p", "muted", "Tableau vide : ajouter des modules avec le menu en haut à droite."));
    }
    drawTabs(); fillAdd(); draw();
    // rechargement des modules toutes les deux minutes (le lecteur des directs n'est pas relancé)
    timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      const bodies = [...grid.querySelectorAll(".tb-body")];
      board().items.forEach((it, i) => { if (it.id !== "directs" && bodies[i]) fill(bodies[i], it); });
    }, 120000);
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { tableau: viewTableau });
})();
