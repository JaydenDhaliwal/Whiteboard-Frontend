const express = require('express');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3001;

// Set the path to your service account key file
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'superb-celerity-463700-i9-2a5b9d4bc7a2.json');

const visionClient = new ImageAnnotatorClient();

// CORS configuration for frontend compatibility
const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

app.post('/api/ocr-vision', async (req, res) => {
  try {
    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided.' });
    }

    console.log('📝 Received image data for OCR processing...');

    const request = {
      image: {
        content: imageData,
      },
      features: [{ type: 'TEXT_DETECTION' }],
    };

    const [result] = await visionClient.annotateImage(request);
    const detections = result.textAnnotations;

    console.log('✅ Successfully processed image with Vision API.');
    
    if (detections && detections.length > 0) {
      console.log(`📄 Text detections found: ${detections.length} items`);
      console.log(`📖 Full text: "${detections[0].description}"`);
      
      // Create enhanced OCR result structure for frontend
      const enhancedResult = {
        fullText: detections[0].description,
        wordAnnotations: detections.slice(1).map(annotation => ({
          text: annotation.description,
          boundingBox: annotation.boundingPoly,
          confidence: annotation.confidence || 0.9
        })),
        spatialAnalysis: {
          elements: detections.slice(1).map(annotation => ({
            text: annotation.description,
            type: classifyTextType(annotation.description),
            position: {
              x: Math.min(...annotation.boundingPoly.vertices.map(v => v.x || 0)),
              y: Math.min(...annotation.boundingPoly.vertices.map(v => v.y || 0)),
              width: Math.max(...annotation.boundingPoly.vertices.map(v => v.x || 0)) - 
                     Math.min(...annotation.boundingPoly.vertices.map(v => v.x || 0)),
              height: Math.max(...annotation.boundingPoly.vertices.map(v => v.y || 0)) - 
                      Math.min(...annotation.boundingPoly.vertices.map(v => v.y || 0))
            },
            confidence: annotation.confidence || 0.9
          })),
          layout: 'detected',
          structure: 'mathematical'
        }
      };

      res.json(enhancedResult);
    } else {
      console.log('📭 No text detected in image');
      res.json({ 
        fullText: '', 
        wordAnnotations: [], 
        spatialAnalysis: {
          elements: [],
          layout: 'empty',
          structure: 'none'
        }
      });
    }

  } catch (error) {
    console.error('❌ Google Cloud Vision AI Error:', error.message);
    res.status(500).json({ 
      error: 'Failed to process image with Vision AI.', 
      details: error.message 
    });
  }
});

// Helper function to classify text elements
function classifyTextType(text) {
  const cleanText = text.trim();
  
  // Check if it's a number
  if (/^-?\d+(\.\d+)?$/.test(cleanText)) {
    return 'number';
  }
  
  // Check if it's an operator
  if (/^[+\-×÷=<>≤≥]$/.test(cleanText)) {
    return 'operator';
  }
  
  // Check if it's a variable (single letter, possibly with subscript)
  if (/^[a-zA-Z](_?\d+)?$/.test(cleanText)) {
    return 'variable';
  }
  
  // Check if it looks like an equation (contains equals sign)
  if (cleanText.includes('=')) {
    return 'equation';
  }
  
  // Default to word
  return 'word';
}

app.listen(port, () => {
  console.log(`🚀 Backend server listening at http://localhost:${port}`);
  console.log(`📡 CORS enabled for origins: ${allowedOrigins.join(', ')}`);
});