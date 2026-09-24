import { LookupListPage } from './components/Leads';

export default function LeadStatusList() {
  return (
    <LookupListPage
      title="Lead Status"
      subtitle="Create, view and edit Lead Status. Assign leads to Lead Status."
      apiPath="/api/lead-statuses"
      idField="statusId"
      nameField="statusName"
      idLabel="Status Id"
      nameLabel="Lead Status"
      storageKey="leadStatusList"
    />
  );
}
