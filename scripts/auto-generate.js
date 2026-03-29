/**
 * scripts/auto-generate.js
 *
 * Run by GitHub Actions (weekly or manually for bulk historical fill).
 * Searches Tavily for real baking industry content, rewrites with DeepSeek,
 * then POSTs to BEIAI_API_URL (recommended: https://你的域名/api/ingest；兼容 /api/auto-generate-receiver).
 *
 * Anti-AI-tone measures:
 *   - Random mood + formatting mode per article
 *   - Banned words enforced in system prompt
 *   - No "总-分-总" structure, no neat endings
 *   - temperature=1.3 for less predictable output
 *   - Cross-article memory echo (~30% chance)
 *   - Nova persona with real opinions and industry terms
 *
 * Usage:
 *   node scripts/auto-generate.js            → generates this week's 3 posts
 *   node scripts/auto-generate.js --bulk     → generates 36 historical posts (6 months)
 */

const OpenAI = require('openai');
const fs     = require('fs');
const path   = require('path');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const TAVILY_API_KEY   = process.env.TAVILY_API_KEY;
const BEIAI_API_URL    = process.env.BEIAI_API_URL;
const CRON_SECRET      = process.env.CRON_SECRET;

if (!DEEPSEEK_API_KEY || !TAVILY_API_KEY || !BEIAI_API_URL || !CRON_SECRET) {
  console.error('[auto-generate] Missing required environment variables.');
  console.error('Required: DEEPSEEK_API_KEY, TAVILY_API_KEY, BEIAI_API_URL, CRON_SECRET');
  console.error('BEIAI_API_URL example: https://<your-domain>/api/ingest');
  process.exit(1);
}

const deepseek = new OpenAI({
  apiKey:  DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const isBulk = process.argv.includes('--bulk');

// ─── Cross-article memory (echo effect) ──────────────────────────────────────

const MEMORY_FILE = path.join(__dirname, 'last-post.json');

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); }
  catch { return null; }
}

function saveMemory(post) {
  try {
    const words  = String(post.title || '').split(/\s+/).filter(w => w.length > 4);
    const keyword = words.slice(0, 3).join(' ') || post.title;
    fs.writeFileSync(MEMORY_FILE, JSON.stringify({
      title:   post.title,
      keyword,
      type:    post.type,
      date:    new Date().toISOString().split('T')[0],
    }, null, 2));
  } catch (e) {
    console.warn('[memory] could not save:', e.message);
  }
}

