// ==========================================================
// CONFIG
// ==========================================================
const SUPABASE_URL = "https://ljregtoosrhetgocvrkg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqcmVndG9vc3JoZXRnb2N2cmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMjc5NDAsImV4cCI6MjA5MjkwMzk0MH0.Ij9HGLABdcC2sF4iNiEo8tDJKUrIIlaueniYo2ESOA4";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = "casting-media";

const ROLE_TYPES = [
  { value: "silhouette", label: "Silhouette" },
  { value: "silhouette_parlante", label: "Silhouette parlante" },
  { value: "enfant", label: "Enfant" },
  { value: "cascadeur", label: "Cascadeur" },
  { value: "petit_role", label: "Petit rôle" },
];

let state = {
  personnes: [],
  currentEditingPersonneId: null,
  pendingPhotoFile: null,
  pendingDocsAfterSave: [],
  jours: [],
  currentDepouillementJourId: null,
  currentHmcJourId: null,
  hmcRealtimeChannel: null,
  lastTrombiSummary: [],
  films: [],
  currentFilmId: localStorage.getItem("castingFiguration_currentFilmId") || null,
  filmDocumentsCache: [],
  currentPresenceJourId: null,
  currentEmargementJourId: null,
  currentContratJourId: null,
  contratRolesJour: [],
  contratsPretsAImprimer: [],
  currentPrepayeJourId: null,
  currentRecapAdminJourId: null,
};

// ==========================================================
// UTILS
// ==========================================================
function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function openModal(html) {
  const overlay = document.getElementById("modal-overlay");
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.classList.add("active");
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
}
function closeModal() {
  document.getElementById("modal-overlay").classList.remove("active");
  document.getElementById("modal-overlay").innerHTML = "";
  state.pendingPhotoFile = null;
}
async function uploadToStorage(file, prefix) {
  const ext = file.name.split(".").pop();
  const path = `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Détecte le vrai format d'une image à partir de ses premiers octets (signature),
// car un fichier mal nommé (ex: .jpg qui est en réalité un PNG) trompe file.type.
async function detecterTypeImageReel(file) {
  try {
    const buffer = await file.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex.startsWith("89504e47")) return "image/png";
    if (hex.startsWith("ffd8ff")) return "image/jpeg";
    if (hex.startsWith("47494638")) return "image/gif";
    if (hex.startsWith("52494646")) return "image/webp";
    return file.type || "image/jpeg";
  } catch (e) {
    return file.type || "image/jpeg";
  }
}

// ==========================================================
// TAB NAVIGATION
// ==========================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "depouillement") initFilmSelectors().then(() => { loadJoursDropdown("depouillement-jour-select", onDepouillementJourChange); loadFilmDocuments(state.currentFilmId); });
  });
});

document.querySelectorAll(".subtab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".subtab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("subtab-" + btn.dataset.subtab).classList.add("active");
  });
});

// ==========================================================
// ONGLET PERSONNES
// ==========================================================
async function loadPersonnes() {
  const { data, error } = await sb.from("personnes").select("*").order("nom", { ascending: true });
  if (error) { console.error(error); return; }
  state.personnes = data || [];
  renderPersonnesGrid();
}

function renderPersonnesGrid() {
  const search = document.getElementById("search-personnes").value.trim().toLowerCase();
  const typeFilter = document.getElementById("filter-type-personne").value;
  const genreFilter = document.getElementById("filter-genre-personne").value;
  const grid = document.getElementById("personnes-grid");
  let list = state.personnes;
  if (search) list = list.filter((p) => `${p.nom} ${p.prenom}`.toLowerCase().includes(search));
  if (typeFilter) list = list.filter((p) => p.type_personne === typeFilter);
  if (genreFilter) list = list.filter((p) => p.genre === genreFilter);

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Aucune personne trouvée.</div>`;
    return;
  }
  grid.innerHTML = list.map((p) => `
    <div class="person-card" onclick="openFicheModal('${p.id}')" style="position:relative;">
      <button class="btn-icon" title="Modifier" onclick="event.stopPropagation(); openPersonneModal('${p.id}')" style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,.55); border-radius:6px; z-index:2; font-size:11px; padding:4px 8px;">Modifier</button>
      <button class="btn-icon" title="Supprimer" onclick="event.stopPropagation(); quickDeletePersonne('${p.id}')" style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,.55); border-radius:6px; z-index:2; font-size:11px; padding:4px 8px;">Supprimer</button>
      <div class="photo" style="${p.photo_url ? `background-image:url('${esc(p.photo_url)}')` : ""}">${p.photo_url ? "" : ""}</div>
      <div class="info">
        <div class="name">${esc(p.prenom)} ${esc(p.nom)}</div>
        <div class="meta">${p.taille_cm ? p.taille_cm + " cm" : ""} ${p.age ? "· " + p.age + " ans" : ""}</div>
        <span class="badge ${p.type_personne}">${p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien+Fig."}</span>
        <div style="margin-top:4px;">${photoDateBadgeHtml(p.photo_annee)}</div>
      </div>
    </div>
  `).join("");
}

function photoDateBadgeHtml(year) {
  if (!year) return `<span class="badge" style="background:var(--surface-2); color:var(--text-muted);">Année inconnue</span>`;
  const currentYear = new Date().getFullYear();
  const age = currentYear - Number(year);
  let color, bg, label;
  if (age <= 1) { color = "var(--green)"; bg = "rgba(111,174,122,.18)"; label = "Photo récente"; }
  else if (age <= 3) { color = "#E0A030"; bg = "rgba(224,160,48,.18)"; label = "À vérifier"; }
  else { color = "var(--red)"; bg = "rgba(217,105,95,.2)"; label = "Attention : À renouveler"; }
  return `<span class="badge" style="background:${bg}; color:${color};">${year} — ${label}</span>`;
}

const CAT_PHOTO_LABELS = { portrait: "Portrait", pied: "En pied", vehicule: "Véhicule", tenue_chic: "Tenue chic", animal: "Animal", autre: "Autre" };
const TYPE_DOC_LABELS = { cv: "CV", demo_video: "Démo vidéo", demo_lien: "Démo (lien)", photo: "Photo", autre: "Autre" };

