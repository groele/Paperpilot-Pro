(function(global) {
  const root = global.PaperPilotCore || {};

  function stripTags(value) {
    return String(value || "").replace(/<[^>]*>/g, "");
  }

  function escapeBibtex(value) {
    return stripTags(value)
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function authorSurname(authors) {
    const first = Array.isArray(authors) && authors.length > 0 ? authors[0] : "Unknown";
    const parts = String(first).trim().split(/\s+/).filter(Boolean);
    const raw = parts[parts.length - 1] || "Unknown";
    const cleaned = raw.replace(/[^\p{L}\p{N}]/gu, "");
    return cleaned || "Unknown";
  }

  function firstTitleToken(title) {
    const stopWords = new Set(["a", "an", "the"]);
    const tokens = stripTags(title)
      .split(/\s+/)
      .map(token => token.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter(Boolean)
      .filter(token => !stopWords.has(token.toLowerCase()));
    return tokens.slice(0, 2).join("") || "Paper";
  }

  function buildCitationKey(paper, used) {
    const base = `${authorSurname(paper.authors)}${paper.year || "n.d."}${firstTitleToken(paper.title)}`;
    let key = base;
    let index = 2;
    while (used.has(key)) {
      key = `${base}${index}`;
      index += 1;
    }
    used.add(key);
    return key;
  }

  function buildBibtexEntries(papers, options = {}) {
    const used = new Set();
    const accessed = options.accessed || new Date().toISOString().slice(0, 10);
    return (papers || []).map(paper => {
      const key = buildCitationKey(paper, used);
      const authors = Array.isArray(paper.authors) ? paper.authors : [];
      const source = paper.source || paper.metricsSource || "PaperPilot";
      return `@article{${key},\n` +
        `  title={${escapeBibtex(paper.title || "Untitled paper")}},\n` +
        `  author={${escapeBibtex(authors.join(" and "))}},\n` +
        `  journal={${escapeBibtex(paper.journal || paper.venue || "Other")}},\n` +
        `  year={${escapeBibtex(paper.year || "")}},\n` +
        `  doi={${escapeBibtex(paper.doi || "")}},\n` +
        `  url={${escapeBibtex(paper.url || paper.pdfUrl || "")}},\n` +
        `  note={Source: ${escapeBibtex(source)}; Accessed: ${escapeBibtex(accessed)}}\n` +
        `}`;
    }).join("\n\n");
  }

  function buildRisEntries(papers) {
    return (papers || []).map(paper => {
      const authors = Array.isArray(paper.authors) ? paper.authors : [];
      const lines = ["TY  - JOUR"];
      authors.forEach(author => lines.push(`AU  - ${escapeBibtex(author)}`));
      lines.push(`TI  - ${escapeBibtex(paper.title || "Untitled paper")}`);
      if (paper.journal || paper.venue) lines.push(`JO  - ${escapeBibtex(paper.journal || paper.venue)}`);
      if (paper.year) lines.push(`PY  - ${escapeBibtex(paper.year)}`);
      if (paper.doi) lines.push(`DO  - ${escapeBibtex(paper.doi)}`);
      if (paper.url || paper.pdfUrl) lines.push(`UR  - ${escapeBibtex(paper.url || paper.pdfUrl)}`);
      lines.push("ER  -");
      return lines.join("\n");
    }).join("\n\n");
  }

  function buildCslJson(papers) {
    return (papers || []).map(paper => {
      const authors = Array.isArray(paper.authors) ? paper.authors : [];
      return {
        type: "article-journal",
        title: stripTags(paper.title || "Untitled paper"),
        author: authors.map(name => ({ literal: stripTags(name) })),
        "container-title": stripTags(paper.journal || paper.venue || ""),
        issued: paper.year ? { "date-parts": [[Number(paper.year)]] } : undefined,
        DOI: stripTags(paper.doi || ""),
        URL: stripTags(paper.url || paper.pdfUrl || ""),
        source: stripTags(paper.source || paper.metricsSource || "PaperPilot")
      };
    });
  }

  root.citation = {
    stripTags,
    escapeBibtex,
    buildCitationKey,
    buildBibtexEntries,
    buildRisEntries,
    buildCslJson
  };
  global.PaperPilotCore = root;
})(globalThis);
