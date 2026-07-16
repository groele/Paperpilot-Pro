(function(global) {
  const root = global.PaperPilotCore || {};

  function recordTime(record) {
    return Number(record?.cachedAt || record?.updatedAt || record?.createdAt || 0);
  }

  function pruneRecordObject(records, options = {}) {
    const source = records && typeof records === "object" ? records : {};
    const now = Number(options.now || Date.now());
    const maxEntries = Math.max(1, Number(options.maxEntries || 200));
    const ttlMs = Math.max(0, Number(options.ttlMs || 0));
    const preserve = new Set(options.preserveKeys || []);
    const entries = Object.entries(source);

    entries.forEach(([key, record]) => {
      if (preserve.has(key)) return;
      const timestamp = recordTime(record);
      if (ttlMs > 0 && timestamp > 0 && now - timestamp > ttlMs) {
        delete source[key];
      }
    });

    const removable = Object.entries(source)
      .filter(([key]) => !preserve.has(key))
      .sort((a, b) => recordTime(b[1]) - recordTime(a[1]));
    removable.slice(maxEntries).forEach(([key]) => delete source[key]);
    return source;
  }

  function createSingleFlight() {
    const pending = new Map();
    return {
      has(key) {
        return pending.has(key);
      },
      run(key, factory) {
        if (pending.has(key)) return pending.get(key);
        const task = Promise.resolve().then(factory).finally(() => pending.delete(key));
        pending.set(key, task);
        return task;
      },
      clear() {
        pending.clear();
      },
      get size() {
        return pending.size;
      }
    };
  }

  root.cache = {
    pruneRecordObject,
    createSingleFlight
  };
  global.PaperPilotCore = root;
})(globalThis);
