const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// --- Vertex AI Configuration ---
const REGION = 'us-central1';
const PROJECT_ID = 'vibrant-climber-472721-m9';
const MODEL_ID = 'gemini-2.5-pro'; 
const VERTEX_AI_API_URL = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/${MODEL_ID}:generateContent`;

const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_API_URL = 'http://localhost:5678/api/v1/workflows';

// --- Google Auth Client ---
const auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform'
});


// --- Helpers and Prompts (No changes needed here) ---
function ensureField(requiredFields, field) {
  if (!Array.isArray(requiredFields)) return;
  if (!requiredFields.some(f => f.fieldName === field.fieldName)) {
    requiredFields.push(field);
  }
}
function enrichRequirements(requirementsJson) {
  try {
    if (!requirementsJson || !requirementsJson.workflowSkeleton) return requirementsJson;
    const steps = requirementsJson.workflowSkeleton.steps || [];
    const rf = requirementsJson.requiredFields = requirementsJson.requiredFields || [];
    const hasEmail = steps.some(s => `${s.nodeType}`.toLowerCase().includes('email'));
    const hasSchedule = steps.some(s => `${s.nodeType}`.toLowerCase().includes('schedule') || `${s.action}`.toLowerCase().includes('trigger'));
    if (hasEmail) {
      ensureField(rf, { fieldName: 'SMTP_HOST', label: 'SMTP Server', type: 'text', description: 'SMTP server hostname (e.g., smtp.gmail.com)', required: true });
      ensureField(rf, { fieldName: 'SMTP_PORT', label: 'SMTP Port', type: 'number', description: 'Port number (587 for STARTTLS, 465 for SSL/TLS)', required: true });
      ensureField(rf, { fieldName: 'SMTP_SECURITY', label: 'Email Security', type: 'dropdown', options: ['none', 'starttls', 'tls'], description: 'Security protocol for SMTP transport', required: true });
      ensureField(rf, { fieldName: 'SENDER_EMAIL', label: 'Sender Email', type: 'email', description: 'Email address to send from', required: true });
      ensureField(rf, { fieldName: 'SENDER_NAME', label: 'Sender Name', type: 'text', description: 'Display name for the sender', required: false });
      ensureField(rf, { fieldName: 'SENDER_PASSWORD', label: 'Email Password / App Password', type: 'password', description: 'Password or app password for SMTP auth', required: true });
      ensureField(rf, { fieldName: 'RECIPIENT_EMAIL', label: 'Recipient Email Address', type: 'email', description: 'Who should receive this email?', required: true });
      ensureField(rf, { fieldName: 'EMAIL_SUBJECT', label: 'Email Subject', type: 'text', description: 'Subject of the email', required: true });
      ensureField(rf, { fieldName: 'EMAIL_BODY', label: 'Email Body', type: 'textarea', description: 'Plain text or HTML content (HTML allowed)', required: true });
    }
    if (hasSchedule) {
      ensureField(rf, { fieldName: 'TIMEZONE', label: 'Timezone', type: 'dropdown', options: ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Tokyo'], description: 'Timezone for schedule calculations', required: true });
      ensureField(rf, { fieldName: 'SCHEDULE_CRON', label: 'Schedule Time (Cron)', type: 'text', description: "Cron expression (e.g., '0 7 * * *' for 7 AM daily)", required: false });
      ensureField(rf, { fieldName: 'SCHEDULE_HOUR', label: 'Hour (0-23)', type: 'number', description: 'Alternative to cron: hour of day (24h)', required: false });
      ensureField(rf, { fieldName: 'SCHEDULE_MINUTE', label: 'Minute (0-59)', type: 'number', description: 'Alternative to cron: minute of hour', required: false });
    }
    return requirementsJson;
  } catch (e) {
    console.error('Failed to enrich requirements:', e);
    return requirementsJson;
  }
}
function applyRequirementsToWorkflow(workflowJson, requirements) {
  if (!workflowJson || !workflowJson.nodes || !requirements) return workflowJson;
  const req = requirements;
  const get = (key) => {
    if (req[key] !== undefined) return req[key];
    const found = Object.keys(req).find(k => k.toLowerCase() === String(key).toLowerCase());
    return found ? req[found] : undefined;
  };
  for (const node of workflowJson.nodes) {
    const typeLower = `${node.type}`.toLowerCase();
    node.parameters = node.parameters || {};
    if (typeLower.includes('schedule')) {
      const tz = get('TIMEZONE');
      const cron = get('SCHEDULE_CRON');
      const hour = get('SCHEDULE_HOUR');
      const minute = get('SCHEDULE_MINUTE');
      if (cron) {
        node.parameters.triggerAt = 'cron';
        node.parameters.cronExpression = cron;
      } else if (hour !== undefined || minute !== undefined) {
        node.parameters.triggerAt = 'hour';
        if (hour !== undefined) node.parameters.hour = Number(hour);
        if (minute !== undefined) node.parameters.minute = Number(minute);
      }
      if (tz) node.parameters.timezone = tz;
    }
    if (typeLower.includes('email')) {
      const host = get('SMTP_HOST');
      const port = get('SMTP_PORT');
      const security = (get('SMTP_SECURITY') || '').toString().toLowerCase();
      const senderEmail = get('SENDER_EMAIL');
      const senderName = get('SENDER_NAME');
      const senderPassword = get('SENDER_PASSWORD');
      const to = get('RECIPIENT_EMAIL') || get('TO_EMAIL');
      const subject = get('EMAIL_SUBJECT');
      const body = get('EMAIL_BODY');
      if (host || port || senderEmail || senderPassword) {
        node.parameters.authentication = 'smtp';
        if (host) node.parameters.host = host;
        if (port) node.parameters.port = Number(port);
        if (security) {
          node.parameters.secure = security === 'tls' || security === 'ssl';
        }
        if (senderEmail) node.parameters.user = senderEmail;
        if (senderPassword) node.parameters.password = senderPassword;
      }
      if (senderEmail) node.parameters.fromEmail = senderEmail;
      if (senderName) node.parameters.fromName = senderName;
      if (to) node.parameters.to = to;
      if (subject) node.parameters.subject = subject;
      if (body) {
        const looksHtml = /<[^>]+>/.test(String(body));
        if (looksHtml) node.parameters.html = body; else node.parameters.text = body;
      }
    }
  }
  return workflowJson;
}

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

Do not add parameters that you are unsure about. Refer to the documentation for the exact json and params.

***ATTENTION***
If you need to add a typeversion, 
preferably add 2.1 like for send email add 2.1
 instead of 3.1 etc and Make sure that the id of the node is proper


9. example of calendar trigger:
   {
  "nodes": [
    {
      "parameters": {
        "pollTimes": {
          "item": [
            {
              "mode": "everyMinute"
            }
          ]
        },
        "calendarId": {
          "__rl": true,
          "mode": "list",
          "value": ""
        },
        "triggerOn": "eventCancelled",
        "options": {}
      },
      "type": "n8n-nodes-base.googleCalendarTrigger",
      "typeVersion": 1,
      "position": [
        542.5,
        128
      ],
      "id": "d395442e-3927-41ec-a2b8-9351bfa495e6",
      "name": "Google Calendar Trigger"
    }
  ],
  "connections": {},
  "pinData": {},
  "meta": {
    "instanceId": "d1c2fca825712eda646b876f38ccbf54aab636ae27dd2d0e1ebc111fda9d6626"
  }
}

10. PARAMETER MAPPING EXAMPLES:
    - For email nodes: use provided SMTP_HOST, SMTP_PORT, SENDER_EMAIL, RECIPIENT_EMAIL, EMAIL_SUBJECT, EMAIL_BODY
    - For schedule nodes: use provided SCHEDULE_CONFIG, TIMEZONE  
    - For Slack nodes: use provided SLACK_TOKEN, SLACK_CHANNEL, MESSAGE_TEMPLATE
    - For webhook nodes: use provided configuration values


I have added a pdf for your reference so that you know how to do things, go through it thoroughly.

`;

