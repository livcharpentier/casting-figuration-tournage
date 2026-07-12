// api/extract-info.js
// Fonction serverless Vercel : reçoit une image (base64) et/ou du texte
// (capture d'écran, CV, mail collé) et renvoie les champs de fiche
// comédien/figurant pré-remplis, extraits par Claude (vision).
//

export const config = { maxDuration: 60 };
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
    const body = req.body || {};
    // Compatibilité : accepte soit l'ancien format (imageBase64/pdfBase64 uniques),
    // soit le nouveau format en tableaux (images[], pdfs[]).
    const images = body.images && body.images.length
      ? body.images
      : (body.imageBase64 ? [{ data: body.imageBase64, mediaType: body.imageMediaType }] : []);
    const pdfs = body.pdfs && body.pdfs.length
      ? body.pdfs
      : (body.pdfBase64 ? [{ data: body.pdfBase64 }] : []);
    const texte = body.texte;
    const nomsFichiers = body.nomsFichiers && body.nomsFichiers.length
      ? body.nomsFichiers
      : (body.nomFichier ? [body.nomFichier] : []);

    if (!images.length && !pdfs.length && !texte && !nomsFichiers.length) {
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
  "metier": "",                // métier réel de la personne dans la vie civile s'il est mentionné (ex infirmier, pompier, policier, parachutiste, militaire...), utile pour caster des rôles nécessitant un vrai savoir-faire ou une vraie expérience professionnelle
  "lien_instagram": "",        // lien vers le profil Instagram s'il est mentionné (ou un identifiant du type @pseudo à transformer en https://instagram.com/pseudo)
  "lien_showreel": "",         // lien vers une bande démo / YouTube / Vimeo (jamais Instagram ni un site perso ici)
  "lien_site_web": "",         // site personnel/portfolio (jamais Instagram, YouTube ni le site d'une agence ici)
  "agence": "",                // nom de l'agence ou de l'agent, si mentionné
  "lien_agent": "",            // lien vers le site/la page de l'agence ou de l'agent, si mentionné (distinct du site personnel du comédien)
  "iban": "",                   // IBAN si un RIB est présent dans le document/image (format FR76 ...)
  "bic": "",                    // BIC/SWIFT si présent
  "titulaire_rib": "",          // nom du titulaire du compte tel qu'indiqué sur le RIB, si différent du nom de la personne
  "experience_parcours": "",   // liste des expériences pertinentes trouvées : pièces de théâtre, tournages/films/séries, formations/écoles de comédie, avec dates si mentionnées. Une ligne par expérience (séparées par \\n). Ne pas résumer, garder les intitulés précis (titre, rôle, année, structure).
  "notes": ""                  // toute info utile qui ne rentre pas ailleurs
}`;

    const content = [];

    if (nomsFichiers.length) {
      content.push({
        type: 'text',
        text: `Les fichiers envoyés ont ces noms, qui contiennent parfois des informations utiles selon une convention du type "NOM_PRENOM_TAILLE_TYPE_TELEPHONE_EMAIL_ANNEE" (ordre/séparateurs variables) :\n${nomsFichiers.map((n) => `- "${n}"`).join("\n")}\n\nAnalyse ces noms et extrais-en tout ce qui est exploitable.`
      });
    }
    if (texte) {
      content.push({
        type: 'text',
        text: `Voici un texte (mail, capture d'écran retranscrite, ou CV collé) d'un comédien/figurant pour un tournage de film. Extrais les informations utiles pour sa fiche.\n\nTexte source :\n"""\n${texte}\n"""`
      });
    }
    images.forEach((img) => {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.data }
      });
    });
    pdfs.forEach((pdf) => {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: pdf.data }
      });
    });
    if (images.length || pdfs.length) {
      content.push({
        type: 'text',
        text: `Voici également ${images.length ? "une ou plusieurs photos" : ""}${images.length && pdfs.length ? " et " : ""}${pdfs.length ? "un ou plusieurs documents (CV)" : ""} d'un comédien/figurant pour un tournage de film. Analyse tout ce contenu (texte, noms de fichiers, images, documents) et combine les informations trouvées pour extraire la fiche la plus complète possible.\n\n${schemaDescription}`
      });
    } else {
      content.push({ type: 'text', text: schemaDescription });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
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
      // Tentative de récupération : ne garder que ce qui est entre la première "{" et la dernière "}"
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          extracted = JSON.parse(raw.slice(start, end + 1));
        } catch (e2) {
          res.status(502).json({ error: 'Réponse IA non parsable (probablement tronquée, réessaie ou réduis le nombre de fichiers analysés en une fois).', raw });
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
