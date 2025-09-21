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

// --- Helpers: Requirements enrichment and workflow application ---
/**
 * Ensure field exists (by fieldName) in requiredFields array
 */
function ensureField(requiredFields, field) {
  if (!Array.isArray(requiredFields)) return;
  if (!requiredFields.some(f => f.fieldName === field.fieldName)) {
    requiredFields.push(field);
  }
}

/**
 * Enrich requirements with domain-specific fields based on detected node types
 */
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
      // Prefer cron when possible; fall back to hour/minute if user wants simpler
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

/**
 * Apply user-provided requirement values directly to workflow JSON deterministically
 */
function applyRequirementsToWorkflow(workflowJson, requirements) {
  if (!workflowJson || !workflowJson.nodes || !requirements) return workflowJson;
  const req = requirements;

  const get = (key) => {
    if (req[key] !== undefined) return req[key];
    // Try case-insensitive match
    const found = Object.keys(req).find(k => k.toLowerCase() === String(key).toLowerCase());
    return found ? req[found] : undefined;
  };

  for (const node of workflowJson.nodes) {
    const typeLower = `${node.type}`.toLowerCase();
    node.parameters = node.parameters || {};

    // Schedule trigger mapping
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

    // Email send mapping (handle both emailSend and sendEmail strings)
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

      // Prefer SMTP auth when enough info present
      if (host || port || senderEmail || senderPassword) {
        node.parameters.authentication = 'smtp';
        if (host) node.parameters.host = host;
        if (port) node.parameters.port = Number(port);
        if (security) {
          // Map security to boolean secure (tls -> true, starttls/none -> false)
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

// --- Helpers: Robust JSON parsing from model output ---
/** Strip Markdown code fences from text */
function stripCodeFences(text) {
  if (!text) return '';
  return String(text)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/** Extract the first balanced JSON value (object or array) from arbitrary text */
function extractFirstJsonValue(text) {
  if (!text) throw new Error('Empty text');
  const s = String(text);
  let start = -1;
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (stack.length === 0) start = i;
      stack.push(ch === '{' ? '}' : ']');
    } else if ((ch === '}' || ch === ']') && stack.length > 0) {
      const expected = stack[stack.length - 1];
      if (ch === expected) stack.pop();
      if (stack.length === 0 && start !== -1) {
        return s.slice(start, i + 1);
      }
    }
  }
  throw new Error('No balanced JSON value found');
}

/** Parse model output into JSON, tolerating extra prose */
function parseModelJson(text) {
  const stripped = stripCodeFences(text);
  const jsonStr = extractFirstJsonValue(stripped);
  return JSON.parse(jsonStr);
}

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

9. ABSOLUTELY CRITICAL - REQUIREMENTS IMPLEMENTATION:
   - If the user provides specific requirements/values anywhere in the prompt, you MUST use those exact values in the node parameters
   - NEVER use placeholder values like "example@email.com", "your-password", "Your Subject Here" when real values are provided
   - Look for patterns like "SMTP_HOST: smtp.gmail.com" and use "smtp.gmail.com" in the SMTP configuration
   - Look for patterns like "RECIPIENT_EMAIL: user@example.com" and use "user@example.com" in the email node
   - Look for patterns like "EMAIL_SUBJECT: Daily Report" and use "Daily Report" as the subject
   - The node parameters MUST reflect the actual user-provided values, not generic placeholders
   - This is a HARD REQUIREMENT - failure to use provided values makes the workflow useless

10. PARAMETER MAPPING EXAMPLES:
    - For email nodes: use provided SMTP_HOST, SMTP_PORT, SENDER_EMAIL, RECIPIENT_EMAIL, EMAIL_SUBJECT, EMAIL_BODY
    - For schedule nodes: use provided SCHEDULE_CONFIG, TIMEZONE  
    - For Slack nodes: use provided SLACK_TOKEN, SLACK_CHANNEL, MESSAGE_TEMPLATE
    - For webhook nodes: use provided configuration values
`;

// Requirements extraction prompt
const REQUIREMENTS_PROMPT = `
You are an expert in analyzing automation requests for n8n workflows. Your task is to analyze a user's automation request and return a JSON object that identifies ALL the specific technical details needed to build a production-ready workflow.

IMPORTANT: Be comprehensive but concise — only ask up to 8 essential questions to cover:
1. Authentication credentials or API keys
2. Connection details (SMTP, database, webhook, etc.)
3. Input data format and source
4. Output data format and destination
5. Workflow trigger type and timing
6. Configuration parameters (filters, templates, etc.)
7. Error handling or fallback preferences
8. Notification preferences (if any)

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
      "options": ["option1", "option2"] // only for dropdown type
    }
  ]
}
`

// New endpoint: extract requirements from user query
app.post('/extract-requirements', async (req, res) => {
  const { prompt } = req.body;
  try {
    const fullPrompt = `${REQUIREMENTS_PROMPT}\n\nUser Request: ${prompt}`;
    console.log('--- Requirements Extraction Prompt ---');
    console.log(fullPrompt);

    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + GEMINI_API_KEY,
      {
        contents: [{ parts: [{ text: fullPrompt }] }],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('--- Raw Gemini Requirements Response ---');
    console.dir(geminiResponse.data, { depth: null });

  let requirementsJson = geminiResponse.data;
    if (requirementsJson.candidates && requirementsJson.candidates[0]?.content?.parts[0]?.text) {
      let text = requirementsJson.candidates[0].content.parts[0].text.trim();
      console.log('--- Raw Requirements Text from Gemini ---');
      console.log(text);

      try {
        requirementsJson = parseModelJson(text);
        // Enrich with domain-specific fields
        requirementsJson = enrichRequirements(requirementsJson);
        console.log('--- Parsed Requirements JSON ---');
        console.dir(requirementsJson, { depth: null });
      } catch (e) {
        console.error('Requirements JSON parsing error:', e.message, { text });
        return res.status(400).json({ message: 'Gemini did not return valid requirements JSON', error: e.message, text });
      }
    } else {
      return res.status(400).json({ message: 'No valid requirements response from Gemini', data: requirementsJson });
    }

    res.json({
      message: 'Requirements extracted successfully',
      requirements: requirementsJson,
    });
  } catch (error) {
    console.error('Requirements extraction error:', error.message);
    res.status(500).json({
      message: 'Error extracting requirements',
      error: error.message,
    });
  }
});

// Enhanced endpoint: create workflow from prompt and requirements
app.post('/n8n-workflow', async (req, res) => {
  let { prompt, requirements } = req.body;
  try {
    console.log('--- Received Request ---');
    console.log('Original Prompt:', prompt);
    console.log('Requirements:', requirements);
    
    // Enhanced prompt that includes requirements if provided
    let enhancedPrompt = prompt;
    if (requirements && Object.keys(requirements).length > 0) {
      enhancedPrompt += `\n\n=== USER PROVIDED SPECIFIC CONFIGURATION VALUES ===\n`;
      enhancedPrompt += `The user has provided these exact values. You MUST use these in the node parameters:\n\n`;
      
      for (const [fieldName, value] of Object.entries(requirements)) {
        enhancedPrompt += `${fieldName}: "${value}"\n`;
      }
      
      enhancedPrompt += `\n=== MANDATORY PARAMETER MAPPING ===\n`;
      enhancedPrompt += `You MUST map these user values to node parameters as follows:\n`;
      enhancedPrompt += `- SMTP_HOST → Use in email node's "host" parameter\n`;
      enhancedPrompt += `- SMTP_PORT → Use in email node's "port" parameter\n`;
      enhancedPrompt += `- SMTP_SECURITY → Use in email node's "secure" parameter (true for SSL, false for TLS)\n`;
      enhancedPrompt += `- SENDER_EMAIL → Use in email node's "fromEmail" parameter\n`;
      enhancedPrompt += `- SENDER_NAME → Use in email node's "fromName" parameter\n`;
      enhancedPrompt += `- SENDER_PASSWORD → Use in email node's "password" parameter\n`;
      enhancedPrompt += `- RECIPIENT_EMAIL → Use in email node's "to" parameter\n`;
      enhancedPrompt += `- EMAIL_SUBJECT → Use in email node's "subject" parameter\n`;
      enhancedPrompt += `- EMAIL_BODY → Use in email node's "text" or "html" parameter\n`;
      enhancedPrompt += `- SCHEDULE_CONFIG → Use in schedule node's cron expression\n`;
      enhancedPrompt += `- TIMEZONE → Use in schedule node's "timezone" parameter\n`;
      enhancedPrompt += `\nEXAMPLE: If SENDER_EMAIL is "john@company.com", the email node must have "fromEmail": "john@company.com"\n`;
      enhancedPrompt += `EXAMPLE: If EMAIL_SUBJECT is "Daily Sales Report", the email node must have "subject": "Daily Sales Report"\n`;
      enhancedPrompt += `DO NOT use placeholder values like "example@email.com" - use the EXACT provided values!\n`;
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n${enhancedPrompt}`;
    console.log('--- Full Prompt Sent to Gemini ---');
    console.log(fullPrompt);

    // 1. Get workflow JSON from Gemini
    const geminiResponse = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=' + GEMINI_API_KEY,
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
      try {
        workflowJson = parseModelJson(text);
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

    // 2.a Apply user-provided requirements deterministically into the workflow JSON
    if (requirements && Object.keys(requirements).length > 0) {
      workflowJson = applyRequirementsToWorkflow(workflowJson, requirements);
      console.log('--- Workflow JSON after applying requirements ---');
      console.dir(workflowJson, { depth: null });
    }

    // 2.b Send workflow JSON to n8n REST API
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