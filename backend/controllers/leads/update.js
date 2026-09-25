/* Changing leads: status moves, field edits, full updates, deletion. */
const prisma = require('../../prismaClient');
const { sendError } = require('../../utils/apiError');
const { deleteEntityRecords } = require('../../utils/entityRecords');
const { recordStageMove } = require('../../utils/leadStages');
const { coerceEmails } = require('../../utils/email');
const { validatePhone } = require('../../utils/phone');
const { copyFields } = require('../../utils/mailRecipients');
const { startAssignmentTimer, recordLeadActivity, cancelPendingFor, isTerminalStatus } = require('../../utils/leadAssignment');
const { syncSiteVisitFromLead } = require('../../utils/siteVisitSync');
const { sendMail } = require('../../utils/mailer');
const { coerceLeadDates, buildLeadChangeLogs, resolveUser, syncOwnerId, pickLeadFields } = require('./helpers');

exports.updateLeadStatus = async (req, res) => {
  try {
    // Fetch lead before update to get owner/project info for potential email
    const currentLead = await prisma.lead.findUnique({
      where: { id: req.params.id }
    });

    if (!currentLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const isSiteVisitUpdate = !!(req.body.siteVisitDate || (req.body.siteVisitStatus && req.body.siteVisitStatus !== 'Opportunity') || req.body.status === 'Site Visit');

    // Only the fields a client may set survive. Spreading req.body used to
    // let a payload write any column — id, createdAt, allocator, lastActivityAt
    // — and the whitelist is the one place that stops it (see pickLeadFields).
    let updateData = pickLeadFields(req.body);
    let logEntryData = null;

    // Validate mobile if being updated
    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      try {
        updateData.mobile = validatePhone(updateData.mobile, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const dateError = coerceLeadDates(updateData);
    if (dateError) return res.status(400).json({ message: dateError });

    const badEmail = coerceEmails(updateData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // Who is making the change: the verified session user, not a body field a
    // caller could set to anyone. The old `username`/`changedBy` body keys are
    // dropped by the whitelist above.
    const actor = req.user?.username || 'system'; // identity is the session, never a header

    if (req.body.status || req.body.logEntry) {
      // The log said "by admin" whoever did it, which made it useless for the
      // one question it exists to answer.
      const from = currentLead.status || '(none)';
      logEntryData = {
        title: req.body.logEntry?.title || 'Lead Status Updated',
        subtitle: req.body.logEntry?.subtitle
          || `${from} → ${req.body.status} by ${actor}`,
      }
    }

    // Reassignment writes `owner`; `ownerId` mirrors it and is what list
    // visibility, the dashboard and notifications actually read.
    const handover = await syncOwnerId(updateData, currentLead, actor);

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(logEntryData && {
          logs: {
            create: logEntryData
          }
        })
      },
      include: { logs: true }
    });

    // Resolve IDs to display names for the response
    let displayOwnerName = updatedLead.owner;
    if (updatedLead.ownerId || updatedLead.owner) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: updatedLead.ownerId || updatedLead.owner },
            { username: updatedLead.owner }
          ]
        }
      });
      if (user) displayOwnerName = user.username || user.firstName || updatedLead.owner;
    }

    let displayProjectName = updatedLead.project;
    if (updatedLead.project) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: updatedLead.project }, { projectName: updatedLead.project }] }
      });
      if (project) displayProjectName = project.projectName;
    }

    const leadWithResolvedNames = {
      ...updatedLead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName
    };

    /* The funnel move, once the save has succeeded. Written only when the
       derived stage actually changed — two statuses can share one stage, and a
       timeline full of moves that went nowhere is worse than none. */
    if ('status' in updateData) {
      await recordStageMove(prisma, {
        entityId: updatedLead.id,
        fromStatus: currentLead.status,
        toStatus: updatedLead.status,
        actor: actor,
      });
    }

    res.status(200).json(leadWithResolvedNames);

    /* A lead passed to a colleague is news to them — the same news as a new
       lead, on the same three channels. Without it the lead just appears in
       their list with nothing to say it arrived. After the response, as
       above: the reassignment is saved whether or not the word got out.

       The follow-up clock is settled here too, in the one place that knows
       what the save actually was: a handover opens a fresh window for the new
       owner, a terminal status stops the clock for good, and anything else the
       owner does is the response that cancels their pending move. */
    setImmediate(async () => {
      try {
        if (isTerminalStatus(updatedLead.status)) {
          await cancelPendingFor(updatedLead.id, `lead is ${updatedLead.status}`);
          return;
        }

        if (handover) {
          /* The new owner gets a full window rather than what was left of the
             previous one, and is told once — by the timer, not by a separate
             notify, so there is one announcement per assignment. */
          await startAssignmentTimer(updatedLead, {
            ownerId: updatedLead.ownerId || updatedLead.owner,
            ownerName: displayOwnerName,
            fromName: handover.from,
            source: 'manual',
            reason: `assigned by ${handover.by}`,
            notify: true,
            notifyContext: {
              ownerName: displayOwnerName,
              projectName: displayProjectName,
              creator: actor,
              handover,
            },
          });
          return;
        }

        await recordLeadActivity(updatedLead.id, {
          actorId: actor,
          actorName: actor,
          kind: 'update',
        });
      } catch (error) {
        console.error('Could not settle the lead follow-up clock:', error.message);
      }
    });

    // Send opportunity conversion notification email (non-blocking - sent after response)
    const isOpportunityUpdate = !!(req.body.status === 'Opportunity' || req.body.siteVisitStatus === 'Opportunity');

    if (isOpportunityUpdate) {
      setImmediate(async () => {
        try {
          const mailSettings = await prisma.mailSetting.findFirst();
          if (mailSettings && mailSettings.smtpHost && mailSettings.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { templateKey: 'LEAD_CONVERTED_TO_OPPORTUNITY_TEMPLATE', status: true }
            });

            if (emailTemplate) {
              // Find the opportunity created for this lead
              const opportunity = await prisma.opportunity.findFirst({
                where: { leadId: req.params.id },
                orderBy: { createdAt: 'desc' }
              });

              // Resolve owner info
              let displayOwnerName = currentLead.owner;
              if (currentLead.ownerId || currentLead.owner) {
                const user = await prisma.user.findFirst({
                  where: {
                    OR: [
                      { id: currentLead.ownerId || currentLead.owner },
                      { username: currentLead.owner }
                    ]
                  }
                });
                if (user) displayOwnerName = user.username || user.firstName || currentLead.owner;
              }

              // Resolve project name
              let displayProjectName = currentLead.project;
              if (currentLead.project) {
                const project = await prisma.project.findFirst({
                  where: { OR: [{ id: currentLead.project }, { projectName: currentLead.project }] }
                });
                if (project) displayProjectName = project.projectName;
              }

              // Find the owner's email address
              const ownerUser = await prisma.user.findFirst({
                where: {
                  OR: [
                    { id: currentLead.ownerId || currentLead.owner },
                    { username: currentLead.owner }
                  ]
                }
              });

              if (ownerUser && ownerUser.email) {
                const replacements = {
                  '{OWNER_NAME}': displayOwnerName || currentLead.owner || '',
                  '{OPPORTUNITY_ID}': opportunity?.oppId || '',
                  '{Leads_ID}': currentLead.id || '',
                  // Older name, still what the saved templates use. See utils/leadNotify.js.
                  '{ENQUIRY_ID}': currentLead.id || '',
                  '{CUSTOMER_NAME}': currentLead.name || '',
                  '{COMPANY_NAME}': '',
                  '{PROJECT_NAME}': displayProjectName || currentLead.project || ''
                };

                let subject = emailTemplate.subject || 'Lead Converted to Opportunity';
                let htmlBody = emailTemplate.bodyContent || '';

                for (const [key, value] of Object.entries(replacements)) {
                  subject = subject.split(key).join(value);
                  htmlBody = htmlBody.split(key).join(value);
                }

                if (!htmlBody.trim()) {
                  htmlBody = `
                    <div style="font-family: Arial, sans-serif; padding: 20px;">
                      <h2>Lead Converted to Opportunity</h2>
                      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Opportunity ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${opportunity?.oppId || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Leads ID</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.id}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Customer</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${currentLead.name}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Project</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayProjectName || currentLead.project || 'N/A'}</td></tr>
                        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Assigned To</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${displayOwnerName}</td></tr>
                      </table>
                      <hr />
                      <p style="color: #666; font-size: 12px;">Sent via NexorCRM Lead Management System</p>
                    </div>
                  `;
                }

                // Wrap body in div to preserve line breaks from plain text templates
                htmlBody = `<div style="white-space: pre-line; font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">${htmlBody}</div>`;

                // The standing CC/BCC from Mail Settings, minus anyone
                // already on the To line; queued for retry if SMTP is down.
                const { fields } = copyFields(mailSettings, ownerUser.email);
                await sendMail({
                  to: ownerUser.email,
                  cc: fields.cc,
                  bcc: fields.bcc,
                  subject,
                  html: htmlBody,
                  category: 'opportunity-notify',
                });

                console.log(`Opportunity notification email sent to ${ownerUser.email} for lead ${currentLead.id}`);
              }
            }
          }
        } catch (emailError) {
          console.error('Failed to send opportunity notification email:', emailError.message);
        }
      });
    }

    // Send site visit notification email (non-blocking - sent after response)
    /* A site visit saved from the lead screen now drives the visit record
       itself, which is what sends the internal push, the customer email and
       the reminders, and what records who was told. It replaces the single
       owner-only email that used to live here rather than running alongside
       it — two code paths announcing the same booking is how people get the
       same mail twice. The old email is not lost: the same
       SITE_VISIT_SCHEDULED_TEMPLATE still addresses the internal audience,
       and the customer gets their own, safe version. */
    if (isSiteVisitUpdate) {
      setImmediate(async () => {
        try {
          await syncSiteVisitFromLead(updatedLead, { body: req.body, actor });
        } catch (visitError) {
          console.error('Failed to sync the site visit:', visitError.message);
        }
      });
    }
  } catch (error) {
    sendError(res, error, 'Failed to update lead', 500);
  }
};

