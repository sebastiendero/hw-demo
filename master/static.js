/* Master — version en ligne (lecture seule).
 *
 * Chargé AVANT app.js uniquement dans la version publiée : demande le mot de passe, déchiffre master.enc dans le
 * navigateur (AES-256-GCM, clé PBKDF2-SHA256 600 000 itérations, comme Hormuz Watch) et répond aux appels d'API
 * du portail à partir de cet instantané. Le mot de passe est gardé pour l'onglet (même clé que la page du détroit).
 */
(() => {
  "use strict";
  window.MASTER_STATIC = true;
  let resolveReady;
  const ready = new Promise((res) => { resolveReady = res; });
  let snapshot = null;

  async function decrypt(b64, pw) {
    const raw = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
    const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)));
  }

  function filterEvents(all, params) {
    const kinds = params.getAll("kind");
    const since = params.get("since"), until = params.get("until"), theme = params.get("theme");
    const limit = Number(params.get("limit") || 500);
    return all.filter((e) => (!kinds.length || kinds.includes(e.kind)) && (!since || e.time >= since)
      && (!until || e.time <= until) && (!theme || e.theme === theme)).slice(0, limit);
  }

  // Remplace l'API du serveur : même chemin, même réponse que le portail sur le Mac.
  window.__masterApi = async (path) => {
    await ready;
    const r = snapshot.responses;
    if (path in r) return r[path];
    const url = new URL(path, "https://x");
    if (url.pathname === "/api/events") return filterEvents(r["/api/events"] || [], url.searchParams);
    throw new Error("indisponible dans la version en ligne");
  };

  function gate(message) {  // même allure que la page de connexion du portail (classes et fond animé d'app.css/app.js)
    const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
    const box = mk("form", "login-box static-gate");
    const h = mk("h1"); h.append(mk("span", "logo", "M"), document.createTextNode("Master"));
    const p = mk("p", "muted", "Version en ligne, en lecture seule");
    const label = mk("label", null, "Mot de passe de la page du détroit"); label.htmlFor = "static-pw";
    const input = mk("input"); input.id = "static-pw"; input.type = "password"; input.autocomplete = "current-password"; input.required = true;
    const button = mk("button", null, "Ouvrir"); button.type = "submit";
    const msg = mk("p", "msg", message || ""); msg.setAttribute("role", "alert");
    const foot = mk("p", "foot", "Usage personnel · aucune opération réelle · déchiffré dans ce navigateur");
    box.append(h, p, label, input, button, msg, foot);
    const canvas = mk("canvas", "ascii"); canvas.setAttribute("aria-hidden", "true");
    const overlay = mk("div", "static-overlay"); overlay.append(canvas, box);
    document.body.append(overlay);
    const stopAscii = window.MASTER_ASCII ? window.MASTER_ASCII(canvas) : null;
    input.focus();
    box.addEventListener("submit", async (e) => {
      e.preventDefault();
      button.disabled = true; msg.textContent = "Déchiffrement…";
      if (await open(input.value)) { if (stopAscii) stopAscii(); overlay.remove(); } else { msg.textContent = "Mot de passe incorrect."; button.disabled = false; }
    });
  }

  let blob = null;
  async function open(pw) {
    try {
      blob = blob || await (await fetch("master.enc", { cache: "no-store" })).text();
      snapshot = await decrypt(blob, pw);
      sessionStorage.setItem("hw-pw", pw);
      resolveReady();
      return true;
    } catch {
      return false;
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const logout = document.getElementById("logout");
    if (logout) logout.hidden = true;
    const stored = sessionStorage.getItem("hw-pw");
    if (!(stored && await open(stored))) gate();
    ready.then(() => {
      const foot = document.querySelector(".side .foot");
      if (foot) foot.textContent = `Version en ligne, lecture seule · données du ${snapshot.generated_at.slice(0, 16).replace("T", " ")} UTC · aucune opération réelle`;
    });
  });
})();
