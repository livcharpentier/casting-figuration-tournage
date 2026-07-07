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
  jours: [],
  currentDepouillementJourId: null,
  currentHmcJourId: null,
  hmcRealtimeChannel: null,
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
    <div class="person-card" onclick="openPersonneModal('${p.id}')" style="position:relative;">
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
    <p><strong>Extraction automatique</strong> — dépose une capture d'écran, un CV/photo, ou colle un texte (mail, fiche) pour pré-remplir le formulaire.</p>
    <input type="file" id="ai-file-input" accept="image/*,.pdf" style="margin-top:6px;">
    <textarea id="ai-text-input" placeholder="Ou colle ici un texte / mail à analyser..."></textarea>
    <div style="margin-top:8px;">
      <button type="button" class="btn secondary" id="btn-ai-extract">✨ Analyser et pré-remplir</button>
      <span id="ai-extract-status" style="font-size:12px; color:var(--text-muted); margin-left:8px;"></span>
    </div>
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
      <div class="field"><label>Compétences particulières</label><input type="text" id="f-competences" value="${esc(p.competences_particulieres)}" placeholder="danse, chant, sport, cascade..."></div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Contenu professionnel</legend>
    <div class="field-row">
      <div class="field"><label>Lien showreel / YouTube</label><input type="text" id="f-showreel" value="${esc(p.lien_showreel)}"></div>
      <div class="field"><label>Site web</label><input type="text" id="f-site" value="${esc(p.lien_site_web)}"></div>
      <div class="field"><label>Agence</label><input type="text" id="f-agence" value="${esc(p.agence)}"></div>
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
        <button type="button" class="btn secondary" onclick="closeModal()">Annuler</button>
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
  enableDragDrop(document.getElementById("ai-extract-zone"), document.getElementById("ai-file-input"));
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

function enableDragDrop(zoneEl, fileInputEl) {
  if (!zoneEl || !fileInputEl) return;
  ["dragenter", "dragover"].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zoneEl.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    zoneEl.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); zoneEl.classList.remove("dragover"); })
  );
  zoneEl.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      fileInputEl.files = e.dataTransfer.files;
      fileInputEl.dispatchEvent(new Event("change"));
    }
  });
}

async function runAiExtraction() {
  const fileInput = document.getElementById("ai-file-input");
  const textInput = document.getElementById("ai-text-input");
  const status = document.getElementById("ai-extract-status");
  const file = fileInput.files[0];
  const texte = textInput.value.trim();

  if (!file && !texte) { status.textContent = "Ajoute un fichier ou du texte."; return; }

  status.innerHTML = `<span class="spinner"></span> Analyse en cours...`;
  try {
    const payload = { texte: texte || undefined };
    if (file) {
      payload.nomFichier = file.name;
      if (file.type.startsWith("image/")) {
        payload.imageBase64 = await fileToBase64(file);
        payload.imageMediaType = file.type;
      } else if (file.type === "application/pdf") {
        payload.pdfBase64 = await fileToBase64(file);
      }
    }
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
    setVal("f-showreel", d.lien_showreel); setVal("f-site", d.lien_site_web); setVal("f-agence", d.agence);
    setVal("f-notes", d.notes);
    // Reprendre automatiquement la photo utilisée pour l'analyse comme photo principale
    if (file && file.type.startsWith("image/")) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById("f-photo").files = dt.files;
      } catch (e2) { /* navigateur trop ancien, tant pis */ }
    }

    status.textContent = "✓ Champs pré-remplis (photo reprise automatiquement), vérifie avant d'enregistrer.";
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
    langues: val("f-langues"), competences_particulieres: val("f-competences"),
    lien_showreel: val("f-showreel"), lien_site_web: val("f-site"), agence: val("f-agence"),
    photo_annee: num("f-photo-annee"), notes: val("f-notes"),
    updated_at: new Date().toISOString(),
  };

  if (!record.prenom || !record.nom) { alert("Le nom et le prénom sont obligatoires."); return; }

  const photoFile = document.getElementById("f-photo").files[0];

  let personneId = state.currentEditingPersonneId;
  try {
    if (photoFile) record.photo_url = await uploadToStorage(photoFile, "photos");

    if (personneId) {
      const { error } = await sb.from("personnes").update(record).eq("id", personneId);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from("personnes").insert(record).select().single();
      if (error) throw error;
      personneId = data.id;
    }
    closeModal();
    await loadPersonnes();
  } catch (e) {
    alert("Erreur lors de l'enregistrement : " + e.message);
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
  const competence = document.getElementById("tf-competence").value.trim().toLowerCase();
  const langue = document.getElementById("tf-langue").value.trim().toLowerCase();

  if (type) query = query.eq("type_personne", type);
  if (tailleMin) query = query.gte("taille_cm", Number(tailleMin));
  if (tailleMax) query = query.lte("taille_cm", Number(tailleMax));
  if (permis) query = query.eq("permis_conduire", true);

  const { data, error } = await query.order("nom");
  if (error) { alert(error.message); return; }
  let list = data || [];
  if (competence) list = list.filter((p) => (p.competences_particulieres || "").toLowerCase().includes(competence));
  if (langue) list = list.filter((p) => (p.langues || "").toLowerCase().includes(langue));

  document.getElementById("trombi-count").textContent = `${list.length} personne(s) correspondent aux critères.`;
  const grid = document.getElementById("trombi-results");
  if (!list.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Aucun résultat pour ces critères.</div>`; return; }
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
  if (!list.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Aucune photo dans cette catégorie pour l'instant. Ajoute des photos "${PLANCHE_LABELS[categorie] || categorie}" depuis la fiche d'une personne.</div>`; return; }
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
document.getElementById("btn-trombi-reset").addEventListener("click", () => {
  document.getElementById("tf-planche").value = "portraits";
  document.getElementById("tf-type-wrapper").style.display = "flex";
  document.getElementById("tf-type").value = "";
  document.getElementById("tf-taille-min").value = "";
  document.getElementById("tf-taille-max").value = "";
  document.getElementById("tf-permis").checked = false;
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
