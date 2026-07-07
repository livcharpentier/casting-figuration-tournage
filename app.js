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

// ==========================================================
// TAB NAVIGATION
// ==========================================================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "depouillement") loadJoursDropdown("depouillement-jour-select", onDepouillementJourChange);
    if (btn.dataset.tab === "hmc") loadJoursDropdown("hmc-jour-select", onHmcJourChange);
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
  const grid = document.getElementById("personnes-grid");
  let list = state.personnes;
  if (search) list = list.filter((p) => `${p.nom} ${p.prenom}`.toLowerCase().includes(search));
  if (typeFilter) list = list.filter((p) => p.type_personne === typeFilter);

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">🎬</div>Aucune personne trouvée.</div>`;
    return;
  }
  grid.innerHTML = list.map((p) => `
    <div class="person-card" onclick="openFicheModal('${p.id}')" style="position:relative;">
      <button class="btn-icon" title="Modifier" onclick="event.stopPropagation(); openPersonneModal('${p.id}')" style="position:absolute; top:6px; left:6px; background:rgba(0,0,0,.55); border-radius:6px; z-index:2;">✏️</button>
      <button class="btn-icon" title="Supprimer" onclick="event.stopPropagation(); quickDeletePersonne('${p.id}')" style="position:absolute; top:6px; right:6px; background:rgba(0,0,0,.55); border-radius:6px; z-index:2;">🗑</button>
      <div class="photo" style="${p.photo_url ? `background-image:url('${esc(p.photo_url)}')` : ""}">${p.photo_url ? "" : "👤"}</div>
      <div class="info">
        <div class="name">${esc(p.prenom)} ${esc(p.nom)}</div>
        <div class="meta">${p.taille_cm ? p.taille_cm + " cm" : ""} ${p.age ? "· " + p.age + " ans" : ""}</div>
        <span class="badge ${p.type_personne}">${p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien+Fig."}</span>
      </div>
    </div>
  `).join("");
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

  openModal(`
    <span class="close-x" onclick="closeModal()">✕</span>
    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px;">
      <div class="photo" style="width:140px; height:180px; border-radius:10px; flex-shrink:0; background-size:contain; background-repeat:no-repeat; background-position:center; background-color:var(--surface-2); ${p.photo_url ? `background-image:url('${esc(p.photo_url)}')` : ""}">${p.photo_url ? "" : "👤"}</div>
      <div style="flex:1; min-width:200px;">
        <h2 style="margin:0 0 6px;">${esc(p.prenom)} ${esc(p.nom)}</h2>
        <span class="badge ${p.type_personne}">${p.type_personne === "comedien" ? "Comédien" : p.type_personne === "figurant" ? "Figurant" : "Comédien+Fig."}</span>
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
          return `
          <div style="width:100px;">
            <a href="${esc(d.fichier_url)}" target="_blank" style="text-decoration:none; color:inherit;">
              <div style="width:100px; height:120px; border-radius:8px; background:var(--surface-2); background-image:url('${esc(d.fichier_url)}'); background-size:contain; background-repeat:no-repeat; background-position:center; ${isCurrent ? "outline:2px solid var(--accent);" : ""}"></div>
            </a>
            <div style="font-size:11px; color:var(--text-muted); text-align:center; margin-top:4px;">${CAT_PHOTO_LABELS[d.categorie_photo] || "Autre"}</div>
            ${isCurrent
              ? `<div style="font-size:10px; color:var(--accent); text-align:center; margin-top:2px;">★ Photo trombi actuelle</div>`
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
      <button class="btn secondary" id="btn-fiche-print">🖨 Imprimer</button>
      <button class="btn secondary" id="btn-fiche-email">✉️ Email</button>
      <button class="btn secondary" id="btn-fiche-whatsapp">💬 WhatsApp</button>
      <button class="btn secondary" onclick="closeModal()">Fermer</button>
      <button class="btn" onclick="closeModal(); openPersonneModal('${p.id}')">✏️ Modifier</button>
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
document.getElementById("btn-new-personne").addEventListener("click", () => openPersonneModal(null));

function personneFormFields(p = {}) {
  return `
  <div class="ai-extract-zone" id="ai-extract-zone">
    <p><strong>Extraction automatique</strong> — dépose en une fois la photo, le CV et/ou la démo reçus par mail (plusieurs fichiers possibles), ou colle le texte du mail, pour pré-remplir le formulaire et ranger chaque fichier au bon endroit.</p>
    <input type="file" id="ai-file-input" accept="image/*,.pdf,video/*" multiple style="margin-top:6px;">
    <div id="ai-file-list" style="font-size:12px; color:var(--text-muted); margin-top:6px;"></div>
    <div id="cv-preview-container" style="display:none; margin-top:10px;">
      <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">Aperçu du CV — clique-glisse sur la photo pour la sélectionner, puis clique "Utiliser cette zone comme photo" :</div>
      <div id="cv-preview-wrapper" style="position:relative; display:inline-block; border:1px solid var(--border); border-radius:8px; overflow:hidden; cursor:crosshair; max-width:100%;">
        <canvas id="cv-preview-canvas" style="display:block; max-width:100%;"></canvas>
        <div id="cv-crop-box" style="position:absolute; border:2px dashed var(--accent); background:rgba(232,185,74,.15); display:none; pointer-events:none;"></div>
      </div>
      <div style="margin-top:8px;">
        <button type="button" class="btn secondary" id="btn-use-crop">📷 Utiliser cette zone comme photo</button>
        <span id="cv-crop-status" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>
      </div>
    </div>
    <textarea id="ai-text-input" placeholder="Ou colle ici le texte du mail à analyser..."></textarea>
    <div style="margin-top:8px;">
      <button type="button" class="btn secondary" id="btn-ai-extract">✨ Analyser et pré-remplir</button>
      <span id="ai-extract-status" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>
    </div>
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
    </div>
    <div class="field-row">
      <div class="field"><label>Date de naissance</label><input type="date" id="f-date-naissance" value="${p.date_naissance || ""}"></div>
      <div class="field"><label>Âge</label><input type="number" id="f-age" value="${p.age ?? ""}"></div>
      <div class="field"><label>Photo (fichier)</label><input type="file" id="f-photo" accept="image/*"></div>
      <div class="field"><label>Année de la photo</label><input type="number" id="f-photo-annee" value="${p.photo_annee ?? ""}"></div>
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
    <span class="close-x" onclick="closeModal()">✕</span>
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
  document.getElementById("btn-ai-extract").addEventListener("click", runAiExtraction);

  // Glisser-déposer sur la zone d'extraction IA et sur le champ photo principal
  enableDragDrop(document.getElementById("ai-extract-zone"), document.getElementById("ai-file-input"), { append: true });
  document.getElementById("ai-file-input").addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    const names = files.map((f) => f.name);
    document.getElementById("ai-file-list").textContent = names.length ? "Fichiers sélectionnés : " + names.join(", ") : "";
    const pdfFile = files.find((f) => f.type === "application/pdf");
    if (pdfFile) previewPdfFirstPage(pdfFile);
    else document.getElementById("cv-preview-container").style.display = "none";
  });
  const photoField = document.getElementById("f-photo").closest(".field");
  photoField.style.border = "1px dashed var(--border)";
  photoField.style.borderRadius = "8px";
  photoField.style.padding = "6px 8px";
  enableDragDrop(photoField, document.getElementById("f-photo"));

  // Afficher/masquer la catégorie selon le type de document, et activer le glisser-déposer
  const docTypeSelect = document.getElementById("doc-type");
  const docCatWrapper = document.getElementById("doc-categorie-wrapper");
  function toggleDocCategorie() {
    docCatWrapper.style.display = docTypeSelect.value === "photo" ? "flex" : "none";
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
        status.textContent = "✓ Photo découpée reprise comme photo principale.";
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

async function runAiExtraction() {
  const fileInput = document.getElementById("ai-file-input");
  const textInput = document.getElementById("ai-text-input");
  const status = document.getElementById("ai-extract-status");
  const files = Array.from(fileInput.files || []);
  const texte = textInput.value.trim();

  if (!files.length && !texte) { status.textContent = "Ajoute au moins un fichier ou du texte."; return; }

  status.innerHTML = `<span class="spinner"></span> Analyse en cours...`;
  document.getElementById("ai-extract-results").style.display = "none";
  state.pendingDocsAfterSave = [];
  try {
    const images = []; // {data, mediaType}
    const pdfs = []; // {data}
    const nomsFichiers = [];
    let mainPhotoFile = null;

    const unreadableFiles = [];
    for (const file of files) {
      nomsFichiers.push(file.name);
      if (file.type.startsWith("image/")) {
        images.push({ data: await fileToBase64(file), mediaType: file.type });
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
    const json = await res.json();
    if (json.error) { status.textContent = "Erreur : " + json.error; return; }
    const d = json.extracted || {};
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== null && val !== undefined && val !== "") el.value = val; };
    setVal("f-prenom", d.prenom); setVal("f-nom", d.nom);
    setVal("f-date-naissance", d.date_naissance); setVal("f-age", d.age);
    setVal("f-taille", d.taille_cm); setVal("f-poids", d.poids_kg); setVal("f-pointure", d.pointure);
    setVal("f-tour-taille", d.tour_taille); setVal("f-tour-poitrine", d.tour_poitrine);
    setVal("f-yeux", d.couleur_yeux); setVal("f-cheveux", d.couleur_cheveux); setVal("f-morphologie", d.morphologie);
    setVal("f-tel", d.telephone); setVal("f-email", d.email); setVal("f-adresse", d.adresse);
    if (d.permis_conduire) document.getElementById("f-permis").checked = true;
    setVal("f-types-permis", d.types_permis); setVal("f-langues", d.langues);
    setVal("f-competences", d.competences_particulieres);
    setVal("f-metier", d.metier);
    setVal("f-showreel", d.lien_showreel); setVal("f-site", d.lien_site_web); setVal("f-agence", d.agence);
    setVal("f-instagram", d.lien_instagram); setVal("f-lien-agent", d.lien_agent);
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
    if (d.competences_particulieres) champsTrouves.push(`<strong>Compétences :</strong> ${esc(d.competences_particulieres)}`);
    if (d.experience_parcours) champsTrouves.push(`<strong>Expérience / parcours :</strong><br>${esc(d.experience_parcours).replace(/\n/g, "<br>")}`);
    if (d.notes) champsTrouves.push(`<strong>Autres notes :</strong> ${esc(d.notes)}`);
    if (state.pendingDocsAfterSave.length) {
      champsTrouves.push(`<strong>Fichiers mis de côté :</strong> ${state.pendingDocsAfterSave.map((x) => esc(x.file.name) + " (" + x.type_document + ")").join(", ")} — seront ajoutés aux documents après enregistrement.`);
    }
    if (unreadableFiles.length) {
      champsTrouves.push(`<span style="color:var(--red);">⚠ Format non lisible par l'IA :</span> ${unreadableFiles.map(esc).join(", ")} — seul le nom du fichier a pu être analysé. Convertis-le en PDF (Fichier → Exporter/Imprimer en PDF) pour que le contenu (théâtre, tournages, formations) soit vraiment lu.`);
    }
    if (champsTrouves.length) {
      resultsBox.style.display = "block";
      resultsBox.innerHTML = `<div style="color:var(--accent); font-weight:700; margin-bottom:6px;">Ce que l'IA a relevé :</div>` + champsTrouves.map((c) => `<div style="margin-bottom:6px;">${c}</div>`).join("");
    } else {
      resultsBox.style.display = "block";
      resultsBox.innerHTML = `<div style="color:var(--text-muted);">Aucune information exploitable trouvée. Vérifie le fichier ou complète manuellement.</div>`;
    }

    status.textContent = `✓ Champs pré-remplis${mainPhotoFile ? " (photo reprise automatiquement)" : ""}${nbExtra ? ` — ${nbExtra} fichier(s) en attente` : ""}. Vérifie ci-dessous et dans le formulaire avant d'enregistrer.`;
  } catch (e) {
    status.textContent = "Erreur : " + e.message;
  }
}

