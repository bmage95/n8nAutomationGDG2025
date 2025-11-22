n8n Automation Agent & Gemini Live Demo (GDG 2025)
==================================================

This project is a dual-purpose AI application showcasing the capabilities of **Google's Gemini Models**. It integrates a React frontend with a Node.js backend to provide:

1.  **n8n Workflow Generator**: An AI agent (powered by Vertex AI/Gemini 1.5 Pro) that converts natural language requests into importable JSON workflows for [n8n](https://n8n.io/).
    
2.  **Gemini Live Interface**: A real-time, multimodal websocket client (powered by Gemini 2.0 Flash) supporting voice, camera, and screen sharing interactions.
    

🚀 Features
-----------

### 1\. n8n Workflow Generator

*   **Natural Language to JSON**: Describe your automation (e.g., _"Send me an email every time a row is added to Google Sheets"_), and the AI generates the node structure and connections.
    
*   **Context-Aware**: Utilizes a RAG approach by injecting a master.pdf containing n8n documentation to ensure accurate node parameter usage.
    
*   **Direct Upload**: Automatically pushes the generated workflow to your active n8n instance via API.
    

### 2\. Gemini Live (Multimodal)

*   **Real-time Conversation**: Low-latency voice interaction using WebSockets.
    
*   **Visual Understanding**: Stream your **Camera** or **Screen** to Gemini for real-time analysis and assistance.
    
*   **Audio Visualization**: Real-time audio waveform visualization.
    
*   **Tools**: Integration framework for tools (includes a Google Search placeholder).
    

🛠️ Tech Stack
--------------

*   **Frontend**: React, Vite, CSS Modules.
    
*   **Backend**: Node.js, Express.
    
*   **AI/ML**:
    
    *   Google Vertex AI (Gemini 1.5 Pro for workflow generation).
        
    *   Google Generative AI (Gemini 2.0 Flash for Live interface).
        
    *   Deepgram (for User/Model audio transcription).
        
*   **Integration**: n8n Public API.
    

📋 Prerequisites
----------------

Before running the project, ensure you have:

1.  **Node.js** (v18 or higher) installed.
    
2.  An active **n8n instance** (running locally on port 5678 or cloud-hosted).
    
3.  **Google Cloud Project** with Vertex AI API enabled.
    
4.  **Gemini API Key** (for the Live Demo) from [Google AI Studio](https://aistudio.google.com/).
    
5.  (Optional) **Deepgram API Key** for live transcription features.
    

⚙️ Installation & Setup

### 1️⃣ Backend

Handles communication with Gemini and n8n.

`
cd backend
npm install   
`

Place master.pdf (n8n documentation) inside the backend/ folder.

Create a .env:

`GOOGLE_APPLICATION_CREDENTIALS_JSON={...}  # Minified Service Account JSON  N8N_API_KEY=your_n8n_api_key   `

Start the server:

`   npm start   `

Backend URL: http://localhost:3000

### 2️⃣ Frontend

UI for Workflow Generation + Gemini Live.

From project root:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   npm install  npm run dev   `

If needed, update API URL in:

*   src/App.jsx
    
*   src/components/HomePage.jsx
    

Frontend URL: http://localhost:5173
