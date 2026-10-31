# Provenance du jeu de données « pays du monde »

Construit le 2026-10-25 (UTC) par `build_countries.py` (bibliothèque standard Python uniquement). Aucun contenu
d'insidegeopolitics.com n'a été consulté ni repris. Toutes les requêtes portent le User-Agent
`MasterPortal/1.0 (usage personnel)`, au plus une par seconde et par hôte (5 s pour digitallibrary.un.org,
10 s pour missilethreat.csis.org et sipri.org, conformément à leur `Crawl-delay`). Aucun compte, aucune clé,
aucun contournement de protection anti-robot.

## Fichiers

| Fichier | Contenu |
|---|---|
| `countries.json` | 174 entités, indexées par l'identifiant numérique world-atlas (chaîne, ex. `"364"`) |
| `bases.json` | 154 bases militaires situées hors du pays qui les opère |
| `nuclear.json` | les 9 États dotés de l'arme nucléaire |
| `build_countries.py` | le script ; cache brut dans `cache/` (≈ 295 Mo, non livré) |

Couverture : les 177 géométries de `countries-110m.json`, moins les trois qui n'ont pas d'identifiant (Chypre du
Nord, Somaliland, Kosovo). Elles ne peuvent pas être indexées par un id numérique.

Champs ajoutés au schéma demandé : `name_fr_official` (libellé Wikidata, ex. « République populaire de Chine »),
`un_votes_counted` (nombre de votes enregistrés pris en compte), `summary_revision` (révision Wikipédia citée),
`wikidata` (QID) ; dans `nuclear.json`, `warheads_stockpile` (stock militaire) et `range_text` (valeur affichée par
la source).

### Taux de remplissage (sur 174)

| Champ | Rempli | Remarque |
|---|---|---|
| iso2, name_fr, summary_fr | 174 (100 %) | |
| capital | 172 (98,9 %) | manquent : Antarctique, Sahara occidental |
| head_of_state | 168 (96,6 %) | manquent : Antarctique, TAAF, Nouvelle-Calédonie, Porto Rico, Sahara occidental, Guinée-Bissau |
| head_of_government | 165 (94,8 %) | manquent aussi Botswana, Tchad, Pérou, Syrie, Venezuela, Malouines (aucune déclaration Wikidata en cours) |
| population | 169 (97,1 %) | toutes de 2025 ; manquent Taïwan, Malouines, TAAF, Sahara occidental, Antarctique |
| gdp_usd | 168 (96,6 %) | 157 de 2025, les autres plus anciennes (année indiquée) |
| milex_pct_gdp | 159 (91,4 %) | 143 de 2025 ; certaines anciennes (EAU 2014…) : l'année est toujours donnée |
| blocs (non vide) | 120 (69,0 %) | les autres pays n'appartiennent à aucun des 11 blocs suivis |
| un_vote_partners / adversaries | 164 (94,3 %) | manquent les non-membres (Taïwan, Palestine — observateur sans vote —, territoires) et le Venezuela (77 votes seulement : droit de vote suspendu depuis la 77e session) |
| export_partners / import_partners / trade_year | 171 (98,3 %) | manquent Antarctique, Sahara occidental, Porto Rico (inclus dans les États-Unis par BACI) |

Effectifs des blocs : OTAN 32, UE 27, OTSC 6, OCS 10, BRICS 10, CCG 6, Ligue arabe 22, UA 54, ASEAN 11, OPEP 11,
OPEP+ 22.

---

## Sources utilisées

### 1. Wikidata, via le point SPARQL public QLever

- **URL exacte** : `https://qlever.dev/api/wikidata` (POST `query=…`). 66 requêtes, toutes en HTTP 200 ; première
  le 2026-10-25 à 13:32:48 UTC, essais préalables à partir de 13:17 UTC. Une requête à prédicat variable a expiré
  côté serveur (HTTP 429 « Operation timed out ») pendant la mise au point ; elle a été réécrite.
