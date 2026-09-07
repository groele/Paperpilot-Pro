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
    "log in through your institution", "sign in to access", "login required", "authentication required",
    "请稍候", "正在检查您的浏览器", "验证您是真人", "访问被拒绝", "需要登录", "机构登录",
    "確認しています", "アクセスが拒否されました", "ログインしてください", "人間であることを確認",
    "잠시만 기다려 주세요", "브라우저를 확인하는 중", "로그인이 필요합니다", "사람인지 확인",
    "un instant", "vérification de votre navigateur", "connectez-vous pour accéder", "accès refusé",
    "einen moment", "browser wird überprüft", "anmeldung erforderlich", "zugriff verweigert",
    "espere un momento", "comprobando su navegador", "inicie sesión para acceder", "acceso denegado"
  ]);

  function toUrl(rawUrl) {
    try {
      return new URL(rawUrl);
    } catch (_) {
      return null;
    }
  }

  function normalizeProxyHost(hostname) {
    let host = String(hostname || "").toLowerCase().trim();
    if (!host) return "";

    const isProxy = /[\w-]+\.(?:ezproxy|libproxy|proxy|idm\.oclc\.org|vpn)\b/i.test(host) ||
                    /-(?:com|org|net|gov|edu|ac-uk|co-uk|cn|jp)(?:-[sp])?\b/i.test(host);
    if (!isProxy) return host;

    // Pattern 1: Hyphenated host with optional WebVPN -s/-p suffix:
    // e.g. "www-sciencedirect-com.libproxy.ucl.ac.uk" -> "www.sciencedirect.com"
    // "link-springer-com-s.vpn.bupt.edu.cn" -> "link.springer.com"
    const hyphenMatch = host.match(/^([a-z0-9-]+)-(com|org|net|gov|edu|ac-uk|co-uk|jp|cn)(?:-[sp])?\b/i);
    if (hyphenMatch) {
      const sub = hyphenMatch[1].replace(/-/g, ".");
      const tld = hyphenMatch[2].replace(/-/g, ".");
      return `${sub}.${tld}`;
    }

    // Pattern 2: Suffix/Dot-based host before proxy domain:
    // e.g. "www.sciencedirect.com.ezproxy.stanford.edu" -> "www.sciencedirect.com"
    // "link.springer.com.idm.oclc.org" -> "link.springer.com"
    const dotMatch = host.match(/^([a-z0-9.-]+\.(?:com|org|net|gov|edu|ac\.uk|co\.uk|jp|cn|de|fr|io|press|nl))(?:\.(?:ezproxy|libproxy|proxy|vpn|idm\.oclc\.org)\b|\.[a-z0-9-]+\.(?:edu|ac\.uk|edu\.cn))/i);
    if (dotMatch) {
      return dotMatch[1];
    }

    return host;
  }

  function cleanProxyUrl(urlString) {
    if (!urlString) return "";
    try {
      const url = new URL(urlString);
      if (url.searchParams.has("url")) {
        const targetUrl = url.searchParams.get("url");
        if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
          return cleanProxyUrl(targetUrl);
        }
      }
      url.hostname = normalizeProxyHost(url.hostname);
      return url.href;
    } catch (e) {
      return urlString;
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

  function iopDoiFromPath(url, effectiveHost) {
    const host = effectiveHost || normalizeProxyHost(url.hostname);
    if (!host.includes("iopscience.iop.org") && !url.hostname.toLowerCase().includes("iopscience.iop.org")) return "";
    const decodedPath = decodeURIComponent(url.pathname);
    const match = decodedPath.match(/^\/article\/(10\.\d{4,9}\/.+?)(?:\/(?:meta|pdf|full|abstract))?\/?$/i);
    return match ? doiFromText(match[1]) : "";
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

  function genericDoiPdfCandidates(context, options = {}) {
    if (!context?.doi) return [];
    const routes = options.routes || [
      [`${context.url.origin}/doi/pdf/${context.doi}`, "DOI PDF endpoint"],
      [`${context.url.origin}/doi/epdf/${context.doi}`, "DOI ePDF endpoint"],
      [`${context.url.origin}/article/${context.doi}/pdf`, "Article DOI PDF endpoint"]
    ];
    return routes.map(([url, reason], index) => pdfCandidate(
      url,
      `publisher-rule:${options.id || "generic-doi"}`,
      reason,
      Math.max(84, Number(options.score || 88) - index * 2),
      { confidence: "medium" }
    ));
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

    add("wiley",
      ({ host, doi }) => host.includes("wiley.com") && Boolean(doi),
      context => profileWithDoi("wiley", context, [
        pdfCandidate(`${context.url.origin}/doi/pdf/${context.doi}`, "publisher-rule:wiley", "Wiley DOI URL maps to /doi/pdf/{doi}", 95),
        pdfCandidate(`${context.url.origin}/doi/epdf/${context.doi}`, "publisher-rule:wiley", "Wiley DOI URL maps to /doi/epdf/{doi}", 92),
        pdfCandidate(`${context.url.origin}/doi/pdfdirect/${context.doi}`, "publisher-rule:wiley", "Wiley DOI URL maps to /doi/pdfdirect/{doi}", 90)
      ]));
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

    add("tandf",
      ({ host, doi }) => host.includes("tandfonline.com") && Boolean(doi),
      context => profileWithDoi("tandf", context, [
        pdfCandidate(`${context.url.origin}/doi/pdf/${context.doi}`, "publisher-rule:tandf", "Taylor & Francis DOI URL maps to /doi/pdf/{doi}", 94),
        pdfCandidate(`${context.url.origin}/doi/epdf/${context.doi}`, "publisher-rule:tandf", "Taylor & Francis DOI URL maps to /doi/epdf/{doi}", 91)
      ]));
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

    add("sage",
      ({ host, doi }) => host.includes("sagepub.com") && Boolean(doi),
      context => profileWithDoi("sage", context, genericDoiPdfCandidates(context, { id: "sage" })));

    add("aip",
      ({ host, doi }) => (host.includes("pubs.aip.org") || host === "aip.org" || host.endsWith(".aip.org")) && Boolean(doi),
      context => profileWithDoi("aip", context, genericDoiPdfCandidates(context, {
        id: "aip",
        routes: [
          [`${context.url.origin}/doi/pdf/${context.doi}`, "AIP DOI PDF endpoint"],
          [`${context.url.origin}/article/${context.doi}/pdf`, "AIP article PDF endpoint"]
        ]
      })));

    add("aps",
      ({ host, path }) => host.includes("aps.org") && /\/abstract\//i.test(path),
      context => profileWithDoi("aps", context, [
        pdfCandidate(`${context.url.origin}${context.path.replace(/\/abstract\//i, "/pdf/")}`, "publisher-rule:aps", "APS abstract route maps to PDF route", 94),
        ...genericDoiPdfCandidates(context, { id: "aps", score: 86 })
      ]));

    add("bmj",
      ({ host, doi }) => host.includes("bmj.com") && Boolean(doi),
      context => profileWithDoi("bmj", context, genericDoiPdfCandidates(context, {
        id: "bmj",
        routes: [
          [`${context.url.origin}/content/${context.doi}.full.pdf`, "BMJ full PDF endpoint"],
          [`${context.url.origin}/doi/pdf/${context.doi}`, "BMJ DOI PDF endpoint"]
        ]
      })));

    add("jstor",
      ({ host, path }) => host.includes("jstor.org") && /\/stable\/(?!pdf\/)([^/?#]+)/i.test(path),
      context => {
        const stableId = context.path.match(/\/stable\/(?!pdf\/)([^/?#]+)/i)?.[1];
        return profileWithDoi("jstor", context, stableId ? [
          pdfCandidate(`${context.url.origin}/stable/pdf/${stableId}.pdf`, "publisher-rule:jstor", "JSTOR stable URL maps to stable/pdf", 92)
        ] : []);
      });

    add("chemrxiv",
      ({ host }) => host.includes("chemrxiv.org"),
      context => profileWithDoi("chemrxiv", context, genericDoiPdfCandidates(context, { id: "chemrxiv", score: 86 })));

    add("researchsquare",
      ({ host, path }) => host.includes("researchsquare.com"),
      context => {
        const articleMatch = context.path.match(/\/article\/(rs-\d+(?:\/v\d+)?)/i);
        const candidates = [];
        if (articleMatch) {
          candidates.push(pdfCandidate(`${context.url.origin}/article/${articleMatch[1]}.pdf`, "publisher-rule:researchsquare", "Research Square article maps to .pdf", 92));
        }
        candidates.push(...genericDoiPdfCandidates(context, { id: "researchsquare", score: 84 }));
        return profileWithDoi("researchsquare", context, candidates);
      });

    add("ssrn",
      ({ host, url }) => host.includes("ssrn.com"),
      context => {
        const abstractId = context.url.searchParams.get("abstract_id") || context.url.searchParams.get("abstractid");
        const candidates = [];
        if (abstractId) {
          candidates.push(pdfCandidate(`https://papers.ssrn.com/sol3/Delivery.cfm?abstractid=${encodeURIComponent(abstractId)}`, "publisher-rule:ssrn", "SSRN delivery endpoint", 90));
        }
        return profileWithDoi("ssrn", context, candidates);
      });

    add("pubmed",
      ({ host, path }) => host.includes("pubmed.ncbi.nlm.nih.gov") && /^\/\d+\/?$/i.test(path),
      context => {
        return baseProfile("pubmed", context.url.href, {
          doiCandidates: [context.doi].filter(Boolean),
          metadataSelectors: [
            ...COMMON_METADATA_SELECTORS,
            { name: "doi", selector: "span.citation-doi" },
            { name: "title", selector: "h1.heading-title" }
          ]
        });
      });

    const metadataDrivenHosts = [
      ["oup", "oup.com"], ["cambridge", "cambridge.org"], ["zenodo", "zenodo.org"],
      ["figshare", "figshare.com"], ["osf", "osf.io"], ["europepmc", "europepmc.org"],
      ["scielo", "scielo."], ["doaj", "doaj.org"], ["copernicus", "copernicus.org"],
      ["bmj", "bmj.com"], ["karger", "karger.com"], ["siam", "siam.org"],
      ["worldscientific", "worldscientific.com"], ["spie", "spiedigitallibrary.org"],
      ["projecteuclid", "projecteuclid.org"], ["annualreviews", "annualreviews.org"]
    ];
    metadataDrivenHosts.forEach(([id, hostname]) => add(id,
      ({ host }) => host.includes(hostname),
      context => profileWithDoi(id, context, genericDoiPdfCandidates(context, { id, score: 84 }))));

    add("degruyter",
      ({ host, path, doi }) => host.includes("degruyter.com") && (Boolean(doi) || /\/document\/doi\//i.test(path)),
      context => profileWithDoi("degruyter", context, [
        pdfCandidate(`${context.url.origin}${context.path.replace(/\/html\/?$/i, "/pdf")}`, "publisher-rule:degruyter", "De Gruyter document maps to /pdf", 93),
        ...genericDoiPdfCandidates(context, { id: "degruyter", score: 86 })
      ]));

    add("emerald",
      ({ host, path, doi }) => host.includes("emerald.com") && (Boolean(doi) || /\/insight\/content\/doi\//i.test(path)),
      context => profileWithDoi("emerald", context, [
        pdfCandidate(`${context.url.origin}${context.path.replace(/\/full\/html\/?$/i, "/full/pdf")}`, "publisher-rule:emerald", "Emerald insight maps to /full/pdf", 93),
        ...genericDoiPdfCandidates(context, { id: "emerald", score: 86 })
      ]));

    add("muse",
      ({ host, path }) => host.includes("muse.jhu.edu") && /\/article\/\d+/i.test(path),
      context => profileWithDoi("muse", context, [
        pdfCandidate(`${context.url.origin}${context.path.replace(/\/$/, "")}/pdf`, "publisher-rule:muse", "Project MUSE article maps to /pdf", 93)
      ]));

    add("biomedcentral",
      ({ host, path }) => host.includes("biomedcentral.com") && /\/articles\//i.test(path),
      context => {
        const candidates = [];
        if (context.doi) {
          candidates.push(pdfCandidate(`${context.url.origin}/counter/pdf/${context.doi}.pdf`, "publisher-rule:biomedcentral", "BMC article URL maps to /counter/pdf/{doi}.pdf", 96));
          candidates.push(pdfCandidate(`${context.url.origin}/articles/${context.doi}.pdf`, "publisher-rule:biomedcentral", "BMC article URL maps to /articles/{doi}.pdf", 94));
        }
        candidates.push(pdfCandidate(`${context.url.origin}${context.path}.pdf`, "publisher-rule:biomedcentral", "BMC article path maps to .pdf", 92));
        return profileWithDoi("biomedcentral", context, candidates);
      });

    add("cell",
      ({ host, path }) => host.includes("cell.com") && (/\/fulltext\//i.test(path) || /\/pdf\//i.test(path)),
      context => {
        const pii = context.path.match(/\/fulltext\/([^/?#]+)/i)?.[1] || context.path.match(/\/pdf\/([^/?#]+)\.pdf/i)?.[1] || "";
        const candidates = [];
        if (pii) {
          candidates.push(pdfCandidate(`${context.url.origin}/action/showPdf?pii=${pii}`, "publisher-rule:cell", "Cell Press PII maps to showPdf", 95));
          candidates.push(pdfCandidate(`${context.url.origin}${context.path.replace(/\/fulltext\//i, "/pdf/")}.pdf`, "publisher-rule:cell", "Cell Press fulltext maps to /pdf/", 93));
        }
        return profileWithDoi("cell", context, candidates);
      });

    add("thelancet",
      ({ host, path }) => host.includes("thelancet.com") && (/\/article\/PII/i.test(path) || /\/fulltext/i.test(path)),
      context => {
        const piiMatch = context.path.match(/\/article\/PII([^/?#]+)/i);
        const candidates = [
          pdfCandidate(`${context.url.origin}${context.path.replace(/\/fulltext\/?$/i, "/pdf")}`, "publisher-rule:thelancet", "The Lancet fulltext maps to /pdf", 95)
        ];
        if (piiMatch) {
          const rawPii = piiMatch[1];
          const pii = rawPii.startsWith("S") ? rawPii : `S${rawPii}`;
          candidates.push(pdfCandidate(`${context.url.origin}/action/showPdf?pii=${pii}`, "publisher-rule:thelancet", "The Lancet PII maps to showPdf", 93));
        }
        return profileWithDoi("thelancet", context, candidates);
      });

    add("researchgate",
      ({ host, path }) => host.includes("researchgate.net") && /\/publication\/\d+/i.test(path),
      context => {
        const pubMatch = context.path.match(/\/publication\/(\d+)/i);
        const candidates = [];
        if (pubMatch) {
          candidates.push(pdfCandidate(`${context.url.origin}/publication/${pubMatch[1]}/download`, "publisher-rule:researchgate", "ResearchGate publication download endpoint", 90, { requiresBrowser: true }));
        }
        return profileWithDoi("researchgate", context, candidates);
      });

    add("semanticscholar",
      ({ host, path }) => host.includes("semanticscholar.org") && /\/paper\//i.test(path),
      context => profileWithDoi("semanticscholar", context, []));

    add("cnki",
      ({ host }) => host.includes("cnki.net"),
      context => baseProfile("cnki", context.url.href, {
        doiCandidates: [context.doi].filter(Boolean),
        metadataSelectors: [
          ...COMMON_METADATA_SELECTORS,
          { name: "title", selector: ".wx-tit h1, .title" },
          { name: "doi", selector: ".wx-tit .doi, a[href*='doi.org']" },
          { name: "author", selector: ".wx-tit .author, .author" },
          { name: "abstract", selector: "#ChDivSummary, .abstract" }
        ]
      }));

    add("wanfang",
      ({ host }) => host.includes("wanfangdata.com.cn"),
      context => baseProfile("wanfang", context.url.href, {
        doiCandidates: [context.doi].filter(Boolean),
        metadataSelectors: [
          ...COMMON_METADATA_SELECTORS,
          { name: "title", selector: ".detailTitle, .title" },
          { name: "doi", selector: ".doi-link, a[href*='doi.org']" },
          { name: "abstract", selector: ".abstract, .summary" }
        ]
      }));

  }

  registerDefaults();

  function resolve(rawUrl) {
    const url = toUrl(rawUrl);
    if (!url) return baseProfile("unknown", rawUrl || "");
    const rawHost = url.hostname.toLowerCase();
    const effectiveHost = normalizeProxyHost(rawHost);
    const context = {
      url,
      rawHost,
      effectiveHost,
      // Seamless EZProxy compatibility: context.host uses the normalized publisher domain
      // while context.url.origin retains the proxy origin for authenticated PDF fetching.
      host: effectiveHost,
      isProxy: rawHost !== effectiveHost,
      path: url.pathname,
      lowerPath: url.pathname.toLowerCase(),
      // IOP appends presentation routes such as /meta and /pdf after the DOI.
      // Resolve that publisher grammar before the generic DOI path matcher so
      // UI route segments never become part of the bibliographic identifier.
      doi: iopDoiFromPath(url, effectiveHost) || doiFromPath(url) || doiFromText(url.href)
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
    genericDoiPdfCandidates,
    normalizeProxyHost,
    cleanProxyUrl,
    resolve,
    register,
    adapters
  };
  global.PaperPilotCore = root;
})(globalThis);
