import { Editor } from '@tldraw/tldraw';

export class OCRService {
  /**
   * Captures the current state of the tldraw editor, sends it to the backend for OCR,
   * and returns the annotation data.
   * @param editor The tldraw editor instance.
   * @returns The OCR data from the backend, or null if an error occurs.
   */
  static async processWhiteboard(editor: Editor): Promise<any> {
    console.log("Starting whiteboard analysis via OCRService...");
    if (!editor) return null;

    const shapeIds = editor.getCurrentPageShapeIds();
    if (shapeIds.size === 0) {
      console.log("No shapes found on the canvas.");
      return null;
    }

    // This logic is moved directly from App.tsx to ensure it works with our existing backend.
    // It captures the SVG, converts it to a PNG Blob, then to base64.
    const svgResult = await editor.getSvgString([...shapeIds], { background: false });

    if (!svgResult?.svg) {
      console.error("Could not generate SVG from whiteboard.");
      return null;
    }

    const imageBlob = await new Promise<Blob | null>((resolve) => {
        const image = new Image()
        image.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const context = canvas.getContext('2d')
            context?.drawImage(image, 0, 0)
            canvas.toBlob(resolve, 'image/png')
        }
        image.onerror = () => resolve(null)
        image.src = `data:image/svg+xml;base64,${btoa(svgResult.svg)}`
    });

    if (!imageBlob) {
      console.error("Failed to convert SVG to PNG.");
      return null;
    }

    const base64data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(imageBlob);
    });

    const backend_url = 'http://localhost:3001';
    try {
      const response = await fetch(`${backend_url}/api/ocr-vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64data }),
      });
      if (!response.ok) {
        throw new Error(`Backend request failed: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Error fetching OCR results from backend:", error);
      // In a real app, you might want a more user-friendly error display
      alert("Error communicating with the backend analysis service. See console for details.");
      return null;
    }
  }
} 