const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { coerceEmails } = require('../utils/email');
const { validatePhone } = require('../utils/phone');

// Indian mobile validation (same logic as leadController)

const FIELD_LABELS = {
  typeOfChannelPartner: 'Type Of Channel Partner',
  companyName: 'Company Name',
  ownerName: "Owner/Partner's Name",
  mobileNumber: 'Mobile Number',
  officeLandline: 'Office Landline Number',
  emailAddress: 'Email Address',
  companyRegistrationNumber: 'Company Registration Number',
  registeredAddress: 'Registered Address',
  communicationAddress: 'Communication Address',
  message: 'Message',
  websiteUrl: 'Website URL',
  aadhaarNumber: 'Aadhaar Number',
  panOfCompany: 'PAN of the Company',
  gstRegistrationNumber: 'GST Registration Number',
  reraRegistrationNumber: 'RERA Registration Number',
  uploadAadhaarCopy: 'Aadhaar Copy',
  uploadPanCopy: 'PAN Copy',
  uploadGstCopy: 'GST Copy',
  uploadReraCopy: 'RERA Copy',
  beneficiaryBankName: 'Beneficiary Bank Name',
  beneficiaryName: 'Beneficiary Name',
  bankAccountNumber: 'Bank Account No.',
  ifscCode: 'IFSC code',
  leadOwner: 'Lead Owner Changed'
};

exports.createChannelPartner = async (req, res) => {
  try {
    const { accountDetails, createdBy, ...rest } = req.body;

    const badEmail = coerceEmails(rest, [['emailAddress', 'Email address']], true);
    if (badEmail) return res.status(400).json({ message: badEmail });
    
    const dataToSave = {
      ...rest,
      beneficiaryBankName: accountDetails?.beneficiaryBankName || req.body.beneficiaryBankName || null,
      beneficiaryName: accountDetails?.beneficiaryName || req.body.beneficiaryName || null,
      bankAccountNumber: accountDetails?.bankAccountNumber || req.body.bankAccountNumber || null,
      ifscCode: accountDetails?.ifscCode || req.body.ifscCode || null,
      logs: {
        create: {
          title: 'Channelpartners Created',
          subtitle: `by ${createdBy || 'admin'}`
        }
      }
    };

    // Validate mobileNumber
    if (dataToSave.mobileNumber) {
      try {
        dataToSave.mobileNumber = validatePhone(dataToSave.mobileNumber, dataToSave.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const cp = await prisma.channelPartner.create({
      data: dataToSave,
      include: {
        logs: {
          orderBy: { date: 'desc' }
        }
      }
    });
    res.status(201).json(cp);
  } catch (error) {
    console.error('Error creating channel partner:', error);
    sendError(res, error, 'Failed to create channel partner', 500);
  }
};

exports.getChannelPartners = async (req, res) => {
  try {
    const cps = await prisma.channelPartner.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        logs: {
          orderBy: { date: 'desc' }
        }
      }
    });
    res.status(200).json(cps);
  } catch (error) {
    sendError(res, error, 'Failed to fetch channel partners', 500);
  }
};

exports.getChannelPartnerById = async (req, res) => {
  try {
    const cp = await prisma.channelPartner.findUnique({
      where: { id: req.params.id },
      include: {
        logs: {
          orderBy: { date: 'desc' }
        }
      }
    });
    if (!cp) return res.status(404).json({ message: 'Not found' });
    res.status(200).json(cp);
  } catch (error) {
    sendError(res, error, 'Failed to fetch', 500);
  }
};

exports.updateChannelPartner = async (req, res) => {
  try {
    const { accountDetails, updatedBy, ...rest } = req.body;
    const existingCp = await prisma.channelPartner.findUnique({ where: { id: req.params.id } });
    if (!existingCp) return res.status(404).json({ message: 'Not found' });

    const dataToUpdate = { ...rest };

    const badEmail = coerceEmails(dataToUpdate, [['emailAddress', 'Email address']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // Validate mobileNumber if being updated
    if (dataToUpdate.mobileNumber !== undefined && dataToUpdate.mobileNumber !== null && dataToUpdate.mobileNumber !== '') {
      try {
        dataToUpdate.mobileNumber = validatePhone(dataToUpdate.mobileNumber, dataToUpdate.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    if (accountDetails) {
      if (accountDetails.beneficiaryBankName !== undefined) dataToUpdate.beneficiaryBankName = accountDetails.beneficiaryBankName;
      if (accountDetails.beneficiaryName !== undefined) dataToUpdate.beneficiaryName = accountDetails.beneficiaryName;
      if (accountDetails.bankAccountNumber !== undefined) dataToUpdate.bankAccountNumber = accountDetails.bankAccountNumber;
      if (accountDetails.ifscCode !== undefined) dataToUpdate.ifscCode = accountDetails.ifscCode;
    }

    // Filter out fields whose values haven't changed from existingCp
    const changedFieldKeys = Object.keys(dataToUpdate).filter(k => {
      const oldVal = existingCp[k] ?? '';
      const newVal = dataToUpdate[k] ?? '';
      return String(oldVal).trim() !== String(newVal).trim();
    });

    // If no values actually changed, return current record without creating a log entry
    if (changedFieldKeys.length === 0) {
      const currentCp = await prisma.channelPartner.findUnique({
        where: { id: req.params.id },
        include: { logs: { orderBy: { date: 'desc' } } }
      });
      return res.status(200).json(currentCp);
    }

    let logTitle = 'Channelpartner Updated';
    if (changedFieldKeys.length === 1) {
      const k = changedFieldKeys[0];
      const label = FIELD_LABELS[k] || k;
      const val = dataToUpdate[k];
      logTitle = `${label} updated to "${val || 'empty'}"`;
    } else if (changedFieldKeys.length > 1) {
      const labels = changedFieldKeys.map(k => FIELD_LABELS[k] || k);
      logTitle = `Updated ${labels.join(', ')}`;
    }

    const editor = updatedBy || 'admin';
    const logSubtitle = `by ${editor}`;

    const cp = await prisma.channelPartner.update({
      where: { id: req.params.id },
      data: {
        ...dataToUpdate,
        logs: {
          create: {
            title: logTitle,
            subtitle: logSubtitle
          }
        }
      },
      include: {
        logs: {
          orderBy: { date: 'desc' }
        }
      }
    });

    res.status(200).json(cp);
  } catch (error) {
    console.error('Error updating channel partner:', error);
    sendError(res, error, 'Failed to update', 500);
  }
};

exports.deleteChannelPartner = async (req, res) => {
  try {
    await prisma.channelPartner.delete({ where: { id: req.params.id } });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Failed to delete', 500);
  }
};