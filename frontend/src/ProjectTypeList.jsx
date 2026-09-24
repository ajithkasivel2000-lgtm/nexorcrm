import { LookupListPage } from './components/Leads';

export default function ProjectTypeList() {
  return (
    <LookupListPage
      title="Project Type"
      subtitle="Create, view and edit Project Type. Assign projects to Project Type."
      apiPath="/api/project-types"
      idField="typeId"
      nameField="typeName"
      idLabel="Project Type Id"
      nameLabel="Project Type"
      storageKey="projectTypeList"
    />
  );
}
