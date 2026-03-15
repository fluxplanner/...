
exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'GEMINI_API_KEY not set' }) };

  try {
    const { prompt, imageBase64, mimeType } = JSON.parse(event.body || '{}');
    if (!prompt) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing prompt' }) };

    const parts = [];
    if (imageBase64) parts.push({ inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } });
    parts.push({ text: prompt });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { statusCode: response.status, headers, body: JSON.stringify({ error: err.error?.message || 'Gemini error' }) };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { statusCode: 200, headers, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
