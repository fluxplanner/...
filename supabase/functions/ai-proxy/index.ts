import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { system, messages, imageBase64, mimeType } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (imageBase64) {
      const geminiKey = Deno.env.get("GEMINI_API_KEY");
      if (!geminiKey) return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const lastMsg = messages[messages.length - 1]?.content || "";
      const parts = [
        { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
        { text: (system ? system + "\n\n" : "") + lastMsg }
      ];
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }] })
      });
      const d = await res.json();
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) return new Response(JSON.stringify({ error: "GROQ_API_KEY not set" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", max_tokens: 2048,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...messages]
      })
    });
    const d = await res.json();
    const text = d.choices?.[0]?.message?.content || "";
    return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
