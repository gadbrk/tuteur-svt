export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("OK", { headers: { "content-type": "text/plain; charset=utf-8" } });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const system = {
          role: "system",
          content: "Tu es un tuteur de SVT bienveillant pour un collégien ou lycéen français. Explique clairement, pose des questions d'entraînement et aide l'élève à réfléchir. Reste sur les sciences de la vie et de la Terre. Si une information manque, demande une précision. Réponds en français."
        };
        const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
          messages: [system, ...messages.slice(-12)]
        });
        return Response.json({ reply: result.response || "Je n'ai pas réussi à générer une réponse. Réessaie." });
           } catch (error) {
        console.error("Erreur Workers AI :", error);
        return Response.json({
          error: "Erreur du tuteur IA",
          details: String(error?.message || error)
        }, { status: 500 });
      }
    }

    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      return new Response("Page introuvable", { status: 404 });
    }

    const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tuteur IA de SVT</title>
<style>
body{font-family:Arial,sans-serif;max-width:850px;margin:0 auto;padding:20px;background:#f3f7fb;color:#18212f}h1{color:#176b55}#chat{background:white;border:1px solid #d9e2ec;border-radius:14px;padding:16px;min-height:300px;max-height:55vh;overflow:auto}.msg{padding:12px 14px;border-radius:12px;margin:10px 0;white-space:pre-wrap;line-height:1.5}.bot{background:#e8f5ef}.user{background:#eaf1ff;margin-left:12%}textarea{box-sizing:border-box;width:100%;min-height:90px;padding:12px;margin-top:12px;border:1px solid #bbc8d6;border-radius:10px;font:inherit}button{cursor:pointer;border:0;border-radius:9px;padding:11px 15px;margin:5px 5px 5px 0;background:#176b55;color:white;font-weight:bold}.suggest{background:#dcefe7;color:#174b3c}#status{color:#536273;font-size:14px}
</style></head><body><h1>🌱 Mon tuteur IA de SVT</h1><p>Pose une question, demande une explication ou crée un exercice adapté à ton niveau.</p>
<div><button class="suggest" data-prompt="Explique-moi la mitose simplement avec un exemple.">Expliquer la mitose</button><button class="suggest" data-prompt="Crée un QCM de 5 questions de SVT et attends mes réponses une par une.">Faire un QCM</button><button class="suggest" data-prompt="Fais-moi réviser l'ADN avec des questions progressives.">Réviser l'ADN</button></div>
<div id="chat" aria-live="polite"><div class="msg bot">Bonjour ! Je suis ton tuteur IA de SVT. Qu'aimerais-tu apprendre aujourd'hui ?</div></div>
<textarea id="prompt" placeholder="Écris ta question ici..."></textarea><button id="send">Envoyer</button><p id="status">Conseil : précise ton niveau et le chapitre que tu révises.</p>
<script>
const chat=document.getElementById('chat'),input=document.getElementById('prompt'),send=document.getElementById('send'),status=document.getElementById('status');const history=[];
function add(text,who){const div=document.createElement('div');div.className='msg '+who;div.textContent=text;chat.appendChild(div);chat.scrollTop=chat.scrollHeight;return div;}
async function ask(){const text=input.value.trim();if(!text)return;input.value='';add(text,'user');history.push({role:'user',content:text});send.disabled=true;status.textContent='Le tuteur réfléchit…';const waiting=add('Je prépare une réponse…','bot');try{const response=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:history})});const data=await response.json();waiting.textContent = data.reply || (data.details ? data.error + " : " + data.details : data.error) || 'Une erreur est survenue.';if(data.reply)history.push({role:'assistant',content:data.reply});}catch(e){waiting.textContent='Impossible de contacter le tuteur. Vérifie ta connexion puis réessaie.';}finally{send.disabled=false;status.textContent='Tu peux poser une autre question.';input.focus();}}
send.addEventListener('click',ask);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}});document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{input.value=b.dataset.prompt;ask();}));
</script></body></html>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
