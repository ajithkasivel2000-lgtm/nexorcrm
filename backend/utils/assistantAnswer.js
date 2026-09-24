/**
 * Turning a question into an answer.
 *
 * Two sources, in this order:
 *
 *   1. the knowledge base — how this CRM works. Deterministic, instant, free,
 *      and incapable of inventing a feature that does not exist.
 *   2. the database — "how many leads are in Site Visit" is a counting
 *      question, not a how-to, and the real number is better than prose.
 *
 * When ANTHROPIC_API_KEY is set the matched article and the live figures are
 * handed to Claude to phrase the reply, which reads better and copes with
 * questions worded sideways. Without a key everything still works; the wording
 * is just the article's own.
 */
const prisma = require('../prismaClient');
const { TOPICS } = require('./assistantKnowledge');

/** Words too common to say anything about which topic is meant. */
const STOP = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'how', 'what', 'when',
  'where', 'who', 'why', 'can', 'i', 'we', 'you', 'my', 'me', 'to', 'in', 'on', 'for', 'of',
  'and', 'or', 'it', 'this', 'that', 'be', 'with', 'from', 'at', 'by', 'as', 'if', 'not',
  'please', 'tell', 'show', 'explain', 'want', 'need', 'get', 'make', 'there', 'about',
]);

const normalise = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const words = (text) => normalise(text).split(' ').filter((w) => w && !STOP.has(w));

/**
 * A word and the singulars it might be.
 *
 * English plurals do not reduce to one rule — "emails" drops an s, "queries"
 * becomes a y, "duplicates" drops only the s even though it ends in "es". So
 * rather than pick a rule and be wrong, every candidate is kept and a match on
 * any of them counts. Over-generating is harmless here: these are compared
 * against a hand-written keyword list, not used to rewrite anything.
 */
const variants = (word) => {
  const out = new Set([word]);
  if (word.length > 4 && word.endsWith('ies')) out.add(`${word.slice(0, -3)}y`);
  if (word.length > 4 && word.endsWith('es')) out.add(word.slice(0, -2));
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) out.add(word.slice(0, -1));
  return out;
};

/** True when the question used this word, in any of its forms. */
const asked = (qWords, word) => [...variants(word)].some((v) => qWords.has(v));

/**
 * How well a topic answers this question.
 *
 * A whole keyword phrase appearing in the question is worth far more than one
 * word of it: "create lead" should beat a topic that merely says "lead"
 * somewhere. Title words count too, and the topic id a little.
 */
function scoreTopic(topic, question) {
  const q = normalise(question);
  const qWords = new Set();
  for (const w of words(question)) for (const v of variants(w)) qWords.add(v);
  if (qWords.size === 0) return 0;

  let best = 0;      // the strongest single keyword
  let matched = 0;   // how many keywords matched at all

  for (const keyword of topic.keywords) {
    const k = normalise(keyword);
    if (!k) continue;

    let value = 0;
    if (k.includes(' ')) {
      if (q.includes(k)) {
        // The whole phrase, intact. Longer phrases are more specific, so
        // "who gets a new lead" outranks the "new lead" sitting inside it.
        value = 8 + 2 * k.split(' ').length;
      } else {
        const parts = k.split(' ').filter((w) => !STOP.has(w));
        const hit = parts.filter((w) => asked(qWords, w)).length;
        // Only a real multi-word phrase earns the all-parts bonus: "make a
        // lead" reduces to one word, and 7 points for that is not a match.
        value = (parts.length >= 2 && hit === parts.length) ? 7 : hit * 1.5;
      }
    } else if (asked(qWords, k)) {
      value = 4;
    }

    if (value > 0) matched += 1;
    if (value > best) best = value;
  }

  if (best === 0) return 0;

  // A little for breadth, capped — enough to break a tie between two topics
  // whose best match is equal, never enough to win on keyword count alone.
  let score = best + Math.min(matched, 3) * 0.5;

  for (const w of words(topic.title)) if (qWords.has(w)) score += 2;
  for (const w of topic.id.split('-')) if (qWords.has(w)) score += 1;

  return score;
}

