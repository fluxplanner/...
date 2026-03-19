import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { imageBase64, mimeType, prompt } = await req.json();
    if (!imageBase64 || !prompt) return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "GROQ_API_KEY not set" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const body = { model: "meta-llama/llama-4-scout-17b-16e-instruct", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } }, { type: "text", text: prompt }] }], temperature: 0.1, max_tokens: 2048 };
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` }, body: JSON.stringify(body) });
    if (!res.ok) { const err = await res.text(); return new Response(JSON.stringify({ error: `Groq API ${res.status}: ${err}` }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } }); }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    if (!text) return new Response(JSON.stringify({ error: "Groq returned empty response" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } }); }
});
