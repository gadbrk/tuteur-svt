const SITE_URL =
  "https://gadbrk.github.io";

const COURSE_URL =
  "https://gadbrk.github.io/tuteur-svt/SVT_revision_IA_gratuite_en_ligne.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: corsHeaders
  });
}

const SYSTEM_PROMPT = `Tu es un excellent professeur particulier de SVT pour un élève de collège ou de lycée en France.

OBJECTIF :
Aider l'élève à comprendre réellement les sciences et à progresser.

MÉTHODE :
- Réponds toujours en français, avec un ton naturel, patient et encourageant.
- Adapte tes explications au niveau de l'élève.
- Réponds directement à sa question.
- Explique les termes scientifiques avec des mots simples.
- Utilise des exemples concrets et des étapes logiques.
- Pour un exercice, aide l'élève à raisonner étape par étape.
- Corrige les erreurs en expliquant pourquoi.
- Termine tes phrases et tes explications.
- Lorsqu'un phénomène comporte plusieurs phases, présente-les dans l'ordre chronologique et n'oublie aucune phase importante.
- Pour la mitose, présente notamment la prophase, la métaphase, l'anaphase et la télophase.
- Utilise des connaissances scientifiques fiables.
- N'invente ni faits ni sources. Si tu as un doute, indique-le.
- Explique le pourquoi et le comment, pas seulement les définitions.
- Le chapitre étudié sera indiqué dans la demande.

Ton objectif est que l'élève comprenne et puisse expliquer les notions avec ses propres mots.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Autoriser le navigateur à vérifier les droits CORS.
    if (
      request.method === "OPTIONS" &&
      (url.pathname === "/api/tutor" ||
       url.pathname === "/api/chat")
    ) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (url.pathname === "/health") {
      return new Response("OK", {
        headers: {
          "content-type": "text/plain; charset=utf-8"
        }
      });
    }

    // La route utilisée par le tuteur intégré au site de cours.
    if (
      url.pathname === "/api/tutor" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();

        const mode = body.mode === "quiz" ? "quiz" : "chat";
        const message = String(body.message || "").trim().slice(0, 1200);
        const chapter = String(body.chapter || "SVT niveau lycée").slice(0, 200);

        if (!message) {
          return jsonResponse({
            error: "Écris une question avant d'envoyer."
          }, 400);
        }

        const history = Array.isArray(body.history)
          ? body.history
              .filter(item =>
                item &&
                ["user", "assistant"].includes(item.role) &&
                typeof item.content === "string"
              )
              .slice(-8)
              .map(item => ({
                role: item.role,
                content: item.content.slice(0, 2000)
              }))
          : [];

        let userPrompt;

        if (mode === "quiz") {
          userPrompt = `Crée exactement 5 questions de QCM inédites en SVT sur le chapitre : "${chapter}".

Niveau : Première ou Terminale, selon le chapitre.

Réponds uniquement avec un objet JSON valide, sans Markdown ni texte autour, sous cette forme :
{
  "questions": [
    {
      "question": "Question",
      "options": ["Choix A", "Choix B", "Choix C", "Choix D"],
      "answer": 0,
      "explanation": "Explication de la bonne réponse"
    }
  ]
}

Règles :
- Chaque question comporte exactement 4 propositions.
- "answer" est l'indice numérique de la bonne réponse : 0, 1, 2 ou 3.
- Les explications sont scientifiquement exactes.
- Les questions portent sur le chapitre indiqué.
- Ne mets pas la bonne réponse dans la formulation de la question.
- Fournis exactement 5 questions.`;
        } else {
          userPrompt = `Chapitre étudié : ${chapter}\n\nQuestion de l'élève : ${message}`;
        }

        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {
            messages: [
              {
                role: "system",
                content: mode === "quiz"
                  ? SYSTEM_PROMPT + "\nPour cette demande, produis le QCM au format JSON demandé."
                  : SYSTEM_PROMPT
              },
              ...(mode === "chat" ? history : []),
              {
                role: "user",
                content: userPrompt
              }
            ],
            max_tokens: mode === "quiz" ? 1800 : 1200
          }
        );

        const answer = String(result.response || "").trim();

        if (!answer) {
          return jsonResponse({
            error: "L'IA n'a pas généré de réponse. Réessaie."
          }, 502);
        }

        if (mode === "chat") {
          return jsonResponse({ answer });
        }

        // Convertir la réponse du modèle en données de quiz.
        const cleaned = answer
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "")
          .trim();

        let parsed;

        try {
          parsed = JSON.parse(cleaned);
        } catch {
          console.error("Réponse QCM non JSON :", answer);
          return jsonResponse({
            error: "Le quiz n'a pas pu être formaté correctement. Réessaie."
          }, 502);
        }

        const questions = Array.isArray(parsed)
          ? parsed
          : parsed.questions;

        if (
          !Array.isArray(questions) ||
          questions.length === 0 ||
          !questions.every(q =>
            typeof q.question === "string" &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            q.options.every(o => typeof o === "string") &&
            Number.isInteger(q.answer) &&
            q.answer >= 0 &&
            q.answer <= 3
          )
        ) {
          return jsonResponse({
            error: "Le quiz généré est incomplet. Réessaie."
          }, 502);
        }

        return jsonResponse({
          questions: questions.slice(0, 5)
        });
      } catch (error) {
        console.error("Erreur Workers AI :", error);

        return jsonResponse({
          error: "Erreur du tuteur IA.",
          details: String(error?.message || error)
        }, 500);
      }
    }

    // Conserver l'ancienne route /api/chat si elle est encore utilisée.
    if (
      url.pathname === "/api/chat" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const messages = Array.isArray(body.messages)
          ? body.messages
              .filter(m =>
                m &&
                ["user", "assistant"].includes(m.role) &&
                typeof m.content === "string"
              )
              .slice(-12)
          : [];

        const result = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messages
            ],
            max_tokens: 1200
          }
        );

        return jsonResponse({
          reply: result.response || "Je n'ai pas réussi à générer une réponse."
        });
      } catch (error) {
        console.error("Erreur /api/chat :", error);

        return jsonResponse({
          error: "Erreur du tuteur IA.",
          details: String(error?.message || error)
        }, 500);
      }
    }

    // La page principale du Worker redirige vers le vrai site de cours.
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/index.html")
    ) {
      return Response.redirect(COURSE_URL, 302);
    }

    return new Response("Page introuvable", { status: 404 });
  }
};
