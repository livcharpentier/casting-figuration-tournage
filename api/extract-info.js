// api/extract-info.js
// Fonction serverless Vercel : reçoit une image (base64) et/ou du texte
// (capture d'écran, CV, mail collé) et renvoie les champs de fiche
// comédien/figurant pré-remplis, extraits par Claude (vision).
//
// Nécessite la variable d'environnement ANTHROPIC_API_KEY sur Vercel
// (Project Settings -> Environment Variables).

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
    const { imageBase64, imageMediaType, pdfBase64, texte, nomFichier } = req.body || {};

    if (!imageBase64 && !pdfBase64 && !texte && !nomFichier) {
      res.status(400).json({ error: 'Aucune image, PDF, texte ni fichier fourni.' });
      return;
    }

    const schemaDescription = `
Renvoie UNIQUEMENT un objet JSON valide (rien avant, rien après, pas de balises markdown), avec exactement ces clés (laisse une chaîne vide "" ou null si l'info est absente, ne pas inventer) :
{
  "nom": "",
  "prenom": "",
  "date_naissance": "",       // format AAAA-MM-JJ si trouvable, sinon ""
  "age": null,                 // nombre ou null
  "taille_cm": null,           // nombre ou null
  "poids_kg": null,
  "pointure": null,
  "tour_taille": null,
  "tour_poitrine": null,
  "couleur_yeux": "",
  "couleur_cheveux": "",
  "morphologie": "",
  "telephone": "",
  "email": "",
  "adresse": "",
  "permis_conduire": false,    // true si mention d'un permis
  "types_permis": "",          // ex "B, moto"
  "langues": "",
  "competences_particulieres": "", // danse, chant, sport, instrument, cascade...
  "lien_showreel": "",         // lien youtube/vimeo si présent
  "lien_site_web": "",
  "agence": "",
  "notes": ""                  // toute info utile qui ne rentre pas ailleurs
}`;

    const content = [];
    if (nomFichier) {
      content.push({
        type: 'text',
        text: `Le nom du fichier envoyé contient souvent des informations utiles selon une convention du type "NOM_PRENOM_TAILLE_TYPE_TELEPHONE_EMAIL_ANNEE" (l'ordre et les séparateurs peuvent varier, ex underscores, tirets, points). Analyse ce nom de fichier et extrais-en tout ce qui est exploitable :\n\nNom du fichier : "${nomFichier}"\n\n${schemaDescription}`
      });
    }
    if (texte) {
      content.push({
        type: 'text',
        text: `Voici un texte (mail, capture d'écran retranscrite, ou CV collé) d'un comédien/figurant pour un tournage de film. Extrais les informations utiles pour sa fiche.\n\n${schemaDescription}\n\nTexte source :\n"""\n${texte}\n"""`
      });
    }
    if (imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType || 'image/jpeg',
          data: imageBase64
        }
      });
      content.push({
        type: 'text',
        text: texte
          ? 'Complète également avec les informations visibles sur cette image (capture d\'écran, CV, ou photo/fiche).'
          : `Voici une image (capture d'écran, CV, ou fiche) d'un comédien/figurant pour un tournage de film. Extrais les informations utiles pour sa fiche.\n\n${schemaDescription}`
      });
    }
    if (pdfBase64) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBase64
        }
      });
      content.push({
        type: 'text',
        text: (texte || imageBase64)
          ? 'Complète également avec les informations contenues dans ce CV (PDF).'
          : `Voici le CV (PDF) d'un comédien/figurant pour un tournage de film. Extrais les informations utiles pour sa fiche.\n\n${schemaDescription}`
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Erreur API Anthropic: ${errText}` });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    let raw = textBlock ? textBlock.text : '{}';
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

    let extracted;
    try {
      extracted = JSON.parse(raw);
    } catch (e) {
      res.status(502).json({ error: 'Réponse IA non parsable', raw });
      return;
    }

    res.status(200).json({ extracted });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
}
