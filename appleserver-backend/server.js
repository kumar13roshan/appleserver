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
            description: 'The full, beautifully formatted, multi-line source code content for this file. Must contain actual newline characters (\\n) and proper indentation. Do NOT return the code as a single line or minified.'
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

// Robust JSON parser and extractor for model responses
function cleanAndParseJson(text) {
  if (!text) {
    throw new Error('Received empty text from Gemini API');
  }

  let cleanText = text.trim();

  // Strip Markdown code blocks if present
  if (cleanText.startsWith('```')) {
    const match = cleanText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match && match[1]) {
      cleanText = match[1].trim();
    }
  }

  try {
    return JSON.parse(cleanText);
  } catch (err) {
    const startIdx = cleanText.indexOf('{');
    const endIdx = cleanText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const candidate = cleanText.substring(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate);
      } catch (innerErr) {
        throw new Error(`JSON parsing failed: ${err.message}. Raw: ${text.substring(0, 100)}...`);
      }
    }
    throw new Error(`JSON parsing failed: ${err.message}. Raw: ${text.substring(0, 100)}...`);
  }
}

// Check if error is key-specific (specifically invalid or unauthorized keys)
function isKeyInvalid(errorMessage) {
  if (!errorMessage) return false;
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('unauthorized') ||
    msg.includes('api key is invalid') ||
    msg.includes('key invalid')
  );
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

  // Handle extremely large prompts: check length and sanitize
  if (prompt.length > 50000) {
    console.warn(`⚠️ Warning: Prompt length is very large (${prompt.length} chars).`);
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

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];
    let skipKey = false;

    for (const modelName of modelsToTry) {
      if (skipKey) break;

      try {
        console.log(`🤖 Trying model ${modelName} with Key ${currentKeyIndex + 1}...`);
        
        // Setup AbortController for a 90-second timeout on model generation to avoid gateway timeouts
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        const genAI = new GoogleGenerativeAI(currentKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: 'You are a professional software scaffolding assistant. Based on the user\'s prompt, generate a fully functional, high-quality codebase structure. Return the relative paths and contents for all necessary files in the project. To prevent gateway timeouts, write clean, highly concise, and modular code. Avoid bloated comments, redundant code, or excessively large boilerplate files. Focus on the core functionality so that the response generates quickly and stays within size limits. The content of each file MUST be formatted beautifully with standard multi-line formatting, proper indentation, and actual newline characters (\\n) between statements. Under no circumstances should the code for a file be minified or squashed onto a single line. Strictly adhere to the requested JSON response schema.'
        });

        // Wrap call in a timeout promise
        const generationPromise = model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
          }
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Gemini API call timed out after 90 seconds')), 90000);
        });

        const result = await Promise.race([generationPromise, timeoutPromise]);
        clearTimeout(timeoutId);

        // Check if blocked by safety filters
        if (result.response.promptFeedback?.blockReason) {
          throw new Error(`Prompt blocked by Gemini Safety Filter: ${result.response.promptFeedback.blockReason}`);
        }

        const text = result.response.text();
        const data = cleanAndParseJson(text);

        console.log(`✅ Successfully generated ${data.files ? data.files.length : 0} files using Key ${currentKeyIndex + 1} and model ${modelName}.`);
        res.json(data);
        success = true;
        break; // Exit the model loop on success

      } catch (error) {
        const errMsg = error.message || error.toString();
        console.error(`⚠️ Model ${modelName} failed with Key ${currentKeyIndex + 1}:`, errMsg);
        lastError = error;

        // If the API Key itself is invalid, skip trying other models with this key.
        // For rate limits, 503s, or model restrictions, continue trying other models.
        if (isKeyInvalid(errMsg)) {
          console.warn(`🛑 Key ${currentKeyIndex + 1} is invalid or unauthorized. Skipping other models for this key.`);
          skipKey = true;
        }
      }
    }

    if (success) {
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
