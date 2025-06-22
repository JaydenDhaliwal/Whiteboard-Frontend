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

      // Create vertical text order for easier AI model reading
      const verticalTextOrder = createVerticalTextOrder(wordAnnotations);

      console.log('Full text detected:', fullText);
      console.log('Spatial analysis completed');
      
      // Generate AI suggestions using Gemini
      console.log('Generating AI suggestions with Gemini...');
      
      const aiSuggestions = await generateAISuggestions(fullText, spatialAnalysis, wordAnnotations, coordinateMapping, verticalTextOrder);
      console.log('AI suggestions generated:', aiSuggestions.length);
      
      const responseData = {
        // Easy-to-read section for AI model
        verticalTextOrder: verticalTextOrder,
        
        // Detailed technical data
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
  
  console.log(`Spatial analysis found ${equations.length} equations:`);
  analyzedEquations.forEach((eq, index) => {
    console.log(`  Equation ${index}: "${eq.reconstructedText}" (type: ${eq.type})`);
    console.log(`    Elements: ${eq.originalElements.map(el => `"${el.text}"`).join(', ')}`);
    console.log(`    Y-range: ${Math.round(eq.boundingBox.y_min)} to ${Math.round(eq.boundingBox.y_max)}`);
  });
  
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

// Create vertical text order for easier AI model reading
function createVerticalTextOrder(wordAnnotations) {
  console.log('Creating vertical text order...');
  
  // First, group annotations into clear lines based on Y coordinates
  const lineGroups = [];
  const usedAnnotations = new Set();
  
  // Sort by Y coordinate first to process top to bottom
  const yOrderedAnnotations = [...wordAnnotations].sort((a, b) => a.center_y - b.center_y);
  
  yOrderedAnnotations.forEach(annotation => {
    if (usedAnnotations.has(annotation)) return;
    
    // Start a new line group
    const lineGroup = [annotation];
    usedAnnotations.add(annotation);
    
    // Find all other annotations on roughly the same Y level
    yOrderedAnnotations.forEach(other => {
      if (usedAnnotations.has(other)) return;
      
      if (Math.abs(annotation.center_y - other.center_y) < 35) {
        lineGroup.push(other);
        usedAnnotations.add(other);
      }
    });
    
    // Sort this line group left to right
    lineGroup.sort((a, b) => a.center_x - b.center_x);
    lineGroups.push(lineGroup);
  });
  
  // Flatten back to sorted annotations
  const sortedAnnotations = lineGroups.flat();
  
  // Convert line groups to text lines
  const lines = lineGroups.map(lineGroup => 
    lineGroup.map(annotation => annotation.text).join(' ')
  );
  
  console.log(`Detected ${lineGroups.length} distinct lines:`);
  
  console.log('=== TEXT ORDERING DEBUG ===');
  console.log('Raw annotations (unsorted):');
  wordAnnotations.forEach((annotation, index) => {
    console.log(`  ${index}: "${annotation.text}" at Y=${Math.round(annotation.center_y)}, X=${Math.round(annotation.center_x)}`);
  });
  
  console.log('Sorted annotations (top to bottom):');
  sortedAnnotations.forEach((annotation, index) => {
    console.log(`  ${index}: "${annotation.text}" at Y=${Math.round(annotation.center_y)}, X=${Math.round(annotation.center_x)}`);
  });
  
  console.log('Final line order with Y coordinates:');
  lines.forEach((line, index) => {
    const avgY = lineGroups[index].reduce((sum, ann) => sum + ann.center_y, 0) / lineGroups[index].length;
    console.log(`  Line ${index} (Y=${Math.round(avgY)}): "${line}"`);
  });
  
  console.log(`MOST RECENT STEP identified as: "${lines[lines.length - 1]}"`);
  console.log('=== END DEBUG ===');
  
  return {
    linesInOrder: lines,
    totalLines: lines.length,
    fullTextInOrder: lines.join('\n'),
    summary: `Content appears to contain ${lines.length} line(s) of text, reading from top to bottom.`
  };
}

// Simplified coordinate conversion - direct mapping from image to tldraw
function convertImageToTldrawCoords(annotation, coordinateMapping) {
  const { imageWidth, imageHeight, tldrawBounds, exportScale } = coordinateMapping;
  
  console.log('Converting coordinates:', {
    annotation: { x: annotation.center_x, y: annotation.center_y },
    imageSize: { width: imageWidth, height: imageHeight },
    tldrawBounds: tldrawBounds,
    exportScale: exportScale
  });
  
  // Step 1: Convert image pixels to normalized coordinates (0-1)
  // The image is exactly what the user sees in their viewport
  const normalizedX = annotation.center_x / imageWidth;
  const normalizedY = annotation.center_y / imageHeight;
  
  console.log('Normalized coords:', { x: normalizedX, y: normalizedY });
  
  // Step 2: Apply to viewport bounds to get exact tldraw coordinates
  const tldrawX = tldrawBounds.x + (normalizedX * tldrawBounds.width);
  const tldrawY = tldrawBounds.y + (normalizedY * tldrawBounds.height);
  
  console.log('Final tldraw coords:', { x: tldrawX, y: tldrawY });
  
  // Convert bounding box with same direct mapping
  const bboxNormalizedXMin = annotation.bbox.x_min / imageWidth;
  const bboxNormalizedYMin = annotation.bbox.y_min / imageHeight;
  const bboxNormalizedXMax = annotation.bbox.x_max / imageWidth;
  const bboxNormalizedYMax = annotation.bbox.y_max / imageHeight;
  
  const tldrawBbox = {
    x_min: tldrawBounds.x + (bboxNormalizedXMin * tldrawBounds.width),
    y_min: tldrawBounds.y + (bboxNormalizedYMin * tldrawBounds.height),
    x_max: tldrawBounds.x + (bboxNormalizedXMax * tldrawBounds.width),
    y_max: tldrawBounds.y + (bboxNormalizedYMax * tldrawBounds.height),
  };
  
  return {
    center_x: tldrawX,
    center_y: tldrawY,
    bbox: tldrawBbox,
    width: tldrawBbox.x_max - tldrawBbox.x_min,
    height: tldrawBbox.y_max - tldrawBbox.y_min,
  };
}

// Helper function to find specific text within an equation for precise highlighting
function findSpecificTextInEquation(equation, highlightText, coordinateMapping) {
  console.log('Looking for specific text:', highlightText, 'in equation:', equation.reconstructedText);
  
  // Clean the highlight text for better matching
  const cleanHighlightText = highlightText.trim().toLowerCase();
  
  // Try to find the text in the equation
  let matchingElements = [];
  
  // First, try exact sequence matching
  const equationText = equation.reconstructedText.toLowerCase();
  if (equationText.includes(cleanHighlightText)) {
    // Find elements that form this text sequence
    const words = cleanHighlightText.split(/\s+/);
    let currentWordIndex = 0;
    
    for (let i = 0; i < equation.originalElements.length && currentWordIndex < words.length; i++) {
      const element = equation.originalElements[i];
      const elementText = element.text.toLowerCase().trim();
      
      if (elementText === words[currentWordIndex]) {
        matchingElements.push(element);
        currentWordIndex++;
        
        // If we found all words, break
        if (currentWordIndex === words.length) {
          break;
        }
      } else if (matchingElements.length > 0) {
        // Reset if we break the sequence
        matchingElements = [];
        currentWordIndex = 0;
        // Check if current element starts a new sequence
        if (elementText === words[0]) {
          matchingElements.push(element);
          currentWordIndex = 1;
        }
      }
    }
  }
  
  // If exact sequence didn't work, try individual word matching
  if (matchingElements.length === 0) {
    const words = cleanHighlightText.split(/\s+/);
    for (const word of words) {
      for (const element of equation.originalElements) {
        if (element.text.toLowerCase().trim() === word) {
          matchingElements.push(element);
          break; // Only add the first occurrence of each word
        }
      }
    }
  }
  
  console.log('Found matching elements:', matchingElements.map(e => e.text));
  
  if (matchingElements.length > 0) {
    // Calculate bounding box for all matching elements
    const minX = Math.min(...matchingElements.map(el => el.bbox.x_min));
    const minY = Math.min(...matchingElements.map(el => el.bbox.y_min));
    const maxX = Math.max(...matchingElements.map(el => el.bbox.x_max));
    const maxY = Math.max(...matchingElements.map(el => el.bbox.y_max));
    
    const combinedBbox = {
      x_min: minX,
      y_min: minY,
      x_max: maxX,
      y_max: maxY
    };
    
    console.log('Combined bbox for highlighted text:', combinedBbox);
    
    // Convert to tldraw coordinates
    const tldrawBbox = convertImageToTldrawCoords({
      center_x: (minX + maxX) / 2,
      center_y: (minY + maxY) / 2,
      bbox: combinedBbox
    }, coordinateMapping).bbox;
    
    return {
      type: 'specific_text_highlight',
      bbox: tldrawBbox,
      padding: 10,
      matchedText: highlightText,
      elements: matchingElements.map(el => el.text)
    };
  }
  
  return null; // No specific text found
}

// Generate AI suggestions using Gemini
async function generateAISuggestions(fullText, spatialAnalysis, wordAnnotations, coordinateMapping, verticalTextOrder) {
  try {
    console.log('Initializing Gemini model...');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log('Gemini model initialized successfully');
    
    // Prepare context for Gemini
    const analysisContext = {
      // Easy-to-read vertical text order
      textInVerticalOrder: verticalTextOrder.linesInOrder,
      summary: verticalTextOrder.summary,
      
      // Technical details
      detectedText: fullText,
      equations: spatialAnalysis.equations.map(eq => ({
        text: eq.reconstructedText,
        type: eq.type,
        components: eq.components
      })),
      totalElements: spatialAnalysis.totalElements
    };
    
    const prompt = `

You are an expert math tutor reviewing a student's work on a whiteboard. The student is solving step-by-step, and you should  provide feedback like you are a really good teacher and guide them towards the correct answer by building thier intution.

STUDENT'S WORK (in order from top to bottom):
${verticalTextOrder.linesInOrder.map((line, index) => `Step ${index + 1}: ${line}`).join('\n')}

The MOST RECENT step is: "${verticalTextOrder.linesInOrder[verticalTextOrder.linesInOrder.length - 1]}"

ANALYZE ONLY THE MOST RECENT STEP. Ignore all previous steps unless the most recent step has an error.

CRITICAL INSTRUCTIONS:

1. **ONLY analyze the most recent step**: "${verticalTextOrder.linesInOrder[verticalTextOrder.linesInOrder.length - 1]}"

2. **If the most recent step is correct, return empty array []** - Do not comment on earlier steps.

3. **Only comment if the most recent step has an error** - Check if it follows logically from the previous step.

4. **When highlighting text, use EXACT text from the most recent step** - Never highlight text from earlier steps.

5. **Associate feedback with the LAST equation (highest index)** - Use the equation containing the most recent step.

6. If they are stuck help guide them towards the next step, but never give them the answer 

7. If it's a factoring problem (polynomial equation) always factor the equation. 


ANALYSIS GUIDELINES:
- If they wrote "3x + 2 = 10" and then "3x = 8", that's CORRECT (subtracting 2 from both sides)
- If they wrote "x = 8/3", that's CORRECT (dividing both sides by 3)
- Don't suggest steps they've already completed correctly

If everything looks correct, return an empty array: []

If there's an error, return ONLY ONE suggestion in this format:
[{
  "type": "text",
  "text": "Specific error description",
  "priority": "high",
  "category": "correction",
  "associatedEquation": 0,
  "highlightText": "specific text to highlight"
}]

The "highlightText" field should contain the EXACT text from the student's work that you're referring to (e.g., "3x = 8" or "x = 8/3"). This will be highlighted on the whiteboard.

OUTPUT ONLY THE JSON ARRAY, NO OTHER TEXT.`;

    console.log('Sending request to Gemini...');
    console.log('Text being analyzed by AI:');
    verticalTextOrder.linesInOrder.forEach((line, index) => {
      console.log(`  Step ${index + 1}: "${line}"`);
    });
    console.log(`EMPHASIZING MOST RECENT STEP: "${verticalTextOrder.linesInOrder[verticalTextOrder.linesInOrder.length - 1]}"`);
    console.log(`Total equations detected: ${spatialAnalysis.equations.length}`);
    
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
    
    // Add positioning information to suggestions with better spacing and highlighting
    const positionedSuggestions = [];
    const usedPositions = []; // Track used positions to avoid overlaps
    
    suggestions.forEach((suggestion, index) => {
      let tldraw_coords = null;
      let arrowStart = null;
      let arrowEnd = null;
      let highlightRegion = null;
      
      // If associatedEquation is provided, use it; otherwise default to the last (most recent) equation
      let targetEquationIndex = suggestion.associatedEquation;
      if (targetEquationIndex === null || targetEquationIndex === undefined || targetEquationIndex >= spatialAnalysis.equations.length) {
        targetEquationIndex = spatialAnalysis.equations.length - 1; // Default to last equation
      }
      
      if (targetEquationIndex >= 0 && spatialAnalysis.equations[targetEquationIndex]) {
        // Position near the specific equation
        const equation = spatialAnalysis.equations[targetEquationIndex];
        
        if (coordinateMapping) {
          // Use the average Y coordinate of actual text elements for better alignment
          const avgTextY = equation.originalElements.reduce((sum, el) => sum + el.center_y, 0) / equation.originalElements.length;
          
          // Find the rightmost text element for precise positioning
          const rightmostElement = equation.originalElements.reduce((rightmost, element) => 
            element.bbox.x_max > rightmost.bbox.x_max ? element : rightmost
          );
          
          // Position suggestion directly to the right of the actual rightmost text
          const textRightEdge = convertImageToTldrawCoords({
            center_x: rightmostElement.bbox.x_max,
            center_y: avgTextY,
            bbox: rightmostElement.bbox
          }, coordinateMapping);
          
          tldraw_coords = {
            x: textRightEdge.center_x + 10, // Very small gap from actual text edge
            y: textRightEdge.center_y // Aligned with average text center Y
          };
          
          // Create highlight region for the equation or specific text being referenced
          if (suggestion.highlightText) {
            // Try to find the specific text within the equation and highlight just that part
            const specificTextHighlight = findSpecificTextInEquation(equation, suggestion.highlightText, coordinateMapping);
            highlightRegion = specificTextHighlight || {
              type: 'equation_highlight',
              bbox: convertImageToTldrawCoords({
                center_x: (equation.boundingBox.x_min + equation.boundingBox.x_max) / 2,
                center_y: (equation.boundingBox.y_min + equation.boundingBox.y_max) / 2,
                bbox: equation.boundingBox
              }, coordinateMapping).bbox,
              padding: 15,
              equationIndex: targetEquationIndex
            };
          } else {
            // Highlight the entire equation
            highlightRegion = {
              type: 'equation_highlight',
              bbox: convertImageToTldrawCoords({
                center_x: (equation.boundingBox.x_min + equation.boundingBox.x_max) / 2,
                center_y: (equation.boundingBox.y_min + equation.boundingBox.y_max) / 2,
                bbox: equation.boundingBox
              }, coordinateMapping).bbox,
              padding: 15, // Extra padding around the text
              equationIndex: suggestion.associatedEquation
            };
          }
        }
      } else {
        // For general suggestions, position them to the right of the rightmost content
        if (coordinateMapping && spatialAnalysis.equations.length > 0) {
          // Find the rightmost equation
          const rightmostEquation = spatialAnalysis.equations.reduce((rightmost, eq) => 
            eq.boundingBox.x_max > rightmost.boundingBox.x_max ? eq : rightmost
          );
          
          const rightmostTldraw = convertImageToTldrawCoords({
            center_x: rightmostEquation.boundingBox.x_max,
            center_y: rightmostEquation.boundingBox.y_min,
            bbox: rightmostEquation.boundingBox
          }, coordinateMapping);
          
          tldraw_coords = {
            x: rightmostTldraw.center_x + 30,
            y: rightmostTldraw.center_y + (index * 50)
          };
        } else {
          // Fallback positioning
          const baseX = coordinateMapping ? coordinateMapping.tldrawBounds.x + 50 : 50;
          const baseY = coordinateMapping ? coordinateMapping.tldrawBounds.y + 50 : 50;
          
          tldraw_coords = {
            x: baseX + (index * 250),
            y: baseY + (index * 60)
          };
        }
      }
      
      // Add the text suggestion with highlight information
      positionedSuggestions.push({
        ...suggestion,
        tldraw_coords: tldraw_coords,
        highlightRegion: highlightRegion
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