async function openFicheModal(id) {
  const p = state.personnes.find((x) => x.id === id);
  if (!p) return;
  const { data: docs } = await sb.from("documents_personne").select("*").eq("personne_id", id).order("created_at", { ascending: false });
  const documents = docs || [];
  const photos = documents.filter((d) => d.type_document === "photo" && d.fichier_url);
  if (p.photo_url && !photos.some((d) => d.fichier_url === p.photo_url)) {
    photos.unshift({ id: "principale", fichier_url: p.photo_url, categorie_photo: "portrait" });
  }
  const autresDocs = documents.filter((d) => d.type_document !== "photo");

  const infoLine = (label, val) => val ? `<div style="margin-bottom:6px;"><span style="color:var(--text-muted); font-size:11px; text-transform:uppercase; letter-spacing:.3px;">${label}</span><br>${esc(val)}</div>` : "";
  const linkLine = (label, url) => url ? `<div style="margin-bottom:6px;"><span style="color:var(--text-muted); font-size:11px; text-transform:uppercase; letter-spacing:.3px;">${label}</span><br><a href="${esc(url)}" target="_blank" style="color:var(--accent);">${esc(url)}</a></div>` : "";

  const currentPhotoDoc = documents.find((d) => d.type_document === "photo" && d.fichier_url === p.photo_url);
  const photoYear = (currentPhotoDoc && currentPhotoDoc.annee_photo) || p.photo_annee || null;
  const photoDateBadge = photoDateBadgeHtml(photoYear);

  openModal(`
    <span class="close-x" onclick="closeModal()">×</span>
    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px;">
      <div class="photo" style="width:140px; height:180px; border-radius:10px; flex-shrink:0; background-size:contain; background-repeat:no-repeat; background-position:center; background-color:var(--surface-2); ${p.photo_url ? `background-image:url('${esc(p.photo_url)}')` : ""}">${p.photo_url ? "" : ""}</div>
      <div style="flex:1; min-width:200px;">
        <h2 style="margin:0 0 6px;">${esc(p.prenom)} ${esc(p.nom)}</h2>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
          <span class="badge ${p.type_personne}">${p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien+Fig."}</span>
          ${photoDateBadge}
        </div>
        <div style="margin-top:10px; font-size:13px; color:var(--text);">
          ${p.taille_cm ? "Taille : " + p.taille_cm + " cm &nbsp;·&nbsp; " : ""}${p.age ? "Âge : " + p.age + " ans" : ""}
          ${p.metier ? `<br>Métier : ${esc(p.metier)}` : ""}
          ${p.telephone ? `<br>Tél : ${esc(p.telephone)}` : ""}
          ${p.email ? `<br>Email : ${esc(p.email)}` : ""}
          ${p.adresse ? `<br>Adresse : ${esc(p.adresse)}` : ""}
        </div>
      </div>
    </div>

    ${photos.length ? `
    <fieldset>
      <legend>Photos (${photos.length}) — clique "Utiliser pour le trombi" pour changer la photo affichée dans le Trombinoscope</legend>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${photos.map((d) => {
          const isCurrent = p.photo_url === d.fichier_url;
          const year = d.annee_photo || (d.id === "principale" ? p.photo_annee : null);
          let yearColor = "var(--text-muted)";
          if (year) {
            const age = new Date().getFullYear() - Number(year);
            yearColor = age <= 1 ? "var(--green)" : age <= 3 ? "#E0A030" : "var(--red)";
          }
          return `
          <div style="width:100px;">
            <a href="${esc(d.fichier_url)}" target="_blank" style="text-decoration:none; color:inherit;">
              <div style="width:100px; height:120px; border-radius:8px; background:var(--surface-2); background-image:url('${esc(d.fichier_url)}'); background-size:contain; background-repeat:no-repeat; background-position:center; ${isCurrent ? "outline:2px solid var(--accent);" : ""}"></div>
            </a>
            <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:4px;">${CAT_PHOTO_LABELS[d.categorie_photo] || "Autre"}</div>
            <div style="font-size:11px; font-weight:700; color:${yearColor}; text-align:center;">${year ? "" + year : "Année ?"}</div>
            ${isCurrent
              ? `<div style="font-size:10px; color:var(--accent); text-align:center; margin-top:2px;">Photo trombi actuelle</div>`
              : `<button type="button" class="btn-icon" style="font-size:10px; width:100%; text-align:center; margin-top:2px;" onclick="setPhotoTrombi('${p.id}', '${esc(d.fichier_url).replace(/'/g, "\\'")}')">Utiliser pour le trombi</button>`}
          </div>
        `;
        }).join("")}
      </div>
    </fieldset>` : ""}

    <fieldset>
      <legend>Physique &amp; compétences</legend>
      <div style="columns:2; column-gap:20px;">
        ${infoLine("Poids", p.poids_kg ? p.poids_kg + " kg" : "")}
        ${infoLine("Pointure", p.pointure)}
        ${infoLine("Tour de taille", p.tour_taille)}
        ${infoLine("Tour de poitrine", p.tour_poitrine)}
        ${infoLine("Yeux", p.couleur_yeux)}
        ${infoLine("Cheveux", p.couleur_cheveux)}
        ${infoLine("Morphologie", p.morphologie)}
        ${infoLine("Permis", p.permis_conduire ? (p.types_permis || "Oui") : "")}
        ${infoLine("Langues", p.langues)}
        ${infoLine("Compétences", p.competences_particulieres)}
      </div>
    </fieldset>

    ${p.experience_parcours ? `
    <fieldset>
      <legend>Expérience &amp; parcours</legend>
      <div style="white-space:pre-line; font-size:13px;">${esc(p.experience_parcours)}</div>
    </fieldset>` : ""}

    <fieldset>
      <legend>Contenu professionnel</legend>
      ${linkLine("Instagram", p.lien_instagram)}
      ${linkLine("YouTube / démo", p.lien_showreel)}
      ${linkLine("Site personnel", p.lien_site_web)}
      ${infoLine("Agence", p.agence)}
      ${linkLine("Lien agent/agence", p.lien_agent)}
      ${(!p.lien_instagram && !p.lien_showreel && !p.lien_site_web && !p.agence && !p.lien_agent) ? `<div style="color:var(--text-muted); font-size:13px;">Aucun lien renseigné.</div>` : ""}
    </fieldset>

    <fieldset>
      <legend>Documents (${autresDocs.length})</legend>
      ${autresDocs.length ? `
        <div class="doc-list">
          ${autresDocs.map((d) => `
            <div class="doc-item">
              <span class="type-tag">${TYPE_DOC_LABELS[d.type_document] || d.type_document}</span>
              <a href="${esc(d.fichier_url || d.lien_externe)}" target="_blank">${esc(d.libelle || d.fichier_url || d.lien_externe)}</a>
            </div>
          `).join("")}
        </div>` : `<div style="color:var(--text-muted); font-size:13px;">Aucun document (CV, démo...) ajouté.</div>`}
    </fieldset>

    ${p.notes ? `
    <fieldset>
      <legend>Notes</legend>
      <div style="font-size:13px; white-space:pre-line;">${esc(p.notes)}</div>
    </fieldset>` : ""}

    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-wrap:wrap;">
      <button class="btn secondary" id="btn-fiche-print">Imprimer</button>
      <button class="btn secondary" id="btn-fiche-email">Email</button>
      <button class="btn secondary" id="btn-fiche-whatsapp">WhatsApp</button>
      <button class="btn secondary" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal(); openPersonneModal('${p.id}')">Modifier</button>
    </div>
  `);

  document.getElementById("btn-fiche-print").addEventListener("click", () => printFiche(p, documents));
  document.getElementById("btn-fiche-email").addEventListener("click", () => shareFicheByEmail(p, documents));
  document.getElementById("btn-fiche-whatsapp").addEventListener("click", () => shareFicheByWhatsapp(p, documents));
}

function buildFicheSummaryText(p, documents) {
  const lines = [];
  lines.push(`${p.prenom} ${p.nom}`);
  lines.push(p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien + figurant");
  if (p.taille_cm) lines.push(`Taille : ${p.taille_cm} cm`);
  if (p.age) lines.push(`Âge : ${p.age} ans`);
  if (p.metier) lines.push(`Métier : ${p.metier}`);
  if (p.telephone) lines.push(`Tél : ${p.telephone}`);
  if (p.email) lines.push(`Email : ${p.email}`);
  if (p.permis_conduire) lines.push(`Permis : ${p.types_permis || "oui"}`);
  if (p.competences_particulieres) lines.push(`Compétences : ${p.competences_particulieres}`);
  if (p.experience_parcours) lines.push(`\nExpérience :\n${p.experience_parcours}`);
  if (p.lien_instagram) lines.push(`Instagram : ${p.lien_instagram}`);
  if (p.lien_showreel) lines.push(`YouTube/démo : ${p.lien_showreel}`);
  if (p.lien_site_web) lines.push(`Site : ${p.lien_site_web}`);
  if (p.agence) lines.push(`Agence : ${p.agence}${p.lien_agent ? " - " + p.lien_agent : ""}`);
  if (p.photo_url) lines.push(`\nPhoto : ${p.photo_url}`);
  const cv = documents.find((d) => d.type_document === "cv");
  if (cv && cv.fichier_url) lines.push(`CV : ${cv.fichier_url}`);
  const demo = documents.find((d) => d.type_document === "demo_video" || d.type_document === "demo_lien");
  if (demo) lines.push(`Démo : ${demo.fichier_url || demo.lien_externe}`);
  return lines.join("\n");
}

function shareFicheByEmail(p, documents) {
  const subject = `Fiche - ${p.prenom} ${p.nom}`;
  const body = buildFicheSummaryText(p, documents);
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function shareFicheByWhatsapp(p, documents) {
  const text = buildFicheSummaryText(p, documents);
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
}

function printFiche(p, documents) {
  const photos = documents.filter((d) => d.type_document === "photo" && d.fichier_url);
  const autresDocs = documents.filter((d) => d.type_document !== "photo");
  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>Fiche - ${esc(p.prenom)} ${esc(p.nom)}</title>
    <style>
      body{ font-family: Arial, sans-serif; padding:24px; color:#111; }
      h1{ margin:0 0 4px; font-size:22px; }
      .badge{ display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; background:#eee; padding:3px 8px; border-radius:12px; }
      .row{ display:flex; gap:20px; margin-bottom:20px; }
      .photo-main{ width:150px; height:190px; object-fit:contain; border-radius:8px; border:1px solid #ccc; background:#f4f4f4; }
      .section{ margin-top:16px; }
      .section h3{ font-size:12px; text-transform:uppercase; color:#666; border-bottom:1px solid #ccc; padding-bottom:4px; }
      .photos-grid{ display:flex; gap:10px; flex-wrap:wrap; }
      .photos-grid img{ width:90px; height:110px; object-fit:cover; border-radius:6px; border:1px solid #ccc; }
      .doc-line{ font-size:13px; margin-bottom:4px; }
      a{ color:#111; }
    </style>
    </head><body>
      <div class="row">
        ${p.photo_url ? `<img class="photo-main" src="${esc(p.photo_url)}">` : ""}
        <div>
          <h1>${esc(p.prenom)} ${esc(p.nom)}</h1>
          <span class="badge">${p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien + figurant"}</span>
          <p>
            ${p.taille_cm ? "Taille : " + p.taille_cm + " cm<br>" : ""}
            ${p.age ? "Âge : " + p.age + " ans<br>" : ""}
            ${p.metier ? "Métier : " + esc(p.metier) + "<br>" : ""}
            ${p.telephone ? "Tél : " + esc(p.telephone) + "<br>" : ""}
            ${p.email ? "Email : " + esc(p.email) + "<br>" : ""}
          </p>
        </div>
      </div>

      ${photos.length ? `<div class="section"><h3>Photos</h3><div class="photos-grid">${photos.map((d) => `<img src="${esc(d.fichier_url)}">`).join("")}</div></div>` : ""}

      <div class="section"><h3>Physique &amp; compétences</h3>
        <p>
          ${p.poids_kg ? "Poids : " + p.poids_kg + " kg<br>" : ""}
          ${p.pointure ? "Pointure : " + p.pointure + "<br>" : ""}
          ${p.couleur_yeux ? "Yeux : " + esc(p.couleur_yeux) + "<br>" : ""}
          ${p.couleur_cheveux ? "Cheveux : " + esc(p.couleur_cheveux) + "<br>" : ""}
          ${p.permis_conduire ? "Permis : " + esc(p.types_permis || "oui") + "<br>" : ""}
          ${p.langues ? "Langues : " + esc(p.langues) + "<br>" : ""}
          ${p.competences_particulieres ? "Compétences : " + esc(p.competences_particulieres) + "<br>" : ""}
        </p>
      </div>

      ${p.experience_parcours ? `<div class="section"><h3>Expérience &amp; parcours</h3><p style="white-space:pre-line;">${esc(p.experience_parcours)}</p></div>` : ""}

      <div class="section"><h3>Contenu professionnel</h3>
        <p>
          ${p.lien_instagram ? "Instagram : " + esc(p.lien_instagram) + "<br>" : ""}
          ${p.lien_showreel ? "YouTube/démo : " + esc(p.lien_showreel) + "<br>" : ""}
          ${p.lien_site_web ? "Site : " + esc(p.lien_site_web) + "<br>" : ""}
          ${p.agence ? "Agence : " + esc(p.agence) + "<br>" : ""}
        </p>
      </div>

      ${autresDocs.length ? `<div class="section"><h3>Documents</h3>${autresDocs.map((d) => `<div class="doc-line">${TYPE_DOC_LABELS[d.type_document] || d.type_document} : ${esc(d.libelle || d.fichier_url || d.lien_externe)}</div>`).join("")}</div>` : ""}

      ${p.notes ? `<div class="section"><h3>Notes</h3><p style="white-space:pre-line;">${esc(p.notes)}</p></div>` : ""}
    </body></html>
  `);
  win.document.close();
  win.focus();
  // Attendre que toutes les images soient bien chargées avant d'ouvrir l'impression
  let alreadyPrinted = false;
  const doPrint = () => { if (!alreadyPrinted) { alreadyPrinted = true; win.print(); } };
  const waitImagesAndPrint = () => {
    const imgs = Array.from(win.document.images || []);
    if (!imgs.length) { doPrint(); return; }
    let remaining = imgs.length;
    const done = () => { remaining -= 1; if (remaining <= 0) doPrint(); };
    imgs.forEach((img) => {
      if (img.complete) done();
      else { img.addEventListener("load", done); img.addEventListener("error", done); }
    });
    // Filet de sécurité si une image ne se charge jamais
    setTimeout(doPrint, 4000);
  };
  setTimeout(waitImagesAndPrint, 150);
}

async function setPhotoTrombi(personneId, url) {
  const p = state.personnes.find((x) => x.id === personneId);
  const oldUrl = p ? p.photo_url : null;

  // Si l'ancienne photo principale n'est pas déjà sauvegardée comme document, on la conserve avant de la remplacer
  if (oldUrl && oldUrl !== url) {
    const { data: existingDocs } = await sb.from("documents_personne").select("id, fichier_url").eq("personne_id", personneId).eq("type_document", "photo");
    const alreadySaved = (existingDocs || []).some((d) => d.fichier_url === oldUrl);
    if (!alreadySaved) {
      await sb.from("documents_personne").insert({
        personne_id: personneId,
        type_document: "photo",
        categorie_photo: "autre",
        libelle: "Ancienne photo trombi",
        fichier_url: oldUrl,
      });
    }
  }

  const { error } = await sb.from("personnes").update({ photo_url: url, updated_at: new Date().toISOString() }).eq("id", personneId);
  if (error) { alert("Erreur : " + error.message); return; }
  await loadPersonnes();
  await openFicheModal(personneId);
}

async function quickDeletePersonne(id) {
  const p = state.personnes.find((x) => x.id === id);
  const nomComplet = p ? `${p.prenom} ${p.nom}` : "cette personne";
  if (!confirm(`Supprimer définitivement ${nomComplet} (et ses documents/photos) ?`)) return;
  const { error } = await sb.from("personnes").delete().eq("id", id);
  if (error) { alert("Erreur : " + error.message); return; }
  await loadPersonnes();
}
document.getElementById("search-personnes").addEventListener("input", renderPersonnesGrid);
document.getElementById("filter-type-personne").addEventListener("change", renderPersonnesGrid);
document.getElementById("filter-genre-personne").addEventListener("change", renderPersonnesGrid);
document.getElementById("btn-new-personne").addEventListener("click", () => openPersonneModal(null));

function personneFormFields(p = {}) {
  return `
  <div class="ai-extract-zone" id="ai-extract-zone">
    <p><strong>Extraction automatique</strong> — dépose les photos et le CV séparément (chacun analysé indépendamment, plus rapide et plus fiable), ou colle le texte du mail.</p>
    <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:8px;">
      <div id="ai-photo-dropzone" style="flex:1; min-width:220px; border:1px dashed var(--border); border-radius:8px; padding:8px;">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Photo(s)</div>
        <input type="file" id="ai-photo-input" accept="image/*" multiple>
        <div id="ai-photo-list" style="font-size:12px; color:var(--text-muted); margin-top:4px;"></div>
        <button type="button" class="btn secondary" id="btn-analyser-photo" style="margin-top:6px;">Analyser la/les photo(s)</button>
      </div>
      <div id="ai-cv-dropzone" style="flex:1; min-width:220px; border:1px dashed var(--border); border-radius:8px; padding:8px;">
        <div style="font-size:11px; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">CV</div>
        <input type="file" id="ai-cv-input" accept="application/pdf" multiple>
        <div id="ai-cv-list" style="font-size:12px; color:var(--text-muted); margin-top:4px;"></div>
        <button type="button" class="btn secondary" id="btn-analyser-cv" style="margin-top:6px;">Analyser le CV</button>
      </div>
    </div>
    <div id="cv-preview-container" style="display:none; margin-top:10px;">
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">Aperçu du CV — clique-glisse sur la photo pour la sélectionner, puis clique "Utiliser cette zone comme photo" :</div>
      <div id="cv-preview-wrapper" style="position:relative; display:inline-block; border:1px solid var(--border); border-radius:8px; overflow:hidden; cursor:crosshair; max-width:100%;">
        <canvas id="cv-preview-canvas" style="display:block; max-width:100%;"></canvas>
        <div id="cv-crop-box" style="position:absolute; border:2px dashed var(--accent); background:rgba(232,185,74,.15); display:none; pointer-events:none;"></div>
      </div>
      <div style="margin-top:8px;">
        <button type="button" class="btn secondary" id="btn-use-crop">Utiliser cette zone comme photo</button>
        <span id="cv-crop-status" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>
      </div>
    </div>
    <textarea id="ai-text-input" placeholder="Ou colle ici le texte du mail à analyser (pris en compte avec chaque analyse)..." style="margin-top:10px;"></textarea>
    <div id="ai-extract-status" style="font-size:12px; color:var(--text-muted); margin-top:8px;"></div>
    <div id="ai-extract-results" style="display:none; margin-top:10px; background:var(--surface); border:1px solid var(--accent); border-radius:8px; padding:10px 12px; font-size:13px;"></div>
  </div>

  <fieldset>
    <legend>Identité</legend>
    <div class="field-row">
      <div class="field"><label>Prénom *</label><input type="text" id="f-prenom" value="${esc(p.prenom)}"></div>
      <div class="field"><label>Nom *</label><input type="text" id="f-nom" value="${esc(p.nom)}"></div>
      <div class="field"><label>Type</label>
        <select id="f-type">
          <option value="figurant" ${p.type_personne === "figurant" ? "selected" : ""}>Figurant</option>
          <option value="comedien" ${p.type_personne === "comedien" ? "selected" : ""}>Comédien (ne fait pas de figuration)</option>
          <option value="comedien_figurant" ${p.type_personne === "comedien_figurant" ? "selected" : ""}>Comédien + figurant</option>
        </select>
      </div>
      <div class="field"><label>Genre</label>
        <select id="f-genre">
          <option value="" ${!p.genre ? "selected" : ""}>—</option>
          <option value="Homme" ${p.genre === "Homme" ? "selected" : ""}>Homme</option>
          <option value="Femme" ${p.genre === "Femme" ? "selected" : ""}>Femme</option>
          <option value="Enfant" ${p.genre === "Enfant" ? "selected" : ""}>Enfant</option>
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Date de naissance</label><input type="date" id="f-date-naissance" value="${p.date_naissance || ""}"></div>
      <div class="field"><label>Âge</label><input type="number" id="f-age" value="${p.age ?? ""}"></div>
      <div class="field"><label>Photo (fichier)</label><input type="file" id="f-photo" accept="image/*"></div>
      <div class="field"><label>Année de la photo principale (ci-dessus)</label><input type="number" id="f-photo-annee" value="${p.photo_annee ?? ""}"></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Physique</legend>
    <div class="field-row">
      <div class="field"><label>Taille (cm)</label><input type="number" id="f-taille" value="${p.taille_cm ?? ""}"></div>
      <div class="field"><label>Poids (kg)</label><input type="number" id="f-poids" value="${p.poids_kg ?? ""}"></div>
      <div class="field"><label>Pointure</label><input type="number" id="f-pointure" value="${p.pointure ?? ""}"></div>
      <div class="field"><label>Tour de taille</label><input type="number" id="f-tour-taille" value="${p.tour_taille ?? ""}"></div>
      <div class="field"><label>Tour de poitrine</label><input type="number" id="f-tour-poitrine" value="${p.tour_poitrine ?? ""}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Couleur des yeux</label><input type="text" id="f-yeux" value="${esc(p.couleur_yeux)}"></div>
      <div class="field"><label>Couleur des cheveux</label><input type="text" id="f-cheveux" value="${esc(p.couleur_cheveux)}"></div>
      <div class="field"><label>Morphologie</label><input type="text" id="f-morphologie" value="${esc(p.morphologie)}"></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Contact</legend>
    <div class="field-row">
      <div class="field"><label>Téléphone</label><input type="text" id="f-tel" value="${esc(p.telephone)}"></div>
      <div class="field"><label>Email</label><input type="email" id="f-email" value="${esc(p.email)}"></div>
      <div class="field"><label>Adresse</label><input type="text" id="f-adresse" value="${esc(p.adresse)}"></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Compétences &amp; autorisations</legend>
    <div class="field-row">
      <div class="field checkbox"><input type="checkbox" id="f-permis" ${p.permis_conduire ? "checked" : ""}><label for="f-permis">Permis de conduire</label></div>
      <div class="field"><label>Type(s) de permis</label><input type="text" id="f-types-permis" value="${esc(p.types_permis)}" placeholder="B, moto..."></div>
      <div class="field"><label>Langues</label><input type="text" id="f-langues" value="${esc(p.langues)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Métier réel (si utile pour un rôle : infirmier, pompier, policier, parachutiste...)</label><input type="text" id="f-metier" value="${esc(p.metier)}" placeholder="ex infirmier, pompier, policier, parachutiste..."></div>
      <div class="field"><label>Compétences particulières</label><input type="text" id="f-competences" value="${esc(p.competences_particulieres)}" placeholder="danse, chant, sport, cascade..."></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Contenu professionnel</legend>
    <div class="field-row">
      <div class="field"><label>Instagram</label><input type="text" id="f-instagram" value="${esc(p.lien_instagram)}" placeholder="https://instagram.com/..."></div>
      <div class="field"><label>YouTube / bande démo</label><input type="text" id="f-showreel" value="${esc(p.lien_showreel)}" placeholder="https://youtube.com/..."></div>
      <div class="field"><label>Site personnel</label><input type="text" id="f-site" value="${esc(p.lien_site_web)}" placeholder="https://..."></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Nom de l'agence</label><input type="text" id="f-agence" value="${esc(p.agence)}"></div>
      <div class="field"><label>Lien agent / agence</label><input type="text" id="f-lien-agent" value="${esc(p.lien_agent)}" placeholder="https://..."></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Expérience &amp; parcours (théâtre, tournages, formations)</legend>
    <textarea id="f-experience" placeholder="ex : Comédie-Française (2019-2021), tournage 'Les Enfants de la Résistance' (2023), cours Cours Florent..." style="width:100%; min-height:70px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px;">${esc(p.experience_parcours)}</textarea>
  </fieldset>

  <fieldset>
    <legend>Infos administratives (pour les contrats)</legend>
    <div class="field-row">
      <div class="field"><label>Lieu de naissance</label><input type="text" id="f-lieu-naissance" value="${esc(p.lieu_naissance)}" placeholder="Ville et pays"></div>
      <div class="field"><label>Nationalité</label><input type="text" id="f-nationalite" value="${esc(p.nationalite)}"></div>
      <div class="field"><label>N° Sécurité Sociale</label><input type="text" id="f-num-secu" value="${esc(p.num_secu_sociale)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Situation familiale</label><input type="text" id="f-situation-familiale" value="${esc(p.situation_familiale)}" placeholder="CÉLIBATAIRE, MARIÉ(E)..."></div>
      <div class="field"><label>Nb enfants à charge</label><input type="text" id="f-nb-enfants" value="${esc(p.nb_enfants_charge)}"></div>
      <div class="field"><label>Nom de jeune fille</label><input type="text" id="f-nom-jeune-fille" value="${esc(p.nom_jeune_fille)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Centre de Sécurité Sociale</label><input type="text" id="f-centre-secu" value="${esc(p.centre_secu_sociale)}"></div>
      <div class="field"><label>Personne à prévenir (nom + tél)</label><input type="text" id="f-personne-prevenir" value="${esc(p.personne_a_prevenir)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>IBAN</label><input type="text" id="f-iban" value="${esc(p.iban)}" placeholder="FR76 ..."></div>
      <div class="field"><label>BIC</label><input type="text" id="f-bic" value="${esc(p.bic)}"></div>
      <div class="field"><label>Titulaire du compte (si différent)</label><input type="text" id="f-titulaire-rib" value="${esc(p.titulaire_rib)}"></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Notes</legend>
    <textarea id="f-notes" style="width:100%; min-height:50px; background:var(--surface-2); border:1px solid var(--border); color:var(--text); border-radius:8px; padding:8px;">${esc(p.notes)}</textarea>
  </fieldset>
  `;
}

async function openPersonneModal(id) {
  state.currentEditingPersonneId = id;
  state.pendingDocsAfterSave = [];
  let p = {};
  if (id) p = state.personnes.find((x) => x.id === id) || {};

  openModal(`
    <span class="close-x" onclick="closeModal()">×</span>
    <h2>${id ? "Modifier" : "Ajouter"} une personne</h2>
    ${personneFormFields(p)}
    <fieldset id="documents-fieldset" style="${id ? "" : "display:none;"}">
      <legend>Documents (CV, démo, autres)</legend>
      <div id="doc-list-container" class="doc-list"></div>
      <div class="field-row" style="margin-top:10px;">
        <div class="field">
          <label>Type</label>
          <select id="doc-type">
            <option value="photo">Photo</option>
            <option value="cv">CV</option>
            <option value="demo_video">Démo (fichier vidéo)</option>
            <option value="demo_lien">Démo (lien YouTube/Vimeo)</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="field" id="doc-categorie-wrapper">
          <label>Catégorie de la photo</label>
          <select id="doc-categorie">
            <option value="portrait">Portrait</option>
            <option value="pied">En pied</option>
            <option value="vehicule">Véhicule</option>
            <option value="tenue_chic">Tenue chic</option>
            <option value="animal">Animal</option>
            <option value="autre">Autre</option>
          </select>
        </div>
        <div class="field"><label>Libellé</label><input type="text" id="doc-libelle" placeholder="ex Peugeot 208 grise, Book 2025..."></div>
        <div class="field" id="doc-annee-wrapper"><label>Année de cette photo (à ajouter ci-dessous)</label><input type="number" id="doc-annee" placeholder="ex 2023"></div>
      </div>
      <div class="field-row">
        <div class="field" id="doc-file-dropzone" style="border:1px dashed var(--border); border-radius:8px; padding:6px 8px;">
          <label>Fichier (glisser-déposer ou cliquer)</label>
          <input type="file" id="doc-file">
        </div>
        <div class="field"><label>OU lien externe</label><input type="text" id="doc-lien" placeholder="https://..."></div>
      </div>
      <button type="button" class="btn secondary" id="btn-add-doc">+ Ajouter ce document</button>
    </fieldset>
    <div style="display:flex; gap:10px; justify-content:space-between; margin-top:16px;">
      <div>${id ? `<button type="button" class="btn danger" id="btn-delete-personne">Supprimer</button>` : ""}</div>
      <div style="display:flex; gap:10px;">
        <button type="button" class="btn secondary" id="btn-cancel-close" onclick="closeModal()">Annuler</button>
        <button type="button" class="btn" id="btn-save-personne">Enregistrer</button>
      </div>
    </div>
  `);

  document.getElementById("btn-save-personne").addEventListener("click", savePersonne);
  if (id) {
    document.getElementById("btn-delete-personne").addEventListener("click", () => deletePersonne(id));
    loadDocuments(id);
  }
  document.getElementById("btn-analyser-photo").addEventListener("click", () => {
    const files = Array.from(document.getElementById("ai-photo-input").files || []);
    analyserFichiers(files);
  });
  document.getElementById("btn-analyser-cv").addEventListener("click", () => {
    const files = Array.from(document.getElementById("ai-cv-input").files || []);
    analyserFichiers(files);
  });

  // Glisser-déposer sur les deux zones distinctes (photo / CV) et sur le champ photo principal
  enableDragDrop(document.getElementById("ai-photo-dropzone"), document.getElementById("ai-photo-input"), { append: true });
  document.getElementById("ai-photo-input").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    document.getElementById("ai-photo-list").textContent = files.length ? files.map((f) => f.name).join(", ") : "";
  });

  enableDragDrop(document.getElementById("ai-cv-dropzone"), document.getElementById("ai-cv-input"), { append: true });
  document.getElementById("ai-cv-input").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    document.getElementById("ai-cv-list").textContent = files.length ? files.map((f) => f.name).join(", ") : "";
    const pdfFile = files.find((f) => f.type === "application/pdf");
    if (pdfFile) previewPdfFirstPage(pdfFile);
    else document.getElementById("cv-preview-container").style.display = "none";
  });

  // Filet de sécurité : si le fichier est déposé n'importe où dans la zone globale
  // (pas précisément sur une des deux petites boîtes), on le route automatiquement selon son type.
  const zoneGlobale = document.getElementById("ai-extract-zone");
  ["dragenter", "dragover"].forEach((evt) => zoneGlobale.addEventListener(evt, (e) => { e.preventDefault(); zoneGlobale.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((evt) => zoneGlobale.addEventListener(evt, (e) => { e.preventDefault(); zoneGlobale.classList.remove("dragover"); }));
  zoneGlobale.addEventListener("drop", (e) => {
    if (!e.dataTransfer.files || !e.dataTransfer.files.length) return;
    const photoInput = document.getElementById("ai-photo-input");
    const cvInput = document.getElementById("ai-cv-input");
    const dtPhoto = new DataTransfer();
    Array.from(photoInput.files || []).forEach((f) => dtPhoto.items.add(f));
    const dtCv = new DataTransfer();
    Array.from(cvInput.files || []).forEach((f) => dtCv.items.add(f));
    Array.from(e.dataTransfer.files).forEach((f) => {
      if (f.type.startsWith("image/")) dtPhoto.items.add(f);
      else dtCv.items.add(f);
    });
    photoInput.files = dtPhoto.files;
    cvInput.files = dtCv.files;
    photoInput.dispatchEvent(new Event("change"));
    cvInput.dispatchEvent(new Event("change"));
  });

  const photoField = document.getElementById("f-photo").closest(".field");
  photoField.style.border = "1px dashed var(--border)";
  photoField.style.borderRadius = "8px";
  photoField.style.padding = "6px 8px";
  enableDragDrop(photoField, document.getElementById("f-photo"));

  // Afficher/masquer la catégorie et l'année selon le type de document, et activer le glisser-déposer
  const docTypeSelect = document.getElementById("doc-type");
  const docCatWrapper = document.getElementById("doc-categorie-wrapper");
  const docAnneeWrapper = document.getElementById("doc-annee-wrapper");
  function toggleDocCategorie() {
    const isPhoto = docTypeSelect.value === "photo";
    docCatWrapper.style.display = isPhoto ? "flex" : "none";
    docAnneeWrapper.style.display = isPhoto ? "flex" : "none";
  }
  docTypeSelect.addEventListener("change", toggleDocCategorie);
  toggleDocCategorie();
  enableDragDrop(document.getElementById("doc-file-dropzone"), document.getElementById("doc-file"));
}

let cvCropState = { canvas: null, scale: 1, dragging: false, startX: 0, startY: 0, rect: null };

async function previewPdfFirstPage(file) {
  try {
    if (typeof pdfjsLib !== "undefined") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = document.getElementById("cv-preview-canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    document.getElementById("cv-preview-container").style.display = "block";
    document.getElementById("cv-crop-status").textContent = "";
    document.getElementById("cv-crop-box").style.display = "none";
    cvCropState = { canvas, scale: 1, dragging: false, startX: 0, startY: 0, rect: null };
    bindCvCropEvents(canvas);
  } catch (e) {
    console.error("Erreur prévisualisation PDF", e);
    document.getElementById("cv-preview-container").style.display = "none";
  }
}

function bindCvCropEvents(canvas) {
  const wrapper = document.getElementById("cv-preview-wrapper");
  const cropBox = document.getElementById("cv-crop-box");

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY, dispX: e.clientX - r.left, dispY: e.clientY - r.top };
  }

  canvas.onmousedown = (e) => {
    const pos = getPos(e);
    cvCropState.dragging = true;
    cvCropState.startX = pos.x;
    cvCropState.startY = pos.y;
    cropBox.style.left = pos.dispX + "px";
    cropBox.style.top = pos.dispY + "px";
    cropBox.style.width = "0px";
    cropBox.style.height = "0px";
    cropBox.style.display = "block";
  };
  wrapper.onmousemove = (e) => {
    if (!cvCropState.dragging) return;
    const pos = getPos(e);
    const r = canvas.getBoundingClientRect();
    const startDispX = cvCropState.startX / (canvas.width / r.width);
    const startDispY = cvCropState.startY / (canvas.height / r.height);
    const left = Math.min(startDispX, pos.dispX);
    const top = Math.min(startDispY, pos.dispY);
    const w = Math.abs(pos.dispX - startDispX);
    const h = Math.abs(pos.dispY - startDispY);
    cropBox.style.left = left + "px";
    cropBox.style.top = top + "px";
    cropBox.style.width = w + "px";
    cropBox.style.height = h + "px";
    cvCropState.rect = {
      x: Math.min(cvCropState.startX, pos.x),
      y: Math.min(cvCropState.startY, pos.y),
      w: Math.abs(pos.x - cvCropState.startX),
      h: Math.abs(pos.y - cvCropState.startY),
    };
  };
  window.addEventListener("mouseup", () => { cvCropState.dragging = false; });
}

document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "btn-use-crop") {
    const status = document.getElementById("cv-crop-status");
    const rect = cvCropState.rect;
    if (!rect || rect.w < 10 || rect.h < 10) { status.textContent = "Dessine d'abord un rectangle sur la photo (clique-glisse)."; return; }
    const srcCanvas = cvCropState.canvas;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = rect.w;
    cropCanvas.height = rect.h;
    cropCanvas.getContext("2d").drawImage(srcCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    cropCanvas.toBlob((blob) => {
      const photoFile = new File([blob], "photo-cv-decoupee.png", { type: "image/png" });
      try {
        const dt = new DataTransfer();
        dt.items.add(photoFile);
        document.getElementById("f-photo").files = dt.files;
        status.textContent = "Photo découpée reprise comme photo principale.";
      } catch (e2) {
        status.textContent = "Erreur : navigateur non compatible.";
      }
    }, "image/png");
  }
});

