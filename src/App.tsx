import React, { useState } from 'react';
import { Tldraw, Editor } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

const generatePngDataUrl = async (editor: Editor): Promise<string | null> => {
	const allShapeIds = Array.from(editor.getCurrentPageShapeIds());
	if (allShapeIds.length === 0) {
		console.log('No shapes on page to export.');
		return null;
	}

	const svg = await editor.getSvg(allShapeIds, {
		scale: 4,
		background: true,
	});

	if (!svg) {
		console.error('Failed to get SVG from editor.');
		return null;
	}

	const svgString = new XMLSerializer().serializeToString(svg);
	const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;

	return new Promise<string | null>((resolve) => {
		const image = new Image();
		image.onload = () => {
			const canvas = document.createElement('canvas');
			const viewBox = svg.viewBox.baseVal;
			canvas.width = viewBox.width * 4;
			canvas.height = viewBox.height * 4;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				console.error('Failed to get canvas context');
				return resolve(null);
			}
			ctx.fillStyle = 'white';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			resolve(canvas.toDataURL('image/png'));
		};
		image.onerror = () => {
			console.error('Error loading SVG into image element.');
			resolve(null);
		};
		image.src = dataUrl;
	});
};

const llmOcrApiCall = async (imageDataUrl: string): Promise<string> => {
	console.log('Sending image to backend for recognition...');
	try {
		const response = await fetch('http://localhost:3001/api/recognize', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ image: imageDataUrl }),
		});

		if (!response.ok) {
			throw new Error(`Server error: ${response.statusText}`);
		}

		const data = await response.json();
		console.log('Received response from backend:', data.text);
		return data.text;

	} catch (error) {
		console.error('Failed to fetch from backend:', error);
		alert('Could not connect to the recognition server. Is it running?');
		return '';
	}
}

