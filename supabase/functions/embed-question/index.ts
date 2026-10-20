import { hasAuthenticatedUser } from "../_shared/auth.ts";
import { jsonResponse, preflightResponse } from "../_shared/http.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return preflightResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!await hasAuthenticatedUser(request)) {
      return jsonResponse({ error: "Sign in to search conference talks." }, 401);
    }

    const payload = await request.json().catch(() => null);
    const question = typeof payload?.question === "string" ? payload.question.trim() : "";
    if (!question || question.length > 2000) {
      return jsonResponse({ error: "Question must be between 1 and 2,000 characters." }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Embedding service is not configured." }, 500);

    const openAiResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: question }),
    });

    if (!openAiResponse.ok) {
      console.error("OpenAI embedding request failed:", openAiResponse.status);
      return jsonResponse({ error: "Could not create a question embedding." }, 502);
    }

    const result = await openAiResponse.json();
    const embedding = result?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      console.error("OpenAI returned an unexpected embedding shape.");
      return jsonResponse({ error: "Embedding service returned an invalid result." }, 502);
    }

    return jsonResponse({ embedding });
  } catch (error) {
    console.error("embed-question failed:", error);
    return jsonResponse({ error: "The embedding request could not be completed." }, 500);
  }
});