const REQUIREMENTS_PROMPT = `
You are an expert in analyzing automation requests for n8n workflows. Your task is to analyze a user's automation request and return a JSON object that identifies the technical details needed to build a production-ready workflow.

IMPORTANT:
- Prioritize the most critical information. Ask a maximum of two of the most vital questions to get the user started.
- Focus on what is absolutely necessary for a basic, functional workflow. You can ask about credentials, key identifiers (like a specific channel or repository), or the main content for a message.

Return ONLY a JSON object with this exact structure:
{
  "workflowSkeleton": {
    "name": "Brief descriptive name",
    "description": "What this workflow will do",
    "triggerType": "webhook|schedule|manual|email|etc",
    "steps": [
      {
        "stepNumber": 1,
        "action": "Description of what this step does",
        "nodeType": "n8n node type",
        "placeholder": "PLACEHOLDER_NAME"
      }
    ]
  },
  "requiredFields": [
    {
      "fieldName": "PLACEHOLDER_NAME",
      "label": "User-friendly label",
      "type": "text|email|url|number|dropdown|textarea|password",
      "description": "What information is needed",
      "required": true|false,
      "options": ["option1", "option2"]
    }
  ]
}
`;

// --- API Endpoints ---
// app.post('/extract-requirements', async (req, res) => {
//     const { prompt } = req.body;
//     try {
//         const fullPrompt = `${REQUIREMENTS_PROMPT}\n\nUser Request: ${prompt}`;

