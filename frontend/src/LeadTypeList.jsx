import { LookupListPage } from './components/Leads';

export default function LeadTypeList() {
  return (
    <LookupListPage
      title="Lead Type"
      subtitle="Create, view and edit Lead Type. Assign leads to Lead Type."
      apiPath="/api/lead-types"
      idField="typeId"
      nameField="typeName"
      idLabel="Type Id"
      nameLabel="Lead Type"
      storageKey="leadTypeList"
    />
  );
}
