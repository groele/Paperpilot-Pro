(function(global) {
  const root = global.PaperPilotCore || {};
  const messaging = root.messaging;

  const ACADEMIC_PROMPT_PRESETS = Object.freeze({
    tldr: {
      id: "tldr",
      label: "TL;DR 极速",
      icon: "⚡",
      prompt: "请用中文以3行精简要点总结以下学术论文摘要，以TL;DR形式呈现，突出核心发现与研究结论："
    },
    novelty: {
      id: "novelty",
      label: "💡 创新贡献",
      icon: "💡",
      prompt: "请深入剖析以下论文的核心创新点（Novelty）与学术贡献（Contributions），分条列出其相较于前人工作的根本突破："
    },
    methodology: {
      id: "methodology",
      label: "🔬 方法路线",
      icon: "🔬",
      prompt: "请简明扼要地拆解以下论文的技术路线、核心方法与算法架构（Methodology），说明其关键设计与运行逻辑："
    },
    limitations: {
      id: "limitations",
      label: "⚠️ 局限批判",
      icon: "⚠️",
      prompt: "请以审稿人（Reviewer）的批判性视角，客观审视以下论文中可能存在的假设限制、潜在局限性（Limitations）、应用边界或未来待验证方向："
    },
    glossary: {
      id: "glossary",
      label: "🌐 术语精讲",
      icon: "🌐",
      prompt: "请从以下学术论文标题和摘要中提取3-5个最核心的关键术语/技术名词，提供精准的【中文翻译】以及【学术概念简要通俗解析】："
    }
  });

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

  function resolvePrompt(presetKey, customPrompt) {
    if (presetKey && ACADEMIC_PROMPT_PRESETS[presetKey]) {
      return ACADEMIC_PROMPT_PRESETS[presetKey].prompt;
    }
    if (customPrompt && String(customPrompt).trim()) {
      return String(customPrompt).trim();
    }
    return ACADEMIC_PROMPT_PRESETS.tldr.prompt;
  }

  function buildMessages(prompt, title, abstract, testOnly = false) {
    if (testOnly) {
      return [
        { role: "system", content: "You are a concise academic assistant." },
        { role: "user", content: "Connection test. Reply with OK." }
      ];
    }
    const resolvedPrompt = prompt || ACADEMIC_PROMPT_PRESETS.tldr.prompt;
    return [
      { role: "system", content: "You are a careful academic assistant. Be concise, rigorous, and do not invent paper details." },
      { role: "user", content: `${resolvedPrompt}\n\nTitle: ${title || ""}\nAbstract: ${abstract || ""}` }
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
          generationConfig: { temperature: testOnly ? 0 : 0.4, maxOutputTokens: testOnly ? 16 : 900 }
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
          max_tokens: testOnly ? 16 : 900,
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
        max_tokens: testOnly ? 16 : 900
      })
    }, 25000, fetchImpl);
    return extractCompatibleChatText(data).trim();
  }

  /**
   * Reads an HTTP Response stream line by line.
   */
  async function readStreamLines(response, onLine, signal, idleTimeoutMs = 25000) {
    if (!response?.body?.getReader) {
      throw new Error("Streaming is not supported in this runtime environment.");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let idleTimer = null;
    let timedOut = false;

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (idleTimeoutMs > 0) {
        idleTimer = setTimeout(() => {
          timedOut = true;
          try { reader.cancel(new Error("Stream idle timeout: connection stalled")); } catch (_) {}
        }, idleTimeoutMs);
      }
    };

    resetIdleTimer();
    try {
      while (true) {
        if (signal?.aborted) {
          try { await reader.cancel(); } catch (_) {}
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          onLine(line);
        }
      }
      if (buffer.trim()) {
        onLine(buffer);
      }
      if (timedOut) {
        throw new Error("Stream idle timeout: connection stalled");
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      try { reader.releaseLock(); } catch (_) {}
    }
  }

  /**
   * Calls AI provider with real-time token streaming.
   * Invokes onChunk(delta, accumulatedText) as tokens arrive.
   */
  async function callProviderStream(config, onChunk = () => {}, signal = null) {
    const provider = config.provider || "openai";
    const defaults = getDefaults(provider);
    const model = String(config.model || defaults.model || "").trim();
    const baseUrl = normalizeBaseUrl(config.baseUrl, defaults.baseUrl);
    const apiKey = String(config.apiKey || "").trim();

    if (!model) throw Object.assign(new Error("AI model is empty"), { code: "AI_MODEL_MISSING" });
    if (providerNeedsApiKey(provider) && !apiKey) {
      throw Object.assign(new Error("Missing API key for selected provider"), { code: "AI_API_KEY_MISSING" });
    }

    const messages = buildMessages(config.prompt, config.title, config.abstract, false);
    const userText = messages.map(item => `${item.role}: ${item.content}`).join("\n");
    let accumulatedText = "";

    function emitDelta(delta) {
      if (!delta) return;
      accumulatedText += delta;
      onChunk(delta, accumulatedText);
    }

    // A. Gemini SSE Stream
    if (provider === "gemini") {
      const endpoint = `${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1000 }
        }),
        signal
      });
      if (!response.ok) {
        let errText = "";
        try { const errJson = await response.json(); errText = errJson?.error?.message || ""; } catch (_) {}
        throw new Error(errText || `Gemini API HTTP ${response.status}`);
      }

      await readStreamLines(response, line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) return;
        try {
          const parsed = JSON.parse(dataStr);
          const chunkText = parsed.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
          emitDelta(chunkText);
        } catch (_) {}
      }, signal);

      return { fullText: accumulatedText.trim(), provider, model };
    }

    // B. Anthropic Claude SSE Stream
    if (provider === "anthropic") {
      const endpoint = `${baseUrl}/messages`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          temperature: 0.4,
          system: messages[0].content,
          messages: [{ role: "user", content: messages[1].content }],
          stream: true
        }),
        signal
      });
      if (!response.ok) {
        let errText = "";
        try { const errJson = await response.json(); errText = errJson?.error?.message || ""; } catch (_) {}
        throw new Error(errText || `Anthropic API HTTP ${response.status}`);
      }

      await readStreamLines(response, line => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;
        const dataStr = trimmed.slice(5).trim();
        if (!dataStr) return;
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            emitDelta(parsed.delta.text || "");
          }
        } catch (_) {}
      }, signal);

      return { fullText: accumulatedText.trim(), provider, model };
    }

    // C. Ollama Stream
    if (provider === "ollama") {
      const endpoint = `${baseUrl}/api/chat`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          options: { temperature: 0.4 }
        }),
        signal
      });
      if (!response.ok) {
        throw new Error(`Ollama API HTTP ${response.status}`);
      }

      await readStreamLines(response, line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed);
          const chunkText = parsed.message?.content || "";
          emitDelta(chunkText);
        } catch (_) {}
      }, signal);

      return { fullText: accumulatedText.trim(), provider, model };
    }

    // D. OpenAI compatible (OpenAI, DeepSeek, OpenRouter, Custom)
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const endpoint = `${baseUrl}/chat/completions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 1000,
        stream: true
      }),
      signal
    });

    if (!response.ok) {
      let errText = "";
      try {
        const errJson = await response.json();
        errText = errJson?.error?.message || errJson?.message || "";
      } catch (_) {}
      throw new Error(errText || `API HTTP ${response.status}`);
    }

    await readStreamLines(response, line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const dataStr = trimmed.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") return;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content || "";
        emitDelta(delta);
      } catch (_) {}
    }, signal);

    return { fullText: accumulatedText.trim(), provider, model };
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
    ACADEMIC_PROMPT_PRESETS,
    PROVIDER_DEFAULTS,
    getDefaults,
    normalizeBaseUrl,
    providerNeedsApiKey,
    resolvePrompt,
    buildMessages,
    callProvider,
    callProviderStream,
    summarize
  };
  global.PaperPilotCore = root;
})(globalThis);
