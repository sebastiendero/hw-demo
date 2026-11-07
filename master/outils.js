/* Master — Outils : annuaire de sites publics utiles à la veille, rangés par catégorie (l'équivalent de la page
 * OSINT4ALL, mais notre propre liste, limitée à la veille géopolitique, maritime et des marchés). Volontairement absents :
 * recherche de personnes, numéros jetables, générateurs d'identités. Recherche instantanée ; liens https, ouverts à part.
 */
(() => {
  "use strict";
  const U = () => window.MASTER_UI;
  const T = [
    ["Navires et ports", "ship", [
      ["MarineTraffic", "https://www.marinetraffic.com/", "positions AIS des navires"], ["VesselFinder", "https://www.vesselfinder.com/", "positions AIS, fiches navires"],
      ["MyShipTracking", "https://www.myshiptracking.com/", "positions AIS"], ["IMF PortWatch", "https://portwatch.imf.org/", "passages des détroits, escales des ports"],
      ["Equasis", "https://www.equasis.org/", "fiche officielle d'un navire (IMO), compte gratuit"], ["GISIS (OMI)", "https://gisis.imo.org/", "registre de l'Organisation maritime internationale"],
      ["Global Fishing Watch", "https://globalfishingwatch.org/map/", "activité des navires, balises coupées"], ["UKMTO", "https://www.ukmto.org/", "alertes de sécurité maritime (Golfe, mer Rouge)"]]],
    ["Avions", "route", [
      ["ADS-B Exchange", "https://globe.adsbexchange.com/", "trafic aérien non filtré, militaires compris"], ["adsb.lol", "https://adsb.lol/", "trafic aérien ouvert (source de notre calque)"],
      ["Flightradar24", "https://www.flightradar24.com/", "trafic aérien commercial"], ["OpenSky Network", "https://opensky-network.org/", "données de vol pour la recherche"]]],
    ["Conflits et crises", "alert", [
      ["UCDP", "https://ucdp.uu.se/", "conflits armés et morts (source du Master)"], ["ACLED", "https://acleddata.com/", "événements de violence politique"],
      ["Liveuamap", "https://liveuamap.com/", "carte des événements en direct"], ["DeepStateMap", "https://deepstatemap.live/", "ligne de front en Ukraine"],
      ["ISW", "https://understandingwar.org/", "analyses quotidiennes des conflits"], ["Crisis Group, CrisisWatch", "https://www.crisisgroup.org/crisiswatch", "état mensuel des crises"],
      ["ReliefWeb", "https://reliefweb.int/", "rapports humanitaires (ONU)"], ["GDACS", "https://www.gdacs.org/", "alertes de catastrophes (source du Master)"]]],
    ["Imagerie satellite", "eye", [
      ["Copernicus Browser", "https://browser.dataspace.copernicus.eu/", "Sentinel-1 radar et Sentinel-2 optique, par date"], ["NASA Worldview", "https://worldview.earthdata.nasa.gov/", "imagerie quotidienne, feux, nuages"],
      ["NASA FIRMS", "https://firms.modaps.eosdis.nasa.gov/map/", "feux détectés par satellite"], ["Sentinel Hub EO Browser", "https://apps.sentinel-hub.com/eo-browser/", "imagerie Sentinel et Landsat"],
      ["Google Earth", "https://earth.google.com/web/", "images haute résolution, historique"]]],
    ["Sanctions et entreprises", "flag", [
      ["OFAC, recherche SDN", "https://sanctionssearch.ofac.treas.gov/", "liste américaine (source du Master)"], ["Sanctions de l'UE", "https://www.sanctionsmap.eu/", "carte des sanctions européennes"],
      ["UK Sanctions List", "https://www.gov.uk/government/publications/the-uk-sanctions-list", "liste britannique"], ["OpenCorporates", "https://opencorporates.com/", "registres de sociétés du monde"],
      ["Pappers", "https://www.pappers.fr/", "entreprises françaises"], ["SEC EDGAR", "https://www.sec.gov/edgar/search/", "dépôts des sociétés cotées aux États-Unis"]]],
    ["Marchés et énergie", "chart", [
      ["TradingView", "https://www.tradingview.com/", "graphiques de tous les marchés (intégré à Marchés)"], ["FRED", "https://fred.stlouisfed.org/", "séries macroéconomiques"],
      ["EIA", "https://www.eia.gov/petroleum/", "pétrole : stocks, production, prix"], ["JODI", "https://www.jodidata.org/oil/", "production et exportations de pétrole"],
      ["IEA, Oil Market Report", "https://www.iea.org/topics/oil-market-report", "marché pétrolier mensuel"], ["Kalshi", "https://kalshi.com/", "marchés de prédiction (réglementés)"]]],
    ["Presse et déclarations", "megaphone", [
      ["GDELT", "https://www.gdeltproject.org/", "événements extraits de la presse mondiale"], ["Google News", "https://news.google.com/", "agrégateur de presse"],
      ["Telegram, aperçus publics", "https://t.me/s/osintdefender", "canaux OSINT (lus par le Master)"], ["Wayback Machine", "https://web.archive.org/", "pages archivées, preuves"],
      ["archive.today", "https://archive.ph/", "archiver une page"], ["ONU, Conseil de sécurité", "https://press.un.org/en/content/security-council", "comptes rendus des séances"]]],
    ["Cartes et terrain", "globe", [
      ["OpenStreetMap", "https://www.openstreetmap.org/", "carte libre"], ["Wikimapia", "https://wikimapia.org/", "lieux annotés"],
      ["Submarine Cable Map", "https://www.submarinecablemap.com/", "câbles sous-marins (source du Master)"], ["MarineRegions", "https://www.marineregions.org/", "frontières et zones maritimes"],
      ["Global Energy Monitor", "https://globalenergymonitor.org/", "centrales, oléoducs, terminaux"]]],
    ["Cyber et Internet", "server", [
      ["CISA KEV", "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", "vulnérabilités exploitées (source du Master)"], ["Cloudflare Radar", "https://radar.cloudflare.com/", "trafic et coupures d'Internet"],
      ["IODA", "https://ioda.inetintel.cc.gatech.edu/", "coupures d'Internet par pays"], ["NetBlocks", "https://netblocks.org/", "censure et coupures"]]],
    ["Nature et espace", "sun", [
      ["USGS, séismes", "https://earthquake.usgs.gov/earthquakes/map/", "séismes (source du Master)"], ["NOAA SWPC", "https://www.swpc.noaa.gov/", "météo spatiale (source du Master)"],
      ["Zoom Earth", "https://zoom.earth/", "tempêtes et cyclones en direct"], ["Windy", "https://www.windy.com/", "vent, vagues, météo"]]],
  ];

  function viewOutils(root) {
    const ui = U();
    const { el } = ui;
    const q = el("input", "out-q"); q.type = "search"; q.placeholder = "Chercher un outil…"; q.setAttribute("aria-label", "Chercher un outil");
    root.append(ui.pageHead({ crumbs: ["Socle", "Outils"], title: "Outils",
      sub: "Les sites publics utiles à la veille, par catégorie. Les sources déjà branchées sur le Master sont signalées.", actions: [q] }));
    const grid = el("div", "out-grid");
    root.append(grid, el("p", "muted", "Volontairement absents : recherche de personnes, numéros jetables, générateurs d'identités."));
    const draw = () => {
      const w = q.value.trim().toLowerCase();
      grid.replaceChildren();
      for (const [cat, ic, items] of T) {
        const hit = items.filter(([n, , d]) => !w || `${n} ${d} ${cat}`.toLowerCase().includes(w));
        if (!hit.length) continue;
        const c = el("section", "card out-cat");
        const h = el("div", "out-h"); h.append(ui.icon(ic), el("h2", null, cat), el("span", "muted", String(hit.length)));
        c.append(h);
        for (const [n, url, d] of hit) {
          const a = el("a", `out-link${/source du Master|intégré/.test(d) ? " ours" : ""}`); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
          a.append(el("b", null, n), el("span", null, d));
          c.append(a);
        }
        grid.append(c);
      }
    };
    q.oninput = draw;
    draw();
  }

  window.MASTER_EXTRA_VIEWS = Object.assign(window.MASTER_EXTRA_VIEWS || {}, { outils: viewOutils });
})();
