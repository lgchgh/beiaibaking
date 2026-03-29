/**
 * scripts/auto-generate.js
 *
 * Fixes in this version:
 *   - News: diverse search queries per article (no repeated results)
 *   - Recipe: distinct cuisine angle per article (Korean/Japanese/French/etc rotated)
 *   - Blog: no-replacement topic sampling (used topics removed from pool)
 *   - Dates: randomised within month, not fixed day numbers
 *   - Counts: news 3-5, recipe 1-3, blog 0-1 per month (random)
 *   - Location: Nova is based in Guangzhou, China — climate and seasons baked in
 *
 * Usage:
 *   node scripts/auto-generate.js            → weekly (1 news, 1 recipe, 1 blog)
 *   node scripts/auto-generate.js --bulk     → 6 months of history
 */

const OpenAI = require('openai');
const fs     = require('fs');
const path   = require('path');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const TAVILY_API_KEY   = process.env.TAVILY_API_KEY;
const BEIAI_API_URL    = String(process.env.BEIAI_API_URL || '').trim();
const CRON_SECRET      = String(process.env.CRON_SECRET || '').trim();

if (!DEEPSEEK_API_KEY || !TAVILY_API_KEY || !BEIAI_API_URL || !CRON_SECRET) {
  console.error('[auto-generate] Missing required environment variables.');
  console.error('Required: DEEPSEEK_API_KEY, TAVILY_API_KEY, BEIAI_API_URL, CRON_SECRET');
  console.error('BEIAI_API_URL example: https://<your-domain>/api/posts');
  process.exit(1);
}