function buildEchoLine(memory) {
  if (!memory || !memory.keyword) return '';
  const templates = [
    `Following up on what I mentioned about "${memory.keyword}" — I came across something relevant.`,
    `Still thinking about the "${memory.keyword}" question from my last post. This connects to that.`,
    `Quick note before I get into this: if you read my last piece on "${memory.keyword}", today's fits right in.`,
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
  'Stream-of-consciousness mode: minimal paragraph breaks, thoughts flow into each other, use spaces and em-dashes more than commas — write fast, edit minimally, let it feel like a voice note typed out.',
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

const BLOG_TOPICS = [
  'The one thing nobody tells you about bean paste piping — and it cost me three wasted batches',
  'Why I stopped using Swiss meringue buttercream in summer (and what I switched to)',
  'Honest thoughts on the Korean cake trend: beautiful, but is it actually practical?',
  'That time my fondant cracked in front of a client — and what I quietly learned from it',
  'The underrated skill that separates decent bakers from really good ones',
  'My Paris stage nearly broke me. Here\'s what I actually came back with.',
  'Why cheap chocolate is ruining more cakes than bad technique ever could',
  'The temperature obsession: am I taking it too far or is everyone else too relaxed?',
  'What baking competitions look like from the inside — it\'s not what you imagine',
  'A tool I\'ve used for 8 years that most bakers walk right past in the shop',
  'The problem with "beginner-friendly" recipes (and why they often make things harder)',
  'Why I keep going back to French technique even when Korean styles are everywhere right now',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── System prompt (built fresh per article) ──────────────────────────────────

function buildSystemPrompt(mood, formattingMode) {
  return `You are Nova — a professional baker with 10 years in the industry. You write for your own baking website, Beiai Baking.

YOUR VOICE:
- Direct, sometimes blunt. You have earned the right to say what you actually think.
- You love the craft but you are not precious about it.
- You notice things others miss, and you say so plainly.
- Current mood: ${mood.label}

WRITING RULES — apply every single one:

1. BANNED WORDS — never use any of these: ${BANNED_WORDS.join(', ')}

2. NO sequence markers — never write: firstly / secondly / thirdly / finally / in conclusion / to summarize / in addition / on the other hand

3. FORBIDDEN structure — do NOT use "总-分-总" (intro → three points → conclusion).
   Instead: start in the middle of a thought. Lead with a specific detail, a real number, a concrete scene, or a blunt opinion. No warming up.

4. SENTENCE VARIETY — mix short punchy sentences (3–6 words) with longer flowing ones. Never three consecutive sentences of similar length.

5. PUNCTUATION — use ellipsis (...) when a thought trails. Use em dash (—) for sudden shifts or asides. These are allowed and encouraged.

6. FORMATTING: ${formattingMode}

7. ENDINGS — stop when the thought is done. Do not wrap up. Do not call the reader to action. Do not say "I hope this helps" or anything like it. Land on a detail or an open question and stop.

8. SPECIFICITY — name real things: venues, temperatures, brands, cities, techniques. "A bakery in Lyon" is 10x better than "a European bakery."

9. CRITICISM — if something is overpriced, badly organised, or overhyped, say so. Nova has a point of view.

10. INDUSTRY LANGUAGE — use terms naturally: proofing, lamination, temper, ganache ratio, crumb structure, out-of-oven temp, bench rest. Not their dumbed-down versions.

LANGUAGE: Write entirely in English. No exceptions. Every word of title, excerpt, and content must be in English.

Return ONLY valid JSON. No explanation before or after. No markdown code fences.`;
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

function getMonthDate(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(15);
  return d.toISOString().split('T')[0];
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

  if (!response.ok) {
    throw new Error(`Tavily ${response.status}: ${await response.text()}`);
  }

  const data    = await response.json();
  const results = data.results || [];
  if (results.length === 0) return null;

  return results
    .map(r => `SOURCE: ${r.title}\n${r.content}`)
    .join('\n\n---\n\n')
    .slice(0, 3000);
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
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`DeepSeek returned invalid JSON: ${text.slice(0, 200)}`);
  }
}

// ─── Generators ───────────────────────────────────────────────────────────────

async function generateNews(monthLabel, publishedDate, memory) {
  console.log(`  [news] searching ${monthLabel}...`);

  const queries = [
    `international baking exhibition pastry competition ${monthLabel}`,
    `world pastry championship cake award results ${monthLabel}`,
    `baking industry news trend ${monthLabel}`,
  ];

  let context = null;
  for (const q of queries) {
    try { context = await tavilySearch(q); if (context) break; }
    catch (e) { console.warn(`  [news] search failed: ${e.message}`); }
    await sleep(1000);
  }

  if (!context) { console.warn(`  [news] no results for ${monthLabel}, skipping`); return null; }

  const mood       = pickRandom(NOVA_MOODS);
  const formatting = pickRandom(FORMATTING_MODES);
  const useEcho    = Math.random() < 0.3 && memory;
  const echoLine   = useEcho ? buildEchoLine(memory) : '';

  const userPrompt = `
Real baking industry sources from around ${monthLabel}:

${context}

${echoLine ? `Weave this in naturally near the opening: "${echoLine}"` : ''}

Write a news article for Beiai Baking. Requirements:
- Open with a specific fact, number, location, or blunt reaction — not a background paragraph
- Use real names: event names, venues, competition titles, cities if present in sources
- If anything in the sources seems overpriced, poorly organised, or disappointing — say so
- 240–320 words
- Do NOT end with a conclusion, summary, or call to action
- Write entirely in English — title, excerpt, and content

Return exactly this JSON:
{
  "title": "direct English news headline under 80 chars — no clickbait",
  "excerpt": "1–2 punchy English sentences under 180 chars",
  "content": "full article in English",
  "type": "news",
  "published_date": "${publishedDate}"
}`;

  const post = await deepseekGenerate(buildSystemPrompt(mood, formatting), userPrompt);
  if (post) saveMemory(post);
  return post;
}

async function generateRecipe(monthLabel, publishedDate, memory) {
  console.log(`  [recipe] searching ${monthLabel}...`);

  const queries = [
    `trending cake recipe technique ${monthLabel}`,
    `Korean Japanese French pastry recipe popular ${monthLabel}`,
    `viral baking recipe ${monthLabel}`,
  ];

  let context = null;
  for (const q of queries) {
    try { context = await tavilySearch(q); if (context) break; }
    catch (e) { console.warn(`  [recipe] search failed: ${e.message}`); }
    await sleep(1000);
  }

  if (!context) { console.warn(`  [recipe] no results for ${monthLabel}, skipping`); return null; }

  const mood       = pickRandom(NOVA_MOODS);
  const formatting = pickRandom(FORMATTING_MODES);
  const useEcho    = Math.random() < 0.3 && memory;
  const echoLine   = useEcho ? buildEchoLine(memory) : '';

  const userPrompt = `
Recipe sources from around ${monthLabel}:

${context}

${echoLine ? `Optional opening echo to weave in naturally: "${echoLine}"` : ''}

Write a recipe post for Beiai Baking as Nova. Requirements:
- Nova has made this. She can mention one thing that went wrong the first time, or one thing most recipes get wrong
- Ingredients woven into prose — not a bullet list
- Method described in natural language — not numbered steps like a manual
- One blunt pro tip at the end (not "enjoy your creation" or any variation of that)
- 280–360 words
- Write entirely in English — title, excerpt, and content

Return exactly this JSON:
{
  "title": "English recipe title that makes someone want to try it, under 80 chars",
  "excerpt": "1–2 English sentences that make it sound genuinely good, under 180 chars",
  "content": "full recipe post in English",
  "type": "recipe",
  "published_date": "${publishedDate}"
}`;

  const post = await deepseekGenerate(buildSystemPrompt(mood, formatting), userPrompt);
  if (post) saveMemory(post);
  return post;
}

async function generateBlog(monthLabel, publishedDate, memory) {
  console.log(`  [blog] generating ${monthLabel}...`);

  const topic      = pickRandom(BLOG_TOPICS);
  const mood       = pickRandom(NOVA_MOODS);
  const formatting = pickRandom(FORMATTING_MODES);
  const useEcho    = Math.random() < 0.3 && memory;
  const echoLine   = useEcho ? buildEchoLine(memory) : '';

  const userPrompt = `
Write a personal blog post for Beiai Baking as Nova.
Topic: "${topic}"
Time context: ${monthLabel}

${echoLine ? `Weave this in naturally near the opening: "${echoLine}"` : ''}

Requirements:
- Do NOT open with background or context. Start mid-thought: a scene, a reaction, a specific memory
- At least one concrete detail: a temperature, a tool name, a city, a client situation
- Allow one moment where the thought shifts unexpectedly — like a real person who just remembered something
- Opinionated throughout — Nova has a take on this, not just information
- 260–340 words
- End when the thought is done. No tidy wrap-up. No advice to the reader.
- Write entirely in English — title, excerpt, and content

Return exactly this JSON:
{
  "title": "English title that sounds like a real person wrote it — under 80 chars",
  "excerpt": "an English line that makes someone want to read on, under 180 chars",
  "content": "full blog post in English",
  "type": "blog",
  "published_date": "${publishedDate}"
}`;

  const post = await deepseekGenerate(buildSystemPrompt(mood, formatting), userPrompt);
  if (post) saveMemory(post);
  return post;
}

// ─── Send to receiver ─────────────────────────────────────────────────────────

async function sendToReceiver(posts) {
  const valid = posts.filter(Boolean);
  if (valid.length === 0) { console.log('  [send] nothing to send'); return; }

  console.log(`  [send] sending ${valid.length} posts...`);

  const response = await fetch(BEIAI_API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET },
    body:    JSON.stringify(valid),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(`Receiver ${response.status}: ${JSON.stringify(result)}`);

  console.log(`  [send] inserted: ${result.inserted}, skipped: ${result.skipped}`);
  (result.errors || []).forEach(e => {
    console.warn(`  [send] skipped "${e.title}": ${e.reasons.join(', ')}`);
  });
}

// ─── Weekly run ───────────────────────────────────────────────────────────────

async function runWeekly() {
  console.log('[auto-generate] Weekly run...');
  const publishedDate = new Date().toISOString().split('T')[0];
  const monthLabel    = getMonthLabel(0);
  const memory        = loadMemory();
  const posts         = [];

  try { posts.push(await generateNews(monthLabel, publishedDate, memory)); }
  catch (e) { console.error(`  [news] ${e.message}`); }
  await sleep(2000);

  try { posts.push(await generateRecipe(monthLabel, publishedDate, memory)); }
  catch (e) { console.error(`  [recipe] ${e.message}`); }
  await sleep(2000);

  try { posts.push(await generateBlog(monthLabel, publishedDate, memory)); }
  catch (e) { console.error(`  [blog] ${e.message}`); }

  await sendToReceiver(posts);
  console.log('[auto-generate] Weekly run complete.');
}

// ─── Bulk historical run ──────────────────────────────────────────────────────

async function runBulk() {
  console.log('[auto-generate] Bulk run — 6 months of history...');

  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
    const monthLabel = getMonthLabel(monthsAgo);
    console.log(`\n[auto-generate] ${monthLabel}`);
    const posts  = [];
    const memory = loadMemory();

    for (let i = 0; i < 2; i++) {
      try {
        const d = new Date(getMonthDate(monthsAgo));
        d.setDate(i === 0 ? 8 : 22);
        posts.push(await generateNews(monthLabel, d.toISOString().split('T')[0], memory));
      } catch (e) { console.error(`  [news ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    for (let i = 0; i < 2; i++) {
      try {
        const d = new Date(getMonthDate(monthsAgo));
        d.setDate(i === 0 ? 5 : 19);
        posts.push(await generateRecipe(monthLabel, d.toISOString().split('T')[0], memory));
      } catch (e) { console.error(`  [recipe ${i+1}] ${e.message}`); }
      await sleep(3000);
    }

    for (let i = 0; i < 2; i++) {
      try {
        const d = new Date(getMonthDate(monthsAgo));
        d.setDate(i === 0 ? 12 : 26);
        posts.push(await generateBlog(monthLabel, d.toISOString().split('T')[0], memory));
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
