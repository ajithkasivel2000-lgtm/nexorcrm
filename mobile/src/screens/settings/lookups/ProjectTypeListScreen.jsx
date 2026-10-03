import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function ProjectTypeListScreen() {
  return (
    <LookupListScreen
      title="Project Type"
      apiPath="/project-types"
      idField="typeId"
      nameField="typeName"
    />
  );
}
