const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

const AnthropicModule = require('@anthropic-ai/sdk');
const Anthropic = AnthropicModule.default || AnthropicModule;

const MODEL = 'claude-opus-5';
/* Server-side refusal fallbacks: on a policy decline the API re-runs the same
   request on a fallback model inside the same call, so a user never sees a
   silent dead end. The "default" scalar form requires this exact beta flag. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let client = null;

/** Lazily construct the client so the server still boots without a key. */
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function requireClient(res) {
  const c = getClient();
  if (!c) {
    res.status(503).json({
      configured: false,
      message: 'AI is not configured. Add ANTHROPIC_API_KEY to backend/.env and restart the server.',
    });
    return null;
  }
  return c;
}

/** Reports whether AI is usable, so the UI can hide its entry points. */
exports.status = async (req, res) => {
  res.status(200).json({ configured: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
};

/* ---------------------------------------------------------------------------
   Shared grounding: the real values that exist in this database.

   Without this the model invents statuses like "Hot" that match nothing. With
   it, "show me hot leads" maps onto whatever this CRM actually calls that.
   -------------------------------------------------------------------------- */
async function loadVocabulary() {
  const [statuses, sources, projects, owners] = await Promise.all([
    prisma.lead.findMany({ distinct: ['status'], select: { status: true }, take: 60 }),
    prisma.lead.findMany({ distinct: ['primarySource'], select: { primarySource: true }, take: 60 }),
    prisma.lead.findMany({ distinct: ['project'], select: { project: true }, take: 60 }),
    prisma.lead.findMany({ distinct: ['owner'], select: { owner: true }, take: 60 }),
  ]);
  const clean = (rows, key) => [...new Set(rows.map(r => r[key]).filter(Boolean))];
  return {
    statuses: clean(statuses, 'status'),
    sources: clean(sources, 'primarySource'),
    projects: clean(projects, 'project'),
    owners: clean(owners, 'owner'),
  };
}

/* ---------------------------------------------------------------------------
   1. Natural-language lead search
   -------------------------------------------------------------------------- */

const LeadFilterSchema = z.object({
  statuses: z.array(z.string()).describe('Exact status values to match, from the allowed list. Empty if not filtering by status.'),
  sources: z.array(z.string()).describe('Exact primarySource values, from the allowed list. Empty if unused.'),
  projects: z.array(z.string()).describe('Exact project values, from the allowed list. Empty if unused.'),
  owners: z.array(z.string()).describe('Exact owner usernames, from the allowed list. Empty if unused.'),
  textSearch: z.string().describe('Free text to match against name, email or mobile. Empty string if unused.'),
  createdWithinDays: z.number().describe('Only leads created in the last N days. 0 means no date limit.'),
  hasFollowUpDue: z.boolean().describe('True only if the user asked for leads with a follow-up date due now or in the past.'),
  sortBy: z.enum(['createdAt', 'updatedAt', 'name']).describe('Field to sort by.'),
  sortDir: z.enum(['asc', 'desc']).describe('Sort direction.'),
  limit: z.number().describe('Maximum rows to return, between 1 and 200.'),
  interpretation: z.string().describe('One short sentence, addressed to the user, describing the filter you applied.'),
});

exports.searchLeads = async (req, res) => {
  const anthropic = requireClient(res);
  if (!anthropic) return;

  const { query } = req.body || {};
  if (!query || !String(query).trim()) {
    return res.status(400).json({ message: 'A search query is required.' });
  }

  try {
    const vocab = await loadVocabulary();

    const response = await anthropic.beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: [
        'You convert a real-estate CRM user\'s plain-English request into a lead filter.',
        '',
        'Rules:',
        '- Only use values from the allowed lists below. Never invent a value.',
        '- If the request implies a concept the lists do not cover, leave those arrays empty and put the words in textSearch instead.',
        '- "hot"/"warm"/"cold" are not statuses unless they appear in the allowed status list; map them to the closest real status.',
        '- Default limit to 50 and sort by createdAt desc unless the user asks otherwise.',
        '',
        `Allowed statuses: ${JSON.stringify(vocab.statuses)}`,
        `Allowed primary sources: ${JSON.stringify(vocab.sources)}`,
        `Allowed projects: ${JSON.stringify(vocab.projects)}`,
        `Allowed owners: ${JSON.stringify(vocab.owners)}`,
      ].join('\n'),
      messages: [{ role: 'user', content: String(query) }],
      output_config: { format: zodOutputFormat(LeadFilterSchema, 'lead_filter') },
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({
        message: 'That request could not be processed. Try rephrasing it.',
      });
    }

    const filter = response.parsed_output;
    if (!filter) {
      return res.status(502).json({ message: 'Could not interpret that search. Try rephrasing it.' });
    }

    // ---- Translate the model's filter into a Prisma query -----------------
    const where = {};
    const and = [];

    if (filter.statuses?.length) where.status = { in: filter.statuses };
    if (filter.sources?.length) where.primarySource = { in: filter.sources };
    if (filter.projects?.length) where.project = { in: filter.projects };
    if (filter.owners?.length) where.owner = { in: filter.owners };

    if (filter.textSearch?.trim()) {
      const q = filter.textSearch.trim();
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { mobile: { contains: q } },
        ],
      });
    }

    if (filter.createdWithinDays > 0) {
      const since = new Date(Date.now() - filter.createdWithinDays * 86400000);
      and.push({ createdAt: { gte: since } });
    }

    if (filter.hasFollowUpDue) {
      and.push({ followUpDate: { not: null, lte: new Date() } });
    }

    if (and.length) where.AND = and;

    const take = Math.min(Math.max(Number(filter.limit) || 50, 1), 200);
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { [filter.sortBy || 'createdAt']: filter.sortDir || 'desc' },
      take,
    });

    res.status(200).json({
      leads,
      count: leads.length,
      interpretation: filter.interpretation,
      filter,
      usage: response.usage,
    });
  } catch (error) {
    console.error('AI lead search failed:', error);
    sendError(res, error, 'AI search failed.', 500);
  }
};