//         const client = await auth.getClient();
//         const accessToken = (await client.getAccessToken()).token;

//         const vertexAIResponse = await axios.post(
//             VERTEX_AI_API_URL,
//             {
//                 "contents": [{
//                     "role": "user", // <-- ADDED THIS LINE
//                     "parts": [{ "text": fullPrompt }]
//                 }]
//             },
//             {
//                 headers: {
//                     'Authorization': `Bearer ${accessToken}`,
//                     'Content-Type': 'application/json'
//                 }
//             }
//         );

//         let requirementsJson = vertexAIResponse.data;
//         if (requirementsJson.candidates && requirementsJson.candidates[0]?.content?.parts[0]?.text) {
//             let text = requirementsJson.candidates[0].content.parts[0].text.trim();
//             text = text.replace(/^```json\n|^```|```$/g, '').trim();
//             try {
//                 requirementsJson = JSON.parse(text);
//                 requirementsJson = enrichRequirements(requirementsJson);
//                 res.json({
//                     message: 'Requirements extracted successfully',
//                     requirements: requirementsJson,
//                 });
//             } catch (e) {
//                 return res.status(400).json({ message: 'Vertex AI did not return valid requirements JSON', error: e.message, text });
//             }
//         } else {
//             return res.status(400).json({ message: 'No valid requirements response from Vertex AI', data: requirementsJson });
//         }
//     } catch (error) {
//         console.error('Requirements extraction error:', error.response ? error.response.data : error.message);
//         res.status(500).json({
//             message: 'Error extracting requirements',
//             error: error.message,
//         });
//     }
// });

