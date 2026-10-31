/* Master — globe 3D de la rubrique Situation (three.js 0.186, MIT ; textures NASA du domaine public).
 *
 * Module chargé à la demande par situation.js. Il dessine la Terre (nuit, jour ou rétro, avec relief), les
 * frontières, les routes maritimes, des points pondérés (affrontements, événements), des contours de pays colorés
 * (calques) et des cercles (portée), et il gère la souris : glisser pour tourner, molette pour zoomer, clic pour
 * choisir un pays ou un point. Aucun texte de données n'est inséré en HTML : les étiquettes passent par textContent.
 */
import * as THREE from "./vendor/three/three.module.js";

const DEG = Math.PI / 180;
const BASE = new URL("./vendor/world/textures/", import.meta.url).href;

// lon/lat (degrés) → point de la sphère de rayon r, dans le repère des UV de SphereGeometry (u = 0 à −180°).
export function toVec(lon, lat, r = 1) {
  const phi = (90 - lat) * DEG, theta = (lon + 180) * DEG;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}
function toLonLat(v) {
  const n = v.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, n.y))) / DEG;
  let lon = Math.atan2(n.z, -n.x) / DEG - 180;
  if (lon < -180) lon += 360;
  return [lon, lat];
}
// Arc de grand cercle entre deux points, découpé tous les ~2°.
function arc(a, b, r) {
  const va = toVec(a[0], a[1], 1), vb = toVec(b[0], b[1], 1);
  const ang = va.angleTo(vb), n = Math.max(1, Math.ceil(ang / (2 * DEG))), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(ang) || 1;
    const v = va.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(vb.clone().multiplyScalar(Math.sin(t * ang) / s));
    out.push(v.normalize().multiplyScalar(r));
  }
  return out;
}
// Lignes [[lon, lat], …] → segments (paires de points) sur la sphère, arcs de grand cercle compris.
function segments(lines, r) {
  const pos = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const pts = arc(line[i - 1], line[i], r);
      for (let k = 1; k < pts.length; k++) pos.push(pts[k - 1].x, pts[k - 1].y, pts[k - 1].z, pts[k].x, pts[k].y, pts[k].z);
    }
  }
  return new Float32Array(pos);
}
function ringsOf(geom) {  // GeoJSON (Multi)Polygon / (Multi)LineString → liste de lignes
  if (!geom) return [];
  if (geom.type === "Polygon" || geom.type === "MultiLineString") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  if (geom.type === "LineString") return [geom.coordinates];
  return [];
}

const EARTH_VS = `
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
void main() {
  vUv = uv; vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const EARTH_FS = `
uniform sampler2D day; uniform sampler2D night; uniform sampler2D relief; uniform sampler2D fills; uniform float mode; uniform vec2 texel;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
void main() {
  // relief : éclairage rasant calculé sur la carte d'altitude (lumière venant du nord-ouest)
#ifdef PATCH
  float shade = 1.0;  // pièce haute résolution : le relief est déjà ombré dans l'image
#else
  float hx = texture2D(relief, vUv + vec2(texel.x, 0.0)).r - texture2D(relief, vUv - vec2(texel.x, 0.0)).r;
  float hy = texture2D(relief, vUv + vec2(0.0, texel.y)).r - texture2D(relief, vUv - vec2(0.0, texel.y)).r;
  float shade = clamp(1.0 + (hy - hx) * 6.0, 0.55, 1.45);
#endif
  vec3 d = texture2D(day, vUv).rgb, n = texture2D(night, vUv).rgb;
  float lum = dot(d, vec3(0.299, 0.587, 0.114));
  vec3 col;
  if (mode < 0.5) col = n * 1.15 + vec3(0.035, 0.038, 0.045) * shade;           // nuit : lumières des villes
  else if (mode < 1.5) col = d * (0.75 + 0.25 * shade);                            // jour : Blue Marble
  else col = vec3(lum) * 0.42 * shade + vec3(0.02);                                // rétro : gris, relief marqué
#ifdef PATCH
  vec2 e = min(vUv, 1.0 - vUv);                                                    // bords fondus dans la Terre entière
  gl_FragColor = vec4(col, smoothstep(0.0, 0.06, min(e.x, e.y)));
#else
  vec4 f = texture2D(fills, vUv);                                                  // pays remplis (calques, sélection)
  col = mix(col, f.rgb * (0.55 + 0.45 * shade), f.a);
  float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);                       // bord légèrement éclairci
  col += rim * vec3(0.10, 0.10, 0.07);
  gl_FragColor = vec4(col, 1.0);
