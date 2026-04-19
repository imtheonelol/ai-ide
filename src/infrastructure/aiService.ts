// src/infrastructure/aiService.ts
export interface AIRequest {
  model: string;
  prompt: string;
  system: string;
}

export const generateAIResponse = async (request: AIRequest): Promise<string> => {
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        system: request.system,
        stream: false,
      }),
    });

    if (!response.ok) throw new Error("Local AI server is not responding.");
    
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("AI Generation Error:", error);
    return "// Error: Could not connect to local AI. Ensure Ollama is running.";
  }
};