const deepseek = new OpenAI({
  apiKey:  DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const isBulk = process.argv.includes('--bulk');

// ─── Guangzhou climate context ────────────────────────────────────────────────
// Injected into system prompt so Nova's writing is geographically accurate

function getGuangzhouSeason(monthLabel) {
  const month = new Date(monthLabel + ' 1').getMonth() + 1; // 1-12
  if (month >= 12 || month <= 2) {
    return 'winter in Guangzhou (10–15°C, cool and dry, no snow — locals wear light jackets)';
  } else if (month >= 3 && month <= 5) {
    return 'spring in Guangzhou (20–28°C, extremely humid, plum rain season — surfaces sweat, dough absorbs moisture fast, fondant is a nightmare)';
  } else if (month >= 6 && month <= 9) {
    return 'summer in Guangzhou (33–38°C, brutal heat and humidity — buttercream melts on the bench, the kitchen is an oven before you even turn one on)';
  } else {
    return 'autumn in Guangzhou (22–28°C, the best baking weather of the year — low humidity, stable temps, everything behaves)';
  }
}

// ─── Cross-article memory (echo effect) ──────────────────────────────────────

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
  const templates = [
    `Following up on what I mentioned about "${memory.keyword}" — I came across something relevant.`,
    `Still thinking about the "${memory.keyword}" question from my last post. This connects.`,
    `If you read my last piece on "${memory.keyword}", today's fits right in.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

// ─── Randomisation pools ─────────────────────────────────────────────────────

const NOVA_MOODS = [
  { label: 'just back from an exhibition, thoughts buzzing, slightly overstimulated' },
  { label: 'squeezed this in between two orders — keeping it short and direct' },
  { label: 'something has been annoying me about this topic and I need to say it' },
  { label: 'just nailed a technique I\'ve been chasing for months, still a bit giddy' },
  { label: 'quiet morning, reflective — the kind of thinking that happens over a long coffee' },
  { label: 'saw something at a supplier yesterday that got me thinking differently' },
];

const FORMATTING_MODES = [
  'Meticulous mode: clear paragraph breaks, deliberate punctuation, each idea gets room to breathe.',
  'Stream-of-consciousness mode: minimal paragraph breaks, thoughts flow into each other, use em-dashes more than commas — write fast, edit minimally.',
];

const BANNED_WORDS = [
  'delightful', 'exquisite', 'masterful', 'artisanal', 'elevate', 'journey',
  'it is worth noting', 'in conclusion', 'to summarize', 'in summary',
  'furthermore', 'moreover', 'nevertheless', 'it goes without saying',
  'needless to say', 'in today\'s world', 'as mentioned above',
  'firstly', 'secondly', 'thirdly', 'lastly', 'to begin with',
  'on the other hand', 'in addition',
  '不仅如此', '综上所述', '总而言之', '致力于', '见证了',
  '关键在于', '旨在', '深入探讨', '值得注意的是',
];

// News search queries — varied pool, pick different ones per article
const NEWS_QUERY_POOL = [
  'international baking exhibition pastry show',
  'world pastry championship cake competition results',
  'bakery industry trend cake decorating',
  'artisan bread pastry award winner',
  'IBIE Europain Sigep baking show',
  'patisserie competition France Japan Korea',
  'cake design trend fondant sugar art',
  'baking industry news professional baker',
  'pastry chef award restaurant dessert trend',
  'chocolate confectionery show competition',
];

// Recipe cuisine angles — rotate through these so each article is a different style
const RECIPE_ANGLES = [
  { cuisine: 'Korean', query: 'Korean bento cake chiffon cream cheese recipe trending' },
  { cuisine: 'Japanese', query: 'Japanese cotton cheesecake roll cake recipe popular' },
  { cuisine: 'French', query: 'French opera cake mille-feuille tarte recipe classic' },
  { cuisine: 'Cantonese', query: 'Cantonese egg tart wife cake mooncake recipe traditional' },
  { cuisine: 'Modern', query: 'matcha brown butter salted caramel cake recipe viral' },
  { cuisine: 'Italian', query: 'Italian tiramisu cannoli panna cotta recipe authentic' },
  { cuisine: 'Southeast Asian', query: 'pandan coconut kueh Southeast Asian cake recipe' },
  { cuisine: 'American', query: 'American layer cake banana bread carrot cake recipe classic' },
];

// Blog topics — will be sampled without replacement across bulk run
const BLOG_TOPICS_MASTER = [
  'The one thing nobody tells you about bean paste piping — and it cost me three wasted batches',
  'Why I stopped using Swiss meringue buttercream in Guangzhou summers',
  'Honest thoughts on the Korean cake trend: beautiful, but is it practical here?',
  'That time my fondant cracked in front of a client — what I quietly learned',
  'The underrated skill that separates decent bakers from really good ones',
  'My Paris stage nearly broke me. Here\'s what I actually came back with.',
  'Why cheap chocolate ruins more cakes than bad technique ever could',
  'The temperature obsession in a Guangzhou kitchen: am I taking it too far?',
  'What baking competitions look like from the inside',
  'A tool I\'ve used for 8 years that most bakers walk right past',
  'The problem with "beginner-friendly" recipes',
  'Why I keep returning to French technique even when Korean styles dominate my feed',
  'Baking through a Guangzhou summer: what nobody warns you about',
  'The humidity problem: how spring in southern China changes everything about dough',
  'Why autumn is the only season I trust for pulled sugar work',
  'What I wish I had known before opening a home bakery in Guangzhou',
  'The client who asked for a fondant cake in August — and what happened next',
  'Why I gave up on Swiss meringue entirely and what I use instead',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random date within a given month (monthsAgo), spread across the month
function randomDateInMonth(monthsAgo, index, total) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  // spread articles evenly but with jitter
  const segment = Math.floor(daysInMonth / total);
  const base     = segment * index + 1;
  const jitter   = randInt(0, Math.max(0, segment - 3));
  d.setDate(Math.min(base + jitter, daysInMonth));
  return d.toISOString().split('T')[0];
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(mood, formattingMode, season) {
  return `You are Nova — a professional baker with 10 years in the industry, based in Guangzhou, China. You write for your own baking website, Beiai Baking.

LOCATION & CLIMATE CONTEXT:
- You live and work in Guangzhou, southern China
- Current season: ${season}
- This matters: your writing should reflect real Guangzhou conditions — humidity, heat, local ingredients, and how the climate affects baking. Never write something that contradicts the season or local reality.

YOUR VOICE:
- Direct, sometimes blunt. You have earned the right to say what you think.
- You love the craft but you are not precious about it.
- You notice things others miss, and you say so plainly.
- Current mood: ${mood.label}

WRITING RULES — apply every single one:

1. BANNED WORDS — never use: ${BANNED_WORDS.join(', ')}

2. NO sequence markers — never: firstly / secondly / thirdly / finally / in conclusion / to summarize / in addition / on the other hand

3. FORBIDDEN structure — do NOT use intro → three points → conclusion.
   Start in the middle of a thought. Lead with a specific detail, a real number, a scene, or a blunt opinion.

4. SENTENCE VARIETY — mix short punchy sentences (3–6 words) with longer flowing ones. Never three consecutive sentences of similar length.

5. PUNCTUATION — use ellipsis (...) when a thought trails. Use em dash (—) for sudden shifts. Encouraged.

6. FORMATTING: ${formattingMode}

7. ENDINGS — stop when the thought is done. No wrap-up, no call to action, no "I hope this helps." Land on a detail or open question and stop.

8. SPECIFICITY — name real things: venues, temperatures, brands, cities, techniques. "A bakery in Lyon" beats "a European bakery" every time.

9. CRITICISM — if something is overpriced, badly organised, or overhyped, say so.

10. INDUSTRY LANGUAGE — use naturally: proofing, lamination, temper, ganache ratio, crumb structure, bench rest, out-of-oven temp.

LANGUAGE: Write entirely in English. No exceptions.

Return ONLY valid JSON. No explanation, no markdown fences.`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getMonthLabel(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Tavily Search ────────────────────────────────────────────────────────────

async function tavilySearch(query) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key:        TAVILY_API_KEY,
      query,
      search_depth:   'basic',
      max_results:    4,
      include_answer: false,
    }),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}: ${await response.text()}`);
  const data    = await response.json();
  const results = data.results || [];
  if (results.length === 0) return null;
  return results.map(r => `SOURCE: ${r.title}\n${r.content}`).join('\n\n---\n\n').slice(0, 3000);
}

// ─── DeepSeek call ────────────────────────────────────────────────────────────

async function deepseekGenerate(systemPrompt, userPrompt) {
  const response = await deepseek.chat.completions.create({
    model:           'deepseek-chat',
    max_tokens:      1400,
    temperature:     1.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt  },
    ],
  });
  const text = response.choices[0]?.message?.content || '';
  try { return JSON.parse(text); }
  catch { throw new Error(`DeepSeek returned invalid JSON: ${text.slice(0, 200)}`); }
}

