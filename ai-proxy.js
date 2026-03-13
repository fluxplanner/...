const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-groq-key');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = req.headers['x-groq-key'];
  if (!groqKey) {
    res.status(400).json({ error: 'Missing Groq API key' });
    return;
  }

  try {
    // Convert Anthropic-style messages to OpenAI-compatible format (Groq uses this)
    const { system, messages, max_tokens } = req.body;

    const groqMessages = [];
    if (system) groqMessages.push({ role: 'system', content: system });
    messages.forEach(m => groqMessages.push({ role: m.role, content: m.content }));

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: max_tokens || 1000,
      messages: groqMessages
    });

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `Bearer ${groqKey}`
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let responseBody = '';
        proxyRes.on('data', chunk => responseBody += chunk);
        proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, body: responseBody }));
      });

      proxyReq.on('error', reject);
      proxyReq.write(body);
      proxyReq.end();
    });

    // Convert Groq response back to Anthropic-style so the frontend doesn't need changes
    const groqData = JSON.parse(data.body);
    if (groqData.error) {
      res.status(data.status).json({ error: groqData.error.message });
      return;
    }

    const reply = groqData.choices?.[0]?.message?.content || '';
    res.status(200).json({
      content: [{ type: 'text', text: reply }]
    });

  } catch (err) {
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  }
};