- **Index** : « Complete Wikidata, TTL from dumps.wikimedia.org (latest-all.ttl.bz2 from 10.08.2026), updated
  LIVE » (réponse de `?cmd=stats`).
- **robots.txt** : `https://qlever.dev/robots.txt` répond 404 (aucun fichier) : rien n'est interdit.
- **Pourquoi pas query.wikidata.org** : son `robots.txt` (lu le 2026-10-25 à 13:13 UTC, HTTP 200) contient
  `User-agent: *` / `Disallow: /sparql` / `Disallow: /bigdata`. Le point d'accès suggéré n'a donc **jamais été
  appelé**. Pour la même raison, `www.wikidata.org/w/api.php` et `Special:EntityData` (`Disallow: /w/`,
  `Disallow: /wiki/Special:`) n'ont pas été utilisés.
- **Licence** : données Wikidata sous CC0. Citation exacte de
  <https://www.wikidata.org/wiki/Wikidata:Licensing> (lue le 2026-10-25, HTTP 200) : « All structured data (i.e.
  the main, Property, Lexeme, and EntitySchema namespaces) is released into the public domain under Creative
  Commons Zero. » Licence : <https://creativecommons.org/publicdomain/zero/1.0/>. QLever (Université de Fribourg)
  ne publie pas de conditions d'utilisation sur qlever.dev ; aucune limite affichée.
- **Champs** : `iso2` (P297), nom (`rdfs:label` fr, repli « mul » puis en ; `name_fr` reprend le titre de
  l'article Wikipédia sans précision entre parenthèses), capitale (P36) et ses coordonnées (P625), chef d'État
  (P35), chef de gouvernement (P6), blocs (P463 côté pays et P527 côté organisation), bases (voir plus bas),
  souveraineté des territoires (P17), titre de l'article frwiki (`schema:about`).
- **Règles** : on ne garde que les déclarations non dépréciées et sans date de fin (P582) ; rang « préféré »
  d'abord, puis date de début la plus récente. Plusieurs titulaires de rang préféré sont joints par « ; » (ex.
  présidence collégiale de Bosnie-Herzégovine).
- **Attribution à afficher** : « Données : Wikidata (CC0) ».
- **Limites** : Wikidata peut être en retard sur l'actualité. Exemples relevés : chef de gouvernement du Soudan
  (Abdallah Hamdok), de l'Arabie saoudite (Salmane), président de la Birmanie (Myint Swe). Le libellé de l'id 010
  est « Région du Traité sur l'Antarctique ».

#### Blocs : corrections appliquées

Les déclarations Wikidata sont lacunaires (Danemark et Pays-Bas portés par d'autres éléments, OPEP+ décrite par
ses seuls participants non OPEP) ou en retard. Le script :

1. fait l'union des deux sens (P463 / P527), en excluant les rôles « candidat » (Q54875338) et « observateur »
   (Q818553) ;
2. rattache Q55 (Pays-Bas) à NL et Q756617 (royaume de Danemark) à DK ;
3. calcule OPEP+ = OPEP ∪ participants OPEP+ listés par Wikidata ;
4. applique les corrections ci-dessous. Chacune a été vérifiée sur la page Wikipédia indiquée, lue en HTML
   (`/wiki/…`, autorisé) le 2026-10-25 vers 13:30 UTC, HTTP 200 :

