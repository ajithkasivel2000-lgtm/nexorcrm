const prisma = require('../prismaClient');

exports.getUserGroups = async (req, res) => {
  try {
    const groups = await prisma.userGroup.findMany({
      include: { members: { select: { id: true, username: true } } },
      orderBy: { groupLevel: 'asc' }
    });
    res.status(200).json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error: error.message });
  }
};

exports.createUserGroup = async (req, res) => {
  try {
    const { groupName, groupLevel } = req.body;
    const group = await prisma.userGroup.create({ data: { groupName, groupLevel } });
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error creating group', error: error.message });
  }
};

exports.updateUserGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, groupLevel } = req.body;
    const group = await prisma.userGroup.update({ where: { id }, data: { groupName, groupLevel } });
    res.status(200).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error updating group', error: error.message });
  }
};

exports.deleteUserGroup = async (req, res) => {
  try {
    await prisma.userGroup.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting group', error: error.message });
  }
};

exports.addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const group = await prisma.userGroup.update({
      where: { id },
      data: { members: { connect: { id: userId } } },
      include: { members: true }
    });
    res.status(200).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error adding member', error: error.message });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const group = await prisma.userGroup.update({
      where: { id },
      data: { members: { disconnect: { id: userId } } },
      include: { members: true }
    });
    res.status(200).json(group);
  } catch (error) {
    res.status(400).json({ message: 'Error removing member', error: error.message });
  }
};