import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function LeadTypeListScreen() {
  return (
    <LookupListScreen
      title="Lead Type"
      apiPath="/lead-types"
      idField="typeId"
      nameField="typeName"
    />
  );
}
