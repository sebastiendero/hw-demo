/* Master — Tape : tout le flux du Master trié en colonnes de surveillance, lisible d'un coup d'œil sur un écran mural
 * (le « Tape mode » de SitDeck). Colonnes : conflits et sécurité, diplomatie et politique, Ormuz, catastrophes, défense
 * (avions militaires), marchés, cyber, OSINT ; plus des listes à soi (mots-clés, gardées dans ce navigateur) et le flux
 * complet sur le côté. Rechargé chaque minute : les nouveautés clignotent. Tout texte passe par textContent.
 */
(() => {
  "use strict";
  const short = (t) => {  // « 13 min », « 4 h », « 3 j »
    const m = (Date.now() - Date.parse(t)) / 60000;
    if (!(m >= 1)) return "maintenant";
    return m < 60 ? `${Math.round(m)} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`;
  };
  const U = () => window.MASTER_UI;
  const S = () => window.MASTER_SITUATION;
  const KEY = "master-tape";
  const SEC = /\b(attack|strike|missile|drone|killed|dead|troops|army|military|war\b|clash|bomb|raid|shelling|frappe|attaque|tués?|morts?|armée|guerre|combats?)/i;
  const DIP = /\b(talks|summit|deal|agreement|sanction|envoy|minister|election|president|parliament|vote|negotiat|sommet|accord|négoci|élection|présiden|ministre|parlement)/i;
  const REGIONS = [["Golfe & Moyen-Orient", 24, 12, 64, 42], ["Europe & Ukraine", -12, 35, 45, 72], ["Asie-Pacifique", 64, -15, 180, 55],
    ["Amériques", -170, -60, -30, 72], ["Afrique", -20, -40, 52, 35]];
  const st = (() => { try { return { lists: [], ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { lists: [] }; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* non mémorisé */ } };
  let seen = null, timer = null;

  async function collect(api) {
    const opt = (p) => api(p).catch(() => null);
    const [ev, map, quakes, gdacs, mil, cyber, sanc] = await Promise.all([opt("/api/events?limit=1500"), opt("/api/hormuz/map"),
      opt("/api/layers/seismes"), opt("/api/layers/catastrophes"), opt("/api/layers/avions-militaires"), opt("/api/layers/cyber"), opt("/api/sanctions/hormuz")]);
    const markets = await S().loadMarkets(api, 10).catch(() => []);
    const all = (ev || []).slice().sort((a, b) => (a.time < b.time ? 1 : -1));
    const item = (id, time, title, src, tone, extra = {}) => ({ id, time, title, src, tone, ...extra });
    const heads = all.filter((e) => e.kind === "headline");
    const cols = {
      securite: [...all.filter((e) => e.theme === "geopolitique" && e.level !== "non_confirme").map((e) => item(e.id, e.time, e.title, `GDELT · ${(e.data || {}).sources || "?"} sources`, "hot", { ev: e })),
        ...heads.filter((e) => SEC.test(e.title)).map((e) => item(e.id, e.time, e.title, e.source, "hot", { ev: e }))],
      diplomatie: heads.filter((e) => !SEC.test(e.title) && DIP.test(e.title)).map((e) => item(e.id, e.time, e.title, e.source, "talk", { ev: e })),
      ormuz: [...((map && map.feed) || []).filter((x) => x.kind !== "radar").map((x) => item(`hw:${x.kind}:${x.id}:${x.time}`, x.time, `${x.name} · ${x.text}`, "Hormuz Watch", x.kind === "silent" ? "hot" : "cool")),
        ...all.filter((e) => e.theme === "hormuz" && ["incident", "declaration"].includes(e.kind)).map((e) => item(e.id, e.time, e.title, e.source, "warn", { ev: e }))],
      catastrophes: [...(((gdacs && gdacs.items) || []).map((g) => item(`gdacs:${g.title}`, g.to || g.from, `${g.type} · ${g.title} · ${g.countries}`, `GDACS ${g.level === "red" ? "rouge" : "orange"}`, g.level === "red" ? "hot" : "warn"))),
        ...(((quakes && quakes.items) || []).filter((q) => q.mag >= 5.5).map((q) => item(`usgs:${q.time}`, q.time, `Séisme M${q.mag} · ${q.title}`, "USGS", q.mag >= 6.5 ? "hot" : "warn"))),
        ...all.filter((e) => e.theme === "nature").map((e) => item(e.id, e.time, e.title, e.source, "cool", { ev: e }))],
      defense: (() => {
        const ac = (mil && mil.items) || [];
        const out = REGIONS.map(([name, w, s, e, n]) => {
          const inR = ac.filter((a) => a.lon >= w && a.lon <= e && a.lat >= s && a.lat <= n);
          const types = {}; for (const a of inR) if (a.type) types[a.type] = (types[a.type] || 0) + 1;
          const top = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n2]) => `${t} ×${n2}`).join(", ");
          return item(`mil:${name}`, mil && mil.fetched_at, `${name} : ${inR.length} avions militaires visibles${top ? ` (${top})` : ""}`, "adsb.lol", inR.length > 15 ? "warn" : "cool");
        });
        return [...out, ...heads.filter((e) => /\b(navy|pentagon|nato|otan|defen[cs]e|warship|carrier|bomber)/i.test(e.title)).map((e) => item(e.id, e.time, e.title, e.source, "talk", { ev: e }))];
      })(),
      marches: markets.filter((m) => m.last).map((m) => { const ch = S().lastChange(m.rows); return { m, ch }; }).sort((a, b) => Math.abs(b.ch || 0) - Math.abs(a.ch || 0))
        .map(({ m, ch }) => item(`mk:${m.symbol}`, m.last.date, `${m.label} ${U().nf2.format(m.last.close)} ${m.currency || ""} · ${ch == null ? "—" : `${ch >= 0 ? "▲" : "▼"} ${U().nf2.format(Math.abs(ch))} %`}`, "cours", ch == null ? "cool" : ch >= 0 ? "ok" : "hot")),
      cyber: ((cyber && cyber.items) || []).map((v) => item(`kev:${v.cve}`, v.added, `${v.cve} · ${v.vendor} ${v.product} · ${v.title}`, `CISA${v.ransomware ? " · rançongiciel" : ""}`, v.ransomware ? "hot" : "warn", { url: v.url })),
      osint: heads.filter((e) => S().isOsint(e)).map((e) => item(e.id, e.time, e.title, e.source.replace(/ \(Telegram\)/, ""), "talk", { ev: e })),
    };
    if (sanc && sanc.matches) cols.ormuz.unshift(item("sanc", sanc.list_date, `${sanc.matches.filter((m) => m.level === "confirme").length} navires sanctionnés confirmés en vue (OFAC), ${sanc.matches.length} au total`, "OFAC", "hot"));
    const pool = [...new Map(Object.values(cols).flat().map((x) => [x.id, x])).values()].filter((x) => x.time).sort((a, b) => (a.time < b.time ? 1 : -1));
    return { cols, pool, heads: all };
  }

  const COLS = [["securite", "Conflits & sécurité"], ["diplomatie", "Diplomatie & politique"], ["ormuz", "Ormuz"], ["catastrophes", "Catastrophes"],
    ["defense", "Défense & avions militaires"], ["marches", "Marchés"], ["cyber", "Cyber"], ["osint", "OSINT (Telegram)"]];

  async function viewTape(root) {
    const ui = U(), s = S();
    const { el, api } = ui;
    clearInterval(timer);
    const box = el("div", "tape");
    root.append(box);
    const bar = el("div", "tape-bar");
    const clock = el("span", "tape-clock");
    const add = el("button", "tape-add", "+ Liste à moi"); add.type = "button";
    const full = el("button", "tape-add", "⛶ Plein écran"); full.type = "button";
    full.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen(); };
    bar.append(el("span", "tape-title", "TAPE"), el("span", "tape-sub", "le flux du Master trié en listes · rechargé chaque minute"), clock, add, full);
    const wall = el("div", "tape-wall");
    const hose = el("aside", "tape-hose");
    const main = el("div", "tape-main");
    main.append(wall, hose);
    box.append(bar, main);
    const form = el("form", "tape-form"); form.hidden = true;
    const inp = el("input"); inp.placeholder = "Mots à surveiller, séparés par des virgules (ex. : Iran, Hormuz, tanker)"; inp.setAttribute("aria-label", "Mots à surveiller");
    const ok = el("button", "tape-add", "Ajouter"); ok.type = "submit";
    form.append(inp, ok); bar.after(form);
    add.onclick = () => { form.hidden = !form.hidden; if (!form.hidden) inp.focus(); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const words = inp.value.split(",").map((x) => x.trim()).filter(Boolean);
      if (!words.length) return;
      st.lists.push({ name: words[0], words }); save(); inp.value = ""; form.hidden = true; paint(last);
    };
    let last = null;
    const age = (t) => (t ? short(t) : "");
    function column(title, items, removable) {
      const c = el("section", "tape-col");
      const h = el("div", "tape-col-h");
      h.append(el("b", null, title), el("span", null, String(items.length)));
      if (removable) { const x = el("button", "tape-x", "✕"); x.type = "button"; x.setAttribute("aria-label", `Retirer ${title}`); x.onclick = removable; h.append(x); }
      const list = el("div", "tape-list");
      for (const it of items.slice(0, 40)) list.append(row(it));
      if (!items.length) list.append(el("p", "tape-empty", "rien pour l'instant"));
      c.append(h, list);
      return c;
    }
    function row(it) {
      const r = el(it.url || it.ev ? "button" : "div", `tape-row t-${it.tone}${seen && !seen.has(it.id) ? " new" : ""}`);
      if (r.tagName === "BUTTON") { r.type = "button"; r.onclick = () => (it.ev ? ui.openEvent(it.ev) : window.open(it.url, "_blank", "noopener")); }
      r.append(el("span", "tape-t", age(it.time)), el("span", "tape-txt", it.title), el("span", "tape-src", it.src || ""));
      return r;
    }
    function paint(d) {
      if (!d) return;
      wall.replaceChildren();
      for (const [k, title] of COLS) wall.append(column(title, d.cols[k] || []));
      st.lists.forEach((l, i) => {
        const rx = new RegExp(l.words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
        wall.append(column(`★ ${l.name}`, d.pool.filter((x) => rx.test(x.title)), () => { st.lists.splice(i, 1); save(); paint(last); }));
      });
      hose.replaceChildren(el("div", "tape-col-h", ""));
      hose.firstChild.append(el("b", null, "Flux complet"), el("span", null, String(d.pool.length)));
      const hl = el("div", "tape-list");
      for (const it of d.pool.slice(0, 120)) hl.append(row(it));
      hose.append(hl);
      seen = new Set(d.pool.map((x) => x.id));
    }
    async function refresh() {
      if (!box.isConnected) { clearInterval(timer); return; }
      last = await collect(api);
      paint(last);
      clock.textContent = `mis à jour ${new Date().toISOString().slice(11, 19)} UTC`;
    }
    seen = null;
    await refresh();
    timer = setInterval(refresh, 60000);
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { tape: viewTape });
})();
