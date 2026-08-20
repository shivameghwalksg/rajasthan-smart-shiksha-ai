import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set. Add it to your environment variables.");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const systemInstruction = `
You are Rajasthan Smart Shiksha AI, an education-focused multilingual assistant for a Smart Education prototype.
Project: SIH25104, Government of Rajasthan, Smart Education, 2026.
Developer: Shivkant Bhambi.

Rules:
1. Help students with education, courses, admissions, scholarships, exams, study planning and general student services.
2. Understand and respond in the user's requested language. Hindi, English and Hinglish are especially important.
3. Use simple, student-friendly language.
4. Never claim that information is an official Rajasthan government rule unless it is provided from an official source in the future knowledge base.
5. If you do not know a current or official fact, clearly say that it needs verification from the relevant official notice/portal.
6. Do not invent scholarship amounts, eligibility rules, dates, fees, deadlines, or government policies.
7. This phase has no official document/RAG knowledge base yet, so do not pretend that a source or page number exists.
8. Keep answers useful and concise unless the student asks for detail.
`;

app.get("/api/health", (req, res) => {
  res.json({ ok: true, model: MODEL, aiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, language = "Hindi", history = [] } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .filter(x => x && (x.role === "user" || x.role === "model") && typeof x.text === "string")
          .slice(-12)
      : [];

    const contents = safeHistory.map(x => ({
      role: x.role,
      parts: [{ text: x.text.slice(0, 5000) }]
    }));

    // Avoid duplicating the current message if the frontend included it in history.
    const last = contents[contents.length - 1];
    if (!last || last.role !== "user" || last.parts[0].text !== message) {
      contents.push({ role: "user", parts: [{ text: message.slice(0, 5000) }] });
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: `${systemInstruction}\nPreferred response language: ${language}.`,
        temperature: 0.4,
        maxOutputTokens: 800
      }
    });

    const reply = response.text?.trim();
    if (!reply) return res.status(502).json({ error: "AI returned an empty response." });

    res.json({ reply, model: MODEL });
  } catch (error) {
    console.error("Gemini error:", error);
    const status = Number(error?.status) || 500;
    if (status === 429) {
      return res.status(429).json({ error: "AI free-tier rate limit reached. Please wait a little and try again." });
    }
    res.status(500).json({ error: "AI service error. Check the server configuration and API key." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Rajasthan Smart Shiksha AI running on port ${PORT}`);
});
