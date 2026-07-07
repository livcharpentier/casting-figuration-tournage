// api/extract-pdt.js
// Fonction serverless Vercel : reçoit un PDF (Plan de Travail ou Scénario) et
// renvoie une extraction structurée en JSON.
//
// Nécessite la variable d'environnement ANTHROPIC_API_KEY sur Vercel.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY manquante sur le serveur (Vercel > Settings > Environment Variables)." });
    return;
  }

  try {
    const { pdfBase64, type } = req.body || {};
    if (!pdfBase64) {
      res.status(400).json({ error: 'Aucun fichier PDF fourni.' });
      return;
    }

    let schemaDescription, contextText;
    if (type === 'pdt') {
      contextText = `Voici un Plan De Travail (PDT) de tournage de film. Extrais la liste des jours de tournage.`;
      schemaDescription = `
Renvoie UNIQUEMENT un tableau JSON valide (rien avant, rien après, pas de balises markdown), où chaque élément représente un jour de tournage avec exactement ces clés :
[
  {
    "jour_tournage": "",   // ex "J1", "J20"... tel qu'indiqué dans le document
    "date_tournage": "",   // format AAAA-MM-JJ si trouvable, sinon ""
    "decor": "",           // lieu/décor principal du jour
    "sequences": ""        // liste des séquences prévues ce jour-là, séparées par des virgules
  }
]
Si le document contient plusieurs dizaines de jours, extrais-les tous. Ne pas inventer de jours qui ne sont pas dans le document.`;
    } else if (type === 'scenario') {
      contextText = `Voici un scénario de film. Extrais la liste des séquences.`;
      schemaDescription = `
Renvoie UNIQUEMENT un tableau JSON valide (rien avant, rien après, pas de balises markdown), où chaque élément représente une séquence avec exactement ces clés :
[
  {
    "numero": "",   // numéro de séquence tel qu'indiqué (ex "12", "SEQ 12")
    "decor": "",    // lieu/décor de la séquence (ex "INT. CUISINE - JOUR")
    "resume": ""    // résumé très court de ce qui se passe dans la séquence (1 phrase max)
  }
]
Si le scénario contient beaucoup de séquences, extrais-les toutes. Ne pas inventer de séquences absentes du document.`;
    } else {
      res.status(400).json({ error: "Type invalide, attendu 'pdt' ou 'scenario'." });
      return;
    }

    const content = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: `${contextText}\n\n${schemaDescription}` },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Erreur API Anthropic: ${errText}` });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    let raw = textBlock ? textBlock.text : '[]';
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(raw);
    } catch (e) {
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          extracted = JSON.parse(raw.slice(start, end + 1));
        } catch (e2) {
          res.status(502).json({ error: 'Réponse IA non parsable (probablement tronquée pour un très gros document).', raw });
          return;
        }
      } else {
        res.status(502).json({ error: 'Réponse IA non parsable', raw });
        return;
      }
    }

    res.status(200).json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
