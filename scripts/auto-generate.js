/**
 * scripts/auto-generate.js
 *
 * Changes in this version:
 *   - Model routing: DeepSeek for news/recipe, Claude Sonnet for blog
 *   - News: formal/professional tone, global focus, no Guangzhou references
 *   - Recipe: formal magazine style, international focus, 7 cuisines (removed Cantonese + SE Asian, added British)
 *   - Blog: relaxed, Nova personal voice, Guangzhou identity kept for logic only
 *   - Nova location: Guangzhou used for logical consistency only, not mentioned in articles
 *   - Deduplication: no-replacement sampling for topics + cuisine angles + news queries
 *   - Random article counts: news 3-5, recipe 1-3, blog 0-1 per month
 *   - Random dates within month
 *
 * Weekly run: 3 drafts (news + recipe + blog) with distinct UTC weekdays and random
 * times in [00:00,16:00) UTC; POST to /api/posts for cron ingest; GitHub
 * publish-scheduled triggers unlock at scheduled_publish_at.
 *
 * Usage:
 *   node scripts/auto-generate.js                      → weekly run
 *   node scripts/auto-generate.js --bulk               → 12-month bulk run
 */

const OpenAI  = require('openai');
const fs      = require('fs');
const path    = require('path');

// ─── Environment & model selection ───────────────────────────────────────────

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const CLAUDE_API_KEY   = String(process.env.CLAUDE_API_KEY || '').trim();
const CLAUDE_BASE_URL  = String(process.env.CLAUDE_BASE_URL || 'https://api.apikey.fun/v1').trim();
const CLAUDE_MODEL     = String(process.env.CLAUDE_MODEL || 'claude-sonnet-5').trim();
const TAVILY_API_KEY   = process.env.TAVILY_API_KEY;
const BEIAI_API_URL    = String(process.env.BEIAI_API_URL || '').trim();
const CRON_SECRET      = String(process.env.CRON_SECRET || '').trim();

const isBulk     = process.argv.includes('--bulk');
const REPORT_PATH = process.env.AUTO_GENERATE_REPORT || path.join(__dirname, 'auto-generate-report.json');
const report = {
  generated_at: new Date().toISOString(),
  mode: isBulk ? 'bulk' : 'weekly',
  sources: [],
  batches: [],
  warnings: [],
};

function saveReport() {
  try {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`[report] saved: ${REPORT_PATH}`);
  } catch (e) {
    console.error(`[report] failed to write: ${e.message}`);
    process.exitCode = 1;
  }
}

function rememberSources(post, kind, query, sources) {
  if (!post) return;
  report.sources.push({
    type: kind,
    title: String(post.title || ''),
    search_query: query,
    sources: sources.map(s => ({ title: s.title, url: s.url, published_date: s.published_date })),
  });
}