| Bloc | Pays | Sens | Raison | Source |
|---|---|---|---|---|
| OPEP | AO | retrait | retrait effectif le 21 décembre 2023 | [OPEP](https://fr.wikipedia.org/wiki/Organisation_des_pays_exportateurs_de_p%C3%A9trole) |
| OPEP, OPEP+ | AE | retrait | « Les Émirats arabes unis annoncent le 28 avril 2026 leur décision de quitter l'OPEP et l'alliance OPEP+ », effectif le 1er mai 2026 | idem |
| OPEP+ | BR | ajout | Brésil listé parmi les participants OPEP+ de l'infobox | idem |
| OTSC | KP | retrait | absent des six membres listés | [OTSC](https://fr.wikipedia.org/wiki/Organisation_du_trait%C3%A9_de_s%C3%A9curit%C3%A9_collective) |
| ASEAN | AU | retrait | non membre | [ASEAN](https://fr.wikipedia.org/wiki/Association_des_nations_de_l%27Asie_du_Sud-Est) |
| ASEAN | PG | retrait | « statut d'observateur depuis 1976 » | idem |
| BRICS | SA | retrait | invitée, « n'a pas encore confirmé son acceptation » ; l'infobox liste 10 États membres | [BRICS](https://fr.wikipedia.org/wiki/BRICS) |

Les sites officiels n'ont pas pu servir de référence : `www.opec.org` répond 403 (y compris pour son
robots.txt) et `asean.org` répond 307 vers une page de contrôle.

Autres limites : l'UA compte 54 membres, la République arabe sahraouie démocratique n'étant pas rattachée à l'id 732
(Sahara occidental). Arménie (participation gelée à l'OTSC) et Syrie (Ligue arabe) sont comptées comme membres.

#### Bases militaires (`bases.json`)

- **Requête** : éléments instance de base militaire (Q245016) ou d'une sous-classe, avec opérateur (P137), pays
  (P17) et coordonnées (P625). Exclus : les déclarations opérateur ou pays qui ont une date de fin ; les bases
  avec date de dissolution (P576), de fermeture (P3999) ou de retrait (P730) ; l'état d'usage « déclassé »
  (Q11639308). L'opérateur est un pays ou une armée rattachée à un pays (P17 de l'opérateur). Les pays disparus
  (RDA…) sont exclus. On garde les bases où le pays opérateur ≠ pays hôte, et l'hôte n'est pas un territoire de
  l'opérateur (Groenland pour le Danemark, Nouvelle-Calédonie pour la France…).
- `source` : page Wikidata de la base. Répartition : US 94, RU 17, GB 13, FR 7, DE 5, BE 4, CA 3, autres 11.
- **Limites importantes** : la couverture est incomplète (beaucoup de bases n'ont pas d'opérateur renseigné). Des
  bases fermées restent présentes faute de date de fermeture dans Wikidata : bases américaines en Afghanistan
  (Bagram…), bases françaises d'Algérie, du Maroc, du Tchad et du Niger, entre autres. Les bases russes en Crimée
  ont pour hôte l'Ukraine (P17). À afficher comme « bases recensées par Wikidata », pas comme un inventaire.

### 2. Banque mondiale, API v2

- **URL exactes** :
  - `https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=500`
  - même forme pour `NY.GDP.MKTP.CD` (PIB, USD courants) et `MS.MIL.XPND.GD.ZS` (dépenses militaires, % du PIB)
  - `mrnev=1` donne la dernière valeur non vide de chaque pays, avec son année.
- **Vérification** : 2026-10-25 à 13:33:28 UTC, HTTP 200 (dernière mise à jour annoncée par l'API : 2026-10-08).
- **robots.txt** : `https://api.worldbank.org/robots.txt` répond 404 (aucun fichier) : rien n'est interdit.
- **Licence** : CC BY 4.0. Citation de la fiche du catalogue
  <https://datacatalog.worldbank.org/search/dataset/0037712/World-Development-Indicators> : « This dataset is
  licensed under Creative Commons Attribution 4.0 ». La page est rendue en JavaScript : la phrase a été lue via
  un outil de rendu, l'API du catalogue (`datacatalogapi.worldbank.org`) ayant répondu 429 à chaque essai.
  Conditions : <https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets> ; licence :
  <https://creativecommons.org/licenses/by/4.0/>.
- **Attribution à afficher** : « Banque mondiale, Indicateurs du développement dans le monde (CC BY 4.0) ».
  Pour les dépenses militaires, l'API indique comme source amont « SIPRI Military Expenditure Database ».
- **Limites** : rien pour Taïwan (non couvert par la Banque mondiale) ni pour les territoires sans série. Les
  années varient d'un pays à l'autre ; l'année est toujours fournie.

### 3. Votes à l'Assemblée générale des Nations unies

- **URL exacte** : `https://digitallibrary.un.org/record/4060887/files/2026_10_15_votes_ga.csv?version=1`. Elle
  redirige (302) vers `/nanna/record/4060887/files/…?registerDownload=1`, qui répond 200 (368 130 256 octets).
  Téléchargé une fois en flux le 2026-10-25 à 13:33:31 UTC ; seule la fenêtre utile est gardée en cache.
- **Jeu de données** : « United Nations General Assembly Voting Data: resolutions 1 (11 December 1946) to 81/1
  (17 September 2026) », version 6 du 15 octobre 2026, Bibliothèque Dag Hammarskjöld.
- **robots.txt** : `https://digitallibrary.un.org/robots.txt` (HTTP 200) : `User-agent: *`, `Crawl-Delay: 5`,
  `Disallow: /rss`, `/search`, `/record/*/export/*`. Le chemin `/record/4060887/files/` est **autorisé** ; délai
  de 5 s respecté.
- **Licence** : ce n'est **pas** une licence ouverte au sens CC. Citation exacte du fichier de description joint
  (`2026_10_15_votes_ga_1.md`) : « Copyright, United Nations; Non commercial use, with attribution; refer to
  applicable terms of use ». Conditions : <https://digitallibrary.un.org/pages/?ln=en&page=tos> et
  <https://www.un.org/en/about-us/terms-of-use>. Cela convient à un portail personnel non commercial.
- **Citation à afficher** (forme demandée par la source) : « United Nations Dag Hammarskjöld Library, United
  Nations General Assembly Voting Data: resolutions 1 (11 December 1946) to 81/1 (17 September 2026), United
  Nations, 2026, downloaded from https://digitallibrary.un.org/record/4060887, 2026-10-25 ».
- **Méthode** :
  - **Fenêtre** : sessions ordinaires 76 à 80, plus les votes des sessions extraordinaires d'urgence datés après le
    14/09/2021. Cela fait 576 votes enregistrés, du 1/12/2021 au 4/09/2026.
  - **Codage** : oui = 1, abstention = 0, non = −1 ; « X » (absent, non votant) est ignoré.
  - **Accord d'une paire** : moyenne de 1 − |a − b| / 2 sur les votes communs, à condition d'en avoir au moins 100.
  - **Classement** : `un_vote_partners` = les 8 accords les plus élevés, `un_vote_adversaries` = les 8 plus faibles.
    Seuls les pays dessinés sur le globe sont classés : les micro-États absents de la carte 110m sont donc exclus.
- **À afficher** : il s'agit d'une **proximité de vote**, pas d'une alliance. Deux pays « adversaires » au sens de
  ce calcul votent souvent différemment ; cela ne dit rien de leurs relations bilatérales.
- **Source suggérée écartée** : Erik Voeten et al., Harvard Dataverse, doi:10.7910/DVN/LEJUQZ (CC0, version 39
  du 30/07/2026, qui contient en fait des scores d'accord et des points idéaux). Le `robots.txt` actuel de
  dataverse.harvard.edu est illisible : il renvoie HTTP 202 avec `x-amzn-waf-action: challenge`, un défi
  anti-robot qu'on ne contourne pas. La dernière copie archivée en 200 (Wayback Machine, 26/03/2025) dit
  `User-agent: *` / `Disallow: /`, et `Disallow: /api` pour les robots autorisés. Source donc non utilisée. Un
  seul appel de métadonnées (`/api/datasets/:persistentId?persistentId=doi:10.7910/DVN/LEJUQZ`, HTTP 200) avait
  été fait avant de lire la copie archivée ; aucun fichier n'a été téléchargé.

### 4. Commerce : CEPII BACI (HS22, version 202601)

- **URL exacte** : `https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS22_V202601.zip` (301 386 611 octets,
  dernière modification 22/01/2026). Téléchargé une fois le 2026-10-25 à 13:34:25 UTC, HTTP 200. Page de
  présentation : <https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37> (HTTP 200).
- **robots.txt** : `https://www.cepii.fr/robots.txt` (HTTP 200) n'interdit que des espaces privés (`/ESPACE_ADMIN/`,
  `/base/`, …). `/DATA_DOWNLOAD/` et `/CEPII/` sont **autorisés**.
- **Licence** : la page indique « Licence: Etalab 2.0 », c'est-à-dire la Licence Ouverte / Open Licence 2.0
  (<https://www.etalab.gouv.fr/licence-ouverte-open-licence/>) : réutilisation libre, y compris commerciale, avec
  mention de la paternité.
- **Attribution à afficher** : « CEPII, BACI (HS22, version 202601), Licence Ouverte Etalab 2.0 — Gaulier, G. et
  Zignago, S. (2010), BACI: International Trade Database at the Product-Level, CEPII Working Paper 2010-23 ».
- **Méthode** :
  - Données de l'année 2024 (fichier `BACI_HS22_Y2024_V202601.csv`), sommées sur tous les produits pour chaque paire
    exportateur → importateur.
  - Valeurs en milliers d'USD dans BACI, converties en USD.
  - `export_partners` : les 6 premières destinations du pays ; `import_partners` : les 6 premières origines. Les
    partenaires peuvent être hors carte (Hong Kong, Singapour…).
  - Le code BACI 490 (« Other Asia, nes ») est rattaché à Taïwan. L'alpha-2 manquant de la Namibie (« NA » lu comme
    valeur absente) est retrouvé par l'alpha-3.
- **Limites** : BACI réconcilie les déclarations des deux partenaires, avec des valeurs FOB. Elles peuvent différer
  des statistiques nationales. Porto Rico est inclus dans les États-Unis.
- **Source suggérée écartée** : WITS (`https://wits.worldbank.org/API/V1/SDMX/V21/datasource/tradestats-trade/…`),
  pourtant accessible (HTTP 200, robots.txt qui n'interdit que `/cgi-bin/`). Ses données TradeStats dérivent d'UN
  Comtrade, et la FAQ WITS (<https://wits.worldbank.org/Faqs.html>) précise : « They are made available for
  internal use only and may not be re-disseminated in any form without written permission of the United Nations
  Statistics Division (UNSD). » Ce n'est pas une licence ouverte ; un seul appel de test a été fait. UN Comtrade
  (API complète avec clé) n'a pas été essayé.

### 5. Résumés : Wikipédia en français (pages d'articles HTML)

- **URL exactes** : `https://fr.wikipedia.org/wiki/<titre>`, une par pays ; le titre vient du lien frwiki de
  Wikidata. 174 pages, toutes en HTTP 200, le 2026-10-25 entre 13:34:48 et ≈ 13:38 UTC.
- **robots.txt** : `https://fr.wikipedia.org/robots.txt` (HTTP 200), bloc `User-agent: *` :
  - `/wiki/<article>` est **autorisé** ;
  - `Disallow: /api/` interdit `/api/rest_v1/page/summary/`. Ce point d'accès suggéré n'a **jamais été appelé**.
  - `Disallow: /w/` sauf `Allow: /w/api.php?action=mobileview&`. Un unique appel de test à
    `/w/api.php?action=mobileview&…` (préfixe explicitement autorisé) a renvoyé 200 avec l'erreur
    « Unrecognized value for parameter "action": mobileview » ; il n'a pas servi.
- **Méthode** : on prend le premier paragraphe de plus de 80 caractères de la section d'introduction (HTML Parsoid,
  section 0).
  - Retirés : appels de note, prononciations, et parenthèses de gloses (noms en écriture étrangère, transcriptions).
  - Le texte est coupé à 350 caractères au plus, à la fin d'une phrase quand c'est possible, sinon avec « … ».
  - Le texte est donc **abrégé**, ce qu'il faut signaler dans l'attribution.
- **Licence** : CC BY-SA 4.0. Citation exacte du pied de page des articles : « les textes sont disponibles sous
  licence Creative Commons attribution, partage dans les mêmes conditions ; d'autres conditions peuvent
  s'appliquer ». Licence : <https://creativecommons.org/licenses/by-sa/4.0/deed.fr> ; règles de réutilisation :
  <https://fr.wikipedia.org/wiki/Wikip%C3%A9dia:Citation_et_r%C3%A9utilisation_du_contenu_de_Wikip%C3%A9dia>.
- **Attribution à afficher sous chaque résumé** : « Extrait abrégé de l'article « <titre> » de Wikipédia
  (<summary_source>, révision <summary_revision>), auteurs : contributeurs de Wikipédia, licence CC BY-SA 4.0 ».
  Le partage dans les mêmes conditions s'applique au texte du résumé, pas au reste du portail.
- **Limites** : certaines introductions sont très courtes (Gambie, Monténégro). L'id 010 renvoie à l'article
  « Traité sur l'Antarctique ».

### 6. Nucléaire (`nuclear.json`) : tableau saisi à la main, chaque valeur sourcée

- **Ogives** (`warheads`, `warheads_stockpile`, `warheads_year` = 2026) : SIPRI Yearbook 2026, état au 1er janvier
  2026. `warheads` = « Total inventaire », `warheads_stockpile` = « Stock militaire ».
  - Communiqué : <https://www.sipri.org/media/press-release/2026/increasing-focus-nuclear-weapons-amid-heightened-escalation-risks-new-sipri-yearbook-out-now>,
    lu le 2026-10-25 vers 13:20 UTC (HTTP 200, via la redirection de `https://www.sipri.org/node/7895`). Le tableau
    n'y est qu'en image ; les chiffres ont été lus dans la version française du communiqué,
    <https://www.sipri.org/sites/default/files/WNF%202026%20PR%20FRE.pdf> (HTTP 200, 348 152 octets), tableau
    « Forces nucléaires mondiales – janvier 2026 ».
  - Valeurs : US 5 042 (stock 3 700), RU 5 420 (4 400), GB 225 (225), FR 370 (290), CN 620 (620), IN 190 (190),
    PK 170 (170), KP 60 (60), IL 90 (90). Total : 12 187.
  - Notes SIPRI à reprendre à l'affichage : la hausse de l'inventaire français vient d'ogives retirées mais pas
    encore démantelées, qui n'étaient pas comptées auparavant ; les estimations sur la Corée du Nord sont très
    incertaines.
- **Portée** (`max_range_km`, `range_text`, `delivery`) : fiches CSIS Missile Threat (Center for Strategic and
  International Studies) du vecteur le plus long de chaque pays, lues le 2026-10-25 vers 13:22 UTC puis relues à
  13:40 UTC par `--verifier-nucleaire` (9/9 valeurs retrouvées) :
  - [minuteman-iii](https://missilethreat.csis.org/missile/minuteman-iii/) : 13 000 km
  - [ss-18](https://missilethreat.csis.org/missile/ss-18/) : 16 000 km (Mod 5) ; il n'y a pas de fiche Sarmat (404)
  - [trident](https://missilethreat.csis.org/missile/trident/) : 12 000 km au maximum
  - [m51](https://missilethreat.csis.org/missile/m51/) : 8 000 km
  - [df-41](https://missilethreat.csis.org/missile/df-41/) : 12 000 à 15 000 km
  - [agni-5](https://missilethreat.csis.org/missile/agni-5/) : 5 000 à 8 000 km ; statut « In development » selon
    la fiche
  - [shaheen-3](https://missilethreat.csis.org/missile/shaheen-3/) : 2 750 km
  - [hwasong-18](https://missilethreat.csis.org/missile/hwasong-18/) : 15 000 km, comme
    [hwasong-17](https://missilethreat.csis.org/missile/hwasong-17/)
  - [jericho-3](https://missilethreat.csis.org/missile/jericho-3/) : 4 800 à 6 500 km

  `max_range_km` retient la borne haute de la fourchette.
- **robots.txt** :
  - `www.sipri.org` (HTTP 200) : `User-agent: *`, `crawl-delay: 10`, interdits limités à `/core/`, `/profiles/`,
    `/admin/`, `/search/`, `/user/…`. Les pages de presse et `/sites/default/files/` sont autorisées.
  - `missilethreat.csis.org` (HTTP 200) : `User-agent: *`, `Disallow:` (vide), `Crawl-delay: 10`. Tout est
    autorisé ; délai respecté.
- **Licence** : ni le SIPRI (« © SIPRI 2026 ») ni le CSIS (« © 2026 Center for Strategic and International
  Studies. All rights reserved. ») ne publient sous licence ouverte. On ne reprend que des **faits chiffrés
  isolés** (nombres d'ogives, portées), sans texte, avec citation de la source.
- **Attribution à afficher** : « Ogives : SIPRI Yearbook 2026 (estimations au 1er janvier 2026). Portées : CSIS
  Missile Threat ». Forme de citation proposée par CSIS : Missile Defense Project, "<missile>," Missile Threat,
  Center for Strategic and International Studies, <URL>.
- **Limites** : les portées sont des estimations publiques. Le vecteur le plus long n'est pas toujours le plus
  représentatif (Agni-V en développement selon CSIS ; Jericho III non confirmé officiellement). Les chiffres
  d'ogives sont des estimations de source ouverte.

---

## Sources inaccessibles ou écartées (résumé)

| Source suggérée | Verdict | Remplacement |
|---|---|---|
| query.wikidata.org/sparql | robots.txt : `Disallow: /sparql` | QLever (`qlever.dev/api/wikidata`), mêmes données CC0 |
| fr.wikipedia.org/api/rest_v1/page/summary | robots.txt : `Disallow: /api/` | page HTML `/wiki/<titre>` |
| Harvard Dataverse (Voeten, LEJUQZ) | robots.txt illisible (défi AWS WAF, 202) ; copie archivée `Disallow: /` | données de vote de la Bibliothèque Dag Hammarskjöld |
| UN Digital Library, page de la notice | défi AWS WAF (202) sur `/record/4060887` | le fichier `/record/4060887/files/…`, lui accessible (200) |
| WITS TradeStats | accessible, mais licence non ouverte (UN Comtrade : « internal use only ») | CEPII BACI (Etalab 2.0) |
| opec.org, asean.org (vérification des blocs) | 403 / 307 | pages Wikipédia HTML |
| datacatalogapi.worldbank.org | 429 à chaque essai | fiche du catalogue (lecture rendue) |

## Relancer

```bash
cd .context/world/countries
python3 build_countries.py                       # reconstruit depuis cache/ (quelques secondes)
python3 build_countries.py --refresh             # re-télécharge tout (≈ 700 Mo, ≈ 10 min)
python3 build_countries.py --refresh wikidata worldbank   # rafraîchit seulement certaines étapes
#   étapes : wikidata worldbank unvotes baci wikipedia
python3 build_countries.py --verifier-nucleaire  # relit les 9 fiches CSIS (≈ 90 s)
ATLAS_110M=/chemin/countries-110m.json python3 build_countries.py   # autre fichier world-atlas
```

À mettre à jour à la main quand les sources changent :

- `UNVOTES` : le nom du fichier change à chaque version du jeu de l'ONU.
- `BACI` / `BACI_ANNEE` : nouvelle version de BACI.
- `NUCLEAIRE` : prochain SIPRI Yearbook.
- `CORRECTIONS_BLOCS` : à revoir à chaque adhésion ou retrait.

Le journal des requêtes (URL, code HTTP, horodatage UTC) s'ajoute à `cache/journal.json` à chaque exécution.
