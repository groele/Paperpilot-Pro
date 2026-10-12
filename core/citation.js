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

  function cleanText(val) {
    return decodeHtmlEntities(stripTags(val)).replace(/\s+/g, " ").trim();
  }

  function escapeBibtex(value, isVerbatim = false) {
    let text = decodeHtmlEntities(stripTags(value)).trim();
    if (!text) return "";
    if (isVerbatim) {
      return text.replace(/\s+/g, "");
    }
    // Protect LaTeX special characters from breaking pdflatex/biber compilation:
    // & -> \&, % -> \%, _ -> \_, # -> \#, $ -> \$
    text = text
      .replace(/(^|[^\\])&/g, "$1\\&")
      .replace(/(^|[^\\])%/g, "$1\\%")
      .replace(/(^|[^\\])_/g, "$1\\_")
      .replace(/(^|[^\\])#/g, "$1\\#")
      .replace(/(^|[^\\])\$/g, "$1\\$");

    return text.replace(/\s+/g, " ").trim();
  }

  function normalizeAuthors(authors) {
    if (Array.isArray(authors)) {
      return authors.map(a => {
        if (!a) return "";
        if (typeof a === "object") {
          if (a.name) return String(a.name).trim();
          if (a.literal) return String(a.literal).trim();
          if (a.family || a.given) {
            return `${a.given || ""} ${a.family || ""}`.trim();
          }
          if (a.display_name) return String(a.display_name).trim();
          if (a.author && typeof a.author === "object") {
            return a.author.display_name || a.author.name || "";
          }
        }
        return String(a || "").trim();
      }).filter(Boolean);
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
        `  doi={${escapeBibtex(paper.doi || "", true)}},\n` +
        `  url={${escapeBibtex(paper.url || paper.pdfUrl || "", true)}},\n` +
        `  note={Source: ${escapeBibtex(source)}; Accessed: ${escapeBibtex(accessed)}}\n` +
        `}`;
    }).join("\n\n");
  }

  function buildRisEntries(papers) {
    return (papers || []).map(paper => {
      const authors = normalizeAuthors(paper.authors);
      const lines = ["TY  - JOUR"];
      authors.forEach(author => {
        let formattedAuthor = cleanText(author);
        if (formattedAuthor && !formattedAuthor.includes(",")) {
          const parts = formattedAuthor.split(/\s+/);
          if (parts.length > 1) {
            const restAreInitials = parts.slice(1).every(p => /^[A-Za-z]\.?$/i.test(p));
            if (restAreInitials) {
              const family = parts[0];
              formattedAuthor = `${family}, ${parts.slice(1).join(" ")}`;
            } else {
              const family = parts.pop();
              formattedAuthor = `${family}, ${parts.join(" ")}`;
            }
          }
        }
        lines.push(`AU  - ${formattedAuthor}`);
      });
      lines.push(`TI  - ${cleanText(paper.title || "Untitled paper")}`);
      if (paper.journal || paper.venue) lines.push(`JO  - ${cleanText(paper.journal || paper.venue)}`);
      if (paper.year) lines.push(`PY  - ${cleanText(paper.year)}`);
      if (paper.doi) lines.push(`DO  - ${cleanText(paper.doi)}`);
      if (paper.url || paper.pdfUrl) lines.push(`UR  - ${cleanText(paper.url || paper.pdfUrl)}`);
      lines.push("ER  - \n");
      return lines.join("\n");
    }).join("\n\n");
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

  function formatGbtAuthor(name) {
    const cleaned = cleanText(name);
    if (!cleaned) return "";
    if (/[\u4e00-\u9fa5]/.test(cleaned)) {
      return cleaned.replace(/\s+/g, "");
    }
    if (cleaned.includes(",")) {
      const parts = cleaned.split(",").map(p => p.trim());
      const family = parts[0].replace(/[.,;:]+$/, "");
      const givens = parts[1] ? parts[1].split(/\s+/).filter(Boolean) : [];
      const initials = givens.map(g => g.replace(/[^A-Za-z]/g, "")[0]?.toUpperCase()).filter(Boolean).join(" ");
      return initials ? `${family} ${initials}` : family;
    }
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].replace(/[.,;:]+$/, "");

    // Check if format is "Family I" or "Family I I" (PubMed / MEDLINE style)
    const restAreInitials = parts.length > 1 && parts.slice(1).every(p => /^[A-Za-z]\.?$/i.test(p));
    if (restAreInitials) {
      const family = parts[0].replace(/[.,;:]+$/, "");
      const initials = parts.slice(1).map(g => g.replace(/[^A-Za-z]/g, "")[0]?.toUpperCase()).filter(Boolean).join(" ");
      return initials ? `${family} ${initials}` : family;
    }

    const family = parts.pop().replace(/[.,;:]+$/, "");
    const initials = parts.map(g => g.replace(/[^A-Za-z]/g, "")[0]?.toUpperCase()).filter(Boolean).join(" ");
    return initials ? `${family} ${initials}` : family;
  }

  function formatGbtAuthors(authors) {
    const list = normalizeAuthors(authors);
    if (!list.length) return "佚名";
    const formatted = list.map(formatGbtAuthor).filter(Boolean);
    if (!formatted.length) return "佚名";
    const hasChinese = list.some(a => /[\u4e00-\u9fa5]/.test(String(a)));
    const etAl = hasChinese ? "等" : "et al.";
    if (formatted.length <= 3) {
      return formatted.join(", ");
    }
    return `${formatted.slice(0, 3).join(", ")}, ${etAl}`;
  }

  function buildGbt7714Entries(papers, options = {}) {
    const numbered = options.numbered !== false;
    return (papers || []).map((paper, idx) => {
      let authors = formatGbtAuthors(paper.authors);
      if (authors.endsWith(".")) {
        authors = authors.slice(0, -1);
      }
      const title = cleanText(paper.title || "Untitled paper").replace(/[.,;:]+$/, "");
      const journal = cleanText(paper.journal || paper.venue || "");
      const year = cleanText(paper.year || "");
      const rawDoi = String(paper.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
      const prefix = numbered ? `[${idx + 1}] ` : "";

      let entry = `${prefix}${authors}. ${title}[J]`;
      if (journal) {
        entry += `. ${journal}`;
      }
      if (year) {
        entry += `, ${year}`;
      }
      entry += ".";
      if (rawDoi) {
        entry += ` DOI: ${rawDoi}.`;
      }
      return entry;
    }).join("\n\n");
  }

  root.citation = {
    stripTags,
    decodeHtmlEntities,
    cleanText,
    escapeBibtex,
    buildCitationKey,
    buildBibtexEntries,
    buildRisEntries,
    buildCslJson,
    buildGbt7714Entries,
    formatGbtAuthors,
    formatGbtAuthor,
    normalizeAuthors
  };
  global.PaperPilotCore = root;
})(globalThis);
