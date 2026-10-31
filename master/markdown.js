/* Master — mise en forme sûre des réponses de l'assistant (petit sous-ensemble de Markdown).
 *
 * Construit le rendu élément par élément ; tout texte passe par textContent : aucune balise venant du modèle n'est
 * interprétée, aucun lien n'est créé. Gère : paragraphes, retours à la ligne, **gras**, *italique*, `code`,
 * titres (#), listes à puces et numérotées, tableaux (| a | b | avec ligne de séparation).
 */
(() => {
  "use strict";
  const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;

  function inline(text) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) frag.append(document.createTextNode(text.slice(last, m.index)));
      const t = m[0];
      let node;
      if (t.startsWith("**") || t.startsWith("__")) { node = document.createElement("strong"); node.textContent = t.slice(2, -2); }
      else if (t.startsWith("`")) { node = document.createElement("code"); node.textContent = t.slice(1, -1); }
      else { node = document.createElement("em"); node.textContent = t.slice(1, -1); }
      frag.append(node);
      last = m.index + t.length;
    }
    if (last < text.length) frag.append(document.createTextNode(text.slice(last)));
    return frag;
  }

  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  // Espaces retirés d'abord : l'expression reste linéaire même sur une ligne de milliers d'espaces.
  const isRule = (line) => /^\|?:?-{2,}:?(\|:?-{2,}:?)*\|?$/.test(line.replace(/\s+/g, ""));
  const BULLET = /^\s*[-*•]\s+(.*)$/;
  const NUMBER = /^\s*(\d+)[.)]\s+(.*)$/;
  const HEADING = /^\s*#{1,6}\s+([\s\S]*)$/;  // une seule expression pour reconnaître un titre, partout

  function render(text) {
    const root = document.createDocumentFragment();
    const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      // Tableau : une ligne à barres suivie d'une ligne de séparation.
      if (line.includes("|") && i + 1 < lines.length && isRule(lines[i + 1])) {
        const table = document.createElement("table");
        const head = document.createElement("tr");
        for (const c of cells(line)) { const th = document.createElement("th"); th.append(inline(c)); head.append(th); }
        table.append(head);
        i += 2;
        while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
          const tr = document.createElement("tr");
          for (const c of cells(lines[i])) { const td = document.createElement("td"); td.append(inline(c)); tr.append(td); }
          table.append(tr);
          i++;
        }
        const wrap = document.createElement("div");
        wrap.className = "md-table";
        wrap.append(table);
        root.append(wrap);
        continue;
      }
      const h = HEADING.exec(line);
      if (h) { const p = document.createElement("p"); const b = document.createElement("strong"); b.append(inline(h[1])); p.append(b); root.append(p); i++; continue; }
      let listed = false;
      for (const [re, tag] of [[BULLET, "ul"], [NUMBER, "ol"]]) {
        if (!re.test(line)) continue;
        listed = true;
        const list = document.createElement(tag);
        const first = tag === "ol" ? Number(NUMBER.exec(line)[1]) : 1;
        if (first !== 1) list.start = first;  // une liste reprise après un texte garde son numéro
        while (i < lines.length && re.test(lines[i])) {
          const li = document.createElement("li");
          const m = re.exec(lines[i]);
          li.append(inline(m[m.length - 1]));
          list.append(li);
          i++;
        }
        root.append(list);
        break;
      }
      if (!listed) {
        // Paragraphe : lignes consécutives, retours à la ligne gardés.
        const p = document.createElement("p");
        let first = true;
        while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])
               && !HEADING.test(lines[i]) && !(lines[i].includes("|") && i + 1 < lines.length && isRule(lines[i + 1]))) {
          if (!first) p.append(document.createElement("br"));
          p.append(inline(lines[i]));
          first = false;
          i++;
        }
        if (first) { p.append(document.createTextNode(line)); i++; }  // garde-fou : toujours avancer d'une ligne
        root.append(p);
      }
    }
    return root;
  }

  window.MASTER_MD = { render };
})();
