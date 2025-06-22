const express = require('express');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const path = require('path');
const cors = require('cors'); // Required for cross-origin requests from your frontend

const app = express();
const port = 3001; // Choose a port that isn't already in use by your frontend (Vite usually uses 5173)

// Explicitly set the path to your service account key file
// Make sure this path is correct relative to where your server.js is located
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'superb-celerity-463700-i9-2a5b9d4bc7a2.json');

const visionClient = new ImageAnnotatorClient();

// Explicitly define allowed origins
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
};

app.use(cors(corsOptions)); // Enable CORS with specific options
app.use(express.json({ limit: '10mb' })); // Increase limit for larger image data

app.post('/api/ocr-vision', async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    console.log('Received image data for OCR processing.');

    const request = {
      image: {
        content: imageData,
      },
      features: [{ type: 'TEXT_DETECTION' }],
    };

    const [result] = await visionClient.annotateImage(request);
    const detections = result.textAnnotations;

    console.log('Successfully processed image with Vision API.');
    
    // Send the raw annotations back to the frontend for the new pipeline to process.
    // The complex analysis is no longer done on the backend.
    res.json({
      fullTextAnnotation: result.fullTextAnnotation,
      wordAnnotations: detections
    });

  } catch (error) {
    console.error('Error in /api/ocr-vision:', error);
    res.status(500).json({ error: 'Failed to process image with Vision AI.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
}); 