function enableDragDrop(zoneEl, fileInputEl, options = {}) {
  if (!zoneEl || !fileInputEl) return;
  const append = !!options.append;
  ["dragenter", "dragover"].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zoneEl.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zoneEl.classList.remove("dragover"); })
  );
  zoneEl.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      if (append && fileInputEl.multiple) {
        const dt = new DataTransfer();
        Array.from(fileInputEl.files || []).forEach((f) => dt.items.add(f));
        Array.from(e.dataTransfer.files).forEach((f) => dt.items.add(f));
        fileInputEl.files = dt.files;
      } else {
        fileInputEl.files = e.dataTransfer.files;
      }
      fileInputEl.dispatchEvent(new Event("change"));
    }
  });
}

async function analyserFichiers(files) {
  const textInput = document.getElementById("ai-text-input");
  const status = document.getElementById("ai-extract-status");
  const texte = textInput.value.trim();

  if (!files.length && !texte) { status.textContent = "Ajoute au moins un fichier ou du texte."; return; }

  status.innerHTML = `<span class="spinner"></span> Analyse en cours...`;
  document.getElementById("ai-extract-results").style.display = "none";
  // Retirer les éventuels doublons (même fichier déjà mis de côté lors d'une analyse précédente)
  state.pendingDocsAfterSave = state.pendingDocsAfterSave.filter((doc) => !files.some((f) => f.name === doc.file.name && f.size === doc.file.size));
  try {
    const images = []; // {data, mediaType}
    const pdfs = []; // {data}
    const nomsFichiers = [];
    let mainPhotoFile = null;

    const unreadableFiles = [];
    for (const file of files) {
      nomsFichiers.push(file.name);
      if (file.type.startsWith("image/")) {
        images.push({ data: await fileToBase64(file), mediaType: await detecterTypeImageReel(file) });
        if (!mainPhotoFile) mainPhotoFile = file; // la 1ère image sert de photo principale
        else state.pendingDocsAfterSave.push({ file, type_document: "photo", categorie_photo: "autre" });
      } else if (file.type === "application/pdf") {
        pdfs.push({ data: await fileToBase64(file) });
        state.pendingDocsAfterSave.push({ file, type_document: "cv", categorie_photo: null });
      } else if (file.type.startsWith("video/")) {
        state.pendingDocsAfterSave.push({ file, type_document: "demo_video", categorie_photo: null });
      } else {
        // Formats non lisibles par l'IA (ex: .rtfd, .doc, .pages...) : seul le nom du fichier sera utilisé
        unreadableFiles.push(file.name);
        state.pendingDocsAfterSave.push({ file, type_document: "autre", categorie_photo: null });
      }
    }

    const payload = { texte: texte || undefined, images, pdfs, nomsFichiers };
    const res = await fetch("/api/extract-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let json;
    try {
      json = await res.json();
    } catch (e) {
      status.textContent = `Le serveur a mis trop de temps à répondre (trop de fichiers analysés d'un coup, code ${res.status}). Réessaie avec moins de fichiers à la fois (ex: juste la photo, puis juste le CV séparément).`;
      return;
    }
    if (json.error) { status.textContent = "Erreur : " + json.error; return; }
    const d = json.extracted || {};
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null && val !== undefined && val !== "") el.value = val; };
    setVal("f-prenom", d.prenom); setVal("f-nom", d.nom);
    setVal("f-date-naissance", d.date_naissance); setVal("f-age", d.age);
    setVal("f-taille", d.taille_cm); setVal("f-poids", d.poids_kg); setVal("f-pointure", d.pointure);
    setVal("f-tour-taille", d.tour_taille); setVal("f-tour-poitrine", d.tour_poitrine);
    setVal("f-yeux", d.couleur_yeux); setVal("f-cheveux", d.couleur_cheveux); setVal("f-morphologie", d.morphologie);
    setVal("f-genre", d.genre);
    setVal("f-tel", d.telephone); setVal("f-email", d.email); setVal("f-adresse", d.adresse);
    if (d.permis_conduire) document.getElementById("f-permis").checked = true;
    setVal("f-types-permis", d.types_permis); setVal("f-langues", d.langues);
    setVal("f-competences", d.competences_particulieres);
    setVal("f-metier", d.metier);
    setVal("f-showreel", d.lien_showreel); setVal("f-site", d.lien_site_web); setVal("f-agence", d.agence);
    setVal("f-instagram", d.lien_instagram); setVal("f-lien-agent", d.lien_agent);
    setVal("f-iban", d.iban); setVal("f-bic", d.bic); setVal("f-titulaire-rib", d.titulaire_rib);
    setVal("f-experience", d.experience_parcours);
    setVal("f-notes", d.notes);
    // Reprendre automatiquement la 1ère photo comme photo principale
    if (mainPhotoFile) {
      try {
        const dt = new DataTransfer();
        dt.items.add(mainPhotoFile);
        document.getElementById("f-photo").files = dt.files;
      } catch (e2) { /* navigateur trop ancien, tant pis */ }
    }

    const nbExtra = state.pendingDocsAfterSave.length;

    // Encadré récapitulatif de ce que l'IA a trouvé
    const resultsBox = document.getElementById("ai-extract-results");
    const champsTrouves = [];
    if (d.nom || d.prenom) champsTrouves.push(`<strong>Identité :</strong> ${esc(d.prenom || "")} ${esc(d.nom || "")}`);
    if (d.taille_cm) champsTrouves.push(`<strong>Taille :</strong> ${d.taille_cm} cm`);
    if (d.telephone || d.email) champsTrouves.push(`<strong>Contact :</strong> ${esc(d.telephone || "")} ${esc(d.email || "")}`);
    if (d.permis_conduire) champsTrouves.push(`<strong>Permis :</strong> ${esc(d.types_permis || "oui")}`);
    if (d.metier) champsTrouves.push(`<strong>Métier :</strong> ${esc(d.metier)}`);
    if (d.lien_instagram) champsTrouves.push(`<strong>Instagram :</strong> ${esc(d.lien_instagram)}`);
    if (d.lien_showreel) champsTrouves.push(`<strong>YouTube / démo :</strong> ${esc(d.lien_showreel)}`);
    if (d.lien_site_web) champsTrouves.push(`<strong>Site personnel :</strong> ${esc(d.lien_site_web)}`);
    if (d.lien_agent || d.agence) champsTrouves.push(`<strong>Agence/agent :</strong> ${esc(d.agence || "")} ${esc(d.lien_agent || "")}`);
    if (d.iban) champsTrouves.push(`<strong>RIB détecté :</strong> IBAN ${esc(d.iban)}${d.bic ? " — BIC " + esc(d.bic) : ""}${d.titulaire_rib ? " — Titulaire : " + esc(d.titulaire_rib) : ""}`);
    if (d.competences_particulieres) champsTrouves.push(`<strong>Compétences :</strong> ${esc(d.competences_particulieres)}`);
    if (d.experience_parcours) champsTrouves.push(`<strong>Expérience / parcours :</strong><br>${esc(d.experience_parcours).replace(/\n/g, "<br>")}`);
    if (d.notes) champsTrouves.push(`<strong>Autres notes :</strong> ${esc(d.notes)}`);
    if (state.pendingDocsAfterSave.length) {
      champsTrouves.push(`<strong>Fichiers mis de côté :</strong> ${state.pendingDocsAfterSave.map((x) => esc(x.file.name) + " (" + x.type_document + ")").join(", ")} — seront ajoutés aux documents après enregistrement.`);
    }
    if (unreadableFiles.length) {
      champsTrouves.push(`<span style="color:var(--red);">Attention : Format non lisible par l'IA :</span> ${unreadableFiles.map(esc).join(", ")} — seul le nom du fichier a pu être analysé. Convertis-le en PDF (Fichier → Exporter/Imprimer en PDF) pour que le contenu (théâtre, tournages, formations) soit vraiment lu.`);
    }
    if (champsTrouves.length) {
      resultsBox.style.display = "block";
      resultsBox.innerHTML = `<div style="color:var(--accent); font-weight:700; margin-bottom:6px;">Ce que l'IA a relevé :</div>` + champsTrouves.map((c) => `<div style="margin-bottom:6px;">${c}</div>`).join("");
    } else {
      resultsBox.style.display = "block";
      resultsBox.innerHTML = `<div style="color:var(--text-muted);">Aucune information exploitable trouvée. Vérifie le fichier ou complète manuellement.</div>`;
    }

    // Détection de doublon : si cette personne existe peut-être déjà, proposer de mettre à jour sa fiche plutôt que d'en créer une nouvelle
    if (!state.currentEditingPersonneId) {
      const emailNorm = (d.email || "").trim().toLowerCase();
      const nomNorm = (d.nom || "").trim().toLowerCase();
      const prenomNorm = (d.prenom || "").trim().toLowerCase();
      const doublon = state.personnes.find((p) => {
        const memeEmail = emailNorm && (p.email || "").trim().toLowerCase() === emailNorm;
        const memeNom = nomNorm && prenomNorm && (p.nom || "").trim().toLowerCase() === nomNorm && (p.prenom || "").trim().toLowerCase() === prenomNorm;
        return memeEmail || memeNom;
      });
      if (doublon) {
        const banner = document.createElement("div");
        banner.style.cssText = "margin-top:10px; background:rgba(232,185,74,.12); border:1px solid var(--accent); border-radius:8px; padding:10px 12px;";
        banner.innerHTML = `
          <div style="margin-bottom:8px;">Une fiche existe peut-être déjà pour <strong>${esc(doublon.prenom)} ${esc(doublon.nom)}</strong>${doublon.photo_annee ? " (photo actuelle de " + doublon.photo_annee + ")" : ""}. Tu peux mettre à jour sa fiche existante avec cette nouvelle photo (l'ancienne sera conservée, datée, dans sa galerie) au lieu de créer un doublon.</div>
          <button type="button" class="btn secondary" id="btn-maj-doublon">Mettre à jour la fiche existante</button>
        `;
        resultsBox.appendChild(banner);
        document.getElementById("btn-maj-doublon").addEventListener("click", async () => {
          const btn = document.getElementById("btn-maj-doublon");
          btn.disabled = true;
          btn.textContent = "Mise à jour en cours...";
          try {
            if (mainPhotoFile) {
              const url = await uploadToStorage(mainPhotoFile, "photos");
              await setPhotoTrombi(doublon.id, url);
            } else {
              closeModal();
              await openFicheModal(doublon.id);
            }
          } catch (err) {
            alert("Erreur : " + err.message);
            btn.disabled = false;
            btn.textContent = "Mettre à jour la fiche existante";
          }
        });
      }
    }

    status.textContent = `Champs pré-remplis${mainPhotoFile ? " (photo reprise automatiquement)" : ""}${nbExtra ? ` — ${nbExtra} fichier(s) en attente` : ""}. Vérifie ci-dessous et dans le formulaire avant d'enregistrer.`;
  } catch (e) {
    status.textContent = "Erreur : " + e.message;
  }
}

async function savePersonne() {
  const val = (id) => document.getElementById(id).value;
  const num = (id) => { const v = val(id); return v === "" ? null : Number(v); };

  const record = {
    prenom: val("f-prenom"), nom: val("f-nom"), type_personne: val("f-type"), genre: val("f-genre") || null,
    date_naissance: val("f-date-naissance") || null, age: num("f-age"),
    taille_cm: num("f-taille"), poids_kg: num("f-poids"), pointure: num("f-pointure"),
    tour_taille: num("f-tour-taille"), tour_poitrine: num("f-tour-poitrine"),
    couleur_yeux: val("f-yeux"), couleur_cheveux: val("f-cheveux"), morphologie: val("f-morphologie"),
    telephone: val("f-tel"), email: val("f-email"), adresse: val("f-adresse"),
    permis_conduire: document.getElementById("f-permis").checked, types_permis: val("f-types-permis"),
    langues: val("f-langues"), competences_particulieres: val("f-competences"), metier: val("f-metier"),
    lien_showreel: val("f-showreel"), lien_site_web: val("f-site"), agence: val("f-agence"),
    lien_instagram: val("f-instagram"), lien_agent: val("f-lien-agent"),
    experience_parcours: val("f-experience"),
    lieu_naissance: val("f-lieu-naissance"), nationalite: val("f-nationalite"), num_secu_sociale: val("f-num-secu"),
    situation_familiale: val("f-situation-familiale"), nb_enfants_charge: val("f-nb-enfants"), nom_jeune_fille: val("f-nom-jeune-fille"),
    centre_secu_sociale: val("f-centre-secu"), personne_a_prevenir: val("f-personne-prevenir"),
    iban: val("f-iban"), bic: val("f-bic"), titulaire_rib: val("f-titulaire-rib"),
    photo_annee: num("f-photo-annee"), notes: val("f-notes"),
    updated_at: new Date().toISOString(),
  };

  if (!record.prenom || !record.nom) { alert("Le nom et le prénom sont obligatoires."); return; }

  const photoFile = document.getElementById("f-photo").files[0];

  const wasNew = !state.currentEditingPersonneId;
  let personneId = state.currentEditingPersonneId;
  const saveBtn = document.getElementById("btn-save-personne");
  const originalLabel = saveBtn.textContent;
  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "Enregistrement...";

    if (photoFile) record.photo_url = await uploadToStorage(photoFile, "photos");

    if (personneId) {
      const { error } = await sb.from("personnes").update(record).eq("id", personneId);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from("personnes").insert(record).select().single();
      if (error) throw error;
      personneId = data.id;
    }

    // Ajout des fichiers en attente (CV, démo, photos supplémentaires détectés lors de l'extraction IA)
    if (state.pendingDocsAfterSave.length) {
      saveBtn.textContent = `Ajout de ${state.pendingDocsAfterSave.length} document(s)...`;
      for (const doc of state.pendingDocsAfterSave) {
        try {
          const fichier_url = await uploadToStorage(doc.file, doc.type_document === "photo" ? "photos" : "documents");
          await sb.from("documents_personne").insert({
            personne_id: personneId,
            type_document: doc.type_document,
            categorie_photo: doc.categorie_photo,
            libelle: doc.file.name,
            fichier_url,
          });
        } catch (docErr) {
          console.error("Erreur ajout document", doc.file.name, docErr);
        }
      }
      state.pendingDocsAfterSave = [];
    }

    await loadPersonnes();

    if (wasNew) {
      // On garde la fenêtre ouverte pour permettre d'ajouter tout de suite des photos/documents supplémentaires
      state.currentEditingPersonneId = personneId;
      document.getElementById("documents-fieldset").style.display = "";
      await loadDocuments(personneId);
      document.getElementById("btn-cancel-close").textContent = "Fermer";
      saveBtn.disabled = false;
      saveBtn.textContent = "Enregistrer les modifications";
      const statusEl = document.getElementById("ai-extract-status");
      if (statusEl) statusEl.textContent = "";
      const resultsBox = document.getElementById("ai-extract-results");
      if (resultsBox) resultsBox.innerHTML = `<div style="color:var(--green);">Fiche créée. Tu peux maintenant ajouter d'autres photos (portrait, pied, véhicule...) ou documents dans la section "Documents" ci-dessous, puis cliquer "Fermer".</div>`;
      if (resultsBox) resultsBox.style.display = "block";
    } else {
      closeModal();
    }
  } catch (e) {
    alert("Erreur lors de l'enregistrement : " + e.message);
    saveBtn.disabled = false;
    saveBtn.textContent = originalLabel;
  }
}

async function deletePersonne(id) {
  if (!confirm("Supprimer définitivement cette personne (et ses documents) ?")) return;
  const { error } = await sb.from("personnes").delete().eq("id", id);
  if (error) { alert("Erreur : " + error.message); return; }
  closeModal();
  await loadPersonnes();
}

async function loadDocuments(personneId) {
  const { data } = await sb.from("documents_personne").select("*").eq("personne_id", personneId).order("created_at", { ascending: false });
  renderDocuments(data || []);
}
function renderDocuments(docs) {
  const container = document.getElementById("doc-list-container");
  const labels = { cv: "CV", demo_video: "Démo vidéo", demo_lien: "Démo (lien)", photo: "Photo", autre: "Autre" };
  const catLabels = { portrait: "Portrait", pied: "En pied", vehicule: "Véhicule", tenue_chic: "Tenue chic", animal: "Animal", autre: "Autre" };
  if (!docs.length) { container.innerHTML = `<div style="color:var(--text-muted); font-size:13px;">Aucun document ajouté.</div>`; return; }
  container.innerHTML = docs.map((d) => `
    <div class="doc-item">
      <span class="type-tag">${labels[d.type_document] || d.type_document}${d.type_document === "photo" && d.categorie_photo ? " · " + catLabels[d.categorie_photo] : ""}${d.type_document === "photo" && d.annee_photo ? " · " + d.annee_photo : ""}</span>
      <a href="${esc(d.fichier_url || d.lien_externe)}" target="_blank">${esc(d.libelle || d.fichier_url || d.lien_externe)}</a>
      <button class="btn-icon" onclick="deleteDocument('${d.id}', '${state.currentEditingPersonneId}')">Supprimer</button>
    </div>
  `).join("");
}
async function deleteDocument(docId, personneId) {
  await sb.from("documents_personne").delete().eq("id", docId);
  loadDocuments(personneId);
}
document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "btn-add-doc") {
    const personneId = state.currentEditingPersonneId;
    if (!personneId) { alert("Enregistre d'abord la fiche avant d'ajouter un document."); return; }
    const type_document = document.getElementById("doc-type").value;
    const libelle = document.getElementById("doc-libelle").value;
    const file = document.getElementById("doc-file").files[0];
    const lien = document.getElementById("doc-lien").value.trim();
    const categorie_photo = type_document === "photo" ? document.getElementById("doc-categorie").value : null;
    const annee_photo = type_document === "photo" ? (document.getElementById("doc-annee").value || null) : null;
    try {
      let fichier_url = null;
      if (file) fichier_url = await uploadToStorage(file, type_document === "photo" ? "photos" : "documents");
      await sb.from("documents_personne").insert({ personne_id: personneId, type_document, categorie_photo, annee_photo, libelle, fichier_url, lien_externe: lien || null });
      document.getElementById("doc-libelle").value = "";
      document.getElementById("doc-annee").value = "";
      document.getElementById("doc-lien").value = "";
      document.getElementById("doc-file").value = "";
      loadDocuments(personneId);
    } catch (err) {
      alert("Erreur : " + err.message);
    }
  }
});

