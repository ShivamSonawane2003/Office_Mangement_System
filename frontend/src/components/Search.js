import React, { useState, useRef, useEffect } from 'react';
import BotIcon from './icons/BotIcon';
import './Search.css';

// Use network IP for accessibility from other machines on the network
// This matches the configuration used in SignUp.js and other working components
const API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.4:8002';
const API_BASE = API_URL.replace(/\/+$/, '');
const API_PREFIX = API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`;

function Search() {
  // Load messages from localStorage or use initial greeting
  const loadMessages = () => {
    try {
      const saved = localStorage.getItem('chatbot_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert timestamp strings back to Date objects
        return parsed.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
    } catch (e) {
      console.error('Error loading chat history:', e);
    }
    // Default initial greeting
    return [
      {
        id: 1,
        type: 'ai',
        text: 'Hi there! 👋 How can I assist you today?',
        timestamp: new Date()
      }
    ];
  };

  const [messages, setMessages] = useState(loadMessages());
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef(null);

  // Clear chat history if user is not logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      // User is not logged in, clear chat history
      localStorage.removeItem('chatbot_messages');
      setMessages([
        {
          id: 1,
          type: 'ai',
          text: 'Hi there! 👋 How can I assist you today?',
          timestamp: new Date()
        }
      ]);
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Only save if user is logged in
      try {
        localStorage.setItem('chatbot_messages', JSON.stringify(messages));
      } catch (e) {
        console.error('Error saving chat history:', e);
      }
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: query.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsSearching(true);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        const errorMessage = {
          id: Date.now() + 1,
          type: 'ai',
          text: 'Please login again to continue.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
        setIsSearching(false);
        return;
      }

      // Use chatbot endpoint instead of search endpoint for better AI responses
      const response = await fetch(`${API_PREFIX}/search/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query: userMessage.text,
          conversation_history: messages
            .filter(msg => msg.type === 'user' || msg.type === 'ai')
            .slice(-5)
            .map(msg => ({
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.text
            }))
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Search failed');
      }

      const data = await response.json();
      
      // Use AI-generated response from chatbot
      let aiResponseText = data.response || `I couldn't find any expenses matching "${userMessage.text}". Try rephrasing your query or using different keywords!`;
      
      // Format search results if available
      const formattedResults = (data.search_results || []).map(result => ({
        id: result.id,
        label: result.label,
        amount: result.amount,
        category: result.category,
        similarity: result.similarity_score
      }));

      const aiMessage = {
        id: Date.now() + 2,
        type: 'ai',
        text: aiResponseText,
        results: formattedResults,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('Chatbot API error:', err);
      let errorText = `Sorry, I encountered an error: ${err.message}`;
      
      // Provide more helpful error messages for network issues
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        errorText = 'Unable to connect to the server. Please check your network connection and ensure the server is running.';
      } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
        errorText = 'Session expired. Please refresh the page and login again.';
      }
      
      const errorMessage = {
        id: Date.now() + 1,
        type: 'ai',
        text: errorText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="chatbot-container">
      <div className="chatbot-messages">
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.type}`}>
              <div className="message-avatar">
                {message.type === 'ai' ? (
                  <BotIcon size={22} />
                ) : (
                  <svg width="50" height="27" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="currentColor"/>
                  </svg>
                )}
              </div>
              <div className="message-content">
                <div className="message-bubble">
                  <div className="message-text">{message.text}</div>
                </div>
                {message.results && message.results.length > 0 && (
                  <div className="message-results">
                    {message.results.map((result) => (
                      <div key={result.id} className="result-card">
                        <div className="result-header">
                          <h5>{result.label}</h5>
                        </div>
                        <div className="result-details">
                          <span className="result-badge category">{result.category}</span>
                          <span className="result-badge amount">₹{result.amount.toLocaleString()}</span>
                          <span className="result-badge similarity">{Math.round(result.similarity * 100)}% match</span>
                        </div>
                        <div className="similarity-bar">
                          <div 
                            className="similarity-fill" 
                            style={{ width: `${result.similarity * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {isSearching && (
            <div className="chat-message ai">
              <div className="message-avatar">
                <BotIcon size={50} />
              </div>
              <div className="message-content">
                <div className="message-bubble typing">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chatbot-input-container">
          <div className="chatbot-input-wrapper">
            <input
              type="text"
              placeholder="Write your message..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="chatbot-input"
              disabled={isSearching}
            />
            <button
              className="chatbot-send-button"
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
  );
}

export default Search;