// ─── Generators ───────────────────────────────────────────────────────────────

// usedNewsQueries: tracks which queries have been used this run to avoid repetition
async function generateNews(monthLabel, publishedDate, memory, usedNewsQueries) {
  console.log(`  [news] searching ${monthLabel}...`);

  // Pick a query not yet used this run
  const available = NEWS_QUERY_POOL.filter(q => !usedNewsQueries.has(q));
  const pool      = available.length > 0 ? available : NEWS_QUERY_POOL;
  const baseQuery = pickRandom(pool);
  usedNewsQueries.add(baseQuery);

  const queries = [
    `${baseQuery} ${monthLabel}`,
    `${baseQuery} 2025 2026`,
    baseQuery,
  ];

  let context = null;
  for (const q of queries) {
    try { context = await tavilySearch(q); if (context) break; }
    catch (e) { console.warn(`  [news] search failed: ${e.message}`); }
    await sleep(1000);
  }

  if (!context) { console.warn(`  [news] no results, skipping`); return null; }

  const mood       = pickRandom(NOVA_MOODS);
  const formatting = pickRandom(FORMATTING_MODES);
  const season     = getGuangzhouSeason(monthLabel);
  const useEcho    = Math.random() < 0.3 && memory;
  const echoLine   = useEcho ? buildEchoLine(memory) : '';

  const userPrompt = `
Real baking industry sources from around ${monthLabel}:

${context}

${echoLine ? `Weave this in naturally near the opening: "${echoLine}"` : ''}

Write a news article for Beiai Baking. Requirements:
- Open with a specific fact, number, location, or blunt reaction — NOT a background paragraph
- Use real names from sources: event names, venues, competition titles, cities
- If anything seems overpriced, poorly organised, or disappointing — say so
- 240–320 words
- Do NOT end with conclusion, summary, or call to action

Return exactly this JSON:
{
  "title": "direct English headline under 80 chars — no clickbait",
  "excerpt": "1–2 punchy English sentences under 180 chars",
  "content": "full article in English",
  "type": "news",
  "published_date": "${publishedDate}"
}`;

  const post = await deepseekGenerate(buildSystemPrompt(mood, formatting, season), userPrompt);
  if (post) saveMemory(post);
  return post;
}

