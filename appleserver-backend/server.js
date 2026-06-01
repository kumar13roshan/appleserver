const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Define structured JSON schema for Gemini response
const responseSchema = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: 'The relative file path, e.g., "src/index.js", "style.css", "index.html"' 
          },
          content: { 
            type: 'string', 
            description: 'The full source code content for this file.' 
          }
        },
        required: ['path', 'content']
      }
    }
  },
  required: ['files']
};

// Helper function to dynamically load all configured Gemini API keys
function getApiKeys() {
  const keys = [];

  const addKeyIfValid = (key) => {
    if (key) {
      const trimmed = key.trim();
      // Skip empty keys or placeholder values
      if (trimmed && !trimmed.startsWith('YOUR_') && !trimmed.includes('placeholder')) {
        keys.push(trimmed);
      }
    }
  };
  
  // 1. Check standard GEMINI_API_KEY (handles comma-separated string too)
  const primaryKey = process.env.GEMINI_API_KEY;
  if (primaryKey) {
    if (primaryKey.includes(',')) {
      primaryKey.split(',').forEach(addKeyIfValid);
    } else {
      addKeyIfValid(primaryKey);
    }
  }

  // 2. Check for multiple indexed keys (e.g., GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc.)
  let index = 2;
  while (true) {
    const key = process.env[`GEMINI_API_KEY_${index}`];
    if (key) {
      addKeyIfValid(key);
      index++;
    } else {
      break;
    }
  }

  return keys;
}

// Verify that at least one API key is present at startup
const configuredKeys = getApiKeys();
if (configuredKeys.length === 0) {
  console.error('❌ Error: No Gemini API keys are defined in the environment (e.g., GEMINI_API_KEY)!');
  process.exit(1);
} else {
  console.log(`🍎 AppleServer initialized with ${configuredKeys.length} API Key(s) in rotation.`);
}

app.post('/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  console.log(`📡 Received prompt: "${prompt}"`);

  const keys = getApiKeys();
  if (keys.length === 0) {
    console.error('❌ Error: All API keys were removed or are empty!');
    return res.status(500).json({ error: 'No Gemini API keys are configured on the server.' });
  }

  // Start at a random index to balance the load across all available keys
  const startIndex = Math.floor(Math.random() * keys.length);
  let success = false;
  let lastError = null;

  // Try each key sequentially starting from our random index
  for (let i = 0; i < keys.length; i++) {
    const currentKeyIndex = (startIndex + i) % keys.length;
    const currentKey = keys[currentKeyIndex];
    
    // Mask key in console logs for security
    const maskedKey = currentKey.length > 12 
      ? `${currentKey.substring(0, 8)}...${currentKey.substring(currentKey.length - 4)}` 
      : '***';

    console.log(`🔑 Trying API Key ${currentKeyIndex + 1}/${keys.length} (${maskedKey})`);

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
    let keySuccess = false;

    for (const modelName of modelsToTry) {
      try {
        console.log(`🤖 Trying model ${modelName} with Key ${currentKeyIndex + 1}...`);
        const genAI = new GoogleGenerativeAI(currentKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: 'You are a professional software scaffolding assistant. Based on the user\'s prompt, generate a fully functional, high-quality codebase structure. Return the relative paths and contents for all necessary files in the project. To prevent gateway timeouts, write clean, highly concise, and modular code. Avoid bloated comments, redundant code, or excessively large boilerplate files. Focus on the core functionality so that the response generates quickly and stays within size limits. The content of each file MUST be formatted beautifully with proper indentation, standard spacing, and clear newlines (\\n). DO NOT minify the code. Strictly adhere to the requested JSON response schema.'
        });

        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
          }
        });

        const text = result.response.text();
        const data = JSON.parse(text);

        console.log(`✅ Successfully generated ${data.files ? data.files.length : 0} files using Key ${currentKeyIndex + 1} and model ${modelName}.`);
        res.json(data);
        success = true;
        keySuccess = true;
        break; // Exit the model loop on success

      } catch (error) {
        console.error(`⚠️ Model ${modelName} failed with Key ${currentKeyIndex + 1}:`, error.message || error);
        lastError = error;
        // Try the next model
      }
    }

    if (keySuccess) {
      break; // Exit the key loop on success
    }
  }

  if (!success) {
    console.error('❌ All configured API keys failed to generate content.');
    res.status(500).json({ 
      error: 'All configured Gemini API keys failed. Last error: ' + (lastError ? lastError.message : 'Unknown error') 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('<h1>🍎 AppleServer is Live!</h1><p>Scaffolding beautiful codebases globally.</p>');
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, () => {
  console.log(`🚀 Appleserver-backend running on http://localhost:${PORT}`);
});
