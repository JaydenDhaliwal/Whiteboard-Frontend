# Whiteboard App

A simple and modern whiteboard application built with React, TypeScript, and tldraw.

## Features

- 🎨 Interactive drawing canvas
- 🖌️ Multiple drawing tools (pen, brush, eraser, etc.)
- 📝 Text and shape tools
- 🎯 Selection and manipulation tools
- 📱 Responsive design
- 🌈 Color picker and style options
- 🔍 Zoom and pan functionality
- 🤖 **AI-Powered OCR Analysis** - Extract text from your whiteboard and get intelligent feedback
- 🧮 **Mathematical Analysis** - AI suggestions for math equations and calculations
- 📊 **Smart Positioning** - AI suggestions positioned contextually on your whiteboard

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   cd backend
   npm install
   ```

### API Keys Setup

To enable AI features, you'll need to set up API keys:

1. **Google Cloud Vision API**: Place your service account JSON file in the `backend/` directory
2. **Gemini AI API**: 
   - Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - In the `backend/` directory, create a `.env` file:
     ```
     GEMINI_API_KEY=your-gemini-api-key-here
     ```

### Running the Application

1. Start the backend server:
   ```bash
   cd backend
   node server.js
   ```

2. In a new terminal, start the frontend development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

4. Start drawing on your whiteboard!

### Using AI Features

1. Draw some mathematical content on your whiteboard (equations, numbers, text)
2. Click the "Process Whiteboard (OCR)" button
3. The AI will:
   - Extract all text from your whiteboard
   - Analyze mathematical expressions
   - Generate intelligent suggestions and feedback
   - Position these suggestions contextually on your whiteboard
   - Download a detailed JSON analysis file

### Building for Production

To create a production build:

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## Usage

- **Draw**: Use the pen tool to draw freehand
- **Shapes**: Add rectangles, circles, and other shapes
- **Text**: Add text annotations
- **Select**: Click and drag to select and move objects
- **Zoom**: Use the zoom controls or mouse wheel to zoom in/out
- **Pan**: Hold space and drag to pan around the canvas
- **Undo/Redo**: Use Ctrl+Z and Ctrl+Y (or Cmd+Z and Cmd+Y on Mac)

## Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **tldraw** - Drawing library
- **CSS3** - Styling with modern features

## Project Structure

```
whiteboard-app/
├── src/
│   ├── App.tsx          # Main application component
│   ├── main.tsx         # React entry point
│   └── index.css        # Global styles
├── index.html           # HTML template
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite configuration
└── README.md           # This file
```

## Customization

You can customize the whiteboard by modifying the `Tldraw` component props in `src/App.tsx`:

- `showMenu`: Show/hide the main menu
- `showPages`: Show/hide page management
- `showStyles`: Show/hide style options
- `showUI`: Show/hide the entire UI
- `showZoom`: Show/hide zoom controls
- `showTools`: Show/hide the toolbar

## License

This project is open source and available under the MIT License. 