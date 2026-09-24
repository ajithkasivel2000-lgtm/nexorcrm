import { LookupListPage } from './components/Leads';

export default function PrimarySourceList() {
  return (
    <LookupListPage
      title="Primary Source"
      subtitle="Create, view and edit Primary Source. Assign leads to Primary Source."
      apiPath="/api/primary-sources"
      idField="sourceId"
      nameField="sourceName"
      idLabel="Primary Id"
      nameLabel="Primary Source"
      storageKey="primarySourceList"
    />
  );
}
