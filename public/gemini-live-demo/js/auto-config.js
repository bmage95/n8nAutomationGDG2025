// Auto-initialize with API key from backend
(function() {
    // Set the API key if not already set
    if (!localStorage.getItem('apiKey')) {
        localStorage.setItem('apiKey', 'AIzaSyDG5wfea79XKJ82lIy0BJ98ibeTh67FZtE');
    }
    
    // Set default settings for better experience
    if (!localStorage.getItem('temperature')) {
        localStorage.setItem('temperature', '1.0');
        localStorage.setItem('top_p', '0.95');
        localStorage.setItem('top_k', '40');
        localStorage.setItem('voiceName', 'Aoede');
        localStorage.setItem('sampleRate', '24000');
        localStorage.setItem('systemInstructions', 'You are a helpful AI assistant. Be conversational and friendly.');
    }
    
    console.log('Gemini Live Demo auto-configured with API key');
})();