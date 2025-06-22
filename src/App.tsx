import React, { useState } from 'react';
import { Tldraw, Editor, TLGeoShape, TLTextShape, TLUiOverrides, createShapeId } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import './index.css'

const DEFAULT_CAMERA_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8];

// UI overrides to lock camera zoom and pan - defined outside component to avoid re-creation
const uiOverrides: TLUiOverrides = {
  actions(editor, actions) {
    actions.lockCameraZoom = {
      id: 'lock-camera-zoom',
      kbd: 'shift+k',
      onSelect() {
        const isCameraZoomLockedAlready = editor.getCameraOptions().zoomSteps.length === 1
        editor.setCameraOptions({
          zoomSteps: isCameraZoomLockedAlready ? DEFAULT_CAMERA_STEPS : [editor.getZoomLevel()],
        })
      },
    }
    return actions
  },
};

// New component to encapsulate the OCR button logic
interface OCRButtonProps {
  editor: Editor | null;
}

// Helper function to draw AI suggestions back onto the whiteboard
function drawAISuggestions(editor: Editor, suggestions: any[]) {
  console.log("Drawing AI suggestions:", suggestions);
  console.log("Current viewport bounds:", editor.getViewportPageBounds());
  console.log("Current camera:", editor.getCamera());
  
  // CLEAR ALL EXISTING AI SUGGESTIONS FIRST
  console.log("Clearing old AI suggestions...");
  const allShapes = editor.getCurrentPageShapes();
  const suggestionsToDelete = allShapes.filter(shape => {
    // Primary method: Check for metadata tag
    if (shape.meta?.isAISuggestion) {
      return true;
    }
    
          // Fallback method: Pattern matching for older suggestions without metadata
      if (shape.type === 'text') {
        const textShape = shape as any;
        const text = textShape.props.text?.toLowerCase() || '';
        // Broader detection - any text that looks like AI feedback or highlight labels
        return text.includes('solve') || text.includes('subtract') || text.includes('divide') || 
               text.includes('good') || text.includes('show') || text.includes('work') ||
               text.includes('next') || text.includes('step') || text.includes('keep') || 
               text.includes('great') || text.includes('add') || text.includes('multiply') ||
               text.includes('hint') || text.includes('try') || text.includes('correct') ||
               text.includes('check') || text.includes('verify') || text.includes('complete') ||
               // Check for highlight labels (text with quotes)
               (text.startsWith('"') && text.endsWith('"')) ||
               // Check if text has colored styling (AI suggestions have specific colors)
               (textShape.props.color && ['red', 'orange', 'blue', 'green'].includes(textShape.props.color)) ||
               // Check for mono font (used for highlight labels)
               (textShape.props.font === 'mono');
      }
    if (shape.type === 'geo') {
      const geoShape = shape as any;
      // Remove ALL dashed rectangles (suggestion backgrounds) and highlight boxes
      return geoShape.props.dash === 'dashed' || 
             (geoShape.props.fill === 'none' && geoShape.props.w < 500) || // Small rectangles are likely suggestion boxes
             (geoShape.props.fill === 'semi') || // Old highlight rectangles
             (shape.meta?.suggestionType === 'highlight') ||
             (shape.meta?.suggestionType === 'highlight_border') ||
             (shape.meta?.suggestionType === 'highlight_box') ||
             (shape.meta?.suggestionType === 'underline'); // New highlight shapes
    }
    if (shape.type === 'arrow') {
      // Remove pointer arrows
      return shape.meta?.suggestionType === 'pointer_arrow';
    }
    return false;
  });
  
  // Delete old suggestions
  if (suggestionsToDelete.length > 0) {
    console.log(`Deleting ${suggestionsToDelete.length} old suggestions`);
    console.log("Suggestion texts being deleted:", 
      suggestionsToDelete
        .filter(s => s.type === 'text')
        .map(s => (s as any).props.text)
    );
    editor.deleteShapes(suggestionsToDelete.map(shape => shape.id));
  }
  
  suggestions.forEach((suggestion, index) => {
    // Only draw text suggestions, skip arrows completely
    if (suggestion.type === 'text' && suggestion.tldraw_coords) {
      console.log(`Drawing suggestion ${index} at:`, suggestion.tldraw_coords);
      console.log(`Backend thinks text is at: x=${suggestion.tldraw_coords.x}, y=${suggestion.tldraw_coords.y}`);
      
      // Position suggestions directly under user's text vertically
      const forcedCoords = {
        x: suggestion.tldraw_coords.x,  // Use same X position as detected text
        y: suggestion.tldraw_coords.y + 150 + (index * 60)  // Much more spacing: 150px below text, 60px between suggestions
      };
      console.log(`Positioning suggestion ${index} under text at:`, forcedCoords);
      
      // Choose color based on priority and category
      let color = 'red'; // default
      let size = 'm'; // default
      
      switch (suggestion.priority) {
        case 'high':
          color = 'red';
          size = 'l';
          break;
        case 'medium':
          color = 'orange';
          size = 'm';
          break;
        case 'low':
          color = 'blue';
          size = 's';
          break;
      }
      
      // Different styling for different categories
      switch (suggestion.category) {
        case 'correction':
          color = 'red';
          break;
        case 'clarification':
          color = 'orange';
          break;
        case 'next_step':
          color = 'blue';
          break;
        case 'encouragement':
          color = 'green';
          break;
      }
      
            // Draw a clear box around the referenced text (if provided)
      if (suggestion.highlightRegion && suggestion.highlightRegion.bbox) {
        console.log(`Drawing highlight box for suggestion ${index}:`, suggestion.highlightRegion);
        const bbox = suggestion.highlightRegion.bbox;
        const padding = suggestion.highlightRegion.padding || 8;
        const isSpecificText = suggestion.highlightRegion.type === 'specific_text_highlight';
        
        // Different styles for specific text vs full equation highlights
        const dashType = isSpecificText ? 'solid' : 'dashed';
        const borderSize = isSpecificText ? 'l' : 'm'; // Thicker border for specific text
        const boxPadding = isSpecificText ? padding : padding + 5; // More padding for general highlights
        
        // Draw a clear box around the text (no fill, just border)
        editor.createShape({
          type: 'geo',
          x: bbox.x_min - boxPadding,
          y: bbox.y_min - boxPadding,
          props: {
            geo: 'rectangle',
            w: (bbox.x_max - bbox.x_min) + (boxPadding * 2),
            h: (bbox.y_max - bbox.y_min) + (boxPadding * 2),
            color: color,
            fill: 'none', // No fill - just a clear border
            dash: dashType,
            size: borderSize,
          },
          meta: {
            isAISuggestion: true,
            suggestionType: 'highlight_box',
            highlightFor: index,
            isSpecificText: isSpecificText,
            matchedText: suggestion.highlightRegion.matchedText || null
          }
        });
        
        // For specific text, add an underline as well
        if (isSpecificText) {
          editor.createShape({
            type: 'geo',
            x: bbox.x_min - 2,
            y: bbox.y_max + 2,
            props: {
              geo: 'rectangle',
              w: (bbox.x_max - bbox.x_min) + 4,
              h: 3, // Thin underline
              color: color,
              fill: 'solid', // Solid underline
              dash: 'solid',
              size: 's',
            },
            meta: {
              isAISuggestion: true,
              suggestionType: 'underline',
              highlightFor: index
            }
          });
        }
        
        // Add a small arrow pointing to the highlighted area
        const arrowX = bbox.x_max + boxPadding + 10;
        const arrowY = (bbox.y_min + bbox.y_max) / 2;
        
        editor.createShape({
          type: 'arrow',
          x: arrowX,
          y: arrowY,
          props: {
            start: { x: 0, y: 0 },
            end: { x: 30, y: -20 },
            color: color,
            size: 's',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
          },
          meta: {
            isAISuggestion: true,
            suggestionType: 'pointer_arrow',
            highlightFor: index
          }
        });
        
        // For specific text highlights, add a small label showing what text was matched
        if (isSpecificText && suggestion.highlightRegion.matchedText) {
          editor.createShape({
            type: 'text',
            x: arrowX + 35,
            y: arrowY - 30,
            props: {
              text: `"${suggestion.highlightRegion.matchedText}"`,
              color: color,
              size: 's',
              font: 'mono',
              w: 150,
              autoSize: true,
            },
            meta: {
              isAISuggestion: true,
              suggestionType: 'highlight_label',
              highlightFor: index
            }
          });
        }
      }
      
      // Create text suggestion with metadata tag
      const textShapeId = createShapeId();
      editor.createShape({
        id: textShapeId,
        type: 'text',
        x: forcedCoords.x,
        y: forcedCoords.y,
        props: {
          text: suggestion.text,
          color: color,
          size: size,
          font: 'sans',
          w: 400,  // Wider text box to prevent wrapping
          autoSize: false,
        },
        meta: {
          isAISuggestion: true,  // Tag for easy identification
          suggestionType: suggestion.type
        }
      });
      
      // Add a single background rectangle for better visibility
      editor.createShape({
        type: 'geo',
        x: forcedCoords.x - 10,
        y: forcedCoords.y - 10,
        props: {
          geo: 'rectangle',
          w: 320, // Wider to accommodate longer text
          h: 50,  // Taller for better readability
          color: color,
          fill: 'none',
          dash: 'dashed',
          size: 's',
        },
        meta: {
          isAISuggestion: true,  // Tag for easy identification
          suggestionType: 'background'
        }
      });
    }
  });
}

