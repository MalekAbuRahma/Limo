import { GoogleGenAI } from "@google/genai";

export class AIService {
  private getAI() {
    // Ensuring the latest key is used by creating a new instance per call
    return new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  /**
   * Edits an image based on a text prompt using gemini-2.5-flash-image
   */
  async editImage(base64Image: string, prompt: string): Promise<string | null> {
    const ai = this.getAI();
    const base64Data = base64Image.split(',')[1] || base64Image;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      return null;
    } catch (error) {
      console.error("AI Image Edit Error:", error);
      throw error;
    }
  }

  /**
   * Handles complex fleet analysis queries using gemini-3-pro-preview with thinking budget
   */
  async analyzeFleet(context: string, userQuery: string): Promise<string> {
    const ai = this.getAI();
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: `
          Fleet Context:
          ${context}

          Question:
          ${userQuery}
        `,
        config: {
          // Max thinking budget for gemini-3-pro-preview
          thinkingConfig: { thinkingBudget: 32768 },
          systemInstruction: `You are a professional fleet management auditor. 
          Respond in the user's current language (English or Arabic). 
          Provide deep, data-driven reasoning before arriving at a conclusion. 
          Be highly professional and concise in the final output.`
        },
      });

      return response.text || "No analysis available.";
    } catch (error) {
      console.error("AI Analysis Error:", error);
      throw error;
    }
  }
}

export const aiService = new AIService();
