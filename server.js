import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

// Current Gemini model
const MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";


// ===============================
// GEMINI API
// ===============================

if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "WARNING: GEMINI_API_KEY is not set in environment variables."
  );
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});


// ===============================
// EXPRESS CONFIG
// ===============================

app.use(express.json({ limit: "100kb" }));

app.use(
  express.static(path.join(__dirname, "public"))
);


// ===============================
// AI SYSTEM INSTRUCTION
// ===============================

const systemInstruction = `
You are Rajasthan Smart Shiksha AI, an education-focused multilingual AI assistant.

Project:
Rajasthan Smart Shiksha AI
SIH25104
Government of Rajasthan
Smart Education Project
2026

Developer:
Shivkant Bhambi

Your job is to help students with:

- Education
- Courses
- College information
- Admissions
- Scholarships
- Exams
- Study planning
- Career guidance
- General student services
- Learning questions
- Hindi, English and Hinglish conversations

IMPORTANT RULES:

1. Always be helpful and student-friendly.

2. Understand the language used by the student.

3. Hindi, English and Hinglish are especially important.

4. Use simple language that students can easily understand.

5. Do NOT invent government rules.

6. Do NOT invent scholarship amounts.

7. Do NOT invent scholarship eligibility.

8. Do NOT invent admission dates.

9. Do NOT invent exam dates.

10. Do NOT invent fees or deadlines.

11. If information may be outdated or official verification is required,
clearly tell the student that they should verify it from the relevant
official Rajasthan government, university or college portal.

12. Never claim that a government rule is official unless reliable official
information has been provided.

13. This project currently does not have an official RAG/document knowledge
base, so never pretend that you have access to documents that you do not have.

14. Do not create fake sources, fake links or fake page numbers.

15. Give concise answers unless the student asks for detailed information.

16. Be polite, supportive and encouraging.

17. If a student asks a normal educational question, answer it directly.

18. If the student asks for study help, provide practical examples.

19. If the student asks in Hinglish, replying in Hinglish is acceptable.

20. Do not expose API keys, server secrets or internal configuration.

You are Rajasthan Smart Shiksha AI.
`;


// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});


// ===============================
// AI CHAT API
// ===============================

app.post("/api/chat", async (req, res) => {
  try {

    const {
      message,
      language = "Hindi",
      history = []
    } = req.body || {};


    // -------------------------------
    // Validate message
    // -------------------------------

    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Message is required."
      });
    }


    // -------------------------------
    // Check API key
    // -------------------------------

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key is not configured on the server."
      });
    }


    // -------------------------------
    // Safe conversation history
    // -------------------------------

    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              (item.role === "user" ||
                item.role === "model") &&
              typeof item.text === "string"
          )
          .slice(-12)
      : [];


    // -------------------------------
    // Convert history to Gemini format
    // -------------------------------

    const contents = safeHistory.map((item) => ({
      role: item.role,
      parts: [
        {
          text: item.text.slice(0, 5000)
        }
      ]
    }));


    // -------------------------------
    // Avoid duplicate current message
    // -------------------------------

    const lastMessage =
      contents[contents.length - 1];

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.parts?.[0]?.text !== message
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: message.slice(0, 5000)
          }
        ]
      });
    }


    // -------------------------------
    // Gemini request
    // -------------------------------

    const response = await ai.models.generateContent({

      model: MODEL,

      contents: contents,

      config: {

        systemInstruction:
          `${systemInstruction}

Preferred response language:
${language}`,

        maxOutputTokens: 800

      }

    });


    // -------------------------------
    // Get AI response
    // -------------------------------

    const reply =
      response.text?.trim();


    if (!reply) {

      return res.status(502).json({
        error: "AI returned an empty response."
      });

    }


    // -------------------------------
    // Send response to frontend
    // -------------------------------

    return res.json({

      reply: reply,

      model: MODEL

    });


  } catch (error) {

    console.error(
      "Gemini error:",
      error
    );


    const status =
      Number(error?.status) || 500;


    // -------------------------------
    // Rate limit
    // -------------------------------

    if (status === 429) {

      return res.status(429).json({

        error:
          "AI rate limit reached. Please wait a little and try again."

      });

    }


    // -------------------------------
    // Authentication error
    // -------------------------------

    if (
      status === 401 ||
      status === 403
    ) {

      return res.status(status).json({

        error:
          "Gemini API key is invalid or does not have access."

      });

    }


    // -------------------------------
    // Model not found
    // -------------------------------

    if (status === 404) {

      return res.status(404).json({

        error:
          `Gemini model "${MODEL}" is not available for this API key.`

      });

    }


    // -------------------------------
    // General error
    // -------------------------------

    return res.status(500).json({

      error:
        "AI service error. Please check the Render environment variables and Gemini API configuration."

    });

  }
});


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

  console.log(
    `Rajasthan Smart Shiksha AI running on port ${PORT}`
  );

  console.log(
    `Gemini model: ${MODEL}`
  );

});
