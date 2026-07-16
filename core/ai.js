(function(global) {
  const root = global.PaperPilotCore || {};
  const messaging = root.messaging;

  const PROVIDER_DEFAULTS = {
    openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
    gemini: { model: "gemini-1.5-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
    deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
    anthropic: { model: "claude-3-5-haiku-latest", baseUrl: "https://api.anthropic.com/v1" },
    openrouter: { model: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1" },
    ollama: { model: "llama3.1", baseUrl: "http://127.0.0.1:11434" },
    custom: { model: "", baseUrl: "" }
  };

  function getDefaults(provider) {
    return PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;
  }

  function normalizeBaseUrl(baseUrl, fallback) {
    return String(baseUrl || fallback || "").trim().replace(/\/+$/, "");
  }

  function providerNeedsApiKey(provider) {
    return !["ollama", "custom"].includes(provider);
  }

  function buildMessages(prompt, title, abstract, testOnly = false) {
    if (testOnly) {
      return [
        { role: "system", content: "You are a concise academic assistant." },
        { role: "user", content: "Connection test. Reply with OK." }
      ];
    }
    return [
      { role: "system", content: "You are a careful academic assistant. Be concise and do not invent paper details." },
      { role: "user", content: `${prompt || "Summarize this paper."}\n\nTitle: ${title || ""}\nAbstract: ${abstract || ""}` }
    ];
  }

  async function fetchJsonWithTimeout(endpoint, options, timeoutMs = 25000, fetchImpl = fetch) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetchImpl(endpoint, controller ? { ...options, signal: controller.signal } : options);
      let body = null;
      try {
        body = await response.json();
      } catch (_) {}
      if (!response.ok) {
        const details = body?.error?.message || body?.message || `HTTP ${response.status}`;
        throw new Error(details);
      }
      return body;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function extractCompatibleChatText(data) {
    return data?.choices?.[0]?.message?.content ||
           data?.choices?.[0]?.text ||
           data?.output_text ||
           "";
  }

  async function callProvider(config) {
    const provider = config.provider || "openai";
    const defaults = getDefaults(provider);
    const model = String(config.model || defaults.model || "").trim();
    const baseUrl = normalizeBaseUrl(config.baseUrl, defaults.baseUrl);
    const apiKey = String(config.apiKey || "").trim();
    const testOnly = Boolean(config.testOnly);

    if (!model) throw Object.assign(new Error("AI model is empty"), { code: "AI_MODEL_MISSING" });
    if (providerNeedsApiKey(provider) && !apiKey) {
      throw Object.assign(new Error("Missing API key for selected provider"), { code: "AI_API_KEY_MISSING" });
    }
    const fetchImpl = config.fetchImpl || fetch;

    const messages = buildMessages(config.prompt, config.title, config.abstract, testOnly);
    const userText = messages.map(item => `${item.role}: ${item.content}`).join("\n");

    if (provider === "gemini") {
      const endpoint = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const data = await fetchJsonWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
          generationConfig: { temperature: testOnly ? 0 : 0.4, maxOutputTokens: testOnly ? 16 : 700 }
        })
      }, 25000, fetchImpl);
      return data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || "";
    }

    if (provider === "anthropic") {
      const data = await fetchJsonWithTimeout(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: testOnly ? 16 : 700,
          temperature: testOnly ? 0 : 0.4,
          system: messages[0].content,
          messages: [{ role: "user", content: messages[1].content }]
        })
      }, 25000, fetchImpl);
      return data?.content?.map(item => item.text || "").join("").trim() || "";
    }

    if (provider === "ollama") {
      const data = await fetchJsonWithTimeout(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: { temperature: testOnly ? 0 : 0.4 }
        })
      }, 30000, fetchImpl);
      return data?.message?.content?.trim() || "";
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const data = await fetchJsonWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: testOnly ? 0 : 0.4,
        max_tokens: testOnly ? 16 : 700
      })
    }, 25000, fetchImpl);
    return extractCompatibleChatText(data).trim();
  }

  async function summarize(config) {
    const provider = config.provider || "openai";
    try {
      const summary = await callProvider(config);
      return messaging.ok({
        summary,
        provider,
        model: config.model || getDefaults(provider).model
      }, `ai/${provider}`);
    } catch (error) {
      const errorCode = error.code === "AI_API_KEY_MISSING" || error.code === "AI_MODEL_MISSING"
        ? error.code
        : "AI_PROVIDER_ERROR";
      return messaging.fail(errorCode, error.message, {
        summary: "",
        provider,
        model: config.model || getDefaults(provider).model
      }, `ai/${provider}`);
    }
  }

  root.ai = {
    PROVIDER_DEFAULTS,
    getDefaults,
    normalizeBaseUrl,
    providerNeedsApiKey,
    buildMessages,
    callProvider,
    summarize
  };
  global.PaperPilotCore = root;
})(globalThis);