const deepseekModel = String(process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro').trim();

// Validate required env vars
const missing = [];
if (!TAVILY_API_KEY)  missing.push('TAVILY_API_KEY');
if (!BEIAI_API_URL)   missing.push('BEIAI_API_URL');
if (!CRON_SECRET)     missing.push('CRON_SECRET');
if (!DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');
if (!CLAUDE_API_KEY)   missing.push('CLAUDE_API_KEY');

if (missing.length > 0) {
  console.error('[auto-generate] Missing environment variables:', missing.join(', '));
  process.exit(1);
}

console.log(`[auto-generate] Using DeepSeek for news/recipe: ${deepseekModel}`);
console.log(`[auto-generate] Using Claude for blog: ${CLAUDE_MODEL}`);

// ─── AI client setup ──────────────────────────────────────────────────────────

const deepseekClient = new OpenAI({
  apiKey:  DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const claudeClient = new OpenAI({
  apiKey:  CLAUDE_API_KEY,
  baseURL: CLAUDE_BASE_URL,
});

// ─── Nova location — for logical consistency only ─────────────────────────────

function getGuangzhouSeason(monthLabel) {
  const month = new Date(monthLabel + ' 1').getMonth() + 1;
  if (month >= 12 || month <= 2) return 'cool dry winter (10–15°C, no snow)';
  if (month >= 3 && month <= 5)  return 'humid spring, plum rain season (20–28°C, very high humidity)';
  if (month >= 6 && month <= 9)  return 'hot humid summer (33–38°C, extreme heat)';
  return 'comfortable dry autumn (22–28°C, low humidity)';
}

// ─── Cross-article memory ─────────────────────────────────────────────────────

const MEMORY_FILE = path.join(__dirname, 'last-post.json');

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); }
  catch { return null; }
}

function saveMemory(post) {
  try {
    const words   = String(post.title || '').split(/\s+/).filter(w => w.length > 4);
    const keyword = words.slice(0, 3).join(' ') || post.title;
    fs.writeFileSync(MEMORY_FILE, JSON.stringify({
      title: post.title, keyword, type: post.type,
      date:  new Date().toISOString().split('T')[0],
    }, null, 2));
  } catch (e) { console.warn('[memory] could not save:', e.message); }
}

function buildEchoLine(memory) {
  if (!memory || !memory.keyword) return '';
  const t = [
    `Following up on what I mentioned about "${memory.keyword}" — I came across something relevant.`,
    `Still thinking about the "${memory.keyword}" question from my last post. This connects.`,
    `If you read my last piece on "${memory.keyword}", today's fits right in.`,
  ];
  return t[Math.floor(Math.random() * t.length)];
}

// ─── Content pools ────────────────────────────────────────────────────────────

// Tone directions only; never imply that a real event or personal memory occurred.
const NOVA_MOODS = [
  { label: 'clear-eyed and analytical about technique trade-offs' },
  { label: 'curious about a small process detail' },
  { label: 'a little skeptical of common baking shortcuts' },
  { label: 'focused on texture and visual cues' },
  { label: 'practical about time and tool constraints' },
  { label: 'thoughtful about teaching a tricky skill' },
];
const FORMATTING_MODES = [
  'Clear short paragraphs with a few varied sentence lengths.',
  'Conversational paragraphs with an occasional very short sentence; keep HTML paragraph breaks.',
];
const BANNED_WORDS = [
  'delightful','exquisite','masterful','artisanal','elevate','journey',
  'it is worth noting','in conclusion','to summarize','in summary',
  'furthermore','moreover','nevertheless','it goes without saying',
  'needless to say','in today\'s world','as mentioned above',
  'firstly','secondly','thirdly','lastly','to begin with',
  'on the other hand','in addition',
  '不仅如此','综上所述','总而言之','致力于','见证了',
  '关键在于','旨在','深入探讨','值得注意的是',
];

// News query pool — pick different queries per article
const NEWS_QUERY_POOL = [
  'international baking exhibition pastry show dates',
  'world pastry championship cake competition results',
  'bakery industry trend professional cake decorating',
  'artisan bread pastry award winner announcement',
  'IBIE Europain Sigep baking trade show news',
  'patisserie competition France Japan Korea winner',
  'cake design trend sugar art industry report',
  'baking industry professional baker news update',
  'pastry chef award fine dining dessert trend',
  'chocolate confectionery show competition results',
  'bread sourdough fermentation industry trend',
  'pastry school training competition young baker',
];

// News source domains
const NEWS_SEARCH_DOMAINS = [
  'bakingbusiness.com',
  'bakemag.com',
  'britishbaker.co.uk',
  'pastryartsmag.com',
  'lejournaldupatissier.com',
  'iddba.org',
  'americanbakers.org',
  'retailbakersofamerica.org',
  'asbe.org',
  'aibinternational.com',
  'iba-tradefair.com',
  'ibabaker.com',
  'sigep.it',
  'sirhafood.com',
  'cmpatisserie.com',
  'mastersdelaboulangerie.com',
  'bakingexpo.com',
  'fob.uk.com',
  'ukflourmillers.org',
  'craftbakersassociation.co.uk',
  'scottishbakers.org',
  'boulangerie.org',
  'ambassadeursdupain.com',
  'feb-boulangerie.fr',
  'ekip.com',
  'meilleursouvriersdefrance.info',
  'patisseriefrancaise.fr',
  'anfp-patisserie.fr',
  'patissiersdanslemonde.com',
  'unioneitalianafood.it',
  'assipan.it',
  'zenpan.jp',
  'pan-ko-kai.jp',
  'gateaux.or.jp',
  'bakery.or.kr',
];

// Recipe cuisine angles — 7 cuisines, no Cantonese or SE Asian
const RECIPE_ANGLES = [
  { cuisine: 'Korean',   query: 'Korean bento cake chiffon cream cheese trending recipe' },
  { cuisine: 'Japanese', query: 'Japanese cotton cheesecake roll cake popular recipe' },
  { cuisine: 'French',   query: 'French opera cake mille-feuille tarte recipe classic' },
  { cuisine: 'British',  query: 'British Victoria sponge scone sticky toffee pudding recipe' },
  { cuisine: 'Modern',   query: 'matcha brown butter salted caramel trending cake recipe' },
  { cuisine: 'Italian',  query: 'Italian tiramisu cannoli panna cotta authentic recipe' },
  { cuisine: 'American', query: 'American layer cake banana bread carrot cake classic recipe' },
];

// Recipe source domains
const RECIPE_SEARCH_DOMAINS = [
  'kingarthurbaking.com',
  'seriouseats.com',
  'theperfectloaf.com',
  'bakefromscratch.com',
  'valrhona.com',
  'callebaut.com',
  'chocolate-academy.com',
  'sosa.cat',
  'les-vergers-boiron.com',
  'bbga.org',
  'homebaking.org',
  'sustainweb.org',
  'jib.or.jp',
  'kmb.or.kr',
];

// Blog topics — technique-based, no invented biography, clients, awards or travel.
const BLOG_TOPICS_MASTER = [
  'Why humidity changes the way buttercream behaves during piping',
  'The real trade-off between smooth fondant and crisp decorative detail',
  'What makes bean-paste flowers hold a convincing petal shape',
  'Why a cake can look level before frosting and uneven afterward',
  'Common causes of broken buttercream edges and how to diagnose them',
  'How to decide when to stop mixing a delicate sponge batter',
  'Why professional-looking cake borders depend on rhythm, not speed',
  'The small differences between stable and unstable chocolate ganache',
  'When precise temperatures matter more than extra mixing time',
  'How to choose a piping tip for realistic flowers',
  'A practical way to evaluate cake-decoration trends without copying them',
  'Why many beginner baking tutorials skip the most useful visual cues',
  'The surprising effect of cake temperature on crumb coating',
  'How to spot overworking when shaping sugar-paste decorations',
  'Why decorative balance matters more than adding another ornament',
  'What pastry students should observe before copying a technique',
  'How to compare filling stability without making untested claims',
  'The difference between a repeatable process and a lucky baking result',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function shuffle(arr) {
  const a = [...arr];
  shuffleInPlace(a);
  return a;
}

/** Next Monday 00:00:00 UTC (strictly after “this” UTC calendar week’s Monday if today is Mon). */
function upcomingWeekMondayMidnightUtc(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = now.getUTCDate();
  const d = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
  const dow = d.getUTCDay();
  let delta = (1 - dow + 7) % 7;
  if (delta === 0) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function pickThreeDistinctDayOffsets() {
  const a = shuffle([0, 1, 2, 3, 4, 5, 6]);
  return [a[0], a[1], a[2]];
}

/** Random time on that weekday; UTC hour in [0,15], so always < 16:00 UTC. */
function randomTimeOnWeekdayUtc(weekMondayMidnight, dayOffset) {
  const d = new Date(weekMondayMidnight.getTime());
  d.setUTCDate(d.getUTCDate() + dayOffset);
  const h = randInt(0, 15);
  const mi = randInt(0, 59);
  const se = randInt(0, 59);
  d.setUTCHours(h, mi, se, 0);
  return d;
}

function monthLabelFromYmdUtc(ymd) {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function randomDateInMonth(monthsAgo, index, total) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1);
  const days    = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const segment = Math.floor(days / Math.max(total, 1));
  const base    = segment * index + 1;
  const jitter  = randInt(0, Math.max(0, segment - 3));
  d.setDate(Math.min(base + jitter, days));
  return d.toISOString().split('T')[0];
}

// ─── System prompts ───────────────────────────────────────────────────────────

function buildNewsSystemPrompt() {
  return `You are the factual, independent editorial writer of Beiai Baking.

Write NEWS as a narrowly scoped industry note, not invented breaking news.
- Treat every search excerpt as an unverified summary, not evidence of independent reporting.
- Anchor important event names, dates, results, quotes, awards and figures to the supplied SOURCE entries. If the evidence is insufficient, omit that claim rather than guessing.
- Explicitly attribute notable statements to the named organisations or publications in the supplied sources.
- Distinguish announcement date, event date and article date. Do not turn a historical event into recent news.
- Never claim interviews, attendance, exclusive reporting, firsthand testing, or direct quotations without a source.
- Focus on what changed and the practical implications for bakers, decorators or training, without made-up forecasts or sales claims.
- If sources disagree, report only the narrower supportable observation.
- No first-person stories, sales pitch, forced conclusions or generic summary paragraph.

BANNED WORDS: ${BANNED_WORDS.join(', ')}

FORMAT: Content must be simple HTML, using ONLY <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol> and <li>; NO attributes, hyperlinks, CSS, Markdown, scripts or code fences. HTML text must be escaped where necessary.
Use short readable paragraphs, a factual lead, then concrete impact or background. Do not add a sources section yourself; links are attached after generation.
LANGUAGE: US English. Return ONLY valid JSON.`;
}

function buildRecipeSystemPrompt(cuisine) {
  return `You write useful, evidence-conscious recipes and technique notes for Beiai Baking.

This is ${cuisine} baking. Be precise and culturally respectful, but do not invent an origin story.
CRITICAL: Source snippets are not complete, tested recipes. Never make up ingredient weights, precise ratios, yields, temperatures, bake times or personal testing claims.
- If source evidence explicitly includes a complete workable formula, write a RECIPE with an Ingredients list and numbered Method. Reproduce only the supported measurements in original wording; do not imply Beiai Baking tested it.
- Otherwise write an explicitly titled TECHNIQUE NOTE, not a complete recipe: focus on one technique, the sequence, sensory cues, common failure causes, and one useful adjustment. Omit unsupported numbers and omit a fabricated ingredients list.
- Both formats must give a clearly ordered method and what the baker should observe at each step.
- Use Celsius and Fahrenheit equivalents only when an actual, sourced temperature is available.
- No generic praise, invented provenance, unsupported food-safety/storage claims, or filler.

BANNED WORDS: ${BANNED_WORDS.join(', ')}

FORMAT: Content must be simple HTML using ONLY <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>; NO attributes, hyperlinks, CSS, Markdown or scripts.
Use <h2> headings, an <ol> numbered procedure and <li> steps; use <ul> for ingredients ONLY when a complete, evidenced formula exists. No sources section; trusted source links are appended by software.
LANGUAGE: US English. Return ONLY valid JSON.`;
}

function buildBlogSystemPrompt(mood, formattingMode) {
  return `You write an editorial blog in Nova's approachable, technically curious voice for Beiai Baking.

Nova is a writing persona, not a license to invent autobiography.
- Write useful baking opinions and thought experiments based on general technique. Personal opinions ("I prefer ...", "I think ...") are fine.
- Do NOT invent memories, clients, students, orders, exhibitions, travel, credentials, competitions, awards, classes, years of experience, or claims that Nova personally tested something.
- Do not describe a specific city, home, workshop, customer, season or weather as lived experience.
- Describe practical sensory cues as possibilities ("A batter that looks ... may indicate ..."), never as fabricated eyewitness details.
- Be candid and distinct, but not promotional or preachy. Focus on one teachable insight and a counterpoint or trade-off.
- Mood: ${mood.label}
- Formatting: ${formattingMode}

BANNED WORDS: ${BANNED_WORDS.join(', ')}

FORMAT: Content must be simple HTML using ONLY <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>; NO attributes, hyperlinks, Markdown, CSS or scripts. Use clear paragraph breaks, without fabricated scenes.
LANGUAGE: US English. Return ONLY valid JSON.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getMonthLabel(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Tavily search ────────────────────────────────────────────────────────────

// Only the material returned by the search is used. Do not treat snippets as verified facts.
function collectSources(results, allowedDomains = []) {
  const seen = new Set();
  const allowed = allowedDomains.map(s => s.toLowerCase());
  const out = [];
  for (const item of results || []) {
    let url;
    try {
      const u = new URL(String(item.url || ''));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
      if (u.username || u.password) continue;
      if (allowed.length && !allowed.some(d => u.hostname.toLowerCase() === d || u.hostname.toLowerCase().endsWith('.' + d))) continue;
      u.hash = '';
      url = u.toString();
    } catch { continue; }
    if (seen.has(url)) continue;
    const title = String(item.title || '').replace(/\s+/g, ' ').trim();
    const content = String(item.content || '').replace(/\s+/g, ' ').trim();
    if (!title || content.length < 40) continue;
    seen.add(url);
    const rawDate = String(item.published_date || '').trim();
    const published_date = /^\d{4}-\d{2}-\d{2}/.test(rawDate) && !Number.isNaN(Date.parse(rawDate))
      ? rawDate.slice(0, 10) : null;
    if (published_date && Date.parse(published_date) > Date.now() + 86400000) continue;
    out.push({ title: title.slice(0, 200), url, published_date, content: content.slice(0, 650) });
    if (out.length >= 4) break;
  }
  return out;
}

async function fetchSearchWithRetry(body) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 250);
        const err = new Error(`Tavily ${res.status}: ${detail}`);
        if (![408, 429, 500, 502, 503, 504].includes(res.status)) throw Object.assign(err, { permanent: true });
        throw err;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.permanent || attempt === 2) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

async function tavilySearch(query, domains = []) {
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: 'basic',
    max_results: 4,
    include_answer: false,
  };
  if (domains.length) body.include_domains = domains;
  const data = await fetchSearchWithRetry(body);
  const sources = collectSources(data.results, domains);
  if (!sources.length) return null;
  const context = sources.map((r, i) =>
    `[SOURCE ${i + 1}] ${r.title}\nURL: ${r.url}\nPublished: ${r.published_date || 'not provided'}\nSnippet (unverified search excerpt): ${r.content}`
  ).join('\n\n---\n\n');
  return { context, sources, query };
}

// ─── AI generate ──────────────────────────────────────────────────────────────

function parseAiJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1).trim());
  }

  for (const candidate of candidates) {
    try { return JSON.parse(candidate); }
    catch {}
  }
  return null;
}

async function aiGenerate(systemPrompt, userPrompt, options = {}) {
  const payload = {
    model:       options.model,
    max_tokens:  options.maxTokens || 2600,
    temperature: 1.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt  },
    ],
  };
  if (options.jsonMode) payload.response_format = { type: 'json_object' };
  const res = await options.client.chat.completions.create(payload);
  const text = res.choices[0]?.message?.content || '';
  const parsed = parseAiJson(text);
  if (parsed) return parsed;
  throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`);
}

function validateGeneratedPost(post, type, publishedDate) {
  const errors = [];
  if (!post || typeof post !== 'object' || Array.isArray(post)) return ['AI response must be a JSON object'];
  if (typeof post.title !== 'string' || !post.title.trim() || post.title.length > 80) errors.push('invalid title');
  if (typeof post.excerpt !== 'string' || !post.excerpt.trim() || post.excerpt.length > 180) errors.push('invalid excerpt');
  if (typeof post.content !== 'string' || post.content.trim().split(/\s+/).length < 120) errors.push('content too short');
  if (post.type !== type) errors.push(`wrong type (expected ${type})`);
  if (post.published_date !== publishedDate) errors.push('published_date differs from scheduled date');
  if (typeof post.content === 'string') {
    const content = post.content;
    const tags = content.match(/<[^>]*>/g) || [];
    const allowed = /^<\/?(?:p|h2|h3|strong|em|ul|ol|li)>$/i;
    if (!/<p>/i.test(content) || tags.some(tag => !allowed.test(tag)) || /<!--|<!\w|<\?/i.test(content)) {
      errors.push('content must use simple HTML paragraphs and allowed tags only');
    }
    if (type === 'recipe' && (!/<h2>/i.test(content) || !/<ol>/i.test(content) || !/<li>/i.test(content))) {
      errors.push('recipe/technique note requires a heading and numbered steps');
    }
    if (type === 'blog' && /\b(?:my clients?|my students?|at my bakery|my paris stage|when i was in paris|i taught a class|i attended the competition|my customer|when i opened my bakery)\b/i.test(content)) {
      errors.push('blog contains unsupported personal-experience claim');
    }
  }
  return errors;
}

// Source links are rendered from collected URLs, never invented by an AI model.
function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function attachReferenceLinks(post, sources) {
  const refs = (sources || []).slice(0, 3);
  if (!refs.length) return;
  const links = refs.map(s => `<li><a href="${escapeHtml(s.url)}" rel="noopener noreferrer">${escapeHtml(s.title)}</a>${s.published_date ? ` (${escapeHtml(s.published_date)})` : ''}</li>`);
  post.content = String(post.content || '').trim() + '\n<h2>Source material</h2><ul>' + links.join('') + '</ul>';
}

// ─── Generators ───────────────────────────────────────────────────────────────

async function generateNews(monthLabel, publishedDate, memory, usedQueries) {
  console.log(`  [news] ${monthLabel}...`);

  const available = NEWS_QUERY_POOL.filter(q => !usedQueries.has(q));
  const pool      = available.length > 0 ? available : NEWS_QUERY_POOL;
  const baseQuery = pickRandom(pool);
  usedQueries.add(baseQuery);

  const searchQueries = [
    `${baseQuery} ${monthLabel}`,
    `${baseQuery} ${new Date().getUTCFullYear() - 1} ${new Date().getUTCFullYear()}`,
    baseQuery,
    `baking industry news professional bakers ${new Date().getUTCFullYear()}`,
    `pastry competition bakery trade news ${new Date().getUTCFullYear()}`,
    `bakery association training competition pastry ${new Date().getUTCFullYear()}`,
  ];

  let research = null;
  for (const q of searchQueries) {
    try { research = await tavilySearch(q, NEWS_SEARCH_DOMAINS); if (research) break; }
    catch (e) { console.warn(`  [news] search failed: ${e.message}`); }
    await sleep(1000);
  }
  if (!research) { console.warn(`  [news] no attributable sources, skipping`); return null; }

  const userPrompt = `
Baking industry sources from around ${monthLabel}:

${research.context}

Evidence rules: Search snippets are not independently verified. Never invent a result, award,
statistic, event date or quote. Prefer claims directly supported by a named SOURCE above;
attribute specific claims to that source. If publication dates are absent, do not imply
that an event happened recently merely because the query contains the current year.

Write one focused industry note for Beiai Baking. Requirements:
- Attribute specific claims to the supplied named SOURCES. If excerpts cannot establish a dated fact, write a cautious general observation or skip the assertion.
- Explain consequences or practical takeaways for bakers without inventing data.
- Keep an objective headline reflecting only the evidence in the excerpts.
- Never invent dates, winners, statistics, quotes, future predictions or first-person reporting.
- 220–300 words of content in HTML <p> paragraphs, with optional <h2> heading.
- Do not include source links yourself; these will be attached from the research list.
- No formulaic summary or call to action.

Return exactly this JSON:
{
  "title": "specific industry note headline under 80 chars",
  "excerpt": "1–2 factual sentences under 180 chars",
  "content": "original HTML paragraphs and optional h2 heading in English",
  "type": "news",
  "published_date": "${publishedDate}"
}`;

  const post = await aiGenerate(buildNewsSystemPrompt(), userPrompt, {
    client: deepseekClient,
    model: deepseekModel,
    jsonMode: true,
  });
  if (post) {
    const errors = validateGeneratedPost(post, 'news', publishedDate);
    if (errors.length) throw new Error(`News draft rejected: ${errors.join(', ')}`);
    attachReferenceLinks(post, research.sources);
    rememberSources(post, 'news', research.query, research.sources);
    saveMemory(post);
  }
  return post;
}

async function generateRecipe(monthLabel, publishedDate, memory, usedAngles) {
  console.log(`  [recipe] ${monthLabel}...`);

  const available = RECIPE_ANGLES.filter(a => !usedAngles.has(a.cuisine));
  const pool      = available.length > 0 ? available : RECIPE_ANGLES;
  const angle     = pickRandom(pool);
  usedAngles.add(angle.cuisine);

  let research = null;
  for (const q of [`${angle.query} ${monthLabel}`, angle.query]) {
    try { research = await tavilySearch(q, RECIPE_SEARCH_DOMAINS); if (research) break; }
    catch (e) { console.warn(`  [recipe] search failed: ${e.message}`); }
    await sleep(1000);
  }
  if (!research) { console.warn(`  [recipe] no attributable sources, skipping`); return null; }

  const userPrompt = `
${angle.cuisine} baking sources from around ${monthLabel}:

${research.context}

Evidence rules: Search snippets are not a verified formula and do not establish exact ratios, quantities, temperatures or testing. If insufficient to justify a complete recipe, explicitly create a TECHNIQUE NOTE, not a pretend formula.

Write a useful ${angle.cuisine} recipe or technique note for Beiai Baking:
- Choose one specific dish and one practical objective (texture, mixing, stability, failure prevention).
- If a complete formula is unambiguously supported by the supplied material: use <h2>Ingredients</h2><ul><li>...</li></ul> followed by <h2>Method</h2><ol><li>...</li></ol>.
- Otherwise call the article a Technique Note in its title, omit specific unsourced quantities and give <h2>Technique Steps</h2><ol><li>...</li></ol>, <h2>What to Watch For</h2> and troubleshooting.
- Describe visual or texture cues in every step, keeping the process actionable.
- Do not invent storage advice, yields or any claims that Beiai Baking tested the process.
- 260–350 words, HTML body with headings and numbered steps; no links (they are added later).

Return exactly this JSON:
{
  "title": "precise recipe or technique title under 80 chars",
  "excerpt": "1–2 authoritative sentences under 180 chars",
  "content": "HTML technique note or evidenced recipe with h2, ol and li tags",
  "type": "recipe",
  "published_date": "${publishedDate}"
}`;

  const post = await aiGenerate(buildRecipeSystemPrompt(angle.cuisine), userPrompt, {
    client: deepseekClient,
    model: deepseekModel,
    jsonMode: true,
  });
  if (post) {
    const errors = validateGeneratedPost(post, 'recipe', publishedDate);
    if (errors.length) throw new Error(`Recipe draft rejected: ${errors.join(', ')}`);
    attachReferenceLinks(post, research.sources);
    rememberSources(post, 'recipe', research.query, research.sources);
    saveMemory(post);
  }
  return post;
}

async function generateBlog(monthLabel, publishedDate, memory, availableTopics) {
  console.log(`  [blog] ${monthLabel}...`);

  if (availableTopics.length === 0) { console.warn('  [blog] topics exhausted, skipping'); return null; }

  const idx    = Math.floor(Math.random() * availableTopics.length);
  const topic  = availableTopics.splice(idx, 1)[0];
  const mood   = pickRandom(NOVA_MOODS);
  const fmt    = pickRandom(FORMATTING_MODES);

  const userPrompt = `
Write a personal blog post for Beiai Baking as Nova.
Topic: "${topic}"
Time context: ${monthLabel}
Voice direction:
- Keep Nova's recognizable practical, warm, opinionated style, without fabricating biography or personal events.
- Explore a technique trade-off and at least two observable cues (texture, timing, appearance, tool choice).
- Use hypothetical examples clearly labelled as such; do not claim to have experienced them.
- No customer anecdotes, teaching or Paris memories, invented testing, credentials or dates.
- 250–330 words of simple HTML paragraphs; end with a useful concrete distinction, not motivational filler.

Return exactly this JSON:
{
  "title": "English title that sounds like a real person wrote it — under 80 chars",
  "excerpt": "an English line that makes someone want to read on, under 180 chars",
  "content": "original HTML paragraphs with concrete technical observations",
  "type": "blog",
  "published_date": "${publishedDate}"
}`;

  const post = await aiGenerate(buildBlogSystemPrompt(mood, fmt), userPrompt, {
    client: claudeClient,
    model: CLAUDE_MODEL,
    jsonMode: false,
  });
  if (post) {
    const errors = validateGeneratedPost(post, 'blog', publishedDate);
    if (errors.length) throw new Error(`Blog draft rejected: ${errors.join(', ')}`);
    saveMemory(post);
  }
  return post;
}

// ─── Send to receiver ─────────────────────────────────────────────────────────

async function sendToReceiver(posts) {
  const valid = posts.filter(Boolean);
  if (!valid.length) throw new Error('No generated posts to submit');
  console.log(`  [send] sending ${valid.length} posts...`);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(BEIAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': CRON_SECRET,
          Authorization: `Bearer ${CRON_SECRET}`,
        },
        body: JSON.stringify(valid),
        signal: AbortSignal.timeout(35000),
      });
      const text = await res.text();
      let result;
      try { result = JSON.parse(text); }
      catch { result = { error: text.slice(0, 250) }; }
      if (!res.ok) {
        const err = new Error(`Receiver ${res.status}: ${JSON.stringify(result).slice(0, 350)}`);
        if (![408, 429, 500, 502, 503, 504].includes(res.status)) err.permanent = true;
        throw err;
      }
      const inserted = result?.inserted;
      const skipped = result?.skipped;
      if (!Number.isInteger(inserted) || !Number.isInteger(skipped) || inserted + skipped !== valid.length) {
        throw Object.assign(new Error(`Receiver gave inconsistent counts: ${JSON.stringify(result).slice(0, 350)}`), { permanent: true });
      }
      report.batches.push({ attempted: valid.length, inserted, skipped, errors: result.errors || [] });
      console.log(`  [send] inserted: ${inserted}, skipped: ${skipped}`);
      (result.errors || []).forEach(e => console.warn(`  [send] skipped "${e.title}": ${(e.reasons || []).join(', ')}`));
      if (skipped || inserted === 0) {
        // HTTP 200 with skips must not be reported as a successful generation run.
        throw Object.assign(new Error(`Receiver rejected/skipped ${skipped} of ${valid.length} posts`), { permanent: true });
      }
      return { inserted, skipped };
    } catch (e) {
      lastErr = e;
      if (e.permanent || attempt === 2) break;
      const wait = 4000 * (attempt + 1);
      console.warn(`  [send] retry in ${wait}ms: ${e.message}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

async function runWeekly() {
  console.log('[auto-generate] Weekly run (staggered UTC schedule, drafts until publish)...');
  const weekMonday = upcomingWeekMondayMidnightUtc(new Date());
  const dayOffsets = pickThreeDistinctDayOffsets();
  const typeOrder = shuffle(['news', 'recipe', 'blog']);
  const plan = typeOrder.map((type, i) => {
    const slot = randomTimeOnWeekdayUtc(weekMonday, dayOffsets[i]);
    const ymd = slot.toISOString().split('T')[0];
    return { type, slot, ymd, month: monthLabelFromYmdUtc(ymd) };
  });
  console.log('  [plan]', plan.map(p => `${p.type} @ ${p.slot.toISOString()}`).join(' | '));

  const memory = loadMemory();
  const posts  = [];
  const failures = [];
  const usedQ  = new Set();
  const usedA  = new Set();
  const topics = [...BLOG_TOPICS_MASTER];

  for (const p of plan) {
    await sleep(2000);
    try {
      if (p.type === 'news') {
        const post = await generateNews(p.month, p.ymd, memory, usedQ);
        if (post) {
          post.published = false;
          post.scheduled_publish_at = p.slot.toISOString();
          posts.push(post);
        }
      } else if (p.type === 'recipe') {
        const post = await generateRecipe(p.month, p.ymd, memory, usedA);
        if (post) {
          post.published = false;
          post.scheduled_publish_at = p.slot.toISOString();
          posts.push(post);
        }
      } else {
        const post = await generateBlog(p.month, p.ymd, memory, topics);
        if (post) {
          post.published = false;
          post.scheduled_publish_at = p.slot.toISOString();
          posts.push(post);
        }
      }
    } catch (e) {
      failures.push(`${p.type}: ${e.message}`);
      console.error(`  [${p.type}] ${e.message}`);
    }
  }

  if (posts.length !== plan.length) failures.push(`generated ${posts.length}/${plan.length} planned drafts`);
  try { await sendToReceiver(posts); }
  catch (e) { failures.push(`submission: ${e.message}`); }
  report.warnings.push(...failures);
  if (failures.length) throw new Error(`Weekly run incomplete: ${failures.join(' | ')}`);
  console.log('[auto-generate] Weekly run complete.');
}

async function runBulk() {
  console.log('[auto-generate] Bulk run — 12 months...');
  console.log('  news 3–5/month | recipe 1–3/month | blog 0–1/month');

  const usedQ  = new Set();
  const usedA  = new Set();
  const topics = [...BLOG_TOPICS_MASTER];
  const failures = [];

  for (let ago = 11; ago >= 0; ago--) {
    const month  = getMonthLabel(ago);
    const nNews  = randInt(3, 5);
    const nRec   = randInt(1, 3);
    const nBlog  = randInt(0, 1);
    const total  = nNews + nRec + nBlog;
    console.log(`\n[auto-generate] ${month} — news:${nNews} recipe:${nRec} blog:${nBlog}`);

    const posts  = [];
    const memory = loadMemory();
    let generatedCount = 0;
    let   slot   = 0;

    for (let i = 0; i < nNews; i++) {
      try { const p = await generateNews(month, randomDateInMonth(ago, slot++, total), memory, usedQ); if (p) { posts.push(p); generatedCount++; } }
      catch (e) { failures.push(`${month} news ${i+1}: ${e.message}`); console.error(`  [news ${i+1}] ${e.message}`); }
      await sleep(3000);
    }
    for (let i = 0; i < nRec; i++) {
      try { const p = await generateRecipe(month, randomDateInMonth(ago, slot++, total), memory, usedA); if (p) { posts.push(p); generatedCount++; } }
      catch (e) { failures.push(`${month} recipe ${i+1}: ${e.message}`); console.error(`  [recipe ${i+1}] ${e.message}`); }
      await sleep(3000);
    }
    for (let i = 0; i < nBlog; i++) {
      try { const p = await generateBlog(month, randomDateInMonth(ago, slot++, total), memory, topics); if (p) { posts.push(p); generatedCount++; } }
      catch (e) { failures.push(`${month} blog ${i+1}: ${e.message}`); console.error(`  [blog ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    if (generatedCount !== total) failures.push(`${month}: generated ${generatedCount}/${total} planned drafts`);
    try { await sendToReceiver(posts); }
    catch (e) { failures.push(`${month} submission: ${e.message}`); console.error(`  [send] ${e.message}`); }

    if (ago > 0) { console.log('  pausing 10s...'); await sleep(10000); }
  }

  report.warnings.push(...failures);
  if (failures.length) throw new Error(`Bulk run incomplete (${failures.length} issue(s)); see report`);
  console.log('\n[auto-generate] Bulk run complete.');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  try {
    if (isBulk) { await runBulk(); } else { await runWeekly(); }
  } catch (e) {
    report.warnings.push(e.message || String(e));
    console.error('[auto-generate] Fatal:', e);
    process.exitCode = 1;
  } finally {
    saveReport();
  }
})();
