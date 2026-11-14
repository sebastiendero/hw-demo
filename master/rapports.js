/* Master — Rapports de situation (les « AI Situation Reports » de SitDeck) : des sujets suivis, un rapport rédigé chaque
 * jour à l'heure choisie par Maestro (trois passes sur les données du portail), envoyé sur Telegram si demandé.
 * Données : /api/sitreps (master/sitreps.py). Rapports mis en forme par markdown.js (textContent seulement).
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const IDEAS = ["Détroit d'Ormuz et pétrole", "Mer Rouge et Houthis", "Guerre en Ukraine", "Iran et Israël", "Taïwan et mer de Chine", "Soudan"];

  async function send(method, path, body) {
    const r = await fetch(path, { method, credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { let m = `${r.status}`; try { m = (await r.json()).detail || m; } catch { /* */ } throw new Error(m); }
    return r.status === 204 ? null : r.json();
  }

  async function viewRapports(root) {
    const ui = U();
    const { el, api } = ui;
    const d = await api("/api/sitreps").catch(() => ({ topics: [], reports: [], running: [] }));
    root.append(ui.pageHead({ crumbs: ["Veille", "Rapports"], title: "Rapports de situation",
      sub: "Choisir des sujets : chaque jour à l'heure dite, Maestro parcourt les données du portail en trois passes et rédige un rapport (et l'envoie sur Telegram si demandé)." }));
    const grid = el("div", "rap-grid");
    root.append(grid);

    // ---- sujets suivis
    const tp = ui.panel("Sujets suivis", { sub: "Chaque rapport appelle le modèle de Maestro (quelques appels payants si OpenAI est configuré)." });
    const list = el("div", "rap-topics");
    for (const t of d.topics) {
      const row = el("div", "rap-topic");
      const running = (d.running || []).includes(t.id);
      const info = el("div");
      info.append(el("b", null, t.topic), el("span", "muted", `chaque jour à ${String(t.hour_utc).padStart(2, "0")}:00 UTC${(t.channels || []).includes("telegram") ? " · Telegram" : ""}${t.enabled ? "" : " · en pause"}`));
      const now = el("button", "btn", running ? "En cours…" : "Rédiger maintenant"); now.type = "button"; now.disabled = running || !!window.MASTER_STATIC;
      now.onclick = async () => { now.disabled = true; now.textContent = "En cours… (1 à 2 min)"; try { await send("POST", `/api/sitreps/${encodeURIComponent(t.id)}/run`); poll(); } catch (e) { now.textContent = e.message; } };
      const del = el("button", "link", "Supprimer"); del.type = "button"; del.disabled = !!window.MASTER_STATIC;
      del.onclick = async () => { await send("DELETE", `/api/sitreps/${encodeURIComponent(t.id)}`); window.dispatchEvent(new HashChangeEvent("hashchange")); };
      row.append(info, now, del);
      list.append(row);
    }
    if (!d.topics.length) list.append(el("p", "muted", "Aucun sujet suivi pour l'instant."));
    tp.body.append(list);
    if (!window.MASTER_STATIC) {
      const f = el("form", "rap-form");
      const topic = el("input"); topic.placeholder = "Sujet, par exemple : Mer Rouge et Houthis"; topic.maxLength = 160; topic.setAttribute("aria-label", "Sujet");
      const hour = el("select"); hour.setAttribute("aria-label", "Heure (UTC)");
      for (let h = 0; h < 24; h++) { const o = el("option", null, `${String(h).padStart(2, "0")}:00 UTC`); o.value = String(h); o.selected = h === 6; hour.append(o); }
      const tg = el("label", "chk"); const c = el("input"); c.type = "checkbox"; tg.append(c, document.createTextNode("Envoyer sur Telegram"));
      const add = el("button", "primary", "Suivre ce sujet"); add.type = "submit";
      const msg = el("p", "muted");
      const ideas = el("div", "rap-ideas");
      for (const i of IDEAS) { const b = el("button", "rap-idea", i); b.type = "button"; b.onclick = () => { topic.value = i; topic.focus(); }; ideas.append(b); }
      f.append(topic, hour, tg, add, ideas, msg);
      f.onsubmit = async (e) => {
        e.preventDefault();
        try { await send("POST", "/api/sitreps", { topic: topic.value.trim(), hour_utc: Number(hour.value), channels: c.checked ? ["telegram"] : [] }); window.dispatchEvent(new HashChangeEvent("hashchange")); }
        catch (err) { msg.textContent = err.message; }
      };
      tp.body.append(f);
    }
    grid.append(tp.el);

    // ---- rapports
    const rp = ui.panel("Rapports", { sub: `${d.reports.length} rapport${d.reports.length > 1 ? "s" : ""}` });
    const reader = el("div", "rap-reader");
    const items = el("div", "rap-list");
    const open = (n) => {
      reader.replaceChildren(el("span", "muted", `${n.summary} · ${ui.dmyhm(n.created_at)} UTC`));
      const body = el("div", "rap-body md");
      body.append(window.MASTER_MD ? window.MASTER_MD.render(n.body || "") : document.createTextNode(n.body || ""));
      reader.append(body);
      if (n.data && (n.data.steps || []).length) { const det = el("details"); det.append(el("summary", null, `Données consultées · ${n.data.steps.length}`)); for (const s of n.data.steps) det.append(el("p", "muted", s)); reader.append(det); }
      reader.append(ui.aiNotice());
      for (const x of items.children) x.classList.toggle("on", x.dataset.id === n.id);
    };
    for (const n of d.reports) {
      const b = el("button", "rap-item"); b.type = "button"; b.dataset.id = n.id;
      b.append(el("b", null, n.summary), el("span", "muted", ui.dmyhm(n.created_at)));
      b.onclick = () => open(n);
      items.append(b);
    }
    if (!d.reports.length) items.append(el("p", "muted", "Pas encore de rapport : suivre un sujet, puis « Rédiger maintenant »."));
    const split = el("div", "rap-split"); split.append(items, reader);
    rp.body.append(split);
    grid.append(rp.el);
    if (d.reports[0]) open(d.reports[0]);

    let timer = null;
    function poll() {
      clearInterval(timer);
      timer = setInterval(async () => {
        if (!root.isConnected) { clearInterval(timer); return; }
        const x = await api("/api/sitreps").catch(() => null);
        if (x && !(x.running || []).length) { clearInterval(timer); window.dispatchEvent(new HashChangeEvent("hashchange")); }
      }, 8000);
    }
    if ((d.running || []).length) poll();
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { rapports: viewRapports });
})();
