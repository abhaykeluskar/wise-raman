import React, { useState } from 'react';

const WhatIfSimulator = () => {
  const [scenario, setScenario] = useState('SIP_INCREASE');
  const [amount, setAmount] = useState(5000);
  const [result, setResult] = useState(null);

  const handleSimulate = () => {
    // Deterministic simulation
    if (scenario === 'SIP_INCREASE') {
      const currentWealth = 500000;
      const expectedReturn = 0.12;
      const years = 10;
      
      const futureValue = currentWealth * Math.pow(1 + expectedReturn, years) + 
                          amount * 12 * ((Math.pow(1 + expectedReturn, years) - 1) / expectedReturn);
                          
      setResult({
        message: `If you increase your SIP by ₹${amount}/month, your expected wealth in 10 years will be ₹${Math.round(futureValue).toLocaleString()}.`,
        aiInsight: "This is a great step. Your portfolio heavily benefits from compounding. Consider rebalancing if your equity exposure exceeds 70%."
      });
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #eee', borderRadius: '8px' }}>
      <h2>What-If Simulator</h2>
      <div style={{ marginBottom: '15px' }}>
        <label>Scenario: </label>
        <select value={scenario} onChange={e => setScenario(e.target.value)} style={{ padding: '5px' }}>
          <option value="SIP_INCREASE">Increase Monthly SIP</option>
          <option value="LOAN_PREPAY">Prepay Home Loan</option>
          <option value="VACATION">Take a Vacation</option>
        </select>
      </div>
      <div style={{ marginBottom: '15px' }}>
        <label>Amount (₹): </label>
        <input 
          type="number" 
          value={amount} 
          onChange={e => setAmount(Number(e.target.value))} 
          style={{ padding: '5px' }}
        />
      </div>
      <button onClick={handleSimulate} style={{ padding: '10px 20px' }}>Simulate</button>
      
      {result && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e9f5ff', borderRadius: '8px' }}>
          <h4>Simulation Result</h4>
          <p><strong>Calculated:</strong> {result.message}</p>
          <p><strong>AI Insight:</strong> {result.aiInsight}</p>
        </div>
      )}
    </div>
  );
};

export default WhatIfSimulator;