exports.updateLeadFields = async (req, res) => {
  try {
    // Whitelist first, so logEntry (a control field, not a column) and any
    // crafted key are dropped together; see pickLeadFields.
    const updateData = pickLeadFields(req.body);

    // Validate mobile if being updated
    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      try {
        updateData.mobile = validatePhone(updateData.mobile, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    if (updateData.alternateNo !== undefined && updateData.alternateNo !== null && updateData.alternateNo !== '') {
      try {
        updateData.alternateNo = validatePhone(updateData.alternateNo, updateData.alternateNoCountryCode, true);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const dateError = coerceLeadDates(updateData);
    if (dateError) return res.status(400).json({ message: dateError });

    const badEmail = coerceEmails(updateData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // The log records what changed, so the previous values have to be read
    // before the write.
    const existingLead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existingLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // The owner is stored as a user id; show usernames in the log instead.
    const ownerLabels = {};
    if ('owner' in updateData) {
      for (const value of [existingLead.owner, updateData.owner]) {
        if (!value || ownerLabels[`owner:${value}`]) continue;
        const user = await resolveUser(value);
        if (user) ownerLabels[`owner:${value}`] = user.username || user.firstName || String(value);
      }
    }

    const actor = req.user?.username || null;
    const changeLogs = buildLeadChangeLogs(existingLead, updateData, actor, ownerLabels);

    // Reassignment writes `owner`; `ownerId` mirrors it and is what list
    // visibility, the dashboard and notifications actually read.
    const handover = await syncOwnerId(updateData, existingLead, actor);

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(changeLogs.length > 0 && { logs: { create: changeLogs } })
      },
      include: { logs: true }
    });

    // Resolve IDs to display names for the response
    let displayOwnerName = updatedLead.owner;
    if (updatedLead.ownerId || updatedLead.owner) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: updatedLead.ownerId || updatedLead.owner },
            { username: updatedLead.owner }
          ]
        }
      });
      if (user) displayOwnerName = user.username || user.firstName || updatedLead.owner;
    }

    let displayProjectName = updatedLead.project;
    if (updatedLead.project) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: updatedLead.project }, { projectName: updatedLead.project }] }
      });
      if (project) displayProjectName = project.projectName;
    }

    const leadWithResolvedNames = {
      ...updatedLead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName
    };

    /* The funnel move, once the save has succeeded. Written only when the
       derived stage actually changed — two statuses can share one stage, and a
       timeline full of moves that went nowhere is worse than none. */
    if ('status' in updateData) {
      await recordStageMove(prisma, {
        entityId: updatedLead.id,
        fromStatus: existingLead.status,
        toStatus: updatedLead.status,
        actor: actor,
      });
    }

    res.status(200).json(leadWithResolvedNames);

    /* A lead passed to a colleague is news to them — the same news as a new
       lead, on the same three channels. Without it the lead just appears in
       their list with nothing to say it arrived. After the response, as
       above: the reassignment is saved whether or not the word got out.

       The follow-up clock is settled here too, in the one place that knows
       what the save actually was: a handover opens a fresh window for the new
       owner, a terminal status stops the clock for good, and anything else the
       owner does is the response that cancels their pending move. */
    setImmediate(async () => {
      try {
        if (isTerminalStatus(updatedLead.status)) {
          await cancelPendingFor(updatedLead.id, `lead is ${updatedLead.status}`);
          return;
        }

        if (handover) {
          /* The new owner gets a full window rather than what was left of the
             previous one, and is told once — by the timer, not by a separate
             notify, so there is one announcement per assignment. */
          await startAssignmentTimer(updatedLead, {
            ownerId: updatedLead.ownerId || updatedLead.owner,
            ownerName: displayOwnerName,
            fromName: handover.from,
            source: 'manual',
            reason: `assigned by ${handover.by}`,
            notify: true,
            notifyContext: {
              ownerName: displayOwnerName,
              projectName: displayProjectName,
              creator: actor,
              handover,
            },
          });
          return;
        }

        await recordLeadActivity(updatedLead.id, {
          actorId: actor,
          actorName: actor,
          kind: 'update',
        });
      } catch (error) {
        console.error('Could not settle the lead follow-up clock:', error.message);
      }
    });
  } catch (error) {
    sendError(res, error, 'Failed to update lead', 500);
  }
};

