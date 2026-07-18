(function(global) {
  const root = global.PaperPilotBackground || {};
  const JOURNAL_RUNTIME_FILES = Object.freeze([
    "core/messaging.js",
    "core/sanitize.js",
    "core/metadata.js",
    "core/site-profiles.js",
    "core/citation.js",
    "core/pdf.js",
    "core/pdf-discovery.js",
    "lib/svg-icons.js",
    "content/journal.js"
  ]);

  function scriptingCall(method, details) {
    return new Promise((resolve, reject) => {
      chrome.scripting[method](details, result => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    });
  }

  async function probe(target) {
    const result = await scriptingCall("executeScript", {
      target,
      func: () => Boolean(globalThis.__PAPERPILOT_JOURNAL_LOADED__)
    });
    return Boolean(result?.[0]?.result);
  }

  async function activate(sender, requestedUrl) {
    const tabId = sender?.tab?.id;
    const frameId = Number(sender?.frameId || 0);
    const senderUrl = sender?.url || sender?.tab?.url || "";
    if (!Number.isInteger(tabId) || frameId !== 0 || !/^https?:\/\//i.test(senderUrl)) {
      return { ok: false, success: false, errorCode: "PAGE_ACTIVATION_DENIED", error: "Unsupported sender" };
    }
    if (requestedUrl) {
      try {
        if (new URL(requestedUrl).origin !== new URL(senderUrl).origin) {
          return { ok: false, success: false, errorCode: "PAGE_ACTIVATION_DENIED", error: "Sender origin changed" };
        }
      } catch (_) {
        return { ok: false, success: false, errorCode: "PAGE_ACTIVATION_DENIED", error: "Invalid sender URL" };
      }
    }

    const target = { tabId, frameIds: [frameId] };
    if (await probe(target)) {
      return { ok: true, success: true, source: "dynamic-journal-activation", alreadyActive: true };
    }
    await Promise.all([
      scriptingCall("insertCSS", { target, files: ["content/journal.css"] }),
      scriptingCall("executeScript", { target, files: JOURNAL_RUNTIME_FILES })
    ]);
    if (!await probe(target)) {
      return { ok: false, success: false, errorCode: "PAGE_ACTIVATION_INCOMPLETE", error: "Journal runtime did not initialize" };
    }
    return { ok: true, success: true, source: "dynamic-journal-activation", alreadyActive: false };
  }

  root.pageActivation = { activate, probe, JOURNAL_RUNTIME_FILES };
  global.PaperPilotBackground = root;
})(globalThis);
