import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

function GeminiLivePage() {
  const navigate = useNavigate();
  const iframeRef = useRef(null);

  useEffect(() => {
    // Load the Gemini Live demo in an iframe
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.src = '/gemini-live-demo/index.html';
    }
  }, []);

  return (
    <div className="gemini-live-container">
      <div className="gemini-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Home
        </button>
        <h1>Gemini Live Chat</h1>
      </div>
      
      <div className="gemini-iframe-container">
        <iframe
          ref={iframeRef}
          title="Gemini Live Demo"
          className="gemini-iframe"
          allow="microphone; camera; display-capture"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        />
      </div>
    </div>
  );
}

export default GeminiLivePage;