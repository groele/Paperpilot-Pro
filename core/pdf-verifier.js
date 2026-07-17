(function(global) {
  const root = global.PaperPilotCore || {};

  const DEFAULTS = Object.freeze({
    headTimeoutMs: 1400,
    rangeTimeoutMs: 1800,
    hedgeDelayMs: 140,
    maxPrefixBytes: 1024
  });

  function abortedResult(reason = "Aborted by parent signal") {
    return {
      valid: false,
      decisive: false,
      transient: true,
      errorCode: "PDF_ABORTED",
      reason
    };
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timer = setTimeout(resolve, Math.max(0, ms));
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  function createTimedFetch(fetchImpl, url, options, timeoutMs, parentSignal) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (parentSignal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    parentSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return Promise.resolve()
      .then(() => fetchImpl(url, { ...options, signal: controller.signal }))
      .finally(() => {
        clearTimeout(timer);
        parentSignal?.removeEventListener("abort", onAbort);
      });
  }

  async function readResponsePrefix(response, maxBytes = DEFAULTS.maxPrefixBytes) {
    if (!response?.body?.getReader) return null;
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (total < maxBytes) {
        const part = await reader.read();
        if (part.done) break;
        if (!part.value?.length) continue;
        const remaining = maxBytes - total;
        const value = part.value.length > remaining ? part.value.slice(0, remaining) : part.value;
        chunks.push(value);
        total += value.length;
      }
    } finally {
      try {
        await reader.cancel();
      } catch (_) {}
    }
    if (total === 0) return null;
    const output = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => {
      output.set(chunk, offset);
      offset += chunk.length;
    });
    return output;
  }

  function chooseFailure(results) {
    return results.find(result => result?.decisive) ||
      results.find(result => result?.errorCode === "PDF_AUTH_REQUIRED") ||
      results.find(result => result?.errorCode && result.errorCode !== "PDF_NOT_CONFIRMED") ||
      results.find(Boolean) ||
      { valid: false, decisive: false, transient: false, errorCode: "PDF_NOT_CONFIRMED", reason: "No PDF response detected" };
  }

  function create(options = {}) {
    const fetchImpl = options.fetchImpl || global.fetch?.bind(global);
    if (typeof fetchImpl !== "function") throw new TypeError("PDF verifier requires fetch");
    const config = { ...DEFAULTS, ...options };

    async function verifyHead(url, signal) {
      try {
        const response = await createTimedFetch(fetchImpl, url, {
          method: "HEAD",
          credentials: "include",
          headers: { Accept: "application/pdf, */*" }
        }, config.headTimeoutMs, signal);
        const result = root.pdf?.classifyPdfResponse?.(response) || { valid: false, errorCode: "PDF_NOT_CONFIRMED" };
        // Negative HEAD responses are not definitive: several publisher CDNs
        // reject HEAD while serving the same URL correctly via GET/Range.
        if (result.errorCode === "PDF_HTML_RESPONSE") {
          return { ...result, decisive: false, errorCode: "PDF_NOT_CONFIRMED", reason: "HEAD content type not conclusive" };
        }
        return result.valid ? result : { ...result, decisive: false };
      } catch (error) {
        return signal?.aborted ? abortedResult() : root.pdf?.classifyPdfError?.(error) || { valid: false, error: String(error) };
      }
    }

    async function verifyRange(url, signal) {
      try {
        const response = await createTimedFetch(fetchImpl, url, {
          method: "GET",
          credentials: "include",
          headers: { Range: `bytes=0-${config.maxPrefixBytes - 1}`, Accept: "application/pdf, */*" }
        }, config.rangeTimeoutMs, signal);
        const prefix = (response.ok || response.status === 206)
          ? await readResponsePrefix(response, config.maxPrefixBytes)
          : null;
        return root.pdf?.classifyPdfResponse?.(response, prefix) || { valid: false, errorCode: "PDF_NOT_CONFIRMED" };
      } catch (error) {
        return signal?.aborted ? abortedResult() : root.pdf?.classifyPdfError?.(error) || { valid: false, error: String(error) };
      }
    }

    async function quickVerify(url, signal) {
      if (!url) return { valid: false, decisive: true, errorCode: "PDF_URL_MISSING" };
      const result = await verifyHead(url, signal);
      return result.valid ? result : { ...result, decisive: false };
    }

    async function verify(url, parentSignal = null) {
      if (!url) return { valid: false, decisive: true, errorCode: "PDF_URL_MISSING" };
      if (parentSignal?.aborted) return abortedResult();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      parentSignal?.addEventListener("abort", onAbort, { once: true });
      const results = [];

      try {
        return await new Promise(resolve => {
          let settled = false;
          let completed = 0;
          const finish = result => {
            if (settled) return;
            results.push(result);
            completed += 1;
            if (result?.valid) {
              settled = true;
              controller.abort();
              resolve(result);
            } else if (completed === 2) {
              settled = true;
              controller.abort();
              resolve(chooseFailure(results));
            }
          };

          verifyHead(url, controller.signal).then(finish);
          delay(config.hedgeDelayMs, controller.signal)
            .then(() => verifyRange(url, controller.signal))
            .then(finish)
            .catch(error => finish(controller.signal.aborted ? abortedResult() : root.pdf?.classifyPdfError?.(error)));
        });
      } finally {
        controller.abort();
        parentSignal?.removeEventListener("abort", onAbort);
      }
    }

    return { quickVerify, verify, verifyHead, verifyRange };
  }

  root.pdfVerifier = {
    DEFAULTS,
    create,
    readResponsePrefix,
    chooseFailure
  };
  global.PaperPilotCore = root;
})(globalThis);
