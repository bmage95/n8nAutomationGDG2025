const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
// const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());


const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Set in .env


// Gemini endpoint: receives prompt, returns Gemini JSON response
app.post('/gemini', async (req, res) => {
  let { prompt } = req.body;
  try {
    // Add system instruction to force JSON output
    const systemPrompt =
      `
      ## 📝 General Prompt for Generating n8n Workflow JSON

*Prompt:*

You are an expert in building n8n workflows. I want you to generate a valid n8n workflow in JSON format.

### Rules:

1. The JSON must strictly follow the *n8n workflow schema* as per official documentation.

   * *Top-level fields:*

     * name (string) – workflow name
     * nodes (array) – list of all nodes
     * connections (object) – defines how nodes are linked
     * settings (object, optional) – workflow-wide settings
     * active (boolean) – whether the workflow is active
   * *Each node must contain:*

     * parameters (object) – node configuration
     * name (string) – unique node name
     * type (string) – node type (e.g., "n8n-nodes-base.httpRequest")
     * typeVersion (integer) – version of node type
     * position (array [x, y]) – UI position of node

2. *Connections must reference valid node names* and be structured like this:

   json
   "connections": {
     "Start": {
       "main": [
         [
           {
             "node": "Next Node",
             "type": "main",
             "index": 0
           }
         ]
       ]
     }
   }
   

3. *Do not include any explanation or text outside of JSON.* Output only the workflow JSON.

4. *Customize based on my request.* For example, if I say:

   * “Webhook → HTTP Request → Google Sheets” → Build a workflow that triggers via webhook, makes an API call, and stores data in Google Sheets.
   * “Cron → Slack” → Build a scheduled message sender to Slack.

      `;
    const fullPrompt = `${systemPrompt}\n${prompt}`;

    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        contents: [
          { parts: [{ text: fullPrompt }] }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    let result = geminiResponse.data;
    if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
      let text = result.candidates[0].content.parts[0].text.trim();
      // Remove code block markers if present
      text = text.replace(/^```json\n|^```|```$/g, '').trim();
      try {
        result = JSON.parse(text);
      } catch (e) {
        result = { text };
      }
    }
    res.json(result);
  } catch (error) {
    console.error(error.response?.data || error);
    res.status(500).json({ message: 'Error calling Gemini', error: error.message });
  }
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));