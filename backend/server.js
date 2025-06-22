const express = require('express');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const path = require('path');
const cors = require('cors'); // Required for cross-origin requests from your frontend

const app = express();
const port = 3001; // Choose a port that isn't already in use by your frontend (Vite usually uses 5173)

// Explicitly set the path to your service account key file
// Make sure this path is correct relative to where your server.js is located
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'berkeleyaihackathon-f5e4780fd20e.json');

const client = new ImageAnnotatorClient();

app.use(cors()); // Enable CORS for requests from your frontend
app.use(express.json({ limit: '10mb' })); // Increase limit for larger image data

app.post('/api/ocr-vision', async (req, res) => {
  try {
    console.log('OCR request received');
    const imageData = req.body.imageData;

    if (!imageData) {
      console.log('No image data provided');
      return res.status(400).json({ error: 'No image data provided.' });
    }

    console.log('Image data received, length:', imageData.length);
    console.log('Sending to Google Cloud Vision AI...');

    // Google Cloud Vision API request
    const [result] = await client.textDetection({
      image: {
        content: imageData,
      },
    });

    console.log('Google Cloud Vision AI response received');
    const detections = result.textAnnotations;
    
    if (detections && detections.length > 0) {
      console.log('Text detections found:', detections.length);
      
      const fullText = detections[0].description;
      const wordAnnotations = detections.slice(1).map(annotation => ({
        text: annotation.description,
        bbox: {
          x_min: Math.min(...annotation.boundingPoly.vertices.map(v => v.x || 0)),
          y_min: Math.min(...annotation.boundingPoly.vertices.map(v => v.y || 0)),
          x_max: Math.max(...annotation.boundingPoly.vertices.map(v => v.x || 0)),
          y_max: Math.max(...annotation.boundingPoly.vertices.map(v => v.y || 0)),
        },
        center_x: 0, // Will be calculated below
        center_y: 0, // Will be calculated below
      }));

      // Calculate center points for each detected element
      wordAnnotations.forEach(annotation => {
        annotation.center_x = (annotation.bbox.x_min + annotation.bbox.x_max) / 2;
        annotation.center_y = (annotation.bbox.y_min + annotation.bbox.y_max) / 2;
      });

      // Spatial Analysis for Mathematical Expressions
      const spatialAnalysis = performSpatialAnalysis(wordAnnotations);

      console.log('Full text detected:', fullText);
      console.log('Spatial analysis completed');
      
      res.json({
        fullText: fullText,
        wordAnnotations: wordAnnotations,
        spatialAnalysis: spatialAnalysis,
      });
    } else {
      console.log('No text detected in image');
      res.json({ fullText: '', wordAnnotations: [], spatialAnalysis: null });
    }

  } catch (error) {
    console.error('Google Cloud Vision AI Error Details:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error details:', error.details);
    console.error('Full error:', error);
    res.status(500).json({ error: 'Failed to process image with Vision AI.' });
  }
});

// Spatial Analysis Function for Mathematical Expressions
function performSpatialAnalysis(wordAnnotations) {
  console.log('Starting spatial analysis...');
  
  // Group elements by approximate horizontal lines (equations)
  const equations = groupIntoEquations(wordAnnotations);
  
  // Analyze each equation for mathematical structure
  const analyzedEquations = equations.map(equation => analyzeEquation(equation));
  
  return {
    totalElements: wordAnnotations.length,
    equations: analyzedEquations,
  };
}

function groupIntoEquations(annotations, yTolerance = 20) {
  const equations = [];
  const used = new Set();
  
  annotations.forEach((annotation, index) => {
    if (used.has(index)) return;
    
    const equation = [annotation];
    used.add(index);
    
    // Find other annotations on the same horizontal line
    annotations.forEach((other, otherIndex) => {
      if (used.has(otherIndex)) return;
      
      const yDiff = Math.abs(annotation.center_y - other.center_y);
      if (yDiff <= yTolerance) {
        equation.push(other);
        used.add(otherIndex);
      }
    });
    
    // Sort equation elements by x-coordinate (left to right)
    equation.sort((a, b) => a.center_x - b.center_x);
    equations.push(equation);
  });
  
  return equations;
}

function analyzeEquation(equationElements) {
  const elements = equationElements.map(el => el.text);
  const positions = equationElements.map(el => ({ x: el.center_x, y: el.center_y }));
  
  // Reconstruct the equation in left-to-right order
  const reconstructedEquation = elements.join(' ');
  
  // Identify mathematical components
  const numbers = elements.filter(el => /^\d+(\.\d+)?$/.test(el));
  const operators = elements.filter(el => /^[+\-*/=<>]$/.test(el));
  const variables = elements.filter(el => /^[a-zA-Z]$/.test(el));
  const mathSymbols = elements.filter(el => /^[Σπ√∫∑∞θγβδενξπρστυφχψωΩΔΘΛΞΠΣΥΦΨΩ]$/.test(el));
  
  // Detect equation type
  let equationType = 'unknown';
  if (operators.includes('=')) {
    equationType = 'equation';
  } else if (operators.some(op => ['+', '-', '*', '/'].includes(op))) {
    equationType = 'expression';
  } else if (numbers.length > 0 && operators.length === 0) {
    equationType = 'number_sequence';
  }
  
  return {
    originalElements: equationElements,
    reconstructedText: reconstructedEquation,
    components: {
      numbers,
      operators,
      variables,
      mathSymbols,
    },
    type: equationType,
    boundingBox: {
      x_min: Math.min(...equationElements.map(el => el.bbox.x_min)),
      y_min: Math.min(...equationElements.map(el => el.bbox.y_min)),
      x_max: Math.max(...equationElements.map(el => el.bbox.x_max)),
      y_max: Math.max(...equationElements.map(el => el.bbox.y_max)),
    },
  };
}

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
}); 