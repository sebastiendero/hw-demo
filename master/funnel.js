/* Master — rubrique « Entonnoir » : chaque soir, un filtre sans IA passe l'univers au crible et garde au plus 5 valeurs
   par desk, avec leurs raisons. Lecture seule, aussi en ligne. Une liste écrite n'est jamais réécrite. Une lecture échouée
   est affichée « indisponible », jamais comme un zéro. Tout texte venant d'une donnée passe par textContent. */
(() => {
  "use strict";
  const DESK_STATUS = { actif: ["ok", "actif"], prévu: ["neutral", "prévu"] };
  let U = null;

  const deskStatus = (d) => U.status(...(DESK_STATUS[d.status] || ["neutral", String(d.status)]));
  const plural = (n, one, many) => `${U.nf0.format(n)} ${n > 1 ? many : one}`;
  const day = (v) => (v ? U.dmy(v) : "—");
  // Une raison est une phrase : majuscule au début, point à la fin.
  const sentence = (t) => { const s = String(t || ""); return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}${/[.!?…»)]$/.test(s) ? "" : "."}` : ""; };
  const safeHttp = (u) => typeof u === "string" && /^https?:\/\//i.test(u);

  // Identifiant d'événement cité : un clic ouvre l'événement ; un échec s'affiche à la place, sans exception.
  function refButton(id, holder) {
    const b = U.el("button", "fn-ref", id);
    b.type = "button";
    b.title = "Ouvrir l'événement cité";
    b.addEventListener("click", async () => {
      holder.querySelector(":scope > .callout")?.remove();
      try {
        U.openEvent(await U.api(`/api/events/${encodeURIComponent(id)}`));
      } catch (err) {
        holder.append(U.callout("attention", "Événement indisponible.", "Cet événement n'a pas pu être lu."));
      }
    });
    return b;
  }

  function entryBlock(e) {
    const box = U.el("div", "fn-entry");
    const head = U.el("div", "fn-entry-h");
    head.append(U.el("b", "fn-sym", e.symbol), U.el("span", null, e.label || ""));
    const meta = [e.provider, ...(e.themes || []), ...(e.countries || [])].filter(Boolean).join(" · ");
    if (meta) head.append(U.el("span", "muted", meta));
    box.append(head);
    const ul = U.el("ul", "fn-reasons");
    for (const r of e.reasons || []) {
      const li = U.el("li");
      li.append(U.el("span", null, sentence(r.text)));
      const refs = r.refs || [];
      if (refs.length) {
        const rs = U.el("span", "fn-refs");
        for (const id of refs) rs.append(refButton(id, li));
        li.append(rs);
      }
      ul.append(li);
    }
    box.append(ul);
    return box;
  }

  function spikeLine(s) {
    const li = U.el("li", "fn-ctx");
    li.append(U.el("b", null, s.theme));
    if (s.status === "insuffisant") {
      li.append(U.status("warn", "pas de pic calculé"), U.el("span", "muted", s.why || "historique d'événements trop court"));
      return li;
    }
    li.append(U.status(s.spike ? "warn" : "neutral", s.spike ? "pic d'actualité recoupée" : "pas de pic"),
      U.el("span", "muted", `${plural(s.count, "événement", "événements")} en 24 h contre ${U.nf2.format(s.baseline)} par jour d'habitude`));
    if ((s.refs || []).length) { const rs = U.el("span", "fn-refs"); for (const id of s.refs) rs.append(refButton(id, li)); li.append(rs); }
    return li;
  }

  function agendaLine(a) {
    const li = U.el("li", "fn-ctx");
    li.append(U.el("span", "nw muted", U.dmyhm(a.time) + " UTC"));
    if (safeHttp(a.url)) {
      const l = U.el("a", null, a.title); l.href = a.url; l.target = "_blank"; l.rel = "noopener noreferrer"; li.append(l);
    } else li.append(U.el("span", null, a.title));
    if (a.source) li.append(U.el("span", "muted", a.source));
    return li;
  }

  function deskCard(d) {
    const p = U.panel(d.label, { sub: `Calculée le ${U.dmyhm(d.computed_at)} UTC avec les données connues au ${day(d.asof)}`, controls: deskStatus(d) });
    p.el.classList.add("fn-desk");
    const entries = d.entries || [], screened = d.screened || [], skipped = d.skipped || [];
    if (entries.length) {
      p.body.append(U.el("div", "th-h", `${plural(entries.length, "valeur retenue", "valeurs retenues")} sur ${plural(screened.length, "instrument filtré", "instruments filtrés")}`));
      for (const e of entries) p.body.append(entryBlock(e));
    } else {
      const none = U.el("div", "fn-none");
      none.append(U.el("b", null, "aucun signal"),
        U.el("span", "muted", d.status === "prévu" && !screened.length ? "Ce desk n'est pas encore en marche : aucun instrument filtré."
          : `${plural(screened.length, "instrument filtré", "instruments filtrés")} ce soir-là, rien de remarquable.`));
      p.body.append(none);
    }
    const ctx = d.context || {};
    if ((ctx.spikes || []).length) {
      p.body.append(U.el("div", "th-h fn-gap", "Actualité recoupée du thème"));
      const ul = U.el("ul", "fn-list"); for (const s of ctx.spikes) ul.append(spikeLine(s)); p.body.append(ul);
    }
    if ((ctx.agenda || []).length) {
      p.body.append(U.el("div", "th-h fn-gap", "Publications prévues dans les 36 h"));
      const ul = U.el("ul", "fn-list"); for (const a of ctx.agenda) ul.append(agendaLine(a)); p.body.append(ul);
    }
    if (skipped.length) {
      const det = U.el("details", "fn-skipped");
      det.append(U.el("summary", null, `écartés ce soir-là (${U.nf0.format(skipped.length)})`));
      const ul = U.el("ul", "fn-list");
      for (const s of skipped) { const li = U.el("li", "fn-ctx"); li.append(U.el("b", null, s.symbol), U.el("span", "muted", s.why || "")); ul.append(li); }
      det.append(ul);
      p.body.append(det);
    }
    return p.el;
  }

  function content(r) {
    const box = U.el("div", "fn-body");
    const desks = r.desks || [];
    if (!desks.length) {
      box.append(U.callout("info", "Aucune liste à cette date.", "Le filtre du soir n'a pas écrit de liste."));
      return box;
    }
    const sum = (k) => desks.reduce((s, d) => s + (d[k] || []).length, 0);
    const kpis = U.el("div", "kpis");
    kpis.append(
      U.kpi({ label: "Desks avec signal", icon: "bot", value: U.nf0.format(desks.filter((d) => (d.entries || []).length).length), unit: ` / ${desks.length}` }),
      U.kpi({ label: "Valeurs retenues", icon: "filter", value: U.nf0.format(sum("entries")), ctx: "au plus 5 par desk" }),
      U.kpi({ label: "Instruments filtrés", icon: "layers", value: U.nf0.format(sum("screened")), ctx: "passés au crible ce soir-là" }),
      U.kpi({ label: "Instruments écartés", icon: "circle-x", value: U.nf0.format(sum("skipped")), ctx: "listés avec leur raison" }));
    box.append(kpis);
    const grid = U.el("div", "fn-grid");
    for (const d of desks) grid.append(deskCard(d));
    box.append(grid);
    return box;
  }

  async function viewFunnel(root) {
    U = window.MASTER_UI;
    root.classList.add("th-view", "fn-view");  // portée des styles : cette vue seulement
    const crumbs = ["Marchés", "Entonnoir"];
    const sub = "Chaque soir, un filtre sans IA passe l'univers au crible. Au plus 5 valeurs par desk, avec leurs raisons. Une liste n'est jamais réécrite.";
    let latest;
    try { latest = await U.api("/api/funnel"); } catch (err) {
      root.append(U.pageHead({ crumbs, title: "Entonnoir", sub }),
        U.callout("attention", "Données indisponibles.", "Les listes de l'entonnoir n'ont pas pu être lues."));
      return;
    }
    // En ligne, l'instantané ne contient que la dernière liste : le sélecteur n'offre que cette date.
    const dates = window.MASTER_STATIC && latest.date ? [latest.date] : (latest.dates || []);
    const sel = U.el("select", "fn-date");
    sel.setAttribute("aria-label", "Date de la liste");
    for (const d of dates) { const o = U.el("option", null, day(d)); o.value = d; sel.append(o); }
    if (latest.date) sel.value = latest.date;
    const label = U.el("label", "fn-pick");
    label.append(U.el("span", "muted", "Soir du"), sel);
    root.append(U.pageHead({ crumbs, title: "Entonnoir", sub, actions: dates.length ? [label] : [] }));
    const holder = U.el("div");
    root.append(holder);
    if (!latest.date) {
      holder.append(U.callout("info", "Aucune liste pour l'instant.", "La première est écrite à 22 h UTC."));
      return;
    }
    holder.append(content(latest));
    let seq = 0;
    sel.addEventListener("change", async () => {
      const mine = ++seq, want = sel.value;
      if (want === latest.date) { holder.replaceChildren(content(latest)); return; }
      let r;
      try { r = await U.api(`/api/funnel?date=${encodeURIComponent(want)}`); } catch (err) {
        if (mine !== seq) return;
        holder.replaceChildren(U.callout("attention", "Données indisponibles.",
          window.MASTER_STATIC ? "Cette date n'est pas disponible dans la version en ligne." : "Les listes de cette date n'ont pas pu être lues."));
        return;
      }
      if (mine === seq) holder.replaceChildren(content(r));
    });
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { entonnoir: viewFunnel });
})();
