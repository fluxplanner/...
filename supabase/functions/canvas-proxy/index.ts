import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

type ForwardBody = {
  url: string;
  token: string;
  method?: string;
  body?: string;
  contentType?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let targetUrl: string | null = null;
    let token: string | null = null;
    let method = "GET";
    let forwardBody: string | undefined;
    let forwardContentType: string | undefined;

    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = (await req.json()) as ForwardBody;
        targetUrl = j.url;
        token = j.token;
        method = (j.method || "POST").toUpperCase();
        forwardBody = j.body;
        forwardContentType = j.contentType;
      } else {
        return new Response(JSON.stringify({ error: "POST requires application/json body" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const url = new URL(req.url);
      targetUrl = url.searchParams.get("url");
      token = url.searchParams.get("token");
      method = (url.searchParams.get("method") || "GET").toUpperCase();
    }

    if (!targetUrl || !token) {
      return new Response(JSON.stringify({ error: "Missing url or token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    if (forwardBody != null && method !== "GET" && method !== "HEAD") {
      headers["Content-Type"] = forwardContentType || "application/x-www-form-urlencoded";
    }

    const init: RequestInit = { method, headers };
    if (forwardBody != null && method !== "GET" && method !== "HEAD") {
      init.body = forwardBody;
    }

    const res = await fetch(targetUrl, init);
    const text = await res.text();
    const outCt = res.headers.get("content-type") || "application/json; charset=utf-8";

    return new Response(text, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": outCt },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
