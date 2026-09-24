import { LookupListPage } from './components/Leads';

export default function ProjectStatusList() {
  return (
    <LookupListPage
      title="Project Status"
      subtitle="Create, view and edit Project Status. Assign projects to Project Status."
      apiPath="/api/project-statuses"
      idField="statusId"
      nameField="statusName"
      idLabel="Status Id"
      nameLabel="Project Status"
      storageKey="projectStatusList"
    />
  );
}
