import React from 'react';
import { TruthInspectorView } from './TruthInspectorView';

// Backwards compatibility alias for DevToolsView
export const DevToolsView = (props) => {
  return <TruthInspectorView {...props} />;
};
