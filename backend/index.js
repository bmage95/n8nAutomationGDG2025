const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const N8N_API_URL = 'http://localhost:5678/api/v1/workflows';
const N8N_API_KEY = process.env.N8N_API_KEY; // Set in .env
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Set in .env

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
  generationConfig: { responseMimeType: 'application/json' },
});

app.post('/generate-workflow', async (req, res) => {
  const { prompt } = req.body;
  try {
    // Call Gemini API
    const systemPrompt = 'Convert this user request into a valid n8n workflow JSON with name, nodes, and connections. Example: {"name": "Workflow", "nodes": [], "connections": {}}. Ensure nodes use n8n-compatible types like "n8n-nodes-base.httpRequest".';
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\nUser request: ${prompt}` }] },
      ],
    });

    const workflowJson = result.response.text();
    const parsedJson = JSON.parse(workflowJson);

    // Send JSON to n8n
    const n8nResponse = await axios.post(N8N_API_URL, parsedJson, {
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    res.json({
      message: 'Workflow created in n8n',
      n8nResponse: n8nResponse.data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error generating or saving workflow', error: error.message });
  }
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));