async function savePersonne() {
  const val = (id) => document.getElementById(id).value;
  const num = (id) => { const v = val(id); return v === "" ? null : Number(v); };

  const record = {
    prenom: val("f-prenom"), nom: val("f-nom"), type_personne: val("f-type"),
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
      if (resultsBox) resultsBox.innerHTML = `<div style="color:var(--green);">✓ Fiche créée. Tu peux maintenant ajouter d'autres photos (portrait, pied, véhicule...) ou documents dans la section "Documents" ci-dessous, puis cliquer "Fermer".</div>`;
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
      <span class="type-tag">${labels[d.type_document] || d.type_document}${d.type_document === "photo" && d.categorie_photo ? " · " + catLabels[d.categorie_photo] : ""}</span>
      <a href="${esc(d.fichier_url || d.lien_externe)}" target="_blank">${esc(d.libelle || d.fichier_url || d.lien_externe)}</a>
      <button class="btn-icon" onclick="deleteDocument('${d.id}', '${state.currentEditingPersonneId}')">🗑</button>
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
    try {
      let fichier_url = null;
      if (file) fichier_url = await uploadToStorage(file, type_document === "photo" ? "photos" : "documents");
      await sb.from("documents_personne").insert({ personne_id: personneId, type_document, categorie_photo, libelle, fichier_url, lien_externe: lien || null });
      document.getElementById("doc-libelle").value = "";
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
  const tailleMin = document.getElementById("tf-taille-min").value;
  const tailleMax = document.getElementById("tf-taille-max").value;
  const permis = document.getElementById("tf-permis").checked;
  const metier = document.getElementById("tf-metier").value.trim().toLowerCase();
  const competence = document.getElementById("tf-competence").value.trim().toLowerCase();
  const langue = document.getElementById("tf-langue").value.trim().toLowerCase();

  if (type) query = query.eq("type_personne", type);
  if (tailleMin) query = query.gte("taille_cm", Number(tailleMin));
  if (tailleMax) query = query.lte("taille_cm", Number(tailleMax));
  if (permis) query = query.eq("permis_conduire", true);

  const { data, error } = await query.order("nom");
  if (error) { alert(error.message); return; }
  let list = data || [];
  if (metier) list = list.filter((p) => (p.metier || "").toLowerCase().includes(metier));
  if (competence) list = list.filter((p) => (p.competences_particulieres || "").toLowerCase().includes(competence));
  if (langue) list = list.filter((p) => (p.langues || "").toLowerCase().includes(langue));

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
      <div class="photo" style="${photo ? `background-image:url('${esc(photo)}')` : ""}">${photo ? "" : "👤"}</div>
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
      <div class="photo" style="${d.fichier_url ? `background-image:url('${esc(d.fichier_url)}')` : ""}">${d.fichier_url ? "" : "🖼"}</div>
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
  document.getElementById("tf-taille-min").value = "";
  document.getElementById("tf-taille-max").value = "";
  document.getElementById("tf-permis").checked = false;
  document.getElementById("tf-metier").value = "";
  document.getElementById("tf-competence").value = "";
  document.getElementById("tf-langue").value = "";
  document.getElementById("trombi-results").innerHTML = "";
  document.getElementById("trombi-count").textContent = "";
});

// ==========================================================
// JOURS DE TOURNAGE (partagé Dépouillement / HMC)
// ==========================================================
async function loadJours() {
  const { data } = await sb.from("depouillement_jours").select("*").order("jour_tournage");
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
}

async function createNouveauJour() {
  const jour_tournage = prompt("Nom du jour de tournage (ex: J20)");
  if (!jour_tournage) return;
  const date_tournage = prompt("Date de tournage (AAAA-MM-JJ), optionnel") || null;
  const sequences = prompt("Séquences prévues ce jour (optionnel)") || null;
  const { error } = await sb.from("depouillement_jours").insert({ jour_tournage, date_tournage, sequences });
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
  if (!jourId) { container.innerHTML = `<div class="empty-state"><div class="big">🎬</div>Choisis ou crée un jour de tournage.</div>`; return; }
  await renderDepouillement(jourId);
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
              <td><button class="btn-icon" onclick="deleteRole('${r.id}')">🗑</button></td>
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
    <span class="close-x" onclick="closeModal()">✕</span>
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
  if (!jourId) { container.innerHTML = `<div class="empty-state"><div class="big">✂️</div>Choisis un jour de tournage.</div>`; return; }
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

async function renderHmc(jourId) {
  const { data, error } = await sb.from("hmc_checklist").select("*").eq("jour_id", jourId).order("nom");
  if (error) { console.error(error); return; }
  renderHmcTable(data || []);
}

function renderHmcTable(rows) {
  const container = document.getElementById("hmc-content");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state"><div class="big">✂️</div>Aucune personne dans la checklist. Clique sur "Synchroniser depuis le dépouillement".</div>`;
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
// INIT
// ==========================================================
(async function init() {
  await loadPersonnes();
  await loadJours();
})();
