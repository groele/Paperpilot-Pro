(function(global) {
  const root = global.PaperPilotCore || {};

  function normalizeDoi(doi) {
    return String(doi || "")
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^info:doi\//i, "")
      .replace(/^doi:\s*/i, "")
      .replace(/[?#].*$/, "");
  }

  function cleanDoiMatch(value) {
    let doi = normalizeDoi(value)
      .replace(/^\/+/, "")
      .trim();

    doi = doi.replace(/[.,;:)\]}]+$/g, "");
    return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : "";
  }

  function extractDoi(values) {
    const candidates = Array.isArray(values) ? values : [values];
    const doiRegex = /(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*|info:doi\/)?(10\.\d{4,9}\/[^\s"'<>]+)/ig;

    for (const candidate of candidates.flat(Infinity)) {
      if (candidate === null || candidate === undefined) continue;
      const text = typeof candidate === "string"
        ? candidate
        : (typeof candidate === "object" ? JSON.stringify(candidate) : String(candidate));
      doiRegex.lastIndex = 0;

      let match;
      while ((match = doiRegex.exec(text))) {
        const doi = cleanDoiMatch(match[1] || match[0]);
        if (doi) return doi;
      }
    }

    return "";
  }

  function isWeakTitle(title, doi = "") {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) return true;
    if (/^https?:\/\//i.test(cleanTitle)) return true;
    if (/\.pdf(\?|$)/i.test(cleanTitle)) return true;
    if (/^(pdf|download|article|full text|acs publications|just a moment|please wait|access denied|请稍候…?|访问被拒绝)$/i.test(cleanTitle)) return true;

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

  function normalizeTitle(title) {
    return String(title || "")
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

  function isTitleMatch(query, candidate, threshold = 0.72) {
    return titleSimilarity(query, candidate) >= threshold;
  }

  function createBaseMetadata({ doi = "", title = "", journal = "" } = {}) {
    return {
      doi: normalizeDoi(doi),
      title: title || "",
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
    if (item.title && item.title[0]) metadata.title = item.title[0];
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
    metadata.title = work.title || metadata.title;
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
    UNPAYWALL_EMAIL,
    normalizeDoi,
    extractDoi,
    isWeakTitle,
    normalizeTitle,
    titleSimilarity,
    isTitleMatch,
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
