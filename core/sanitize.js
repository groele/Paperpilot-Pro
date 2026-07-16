(function(global) {
  const root = global.PaperPilotCore || {};

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  root.sanitize = {
    escapeHtml,
    escapeAttr
  };
  global.PaperPilotCore = root;
})(globalThis);
