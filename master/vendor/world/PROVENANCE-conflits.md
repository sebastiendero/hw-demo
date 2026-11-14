# Provenance — conflits armés actifs (rubrique « Situation »)

Fichiers produits par `build_conflicts.py` (Python, bibliothèque standard uniquement) le
2026-10-25T13:37:23Z (UTC). Aucune donnée ni aucun texte de insidegeopolitics.com n'est utilisé.

- `conflicts.json` : 66 fiches de conflit, au moins 25 morts (estimation « best »
  UCDP) entre 2025-10 et 2026-09 ; total 240 773 morts,
  dont 50 200 issus d'événements Candidate encore marqués « Check » par UCDP.
- `conflict-points.json` : 2661 points `[lon, lat, morts, id_fiche]` (cellules de 0.5° ×
  0.5°, centre de cellule ; 2661 cellules avant la coupe aux 6000 plus lourdes).

Relancer :

```bash
cd /Users/sebastien/conductor/workspaces/AIVEN/shanghai/.context/world/conflicts
python3 build_conflicts.py            # réutilise cache/ (page UCDP rafraîchie toutes les 24 h, Candidate et UNHCR/Wikipédia toutes les semaines)
python3 build_conflicts.py --refresh  # retélécharge tout
python3 build_conflicts.py --offline  # reconstruit depuis cache/ sans réseau
```

Chaque URL est confrontée au `robots.txt` de son hôte (`urllib.robotparser`, User-Agent
`MasterPortal/1.0 (usage personnel)`) avant l'appel ; une URL interdite n'est jamais appelée. Une pause d'1 s sépare deux requêtes vers
un même hôte. Le journal brut (date, code HTTP, taille, `Last-Modified`) est dans `cache/fetch_log.json`.

## 1. UCDP — Uppsala Conflict Data Program (source principale)

| URL | Vérifiée le (UTC) — code |
|---|---|
| https://ucdp.uu.se/downloads/ | 2026-10-25T13:30:12Z — HTTP 200 |
| https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_01_26_09.csv | 2026-10-25T13:30:19Z — HTTP 200 |
| https://ucdp.uu.se/downloads/ged/ged261-csv.zip | 2026-10-25T13:30:13Z — HTTP 200 |
| https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-261-csv.zip | 2026-10-25T13:30:20Z — HTTP 200 |
| https://ucdp.uu.se/downloads/nsos/ucdp-nonstate-261-csv.zip | 2026-10-25T13:30:21Z — HTTP 200 |
| https://ucdp.uu.se/downloads/nsos/ucdp-onesided-261-csv.zip | 2026-10-25T13:30:22Z — HTTP 200 |

- **robots.txt** (`https://ucdp.uu.se/robots.txt`, 2026-10-25T13:30:11Z — HTTP 200) : `User-agent: *` /
  `Allow: /` — autorisé. Seuls les fichiers de téléchargement libre sont utilisés ; l'API UCDP (jeton
  obligatoire) ne l'est pas.
- **Licence** : CC BY 4.0 — <https://creativecommons.org/licenses/by/4.0/>. Citation exacte de
  <https://ucdp.uu.se/downloads/> : « All datasets are free of charge and licensed under CC BY 4.0 — you are
  free to use and redistribute them provided you cite the relevant publications listed with each dataset. »
  (lien CC BY 4.0 retrouvé sur la page lors de cette exécution : oui).
- **Attribution à afficher** : « Données : UCDP (Uppsala Conflict Data Program), GED Candidate et GED,
  CC BY 4.0 » et, sur une page de crédits, les publications demandées :
  - Hegre, Håvard, Mihai Croicu, Kristine Eck, and Stina Högbladh (July 2020) *Introducing the UCDP Candidate
    Events Dataset*. Research & Politics. doi:10.1177/2053168020935257
  - Shawn Davies, Therése Pettersson, Magnus Öberg, *Organized violence 1989–2025, and violent political
    protests*, Journal of Peace Research, 2026. https://doi.org/10.1093/jopres/xjag046
  - Sundberg, Ralph and Erik Melander (2013) *Introducing the UCDP Georeferenced Event Dataset*. Journal of
    Peace Research 50(4).
  - Gleditsch, Nils Petter et al. (2002) *Armed Conflict 1946-2001: A New Dataset*. Journal of Peace Research
    39(5).
