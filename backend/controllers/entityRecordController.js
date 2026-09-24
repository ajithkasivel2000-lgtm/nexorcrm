/**
 * One controller for every shared sub-record.
 *
 * The route carries what kind of parent and what kind of record —
 * /api/records/:entityType/:entityId/:recordType — so a task on a lead and a
 * task on an opportunity take the same path through the same validation. Eight
 * near-identical controllers would drift; this one cannot disagree with itself.
 *
 * Both kinds come off the URL, so both are checked against a fixed list before
 * being used to reach a Prisma delegate.
 */
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { can } = require('../utils/permissions');
const { canAccessLead } = require('../middleware/leadAccess');
const {
  RECORD_TYPES, isEntityType, isRecordType, parentExists,
  cleanPayload, missingRequired,
} = require('../utils/entityRecords');

/** Who is asking. The routes sit behind authMiddleware, so this is set. */
const who = (req) => req.user?.username || req.headers['x-username'] || null;

/**
 * Checks the URL before it is used to reach the database.
 *
 * Returns the spec, or answers the request and returns null. A record type
 * that is not on the list must never become a property lookup on prisma.
 */
async function resolve(req, res) {
  const { entityType, entityId, recordType } = req.params;

  if (!isEntityType(entityType)) {
    res.status(400).json({ message: `Unknown record owner: ${entityType}` });
    return null;
  }
  if (!isRecordType(recordType)) {
    res.status(404).json({ message: `Unknown record type: ${recordType}` });
    return null;
  }
  if (!(await parentExists(entityType, entityId))) {
    res.status(404).json({ message: 'That record does not exist' });
    return null;
  }
  /* The notes, tasks and files on a record are as private as the record: a
     lead's are for whoever may open the lead, the rest follow the page
     permission. Reads need view; writes need edit. */
  const action = req.method === 'GET' ? 'view' : 'edit';
  if (!(await mayReachParent(req.user, entityType, entityId, action))) {
    res.status(404).json({ message: 'That record does not exist' });
    return null;
  }
  return RECORD_TYPES[recordType];
}

const PARENT_PAGES = { lead: 'leads', opportunity: 'opportunities', customer: 'customers', project: 'projects' };

async function mayReachParent(user, entityType, entityId, action) {
  if (!(await can(user, PARENT_PAGES[entityType], action))) return false;
  if (entityType !== 'lead') return true;
  const lead = await prisma.lead.findUnique({ where: { id: entityId }, select: { owner: true, ownerId: true, allocator: true } });
  return canAccessLead(lead, user);
}
exports.mayReachParent = mayReachParent;

/** Everything of this kind on this record. */
exports.list = async (req, res) => {
  try {
    const spec = await resolve(req, res);
    if (!spec) return;

    const rows = await prisma[spec.model].findMany({
      where: { entityType: req.params.entityType, entityId: req.params.entityId },
      orderBy: spec.order,
    });
    res.status(200).json(rows);
  } catch (error) {
    sendError(res, error, 'Could not load those records', 500);
  }
};

/** Adds one. */
exports.create = async (req, res) => {
  try {
    const spec = await resolve(req, res);
    if (!spec) return;
    if (spec.readOnly) {
      return res.status(405).json({ message: 'These are written by the system, not directly' });
    }

    const { data, error } = cleanPayload(req.params.recordType, req.body);
    if (error) return res.status(400).json({ message: error });

    const missing = missingRequired(req.params.recordType, data);
    if (missing.length) return res.status(400).json({ message: `${missing.join(', ')} is required` });

    const row = await prisma[spec.model].create({
      data: {
        ...data,
        entityType: req.params.entityType,
        entityId: req.params.entityId,
        // Taken from the session, never from the body: otherwise a client can
        // put somebody else's name on its own work.
        ...(spec.model === 'note' ? { createdBy: who(req) } : { createdBy: who(req) }),
      },
    });

    res.status(201).json(row);
  } catch (error) {
    sendError(res, error, 'Could not save that', 400);
  }
};

/** Edits one. */
exports.update = async (req, res) => {
  try {
    const spec = await resolve(req, res);
    if (!spec) return;
    if (spec.readOnly) {
      return res.status(405).json({ message: 'These cannot be edited' });
    }

    /* Fetched with its owner in the where clause: an id alone would let a
       caller edit a row belonging to a different record entirely. */
    const existing = await prisma[spec.model].findFirst({
      where: {
        id: req.params.itemId,
        entityType: req.params.entityType,
        entityId: req.params.entityId,
      },
    });
    if (!existing) return res.status(404).json({ message: 'Not found on this record' });

    const { data, error } = cleanPayload(req.params.recordType, req.body);
    if (error) return res.status(400).json({ message: error });

    /* Completing a task stamps who and when, so the two cannot disagree. */
    if (spec.model === 'task' && data.status === 'Completed' && existing.status !== 'Completed') {
      data.completedAt = new Date();
      data.completedBy = who(req);
    }
    if (spec.model === 'task' && data.status && data.status !== 'Completed') {
      data.completedAt = null;
      data.completedBy = null;
    }
    if (spec.model === 'note') data.updatedBy = who(req);

    const row = await prisma[spec.model].update({ where: { id: existing.id }, data });
    res.status(200).json(row);
  } catch (error) {
    sendError(res, error, 'Could not save that change', 400);
  }
};

