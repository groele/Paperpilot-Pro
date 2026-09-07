(function(global) {
  const root = global.PaperPilotCore || {};

  function stripTags(value) {
    return String(value || "").replace(/<[^>]*>/g, "");
  }

  function decodeHtmlEntities(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  function escapeBibtex(value) {
    return decodeHtmlEntities(stripTags(value))
      .replace(/[{}]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeAuthors(authors) {
    if (Array.isArray(authors)) {
      return authors.map(a => String(a || "").trim()).filter(Boolean);
    }
    if (typeof authors === "string" && authors.trim()) {
      if (/\sand\s/i.test(authors)) {
        return authors.split(/\sand\s/i).map(a => a.trim()).filter(Boolean);
      }
      return authors.split(/[,;&]/).map(a => a.trim()).filter(Boolean);
    }
    return [];
  }

  function authorSurname(authors) {
    const list = normalizeAuthors(authors);
    const first = list.length > 0 ? list[0] : "Unknown";
    const cleanedFirst = decodeHtmlEntities(stripTags(String(first))).trim();
    let raw = "Unknown";
    if (cleanedFirst.includes(",")) {
      raw = cleanedFirst.split(",")[0].trim();
    } else {
      const parts = cleanedFirst.split(/\s+/).filter(Boolean);
      raw = parts[parts.length - 1] || "Unknown";
    }
    const cleaned = raw.replace(/[^\p{L}\p{N}]/gu, "");
    return cleaned || "Unknown";
  }

  function firstTitleToken(title) {
    const stopWords = new Set(["a", "an", "the"]);
    const tokens = decodeHtmlEntities(stripTags(title))
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
      const authors = normalizeAuthors(paper.authors);
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
      const authors = normalizeAuthors(paper.authors);
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

  function cleanText(val) {
    return decodeHtmlEntities(stripTags(val));
  }

  function buildCslJson(papers) {
    return (papers || []).map(paper => {
      const authors = normalizeAuthors(paper.authors);
      return {
        type: "article-journal",
        title: cleanText(paper.title || "Untitled paper"),
        author: authors.map(name => ({ literal: cleanText(name) })),
        "container-title": cleanText(paper.journal || paper.venue || ""),
        issued: paper.year ? { "date-parts": [[Number(paper.year)]] } : undefined,
        DOI: cleanText(paper.doi || ""),
        URL: cleanText(paper.url || paper.pdfUrl || ""),
        source: cleanText(paper.source || paper.metricsSource || "PaperPilot")
      };
    });
  }

  root.citation = {
    stripTags,
    decodeHtmlEntities,
    escapeBibtex,
    buildCitationKey,
    buildBibtexEntries,
    buildRisEntries,
    buildCslJson,
    normalizeAuthors
  };
  global.PaperPilotCore = root;
})(globalThis);
