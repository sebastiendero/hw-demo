/* Master — Prévisions à plusieurs acteurs (l'« OI Forecast » d'OSIRIS) : poser une question fermée, Maestro met en scène
 * les acteurs, joue quatre mondes possibles et rend une probabilité calibrée, confrontée à la fréquence de base et aux
 * marchés de prédiction. Données : /api/previsions (master/forecast.py). Lancement à la demande (appels au modèle).
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const IDEAS = ["Le détroit d'Ormuz retrouvera-t-il 50 % de son trafic normal d'ici 60 jours ?", "Un cessez-le-feu sera-t-il signé entre la Russie et l'Ukraine d'ici fin 2026 ?",
    "Le Brent dépassera-t-il 130 $ d'ici 30 jours ?", "Les Houthis attaqueront-ils un navire en mer Rouge dans les 14 prochains jours ?"];
  const pct = (x) => `${Math.round(x * 100)} %`;

  async function viewPrevisions(root) {
    const ui = U();
    const { el, api } = ui;
    const d = await api("/api/previsions").catch(() => ({ forecasts: [], running: [] }));
    root.append(ui.pageHead({ crumbs: ["Veille", "Prévisions"], title: "Prévisions",
      sub: "Une question fermée, une probabilité : Maestro met en scène les acteurs, joue quatre mondes possibles, puis calibre sur la fréquence de base et les marchés de prédiction." }));
    if (!window.MASTER_STATIC) {
      const p = ui.panel("Nouvelle prévision", { sub: "Trois appels au modèle de Maestro (payants si OpenAI est configuré) ; une à deux minutes." });
      const f = el("form", "rap-form");
      const q = el("input"); q.placeholder = "Question fermée : « Est-ce que … d'ici … ? »"; q.maxLength = 300; q.setAttribute("aria-label", "Question");
      const h = el("select"); h.setAttribute("aria-label", "Échéance");
      for (const [v, l] of [[7, "7 jours"], [14, "14 jours"], [30, "30 jours"], [60, "60 jours"], [90, "90 jours"], [180, "6 mois"], [365, "1 an"]]) { const o = el("option", null, l); o.value = String(v); o.selected = v === 30; h.append(o); }
      const go = el("button", "primary", "Prévoir"); go.type = "submit";
      const msg = el("p", "muted", (d.running || []).length ? `En cours : ${d.running.join(" ; ")}` : "");
      const ideas = el("div", "rap-ideas");
      for (const i of IDEAS) { const b = el("button", "rap-idea", i); b.type = "button"; b.onclick = () => { q.value = i; q.focus(); }; ideas.append(b); }
      f.append(q, h, go, ideas, msg);
      f.onsubmit = async (e) => {
        e.preventDefault();
        go.disabled = true; msg.textContent = "Prévision en cours (une à deux minutes)…";
        try {
          const r = await fetch("/api/previsions", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: q.value.trim(), horizon_days: Number(h.value) }) });
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || r.status);
          poll();
        } catch (err) { msg.textContent = String(err.message || err); go.disabled = false; }
      };
      p.body.append(f);
      root.append(p.el);
    }
    const list = el("div", "pv-list");
    root.append(list);
    for (const n of d.forecasts) {
      const x = n.data || {};
      const c = el("details", "card pv-card");
      const s = el("summary", "pv-sum");
      const g = el("div", "pr-gauge pv-g"); const i = el("i"); i.style.width = pct(x.probability || 0); g.append(i);
      s.append(el("b", "pv-p", pct(x.probability || 0)), el("span", "pv-q", x.question), el("span", "muted", `échéance ${ui.dmy(x.deadline)} · faite le ${ui.dmy(n.date)}`), g);
      c.append(s);
      const body = el("div", "pv-body");
      body.append(el("p", null, n.body || ""));
      const dl = el("dl", "pv-dl");
      const add = (k, v) => { if (v) dl.append(el("dt", null, k), el("dd", null, v)); };
      add("Fourchette", (x.range || []).length === 2 ? `${pct(x.range[0])} à ${pct(x.range[1])}` : null);
      add("Fréquence de base", x.base_rate && x.base_rate.valeur != null ? `${pct(x.base_rate.valeur)} · ${x.base_rate.raisonnement || ""}` : null);
      add("Mondes simulés", x.worlds_probability != null ? `${pct(x.worlds_probability)} des mondes (pondérés) finissent par « oui »` : null);
      add("Marchés", x.market_comparison);
      body.append(dl);
      if ((x.actors || []).length) { body.append(el("h3", null, "Les acteurs")); for (const a of x.actors) body.append(el("p", "pv-li", `${a.nom} — veut : ${a.but} ; leviers : ${a.leviers}`)); }
      if ((x.worlds || []).length) {
        body.append(el("h3", null, "Les mondes joués"));
        for (const w of x.worlds) { const r = el("p", "pv-li"); r.append(el("b", null, `${w.nom} (${pct(w.poids || 0)}, ${w.issue}) : `), document.createTextNode(w.recit || "")); body.append(r); }
      }
      if ((x.drivers || []).length) { body.append(el("h3", null, "Ce qui pèse")); for (const t of x.drivers) body.append(el("p", "pv-li", `• ${t}`)); }
      if ((x.would_change || []).length) { body.append(el("h3", null, "Ce qui ferait changer d'avis")); for (const t of x.would_change) body.append(el("p", "pv-li", `• ${t}`)); }
      body.append(el("p", "suj-ai", x.disclaimer || ""));
      c.append(body);
      list.append(c);
    }
    if (!d.forecasts.length) list.append(el("p", "muted", "Pas encore de prévision."));
    let t = null;
    function poll() {
      clearInterval(t);
      t = setInterval(async () => {
        if (!root.isConnected) { clearInterval(t); return; }
        const x = await api("/api/previsions").catch(() => null);
        if (x && !(x.running || []).length) { clearInterval(t); window.dispatchEvent(new HashChangeEvent("hashchange")); }
      }, 8000);
    }
    if ((d.running || []).length) poll();
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { previsions: viewPrevisions });
})();
