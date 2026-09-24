const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * Departments.
 *
 * The user row always had dept_id, but the string pointed at nothing — there
 * was no table and no screen, so every department was free text typed from
 * memory. This gives the User 360 organization tab a real list to pick from
 * without touching how users are stored.
 *
 * Routes are admin-gated in departmentRoutes.js; reads stay open to any
 * signed-in user because dropdowns across the CRM need them.
 */

exports.list = async (req, res) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    res.status(200).json(departments);
  } catch (error) {
    sendError(res, error, 'Error fetching departments', 500);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description, head } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Department name is required.' });
    }
    const department = await prisma.department.create({
      data: { name: String(name).trim(), description: description || null, head: head || null },
    });
    res.status(201).json(department);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'A department with that name already exists.' });
    sendError(res, error, 'Error creating department', 400);
  }
};

exports.update = async (req, res) => {
  try {
    const { name, description, head } = req.body;
    const department = await prisma.department.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(head !== undefined ? { head: head || null } : {}),
      },
    });
    res.status(200).json(department);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Department not found.' });
    if (error.code === 'P2002') return res.status(409).json({ message: 'A department with that name already exists.' });
    sendError(res, error, 'Error updating department', 400);
  }
};

exports.remove = async (req, res) => {
  try {
    const inUse = await prisma.user.count({ where: { dept_id: req.params.id } });
    if (inUse > 0) {
      return res.status(409).json({ message: `${inUse} user(s) still belong to this department. Move them first.` });
    }
    await prisma.department.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Department deleted.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Department not found.' });
    sendError(res, error, 'Error deleting department', 400);
  }
};
