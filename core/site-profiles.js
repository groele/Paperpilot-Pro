(function(global) {
  const root = global.PaperPilotCore || {};

  const COMMON_METADATA_SELECTORS = [
    "citation_title",
    "citation_doi",
    "citation_pdf_url",
    "citation_journal_title",
    "citation_author",
    "dc.identifier",
    "dc.identifier.doi",
    "dc.title",
    "prism.doi",
    "prism.publicationName",
    "article:doi",
    "rft_id"
  ];

  const COMMON_CHALLENGE_SIGNALS = [
    "just a moment",
    "checking your browser",
    "enable javascript and cookies",
    "verify you are human",
    "access denied",
    "attention required",
    "unusual traffic",
    "institutional sign in",
    "log in through your institution"
  ];

  function toUrl(rawUrl) {
    try {
      return new URL(rawUrl);
    } catch (e) {
      return null;
    }
  }

  function doiFromText(text) {
    if (root.metadata?.extractDoi) return root.metadata.extractDoi([text]);
    const match = String(text || "").match(/\b10\.\d{4,9}\/[^\s"'<>]+/i);
    return match ? match[0].replace(/[.,;:)\]}]+$/g, "") : "";
  }

  function doiFromPath(url) {
    const decodedPath = decodeURIComponent(url.pathname);
    const match = decodedPath.match(/\/doi\/(?:full\/|abs\/|epdf\/|pdf\/)?(10\.[^?#]+)/i);
    return match ? doiFromText(match[1]) : doiFromText(decodedPath);
  }

  function pdfCandidate(url, source, reason, score = 92, extra = {}) {
    return {
      url,
      source,
      score,
      reason,
      kind: "profile",
      requiresBrowser: Boolean(extra.requiresBrowser),
      confidence: extra.confidence || "high"
    };
  }

  function baseProfile(id, rawUrl, overrides = {}) {
    return {
      id,
      url: rawUrl,
      doiCandidates: overrides.doiCandidates || [],
      pdfCandidates: overrides.pdfCandidates || [],
      metadataSelectors: overrides.metadataSelectors || COMMON_METADATA_SELECTORS.slice(),
      challengeSignals: overrides.challengeSignals || COMMON_CHALLENGE_SIGNALS.slice(),
      fallbackLandingUrl: overrides.fallbackLandingUrl || rawUrl
    };
  }

  const adapters = [];

  function register(adapter) {
    if (!adapter || !adapter.id || typeof adapter.match !== "function" || typeof adapter.build !== "function") {
      throw new TypeError("Invalid PaperPilot site adapter");
    }
    adapters.push(adapter);
    return adapter;
  }

  function registerDefaults() {
    register({
      id: "elife",
      match: ({ host, path }) => (host.includes("elifesciences.org") || host.includes("elife.org")) && /\/articles\/\d+/i.test(path),
      build: ({ url, path, doi }) => {
        const match = path.match(/\/articles\/(\d+)/i);
        return baseProfile("elife", url.href, {
          doiCandidates: [doi].filter(Boolean),
          pdfCandidates: match ? [pdfCandidate(`${url.origin}/articles/${match[1]}.pdf`, "publisher-rule:elife", "eLife article URL maps to .pdf", 96)] : []
        });
      }
    });
    register({
      id: "peerj",
      match: ({ host, path }) => host.includes("peerj.com") && /\/articles\/\d+/i.test(path),
      build: ({ url, path, doi }) => {
        const match = path.match(/\/articles\/(\d+)/i);
        return baseProfile("peerj", url.href, {
          doiCandidates: [doi].filter(Boolean),
          pdfCandidates: match ? [pdfCandidate(`${url.origin}/articles/${match[1]}.pdf`, "publisher-rule:peerj", "PeerJ article URL maps to .pdf", 96)] : []
        });
      }
    });
    register({
      id: "plos",
      match: ({ host, url }) => host.includes("plos.org") && Boolean(url.searchParams.get("id")),
      build: ({ url, doi }) => {
        const articleId = url.searchParams.get("id");
        return baseProfile("plos", url.href, {
          doiCandidates: [doi || doiFromText(articleId)].filter(Boolean),
          pdfCandidates: [pdfCandidate(`${url.origin}${url.pathname.replace(/\/article\/?$/i, "/article/file")}?id=${encodeURIComponent(articleId)}&type=printable`, "publisher-rule:plos", "PLOS article URL maps to printable PDF", 95)]
        });
      }
    });
    register({
      id: "jstage",
      match: ({ host, path }) => host.includes("jstage.jst.go.jp") && /\/_article\/?$/i.test(path),
      build: ({ url, path, doi }) => baseProfile("jstage", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: [pdfCandidate(`${url.origin}${path.replace(/\/_article\/?$/i, "/_pdf")}`, "publisher-rule:jstage", "J-STAGE article URL maps to _pdf", 94)]
      })
    });

    const metadataDrivenHosts = [
      ["zenodo", "zenodo.org"],
      ["figshare", "figshare.com"],
      ["osf", "osf.io"],
      ["europepmc", "europepmc.org"],
      ["scielo", "scielo."],
      ["doaj", "doaj.org"],
      ["copernicus", "copernicus.org"],
      ["bmj", "bmj.com"],
      ["degruyter", "degruyter.com"],
      ["emerald", "emerald.com"],
      ["karger", "karger.com"],
      ["siam", "siam.org"],
      ["worldscientific", "worldscientific.com"]
    ];
    metadataDrivenHosts.forEach(([id, hostname]) => register({
      id,
      match: ({ host }) => host.includes(hostname),
      build: ({ url, doi }) => baseProfile(id, url.href, { doiCandidates: [doi].filter(Boolean) })
    }));
  }

  registerDefaults();

  function resolve(rawUrl) {
    const url = toUrl(rawUrl);
    if (!url) return baseProfile("unknown", rawUrl || "");
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const lowerPath = path.toLowerCase();
    const doi = doiFromPath(url) || doiFromText(url.href);

    const context = { url, host, path, lowerPath, doi };
    const adapter = adapters.find(item => {
      try {
        return item.match(context);
      } catch (_) {
        return false;
      }
    });
    if (adapter) return adapter.build(context);

    if (host.includes("science.org")) {
      return baseProfile("science", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: doi ? [pdfCandidate(`${url.origin}/doi/pdf/${doi}`, "publisher-rule:science", "Science DOI URL maps to /doi/pdf/{doi}", 94)] : []
      });
    }

    if (host.includes("nature.com") && /\/articles\/[^/?#]+$/i.test(path)) {
      return baseProfile("nature", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: [pdfCandidate(`${url.origin}${path}.pdf`, "publisher-rule:nature", "Nature article URL maps to .pdf", 98)]
      });
    }

    if ((host.includes("springer.com") || host.includes("springerlink.com")) && /^\/article\/10\./i.test(path)) {
      const springerDoi = decodeURIComponent(path.replace(/^\/article\//i, ""));
      return baseProfile("springer", url.href, {
        doiCandidates: [doiFromText(springerDoi)].filter(Boolean),
        pdfCandidates: [pdfCandidate(`${url.origin}/content/pdf/${springerDoi}.pdf`, "publisher-rule:springer", "Springer DOI article URL maps to content/pdf", 92)]
      });
    }

    if (host.includes("wiley.com") && doi) {
      return baseProfile("wiley", url.href, {
        doiCandidates: [doi],
        pdfCandidates: [pdfCandidate(`${url.origin}/doi/pdf/${doi}`, "publisher-rule:wiley", "Wiley DOI URL maps to /doi/pdf/{doi}", 94)]
      });
    }

    if (host.includes("pubs.acs.org") && doi) {
      return baseProfile("acs", url.href, {
        doiCandidates: [doi],
        pdfCandidates: [pdfCandidate(`${url.origin}/doi/pdf/${doi}`, "publisher-rule:acs", "ACS DOI URL maps to /doi/pdf/{doi}", 94)]
      });
    }

    if (host.includes("pubs.rsc.org") && /\/content\/articlelanding\//i.test(path)) {
      return baseProfile("rsc", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: [pdfCandidate(`${url.origin}${path.replace(/\/content\/articlelanding\//i, "/en/content/articlepdf/").replace(/^\/en\/en\//, "/en/")}`, "publisher-rule:rsc", "RSC article landing URL maps to article PDF", 92)]
      });
    }

    if (host.includes("ieeexplore.ieee.org")) {
      const docMatch = path.match(/\/document\/(\d+)/i) || `${path}${url.search}`.match(/[?&]arnumber=(\d+)/i);
      return baseProfile("ieee", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: docMatch ? [pdfCandidate(`${url.origin}/stamp/stamp.jsp?tp=&arnumber=${docMatch[1]}`, "publisher-rule:ieee", "IEEE document URL maps to stamp PDF viewer", 90, { confidence: "medium" })] : []
      });
    }

    if (host.includes("sciencedirect.com") || host.includes("elsevier.com")) {
      return baseProfile("sciencedirect", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: lowerPath.includes("/pdfft") && url.searchParams.get("md5") && url.searchParams.get("pid")
          ? [pdfCandidate(url.href, "publisher-rule:sciencedirect", "ScienceDirect signed pdfft URL", 96)]
          : [],
        fallbackLandingUrl: url.href
      });
    }

    if (host.includes("mdpi.com") && /^\/\d{4}-\d{4}\/.+/i.test(path) && !lowerPath.endsWith("/pdf")) {
      return baseProfile("mdpi", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: [pdfCandidate(`${url.origin}${path.replace(/\/$/, "")}/pdf`, "publisher-rule:mdpi", "MDPI article URL maps to /pdf", 92)]
      });
    }

    if (host.includes("frontiersin.org")) {
      const match = path.match(/\/articles\/(10\.[^/]+\/[^/]+)\/(?:full|abstract)?$/i);
      return baseProfile("frontiers", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: match ? [pdfCandidate(`${url.origin}/articles/${decodeURIComponent(match[1])}/pdf`, "publisher-rule:frontiers", "Frontiers article URL maps to /pdf", 92)] : []
      });
    }

    if (host.includes("tandfonline.com") && doi) {
      return baseProfile("tandf", url.href, {
        doiCandidates: [doi],
        pdfCandidates: [pdfCandidate(`${url.origin}/doi/pdf/${doi}`, "publisher-rule:tandfonline", "Taylor & Francis DOI URL maps to /doi/pdf/{doi}", 92)]
      });
    }

    if (host === "arxiv.org" && /^\/abs\/[^/?#]+/i.test(path)) {
      return baseProfile("arxiv", url.href, {
        doiCandidates: [],
        pdfCandidates: [pdfCandidate(`${url.origin}${path.replace(/^\/abs\//i, "/pdf/")}`, "publisher-rule:arxiv", "arXiv abstract URL maps to /pdf/", 98)]
      });
    }

    if (host === "pmc.ncbi.nlm.nih.gov" || host.endsWith(".pmc.ncbi.nlm.nih.gov")) {
      const pmcMatch = path.match(/\/articles\/(PMC\d+)/i);
      return baseProfile("pmc", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: pmcMatch ? [pdfCandidate(`${url.origin}/articles/${pmcMatch[1]}/pdf/`, "publisher-rule:pmc", "PMC article URL exposes PDF endpoint", 90)] : []
      });
    }

    if (host.includes("biorxiv.org") || host.includes("medrxiv.org")) {
      return baseProfile(host.includes("medrxiv.org") ? "medrxiv" : "biorxiv", url.href, {
        doiCandidates: [doi].filter(Boolean),
        pdfCandidates: [pdfCandidate(`${url.origin}${path.replace(/\/$/, "")}.full.pdf`, host.includes("medrxiv.org") ? "publisher-rule:medrxiv" : "publisher-rule:biorxiv", "bioRxiv/medRxiv content URL maps to .full.pdf", 92)]
      });
    }

    if (host.includes("pnas.org") && doi) {
      return baseProfile("pnas", url.href, {
        doiCandidates: [doi],
        pdfCandidates: [pdfCandidate(`${url.origin}/doi/pdf/${doi}`, "publisher-rule:pnas", "PNAS DOI URL maps to /doi/pdf/{doi}", 92)]
      });
    }

    if (host.includes("academic.oup.com") || host.endsWith(".oup.com")) {
      return baseProfile("oup", url.href, { doiCandidates: [doi].filter(Boolean) });
    }

    if (host.includes("cambridge.org")) {
      return baseProfile("cambridge", url.href, { doiCandidates: [doi].filter(Boolean) });
    }

    if (host.includes("iopscience.iop.org") && doi) {
      return baseProfile("iop", url.href, {
        doiCandidates: [doi],
        pdfCandidates: [pdfCandidate(`${url.origin}/article/${doi}/pdf`, "publisher-rule:iop", "IOP DOI URL maps to /article/{doi}/pdf", 92)]
      });
    }

    if (host.includes("dl.acm.org") && doi) {
      return baseProfile("acm", url.href, {
        doiCandidates: [doi],
        pdfCandidates: [pdfCandidate(`${url.origin}/doi/pdf/${doi}`, "publisher-rule:acm", "ACM DOI URL maps to /doi/pdf/{doi}", 92)]
      });
    }

    return baseProfile("unknown", url.href, {
      doiCandidates: [doi].filter(Boolean)
    });
  }

  root.siteProfiles = {
    COMMON_METADATA_SELECTORS,
    COMMON_CHALLENGE_SIGNALS,
    resolve,
    register,
    adapters
  };
  global.PaperPilotCore = root;
})(globalThis);
