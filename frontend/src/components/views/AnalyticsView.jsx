import React from 'react';
import { ReportsView } from './ReportsView';

// Backwards compatibility alias for AnalyticsView
export const AnalyticsView = (props) => {
  return <ReportsView {...props} />;
};
