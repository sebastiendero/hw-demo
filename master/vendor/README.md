# Bibliothèques copiées

| Fichier | Version | Source | Intégrité |
|---|---|---|---|
| `lightweight-charts.standalone.production.js` | 5.2.1 | paquet npm `lightweight-charts` (TradingView, Apache-2.0), archive `https://registry.npmjs.org/lightweight-charts/-/lightweight-charts-5.2.1.tgz` | archive : `sha512-IVwoK1RLFiLPubaKIjNbtjWLnpPMqiABSrTay6whmNa8L1+19292VtHJ+BWyPUuLCwF0tcQlhEWd1CLB2a1nsQ==` (identique au registre) ; fichier : SHA-256 `e21cc5caa0226ef30bd8549c50b9ef926615f2a4ee6b4e486353477a55f598cf` |
| `fonts/Geist-Variable.woff2`, `fonts/GeistMono-Variable.woff2` | 1.8.2 | paquet npm `geist` (Vercel, SIL OFL 1.1), archive `https://registry.npmjs.org/geist/-/geist-1.8.2.tgz` | archive : `sha512-fRF4sbJ9qcCxPb35cVtKBAwYlTt1IbU9nkbPi0a+xyZqPIjCJ2BY8ekGhx6/SGSZKrR7/UuL57r/eeDQ1Xy11g==` (identique au registre) ; fichiers : SHA-256 `206f01ed08e05c98a51daa7472331c3c71bbb8c1f9d55ea8c70074f3c528a706` et `55419aa06f58adcd7f145c6c920e56936416f17e528f60efc6032ffa4269972b` |
| tracés d'icônes recopiés dans `app.js` (dictionnaire `ICONS`) | 1.0.0 | paquet npm `@flux-icons/react` (Flux Icons, MIT), style « stroke » arrondi, archive `https://registry.npmjs.org/@flux-icons/react/-/react-1.0.0.tgz` | archive : `sha512-42YZBit9xJ1V3f0xRPnhIuiF4DgeNGqhDz9+9HvOrJM9Uoz4miB4+ZIZnIkPpEZHjOgVx0hmA8i5/JoreMjr1A==` (identique au registre) ; seuls les attributs `d` sont copiés, aucun code du paquet n'est chargé |

Licence : `LICENSE-lightweight-charts`. Le logo d'attribution TradingView reste activé (`attributionLogo: true`).

Licences : `LICENSE-geist` (OFL), `LICENSE-flux-icons` (MIT, copiée du dépôt `codewithevilxd/flux-icons`, le paquet n'en contient pas).
Les polices manquent dans la version en ligne tant que `master/publish.py` ne copie pas `vendor/fonts/` : la page retombe alors sur la police du système.

## Globe (rubriques Situation et Développements) — `vendor/geo/`

| Fichier | Version | Source | Intégrité de l'archive (identique au registre) |
|---|---|---|---|
| `d3-geo.min.js` | 3.1.1 | npm `d3-geo` (ISC) | `sha512-637ln3gXKXOwhalDzinUgY83KzNWZRKbYubaG+fGVuc/dxO64RRljtCTnf5ecMyE1RIdtqpkVcq0IbtU2S8j2Q==` |
| `d3-array.min.js` | 3.2.4 | npm `d3-array` (ISC), requis par d3-geo | `sha512-tdQAmyA18i4J7wprpYq8ClcxZy3SC31QMeByyCFyRt7BVHdREQZ5lpzoe5mFEYZUWe+oq8HBvk9JjpibyEV4Jg==` |
| `topojson-client.min.js` | 3.1.0 | npm `topojson-client` (ISC) | `sha512-605uxS6bcYxGXw9qi62XyrV6Q3xwbndjachmNxu8HWTtVPxZfEJN9fd/SZS1Q54Sn2y0TMyMxFj/cJINqGHrKw==` |
| `countries-110m.json`, `countries-50m.json` | 2.0.2 | npm `world-atlas` (ISC ; données Natural Earth, domaine public) | `sha512-IXfV0qwlKXpckz1FhwXVwKRjiIhOnWttOskm5CtxMsjgE/MXAYRHWJqgXOpM8IkcPBoXnyTU5lFHcYa5ChG0LQ==` |

Licences : `geo/LICENSE-*`. Aucun fichier n'est chargé depuis un CDN.
