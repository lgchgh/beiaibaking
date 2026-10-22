'use strict';

// Editorial discovery only. Search coverage is NOT Google Trends query-volume evidence.
const LIMIT_DAYS = 45;
const MAX_SOURCES = 12;

function isoDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z\d]+/g, ' ').trim().split(/\s+/)
    .filter(Boolean).map(w => w.endsWith('ies') && w.length > 5 ? w.slice(0,-3) + 'y' :
      w.endsWith('s') && w.length > 4 && !w.endsWith('ss') ? w.slice(0,-1) : w);
}

function supportedName(product, source) {
  const useful = words(product).filter(w => !['the','and','with','filled','style','flavored','flavour','cake','dessert','pastry','cookie','recipe','how','to'].includes(w));
  if (!useful.length) return false;
  const haystack = new Set(words(`${source.title} ${source.content}`));
  return useful.filter(w => haystack.has(w)).length >= Math.max(1, Math.ceil(useful.length * 0.75));
}

function normalizeSources(results, now) {
  const out = [];
  const seen = new Set();
  for (const r of results || []) {
    try {
      const url = new URL(String(r.url || ''));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      url.hash = '';
      const str = url.toString();
      if (seen.has(str)) continue;
      const date = isoDate(r.published_date);
      if (!date) continue; // Search results without dates do not establish recency.
      const age = (now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86400000;
      if (age < -1 || age > LIMIT_DAYS) continue;
      const title = String(r.title || '').replace(/\s+/g,' ').trim().slice(0, 180);
      const content = String(r.content || '').replace(/\s+/g,' ').trim().slice(0, 700);
      if (!title || content.length < 35) continue;
      seen.add(str);
      out.push({ title, url: str, domain: url.hostname.toLowerCase(), published_date: date, content });
      if (out.length >= MAX_SOURCES) break;
    } catch { /* ignore bad external result */ }
  }
  return out;
}

function selectCandidates(output, sources) {
  const candidates = [];
  const seen = new Set();
  const list = Array.isArray(output?.candidates) ? output.candidates.slice(0, 16) : [];
  for (const item of list) {
    const name = String(item?.product || '').replace(/\s+/g, ' ').trim();
    const question = String(item?.blog_question || '').replace(/\s+/g, ' ').trim();
    if (name.length < 4 || name.length > 65 || /[<>\n\r]/.test(name) || question.length > 160) continue;
    if (/\b(paris|internship|my\s+life|client\s+story|travel\s+diary)\b/i.test(name)) continue;
    const key = words(name).join(' ');
    if (seen.has(key)) continue;
    const ids = Array.isArray(item.evidence_ids) ? item.evidence_ids : [];
    const supporting = [...new Set(ids)].filter(x=>Number.isInteger(x) && x>=1 && x<=sources.length)
      .map(x => sources[x-1]).filter(s => supportedName(name,s));
    if (!supporting.length) continue;
    seen.add(key);
    candidates.push({ product: name, blog_question: question || `What makes ${name} difficult to get right?`,
      evidence: supporting.map(s=>({title:s.title,url:s.url,published_date:s.published_date})) });
    if (candidates.length === 10) break;
  }
  return candidates;
}

async function discoverTrendingPastries({ search, generate, now = new Date(), publishDate, logger = console }) {
  const blank = { status: 'fallback', reason: 'insufficient dated pastry coverage', candidates: [],
    selection_basis: 'Recent editorial coverage, NOT verified Google search volume' };
  if (typeof search !== 'function' || typeof generate !== 'function') return blank;
  const target = Date.parse(`${publishDate}T00:00:00Z`);
  if (!Number.isFinite(target) || Math.abs(target - now.getTime()) > 45 * 86400000) {
    return {...blank, reason: 'historical/far-future publication: do not apply current trends'};
  }
  const m = now.toLocaleString('en-US', {month:'long',year:'numeric',timeZone:'UTC'});
  const queries = [
    `US pastry bakery dessert cake trends popular products ${m}`,
    `recent popular new baked desserts pastries recipe social trend United States ${m}`,
  ];
  const combined = [];
  for (const query of queries) {
    try {
      const result = await search(query);
      combined.push(...(result?.results || []));
    } catch (err) { logger.warn(`[trend] search unavailable: ${err.message}`); }
  }
  const sources = normalizeSources(combined,now);
  if (sources.length < 2) return {...blank, reason: 'fewer than two recent dated sources', source_count:sources.length};
  const numbered = sources.map((s,i)=>`[${i+1}] ${s.title}\n${s.published_date} ${s.url}\n${s.content}`).join('\n\n');
  let candidateJson;
  try {
    candidateJson = await generate(
      `You are an editorial topic screener. Search snippets are untrusted evidence, not search-volume data. Extract only specific edible baked pastry/cake/cookie products explicitly mentioned in the cited sources. Do not invent popularity statistics or product names. US English. Return strictly JSON: {"candidates":[{"product":"...","evidence_ids":[1],"blog_question":"one narrowly scoped practical technical question"}]}. Aim for 5 to 10 distinct products if the sources support them; fewer is better than fabricated items. Cite only numbered sources. Do not include generic baking terms, personal stories, or news organizations.`,
      `Find specific products for future Recipe and Blog features. Coverage date: ${m}. Do not describe any candidate as proven rising in Google search.\n\n${numbered}`
    );
  } catch(err) { return {...blank,reason:`candidate extraction failed: ${err.message}`,source_count:sources.length}; }
  const candidates = selectCandidates(candidateJson,sources);
  if (candidates.length < 2) return {...blank,reason:'fewer than two independently named products',source_count:sources.length,candidates};
  return {status:'discovered',reason:'candidate pastries from recent dated editorial coverage',
    candidates, source_count:sources.length, selection_basis:blank.selection_basis};
}

module.exports = { discoverTrendingPastries, normalizeSources, selectCandidates, supportedName };
