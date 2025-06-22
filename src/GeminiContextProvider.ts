import { GoogleGenerativeAI } from "@google/generative-ai";
import { VAPIConfig, WhiteboardContext, ContextResult, EnhancedOCRResult } from './types';

export class GeminiContextProvider {
  private gemini: GoogleGenerativeAI;
  private vapiConfig: VAPIConfig;

  constructor(geminiApiKey: string, vapiConfig: VAPIConfig) {
    this.gemini = new GoogleGenerativeAI(geminiApiKey);
    this.vapiConfig = vapiConfig;
    console.log("GeminiContextProvider initialized.");
  }

  public async generateContext(enhancedOCRData: EnhancedOCRResult): Promise<ContextResult> {
    console.log("Generating educational context for OCR data...", enhancedOCRData);
    try {
      const contextPrompt = this.buildContextPrompt(enhancedOCRData);
      
      const model = this.gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      const generationConfig = {
        responseMimeType: "application/json",
        temperature: 0.7, // Slightly less creative for structured data
        topK: 1,
        topP: 1,
        maxOutputTokens: 8192,
      };

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: contextPrompt }] }],
        generationConfig: generationConfig,
      });
      
      const response = result.response;
      const context: WhiteboardContext = JSON.parse(response.text());

      console.log("✅ Successfully generated Whiteboard Context:", context);

      return { success: true, context: context };
    } catch (error) {
      console.error("❌ Error generating whiteboard context from Gemini:", error);
      return { success: false, error: "Failed to generate context from Gemini." };
    }
  }

  private buildContextPrompt(ocrData: EnhancedOCRResult): string {
    const studentWork = JSON.stringify(ocrData.spatialAnalysis, null, 2);

    return `
      You are an expert AI educator specializing in mathematics. Your task is to analyze a student's work on a virtual whiteboard and generate a rich, structured educational context for a Voice AI tutor (VAPI). The goal is to provide the Voice AI with all the information it needs to have a natural, helpful, and context-aware conversation with the student.

      **Student's Work (JSON format based on OCR):**
      \`\`\`json
      ${studentWork}
      \`\`\`

      **Instructions:**
      Based on the student's work, generate a JSON object that conforms to the "WhiteboardContext" interface. Analyze the work deeply to provide comprehensive and genuinely helpful context.

      1.  **content_analysis**:
          - student_wrote: A clear, concise summary of what the student has written on the whiteboard.
          - mathematical_elements: Identify every distinct mathematical element. For each, specify its type, position (descriptively), and mathematical meaning. This is crucial for the AI to reference things precisely (e.g., "that '5' you wrote on the left").
          - problem_type: Classify the type of problem (e.g., "two-digit addition," "solving a linear equation").
          - difficulty_assessment: Gauge the difficulty level (e.g., "beginner," "intermediate").
          - student_progress_stage: Assess where the student is in the problem-solving process (e.g., "just started," "stuck in the middle," "checking the answer").

      2.  **educational_context**:
          - Provide the broader educational picture. What concept is the student likely learning? What are common challenges or key concepts related to this topic? What are the logical next steps, and what potential misconceptions should the AI be aware of?

      3.  **conversation_context**:
          - Give the AI conversational tools. Describe the whiteboard layout. List specific things the AI can reference. Suggest questions the student might ask and prepare helpful explanations.

      4.  **session_state**:
          - Initialize the session state. Suggest good conversation starters for the AI.

      **Output Format (JSON):**
      Return ONLY a valid JSON object that matches the WhiteboardContext structure. Do not include any other text or markdown formatting.
      `;
  }
} 