- **Ce qui est pris** : événements du GED annuel (`GEDEvent_v26_1.csv`, définitif jusqu'à 2025)
  pour les mois de 2025 et avant, et du GED Candidate cumulatif
  (16633 événements) pour l'année en cours ; années de début tirées de l'ACD
  (`start_date`, conflits étatiques, y compris avant 1989), des jeux Non-State / One-sided, ou à défaut du
  premier événement GED connu.
- **Limites** :
  - Le Candidate a environ **un mois de retard** : fenêtre arrêtée à 2026-09 (dernier événement
    daté du 2026-10-04). Rien sur octobre 2026 au moment de la construction.
  - Données Candidate **provisoires** : des événements marqués « Check dyad / deaths / type of violence… » sont
    inclus (comme le fait UCDP) et peuvent être révisés ou retirés dans le GED définitif ; part signalée par
    fiche (`deaths_12m_provisional`).
  - Acteurs non identifiés notés `XXX<code pays>` par UCDP (ex. XXX475 = Nigeria) : affichés « Acteur non
    identifié (UCDP) » dans `sides`.
  - UCDP ne compte que les morts directement liés à la violence organisée (pas les morts de faim ou de
    maladie) ; estimation « best » ; les événements localisés au niveau pays ou région tombent sur le
    centroïde correspondant.
  - `deaths_by_month` range chaque événement au mois de sa date de début : les bilans UCDP couvrant plusieurs
    semaines (`date_prec` 4-5) créent des pics artificiels (ex. Russie–Ukraine : 20 893 morts en 2025-08,
    1 696 en 2025-09). Lire la série en tendance, pas mois par mois.
  - UCDP code les événements de Gaza et de Cisjordanie sous le pays « Israel » (666) ; le script les
    réattribue à `ps` d'après `adm_1`.
  - Seuil : au moins 25 morts sur 12 mois glissants, par fiche (le seuil UCDP officiel s'applique par
    année civile et par conflit/dyade).
  - Mois non couverts par les fichiers disponibles : aucun
    (valeur `null` dans `deaths_by_month`).

### Regroupement en fiches

Une fiche peut réunir plusieurs conflits UCDP (`ucdp_conflict_ids`, `ucdp_conflict_names`) : règles
explicites par conflit et/ou par pays dans `THEATRES` (ex. Soudan = conflit étatique 309 + violences contre
les civils de la SFA/FSR + autres violences au Soudan). Le reste est regroupé automatiquement : chaque
conflit étatique isolé forme sa fiche, les violences non étatiques et unilatérales restantes sont regroupées
par pays. `type` = « étatique » dès qu'un conflit étatique identifié de la fiche atteint 25 morts,
sinon type de violence majoritaire en morts (détail dans `deaths_12m_by_type`). `name_fr` est rédigé à
partir des noms UCDP. `ucdp_main_conflict_id` = conflit principal de la fiche (étatique identifié le plus
meurtrier, sinon conflit identifié le plus meurtrier). `start` = première année UCDP connue de ce conflit
principal (ACD `start_date` ; Non-State / One-sided ; à défaut premier événement GED), souvent bien
antérieure à l'épisode actuel (ex. Soudan : 1971) ; `episode_start` = début de l'épisode en cours selon
l'ACD (`start_date2`) quand il est connu. `sides` : deux camps construits à partir des dyades UCDP, le camp
`a` partant du côté A (gouvernement) du conflit principal. `last_event` = date de fin du dernier événement
(peut déborder sur le mois suivant la fenêtre). `countries` = pays où ont lieu
les morts (au moins 1 % ou 25 morts), puis États parties au conflit. `center` = moyenne des
coordonnées des événements pondérée par les morts.

## 2. UNHCR — Refugee Statistics API (déplacés)

| URL | Vérifiée le (UTC) — code |
|---|---|
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=AFG&cf_type=ISO | 2026-10-25T13:31:04Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=BDI&cf_type=ISO | 2026-10-25T13:31:46Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=BEN&cf_type=ISO | 2026-10-25T13:31:50Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=BFA&cf_type=ISO | 2026-10-25T13:30:47Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=BGD&cf_type=ISO | 2026-10-25T13:31:34Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=BRA&cf_type=ISO | 2026-10-25T13:31:12Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=CAF&cf_type=ISO | 2026-10-25T13:31:16Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=CMR&cf_type=ISO | 2026-10-25T13:31:18Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=COD&cf_type=ISO | 2026-10-25T13:30:37Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=COL&cf_type=ISO | 2026-10-25T13:30:56Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=CRI&cf_type=ISO | 2026-10-25T13:31:44Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=ECU&cf_type=ISO | 2026-10-25T13:31:06Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=ETH&cf_type=ISO | 2026-10-25T13:30:41Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=GHA&cf_type=ISO | 2026-10-25T13:31:48Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=GTM&cf_type=ISO | 2026-10-25T13:31:38Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=HTI&cf_type=ISO | 2026-10-25T13:31:02Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=IDN&cf_type=ISO | 2026-10-25T13:31:30Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=IND&cf_type=ISO | 2026-10-25T13:31:24Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=IRN&cf_type=ISO | 2026-10-25T13:30:29Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=IRQ&cf_type=ISO | 2026-10-25T13:31:36Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=KHM&cf_type=ISO | 2026-10-25T13:31:22Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=LBN&cf_type=ISO | 2026-10-25T13:30:33Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=LKA&cf_type=ISO | 2026-10-25T13:31:52Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=MEX&cf_type=ISO | 2026-10-25T13:30:43Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=MLI&cf_type=ISO | 2026-10-25T13:30:52Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=MMR&cf_type=ISO | 2026-10-25T13:30:54Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=MOZ&cf_type=ISO | 2026-10-25T13:31:14Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=NER&cf_type=ISO | 2026-10-25T13:30:58Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=NGA&cf_type=ISO | 2026-10-25T13:30:35Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=PAK&cf_type=ISO | 2026-10-25T13:30:45Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=PHL&cf_type=ISO | 2026-10-25T13:31:28Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=PNG&cf_type=ISO | 2026-10-25T13:31:42Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=PSE&cf_type=ISO | 2026-10-25T13:30:49Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=RUS&cf_type=ISO | 2026-10-25T13:31:54Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=SDN&cf_type=ISO | 2026-10-25T13:30:27Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=SOM&cf_type=ISO | 2026-10-25T13:30:39Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=SSD&cf_type=ISO | 2026-10-25T13:31:08Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=SYR&cf_type=ISO | 2026-10-25T13:31:10Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=TCD&cf_type=ISO | 2026-10-25T13:31:26Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=THA&cf_type=ISO | 2026-10-25T13:31:40Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=TZA&cf_type=ISO | 2026-10-25T13:31:00Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=UKR&cf_type=ISO | 2026-10-25T13:30:25Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=VEN&cf_type=ISO | 2026-10-25T13:31:32Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=YEM&cf_type=ISO | 2026-10-25T13:30:31Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2025&coo=ZAF&cf_type=ISO | 2026-10-25T13:31:20Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=AFG&cf_type=ISO | 2026-10-25T13:31:03Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=BDI&cf_type=ISO | 2026-10-25T13:31:45Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=BEN&cf_type=ISO | 2026-10-25T13:31:49Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=BFA&cf_type=ISO | 2026-10-25T13:30:46Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=BGD&cf_type=ISO | 2026-10-25T13:31:33Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=BRA&cf_type=ISO | 2026-10-25T13:31:11Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=CAF&cf_type=ISO | 2026-10-25T13:31:15Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=CMR&cf_type=ISO | 2026-10-25T13:31:17Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=COD&cf_type=ISO | 2026-10-25T13:30:36Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=COL&cf_type=ISO | 2026-10-25T13:30:55Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=CRI&cf_type=ISO | 2026-10-25T13:31:43Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=ECU&cf_type=ISO | 2026-10-25T13:31:05Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=ETH&cf_type=ISO | 2026-10-25T13:30:40Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=GHA&cf_type=ISO | 2026-10-25T13:31:47Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=GTM&cf_type=ISO | 2026-10-25T13:31:37Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=HTI&cf_type=ISO | 2026-10-25T13:31:01Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=IDN&cf_type=ISO | 2026-10-25T13:31:29Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=IND&cf_type=ISO | 2026-10-25T13:31:23Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=IRN&cf_type=ISO | 2026-10-25T13:30:28Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=IRQ&cf_type=ISO | 2026-10-25T13:31:35Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=KHM&cf_type=ISO | 2026-10-25T13:31:21Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=LBN&cf_type=ISO | 2026-10-25T13:30:32Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=LKA&cf_type=ISO | 2026-10-25T13:31:51Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=MEX&cf_type=ISO | 2026-10-25T13:30:42Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=MLI&cf_type=ISO | 2026-10-25T13:30:51Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=MMR&cf_type=ISO | 2026-10-25T13:30:53Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=MOZ&cf_type=ISO | 2026-10-25T13:31:13Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=NER&cf_type=ISO | 2026-10-25T13:30:57Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=NGA&cf_type=ISO | 2026-10-25T13:30:34Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=PAK&cf_type=ISO | 2026-10-25T13:30:44Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=PHL&cf_type=ISO | 2026-10-25T13:31:27Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=PNG&cf_type=ISO | 2026-10-25T13:31:41Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=PSE&cf_type=ISO | 2026-10-25T13:30:48Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=RUS&cf_type=ISO | 2026-10-25T13:31:53Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=SDN&cf_type=ISO | 2026-10-25T13:30:26Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=SOM&cf_type=ISO | 2026-10-25T13:30:38Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=SSD&cf_type=ISO | 2026-10-25T13:31:07Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=SYR&cf_type=ISO | 2026-10-25T13:31:09Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=TCD&cf_type=ISO | 2026-10-25T13:31:25Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=THA&cf_type=ISO | 2026-10-25T13:31:39Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=TZA&cf_type=ISO | 2026-10-25T13:30:59Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=UKR&cf_type=ISO | 2026-10-25T13:30:24Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=VEN&cf_type=ISO | 2026-10-25T13:31:31Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=YEM&cf_type=ISO | 2026-10-25T13:30:30Z — HTTP 200 |
| https://api.unhcr.org/population/v1/population/?limit=20&year=2026&coo=ZAF&cf_type=ISO | 2026-10-25T13:31:19Z — HTTP 200 |
| https://api.unhcr.org/population/v1/unrwa/?limit=20&year=2025&coo=PSE&cf_type=ISO | 2026-10-25T13:30:50Z — HTTP 200 |

- **robots.txt** (`https://api.unhcr.org/robots.txt`, 2026-10-25T13:30:23Z — HTTP 404) : absent (404) —
  aucune restriction déclarée. API publique sans clé ni compte.
- **Licence** : CC BY 4.0. Le site de l'UNHCR (`https://www.unhcr.org/refugee-statistics/`, `https://www.unhcr.org/`,
  pages de conditions d'utilisation ; vérifié à la main le 25/10/2026 vers 13 h 17 UTC) renvoie HTTP 403 avec un défi Cloudflare (`cf-mitigated: challenge`) à un client non navigateur ; il n'a
  **pas** été contourné, donc la licence n'a pas pu être lue à la source. Elle est vérifiée de façon
  indirecte sur la publication officielle des mêmes données par l'UNHCR (paquet R `refugees`, titulaire des
  droits UNHCR) : <https://cran.r-project.org/web/packages/refugees/index.html> (« License: CC BY 4.0 ») et
  <https://populationstatistics.github.io/refugees/> (« This package is released under the Creative Commons
  Attribution 4.0 International Public License. ») — les deux pages : HTTP 200 le 25/10/2026 vers 13 h 19 UTC,
  robots.txt sans restriction pour ces chemins. À reconfirmer sur la page UNHCR depuis un navigateur.
