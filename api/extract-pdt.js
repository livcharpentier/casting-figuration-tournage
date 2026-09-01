// api/extract-pdt.js
// Fonction serverless Vercel : reçoit un PDF (Plan de Travail ou Scénario) et
// renvoie une extraction structurée en JSON.
//
// Nécessite la variable d'environnement ANTHROPIC_API_KEY sur Vercel.

export const config = { maxDuration: 60 };

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
    const { pdfBase64, texte, type } = req.body || {};
    if (!pdfBase64 && !texte) {
      res.status(400).json({ error: 'Aucun fichier ni texte fourni.' });
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
    "resume": "",   // résumé très court de ce qui se passe dans la séquence (1 phrase max)
    "page_debut": null,  // numéro de PAGE du PDF (1 = première page du document) où COMMENCE cette séquence. Très important, à déterminer précisément en comptant les pages du document.
    "page_fin": null     // numéro de page du PDF où SE TERMINE cette séquence (identique à page_debut si elle tient sur une seule page)
  }
]
Si le scénario contient beaucoup de séquences, extrais-les toutes. Ne pas inventer de séquences absentes du document. Les numéros de page sont essentiels et doivent correspondre à la pagination réelle du PDF fourni.`;
    } else if (type === 'depouillement') {
      contextText = `Voici un document de dépouillement de figuration pour un tournage de film (liste des silhouettes, silhouettes parlantes, enfants, cascadeurs, petits rôles nécessaires par jour de tournage).`;
      schemaDescription = `
Renvoie UNIQUEMENT un tableau JSON valide (rien avant, rien après, pas de balises markdown), où chaque élément représente un rôle de figuration à caster avec exactement ces clés :
[
  {
    "jour_tournage": "",     // jour de tournage concerné, ex "J1", "J20" (tel qu'indiqué dans le document)
    "type_role": "",         // une seule valeur parmi : silhouette, silhouette_parlante, enfant, cascadeur, petit_role (déduis la plus proche si le document utilise un autre mot)
    "sequence": "",          // numéro(s) de séquence concernée(s)
    "nom_personnage": ""     // nom ou description du personnage/rôle (ex "Passant n°3", "Infirmière")
  }
]
Si le document contient beaucoup de lignes, extrais-les toutes. Ne pas inventer de lignes absentes du document.`;
    } else if (type === 'liste_figurants') {
      contextText = `Voici une liste de figurants déjà nommés (avec leurs coordonnées), organisée par jour de tournage.`;
      schemaDescription = `
Renvoie UNIQUEMENT un tableau JSON valide (rien avant, rien après, pas de balises markdown), où chaque élément représente un figurant convoqué un jour donné avec exactement ces clés :
[
  {
    "jour_tournage": "",  // jour de tournage concerné, ex "J1", "J20" (tel qu'indiqué dans le document)
    "nom": "",
    "prenom": "",
    "telephone": "",
    "email": "",
    "role": ""             // rôle/personnage joué ce jour-là (ex "Passant n°3", "silhouette", "silhouette parlante")
  }
]
Si le document contient beaucoup de lignes, extrais-les toutes. Ne pas inventer de lignes absentes du document.`;
    } else if (type === 'genre_personnes') {
      contextText = `Voici une liste de personnes (numéro, prénom, nom, âge éventuel) dont il faut deviner le genre.`;
      schemaDescription = `
Renvoie UNIQUEMENT un tableau JSON valide (rien avant, rien après, pas de balises markdown), où chaque élément correspond à une ligne de la liste, avec exactement ces clés :
[
  {
    "numero": "",   // le numéro exact tel qu'indiqué devant chaque ligne de la liste fournie
    "genre": ""     // une seule valeur EXACTE parmi : "Homme", "Femme", "Enfant"
                     // Règle : si un âge est indiqué et qu'il est inférieur à 18 ans, mets "Enfant".
                     // Sinon, déduis "Homme" ou "Femme" à partir du prénom (prénoms français/internationaux courants).
                     // Si le prénom est ambigu ou inconnu et qu'aucun âge n'est fourni, laisse "genre": "" (ne devine pas au hasard).
  }
]
Traite absolument toutes les lignes fournies, dans l'ordre, sans en sauter.`;
    } else if (type === 'import_photos_masse') {
      contextText = `Voici une liste de noms de fichiers photo de comédiens/figurants pour un tournage. Chaque nom de fichier suit souvent cet ordre (séparateurs "__" ou "_", variables) : NOM_PRENOM__AGE_ANS__TAILLE__VILLE__TYPE__DEMO__TELEPHONE__EMAIL__ANNEE. Il faut extraire une fiche par ligne.`;
      schemaDescription = `
Renvoie UNIQUEMENT un tableau JSON valide (rien avant, rien après, pas de balises markdown), où chaque élément correspond à une ligne fournie, avec exactement ces clés :
[
  {
    "numero": "",              // le numéro exact tel qu'indiqué devant chaque ligne
    "nom": "",
    "prenom": "",
    "type_personne": "",       // une valeur EXACTE parmi : "comedien", "figurant", "comedien_figurant" (si les deux mentionnés, ou incertain, mets "figurant" par défaut)
    "genre": "",               // "Homme", "Femme" ou "Enfant" (déduit du prénom/âge, laisse vide si incertain)
    "age": null,               // nombre ou null. Si un motif "26_ANS" apparaît, c'est l'âge AU MOMENT DE LA PHOTO : si une année de photo est aussi présente, recalcule l'âge actuel = age_a_la_photo + (annee_actuelle - annee_photo). Si un motif "NE64"/"NE_01" apparaît (année de naissance en 2 chiffres, SANS le siècle : "64"="1964", "01"="2001" selon la proximité avec l'année actuelle), calcule l'âge actuel à partir de cette année de naissance.
    "taille_cm": null,         // nombre ou null. Un motif "1_80M" ou "1_80" = 180 cm.
    "telephone": "",           // reconstitue proprement (ex "06_67_76_22_17" → "06 67 76 22 17")
    "email": "",               // reconstitue proprement (underscores → "@" et "." ; ex "jean_dupont_hotmail_fr" → "jean.dupont@hotmail.fr")
    "photo_annee": null,       // année de la photo (nombre), généralement en toute fin de nom de fichier
    "notes": ""                // toute info utile non casée ailleurs : ville/lieu mentionné, "pratique le théâtre", "a un agent", "a un site", "a une bande démo", etc. Une ligne par info si plusieurs, séparées par " ; ".
  }
]
Traite absolument toutes les lignes fournies, dans l'ordre, sans en sauter. Ne pas inventer d'information absente du nom de fichier.`;
    } else {
      res.status(400).json({ error: "Type invalide, attendu 'pdt', 'scenario', 'depouillement', 'liste_figurants', 'genre_personnes' ou 'import_photos_masse'." });
      return;
    }

    const content = [];
    if (pdfBase64) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } });
      content.push({ type: 'text', text: `${contextText}\n\n${schemaDescription}` });
    } else {
      content.push({ type: 'text', text: `${contextText}\n\nVoici le contenu du fichier (extrait d'un tableur Excel/CSV), une feuille par section :\n\n"""\n${texte}\n"""\n\n${schemaDescription}` });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [
          { role: 'user', content },
          { role: 'assistant', content: '[' }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: `Erreur API Anthropic: ${errText}` });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    let raw = textBlock ? textBlock.text : '';
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    raw = '[' + raw; // remettre le crochet retiré par le préremplissage ci-dessus

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
