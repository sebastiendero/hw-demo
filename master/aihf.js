/* Master — carte « Personnages (ai-hedge-fund) » de la rubrique Recherche IA (fichier à part, comme strategies.js).
 *
 * Cinq personnages du projet ai-hedge-fund (code d'origine) lisent les comptes annuels déposés à la SEC ; leur avis
 * est indicatif et ne vote pas dans la concordance. Tout texte venant du modèle passe par textContent.
 */
(() => {
  "use strict";
  const ORDER = ["buffett", "graham", "munger", "lynch", "druckenmiller"];
  const ARROW = { achat: "▲", vente: "▼", neutre: "—", abstention: "·" };

  function card(root, r, H) {
    const U = window.MASTER_UI;
    const notes = (r.aihf || []).slice().sort((a, b) => ORDER.indexOf(a.data.persona) - ORDER.indexOf(b.data.persona));
    const first = notes[0];
    const filed = first && first.data.filed ? ` · comptes déposés le ${U.dmy(first.data.filed)}` : "";
    const c = H.aiCard("Personnages (ai-hedge-fund)",
      first ? `${first.model || "modèle ?"}${filed} · vu le ${U.dmy(first.date)}` : "Buffett, Graham, Munger, Lynch, Druckenmiller");
    c.el.classList.add("aihf-card");
    if (!notes.length) {
      c.body.append(U.el("p", "muted", "Pas encore d'avis : une fois par jour, pour Frontline, DHT et TotalEnergies, "
        + "à partir des comptes annuels publiés à la SEC."));
      c.foot.remove();
      root.append(c.el);
      return;
    }
    const count = {};
    for (const n of notes) count[n.stance] = (count[n.stance] || 0) + 1;
    c.body.append(U.el("p", "summary", ["achat", "neutre", "vente", "abstention"].filter((k) => count[k])
      .map((k) => `${count[k]} ${k}`).join(" · ") + " (indicatif, ne vote pas dans la concordance)"));
    const list = U.el("div", "aihf-list");
    for (const n of notes) {
      const row = U.el("button", "aihf-row");
      row.type = "button";
      const dir = H.STANCE_DIR[n.stance] || 0;
      row.append(U.el("span", "aihf-who", n.data.persona_name || n.data.persona),
        U.el("span", `aihf-stance ${dir > 0 ? "up" : dir < 0 ? "down" : ""}`, `${ARROW[n.stance] || ""} ${n.stance}`),
        U.el("span", "muted", n.data.confidence == null ? (n.stance === "abstention" ? n.summary.split(", ").slice(1).join(", ") : "")
          : `confiance ${U.nf0.format(n.data.confidence)} %`));
      row.onclick = () => {
        const extra = U.el("div");
        extra.append(U.el("p", "summary", n.summary));
        if (n.body) extra.append(U.el("p", "muted", "Raisonnement du personnage, tel que rendu par le modèle (en anglais) :"));
        if (n.data.snapshot) {
          const d = U.el("details");
          d.append(U.el("summary", null, "Données lues par le personnage (comptes SEC tels que publiés)"), U.el("pre", "note-body", n.data.snapshot));
          extra.append(d);
        }
        H.openNote(n, extra);
      };
      list.append(row);
    }
    c.body.append(list);
    c.foot.append(U.el("span", "muted", "Contrôle : non vérifié automatiquement ; les chiffres cités se comparent aux données lues."));
    root.append(c.el);
  }

  window.MASTER_RESEARCH_EXTRAS = [...(window.MASTER_RESEARCH_EXTRAS || []), card];
})();
