/* Master — onglet « Interroger » de la rubrique France politique (france.js) : questions à Maestro sur les programmes,
   avec les outils fr_* (portail local). Questions types identiques pour tous les candidats ; mode contradicteur sur une
   mesure (six questions fixes). Réponses d'IA, étiquetées et à vérifier ; rendu Markdown sûr (markdown.js). */
(() => {
  "use strict";
  const TYPES = [
    ["mesures", "Principales mesures", (c) => `Quelles sont les principales mesures de ${c.nom} ? Cite leur statut, leur date et leur source.`],
    ["financement", "Financement", (c) => `Comment le programme de ${c.nom} est-il financé, et que disent les chiffrages disponibles ?`],
    ["votes", "Votes", (c) => `Quels votes de ${c.nom} sur les scrutins marquants de l'Assemblée ? Si la personne n'est pas députée, dis-le.`],
    ["projection", "Projection", (c) => `Que donne la simulation de la trajectoire de la dette pour ${c.nom} (référence officielle) ? Rappelle ses limites.`],
  ];
  let U = null;

  const HISTORY = 10;  // derniers messages gardés (l'API en accepte 40)
  let busy = false;

  async function ask(question, out, history) {
    if (busy) return;
    busy = true;
    const steps = U.el("ul", "fr-steps");
    const answer = U.el("div", "fr-answer");
    out.prepend(U.el("p", "fr-q", question), steps, answer);
    try {
      const r = await fetch("/api/maestro", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }) });
      if (!r.ok) throw new Error(`Maestro : ${r.status}`);
      const reader = r.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "step") steps.append(U.el("li", "muted", ev.label));
          else if (ev.type === "answer") {
            answer.replaceChildren(window.MASTER_MD ? window.MASTER_MD.render(ev.text) : U.el("p", null, ev.text), U.aiNotice());
            history.push({ role: "user", content: question }, { role: "assistant", content: ev.text });
            history.splice(0, Math.max(0, history.length - HISTORY));
          } else if (ev.type === "error") answer.replaceChildren(U.callout("erreur", "Maestro indisponible.", ev.text));
        }
      }
      if (!answer.childElementCount) answer.replaceChildren(U.callout("attention", "Pas de réponse.", "Maestro n'a rien renvoyé ; reformulez ou réessayez."));
    } catch (e) {
      answer.replaceChildren(U.callout("erreur", "Impossible d'interroger Maestro.", e.message));
    } finally {
      busy = false;
    }
  }

  const MODES = [["maestro", "Maestro (IA)"], ["questions", "Questions (sans IA)"], ["tous", "Même question à tous (sans IA)"],
    ["grandes-questions", "Grandes questions"]];

  // Banc de neutralité (scripts/france_neutralite.py) : dernier passage réel, ou « jamais lancé ». Mesure le traitement
  // que Maestro réserve à chaque candidat (mêmes questions pour tous), jamais les candidats eux-mêmes.
  async function banc(body) {
    let d;
    try { d = await U.api("/api/france/neutralite"); } catch (e) { body.append(U.callout("erreur", "Banc indisponible.", e.message)); return; }
    const r = d.rapport;
    if (!r) { body.append(U.callout("info", d.message || "Banc jamais lancé.", "")); return; }
    const noms = Object.fromEntries((r.candidats || []).map((c) => [c.id, c.nom]));
    const v = r.verdict || {};
    const head = U.el("p", "fr-banc-verdict");
    head.append(U.status(v.ok ? "ok" : "warn", v.ok ? "Aucun écart au-delà des seuils" : `Banc non passé : ${v.motif || "écarts"}`),
      U.el("span", "muted", ` · passage du ${U.dmy(r.date)} · modèle ${r.modele || "non renseigné"} · ${r.fichier}`));
    const rows = Object.entries(v.metriques || {}).map(([k, m]) => ({ k, ...m }));
    const fmt = (x) => (x == null ? "—" : U.nf2.format(x));
    body.append(head, U.table(rows, [
      ["k", "Métrique", (k) => (r.libelles || {})[k] || k],
      ["k", "Seuil", (k) => (r.seuils_texte || {})[k] || "—"],
      ["mediane", "Médiane", fmt, "num"],
      ["ecart_max", "Écart max", fmt, "num"],
      ["hors_seuil", "Hors seuil", (h) => (h && h.length ? h.map((c) => noms[c] || c).join(", ") : "aucun")],
    ]));
    if (v.incomplets && v.incomplets.length) body.append(U.el("p", "muted", `Réponses manquantes ou en erreur : ${v.incomplets.map((c) => noms[c] || c).join(", ")}.`));
    body.append(U.el("p", "muted", "Un écart signale un traitement inégal de Maestro à examiner, pas une preuve de biais ; le banc ne note ni ne classe les candidats."));
  }

  async function interroger(root) {
    U = window.MASTER_UI;
    // Modes sans IA : france-explorer.js (questions, même question à tous) et france-grandes-questions.js ; par défaut en
    // ligne, où Maestro n'a pas les outils fr_*.
    const X = window.MASTER_FRANCE_EXPLORER, G = window.MASTER_FRANCE_GQ;
    const [, , asked, qid, cid] = location.hash.slice(1).split("/").map((x) => { try { return decodeURIComponent(x); } catch (e) { return ""; } });
    const sansIA = ["questions", "tous", "grandes-questions"].filter((m) => (m === "grandes-questions" ? G : X));
    const mode = X && (sansIA.includes(asked) || (window.MASTER_STATIC && asked !== "maestro")) ? (sansIA.includes(asked) ? asked : "questions") : "maestro";
    if (X) root.append(U.seg(MODES.filter(([v]) => v === "maestro" || sansIA.includes(v)), mode, (v) => { location.hash = `#france/interroger/${v}`; }, "Mode"));
    if (mode === "questions") return X.questions(root);
    if (mode === "tous") return X.tous(root);
    if (mode === "grandes-questions") return G.vue(root, qid, cid);
    if (window.MASTER_STATIC) {
      root.append(U.callout("info", "Portail local seulement.", "Les outils « France politique » de Maestro tournent sur le portail local. En ligne, Maestro répond avec les données publiées, sans ces outils."));
      return;
    }
    let reg;
    try { reg = await U.api("/api/france/candidats"); } catch (e) { root.append(U.callout("erreur", "Registre indisponible.", e.message)); return; }
    if (!reg.candidats.length) { root.append(U.callout("info", "Aucun candidat enregistré.", "")); return; }
    root.append(U.callout("ia", "Réponses d'IA, à vérifier.", "Maestro répond avec les données du portail (programmes relevés par IA et non relus, indicateurs, votes, sondages, projections) et cite ses sources. Les mêmes questions types sont proposées pour tous les candidats."));
    const bp = U.panel("Banc de neutralité", { sub: "Mêmes questions pour chaque candidat ; écarts de traitement de Maestro mesurés hors ligne." });
    bp.el.classList.add("fr-banc");
    root.append(bp.el);
    banc(bp.body);  // sans attendre : le reste de l'onglet ne dépend pas du banc
    const controls = U.el("div", "fr-controls");
    const csel = U.el("select", "fr-select");
    csel.setAttribute("aria-label", "Candidat");
    for (const c of reg.candidats) csel.append(new Option(c.nom, c.id));
    const msel = U.el("select", "fr-select");
    msel.setAttribute("aria-label", "Mesure");
    controls.append(csel, msel);
    const buttons = U.el("div", "fr-tags");
    const free = U.el("form", "fr-ask");
    const input = U.el("input", "fr-input");
    input.type = "text"; input.maxLength = 2000; input.placeholder = "Votre question sur ce candidat ou sur la politique française…";
    const send = U.el("button", null, "Demander");
    send.type = "submit";
    free.append(input, send);
    const out = U.el("div", "fr-chat");
    const history = [];
    const cur = () => reg.candidats.find((c) => c.id === csel.value) || reg.candidats[0];
    let loadSeq = 0;
    const loadMeasures = async () => {
      const seq = ++loadSeq, cid = csel.value;
      msel.replaceChildren(new Option("Mode contradicteur : choisir une mesure", ""));
      try {
        const f = await U.api(`/api/france/candidat/${encodeURIComponent(cid)}`);
        if (seq !== loadSeq) return;  // un autre candidat a été choisi entre-temps
        for (const m of f.mesures) msel.append(new Option(`${m.id} · ${m.resume.slice(0, 90)}`, m.id));
      } catch (e) { /* fiche indisponible : pas de mode contradicteur */ }
    };
    csel.onchange = () => { history.length = 0; out.replaceChildren(); loadMeasures(); };  // nouvelle conversation par candidat
    msel.onchange = () => {
      if (!msel.value) return;
      const c = cur();
      ask(`Mode contradicteur sur la mesure ${msel.value} de ${c.nom} (outil fr_contradicteur, candidat ${c.id}, mesure ${msel.value}). Pose les six questions et réponds avec les données.`, out, history);
    };
    for (const [, label, make] of TYPES) {
      const b = U.el("button", "fr-leg", label);
      b.type = "button";
      b.onclick = () => ask(make(cur()), out, history);
      buttons.append(b);
    }
    free.onsubmit = (ev) => { ev.preventDefault(); const q = input.value.trim(); if (q) { input.value = ""; ask(q, out, history); } };
    root.append(controls, buttons, free, out);
    await loadMeasures();
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { interroger });
})();
