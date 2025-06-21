import React, { useState } from 'react';
import { Tldraw, Editor } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

function App() {
  const [editor, setEditor] = useState<Editor | null>(null);

  const handleSave = () => {
    if (!editor) return;
    const snapshot = editor.getSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
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
          Save Snapshot
        </button>
      </header>
      
      <div className="whiteboard-container">
        <Tldraw 
          className="tldraw-container"
          onMount={(editor) => setEditor(editor)}
        />
      </div>
    </>
  );
}

export default App; 