- **Attribution à afficher** : « Source : UNHCR Refugee Data Finder » (formule utilisée par l'UNHCR dans
  ses propres exemples).
- **Ce qui est pris** : pour le pays principal de chaque fiche, `refugees`, `asylum_seekers`, `idps` par pays
  d'origine, dernière année disponible (fin d'année ; ici fin 2025).
  Pour la Palestine, ajout du nombre de réfugiés sous mandat de l'UNRWA (`unrwa_refugees`).
- **Limites** : statistiques annuelles (en retard d'environ six mois sur la situation) ; les déplacés internes
  ne sont comptés que là où l'UNHCR les suit (0 pour Gaza, suivis par d'autres agences) ; un pays principal
  par fiche, pas de ventilation par conflit à l'intérieur d'un pays (ex. les trois fiches Nigeria partagent
  les mêmes chiffres). Fiches sans données : aucune.

## 3. Wikipédia en français (résumés)

| URL | Vérifiée le (UTC) — code |
|---|---|
| https://fr.wikipedia.org/wiki/%C3%89lection_pr%C3%A9sidentielle_tanzanienne_de_2025 | 2026-10-25T13:32:16Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Conflit_arm%C3%A9_colombien | 2026-10-25T13:32:13Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Conflit_dans_le_Sud_de_la_Tha%C3%AFlande | 2026-10-25T13:32:28Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Conflit_du_Cachemire | 2026-10-25T13:32:29Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Conflit_en_Papouasie_occidentale | 2026-10-25T13:32:26Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Conflit_frontalier_entre_le_Cambodge_et_la_Tha%C3%AFlande_depuis_2025 | 2026-10-25T13:32:23Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Crise_anglophone_au_Cameroun | 2026-10-25T13:32:22Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Crise_s%C3%A9curitaire_en_%C3%89quateur | 2026-10-25T13:32:19Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Escarmouches_%C3%A0_la_fronti%C3%A8re_entre_l'Afghanistan_et_le_Pakistan | 2026-10-25T13:32:18Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Frappes_am%C3%A9ricaines_de_2026_au_Venezuela | 2026-10-25T13:32:27Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_civile_birmane_depuis_2021 | 2026-10-25T13:32:12Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_civile_somalienne | 2026-10-25T13:32:05Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_civile_soudanaise_depuis_2023 | 2026-10-25T13:31:56Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_civile_y%C3%A9m%C3%A9nite | 2026-10-25T13:31:58Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_d'Iran_de_2026 | 2026-10-25T13:32:00Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_de_Gaza_depuis_2023 | 2026-10-25T13:32:10Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_de_la_drogue_au_Mexique | 2026-10-25T13:32:07Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_des_gangs_en_Ha%C3%AFti | 2026-10-25T13:32:17Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_du_Kivu | 2026-10-25T13:32:04Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_du_Mali | 2026-10-25T13:32:11Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_du_Sahel | 2026-10-25T13:32:15Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_en_Amhara | 2026-10-25T13:32:06Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerre_entre_Isra%C3%ABl_et_le_Hezbollah_(2026) | 2026-10-25T13:31:59Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Guerres_baloutches | 2026-10-25T13:32:14Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Insurrection_communiste_aux_Philippines | 2026-10-25T13:32:25Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Insurrection_de_Boko_Haram | 2026-10-25T13:32:01Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Insurrection_djihadiste_au_Burkina_Faso | 2026-10-25T13:32:09Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Insurrection_djihadiste_au_Mozambique | 2026-10-25T13:32:20Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Insurrection_islamiste_au_Pakistan | 2026-10-25T13:32:08Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Invasion_de_l'Ukraine_par_la_Russie | 2026-10-25T13:31:55Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Manifestations_en_Iran_depuis_2025 | 2026-10-25T13:31:57Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/R%C3%A9bellion_naxalite | 2026-10-25T13:32:24Z — HTTP 200 |
| https://fr.wikipedia.org/wiki/Troisi%C3%A8me_guerre_civile_centrafricaine | 2026-10-25T13:32:21Z — HTTP 200 |