// ==========================================================
// ONGLET TROMBINOSCOPE
// ==========================================================
document.getElementById("tf-planche").addEventListener("change", () => {
  const isPortraits = document.getElementById("tf-planche").value === "portraits";
  document.getElementById("tf-type-wrapper").style.display = isPortraits ? "flex" : "none";
});

async function generateTrombinoscope() {
  const planche = document.getElementById("tf-planche").value;
  if (planche === "portraits") return generateTrombinoscopePortraits();
  return generateTrombinoscopeCategorie(planche);
}

async function generateTrombinoscopePortraits() {
  let query = sb.from("personnes").select("*");
  const type = document.getElementById("tf-type").value;
  const genre = document.getElementById("tf-genre").value;
  const nom = document.getElementById("tf-nom").value.trim().toLowerCase();
  const tailleMin = document.getElementById("tf-taille-min").value;
  const tailleMax = document.getElementById("tf-taille-max").value;
  const ageMin = document.getElementById("tf-age-min").value;
  const ageMax = document.getElementById("tf-age-max").value;
  const permis = document.getElementById("tf-permis").checked;
  const metier = document.getElementById("tf-metier").value.trim().toLowerCase();
  const competence = document.getElementById("tf-competence").value.trim().toLowerCase();
  const langue = document.getElementById("tf-langue").value.trim().toLowerCase();
  const rechercheLibre = document.getElementById("tf-recherche-libre").value.trim().toLowerCase();

  if (type) query = query.eq("type_personne", type);
  if (genre) query = query.eq("genre", genre);
  if (tailleMin) query = query.gte("taille_cm", Number(tailleMin));
  if (tailleMax) query = query.lte("taille_cm", Number(tailleMax));
  if (ageMin) query = query.gte("age", Number(ageMin));
  if (ageMax) query = query.lte("age", Number(ageMax));
  if (permis) query = query.eq("permis_conduire", true);

  const { data, error } = await query.order("nom");
  if (error) { alert(error.message); return; }
  let list = data || [];
  if (nom) list = list.filter((p) => `${p.prenom} ${p.nom}`.toLowerCase().includes(nom));
  if (metier) list = list.filter((p) => (p.metier || "").toLowerCase().includes(metier));
  if (competence) list = list.filter((p) => (p.competences_particulieres || "").toLowerCase().includes(competence));
  if (langue) list = list.filter((p) => (p.langues || "").toLowerCase().includes(langue));
  if (rechercheLibre) {
    list = list.filter((p) => {
      const champs = [
        p.nom, p.prenom, p.metier, p.competences_particulieres, p.langues,
        p.morphologie, p.couleur_yeux, p.couleur_cheveux, p.notes,
        p.experience_parcours, p.agence, p.adresse, p.types_permis,
      ];
      return champs.some((c) => (c || "").toLowerCase().includes(rechercheLibre));
    });
  }

  document.getElementById("trombi-count").textContent = `${list.length} personne(s) correspondent aux critères.`;
  const grid = document.getElementById("trombi-results");
  if (!list.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Aucun résultat pour ces critères.</div>`; state.lastTrombiSummary = []; return; }
  state.lastTrombiSummary = list.map((p) => ({
    nom: `${p.prenom} ${p.nom}`,
    details: [
      p.taille_cm ? p.taille_cm + " cm" : "",
      p.age ? p.age + " ans" : "",
      p.metier || "",
      p.permis_conduire ? "Permis " + (p.types_permis || "oui") : "",
      p.telephone || "",
    ].filter(Boolean).join(" · "),
  }));
  grid.innerHTML = list.map((p) => {
    // priorité à une photo taguée "portrait" dans les documents si elle existe, sinon photo_url principale
    const photo = p._portraitUrl || p.photo_url;
    return `
    <div class="person-card">
      <div class="photo" style="${photo ? `background-image:url('${esc(photo)}')` : ""}">${photo ? "" : ""}</div>
      <div class="info">
        <div class="name">${esc(p.prenom)} ${esc(p.nom)}</div>
        <div class="details">
          ${p.taille_cm ? "Taille: " + p.taille_cm + " cm<br>" : ""}
          ${p.age ? "Âge: " + p.age + " ans<br>" : ""}
          ${p.metier ? "Métier: " + esc(p.metier) + "<br>" : ""}
          ${p.permis_conduire ? "Permis: " + (p.types_permis || "oui") + "<br>" : ""}
          ${p.telephone ? "Tél: " + esc(p.telephone) : ""}
        </div>
        <span class="badge ${p.type_personne}">${p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien+Fig."}</span>
      </div>
    </div>
  `;
  }).join("");
}

const PLANCHE_LABELS = { pied: "En pied", vehicule: "Véhicule", tenue_chic: "Tenue chic", animal: "Animal", autre: "Autre" };

async function generateTrombinoscopeCategorie(categorie) {
  const { data, error } = await sb
    .from("documents_personne")
    .select("*, personnes(id, nom, prenom, type_personne, telephone)")
    .eq("type_document", "photo")
    .eq("categorie_photo", categorie)
    .order("created_at", { ascending: false });
  if (error) { alert(error.message); return; }
  const list = data || [];

  document.getElementById("trombi-count").textContent = `${list.length} photo(s) — planche "${PLANCHE_LABELS[categorie] || categorie}".`;
  const grid = document.getElementById("trombi-results");
  if (!list.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Aucune photo dans cette catégorie pour l'instant. Ajoute des photos "${PLANCHE_LABELS[categorie] || categorie}" depuis la fiche d'une personne.</div>`; state.lastTrombiSummary = []; return; }
  state.lastTrombiSummary = list.map((d) => ({
    nom: d.personnes ? `${d.personnes.prenom} ${d.personnes.nom}` : "—",
    details: d.libelle || "",
  }));
  grid.innerHTML = list.map((d) => `
    <div class="person-card">
      <div class="photo" style="${d.fichier_url ? `background-image:url('${esc(d.fichier_url)}')` : ""}">${d.fichier_url ? "" : ""}</div>
      <div class="info">
        <div class="name">${d.personnes ? esc(d.personnes.prenom) + " " + esc(d.personnes.nom) : "—"}</div>
        <div class="details">${esc(d.libelle || "")}</div>
      </div>
    </div>
  `).join("");
}

document.getElementById("btn-trombi-filter").addEventListener("click", generateTrombinoscope);
document.getElementById("btn-trombi-print").addEventListener("click", () => window.print());
document.getElementById("btn-trombi-email").addEventListener("click", () => {
  if (!state.lastTrombiSummary.length) { alert("Génère d'abord un trombinoscope."); return; }
  const planche = document.getElementById("tf-planche").selectedOptions[0].textContent;
  const body = `Trombinoscope — ${planche}\n\n` + state.lastTrombiSummary.map((x) => `${x.nom}${x.details ? " — " + x.details : ""}`).join("\n");
  window.location.href = `mailto:?subject=${encodeURIComponent("Trombinoscope - " + planche)}&body=${encodeURIComponent(body)}`;
});
document.getElementById("btn-trombi-whatsapp").addEventListener("click", () => {
  if (!state.lastTrombiSummary.length) { alert("Génère d'abord un trombinoscope."); return; }
  const planche = document.getElementById("tf-planche").selectedOptions[0].textContent;
  const text = `Trombinoscope — ${planche}\n\n` + state.lastTrombiSummary.map((x) => `${x.nom}${x.details ? " — " + x.details : ""}`).join("\n");
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
});
document.getElementById("btn-trombi-reset").addEventListener("click", () => {
  document.getElementById("tf-planche").value = "portraits";
  document.getElementById("tf-type-wrapper").style.display = "flex";
  document.getElementById("tf-type").value = "";
  document.getElementById("tf-genre").value = "";
  document.getElementById("tf-nom").value = "";
  document.getElementById("tf-taille-min").value = "";
  document.getElementById("tf-taille-max").value = "";
  document.getElementById("tf-age-min").value = "";
  document.getElementById("tf-age-max").value = "";
  document.getElementById("tf-permis").checked = false;
  document.getElementById("tf-metier").value = "";
  document.getElementById("tf-competence").value = "";
  document.getElementById("tf-langue").value = "";
  document.getElementById("tf-recherche-libre").value = "";
  document.getElementById("trombi-results").innerHTML = "";
  document.getElementById("trombi-count").textContent = "";
});

// ==========================================================
// FILMS (base comédiens/figurants commune, dépouillement/PDT séparés par film)
// ==========================================================
async function loadFilms() {
  const { data } = await sb.from("films").select("*").order("created_at");
  state.films = data || [];
}

function populateFilmSelect(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = state.films.length
    ? state.films.map((f) => `<option value="${f.id}">${esc(f.nom)}</option>`).join("")
    : `<option value="">— Aucun film, crée-en un —</option>`;
  if (state.currentFilmId && state.films.some((f) => f.id === state.currentFilmId)) {
    select.value = state.currentFilmId;
  } else if (state.films.length) {
    state.currentFilmId = state.films[0].id;
    select.value = state.currentFilmId;
    localStorage.setItem("castingFiguration_currentFilmId", state.currentFilmId);
  }
}

async function initFilmSelectors() {
  await loadFilms();
  populateFilmSelect("film-select-depouillement");
  document.getElementById("film-select-depouillement").onchange = (e) => onFilmChange(e.target.value);
  await loadJoursDropdown("liste-jour-select", onListeJourChange);
  await loadJoursDropdown("presence-jour-select", onPresenceJourChange);
  await loadJoursDropdown("emargement-jour-select", onEmargementJourChange);
  await loadJoursDropdown("contrat-jour-select", onContratJourChange);
  await loadJoursDropdown("prepaye-jour-select", onPrepayeJourChange);
  await loadJoursDropdown("recap-admin-jour-select", onRecapAdminJourChange);
  await loadJoursDropdown("hmc-jour-select", onHmcJourChange);
}

async function onFilmChange(newFilmId) {
  state.currentFilmId = newFilmId;
  localStorage.setItem("castingFiguration_currentFilmId", newFilmId || "");
  document.getElementById("film-select-depouillement").value = newFilmId;
  await loadJoursDropdown("depouillement-jour-select", onDepouillementJourChange);
  await loadJoursDropdown("liste-jour-select", onListeJourChange);
  await loadJoursDropdown("presence-jour-select", onPresenceJourChange);
  await loadJoursDropdown("emargement-jour-select", onEmargementJourChange);
  await loadJoursDropdown("contrat-jour-select", onContratJourChange);
  await loadJoursDropdown("prepaye-jour-select", onPrepayeJourChange);
  await loadJoursDropdown("recap-admin-jour-select", onRecapAdminJourChange);
  await loadJoursDropdown("hmc-jour-select", onHmcJourChange);
  await loadFilmDocuments(newFilmId);
}

async function createNouveauFilm() {
  const nom = prompt("Nom du film (ex: LEDR2, Nouveau projet...)");
  if (!nom) return;
  const description = prompt("Description (optionnel)") || null;
  const { data, error } = await sb.from("films").insert({ nom, description }).select().single();
  if (error) { alert(error.message); return; }
  await loadFilms();
  populateFilmSelect("film-select-depouillement");
  await onFilmChange(data.id);
}
document.getElementById("btn-new-film-depouillement").addEventListener("click", createNouveauFilm);
document.getElementById("btn-infos-film").addEventListener("click", openInfosFilmModal);

async function openInfosFilmModal() {
  if (!state.currentFilmId) { alert("Choisis d'abord un film."); return; }
  const film = state.films.find((f) => f.id === state.currentFilmId);
  if (!film) return;
  openModal(`
    <span class="close-x" onclick="closeModal()">✕</span>
    <h2>Infos du film — ${esc(film.nom)}</h2>
    <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Ces informations servent notamment à générer la feuille d'émargement.</div>
    <div class="field-row">
      <div class="field"><label>Nom de la production</label><input type="text" id="f-nom-production" value="${esc(film.nom_production)}"></div>
      <div class="field"><label>Réalisateur</label><input type="text" id="f-realisateur" value="${esc(film.realisateur)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Adresse de la production</label><input type="text" id="f-adresse-production" value="${esc(film.adresse_production)}"></div>
      <div class="field"><label>Téléphone de la production</label><input type="text" id="f-telephone-production" value="${esc(film.telephone_production)}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Directeur / Directrice de production</label><input type="text" id="f-directeur-production" value="${esc(film.directeur_production)}"></div>
    </div>
    <fieldset>
      <legend>Infos légales (pour les contrats)</legend>
      <div class="field-row">
        <div class="field"><label>Forme juridique</label><input type="text" id="f-forme-juridique" value="${esc(film.forme_juridique)}" placeholder="ex SARL"></div>
        <div class="field"><label>Capital social</label><input type="text" id="f-capital-social" value="${esc(film.capital_social)}" placeholder="ex 45 000 Euros"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>RCS</label><input type="text" id="f-rcs" value="${esc(film.rcs)}" placeholder="ex RCS Tours 502 529 472"></div>
        <div class="field"><label>SIRET</label><input type="text" id="f-siret" value="${esc(film.siret)}"></div>
        <div class="field"><label>Code APE</label><input type="text" id="f-code-ape" value="${esc(film.code_ape)}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>N° objet (agrément)</label><input type="text" id="f-numero-objet" value="${esc(film.numero_objet)}"></div>
      </div>
    </fieldset>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:14px;">
      <button class="btn secondary" onclick="closeModal()">Annuler</button>
      <button class="btn" id="btn-save-infos-film">Enregistrer</button>
    </div>
  `);
  document.getElementById("btn-save-infos-film").addEventListener("click", async () => {
    const maj = {
      nom_production: document.getElementById("f-nom-production").value,
      realisateur: document.getElementById("f-realisateur").value,
      adresse_production: document.getElementById("f-adresse-production").value,
      telephone_production: document.getElementById("f-telephone-production").value,
      directeur_production: document.getElementById("f-directeur-production").value,
      forme_juridique: document.getElementById("f-forme-juridique").value,
      capital_social: document.getElementById("f-capital-social").value,
      rcs: document.getElementById("f-rcs").value,
      siret: document.getElementById("f-siret").value,
      code_ape: document.getElementById("f-code-ape").value,
      numero_objet: document.getElementById("f-numero-objet").value,
    };
    const { error } = await sb.from("films").update(maj).eq("id", state.currentFilmId);
    if (error) { alert("Erreur : " + error.message); return; }
    await loadFilms();
    closeModal();
  });
}


// ==========================================================
// DOCUMENTS DU FILM (bible, PDT, scénario)
// ==========================================================
async function loadFilmDocuments(filmId) {
  const listEl = document.getElementById("film-documents-list");
  if (!filmId) { listEl.innerHTML = ""; return; }
  const { data } = await sb.from("film_documents").select("*").eq("film_id", filmId).order("created_at", { ascending: false });
  const docs = data || [];
  const labels = { bible: "Bible", pdt: "PDT", scenario: "Scénario", depouillement: "Dépouillement", liste_figurants: "Liste figurants" };
  if (!docs.length) { listEl.innerHTML = `<div style="font-size:12px; color:var(--text-muted);">Aucun document importé pour ce film.</div>`; return; }
  listEl.innerHTML = docs.map((d) => `
    <div class="doc-item">
      <span class="type-tag">${labels[d.type_document] || d.type_document}</span>
      <a href="${esc(d.fichier_url)}" target="_blank">${esc(d.nom_fichier || d.fichier_url)}</a>
      ${d.type_document === "scenario" && d.contenu_extrait ? `<button type="button" class="btn-icon" onclick="showScenarioContent('${d.id}')">Voir séquences</button>` : ""}
      ${d.type_document === "depouillement" && d.contenu_extrait ? `<button type="button" class="btn-icon" onclick="renderDepouillementImportReview(state.filmDocumentsCache.find(x => x.id === '${d.id}').contenu_extrait)">Revoir / réimporter</button>` : ""}
      ${d.type_document === "liste_figurants" && d.contenu_extrait ? `<button type="button" class="btn-icon" onclick="renderListeFigurantsImportReview(state.filmDocumentsCache.find(x => x.id === '${d.id}').contenu_extrait)">Revoir / réimporter</button>` : ""}
      <button class="btn-icon" onclick="deleteFilmDocument('${d.id}', '${filmId}')">Supprimer</button>
    </div>
  `).join("");
  // stocker pour affichage rapide du contenu extrait
  state.filmDocumentsCache = docs;
}

async function deleteFilmDocument(docId, filmId) {
  if (!confirm("Supprimer ce document ?")) return;
  await sb.from("film_documents").delete().eq("id", docId);
  await loadFilmDocuments(filmId);
}

function showScenarioContent(docId) {
  const doc = (state.filmDocumentsCache || []).find((d) => d.id === docId);
  if (!doc || !doc.contenu_extrait) return;
  const sequences = doc.contenu_extrait;
  openModal(`
    <span class="close-x" onclick="closeModal()">×</span>
    <h2>Séquences extraites du scénario</h2>
    <table class="role-table">
      <thead><tr><th>N°</th><th>Décor</th><th>Résumé</th></tr></thead>
      <tbody>
        ${sequences.map((s) => `<tr><td>${esc(s.numero)}</td><td>${esc(s.decor)}</td><td>${esc(s.resume)}</td></tr>`).join("")}
      </tbody>
    </table>
    <div style="display:flex; justify-content:flex-end; margin-top:14px;">
      <button class="btn secondary" onclick="closeModal()">Fermer</button>
    </div>
  `);
}

document.getElementById("upload-bible").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !state.currentFilmId) { if (!state.currentFilmId) alert("Choisis d'abord un film."); return; }
  const status = document.getElementById("film-documents-status");
  status.innerHTML = `<span class="spinner"></span> Envoi de la bible...`;
  try {
    const url = await uploadToStorage(file, "bible");
    await sb.from("film_documents").insert({ film_id: state.currentFilmId, type_document: "bible", nom_fichier: file.name, fichier_url: url });
    status.textContent = "Bible importée.";
    await loadFilmDocuments(state.currentFilmId);
  } catch (err) {
    status.textContent = "Erreur : " + err.message;
  }
});

// Convertit un fichier Excel/CSV en texte (toutes les feuilles) pour l'envoyer à l'IA
async function excelFileToText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  let text = "";
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    text += `--- Feuille : ${sheetName} ---\n${csv}\n\n`;
  });
  return text;
}