#endif
}`;
const ATMO_FS = `
varying vec3 vNormal; varying vec3 vView; uniform vec3 color;
void main() { float f = pow(max(0.0, 0.62 - dot(vNormal, vView)), 2.0); gl_FragColor = vec4(color, clamp(f, 0.0, 1.0) * 0.55); }`;
const ATMO_VS = `
varying vec3 vNormal; varying vec3 vView;
void main() { vNormal = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// Points pondérés : disque doux, taille en pixels, couleur et opacité par point.
const PTS_VS = `
attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float scale;
void main() { vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale; gl_Position = projectionMatrix * mv; }`;
const PTS_FS = `
varying vec4 vC;
void main() { vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard;
#ifdef OUTLINE
  // liseré sombre : le point reste lisible sur la mer claire du style « jour » (navires)
  gl_FragColor = vec4(mix(vC.rgb, vec3(0.02), smoothstep(0.28, 0.40, d)), max(vC.a, 0.85) * smoothstep(0.5, 0.44, d));
#else
  gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.32, d));
#endif
}`;
// Routes : tirets qui défilent dans le sens du tracé.
const LANE_VS = `
attribute float dist; varying float vD;
void main() { vD = dist; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LANE_FS = `
uniform float time; uniform vec3 color; uniform float alpha; varying float vD;
void main() { float f = fract(vD * 18.0 - time * 0.35); gl_FragColor = vec4(color, alpha * (f < 0.45 ? 1.0 : 0.25)); }`;

export function createGlobe(container, opts = {}) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.className = "g3-canvas";
  container.append(renderer.domElement);
  const overlay = document.createElement("div");
  overlay.className = "g3-overlay";
  container.append(overlay);

  const scene = new THREE.Scene();
  // Zoom rapproché (opts.maxZoom) : la distance suit l'altitude, jusqu'à ~150 km du sol (mode « Focus détroits »).
  const ZMAX = opts.maxZoom || 5, close = ZMAX > 5;
  const camera = new THREE.PerspectiveCamera(32, 1, close ? 0.002 : 0.1, 100);
  const globe = new THREE.Group();
  scene.add(globe);

  const loader = new THREE.TextureLoader();
  const tex = (f) => { const t = loader.load(BASE + f, () => (dirty = true)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const relief = loader.load(BASE + "earth-relief-2k.jpg", () => (dirty = true));
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { day: { value: tex("earth-day-4k.jpg") }, night: { value: tex("earth-night-4k.jpg") }, relief: { value: relief },
      fills: { value: null }, mode: { value: 2 }, texel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) } },
    vertexShader: EARTH_VS, fragmentShader: EARTH_FS,
  });
  // Remplissages de pays : une image équirectangulaire 4096 × 2048 dessinée avec d3-geo, collée sur la Terre.
  const fillCanvas = document.createElement("canvas");
  fillCanvas.width = 4096; fillCanvas.height = 2048;
  const fillTex = new THREE.CanvasTexture(fillCanvas);
  fillTex.colorSpace = THREE.SRGBColorSpace;
  earthMat.uniforms.fills.value = fillTex;
  function setFills(list) {  // [{feature, color, alpha}]
    const g = fillCanvas.getContext("2d");
    g.clearRect(0, 0, 4096, 2048);
    if (list && list.length && window.d3) {
      const proj = d3.geoEquirectangular().scale(4096 / (2 * Math.PI)).translate([2048, 1024]);
      const path = d3.geoPath(proj, g);
      for (const f of list) {
        g.globalAlpha = f.alpha ?? 0.6; g.fillStyle = f.color || "#e9d24a";
        g.beginPath(); path(f.feature); g.fill();
      }
      g.globalAlpha = 1;
    }
    fillTex.needsUpdate = true; dirty = true;
  }
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), earthMat);
  globe.add(earth);
  // Pièce haute résolution (images équirectangulaires d'une région) collée sur une calotte de sphère.
  let patch = null;
  function setPatch(p) {  // {bbox: [ouest, sud, est, nord], day, night} (fichiers de vendor/world/textures/)
    if (patch) { globe.remove(patch); patch.geometry.dispose(); patch = null; }
    if (!p) return;
    const [w, s, e, n] = p.bbox;
    const mat = new THREE.ShaderMaterial({
      uniforms: { day: { value: tex(p.day) }, night: { value: tex(p.night) }, relief: { value: null }, fills: { value: null },
        mode: earthMat.uniforms.mode, texel: { value: new THREE.Vector2() } },
      vertexShader: EARTH_VS, fragmentShader: EARTH_FS, defines: { PATCH: "" }, transparent: true, depthWrite: false,
    });
    const g = new THREE.SphereGeometry(1.0006, 96, 72, (w + 180) * DEG, (e - w) * DEG, (90 - n) * DEG, (n - s) * DEG);
    patch = new THREE.Mesh(g, mat);
    patch.renderOrder = 1;
    globe.add(patch);
    dirty = true;
  }
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.035, 64, 32), new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(opts.atmosphere || "#e9d24a") } }, vertexShader: ATMO_VS, fragmentShader: ATMO_FS,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  scene.add(atmo);

  const lineGroup = (pos, color, opacity, r = 1) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.scale.setScalar(r);
    return m;
  };
  let borders = null;
  function setBorders(lines) {
    if (borders) { globe.remove(borders); borders.geometry.dispose(); }
    borders = lineGroup(segments(lines, 1.0015), "#ecebe4", 0.22);
    globe.add(borders);
    dirty = true;
  }

  // Routes maritimes animées
  const laneMat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, color: { value: new THREE.Color("#e9d24a") }, alpha: { value: 0.55 } },
    vertexShader: LANE_VS, fragmentShader: LANE_FS, transparent: true, depthWrite: false });
  let lanes = null;
  function setLanes(lines) {
    if (lanes) { globe.remove(lanes); lanes.geometry.dispose(); lanes = null; }
    if (!lines || !lines.length) return;
    const pos = [], dist = [];
    for (const line of lines) {
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        const pts = arc(line[i - 1], line[i], 1.0025);
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], len = a.distanceTo(b);
          pos.push(a.x, a.y, a.z, b.x, b.y, b.z); dist.push(acc, acc + len); acc += len;
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("dist", new THREE.Float32BufferAttribute(dist, 1));
    lanes = new THREE.LineSegments(g, laneMat);
    globe.add(lanes);
    dirty = true;
  }

  // Points pondérés (plusieurs jeux : affrontements, événements, bases…)
  const ptsMat = new THREE.ShaderMaterial({ uniforms: { scale: { value: 1 } }, vertexShader: PTS_VS, fragmentShader: PTS_FS,
    transparent: true, depthWrite: false });
  const ptsLined = new THREE.ShaderMaterial({ uniforms: ptsMat.uniforms, vertexShader: PTS_VS, fragmentShader: PTS_FS,
    defines: { OUTLINE: "" }, transparent: true, depthWrite: false });
  const pointSets = new Map();
  // Images posées sur leur emprise (radar Sentinel-1, optique Sentinel-2) : [{bbox: [ouest, sud, est, nord], url, opacity}]
  const overlays = [];
  function setOverlays(list) {
    for (const o of overlays.splice(0)) { globe.remove(o); o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    for (const it of list || []) {
      const [w, s, e, n] = it.bbox;
      const t = loader.load(it.url, () => (dirty = true));
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.0009, 32, 24, (w + 180) * DEG, (e - w) * DEG, (90 - n) * DEG, (n - s) * DEG),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: it.opacity ?? 0.9, depthWrite: false }));
      m.renderOrder = 1;
      globe.add(m);
      overlays.push(m);
    }
    dirty = true;
  }

  function setPoints(key, list, r = 1.004, outline = false) {  // list : [{lon, lat, size, color, alpha, data}] ; r : altitude (rayons)
    const old = pointSets.get(key);
    if (old) { globe.remove(old.obj); old.obj.geometry.dispose(); pointSets.delete(key); }
    if (!list || !list.length) { dirty = true; return; }
    const pos = new Float32Array(list.length * 3), size = new Float32Array(list.length), rgba = new Float32Array(list.length * 4);
    const c = new THREE.Color();
    list.forEach((p, i) => {
      const v = toVec(p.lon, p.lat, r); pos.set([v.x, v.y, v.z], i * 3);
      size[i] = p.size || 6; c.set(p.color || "#e5484d"); rgba.set([c.r, c.g, c.b, p.alpha ?? 0.85], i * 4);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));
    g.setAttribute("rgba", new THREE.BufferAttribute(rgba, 4));
    const obj = new THREE.Points(g, outline ? ptsLined : ptsMat);
    globe.add(obj);
    obj.renderOrder = 2;
    pointSets.set(key, { obj, list, r });
    dirty = true;
  }

  // Contours de pays colorés (calques) et cercles (portée)
  const outlineSets = new Map();
  function setOutlines(key, features, color, opacity = 0.9) {
    const old = outlineSets.get(key);
    if (old) { globe.remove(old); old.geometry.dispose(); outlineSets.delete(key); }
    if (!features || !features.length) { dirty = true; return; }
    const lines = features.flatMap((f) => ringsOf(f.geometry));
    const obj = lineGroup(segments(lines, 1.003), color, opacity);
    globe.add(obj);
    outlineSets.set(key, obj);
    dirty = true;
  }
  function circle(lon, lat, km) {  // petit cercle de rayon km autour d'un point → ligne [[lon, lat], …]
    const d = km / 6371, out = [], la = lat * DEG, lo = lon * DEG;
    for (let i = 0; i <= 96; i++) {
      const b = (i / 96) * 2 * Math.PI;
      const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
      const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
      out.push([((lo2 / DEG + 540) % 360) - 180, la2 / DEG]);
    }
    return out;
  }
  function setCircles(key, list, color) {  // list : [{lon, lat, km}]
    setOutlines(key, (list || []).map((c) => ({ geometry: { type: "LineString", coordinates: circle(c.lon, c.lat, c.km) } })), color, 0.75);
  }

  // Marqueurs HTML (points chauds avec étiquette) projetés à chaque image
  let markers = [];
  function setMarkers(list) {  // [{id, lon, lat, label, sub, tone, onClick, minZoom, maxZoom}]
    overlay.replaceChildren();
    markers = (list || []).map((m) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `g3-mark ${m.tone || ""}`;
      el.title = m.label || "";
      const dot = document.createElement("i");
      el.append(dot);
      if (m.label) { const s = document.createElement("span"); s.textContent = m.label; el.append(s); }
      el.onclick = (e) => { e.stopPropagation(); if (m.onClick) m.onClick(m); };
      overlay.append(el);
      return { ...m, el, v: toVec(m.lon, m.lat, 1.01) };
    });
    dirty = true;
  }
  function selectMarker(id) { for (const m of markers) m.el.classList.toggle("on", m.id === id); }

  // Vue : lacet (yaw), tangage (pitch) et distance de la caméra
  const st = { yaw: 0, pitch: 25 * DEG, zoom: 1, flight: null, drag: null, lastUser: 0, spin: true };
  let fit = 4;  // distance de caméra à laquelle la Terre (et son halo) tient dans la scène, recalculée à chaque redimensionnement
  function aim(lon, lat) {  // angles qui amènent (lon, lat) face à la caméra
    const v = toVec(lon, lat, 1);
    return { yaw: -Math.atan2(v.x, v.z), pitch: lat * DEG };
  }
  function flyTo(lon, lat, zoom = 1.5, ms = 2000) {
    const to = aim(lon, lat);
    let dy = to.yaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));  // chemin le plus court
    st.flight = { y0: st.yaw, y1: st.yaw + dy, p0: st.pitch, p1: to.pitch, d0: st.zoom, d1: zoom, t: performance.now(), ms: still ? 1 : ms };
  }
  {
    const a = aim(opts.lon ?? 45, opts.lat ?? 25);
    st.yaw = a.yaw; st.pitch = a.pitch;
  }

  // Souris : glisser, molette, clic
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => {
    st.drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, moved: false };
    st.flight = null; el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!st.drag) return;
    const k = 0.0055 / st.zoom;
    const dx = e.clientX - st.drag.x, dy = e.clientY - st.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) st.drag.moved = true;
    st.yaw = st.drag.yaw + dx * k;
    st.pitch = Math.max(-80 * DEG, Math.min(80 * DEG, st.drag.pitch + dy * k));
    st.lastUser = performance.now(); dirty = true;
  });
  const up = (e) => {
    if (st.drag && !st.drag.moved) pick(e);
    st.drag = null; st.lastUser = performance.now();
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", () => { st.drag = null; });
  el.addEventListener("wheel", (e) => {
    e.preventDefault(); st.flight = null;
    st.zoom = Math.max(0.6, Math.min(ZMAX, st.zoom * Math.exp(-e.deltaY * 0.0012)));
    st.lastUser = performance.now(); dirty = true;
  }, { passive: false });
  let drawMode = false;
  function pick(e) {
    const b = el.getBoundingClientRect();
    const sx = e.clientX - b.left, sy = e.clientY - b.top;
    // 1) point le plus proche à l'écran (≤ 10 px), parmi les jeux cliquables (sauf en mode dessin : le clic est un lieu)
    let best = null, bestD = drawMode ? -1 : 100;
    for (const [key, set] of pointSets) {
      if (!opts.clickable || !opts.clickable.includes(key)) continue;
      for (const p of set.list) {
        const v = toVec(p.lon, p.lat, set.r).applyMatrix4(globe.matrixWorld);
        if (v.clone().sub(camera.position).dot(v) > 0) continue;  // face cachée
        const s = v.clone().project(camera), x = (s.x + 1) / 2 * b.width, y = (1 - s.y) / 2 * b.height;
        const d = (x - sx) ** 2 + (y - sy) ** 2;
        if (d < bestD) { bestD = d; best = { key, p }; }
      }
    }
    if (best && opts.onPickPoint) { opts.onPickPoint(best.key, best.p.data); return; }
    // 2) sinon, le pays sous le clic
    ndc.set((sx / b.width) * 2 - 1, -(sy / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(earth)[0];
    if (hit && opts.onPickLonLat) opts.onPickLonLat(toLonLat(globe.worldToLocal(hit.point.clone())));
  }

  // Taille et boucle d'affichage
  let W = 0, H = 0, dirty = true, alive = true, raf = 0;
  function size() {
    W = container.clientWidth; H = container.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / Math.max(1, H); camera.updateProjectionMatrix();
    const half = Math.min(Math.tan((camera.fov * DEG) / 2), Math.tan((camera.fov * DEG) / 2) * camera.aspect);
    fit = 1.12 / half + 0.2;
    ptsMat.uniforms.scale.value = renderer.getPixelRatio();
    dirty = true;
  }
  const ro = new ResizeObserver(size);
  ro.observe(container);
  size();
  const tmp = new THREE.Vector3();
  let fps = 0, frames = 0, fpsT = performance.now();
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    frames++;
    if (now - fpsT >= 1000) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
    if (document.hidden) return;
    if (st.flight) {
      const f = Math.min(1, (now - st.flight.t) / st.flight.ms), e = f < 0.5 ? 4 * f ** 3 : 1 - (-2 * f + 2) ** 3 / 2;
      st.yaw = st.flight.y0 + (st.flight.y1 - st.flight.y0) * e;
      st.pitch = st.flight.p0 + (st.flight.p1 - st.flight.p0) * e;
      st.zoom = st.flight.d0 + (st.flight.d1 - st.flight.d0) * e;
      if (f >= 1) st.flight = null;
      dirty = true;
    } else if (!still && !st.drag && st.spin && now - st.lastUser > 12000 && (!opts.autoSpin || opts.autoSpin())) {
      st.yaw += 0.0006; dirty = true;  // rotation lente au repos
    }
    if (!still) { laneMat.uniforms.time.value = now / 1000; dirty = dirty || !!lanes; }
    if (!dirty && !markers.length) return;
    globe.rotation.set(st.pitch, st.yaw, 0, "XYZ");
    camera.position.set(0, 0, close ? 1 + (fit - 1) / st.zoom : Math.max(1.25, fit / st.zoom)); camera.lookAt(0, 0, 0);
    globe.updateMatrixWorld();
    renderer.render(scene, camera);
    // marqueurs HTML : position écran, masqués sur la face cachée
    for (const m of markers) {
      tmp.copy(m.v).applyMatrix4(globe.matrixWorld);
      const facing = tmp.dot(tmp.clone().sub(camera.position)) < 0;
      if (!facing || st.zoom < (m.minZoom || 0) || st.zoom > (m.maxZoom || Infinity)) { m.el.hidden = true; continue; }
      const s = tmp.project(camera);
      m.el.hidden = false;
      m.el.style.transform = `translate(${((s.x + 1) / 2) * W}px, ${((1 - s.y) / 2) * H}px)`;
    }
    dirty = false;
  }
  raf = requestAnimationFrame(frame);

  return {
    setBorders, setLanes, setPoints, setFills, setOutlines, setCircles, setMarkers, selectMarker, flyTo, setPatch, setOverlays,
    setDrawMode(on) { drawMode = !!on; el.style.cursor = on ? "crosshair" : ""; },
    zoomBy(k) {  // pendant un vol, ajuste le zoom d'arrivée au lieu d'interrompre le vol
      if (st.flight) st.flight.d1 = Math.max(0.6, Math.min(ZMAX, st.flight.d1 * k));
      else st.zoom = Math.max(0.6, Math.min(ZMAX, st.zoom * k));
      st.lastUser = performance.now(); dirty = true;
    },
    get zoom() { return st.zoom; },
    get fps() { return fps; },
    setStyle(mode) { earthMat.uniforms.mode.value = { nuit: 0, jour: 1, retro: 2 }[mode] ?? 2; dirty = true; },
    setSpin(on) { st.spin = on; },
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); container.replaceChildren(); },
    get alive() { return alive && container.isConnected; },
  };
}
