/* Master — rubrique « Paper Alpaca » : réplique des positions des desks sur un compte paper Alpaca (argent fictif) et
   écart d'exécution avec le carnet. Le carnet reste la mesure de référence. Lecture seule, aussi en ligne. Une lecture
   échouée est affichée « indisponible », jamais comme un zéro. Tout texte venant d'une donnée passe par textContent. */
(() => {
  "use strict";
  let U = null;

  // États d'un ordre : [ton, libellé]. Un état inconnu est affiché tel quel.
  const STATUS = {
    a_envoyer: ["neutral", "en cours d'envoi"], new: ["neutral", "envoyé"], accepted: ["neutral", "acceptée"],
    pending_new: ["neutral", "en attente"], accepted_for_bidding: ["neutral", "acceptée"], held: ["neutral", "en attente"],
    partially_filled: ["warn", "partiellement exécuté"], filled: ["ok", "exécuté"],
    done_for_day: ["neutral", "clos pour la journée"], pending_cancel: ["neutral", "annulation en cours"],
    canceled: ["neutral", "annulé"], expired: ["warn", "expiré"], rejected: ["bad", "rejeté"],
    non_repliquee: ["neutral", "non répliquée"], erreur_envoi: ["bad", "erreur d'envoi"], non_envoye: ["warn", "non envoyé"],
    reportee: ["warn", "reportée"],
  };
  const SIDE = { buy: "achat", sell: "vente" };
  const qtyFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const money = (v) => (num(v) ? `${U.nf2.format(v)} $` : "—");
  const price = (v) => (num(v) ? U.nf2.format(v) : "—");
  const bps = (v) => (num(v) ? `${v > 0 ? "+" : ""}${U.nf1.format(v)} pb` : "—");
  const when = (iso) => (iso ? U.dmy(iso) : "—");

  function statusCell(s) {
    const [tone, label] = typeof s === "string" && Object.hasOwn(STATUS, s) ? STATUS[s] : ["neutral", String(s ?? "inconnu")];
    return U.status(tone, label);
  }

  function symbolCell(_, r) {
    const box = U.el("span", "pp-sym");
    box.append(U.el("b", "mono", r.symbol));
    if (r.traded_symbol && r.traded_symbol !== r.symbol) box.append(U.el("span", "muted", `via ${r.traded_symbol}`));
    return box;
  }

  function execCell(_, r) {
    if (!num(r.filled_qty) || !(r.filled_qty > 0)) return "—";
    const box = U.el("span", "pp-exec");
    box.append(U.el("span", "nw", `${qtyFmt.format(r.filled_qty)} @ ${price(r.filled_avg_price)}`));
    if (r.filled_at) box.append(U.el("span", "muted", when(r.filled_at)));
    return box;
  }

  function ordersTable(orders) {
    const cols = [
      ["desk", "Desk", null, "nw"], ["symbol", "Symbole", symbolCell], ["side", "Sens", (v) => (typeof v === "string" && Object.hasOwn(SIDE, v) ? SIDE[v] : v ?? "—"), "nw"],
      ["qty", "Quantité", (v) => (num(v) ? U.nf0.format(v) : "—"), "num"], ["status", "État", statusCell],
      ["filled_qty", "Exécution", execCell], ["note", "Note", (v) => (v ? U.el("span", "pp-note", v) : "—")],
    ];
    const t = U.table(orders.slice().reverse(), cols, null, { empty: "Aucun ordre répliqué pour l'instant." });
    t.classList.add("pp-orders");
    return t;
  }

  function compareTable(rows) {
    const gap = (v, r) => (r.proxy ? "—" : bps(v));
    const closeAlpaca = (v, r) => {
      if (num(v)) return price(v);
      if (!r.book_closed) return "—";
      // Second essai de vente échoué : plus rien ne partira, la note le dit (pas « vente à venir »).
      if (r.close_note) return U.el("span", "pp-note", String(r.close_note));
      return U.el("span", "muted", "vente à venir");
    };
    const cols = [
      ["desk", "Desk", null, "nw"],
      ["symbol", "Symbole", (_, r) => {
        const box = symbolCell(_, r);
        if (r.proxy) box.append(U.el("span", "muted pp-proxy", `indice répliqué par ${r.traded_symbol} : écart non comparable`));
        return box;
      }],
      ["book_open", "Entrée carnet", price, "num"], ["alpaca_open", "Entrée Alpaca", price, "num"], ["open_bps", "Écart d'entrée", gap, "num"],
      ["book_close", "Sortie carnet", price, "num"], ["alpaca_close", "Sortie Alpaca", closeAlpaca, "num"], ["close_bps", "Écart de sortie", gap, "num"],
    ];
    const t = U.table(rows, cols, null, { empty: "Aucune position exécutée à comparer pour l'instant." });
    t.classList.add("pp-compare");
    return t;
  }

  function stateBlock(r) {
    const box = U.el("div", "pp-state");
    const head = U.el("div", "pp-state-h");
    head.append(r.enabled ? U.status("ok", "réplique activée") : U.status("neutral", "réplique désactivée"));
    box.append(head);
    if (!r.enabled) {
      box.append(U.el("div", "muted", 'Pour l\'activer : ~/.config/master/paper.json avec {"enabled": true}.'));
    }
    const a = r.account;
    if (!a) {
      box.append(U.el("div", "muted", "Compte pas encore lu"));
      return box;
    }
    const kpis = U.el("div", "kpis");
    kpis.append(
      U.kpi({ label: "Valeur du compte paper", icon: "chart-up", value: money(a.equity), ctx: a.checked_at ? `vérifié le ${U.dmyhm(a.checked_at)} UTC` : "date de vérification inconnue" }),
      U.kpi({ label: "Liquidités", icon: "layers", value: money(a.cash) }),
      U.kpi({ label: "Pouvoir d'achat", icon: "gauge", value: money(a.buying_power) }));
    box.append(kpis);
    return box;
  }

  async function viewPaper(root) {
    U = window.MASTER_UI;
    root.classList.add("th-view", "pp-view");  // portée des styles : cette vue seulement
    const crumbs = ["Marchés", "Paper Alpaca"];
    const sub = "Les achats en attente des desks sont répliqués sur un compte paper Alpaca, puis comparés au carnet, qui reste la mesure de référence.";
    const banner = U.callout("attention", "Compte paper Alpaca : argent fictif.", "Aucun ordre réel n'est jamais envoyé.");
    banner.classList.add("pp-banner");
    root.append(U.pageHead({ crumbs, title: "Paper Alpaca", sub }), banner);
    let r;
    try {
      r = await U.api("/api/paper");
      if (!r || !Array.isArray(r.orders) || !Array.isArray(r.comparison)) throw new Error("réponse inattendue");
    } catch (err) {
      root.append(U.callout("attention", "Données indisponibles.", "La réplique paper n'a pas pu être lue."));
      return;
    }
    const body = U.el("div", "pp-body");
    body.append(stateBlock(r));
    const ord = U.panel("Ordres répliqués", { sub: `${U.nf0.format(r.orders.length)} au total, les plus récents d'abord`, flush: true });
    ord.body.append(ordersTable(r.orders));
    const cmp = U.panel("Écart d'exécution avec le carnet", { sub: "Écart en points de base (pb) : à l'achat, positif = payé plus cher ; à la vente, positif = vendu plus cher.", flush: true });
    cmp.body.append(compareTable(r.comparison));
    cmp.body.append(U.el("p", "muted pp-foot", "La vente répliquée a lieu une séance après la clôture du carnet."));
    cmp.body.append(U.el("p", "muted pp-foot", "Les cours du carnet viennent du flux IEX : l'écart mesure aussi la différence avec l'enchère de clôture officielle."));
    body.append(ord.el, cmp.el);
    root.append(body);
  }
  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { paper: viewPaper });
})();
