// api/reveil.js
// Appelé automatiquement par Vercel deux fois par semaine (voir vercel.json)
// pour que le projet Supabase gratuit (applis Responsable Enfants et
// Casting & Figuration) ne se mette pas en pause faute d'activité.
export default async function handler(req, res) {
  const url = "https://ljregtoosrhetgocvrkg.supabase.co";
  const cle = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqcmVndG9vc3JoZXRnb2N2cmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjc5NDAsImV4cCI6MjA5MjkwMzk0MH0.Ij9HGLABdcC2sF4iNiEo8tDJKUrIIlaueniYo2ESOA4";
  const resultats = [];
  for (const chemin of ["/auth/v1/settings", "/rest/v1/films?select=id&limit=1"]) {
    try {
      const r = await fetch(url + chemin, { headers: { apikey: cle, authorization: "Bearer " + cle } });
      resultats.push(chemin + " " + r.status);
    } catch (e) {
      resultats.push(chemin + " erreur");
    }
  }
  res.status(200).send(resultats.join("\n"));
}
