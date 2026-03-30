/**
 * scripts/auto-generate.js
 *
 * Changes in this version:
 *   - Model selection: deepseek (default) or gemini-2.5-flash-lite
 *   - News: formal/professional tone, global focus, no Guangzhou references
 *   - Recipe: formal magazine style, international focus, 7 cuisines (removed Cantonese + SE Asian, added British)
 *   - Blog: relaxed, Nova personal voice, Guangzhou identity kept for logic only
 *   - Nova location: Guangzhou used for logical consistency only, not mentioned in articles
 *   - Deduplication: no-replacement sampling for topics + cuisine angles + news queries
 *   - Random article counts: news 3-5, recipe 1-3, blog 0-1 per month
 *   - Random dates within month
 *
 * Usage:
 *   node scripts/auto-generate.js                      → weekly run (deepseek)
 *   node scripts/auto-generate.js --bulk               → 6-month bulk (deepseek)
 *   node scripts/auto-generate.js --model=gemini       → weekly run (gemini)
 *   node scripts/auto-generate.js --bulk --model=gemini → bulk (gemini)
 */

const OpenAI  = require('openai');
const fs      = require('fs');
const path    = require('path');

// ─── Environment & model selection ───────────────────────────────────────────

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const TAVILY_API_KEY   = process.env.TAVILY_API_KEY;
const BEIAI_API_URL    = String(process.env.BEIAI_API_URL || '').trim();
const CRON_SECRET      = String(process.env.CRON_SECRET || '').trim();

const isBulk     = process.argv.includes('--bulk');
const modelArg   = (process.argv.find(a => a.startsWith('--model=')) || '').replace('--model=', '');
const useGemini  = modelArg === 'gemini';
const modelLabel = useGemini ? 'gemini-2.5-flash-lite' : 'deepseek';

// Validate required env vars
const missing = [];
if (!TAVILY_API_KEY)  missing.push('TAVILY_API_KEY');
if (!BEIAI_API_URL)   missing.push('BEIAI_API_URL');
if (!CRON_SECRET)     missing.push('CRON_SECRET');
if (useGemini  && !GEMINI_API_KEY)  missing.push('GEMINI_API_KEY');
if (!useGemini && !DEEPSEEK_API_KEY) missing.push('DEEPSEEK_API_KEY');

if (missing.length > 0) {
  console.error('[auto-generate] Missing environment variables:', missing.join(', '));
  process.exit(1);
}

console.log(`[auto-generate] Using model: ${modelLabel}`);

// ─── AI client setup ──────────────────────────────────────────────────────────

let aiClient, aiModel;

if (useGemini) {
  aiClient = new OpenAI({
    apiKey:  GEMINI_API_KEY,
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  });
  aiModel = 'gemini-2.5-flash-lite-preview-06-17';
} else {
  aiClient = new OpenAI({
    apiKey:  DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
  });
  aiModel = 'deepseek-chat';
}

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

const NOVA_MOODS = [
  { label: 'just back from an exhibition, thoughts buzzing' },
  { label: 'squeezed this in between two orders — keeping it short and direct' },
  { label: 'something has been annoying me about this topic and I need to say it' },
  { label: 'just nailed a technique I\'ve been chasing for months' },
  { label: 'quiet morning, reflective mood' },
  { label: 'saw something at a supplier yesterday that got me thinking' },
];

