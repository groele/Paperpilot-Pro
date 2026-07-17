(function(global) {
  const root = global.PaperPilotCore || {};

  const COMMON_METADATA_SELECTORS = Object.freeze([
    "citation_title", "citation_doi", "citation_pdf_url", "citation_journal_title", "citation_author",
    "dc.identifier", "dc.identifier.doi", "dc.title", "prism.doi", "prism.publicationName",
    "article:doi", "rft_id"
  ]);
  const COMMON_CHALLENGE_SIGNALS = Object.freeze([
    "just a moment", "checking your browser", "enable javascript and cookies", "verify you are human",
    "access denied", "attention required", "unusual traffic", "institutional sign in",
    "log in through your institution"
  ]);

  function toUrl(rawUrl) {
    try {
      return new URL(rawUrl);
    } catch (_) {
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
      metadataSelectors: overrides.metadataSelectors || Array.from(COMMON_METADATA_SELECTORS),
      challengeSignals: overrides.challengeSignals || Array.from(COMMON_CHALLENGE_SIGNALS),
      fallbackLandingUrl: overrides.fallbackLandingUrl || rawUrl
    };
  }

  const adapters = [];

  function register(adapter, options = {}) {
    if (!adapter?.id || typeof adapter.match !== "function" || typeof adapter.build !== "function") {
      throw new TypeError("Invalid PaperPilot site adapter");
    }
    if (options.prepend) adapters.unshift(adapter);
    else adapters.push(adapter);
    return adapter;
  }

  function add(id, match, build) {
    register({ id, match, build });
  }

  function profileWithDoi(id, context, pdfCandidates = [], overrides = {}) {
    return baseProfile(id, context.url.href, {
      doiCandidates: [context.doi].filter(Boolean),
      pdfCandidates,
      ...overrides
    });
  }

  function addDoiPdfAdapter(id, hostMatch, route, reason, score = 92) {
    add(id,
      context => hostMatch(context.host) && Boolean(context.doi),
      context => profileWithDoi(id, context, [
        pdfCandidate(route(context), `publisher-rule:${id}`, reason, score)
      ]));
  }

  function registerDefaults() {
    add("elife",
      ({ host, path }) => (host.includes("elifesciences.org") || host.includes("elife.org")) && /\/articles\/\d+/i.test(path),
      context => {
        const article = context.path.match(/\/articles\/(\d+)/i)?.[1];
        return profileWithDoi("elife", context, article ? [pdfCandidate(`${context.url.origin}/articles/${article}.pdf`, "publisher-rule:elife", "eLife article URL maps to .pdf", 96)] : []);
      });

    add("peerj",
      ({ host, path }) => host.includes("peerj.com") && /\/articles\/\d+/i.test(path),
      context => {
        const article = context.path.match(/\/articles\/(\d+)/i)?.[1];
        return profileWithDoi("peerj", context, article ? [pdfCandidate(`${context.url.origin}/articles/${article}.pdf`, "publisher-rule:peerj", "PeerJ article URL maps to .pdf", 96)] : []);
      });

    add("plos",
      ({ host, url }) => host.includes("plos.org") && Boolean(url.searchParams.get("id")),
      context => {
        const articleId = context.url.searchParams.get("id");
        const pdfUrl = `${context.url.origin}${context.url.pathname.replace(/\/article\/?$/i, "/article/file")}?id=${encodeURIComponent(articleId)}&type=printable`;
        return baseProfile("plos", context.url.href, {
          doiCandidates: [context.doi || doiFromText(articleId)].filter(Boolean),
          pdfCandidates: [pdfCandidate(pdfUrl, "publisher-rule:plos", "PLOS article URL maps to printable PDF", 95)]
        });
      });

    add("jstage",
      ({ host, path }) => host.includes("jstage.jst.go.jp") && /\/_article\/?$/i.test(path),
      context => profileWithDoi("jstage", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/\/_article\/?$/i, "/_pdf")}`, "publisher-rule:jstage", "J-STAGE article URL maps to _pdf", 94)]));

    add("science",
      ({ host, doi }) => host.includes("science.org") && Boolean(doi),
      context => profileWithDoi("science", context, [pdfCandidate(`${context.url.origin}/doi/pdf/${context.doi}`, "publisher-rule:science", "Science DOI URL maps to /doi/pdf/{doi}", 94)]));

    add("nature",
      ({ host, path }) => host.includes("nature.com") && /\/articles\/[^/?#]+$/i.test(path),
      context => profileWithDoi("nature", context, [pdfCandidate(`${context.url.origin}${context.path}.pdf`, "publisher-rule:nature", "Nature article URL maps to .pdf", 98)]));

    add("springer",
      ({ host, path }) => (host.includes("springer.com") || host.includes("springerlink.com")) && /^\/article\/10\./i.test(path),
      context => {
        const articleDoi = decodeURIComponent(context.path.replace(/^\/article\//i, ""));
        return baseProfile("springer", context.url.href, {
          doiCandidates: [doiFromText(articleDoi)].filter(Boolean),
          pdfCandidates: [pdfCandidate(`${context.url.origin}/content/pdf/${articleDoi}.pdf`, "publisher-rule:springer", "Springer DOI article URL maps to content/pdf", 92)]
        });
      });

    addDoiPdfAdapter("wiley", host => host.includes("wiley.com"), context => `${context.url.origin}/doi/pdf/${context.doi}`, "Wiley DOI URL maps to /doi/pdf/{doi}", 94);
    addDoiPdfAdapter("acs", host => host.includes("pubs.acs.org"), context => `${context.url.origin}/doi/pdf/${context.doi}`, "ACS DOI URL maps to /doi/pdf/{doi}", 94);

    add("rsc",
      ({ host, path }) => host.includes("pubs.rsc.org") && /\/content\/articlelanding\//i.test(path),
      context => profileWithDoi("rsc", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/\/content\/articlelanding\//i, "/en/content/articlepdf/").replace(/^\/en\/en\//, "/en/")}`, "publisher-rule:rsc", "RSC article landing URL maps to article PDF", 92)]));

    add("ieee",
      ({ host }) => host.includes("ieeexplore.ieee.org"),
      context => {
        const number = context.path.match(/\/document\/(\d+)/i)?.[1] || `${context.path}${context.url.search}`.match(/[?&]arnumber=(\d+)/i)?.[1];
        return profileWithDoi("ieee", context, number ? [pdfCandidate(`${context.url.origin}/stamp/stamp.jsp?tp=&arnumber=${number}`, "publisher-rule:ieee", "IEEE document URL maps to stamp PDF viewer", 90, { confidence: "medium" })] : []);
      });

    add("sciencedirect",
      ({ host }) => host.includes("sciencedirect.com") || host.includes("elsevier.com"),
      context => profileWithDoi("sciencedirect", context,
        context.lowerPath.includes("/pdfft") && context.url.searchParams.get("md5") && context.url.searchParams.get("pid")
          ? [pdfCandidate(context.url.href, "publisher-rule:sciencedirect", "ScienceDirect signed pdfft URL", 96)]
          : [],
        { fallbackLandingUrl: context.url.href }));

    add("mdpi",
      ({ host, path, lowerPath }) => host.includes("mdpi.com") && /^\/\d{4}-\d{4}\/.+/i.test(path) && !lowerPath.endsWith("/pdf"),
      context => profileWithDoi("mdpi", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/\/$/, "")}/pdf`, "publisher-rule:mdpi", "MDPI article URL maps to /pdf", 92)]));

    add("frontiers",
      ({ host }) => host.includes("frontiersin.org"),
      context => {
        const articleDoi = context.path.match(/\/articles\/(10\.[^/]+\/[^/]+)\/(?:full|abstract)?$/i)?.[1];
        return profileWithDoi("frontiers", context, articleDoi ? [pdfCandidate(`${context.url.origin}/articles/${decodeURIComponent(articleDoi)}/pdf`, "publisher-rule:frontiers", "Frontiers article URL maps to /pdf", 92)] : []);
      });

    addDoiPdfAdapter("tandf", host => host.includes("tandfonline.com"), context => `${context.url.origin}/doi/pdf/${context.doi}`, "Taylor & Francis DOI URL maps to /doi/pdf/{doi}");
    add("arxiv",
      ({ host, path }) => host === "arxiv.org" && /^\/abs\/[^/?#]+/i.test(path),
      context => profileWithDoi("arxiv", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/^\/abs\//i, "/pdf/")}`, "publisher-rule:arxiv", "arXiv abstract URL maps to /pdf/", 98)]));

    add("openreview",
      ({ host, url }) => host.includes("openreview.net") && Boolean(url.searchParams.get("id")),
      context => profileWithDoi("openreview", context, [pdfCandidate(`${context.url.origin}/pdf?id=${encodeURIComponent(context.url.searchParams.get("id"))}`, "publisher-rule:openreview", "OpenReview forum URL maps to /pdf?id=", 97)]));

    add("acl-anthology",
      ({ host, path }) => host.includes("aclanthology.org") && /^\/\d{4}\.[^/]+\.\d+\/?$/i.test(path),
      context => profileWithDoi("acl-anthology", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/\/$/, "")}.pdf`, "publisher-rule:acl-anthology", "ACL Anthology paper URL maps to .pdf", 97)]));

    add("pmlr",
      ({ host, path }) => host.includes("proceedings.mlr.press") && /\/v\d+\/[^/]+\.html$/i.test(path),
      context => profileWithDoi("pmlr", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/\.html$/i, ".pdf")}`, "publisher-rule:pmlr", "PMLR paper page maps to .pdf", 97)]));

    add("neurips",
      ({ host, path }) => host.includes("papers.nips.cc") && /-Abstract-Conference\.html$/i.test(path),
      context => profileWithDoi("neurips", context, [pdfCandidate(`${context.url.origin}${context.path.replace(/-Abstract-Conference\.html$/i, "-Paper-Conference.pdf")}`, "publisher-rule:neurips", "NeurIPS abstract page maps to conference PDF", 97)]));

    add("cvf",
      ({ host, path }) => host.includes("openaccess.thecvf.com") && /\/html\/[^/]+\.html$/i.test(path),
      context => profileWithDoi("cvf", context, [pdfCandidate(`${context.url.origin}${context.path.replace("/html/", "/papers/").replace(/\.html$/i, ".pdf")}`, "publisher-rule:cvf", "CVF open-access page maps to paper PDF", 97)]));

    add("pmc",
      ({ host, path }) => (host === "pmc.ncbi.nlm.nih.gov" || host.endsWith(".pmc.ncbi.nlm.nih.gov")) && /\/articles\/PMC\d+/i.test(path),
      context => {
        const pmcId = context.path.match(/\/articles\/(PMC\d+)/i)?.[1];
        return profileWithDoi("pmc", context, [pdfCandidate(`${context.url.origin}/articles/${pmcId}/pdf/`, "publisher-rule:pmc", "PMC article URL exposes PDF endpoint", 90)]);
      });

    add("preprint",
      ({ host }) => host.includes("biorxiv.org") || host.includes("medrxiv.org"),
      context => {
        const id = context.host.includes("medrxiv.org") ? "medrxiv" : "biorxiv";
        const pdfPath = context.lowerPath.endsWith(".full.pdf") ? context.path : `${context.path.replace(/\/$/, "")}.full.pdf`;
        return profileWithDoi(id, context, [pdfCandidate(`${context.url.origin}${pdfPath}`, `publisher-rule:${id}`, "bioRxiv/medRxiv content URL maps to .full.pdf", 92)]);
      });

    addDoiPdfAdapter("pnas", host => host.includes("pnas.org"), context => `${context.url.origin}/doi/pdf/${context.doi}`, "PNAS DOI URL maps to /doi/pdf/{doi}");
    addDoiPdfAdapter("iop", host => host.includes("iopscience.iop.org"), context => `${context.url.origin}/article/${context.doi}/pdf`, "IOP DOI URL maps to /article/{doi}/pdf");
    addDoiPdfAdapter("acm", host => host.includes("dl.acm.org"), context => `${context.url.origin}/doi/pdf/${context.doi}`, "ACM DOI URL maps to /doi/pdf/{doi}");

    const metadataDrivenHosts = [
      ["oup", "oup.com"], ["cambridge", "cambridge.org"], ["zenodo", "zenodo.org"],
      ["figshare", "figshare.com"], ["osf", "osf.io"], ["europepmc", "europepmc.org"],
      ["scielo", "scielo."], ["doaj", "doaj.org"], ["copernicus", "copernicus.org"],
      ["bmj", "bmj.com"], ["degruyter", "degruyter.com"], ["emerald", "emerald.com"],
      ["karger", "karger.com"], ["siam", "siam.org"], ["worldscientific", "worldscientific.com"]
    ];
    metadataDrivenHosts.forEach(([id, hostname]) => add(id,
      ({ host }) => host.includes(hostname),
      context => profileWithDoi(id, context)));
  }

  registerDefaults();

  function resolve(rawUrl) {
    const url = toUrl(rawUrl);
    if (!url) return baseProfile("unknown", rawUrl || "");
    const context = {
      url,
      host: url.hostname.toLowerCase(),
      path: url.pathname,
      lowerPath: url.pathname.toLowerCase(),
      doi: doiFromPath(url) || doiFromText(url.href)
    };
    const adapter = adapters.find(candidate => {
      try {
        return candidate.match(context);
      } catch (_) {
        return false;
      }
    });
    return adapter
      ? adapter.build(context)
      : baseProfile("unknown", url.href, { doiCandidates: [context.doi].filter(Boolean) });
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
