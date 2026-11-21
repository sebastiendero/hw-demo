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


## Globe 3D et mode Monde (rubrique Situation) — `vendor/three/`, `vendor/world/`, `vendor/fonts/`

| Fichier | Version | Source | Intégrité / provenance |
|---|---|---|---|
| `three/three.module.js`, `three/three.core.js` | 0.186.1 | npm `three` (MIT, `three/LICENSE-three`) | archive `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==` (identique au registre) |
| `world/textures/earth-day-4k.jpg` | — | NASA Blue Marble Next Generation, topographie et bathymétrie, décembre 2004 (`eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg`, SHA-256 `a9f00889…c042`), réduit en 4096 × 2048 | domaine public (NASA) |
| `world/textures/earth-night-4k.jpg` | — | NASA Black Marble 2016, 3 km (`…/144000/144898/BlackMarble_2016_3km.jpg`, SHA-256 `230aac44…6725`), réduit en 4096 × 2048 | domaine public (NASA) |
| `world/textures/earth-relief-2k.jpg` | — | GEBCO 2008 via NASA Visible Earth (`…/73000/73934/gebco_08_rev_elev_21600x10800.png`, SHA-256 `4a70590d…c699`), réduit en 2048 × 1024 | domaine public (GEBCO / NASA, attribution) |
| `world/textures/gulf-day.jpg`, `world/textures/gulf-night.jpg` | — | NASA EOSDIS GIBS, WMS EPSG:4326, couches `BlueMarble_ShadedRelief_Bathymetry` et `VIIRS_Black_Marble` (500 m), golfe Persique et détroit d'Ormuz (51–60,5° E, 22–28,5° N), 2109 × 1443 ; adresses exactes et empreintes dans `world/textures/gulf.json`, reconstruites par `scripts/world/build_gulf.py` | SHA-256 `e0ebc9a6…5ddf` (jour) et `c21a74a8…3346` (nuit) ; imagerie NASA sans restriction, mention « NASA EOSDIS GIBS » |
| `world/shipping-lanes.json` | 1.3.1 | Benden, P. (2022), Global Shipping Lanes, Zenodo doi:10.5281/zenodo.6361763 (archive md5 `c61e76207f9fc2e683a1f2565ddbc1fa`), niveaux « Major » et « Middle », simplifiés (RDP 0,05°) | CC BY-NC 4.0 selon Zenodo (le dépôt indique CC BY 4.0 hors Statista) : usage personnel avec attribution ; `world/LICENSE-shipping-lanes` |
| `fonts/poppins-*.woff2` | 5.3.0 | npm `@fontsource/poppins` (OFL-1.1, `fonts/LICENSE-poppins`) | `sha512-cms1nM7U6SN8epIV1WMVOV8VsA645aSm3wHfzIQnkk188U341ThbJGSl2Sv54V29gnDbT2arMPfLzvVIIVCceQ==` |
| `fonts/ibm-plex-mono-*.woff2` | 5.3.0 | npm `@fontsource/ibm-plex-mono` (OFL-1.1, `fonts/LICENSE-ibm-plex-mono`) | `sha512-eTgnZjZEGk1QtD3ZstF+Vclo2HLAni8YMy34/DxllwZvyz1lR/1RF/xTiAquOBO7MvqBx8D2Ig2WCPMVfdZu7Q==` |

Les jeux `world/conflicts.json`, `world/conflict-points.json`, `world/countries.json`, `world/bases.json` et
`world/nuclear.json` sont décrits dans `world/PROVENANCE.md` (UCDP, UNHCR, Wikidata, Banque mondiale, votes à l'ONU,
Wikipédia), avec le script qui les reconstruit.
