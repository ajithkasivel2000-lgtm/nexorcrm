const prisma = require('../prismaClient');
const { summariseProject } = require('../utils/projectSummary');
const { deleteEntityRecords } = require('../utils/entityRecords');
const { coerceDates } = require('../utils/coerceDates');

/** Every DateTime column on Project. A string from a date input needs coercing. */
const PROJECT_DATES = [
  'reraDate', 'launchDate', 'constructionStart', 'expectedCompletion',
  'actualCompletion', 'salesStartDate', 'archivedAt',
];

/** Field names as a person reads them in the audit trail. */
const FIELD_LABELS = {
  projectName: 'Project Name', projectCode: 'Project Code', projectStatus: 'Status',
  projectType: 'Type', category: 'Category', city: 'City', startingPrice: 'Starting Price',
  pricePerSqft: 'Price per sq ft', projectManager: 'Project Manager', salesManager: 'Sales Manager',
  reraNumber: 'RERA Number', expectedCompletion: 'Expected Completion',
  constructionProgress: 'Construction Progress', salesStatus: 'Sales Status',
};

/** Columns nobody needs an audit line about. */
const NOT_AUDITED = new Set(['id', 'createdAt', 'updatedAt', 'createdBy', 'logEntry', 'username']);

/** How a value reads in the log. */
const shown = (v) => {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};
const { sendError } = require('../utils/apiError');

exports.getProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.status(200).json(projects);
  } catch (error) {
    sendError(res, error, 'Error fetching projects', 500);
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.status(200).json(project);
  } catch (error) {
    sendError(res, error, 'Error fetching project', 500);
  }
};

exports.createProject = async (req, res) => {
  try {
    
    const project = await prisma.project.create({ data: { ...req.body } });
    res.status(201).json(project);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'A project with this name already exists' });
    }
    sendError(res, error, 'Error creating project', 400);
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { logEntry, ...updateData } = req.body;

    // A date input sends a string; Prisma rejects it with a message that names
    // no field, so every save carrying a date would fail mysteriously.
    const badDate = coerceDates(updateData, PROJECT_DATES);
    if (badDate) return res.status(400).json({ message: badDate });

    /* Read before writing: an audit line needs the value about to be replaced,
       and it is gone once the update runs. */
    const before = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ message: 'Project not found' });

    const actor = req.user?.username || req.headers['x-username'] || null;

    const statusMoved = 'projectStatus' in updateData
      && updateData.projectStatus !== before.projectStatus;

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: updateData,
    });

    /* Round-robin queues find their project by name, not by id — so renaming a
       project used to orphan its queue silently: the lookup in createLead
       simply stopped matching, no error was raised anywhere, and every new
       lead quietly stayed with whoever entered it instead of going to the
       rota. Renaming the project renames its queues in the same request. */
    if (before.projectName && project.projectName !== before.projectName) {
      try {
        const moved = await prisma.rRQ.updateMany({
          where: { projectName: before.projectName },
          data: { projectName: project.projectName },
        });
        if (moved.count > 0) {
          console.log(`[rrq] moved ${moved.count} queue(s) from "${before.projectName}" `
            + `to "${project.projectName}"`);
        }
      } catch (error) {
        // The rename itself has already succeeded; say so loudly and carry on.
        console.error('Could not move the round-robin queues with the renamed project:',
          error.message);
      }
    }

    /* One audit row per field that actually moved, written after the save so a
       failed update leaves no trail claiming it happened. */
    const changes = Object.keys(updateData)
      .filter((k) => !NOT_AUDITED.has(k))
      .filter((k) => k in before)
      .filter((k) => shown(before[k]) !== shown(updateData[k]))
      .map((k) => ({
        entityType: 'project',
        entityId: project.id,
        type: 'Field Change',
        subject: `${FIELD_LABELS[k] || k} updated`,
        description: `${shown(before[k])} → ${shown(updateData[k])}`,
        createdBy: actor,
      }));

    if (changes.length) {
      await prisma.activity.createMany({ data: changes })
        .catch((e) => console.error('Could not record the project changes:', e.message));
    }

    if (statusMoved) {
      await prisma.stageHistory.create({
        data: {
          entityType: 'project',
          entityId: project.id,
          fromStage: before.projectStatus || null,
          toStage: project.projectStatus,
          changedBy: actor,
        },
      }).catch((e) => console.error('Could not record the project status move:', e.message));
    }

    res.status(200).json(project);
  } catch (error) {
    sendError(res, error, 'Failed to update project', 500);
  }
};

/**
 * The counted view of a project: sub-record totals, CRM figures, progress.
 *
 * Nothing here is stored, and nothing is invented — where there is nothing to
 * count the field is null so the page can say "not tracked yet" rather than
 * showing a zero that means something else.
 */
exports.getProjectSummary = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ message: 'Project not found' });
    res.status(200).json(await summariseProject(project));
  } catch (error) {
    sendError(res, error, 'Could not summarise that project', 500);
  }
};

exports.deleteProject = async (req, res) => {
  try {
    /* Sub-records and the parent go in one transaction — same shape as the
       lead delete, for the same reason. */
    await prisma.$transaction(async (tx) => {
      await deleteEntityRecords('project', req.params.id, tx);
      await tx.project.delete({ where: { id: req.params.id } });
    });
    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Project not found' });
    }
    sendError(res, error, 'Error deleting project', 500);
  }
};