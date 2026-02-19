
import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;
try {
    const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
    if (API_KEY) {
        genAI = new GoogleGenerativeAI(API_KEY);
    }
} catch (error) {
    console.error("Error initializing Gemini:", error);
}

export const extractDestination = async (text) => {
    if (!genAI) {
        console.warn("Gemini API Key missing");
        return null;
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Extract the destination location from this voice command: "${text}". 
        Return ONLY the destination name. Do not add any other text.
        If the command is not about navigation or has no destination, return "null".
        Example: "Navigate to Central Station" -> "Central Station"
        Example: "Take me to the nearest pharmacy" -> "nearest pharmacy"`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const destination = response.text().trim();

        return destination.toLowerCase().includes("null") ? null : destination;
    } catch (error) {
        console.error("Gemini Extraction Error:", error);
        return null;
    }
};
