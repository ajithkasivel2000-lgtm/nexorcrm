import { LookupListPage } from './components/Leads';

export default function TertiarySourceList() {
  return (
    <LookupListPage
      title="Tertiary Source"
      subtitle="Create, view and edit Tertiary Source. Assign leads to Tertiary Source."
      apiPath="/api/tertiary-sources"
      idField="sourceId"
      nameField="sourceName"
      idLabel="Tertiary Id"
      nameLabel="Tertiary Source"
      storageKey="tertiarySourceList"
    />
  );
}
