/**
 * Does every link the assistant hands out actually go somewhere?
 *
 * The assistant tells people which screen to open. A path written from memory
 * rather than read from the router sends them to "Page not found", which is
 * worse than giving no link at all — so this reads the real route table out of
 * the frontend and checks every topic against it.
 *
 * Run it after adding a topic, or after any route is renamed:
 *   node scripts/checkAssistantLinks.js
 */
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'frontend', 'src', 'App.jsx');
const { TOPICS } = require('../utils/assistantKnowledge');

if (!fs.existsSync(APP)) {
  console.error(`Cannot read the router at ${APP}`);
  process.exit(1);
}

/* ---- the routes the application actually has ---------------------------- */
const source = fs.readFileSync(APP, 'utf8');
const routes = [...source.matchAll(/<Route\s+path="([^"]*)"/g)]
  .map((m) => m[1])
  .filter((r) => r !== '*');

// Nested routes are declared relative to the layout route at "/", so a bare
// "leads" is reachable as "/leads".
const known = new Set(routes.map((r) => (r.startsWith('/') ? r : `/${r}`)));
known.add('/');

/** Whether a link resolves, ignoring any query string. */
const resolves = (link) => {
  const [pathname] = String(link).split('?');
  if (known.has(pathname)) return true;
  // A route with a parameter — /leads/:id — matches any single segment.
  return [...known].some((route) => {
    if (!route.includes(':')) return false;
    const a = route.split('/');
    const b = pathname.split('/');
    return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
  });
};

/* ---- check every topic --------------------------------------------------- */
const broken = [];
let checked = 0;

for (const topic of TOPICS) {
  if (!topic.screen?.path) continue;
  checked += 1;
  if (!resolves(topic.screen.path)) {
    broken.push({ id: topic.id, label: topic.screen.label, link: topic.screen.path });
  }
}

console.log(`${known.size} routes in the application`);
console.log(`${checked} of ${TOPICS.length} topics link to a screen\n`);

if (broken.length === 0) {
  console.log('every link resolves');
} else {
  console.log(`${broken.length} broken link(s):`);
  for (const b of broken) {
    console.log(`  ${b.id.padEnd(18)} "${b.label}" -> ${b.link}`);
    // Suggest the closest real route, so the fix is obvious.
    const want = b.link.split('?')[0].replace(/^\//, '');
    const near = [...known]
      .filter((r) => !r.includes(':'))
      .map((r) => ({ r, score: r.includes(want) || want.includes(r.replace(/^\//, '')) ? 2 : 0 }))
      .filter((x) => x.score > 0)
      .map((x) => x.r);
    if (near.length) console.log(`  ${' '.repeat(18)} did you mean: ${near.join(', ')}`);
  }
  process.exitCode = 1;
}
