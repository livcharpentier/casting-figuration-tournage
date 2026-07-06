# Casting & Figuration — LEDR2

Application de gestion des comédiens/figurants, trombinoscope, dépouillement et préparation HMC.

## Mise en route

### 1. Base de données
Le script `schema.sql` doit avoir été exécuté dans le SQL Editor de Supabase (projet `ljregtoosrhetgocvrkg`) — tables `personnes`, `documents_personne`, `depouillement_jours`, `depouillement_roles`, `hmc_checklist`, bucket de stockage `casting-media`.

### 2. Déploiement Vercel
Connecter ce repo à Vercel. **Important** : pour que l'extraction automatique par IA fonctionne (bouton "Analyser et pré-remplir"), ajouter dans Vercel → Project Settings → Environment Variables :

```
ANTHROPIC_API_KEY = <ta clé API Anthropic>
```

Sans cette clé, tout le reste de l'appli fonctionne normalement — seule l'extraction auto sera indisponible.

## Onglets

- **Comédiens / Figurants** : base commune, fiche complète par personne (identité, physique, contact, compétences, contenu pro, documents CV/démo), avec extraction automatique des infos depuis une capture d'écran, un CV ou un texte collé.
- **Trombinoscope** : filtre (taille, permis, compétence, langue, type) puis génère une planche imprimable/exportable en PDF (bouton Imprimer → "Enregistrer en PDF").
- **Dépouillement** : sélection d'un jour de tournage, répartition par type (silhouette, silhouette parlante, enfant, cascadeur, petit rôle), assignation d'une personne de la base ou saisie manuelle.
- **Préparation HMC** : liste des personnes validées pour le jour, cases à cocher habillage/coiffure/maquillage avec horaires, mise à jour en temps réel entre plusieurs assistants connectés simultanément.
