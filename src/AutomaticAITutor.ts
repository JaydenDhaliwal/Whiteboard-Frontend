import { Editor } from '@tldraw/tldraw';
import { GeminiContextProvider } from './GeminiContextProvider';
import { OCRService } from './OCRService';
import { VAPIConfig, WhiteboardContext } from './types';
import { VapiService } from './VapiService';

export class AutomaticAITutor {
  private editor: Editor;
  private contextProvider: GeminiContextProvider;
  private vapiService: VapiService;
  private vapiConfig: VAPIConfig;
  private debounceTimer: number | null = null;
  private isProcessing = false;

  constructor(
    editor: Editor, 
    contextProvider: GeminiContextProvider, 
    vapiService: VapiService, 
    vapiConfig: VAPIConfig
  ) {
    this.editor = editor;
    this.contextProvider = contextProvider;
    this.vapiService = vapiService;
    this.vapiConfig = vapiConfig;
    this.setupAutoProcessing();
    console.log("AutomaticAITutor initialized and watching for drawing changes.");
  }

  private setupAutoProcessing() {
    this.editor.store.listen((change) => {
      if (change.source === 'user' && this.hasDrawingChanges(change)) {
        this.onUserDrawing();
      }
    });
  }

  private onUserDrawing() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.autoProcessUserWork();
    }, 2500); // 2.5 second pause triggers analysis
  }

  private shouldProcessAutomatically(): boolean {
    const drawShapes = this.editor.getCurrentPageShapes().filter(shape => shape.type === 'draw');
    if (drawShapes.length === 0) return false;

    // Check for substantial content, avoiding tiny scribbles
    return drawShapes.some(shape => {
      const bounds = this.editor.getShapePageBounds(shape);
      return bounds && (bounds.w > 40 || bounds.h > 20);
    });
  }

  private async autoProcessUserWork() {
    // Only block processing if it's already in the middle of a run.
    // We want to process changes even if a call is active.
    if (this.isProcessing) {
      return;
    }

    // A light check to avoid processing tiny, accidental marks.
    if (!this.shouldProcessAutomatically()) {
        return;
    }

    this.isProcessing = true;
    this.showProcessingIndicator();
    console.log('🧠 Student paused. Kicking off automatic tutoring pipeline...');

    try {
      console.log("1. Processing whiteboard for OCR...");
      const ocrData = await OCRService.processWhiteboard(this.editor);
      
      if (!ocrData) {
        console.log("No content detected on whiteboard. Aborting.");
        this.isProcessing = false;
        this.hideProcessingIndicator();
        return;
      }
      console.log("✅ OCR data received:", ocrData);

      console.log("2. Generating educational context with Gemini...");
      const contextResult = await this.contextProvider.generateContext(ocrData);

      if (contextResult.success && contextResult.context) {
        const context = contextResult.context;
        const vapiContextPrompt = this.buildVapiContext(context);
        
        if (this.vapiService.isConnected()) {
          // If a call is fully connected, send a real-time update.
          console.log("3. VAPI call is active. Sending real-time update...");
          this.vapiService.updateContext(vapiContextPrompt);
        } else if (!this.vapiService.isCallActive()) {
          // If no call is active or connecting, start a new one.
          console.log('✅ Educational context generated successfully.');
          console.log("3. Starting VAPI call with generated context...");
          await this.vapiService.startCall(this.vapiConfig.assistantId, vapiContextPrompt);
          console.log("✅ VAPI call initiated.");
        } else {
            console.log("VAPI call is currently connecting. Update will be sent on connection or by the next trigger.");
        }

      } else {
        console.error('❌ Context generation failed. Cannot start or update VAPI call.', contextResult.error);
      }
    } catch (error) {
      console.error('❌ An error occurred in the automatic tutoring pipeline:', error);
    } finally {
      this.isProcessing = false;
      this.hideProcessingIndicator();
    }
  }

  private buildVapiContext(context: WhiteboardContext): string {
    // Convert the structured context into a detailed string for VAPI.
    return `
      **Your Greeting & Persona:**
      Your name is "Alex". Greet the user with a simple, friendly "Hi there!" or "Hello!". DO NOT introduce yourself as an AI. Your goal is to sound like a helpful, encouraging human tutor who just joined the session.
      If the whiteboard has content, you can naturally reference it, for example: "Hi there! I see you're working on an equation. How's it going?". If the board is blank, just say "Hello, what should we work on today?".
      
      **Whiteboard & Student Analysis (for your internal use ONLY):**
      - **What the student wrote:** ${context.content_analysis.student_wrote}
      - **Identified problem type:** ${context.content_analysis.problem_type}
      - **Current progress:** ${context.content_analysis.student_progress_stage}
      - **Key concepts involved:** ${context.educational_context.key_concepts_involved.join(', ')}

      **Your Role & Available Information (for your internal use ONLY):**
      You are a friendly and encouraging AI math tutor. The user has been working on their whiteboard. You have been provided with a detailed analysis of their work.
      - **Your Goal:** Have a natural conversation. Use the detailed context below to inform your responses, ask questions, offer help, and refer to what they've written.
      - **DO NOT** read this context to the user. It is for your internal understanding only.

      **Detailed Context (for your reference):**
      \`\`\`json
      ${JSON.stringify(context, null, 2)}
      \`\`\`
    `;
  }

  private hasDrawingChanges(change: any): boolean {
    const wasShapeAdded = (shape: any) => shape.type === 'draw';
    const wasShapeUpdated = (prev: any, next: any) => next.type === 'draw';

    // Cast the unknown properties to iterable records
    const addedChanges = change.changes.added as Record<string, any> ?? {};
    const updatedChanges = change.changes.updated as Record<string, [any, any]> ?? {};

    for (const record of Object.values(addedChanges)) {
        if (wasShapeAdded(record)) return true;
    }
    for (const [prev, next] of Object.values(updatedChanges)) {
        if (wasShapeUpdated(prev, next)) return true;
    }
    return false;
  }
  
  private showProcessingIndicator() {
    let indicator = document.getElementById('auto-processing-indicator');
    if (indicator) return;

    indicator = document.createElement('div');
    indicator.id = 'auto-processing-indicator';
    indicator.innerHTML = `
      <div style="
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7); color: white;
        padding: 8px 16px; border-radius: 20px; font-size: 14px; z-index: 10000;
        display: flex; align-items: center; gap: 8px;
        animation: pulse 2s infinite;
      ">
        <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }</style>
        🤖 AI is thinking...
      </div>`;
    document.body.appendChild(indicator);
  }

  private hideProcessingIndicator() {
    const indicator = document.getElementById('auto-processing-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  private showFallbackEncouragement() {
    // This function is no longer needed as we are not providing visual feedback.
  }

  public cleanup() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.hideProcessingIndicator();
    console.log("AutomaticAITutor cleaned up.");
  }
} 