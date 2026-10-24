/* Master — rubrique « Agents » : chaque agent et chaque modèle, son rôle, sa dernière exécution, sa fiabilité mesurée
   et sa santé. Lecture seule, aussi en ligne. Les chiffres viennent des mesures enregistrées ; une mesure absente est
   affichée absente. */
(() => {
  "use strict";
  const KIND = { ia: "IA", robot: "Robot", verification: "Vérification" };
  const LEVEL = { bonne: ["ok", "Bonne"], moyenne: ["warn", "Moyenne"], faible: ["bad", "Faible"],
    accord: ["neutral", "Accord"], absente: ["neutral", "Pas encore mesurée"], non_mesuree: ["neutral", "Non mesurée"] };

  function reliability(U, r) {
    const box = U.el("div");
    const [kind, label] = LEVEL[r.level] || LEVEL.absente;
    const head = U.el("div");
    head.append(U.status(kind, r.value == null ? label : `${label} · ${Math.round(r.value * 100)} %`));
    if (r.n) head.append(U.el("span", "muted", ` sur ${U.nf0.format(r.n)}`));
    box.append(head, U.el("div", "muted", r.measure + (r.date ? ` · ${U.dmy(r.date)}` : "")));
    if (r.caveat) box.append(U.el("div", "muted", r.caveat));
    return box;
  }

  function health(U, h) {
    const box = U.el("div");
    box.append(U.status(h.state, h.label || "—"));
    if (h.error) box.append(U.el("div", "muted", h.error));
    if (h.shared) box.append(U.el("div", "muted", h.shared));
    return box;
  }

  async function viewAgents(root) {
    const U = window.MASTER_UI;
    const r = await U.api("/api/agents");
    const bad = r.agents.filter((a) => a.health.state === "bad").length;
    const measured = r.agents.filter((a) => a.reliability.value != null).length;
    root.append(U.pageHead({ crumbs: ["Système", "Agents"], title: "Agents",
      sub: "Chaque agent et chaque modèle du Master : son rôle, sa dernière exécution, sa fiabilité mesurée et son état. Les niveaux viennent de tests enregistrés ; rien n'est estimé." }));
    const kpis = U.el("div", "kpis");
    kpis.append(U.kpi({ label: "Agents", icon: "bot", value: String(r.agents.length) }),
      U.kpi({ label: "Fiabilité mesurée", icon: "gauge", value: String(measured), unit: ` / ${r.agents.length}` }),
      U.kpi({ label: "En erreur", icon: "circle-alert", value: String(bad), tone: bad ? "bad" : null }));
    root.append(kpis, U.aiNotice());

    const p = U.panel("Agents", { sub: "Heures en UTC. « Cohérence » : la note se tient (sens, entrée, stop, objectif) ; ce n'est pas la justesse de l'avis." });
    p.body.append(U.table(r.agents, [
      ["name", "Agent", (v, a) => { const b = U.el("div"); b.append(U.el("b", null, v), U.el("div", "muted", `${KIND[a.kind] || a.kind} · ${a.role}`)); return b; }],
      ["models", "Modèle", (v) => (v.length ? v.join(", ") : "règles fixes")],
      ["last_run", "Dernière exécution", (v, a) => { const b = U.el("div", null, v ? U.dmyhm(v) : "jamais"); if (a.schedule) b.append(U.el("div", "muted", a.schedule)); return b; }],
      ["reliability", "Fiabilité mesurée", (v) => reliability(U, v)],
      ["health", "État", (v) => health(U, v)],
    ]));
    root.append(p.el);

    const m = U.panel("Modèles", { sub: "Un modèle sert plusieurs agents : ses mesures sont celles des agents qui l'emploient. État : celui du service qui le fait tourner." });
    const name = Object.fromEntries(r.agents.map((a) => [a.id, a.name]));
    m.body.append(U.table(r.models, [
      ["model", "Modèle", (v) => U.el("b", null, v)],
      ["agents", "Employé par", (v) => v.map((id) => name[id] || id).join(", ")],
      ["measures", "Mesures", (v) => {
        if (!v.length) return "pas encore mesuré";
        const b = U.el("div");
        for (const x of v) b.append(U.el("div", null, `${name[x.agent] || x.agent} : ${Math.round(x.value * 100)} % · ${x.measure}`));
        return b;
      }],
      ["health", "État", (v, x) => health(U, { state: v, label: { ok: "en marche", bad: "en erreur", warn: "en retard", neutral: "jamais noté" }[v], error: x.error })],
    ]));
    root.append(m.el);
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { agents: viewAgents });
})();
