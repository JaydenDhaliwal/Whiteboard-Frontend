import React from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

function App() {
  return (
    <>
      <header className="app-header">
        <h1 className="app-title">🎨 Whiteboard App</h1>
      </header>
      
      <div className="whiteboard-container">
        <Tldraw 
          className="tldraw-container"
        />
      </div>
    </>
  );
}

export default App; 