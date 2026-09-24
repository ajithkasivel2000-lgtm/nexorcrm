import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function SecondarySourceListScreen() {
  return (
    <LookupListScreen
      title="Secondary Source"
      apiPath="/secondary-sources"
      idField="sourceId"
      nameField="sourceName"
    />
  );
}
