exports.handler = async function(event) {
  const h = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json'};
  if (event.httpMethod === 'OPTIONS') return {statusCode:200,headers:h,body:''};
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return {statusCode:500,headers:h,body:JSON.stringify({error:'GEMINI_API_KEY not set'})};
  try {
    const {prompt,imageBase64,mimeType} = JSON.parse(event.body||'{}');
    if (!prompt) return {statusCode:400,headers:h,body:JSON.stringify({error:'Missing prompt'})};
    const parts = [];
    if (imageBase64) parts.push({inlineData:{mimeType:mimeType||'image/jpeg',data:imageBase64}});
    parts.push({text:prompt});
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts}]})});
    if (!res.ok) {const e=await res.json().catch(()=>({}));return {statusCode:res.status,headers:h,body:JSON.stringify({error:e.error?.message||'Gemini error'})};}
    const d = await res.json();
    return {statusCode:200,headers:h,body:JSON.stringify({text:d.candidates?.[0]?.content?.parts?.[0]?.text||''})};
  } catch(e) {return {statusCode:500,headers:h,body:JSON.stringify({error:e.message})};}
};
