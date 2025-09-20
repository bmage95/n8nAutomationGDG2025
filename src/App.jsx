import { useForm } from 'react-hook-form';
import axios from 'axios';
import './App.css';
import { useState } from 'react';

function App() {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const onSubmit = async (data) => {
    setError(null);
    setResponse(null);
    try {
      // Send prompt to Gemini backend endpoint
      const res = await axios.post('http://localhost:3000/gemini', {
        prompt: data.userInput,
      });
      setResponse(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error calling backend');
    }
  };

  return (
    <div className="container">
      <h1>Create n8n Workflow</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <label>
          Describe your automation (e.g., "Send an email when a new tweet is posted"):
          <textarea
            {...register('userInput', { required: 'Input is required' })}
            placeholder="Enter your automation request"
          />
        </label>
        {errors.userInput && <p className="error">{errors.userInput.message}</p>}
        <button type="submit">Generate Workflow</button>
      </form>
      {response && (
        <div>
          <h3>Result</h3>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default App;