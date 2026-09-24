import { LookupListPage } from './components/Leads';

export default function SecondarySourceList() {
  return (
    <LookupListPage
      title="Secondary Source"
      subtitle="Create, view and edit Secondary Source. Assign leads to Secondary Source."
      apiPath="/api/secondary-sources"
      idField="sourceId"
      nameField="sourceName"
      idLabel="Secondary Id"
      nameLabel="Secondary Source"
      storageKey="secondarySourceList"
    />
  );
}
