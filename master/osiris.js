/* Master — OSIRIS (copie du projet libre github.com/simplifaisoul/osiris, licence MIT, mise en conformité : requêtes à
 * visage découvert, pas de statistiques de visite, recherche de personnes et balayage de ports retirés ; voir
 * ~/apps/osiris/MASTER.md). Deux copies : sur ce Mac (port 3100) et sur le serveur en ligne (HTTPS, mot de passe),
 * dont l'adresse vient de /api/osiris. En ligne, seule celle du serveur est accessible.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const KEY = "master-osiris-where";
  const localUrl = () => `http://${location.hostname === "localhost" ? "localhost" : "127.0.0.1"}:3100/`;

  async function viewOsiris(root) {
    const ui = U();
    const { el, api } = ui;
    const info = await api("/api/osiris").catch(() => ({ server: null }));
    root.append(ui.pageHead({ crumbs: ["Veille", "OSIRIS"], title: "OSIRIS",
      sub: "La carte de renseignement d'OSIRIS : couches en direct, caméras publiques, vols, satellites, navires, prévisions OI." }));
    const choices = window.MASTER_STATIC ? [] : [["mac", "Ce Mac"], ...(info.server ? [["serveur", "Serveur en ligne"]] : [])];
    let where = window.MASTER_STATIC ? "serveur" : (() => { try { return localStorage.getItem(KEY) || "mac"; } catch { return "mac"; } })();
    if (where === "serveur" && !info.server) where = "mac";
    if (window.MASTER_STATIC && !info.server) {
      root.append(ui.callout("info", "OSIRIS n'est pas encore en ligne.",
        "Le serveur OSIRIS n'est pas encore déployé : en attendant, ouvrir le portail sur le Mac (http://127.0.0.1:8800/#osiris)."));
      return;
    }
    const url = () => (where === "serveur" ? info.server : localUrl());
    const p = ui.panel("Carte OSIRIS", { flush: true, sub: where === "serveur" ? "serveur en ligne · identifiant « master »" : "copie sur ce Mac" });
    const frame = el("iframe", "world");
    frame.title = "OSIRIS";
    const open = el("a", "btn", "Ouvrir en plein onglet");
    open.target = "_blank"; open.rel = "noopener";
    const show = () => { frame.src = url(); open.href = url(); };
    if (choices.length > 1) p.head.append(ui.seg(choices, where, (v) => { where = v; try { localStorage.setItem(KEY, v); } catch { /* */ } show(); }, "Copie"));
    p.head.append(open);
    show();
    p.body.append(frame);
    root.append(p.el);
    p.body.append(el("p", "muted", where === "serveur"
      ? "La carte demande l'identifiant « master » et le mot de passe de la version en ligne. Rien ne s'affiche ? « Ouvrir en plein onglet »."
      : "Page blanche ? Relancer OSIRIS : launchctl kickstart -k gui/$(id -u)/com.master.osiris"));
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { osiris: viewOsiris });
})();