// usedRecipeAngles: tracks which cuisine angles have been used
async function generateRecipe(monthLabel, publishedDate, memory, usedRecipeAngles) {
  console.log(`  [recipe] searching ${monthLabel}...`);

  // Pick a cuisine angle not yet used this run
  const available = RECIPE_ANGLES.filter(a => !usedRecipeAngles.has(a.cuisine));
  const pool      = available.length > 0 ? available : RECIPE_ANGLES;
  const angle     = pickRandom(pool);
  usedRecipeAngles.add(angle.cuisine);

  const queries = [
    `${angle.query} ${monthLabel}`,
    angle.query,
  ];

  let context = null;
  for (const q of queries) {
    try { context = await tavilySearch(q); if (context) break; }
    catch (e) { console.warn(`  [recipe] search failed: ${e.message}`); }
    await sleep(1000);
  }

  if (!context) { console.warn(`  [recipe] no results, skipping`); return null; }

  const mood       = pickRandom(NOVA_MOODS);
  const formatting = pickRandom(FORMATTING_MODES);
  const season     = getGuangzhouSeason(monthLabel);
  const useEcho    = Math.random() < 0.3 && memory;
  const echoLine   = useEcho ? buildEchoLine(memory) : '';

  const userPrompt = `
${angle.cuisine} recipe sources from around ${monthLabel}:

${context}

${echoLine ? `Optional opening echo: "${echoLine}"` : ''}

Write a ${angle.cuisine} recipe post for Beiai Baking as Nova. Requirements:
- Nova has made this. Mention one thing that went wrong the first time, or one thing most recipes get wrong
- Consider how the current season in Guangzhou affects this recipe (humidity, temperature)
- Ingredients woven into prose — NOT a bullet list
- Method in natural language — NOT numbered steps
- One blunt pro tip at the end (not "enjoy your creation")
- 280–360 words

Return exactly this JSON:
{
  "title": "English recipe title that makes someone want to try it, under 80 chars",
  "excerpt": "1–2 English sentences that make it sound genuinely good, under 180 chars",
  "content": "full recipe post in English",
  "type": "recipe",
  "published_date": "${publishedDate}"
}`;

  const post = await deepseekGenerate(buildSystemPrompt(mood, formatting, season), userPrompt);
  if (post) saveMemory(post);
  return post;
}

// availableTopics: mutated array — topics are removed after use (no-replacement sampling)
async function generateBlog(monthLabel, publishedDate, memory, availableTopics) {
  console.log(`  [blog] generating ${monthLabel}...`);

  if (availableTopics.length === 0) {
    console.warn('  [blog] all topics used, skipping');
    return null;
  }

  // Pick and remove topic from pool
  const idx   = Math.floor(Math.random() * availableTopics.length);
  const topic = availableTopics.splice(idx, 1)[0];

  const mood       = pickRandom(NOVA_MOODS);
  const formatting = pickRandom(FORMATTING_MODES);
  const season     = getGuangzhouSeason(monthLabel);
  const useEcho    = Math.random() < 0.3 && memory;
  const echoLine   = useEcho ? buildEchoLine(memory) : '';

  const userPrompt = `
Write a personal blog post for Beiai Baking as Nova.
Topic: "${topic}"
Time context: ${monthLabel}

${echoLine ? `Weave this in naturally near the opening: "${echoLine}"` : ''}

Requirements:
- Do NOT open with background or context. Start mid-thought: a scene, a reaction, a memory
- The current season is ${season} — let this influence the writing naturally if relevant
- At least one concrete detail: a temperature, a tool name, a Guangzhou location, a client situation
- Allow one moment where the thought shifts unexpectedly — like a real person who just remembered something
- Opinionated — Nova has a take, not just information
- 260–340 words
- End when the thought is done. No tidy wrap-up. No advice.

Return exactly this JSON:
{
  "title": "English title that sounds like a real person wrote it — under 80 chars",
  "excerpt": "an English line that makes someone want to read on, under 180 chars",
  "content": "full blog post in English",
  "type": "blog",
  "published_date": "${publishedDate}"
}`;

  const post = await deepseekGenerate(buildSystemPrompt(mood, formatting, season), userPrompt);
  if (post) saveMemory(post);
  return post;
}

// ─── Send to receiver ─────────────────────────────────────────────────────────

