import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function PrimarySourceListScreen() {
  return (
    <LookupListScreen
      title="Primary Source"
      apiPath="/primary-sources"
      idField="sourceId"
      nameField="sourceName"
    />
  );
}
