import { useForm } from 'react-hook-form';
import axios from 'axios';
import './App.css';
import { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/* --- CursorTrailer using Framer Motion (smooth spring follow + states) --- */
function CursorTrailer() {
  // motion values for pointer position
  const pointerX = useMotionValue(-100);
  const pointerY = useMotionValue(-100);

  // smooth springs for really nice follow motion
  const springConfig = { stiffness: 800, damping: 40 };
  const x = useSpring(pointerX, springConfig);
  const y = useSpring(pointerY, springConfig);

  const [isHoverInteractive, setIsHoverInteractive] = useState(false);
  const [isTextSelectable, setIsTextSelectable] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    const onMove = (e) => {
      pointerX.set(e.clientX);
      pointerY.set(e.clientY);

      const t = e.target;
      // define what counts as "interactive" or "text" in your app
      const interactive = !!t.closest('button, a, input, textarea, select, .button, .textarea, [data-cursor="interactive"]');
      const text = !!t.closest('p, span, label, input, textarea, .selectable, [data-cursor="text"]');

      setIsHoverInteractive(interactive);
      setIsTextSelectable(text);
    };

    const onDown = () => setIsPressed(true);
    const onUp = () => setIsPressed(false);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [pointerX, pointerY]);

  // sizes / styles derived from state
  const ringSize = isHoverInteractive ? 44 : isTextSelectable ? 24 : 30;
  const ringBg = isHoverInteractive ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)';
  const dotSize = isTextSelectable ? 6 : 10;
  const dotBg = isHoverInteractive ? 'rgba(99,102,241,0.9)' : 'rgba(255,255,255,0.95)';
  const scale = isPressed ? 0.86 : 1;

  return (
    <>
      {/* outer ring */}
      <motion.div
        className="cursor-ring"
        style={{ x, y }}
        animate={{ width: ringSize, height: ringSize, backgroundColor: ringBg, scale }}
        transition={{ type: 'spring', stiffness: 700, damping: 35 }}
      />

      {/* center dot */}
      <motion.div
        className="cursor-dot"
        style={{ x, y }}
        animate={{ width: dotSize, height: dotSize, backgroundColor: dotBg, scale }}
        transition={{ type: 'spring', stiffness: 700, damping: 35 }}
      />
    </>
  );
}


/* --- Main App (unchanged logic, just uses CursorTrailer) --- */
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
    <>
      <CursorTrailer />
      <div className="app-container">
        <div className="card">
          <h1 className="title">Create n8n Workflow</h1>
          <p className="subtitle">
            Describe your automation (e.g., <span>"Send an email when a new tweet is posted"</span>)
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
