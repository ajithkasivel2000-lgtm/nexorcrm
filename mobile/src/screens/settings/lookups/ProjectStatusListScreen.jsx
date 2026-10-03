import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function ProjectStatusListScreen() {
  return (
    <LookupListScreen
      title="Project Status"
      apiPath="/project-statuses"
      idField="statusId"
      nameField="statusName"
    />
  );
}
