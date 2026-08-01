const prisma = require('./prismaClient');

async function main() {
  const templates = [
    {
      templateId: 'ET-2026-001',
      name: 'Create task',
      subject: 'New Task',
      templateKey: 'CREATE_TASK_TEMPLATE',
      type: 'Custom',
      status: true
    },
    {
      templateId: 'ET-2026-002',
      name: 'Lead Assigned to Customer Template',
      subject: 'SVL ERP - Lead Representative Assigned',
      templateKey: 'LEAD_ASSIGNED_CUSTOMER_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-003',
      name: 'Lead Status Updated Template',
      subject: 'Lead Status Updated (lead_id) - (lead_name)',
      templateKey: 'LEAD_STATUS_UPDATED_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-004',
      name: 'New Lead Assigned (To Employee)',
      subject: 'New Lead Assigned - (Lead Name)',
      templateKey: 'LEAD_ASSIGNED_EMPLOYEE_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-005',
      name: 'New Lead Created by Employee (To Reporting Person)',
      subject: 'New Lead Created by (Employee Name)',
      templateKey: 'LEAD_CREATED_SELF_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-006',
      name: 'Offer Letter Template',
      subject: 'Offer Letter - (employee_name)',
      templateKey: 'OFFER_LETTER_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-007',
      name: 'Payslip Email Template',
      subject: 'Payslip for (month)',
      templateKey: 'PAYSLIP_EMAIL_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-008',
      name: 'Profile Completion Template',
      subject: 'Complete Your Profile - (employee_name)',
      templateKey: 'PROFILE_COMPLETION_TEMPLATE',
      type: 'Default',
      status: true
    },
    {
      templateId: 'ET-2026-009',
      name: 'Quotation Sent Template',
      subject: 'Quotation (quotation_number) - SVL Packaging & Printing',
      templateKey: 'QUOTATION_SENT_TEMPLATE',
      type: 'Default',
      status: true
    }
  ];

  for (const t of templates) {
    await prisma.emailTemplate.upsert({
      where: { templateKey: t.templateKey },
      update: { templateId: t.templateId },
      create: t
    });
  }
  
  console.log('Templates seeded successfully.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