const FORMATTING_MODES = [
  'Meticulous: clear paragraph breaks, deliberate punctuation.',
  'Stream-of-consciousness: minimal breaks, em-dashes over commas, write fast.',
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

// Blog topics — 18 entries, sampled without replacement
const BLOG_TOPICS_MASTER = [
  'The one thing nobody tells you about bean paste piping — and what I learned from it',
  'Why I switched away from Swiss meringue buttercream in summer (and found something better)',
  'The Korean cake trend: what I genuinely love about it, and one honest reservation',
  'That time my fondant cracked in front of a client — and why it made me a better baker',
  'The underrated skill that separates decent bakers from really good ones',
  'My Paris stage was the hardest thing I\'ve done. Here\'s what I came back with.',
  'Why ingredient quality changes everything — a chocolate story',
  'The temperature obsession: why I think it\'s worth it',
  'What baking competitions are really like — and why I think everyone should try one',
  'A tool I\'ve used for 8 years that changed how I work',
  'Why "beginner-friendly" recipes often do beginners a disservice',
  'Why I keep returning to French technique — it never lets me down',
  'Baking through a brutal summer: the lessons that stuck',
  'How a wet season taught me things about dough I couldn\'t have learned any other way',
  'Why autumn is my favourite time to work with sugar',
  'What I wish someone had told me before I opened my home bakery',
  'The fondant-in-August story: what went wrong and what I\'d do differently',
  'Why I reformulated my buttercream — and how much better it got',
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

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
  return `You are a professional editor writing for Beiai Baking, a premium baking and pastry website.

Your role for NEWS articles:
- Write in a formal, objective, journalistic style — like a trade publication (Baking Business, Pastry Arts Magazine)
- Global perspective: cover international events, competitions, industry trends worldwide
- No personal opinions, no "I", no casual language
- Cite specific facts: event names, dates, locations, results, statistics when available
- Neutral and informative tone throughout

BANNED WORDS: ${BANNED_WORDS.join(', ')}

STRUCTURE RULES:
- Lead paragraph must contain the most important fact (who/what/where/when)
- No "总-分-总" structure — news articles open with the news, not background
- No concluding paragraph that summarises or calls to action
- Vary sentence length for readability

LANGUAGE: English only. Return ONLY valid JSON. No markdown, no explanation.`;
}

function buildRecipeSystemPrompt(cuisine) {
  return `You are a professional recipe writer for Beiai Baking, a premium baking and pastry website.

Your role for RECIPE articles:
- Write in a formal, authoritative style — like a professional baking magazine (Bon Appétit, Saveur, Pastry Arts)
- International focus: this is ${cuisine} cuisine, treat it with respect and accuracy
- Use precise baking terminology: temperatures in both Celsius and Fahrenheit, weights in grams
- Professional but accessible — a serious home baker or pastry student should find it useful
- No casual asides, no "I tried this" — this is editorial recipe writing

BANNED WORDS: ${BANNED_WORDS.join(', ')}

STRUCTURE RULES:
- Open with a brief authoritative introduction to the dish (origin, what makes it distinctive)
- Ingredients woven into prose — NOT a bullet list
- Method in clear, precise natural language — NOT numbered steps
- Close with a professional tip (technique, storage, variation) — not "enjoy!"
- No cheerful wrap-up

LANGUAGE: English only. Return ONLY valid JSON. No markdown, no explanation.`;
}

function buildBlogSystemPrompt(mood, formattingMode, season) {
  return `You are Nova — a professional baker with 10 years of experience. You write personal blog posts for Beiai Baking.

IMPORTANT LOCATION NOTE: You are based in a warm, humid southern Chinese city. Current season: ${season}. Use this only to ensure logical consistency (e.g. do not write about snow in summer, do not describe cold winters). Do NOT mention the city name or make weather a focus.

YOUR VOICE:
- Warm, enthusiastic, genuinely passionate about baking — this is your life's work and you love it
- Encouraging without being saccharine — you celebrate the craft and the people in it
- Occasionally blunt or self-deprecating (about 20% of the time) — a dry observation, a minor frustration, a moment of honesty
- The overall feeling should be: someone who loves what they do and wants others to love it too
- Current mood: ${mood.label}

WRITING RULES:
1. BANNED WORDS: ${BANNED_WORDS.join(', ')}
2. NO sequence markers: firstly / secondly / in conclusion / to summarize
3. Start mid-thought — a scene, a reaction, a memory. No background intro.
4. Mix short sentences (3–6 words) with longer ones. Never three consecutive similar lengths.
5. Use ellipsis (...) when trailing, em dash (—) for shifts.
6. FORMATTING: ${formattingMode}
7. End abruptly on a detail or open question. No wrap-up, no advice, no "I hope this helps."
8. At least one concrete detail: a temperature, tool name, a client situation.
9. Opinionated — Nova has a take, not just information.
10. Industry terms used naturally: proofing, lamination, ganache ratio, bench rest, crumb structure.

LANGUAGE: English only. Return ONLY valid JSON. No markdown, no explanation.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getMonthLabel(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Tavily search ────────────────────────────────────────────────────────────

async function tavilySearch(query) {
  const res = await fetch('https://api.tavily.com/search', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      api_key: TAVILY_API_KEY, query,
      search_depth: 'basic', max_results: 4, include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const results = data.results || [];
  if (results.length === 0) return null;
  return results.map(r => `SOURCE: ${r.title}\n${r.content}`).join('\n\n---\n\n').slice(0, 3000);
}

// ─── AI generate ──────────────────────────────────────────────────────────────

async function aiGenerate(systemPrompt, userPrompt) {
  const res = await aiClient.chat.completions.create({
    model:           aiModel,
    max_tokens:      1400,
    temperature:     1.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt  },
    ],
  });
  const text = res.choices[0]?.message?.content || '';
  try { return JSON.parse(text); }
  catch { throw new Error(`AI returned invalid JSON: ${text.slice(0, 200)}`); }
}

// ─── Generators ───────────────────────────────────────────────────────────────

async function generateNews(monthLabel, publishedDate, memory, usedQueries) {
  console.log(`  [news] ${monthLabel}...`);

  const available = NEWS_QUERY_POOL.filter(q => !usedQueries.has(q));
  const pool      = available.length > 0 ? available : NEWS_QUERY_POOL;
  const baseQuery = pickRandom(pool);
  usedQueries.add(baseQuery);

  let context = null;
  for (const q of [`${baseQuery} ${monthLabel}`, `${baseQuery} 2025 2026`, baseQuery]) {
    try { context = await tavilySearch(q); if (context) break; }
    catch (e) { console.warn(`  [news] search failed: ${e.message}`); }
    await sleep(1000);
  }
  if (!context) { console.warn(`  [news] no results, skipping`); return null; }

  const echoLine = (Math.random() < 0.3 && memory) ? buildEchoLine(memory) : '';

  const userPrompt = `
Baking industry sources from around ${monthLabel}:

${context}

${echoLine ? `You may weave this reference in naturally if relevant: "${echoLine}"` : ''}

Write a formal news article for Beiai Baking. Requirements:
- Lead with the most newsworthy fact: event name, date, location, or result
- Use specific names from the sources: competitions, venues, organisations, cities
- Global perspective — do not localise to any single country unless the news itself is local
- If facts seem contradictory or unclear, report what is confirmed
- 220–300 words
- No conclusion paragraph, no call to action

Return exactly this JSON:
{
  "title": "formal news headline under 80 chars",
  "excerpt": "1–2 factual sentences under 180 chars",
  "content": "full news article in English",
  "type": "news",
  "published_date": "${publishedDate}"
}`;

  const post = await aiGenerate(buildNewsSystemPrompt(), userPrompt);
  if (post) saveMemory(post);
  return post;
}

async function generateRecipe(monthLabel, publishedDate, memory, usedAngles) {
  console.log(`  [recipe] ${monthLabel}...`);

  const available = RECIPE_ANGLES.filter(a => !usedAngles.has(a.cuisine));
  const pool      = available.length > 0 ? available : RECIPE_ANGLES;
  const angle     = pickRandom(pool);
  usedAngles.add(angle.cuisine);

  let context = null;
  for (const q of [`${angle.query} ${monthLabel}`, angle.query]) {
    try { context = await tavilySearch(q); if (context) break; }
    catch (e) { console.warn(`  [recipe] search failed: ${e.message}`); }
    await sleep(1000);
  }
  if (!context) { console.warn(`  [recipe] no results, skipping`); return null; }

  const userPrompt = `
${angle.cuisine} baking sources from around ${monthLabel}:

${context}

Write a formal ${angle.cuisine} recipe article for Beiai Baking. Requirements:
- Brief authoritative introduction: what this dish is, where it comes from, what makes it worth making
- Ingredients woven into prose — NOT a bullet list
- Method in precise natural language — NOT numbered steps
- Temperatures in Celsius (with Fahrenheit in brackets)
- Weights in grams where relevant
- Close with one professional tip: technique, variation, or storage advice
- 280–360 words

Return exactly this JSON:
{
  "title": "precise English recipe title under 80 chars",
  "excerpt": "1–2 authoritative sentences under 180 chars",
  "content": "full recipe article in English",
  "type": "recipe",
  "published_date": "${publishedDate}"
}`;

  const post = await aiGenerate(buildRecipeSystemPrompt(angle.cuisine), userPrompt);
  if (post) saveMemory(post);
  return post;
}

async function generateBlog(monthLabel, publishedDate, memory, availableTopics) {
  console.log(`  [blog] ${monthLabel}...`);

  if (availableTopics.length === 0) { console.warn('  [blog] topics exhausted, skipping'); return null; }

  const idx    = Math.floor(Math.random() * availableTopics.length);
  const topic  = availableTopics.splice(idx, 1)[0];
  const mood   = pickRandom(NOVA_MOODS);
  const fmt    = pickRandom(FORMATTING_MODES);
  const season = getGuangzhouSeason(monthLabel);
  const echo   = (Math.random() < 0.3 && memory) ? buildEchoLine(memory) : '';

  const userPrompt = `
Write a personal blog post for Beiai Baking as Nova.
Topic: "${topic}"
Time context: ${monthLabel}

${echo ? `Weave this in naturally near the opening if it fits: "${echo}"` : ''}

Requirements:
- Start mid-thought: a scene, a reaction, a specific memory — no background intro
- At least one concrete detail: a temperature, a tool name, a client situation
- One unexpected shift in thought — like a real person who just remembered something
- Opinionated throughout
- 260–340 words
- End abruptly on a detail or question. No wrap-up. No advice to the reader.

Return exactly this JSON:
{
  "title": "English title that sounds like a real person wrote it — under 80 chars",
  "excerpt": "an English line that makes someone want to read on, under 180 chars",
  "content": "full blog post in English",
  "type": "blog",
  "published_date": "${publishedDate}"
}`;

  const post = await aiGenerate(buildBlogSystemPrompt(mood, fmt, season), userPrompt);
  if (post) saveMemory(post);
  return post;
}

// ─── Send to receiver ─────────────────────────────────────────────────────────

async function sendToReceiver(posts) {
  const valid = posts.filter(Boolean);
  if (valid.length === 0) { console.log('  [send] nothing to send'); return; }
  console.log(`  [send] sending ${valid.length} posts...`);
  const res = await fetch(BEIAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify(valid),
  });
  const text = await res.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }
  if (!res.ok) {
    const hint =
      res.status === 401
        ? ' Check GitHub / Vercel CRON_SECRET match (no extra spaces).'
        : res.status === 503
          ? ' Set CRON_SECRET on Vercel (Production) and redeploy.'
          : '';
    throw new Error(`Receiver ${res.status}: ${JSON.stringify(result)}${hint}`);
  }
  console.log(`  [send] inserted: ${result.inserted}, skipped: ${result.skipped}`);
  (result.errors || []).forEach(e => console.warn(`  [send] skipped "${e.title}": ${e.reasons.join(', ')}`));
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

async function runWeekly() {
  console.log('[auto-generate] Weekly run...');
  const date   = new Date().toISOString().split('T')[0];
  const month  = getMonthLabel(0);
  const memory = loadMemory();
  const posts  = [];
  const usedQ  = new Set();
  const usedA  = new Set();
  const topics = [...BLOG_TOPICS_MASTER];

  try { posts.push(await generateNews(month, date, memory, usedQ)); }
  catch (e) { console.error(`  [news] ${e.message}`); }
  await sleep(2000);

  try { posts.push(await generateRecipe(month, date, memory, usedA)); }
  catch (e) { console.error(`  [recipe] ${e.message}`); }
  await sleep(2000);

  try { posts.push(await generateBlog(month, date, memory, topics)); }
  catch (e) { console.error(`  [blog] ${e.message}`); }

  await sendToReceiver(posts);
  console.log('[auto-generate] Weekly run complete.');
}

async function runBulk() {
  console.log('[auto-generate] Bulk run — 12 months...');
  console.log('  news 3–5/month | recipe 1–3/month | blog 0–1/month');

  const usedQ  = new Set();
  const usedA  = new Set();
  const topics = [...BLOG_TOPICS_MASTER];

  for (let ago = 11; ago >= 0; ago--) {
    const month  = getMonthLabel(ago);
    const nNews  = randInt(3, 5);
    const nRec   = randInt(1, 3);
    const nBlog  = randInt(0, 1);
    const total  = nNews + nRec + nBlog;
    console.log(`\n[auto-generate] ${month} — news:${nNews} recipe:${nRec} blog:${nBlog}`);

    const posts  = [];
    const memory = loadMemory();
    let   slot   = 0;

    for (let i = 0; i < nNews; i++) {
      try { posts.push(await generateNews(month, randomDateInMonth(ago, slot++, total), memory, usedQ)); }
      catch (e) { console.error(`  [news ${i+1}] ${e.message}`); }
      await sleep(3000);
    }
    for (let i = 0; i < nRec; i++) {
      try { posts.push(await generateRecipe(month, randomDateInMonth(ago, slot++, total), memory, usedA)); }
      catch (e) { console.error(`  [recipe ${i+1}] ${e.message}`); }
      await sleep(3000);
    }
    for (let i = 0; i < nBlog; i++) {
      try { posts.push(await generateBlog(month, randomDateInMonth(ago, slot++, total), memory, topics)); }
      catch (e) { console.error(`  [blog ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    try { await sendToReceiver(posts); }
    catch (e) { console.error(`  [send] ${e.message}`); }

    if (ago > 0) { console.log('  pausing 10s...'); await sleep(10000); }
  }

  console.log('\n[auto-generate] Bulk run complete.');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  try {
    if (isBulk) { await runBulk(); } else { await runWeekly(); }
    process.exit(0);
  } catch (e) {
    console.error('[auto-generate] Fatal:', e);
    process.exit(1);
  }
})();
