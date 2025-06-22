const express = require('express');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const cors = require('cors'); // Required for cross-origin requests from your frontend

const app = express();
const port = 3001; // Choose a port that isn't already in use by your frontend (Vite usually uses 5173)

// Explicitly set the path to your service account key file
// Make sure this path is correct relative to where your server.js is located
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, 'berkeleyaihackathon-f5e4780fd20e.json');

const client = new ImageAnnotatorClient();

// Initialize Gemini AI
// Replace 'your-gemini-api-key-here' with your actual Gemini API key from Google AI Studio
const genAI = new GoogleGenerativeAI('AIzaSyDgX4ncN87Ef5UlJj81pVRijdAh1ENwF_E');

app.use(cors()); // Enable CORS for requests from your frontend
app.use(express.json({ limit: '10mb' })); // Increase limit for larger image data

app.post('/api/ocr-vision', async (req, res) => {
  try {
    console.log('OCR request received');
    const imageData = req.body.imageData;
    const coordinateMapping = req.body.coordinateMapping;

    if (!imageData) {
      console.log('No image data provided');
      return res.status(400).json({ error: 'No image data provided.' });
    }

    console.log('Image data received, length:', imageData.length);
    console.log('Coordinate mapping received:', coordinateMapping);
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

      // Calculate center points and convert to tldraw coordinates
      wordAnnotations.forEach(annotation => {
        annotation.center_x = (annotation.bbox.x_min + annotation.bbox.x_max) / 2;
        annotation.center_y = (annotation.bbox.y_min + annotation.bbox.y_max) / 2;
        
        // Convert from image coordinates to tldraw coordinates if mapping is provided
        if (coordinateMapping) {
          annotation.tldraw_coords = convertImageToTldrawCoords(annotation, coordinateMapping);
        }
      });

      // Spatial Analysis for Mathematical Expressions
      const spatialAnalysis = performSpatialAnalysis(wordAnnotations);

      console.log('Full text detected:', fullText);
      console.log('Spatial analysis completed');
      
      // Generate AI suggestions using Gemini
      console.log('Generating AI suggestions with Gemini...');
      const aiSuggestions = await generateAISuggestions(fullText, spatialAnalysis, wordAnnotations, coordinateMapping);
      console.log('AI suggestions generated:', aiSuggestions.length);
      
      const responseData = {
        fullText: fullText,
        wordAnnotations: wordAnnotations,
        spatialAnalysis: spatialAnalysis,
        aiSuggestions: aiSuggestions,
        coordinateMapping: coordinateMapping,
        tldrawCoordinates: coordinateMapping ? 'included' : 'not_provided',
      };
      
      // Log response data for debugging
      console.log('Response data structure:', {
        fullTextLength: fullText?.length || 0,
        wordAnnotationsCount: wordAnnotations?.length || 0,
        spatialAnalysisCount: spatialAnalysis?.equations?.length || 0,
        coordinateMappingPresent: !!coordinateMapping,
      });
      
      res.json(responseData);
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

// Simplified coordinate conversion - direct mapping from image to tldraw
function convertImageToTldrawCoords(annotation, coordinateMapping) {
  const { imageWidth, imageHeight } = coordinateMapping;
  
  // Simple 1:1 scale mapping with fixed offset
  // Since we're using fixed camera position, this should be consistent
  const scale = 0.5; // Scale down from image pixels to tldraw coordinates
  const offsetX = 0;   // No offset since we start at 0,0
  const offsetY = 0;
  
  const tldrawX = (annotation.center_x * scale) + offsetX;
  const tldrawY = (annotation.center_y * scale) + offsetY;
  
  return {
    center_x: tldrawX,
    center_y: tldrawY,
    bbox: {
      x_min: (annotation.bbox.x_min * scale) + offsetX,
      y_min: (annotation.bbox.y_min * scale) + offsetY,
      x_max: (annotation.bbox.x_max * scale) + offsetX,
      y_max: (annotation.bbox.y_max * scale) + offsetY,
    },
    width: (annotation.bbox.x_max - annotation.bbox.x_min) * scale,
    height: (annotation.bbox.y_max - annotation.bbox.y_min) * scale,
  };
}

// Generate AI suggestions using Gemini
async function generateAISuggestions(fullText, spatialAnalysis, wordAnnotations, coordinateMapping) {
  try {
    console.log('Initializing Gemini model...');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log('Gemini model initialized successfully');
    
    // Prepare context for Gemini
    const analysisContext = {
      detectedText: fullText,
      equations: spatialAnalysis.equations.map(eq => ({
        text: eq.reconstructedText,
        type: eq.type,
        components: eq.components
      })),
      totalElements: spatialAnalysis.totalElements
    };
    
    const prompt = `
You are an AI tutor analyzing a whiteboard with mathematical content. Based on the OCR analysis below, provide helpful feedback and suggestions.

DETECTED CONTENT:
${JSON.stringify(analysisContext, null, 2)}

Please provide specific, actionable feedback as a JSON array. Each suggestion should have:
- type: "text" for text suggestions, "arrow" for directional hints
- text: the suggestion text (keep it concise, under 50 characters)
- priority: "high", "medium", or "low"
- category: "correction", "clarification", "next_step", or "encouragement"
- associatedEquation: index of the equation this relates to (if applicable)

Focus on:
1. Mathematical errors or potential improvements
2. Missing steps in calculations
3. Clarifications needed
4. Next logical steps
5. Encouragement for good work

Respond ONLY with valid JSON array, no additional text.
`;

    console.log('Sending request to Gemini...');
    const result = await model.generateContent(prompt);
    console.log('Gemini response received');
    const response = await result.response;
    const text = response.text();
    
    console.log('Raw Gemini response:', text);
    
    // Parse the JSON response
    let suggestions = [];
    try {
      // Clean the response to extract JSON
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(text);
      }
    } catch (parseError) {
      console.error('Error parsing Gemini JSON response:', parseError);
      // Fallback to basic suggestions if parsing fails
      suggestions = [
        {
          type: 'text',
          text: 'AI analysis complete',
          priority: 'low',
          category: 'encouragement',
          associatedEquation: null
        }
      ];
    }
    
    // Add positioning information to suggestions with better spacing
    const positionedSuggestions = [];
    const usedPositions = []; // Track used positions to avoid overlaps
    
    suggestions.forEach((suggestion, index) => {
      let tldraw_coords = null;
      let arrowStart = null;
      let arrowEnd = null;
      
      if (suggestion.associatedEquation !== null && 
          spatialAnalysis.equations[suggestion.associatedEquation]) {
        // Position near the specific equation
        const equation = spatialAnalysis.equations[suggestion.associatedEquation];
        const equationCenter = {
          center_x: (equation.boundingBox.x_min + equation.boundingBox.x_max) / 2,
          center_y: (equation.boundingBox.y_min + equation.boundingBox.y_max) / 2,
          bbox: equation.boundingBox
        };
        
        if (coordinateMapping) {
          const equationTldraw = convertImageToTldrawCoords(equationCenter, coordinateMapping);
          
          // Calculate suggestion position with better spacing
          const suggestionWidth = suggestion.text.length * 8 + 40; // Approximate width
          const suggestionHeight = 40;
          
          // Try different positions around the equation to avoid overlaps
          const positions = [
            { x: equationTldraw.center_x + 150, y: equationTldraw.center_y - 50 }, // Right-up
            { x: equationTldraw.center_x + 150, y: equationTldraw.center_y + 50 }, // Right-down
            { x: equationTldraw.center_x - 150, y: equationTldraw.center_y - 50 }, // Left-up
            { x: equationTldraw.center_x - 150, y: equationTldraw.center_y + 50 }, // Left-down
            { x: equationTldraw.center_x, y: equationTldraw.center_y - 100 }, // Above
            { x: equationTldraw.center_x, y: equationTldraw.center_y + 100 }, // Below
          ];
          
          // Find first position that doesn't overlap
          let chosenPosition = positions[0];
          for (const pos of positions) {
            let overlaps = false;
            for (const usedPos of usedPositions) {
              const distance = Math.sqrt(Math.pow(pos.x - usedPos.x, 2) + Math.pow(pos.y - usedPos.y, 2));
              if (distance < 120) { // Minimum distance between suggestions
                overlaps = true;
                break;
              }
            }
            if (!overlaps) {
              chosenPosition = pos;
              break;
            }
          }
          
          tldraw_coords = chosenPosition;
          usedPositions.push(chosenPosition);
          
          // Create arrow pointing from suggestion to equation
          arrowStart = { x: tldraw_coords.x, y: tldraw_coords.y };
          arrowEnd = { x: equationTldraw.center_x, y: equationTldraw.center_y };
        }
      } else {
        // Position general suggestions in a grid pattern
        const suggestionsPerRow = 3;
        const row = Math.floor(index / suggestionsPerRow);
        const col = index % suggestionsPerRow;
        
        const baseX = coordinateMapping ? coordinateMapping.tldrawBounds.x + 100 : 100;
        const baseY = coordinateMapping ? coordinateMapping.tldrawBounds.y - 100 : 50;
        
        tldraw_coords = {
          x: baseX + (col * 200), // 200px spacing between columns
          y: baseY + (row * 80)   // 80px spacing between rows
        };
        
        usedPositions.push(tldraw_coords);
      }
      
      // Add the text suggestion
      positionedSuggestions.push({
        ...suggestion,
        tldraw_coords: tldraw_coords
      });
      
      // Add arrow if pointing to an equation
      if (arrowStart && arrowEnd) {
        positionedSuggestions.push({
          type: 'arrow',
          text: '', // Arrows don't need text
          priority: suggestion.priority,
          category: 'pointer',
          associatedEquation: suggestion.associatedEquation,
          arrowStart: arrowStart,
          arrowEnd: arrowEnd
        });
      }
    });
    
    console.log('Positioned suggestions:', positionedSuggestions.length);
    return positionedSuggestions;
    
  } catch (error) {
    console.error('Error generating AI suggestions:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    return [
      {
        type: 'text',
        text: 'AI analysis failed: ' + (error.message || 'Unknown error'),
        priority: 'low',
        category: 'encouragement',
        tldraw_coords: coordinateMapping ? {
          x: coordinateMapping.tldrawBounds.x + 100,
          y: coordinateMapping.tldrawBounds.y + 50
        } : { x: 100, y: 50 }
      }
    ];
  }
}

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
}); 