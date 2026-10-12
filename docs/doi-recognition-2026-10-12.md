# DOI recognition changes — 2026-10-12

Version: 4.0.4

## V4.0.4 follow-up

- Group explicit DOI metadata, selected article JSON-LD, page/publisher routes, canonical routes and generic identifiers by authority. Conflicting leading candidates need unique independent corroboration; competing supported identities remain unresolved. Tag order and duplicate evidence do not select a winner.
- JSON-LD uses query-aware page identity and WebPage/mainEntity graph ownership. Mismatched article titles and close competing DOI nodes do not become the current paper. Parsing has 240 KB, 512-node, depth-eight and 128-script limits; oversize scripts are skipped.
- DOM fallback skips hidden nodes, heading-marked reference sections and inline citation prose, while prioritizing explicit article identifiers and labelled DOI evidence. Link/block scans are bounded.
- Encoded prefixes, nested URL transport layers, mixed valid/malformed escapes, non-breaking copied spaces and supplementary Unicode HTML entities are supported. Authoritative Unicode suffixes, literal percent sequences and SICI syntax are preserved; malformed UTF-16 and conflicting single-DOI fields are rejected.
- DOI comparison uses ASCII-only case folding, as specified by the [DOI Handbook](https://www.doi.org/doi-handbook/DOIHandbook_2025.pdf), across evidence, libraries, caches and requests. This avoids merging distinct non-ASCII suffixes.
- CSL/OpenAlex/Unpaywall/Crossref enrichment must carry the requested DOI; the title-resolved Unpaywall path has the same guard. Cache schema is 4.

Validation: 149 tests plus E2E fixtures, 22 DOI page scenarios in the actual MV3 extension, and three native toolbar popup reopenings. Live Crossref records `10.1038/nphys1170` and `10.1002/(SICI)1099-0844(199912)17:4<290::AID-CBF849>3.0.CO;2-P` matched parsed identities. `10.1126/science.169.3946.635` returned HTTP 429 and remains unverified in this run. Controlled service fixtures verify rejection of wrong/missing DOI identities; they do not prove universal publisher coverage or registration of synthetic test identifiers.

The local parser targets common academic 4–9-digit registrant prefixes; it is not a registry validator. A single text input is limited to 16 KB, candidate traversal to 512 visits/depth eight/128 strings, and output to 64 identifiers. Oversize input is refused instead of creating a truncated DOI. Existing shortDOI/OCR/closed-shadow/scanned-PDF limitations remain.

## V4.0.0 original findings and fixes

The previous page extractor checked every DOI anchor before the current article URL, allowing a reference to become the page DOI. It also read arbitrary body text and selected the first JSON-LD article. Fallback extraction now excludes reference and recommendation containers, accepts article identifiers or DOI-labelled blocks, and refuses conflicting fallback candidates. Bibliographic metadata remains first; JSON-LD selection uses the current title and page identity. Current URL and publisher-specific route evidence precede DOM fallback.

The shared parser separates URL query/fragment syntax from percent-encoded DOI characters, decodes URL paths once, supports DOI/URN/info prefixes and PropertyValue identifiers, removes invisible copy artifacts, and preserves balanced brackets and legacy SICI suffixes. Presentation endings are stripped for IOP and Springer/BMC routes only. DOI resolver links encode reserved characters. BibTeX, RIS and CSL exports preserve SICI angle brackets. Explicit identifier normalization preserves terminal punctuation; text extraction removes prose punctuation. Arbitrary OCR substitutions and unrestricted whitespace joining are not performed.

Title lookup now searches up to five results from each index, requires a valid DOI and high title similarity with number, negation and word-order checks, and rejects closely competing DOI identities. Identical DOI records across providers are deduplicated for ambiguity checks. Scholar supplies DOI evidence from the result landing URL when available. Responses carrying a different DOI cannot overwrite an explicitly requested article. Metadata cache schema moves from 2 to 3; unresolved local results expire after five minutes.

## Verification

- `npm run verify`: syntax/version/routing checks, 121 unit/service regressions, and E2E fixture checks.
- `npm run test:browser`: real Chromium MV3 loading and seven DOI page scenarios, plus the existing popup, synchronization, streaming, cancellation, error recovery, viewport and navigation checks.
- Browser DOI scenarios: reference-first DOM with current URL, metadata priority, mixed JSON-LD records, labelled DOI, reference-only page, ambiguous article links, and percent-encoded reserved characters. The encoded case exercises lightweight activation without journal metadata. The all-page detector remains under the existing 6 KB source budget.
- Scholarly service responses are controlled fixtures in these tests. They verify the real parser, service pipeline and extension runtime; they do not constitute a live audit of every publisher or prove DOI registration. Syntactic recognition is separate from registry validity.

## Sources and limits

Rules were checked against the [DOI Handbook](https://www.doi.org/doi-handbook/html/), [DOI resolver documentation](https://doi.org/help.html), and [Crossref's discussion of DOI regular expressions](https://www.crossref.org/blog/dois-and-matching-regular-expressions/).

This parser targets common academic DOI prefixes with 4–9 registrant digits. ShortDOI aliases, arbitrary OCR reconstruction, closed Shadow DOM, and visually embedded DOI text in scanned PDFs are not resolved locally. Sites with incomplete article metadata can still require title lookup. Strict title matching can leave a DOI unresolved when titles differ substantially or multiple editions share a title; this is preferable to silently assigning an unrelated record.

Load this folder as an unpacked extension or extract the packaged ZIP, reload the extension, then refresh existing article tabs to use the updated content scripts.
