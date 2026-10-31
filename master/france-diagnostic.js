/* Master — onglet « Diagnostic » de la rubrique France politique (france.js) : problèmes identifiés par les
   institutions non partisanes (accord, indicateurs, citations sourcées), leviers possibles (effet, délai, risques,
   gagnants et perdants, positions divergentes côte à côte), puis matrice candidats × leviers (sens et nombre de mesures
   par case, rattachement classé par IA) ou, à défaut, × problèmes ; sans note ni classement : chaque case renvoie aux
   mesures, et les mesures rattachées à aucun levier restent visibles par thème. Relevé par IA, non relu : affiché. */
(() => {
  "use strict";
  // Style neutre pour les trois degrés d'accord : une couleur verte ou orange se lirait comme bon ou mauvais.
  const ACCORD = { consensus: "consensus des institutions", majoritaire: "majoritaire", debattu: "débattu" };
  const DELAI = { court: "effet à court terme", moyen: "effet à moyen terme", long: "effet à long terme" };
  let U = null;

  function link(text, href) {
    if (typeof href !== "string" || !href.startsWith("https://")) return U.el("span", null, text);
    const a = U.el("a", "fr-link", text);
    a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
    return a;
  }
  function sources(list) {
    const box = U.el("div", "fr-sources");
    for (const s of list || []) {
      const d = U.el("details", "fr-source");
      const sum = U.el("summary");
      sum.append(link(`${s.institution || ""}${s.institution ? " · " : ""}${s.titre || "source"}`, s.url), document.createTextNode(s.date ? ` · ${s.date}` : ""));
      d.append(sum, U.el("blockquote", "fr-citation", s.citation || ""));
      box.append(d);
    }
    return box;
  }

  function levier(lv) {
    const c = U.el("article", "fr-mesure");
    const h = U.el("div", "fr-sujet-h");
    h.append(U.el("span", "fr-tag", DELAI[lv.delai] || lv.delai));
    c.append(h, U.el("p", "fr-resume", lv.titre), U.el("p", null, lv.description || ""));
    const dl = U.el("dl", "fr-dl");
    for (const [k, v] of [["Effet attendu", lv.effet], ["Risques", lv.risques], ["Gagnants et perdants", lv.gagnants_perdants]]) {
      if (v) dl.append(U.el("dt", null, k), U.el("dd", null, v));
    }
    c.append(dl);
    const manquantes = lv.positions_manquantes || [];
    if ((lv.positions || []).length || manquantes.length) {
      const pos = U.el("div", "fr-compare");
      for (const p of lv.positions || []) {
        const card = U.el("div", "fr-pos");
        card.append(U.el("p", "fr-resume", p.ecole), U.el("p", null, p.these), sources(p.sources));
        pos.append(card);
      }
      for (const m of manquantes) {  // position du débat pas encore sourcée : signalée, plutôt qu'absente
        const card = U.el("div", "fr-pos fr-pos-manquante");
        card.append(U.el("p", "fr-resume", m), U.el("p", "muted", "Position non sourcée dans ce relevé."));
        pos.append(card);
      }
      c.append(U.el("p", "muted", "Les positions divergent : présentées côte à côte, sans arbitrage."), pos);
    }
    c.append(sources(lv.sources));
    return c;
  }

  const ficheHref = (cid, mid) => `#france/candidats/${encodeURIComponent(cid)}${mid ? `/${encodeURIComponent(mid)}` : ""}`;
  const dossierHref = (cid, mid) => `#france/candidats/${encodeURIComponent(cid)}/mesure/${encodeURIComponent(mid)}`;
  const HORS = "hors";
  const SENS = { actionne: ["→", "dans le sens du levier"], inverse: ["←", "en sens contraire du levier"] };
  const themeLabel = (t) => ((window.MASTER_FRANCE_CANDIDATS || {}).THEMES || {})[t] || String(t || "autre").replace(/_/g, " ");

  function item(c, x, extra) {  // une mesure de la case : résumé cliquable jusqu'à la mesure, puis son dossier
    const li = U.el("li");
    const a = U.el("a", "fr-link", x.resume || x.mesure);
    a.href = ficheHref(c.id, x.mesure);
    const dz = U.el("a", "fr-link", "dossier");
    dz.href = dossierHref(c.id, x.mesure);
    li.append(a, U.el("span", "muted", ` · ${x.mesure}${extra ? ` · ${extra}` : ""} · `), dz);
    return li;
  }

  function matrix(d) {
    const m = d.matrice;
    const leviers = m.mode === "leviers";
    const labels = leviers
      ? Object.fromEntries(d.leviers.map((l) => [l.id, l.titre])) : Object.fromEntries(d.problemes.map((p) => [p.id, p.titre]));
    const problemes = Object.fromEntries(d.problemes.map((p) => [p.id, p.titre]));
    const horsLib = m.hors_libelle || "hors du périmètre du diagnostic";
    labels[HORS] = leviers ? "Mesures rattachées à aucun levier (hors levier)" : "Mesures hors du périmètre du diagnostic";
    const p = U.panel(leviers ? "Candidats × leviers" : "Candidats × problèmes",
      { sub: leviers
        ? `Chaque case compte les mesures qui actionnent le levier (→, dans son sens) ou vont en sens contraire (←) ; aucune note, aucun classement. La dernière colonne (« hors levier ») compte les mesures rattachées à aucun levier, regroupées par thème : une ligne vide ne veut pas dire « ne propose rien ».`
        : `${m.releve} Chaque case compte les mesures concernées ; aucune note, aucun classement. La dernière colonne compte les mesures qui ne touchent aucun des problèmes du diagnostic : une ligne vide ne veut pas dire « ne propose rien ».` });
    if (leviers) p.body.append(U.callout("ia", "Rapprochement classé par IA.", `${m.releve} : à vérifier mesure par mesure (justification affichée).`));
    const detail = U.el("div", "fr-matrix-detail");
    detail.setAttribute("aria-live", "polite");
    const wrap = U.el("div", "table-wrap fr-matrix-wrap");  // 26 leviers : défilement horizontal dans le panneau
    const t = U.el("table", "fr-matrix");
    const head = U.el("tr");
    head.append(U.el("th", null, "Candidat"));
    const cols = [...m.lignes, HORS];
    for (const r of cols) {
      const th = U.el("th", "fr-mx-h", r === HORS ? (leviers ? "hors levier" : "hors") : r);
      th.title = labels[r] || r; th.scope = "col"; th.setAttribute("aria-label", labels[r] || r);
      head.append(th);
    }
    t.append(head);
    const show = (c, r, items) => {
      detail.replaceChildren(U.el("p", "fr-resume", `${c.nom} — ${labels[r] || r}`));
      if (r === HORS && leviers) {  // repli par thème : la mesure n'actionne aucun levier, son thème est montré
        const byTheme = {};
        for (const x of items) (byTheme[x.theme] = byTheme[x.theme] || []).push(x);
        for (const [th, list] of Object.entries(byTheme)) {
          detail.append(U.el("h4", "fr-theme-h", `${themeLabel(th)} (${list.length})`));
          const ul = U.el("ul");
          for (const x of list) {
            const pb = (x.problemes || []).map((id) => `${id} ${problemes[id] || ""}`.trim());
            ul.append(item(c, x, pb.length ? `thème rattaché par la table au problème : ${pb.join(" ; ")}` : "thème hors des problèmes du diagnostic"));
          }
          detail.append(ul);
        }
        return;
      }
      if (leviers) {
        for (const sens of ["actionne", "inverse"]) {
          const list = items.filter((x) => x.sens === sens);
          if (!list.length) continue;
          detail.append(U.el("h4", "fr-theme-h", `${SENS[sens][0]} ${SENS[sens][1]} (${list.length})`));
          const ul = U.el("ul");
          for (const x of list) ul.append(item(c, x, x.justification ? `rapprochement (IA) : ${x.justification}` : ""));
          detail.append(ul);
        }
        return;
      }
      const ul = U.el("ul");
      for (const x of items) ul.append(item(c, x, ""));
      detail.append(ul);
    };
    const cellText = (r, items) => {
      if (!leviers || r === HORS) return String(items.length);
      return ["actionne", "inverse"].map((s) => [s, items.filter((x) => x.sens === s).length]).filter(([, n]) => n)
        .map(([s, n]) => `${SENS[s][0]}${n}`).join(" ");
    };
    const cellLabel = (c, r, items) => {
      const n = (k) => items.filter((x) => x.sens === k).length;
      const parts = leviers && r !== HORS
        ? [n("actionne") && `${n("actionne")} dans le sens du levier`, n("inverse") && `${n("inverse")} en sens contraire`].filter(Boolean).join(", ")
        : `${items.length} mesure${items.length > 1 ? "s" : ""}`;
      return `${c.nom}, ${labels[r] || r} : ${parts}`;
    };
    for (const c of d.candidats) {
      const tr = U.el("tr");
      const name = U.el("a", "fr-link", c.nom);
      name.href = ficheHref(c.id);
      const td0 = U.el("td");
      td0.append(name);
      tr.append(td0);
      for (const r of cols) {
        const items = (r === HORS ? (m.hors_perimetre || {})[c.id] : (m.cellules[c.id] || {})[r]) || [];
        const cls = `fr-mx${items.length ? " go" : " muted"}${r === HORS ? " fr-mx-hors" : ""}`;
        const td = U.el("td", cls, items.length ? cellText(r, items) : "·");
        if (items.length) {
          td.tabIndex = 0;
          td.setAttribute("role", "button");
          td.setAttribute("aria-label", cellLabel(c, r, items));
          td.onclick = () => show(c, r, items);
          td.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); show(c, r, items); } });
        }
        tr.append(td);
      }
      t.append(tr);
    }
    wrap.append(t);
    const legend = U.el("p", "muted fr-leg-note", cols.map((r) => `${r === HORS ? horsLib : r} : ${labels[r] || r}`).join(" · "));
    if (leviers) legend.prepend(document.createTextNode("→ n : mesures dans le sens du levier ; ← n : en sens contraire (une direction, pas un jugement). "));
    p.body.append(legend);
    const regles = Object.entries(m.regles || {});
    if (regles.length || (m.methode || []).length) {
      const det = U.el("details", "fr-source");
      det.append(U.el("summary", null, leviers ? "Méthode du rapprochement (identique pour tous les candidats)" : "Règles du rapprochement (identiques pour tous les candidats)"));
      const ul = U.el("ul");
      for (const x of m.methode || []) ul.append(U.el("li", null, x));
      for (const [r, g] of regles) {
        const parts = [];
        if ((g.themes || []).length) parts.push(`thèmes : ${g.themes.map((x) => x.replace(/_/g, " ")).join(", ")}`);
        for (const w of g.mots || []) parts.push(w);
        ul.append(U.el("li", null, `${r} — ${parts.join(" ; ") || "aucune règle"}`));
      }
      det.append(ul);
      p.body.append(det);
    }
    p.body.append(wrap, detail);
    return p.el;
  }

  function indicateurs(ids, dash) {
    const byId = Object.fromEntries(((dash || {}).indicators || []).map((i) => [i.id, i]));
    return ids.map((id) => {
      const i = byId[id];
      if (!i) return id;
      if (!i.latest) return `${i.label} : non disponible`;
      return `${i.label} : ${U.nf1.format(i.latest.value)} ${i.unit} (${U.dmy(i.latest.date)}${i.stale ? ", ancienne" : ""})`;
    }).join(" · ");
  }

  async function diagnostic(root) {
    U = window.MASTER_UI;
    const [d, dash] = await Promise.all([U.api("/api/france/diagnostic"), U.api("/api/france/indicateurs").catch(() => null)]);
    root.append(U.callout("ia", "Diagnostic relevé par IA.", `${d.releve} Aucun « il faut » : des constats, des leviers et leurs effets selon les sources.`));
    if (d.erreurs.length) root.append(U.callout("attention", "Entrées écartées :", d.erreurs.join(" · ")));
    for (const pb of d.problemes) {
      const p = U.panel(pb.titre, { sub: `Les faits (tableau de bord) : ${indicateurs(pb.indicateurs, dash) || "—"}` });
      p.el.classList.add("fr-probleme");
      p.head.append(U.status("neutral", ACCORD[pb.accord] || pb.accord));
      p.body.append(U.el("p", null, pb.constat), sources(pb.sources));
      const lv = d.leviers.filter((l) => l.probleme === pb.id);
      if (lv.length) {
        p.body.append(U.el("h3", "fr-theme-h", `Leviers possibles (${lv.length})`));
        for (const l of lv) p.body.append(levier(l));
      }
      root.append(p.el);
    }
    root.append(matrix(d));
  }
  window.MASTER_FRANCE_TABS = Object.assign(window.MASTER_FRANCE_TABS || {}, { diagnostic });
})();