- **robots.txt** (`https://fr.wikipedia.org/robots.txt`, 2026-10-25T13:31:54Z — HTTP 200) : pour
  `User-agent: *`, `Disallow: /api/` — le point d'accès demandé `https://fr.wikipedia.org/api/rest_v1/page/summary/<titre>`
  est **interdit** et n'a pas été appelé (seul `/api/rest_v1/?doc` est autorisé). Les pages d'article
  `/wiki/<titre>` sont autorisées (« Friendly, low-speed bots are welcome viewing article pages ») : le script
  lit la page et en extrait le premier paragraphe (≤ 400 caractères, coupé en fin de phrase).
- **Licence** : CC BY-SA 4.0 — <https://creativecommons.org/licenses/by-sa/4.0/deed.fr> (lien du pied de page
  des articles). Mention relevée en pied de page : « Droit d'auteur : les textes sont disponibles sous licence Creative Commons attribution, partage dans les mêmes conditions ; d’autres conditions peuvent s’appliquer. Voyez les conditions d’utilisation pour plus de détails, ainsi que les crédits graphiques. En cas de réutilisation des textes de cette page, voyez comment citer les auteurs et mentionner la licence. Wikipedia® est une marque déposée de la Wikimedia Foundation, Inc., organisation de bienfaisance régie par le paragraphe 501(c)(3) du code fiscal des États-Unis. ». Conditions :
  <https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use>.