/* ---------------------------------------------------------------------------
   Streaming helper — Server-Sent Events.
   -------------------------------------------------------------------------- */
function openSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops nginx buffering the stream and defeating the point of streaming.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
}

const sseSend = (res, event, data) =>
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/**
 * Streams a Claude response over SSE. Emits `delta` events per text chunk,
 * then `done` (or `error`).
 */
async function streamAnswer(res, anthropic, { system, messages, maxTokens = 2000 }) {
  openSSE(res);

  // A client navigating away should stop us billing for output nobody reads.
  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system,
      messages,
    });

    for await (const event of stream) {
      if (aborted) break;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sseSend(res, 'delta', { text: event.delta.text });
      }
    }

    if (!aborted) {
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        sseSend(res, 'error', { message: 'That request could not be answered.' });
      } else {
        sseSend(res, 'done', { usage: final.usage });
      }
    }
  } catch (error) {
    console.error('AI stream failed:', error);
    if (!aborted) sseSend(res, 'error', { message: error.message || 'AI request failed.' });
  } finally {
    res.end();
  }
}

/* ---------------------------------------------------------------------------
   2. Lead summary (streamed)
   -------------------------------------------------------------------------- */
exports.summarizeLead = async (req, res) => {
  const anthropic = requireClient(res);
  if (!anthropic) return;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: { logs: { orderBy: { date: 'desc' }, take: 40 } },
    });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });

    // Send only the fields that carry meaning; skip empty ones to save tokens.
    const facts = Object.entries(lead)
      .filter(([k, v]) => k !== 'logs' && v !== null && v !== '' && v !== undefined)
      .map(([k, v]) => `${k}: ${v instanceof Date ? v.toISOString().slice(0, 10) : v}`)
      .join('\n');

    const timeline = lead.logs
      .map(l => `- ${new Date(l.date).toISOString().slice(0, 10)}: ${l.title}${l.subtitle ? ` (${l.subtitle})` : ''}`)
      .join('\n') || '(no activity recorded)';

    await streamAnswer(res, anthropic, {
      maxTokens: 1200,
      system: [
        'You brief a real-estate sales agent on one lead, in under 120 words.',
        'Write three short labelled sections: **Where things stand**, **Signals**, **Next step**.',
        'Be concrete and reference only the data given. If the record is thin, say so plainly',
        'rather than padding. Never invent contact history, budgets or preferences.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: `Lead record:\n${facts}\n\nActivity timeline (most recent first):\n${timeline}`,
      }],
    });
  } catch (error) {
    console.error('Lead summary failed:', error);
    if (!res.headersSent) sendError(res, error, 'Summary failed.', 500);
    else res.end();
  }
};

/* ---------------------------------------------------------------------------
   3. Assistant (streamed), grounded in live pipeline numbers
   -------------------------------------------------------------------------- */
exports.ask = async (req, res) => {
  const anthropic = requireClient(res);
  if (!anthropic) return;

  const { question, history = [] } = req.body || {};
  if (!question || !String(question).trim()) {
    return res.status(400).json({ message: 'A question is required.' });
  }

  try {
    const [byStatus, bySource, total, recent] = await Promise.all([
      prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.lead.groupBy({ by: ['primarySource'], _count: { id: true } }),
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    ]);

    const context = [
      `Total leads: ${total}`,
      `Created in the last 30 days: ${recent}`,
      `By status: ${byStatus.map(s => `${s.status}=${s._count.id}`).join(', ')}`,
      `By primary source: ${bySource.filter(s => s.primarySource).map(s => `${s.primarySource}=${s._count.id}`).join(', ')}`,
    ].join('\n');

    // Keep the last few turns so follow-up questions make sense, and drop
    // anything malformed rather than letting it reach the API.
    const priorTurns = (Array.isArray(history) ? history : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }));

    await streamAnswer(res, anthropic, {
      maxTokens: 2000,
      system: [
        'You are the assistant inside NexorCRM, a real-estate CRM.',
        'Answer using the pipeline snapshot provided. Be brief and practical — a few sentences',
        'or a short list. If the snapshot cannot answer the question, say what is missing and',
        'suggest which CRM screen would show it. Never invent numbers.',
        '',
        `Current pipeline snapshot:\n${context}`,
      ].join('\n'),
      messages: [...priorTurns, { role: 'user', content: String(question) }],
    });
  } catch (error) {
    console.error('AI assistant failed:', error);
    if (!res.headersSent) sendError(res, error, 'Assistant failed.', 500);
    else res.end();
  }
};
