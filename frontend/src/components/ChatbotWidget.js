import React, { useState } from 'react';
import Search from './Search';
import BotIcon from './icons/BotIcon';
import './ChatbotWidget.css';

function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNotification, setHasNotification] = useState(true);

  const handleToggle = () => {
    if (isOpen) {
      setIsOpen(false);
    } else {
      setIsOpen(true);
      setHasNotification(false);
    }
  };

  return (
    <>
      <button 
        className={`chatbot-widget-button ${isOpen ? 'close' : ''}`}
        onClick={handleToggle}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
          </svg>
        ) : (
          <>
            <BotIcon size={28} />
            {hasNotification && (
              <span className="chatbot-notification-badge">1</span>
            )}
          </>
        )}
      </button>
      
      <div className={`chatbot-widget-container ${isOpen ? 'open' : 'closed'}`} style={{ display: isOpen ? 'block' : 'none' }}>
        <div className="chatbot-widget-header">
          <div className="chatbot-header-left">
            <h3>AI Search Assistant</h3>
          </div>
        </div>
        <div className="chatbot-widget-content">
          <Search />
        </div>
      </div>
    </>
  );
}

export default ChatbotWidget;