/** Removes one. */
exports.remove = async (req, res) => {
  try {
    const spec = await resolve(req, res);
    if (!spec) return;
    if (spec.readOnly) {
      return res.status(405).json({ message: 'These cannot be deleted' });
    }

    const existing = await prisma[spec.model].findFirst({
      where: {
        id: req.params.itemId,
        entityType: req.params.entityType,
        entityId: req.params.entityId,
      },
    });
    if (!existing) return res.status(404).json({ message: 'Not found on this record' });

    await prisma[spec.model].delete({ where: { id: existing.id } });
    // A document's bytes go with its row.
    if (spec.model === 'document' && existing.storedName) {
      require('../utils/storage').remove(existing.storedName).catch(() => {});
    }
    res.status(200).json({ message: 'Deleted' });
  } catch (error) {
    sendError(res, error, 'Could not delete that', 500);
  }
};

/**
 * How many of each kind a record has.
 *
 * The tab strip needs counts before any tab is opened, and eight requests to
 * find out is eight requests too many.
 */
exports.counts = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!isEntityType(entityType)) {
      return res.status(400).json({ message: `Unknown record owner: ${entityType}` });
    }
    if (!(await parentExists(entityType, entityId))
      || !(await mayReachParent(req.user, entityType, entityId, 'view'))) {
      return res.status(404).json({ message: 'That record does not exist' });
    }

    const where = { entityType, entityId };
    const entries = Object.entries(RECORD_TYPES);
    const counts = await Promise.all(
      entries.map(([, spec]) => prisma[spec.model].count({ where })),
    );

    const out = {};
    entries.forEach(([name], i) => { out[name] = counts[i]; });

    // Open tasks and overdue ones drive a badge, so they are worth their own
    // numbers rather than making the page filter a list to find out.
    const now = new Date();
    out.openTasks = await prisma.task.count({ where: { ...where, status: { not: 'Completed' } } });
    out.overdueTasks = await prisma.task.count({
      where: { ...where, status: { not: 'Completed' }, dueDate: { lt: now } },
    });

    res.status(200).json(out);
  } catch (error) {
    sendError(res, error, 'Could not count those records', 500);
  }
};

/* ---------------------------------------------------------------------------
   Documents: the file itself. The generic endpoints above edit a document's
   name and category; these two move its bytes, through utils/storage.js (disk
   or S3). Same access rule as every other sub-record.
   --------------------------------------------------------------------------- */

const crypto = require('crypto');
const storage = require('../utils/storage');

const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-excel)|text\/plain|text\/csv)$/;

/** POST /api/records/:entityType/:entityId/documents/upload { fileName, category?, dataUrl } */
exports.uploadDocument = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    if (!isEntityType(entityType) || !(await parentExists(entityType, entityId))
      || !(await mayReachParent(req.user, entityType, entityId, 'edit'))) {
      return res.status(404).json({ message: 'That record does not exist' });
    }
    const { fileName, category, dataUrl } = req.body || {};
    const match = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || '').trim());
    if (!fileName || !match) return res.status(400).json({ message: 'Choose a file to upload.' });
    if (!DOC_TYPES.test(match[1])) return res.status(400).json({ message: 'That file type is not allowed. Use PDF, an image, Word, Excel, CSV or text.' });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return res.status(400).json({ message: 'The file is empty.' });
    if (buffer.length > DOC_MAX_BYTES) return res.status(400).json({ message: 'Files must be under 10MB.' });

    const storedName = `${req.companyId}/documents/${crypto.randomUUID()}`;
    await storage.put(storedName, buffer, match[1]);
    const doc = await prisma.document.create({
      data: {
        entityType, entityId,
        fileName: String(fileName).slice(0, 200),
        storedName,
        mimeType: match[1],
        size: buffer.length,
        category: category || 'Other',
        uploadedBy: req.user.username,
      },
    });
    res.status(201).json(doc);
  } catch (error) {
    sendError(res, error, 'Could not upload the file', 400);
  }
};

/** GET /api/documents/:id/download — the file, after the same access check. */
exports.downloadDocument = async (req, res) => {
  try {
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc || !(await mayReachParent(req.user, doc.entityType, doc.entityId, 'view'))) {
      return res.status(404).json({ message: 'File not found' });
    }
    await storage.send(res, doc.storedName, {
      contentType: doc.mimeType, fileName: doc.fileName, inline: req.query.inline === '1',
    });
  } catch (error) {
    sendError(res, error, 'Could not download the file', 500);
  }
};
