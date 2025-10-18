import React, { useState, useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000/api";


function PropertyCard({ property }) {
  return (
    <div className="property-card">
      <div className="property-name">{property.projectName}</div>
      <div className="property-badges">
        <span className="badge">{property.type}</span>
        <span className="badge">{property.status?.replace('_', ' ')}</span>
      </div>
      <div className="property-price">₹{property.price_crores} Cr</div>
      <div className="property-details">
        <div>📐 Carpet: {property.carpetArea} sq ft</div>
        <div>🚿 Bath: {property.bathrooms} • 🏞️ Balcony: {property.balcony}</div>
        <div>📍 {property.landmark || property.city}</div>
      </div>
    </div>
  );
}

function Message({ message, isUser }) {
  return (
    <div className={`message ${isUser ? 'user' : ''}`}>
      {!isUser && <div className="avatar ai">AI</div>}
      <div className="message-content">
        <div>{message.text}</div>
        {message.properties && message.properties.length > 0 && (
          <div className="properties-grid">
            {message.properties.map((prop, idx) => (
              <PropertyCard key={idx} property={prop} />
            ))}
          </div>
        )}
        {message.typing && (
          <div className="typing">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        )}
      </div>
      {isUser && <div className="avatar user">U</div>}
    </div>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    setMessages([{
      text: "Hi! I'm your NoBrokerage assistant. Ask me about properties like \"2BHK in Mumbai under 1.5 Cr\" or \"3BHK ready to move in Pune\".",
      isUser: false,
      properties: []
    }]);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: input })
      });

      const data = await response.json();

      setMessages(prev => [...prev, {
        text: data.message,
        isUser: false,
        properties: data.properties || []
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        text: 'Sorry, there was an error. Please make sure the backend server is running.',
        isUser: false,
        properties: []
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="logo"></div>
        <h1>NoBrokerage Chat Assistant</h1>
      </div>

      <div className="chat-container">
        {messages.map((msg, idx) => (
          <Message key={idx} message={msg} isUser={msg.isUser} />
        ))}
        {isTyping && (
          <Message 
            message={{ text: '', typing: true }} 
            isUser={false} 
          />
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="input-container">
        <input
          className="input-box"
          type="text"
          placeholder="Ask about properties..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isTyping}
        />
        <button 
          className="send-button"
          onClick={handleSend}
          disabled={isTyping || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default App;
