const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * A queue whose project name matches no project assigns nobody.
 *
 * Lead assignment looks a queue up by `{ projectName, rrqType }` — a string
 * match, not a foreign key. A name that matches nothing is not an error
 * anywhere: the lookup just returns null, the round-robin block is skipped,
 * and new leads quietly stay with whoever entered them. That is a failure you
 * only notice weeks later by counting whose list is full.
 *
 * So a queue saved against a name no project has is refused, and every queue
 * read back says whether its project still exists.
 */
async function projectExists(projectName) {
  if (!projectName) return false;
  const hit = await prisma.project.findFirst({
    where: { projectName: String(projectName) },
    select: { id: true },
  });
  return Boolean(hit);
}

/** The names on offer, so the message can say what the caller meant instead. */
async function projectNames() {
  const rows = await prisma.project.findMany({ select: { projectName: true }, orderBy: { projectName: 'asc' } });
  return rows.map((r) => r.projectName);
}

exports.createRRQ = async (req, res) => {
  try {
    if (req.body?.projectName && !(await projectExists(req.body.projectName))) {
      return res.status(400).json({
        message: `No project is called "${req.body.projectName}", so this queue would never assign anyone.`,
        projects: await projectNames(),
      });
    }
    const rrq = await prisma.rRQ.create({ data: { ...req.body } });
    return res.status(201).json(rrq);
  } catch (error) {
    return sendError(res, error, 'Failed to create RRQ', 500);
  }
};

exports.getRRQs = async (req, res) => {
  try {
    const rrqs = await prisma.rRQ.findMany({ orderBy: { createdAt: 'desc' } });

    /* One read of the project list, then a flag per queue — so the screen can
       show an orphaned queue as broken rather than looking perfectly fine. */
    const names = new Set(await projectNames());
    return res.status(200).json(rrqs.map((r) => ({
      ...r,
      projectMissing: !names.has(r.projectName),
    })));
  } catch (error) {
    return sendError(res, error, 'Failed to fetch RRQs', 500);
  }
};

exports.updateRRQ = async (req, res) => {
  try {
    if (req.body?.projectName && !(await projectExists(req.body.projectName))) {
      return res.status(400).json({
        message: `No project is called "${req.body.projectName}", so this queue would never assign anyone.`,
        projects: await projectNames(),
      });
    }
    const rrq = await prisma.rRQ.update({ where: { id: req.params.id }, data: req.body });
    return res.status(200).json(rrq);
  } catch (error) {
    return sendError(res, error, 'Failed to update', 500);
  }
};

/**
 * Which queues are broken, and which projects have none.
 *
 * Read-only. Exists so the answer to "is round-robin actually working?" is one
 * request rather than a database session.
 */
exports.health = async (req, res) => {
  try {
    const [rrqs, projects] = await Promise.all([
      prisma.rRQ.findMany(),
      prisma.project.findMany({ select: { projectName: true } }),
    ]);
    const names = new Set(projects.map((p) => p.projectName));
    const queued = new Set(rrqs.map((r) => r.projectName));

    const orphaned = rrqs
      .filter((r) => !names.has(r.projectName))
      .map((r) => ({ rrqId: r.rrqId, projectName: r.projectName, rrqType: r.rrqType }));

    const unqueued = projects
      .map((p) => p.projectName)
      .filter((n) => !queued.has(n));

    return res.status(200).json({
      healthy: orphaned.length === 0,
      orphanedQueues: orphaned,
      projectsWithoutQueue: unqueued,
      // Said plainly, because this is the thing people actually want to know.
      summary: orphaned.length
        ? `${orphaned.length} queue(s) point at a project that does not exist; leads for them stay with whoever created them.`
        : 'Every queue points at a real project.',
    });
  } catch (error) {
    return sendError(res, error, 'Failed to check RRQ health', 500);
  }
};

exports.deleteRRQ = async (req, res) => {
  try {
    await prisma.rRQ.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Failed to delete', 500);
  }
};