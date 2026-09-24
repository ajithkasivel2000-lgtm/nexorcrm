const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

exports.getUserGroups = async (req, res) => {
  try {
    const rawGroups = await prisma.userGroup.findMany({
      include: { userGroupMembers: { include: { user: { select: { id: true, username: true } } } } },
      orderBy: { groupLevel: 'asc' }
    });
    // Map to frontend-expected shape
    const groups = rawGroups.map(g => ({
      ...g,
      members: g.userGroupMembers.map(m => m.user),
      userGroupMembers: undefined
    }));
    res.status(200).json(groups);
  } catch (error) {
    sendError(res, error, 'Error fetching groups', 500);
  }
};

exports.createUserGroup = async (req, res) => {
  try {
    const { groupName, groupLevel } = req.body;
    const group = await prisma.userGroup.create({ data: { groupName, groupLevel } });
    res.status(201).json(group);
  } catch (error) {
    sendError(res, error, 'Error creating group', 400);
  }
};

exports.updateUserGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, groupLevel } = req.body;
    const group = await prisma.userGroup.update({ where: { id }, data: { groupName, groupLevel } });
    res.status(200).json(group);
  } catch (error) {
    sendError(res, error, 'Error updating group', 400);
  }
};

exports.deleteUserGroup = async (req, res) => {
  try {
    await prisma.userGroup.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting group', 500);
  }
};

exports.addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const rawGroup = await prisma.userGroup.update({
      where: { id },
      data: { userGroupMembers: { create: { userId } } },
      include: { userGroupMembers: { include: { user: true } } }
    });
    res.status(200).json({
      ...rawGroup,
      members: rawGroup.userGroupMembers.map(m => m.user),
      userGroupMembers: undefined
    });
  } catch (error) {
    sendError(res, error, 'Error adding member', 400);
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const rawGroup = await prisma.userGroup.update({
      where: { id },
      data: { userGroupMembers: { delete: { userId_groupId: { userId, groupId: id } } } },
      include: { userGroupMembers: { include: { user: true } } }
    });
    res.status(200).json({
      ...rawGroup,
      members: rawGroup.userGroupMembers.map(m => m.user),
      userGroupMembers: undefined
    });
  } catch (error) {
    if (error.code === 'P2025') {
      // Meaning relation doesn't exist anymore, treat as success or fetch current
      res.status(200).json({ message: 'Already removed' });
    } else {
      sendError(res, error, 'Error removing member', 400);
    }
  }
};