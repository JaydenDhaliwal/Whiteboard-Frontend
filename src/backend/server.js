const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3001;

// --- IMPORTANT SECURITY NOTE ---
// In a production app, you should configure CORS more securely.
// For this demo, we'll allow all origins.
app.use(cors());

// The express.json middleware is needed to parse the base64 string
// from the request body. We increase the limit to handle large image files.
app.use(express.json({ limit: '10mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/api/recognize', async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Image data is required.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Remove the data URI prefix (e.g., "data:image/png;base64,")
    const base64ImageData = image.split(',')[1];

    const imagePart = {
      inlineData: {
        data: base64ImageData,
        mimeType: 'image/png',
      },
    };

    const prompt = "Transcribe the handwritten text in this image. Focus only on the characters you see. If it is a mathematical equation, write it out exactly as you see it.";

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;
    const text = response.text();

    console.log('Gemini Response:', text);
    res.json({ text });

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ error: 'Failed to recognize image.' });
  }
});

app.post('/api/analyze', async (req, res) => {
  const { image, json } = req.body;

  if (!image || !json) {
    return res.status(400).json({ error: 'Image and JSON data are required.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const base64ImageData = image.split(',')[1];
    const imagePart = {
      inlineData: { data: base64ImageData, mimeType: 'image/png' },
    };

    const prompt = `
      You are an expert math tutor AI. Your task is to analyze a student's work from a digital whiteboard.
      You will be given a JSON object representing the entire whiteboard state and a PNG image of the whiteboard.
      
      Follow these steps:
      1. Analyze the handwritten equation in the provided image.
      2. Check if the equation is mathematically correct.
      3. Based on your analysis, add a single new 'note' shape to the JSON data with your feedback.
      4. If the work is correct, make the note green and provide positive feedback.
      5. If the work is incorrect, make the note red and provide a clear, helpful explanation of the error and guide the student toward the correct answer.
      6. Position the new note to the right of the existing drawing, not overlapping it.
      7. VERY IMPORTANT: Your final output must be ONLY the modified, complete, and perfectly valid tldraw JSON string. Do not include any other text, explanations, or formatting like markdown code blocks.
    `;

    const result = await model.generateContent([prompt, JSON.stringify(json, null, 2), imagePart]);
    const response = result.response;
    const modifiedJsonText = response.text();
    
    // Attempt to parse the LLM's response to ensure it's valid JSON
    const modifiedJson = JSON.parse(modifiedJsonText);

    console.log('Gemini Analysis Response (valid JSON received)');
    res.json(modifiedJson);

  } catch (error) {
    console.error('Error during Gemini analysis:', error);
    res.status(500).json({ error: 'Failed to analyze whiteboard.' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
}); 