function OCRButton({ editor }: OCRButtonProps) {
  const handleProcessWhiteboard = async () => {
    console.log("Button clicked!");
    if (!editor) {
      console.log("Editor is not yet mounted.");
      alert("Editor is not ready. Please wait a moment and try again.");
      return;
    }
    console.log("Editor is available:", !!editor);

    try {
      // Get all shapes on the current page
      const shapeIds = editor.getCurrentPageShapeIds();
      console.log("Shape IDs found:", shapeIds.size);

      if (shapeIds.size === 0) {
        alert("No shapes found on the canvas to capture.");
        return;
      }

      // Use page bounds for consistent coordinate mapping
      const camera = editor.getCamera();
      const pageBounds = editor.getCurrentPageBounds();
      
      console.log("Camera:", camera);
      console.log("Page bounds:", pageBounds);

      // Use tldraw's export functionality to get an image blob
      // This uses the same underlying mechanism as the screenshot tool
      const svgResult = await editor.getSvgString([...shapeIds], {
        background: true,
        bounds: pageBounds,
        scale: 2,
        darkMode: false,
      });

      console.log("SVG string generated:", !!svgResult);

      if (svgResult && svgResult.svg) {
        // Convert SVG string to blob and then to base64
        const svgBlob = new Blob([svgResult.svg], { type: 'image/svg+xml' });
        
        // Convert to canvas to get PNG data
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = async () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx?.drawImage(img, 0, 0);
          
          canvas.toBlob(async (pngBlob) => {
            if (pngBlob) {
              // Convert to base64
              const reader = new FileReader();
              reader.readAsDataURL(pngBlob);
              reader.onloadend = async () => {
                const base64data = (reader.result as string).split(',')[1];
                console.log("Image captured and converted to Base64 (first 100 chars):", base64data.substring(0, 100) + '...');

                // Send to backend with coordinate mapping information
                try {
                  const backend_url = 'http://localhost:3001';
                  const coordinateMapping = {
                    // Image dimensions
                    imageWidth: canvas.width,
                    imageHeight: canvas.height,
                    // Tldraw coordinate bounds that correspond to this image
                    tldrawBounds: pageBounds ? {
                      x: pageBounds.x,
                      y: pageBounds.y,
                      width: pageBounds.w,
                      height: pageBounds.h,
                    } : {
                      x: 0,
                      y: 0,
                      width: 1600,
                      height: 900,
                    },
                    // Scale factor used in export
                    exportScale: 2,
                    // Camera information for reference
                    camera: camera,
                    // Timestamp for reference
                    timestamp: new Date().toISOString(),
                  };
                  
                  console.log("Coordinate mapping:", coordinateMapping);
                  
                  const response = await fetch(`${backend_url}/api/ocr-vision`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                      imageData: base64data,
                      coordinateMapping: coordinateMapping 
                    }),
                  });
                  const ocrResults = await response.json();
                  console.log("OCR Results from Backend:", ocrResults);
                  
                  // Draw AI suggestions if available
                  if (ocrResults.aiSuggestions && ocrResults.aiSuggestions.length > 0) {
                    console.log("Drawing AI suggestions:", ocrResults.aiSuggestions.length);
                    drawAISuggestions(editor, ocrResults.aiSuggestions);
                  }
                  
                  // Save the complete JSON to a file with better error handling
                  try {
                    // Clean the data to remove any problematic characters or circular references
                    const cleanedResults = JSON.parse(JSON.stringify(ocrResults));
                    const jsonString = JSON.stringify(cleanedResults, null, 2);
                    console.log("JSON string length:", jsonString.length);
                    console.log("JSON preview (first 500 chars):", jsonString.substring(0, 500));
                    
                    // Validate JSON structure before creating blob
                    try {
                      JSON.parse(jsonString); // Test if it's valid JSON
                      console.log("JSON validation passed");
                    } catch (validationError) {
                      console.error("JSON validation failed:", validationError);
                      throw new Error("Generated JSON is invalid");
                    }
                    
                    // Create blob with explicit UTF-8 encoding and BOM for better compatibility
                    const bom = '\uFEFF'; // UTF-8 BOM
                    const blob = new Blob([bom + jsonString], { 
                      type: 'application/json;charset=utf-8' 
                    });
                    
                    console.log("Blob created, size:", blob.size, "type:", blob.type);
                    
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    
                    // Simplify filename to avoid special characters
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
                    a.download = `ocr-results-${timestamp}.json`;
                    
                    console.log("Download filename:", a.download);
                    
                    // Add the element to DOM, click, then remove
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // Clean up the URL after a longer delay to ensure download completes
                    setTimeout(() => {
                      URL.revokeObjectURL(url);
                      console.log("URL revoked");
                    }, 1000);
                    
                    console.log("JSON file download initiated successfully");
                  } catch (jsonError) {
                    console.error("Error creating JSON file:", jsonError);
                    console.error("Error details:", {
                      message: jsonError instanceof Error ? jsonError.message : String(jsonError),
                      stack: jsonError instanceof Error ? jsonError.stack : undefined,
                      ocrResultsKeys: Object.keys(ocrResults || {}),
                      ocrResultsType: typeof ocrResults
                    });
                    alert("Error creating JSON file. Check console for details.");
                  }
                  
                  alert(`OCR processing complete! Found ${ocrResults.wordAnnotations?.length || 0} text elements. ${ocrResults.aiSuggestions?.length || 0} AI suggestions added to whiteboard. JSON file downloaded.`);
                } catch (error) {
                  console.error("Error sending image for OCR:", error);
                  alert("Failed to process whiteboard with OCR. Check console for details.");
                }
              };
            }
          }, 'image/png');
        };
        
        const svgUrl = URL.createObjectURL(svgBlob);
        img.src = svgUrl;
      } else {
        alert("Could not capture whiteboard image.");
      }
    } catch (error) {
      console.error("Error in screenshot process:", error);
      alert("Failed to capture screenshot. Check console for details.");
    }
  };

  return (
    <button className="save-button" onClick={handleProcessWhiteboard}>
      Process Whiteboard (OCR)
    </button>
  );
}

