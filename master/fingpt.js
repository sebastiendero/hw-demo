/* Master — carte « Ton des titres selon FinGPT » de la rubrique Recherche IA (fichier à part, comme aihf.js).
 *
 * Troisième avis sur le ton des titres d'Ormuz : l'adaptateur officiel de FinGPT sur Llama 3 8B, en local. Indicatif, ne
 * vote pas : son accord avec qwen3 et sa précision mesurée sont affichés à côté. Texte affiché par textContent.
 */
(() => {
  "use strict";

  function card(root, r, H) {
    const U = window.MASTER_UI;
    const tone = r.tone_fingpt || [];
    const ev = r.fingpt_eval && r.fingpt_eval.data;
    const ag = r.fingpt_agreement;
    const c = H.aiCard("Ton des titres selon FinGPT", "troisième avis · adaptateur officiel FinGPT sur Llama 3 8B, local");
    c.el.classList.add("aihf-card");
    if (!tone.length) {
      c.body.append(U.el("p", "muted", "Pas encore de titres classés (toutes les 6 heures)."));
    } else {
      const [d, v] = tone[tone.length - 1];
      c.body.append(H.verdict(v > 0.1 ? 1 : v < -0.1 ? -1 : 0, `${v > 0 ? "+" : ""}${U.nf2.format(v)}`,
        U.el("span", "muted", `le ${U.dmy(d)} · indice de −1 à +1`)));
    }
    c.body.append(H.facts([
      ["Accord avec qwen3", ag && ag.rate != null ? `${U.nf0.format(ag.rate * 100)} % (${ag.n} titres)` : null],
      ["Précision mesurée", ev && ev.accuracy != null ? `${U.nf0.format(ev.accuracy * 100)} % (${ev.n} titres TFNS)` : null],
    ]));
    // Explication tirée des données : FinGPT a appris sur l'actualité des entreprises.
    const m = (ag && ag.matrix) || {};
    const negQwen = Object.entries(m).filter(([k]) => k.startsWith("negative/")).reduce((s, [, n]) => s + n, 0);
    const negToNeutral = m["negative/neutral"] || 0;
    if (negQwen && negToNeutral / negQwen >= 0.5) {
      c.body.append(U.el("p", "summary", `Sur ${negQwen} titres jugés négatifs par qwen3, FinGPT en classe ${negToNeutral} neutres : `
        + "entraîné sur l'actualité des entreprises, il voit souvent un événement géopolitique (navires touchés, menaces) comme neutre."));
    }
    if (ev) c.body.append(U.el("p", "muted", "Précision probablement flatteuse : FinGPT a été entraîné sur des titres du même jeu de données (TFNS)."));
    c.foot.append(U.el("span", "muted", "Indicatif, ne vote pas dans la concordance."));
    root.append(c.el);
  }

  window.MASTER_RESEARCH_EXTRAS = [...(window.MASTER_RESEARCH_EXTRAS || []), card];
})();