function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isEditorReady, setIsEditorReady] = useState(false);
	const [isRecognizing, setIsRecognizing] = useState(false);
	const [isPngExporting, setIsPngExporting] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleEditorMount = (editor: Editor) => {
    console.log('Editor mounted:', editor);
    setEditor(editor);
    setIsEditorReady(true);
  };

  const handleSave = () => {
    console.log('Save Snapshot button clicked');
    console.log('Editor state:', editor);
    
    if (!editor) {
      console.log('Editor is null, cannot save');
      alert('Please wait for the whiteboard to load completely before saving.');
      return;
    }
    
    try {
      const snapshot = editor.getSnapshot();
      console.log('Snapshot obtained:', snapshot);
      
      const json = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whiteboard-snapshot.json';
      a.click();
      URL.revokeObjectURL(url);
      
      console.log('JSON file download initiated');
    } catch (error) {
      console.error('Error saving JSON:', error);
      alert('Error saving JSON file. Please try again.');
    }
  };

  const convertToText = (snapshot: any): string => {
    let textContent = '';
    
    let shapes = {};
    if (snapshot.store && snapshot.store.shapes) {
      shapes = snapshot.store.shapes;
    } else if (snapshot.shapes) {
      shapes = snapshot.shapes;
    } else if (snapshot.store) {
      const storeKeys = Object.keys(snapshot.store);
      for (const key of storeKeys) {
        if (typeof snapshot.store[key] === 'object' && snapshot.store[key] !== null) {
          const obj = snapshot.store[key];
          if (Object.keys(obj).some(k => typeof obj[k] === 'object' && obj[k]?.type)) {
            shapes = obj;
            break;
          }
        }
      }
    }
    
    const textElements: string[] = [];
    const noteElements: string[] = [];
    
    Object.values(shapes).forEach((shape: any) => {
      if (shape.type === 'text') {
        if (shape.props?.text) {
          textElements.push(shape.props.text);
        }
      } else if (shape.type === 'note') {
        if (shape.props?.text) {
          noteElements.push(shape.props.text);
        }
      }
    });

    if (textElements.length > 0) {
      textContent += textElements.join('\n');
      textContent += '\n';
    }
    
    if (noteElements.length > 0) {
      textContent += noteElements.join('\n');
      textContent += '\n';
    }
    
    return textContent.trim();
  };

  const handleSaveText = async () => {
    console.log('--- Starting LLM-based Save TXT Process ---');
    if (!editor) {
      alert('Editor not ready.');
      return;
    }

    setIsRecognizing(true);
    try {
      const typedText = convertToText(editor.getSnapshot());
      console.log('Typed text found:', `"${typedText}"`);

      const pngDataUrl = await generatePngDataUrl(editor);
      
      let recognizedText = '';
      if (pngDataUrl) {
        recognizedText = await llmOcrApiCall(pngDataUrl);
      } else {
        console.log('No drawing found to recognize.');
      }

      let finalText = '';
      if (typedText) {
        finalText += typedText;
      }
      if (recognizedText) {
        if (finalText) {
          finalText += '\n\n--- [Handwritten] ---\n';
        }
        finalText += recognizedText;
      }
      
      if (!finalText.trim()) {
        finalText = 'Whiteboard is empty.';
      }

      console.log('Final text for file:', `"${finalText}"`);
      
      const blob = new Blob([finalText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whiteboard-llm-text.txt';
      a.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error during text export:', error);
      alert('An error occurred while exporting text.');
    } finally {
      setIsRecognizing(false);
    }
  };

	const handleSavePng = async () => {
		if (!editor) {
			alert('Editor not ready.');
			return;
		}

		setIsPngExporting(true);
		try {
			const pngDataUrl = await generatePngDataUrl(editor);
			if (pngDataUrl) {
				const a = document.createElement('a');
				a.href = pngDataUrl;
				a.download = 'whiteboard.png';
				a.click();
			} else {
				alert('Could not export PNG. Are there any drawings on the whiteboard?');
			}
		} finally {
			setIsPngExporting(false);
		}
	};

	const handleAnalyzeMath = async () => {
		if (!editor) {
			alert('Editor not ready.');
			return;
		}

		setIsAnalyzing(true);
		try {
			const pngDataUrl = await generatePngDataUrl(editor);
			const snapshotJson = editor.getSnapshot();

			if (!pngDataUrl) {
				alert('Could not generate an image from the whiteboard. Is it empty?');
				setIsAnalyzing(false);
				return;
			}

			const response = await fetch('http://localhost:3001/api/analyze', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ image: pngDataUrl, json: snapshotJson }),
			});

			if (!response.ok) {
				throw new Error(`Analysis server error: ${response.statusText}`);
			}

			const modifiedJson = await response.json();
			editor.loadSnapshot(modifiedJson);

		} catch (error) {
			console.error('Failed to analyze math:', error);
			alert('An error occurred during the analysis.');
		} finally {
			setIsAnalyzing(false);
		}
	};

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">🎨 Whiteboard App</h1>
        <div className="button-group">
          <button 
            className="save-button" 
            onClick={handleSave}
            disabled={!isEditorReady}
            title={!isEditorReady ? "Waiting for whiteboard to load..." : "Save as JSON"}
          >
            Save Snapshot
          </button>
          <button 
            className="save-button save-text-button" 
            onClick={handleSaveText}
            disabled={!isEditorReady || isRecognizing}
            title={!isEditorReady ? "Waiting for whiteboard to load..." : "Save as TXT"}
          >
            {isRecognizing ? 'Recognizing...' : 'Save TXT'}
          </button>
					<button 
            className="save-button save-png-button" 
            onClick={handleSavePng}
            disabled={!isEditorReady || isPngExporting}
            title={!isEditorReady ? "Waiting for whiteboard to load..." : "Save as PNG"}
          >
            {isPngExporting ? 'Exporting...' : 'Save PNG'}
          </button>
					<button 
            className="save-button analyze-button" 
            onClick={handleAnalyzeMath}
            disabled={!isEditorReady || isAnalyzing}
            title={!isEditorReady ? "Waiting for whiteboard to load..." : "Analyze Math"}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Math'}
          </button>
        </div>
      </header>
      
      <div className="whiteboard-container">
        <Tldraw 
          className="tldraw-container"
          onMount={handleEditorMount}
        />
      </div>
    </>
  );
}

export default App; 