/** The best-matching topics, strongest first. */
function findTopics(question, limit = 3) {
  return TOPICS
    .map((topic) => ({ topic, score: scoreTopic(topic, question) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ---------------------------------------------------------------------------
   Counting questions.
   -------------------------------------------------------------------------- */

const COUNT_HINTS = ['how many', 'count', 'total', 'number of'];

/** Whether this is asking for a figure rather than for instructions. */
function isCountQuestion(question) {
  const q = normalise(question);
  return COUNT_HINTS.some((h) => q.includes(h));
}

/**
 * Answers a counting question from the database.
 *
 * Only reports what was actually counted — never a figure the query did not
 * produce. Returns null when the question is not one this can answer, so the
 * caller falls back to the knowledge base.
 */
async function answerFromData(question) {
  const q = normalise(question);

  const mentions = (...terms) => terms.some((t) => q.includes(t));

  try {
    if (mentions('lead', 'enquiry', 'enquiries')) {
      const total = await prisma.lead.count();
      const byStatus = await prisma.lead.groupBy({ by: ['status'], _count: { id: true } });
      const breakdown = byStatus
        .filter((r) => r.status)
        .sort((a, b) => b._count.id - a._count.id)
        .map((r) => `${r.status}: ${r._count.id}`);

      return {
        title: 'Leads right now',
        answer: total === 0
          ? 'There are no leads in the CRM yet.'
          : `There ${total === 1 ? 'is' : 'are'} ${total} lead${total === 1 ? '' : 's'} in the CRM.`,
        steps: breakdown.length ? breakdown : null,
        topic: 'live-lead-count',
      };
    }

    if (mentions('opportunit')) {
      const total = await prisma.opportunity.count();
      return {
        title: 'Opportunities right now',
        answer: `There ${total === 1 ? 'is' : 'are'} ${total} opportunit${total === 1 ? 'y' : 'ies'} in the CRM.`,
        topic: 'live-opportunity-count',
      };
    }

    if (mentions('user', 'people', 'team')) {
      const total = await prisma.user.count();
      return {
        title: 'Users right now',
        answer: `There ${total === 1 ? 'is' : 'are'} ${total} user account${total === 1 ? '' : 's'}.`,
        topic: 'live-user-count',
      };
    }

    if (mentions('project')) {
      const total = await prisma.project.count();
      return {
        title: 'Projects right now',
        answer: `There ${total === 1 ? 'is' : 'are'} ${total} project${total === 1 ? '' : 's'}.`,
        topic: 'live-project-count',
      };
    }
  } catch (error) {
    console.error('Assistant could not read the figures:', error.message);
  }

  return null;
}

/* ---------------------------------------------------------------------------
   Composing the reply.
   -------------------------------------------------------------------------- */

/** Renders a topic as the message the user reads. */
function renderTopic(topic) {
  return {
    title: topic.title,
    answer: topic.answer,
    steps: topic.steps || null,
    screen: topic.screen || null,
    topic: topic.id,
  };
}

/** What to say when nothing matched. */
function renderUnknown() {
  return {
    title: null,
    answer:
      'I only know about NexorCRM itself, and I could not match that to anything I have been taught. '
      + 'Try naming the thing you are working with — a lead, a status, an owner, the dashboard, importing, '
      + 'notifications, templates or users.',
    suggestions: TOPICS.slice(0, 6).map((t) => t.title),
    topic: null,
  };
}

/**
 * Answers a question about this CRM.
 *
 * @param {string} question
 * @returns {Promise<{title: string|null, answer: string, steps?: string[]|null,
 *   screen?: object|null, suggestions?: string[], topic: string|null, related?: object[]}>}
 */
async function answerQuestion(question) {
  const text = String(question || '').trim();
  if (!text) return renderUnknown();

  // A figure beats a paragraph describing where to find the figure.
  if (isCountQuestion(text)) {
    const fromData = await answerFromData(text);
    if (fromData) return fromData;
  }

  const matches = findTopics(text);
  if (matches.length === 0) return renderUnknown();

  const best = matches[0];
  // A single weak keyword is not a match, it is a coincidence.
  if (best.score < 4) return renderUnknown();

  const reply = renderTopic(best.topic);

  // Near-equal runners-up are offered rather than guessed between.
  const alternatives = matches
    .slice(1)
    .filter((m) => m.score >= best.score * 0.6)
    .map((m) => ({ id: m.topic.id, title: m.topic.title }));
  if (alternatives.length) reply.related = alternatives;

  return reply;
}

module.exports = { answerQuestion, findTopics, scoreTopic, isCountQuestion };
