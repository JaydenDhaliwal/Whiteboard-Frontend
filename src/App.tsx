import React, { useState } from 'react';
import { Tldraw, Editor, TLGeoShape, TLTextShape, TLUiOverrides } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

// Override to disable camera controls
const uiOverrides: TLUiOverrides = {
  tools: (editor, tools) => {
    // Remove zoom and pan tools
    const { hand, ...restTools } = tools;
    return restTools;
  },
};

// New component to encapsulate the OCR button logic
interface OCRButtonProps {
  editor: Editor | null;
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

      // Use tldraw's export functionality to get an image blob
      // This uses the same underlying mechanism as the screenshot tool
      const svgResult = await editor.getSvgString([...shapeIds], {
        background: true,
        bounds: editor.getSelectionPageBounds() || editor.getCurrentPageBounds(),
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

                // Send to backend
                try {
                  const backend_url = 'http://localhost:3001';
                  const response = await fetch(`${backend_url}/api/ocr-vision`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ imageData: base64data }),
                  });
                  const ocrResults = await response.json();
                  console.log("OCR Results from Backend:", ocrResults);
                  
                  // Save the complete JSON to a file
                  const jsonString = JSON.stringify(ocrResults, null, 2);
                  const blob = new Blob([jsonString], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ocr-results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  
                  alert(`OCR processing complete! Found ${ocrResults.wordAnnotations?.length || 0} text elements. JSON file downloaded. Check console for detailed results.`);
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
          onMount={(editor) => {
            console.log("Tldraw Editor mounted:", editor);
            setEditor(editor);
          }}
        />
      </div>
    </>
  );
}

export default App; 