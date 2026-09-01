import React, { useState } from 'react';

const CopilotChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Mock API call to AI Copilot Agent
      setTimeout(() => {
        const aiMsg = { 
          role: 'assistant', 
          content: 'Based on the evidence, your spending on dining is well within the typical limit.',
          evidence: {
            total_amount: 4500,
            transaction_count: 5,
            filters_applied: { category: 'Dining' }
          }
        };
        setMessages((prev) => [...prev, aiMsg]);
        setIsLoading(false);
      }, 1000);
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="copilot-chat" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-history" style={{ flexGrow: 1, overflowY: 'auto', padding: '1rem' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ margin: '10px 0', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
            <div style={{
              display: 'inline-block',
              padding: '10px',
              borderRadius: '8px',
              backgroundColor: msg.role === 'user' ? '#007bff' : '#f1f1f1',
              color: msg.role === 'user' ? 'white' : 'black'
            }}>
              {msg.content}
            </div>
            {msg.evidence && (
              <details style={{ marginTop: '5px', fontSize: '0.8rem', color: '#666' }}>
                <summary>View Evidence</summary>
                <pre>{JSON.stringify(msg.evidence, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
        {isLoading && <div>AI is thinking (local inference)...</div>}
      </div>
      <div className="chat-input" style={{ display: 'flex', padding: '1rem', borderTop: '1px solid #ccc' }}>
        <input 
          type="text" 
          value={input} 
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your finances..." 
          style={{ flexGrow: 1, padding: '10px' }}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} style={{ padding: '10px 20px', marginLeft: '10px' }}>Send</button>
      </div>
    </div>
  );
};

export default CopilotChat;
