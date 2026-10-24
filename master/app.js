/* Master — portail.
 *
 * Une page, six vues (ancre de l'adresse) : Monde, Détroits, Marchés, Événements, Recherche IA, Sources.
 * Tout texte venant des données passe par textContent ; les liens externes ne sont rendus qu'en http(s).
 * Système de design : DESIGN.md (variables CSS dans app.css, composants ci-dessous).
 */
/* Fond animé en caractères ASCII de la page de connexion et de la porte de la version en ligne (static.js).
 * Partagé ici parce qu'app.js est le seul fichier chargé par le portail, la connexion et la version en ligne. */
window.MASTER_ASCII = (canvas) => {
  "use strict";
  if (!canvas || !canvas.getContext) return;
  // Fond animé en caractères ASCII (plasma de sinus ; le pointeur déforme le champ). Une seule image si
  // « réduire les animations » est actif ; pause quand l'onglet est caché.
  const ctx = canvas.getContext("2d");
  const RAMP = " .·:-=+*#%@";
  const CH = 16;
  let CW = 7.2;  // largeur réelle d'un caractère, mesurée après chargement de la police
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = getComputedStyle(document.documentElement);
  let cols = 0, rows = 0, px = 0.5, py = 0.5, tx = 0.5, ty = 0.5, last = 0, stopped = false;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `12px ${css.getPropertyValue("--mono")}`;
    ctx.textBaseline = "top";
    CW = ctx.measureText("M").width || 7.2;
    cols = Math.ceil(innerWidth / CW); rows = Math.ceil(innerHeight / CH);
  }
  function frame(t) {
    const s = t / 1000;
    px += (tx - px) * 0.04; py += (ty - py) * 0.04;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = css.getPropertyValue("--ink-3").trim();
    ctx.globalAlpha = document.documentElement.dataset.theme === "light" ? 0.4 : 0.32;
    const cx = px * cols, cy = py * rows;
    for (let y = 0; y < rows; y++) {
      let line = "";
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) * CW / CH, dy = y - cy;  // distance en proportions d'écran
        const d = Math.sqrt(dx * dx + dy * dy);
        let v = Math.sin(x * 0.07 + s * 0.6) + Math.sin(y * 0.13 - s * 0.45) + Math.sin((x + y) * 0.045 + s * 0.3) + Math.sin(d * 0.22 - s * 1.2);
        v = (v + 4) / 8;                                    // 0..1
        v *= 0.35 + 0.65 * Math.min(1, d / 26);             // plus calme autour du pointeur
        line += RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(v * v * RAMP.length * 1.15)))];
      }
      ctx.fillText(line, 0, y * CH);
    }
  }
  function loop(t) {
    if (stopped) return;
    if (!document.hidden && t - last > 50) { frame(t); last = t; }  // environ 20 images par seconde
    requestAnimationFrame(loop);
  }
  const onResize = () => { resize(); frame(performance.now()); };
  const onMove = (e) => { tx = e.clientX / innerWidth; ty = e.clientY / innerHeight; };
  addEventListener("resize", onResize);
  addEventListener("pointermove", onMove);
  resize();
  const start = () => { if (stopped) return; resize(); if (still) frame(0); else requestAnimationFrame(loop); };
  if (document.fonts && document.fonts.load) document.fonts.load(`12px ${css.getPropertyValue("--mono")}`).then(start, start);
  else start();
  return () => { stopped = true; removeEventListener("resize", onResize); removeEventListener("pointermove", onMove); };  // arrêt
};

