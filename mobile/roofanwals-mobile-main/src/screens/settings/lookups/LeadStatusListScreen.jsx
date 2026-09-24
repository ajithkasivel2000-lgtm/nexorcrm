import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function LeadStatusListScreen() {
  return (
    <LookupListScreen
      title="Lead Status"
      apiPath="/lead-statuses"
      idField="statusId"
      nameField="statusName"
    />
  );
}