// Appel sécurisé à l'API d'extraction : gère les réponses non-JSON (timeout, erreur serveur HTML...)
async function callExtractPdtApi(payload) {
  const res = await fetch("/api/extract-pdt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(`Le serveur a mis trop de temps à répondre ou a renvoyé une erreur inattendue (code ${res.status}). Réessaie, ou avec un fichier/morceau plus petit.`);
  }
  if (json.error) throw new Error(json.error);
  return json.extracted || [];
}

// Analyse un fichier (PDF découpé en morceaux de pages, ou Excel/CSV en un seul appel) et fusionne les résultats
// ==========================================================
// LECTURE EXCEL SANS IA (gratuite, instantanée, basée sur les en-têtes de colonnes)
// ==========================================================
function normaliserEnTete(s) {
  return (s || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function trouverColonne(entetes, motsCles) {
  for (let i = 0; i < entetes.length; i++) {
    for (const mot of motsCles) {
      const re = new RegExp("\\b" + mot + "\\b");
      if (re.test(entetes[i])) return i;
    }
  }
  return -1;
}

// Lit toutes les feuilles d'un fichier Excel/CSV et reconnaît les colonnes selon les mots-clés fournis
async function parseExcelSansIA(file, colonnesAttendues) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  let resultats = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows.length) return;

    let headerRowIdx = -1;
    let colIndices = {};
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const entetes = (rows[r] || []).map(normaliserEnTete);
      const indices = {};
      let nbTrouvees = 0;
      for (const [champ, motsCles] of Object.entries(colonnesAttendues)) {
        const idx = trouverColonne(entetes, motsCles);
        if (idx !== -1) { indices[champ] = idx; nbTrouvees++; }
      }
      if (nbTrouvees >= 2) { headerRowIdx = r; colIndices = indices; break; }
    }
    if (headerRowIdx === -1) return; // aucun tableau reconnaissable sur cette feuille

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every((c) => c === "" || c === undefined || c === null)) continue;
      const obj = {};
      for (const [champ, idx] of Object.entries(colIndices)) {
        obj[champ] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : "";
      }
      if (Object.values(obj).some((v) => v)) resultats.push(obj);
    }
  });
  return resultats;
}

const COLONNES_PDT = {
  jour_tournage: ["jour", "jr"],
  date_tournage: ["date"],
  decor: ["decor", "lieu"],
  sequences: ["sequence", "seq", "sequences"],
};
const COLONNES_DEPOUILLEMENT = {
  jour_tournage: ["jour", "jr"],
  type_role: ["type"],
  sequence: ["sequence", "seq"],
  nom_personnage: ["personnage", "role", "figurant"],
};
const COLONNES_LISTE_FIGURANTS = {
  jour_tournage: ["jour", "jr"],
  nom: ["nom"],
  prenom: ["prenom"],
  telephone: ["tel", "telephone", "portable", "gsm"],
  email: ["mail", "email", "courriel"],
  role: ["role", "personnage"],
};

async function analyserDocumentParMorceaux(file, type, statusEl, ajusterPages) {
  const isExcelOrCsv = /\.(xlsx|xls|csv)$/i.test(file.name) || file.type.includes("sheet") || file.type.includes("csv") || file.type.includes("excel");

  if (isExcelOrCsv) {
    const texteComplet = await excelFileToText(file);
    const lignes = texteComplet.split("\n");
    const LIGNES_PAR_MORCEAU = 40;

    if (lignes.length <= LIGNES_PAR_MORCEAU) {
      statusEl.innerHTML = `<span class="spinner"></span> Analyse en cours...`;
      return await callExtractPdtApi({ type, texte: texteComplet });
    }

    const nbMorceaux = Math.ceil(lignes.length / LIGNES_PAR_MORCEAU);
    let tousLesResultatsExcel = [];
    for (let c = 0; c < nbMorceaux; c++) {
      const debut = c * LIGNES_PAR_MORCEAU;
      const fin = Math.min(debut + LIGNES_PAR_MORCEAU, lignes.length);
      statusEl.innerHTML = `<span class="spinner"></span> Analyse : lignes ${debut + 1} à ${fin} sur ${lignes.length}...`;
      const morceauTexte = lignes.slice(debut, fin).join("\n");
      const resultats = await callExtractPdtApi({ type, texte: morceauTexte });
      tousLesResultatsExcel = tousLesResultatsExcel.concat(resultats);
    }
    return tousLesResultatsExcel;
  }

  // PDF : découpage en petits morceaux de pages pour rester sous la limite de temps du serveur
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer);
  const totalPages = srcDoc.getPageCount();
  const CHUNK_SIZE = 2;
  const nbChunks = Math.ceil(totalPages / CHUNK_SIZE);

  let tousLesResultats = [];
  for (let c = 0; c < nbChunks; c++) {
    const startPage = c * CHUNK_SIZE;
    const endPage = Math.min(startPage + CHUNK_SIZE, totalPages);
    statusEl.innerHTML = `<span class="spinner"></span> Analyse : pages ${startPage + 1} à ${endPage} sur ${totalPages}...`;

    const chunkDoc = await PDFLib.PDFDocument.create();
    const indices = [];
    for (let p = startPage; p < endPage; p++) indices.push(p);
    const copiedPages = await chunkDoc.copyPages(srcDoc, indices);
    copiedPages.forEach((p) => chunkDoc.addPage(p));
    const chunkBytes = await chunkDoc.save();
    const chunkBase64 = btoa(String.fromCharCode(...new Uint8Array(chunkBytes)));

    const resultats = await callExtractPdtApi({ pdfBase64: chunkBase64, type });
    const ajustes = ajusterPages ? resultats.map((r) => ajusterPages(r, startPage)) : resultats;
    tousLesResultats = tousLesResultats.concat(ajustes);
  }
  return tousLesResultats;
}

document.getElementById("upload-pdt").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !state.currentFilmId) { if (!state.currentFilmId) alert("Choisis d'abord un film."); return; }
  const status = document.getElementById("film-documents-status");
  const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
  try {
    const url = await uploadToStorage(file, "pdt");
    let extracted;
    if (isExcel) {
      status.innerHTML = `<span class="spinner"></span> Lecture du fichier (sans IA)...`;
      extracted = await parseExcelSansIA(file, COLONNES_PDT);
      if (!extracted.length) { status.textContent = "Aucune colonne reconnue dans ce fichier (attendu : Jour, Date, Décor, Séquences). Vérifie les en-têtes."; return; }
    } else {
      extracted = await analyserDocumentParMorceaux(file, "pdt", status);
    }
    await sb.from("film_documents").insert({ film_id: state.currentFilmId, type_document: "pdt", nom_fichier: file.name, fichier_url: url, contenu_extrait: extracted });
    status.textContent = `PDT lu — ${extracted.length} jour(s) trouvé(s). Vérifie et importe ci-dessous.`;
    renderPdtReview(extracted);
    await loadFilmDocuments(state.currentFilmId);
  } catch (err) {
    status.textContent = "Erreur : " + err.message;
  }
});

document.getElementById("upload-scenario").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !state.currentFilmId) { if (!state.currentFilmId) alert("Choisis d'abord un film."); return; }
  const status = document.getElementById("film-documents-status");
  try {
    const url = await uploadToStorage(file, "scenario");
    const extracted = await analyserDocumentParMorceaux(file, "scenario", status, (s, startPage) => ({
      ...s,
      page_debut: s.page_debut ? Number(s.page_debut) + startPage : null,
      page_fin: s.page_fin ? Number(s.page_fin) + startPage : null,
    }));
    await sb.from("film_documents").insert({ film_id: state.currentFilmId, type_document: "scenario", nom_fichier: file.name, fichier_url: url, contenu_extrait: extracted });
    status.textContent = `Scénario analysé — ${extracted.length} séquence(s) trouvée(s). Clique "Voir séquences" dans la liste ci-dessous pour les consulter.`;
    await loadFilmDocuments(state.currentFilmId);
  } catch (err) {
    status.textContent = "Erreur : " + err.message;
  }
});

document.getElementById("upload-depouillement").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !state.currentFilmId) { if (!state.currentFilmId) alert("Choisis d'abord un film."); return; }
  const status = document.getElementById("film-documents-status");
  const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
  try {
    const url = await uploadToStorage(file, "depouillement");
    let extracted;
    if (isExcel) {
      status.innerHTML = `<span class="spinner"></span> Lecture du fichier (sans IA)...`;
      extracted = await parseExcelSansIA(file, COLONNES_DEPOUILLEMENT);
      extracted = extracted.map((r) => ({ ...r, type_role: deviserTypeRole(r.type_role) }));
      if (!extracted.length) { status.textContent = "Aucune colonne reconnue dans ce fichier (attendu : Jour, Type, Séquence, Personnage). Vérifie les en-têtes."; return; }
    } else {
      extracted = await analyserDocumentParMorceaux(file, "depouillement", status);
    }
    await sb.from("film_documents").insert({ film_id: state.currentFilmId, type_document: "depouillement", nom_fichier: file.name, fichier_url: url, contenu_extrait: extracted });
    status.textContent = `Dépouillement lu — ${extracted.length} rôle(s) trouvé(s). Vérifie et importe ci-dessous.`;
    await loadJours();
    renderDepouillementImportReview(extracted);
    await loadFilmDocuments(state.currentFilmId);
  } catch (err) {
    status.textContent = "Erreur : " + err.message;
  }
});

document.getElementById("upload-liste-figurants").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file || !state.currentFilmId) { if (!state.currentFilmId) alert("Choisis d'abord un film."); return; }
  const status = document.getElementById("film-documents-status");
  const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
  try {
    const url = await uploadToStorage(file, "liste-figurants");
    let extracted;
    if (isExcel) {
      status.innerHTML = `<span class="spinner"></span> Lecture du fichier (sans IA)...`;
      extracted = await parseExcelSansIA(file, COLONNES_LISTE_FIGURANTS);
      if (!extracted.length) { status.textContent = "Aucune colonne reconnue dans ce fichier (attendu : Jour, Nom, Prénom, Tél, Mail, Rôle). Vérifie les en-têtes."; return; }
    } else {
      extracted = await analyserDocumentParMorceaux(file, "liste_figurants", status);
    }
    await sb.from("film_documents").insert({ film_id: state.currentFilmId, type_document: "liste_figurants", nom_fichier: file.name, fichier_url: url, contenu_extrait: extracted });
    status.textContent = `Liste lue — ${extracted.length} figurant(s) trouvé(s) sur les différents jours. Vérifie et importe ci-dessous.`;
    await loadJours();
    if (!state.personnes.length) await loadPersonnes();
    renderListeFigurantsImportReview(extracted);
    await loadFilmDocuments(state.currentFilmId);
  } catch (err) {
    status.textContent = "Erreur : " + err.message;
  }
});

function deviserTypeRole(roleTexte) {
  const t = (roleTexte || "").toLowerCase();
  if (t.includes("parlante") || t.includes("parlant")) return "silhouette_parlante";
  if (t.includes("enfant")) return "enfant";
  if (t.includes("cascade")) return "cascadeur";
  if (t.includes("petit")) return "petit_role";
  return "silhouette";
}

