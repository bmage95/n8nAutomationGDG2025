import { useForm } from 'react-hook-form';
import axios from 'axios';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ErrorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="error-icon">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
);

function HomePage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors }, reset } = useForm();
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const onSubmit = async (data) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await axios.post('http://localhost:3001/create-workflow', {
        userInput: data.userInput,
      });
      setResponse(result.data);
      reset();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create workflow');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-container">
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

      {/* Gemini Live Demo Button */}
      <div className="gemini-card" onClick={() => navigate('/gemini-live')}>
        <div className="gemini-content">
          <div className="gemini-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
            </svg>
          </div>
          <h2 className="gemini-title">Gemini Live Chat</h2>
          <p className="gemini-description">
            Voice & video AI assistant with real-time conversation, screen sharing, and camera support
          </p>
          <div className="gemini-features">
            <span className="feature-tag">🎤 Voice Chat</span>
            <span className="feature-tag">📷 Camera</span>
            <span className="feature-tag">🖥️ Screen Share</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;