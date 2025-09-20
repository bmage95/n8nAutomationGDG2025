import { useForm } from 'react-hook-form';
import axios from 'axios';
import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// --- Components ---

const N8nLogo = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="logo-svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white"/>
  </svg>
);

const ErrorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="error-icon">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
);

function AnimatedCursor() {
  const cursorDotRef = useRef(null);
  const cursorRingRef = useRef(null);

  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    if (!dot || !ring) return;

    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;
    let dotX = 0, dotY = 0;
    const ringSpeed = 0.15;
    const dotSpeed = 0.9;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const animateCursor = () => {
      ringX += (mouseX - ringX) * ringSpeed;
      ringY += (mouseY - ringY) * ringSpeed;
      if(ring.style) ring.style.transform = `translate(${ringX - ring.clientWidth / 2}px, ${ringY - ring.clientHeight / 2}px)`;

      dotX += (mouseX - dotX) * dotSpeed;
      dotY += (mouseY - dotY) * dotSpeed;
      if(dot.style) dot.style.transform = `translate(${dotX - dot.clientWidth / 2}px, ${dotY - dot.clientHeight / 2}px)`;
      
      const target = document.elementFromPoint(mouseX, mouseY);
      if (target?.closest('.textarea, .button')) {
        ring.classList.add('active');
      } else {
        ring.classList.remove('active');
      }

      requestAnimationFrame(animateCursor);
    };

    window.addEventListener('mousemove', handleMouseMove);
    const animFrame = requestAnimationFrame(animateCursor);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animFrame);
    };
  }, []);

  return (
    <>
      <div ref={cursorRingRef} className="cursor-ring"></div>
      <div ref={cursorDotRef} className="cursor-dot"></div>
    </>
  );
}


// --- Main App Component ---

function App() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const onSubmit = async (data) => {
    setError(null);
    setResponse(null);
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:3000/n8n-workflow', {
        prompt: data.userInput,
      });
      setResponse(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred while generating the workflow.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <AnimatedCursor />
      <div className="app-container">
        <div className="card">
          <div className="title-container">
            <h1 className="title">Create n8n Workflow</h1>
          </div>
          <p className="subtitle">
            Describe your automation (e.g.,
            <span>"Send an email when a new tweet is posted"</span>)
          </p>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="textarea-wrapper">
              <textarea
                {...register('userInput', { required: 'Input is required' })}
                placeholder="Enter your automation request..."
                className="textarea"
              />
            </div>
            {errors.userInput && (
              <p className="error">
                <ErrorIcon />
                {errors.userInput.message}
              </p>
            )}
            <button type="submit" className="button" disabled={loading}>
              {loading ? '⏳ Generating...' : 'Generate Workflow'}
            </button>
          </form>
          {response && (
            <div className="result">
              <h3>Workflow Generated</h3>
              <p style={{ color: '#bbf7d0' }}>Successfully generated! View it <a href="http://localhost:5678/home/workflows" target="_blank" rel="noopener noreferrer" style={{ color: '#6D28D9', textDecoration: 'underline' }}>here</a>.</p>
              <pre>{JSON.stringify(response, null, 2)}</pre>
            </div>
          )}
          {error && (
            <p className="error">
              <ErrorIcon />
              {error}
            </p>
          )}
        </div>
        
        {/* Gemini Live Button */}
        <div 
          className="gemini-card" 
          onClick={() => {
            alert('Gemini card clicked! Opening demo...');
            window.open('/gemini-live-demo/index.html', '_blank');
          }}
        >
          <div className="gemini-content">
            <div className="gemini-icon">
              ✨
            </div>
            <h2 className="gemini-title">Gemini Live Chat</h2>
            <p className="gemini-description">
              Voice & video AI assistant with real-time conversation
            </p>
            <div className="gemini-features">
              <span className="feature-tag">🎤 Voice</span>
              <span className="feature-tag">📷 Camera</span>
              <span className="feature-tag">🖥️ Screen</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
export default App;