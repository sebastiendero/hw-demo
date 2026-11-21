/* Master — Marchés : les widgets officiels de TradingView (tous les marchés, graphique complet, panorama, calendrier).
 *
 * Intégrés en simple cadre (iframe) vers tradingview-widget.com, exactement comme le fait le script d'intégration de
 * TradingView : aucun script de TradingView ne s'exécute dans la page du portail (CSP : frame-src seulement). Les
 * données affichées sont celles de TradingView (certaines bourses en différé de 15 min) ; la mention TradingView reste
 * visible, comme le demandent leurs conditions. Nos propres données restent dans « Cours et événements ».
 */
(() => {
  "use strict";
  const HOST = "https://www.tradingview-widget.com/embed-widget";
  const dark = () => document.documentElement.dataset.theme !== "light";

  // Nos instruments → symbole TradingView (pour ouvrir le graphique complet depuis « Cours et événements »).
  const TV = {
    BRENT: "TVC:UKOIL", WTI: "TVC:USOIL", "TTE.PA": "EURONEXT:TTE", TTE: "NYSE:TTE", FRO: "NYSE:FRO", DHT: "NYSE:DHT",
    BNO: "AMEX:BNO", USO: "AMEX:USO", BTC: "BITSTAMP:BTCUSD", SP500: "FOREXCOM:SPXUSD", NASDAQCOM: "FOREXCOM:NSXUSD",
    DEXUSEU: "FX:EURUSD", DEXJPUS: "FX:USDJPY",
  };
  const tvSymbol = (symbol) => TV[symbol] || symbol;

  // Liste de suivi du graphique et groupes du panorama : énergie et détroits d'abord, puis le reste du monde.
  // Symboles vérifiés dans les widgets gratuits (les bourses sous licence, CME ou NYMEX par exemple, n'y sont pas
  // diffusées : on prend alors la cotation d'un courtier, FOREXCOM, OANDA ou CAPITALCOM).
  const GROUPS = [
    ["Énergie", [["TVC:UKOIL", "Brent"], ["TVC:USOIL", "WTI"], ["OANDA:NATGASUSD", "Gaz naturel"], ["AMEX:BNO", "ETF Brent (BNO)"], ["AMEX:USO", "ETF pétrole (USO)"]]],
    ["Armateurs et pétrolières", [["NYSE:FRO", "Frontline"], ["NYSE:DHT", "DHT"], ["NYSE:TNK", "Teekay Tankers"], ["NYSE:INSW", "International Seaways"], ["EURONEXT:TTE", "TotalEnergies"], ["NYSE:XOM", "ExxonMobil"], ["NYSE:SHEL", "Shell"]]],
    ["Indices", [["FOREXCOM:SPXUSD", "S&P 500"], ["FOREXCOM:NSXUSD", "Nasdaq 100"], ["FOREXCOM:DJI", "Dow Jones"], ["EURONEXT:PX1", "CAC 40"], ["XETR:DAX", "DAX"], ["FOREXCOM:UKXGBP", "FTSE 100"], ["INDEX:NKY", "Nikkei 225"], ["SSE:000001", "Shanghai"], ["CAPITALCOM:VIX", "VIX (volatilité)"]]],
    ["Taux et devises", [["OANDA:USB10YUSD", "Obligation US 10 ans (prix)"], ["EUREX:FGBL1!", "Bund (contrat)"], ["CAPITALCOM:DXY", "Dollar (DXY)"], ["FX:EURUSD", "EUR/USD"], ["FX:USDJPY", "USD/JPY"], ["FX_IDC:USDCNY", "USD/CNY"]]],
    ["Métaux et matières", [["TVC:GOLD", "Or"], ["TVC:SILVER", "Argent"], ["OANDA:XCUUSD", "Cuivre"], ["OANDA:WHEATUSD", "Blé"]]],
    ["Crypto", [["BITSTAMP:BTCUSD", "Bitcoin"], ["BITSTAMP:ETHUSD", "Ether"]]],
  ];

  function frame(widget, settings, title) {
    const f = document.createElement("iframe");
    f.className = "tv-frame";
    f.title = title;
    f.loading = "lazy";
    f.referrerPolicy = "origin";
    f.allow = "clipboard-write; fullscreen";
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    f.src = `${HOST}/${widget}/?locale=fr#${encodeURIComponent(JSON.stringify({ ...settings, locale: "fr" }))}`;
    return f;
  }
  function credit(el) {
    const p = el("p", "tv-credit");
    const a = el("a", null, "Graphiques et cotations : TradingView ↗");
    a.href = "https://fr.tradingview.com/"; a.target = "_blank"; a.rel = "noopener noreferrer";
    p.append(a, document.createTextNode(" · certaines bourses en différé · pas un conseil en investissement"));
    return p;
  }

  // Graphique complet : n'importe quel symbole (recherche intégrée), indicateurs, dessins, unités de temps.
  function chart(el, symbol) {
    const box = el("div", "tv-box tv-chart");
    box.append(frame("advanced-chart", {
      symbol: symbol || "TVC:UKOIL", interval: "D", timezone: "Etc/UTC", theme: dark() ? "dark" : "light", style: "1",
      allow_symbol_change: true, withdateranges: true, hide_side_toolbar: false, details: true, hotlist: true,
      calendar: false, save_image: true, autosize: true, support_host: "https://www.tradingview.com",
      watchlist: GROUPS.flatMap(([, syms]) => syms.map(([s]) => s)),
      backgroundColor: dark() ? "rgba(9, 9, 11, 1)" : "rgba(255, 255, 255, 1)",
    }, "Graphique TradingView"));
    return [box, credit(el)];
  }

  // Panorama : cotations par groupe et calendrier économique.
  function panorama(el) {
    const grid = el("div", "tv-pano");
    const quotes = el("div", "tv-box");
    quotes.append(frame("market-quotes", {
      width: "100%", height: "100%", colorTheme: dark() ? "dark" : "light", isTransparent: false, showSymbolLogo: true,
      symbolsGroups: GROUPS.map(([name, syms]) => ({ name, symbols: syms.map(([s, d]) => ({ name: s, displayName: d })) })),
    }, "Cotations TradingView"));
    const cal = el("div", "tv-box");
    cal.append(frame("events", {
      width: "100%", height: "100%", colorTheme: dark() ? "dark" : "light", isTransparent: false, importanceFilter: "0,1",
      countryFilter: "us,eu,gb,de,fr,cn,jp,sa,ae,ir,in",
    }, "Calendrier économique TradingView"));
    grid.append(quotes, cal);
    return [grid, credit(el)];
  }

  window.MASTER_TV = { chart, panorama, tvSymbol };
})();