- **Attribution à afficher** sous chaque résumé : « Extrait de l'article Wikipédia « <titre> »
  (<summary_source>), CC BY-SA 4.0 ». Le texte extrait reste sous CC BY-SA 4.0 (partage dans les mêmes
  conditions) : ne pas le mélanger à un contenu sous licence incompatible.
- **Limites** : titres d'article choisis à la main (`THEATRES`, champ `wiki`) et vérifiés par appel ; un article
  peut porter sur un épisode plus large ou plus ancien que la fenêtre de 12 mois ; texte figé à la date
  d'appel. Fiches sans résumé : nigeria-nord-ouest-centre, soudan-du-sud, syrie, et-ucdp-267, bresil, ethiopie-oromia, et-unilateral, et-non-etatique, za-non-etatique, iran-insurrections, td-non-etatique, af-ucdp-333, za-unilateral, pk-unilateral, bd-non-etatique, in-non-etatique, in-unilateral, iq-ucdp-259, gt-non-etatique, ph-ucdp-14275, pk-non-etatique, et-ucdp-16951, pg-non-etatique, id-unilateral, cr-non-etatique, bi-unilateral, gh-non-etatique, af-ucdp-13637, bj-ucdp-15256, lk-non-etatique, nigeria-biafra, ru-ucdp-399, cm-unilateral.

