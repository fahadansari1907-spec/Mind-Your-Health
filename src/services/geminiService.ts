import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { HealthProfile, Language, FoodInput, FoodAnalysis, DailyIntake } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const analyzeFood = async (
  input: FoodInput, 
  location?: string, 
  profile: HealthProfile = 'none', 
  language: Language = 'english'
): Promise<FoodAnalysis> => {
  const model = "gemini-3-flash-preview";
  
  const profileContext = profile !== 'none' 
    ? `The user has a health condition: ${profile.toUpperCase()}. Pay special attention to ingredients that might affect this condition (e.g., sugar for diabetes, sodium for hypertension, gluten for gluten-free).`
    : "";

  const systemInstruction = `You are an expert AI health assistant for the app "Mind Your Health".
Your job is to analyze food products based on text or image input.
The user's preferred language is: ${language.toUpperCase()}. You MUST provide the entire response in ${language.toUpperCase()}.
Keep language VERY simple (understandable by a 10-year-old).
No complex medical or scientific terms.
Each section must be SHORT (2–3 lines max).
Be clear, structured, and user-friendly.

${profileContext}

SMART SCAN INSTRUCTIONS:
- If the image is a FOOD ITEM (e.g., a burger, samosa, fruit), identify it and analyze its healthiness based on typical preparation.
- If the image is a NUTRITION LABEL or INGREDIENT LIST, read the specific values and ingredients to provide a precise score.

You MUST return a JSON object with the following structure:
{
  "isFood": boolean (true if the input is a food item or nutrition label, false otherwise),
  "score": number (0-100),
  "theGood": "Simple explanation of what is healthy about this food",
  "theBad": "Simple explanation of what is unhealthy about this food",
  "theVerdict": "A final simple summary and advice",
  "alternatives": ["Alternative 1", "Alternative 2"],
  "localSuggestions": ["Local Suggestion 1", "Local Suggestion 2"],
  "macros": {
    "protein": number (grams),
    "carbs": number (grams),
    "fats": number (grams),
    "calories": number (kcal)
  }
}

If isFood is false, you can set the other fields to empty strings or 0.
Ensure the macros are realistic estimates for the portion size identified.
If the food is dangerous for the user's condition (${profile}), the score MUST be below 30.`;

  const parts: any[] = [];
  if (input.text) {
    parts.push({ text: input.text });
  }
  if (input.image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: input.image.split(",")[1],
      },
    });
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isFood: { type: Type.BOOLEAN },
          score: { type: Type.NUMBER },
          theGood: { type: Type.STRING },
          theBad: { type: Type.STRING },
          theVerdict: { type: Type.STRING },
          alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
          localSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          macros: {
            type: Type.OBJECT,
            properties: {
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fats: { type: Type.NUMBER },
              calories: { type: Type.NUMBER }
            },
            required: ["protein", "carbs", "fats", "calories"]
          }
        },
        required: ["isFood", "score", "theGood", "theBad", "theVerdict", "alternatives", "localSuggestions", "macros"]
      }
    },
  });

  return JSON.parse(response.text);
};

export const generateHealthyRecipe = async (foodItem: string, language: Language = 'english') => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `You are a friendly chef for "Mind Your Health".
Your job is to provide a QUICK (5-minute) healthy recipe as an alternative to the food item mentioned.
The user's preferred language is: ${language.toUpperCase()}. You MUST provide the entire response in ${language.toUpperCase()}.
Keep it VERY simple, using common ingredients.
Format:
- Title: [Name of the healthy dish]
- Ingredients: [List of 3-5 simple items]
- Steps: [2-3 very short steps]
- Health Tip: [One simple tip]`;

  const prompt = `Give me a 5-minute healthy recipe alternative for: ${foodItem}`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
    },
  });

  return response.text;
};

export const calculateDailyIntake = async (meals: string[], language: Language = 'english'): Promise<DailyIntake> => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `You are a simple health assistant for "Mind Your Health".
Your job is to look at a list of meals eaten today and explain the daily food intake in a VERY simple way.
The user's preferred language is: ${language.toUpperCase()}. You MUST provide the entire response in ${language.toUpperCase()}.
Keep everything VERY simple and easy to understand (like for a 10-year-old).

You MUST return a JSON object with the following structure:
{
  "summary": "A simple encouraging summary of the day",
  "macros": {
    "protein": total_grams,
    "carbs": total_grams,
    "fats": total_grams,
    "calories": total_kcal
  },
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Estimate the total macros based on the list of meals provided.`;

  const prompt = `Here are the meals I ate today:
${meals.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Please analyze my daily progress and tell me what to eat next.`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          macros: {
            type: Type.OBJECT,
            properties: {
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fats: { type: Type.NUMBER },
              calories: { type: Type.NUMBER }
            },
            required: ["protein", "carbs", "fats", "calories"]
          },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["summary", "macros", "recommendations"]
      }
    },
  });

  return JSON.parse(response.text);
};

export const estimateRequirements = async (age: string, weight: string, activity: string) => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `You are a simple and friendly health assistant for "Mind Your Health".
Your job is to estimate a person’s daily food requirement based on their age, weight, and activity level.
Do NOT focus on complex calorie numbers.
Explain everything in a very simple and practical way (like for a 10-year-old).
Avoid medical or technical terms.
Keep each section short (2–3 lines max).

STRICTLY follow this format:
1. Daily Requirement Summary:
- Explain like: "Your body needs about [X] amount of energy daily"
- Also convert into simple understanding: "This is equal to [number] balanced meals and [number] light snacks"

2. Food Distribution:
- Suggest what a typical day should include:
  - Protein
  - Fiber
  - Carbohydrates
- Keep it simple and practical

3. What to Eat More:
- Suggest 2–3 types of foods to include more

4. What to Avoid:
- Mention 2–3 things to limit

5. Simple Tip:
- Give one easy daily habit`;

  const prompt = `Please estimate daily requirements for:
Age: ${age}
Weight: ${weight}
Activity Level: ${activity}`;

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction,
    },
  });

  return response.text;
};
