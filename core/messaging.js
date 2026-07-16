(function(global) {
  const root = global.PaperPilotCore || {};

  function response({
    ok = false,
    data = {},
    error = "",
    errorCode = null,
    source = "unknown",
    cachedAt = null,
    durationMs = 0,
    diagnostics = null
  } = {}) {
    return {
      ok: Boolean(ok),
      success: Boolean(ok),
      data,
      error: error || "",
      errorCode: errorCode || null,
      source,
      cachedAt: cachedAt || null,
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      diagnostics: diagnostics || null
    };
  }

  function ok(data = {}, source = "unknown", cachedAt = null, durationMs = 0, diagnostics = null) {
    return response({ ok: true, data, source, cachedAt, durationMs, diagnostics });
  }

  function fail(errorCode, error, data = {}, source = "unknown", cachedAt = null, durationMs = 0, diagnostics = null) {
    return response({ ok: false, errorCode, error, data, source, cachedAt, durationMs, diagnostics });
  }

  async function withTiming(source, handler) {
    const start = Date.now();
    try {
      const result = await handler();
      const durationMs = Date.now() - start;
      if (result && typeof result === "object") {
        return response({
          ok: result.ok !== undefined ? result.ok : result.success,
          data: Object.prototype.hasOwnProperty.call(result, "data") ? result.data : {},
          error: result.error || "",
          errorCode: result.errorCode || null,
          source: result.source || source,
          cachedAt: result.cachedAt || null,
          durationMs,
          diagnostics: result.diagnostics || null
        });
      }
      return ok(result, source, null, durationMs);
    } catch (error) {
      return fail("UNHANDLED_ERROR", error.message || String(error), null, source, null, Date.now() - start);
    }
  }

  root.messaging = { response, ok, fail, withTiming };
  global.PaperPilotCore = root;
})(globalThis);