## 4. Contrôle de cohérence

Conflits attendus en 2026 :

- Russie–Ukraine (`russie-ukraine`) : présent
- Soudan (`soudan`) : présent
- Israël–Gaza (`israel-palestine`) : présent
- Israël–Liban (`israel-hezbollah`) : présent
- Iran–États-Unis/Israël (`iran-israel-etats-unis`) : présent
- Myanmar (`birmanie`) : présent
- Sahel (Burkina Faso) (`burkina-faso`) : présent
- Sahel (Mali) (`mali`) : présent
- Sahel (Niger) (`niger`) : présent
- RD Congo (`rd-congo`) : présent
- Yémen (`yemen`) : présent
- Somalie (`somalie`) : présent
- Haïti (`haiti`) : présent
- Éthiopie (Amhara) (`ethiopie-amhara`) : présent

Quinze fiches les plus meurtrières sur 12 mois :

| Fiche | Morts 12 mois | dont provisoires (« Check ») | Dernier événement |
|---|---|---|---|
| Guerre russo-ukrainienne | 90 480 | 5 066 | 2026-10-01 |
| Guerre civile soudanaise | 67 012 | 474 | 2026-10-04 |
| Iran : violences de l'État contre des civils (manifestations 2025-2026) | 19 899 | 19 881 | 2026-08-19 |
| Guerre civile au Yémen | 5 488 | 3 091 | 2026-10-01 |
| Israël – Hezbollah (Liban) | 4 677 | 2 909 | 2026-09-15 |
| Nigeria : banditisme et violences intercommunautaires (Nord-Ouest, Centre) | 4 224 | 3 689 | 2026-10-03 |
| Guerre entre l'Iran, Israël et les États-Unis | 3 958 | 2 370 | 2026-09-23 |
| Nigeria et bassin du lac Tchad : insurrections djihadistes (JAS/Boko Haram, État islamique) | 3 828 | 1 365 | 2026-10-01 |
| RD Congo : conflits armés (AFC/M23, ADF/État islamique, milices) | 3 811 | 986 | 2026-10-01 |
| Somalie : insurrection d'al-Shabaab et autres violences armées | 3 760 | 229 | 2026-09-28 |
| Éthiopie : conflit en Amhara (milices Fano) | 3 473 | 904 | 2026-09-14 |
| Mexique : guerre des cartels | 3 454 | 1 397 | 2026-09-30 |
| Pakistan : insurrection islamiste (TTP et autres groupes) | 3 059 | 183 | 2026-09-30 |
| Burkina Faso : insurrection djihadiste | 2 706 | 374 | 2026-09-30 |
| Israël – Palestine : guerre de Gaza et violences en Cisjordanie | 2 054 | 0 | 2026-09-30 |