(() => {
  "use strict";
  if (!document.getElementById("view")) return;  // page de connexion : seul le fond animé ci-dessus sert

  // ------------------------------------------------------------ utilitaires
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, "0");
  const dmy = (iso) => { const d = new Date(iso); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
  const dmyhm = (iso) => { const d = new Date(iso); return `${dmy(iso)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const hm = (iso) => { const d = new Date(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
  const whenLabel = (iso) => (/T00:00(:00)?/.test(iso) ? dmy(iso) : `${dmyhm(iso)} UTC`);  // une date seule n'a pas d'heure
  const pct = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${nf2.format(v)} %`);
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const dayFmtY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  function dayLabel(iso) {  // « Aujourd'hui · jeudi 23 octobre », « Hier · … », sinon la date complète
    const d = new Date(iso), key = iso.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10), yest = new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
    if (key === today) return `Aujourd'hui · ${dayFmt.format(d)}`;
    if (key === yest) return `Hier · ${dayFmt.format(d)}`;
    return dayFmtY.format(d);
  }
  function ago(iso) {
    const m = (Date.now() - Date.parse(iso)) / 60000;
    if (!(m >= 0)) return "à l'instant";
    if (m < 1) return "à l'instant";
    if (m < 60) return `il y a ${nf0.format(m)} min`;
    if (m < 48 * 60) return `il y a ${nf0.format(m / 60)} h`;
    return `il y a ${nf0.format(m / 1440)} j`;
  }
  function safeUrl(u) {
    try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; }
  }
  async function api(path) {
    if (window.__masterApi) return window.__masterApi(path);  // version en ligne (static.js)
    const r = await fetch(path, { credentials: "same-origin" });
    if (r.status === 401) { location.href = "/login"; throw new Error("session expirée"); }
    if (!r.ok) throw new Error(`${path} : ${r.status}`);
    return r.json();
  }
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ------------------------------------------------------------ icônes (tracés Flux Icons, MIT ; voir vendor/README.md)
  // Un tracé préfixé « F » est plein (fill currentColor, sans trait) ; les autres sont au trait.
  const ICONS = {
    "globe": ["M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM2 12H22M12 2C14.6667 5 16 8.5 16 12C16 15.5 14.6667 19 12 22C9.33333 19 8 15.5 8 12C8 8.5 9.33333 5 12 2Z"],
    "ship": ["M7 11.3L7 7C7 5.8954 7.8954 5 9 5L15 5C16.1046 5 17 5.8954 17 7L17 11.3M12 5L12 3M7.2083 20.6226L6.5521 20C4.6068 18.1541 3.6017 15.268 4.1928 12.6255C6.6256 11.3464 9.2068 10.1362 12 10C14.7932 10.1362 17.3744 11.3464 19.8072 12.6255C20.3892 15.2745 19.3973 18.1502 17.4479 20L17.2447 20.1928M2 20.3479C4.3679 21.6637 7.179 20.7413 9.5 19.8407C11.671 18.7159 14.2704 18.7635 16.4239 19.8595C18.1685 20.6303 20.0809 21.0813 22 20.8551M12 14L12 15"],
    "list": ["FM5 5C5 5.8284 4.3284 6.5 3.5 6.5C2.6716 6.5 2 5.8284 2 5C2 4.1716 2.6716 3.5 3.5 3.5C4.3284 3.5 5 4.1716 5 5ZM5 12C5 12.8284 4.3284 13.5 3.5 13.5C2.6716 13.5 2 12.8284 2 12C2 11.1716 2.6716 10.5 3.5 10.5C4.3284 10.5 5 11.1716 5 12ZM5 19C5 19.8284 4.3284 20.5 3.5 20.5C2.6716 20.5 2 19.8284 2 19C2 18.1716 2.6716 17.5 3.5 17.5C4.3284 17.5 5 18.1716 5 19Z", "M8 5H21M8 12H21M8 19H21"],
    "chart": ["M3 3L3 19C3 20.1046 3.8954 21 5 21L21 21M7 17L8.7747 12.5633C8.9132 12.2171 9.2327 11.9767 9.6037 11.9396L18.3556 11.0644C18.7477 11.0252 19.0802 10.7594 19.2048 10.3856L21 5"],
    "sparkles": ["M15.4651 9.1794L16.7409 12.4141C16.8933 12.8006 17.1994 13.1067 17.5859 13.2591L20.8206 14.5349C21.0117 14.6102 21.1372 14.7947 21.1372 15C21.1372 15.2053 21.0117 15.3898 20.8206 15.4651L17.5859 16.7409C17.1994 16.8933 16.8933 17.1994 16.7409 17.5859L15.4651 20.8206C15.3898 21.0117 15.2053 21.1372 15 21.1372C14.7947 21.1372 14.6102 21.0117 14.5349 20.8206L13.2591 17.5859C13.1067 17.1994 12.8006 16.8933 12.4141 16.7409L9.1794 15.4651C8.9883 15.3898 8.8628 15.2053 8.8628 15C8.8628 14.7947 8.9883 14.6102 9.1794 14.5349L12.4141 13.2591C12.8006 13.1067 13.1067 12.8006 13.2591 12.4141L14.5349 9.1794C14.6102 8.9883 14.7947 8.8628 15 8.8628C15.2053 8.8628 15.3898 8.9883 15.4651 9.1794ZM6.7151 3.1794L7.2131 4.4419C7.3655 4.8285 7.6715 5.1345 8.0581 5.2869L9.3206 5.7849C9.5117 5.8602 9.6372 6.0447 9.6372 6.25C9.6372 6.4553 9.5117 6.6398 9.3206 6.7151L8.0581 7.2131C7.6715 7.3655 7.3655 7.6715 7.2131 8.0581L6.7151 9.3206C6.6398 9.5117 6.4553 9.6372 6.25 9.6372C6.0447 9.6372 5.8602 9.5117 5.7849 9.3206L5.2869 8.0581C5.1345 7.6715 4.8285 7.3655 4.4419 7.2131L3.1794 6.7151C2.9883 6.6398 2.8628 6.4553 2.8628 6.25C2.8628 6.0447 2.9883 5.8602 3.1794 5.7849L4.4419 5.2869C4.8285 5.1345 5.1345 4.8285 5.2869 4.4419L5.7849 3.1794C5.8602 2.9883 6.0447 2.8628 6.25 2.8628C6.4553 2.8628 6.6398 2.9883 6.7151 3.1794Z"],
    "flask": ["M10.5 2L13.5 2C14.0523 2 14.5 2.4477 14.5 3L14.5 7.7741C14.5 7.9228 14.5332 8.0697 14.5971 8.204L19.8035 19.1403C20.4353 20.4675 19.4675 22 17.9976 22L6.0024 22C4.5325 22 3.5647 20.4675 4.1965 19.1403L9.4029 8.204C9.4668 8.0697 9.5 7.9228 9.5 7.7741L9.5 3C9.5 2.4477 9.9477 2 10.5 2ZM8 2L16 2M4.7394 18L19.2606 18"],
    "database": ["M20 4C20 5.1046 16.4184 6 12 6C7.5816 6 4 5.1046 4 4C4 2.8954 7.5816 2 12 2C16.4184 2 20 2.8954 20 4ZM4 4L4 20C4 21.1046 7.5816 22 12 22C16.4184 22 20 21.1046 20 20L20 4M4 12C4 13.1046 7.5816 14 12 14C16.4184 14 20 13.1046 20 12"],
    "search": ["M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10ZM15 15L21 21"],
    "clock": ["M12 6L12 12L17 12M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z"],
    "hourglass": ["M4 2L20 2M4 22L20 22M6 2L6 6.0633C6 6.6568 6.2636 7.2197 6.7196 7.5997L12 12L17.2804 7.5997C17.7364 7.2197 18 6.6568 18 6.0633L18 2L6 2ZM6 22L6 17.9367C6 17.3432 6.2636 16.7803 6.7196 16.4003L12 12L17.2804 16.4003C17.7364 16.7803 18 17.3432 18 17.9367L18 22L6 22Z"],
    "alert": ["M14.4051 4.39215C13.3181 2.53595 10.6819 2.53595 9.5949 4.39215L2.40063 16.6777C1.28536 18.5822 2.63072 21 4.80572 21H19.1943C21.3693 21 22.7146 18.5822 21.5994 16.6777L14.4051 4.39215Z", "M12 9V13", "FM13 17C13 17.5523 12.5523 18 12 18C11.4477 18 11 17.5523 11 17C11 16.4477 11.4477 16 12 16C12.5523 16 13 16.4477 13 17Z"],
    "megaphone": ["M16 5.5C17.42 4.886 18.788 4.02 20 3.214C20.186 3.095 20.407 3.022 20.638 3.004C20.869 2.986 21.101 3.024 21.309 3.113C21.517 3.202 21.691 3.339 21.813 3.508C21.935 3.677 22 3.872 22 4.071V17.429C22 17.628 21.935 17.823 21.813 17.992C21.691 18.161 21.517 18.298 21.309 18.387C21.101 18.476 20.869 18.516 20.638 18.496C20.407 18.478 20.186 18.405 20 18.286C18.788 17.48 17.42 16.614 16 16C14.849 15.4 13.664 15 12.5 15H5C3.34315 15 2 13.6569 2 12V9.5C2 7.84315 3.34315 6.5 5 6.5H12.5C13.664 6.5 14.849 6.1 16 5.5ZM10 15V19C10 20.1046 9.10457 21 8 21C6.2 21 5.5 18.5 5.5 15M16 5.5V16"],
    "route": ["M9 18C9 19.6569 7.6569 21 6 21C4.3431 21 3 19.6569 3 18C3 16.3431 4.3431 15 6 15C7.6569 15 9 16.3431 9 18ZM9 18H14C16.2091 18 18 16.2091 18 14V3M15 6L18 3L21 6"],
    "external": ["M6 6H17.5C17.77614 6 18 6.22386 18 6.5V18M7.2 16.8L17.4 6.6"],
    "refresh": ["M3.2117 13.9407C3.071 13.3034 3 12.6527 3 12C3 7.0294 7.0294 3 12 3C14.4831 3 16.8559 4.0259 18.5568 5.8349M19.7143 3L19.2707 6.105C19.2317 6.3784 18.9784 6.5683 18.705 6.5293L15.6 6.0857M20.7883 10.0593C20.929 10.6966 21 11.3473 21 12C21 16.9706 16.9706 21 12 21C9.5169 21 7.1441 19.9741 5.4432 18.1651M4.2857 21L4.7293 17.895C4.7683 17.6216 5.0216 17.4317 5.295 17.4707L8.4 17.9143"],
    "sun": ["M16.5 12C16.5 14.4854 14.4854 16.5 12 16.5C9.5147 16.5 7.5 14.4854 7.5 12C7.5 9.5147 9.5147 7.5 12 7.5C14.4854 7.5 16.5 9.5147 16.5 12ZM20.5 12L22 12M18.0104 18.0104L19.0711 19.0711M12 20.5L12 22M5.9896 18.0104L4.9289 19.0711M3.5 12L2 12M5.9896 5.9896L4.9289 4.9289M12 3.5L12 2M18.0104 5.9896L19.0711 4.9289"],
    "moon": ["M21 12C21 16.9706 16.9706 21 12 21C7.0294 21 3 16.9706 3 12C3 7.0294 7.0294 3 12 3C9.9618 5.5477 10.1652 9.2206 12.4723 11.5277C14.7794 13.8348 18.4523 14.0382 21 12Z"],
    "logout": ["M6.7201 3.79L12.7201 2.0406C13.3601 1.854 14 2.3339 14 3.0006L14 22L6.7215 19.8892C6.2941 19.7653 6 19.3738 6 18.9288L6 4.7501C6 4.3056 6.2934 3.9145 6.7201 3.79ZM18 21L18 4C18 3.4477 17.5523 3 17 3L14 3M2 21L10.5517 21M14 21L22 21M11 11L11 13"],
    "info": ["M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z", "M12 12V16", "FM13 8C13 8.5523 12.5523 9 12 9C11.4477 9 11 8.5523 11 8C11 7.4477 11.4477 7 12 7C12.5523 7 13 7.4477 13 8Z"],
    "x": ["M7 7L17 17M17 7L7 17"],
    "check": ["M5 12L9.66667 17L19 7"],
    "calendar": ["M6 5H18C19.6569 5 21 6.34315 21 8V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V8C3 6.34315 4.34315 5 6 5ZM7 11H17M8 3V7M16 3V7"],
    "flag": ["M4 13.3739C4 13.7715 4.2356 14.1313 4.6 14.2904C5.6724 14.7584 6.8299 15 8 15C9.3952 15 10.7689 14.6566 12 14C13.2311 13.3434 14.6048 13 16 13C16.9123 13 17.8186 13.1469 18.6842 13.435C18.786 13.4688 18.8927 13.4861 19 13.4861C19.5523 13.4861 20 13.0384 20 12.4861L20 3.6261C20 3.2285 19.7644 2.8687 19.4 2.7096C18.3276 2.2416 17.1701 2 16 2C14.6048 2 13.2311 2.3434 12 3C10.7689 3.6566 9.3952 4 8 4C6.6048 4 5.2311 3.6566 4 3L4 22"],
    "signal-off": ["M7.3333 15.0186C8.0667 14.3626 9.0161 14 10 14C10.399 14 10.7958 14.0597 11.1771 14.1771M4.6667 12.0372C6.1334 10.7253 8.0322 10 10 10C10.798 10 11.5916 10.1194 12.3542 10.3542M2 9.0557C4.2001 7.0879 7.0483 6 10 6C12.4013 6 14.7473 6.7204 16.7347 8.0681M16 12L22 18M22 12L16 18", "FM11 18C11 18.5523 10.5523 19 10 19C9.4477 19 9 18.5523 9 18C9 17.4477 9.4477 17 10 17C10.5523 17 11 17.4477 11 18Z"],
    "pause": ["M22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2C17.5228 2 22 6.4772 22 12ZM9 8V16M15 8V16"],
    "gauge": ["M22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2C17.5228 2 22 6.4772 22 12ZM12 12L12 7", "FM14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12ZM7 12C7 12.5523 6.5523 13 6 13C5.4477 13 5 12.5523 5 12C5 11.4477 5.4477 11 6 11C6.5523 11 7 11.4477 7 12ZM8.7574 7.7574C8.7574 8.3096 8.3096 8.7574 7.7574 8.7574C7.2051 8.7574 6.7574 8.3096 6.7574 7.7574C6.7574 7.2051 7.2051 6.7574 7.7574 6.7574C8.3096 6.7574 8.7574 7.2051 8.7574 7.7574ZM17.2426 7.7574C17.2426 8.3096 16.7949 8.7574 16.2426 8.7574C15.6904 8.7574 15.2426 8.3096 15.2426 7.7574C15.2426 7.2051 15.6904 6.7574 16.2426 6.7574C16.7949 6.7574 17.2426 7.2051 17.2426 7.7574ZM19 12C19 12.5523 18.5523 13 18 13C17.4477 13 17 12.5523 17 12C17 11.4477 17.4477 11 18 11C18.5523 11 19 11.4477 19 12Z"],
    "bot": ["M7 8L17 8C18.6569 8 20 9.3431 20 11L20 18C20 19.6569 18.6569 21 17 21L7 21C5.3431 21 4 19.6569 4 18L4 11C4 9.3431 5.3431 8 7 8ZM12 8L12 3.5M2 14.5L4 14.5M22 14.5L20 14.5M9 12L9 13M15 12L15 13M9 17L15 17", "FM13.5 3.5C13.5 4.3284 12.8284 5 12 5C11.1716 5 10.5 4.3284 10.5 3.5C10.5 2.6716 11.1716 2 12 2C12.8284 2 13.5 2.6716 13.5 3.5Z"],
    "siren": ["M7 17L7 13C7 10.2386 9.2386 8 12 8C14.7614 8 17 10.2386 17 13L17 17M5 17L19 17C19.5523 17 20 17.4477 20 18L20 20C20 20.5523 19.5523 21 19 21L5 21C4.4477 21 4 20.5523 4 20L4 18C4 17.4477 4.4477 17 5 17ZM5.636 6.636L4.9289 5.9289M12 4L12 3M18.364 6.636L19.0711 5.9289"],
    "trend-up": ["M2 17L8.5 10.5L13.5 15.5L21.4 7.6M16 7H21.5C21.7761 7 22 7.22386 22 7.5V13"],
    "trend-down": ["M2 7L8.5 13.5L13.5 8.5L21.4 16.4M16 17H21.5C21.7761 17 22 16.7761 22 16.5V11"],
    "chart-up": ["M3 3L3 19C3 20.1046 3.8954 21 5 21L21 21M7 15L10.3887 11.1877C10.7342 10.799 11.32 10.74 11.7361 11.0521L14.3361 13.002C14.721 13.2908 15.2571 13.2644 15.6118 12.9392L20.2628 8.6757M16.5 8L20.5 8C20.7761 8 21 8.2239 21 8.5L21 12.5"],
    "chart-down": ["M3 3L3 19C3 20.1046 3.8954 21 5 21L21 21M7 8L10.3887 11.8123C10.7342 12.201 11.32 12.26 11.7361 11.9479L14.3361 9.998C14.721 9.7092 15.2571 9.7356 15.6118 10.0608L20.2628 14.3243M16.5 15L20.5 15C20.7761 15 21 14.7761 21 14.5L21 10.5"],
    "book": ["M4 4L8 4C10.2091 4 12 5.7909 12 8C12 5.7909 13.7909 4 16 4L20 4C21.1046 4 22 4.8954 22 6L22 15C22 16.1046 21.1046 17 20 17L15 17C13.3431 17 12 18.3431 12 20C12 18.3431 10.6569 17 9 17L4 17C2.8954 17 2 16.1046 2 15L2 6C2 4.8954 2.8954 4 4 4ZM12 8L12 20"],
    "maximize": ["M3 9L3 3.5C3 3.2239 3.2239 3 3.5 3L9 3M9 9L3.6 3.6M21 9L21 3.5C21 3.2239 20.7761 3 20.5 3L15 3M15 9L20.4 3.6M21 15L21 20.5C21 20.7761 20.7761 21 20.5 21L15 21M15 15L20.4 20.4M3 15L3 20.5C3 20.7761 3.2239 21 3.5 21L9 21M9 15L3.6 20.4"],
    "server": ["M6 2L18 2C19.1046 2 20 2.8954 20 4L20 8C20 9.1046 19.1046 10 18 10L6 10C4.8954 10 4 9.1046 4 8L4 4C4 2.8954 4.8954 2 6 2ZM6 14L18 14C19.1046 14 20 14.8954 20 16L20 20C20 21.1046 19.1046 22 18 22L6 22C4.8954 22 4 21.1046 4 20L4 16C4 14.8954 4.8954 14 6 14Z", "FM9 6C9 6.5523 8.5523 7 8 7C7.4477 7 7 6.5523 7 6C7 5.4477 7.4477 5 8 5C8.5523 5 9 5.4477 9 6ZM13 6C13 6.5523 12.5523 7 12 7C11.4477 7 11 6.5523 11 6C11 5.4477 11.4477 5 12 5C12.5523 5 13 5.4477 13 6ZM9 18C9 18.5523 8.5523 19 8 19C7.4477 19 7 18.5523 7 18C7 17.4477 7.4477 17 8 17C8.5523 17 9 17.4477 9 18ZM13 18C13 18.5523 12.5523 19 12 19C11.4477 19 11 18.5523 11 18C11 17.4477 11.4477 17 12 17C12.5523 17 13 17.4477 13 18Z"],
    "radar": ["M21.3092 8.3477C21.7657 9.5113 22 10.7501 22 12C22 17.5228 17.5228 22 12 22C6.4772 22 2 17.5228 2 12C2 6.4772 6.4772 2 12 2C14.6522 2 17.1957 3.0536 19.0711 4.9289L12 12M16.2426 7.7574C15.1174 6.6321 13.5913 6 12 6C8.6863 6 6 8.6863 6 12C6 15.3137 8.6863 18 12 18C15.3137 18 18 15.3137 18 12C18 11.8887 17.9969 11.7773 17.9907 11.6661", "FM13.5 12C13.5 12.8284 12.8284 13.5 12 13.5C11.1716 13.5 10.5 12.8284 10.5 12C10.5 11.1716 11.1716 10.5 12 10.5C12.8284 10.5 13.5 11.1716 13.5 12Z"],
    "filter": ["M3.2903 4.7025C2.6666 4.0707 3.1142 3 4.002 3L19.998 3C20.8858 3 21.3334 4.0707 20.7097 4.7025L14.2883 11.2079C14.1036 11.3951 14 11.6474 14 11.9104L14 18.4997C14 18.8146 13.8516 19.1112 13.5996 19.3L11.5996 20.7985C10.9403 21.2925 10 20.822 10 19.9982L10 11.9104C10 11.6474 9.8964 11.3951 9.7117 11.2079L3.2903 4.7025C2.6666 4.0707 3.1142 3 4.002 3Z"],
    "circle-check": ["M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z", "M8 12L10.6667 15L16 9"],
    "circle-alert": ["M22 12C22 17.52285 17.52285 22 12 22C6.47715 22 2 17.52285 2 12C2 6.47715 6.47715 2 12 2C17.52285 2 22 6.47715 22 12Z", "M12 7V13", "FM13 17C13 17.55228 12.55228 18 12 18C11.44772 18 11 17.55228 11 17C11 16.44772 11.44772 16 12 16C12.55228 16 13 16.44772 13 17Z"],
    "circle-x": ["M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2Z", "M9 9L15 15M15 9L9 15"],
    "eye": ["M2 12C3.0523 7.3229 7.206 4 12 4C16.794 4 20.9477 7.3229 22 12C20.9477 16.6771 16.794 20 12 20C7.206 20 3.0523 16.6771 2 12ZM15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z"],
    "rotate": ["M20.7883 10.0593C20.929 10.6966 21 11.3473 21 12C21 16.9706 16.9706 21 12 21C7.0294 21 3 16.9706 3 12C3 7.0294 7.0294 3 12 3C14.4831 3 16.8559 4.0259 18.5568 5.8349M19.7143 3L19.2707 6.105C19.2317 6.3784 18.9784 6.5683 18.705 6.5293L15.6 6.0857"],
    "menu": ["M4 6H20M4 12H20M4 18H20"],
    "chevron-right": ["M9 6L15 12L9 18"],
    "layers": ["M12.4382 2.1011L21.4382 6.4886C22.1873 6.8538 22.1873 7.9212 21.4382 8.2864L12.4382 12.6739C12.1616 12.8087 11.8384 12.8087 11.5618 12.6739L2.5618 8.2864C1.8127 7.9212 1.8127 6.8538 2.5618 6.4886L11.5618 2.1011C11.8384 1.9663 12.1616 1.9663 12.4382 2.1011ZM2 12.625L11.5618 17.2864C11.8384 17.4212 12.1616 17.4212 12.4382 17.2864L22 12.625M2 17.2375L11.5618 21.8989C11.8384 22.0337 12.1616 22.0337 12.4382 21.8989L22 17.2375"],
    "lock": ["M7.5 10V6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5V10M4 13V19C4 20.6569 5.34315 22 7 22H17C18.6569 22 20 20.6569 20 19V13C20 11.3431 18.6569 10 17 10H7C5.34315 10 4 11.3431 4 13Z", "FM13.5 16C13.5 16.8284 12.8284 17.5 12 17.5C11.1716 17.5 10.5 16.8284 10.5 16C10.5 15.1716 11.1716 14.5 12 14.5C12.8284 14.5 13.5 15.1716 13.5 16Z"],
  };
  const SVG = "http://www.w3.org/2000/svg";
  function icon(name, cls) {
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", cls ? `i ${cls}` : "i");
    s.setAttribute("aria-hidden", "true");
    for (const d of ICONS[name] || []) {
      const p = document.createElementNS(SVG, "path");
      if (d[0] === "F") { p.setAttribute("d", d.slice(1)); p.setAttribute("fill", "currentColor"); p.setAttribute("stroke", "none"); }
      else p.setAttribute("d", d);
      s.append(p);
    }
    return s;
  }
  // Icône devant chaque élément qui porte data-icon (barre latérale, boutons fixes).
  for (const n of document.querySelectorAll("[data-icon]")) n.prepend(icon(n.dataset.icon));

  // ------------------------------------------------------------ thème (sombre par défaut, clair au choix)
  const THEME_KEY = "master-theme";
  const LEVEL_COLOR = {};
  function applyTheme(t) {
    if (t === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    for (const k of ["confirme", "probable", "non_confirme", "contredit", "declaration"]) LEVEL_COLOR[k] = cssVar(`--lv-${k}`);
    const b = $("theme");
    if (b) {
      const light = t === "light";
      b.replaceChildren(icon(light ? "moon" : "sun"), el("span", null, light ? "Thème sombre" : "Thème clair"));
    }
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch { /* stockage indisponible : thème sombre */ }
  applyTheme(savedTheme);

  // ------------------------------------------------------------ composants
  const LEVEL = {
    confirme: ["Confirmé", "Recoupé par au moins deux sources indépendantes (ou une donnée publiée, comme un cours)."],
    probable: ["Probable", "Une source fiable, ou plusieurs qui ne sont pas totalement indépendantes."],
    non_confirme: ["Non confirmé", "Une seule source, une revendication relayée, ou une observation incomplète."],
    contredit: ["Contredit", "Des sources indépendantes disent le contraire."],
    declaration: ["Déclaration", "Une prise de position : on vérifie qui l'a dite, pas si elle est vraie."],
  };
  function badge(l) {  // niveau de confirmation : forme du point + mot (jamais la couleur seule)
    const k = LEVEL[l] ? l : "non_confirme";
    const b = el("span", `lv lv-${k}`);
    b.append(el("i"), document.createTextNode(LEVEL[k][0]));
    b.title = LEVEL[k][1];
    return b;
  }
  function status(kind, text) { const s = el("span", `st ${kind}`); s.append(el("i"), document.createTextNode(text)); return s; }  // ok|warn|bad|neutral

  const KIND = {
    incident: { label: "Incident", shape: "circle", on: true, icon: "alert" },
    declaration: { label: "Déclaration", shape: "circle", on: false, icon: "megaphone" },
    dark_transit: { label: "Passage sans balise", shape: "square", on: true, icon: "signal-off" },
    crossing: { label: "Passage (balise allumée)", shape: "square", on: false, icon: "route" },
    transits_drop: { label: "Chute des passages", shape: "arrowDown", on: true, icon: "trend-down" },
    transits_rebound: { label: "Reprise des passages", shape: "arrowUp", on: true, icon: "trend-up" },
    price_spike: { label: "Choc du Brent (hausse)", shape: "arrowUp", on: true, icon: "chart-up" },
    price_drop: { label: "Choc du Brent (baisse)", shape: "arrowDown", on: true, icon: "chart-down" },
    key_date: { label: "Date clé", shape: "circle", on: true, icon: "flag" },
    headline: { label: "Titre de presse", shape: "circle", on: false, icon: "book", chart: false },  // médias et canaux OSINT
  };
  const kindLabel = (k) => (KIND[k] ? KIND[k].label : k);
  function kindCell(k) { const s = el("span", "kind"); s.append(icon(KIND[k] ? KIND[k].icon : "info"), document.createTextNode(kindLabel(k))); return s; }

  function freshTag(iso) {  // fraîcheur d'une donnée : en direct (< 10 min), puis âge ; jaune au-delà de 6 h
    if (window.MASTER_STATIC) return el("span", "tag", "INSTANTANÉ");
    if (!iso) return el("span", "tag warn", "● DONNÉE ABSENTE");
    const m = (Date.now() - Date.parse(iso)) / 60000;
    if (m < 10) return el("span", "tag ok", "● EN DIRECT");
    return el("span", m > 360 ? "tag warn" : "tag", `● ${ago(iso).toUpperCase()}`);
  }
  // En-tête de page : fil d'Ariane, fraîcheur, titre, sous-titre, actions.
  function pageHead({ crumbs, title, sub, fresh, when, actions }) {
    const box = el("div");
    const c = el("div", "crumbs");
    crumbs.forEach((x, i) => {
      if (i) c.append(el("span", null, "/"));
      c.append(i === 1 ? el("b", null, x) : el("span", null, x));
    });
    if (fresh !== undefined || when) {
      const r = el("span", "right");
      if (fresh !== undefined) r.append(freshTag(fresh));
      if (when) r.append(el("span", "when", when));
      c.append(r);
    }
    const h = el("div", "head");
    const t = el("div");
    t.append(el("h1", null, title));
    if (sub) t.append(el("p", "sub", sub));
    h.append(t);
    if (actions && actions.length) { const a = el("div", "actions"); a.append(...actions); h.append(a); }
    box.append(c, h);
    return box;
  }
  function kpi({ label, icon: ic, value, unit, ctx, tone, ratio }) {
    const c = el("div", `card kpi${tone ? ` ${tone}` : ""}`);
    const k = el("div", "k");
    k.append(el("span", null, label));
    if (ic) k.append(icon(ic));
    const v = el("div", "v", value);
    if (unit) v.append(el("small", null, unit));
    c.append(k, v);
    if (ratio != null) { const b = el("div", "bar"); const i = el("i"); i.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`; b.append(i); c.append(b); }
    if (ctx) c.append(el("div", "s", ctx));
    return c;
  }
  function panel(title, { controls, sub, flush } = {}) {  // carte : en-tête (titre + contrôles) et corps
    const c = el("section", "card");
    const h = el("div", "card-h");
    const t = el("div");
    t.append(el("h2", null, title));
    if (sub) t.append(el("div", "muted", sub));
    h.append(t);
    if (controls) h.append(controls);
    const body = el("div", flush ? "card-b flush" : "card-b");
    c.append(h, body);
    return { el: c, head: h, body };
  }
  const CALLOUT_ICON = { info: "info", attention: "alert", erreur: "circle-x", ia: "sparkles" };
  function callout(kind, strong, text) {
    const c = el("div", `callout ${kind}`);
    const p = el("p");
    if (strong) p.append(el("b", null, strong), document.createTextNode(text ? " " : ""));
    if (text) p.append(document.createTextNode(text));
    c.append(icon(CALLOUT_ICON[kind] || "info"), p);
    return c;
  }
  // Options de Lightweight Charts aux couleurs du thème courant (à recréer après une bascule de thème).
  function chartTheme() {
    return {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: cssVar("--ink-3"), fontFamily: cssVar("--mono"), fontSize: 11, attributionLogo: true },
      grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--line") } },
      timeScale: { borderColor: cssVar("--line") }, rightPriceScale: { borderColor: cssVar("--line") },
      crosshair: { vertLine: { color: cssVar("--line-2"), labelBackgroundColor: cssVar("--muted-2") },
        horzLine: { color: cssVar("--line-2"), labelBackgroundColor: cssVar("--muted-2") } },
    };
  }
  const AI_NOTICE = "Recherche automatisée par modèles d'IA, à vérifier ; pas un conseil en investissement.";
  function aiNotice() { const n = el("div", "note-ia"); n.append(icon("sparkles"), el("span", null, AI_NOTICE)); return n; }
  function seg(options, value, onChange, label) {  // onglets segmentés ; options : [[valeur, libellé], …]
    const s = el("div", "seg");
    s.setAttribute("role", "group");
    if (label) s.setAttribute("aria-label", label);
    for (const [v, l] of options) {
      const b = el("button", null, l);
      b.type = "button";
      b.setAttribute("aria-pressed", String(v === value));
      b.onclick = () => {
        for (const x of s.children) x.setAttribute("aria-pressed", "false");
        b.setAttribute("aria-pressed", "true");
        onChange(v);
      };
      s.append(b);
    }
    return s;
  }
  function linkButton(text, href, ic, cls = "btn") {  // lien sortant (http(s) seulement), nouvel onglet
    const a = el("a", cls);
    const url = safeUrl(href) || (href && href.startsWith("../") ? href : null);
    if (ic) a.append(icon(ic));
    a.append(document.createTextNode(text));
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
    return a;
  }

  // Agrandir une carte (cadre intégré) à toute la fenêtre, sans quitter la page ; « Réduire » ou Échap pour revenir.
  function maximizer(card) {
    const b = el("button", "ghost");
    b.type = "button";
    const paint = () => {
      const on = card.classList.contains("max");
      b.replaceChildren(icon("maximize"), document.createTextNode(on ? "Réduire" : "Agrandir"));
      b.setAttribute("aria-pressed", String(on));
    };
    b.onclick = () => { card.classList.toggle("max"); document.body.classList.toggle("has-max", card.classList.contains("max")); paint(); };
    paint();
    card.maximize = () => { if (!card.classList.contains("max")) b.onclick(); };
    card.restore = () => { if (card.classList.contains("max")) b.onclick(); };
    return b;
  }
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    const m = document.querySelector(".card.max");
    if (m && m.restore) m.restore();
  });

  // Tableau : cols = [[clé, libellé, format?, classe?], …] ; opts.day = clé de date pour grouper par jour.
  function table(rows, cols, onRow, opts = {}) {
    const wrap = el("div", "table-wrap");
    const t = el("table");
    const head = el("tr");
    for (const [, label, , cls] of cols) head.append(el("th", cls || null, label));
    t.append(head);
    let day = null;
    for (const r of rows) {
      if (opts.day && r[opts.day]) {
        const d = r[opts.day].slice(0, 10);
        if (d !== day) {
          day = d;
          const tr = el("tr", "day"); const td = el("td", null, dayLabel(r[opts.day])); td.colSpan = cols.length; tr.append(td); t.append(tr);
        }
      }
      const tr = el("tr", onRow ? "go" : null);
      for (const [key, , fmt, cls] of cols) {
        const td = el("td", cls || null);
        const v = fmt ? fmt(r[key], r) : r[key];
        if (v instanceof Node) td.append(v); else td.textContent = v == null ? "—" : String(v);
        tr.append(td);
      }
      if (onRow) {
        tr.tabIndex = 0;
        tr.onclick = () => onRow(r);
        tr.onkeydown = (ev) => { if (ev.key === "Enter") onRow(r); };
      }
      t.append(tr);
    }
    if (!rows.length) {
      const tr = el("tr"); const td = el("td", "empty", opts.empty || "Rien pour l'instant."); td.colSpan = cols.length; tr.append(td); t.append(tr);
    }
    wrap.append(t);
    return wrap;
  }

  // Pastille rouge sur « Sources » quand une collecte est en erreur.
  function updateSourceAlert(health) {
    const n = (health || []).filter((h) => h.error).length;
    const b = $("src-alert");
    if (!b) return;
    b.hidden = !n;
    b.textContent = n ? `● ${n}` : "";
    b.title = n ? `${n} collecte(s) en erreur` : "";
  }

  // ------------------------------------------------------------ panneau de détail
  function openDetail(build) {
    const body = $("detail-body");
    body.replaceChildren();
    build(body);
    $("detail").hidden = false;
    $("detail-close").focus();
  }
  function openEvent(e) {
    openDetail((body) => {
      body.append(el("div", "kicker", `${kindLabel(e.kind)} · ${e.theme || ""} · ${dmyhm(e.time)} UTC`), el("h3", null, e.title));
      const lv = el("div", "lvline");
      lv.append(badge(e.level), el("span", null, (LEVEL[e.level] || LEVEL.non_confirme)[1]));
      body.append(lv);
      const dl = el("dl");
      const add = (k, v) => { if (v !== undefined && v !== null && v !== "") dl.append(el("dt", null, k), el("dd", null, v)); };
      add("Date", `${dmyhm(e.time)} UTC`);
      add("Source", e.source);
      const d = e.data || {};
      add("Articles", d.n_articles);
      add("Reprises d'une revendication", d.n_claims);
      add("Médias indépendants", Array.isArray(d.independent_outlets) ? d.independent_outlets.join(", ") || "aucun" : null);
      add("Feux sur un navire", d.n_fires);
      add("Type de navire", d.type);
      add("Destination", d.destination);
      add("Pavillon", d.flag);
      add("Trou de signal", d.signal_gap_min != null ? `${nf0.format(d.signal_gap_min)} min` : null);
      add("Trajet", d.from && d.to ? `${d.from} → ${d.to}` : null);
      add("Silence observé", d.observed_h != null ? `${nf1.format(d.observed_h)} h` : null);
      add("Variation", d.change_pct != null ? pct(d.change_pct) : d.ratio != null ? pct((d.ratio - 1) * 100) : null);
      add("Moyenne 7 j", d.avg7 != null ? `${nf1.format(d.avg7)} (avant ${nf1.format(d.avg7_before)})` : null);
      body.append(dl);
      if (safeUrl(e.url)) body.append(linkButton("Lire la source", e.url, "external"));
    });
  }
  const closeDetail = () => { $("detail").hidden = true; };
  $("detail-close").onclick = closeDetail;
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeDetail(); });
  $("logout").onclick = async () => { await fetch("/api/logout", { method: "POST" }); location.href = "/login"; };
  $("theme").onclick = () => {
    const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem(THEME_KEY, t); } catch { /* choix non mémorisé */ }
    applyTheme(t);
    render();  // les graphiques reprennent les couleurs du thème
  };

  // ------------------------------------------------------------ Monde (worldmonitor auto-hébergé)
  const WM_URL = "http://127.0.0.1:3000/";
  const WM_EDITIONS = [["full", "Complète"], ["energy", "Énergie"], ["finance", "Finance"], ["commodity", "Matières premières"]];
  const monde = { variant: (() => { try { const v = localStorage.getItem("master-wm-variant"); return WM_EDITIONS.some(([k]) => k === v) ? v : "full"; } catch { return "full"; } })() };
  async function viewMonde(root) {
    const o = await api("/api/overview");
    updateSourceAlert(o.health);
    const h = (o.health || []).find((x) => x.key === "worldmonitor");
    root.append(pageHead({
      crumbs: ["Veille", "Monde"], fresh: h && h.last_success ? h.last_success : undefined, title: "Monde",
      sub: "worldmonitor, installé sur ce Mac, avec la couche Hormuz Watch : édition complète ou thématique.",
    }));
    if (window.MASTER_STATIC) {  // en ligne : la carte tourne sur le Mac, elle n'est pas publiée
      root.append(callout("info", "La carte du monde n'est visible que sur le Mac.",
        "worldmonitor tourne sur le Mac (Docker) et n'est pas publié en ligne : ouvrir le portail sur http://127.0.0.1:8800/#monde."));
      return;
    }
    if (h && h.error) root.append(callout("erreur", "worldmonitor ne répond pas.", `${h.error} · Vérifier que Docker tourne (voir README, « Monde »).`));
    else if (!h) root.append(callout("info", null, "Vérification de worldmonitor en cours…"));
    const wm = panel("Carte du monde", { flush: true, sub: "conflits, militaire, actualités, infrastructures, énergie, marchés" });
    // Édition de worldmonitor (paramètre ?variant=, retenu pour les visites suivantes)
    const frame = el("iframe", "world");
    const wmSrc = (v) => `${WM_URL}?variant=${encodeURIComponent(v)}&theme=${document.documentElement.dataset.theme === "light" ? "light" : "dark"}`;
    wm.head.append(seg(WM_EDITIONS, monde.variant, (v) => { monde.variant = v; try { localStorage.setItem("master-wm-variant", v); } catch { /* */ } frame.src = wmSrc(v); }, "Édition"));
    wm.head.append(maximizer(wm.el));
    frame.src = wmSrc(monde.variant);
    frame.title = "worldmonitor";
    wm.body.append(frame);
    root.append(wm.el);
  }

  // ------------------------------------------------------------ Détroits
  // États publiés par Hormuz Watch (en anglais) : traduits à l'affichage, un état inconnu reste tel quel.
  const STRAIT_STATUS = { open: "Ouvert", normal: "Normal", reduced: "Réduit", restricted: "Restreint", disrupted: "Perturbé",
    "severely restricted": "Très restreint", closed: "Fermé", blocked: "Bloqué" };
  const straitStatus = (s) => (s ? STRAIT_STATUS[String(s).toLowerCase()] || s : "—");
  const HW_URL = () => (window.MASTER_STATIC ? "../" : "http://127.0.0.1:8765/");  // en ligne : la page du détroit
  const strait = { filter: "" };
  const STRAIT_FILTERS = { "": null, incident: ["incident"], passages: ["dark_transit", "crossing"], declaration: ["declaration"] };

  async function viewDetroits(root) {
    const o = await api("/api/overview");
    const h = o.hormuz;
    updateSourceAlert(o.health);
    // Carte Hormuz Watch : reste dans la page (pas de nouvel onglet ni de second mot de passe), agrandissable.
    const hwOpen = el("button", "primary");
    hwOpen.type = "button";
    hwOpen.append(icon("maximize"), document.createTextNode("Carte plein écran"));
    root.append(pageHead({
      crumbs: ["Veille", "Détroits", "Ormuz"], fresh: h ? h.generated_at : null, when: h ? `${hm(h.generated_at)} UTC` : null,
      title: "Détroit d'Ormuz", sub: "Trafic, attentes et coupures de balise, d'après Hormuz Watch.",
      actions: [hwOpen],
    }));
    if (!h) {
      root.append(callout("erreur", "Hormuz Watch ne répond pas.", "Vérifier le service sur le Mac ; les événements déjà enregistrés restent affichés."));
    } else {
      const p = h.pct_of_normal;
      const tone = p == null ? null : p < 50 ? "alert" : p < 85 ? "warn" : null;
      const k = el("div", "kpis");
      k.append(
        kpi({ label: "État du détroit", icon: "gauge", value: straitStatus(h.status_label), tone,
          ratio: p == null ? null : p / 100, ctx: p == null ? null : `${nf1.format(p)} % du trafic normal` }),
        kpi({ label: "Passages / jour", icon: "ship", value: h.transits_per_day_7d == null ? "—" : nf1.format(h.transits_per_day_7d),
          ctx: `moyenne 7 j · avant-guerre ${h.baseline_per_day == null ? "—" : nf0.format(h.baseline_per_day)}` }),
        kpi({ label: "Attente prévue", icon: "hourglass", value: h.wait_in_days == null ? "—" : nf1.format(h.wait_in_days),
          unit: h.wait_in_days == null ? null : "j", ctx: `pour entrer · sortir ${h.wait_out_days == null ? "—" : `${nf1.format(h.wait_out_days)} j`}` }),
        kpi({ label: "Navires à l'arrêt", icon: "pause", value: h.stationary == null ? "—" : nf0.format(h.stationary),
          ctx: `dont ${h.tankers == null ? "—" : nf0.format(h.tankers)} pétroliers` }),
        kpi({ label: "Balises coupées", icon: "signal-off", value: nf0.format(h.silent_likely || 0), ctx: "coupures probables" }),
      );
      root.append(k);
    }

    // Derniers événements, filtrables par type
    const box = el("div");
    const ev = panel("Derniers événements", {
      flush: true,
      controls: seg([["", "Tous"], ["incident", "Incidents"], ["passages", "Passages"], ["declaration", "Déclarations"]], strait.filter,
        (v) => { strait.filter = v; fill(); }, "Type d'événement"),
    });
    ev.body.append(box);
    const cols = [["time", "Heure", hm, "t"], ["kind", "Type", kindCell], ["title", "Événement"], ["level", "Niveau", badge]];
    async function fill() {
      const kinds = STRAIT_FILTERS[strait.filter];
      let rows = o.events;
      if (kinds) {
        const q = new URLSearchParams({ limit: "12" });
        for (const k of kinds) q.append("kind", k);
        rows = await api(`/api/events?${q}`);
      }
      box.replaceChildren(table(rows, cols, openEvent, { day: "time", empty: "Aucun événement de ce type." }));
    }
    await fill();
    const all = el("div", "card-f");
    const go = el("a", "btn ghost", "Tout le journal");
    go.href = "#evenements"; go.append(icon("chevron-right"));
    all.append(el("span", "muted", "Cliquer sur une ligne pour la fiche (sources, niveau de confirmation)."), go);
    ev.el.append(all);
    root.append(ev.el);

    // Tableau de bord Hormuz Watch intégré
    const hw = panel("Tableau de bord Hormuz Watch", { flush: true, sub: "carte en direct, files d'attente, radar · panneaux repliables (touche H)" });
    hw.head.append(maximizer(hw.el));
    hwOpen.onclick = () => { hw.el.maximize(); };
    const frame = el("iframe", "hw");
    frame.src = HW_URL();
    frame.title = "Hormuz Watch";
    hw.body.append(frame);
    root.append(hw.el);
  }

  // ------------------------------------------------------------ Marchés
  const market = { symbol: "BRENT", kinds: new Set(Object.keys(KIND).filter((k) => KIND[k].on)), study: "transits_drop", chart: null,
    forecast: true };
  const SHAPE_GLYPH = { circle: "●", square: "■", arrowUp: "▲", arrowDown: "▼" };
  async function getForecast(symbol) {
    if (window.__masterApi) return window.__masterApi(`/api/forecast/${symbol}`).catch(() => null);
    const r = await fetch(`/api/forecast/${encodeURIComponent(symbol)}`, { credentials: "same-origin" });
    return r.ok ? r.json() : null;
  }
  function chip(label, glyph, on, onToggle, cls) {  // pastille de filtre qui montre la forme du marqueur
    const b = el("button", cls ? `chip ${cls}` : "chip");
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.append(el("span", "shape", glyph), document.createTextNode(label));
    b.onclick = () => { const now = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(now)); onToggle(now); };
    return b;
  }
  function diverging(v, max) {  // petite barre divergente (moyenne d'une étude d'événement)
    const s = el("span", "mbar");
    if (v == null || !max) return s;
    const i = el("i");
    const w = Math.min(50, (Math.abs(v) / max) * 50);
    i.style.width = `${w}%`;
    i.style.left = v >= 0 ? "50%" : `${50 - w}%`;
    i.style.background = cssVar(v >= 0 ? "--good" : "--bad");
    s.append(i);
    return s;
  }

  async function viewMarches(root) {
    const instruments = await api("/api/instruments");
    if (!instruments.some((i) => i.symbol === market.symbol) && instruments.length) market.symbol = instruments[0].symbol;
    const sel = el("select");
    sel.setAttribute("aria-label", "Instrument");
    for (const i of instruments) {
      const o = el("option", null, `${i.label} (${i.symbol})${i.last ? "" : " · pas encore de cours"}`);
      o.value = i.symbol; o.selected = i.symbol === market.symbol; sel.append(o);
    }
    sel.onchange = () => { market.symbol = sel.value; render(); };
    const data = await api(`/api/prices/${encodeURIComponent(market.symbol)}`);
    const rows = data.rows;
    root.append(pageHead({
      crumbs: ["Marchés", "Cours", data.symbol], when: rows.length ? `séance du ${dmy(rows[rows.length - 1][0])}` : null,
      title: data.label, sub: "Cours quotidiens (FRED, Yahoo, Kraken) et événements liés à l'instrument. La dernière séance peut être en cours.",
      actions: [sel],
    }));

    // Dernier cours et variation de la dernière séance
    if (rows.length) {
      const q = el("div", "quote");
      const last = rows[rows.length - 1][1], prev = rows.length > 1 ? rows[rows.length - 2][1] : null;
      q.append(el("span", "p", nf2.format(last)), el("span", "muted", data.currency || ""));
      if (prev) {
        const ch = (last / prev - 1) * 100;
        q.append(el("span", `d ${ch >= 0 ? "up" : "down"}`, `${ch >= 0 ? "▲" : "▼"} ${pct(ch)}`), el("span", "muted", "sur la dernière séance"));
      }
      root.append(q);
    } else {
      root.append(callout("info", "Pas encore de cours pour cet instrument.", "La collecte a lieu toutes les 6 h."));
    }

    // Filtres : types d'événements (forme du marqueur) et prévision Kronos
    const chips = el("div", "toolbar");
    for (const [k, v] of Object.entries(KIND)) {
      if (v.chart === false) continue;  // pas de marqueur de graphique (titres de presse)
      chips.append(chip(v.label, SHAPE_GLYPH[v.shape], market.kinds.has(k), (on) => { if (on) market.kinds.add(k); else market.kinds.delete(k); drawMarkers(); }));
    }
    chips.append(chip("Prévision Kronos (IA)", "┄", market.forecast, (on) => { market.forecast = on; drawForecast(); }, "ia"));
    root.append(chips);

    // Graphique
    const legend = el("div", "legend");
    for (const k of Object.keys(LEVEL)) legend.append(badge(k));
    const pc = panel("Cours et événements", { controls: legend });
    const wrap = el("div", "chart-wrap");
    const chartBox = el("div", "chart");
    const tip = el("div", "tip"); tip.hidden = true;
    wrap.append(chartBox, tip);
    pc.body.append(wrap);
    const foot = el("div", "card-f");
    foot.append(el("span", "muted", "Survoler un marqueur pour l'événement et son niveau de confirmation ; cliquer pour la fiche."));
    pc.el.append(foot);
    root.append(pc.el);

    if (market.chart) { market.chart.remove(); market.chart = null; }
    const chart = LightweightCharts.createChart(chartBox, chartTheme());
    market.chart = chart;
    const series = chart.addSeries(LightweightCharts.LineSeries, { color: cssVar("--ink"), lineWidth: 2, priceLineColor: cssVar("--line-2") });
    series.setData(rows.map(([d, c]) => ({ time: d, value: c })));
    const markers = LightweightCharts.createSeriesMarkers(series, []);
    const fc = await getForecast(market.symbol);
    const ia = cssVar("--ia");
    const fLines = [
      chart.addSeries(LightweightCharts.LineSeries, { color: ia, lineWidth: 2, lineStyle: 2, priceLineVisible: false, lastValueVisible: false }),
      chart.addSeries(LightweightCharts.LineSeries, { color: `${ia}80`, lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false }),
      chart.addSeries(LightweightCharts.LineSeries, { color: `${ia}80`, lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false }),
    ];
    function drawForecast() {
      const on = market.forecast && fc && fc.rows.length;
      fLines.forEach((line, k) => line.setData(on ? fc.rows.map((r) => ({ time: r[0], value: r[k + 1] })) : []));
    }
    drawForecast();
    if (fc) {
      const n = aiNotice();
      n.querySelector("span").textContent = `Pointillés violets : prévision Kronos du ${dmy(fc.made_on)} (médiane et fourchette 10–90 %). ${AI_NOTICE}`;
      pc.el.append(n);
    }
    const byId = new Map(data.events.map((e) => [e.id, e]));
    const days = rows.map(([d]) => d);
    function sessionOf(iso) {  // première séance à partir de la date de l'événement
      const d = iso.slice(0, 10);
      let lo = 0, hi = days.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (days[m] < d) lo = m + 1; else hi = m; }
      return days[lo];
    }
    function drawMarkers() {
      const list = [];
      for (const e of data.events) {
        if (!market.kinds.has(e.kind)) continue;
        const t = sessionOf(e.time);
        if (!t) continue;
        const k = KIND[e.kind] || { shape: "circle" };
        list.push({ time: t, position: k.shape === "arrowUp" ? "belowBar" : "aboveBar", shape: k.shape,
          color: LEVEL_COLOR[e.level] || LEVEL_COLOR.non_confirme, id: e.id, size: 1 });
      }
      list.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      markers.setMarkers(list);
    }
    drawMarkers();
    chart.subscribeClick((p) => { const e = p.hoveredObjectId && byId.get(p.hoveredObjectId); if (e) openEvent(e); });
    chart.subscribeCrosshairMove((p) => {  // bulle : date, type, titre et niveau de l'événement survolé
      const e = p.hoveredObjectId && byId.get(p.hoveredObjectId);
      if (!e || !p.point) { tip.hidden = true; return; }
      tip.replaceChildren(el("span", "when", `${whenLabel(e.time)} · ${kindLabel(e.kind)}`), el("b", null, e.title), badge(e.level));
      tip.hidden = false;
      const w = chartBox.clientWidth;
      tip.style.left = `${Math.min(Math.max(8, p.point.x + 14), w - 270)}px`;
      tip.style.top = `${Math.max(8, p.point.y - 20)}px`;
    });
    // Ouverture sur les 18 derniers mois (la crise) ; l'historique complet reste accessible en dézoomant.
    if (days.length) {
      const from = new Date(Date.now() - 548 * 86400e3).toISOString().slice(0, 10);
      const end = fc && fc.rows.length ? fc.rows[fc.rows.length - 1][0] : days[days.length - 1];  // jusqu'à la fin de la prévision
      chart.timeScale().setVisibleRange({ from: days.find((d) => d >= from) || days[0], to: end });
    }

    // Étude d'événement et corrélation
    const grid = el("div", "grid g2");
    root.append(grid);
    const ssel = el("select");
    ssel.setAttribute("aria-label", "Type d'événement étudié");
    for (const k of ["transits_drop", "transits_rebound", "price_spike", "price_drop", "incident", "dark_transit"]) {
      const o = el("option", null, kindLabel(k)); o.value = k; o.selected = k === market.study; ssel.append(o);
    }
    const st = panel(`Étude d'événement · ${data.label}`, { sub: "Variation après chaque événement du type choisi", controls: ssel, flush: true });
    const sbox = el("div");
    st.body.append(sbox);
    const sfoot = el("div", "card-f");
    sfoot.append(el("span", "muted", "Variation entre la première séance où l'événement était connu (chutes et reprises des passages PortWatch : 10 jours après leur date) et J+n séances. Le passé ne garantit rien ; ce n'est pas un conseil."));
    st.el.append(sfoot);
    grid.append(st.el);
    async function drawStudy() {
      const s = await api(`/api/study?symbol=${encodeURIComponent(market.symbol)}&kind=${encodeURIComponent(market.study)}`);
      sbox.replaceChildren();
      if (s.warning) { const w = el("div", "card-b"); w.append(callout("attention", null, s.warning)); sbox.append(w); }
      const max = Math.max(0, ...s.horizons.map((x) => Math.abs(x.mean || 0)));
      sbox.append(table(s.horizons, [["h", "Horizon", (v) => `J+${v}`, "mono"], ["n", "Événements", null, "num"],
        ["mean", "Moyenne", (v) => { const f = document.createDocumentFragment(); f.append(document.createTextNode(pct(v)), diverging(v, max)); return f; }, "num"],
        ["median", "Médiane", pct, "num"], ["hit_rate", "Hausses", (v) => (v == null ? "—" : `${nf0.format(v * 100)} %`), "num"]],
      null, { empty: "Aucun événement de ce type sur la période des cours." }));
    }
    ssel.onchange = () => { market.study = ssel.value; drawStudy(); };
    await drawStudy();

    const c = await api(`/api/correlation?symbol=${encodeURIComponent(market.symbol)}`);
    const co = panel(`Passages à Ormuz ↔ ${data.label}`, { sub: "Corrélation selon le décalage, en séances" });
    const bars = el("div", "bars");
    for (const l of c.lags) {
      const best = c.best && c.best.lag === l.lag;
      const row = el("div", best ? "row best" : "row");
      const track = el("div", "track");
      const fill = el("div", "fill");
      if (l.r != null) {
        const w = Math.abs(l.r) * 50;
        fill.style.width = `${Math.max(w, 0.6)}%`;
        fill.style.left = l.r >= 0 ? "50%" : `${50 - w}%`;
        fill.style.background = cssVar(l.r >= 0 ? "--acc" : "--neg");
      }
      track.append(fill);
      row.append(el("span", "lab", l.lag === 0 ? "J" : `${l.lag > 0 ? "+" : ""}${l.lag}`), track, el("span", "val", l.r == null ? "—" : nf2.format(l.r)));
      bars.append(row);
    }
    const axis = el("div", "axis");
    const ax = el("span");
    ax.append(el("span", null, "−1 · sens inverse"), el("span", null, "0"), el("span", null, "+1 · même sens"));
    axis.append(el("span"), ax, el("span"));
    bars.append(axis);
    co.body.append(bars);
    const cfoot = el("div", "card-f");
    cfoot.append(el("span", "muted", c.best
      ? `Lien le plus marqué : ${nf2.format(c.best.r)} avec ${c.best.lag} séance(s) de décalage (passages le jour J, cours à J${c.best.lag >= 0 ? "+" : ""}${c.best.lag}). Corrélation n'est pas causalité.`
      : "Pas assez de jours communs pour calculer une corrélation."));
    co.el.append(cfoot);
    grid.append(co.el);
  }

  // ------------------------------------------------------------ Recherche IA
  const STANCE_DIR = { achat: 1, renforcer: 1, vente: -1, "alléger": -1 };
  const COH = { coherente: ["contrôle : cohérente", "ok"], incoherente: ["contrôle : incohérente", "bad"], non_verifiee: ["contrôle : non vérifiée", "neutral"] };
  const SOURCE_LABEL = { tradingagents: "TradingAgents", macro: "Avis macro", kronos_eval: "Test de Kronos", sentiment_eval: "Test du ton des titres", aihf: "Personnages (ai-hedge-fund)" };
  const level = (v) => (typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v ?? "")) ? nf2.format(Number(v)) : v);  // niveau de prix d'une note (nombre ou texte)
  const research = { symbol: "TTE.PA" };

  function cohBadge(c) { const [l, cls] = COH[c] || COH.non_verifiee; return status(cls, l); }
  function reviewedBox(n) {
    if (window.MASTER_STATIC) return el("span", "muted", n.reviewed ? "relue" : "");  // lecture seule en ligne
    const lab = el("label", "chk");
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !!n.reviewed;
    cb.onchange = async () => {
      const r = await fetch(`/api/research/notes/${encodeURIComponent(n.id)}/reviewed`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewed: cb.checked }) });
      if (!r.ok) cb.checked = !cb.checked;
    };
    lab.append(cb, document.createTextNode("relue par moi"));
    return lab;
  }
  function arrowBox(dir) {  // sens de l'avis : flèche verte (hausse), rouge (baisse), tiret (neutre)
    const a = el("span", `arrow${dir > 0 ? " up" : dir < 0 ? " down" : ""}`);
    if (dir) a.append(icon(dir > 0 ? "trend-up" : "trend-down")); else a.textContent = "—";
    return a;
  }
  function verdict(dir, text, extra) {
    const v = el("div", "verdict");
    v.append(arrowBox(dir), el("span", "s", text));
    if (extra) v.append(extra);
    return v;
  }
  function facts(list) {  // [[libellé, valeur], …] ; valeur absente → « — »
    const f = el("div", "facts");
    for (const [k, v] of list) { const c = el("div"); c.append(el("div", "k", k), el("div", "v", v == null || v === "" ? "—" : v)); f.append(c); }
    return f;
  }
  function aiCard(title, sub) {  // carte d'avis : même anatomie pour les 4 avis, mention IA en pied
    const c = el("section", "card ai");
    const h = el("div", "card-h");
    const who = el("div", "who");
    who.append(el("h2", null, title));
    if (sub) who.append(el("span", "muted", sub));
    h.append(who, el("span", "tag ia", "IA"));
    const body = el("div", "card-b");
    const foot = el("div", "card-f");
    c.append(h, body, foot, aiNotice());
    return { el: c, body, foot };
  }
  function openNote(n, extra) {
    openDetail((body) => {
      body.append(el("div", "kicker", `${SOURCE_LABEL[n.source] || n.source} · ${n.symbol} · ${dmyhm(n.created_at)} UTC · ${n.model || ""}`),
        el("h3", null, n.stance || "—"));
      const p = el("div", "lvline"); p.append(cohBadge(n.coherence)); body.append(p);
      for (const i of n.issues || []) body.append(callout("attention", null, i));
      if (extra) body.append(extra);
      body.append(el("pre", "note-body", n.body || ""));
      if (n.data && n.data.hormuz_report) body.append(el("h2", null, "Rapport de l'analyste Ormuz"), el("pre", "note-body", n.data.hormuz_report));
      body.append(callout("ia", null, AI_NOTICE));
    });
  }
  function sparkline(rows) {  // ton quotidien de −1 à +1, zéro au milieu
    const W = 300, H = 64;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "spark"); svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Ton quotidien des titres, de −1 à +1");
    if (rows.length < 2) return svg;
    const zero = document.createElementNS(SVG, "line");
    zero.setAttribute("x1", 0); zero.setAttribute("x2", W); zero.setAttribute("y1", H / 2); zero.setAttribute("y2", H / 2);
    zero.setAttribute("stroke", cssVar("--line-2")); zero.setAttribute("stroke-dasharray", "3 3"); svg.append(zero);
    const pts = rows.map(([, v], i) => `${(i / (rows.length - 1)) * W},${H / 2 - v * (H / 2 - 3)}`).join(" ");
    const pl = document.createElementNS(SVG, "polyline");
    pl.setAttribute("points", pts); pl.setAttribute("fill", "none"); pl.setAttribute("stroke", cssVar("--ia"));
    pl.setAttribute("stroke-width", "2"); pl.setAttribute("vector-effect", "non-scaling-stroke"); pl.setAttribute("stroke-linejoin", "round");
    svg.append(pl);
    return svg;
  }

  async function viewRecherche(root) {
    const instruments = await api("/api/instruments");
    if (!instruments.some((i) => i.symbol === research.symbol) && instruments.length) research.symbol = instruments[0].symbol;
    const r = await api(`/api/research?symbol=${encodeURIComponent(research.symbol)}`);
    const inst = instruments.find((i) => i.symbol === research.symbol);

    const sel = el("select");
    sel.setAttribute("aria-label", "Instrument");
    for (const i of instruments) { const o = el("option", null, `${i.label} (${i.symbol})`); o.value = i.symbol; o.selected = i.symbol === research.symbol; sel.append(o); }
    sel.onchange = () => { research.symbol = sel.value; render(); };
    const actions = [sel];
    const qmsg = el("span", "muted", r.queue.length ? `En file : ${r.queue.join(", ")}` : "");
    if (inst && inst.provider === "yahoo" && !window.MASTER_STATIC) {
      const rerun = el("button", null);
      rerun.type = "button";
      rerun.append(icon("rotate"), document.createTextNode("Relancer TradingAgents"));
      rerun.onclick = async () => {
        rerun.disabled = true;
        try {
          const res = await fetch("/api/research/run", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: research.symbol }) });
          qmsg.textContent = res.status === 202 ? "Mis en file : l'analyse prend 10 à 20 minutes." : res.status === 409 ? "Déjà en file." : "Impossible de lancer l'analyse.";
        } catch {
          qmsg.textContent = "Le portail ne répond pas.";
        } finally {
          rerun.disabled = false;
        }
      };
      actions.push(rerun);
    } else if (!window.MASTER_STATIC) qmsg.textContent = qmsg.textContent || "TradingAgents analyse les actions et ETF seulement.";
    root.append(pageHead({ crumbs: ["Marchés", "Recherche IA", research.symbol], title: "Recherche IA",
      sub: inst ? `Quatre avis automatiques sur ${inst.label}, chacun contrôlé ; à comparer, jamais à suivre aveuglément.` : null, actions }));
    root.append(qmsg);  // toujours présent : le bouton « Relancer » y écrit sa réponse
    root.append(callout("ia", null, r.disclaimer || AI_NOTICE));

    // Concordance des avis
    const ta = r.notes.tradingagents, mac = r.notes.macro, fc = r.forecast, fev = r.forecast_eval;
    let kronosDir = null, kronosPct = null;
    // Sens de la prévision par rapport au cours du jour où elle a été faite
    const hist0 = fc ? (await api(`/api/prices/${encodeURIComponent(research.symbol)}`)).rows : [];
    const baseRow = fc ? hist0.filter((x) => x[0] <= fc.made_on).pop() : null;
    const base = baseRow ? baseRow[1] : inst && inst.last ? inst.last.close : null;
    if (fc && fc.rows.length && base) {
      kronosPct = (fc.rows[fc.rows.length - 1][1] / base - 1) * 100;
      kronosDir = kronosPct > 1 ? 1 : kronosPct < -1 ? -1 : 0;
    }
    // Seuls les avis présents et non incohérents votent ; un avis absent ne compte pas comme « neutre ».
    const dirs = [];
    if (ta && ta.coherence !== "incoherente") dirs.push(STANCE_DIR[ta.stance] || 0);
    if (mac && mac.coherence !== "incoherente") dirs.push(STANCE_DIR[mac.stance] || 0);
    const kronosVotes = kronosDir !== null && fev && fev.reliable;  // Kronos ne vote que si sa fiabilité est démontrée
    if (kronosVotes) dirs.push(kronosDir);
    const known = dirs.length;
    const agree = known >= 2 && dirs.every((d) => d === dirs[0]) && dirs[0] !== 0;
    const conc = el("section", "card concord");
    const cell = (lab, main, why, cls) => { const c = el("div"); c.append(el("span", "lab", lab)); const m = el("span", cls || "", ""); if (main instanceof Node) m.append(main); else m.textContent = main; c.append(m); if (why) c.append(el("span", "why", why)); conc.append(c); };
    cell("Concordance", known < 2 ? "Pas assez d'avis" : agree ? `Les avis concordent : ${dirs[0] > 0 ? "hausse" : "baisse"}` : "Les avis divergent : prudence",
      `${known} avis comptés`, "big");
    const voteCell = (lab, note) => {
      if (!note) { cell(lab, "—", "pas encore d'avis"); return; }
      const d = STANCE_DIR[note.stance] || 0;
      const t = `${d > 0 ? "▲" : d < 0 ? "▼" : "—"} ${note.stance}`;
      if (note.coherence === "incoherente") { const s = el("s", null, t); cell(lab, s, "exclu : avis incohérent"); } else cell(lab, t, null, d > 0 ? "up" : d < 0 ? "down" : "");
    };
    voteCell("TradingAgents", ta);
    voteCell("Avis macro", mac);
    if (kronosDir === null) cell("Kronos", "—", "pas encore de prévision");
    else {
      const t = `${kronosDir > 0 ? "▲ hausse" : kronosDir < 0 ? "▼ baisse" : "— stable"}`;
      if (kronosVotes) cell("Kronos", t, null, kronosDir > 0 ? "up" : kronosDir < 0 ? "down" : "");
      else cell("Kronos", el("s", null, t), fev ? "exclu : fiabilité faible" : "exclu : fiabilité non testée");
    }
    cell("Ton des titres", r.tone.length ? `${r.tone[r.tone.length - 1][1] > 0 ? "+" : ""}${nf2.format(r.tone[r.tone.length - 1][1])}` : "—", "indicatif, ne vote pas");
    root.append(conc);

    const grid = el("div", "ai-grid");
    // 1. TradingAgents
    const c1 = aiCard("TradingAgents", ta ? `avec l'analyste Ormuz · ${ta.model || "modèle ?"} · ${dmyhm(ta.created_at)} UTC` : "avec l'analyste Ormuz");
    if (ta) {
      const lv = (ta.data && ta.data.levels) || {};
      c1.body.append(verdict(STANCE_DIR[ta.stance] || 0, ta.stance, cohBadge(ta.coherence)),
        facts([["Entrée", level(lv.entry)], ["Stop", level(lv.stop)], ["Objectif", level(lv.target)]]));
      if (ta.data && ta.data.seconds) c1.body.append(el("p", "muted", `Analyse en ${Math.round(ta.data.seconds / 60)} min.`));
      for (const i of ta.issues) c1.body.append(callout("attention", null, i));
      const b = el("button", "link", "Lire la note complète"); b.type = "button"; b.onclick = () => openNote(ta);
      c1.foot.append(b, reviewedBox(ta));
    } else { c1.body.append(el("p", "muted", "Pas encore de note pour cet instrument (analyse quotidienne sur la liste suivie, ou « Relancer »).")); c1.foot.remove(); }
    // 2. Avis macro
    const c2 = aiCard("Avis macro", mac ? `méthode ai-hedge-fund · ${mac.model || "modèle ?"} · ${dmyhm(mac.created_at)} UTC` : "méthode ai-hedge-fund");
    if (mac) {
      const d = mac.data || {};
      c2.body.append(verdict(STANCE_DIR[mac.stance] || 0, mac.stance, cohBadge(mac.coherence)),
        facts([["Confiance", d.confidence == null ? null : `${d.confidence} / 100`], ["Horizon", d.horizon_jours == null ? null : `${d.horizon_jours} j`],
          ["Arguments", (d.arguments || []).length]]));
      if (mac.summary) c2.body.append(el("p", "summary", mac.summary));
      const list = (title, items) => { if (!(items || []).length) return; const ul = el("ul"); for (const a of items) ul.append(el("li", null, a)); const box = el("div"); box.append(el("h3", null, title), ul); c2.body.append(box); };
      list("Arguments", d.arguments);
      list("Risques", d.risques);
      for (const i of mac.issues) c2.body.append(callout("attention", null, i));
      const b = el("button", "link", "Voir la réponse brute"); b.type = "button"; b.onclick = () => openNote(mac);
      c2.foot.append(b, reviewedBox(mac));
    } else { c2.body.append(el("p", "muted", "Pas encore d'avis (une fois par jour, sur la liste suivie et le Brent).")); c2.foot.remove(); }
    // 3. Kronos
    const c3 = aiCard("Prévision Kronos", fc ? `20 séances · prévision du ${dmy(fc.made_on)}` : "20 séances");
    if (fc && fc.rows.length) {
      const last = fc.rows[fc.rows.length - 1];
      c3.body.append(verdict(kronosDir || 0, kronosPct == null ? "—" : `${kronosPct > 0 ? "Hausse" : "Baisse"} de ${nf1.format(Math.abs(kronosPct))} %`),
        facts([[`Médiane au ${dmy(last[0])}`, nf2.format(last[1])], ["Bas (10 %)", nf2.format(last[2])], ["Haut (90 %)", nf2.format(last[3])]]));
      if (fev) {
        const txt = `Test sur ${fev.n} dates passées : bonne direction ${nf0.format(fev.direction_hit_rate * 100)} %, cours réel dans la fourchette ${nf0.format(fev.inside_band_rate * 100)} %`;
        c3.body.append(fev.reliable ? el("p", "muted", `${txt}.`) : callout("attention", "Fiabilité faible :", `${txt} ; ne pas s'y fier (exclu de la concordance).`));
      } else c3.body.append(callout("attention", "Fiabilité pas encore testée :", "ne pas s'y fier (exclu de la concordance)."));
      const a = r.accuracy;
      c3.body.append(el("p", "muted", a.n ? `Prévisions arrivées à échéance : bonne direction ${nf0.format(a.direction_hit_rate * 100)} %, cours dans la fourchette ${nf0.format(a.inside_band_rate * 100)} % (${a.n}).`
        : "Aucune prévision encore arrivée à échéance."));
      const g = el("a", "btn ghost", "Voir sur le graphique"); g.href = "#marches"; g.prepend(icon("chart")); g.onclick = () => { market.symbol = research.symbol; };
      c3.foot.append(g);
    } else { c3.body.append(el("p", "muted", "Pas encore de prévision (calcul toutes les 6 h, 120 séances minimum).")); c3.foot.remove(); }
    // 4. Ton des titres
    const tone = r.tone;
    const c4 = aiCard("Ton des titres sur Ormuz", "méthode FinGPT · indice quotidien de −1 à +1");
    if (tone.length) {
      const lastT = tone[tone.length - 1];
      const v = lastT[1];
      c4.body.append(verdict(v > 0.1 ? 1 : v < -0.1 ? -1 : 0, `${v > 0 ? "+" : ""}${nf2.format(v)}`, el("span", "muted", `le ${dmy(lastT[0])} · ${v < -0.1 ? "plutôt négatif" : v > 0.1 ? "plutôt positif" : "neutre"}`)),
        sparkline(tone));
    } else c4.body.append(el("p", "muted", "Pas encore de titres classés."));
    const ev = r.tone_eval;
    if (ev && ev.data && ev.data.accuracy != null) {
      const acc = ev.data.accuracy;
      const txt = `Précision mesurée : ${nf0.format(acc * 100)} % sur ${ev.data.n} titres étiquetés (TFNS)`;
      c4.body.append(acc < 0.6 ? callout("attention", "Fiabilité faible :", txt) : el("p", "muted", `${txt}.`));
    } else c4.body.append(el("p", "muted", "Précision pas encore mesurée."));
    c4.foot.remove();
    grid.append(c1.el, c2.el, c3.el, c4.el);
    root.append(grid);
    for (const extra of window.MASTER_RESEARCH_EXTRAS || []) extra(root, r, { aiCard, verdict, facts, openNote, reviewedBox, STANCE_DIR });

    const hist = (await api(`/api/research/notes?symbol=${encodeURIComponent(research.symbol)}`)).notes;
    const hp = panel("Historique des notes", { flush: true, sub: "Cliquer sur une note pour la lire en entier" });
    hp.body.append(table(hist, [["created_at", "Date", (v) => `${dmyhm(v)}`, "t"], ["source", "Source", (v) => SOURCE_LABEL[v] || v, "nw"],
      ["stance", "Position", null, "nw"], ["coherence", "Contrôle", cohBadge], ["reviewed", "Relue", (v) => (v ? "oui" : "")],
      ["summary", "Résumé", (v) => (v || "").slice(0, 160)]], openNote, { empty: "Aucune note pour cet instrument." }));
    hp.el.append(aiNotice());
    root.append(hp.el);
  }

  // ------------------------------------------------------------ Événements
  const journal = { kind: "", level: "", days: "30" };

  async function viewEvenements(root) {
    const q = new URLSearchParams({ limit: "2000" });
    if (journal.kind) q.append("kind", journal.kind);
    if (journal.days) q.set("since", new Date(Date.now() - journal.days * 86400e3).toISOString().slice(0, 19) + "+00:00");
    const all = await api(`/api/events?${q}`);
    const rows = journal.level ? all.filter((e) => e.level === journal.level) : all;
    root.append(pageHead({
      crumbs: ["Veille", "Événements"], when: `mis à jour à ${hm(new Date().toISOString())} UTC`,
      title: "Journal d'événements", sub: "Tout ce que les modules ont vu, avec le niveau de confirmation de chaque information.",
    }));

    const bar = el("div", "toolbar");
    const mk = (opts, key, label) => {
      const s = el("select");
      s.setAttribute("aria-label", label);
      for (const [v, l] of opts) { const o = el("option", null, l); o.value = v; o.selected = journal[key] === v; s.append(o); }
      s.onchange = () => { journal[key] = s.value; render(); };
      bar.append(s);
    };
    mk([["", "Tous les types"], ...Object.entries(KIND).map(([k, v]) => [k, v.label])], "kind", "Type");
    bar.append(seg([["7", "7 j"], ["30", "30 j"], ["365", "1 an"], ["", "Tout"]], journal.days, (v) => { journal.days = v; render(); }, "Période"));
    root.append(bar);

    // Répartition par niveau (sur la période et le type choisis) : cliquer filtre le journal
    const counts = {};
    for (const e of all) counts[e.level] = (counts[e.level] || 0) + 1;
    const legend = el("div", "legend");
    for (const k of Object.keys(LEVEL)) {
      const b = el("button", "lvfilter");
      b.type = "button";
      b.setAttribute("aria-pressed", String(journal.level === k));
      b.title = LEVEL[k][1];
      const lv = badge(k);
      lv.append(el("span", "muted num", ` ${nf0.format(counts[k] || 0)}`));
      b.append(lv);
      b.onclick = () => { journal.level = journal.level === k ? "" : k; render(); };
      legend.append(b);
    }

    const p = panel(`${nf0.format(rows.length)} événement${rows.length > 1 ? "s" : ""}`, { controls: legend, flush: true });
    p.body.append(table(rows, [["time", "Heure", hm, "t"], ["kind", "Type", kindCell], ["title", "Événement"],
      ["source", "Source", null, "mono"], ["level", "Niveau", badge]], openEvent,
    { day: "time", empty: "Aucun événement pour ces filtres : élargir la période ou le type." }));
    root.append(p.el);
  }

  // ------------------------------------------------------------ Sources
  // Noms lisibles des collectes du portail ; une clé inconnue reste affichée telle quelle.
  const SOURCE_NAME = {
    hormuz_watch: ["Hormuz Watch", "incidents, passages, balises"], fred: ["FRED", "Brent, WTI"], yahoo: ["Yahoo Finance", "actions et ETF"],
    kraken: ["Kraken", "Bitcoin"], derive: ["Événements dérivés", "chutes et reprises des passages, chocs du Brent"],
    worldmonitor: ["worldmonitor", "carte Monde"], ollama: ["Ollama", "modèles d'IA locaux"], kronos: ["Kronos", "prévisions de cours"],
    tradingagents: ["TradingAgents", "notes à la demande"], tradingagents_daily: ["TradingAgents", "notes quotidiennes"],
    macro_daily: ["Avis macro", "quotidien"], sentiment: ["Ton des titres", "classement des titres sur Ormuz"],
    publication: ["Version en ligne", "instantané chiffré"], strategies: ["Stratégies", "simulations"],
    // titres de presse : médias et canaux qu'utilise insidegeopolitics.com (docs/sources-insidegeopolitics.md)
    news_guardian_world: ["The Guardian", "titres monde (RSS)"], news_guardian_me: ["The Guardian", "titres Moyen-Orient (RSS)"],
    news_bbc_world: ["BBC", "titres monde (RSS)"], news_bbc_me: ["BBC", "titres Moyen-Orient (RSS)"],
    news_france24_me: ["France 24", "titres Moyen-Orient (RSS)"], news_france24_fr: ["France 24", "titres en français (RSS)"],
    news_dw_world: ["DW", "titres monde (RSS)"], news_ft_world: ["Financial Times", "titres monde (RSS)"],
    news_aljazeera: ["Al Jazeera", "tous les titres (RSS)"], news_almonitor: ["Al-Monitor", "Moyen-Orient (RSS)"],
    news_crisisgroup: ["International Crisis Group", "analyses (RSS)"],
    news_tg_geopwatch: ["Geopolitics Watch", "canal Telegram public (OSINT)"], news_tg_osintdefender: ["OSINT Defender", "canal Telegram public (OSINT)"],
    news_iranwarlive: ["IranWarLive", "OSINT automatisé par IA, géolocalisé (faible confiance)"],
  };
  function sourceName(key, label) {
    const [name, what] = SOURCE_NAME[key] || [label || key, null];
    const c = el("div");
    c.append(el("div", null, name));
    c.append(el("div", "src-sub", what ? `${what} · ${key}` : key));
    return c;
  }
  const dataTime = (v) => (!v ? "—" : v.length > 10 ? `${dmyhm(v)} UTC` : dmy(v));
  function since(v) {  // « il y a 9 min » + date au survol
    if (!v) return el("span", "muted", "jamais");
    const s = el("span", null, ago(v));
    s.title = `${dmyhm(v)} UTC`;
    return s;
  }

  async function viewSources(root) {
    const s = await api("/api/sources");
    updateSourceAlert(s.master);
    const hw = s.hormuz_watch || [];
    const mState = (r) => (r.error ? "bad" : r.last_success ? "ok" : "neutral");
    const hState = (r) => (r.state === "ok" ? "ok" : r.state === "ancien" ? "warn" : "bad");
    const all = [...s.master.map(mState), ...hw.map(hState)];
    const n = (k) => all.filter((x) => x === k).length;
    root.append(pageHead({
      crumbs: ["Système", "Sources"], when: `mis à jour à ${hm(new Date().toISOString())} UTC`, title: "Sources",
      sub: "Aucune source n'est garantie. Une information n'est « confirmée » que si au moins deux sources indépendantes la recoupent ; "
        + "un écart entre sources ne dit pas qui a raison, il signale ce qu'il faut vérifier.",
    }));
    const k = el("div", "kpis");
    k.append(
      kpi({ label: "À jour", icon: "circle-check", value: nf0.format(n("ok")), ctx: `sur ${all.length} collectes` }),
      kpi({ label: "Anciennes", icon: "clock", value: nf0.format(n("warn")), tone: n("warn") ? "warn" : null, ctx: "donnée plus vieille que prévu" }),
      kpi({ label: "En erreur", icon: "circle-x", value: nf0.format(n("bad")), tone: n("bad") ? "alert" : null, ctx: n("bad") ? "voir la dernière erreur ci-dessous" : "aucune" }),
    );
    root.append(k);

    const STATE_LABEL = { ok: "À jour", warn: "Ancienne", bad: "En erreur", neutral: "Jamais réussie" };
    const p1 = panel("Collecte du portail", { flush: true, sub: "Ce que le portail va chercher lui-même" });
    p1.body.append(table(s.master, [["key", "Source", (v) => sourceName(v)],
      ["error", "État", (v, r) => status(mState(r), STATE_LABEL[mState(r)])],
      ["last_success", "Dernière collecte réussie", since, "nw"], ["data_time", "Donnée la plus récente", dataTime, "nw"],
      ["rows", "Lignes", (v) => (v == null ? "—" : nf0.format(v)), "num"], ["error", "Dernière erreur", (v) => v || "", "err"]]));
    root.append(p1.el);

    const p2 = panel("Sources de Hormuz Watch", { flush: true, sub: "Lues dans Hormuz Watch, jamais modifiées" });
    p2.body.append(table(hw, [["label", "Source", (v, r) => sourceName(r.key, v)], ["what", "Ce qu'elle fournit"],
      ["state", "État", (v, r) => status(hState(r), hState(r) === "bad" ? v || "erreur" : STATE_LABEL[hState(r)])],
      ["data_time", "Âge de la donnée", since, "nw"], ["error", "Dernière erreur", (v) => v || "", "err"]],
    null, { empty: "Hormuz Watch ne répond pas : pas de liste de sources." }));
    root.append(p2.el);
  }

  // ------------------------------------------------------------ navigation
  const VIEWS = { monde: viewMonde, detroits: viewDetroits, marches: viewMarches, recherche: viewRecherche, evenements: viewEvenements, sources: viewSources };
  // Rubriques dans des fichiers à part (strategies.js) : elles reçoivent les utilitaires et composants du portail.
  window.MASTER_UI = { el, api, table, badge, dmy, dmyhm, pct, nf0, nf1, nf2, openEvent, kindLabel, LEVEL,
    icon, status, pageHead, panel, kpi, callout, seg, aiNotice, cssVar, chartTheme: () => chartTheme() };
  Object.assign(VIEWS, window.MASTER_EXTRA_VIEWS || {});
  let current = null;
  async function render() {
    const name = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : VIEWS.situation ? "situation" : "detroits";
    current = name;
    document.body.dataset.view = name;  // une rubrique peut adapter la mise en page (ex. Situation en pleine page)
    for (const a of document.querySelectorAll(".side a[data-view]")) {
      const on = a.dataset.view === name;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    // La vue est mise en page avant d'être remplie : le graphique a besoin de sa taille réelle pour régler sa période.
    const next = el("div", "page");
    $("view").replaceChildren(next);
    try {
      await VIEWS[name](next);
    } catch (err) {
      next.append(callout("erreur", "Impossible d'afficher cette vue.", err.message));
    }
    // Les vues Monde, Détroits et Sources tiennent déjà la pastille « Sources » à jour ; les autres la rafraîchissent ici.
    if (!["monde", "detroits", "sources"].includes(name)) api("/api/overview").then((o) => updateSourceAlert(o.health), () => {});
  }
  window.addEventListener("hashchange", render);
  render();
  // Rechargement automatique des vues de liste seulement : recharger Détroits rechargerait le tableau de bord intégré,
  // et Marchés perdrait le zoom du graphique (les cours sont quotidiens).
  setInterval(() => { if ((current === "evenements" || current === "sources") && $("detail").hidden) render(); }, 60_000);
})();
