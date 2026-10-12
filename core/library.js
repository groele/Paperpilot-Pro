(function(global) {
  const root = global.PaperPilotCore || {};
  const STATUSES = ['visited', 'downloaded', 'copied_bibtex', 'copied_doi', 'copied_citation', 'copied_markdown'];
  const normalize = value => String(value || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const titleKey = value => root.metadata.normalizeTitle(value);
  const doiKey = value => root.metadata.normalizeDoi(value).toLowerCase();
  const authors = value => root.citation?.normalizeAuthors(value) || (Array.isArray(value) ? value.map(String) : []);

  function samePaper(left, right) {
    if (!left || !right) return false;
    const a = doiKey(left.doi), b = doiKey(right.doi);
    if (a && b) return a === b;
    if (left.id && right.id && left.id === right.id) return true;
    const title = titleKey(left.title);
    if (!title || title !== titleKey(right.title)) return false;
    if (left.year && right.year && Number(left.year) !== Number(right.year)) return false;
    const firstA = normalize(authors(left.authors)[0]), firstB = normalize(authors(right.authors)[0]);
    return !(firstA && firstB && firstA !== firstB);
  }

  function recordKey(record) {
    if (record.id) return String(record.id);
    const doi = doiKey(record.doi);
    return doi ? `doi:${doi}` : `title:${titleKey(record.title)}|${record.year || ''}|${normalize(authors(record.authors)[0])}`;
  }

  function normalizeRecord(record) {
    const year = Number(record.year);
    const status = STATUSES.includes(record.status) ? record.status : 'visited';
    const rawTime = record.time || record.updatedAt || record.timestamp;
    const parsedTime = Number(rawTime) || (typeof rawTime === 'string' ? Date.parse(rawTime) : 0);
    const normalized = {
      ...record,
      title: String(record.title || '').trim(),
      doi: root.metadata.normalizeDoi(record.doi),
      journal: String(record.journal || '').trim(),
      year: Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : null,
      authors: authors(record.authors).slice(0, 50),
      notes: String(record.notes || '').slice(0, 50000),
      status,
      actions: Array.from(new Set([...(Array.isArray(record.actions) ? record.actions : []), status])).filter(action => STATUSES.includes(action)),
      starred: record.starred === true,
      time: Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : 0,
      pdfUrl: /^https?:\/\//i.test(String(record.pdfUrl || '')) ? String(record.pdfUrl) : '',
      pageUrl: /^https?:\/\//i.test(String(record.pageUrl || '')) ? String(record.pageUrl) : ''
    };
    normalized.id = recordKey(normalized);
    return normalized;
  }

  function mergeRecord(existing, incoming, now = Date.now()) {
    const merged = { ...existing, ...incoming, time: now };
    for (const key of ['title', 'doi', 'journal', 'year', 'pdfUrl', 'pageUrl']) {
      if (!incoming[key] && existing?.[key]) merged[key] = existing[key];
    }
    if (!incoming.authors?.length) merged.authors = existing?.authors || [];
    if (typeof incoming.starred !== 'boolean') merged.starred = existing?.starred === true;
    if (typeof incoming.notes !== 'string') merged.notes = existing?.notes || '';
    merged.actions = [...(existing?.actions || [existing?.status]), ...(incoming.actions || []), incoming.status || 'visited'];
    if (existing?.id) merged.id = existing.id;
    return normalizeRecord(merged);
  }

  function hasAction(record, type) {
    const actions = record.actions || [record.status];
    return actions.some(action => type === 'copied' ? String(action).startsWith('copied_') : action === type);
  }

  function search(records, query) {
    const parts = Array.from(String(query || '').matchAll(/(?:(title|author|journal|doi|year|notes):)?(?:"([^"]+)"|(\S+))/gi), match => ({ field: match[1]?.toLowerCase(), value: normalize(match[1]?.toLowerCase() === 'doi' ? root.metadata.normalizeDoi(match[2] || match[3]) || match[2] || match[3] : match[2] || match[3]) }));
    if (!parts.length) return records;
    return records.map((record, index) => {
      const fields = { title: normalize(record.title), author: normalize(authors(record.authors).join(' ')), journal: normalize(record.journal), doi: doiKey(record.doi), year: String(record.year || ''), notes: normalize(record.notes) };
      let score = 0;
      for (const part of parts) {
        const eligible = part.field ? [part.field] : Object.keys(fields);
        const matched = eligible.filter(field => fields[field].includes(part.value));
        if (!matched.length) return null;
        score += Math.max(...matched.map(field => field === 'doi' ? 8 : field === 'title' ? 5 : field === 'notes' ? 1 : 2));
      }
      return { record, score, index };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index).map(result => result.record);
  }

  function duplicateGroups(records) {
    const groups = [], byDoi = new Map(), byTitle = new Map(), evidence = new WeakMap();
    records.forEach((record, index) => {
      const doi = doiKey(record.doi), title = titleKey(record.title);
      const candidates = new Set([...(byDoi.get(doi) || []), ...(byTitle.get(title) || [])]);
      let group = Array.from(candidates).find(g => samePaper(evidence.get(g), record));
      if (!group) { group = []; groups.push(group); }
      const known = evidence.get(group) || record;
      evidence.set(group, { ...known, doi: known.doi || record.doi, year: known.year || record.year, authors: known.authors?.length ? known.authors : record.authors });
      group.push(index);
      if (doi) { if (!byDoi.has(doi)) byDoi.set(doi, []); if (!byDoi.get(doi).includes(group)) byDoi.get(doi).push(group); }
      if (title) { if (!byTitle.has(title)) byTitle.set(title, []); if (!byTitle.get(title).includes(group)) byTitle.get(title).push(group); }
    });
    return groups;
  }

  function importRecords(existing, incoming) {
    const history = existing.map(normalizeRecord), byDoi = new Map(), byTitle = new Map();
    const index = record => {
      const doi = doiKey(record.doi), title = titleKey(record.title);
      if (doi) byDoi.set(doi, record);
      if (title) { if (!byTitle.has(title)) byTitle.set(title, []); byTitle.get(title).push(record); }
    };
    history.forEach(index);
    const added = [];
    for (const raw of incoming) {
      const record = normalizeRecord(raw);
      if (!record.title && !record.doi) continue;
      const doi = doiKey(record.doi), title = titleKey(record.title);
      if (byDoi.has(doi) || (byTitle.get(title) || []).some(item => samePaper(item, record))) continue;
      added.push(record); index(record);
    }
    return { history: [...added, ...history], added: added.length };
  }

  root.library = { samePaper, recordKey, normalizeRecord, mergeRecord, hasAction, search, duplicateGroups, importRecords };
  global.PaperPilotCore = root;
})(globalThis);