function renderListeFigurantsImportReview(lignes) {
  const container = document.getElementById("liste-figurants-review-container");
  if (!lignes || !lignes.length) { container.style.display = "none"; return; }
  container.style.display = "block";

  function trouverPersonne(nom, prenom) {
    const n = (nom || "").trim().toLowerCase();
    const p = (prenom || "").trim().toLowerCase();
    return state.personnes.find((x) => (x.nom || "").trim().toLowerCase() === n && (x.prenom || "").trim().toLowerCase() === p);
  }

  container.innerHTML = `
    <div class="filter-panel">
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">Vérifie la liste avant d'importer. Les personnes déjà connues seront liées à leur fiche existante ; les nouvelles seront automatiquement créées dans la base Comédiens/Figurants (type "figurant") avec leurs coordonnées. Les jours doivent déjà exister :</div>
      <table class="role-table">
        <thead><tr><th><input type="checkbox" id="figu-check-all" checked></th><th>Jour</th><th>Nom</th><th>Prénom</th><th>Tél</th><th>Mail</th><th>Rôle</th><th>Statut</th></tr></thead>
        <tbody>
          ${lignes.map((l, i) => {
            const jourMatch = state.jours.find((j) => j.jour_tournage.toLowerCase() === (l.jour_tournage || "").toLowerCase());
            const personneMatch = trouverPersonne(l.nom, l.prenom);
            return `
            <tr>
              <td><input type="checkbox" class="figu-row-check" data-idx="${i}" ${jourMatch ? "checked" : "disabled"}></td>
              <td>${esc(l.jour_tournage)}</td>
              <td>${esc(l.nom)}</td>
              <td>${esc(l.prenom)}</td>
              <td>${esc(l.telephone)}</td>
              <td>${esc(l.email)}</td>
              <td>${esc(l.role)}</td>
              <td>${!jourMatch ? "Jour à créer d'abord" : personneMatch ? "Personne existante" : "Nouvelle personne"}</td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
        <button class="btn secondary" id="btn-figu-cancel">Annuler</button>
        <button class="btn" id="btn-figu-import">Importer les figurants sélectionnés</button>
      </div>
    </div>
  `;
  document.getElementById("figu-check-all").addEventListener("change", (e) => {
    document.querySelectorAll(".figu-row-check:not(:disabled)").forEach((c) => { c.checked = e.target.checked; });
  });
  document.getElementById("btn-figu-cancel").addEventListener("click", () => { container.style.display = "none"; container.innerHTML = ""; });
  document.getElementById("btn-figu-import").addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll(".figu-row-check:checked")).map((c) => lignes[Number(c.dataset.idx)]);
    if (!selected.length) { alert("Sélectionne au moins une ligne."); return; }
    const btn = document.getElementById("btn-figu-import");
    btn.disabled = true;
    btn.textContent = "Import en cours...";
    let imported = 0;
    for (const l of selected) {
      const jourMatch = state.jours.find((j) => j.jour_tournage.toLowerCase() === (l.jour_tournage || "").toLowerCase());
      if (!jourMatch) continue;
      let personne = trouverPersonne(l.nom, l.prenom);
      if (!personne) {
        const { data: nouvellePersonne, error: errPersonne } = await sb.from("personnes").insert({
          type_personne: "figurant",
          nom: l.nom || "",
          prenom: l.prenom || "",
          telephone: l.telephone || null,
          email: l.email || null,
        }).select().single();
        if (!errPersonne) {
          personne = nouvellePersonne;
          state.personnes.push(personne);
        }
      }
      await sb.from("depouillement_roles").insert({
        jour_id: jourMatch.id,
        personne_id: personne ? personne.id : null,
        type_role: deviserTypeRole(l.role),
        nom_personnage: l.role || "",
        photo_url_snapshot: personne ? personne.photo_url : null,
      });
      imported++;
    }
    container.style.display = "none";
    container.innerHTML = "";
    if (state.currentDepouillementJourId) await renderDepouillement(state.currentDepouillementJourId);
    alert(`${imported} figurant(s) importé(s) avec succès (nouvelles fiches créées si besoin).`);
  });
}

function renderDepouillementImportReview(roles) {
  const container = document.getElementById("depouillement-review-container");
  if (!roles || !roles.length) { container.style.display = "none"; return; }
  container.style.display = "block";
  const roleLabels = Object.fromEntries(ROLE_TYPES.map((r) => [r.value, r.label]));
  container.innerHTML = `
    <div class="filter-panel">
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">Vérifie les rôles détectés dans le dépouillement avant de les importer. Les jours doivent déjà exister (crée-les d'abord si besoin) :</div>
      <table class="role-table">
        <thead><tr><th><input type="checkbox" id="depo-check-all" checked></th><th>Jour</th><th>Type</th><th>Séquence</th><th>Personnage</th><th>Jour trouvé ?</th></tr></thead>
        <tbody>
          ${roles.map((r, i) => {
            const jourMatch = state.jours.find((j) => j.jour_tournage.toLowerCase() === (r.jour_tournage || "").toLowerCase());
            return `
            <tr>
              <td><input type="checkbox" class="depo-row-check" data-idx="${i}" ${jourMatch ? "checked" : "disabled"}></td>
              <td>${esc(r.jour_tournage)}</td>
              <td>${roleLabels[r.type_role] || esc(r.type_role)}</td>
              <td>${esc(r.sequence)}</td>
              <td>${esc(r.nom_personnage)}</td>
              <td>${jourMatch ? "✓" : "Attention : à créer d'abord"}</td>
            </tr>
          `;
          }).join("")}
        </tbody>
      </table>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
        <button class="btn secondary" id="btn-depo-cancel">Annuler</button>
        <button class="btn" id="btn-depo-import">Importer les rôles sélectionnés</button>
      </div>
    </div>
  `;
  document.getElementById("depo-check-all").addEventListener("change", (e) => {
    document.querySelectorAll(".depo-row-check:not(:disabled)").forEach((c) => { c.checked = e.target.checked; });
  });
  document.getElementById("btn-depo-cancel").addEventListener("click", () => { container.style.display = "none"; container.innerHTML = ""; });
  document.getElementById("btn-depo-import").addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll(".depo-row-check:checked")).map((c) => roles[Number(c.dataset.idx)]);
    if (!selected.length) { alert("Sélectionne au moins un rôle."); return; }
    const btn = document.getElementById("btn-depo-import");
    btn.disabled = true;
    btn.textContent = "Import en cours...";
    let imported = 0;
    for (const r of selected) {
      const jourMatch = state.jours.find((j) => j.jour_tournage.toLowerCase() === (r.jour_tournage || "").toLowerCase());
      if (!jourMatch) continue;
      await sb.from("depouillement_roles").insert({
        jour_id: jourMatch.id,
        type_role: r.type_role,
        sequence: r.sequence,
        nom_personnage: r.nom_personnage,
      });
      imported++;
    }
    container.style.display = "none";
    container.innerHTML = "";
    if (state.currentDepouillementJourId) await renderDepouillement(state.currentDepouillementJourId);
    alert(`${imported} rôle(s) importé(s) avec succès.`);
  });
}

function renderPdtReview(jours) {
  const container = document.getElementById("pdt-review-container");
  if (!jours || !jours.length) { container.style.display = "none"; return; }
  container.style.display = "block";
  container.innerHTML = `
    <div class="filter-panel">
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:8px;">Vérifie les jours détectés dans le PDT avant de les importer dans le dépouillement :</div>
      <table class="role-table">
        <thead><tr><th><input type="checkbox" id="pdt-check-all" checked></th><th>Jour</th><th>Date</th><th>Décor</th><th>Séquences</th></tr></thead>
        <tbody>
          ${jours.map((j, i) => `
            <tr>
              <td><input type="checkbox" class="pdt-row-check" data-idx="${i}" checked></td>
              <td>${esc(j.jour_tournage)}</td>
              <td>${esc(j.date_tournage)}</td>
              <td>${esc(j.decor)}</td>
              <td>${esc(j.sequences)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
        <button class="btn secondary" id="btn-pdt-cancel">Annuler</button>
        <button class="btn" id="btn-pdt-import">Importer les jours sélectionnés</button>
      </div>
    </div>
  `;
  document.getElementById("pdt-check-all").addEventListener("change", (e) => {
    document.querySelectorAll(".pdt-row-check").forEach((c) => { c.checked = e.target.checked; });
  });
  document.getElementById("btn-pdt-cancel").addEventListener("click", () => { container.style.display = "none"; container.innerHTML = ""; });
  document.getElementById("btn-pdt-import").addEventListener("click", async () => {
    const selected = Array.from(document.querySelectorAll(".pdt-row-check:checked")).map((c) => jours[Number(c.dataset.idx)]);
    if (!selected.length) { alert("Sélectionne au moins un jour."); return; }
    const btn = document.getElementById("btn-pdt-import");
    btn.disabled = true;
    btn.textContent = "Import en cours...";
    for (const j of selected) {
      await sb.from("depouillement_jours").insert({
        jour_tournage: j.jour_tournage,
        date_tournage: j.date_tournage || null,
        sequences: [j.sequences, j.decor].filter(Boolean).join(" — "),
        film_id: state.currentFilmId,
      });
    }
    container.style.display = "none";
    container.innerHTML = "";
    await loadJoursDropdown("depouillement-jour-select", onDepouillementJourChange);
    alert(`${selected.length} jour(s) importé(s) avec succès.`);
  });
}

// ==========================================================
// JOURS DE TOURNAGE (partagé Dépouillement / HMC, filtrés par film actif)
// ==========================================================
async function loadJours() {
  let query = sb.from("depouillement_jours").select("*").order("jour_tournage");
  if (state.currentFilmId) query = query.eq("film_id", state.currentFilmId);
  const { data } = await query;
  state.jours = data || [];
}
async function loadJoursDropdown(selectId, onChange) {
  await loadJours();
  const select = document.getElementById(selectId);
  const prevValue = select.value;
  select.innerHTML = `<option value="">— Choisir un jour de tournage —</option>` +
    state.jours.map((j) => `<option value="${j.id}">${esc(j.jour_tournage)}${j.date_tournage ? " — " + j.date_tournage : ""}</option>`).join("");
  select.onchange = () => onChange(select.value);
  if (prevValue && state.jours.find((j) => j.id === prevValue)) { select.value = prevValue; onChange(prevValue); }
  else { onChange(""); }
}

async function createNouveauJour() {
  if (!state.currentFilmId) { alert("Choisis ou crée d'abord un film avant d'ajouter un jour de tournage."); return; }
  const jour_tournage = prompt("Nom du jour de tournage (ex: J20)");
  if (!jour_tournage) return;
  const date_tournage = prompt("Date de tournage (AAAA-MM-JJ), optionnel") || null;
  const sequences = prompt("Séquences prévues ce jour (optionnel)") || null;
  const { error } = await sb.from("depouillement_jours").insert({ jour_tournage, date_tournage, sequences, film_id: state.currentFilmId });
  if (error) { alert(error.message); return; }
  await loadJoursDropdown("depouillement-jour-select", onDepouillementJourChange);
  await loadJoursDropdown("hmc-jour-select", onHmcJourChange);
}
document.getElementById("btn-new-jour").addEventListener("click", createNouveauJour);


// ==========================================================
// ONGLET DEPOUILLEMENT
// ==========================================================
async function onDepouillementJourChange(jourId) {
  state.currentDepouillementJourId = jourId || null;
  const container = document.getElementById("depouillement-content");
  if (!jourId) { container.innerHTML = `<div class="empty-state">Choisis ou crée un jour de tournage.</div>`; return; }
  await renderDepouillement(jourId);
}

async function onListeJourChange(jourId) {
  const container = document.getElementById("liste-jour-content");
  if (!jourId) { container.innerHTML = `<div class="empty-state"><div class="big"></div>Choisis un jour de tournage.</div>`; return; }
  await renderListeJour(jourId);
}

async function onPresenceJourChange(jourId) {
  state.currentPresenceJourId = jourId || null;
  const container = document.getElementById("presence-content");
  if (!jourId) { container.innerHTML = `<div class="empty-state">Choisis un jour de tournage.</div>`; document.getElementById("presence-count").textContent = ""; return; }
  await renderPresenceJour(jourId);
}

// ==========================================================
// ÉMARGEMENT (bordereau d'émargement, même modèle pour tous les films)
// ==========================================================
const JOURS_SEMAINE_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function formaterDateFr(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${JOURS_SEMAINE_FR[d.getDay()]} ${d.getDate()} ${MOIS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

async function onEmargementJourChange(jourId) {
  state.currentEmargementJourId = jourId || null;
  const container = document.getElementById("emargement-content");
  const status = document.getElementById("emargement-status");
  if (!jourId) { container.innerHTML = `<div class="empty-state">Choisis un jour de tournage.</div>`; status.textContent = ""; return; }
  await renderEmargement(jourId);
}

async function renderEmargement(jourId) {
  const container = document.getElementById("emargement-content");
  const status = document.getElementById("emargement-status");
  const film = state.films.find((f) => f.id === state.currentFilmId);
  if (!film || !film.nom_production || !film.realisateur) {
    status.innerHTML = `Pense à renseigner les <strong>infos du film</strong> (nom de production, réalisateur...) via le bouton en haut, pour que la feuille soit complète.`;
  } else {
    status.textContent = "";
  }

  const jour = state.jours.find((j) => j.id === jourId);
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];

  const lignes = list.map((r) => {
    let nom = "", prenom = "", tel = "";
    if (r.personne_id) {
      const p = state.personnes.find((x) => x.id === r.personne_id);
      if (p) { nom = p.nom; prenom = p.prenom; tel = p.telephone || ""; }
    }
    if (!nom && !prenom) prenom = r.nom_personnage || "";
    return { nom, prenom, tel };
  });

  container.innerHTML = `
    <table class="role-table">
      <thead><tr><th>N.</th><th>Nom</th><th>Prénom</th><th>Téléphone</th></tr></thead>
      <tbody>
        ${lignes.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.nom)}</td><td>${esc(l.prenom)}</td><td>${esc(l.tel)}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

document.getElementById("btn-emargement-print").addEventListener("click", async () => {
  const jourId = state.currentEmargementJourId;
  if (!jourId) { alert("Choisis d'abord un jour de tournage."); return; }
  const film = state.films.find((f) => f.id === state.currentFilmId);
  const jour = state.jours.find((j) => j.id === jourId);
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];
  const lignes = list.map((r) => {
    let nom = "", prenom = "", tel = "";
    if (r.personne_id) {
      const p = state.personnes.find((x) => x.id === r.personne_id);
      if (p) { nom = p.nom; prenom = p.prenom; tel = p.telephone || ""; }
    }
    if (!nom && !prenom) prenom = r.nom_personnage || "";
    return { nom, prenom, tel };
  });

  const dateAffichee = formaterDateFr(jour ? jour.date_tournage : "");

  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>Bordereau d'émargement</title>
    <style>
      @page { size: landscape; margin: 12mm; }
      body{ font-family: Arial, sans-serif; font-size:11px; color:#111; }
      .entete{ text-align:center; margin-bottom:10px; }
      .entete .production{ font-weight:bold; font-size:14px; }
      .entete .titre{ font-weight:bold; font-size:16px; margin:4px 0; }
      .entete .ligne{ font-size:11px; }
      .bordereau-titre{ text-align:center; font-weight:bold; font-size:13px; margin:12px 0; }
      table{ width:100%; border-collapse:collapse; }
      th, td{ border:1px solid #333; padding:4px 6px; text-align:center; }
      th{ background:#eee; font-size:10px; }
      td.nom, td.prenom{ text-align:left; }
    </style>
    </head><body>
      <div class="entete">
        <div class="production">${esc(film?.nom_production || "")}</div>
        <div class="titre">${esc(film?.nom || "")}</div>
        <div class="ligne">Réalisé par</div>
        <div class="ligne"><strong>${esc(film?.realisateur || "")}</strong></div>
        <div class="ligne">${esc(film?.adresse_production || "")}${film?.telephone_production ? " — tél : " + esc(film.telephone_production) : ""}</div>
        <div class="ligne">Directeur de production</div>
        <div class="ligne"><strong>${esc(film?.directeur_production || "")}</strong></div>
      </div>
      <div class="bordereau-titre">Bordereau d'émargement du ${esc(dateAffichee)}${jour ? " (" + esc(jour.jour_tournage) + ")" : ""}</div>
      <table>
        <thead>
          <tr>
            <th>N.</th><th>NOM</th><th>PRENOM</th><th>TELEPHONE</th>
            <th>HEURE<br>D'ARRIVÉE</th><th>SIGNATURE</th><th>HEURE DE PAUSE</th><th>HEURE DE<br>FIN DE PAUSE</th><th>HEURE DE<br>DEPART</th><th>SIGNATURE</th><th>CACHET<br>BRUT</th><th>INDEMNITES</th>
          </tr>
        </thead>
        <tbody>
          ${lignes.map((l, i) => `
            <tr>
              <td>${i + 1}</td>
              <td class="nom">${esc(l.nom)}</td>
              <td class="prenom">${esc(l.prenom)}</td>
              <td>${esc(l.tel)}</td>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
});

// ==========================================================
// CONTRATS (lettre d'engagement d'acteur de complément)
// ==========================================================
async function onContratJourChange(jourId) {
  state.currentContratJourId = jourId || null;
  const select = document.getElementById("contrat-personne-select");
  const panel = document.getElementById("contrat-details-panel");
  document.getElementById("contrat-status").textContent = "";
  if (!jourId) { select.innerHTML = `<option value="">— Choisir une personne du jour —</option>`; panel.style.display = "none"; return; }

  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  state.contratRolesJour = roles || [];
  select.innerHTML = `<option value="">— Choisir une personne du jour —</option>` +
    state.contratRolesJour.map((r) => {
      let label = r.nom_personnage || "Rôle";
      if (r.personne_id) {
        const p = state.personnes.find((x) => x.id === r.personne_id);
        if (p) label = `${p.prenom} ${p.nom}`;
      }
      return `<option value="${r.id}">${esc(label)}</option>`;
    }).join("");
  panel.style.display = "block";
  const nbAvecPersonne = state.contratRolesJour.filter((r) => r.personne_id).length;
  document.getElementById("contrat-status").textContent = `${nbAvecPersonne} personne(s) du jour reliée(s) à une fiche complète, sur ${state.contratRolesJour.length} rôle(s) au total.`;
}
document.getElementById("contrat-jour-select").addEventListener("change", (e) => onContratJourChange(e.target.value));

function joursSemaineMoisFr(dateStr) {
  return formaterDateFr(dateStr);
}

function genererContratBodyHtml(p, film, dateAffichee, lieuTournage, montantBrut, villeSignature) {
  return `
      <h1>${esc(film?.nom_production || "")}</h1>
      <div class="entete">
        FILM : "${esc(film?.nom || "")}" de ${esc(film?.realisateur || "")}${film?.numero_objet ? " (N° objet : " + esc(film.numero_objet) + ")" : ""}<br>
        ${esc(film?.adresse_production || "")} — ${esc(film?.forme_juridique || "")} au capital de ${esc(film?.capital_social || "")}${film?.rcs ? " – " + esc(film.rcs) : ""}${film?.siret ? " – SIRET " + esc(film.siret) : ""}${film?.code_ape ? " – code APE " + esc(film.code_ape) : ""}
      </div>
      <div class="titre-contrat">LETTRE D'ENGAGEMENT D'ACTEUR DE COMPLÉMENT – CDDU (Art L1242 du code du travail) - CCNPC titre 3 sous-titre 2</div>
      <p style="text-align:center;">RÈGLEMENT UNIQUEMENT PAR VIREMENT — MERCI DE JOINDRE UN RIB À VOTRE NOM</p>

      <table class="infos">
        <tr><td class="label" colspan="2">Le Salarié – L'Acteur de complément</td></tr>
        <tr><td><span class="label">NOM :</span> ${esc(p.nom)}</td><td><span class="label">PRENOM :</span> ${esc(p.prenom)}</td></tr>
        <tr><td colspan="2"><span class="label">Nom de jeune fille :</span> ${esc(p.nom_jeune_fille) || "-"}</td></tr>
        <tr><td colspan="2"><span class="label">Adresse fiscale :</span> ${esc(p.adresse)}</td></tr>
        <tr><td><span class="label">Portable :</span> ${esc(p.telephone)}</td><td><span class="label">Mail :</span> ${esc(p.email)}</td></tr>
        <tr><td><span class="label">Date de naissance :</span> ${esc(p.date_naissance)}</td><td><span class="label">Lieu de naissance :</span> ${esc(p.lieu_naissance)}</td></tr>
        <tr><td><span class="label">Nationalité :</span> ${esc(p.nationalite)}</td><td></td></tr>
        <tr><td colspan="2"><span class="label">N° Sécurité Sociale :</span> ${esc(p.num_secu_sociale)}</td></tr>
        <tr><td><span class="label">Situation de famille :</span> ${esc(p.situation_familiale)}</td><td><span class="label">Nb enfants à charge :</span> ${esc(p.nb_enfants_charge)}</td></tr>
        <tr><td colspan="2"><span class="label">Centre de Sécurité Sociale :</span> ${esc(p.centre_secu_sociale)}</td></tr>
        <tr><td colspan="2"><span class="label">Personne à prévenir en cas d'accident :</span> ${esc(p.personne_a_prevenir)}</td></tr>
      </table>

      <p>Le présent contrat prend effet le <strong>${esc(dateAffichee)}</strong> pour une durée de 1 journée de tournage.<br>
      Montant brut par cachet : <strong>${esc(montantBrut)} €</strong> — Lieu de Tournage : <strong>${esc(lieuTournage)}</strong></p>

      <p>Suite à nos entretiens, nous vous confirmons que nous vous engageons aux conditions ci-après exposées en qualité d'ACTEUR DE COMPLÉMENT en vue de la réalisation de l'ŒUVRE, produite notamment par ${esc(film?.nom_production || "")} (ci-après le « PRODUCTEUR »), qui sera exploitée en tout ou partie par tous moyens de diffusion connus ou à connaître, notamment par exploitation télévisuelle, gratuite, payante, par exploitation dématérialisée sur tous supports de réception « en ligne », par tous services de communication électronique et de média audiovisuels à la demande, par VOD, NVOD, FVD, EST, SVOD, Catch up TV, etc., par vidéogrammes, disques, par exploitation cinématographique, etc.</p>

      <p><strong>EFFET – DURÉE</strong><br>
      Il ne nous sera en aucun cas fait obligation de proroger le présent engagement après son expiration, même si le tournage des séquences vous concernant n'est pas terminé. La fin de la période d'engagement prévue aux présentes, prorogée éventuellement de la durée de dépassement, en constitue le terme. Il n'y aura lieu à aucun préavis.</p>

      <p><strong>CESSION DE DROITS</strong><br>
      Vous acceptez d'être photographié(e) et de participer aux prises de vues de l'ŒUVRE. Vous confirmez être irrévocablement d'accord pour que la ou les société(s), notamment le PRODUCTEUR, qui produisent, distribuent, exploitent l'ŒUVRE, conservent tous les droits quels qu'ils soient, concernant la photographie et l'image en négatif ou positif, vous représentant ; pour que la ou les société(s) puissent utiliser et réutiliser ces photographies ou images à leur gré, pour des films et leur exploitation par tout autre moyen connu ou inconnu à ce jour, accompagné ou non du son enregistré, postsynchronisé ou doublé d'un commentaire ou d'un dialogue, ainsi que pour la promotion de ces programmes, et ce pendant la durée légale de protection de droit d'auteur et dans le monde entier.<br>
      Compte tenu du rôle pour lequel il a été engagé, de la courte durée et du caractère interchangeable et accessoire de son intervention, vous reconnaissez que votre prestation ne peut donner lieu ni à la reconnaissance d'un droit dit voisin du droit d'auteur, au sens des articles L. 212-1 et suivants du Code de la propriété intellectuelle, ni au versement d'une rémunération complémentaire à ce titre.</p>

      <p><strong>CONFIDENTIALITÉ</strong><br>
      Vous vous interdisez toute communication quelle qu'elle soit, concernant l'Œuvre, auprès de tout tiers, notamment presse, radio et télévision ou réseaux sociaux, avant la première exploitation commerciale de l'Œuvre, sans l'accord préalable du Producteur.</p>

      <p><strong>RÉMUNÉRATION</strong><br>
      ${esc(film?.nom_production || "Le Producteur")} met en place la dématérialisation de vos bulletins de paie, AEM. Par la présente, vous acceptez d'adhérer à ce service.</p>

      <p>Fait à ${esc(villeSignature)}, en 2 exemplaires originaux, le ${esc(dateAffichee)}</p>

      <div class="signature-zone">
        <p>L'ACTEUR DE COMPLÉMENT<br>
        précédée de la mention « Lu et approuvé, bon pour accord »</p>
        <br><br>
        <p>LE DIRECTEUR DE PRODUCTION<br>${esc(film?.directeur_production || "")}</p>
      </div>

      <div class="page-break"></div>
      <p style="text-align:center; font-weight:bold;">CONDITIONS GÉNÉRALES DU CONTRAT</p>
      <p><strong>Art. 1 :</strong> Le présent contrat n'est en aucun cas renouvelable par tacite reconduction. Il prendra fin au terme convenu, de plein droit, sans préavis ni indemnité. Une déclaration unique d'embauche sera effectuée en temps utiles auprès de l'URSSAF compétente, sur laquelle le Salarié pourra exercer son droit d'accès et de rectification que lui confère la Loi du 6 janvier 1978.</p>
      <p><strong>Art. 2 :</strong> Le Salarié s'engage à respecter les accords collectifs et la réglementation en vigueur au sein de la Société, notamment le règlement intérieur et les consignes de sécurité mentionnées sur le lieu de travail. Le Salarié est tenu de se conformer strictement aux instructions de la Société ou de ses représentants en ce qui concerne le lieu, l'horaire, le programme et les conditions de travail. Toute absence sera sanctionnée par le non versement du salaire. Toute absence/interruption injustifiée, ou retard significatif pourra être constitutif d'une faute grave, pouvant engendrer la rupture anticipée du présent contrat au regard de l'article L.1243-1 du code du travail.</p>
      <p><strong>Art. 3 :</strong> Le Salarié s'engage à ne pas utiliser sa collaboration avec la Société à des fins de publicité personnelle ou commerciale sans autorisation préalable, et à respecter l'obligation de discrétion et de confidentialité qui s'y attache, y compris après la cessation du contrat.</p>
      <p><strong>Art. 4 :</strong> Le présent contrat est conclu sous réserve que le Salarié soit en possession des autorisations professionnelles nécessaires, d'une carte de contrôle médical à jour, et soit en règle vis-à-vis des différents organismes sociaux.</p>
      <p><strong>Art. 9 :</strong> Le Salarié autorise la Société à fixer, reproduire, représenter, éditer sa prestation, et ce sur tous supports et par tous modes d'exploitation connus ou inconnus à ce jour, en toutes versions, langues, intégralement ou en extraits. Le salaire versé couvre la cession de ses droits sur sa prestation pour toutes les utilisations exposées, sans réserve.</p>
      <p><strong>Art. 12 :</strong> Traitement des données personnelles du Salarié (Règlement Général sur le traitement des données personnelles n°2016/679). Les données personnelles du Salarié sont conservées pour une durée de 5 ans après la date de rupture du présent contrat. Le Salarié bénéficie d'un droit d'accès, de rectification, d'effacement, à la limitation du traitement et à la portabilité de ses données.</p>
      <p><strong>Art. 13 :</strong> Le présent contrat est soumis à la loi française. Toutes contestations relatives à l'exécution et l'interprétation du présent contrat devront être portées devant les tribunaux compétents.</p>
  `;
}

function ouvrirImpressionContrats(titre, corpsHtml) {
  const exemplaire = (label) => `
    <div class="exemplaire-tag">EXEMPLAIRE — ${esc(label)}</div>
    ${corpsHtml}
  `;
  const corpsAvecDeuxExemplaires = `${exemplaire("PRODUCTION")}<div class="contrat-suivant">${exemplaire("SALARIÉ (à conserver)")}</div>`;

  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>${esc(titre)}</title>
    <style>
      @page { margin: 15mm; }
      body{ font-family: Arial, sans-serif; font-size:10.5px; color:#111; line-height:1.35; }
      h1{ font-size:12px; text-align:center; margin:2px 0; }
      .entete{ font-size:9px; text-align:center; margin-bottom:8px; }
      .titre-contrat{ text-align:center; font-weight:bold; font-size:11px; margin:10px 0; }
      .exemplaire-tag{ text-align:right; font-size:9px; font-weight:bold; color:#666; border-bottom:1px solid #999; padding-bottom:3px; margin-bottom:6px; }
      table.infos{ width:100%; border-collapse:collapse; margin-bottom:8px; }
      table.infos td{ padding:2px 4px; vertical-align:top; }
      .label{ font-weight:bold; }
      .page-break{ page-break-before: always; }
      .contrat-suivant{ page-break-before: always; }
      p{ text-align:justify; margin:6px 0; }
      .signature-zone{ margin-top:20px; }
    </style>
    </head><body>${corpsAvecDeuxExemplaires}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

document.getElementById("btn-contrat-print").addEventListener("click", () => {
  const roleId = document.getElementById("contrat-personne-select").value;
  if (!roleId) { alert("Choisis une personne."); return; }
  const role = (state.contratRolesJour || []).find((r) => r.id === roleId);
  if (!role || !role.personne_id) { alert("Cette ligne n'est pas reliée à une fiche personne complète (nécessaire pour générer le contrat). Assigne une personne de la base dans le Dépouillement."); return; }
  const p = state.personnes.find((x) => x.id === role.personne_id);
  if (!p) { alert("Personne introuvable."); return; }
  const film = state.films.find((f) => f.id === state.currentFilmId);
  const jour = state.jours.find((j) => j.id === state.currentContratJourId);

  const lieuTournage = document.getElementById("c-lieu-tournage").value;
  const montantBrut = document.getElementById("c-montant-brut").value;
  const villeSignature = document.getElementById("c-ville-signature").value || lieuTournage;
  const dateAffichee = joursSemaineMoisFr(jour ? jour.date_tournage : "");

  const corps = genererContratBodyHtml(p, film, dateAffichee, lieuTournage, montantBrut, villeSignature);
  ouvrirImpressionContrats(`Lettre d'engagement - ${p.prenom} ${p.nom}`, corps);
});

document.getElementById("btn-contrats-tous").addEventListener("click", () => {
  const film = state.films.find((f) => f.id === state.currentFilmId);
  const jour = state.jours.find((j) => j.id === state.currentContratJourId);
  if (!jour) { alert("Choisis d'abord un jour de tournage."); return; }

  const lieuTournage = document.getElementById("c-lieu-tournage").value;
  const montantBrut = document.getElementById("c-montant-brut").value;
  const villeSignature = document.getElementById("c-ville-signature").value || lieuTournage;
  const dateAffichee = joursSemaineMoisFr(jour.date_tournage);

  const rolesAvecPersonne = (state.contratRolesJour || []).filter((r) => r.personne_id);
  if (!rolesAvecPersonne.length) { alert("Aucune personne du jour n'est reliée à une fiche complète. Assigne des personnes de la base dans le Dépouillement."); return; }

  state.contratsPretsAImprimer = rolesAvecPersonne.map((role) => {
    const p = state.personnes.find((x) => x.id === role.personne_id);
    return p ? { p, corps: genererContratBodyHtml(p, film, dateAffichee, lieuTournage, montantBrut, villeSignature) } : null;
  }).filter(Boolean);

  const container = document.getElementById("contrat-status");
  container.innerHTML = `
    <div style="margin-top:10px; margin-bottom:6px; color:var(--text);">${state.contratsPretsAImprimer.length} contrat(s) prêt(s) :</div>
    <button type="button" class="btn" id="btn-imprimer-tous-contrats" style="margin-bottom:10px;">Imprimer tous les contrats du jour (un par un)</button>
    <div class="doc-list">
      ${state.contratsPretsAImprimer.map((c, i) => `
        <div class="doc-item">
          <span style="flex:1;">${esc(c.p.prenom)} ${esc(c.p.nom)}</span>
          <button type="button" class="btn secondary" onclick="imprimerContratIndex(${i})">Imprimer</button>
        </div>
      `).join("")}
    </div>
  `;
  document.getElementById("btn-imprimer-tous-contrats").addEventListener("click", () => {
    state.contratsPretsAImprimer.forEach((c, i) => imprimerContratIndex(i));
  });
});

function imprimerContratIndex(i) {
  const c = (state.contratsPretsAImprimer || [])[i];
  if (!c) return;
  ouvrirImpressionContrats(`Lettre d'engagement - ${c.p.prenom} ${c.p.nom}`, c.corps);
}

// ==========================================================
// PRÉ-PAYE (type "Hot Cost" : récap présences/rémunérations par jour, groupé par type de rôle)
// ==========================================================
async function onPrepayeJourChange(jourId) {
  state.currentPrepayeJourId = jourId || null;
  const container = document.getElementById("prepaye-content");
  const status = document.getElementById("prepaye-status");
  if (!jourId) { container.innerHTML = `<div class="empty-state">Choisis un jour de tournage.</div>`; status.textContent = ""; return; }
  await renderPrepaye(jourId);
}

async function renderPrepaye(jourId) {
  const container = document.getElementById("prepaye-content");
  const status = document.getElementById("prepaye-status");
  const jour = state.jours.find((j) => j.id === jourId);
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];
  if (!list.length) { container.innerHTML = `<div class="empty-state">Aucun rôle casté pour ce jour.</div>`; status.textContent = ""; return; }

  const groupes = {};
  list.forEach((r) => {
    const cle = r.type_role || "autre";
    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push(r);
  });

  const roleLabels = Object.fromEntries(ROLE_TYPES.map((r) => [r.value, r.label]));

  function ligneHtml(r) {
    let nom = "", prenom = "", ville = "";
    if (r.personne_id) {
      const p = state.personnes.find((x) => x.id === r.personne_id);
      if (p) { nom = p.nom; prenom = p.prenom; ville = p.adresse || ""; }
    }
    if (!nom && !prenom) prenom = r.nom_personnage || "";
    return `
      <tr id="prepaye-row-${r.id}">
        <td><input type="text" class="prepaye-input" data-id="${r.id}" data-field="code_salarie" value="${esc(r.code_salarie)}" style="width:70px;"></td>
        <td>${esc(nom)}</td>
        <td>${esc(prenom)}</td>
        <td>${esc(r.nom_personnage)}</td>
        <td>${esc(ville)}</td>
        <td><input type="number" class="prepaye-input" data-id="${r.id}" data-field="cachet_brut" value="${r.cachet_brut ?? ""}" style="width:70px;"></td>
        <td><input type="time" class="prepaye-input" data-id="${r.id}" data-field="heure_debut" value="${r.heure_debut ? r.heure_debut.slice(0,5) : ""}"></td>
        <td><input type="time" class="prepaye-input" data-id="${r.id}" data-field="heure_fin" value="${r.heure_fin ? r.heure_fin.slice(0,5) : ""}"></td>
        <td><input type="number" step="0.01" class="prepaye-input" data-id="${r.id}" data-field="abattement" value="${r.abattement ?? ""}" style="width:60px;"></td>
      </tr>
    `;
  }

  let totalBrut = 0;
  list.forEach((r) => { totalBrut += Number(r.cachet_brut) || 0; });

  container.innerHTML = `
    <table class="role-table">
      <thead>
        <tr>
          <th>Code salarié</th><th>Nom</th><th>Prénom</th><th>Rôle</th><th>Ville de résidence</th>
          <th>Cachet (€)</th><th>Heure début</th><th>Heure fin</th><th>Abattement</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(groupes).map(([type, lignes]) => `
          <tr><td colspan="9" style="background:var(--surface-2); font-weight:700; color:var(--accent);">${esc(roleLabels[type] || type)}</td></tr>
          ${lignes.map(ligneHtml).join("")}
        `).join("")}
        <tr><td colspan="5" style="text-align:right; font-weight:700;">TOTAL TOUS POSTES</td><td style="font-weight:700;">${totalBrut.toFixed(2)} €</td><td colspan="3"></td></tr>
      </tbody>
    </table>
  `;
  status.textContent = `${list.length} personne(s) — ${jour ? jour.jour_tournage : ""}`;

  document.querySelectorAll(".prepaye-input").forEach((input) => {
    input.addEventListener("blur", async () => {
      const champ = input.dataset.field;
      const val = input.value === "" ? null : input.value;
      await sb.from("depouillement_roles").update({ [champ]: val }).eq("id", input.dataset.id);
      if (champ === "cachet_brut") renderPrepaye(jourId); // recalcule le total
    });
  });
}

document.getElementById("btn-prepaye-export").addEventListener("click", async () => {
  const jourId = state.currentPrepayeJourId;
  if (!jourId) { alert("Choisis d'abord un jour de tournage."); return; }
  const jour = state.jours.find((j) => j.id === jourId);
  const film = state.films.find((f) => f.id === state.currentFilmId);
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];
  const roleLabels = Object.fromEntries(ROLE_TYPES.map((r) => [r.value, r.label]));

  const lignesExport = [
    [film ? film.nom : "", "", "", "", "", "", "", "", ""],
    ["TABLEAU RECAPITULATIF DES INFORMATIONS ET PRESENCES DES ACTEURS DE COMPLEMENT", "", "", "", "", "", "", "", ""],
    [jour ? jour.jour_tournage : "", jour ? jour.date_tournage : "", "", "", "", "", "", "", ""],
    ["Code salarié", "Nom", "Prénom", "Rôle", "Ville de résidence", "Cachet", "Heure début", "Heure fin", "Abattement"],
  ];

  const groupes = {};
  list.forEach((r) => {
    const cle = r.type_role || "autre";
    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push(r);
  });

  Object.entries(groupes).forEach(([type, lignes]) => {
    lignesExport.push([roleLabels[type] || type, "", "", "", "", "", "", "", ""]);
    lignes.forEach((r) => {
      let nom = "", prenom = "", ville = "";
      if (r.personne_id) {
        const p = state.personnes.find((x) => x.id === r.personne_id);
        if (p) { nom = p.nom; prenom = p.prenom; ville = p.adresse || ""; }
      }
      if (!nom && !prenom) prenom = r.nom_personnage || "";
      lignesExport.push([
        r.code_salarie || "", nom, prenom, r.nom_personnage || "", ville,
        r.cachet_brut || "", r.heure_debut || "", r.heure_fin || "", r.abattement || "",
      ]);
    });
  });

  const totalBrut = list.reduce((acc, r) => acc + (Number(r.cachet_brut) || 0), 0);
  lignesExport.push(["TOTAL TOUS POSTES", "", "", "", "", totalBrut, "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(lignesExport);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pré-paye");
  XLSX.writeFile(wb, `Pre-paye_${jour ? jour.jour_tournage : "jour"}.xlsx`);
});

// ==========================================================
// RÉCAP ADMIN (infos contrat + salaire + RIB, pour la paye)
// ==========================================================
const COLONNES_RECAP_ADMIN = [
  "Nom", "Prénom", "Nom de jeune fille", "Date de naissance", "Lieu de naissance", "Nationalité",
  "Adresse fiscale", "Téléphone", "Email", "N° Sécurité Sociale", "Situation familiale", "Nb enfants à charge",
  "Centre Sécurité Sociale", "Personne à prévenir", "Rôle", "Cachet brut (€)", "IBAN", "BIC", "Titulaire du compte",
];

async function getLignesRecapAdmin(jourId) {
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];
  return list.map((r) => {
    const p = r.personne_id ? state.personnes.find((x) => x.id === r.personne_id) : null;
    return {
      role: r,
      personne: p,
      ligne: [
        p ? p.nom : "", p ? p.prenom : (r.nom_personnage || ""), p ? p.nom_jeune_fille : "",
        p ? p.date_naissance : "", p ? p.lieu_naissance : "", p ? p.nationalite : "",
        p ? p.adresse : "", p ? p.telephone : "", p ? p.email : "",
        p ? p.num_secu_sociale : "", p ? p.situation_familiale : "", p ? p.nb_enfants_charge : "",
        p ? p.centre_secu_sociale : "", p ? p.personne_a_prevenir : "",
        r.nom_personnage || "", r.cachet_brut || "",
        p ? p.iban : "", p ? p.bic : "", p ? p.titulaire_rib : "",
      ],
    };
  });
}

async function onRecapAdminJourChange(jourId) {
  state.currentRecapAdminJourId = jourId || null;
  const container = document.getElementById("recap-admin-content");
  const status = document.getElementById("recap-admin-status");
  if (!jourId) { container.innerHTML = `<div class="empty-state">Choisis un jour de tournage.</div>`; status.textContent = ""; return; }
  await renderRecapAdmin(jourId);
}

async function renderRecapAdmin(jourId) {
  const container = document.getElementById("recap-admin-content");
  const status = document.getElementById("recap-admin-status");
  const jour = state.jours.find((j) => j.id === jourId);
  const lignes = await getLignesRecapAdmin(jourId);
  if (!lignes.length) { container.innerHTML = `<div class="empty-state">Aucune personne castée pour ce jour.</div>`; status.textContent = ""; return; }

  const manquantes = lignes.filter((l) => !l.personne || !l.personne.iban).length;
  status.textContent = `${lignes.length} personne(s) — ${jour ? jour.jour_tournage : ""}. ${manquantes ? manquantes + " sans IBAN renseigné (à compléter dans leur fiche)." : "Tous les RIB sont renseignés."}`;

  container.innerHTML = `
    <table class="role-table">
      <thead><tr>${COLONNES_RECAP_ADMIN.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>
        ${lignes.map((l) => `<tr>${l.ligne.map((v, i) => `<td style="${i === 16 && !v ? "color:var(--red);" : ""}">${esc(v) || (i === 16 ? "manquant" : "")}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

document.getElementById("btn-recap-admin-export").addEventListener("click", async () => {
  const jourId = state.currentRecapAdminJourId;
  if (!jourId) { alert("Choisis d'abord un jour de tournage."); return; }
  const jour = state.jours.find((j) => j.id === jourId);
  const lignes = await getLignesRecapAdmin(jourId);
  if (!lignes.length) { alert("Aucune personne pour ce jour."); return; }

  const aoa = [COLONNES_RECAP_ADMIN, ...lignes.map((l) => l.ligne)];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Récap Admin");
  XLSX.writeFile(wb, `Recap_Admin_Paye_${jour ? jour.jour_tournage : "jour"}.xlsx`);
});

async function renderPresenceJour(jourId) {
  const container = document.getElementById("presence-content");
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];
  if (!list.length) { container.innerHTML = `<div class="empty-state">Aucun figurant casté pour ce jour (va dans "Dépouillement" pour en ajouter).</div>`; document.getElementById("presence-count").textContent = ""; return; }

  const enrichis = list.map((r) => {
    let nom = "", prenom = "", tel = "", photo = r.photo_url_snapshot;
    if (r.personne_id) {
      const p = state.personnes.find((x) => x.id === r.personne_id);
      if (p) { nom = p.nom; prenom = p.prenom; tel = p.telephone || ""; photo = photo || p.photo_url; }
    }
    if (!nom && !prenom) prenom = r.nom_personnage || "";
    return { ...r, nom, prenom, tel, photo };
  });

  const nbPresents = enrichis.filter((r) => r.present).length;
  document.getElementById("presence-count").textContent = `${nbPresents} / ${enrichis.length} marqué(s) présent(e)`;

  container.innerHTML = enrichis.map((r) => `
    <div class="person-card" id="presence-card-${r.id}" style="${r.present ? "outline:2px solid var(--green);" : ""}">
      <div class="photo" style="${r.photo ? `background-image:url('${esc(r.photo)}')` : ""}">${r.photo ? "" : ""}</div>
      <div class="info">
        <div class="name">${esc(prenomNomAffiche(r))}</div>
        <div class="meta">${esc(r.nom_personnage || "")}</div>
        <div class="meta">${r.tel ? "Tél : " + esc(r.tel) : ""}</div>
        <label style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:13px;">
          <input type="checkbox" class="presence-checkbox" data-id="${r.id}" ${r.present ? "checked" : ""}>
          Présent(e)
        </label>
      </div>
    </div>
  `).join("");

  document.querySelectorAll(".presence-checkbox").forEach((cb) => {
    cb.addEventListener("change", async () => {
      await sb.from("depouillement_roles").update({ present: cb.checked }).eq("id", cb.dataset.id);
      const card = document.getElementById("presence-card-" + cb.dataset.id);
      card.style.outline = cb.checked ? "2px solid var(--green)" : "";
      const total = document.querySelectorAll(".presence-checkbox").length;
      const presents = document.querySelectorAll(".presence-checkbox:checked").length;
      document.getElementById("presence-count").textContent = `${presents} / ${total} marqué(s) présent(e)`;
    });
  });
}

function prenomNomAffiche(r) {
  return `${r.prenom} ${r.nom}`.trim();
}

document.getElementById("btn-presence-print").addEventListener("click", () => {
  const jour = state.jours.find((j) => j.id === state.currentPresenceJourId);
  const win = window.open("", "_blank");
  const cartes = document.getElementById("presence-content").innerHTML;
  win.document.write(`
    <html><head><title>Présence figurants - ${esc(jour ? jour.jour_tournage : "")}</title>
    <style>
      body{ font-family: Arial, sans-serif; padding:20px; }
      h1{ font-size:20px; }
      .grid{ display:flex; flex-wrap:wrap; gap:14px; }
      .card{ width:140px; border:1px solid #ccc; border-radius:8px; padding:8px; text-align:center; }
      .card img, .card .ph{ width:100%; height:120px; object-fit:contain; background:#f2f2f2; border-radius:6px; }
      .name{ font-weight:bold; margin-top:6px; }
      .meta{ font-size:12px; color:#555; }
    </style>
    </head><body>
      <h1>Présence figurants — ${esc(jour ? jour.jour_tournage : "")}</h1>
      <div class="grid">
        ${document.querySelectorAll("#presence-content .person-card").length
          ? Array.from(document.querySelectorAll("#presence-content .person-card")).map((card) => {
              const name = card.querySelector(".name")?.textContent || "";
              const metas = Array.from(card.querySelectorAll(".meta")).map((m) => m.textContent).filter(Boolean);
              const bg = card.querySelector(".photo")?.style.backgroundImage || "";
              const urlMatch = bg.match(/url\(['"]?(.*?)['"]?\)/);
              const imgUrl = urlMatch ? urlMatch[1] : "";
              const checked = card.querySelector(".presence-checkbox")?.checked;
              return `<div class="card">${imgUrl ? `<img src="${imgUrl}">` : `<div class="ph"></div>`}<div class="name">${name}</div>${metas.map((m) => `<div class="meta">${m}</div>`).join("")}<div class="meta">${checked ? "☑ Présent(e)" : "☐ Présent(e)"}</div></div>`;
            }).join("")
          : ""}
      </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
});

document.getElementById("btn-presence-email").addEventListener("click", () => {
  const jour = state.jours.find((j) => j.id === state.currentPresenceJourId);
  if (!jour) { alert("Choisis d'abord un jour."); return; }
  const cards = Array.from(document.querySelectorAll("#presence-content .person-card"));
  const lignes = cards.map((card) => {
    const name = card.querySelector(".name")?.textContent || "";
    const metas = Array.from(card.querySelectorAll(".meta")).map((m) => m.textContent).filter(Boolean).join(" — ");
    return `${name}${metas ? " — " + metas : ""}`;
  });
  const body = `Liste des figurants — ${jour.jour_tournage}\n\n` + lignes.join("\n");
  window.location.href = `mailto:?subject=${encodeURIComponent("Figurants - " + jour.jour_tournage)}&body=${encodeURIComponent(body)}`;
});

document.getElementById("btn-presence-whatsapp").addEventListener("click", () => {
  const jour = state.jours.find((j) => j.id === state.currentPresenceJourId);
  if (!jour) { alert("Choisis d'abord un jour."); return; }
  const cards = Array.from(document.querySelectorAll("#presence-content .person-card"));
  const lignes = cards.map((card) => {
    const name = card.querySelector(".name")?.textContent || "";
    const metas = Array.from(card.querySelectorAll(".meta")).map((m) => m.textContent).filter(Boolean).join(" — ");
    return `${name}${metas ? " — " + metas : ""}`;
  });
  const text = `Liste des figurants — ${jour.jour_tournage}\n\n` + lignes.join("\n");
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
});

async function renderListeJour(jourId) {
  const container = document.getElementById("liste-jour-content");
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const list = roles || [];
  if (!list.length) { container.innerHTML = `<div class="empty-state">Aucune personne castée pour ce jour pour l'instant (va dans "Dépouillement" pour en ajouter).</div>`; return; }

  container.innerHTML = `
    <table class="hmc-table">
      <thead><tr><th>Nom</th><th>Prénom</th><th>Tél</th><th>Mail</th><th>Rôle</th><th>Notes</th></tr></thead>
      <tbody id="liste-jour-tbody">
        ${list.map((r) => {
          let nom = "", prenom = "", tel = "", mail = "";
          if (r.personne_id) {
            const p = state.personnes.find((x) => x.id === r.personne_id);
            if (p) { nom = p.nom; prenom = p.prenom; tel = p.telephone || ""; mail = p.email || ""; }
          }
          if (!nom && !prenom) prenom = r.nom_personnage || "";
          return `
          <tr id="liste-row-${r.id}">
            <td>${esc(nom)}</td>
            <td>${esc(prenom)}</td>
            <td>${esc(tel)}</td>
            <td>${esc(mail)}</td>
            <td>${esc(r.nom_personnage)}</td>
            <td><input type="text" class="liste-note-input" data-id="${r.id}" value="${esc(r.commentaire)}" placeholder="note libre..." style="width:100%; background:var(--surface-2); border:1px solid var(--border); color:var(--text); border-radius:6px; padding:5px 8px; font-size:13px;"></td>
          </tr>
        `;
        }).join("")}
      </tbody>
    </table>
  `;
  document.querySelectorAll(".liste-note-input").forEach((input) => {
    input.addEventListener("blur", async () => {
      await sb.from("depouillement_roles").update({ commentaire: input.value }).eq("id", input.dataset.id);
    });
  });
}

// ==========================================================
// GÉNÉRATION DES SÉQUENCES DU JOUR (dialogues) POUR LES COMÉDIENS
// ==========================================================
document.getElementById("btn-generer-sequences-jour").addEventListener("click", generateSequencesJourPdf);

async function generateSequencesJourPdf() {
  const jourId = document.getElementById("liste-jour-select").value;
  const status = document.getElementById("sequences-jour-status");
  if (!jourId) { status.textContent = "Choisis d'abord un jour de tournage."; return; }

  const jour = state.jours.find((j) => j.id === jourId);
  if (!jour || !jour.sequences) { status.textContent = "Ce jour n'a pas de séquences renseignées."; return; }

  status.innerHTML = `<span class="spinner"></span> Recherche du scénario et des séquences du jour...`;
  try {
    // Récupérer le document scénario du film en cours
    const { data: scenarioDocs } = await sb.from("film_documents").select("*").eq("film_id", state.currentFilmId).eq("type_document", "scenario").order("created_at", { ascending: false }).limit(1);
    const scenarioDoc = (scenarioDocs || [])[0];
    if (!scenarioDoc || !scenarioDoc.contenu_extrait) { status.textContent = "Aucun scénario importé pour ce film (onglet Pièces à déposer)."; return; }

    // Extraire les numéros de séquence du jour (ex "12, 15, 18" ou "SEQ 12 — décor ; SEQ 15...")
    const numerosJour = (jour.sequences.match(/\d+/g) || []);
    if (!numerosJour.length) { status.textContent = "Impossible de détecter des numéros de séquence dans le champ 'Séquences' de ce jour."; return; }

    const sequencesTrouvees = scenarioDoc.contenu_extrait.filter((s) => numerosJour.includes(String(s.numero).match(/\d+/)?.[0]));
    if (!sequencesTrouvees.length) { status.textContent = "Aucune séquence correspondante trouvée dans le scénario importé."; return; }

    const pagesManquantes = sequencesTrouvees.filter((s) => !s.page_debut);
    if (pagesManquantes.length === sequencesTrouvees.length) {
      status.textContent = "Le scénario importé ne contient pas les numéros de page (réimporte-le, la détection de page a été ajoutée récemment).";
      return;
    }

    status.innerHTML = `<span class="spinner"></span> Extraction des pages du scénario en cours...`;

    // Construire la liste unique des pages à extraire (0-indexées pour pdf-lib)
    let pagesSet = new Set();
    sequencesTrouvees.forEach((s) => {
      const debut = s.page_debut || s.page_fin;
      const fin = s.page_fin || s.page_debut;
      if (debut && fin) {
        for (let p = Number(debut); p <= Number(fin); p++) pagesSet.add(p - 1);
      }
    });
    const pagesIndices = Array.from(pagesSet).sort((a, b) => a - b);

    // Charger le PDF original et en extraire uniquement ces pages
    const existingPdfBytes = await fetch(scenarioDoc.fichier_url).then((r) => r.arrayBuffer());
    const srcDoc = await PDFLib.PDFDocument.load(existingPdfBytes);
    const newDoc = await PDFLib.PDFDocument.create();
    const validIndices = pagesIndices.filter((i) => i >= 0 && i < srcDoc.getPageCount());
    const copiedPages = await newDoc.copyPages(srcDoc, validIndices);
    copiedPages.forEach((p) => newDoc.addPage(p));
    const newPdfBytes = await newDoc.save();

    const blob = new Blob([newPdfBytes], { type: "application/pdf" });
    const file = new File([blob], `Sequences_${jour.jour_tournage}.pdf`, { type: "application/pdf" });
    const url = await uploadToStorage(file, "sequences-jour");

    status.innerHTML = `Séquences du jour ${esc(jour.jour_tournage)} générées (${validIndices.length} page(s)) — <a href="${url}" target="_blank" style="color:var(--accent);">voir le PDF</a>`;

    // Proposer l'envoi
    const container = document.getElementById("liste-jour-content");
    const shareBar = document.createElement("div");
    shareBar.style.cssText = "margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;";
    shareBar.innerHTML = `
      <button class="btn secondary" id="btn-seq-email">Envoyer par email</button>
      <button class="btn secondary" id="btn-seq-whatsapp">Envoyer par WhatsApp</button>
    `;
    container.prepend(shareBar);
    document.getElementById("btn-seq-email").addEventListener("click", () => {
      const subject = `Séquences du ${jour.jour_tournage} — à préparer`;
      const body = `Bonjour,\n\nVoici les séquences prévues pour le ${jour.jour_tournage} :\n${url}\n\nMerci de préparer vos dialogues avant le tournage.`;
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
    document.getElementById("btn-seq-whatsapp").addEventListener("click", () => {
      const text = `Séquences prévues pour le ${jour.jour_tournage} :\n${url}\n\nMerci de préparer vos dialogues avant le tournage.`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
    });
  } catch (err) {
    status.textContent = "Erreur : " + err.message;
  }
}

async function renderDepouillement(jourId) {
  const container = document.getElementById("depouillement-content");
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId).order("created_at");
  const jour = state.jours.find((j) => j.id === jourId);

  container.innerHTML = `
    <div style="margin-bottom:14px; color:var(--text-muted); font-size:13px;">
      ${jour && jour.sequences ? "Séquences du jour : " + esc(jour.sequences) : ""}
    </div>
    ${ROLE_TYPES.map((rt) => renderRoleSection(rt, (roles || []).filter((r) => r.type_role === rt.value))).join("")}
  `;
}

function renderRoleSection(roleType, roles) {
  return `
    <div class="role-section">
      <h3>${roleType.label} (${roles.length})</h3>
      <table class="role-table">
        <thead><tr><th></th><th>Nom du personnage</th><th>Séquence</th><th>Personne castée</th><th>Âge</th><th>Taille</th><th></th></tr></thead>
        <tbody>
          ${roles.map((r) => `
            <tr>
              <td>${r.photo_url_snapshot ? `<img class="thumb" src="${esc(r.photo_url_snapshot)}">` : `<div class="thumb"></div>`}</td>
              <td>${esc(r.nom_personnage)}</td>
              <td>${esc(r.sequence)}</td>
              <td>${r.personne_id ? esc(personneNom(r.personne_id)) : "<em>non assigné</em>"}</td>
              <td>${r.age_snapshot ?? ""}</td>
              <td>${r.taille_snapshot ? r.taille_snapshot + " cm" : ""}</td>
              <td><button class="btn-icon" onclick="deleteRole('${r.id}')">Supprimer</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <button class="btn secondary" style="margin-top:8px;" onclick="openRoleModal('${roleType.value}')">+ Ajouter un ${roleType.label.toLowerCase()}</button>
    </div>
  `;
}
function personneNom(id) {
  const p = state.personnes.find((x) => x.id === id);
  return p ? `${p.prenom} ${p.nom}` : "";
}

async function openRoleModal(typeRole) {
  if (!state.personnes.length) await loadPersonnes();
  openModal(`
    <span class="close-x" onclick="closeModal()">×</span>
    <h2>Ajouter — ${ROLE_TYPES.find((r) => r.value === typeRole).label}</h2>
    <div class="field-row">
      <div class="field"><label>Nom du personnage</label><input type="text" id="r-nom-personnage" placeholder="ex Passant n°3"></div>
      <div class="field"><label>Séquence(s)</label><input type="text" id="r-sequence" placeholder="ex SEQ 42"></div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Personne (base de données)</label>
        <select id="r-personne-select">
          <option value="">— Aucune / à définir manuellement —</option>
          ${state.personnes.map((p) => `<option value="${p.id}">${esc(p.prenom)} ${esc(p.nom)}${p.taille_cm ? " (" + p.taille_cm + "cm)" : ""}</option>`).join("")}
        </select>
      </div>
    </div>
    <fieldset>
      <legend>Si personne hors base (saisie manuelle)</legend>
      <div class="field-row">
        <div class="field"><label>Nom / prénom</label><input type="text" id="r-manuel-nom"></div>
        <div class="field"><label>Âge</label><input type="number" id="r-manuel-age"></div>
        <div class="field"><label>Taille (cm)</label><input type="number" id="r-manuel-taille"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Adresse</label><input type="text" id="r-manuel-adresse"></div>
        <div class="field"><label>Année de la photo</label><input type="number" id="r-manuel-annee"></div>
        <div class="field"><label>Photo</label><input type="file" id="r-manuel-photo" accept="image/*"></div>
      </div>
    </fieldset>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
      <button class="btn secondary" onclick="closeModal()">Annuler</button>
      <button class="btn" id="btn-save-role">Enregistrer</button>
    </div>
  `);
  document.getElementById("btn-save-role").addEventListener("click", () => saveRole(typeRole));
}

async function saveRole(typeRole) {
  const nom_personnage = document.getElementById("r-nom-personnage").value;
  const sequence = document.getElementById("r-sequence").value;
  const personneId = document.getElementById("r-personne-select").value || null;

  const record = {
    jour_id: state.currentDepouillementJourId,
    type_role: typeRole,
    nom_personnage, sequence,
    personne_id: personneId,
  };

  if (personneId) {
    const p = state.personnes.find((x) => x.id === personneId);
    record.photo_url_snapshot = p.photo_url; record.age_snapshot = p.age;
    record.taille_snapshot = p.taille_cm; record.adresse_snapshot = p.adresse; record.annee_photo_snapshot = p.photo_annee;
  } else {
    record.age_snapshot = document.getElementById("r-manuel-age").value || null;
    record.taille_snapshot = document.getElementById("r-manuel-taille").value || null;
    record.adresse_snapshot = document.getElementById("r-manuel-adresse").value || null;
    record.annee_photo_snapshot = document.getElementById("r-manuel-annee").value || null;
    if (!nom_personnage) record.nom_personnage = document.getElementById("r-manuel-nom").value;
    const photoFile = document.getElementById("r-manuel-photo").files[0];
    if (photoFile) record.photo_url_snapshot = await uploadToStorage(photoFile, "depouillement");
  }

  const { error } = await sb.from("depouillement_roles").insert(record);
  if (error) { alert(error.message); return; }
  closeModal();
  await renderDepouillement(state.currentDepouillementJourId);
}

async function deleteRole(roleId) {
  if (!confirm("Retirer ce rôle du dépouillement ?")) return;
  await sb.from("depouillement_roles").delete().eq("id", roleId);
  await renderDepouillement(state.currentDepouillementJourId);
}

// ==========================================================
// ONGLET HMC (Habillage / Maquillage / Coiffure) — temps réel
// ==========================================================
async function onHmcJourChange(jourId) {
  state.currentHmcJourId = jourId || null;
  if (state.hmcRealtimeChannel) { sb.removeChannel(state.hmcRealtimeChannel); state.hmcRealtimeChannel = null; }
  const container = document.getElementById("hmc-content");
  if (!jourId) { container.innerHTML = `<div class="empty-state">Choisis un jour de tournage.</div>`; return; }
  await renderHmc(jourId);
  subscribeHmcRealtime(jourId);
}

async function syncHmcFromDepouillement() {
  const jourId = state.currentHmcJourId;
  if (!jourId) { alert("Choisis d'abord un jour de tournage."); return; }
  const { data: roles } = await sb.from("depouillement_roles").select("*").eq("jour_id", jourId);
  const { data: existing } = await sb.from("hmc_checklist").select("role_id").eq("jour_id", jourId);
  const existingRoleIds = new Set((existing || []).map((e) => e.role_id));

  const toInsert = (roles || [])
    .filter((r) => !existingRoleIds.has(r.id))
    .map((r) => {
      let nom = "", prenom = "";
      if (r.personne_id) {
        const p = state.personnes.find((x) => x.id === r.personne_id);
        if (p) { nom = p.nom; prenom = p.prenom; }
      }
      if (!nom && !prenom) { prenom = r.nom_personnage || ""; nom = ""; }
      return { jour_id: jourId, role_id: r.id, nom, prenom };
    });

  if (toInsert.length) await sb.from("hmc_checklist").insert(toInsert);
  await renderHmc(jourId);
}
document.getElementById("btn-hmc-sync").addEventListener("click", syncHmcFromDepouillement);
document.getElementById("btn-hmc-share-link").addEventListener("click", () => {
  if (!state.currentHmcJourId) { alert("Choisis d'abord un jour de tournage."); return; }
  const url = `${window.location.origin}${window.location.pathname}?mode=hmc&jour=${state.currentHmcJourId}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("Lien copié dans le presse-papier.\n\nEnvoie-le aux assistants habillage/coiffure/maquillage — ils n'auront accès qu'à cette checklist, sans le reste de l'appli.\n\n" + url);
  }).catch(() => {
    prompt("Copie ce lien pour les assistants :", url);
  });
});

async function renderHmc(jourId) {
  const { data, error } = await sb.from("hmc_checklist").select("*").eq("jour_id", jourId).order("nom");
  if (error) { console.error(error); return; }
  renderHmcTable(data || []);
}

function renderHmcTable(rows) {
  const container = document.getElementById("hmc-content");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">Aucune personne dans la checklist. Clique sur "Synchroniser depuis le dépouillement".</div>`;
    return;
  }
  container.innerHTML = `
    <table class="hmc-table">
      <thead><tr><th>Nom</th><th>Prénom</th><th>Tél</th><th>N° costume</th><th>Habillage</th><th>Coiffure</th><th>Maquillage</th></tr></thead>
      <tbody id="hmc-tbody">
        ${rows.map((r) => renderHmcRow(r)).join("")}
      </tbody>
    </table>
  `;
  rows.forEach((r) => bindHmcRow(r.id));
}
function renderHmcRow(r) {
  const allDone = r.habillage_fait && r.coiffure_fait && r.maquillage_fait;
  return `
    <tr id="hmc-row-${r.id}" class="${allDone ? "hmc-done" : ""}">
      <td><input type="text" class="hmc-inline" data-field="nom" data-id="${r.id}" value="${esc(r.nom)}" style="background:none;border:none;color:inherit;width:100px;"></td>
      <td><input type="text" class="hmc-inline" data-field="prenom" data-id="${r.id}" value="${esc(r.prenom)}" style="background:none;border:none;color:inherit;width:100px;"></td>
      <td><input type="text" class="hmc-inline" data-field="telephone" data-id="${r.id}" value="${esc(r.telephone)}" style="background:none;border:none;color:inherit;width:110px;"></td>
      <td><input type="text" class="hmc-inline" data-field="numero_costume" data-id="${r.id}" value="${esc(r.numero_costume)}" style="background:none;border:none;color:inherit;width:70px;"></td>
      <td class="check-cell">
        <input type="checkbox" data-field="habillage_fait" data-id="${r.id}" ${r.habillage_fait ? "checked" : ""}><br>
        <input type="time" data-field="habillage_heure" data-id="${r.id}" value="${r.habillage_heure ? r.habillage_heure.slice(0,5) : ""}">
      </td>
      <td class="check-cell">
        <input type="checkbox" data-field="coiffure_fait" data-id="${r.id}" ${r.coiffure_fait ? "checked" : ""}><br>
        <input type="time" data-field="coiffure_heure" data-id="${r.id}" value="${r.coiffure_heure ? r.coiffure_heure.slice(0,5) : ""}">
      </td>
      <td class="check-cell">
        <input type="checkbox" data-field="maquillage_fait" data-id="${r.id}" ${r.maquillage_fait ? "checked" : ""}><br>
        <input type="time" data-field="maquillage_heure" data-id="${r.id}" value="${r.maquillage_heure ? r.maquillage_heure.slice(0,5) : ""}">
      </td>
    </tr>
  `;
}
function bindHmcRow(rowId) {
  const row = document.getElementById("hmc-row-" + rowId);
  if (!row) return;
  row.querySelectorAll("[data-field]").forEach((el) => {
    const eventName = el.type === "checkbox" ? "change" : el.type === "time" ? "change" : "blur";
    el.addEventListener(eventName, async () => {
      const field = el.dataset.field;
      const value = el.type === "checkbox" ? el.checked : (el.value || null);
      const update = { [field]: value, updated_at: new Date().toISOString() };
      await sb.from("hmc_checklist").update(update).eq("id", rowId);
    });
  });
}

function subscribeHmcRealtime(jourId) {
  state.hmcRealtimeChannel = sb
    .channel("hmc-" + jourId)
    .on("postgres_changes", { event: "*", schema: "public", table: "hmc_checklist", filter: `jour_id=eq.${jourId}` }, (payload) => {
      if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id === payload.new?.id) return;
      renderHmc(jourId);
    })
    .subscribe();
}

// ==========================================================
// MODE KIOSQUE HMC (accès restreint pour les assistants habillage/coiffure/maquillage)
// ==========================================================
function initKioskModeIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "hmc" && params.get("jour")) {
    document.body.classList.add("kiosk-active");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById("tab-depouillement").classList.add("active");
    document.querySelectorAll(".subtab-panel").forEach((p) => p.classList.remove("active"));
    document.getElementById("subtab-hmc").classList.add("active");
    const jourId = params.get("jour");
    state.currentHmcJourId = jourId;
    renderHmc(jourId);
    subscribeHmcRealtime(jourId);
    return true;
  }
  return false;
}

// ==========================================================
// INIT
// ==========================================================
(async function init() {
  await loadPersonnes();
  await loadFilms();
  await loadJours();
  initKioskModeIfNeeded();
})();
