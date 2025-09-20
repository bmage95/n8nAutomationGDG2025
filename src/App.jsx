import { useForm } from 'react-hook-form';
import axios from 'axios';
import './App.css';
import { useState } from 'react';

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
      const res = await axios.post('http://localhost:3000/gemini', {
        prompt: data.userInput,
      });
      setResponse(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error calling backend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="card">
        <h1 className="title">Create n8n Workflow</h1>
        <p className="subtitle">
          Describe your automation (e.g., 
          <span>"Send an email when a new tweet is posted"</span>)
        </p>
        <form onSubmit={handleSubmit(onSubmit)}>
          <textarea
            {...register('userInput', { required: 'Input is required' })}
            placeholder="Enter your automation request..."
            className="textarea"
          />
          {errors.userInput && <p className="error">{errors.userInput.message}</p>}
          <button type="submit" className="button" disabled={loading}>
            {loading ? '⏳ Generating...' : 'Generate Workflow'}
          </button>
        </form>
        {response && (
          <div className="result">
            <h3>Result</h3>
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default App;
