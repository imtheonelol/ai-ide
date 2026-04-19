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
        stream: false, // For simplicity in this phase, we wait for the full response
      }),
    });

    if (!response.ok) {
      throw new Error(`AI server responded with status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("AI Generation Error:", error);
    throw error;
  }
};