app.post('/n8n-workflow', async (req, res) => {
    let { prompt, requirements } = req.body;
    try {
        let enhancedPrompt = prompt;
        if (requirements && Object.keys(requirements).length > 0) {
          //  enhancedPrompt += `\n\n=== USER PROVIDED SPECIFIC CONFIGURATION VALUES ===\n`;
          //  enhancedPrompt += `The user has provided these exact values. You MUST use these in the node parameters:\n\n`;
          //  for (const [fieldName, value] of Object.entries(requirements)) {
          //      enhancedPrompt += `${fieldName}: "${value}"\n`;
          //  }
          //  enhancedPrompt += `\n=== MANDATORY PARAMETER MAPPING ===\n`;
          //  enhancedPrompt += `- SMTP_HOST → Use in email node's "host" parameter\n`;
          //  enhancedPrompt += `- SMTP_PORT → Use in email node's "port" parameter\n`;
          //  enhancedPrompt += `- SMTP_SECURITY → Use in email node's "secure" parameter (true for SSL, false for TLS)\n`;
          //  enhancedPrompt += `- SENDER_EMAIL → Use in email node's "fromEmail" parameter\n`;
          //  enhancedPrompt += `- SENDER_NAME → Use in email node's "fromName" parameter\n`;
          //  enhancedPrompt += `- SENDER_PASSWORD → Use in email node's "password" parameter\n`;
          //  enhancedPrompt += `- RECIPIENT_EMAIL → Use in email node's "to" parameter\n`;
          //  enhancedPrompt += `- EMAIL_SUBJECT → Use in email node's "subject" parameter\n`;
          //  enhancedPrompt += `- EMAIL_BODY → Use in email node's "text" or "html" parameter\n`;
          //  enhancedPrompt += `- SCHEDULE_CONFIG → Use in schedule node's cron expression\n`;
          //  enhancedPrompt += `- TIMEZONE → Use in schedule node's "timezone" parameter\n`;
          //  enhancedPrompt += `\nEXAMPLE: If SENDER_EMAIL is "john@company.com", the email node must have "fromEmail": "john@company.com"\n`;
          //  enhancedPrompt += `EXAMPLE: If EMAIL_SUBJECT is "Daily Sales Report", the email node must have "subject": "Daily Sales Report"\n`;
          //  enhancedPrompt += `DO NOT use placeholder values like "example@email.com" - use the EXACT provided values!\n`;
        }

        const fullPrompt = `${SYSTEM_PROMPT}\n${enhancedPrompt}`;
        
        const client = await auth.getClient();
        const accessToken = (await client.getAccessToken()).token;

        const pdfPath = 'master.pdf'; // put your path here
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfBuffer.toString('base64');
        
        const vertexAIResponse = await axios.post(
            VERTEX_AI_API_URL,
            {
                "contents": [{
                    "role": "user",
                    "parts": [
                      { "text": fullPrompt },
                      { "inlineData": { "mimeType": "application/pdf", "data": pdfBase64 } }
                    ]
                }]
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        let workflowJson = vertexAIResponse.data;
        if (workflowJson.candidates && workflowJson.candidates[0]?.content?.parts[0]?.text) {
            let text = workflowJson.candidates[0].content.parts[0].text.trim();
            text = text.replace(/^```json\n|^```|```$/g, '').trim();
            try {
                workflowJson = JSON.parse(text);
                if (!workflowJson.name || !workflowJson.nodes || !workflowJson.connections || !workflowJson.settings) {
                    throw new Error('Invalid JSON structure: Missing required fields');
                }
                workflowJson.nodes = workflowJson.nodes.map(node => ({ ...node, id: node.id || uuidv4() }));
            } catch (e) {
                return res.status(400).json({ message: 'Vertex AI did not return valid JSON', error: e.message, text });
            }
        } else {
            return res.status(400).json({ message: 'No valid response from Vertex AI', data: workflowJson });
        }

        if (requirements && Object.keys(requirements).length > 0) {
            workflowJson = applyRequirementsToWorkflow(workflowJson, requirements);
        }

        const n8nRes = await axios({
            method: 'POST',
            url: N8N_API_URL,
            data: workflowJson,
            headers: {
                'X-N8N-API-KEY': N8N_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            timeout: 10000,
        });

        res.json({
            message: 'Workflow created in n8n',
            n8nResponse: n8nRes.data,
            workflowJson,
        });
    } catch (error) {
        console.error('n8n API error:', error.response ? error.response.data : error.message);
        res.status(error.response?.status || 500).json({
            message: 'Error creating workflow in n8n',
            error: error.message,
            details: error.response?.data,
        });
    }
});

app.listen(3000, () => console.log('Backend running on http://localhost:3000'));