Manques et fragilités dus aux données :

- Retard de publication : le Candidate le plus récent (GEDEvent_v26_01_26_09.csv) s'arrête à
  2026-09 ; les événements d'octobre 2026 ne sont pas encore publiés.
- Fiches dont plus de la moitié des morts viennent d'événements Candidate non « Clear » (chiffres
  susceptibles d'être fortement révisés) :
  - Iran : violences de l'État contre des civils (manifestations 2025-2026) : 19 881 sur 19 899
  - Guerre civile au Yémen : 3 091 sur 5 488
  - Israël – Hezbollah (Liban) : 2 909 sur 4 677
  - Nigeria : banditisme et violences intercommunautaires (Nord-Ouest, Centre) : 3 689 sur 4 224
  - Guerre entre l'Iran, Israël et les États-Unis : 2 370 sur 3 958
  - Conflit armé colombien : 1 003 sur 1 834
  - Niger : insurrection djihadiste : 758 sur 1 127
  - Équateur : guerre des gangs et crise sécuritaire : 601 sur 763
  - Soudan du Sud : violences armées (gouvernement, SPLM/A-IO, milices) : 493 sur 731
  - Syrie : violences armées après la chute du régime Assad : 510 sur 672
  - Éthiopie : gouvernement contre EPFAS, TPLF : 382 sur 593
  - Brésil : affrontements entre factions criminelles : 337 sur 566
  - Centrafrique : guerre civile : 133 sur 260
  - Afrique du Sud : affrontements entre groupes armés non étatiques : 183 sur 194
  - Iran : insurrections armées (Sistan-et-Baloutchistan, Kurdistan) : 96 sur 141
  - Afghanistan : gouvernement contre AFF, NRF, Forces of Juma Khan Fateh : 67 sur 107
  - Afrique du Sud : violences armées contre des civils : 99 sur 102
  - Bangladesh : affrontements entre groupes armés non étatiques : 50 sur 73
  - Inde : affrontements entre groupes armés non étatiques : 38 sur 65
  - Inde : violences armées contre des civils : 32 sur 60
  - Éthiopie : gouvernement contre GFNF, BDF : 33 sur 41
  - Papouasie-Nouvelle-Guinée : affrontements entre groupes armés non étatiques : 22 sur 40
  - Ghana : affrontements entre groupes armés non étatiques : 19 sur 35
  - Sri Lanka : affrontements entre groupes armés non étatiques : 33 sur 33
  - Russie : gouvernement contre Black Spark : 29 sur 29
  - Cameroun : violences armées contre des civils : 23 sur 27
- Localisation grossière : UCDP place au centroïde du pays (ou d'une zone maritime) les morts qu'il ne
  peut situer plus précisément (`where_prec` 6-7) ; sur le globe, ils forment une seule grosse cellule.
  Fiches où c'est le cas pour plus d'un quart des morts :
  - Guerre russo-ukrainienne : 79 837 sur 90 480
  - Iran : violences de l'État contre des civils (manifestations 2025-2026) : 13 282 sur 19 899
  - Israël – Hezbollah (Liban) : 2 864 sur 4 677
  - Guerre entre l'Iran, Israël et les États-Unis : 1 978 sur 3 958
- Une partie de la violence est attribuée par UCDP à des acteurs non identifiés (XXX) : Nigeria, Mexique,
  Colombie, Équateur, Brésil, Syrie, Soudan du Sud, Afrique du Sud notamment ; les camps (`sides`) y sont
  incomplets.
- Pas de résumé Wikipédia quand aucun article français correspondant n'a été trouvé (fiches générées
  automatiquement et quelques fiches nommées, voir section 3).

Incidents d'accès pendant cette exécution :

- aucun
