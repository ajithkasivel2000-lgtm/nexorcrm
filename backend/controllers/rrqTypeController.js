const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { isReservedRrqType } = require('../utils/rrqTypes');

exports.getTypes = async (req, res) => {
    try {
        const types = await prisma.rRQType.findMany({ orderBy: { typeName: 'asc' } });
        res.status(200).json(types);
    } catch (error) {
        sendError(res, error, 'Error fetching RRQ types', 500);
    }
};

exports.createType = async (req, res) => {
    try {
        const { typeName } = req.body;
        if (!typeName || !typeName.trim()) {
            return res.status(400).json({ message: 'typeName is required' });
        }
        const type = await prisma.rRQType.create({ data: { typeName: typeName.trim() } });
        res.status(201).json(type);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'RRQ Type already exists' });
        }
        sendError(res, error, 'Error creating RRQ type', 400);
    }
};

exports.deleteType = async (req, res) => {
    try {
        const type = await prisma.rRQType.findUnique({ where: { id: req.params.id } });
        if (!type) return res.status(404).json({ message: 'RRQ type not found' });

        // Lead routing matches these by name, so removing one would quietly
        // stop new leads being assigned rather than fail in any visible way.
        if (isReservedRrqType(type.typeName)) {
            return res.status(409).json({
                message: `"${type.typeName}" is used to route incoming leads and cannot be deleted.`,
            });
        }

        await prisma.rRQType.delete({ where: { id: req.params.id } });
        res.status(200).json({ message: 'Deleted successfully' });
    } catch (error) {
        sendError(res, error, 'Error deleting RRQ type', 500);
    }
};
