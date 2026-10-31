/* Master — Maestro : la conversation du portail, à la manière de ChatGPT.
 *
 * Questions libres sur toutes les données du Master ; « @nom » pour parler à un agent (TradingAgents, Kronos,
 * Buffett…). Le serveur (/api/maestro) envoie au fil de l'eau les étapes (outils consultés) puis la réponse.
 * Conversations gardées dans ce navigateur. La réponse du modèle est mise en forme par markdown.js (textContent
 * seulement, aucun lien) ; chaque réponse porte la mention « recherche automatisée par IA, pas un conseil ».
 * Une analyse coûteuse n'est jamais lancée par le modèle : il la propose, un bouton laisse Sébastien décider.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const STILL = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEY = "master-maestro";
  const SUGGESTIONS = [
    ["Ormuz aujourd'hui", "Où en est le détroit d'Ormuz aujourd'hui : trafic, navires à l'arrêt, balises coupées, derniers incidents ?"],
    ["Le monde en 5 points", "Quels sont les 5 développements géopolitiques les plus importants des dernières 48 heures, et qui y gagne ou y perd ?"],
    ["Pétrole et marchés", "Comment ont réagi le Brent et les armateurs pétroliers aux derniers événements d'Ormuz ?"],
    ["Faire l'appel des agents", "Quels agents travaillent pour moi, que font-ils, et lesquels sont fiables d'après leurs mesures ?"],
  ];
  let AGENTS = [];  // [{id, name, aliases}] (chargé depuis /api/maestro/agents)

  // ------------------------------------------------------------ conversations (mémorisées dans ce navigateur)
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "") || null; } catch { return null; } };
  const st = load() || { convs: [], current: null };
  const save = () => {
    st.convs = st.convs.filter((c) => c.messages.length).slice(0, 40);
    for (const c of st.convs) c.messages = c.messages.slice(-80);
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* stockage plein : non mémorisé */ }
  };
  const conv = () => st.convs.find((c) => c.id === st.current);
  function newConv() {
    const c = { id: `c${Date.now().toString(36)}`, title: "Nouvelle conversation", updated: new Date().toISOString(), messages: [] };
    st.convs.unshift(c); st.current = c.id;
    return c;
  }

  async function viewMaestro(root) {
    const ui = U();
    const { el, icon } = ui;
    const box = el("div", "mae");
    root.append(box);
    const online = !!window.MASTER_STATIC;  // version en ligne : maestro-local.js, sur les données publiées
    if (!AGENTS.length) AGENTS = await ui.api("/api/maestro/agents").catch(() => []);

    // ---- colonne des conversations
    const side = el("aside", "mae-side");
    const newBtn = el("button", "mae-new"); newBtn.type = "button";
    newBtn.append(icon("sparkles"), el("span", null, "Nouvelle conversation"));
    const list = el("nav", "mae-list");
    list.setAttribute("aria-label", "Conversations");
    side.append(newBtn, list);

    // ---- fil et zone de saisie
    const mainCol = el("section", "mae-main");
    const scroller = el("div", "mae-scroll");
    const thread = el("div", "mae-thread");
    scroller.append(thread);
    const composer = el("form", "mae-composer");
    const field = el("div", "mae-field");
    const input = el("textarea", "mae-input");
    input.rows = 1; input.maxLength = 4000; input.placeholder = "Demandez à Maestro… (@ pour parler à un agent)";
    input.setAttribute("aria-label", "Votre message");
    const sendBtn = el("button", "mae-send"); sendBtn.type = "submit"; sendBtn.setAttribute("aria-label", "Envoyer");
    sendBtn.append(icon("chevron-right"));
    const pop = el("div", "mae-pop"); pop.hidden = true; pop.setAttribute("role", "listbox");
    field.append(input, sendBtn, pop);
    composer.append(field, el("p", "mae-hint", `${online ? "Version en ligne : données de la dernière publication (toutes les heures). " : ""}Maestro consulte les données du portail et vos agents. Recherche automatisée par IA : à vérifier, pas un conseil en investissement.`));
    mainCol.append(scroller, composer);
    box.append(side, mainCol);

    let busy = null;  // AbortController de la requête en cours

    function renderList() {
      list.replaceChildren();
      const today = new Date().toISOString().slice(0, 10);
      let lastGroup = null;
      for (const c of st.convs.filter((x) => x.messages.length)) {
        const g = c.updated.slice(0, 10) === today ? "Aujourd'hui" : "Plus ancien";
        if (g !== lastGroup) { list.append(el("span", "mae-grp", g)); lastGroup = g; }
        const row = el("div", `mae-item${c.id === st.current ? " on" : ""}`);
        const b = el("button", "mae-open", c.title); b.type = "button";
        b.onclick = () => { if (busy) return; st.current = c.id; save(); renderList(); renderThread(); };
        const del = el("button", "mae-del"); del.type = "button"; del.setAttribute("aria-label", `Supprimer « ${c.title} »`); del.append(icon("x"));
        del.onclick = () => { if (busy) return; st.convs = st.convs.filter((x) => x !== c); if (st.current === c.id) st.current = null; save(); renderList(); renderThread(); };
        row.append(b, del);
        list.append(row);
      }
      if (!list.children.length) list.append(el("p", "mae-none", "Vos conversations apparaîtront ici."));
    }

    function empty() {
      const e = el("div", "mae-empty");
      e.append(el("div", "mae-logo", "M"), el("h1", null, "Maestro"),
        el("p", null, "Posez n'importe quelle question sur les données du Master, ou parlez à un agent avec @."));
      const grid = el("div", "mae-sugg");
      for (const [t, q] of SUGGESTIONS) {
        const b = el("button", "mae-card"); b.type = "button";
        b.append(el("b", null, t), el("span", null, q));
        b.onclick = () => ask(q);
        grid.append(b);
      }
      const agents = el("div", "mae-agents");
      agents.append(el("span", "mae-agents-l", "Parler à"));
      for (const a of AGENTS.filter((x) => ["tradingagents", "macro", "kronos", "buffett", "druckenmiller", "developpements"].includes(x.id))) {
        const b = el("button", "mae-chip", `@${a.name}`); b.type = "button";
        b.onclick = () => { input.value = `@${a.aliases[0]} `; input.focus(); grow(); };
        agents.append(b);
      }
      e.append(grid, agents);
      return e;
    }

    function avatar(m) {
      const a = el("div", `mae-av${m.agent ? " agent" : ""}`, m.agent_name ? m.agent_name.slice(0, 1) : "M");
      a.setAttribute("aria-hidden", "true");
      return a;
    }

    function bubble(m, live) {
      if (m.role === "user") {
        const row = el("div", "mae-msg user");
        row.append(el("div", "mae-bubble", m.content));
        return row;
      }
      const row = el("div", "mae-msg bot");
      const body = el("div", "mae-body");
      body.append(el("div", "mae-who", m.agent_name ? `${m.agent_name} · via Maestro` : "Maestro"));
      if (m.steps && m.steps.length) {
        const d = el("details", "mae-steps");
        if (live && !m.content) d.open = true;
        d.append(el("summary", null, m.content ? `Données consultées · ${m.steps.length}` : "Maestro réfléchit…"));
        const ol = el("ol");
        m.steps.forEach((s, i) => {
          const li = el("li", live && !m.content && i === m.steps.length - 1 ? "run" : "done", s);
          ol.append(li);
        });
        d.append(ol);
        body.append(d);
      } else if (live && !m.content) {
        body.append(el("div", "mae-typing", ""));
        body.lastChild.append(el("i"), el("i"), el("i"));
      }
      const text = el("div", `mae-text md${m.error ? " err" : ""}`);
      if (m.content) text.append(window.MASTER_MD ? window.MASTER_MD.render(m.content) : document.createTextNode(m.content));
      body.append(text);
      if (m.content && !live) {
        for (const a of m.actions || []) {
          const b = el("button", "mae-action"); b.type = "button";
          b.append(icon(a.kind === "map" ? "globe" : "sparkles"), el("span", null, a.label));
          if (a.kind === "map") {  // « parler à la carte » : le globe s'ouvre sur le lieu, avec les calques demandés
            b.onclick = () => {
              const strait = a.lon > 50 && a.lon < 60 && a.lat > 22 && a.lat < 29 && !a.iso2;
              try { localStorage.setItem("master-globe-goto", JSON.stringify({ lon: a.lon, lat: a.lat, zoom: a.zoom, iso2: a.iso2, layers: a.calques || [], at: Date.now() })); } catch { /* */ }
              location.hash = strait ? "#ormuz" : "#situation";
            };
            body.append(b);
            continue;
          }
          b.onclick = async () => {
            b.disabled = true;
            try {
              const r = await fetch("/api/research/run", { method: "POST", credentials: "same-origin",
                headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: a.symbol }) });
              const d = await r.json().catch(() => ({}));
              b.lastChild.textContent = r.ok ? `Analyse ${a.symbol} en file d'attente` : `Refusé : ${d.detail || r.status}`;
            } catch (e) { b.lastChild.textContent = `Échec : ${e.message}`; }
          };
          body.append(b);
        }
        if (!m.error) body.append(el("p", "mae-ai", m.disclaimer || "Recherche automatisée par modèles d'IA ; à vérifier ; pas un conseil en investissement."));
        const tools = el("div", "mae-tools");
        const copy = el("button", "mae-tool", "Copier"); copy.type = "button";
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(m.content); copy.textContent = "Copié"; setTimeout(() => { copy.textContent = "Copier"; }, 1400); }
          catch { copy.textContent = "Copie refusée"; }
        };
        const again = el("button", "mae-tool", "Régénérer"); again.type = "button";
        again.onclick = () => regenerate(m);
        tools.append(copy, again);
        body.append(tools);
      }
      row.append(avatar(m), body);
      return row;
    }

    function renderThread(live) {
      const c = conv();
      thread.replaceChildren();
      if (!c || !c.messages.length) { thread.append(empty()); return; }
      c.messages.forEach((m, i) => thread.append(bubble(m, live && i === c.messages.length - 1)));
      scroller.scrollTop = scroller.scrollHeight;
    }

    function grow() { input.style.height = "auto"; input.style.height = `${Math.min(220, input.scrollHeight)}px`; }

    // ---- envoi et lecture du flux
    async function ask(text, opts = {}) {
      text = (text || "").trim();
      if (!text || busy) return;
      const c = conv() || newConv();
      const history = c.messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      if (!opts.again) c.messages.push({ role: "user", content: text });
      if (c.title === "Nouvelle conversation") c.title = text.length > 48 ? `${text.slice(0, 46)}…` : text;
      const bot = { role: "assistant", content: "", steps: [] };
      c.messages.push(bot);
      c.updated = new Date().toISOString();
      st.convs = [c, ...st.convs.filter((x) => x !== c)];
      input.value = ""; grow(); renderList(); renderThread(true);
      busy = new AbortController();
      sendBtn.classList.add("stop"); sendBtn.setAttribute("aria-label", "Arrêter");
      let final = null;
      const onEvent = (ev) => {
        if (ev.type === "start") { bot.agent = ev.agent; bot.agent_name = ev.agent_name; renderThread(true); }
        else if (ev.type === "step") { bot.steps.push(ev.label); renderThread(true); }
        else if (ev.type === "answer" || ev.type === "error") final = ev;
      };
      const past = opts.again ? history.slice(0, -1) : history;
      try {
        if (online) await window.MASTER_MAESTRO_LOCAL.run(text, past, onEvent, busy.signal);
        else await serverRun(text, past, onEvent, busy.signal);
        if (!final) throw new Error("réponse incomplète");
      } catch (e) {
        final = { type: "error", text: e.name === "AbortError" ? "Arrêté." : `Maestro n'a pas pu répondre : ${e.message}` };
      }
      busy = null;
      sendBtn.classList.remove("stop"); sendBtn.setAttribute("aria-label", "Envoyer");
      bot.actions = final.actions || [];
      bot.disclaimer = final.disclaimer;
      bot.error = final.type === "error";
      await reveal(bot, final.text || "");
      save(); renderList(); renderThread(false);
      input.focus();
    }
    // Portail du Mac : le serveur envoie les événements au fil de l'eau (une ligne JSON par événement).
    async function serverRun(text, history, onEvent, signal) {
      const r = await fetch("/api/maestro", { method: "POST", credentials: "same-origin", signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history }) });
      if (r.status === 401) { location.href = "/login"; throw new Error("session expirée"); }
      if (!r.ok || !r.body) throw new Error(`réponse ${r.status}`);
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.trim()) onEvent(JSON.parse(line));
        }
      }
    }
    function regenerate(m) {
      const c = conv();
      const i = c.messages.indexOf(m);
      const q = c.messages[i - 1];
      if (!q || q.role !== "user" || busy) return;
      c.messages.splice(i, 1);
      ask(q.content, { again: true });
    }
    // Affichage progressif de la réponse (quelques centaines de caractères par seconde), instantané si le système
    // demande moins d'animations.
    function reveal(bot, text) {
      if (STILL || !text) { bot.content = text; return Promise.resolve(); }
      return new Promise((done) => {
        let n = 0;
        const step = Math.max(6, Math.ceil(text.length / 90));
        const tick = () => {
          n = Math.min(text.length, n + step);
          bot.content = text.slice(0, n);
          const last = thread.lastElementChild && thread.lastElementChild.querySelector(".mae-text");
          if (last) { last.replaceChildren(window.MASTER_MD ? window.MASTER_MD.render(bot.content) : document.createTextNode(bot.content)); }
          scroller.scrollTop = scroller.scrollHeight;
          if (n < text.length && box.isConnected) setTimeout(tick, 16); else { bot.content = text; done(); }
        };
        renderThread(true);
        tick();
      });
    }

    // ---- saisie : Entrée envoie, Maj+Entrée va à la ligne, « @ » propose les agents
    let popSel = 0, popItems = [];
    function mentionAt() {
      const upto = input.value.slice(0, input.selectionStart);
      const m = upto.match(/@([\w-]*)$/);
      return m ? { start: upto.length - m[0].length, q: m[1].toLowerCase() } : null;
    }
    function updatePop() {
      const m = mentionAt();
      popItems = m ? AGENTS.filter((a) => a.aliases.some((x) => x.startsWith(m.q)) || a.name.toLowerCase().includes(m.q)).slice(0, 8) : [];
      pop.hidden = !popItems.length;
      pop.replaceChildren();
      popSel = Math.min(popSel, Math.max(0, popItems.length - 1));
      popItems.forEach((a, i) => {
        const b = el("button", `mae-pop-i${i === popSel ? " on" : ""}`); b.type = "button"; b.setAttribute("role", "option");
        b.append(el("b", null, `@${a.aliases[0]}`), el("span", null, a.name));
        b.onmousedown = (e) => { e.preventDefault(); pick(a); };
        pop.append(b);
      });
    }
    function pick(a) {
      const m = mentionAt();
      if (!m) return;
      const before = input.value.slice(0, m.start), after = input.value.slice(input.selectionStart);
      input.value = `${before}@${a.aliases[0]} ${after}`;
      const pos = before.length + a.aliases[0].length + 2;
      input.setSelectionRange(pos, pos);
      pop.hidden = true; input.focus(); grow();
    }
    input.addEventListener("input", () => { grow(); popSel = 0; updatePop(); });
    input.addEventListener("keydown", (e) => {
      if (!pop.hidden && popItems.length) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); popSel = (popSel + (e.key === "ArrowDown" ? 1 : -1) + popItems.length) % popItems.length; updatePop(); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(popItems[popSel]); return; }
        if (e.key === "Escape") { pop.hidden = true; return; }
      }
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) pop.hidden = true; }, 120));
    // Pendant une réponse, Entrée ne fait rien ; seul le bouton (carré « arrêter ») interrompt.
    composer.onsubmit = (e) => { e.preventDefault(); if (!busy) ask(input.value); };
    sendBtn.onclick = (e) => { if (busy) { e.preventDefault(); busy.abort(); } };
    newBtn.onclick = () => { if (busy) return; st.current = null; renderList(); renderThread(); input.focus(); };

    renderList();
    renderThread();
    input.focus();
    // Question confiée par une autre page (« Expliquer avec Maestro ») : nouvelle conversation, envoyée tout de suite.
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem("master-maestro-ask") || "null"); localStorage.removeItem("master-maestro-ask"); } catch { /* ignoré */ }
    if (pending && pending.q && Date.now() - (pending.at || 0) < 120000) { st.current = null; ask(pending.q); }
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { maestro: viewMaestro });
})();