async function sendToReceiver(posts) {
  const valid = posts.filter(Boolean);
  if (valid.length === 0) { console.log('  [send] nothing to send'); return; }
  console.log(`  [send] sending ${valid.length} posts...`);
  const response = await fetch(BEIAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': CRON_SECRET,
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify(valid),
  });
  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }
  if (!response.ok) {
    const hint =
      response.status === 401
        ? ' Check GitHub / Vercel CRON_SECRET match (no extra spaces).'
        : response.status === 503
          ? ' Set CRON_SECRET on Vercel (Production) and redeploy.'
          : '';
    throw new Error(`Receiver ${response.status}: ${JSON.stringify(result)}${hint}`);
  }
  console.log(`  [send] inserted: ${result.inserted}, skipped: ${result.skipped}`);
  (result.errors || []).forEach(e => {
    console.warn(`  [send] skipped "${e.title}": ${e.reasons.join(', ')}`);
  });
}

// ─── Weekly run ───────────────────────────────────────────────────────────────

async function runWeekly() {
  console.log('[auto-generate] Weekly run...');
  const publishedDate    = new Date().toISOString().split('T')[0];
  const monthLabel       = getMonthLabel(0);
  const memory           = loadMemory();
  const posts            = [];
  const usedNewsQueries  = new Set();
  const usedRecipeAngles = new Set();
  const availableTopics  = [...BLOG_TOPICS_MASTER];

  try { posts.push(await generateNews(monthLabel, publishedDate, memory, usedNewsQueries)); }
  catch (e) { console.error(`  [news] ${e.message}`); }
  await sleep(2000);

  try { posts.push(await generateRecipe(monthLabel, publishedDate, memory, usedRecipeAngles)); }
  catch (e) { console.error(`  [recipe] ${e.message}`); }
  await sleep(2000);

  try { posts.push(await generateBlog(monthLabel, publishedDate, memory, availableTopics)); }
  catch (e) { console.error(`  [blog] ${e.message}`); }

  await sendToReceiver(posts);
  console.log('[auto-generate] Weekly run complete.');
}

// ─── Bulk historical run ──────────────────────────────────────────────────────

async function runBulk() {
  console.log('[auto-generate] Bulk run — 6 months of history...');
  console.log('  news: 3–5/month  |  recipe: 1–3/month  |  blog: 0–1/month');

  // Shared state across all months — prevents repetition across the whole run
  const usedNewsQueries  = new Set();
  const usedRecipeAngles = new Set();
  const availableTopics  = [...BLOG_TOPICS_MASTER];

  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
    const monthLabel = getMonthLabel(monthsAgo);
    console.log(`\n[auto-generate] ${monthLabel}`);

    const newsCount   = randInt(3, 5);
    const recipeCount = randInt(1, 3);
    const blogCount   = randInt(0, 1);

    console.log(`  counts → news:${newsCount} recipe:${recipeCount} blog:${blogCount}`);

    const posts  = [];
    const memory = loadMemory();
    const total  = newsCount + recipeCount + blogCount;
    let   slot   = 0;

    // News articles
    for (let i = 0; i < newsCount; i++) {
      try {
        const date = randomDateInMonth(monthsAgo, slot++, total);
        posts.push(await generateNews(monthLabel, date, memory, usedNewsQueries));
      } catch (e) { console.error(`  [news ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    // Recipe articles
    for (let i = 0; i < recipeCount; i++) {
      try {
        const date = randomDateInMonth(monthsAgo, slot++, total);
        posts.push(await generateRecipe(monthLabel, date, memory, usedRecipeAngles));
      } catch (e) { console.error(`  [recipe ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    // Blog articles
    for (let i = 0; i < blogCount; i++) {
      try {
        const date = randomDateInMonth(monthsAgo, slot++, total);
        posts.push(await generateBlog(monthLabel, date, memory, availableTopics));
      } catch (e) { console.error(`  [blog ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    try { await sendToReceiver(posts); }
    catch (e) { console.error(`  [send] ${e.message}`); }

    if (monthsAgo > 0) {
      console.log('  [auto-generate] Pausing 10s...');
      await sleep(10000);
    }
  }

  console.log('\n[auto-generate] Bulk run complete.');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  try {
    if (isBulk) { await runBulk(); }
    else         { await runWeekly(); }
    process.exit(0);
  } catch (e) {
    console.error('[auto-generate] Fatal:', e);
    process.exit(1);
  }
})();
