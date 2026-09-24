import React from 'react';
import LookupListScreen from '../../../components/LookupListScreen';

export default function TertiarySourceListScreen() {
  return (
    <LookupListScreen
      title="Tertiary Source"
      apiPath="/tertiary-sources"
      idField="sourceId"
      nameField="sourceName"
    />
  );
}
