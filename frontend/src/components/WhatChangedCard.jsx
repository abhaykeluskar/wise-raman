import React from 'react';

const WhatChangedCard = ({ oldState, newState, actor = "System", reason = "" }) => {
  return (
    <div className="what-changed-card" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '16px 0', backgroundColor: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, color: '#1e293b' }}>Data Audit Trail</h4>
        <span style={{ backgroundColor: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
          Modified by: {actor}
        </span>
      </div>
      
      {reason && (
        <p style={{ margin: '0 0 12px 0', fontSize: '0.875rem', color: '#64748b' }}>
          <strong>Reason:</strong> {reason}
        </p>
      )}

      <div style={{ display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1, backgroundColor: '#fee2e2', padding: '12px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
          <strong style={{ color: '#991b1b', display: 'block', marginBottom: '8px' }}>Previous State</strong>
          <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', color: '#7f1d1d' }}>
            {JSON.stringify(oldState, null, 2)}
          </pre>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', color: '#94a3b8' }}>
          ➡️
        </div>

        <div style={{ flex: 1, backgroundColor: '#dcfce7', padding: '12px', borderRadius: '6px', border: '1px solid #86efac' }}>
          <strong style={{ color: '#166534', display: 'block', marginBottom: '8px' }}>New State</strong>
          <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', color: '#14532d' }}>
            {JSON.stringify(newState, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default WhatChangedCard;
