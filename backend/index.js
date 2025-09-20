import { useForm } from 'react-hook-form';
import axios from 'axios';
import './App.css';
import { useState, useEffect, useRef } from 'react';

// ✅ 1. All cursor logic is now encapsulated in its own component.
function CursorTrailer() {
  const trailerRef = useRef(null);

  useEffect(() => {
    const trailer = trailerRef.current;
    if (!trailer) return;

    let mouseX = 0;
    let mouseY = 0;
    let trailerX = 0;
    let trailerY = 0;
    const speed = 0.1;

    const handleMouseMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      const target = e.target;
      if (target.closest('.textarea, .button')) {
        trailer.classList.add('active');
      } else {
        trailer.classList.remove('active');
      }
    };

    const animateTrailer = () => {
      const dx = mouseX - trailerX;
      const dy = mouseY - trailerY;
      trailerX += dx * speed;
      trailerY += dy * speed;
      trailer.style.transform = `translate(${trailerX}px, ${trailerY}px)`;
      requestAnimationFrame(animateTrailer);
    };

    window.addEventListener('mousemove', handleMouseMove);
    const animationFrameId = requestAnimationFrame(animateTrailer);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <div ref={trailerRef} className="cursor-trailer"></div>;
}


// ✅ 2. The App component is now much simpler and focused.
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
      // ✅ 3. Bug fixed: `finally` ensures loading is always set to false.
      setLoading(false);
    }
  };

  return (
    <>
      <CursorTrailer /> {/* Just drop the new component in! */}
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
    </>
  );
}

export default App;