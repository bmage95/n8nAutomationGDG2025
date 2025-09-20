const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid'); // Added for UUID generation

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_API_URL = 'http://localhost:5678/api/v1/workflows';

// Shared system prompt
const SYSTEM_PROMPT = `
You are an expert in building n8n workflows. Generate a valid n8n workflow in JSON format that strictly matches the following structure and constraints.

Rules:

1. The JSON must include exactly these top-level fields and no others:
   - name (string): A descriptive workflow name based on the user’s request.
   - nodes (array): List of all nodes.
   - connections (object): Defines how nodes are linked.
   - settings (object): Set to {"executionOrder": "v1"}.

2. Each node in the nodes array must include exactly these fields:
   - parameters (object): Node-specific configuration (e.g., url for HTTP Request nodes, assignments for Set nodes).
   - id (string): A unique UUID for the node (e.g., "45e5748e-855c-4384-9908-b1ee1798352f").
   - name (string): A unique, descriptive node name.
   - type (string): The node type (e.g., "n8n-nodes-base.manualTrigger", "n8n-nodes-base.httpRequest", "n8n-nodes-base.set").
   - position (array): Two numbers for UI position, e.g., [1216, 240].
   - notesInFlow (boolean): Set to true for nodes with in-flow notes, false otherwise.
   - typeVersion (number): The node type version (e.g., 1 for manualTrigger, 4.2 for httpRequest, 3.4 for set).
   - notes (string): A string for node notes (can be empty, e.g., "\\n").

3. The connections object must reference valid node names from the nodes array, structured like:
   {
     "NodeName": {
       "main": [
         [
           {
             "node": "NextNodeName",
             "type": "main",
             "index": 0
           }
         ]
       ]
     }
   }

4. Do not include any additional fields like pinData, meta, active, or staticData in the JSON, as these cause errors.

5. Output only the JSON, with no explanations, markdown, or extra text.

6. Customize the workflow based on my request. For example:
   - "Webhook → HTTP Request → Google Sheets" → Create a workflow with a Webhook node, an HTTP Request node, and a Google Sheets node, connected in sequence.
   - "Cron → Slack" → Create a workflow with a Schedule Trigger node and a Slack node, connected in sequence.

7. Ensure all nodes have valid typeVersion values (e.g., 1 for manualTrigger, 4.2 for httpRequest, 2.1 for googleSheets, 3.4 for set) and appropriate parameters based on the node type and user request.

8. For nodes requiring credentials (e.g., Google Sheets, Slack), set parameters with placeholder values (e.g., authentication: "oAuth2") but do not include a credentials object unless specified.
`;

// Single endpoint: create workflow from Gemini prompt
app.post('/n8n-workflow', async (req, res) => {
  let { prompt } = req.body;
  try {
    const fullPrompt = `${SYSTEM_PROMPT}\n${prompt}`;
    console.log('--- Full Prompt Sent to Gemini ---');
    console.log(fullPrompt);

    // 1. Get workflow JSON from Gemini
    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        contents: [{ parts: [{ text: fullPrompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('--- Raw Gemini Response ---');
    console.dir(geminiResponse.data, { depth: null });

    let workflowJson = geminiResponse.data;
    if (workflowJson.candidates && workflowJson.candidates[0]?.content?.parts[0]?.text) {
      let text = workflowJson.candidates[0].content.parts[0].text.trim();
      console.log('--- Raw Text from Gemini ---');
      console.log(text);

      text = text.replace(/^```json\n|^```|```$/g, '').trim();
      try {
        workflowJson = JSON.parse(text);
        // Validate JSON structure
        if (!workflowJson.name || !workflowJson.nodes || !workflowJson.connections || !workflowJson.settings) {
          throw new Error('Invalid JSON structure: Missing required fields (name, nodes, connections, settings)');
        }
        if (Object.keys(workflowJson).length > 4) {
          throw new Error('Invalid JSON structure: Extra fields detected');
        }
        // Ensure each node has a valid UUID
        workflowJson.nodes = workflowJson.nodes.map(node => ({
          ...node,
          id: node.id || uuidv4(), // Add UUID if missing
        }));
        console.log('--- Parsed Workflow JSON ---');
        console.dir(workflowJson, { depth: null });
      } catch (e) {
        console.error('JSON parsing error:', e.message, { text });
        return res.status(400).json({ message: 'Gemini did not return valid JSON', error: e.message, text });
      }
    } else {
      return res.status(400).json({ message: 'No valid response from Gemini', data: workflowJson });
    }

    // 2. Send workflow JSON to n8n REST API
    console.log('--- Sending POST Request to n8n API ---');
    console.log('URL:', N8N_API_URL);
    console.log('Headers:', {
      'X-N8N-API-KEY': N8N_API_KEY ? '[REDACTED]' : 'MISSING', // Redact key for logging
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    });
    console.log('Data:', workflowJson);

    const n8nRes = await axios({
      method: 'POST', // Explicitly set to POST
      url: N8N_API_URL,
      data: workflowJson,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 10000, // 10s timeout to avoid hanging
    });

    console.log('--- n8n API Response ---');
    console.dir(n8nRes.data, { depth: null });
    console.log('--- Workflow JSON sent to n8n ---');
    console.dir(workflowJson, { depth: null });

    res.json({
      message: 'Workflow created in n8n',
      n8nResponse: n8nRes.data,
      workflowJson,
    });
  } catch (error) {
    console.error('n8n API error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      headers: error.response?.headers,
    });
    res.status(error.response?.status || 500).json({
      message: 'Error creating workflow in n8n',
      error: error.message,
      details: error.response?.data,
    });
  }
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));
