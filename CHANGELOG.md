# Changelog

## v1.3.0 - 2026-07-17

### Added
- Independent PDF verifier and page-activation modules with focused regression coverage.
- Direct adapters for OpenReview, ACL Anthology, PMLR, NeurIPS proceedings, and CVF Open Access.

### Changed
- Converted publisher URL handling to a data-driven adapter registry.
- Replaced eager parallel PDF probes with adaptive hedged HEAD/Range verification.
- Replaced full-page mutation observers with bounded head observation and low-frequency route checks.

### Fixed
- Accumulate split response chunks before checking the PDF signature and reject HTML/JSON disguised as binary downloads.
- Preserve functional download parameters in candidate identities and hash every candidate in request-cache keys.
- Retry failed dynamic injection, avoid duplicate runtime/CSS injection, queue same-URL downloads safely, and invalidate stale signed-link caches.
- Cache only definitive negative PDF checks; transient timeouts, authentication failures, and network errors remain retryable.

## v1.2.0 - 2026-07-16

### Added
- Lightweight all-page academic detector with on-demand journal runtime activation.
- Modular PDF discovery for metadata, controls, embedded viewers, JSON-LD, viewer parameters, and open shadow roots.
- Pluggable publisher adapters for long-tail journal and repository support.
- Bounded TTL/LRU caches and single-flight request coordination.
- Current-page diagnostics, regression fixtures, performance budgets, and reproducible packaging scripts.

### Changed
- Reworked the PDF candidate, verification, caching, and download pipeline for faster repeated downloads and clearer diagnostics.
- Limited heavy content scripts to academic routes while retaining broad background fetch permissions.
- Added SPA lifecycle handling and stale-callback protection for dynamic article pages.
- Updated the extension version to 1.2.0.

### Fixed
- Prevented unverified browser download fallbacks from polluting the persistent verified-PDF cache.
- Preserved case-sensitive URL paths in cache keys and accepted valid PDF headers within the first 1024 bytes.
- Removed fabricated metric estimates and simulated AI-summary fallbacks from the runtime path.

### Compatibility
Backward compatible; no settings migration is required. Publisher authentication and paywall access still depend on the active browser and institutional session.