exports.updateLead = async (req, res) => {
  try {
    // Whitelist first, so logEntry (a control field, not a column) and any
    // crafted key are dropped together; see pickLeadFields.
    const updateData = pickLeadFields(req.body);

    // Validate mobile if being updated
    if (updateData.mobile !== undefined && updateData.mobile !== null && updateData.mobile !== '') {
      try {
        updateData.mobile = validatePhone(updateData.mobile, updateData.mobileCountryCode);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    if (updateData.alternateNo !== undefined && updateData.alternateNo !== null && updateData.alternateNo !== '') {
      try {
        updateData.alternateNo = validatePhone(updateData.alternateNo, updateData.alternateNoCountryCode, true);
      } catch (mobileErr) {
        return res.status(400).json({ message: mobileErr.message });
      }
    }

    const dateError = coerceLeadDates(updateData);
    if (dateError) return res.status(400).json({ message: dateError });

    const badEmail = coerceEmails(updateData, [['email', 'Email'], ['alternateEmail', 'Alternate Email']]);
    if (badEmail) return res.status(400).json({ message: badEmail });

    // Reassignment writes `owner`; `ownerId` mirrors it and is what list
    // visibility, the dashboard and notifications actually read. The previous
    // record and the actor tell a real handover from a re-save of the same owner.
    const existingForOwner = 'owner' in updateData
      ? await prisma.lead.findUnique({ where: { id: req.params.id } })
      : null;
    const actorForOwner = req.user?.username || 'system';

    const handover = await syncOwnerId(updateData, existingForOwner, actorForOwner);

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        // logEntry is a control field, not a column, so the whitelist dropped
        // it — read it from the original request body, where LeadStatusCell
        // and the profile's modals send it.
        ...(req.body.logEntry && {
          logs: {
            create: {
              title: req.body.logEntry.title || 'Lead Updated',
              subtitle: req.body.logEntry.subtitle || 'by admin'
            }
          }
        })
      },
      include: { logs: true }
    });

    // Resolve IDs to display names for the response
    let displayOwnerName = updatedLead.owner;
    if (updatedLead.ownerId || updatedLead.owner) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: updatedLead.ownerId || updatedLead.owner },
            { username: updatedLead.owner }
          ]
        }
      });
      if (user) displayOwnerName = user.username || user.firstName || updatedLead.owner;
    }

    let displayProjectName = updatedLead.project;
    if (updatedLead.project) {
      const project = await prisma.project.findFirst({
        where: { OR: [{ id: updatedLead.project }, { projectName: updatedLead.project }] }
      });
      if (project) displayProjectName = project.projectName;
    }

    const leadWithResolvedNames = {
      ...updatedLead,
      ownerName: displayOwnerName,
      owner: displayOwnerName,
      projectName: displayProjectName,
      project: displayProjectName
    };

    res.status(200).json(leadWithResolvedNames);

    /* A lead passed to a colleague is news to them — the same news as a new
       lead, on the same three channels. Without it the lead just appears in
       their list with nothing to say it arrived. After the response, as
       above: the reassignment is saved whether or not the word got out. */
    setImmediate(async () => {
      try {
        if (isTerminalStatus(updatedLead.status)) {
          await cancelPendingFor(updatedLead.id, `lead is ${updatedLead.status}`);
          return;
        }
        if (handover) {
          await startAssignmentTimer(updatedLead, {
            ownerId: updatedLead.ownerId || updatedLead.owner,
            ownerName: displayOwnerName,
            fromName: handover.from,
            source: 'manual',
            reason: `assigned by ${handover.by}`,
            notify: true,
            notifyContext: {
              ownerName: displayOwnerName,
              projectName: displayProjectName,
              creator: actorForOwner,
              handover,
            },
          });
          return;
        }
        await recordLeadActivity(updatedLead.id, {
          actorId: actorForOwner,
          actorName: actorForOwner,
          kind: 'update',
        });
      } catch (error) {
        console.error('Could not settle the lead follow-up clock:', error.message);
      }
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Lead not found' });
    }
    sendError(res, error, 'Failed to update lead', 500);
  }
};

exports.deleteLead = async (req, res) => {
  try {
    /* Sub-records and the parent go in one transaction: shared records point
       here by (entityType, entityId), which the database cannot cascade on, so
       two writes would otherwise leave a half-applied delete on a failure. */
    await prisma.$transaction(async (tx) => {
      await deleteEntityRecords('lead', req.params.id, tx);
      await tx.lead.delete({ where: { id: req.params.id } });
    });
    res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Lead not found' });
    }
    sendError(res, error, 'Failed to delete', 500);
  }
};

/* ---------------------------------------------------------------------------
   Public lead endpoints (no sign-in; the company comes from its public key —
   see middleware/companyKey.js). Both go through utils/leadIntake.js, the
   same path Facebook and Google leads take.
   --------------------------------------------------------------------------- */
