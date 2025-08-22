// frontend/src/components/MessageInput.jsx
import React from 'react';

export default function MessageInput({ value, onChange, onSend }) {
  const handleKey = (e) => {
    if (e.key === 'Enter') onSend();
  };

  return (
    <div className="message-input-container">
      <input
        type="text"
        placeholder="Type your message…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
      />
      <button onClick={onSend}>Send</button>
    </div>
  );
}
