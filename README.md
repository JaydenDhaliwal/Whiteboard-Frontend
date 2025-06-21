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

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to `http://localhost:3000`

3. Start drawing on your whiteboard!

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