function App() {
  const [editor, setEditor] = useState<Editor | null>(null);

  const handleSave = () => {
    if (!editor) return;
    const snapshot = editor.getSnapshot();

    const shapes = editor.getCurrentPageShapes();
    const shapeTypeCounts: { [key: string]: number } = {};
    const textSnippets: string[] = [];
    const mathSymbolCounts: { [key: string]: number } = {};
    let numbersCount: number = 0;

    // Regular expressions for common math symbols and numbers
    const mathSymbolsRegex = /[+\-*/=<>&|^%!~Σπ√∫∑∞θγβδενξπρστυφχψωΩΔΘΛΞΠΣΥΦΨΩ]/g; // Common ops, Greek letters, etc.
    const numberRegex = /\b\d+(\.\d+)?\b/g; // Matches integers and decimals

    for (const shape of shapes) {
      if (shape.type === 'geo') {
        const geoShape = shape as TLGeoShape;
        const geoType = geoShape.props.geo;
        shapeTypeCounts[geoType] = (shapeTypeCounts[geoType] || 0) + 1;
      } else if (shape.type === 'arrow') {
        shapeTypeCounts['arrow'] = (shapeTypeCounts['arrow'] || 0) + 1;
      } else if (shape.type === 'text') {
        const textShape = shape as TLTextShape;
        shapeTypeCounts['text'] = (shapeTypeCounts['text'] || 0) + 1;

        const textContent = textShape.props.text;
        if (textContent) {
          // Extract up to 3 text snippets for general description
          if (textSnippets.length < 3) {
            textSnippets.push(`'${textContent.substring(0, 50)}...'`);
          }

          // Analyze for numbers
          const numbersFound = textContent.match(numberRegex);
          if (numbersFound) {
            numbersCount += numbersFound.length;
          }

          // Analyze for math symbols
          const mathSymbolsFound = textContent.match(mathSymbolsRegex);
          if (mathSymbolsFound) {
            for (const symbol of mathSymbolsFound) {
              mathSymbolCounts[symbol] = (mathSymbolCounts[symbol] || 0) + 1;
            }
          }
        }
      }
      // Add other shape types if needed
    }

    let description = `Whiteboard snapshot. Total shapes: ${shapes.length}. `;
    const parts: string[] = [];

    for (const type in shapeTypeCounts) {
      parts.push(`${shapeTypeCounts[type]} ${type}(s)`);
    }

    if (parts.length > 0) {
      description += `Includes: ${parts.join(', ')}.`;
    }

    if (numbersCount > 0) {
      description += ` Contains ${numbersCount} number(s).`;
    }

    if (Object.keys(mathSymbolCounts).length > 0) {
      const mathSymbolParts: string[] = [];
      for (const symbol in mathSymbolCounts) {
        mathSymbolParts.push(`${mathSymbolCounts[symbol]} '${symbol}'(s)`);
      }
      description += ` Math symbols: ${mathSymbolParts.join(', ')}.`;
    }

    if (textSnippets.length > 0) {
      description += ` Text examples: ${textSnippets.join(', ')}.`;
    }

    if (shapes.length === 0) {
      description = "Whiteboard snapshot containing no shapes.";
    }

    const descriptiveSnapshot = {
      metadata: {
        timestamp: new Date().toISOString(),
        appVersion: "1.0.0",
        description: description,
      },
      tldrawSnapshot: snapshot,
    };

    const json = JSON.stringify(descriptiveSnapshot, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whiteboard-snapshot.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">🎨 Whiteboard App</h1>
        <button className="save-button" onClick={handleSave}>
          Save Snapshot (JSON)
        </button>
        {/* Render the OCRButton directly, passing the editor prop */}
        {editor && <OCRButton editor={editor} />} {/* Only render if editor is available */}

      </header>
      
      <div className="whiteboard-container">
        <Tldraw 
          className="tldraw-container"
          overrides={uiOverrides}
          components={{
            HelpMenu: null,
            MainMenu: null,
          }}
          onMount={(editor) => {
            console.log("Tldraw Editor mounted:", editor);
            // Defer setEditor to next tick to avoid infinite loop
            requestAnimationFrame(() => setEditor(editor));
            
            // Use camera constraints to control zoom and pan behavior
            setTimeout(() => {
              try {
                const viewportBounds = editor.getViewportPageBounds();
                const constraintBounds = {
                  x: 0,
                  y: 0,
                  w: 1600, // Fixed canvas width
                  h: 900,  // Fixed canvas height
                };

                editor.setCameraOptions({
                  constraints: {
                    bounds: constraintBounds,
                    behavior: 'contain',
                    initialZoom: 'fit-max',
                    baseZoom: 'fit-max', // Lock to this zoom level
                    origin: { x: 0.5, y: 0.5 },
                    padding: { x: 50, y: 50 },
                  },
                });

                // Zoom to fit the constraint bounds
                editor.zoomToBounds(constraintBounds, { 
                  force: true, 
                  animation: { duration: 500 } 
                });
                
                // Auto-trigger zoom lock (equivalent to pressing Shift+K)
                setTimeout(() => {
                  const currentZoom = editor.getZoomLevel();
                  editor.setCameraOptions({
                    zoomSteps: [currentZoom], // Lock to current zoom level
                  });
                  console.log("Zoom locked automatically at level:", currentZoom);
                }, 100); // Small delay after zoom animation
                
                console.log("Camera constraints applied successfully");
              } catch (error) {
                console.log("Could not apply camera constraints:", error);
              }
            }, 1000); // 1 second delay to ensure editor is fully initialized
          }}
        />
      </div>
    </>
  );
}

export default App; 