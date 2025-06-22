import React, { useState, useEffect, useCallback } from 'react';
import { Tldraw, Editor } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { VapiService } from './VapiService';
import { GeminiContextProvider } from './GeminiContextProvider';
import { OCRService } from './OCRService';
import { AutomaticAITutor } from './AutomaticAITutor';
import { VAPIConfig, VapiStatus } from './types';

// --- IMPORTANT ---
// Manually insert your credentials here.
const VAPI_PUBLIC_KEY = 'bf530902-b01c-43b5-aa0a-0fb18fe96427';
const VAPI_ASSISTANT_ID = '9c0108cc-90a5-47ce-ad47-3623109193d2';
const GEMINI_API_KEY = 'AIzaSyDgX4ncN87Ef5U1Jj8ipVRijdAh1ENwF_E'; // <-- ADD YOUR GEMINI KEY
// -----------------

function CallControlButton({ vapiService, isCallActive, handleProcessWhiteboard }: {
  vapiService: VapiService | null;
  isCallActive: boolean;
  handleProcessWhiteboard: () => void;
}) {
  const handleEndCall = () => {
    vapiService?.stopCall();
  };

  if (isCallActive) {
    return (
      <button
        style={{ position: 'absolute', top: 10, right: 10, zIndex: 100, background: '#f44336', color: 'white' }}
        onClick={handleEndCall}
      >
        End Call
      </button>
    );
  }

  return (
    <button
      style={{ position: 'absolute', top: 10, right: 10, zIndex: 100 }}
      onClick={handleProcessWhiteboard}
    >
      Start Tutoring Session
    </button>
  );
}

export default function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [vapiService, setVapiService] = useState<VapiService | null>(null);
  const [vapiStatus, setVapiStatus] = useState<VapiStatus>('idle');
  const [contextProvider, setContextProvider] = useState<GeminiContextProvider | null>(null);

  // Initialize services and pipeline
  useEffect(() => {
    const isKeyPlaceholder = GEMINI_API_KEY === 'AIzaSyDgX4ncN87Ef5U1Jj8ipVRijdAh1ENwF_E';

    // Prevent running if services are already initialized or keys are missing/placeholders.
    if (contextProvider || isKeyPlaceholder || !VAPI_PUBLIC_KEY || !VAPI_ASSISTANT_ID) {
      if (isKeyPlaceholder) {
        console.warn("Gemini API key is a placeholder. Services will not be initialized.");
      }
      return;
    }

    console.log("API keys found. Initializing services...");

    const vapiConfig: VAPIConfig = {
      apiKey: VAPI_PUBLIC_KEY,
      assistantId: VAPI_ASSISTANT_ID,
    };

    const service = new VapiService(
        VAPI_PUBLIC_KEY,
        (status) => setVapiStatus(status),
        () => {} // No message handling needed for this version
    );
    setVapiService(service);

    const provider = new GeminiContextProvider(GEMINI_API_KEY, vapiConfig);
    setContextProvider(provider);
  }, [contextProvider]);

  // Initialize Automatic AI Tutor
  useEffect(() => {
    if (editor && contextProvider && vapiService) {
      console.log('🤖 Automatic AI Tutor initialized - watching for student work...');
      
      const vapiConfig: VAPIConfig = {
        apiKey: VAPI_PUBLIC_KEY,
        assistantId: VAPI_ASSISTANT_ID,
      };

      const automaticTutor = new AutomaticAITutor(
        editor, 
        contextProvider, 
        vapiService, 
        vapiConfig
      );

      // Cleanup on unmount
      return () => {
        console.log('🧹 Cleaning up Automatic AI Tutor.');
        automaticTutor.cleanup();
      };
    }
  }, [editor, contextProvider, vapiService]);

  const getWhiteboardOcrData = useCallback(async (currentEditor: Editor) => {
    if (!currentEditor) return null;
    const shapeIds = currentEditor.getCurrentPageShapeIds();
    if (shapeIds.size === 0) return null;

    const svgResult = await currentEditor.getSvgString([...shapeIds]);
    if (!svgResult?.svg) return null;

    const base64data = btoa(svgResult.svg); // Use btoa for direct SVG to base64

    const backend_url = 'http://localhost:3001';
    try {
      const response = await fetch(`${backend_url}/api/ocr-vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64data }),
      });
      if (!response.ok) throw new Error(`Backend request failed: ${response.statusText}`);
      return await response.json();
    } catch (error) {
      console.error("Error fetching OCR results:", error);
      alert("Error communicating with the backend. See console.");
      return null;
    }
  }, []);

  const handleAnalyzeAndStartTutor = useCallback(async () => {
    if (!editor || !vapiService || !contextProvider) {
      alert("Services are not ready. Please add your Gemini API key to `src/App.tsx` and refresh.");
      return;
    }

    console.log("Starting analysis to generate educational context (manual trigger)...");
    const ocrData = await OCRService.processWhiteboard(editor);

    if (ocrData) {
      console.log("Received OCR data, processing with Gemini to generate context...", ocrData);
      const contextResult = await contextProvider.generateContext(ocrData);

      if (contextResult.success && contextResult.context) {
        const context = contextResult.context;
        console.log("Educational context generated:", context);
        
        // This is a simplified context for the manual trigger.
        // The automatic tutor provides a much richer context.
        const vapiContext = `The user has started a tutoring session. They have written: "${context.content_analysis.student_wrote}". Please greet them and ask how you can help.`;

        await vapiService.startCall(VAPI_ASSISTANT_ID, vapiContext);
      } else {
        alert(`Failed to create an educational context. Error: ${contextResult.error}`);
      }
    } else {
      console.log("No content on whiteboard. Starting a generic VAPI session.");
      await vapiService.startCall(VAPI_ASSISTANT_ID, "The user started a session with a blank whiteboard. Please greet them.");
    }
  }, [editor, vapiService, contextProvider]);
  
  return (
    <>
      <header style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, padding: '10px', display: 'flex', justifyContent: 'flex-end' }}>
        {editor && (
          <CallControlButton
            vapiService={vapiService}
            isCallActive={vapiStatus === 'connected'}
            handleProcessWhiteboard={handleAnalyzeAndStartTutor}
          />
        )}
      </header>
      <div className="tldraw-container" style={{ position: 'fixed', inset: 0 }}>
        <Tldraw
          onMount={(editor) => setEditor(editor)}
          components={{ HelpMenu: null, MainMenu: null }}
        />
      </div>
    </>
  );
} 