const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'GROQ_API_KEY not set in Vercel.' }); return; }

  try {
    // Sanitize messages — Groq llama doesn't support vision/image_url
    // Convert any complex content arrays to plain text
    const sanitizeContent = (content) => {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join('\n') || '[Image uploaded — describe what you see in it based on context]';
      }
      return String(content);
    };

    const messages = (req.body.messages || []).map(m => ({
      role: m.role,
      content: sanitizeContent(m.content)
    }));

    const payload = {
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: req.body.system || '' },
        ...messages
      ]
    };

    const body = JSON.stringify(payload);

    const data = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${apiKey}`
        }
      };
      const r = https.request(opts, (pr) => {
        let b = '';
        pr.on('data', c => b += c);
        pr.on('end', () => resolve({ status: pr.statusCode, body: b }));
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    const groq = JSON.parse(data.body);
    if (groq.error) {
      res.status(400).json({ error: groq.error.message || 'Groq API error' });
      return;
    }
    const reply = groq.choices?.[0]?.message?.content || 'No response.';
    res.status(200).json({ content: [{ type: 'text', text: reply }] });

  } catch (err) {
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  }
};
