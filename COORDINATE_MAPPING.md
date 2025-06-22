# Coordinate Mapping System for AI Integration

## Overview
This system captures whiteboard screenshots with precise coordinate mapping, allowing AI to analyze the content and draw suggestions back onto the exact same locations on the whiteboard.

## How It Works

### 1. Screenshot Capture with Coordinate Mapping
When you click "Process Whiteboard (OCR)":
- Captures the current viewport bounds from tldraw
- Takes a screenshot of the visible area
- Records the mapping between image pixels and tldraw coordinates
- Sends both image and coordinate mapping to the backend

### 2. OCR Processing with Coordinate Conversion
The backend:
- Processes the image with Google Cloud Vision AI
- Gets text locations in image pixel coordinates
- Converts these to exact tldraw coordinates using the mapping
- Returns JSON with both coordinate systems

### 3. AI Integration Ready
The exported JSON contains:
- `wordAnnotations[].tldraw_coords`: Exact tldraw coordinates for each detected text
- `coordinateMapping`: Complete mapping information
- `spatialAnalysis`: Grouped equations with tldraw coordinates

## JSON Structure

```json
{
  "fullText": "Combined detected text",
  "wordAnnotations": [
    {
      "text": "x",
      "bbox": { /* image pixel coordinates */ },
      "center_x": 150, // image pixels
      "center_y": 200, // image pixels
      "tldraw_coords": {
        "center_x": 45.5, // exact tldraw coordinate
        "center_y": 67.3, // exact tldraw coordinate
        "bbox": { /* tldraw coordinate bounding box */ }
      }
    }
  ],
  "coordinateMapping": {
    "imageWidth": 800,
    "imageHeight": 600,
    "tldrawBounds": {
      "x": -100,
      "y": -50,
      "width": 400,
      "height": 300
    },
    "exportScale": 2,
    "camera": { /* camera info */ }
  }
}
```

## For AI Systems

### Input to AI
Send the complete JSON from OCR processing. The AI can:
- Analyze text content and spatial relationships
- Understand mathematical equations and their positions
- Generate suggestions with specific coordinate targets

### AI Response Format
AI should return suggestions in this format:
```json
{
  "suggestions": [
    {
      "type": "text",
      "text": "Solution: x = 5",
      "tldraw_coords": {
        "center_x": 100.5,
        "center_y": 200.3
      }
    },
    {
      "type": "arrow",
      "start": { "x": 50, "y": 100 },
      "end": { "x": 150, "y": 120 }
    }
  ]
}
```

### Drawing AI Suggestions
Use the `drawAISuggestions(editor, suggestions)` function to draw AI responses directly onto the whiteboard at exact coordinates.

## Testing
1. Draw some math/text on the whiteboard
2. Click "Process Whiteboard (OCR)" - downloads JSON with coordinates
3. Click "Test AI Draw" - demonstrates drawing at specific coordinates
4. Feed JSON to your AI system
5. Use the returned suggestions with `drawAISuggestions()`

## Coordinate System Notes
- Tldraw uses a continuous coordinate system (not pixels)
- Coordinates can be negative (viewport can be anywhere)
- The system maintains precision even when zoomed/panned
- Camera controls are enabled - coordinate mapping works regardless of viewport position
- Viewport bounds are captured at screenshot time for accurate mapping 