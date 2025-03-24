import React, { useState, useEffect, useRef } from 'react';
import './ChatBox.css';

function ChatBox() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message and handle streaming response
  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!input.trim()) return;
    
    const userMessage = { id: Date.now(), text: input, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Create new AI reply message ID but don't add to messages yet
    const aiMessageId = Date.now() + 1;
    // Add temporary AI message
    setMessages(prev => [...prev, { id: aiMessageId, text: '', sender: 'ai' }]);
    
    try {
      // Send request to backend
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      
      // Handle different HTTP status codes
      if (!response.ok) {
        // Remove the incomplete AI message
        setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
        
        let errorMessage = 'Sorry, a server error occurred. Please try again later.';
        
        // Show specific message for rate limiting errors (429)
        if (response.status === 429) {
          errorMessage = 'You are sending messages too frequently. Please wait a moment and try again.';
        } else if (response.status === 400) {
          errorMessage = 'Invalid request format. Please check your input.';
        } else if (response.status === 500) {
          errorMessage = 'Internal server error. Please try again later.';
        } else if (response.status === 401 || response.status === 403) {
          errorMessage = 'Insufficient permissions or authentication failure.';
        }
        
        // Add system error message - only add one error message
        setMessages(prev => [...prev, {
          id: Date.now() + 2,
          text: errorMessage,
          sender: 'system'
        }]);
        
        // Don't throw a new error - we've handled it already
        console.error(`HTTP Error ${response.status}: ${errorMessage}`);
        return; // Exit early
      }
      
      // Process successful response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponse = '';
      
      // Process the streaming response
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        aiResponse += chunk;
        
        // Update AI's reply in the message list
        setMessages(prev => 
          prev.map(msg => 
            msg.id === aiMessageId ? { ...msg, text: aiResponse } : msg
          )
        );
      }
    } catch (error) {
      // This catch block will only execute for network errors or other exceptions
      // not for HTTP error status codes (which are handled above)
      console.error('Network error:', error);
      
      // Remove the incomplete AI message if it exists
      setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
      
      // Add system error message
      setMessages(prev => [...prev, { 
        id: Date.now() + 2, 
        text: 'Network error occurred. Please check your connection and try again.', 
        sender: 'system' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map(message => (
          <div 
            key={message.id} 
            className={`message ${message.sender}`}
          >
            {message.text}
          </div>
        ))}
        {isLoading && (
          <div className="loading">
            <div className="loading-dot"></div>
            <div className="loading-dot"></div>
            <div className="loading-dot"></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="chat-input-form" onSubmit={sendMessage}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatBox; 