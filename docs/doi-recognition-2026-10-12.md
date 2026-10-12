# DOI recognition changes — 2026-10-12

Version: 4.0.0

## Findings and fixes

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
