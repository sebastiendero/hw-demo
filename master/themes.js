/* Master — rubrique « Thèmes et desks » : chaque thème suivi (énergie, macro, géopolitique…), ses événements des
   7 derniers jours, ses instruments et les desks qui le couvrent. Lecture seule, aussi en ligne. Un cours ou un
   événement absent est affiché absent ; rien n'est estimé. */
(() => {
  "use strict";
  const DESK_STATUS = { actif: ["ok", "actif"], prévu: ["neutral", "prévu"] };

  const deskStatus = (U, d) => U.status(...(DESK_STATUS[d.status] || ["neutral", d.status]));
  const plural = (n, one, many) => `${U.nf0.format(n)} ${n > 1 ? many : one}`;
  // Compte exact des 7 derniers jours (la liste reçue est plafonnée) ; à défaut, la longueur de la liste.
  const count7d = (d) => (Number.isFinite(d.events_count_7d) ? d.events_count_7d : d.events.length);
  let U = null;

  function price(i) {
    if (!i.last) return "cours absent";
    return `${U.nf2.format(i.last.close)} ${i.currency} · ${U.dmy(i.last.date)}`;
  }

  function deskLine(d, link) {
    const row = U.el("div", "th-row");
    if (link) {
      const a = U.el("a", null, d.label);
      a.href = `#desks/${d.id}`;
      row.append(a);
    } else {
      row.append(U.el("span", null, d.label));
    }
    row.append(deskStatus(U, d));
    return row;
  }

  function themeCard(d) {
    const c = U.el("section", "card th-card");
    const h = U.el("div", "card-h");
    const t = U.el("div");
    const a = U.el("a", "th-title", d.theme.label);
    a.href = `#themes/${d.theme.id}`;
    const h2 = U.el("h2");
    h2.append(a);
    t.append(h2, U.el("div", "muted", d.theme.description));
    h.append(t);
    const b = U.el("div", "card-b");
    const count = U.el("div");
    if (d.unavailable) {  // lecture échouée : on le dit, on ne la prend pas pour « zéro événement »
      count.append(U.el("div", "th-count muted", "indisponible"), U.el("div", "muted", "les données de ce thème n'ont pas pu être lues"));
    } else {
      count.append(U.el("div", "th-count", plural(count7d(d), "événement", "événements")), U.el("div", "muted", "sur les 7 derniers jours"));
    }
    b.append(count);
    const inst = U.el("div");
    inst.append(U.el("div", "th-h", "Instruments"));
    if (d.unavailable) inst.append(U.el("div", "muted", "indisponible"));
    else inst.append(U.el("div", d.instruments.length ? null : "muted",
      d.instruments.length ? d.instruments.map((i) => i.label).join(", ") : "aucun instrument"));
    const desks = U.el("div");
    desks.append(U.el("div", "th-h", "Desks"));
    if (d.desks.length) for (const x of d.desks) desks.append(deskLine(x, false));
    else desks.append(U.el("div", "muted", "aucun desk"));
    b.append(inst, desks);
    c.append(h, b);
    return c;
  }

  async function viewList(root) {
    const all = await U.api("/api/themes");
    const details = await Promise.all(all.themes.map((t) =>
      U.api(`/api/themes/${t.id}`).catch(() => ({ theme: t, unavailable: true, events: [], instruments: [], desks: all.desks.filter((d) => d.themes.includes(t.id)) }))));
    const failed = details.filter((d) => d.unavailable).length;
    const active = all.desks.filter((d) => d.status === "actif").length;
    root.append(U.pageHead({ crumbs: ["Veille", "Thèmes et desks"], title: "Thèmes et desks",
      sub: "Les sujets que le Master suit et les équipes d'agents (desks) qui les couvrent. Un desk « prévu » n'est pas encore en marche." }));
    const kpis = U.el("div", "kpis");
    kpis.append(U.kpi({ label: "Thèmes", icon: "layers", value: String(all.themes.length) }),
      U.kpi({ label: "Desks actifs", icon: "bot", value: String(active), unit: ` / ${all.desks.length}` }),
      U.kpi({ label: "Événements (7 j)", icon: "list", value: U.nf0.format(details.reduce((s, d) => s + count7d(d), 0)),
        ctx: failed ? `total partiel : ${plural(failed, "thème indisponible", "thèmes indisponibles")}` : null, tone: failed ? "warn" : null }));
    root.append(kpis);
    const grid = U.el("div", "th-grid");
    for (const d of details) grid.append(themeCard(d));
    root.append(grid);
    const unlinked = all.desks.filter((d) => !d.themes.length);
    if (unlinked.length) {
      const p = U.panel("Desks transverses", { sub: "Rattachés à aucun thème en particulier." });
      for (const d of unlinked) p.body.append(deskLine(d, false));
      root.append(p.el);
    }
  }

  async function viewDetail(root, tid) {
    const head = (title) => U.pageHead({ crumbs: ["Veille", "Thèmes et desks"], title });
    const fail = (title, text) => {
      const back = U.el("a", null, "Retour aux thèmes");
      back.href = "#themes";
      const p = U.el("p");
      p.append(document.createTextNode(`${text} `), back);
      root.append(head(title), p);
    };
    // Thème inconnu : absent de la liste (qui existe aussi en ligne). Toute autre panne est une donnée indisponible.
    let list;
    try { list = await U.api("/api/themes"); } catch (err) { return fail("Données indisponibles", "La liste des thèmes n'a pas pu être lue."); }
    if (!list.themes.some((t) => t.id === tid)) return fail("Thème introuvable", `Le thème « ${tid} » n'existe pas.`);
    let r;
    try {
      r = await U.api(`/api/themes/${encodeURIComponent(tid)}`);
    } catch (err) {
      return fail("Données indisponibles", `Les données du thème « ${tid} » n'ont pas pu être lues.`);
    }
    const back = U.el("a", null, "← Tous les thèmes");
    back.href = "#themes";
    root.append(U.pageHead({ crumbs: ["Veille", "Thèmes et desks"], title: r.theme.label, sub: r.theme.description, actions: [back] }));

    const total = count7d(r);
    const ev = U.panel("Événements des 7 derniers jours", { sub: plural(total, "événement", "événements")
      + (total > r.events.length ? ` · les ${U.nf0.format(r.events.length)} plus récents affichés` : "") });
    ev.body.append(U.table(r.events, [
      ["time", "Date (UTC)", (v) => U.dmyhm(v), "nw"],
      ["kind", "Type", (v) => U.kindLabel(v)],
      ["title", "Événement"],
      ["level", "Niveau", (v) => U.badge(v)],
    ], (e) => U.openEvent(e), { empty: "Aucun événement sur 7 jours pour ce thème." }));
    root.append(ev.el);

    const ins = U.panel("Instruments", { sub: "Dernier cours enregistré ; un cours absent est affiché absent." });
    ins.body.append(U.table(r.instruments, [
      ["label", "Instrument", (v, i) => { const b = U.el("div"); b.append(U.el("b", null, v), U.el("div", "muted", i.symbol)); return b; }],
      ["last", "Dernier cours", (v, i) => price(i)],
    ], null, { empty: "Aucun instrument rattaché à ce thème." }));
    root.append(ins.el);

    const dk = U.panel("Desks", { sub: "Les équipes d'agents qui couvrent ce thème." });
    if (r.desks.length) {
      for (const d of r.desks) {
        const b = U.el("div", "th-desk");
        b.append(deskLine(d, true));
        b.append(U.el("div", "muted", `Univers : ${d.universe.length ? d.universe.join(", ") : "à définir"} · référence : ${d.benchmark || "à définir"}`));
        dk.body.append(b);
      }
    } else {
      dk.body.append(U.el("div", "muted", "Aucun desk ne couvre ce thème."));
    }
    root.append(dk.el);
  }

  async function viewThemes(root) {
    U = window.MASTER_UI;
    root.classList.add("th-view");  // portée des styles de themes.css : cette vue seulement
    const tid = decodeURIComponent(location.hash.slice(1).split("/").slice(1).join("/"));
    if (tid) await viewDetail(root, tid); else await viewList(root);
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { themes: viewThemes });
})();
