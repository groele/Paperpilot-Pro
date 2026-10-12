(function(global) {
  const root = global.PaperPilotCore || {};

  function foldDoiCase(value) {
    return String(value || "").replace(/[A-Z]/g, char => char.toLowerCase());
  }

  function doiKey(value) {
    return foldDoiCase(normalizeDoi(value));
  }

  function decodeUriComponent(value) {
    try { return decodeURIComponent(value); } catch (_) {
      return value.replace(/(?:%[0-9a-f]{2})+/gi, encoded => {
        try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
      });
    }
  }

  function prepareDoiText(value, authoritative = false) {
    return decodeHtmlEntities(String(value || ""))
      .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, char => authoritative ? char : "")
      // Normalize common copied prefix typography without changing the suffix.
      .replace(/(?:１０|10)[．.]([０-９0-9]{4,9})[／/]/g, (_, digits) =>
        `10.${digits.replace(/[０-９]/g, char => String(char.charCodeAt(0) - 0xff10))}/`)
      .replace(/\b(10\.\d{4,9})[ \t\u00a0\u202f]*\/[ \t\u00a0\u202f]*(?:\r?\n[ \t]*)?/g, "$1/");
  }

  function cleanDoiMatch(value, { authoritative = false } = {}) {
    if (/^(?:https?:)?\/\//i.test(String(value || "").trim())) return extractDoi(value, { authoritative });
    let doi = prepareDoiText(value, authoritative).trim()
      .replace(/^(?:urn:doi:|info:doi\/|doi\s*[:：]\s*)/i, "");
    const literal = authoritative && /^10\.\d{4,9}\//i.test(doi);
    if (!literal) doi = doi.replace(/^[\s"'<(\[{]+/, "").replace(/[\s"']+$/, "");
    const pairs = { ")": "(", "]": "[", "}": "{", ">": "<" };
    // Remove one character at a time: stripping a run of punctuation can
    // destroy the balanced closing parenthesis of an old-style DOI.
    while (doi && !literal) {
      const last = doi.slice(-1);
      if (pairs[last]) {
        const count = char => doi.split(char).length - 1;
        if (count(last) > count(pairs[last])) { doi = doi.slice(0, -1); continue; }
      } else if (!authoritative && /[.,;:]/.test(last)) {
        doi = doi.slice(0, -1); continue;
      }
      break;
    }
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(doi)) return "";
    return /^10\.\d{4,9}\/[^\s\u0000-\u001f\u007f]+$/i.test(doi) ? doi : "";
  }

  function doiCandidateStrings(value, output, depth, budget) {
    if (value === null || value === undefined) return output;
    if (depth > 8 || output.length >= 128 || budget.remaining-- <= 0) {
      budget.complete = false;
      return output;
    }
    if (Array.isArray(value)) {
      if (value.length > 128) budget.complete = false;
      value.slice(0, 128).forEach(item => doiCandidateStrings(item, output, depth + 1, budget));
    } else if (typeof value === "object") {
      // PropertyValue identifiers such as ISBN must not be mistaken for DOI.
      if (value.propertyID && !/^(?:doi|(?:urn:|info:)?doi|https?:\/\/(?:dx\.)?doi\.org\/?|.*[:/#]doi)$/i.test(String(value.propertyID).trim())) return output;
      for (const key of ["doi", "DOI", "value", "@value", "identifier", "@id", "url", "sameAs", "mainEntityOfPage"]) {
        if (value[key] !== undefined) doiCandidateStrings(value[key], output, depth + 1, budget);
      }
    } else if (typeof value === "string") {
      output.push(value);
    }
    return output;
  }

  function inspectDois(values, options = {}) {
    const found = new Map();
    const budget = { remaining: 512, complete: true };
    const addText = (raw, authoritative = options.authoritative === true, depth = 0) => {
      if (depth > 3 || raw.length > 16000 || found.size >= 64) { budget.complete = false; return; }
      let text = prepareDoiText(raw, authoritative).trim();
      // Decode an encoded DOI prefix once. A literal percent sequence in an
      // already plain DOI suffix is not an invitation to decode it again.
      if (/^(?:(?:urn:doi:|info:doi\/|doi\s*[:：]\s*))?10(?:%2e\d{4,9}(?:\/|%2f)|\.\d{4,9}%2f)|^https?%3a%2f%2f/i.test(text)) {
        text = decodeUriComponent(text);
      }
      if (/^(?:https?:)?\/\//i.test(text)) {
        try {
          const url = new URL(text.startsWith("//") ? `https:${text}` : text);
          let path = decodeUriComponent(url.pathname);
          // Presentation suffixes are removed only for the publisher that
          // defines them; `/meta` may be part of a valid DOI elsewhere.
          if (/(?:^|[.-])iopscience[.-]iop[.-]org(?:[.-]|$)/i.test(url.hostname)) {
            path = path.replace(/\/(?:meta|pdf|full|abstract)\/?$/i, "");
          }
          if (/(?:^|[.-])(?:springer|biomedcentral)[.-]com(?:[.-]|$)/i.test(url.hostname)) {
            path = path.replace(/\.pdf$/i, "");
          }
          const isResolver = /^(?:dx\.)?doi\.org$/i.test(url.hostname);
          if (isResolver && /^\/10\.\d{4,9}\//i.test(path)) addText(path.slice(1), true, depth + 1);
          else if (!isResolver) addText(path, authoritative, depth + 1);
          // Search/tracking queries are never treated as article identifiers.
          for (const key of ["doi", "rft_id", "rft.doi", "rft_id[]", "url"]) {
            for (const value of url.searchParams.getAll(key)) addText(value, authoritative, depth + 1);
          }
          return;
        } catch (_) { return; }
      }
      // A complete authoritative identifier has an opaque suffix. Quotes and
      // unmatched brackets there are literal characters, not prose wrappers.
      if (authoritative && /^(?:(?:urn:doi:|info:doi\/|doi\s*[:：]\s*))?10\.\d{4,9}\/\S+$/i.test(text) && !/[,;](?=\s*10\.\d{4,9}\/)/.test(text)) {
        const doi = cleanDoiMatch(text, { authoritative });
        if (doi && !found.has(foldDoiCase(doi))) found.set(foldDoiCase(doi), doi);
        return;
      }
      text = text.replace(/https?:\/\/[^\s"'，。；！？）】》]+/gi, url => {
        addText(authoritative ? url : url.replace(/[.,;:]+$/, ""), authoritative, depth + 1);
        return " ";
      });
      // Keep SICI angle brackets and semicolons; stop at real HTML tags,
      // prose punctuation in Chinese, quotes, and whitespace.
      text = text.replace(/<\/?(?:a|span|div|p|br|i|b|em|strong)\b[^>]*>/gi, " ");
      // A separator before another DOI is a list boundary, while SICI
      // semicolons inside one identifier must remain intact.
      text = text.replace(/[,;](?=\s*10\.\d{4,9}\/)/g, " ");
      if (authoritative && /^(?:(?:urn:doi:|info:doi\/|doi\s*[:：]\s*))?10\.\d{4,9}\/\S+$/i.test(text)) {
        const doi = cleanDoiMatch(text, { authoritative });
        if (doi) {
          if (!found.has(foldDoiCase(doi))) found.set(foldDoiCase(doi), doi);
          return;
        }
      }
      const regex = /(?<![\p{L}\p{N}_.])10\.\d{4,9}\/[^\s"'，。；：！？、（）【】《》「」『』]+/igu;
      for (const match of text.matchAll(regex)) {
        if (found.size >= 64) { budget.complete = false; break; }
        const doi = cleanDoiMatch(match[0], { authoritative });
        if (doi && !found.has(foldDoiCase(doi))) found.set(foldDoiCase(doi), doi);
      }
    };
    for (const value of doiCandidateStrings(values, [], 0, budget)) addText(value);
    return { candidates: Array.from(found.values()), complete: budget.complete };
  }

  function extractDois(values, options = {}) {
    return inspectDois(values, options).candidates;
  }

  function extractDoi(values, options = {}) {
    return extractDois(values, options)[0] || "";
  }

  function normalizeDoi(doi) {
    const result = inspectDois(doi, { authoritative: true });
    return result.complete && result.candidates.length === 1 ? result.candidates[0] : "";
  }

  function selectDoiEvidence(groups) {
    const evidence = (groups || []).map(group => ({
      ...group,
      ...inspectDois(group.values, { authoritative: group.authoritative === true })
    })).filter(group => group.candidates.length || !group.complete).sort((a, b) => b.priority - a.priority);
    if (!evidence.length) return { doi: "", source: "", ambiguous: false };
    const highest = evidence[0].priority;
    const leaders = evidence.filter(group => group.priority === highest);
    if (leaders.some(group => !group.complete)) return { doi: "", source: leaders[0].source, ambiguous: true };
    const combined = inspectDois(leaders.flatMap(group => group.candidates), { authoritative: true });
    if (!combined.complete) return { doi: "", source: leaders[0].source, ambiguous: true };
    const candidates = combined.candidates;
    if (candidates.length === 1) return { doi: candidates[0], source: leaders[0].source, ambiguous: false };
    // Count independent sources, never duplicate tags/links. A conflicted
    // source cannot corroborate one of its own alternatives.
    const support = new Map(candidates.map(doi => [foldDoiCase(doi), new Set()]));
    const leaderSources = new Set(leaders.map(group => group.source));
    for (const group of evidence.filter(group => group.complete && group.priority < highest && group.candidates.length === 1 && !leaderSources.has(group.source))) {
      support.get(foldDoiCase(group.candidates[0]))?.add(group.source);
    }
    const corroborated = candidates.filter(doi => support.get(foldDoiCase(doi)).size > 0);
    if (corroborated.length === 1) {
      return { doi: corroborated[0], source: leaders[0].source, ambiguous: false };
    }
    return { doi: "", source: leaders[0].source, ambiguous: true };
  }

  function doiUrl(doi) {
    const identifier = normalizeDoi(doi);
    return identifier ? `https://doi.org/${identifier.split("/").map(part => encodeURIComponent(part)).join("/")}` : "";
  }

  function isWeakTitle(title, doi = "") {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) return true;
    if (/^https?:\/\//i.test(cleanTitle)) return true;
    if (/\.pdf(\?|$)/i.test(cleanTitle)) return true;
    if (/^(pdf|download|article|full text|acs publications|just a moment|please wait|access denied|请稍候…?|访问被拒绝|untitled|untitled paper|n\/a|none|null)$/i.test(cleanTitle)) return true;

    const cleanDoi = normalizeDoi(doi).toLowerCase();
    const normalizedTitle = cleanTitle
      .toLowerCase()
      .replace(/^doi:\s*/, "")
      .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
      .replace(/[?#].*$/, "");

    if (cleanDoi && normalizedTitle === cleanDoi) return true;
    if (/^10\.\d{4,9}\//i.test(cleanTitle)) return true;
    if (/^[a-z0-9_.-]+\.\d+[a-z]?\d*$/i.test(cleanTitle)) return true;
    return cleanTitle.length < 8;
  }

  function stripHtmlTags(str) {
    return String(str || "").replace(/<[^>]+>/g, " ");
  }

  function decodeHtmlEntities(str) {
    const character = (entity, code) => Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    return String(str || "")
      .replace(/&nbsp;/g, "\u00a0")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (entity, num) => character(entity, Number(num)))
      .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => character(entity, parseInt(hex, 16)));
  }

  function cleanTitleString(str) {
    return decodeHtmlEntities(stripHtmlTags(str)).replace(/\s+/g, " ").trim();
  }

  function normalizeTitle(title) {
    return cleanTitleString(title)
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function titleSimilarity(left, right) {
    const a = normalizeTitle(left);
    const b = normalizeTitle(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const aTokens = new Set(a.split(" ").filter(token => token.length > 1));
    const bTokens = new Set(b.split(" ").filter(token => token.length > 1));
    if (!aTokens.size || !bTokens.size) return 0;
    let intersection = 0;
    for (const token of aTokens) if (bTokens.has(token)) intersection += 1;
    // Sørensen-Dice is robust to subtitle/punctuation differences while still
    // rejecting an unrelated first search result.
    return (2 * intersection) / (aTokens.size + bTokens.size);
  }

  function isTitleMatch(query, candidate, threshold = 0.9) {
    const a = normalizeTitle(query);
    const b = normalizeTitle(candidate);
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.min(a.split(" ").length, b.split(" ").length) <= 3) return false;
    const significant = value => value.split(" ")
      .filter(token => /\d/.test(token) || /^(?:not|without|non)$/.test(token)).sort().join(" ");
    if (significant(a) !== significant(b)) return false;
    if (titleSimilarity(query, candidate) < threshold) return false;
    const left = a.split(" "), right = b.split(" ");
    const row = new Array(right.length + 1).fill(0);
    for (const token of left) {
      let diagonal = 0;
      for (let index = 1; index <= right.length; index += 1) {
        const previous = row[index];
        row[index] = token === right[index - 1] ? diagonal + 1 : Math.max(row[index], row[index - 1]);
        diagonal = previous;
      }
    }
    return 2 * row[right.length] / (left.length + right.length) >= threshold;
  }

  function selectTitleResult(query, candidates) {
    const matches = (candidates || []).map(candidate => {
      const title = candidate.source === "crossref" ? candidate.item?.title?.[0] : candidate.item?.title;
      const doi = normalizeDoi(candidate.item?.DOI || candidate.item?.doi);
      return { ...candidate, doi, title, score: titleSimilarity(query, title) };
    }).filter(candidate => candidate.doi && isTitleMatch(query, candidate.title))
      .sort((a, b) => b.score - a.score);
    const best = matches[0];
    if (!best) return null;
    const rival = matches.find(candidate => doiKey(candidate.doi) !== doiKey(best.doi));
    // Repeated titles (errata, editions, or competing records) need more
    // evidence than a search provider's ordering before assigning a DOI.
    return rival && best.score - rival.score < 0.04 ? null : best;
  }

  function createBaseMetadata({ doi = "", title = "", journal = "" } = {}) {
    return {
      doi: normalizeDoi(doi),
      title: cleanTitleString(title),
      pdfUrl: "",
      journal: journal || "",
      publisher: "",
      year: null,
      authors: [],
      impactFactor: "N/A",
      jcrQuartile: "N/A",
      casPartition: "N/A",
      citeScore: "N/A",
      oaStatus: "Unknown",
      isEstimated: false,
      metricsSource: "unconfigured",
      ccfRank: "",
      isCssci: false,
      isPku: false,
      sciWarn: "",
      sources: []
    };
  }

  function applyCrossrefItem(metadata, item) {
    if (!item) return metadata;
    if (item.DOI) metadata.doi = normalizeDoi(item.DOI);
    if (item.title && item.title[0]) metadata.title = cleanTitleString(item.title[0]);
    if (item["container-title"] && item["container-title"][0]) {
      metadata.journal = item["container-title"][0] || metadata.journal;
    }
    const dateParts = item.published?.["date-parts"] || item.created?.["date-parts"] || item.issued?.["date-parts"];
    if (dateParts && dateParts[0] && dateParts[0][0]) {
      metadata.year = dateParts[0][0] || metadata.year;
    }
    if (item.author) {
      metadata.authors = item.author.map(a => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean);
    }
    if (!metadata.sources.includes("Crossref")) metadata.sources.push("Crossref");
    return metadata;
  }

  function applyCslJson(metadata, item) {
    if (!item) return metadata;
    const compatible = {
      ...item,
      DOI: item.DOI || item.doi,
      title: Array.isArray(item.title) ? item.title : [item.title].filter(Boolean),
      "container-title": Array.isArray(item["container-title"])
        ? item["container-title"]
        : [item["container-title"]].filter(Boolean)
    };
    applyCrossrefItem(metadata, compatible);
    metadata.sources = metadata.sources.filter(source => source !== "Crossref");
    if (!metadata.sources.includes("DOI CSL JSON")) metadata.sources.push("DOI CSL JSON");
    return metadata;
  }

  function applyOpenAlexWork(metadata, work) {
    if (!work) return metadata;
    metadata.title = work.title ? cleanTitleString(work.title) : metadata.title;
    metadata.doi = work.doi ? normalizeDoi(work.doi) : metadata.doi;
    metadata.year = work.publication_year || metadata.year;
    metadata.authors = (work.authorships || []).map(a => a.author?.display_name).filter(Boolean);
    if (work.primary_location && work.primary_location.source) {
      metadata.journal = work.primary_location.source.display_name || metadata.journal;
      metadata.publisher = work.primary_location.source.host_organization_name || metadata.publisher;
    }
    if (work.best_oa_location) {
      metadata.pdfUrl = work.best_oa_location.pdf_url || work.best_oa_location.landing_page_url || metadata.pdfUrl;
      metadata.oaStatus = work.open_access ? (work.open_access.oa_status || "Open") : metadata.oaStatus;
    }
    if (!metadata.sources.includes("OpenAlex")) metadata.sources.push("OpenAlex");
    return metadata;
  }

  function applyUnpaywall(metadata, data) {
    if (!data) return metadata;
    if (data.best_oa_location) {
      metadata.pdfUrl = data.best_oa_location.url_for_pdf || data.best_oa_location.url || metadata.pdfUrl;
      metadata.oaStatus = data.oa_status || "Open";
    }
    if (!metadata.sources.includes("Unpaywall")) metadata.sources.push("Unpaywall");
    return metadata;
  }

  function applyEasyScholarRank(metadata, rankData) {
    if (!rankData || !rankData.officialRank || !rankData.officialRank.all) return metadata;
    const all = rankData.officialRank.all;
    metadata.metricsSource = "easyScholar";
    metadata.isEstimated = false;
    if (all.sciif) metadata.impactFactor = String(all.sciif);
    if (all.sci) {
      let quartile = String(all.sci);
      if (quartile.match(/^\d+$/)) quartile = `Q${quartile}`;
      metadata.jcrQuartile = quartile;
    }
    const cas = all.sciUp || all.sciBase;
    if (cas) metadata.casPartition = cas;
    if (all.ccf) metadata.ccfRank = String(all.ccf);
    if (all.cssci && (all.cssci === "是" || all.cssci === "收录")) metadata.isCssci = true;
    if (all.pku && (all.pku === "是" || all.pku === "收录")) metadata.isPku = true;
    if (all.sciwarn && all.sciwarn !== "无" && all.sciwarn !== "否") metadata.sciWarn = String(all.sciwarn);
    if (!metadata.sources.includes("easyScholar")) metadata.sources.push("easyScholar");
    return metadata;
  }

  function markCached(metadata, cachedAt = Date.now()) {
    metadata.cachedAt = cachedAt;
    metadata.source = metadata.sources.length ? metadata.sources.join(", ") : "local";
    return metadata;
  }

  const UNPAYWALL_EMAIL = "paperpilot@gmail.com";

  root.metadata = {
    inspectDois,
    UNPAYWALL_EMAIL,
    normalizeDoi,
    doiKey,
    doiUrl,
    cleanDoiMatch,
    extractDoi,
    extractDois,
    isWeakTitle,
    stripHtmlTags,
    decodeHtmlEntities,
    cleanTitleString,
    normalizeTitle,
    titleSimilarity,
    isTitleMatch,
    selectTitleResult,
    selectDoiEvidence,
    createBaseMetadata,
    applyCrossrefItem,
    applyCslJson,
    applyOpenAlexWork,
    applyUnpaywall,
    applyEasyScholarRank,
    markCached
  };
  global.PaperPilotCore = root;
})(globalThis);
