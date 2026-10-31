/* Master — rubrique « Synthèse » : la synthèse du matin (aussi envoyée sur Telegram). Lecture seule, aussi en ligne.
   Chaque phrase est fabriquée à partir des données et reliée à elles ; un chiffre non retrouvé dans les données est signalé. */
(() => {
  "use strict";
  const LINK = { note: ["recherche", "note"], forecast: ["recherche", "prévision"], series: ["recherche", "série"],
    price: ["marches", "cours"], source: ["sources", "source"], strategy: ["strategies", "stratégie"], events: ["evenements", "événements"] };

  function refLinks(U, refs, events) {
    const box = U.el("span", "muted");
    const seen = new Set();
    for (const r of refs || []) {
      if (r.kind === "event") {
        const e = events[r.id];
        if (!e) continue;
        const a = U.el("a", null, "événement");
        a.href = "#"; a.onclick = (ev) => { ev.preventDefault(); U.openEvent(e); };
        box.append(document.createTextNode(" · "), a);
        continue;
      }
      const [view, label] = LINK[r.kind] || [];
      if (!view || seen.has(view + label)) continue;
      seen.add(view + label);
      const a = U.el("a", null, label);
      a.href = `#${view}`;
      box.append(document.createTextNode(" · "), a);
    }
    return box;
  }

  async function viewSynthese(root) {
    const U = window.MASTER_UI;
    const d = await U.api("/api/digest");
    const when = d.preview ? "aperçu calculé maintenant" : `établie le ${U.dmyhm(d.generated_at)} UTC`;
    root.append(U.pageHead({ crumbs: ["Veille", "Synthèse"], title: `Synthèse du ${U.dmy(d.day)}`, when,
      sub: "Ormuz, cours, avis d'IA et leurs désaccords, stratégies et robot. Chaque phrase vient des données du portail ; aucune n'est rédigée par une IA." }));
    if (d.flags.length) {
      root.append(U.callout("erreur", "Chiffres non retrouvés dans les données :",
        d.flags.map((f) => `${f.numbers.join(", ")} (${f.section})`).join(" ; ")));
    } else {
      root.append(U.callout("info", "Contrôle :", "chaque chiffre cité a été retrouvé dans les données de sa phrase."));
    }
    let events = {};
    try {
      const since = new Date(new Date(d.generated_at).getTime() - 36 * 3600e3).toISOString();
      events = Object.fromEntries((await U.api(`/api/events?since=${encodeURIComponent(since)}&limit=1000`)).map((e) => [e.id, e]));
    } catch (_) { /* liens vers les événements absents : le reste s'affiche */ }
    for (const sec of d.sections) {
      const p = U.panel(sec.title);
      const list = U.el("ul", "digest");
      for (const s of sec.sentences) {
        const li = U.el("li");
        if (s.level && s.level !== "declaration") li.append(U.badge(s.level), document.createTextNode(" "));
        if (s.ai) li.append(U.status("neutral", "IA"), document.createTextNode(" "));
        li.append(document.createTextNode(s.text));
        if (s.quote) li.append(document.createTextNode(" "), U.el("q", null, s.quote));
        li.append(refLinks(U, s.refs, events));
        list.append(li);
      }
      p.body.append(list);
      if (sec.key === "avis") p.body.append(U.aiNotice());
      root.append(p.el);
    }
    root.append(U.el("p", "muted", d.disclaimer));
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { synthese: viewSynthese });
})();
