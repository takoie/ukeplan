const { ipcRenderer } = require('electron');
const path = require('path');
const API_URL = 'http://127.0.0.1:5000/api';

// --- FIKS FOR LOGO I PRODUKSJON ---
function fixLogoPath() {
    const logoImg = document.querySelector('.sidebar-logo');
    const aboutLogo = document.querySelector('#modal-om img');
    let logoPath;
    if (process.resourcesPath) {
        logoPath = path.join(process.resourcesPath, 'logo.png');
    } else {
        logoPath = 'logo.png';
    }
    if (logoImg) logoImg.src = logoPath;
    if (aboutLogo) aboutLogo.src = logoPath;
}
window.addEventListener('DOMContentLoaded', fixLogoPath);

// --- Window Controls ---
document.getElementById('min-btn').addEventListener('click', () => ipcRenderer.send('app:minimize'));
document.getElementById('max-btn').addEventListener('click', () => ipcRenderer.send('app:maximize'));
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('app:close'));

// --- Quill Setup ---
const toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'color': [] }, { 'background': [] }],
    ['clean']
];
const quillOptions = {
    theme: 'snow',
    modules: { toolbar: toolbarOptions },
    spellcheck: false 
};

const quillAkt = new Quill('#editor-aktivitet', quillOptions);
const quillKrav = new Quill('#editor-krav', quillOptions);

quillAkt.root.setAttribute('spellcheck', 'false');
quillKrav.root.setAttribute('spellcheck', 'false');

// --- EMOJI INJECTION ---
function setupEmojiPicker(quill) {
    const toolbar = quill.getModule('toolbar').container;
    const emojiSelect = document.createElement('select');
    emojiSelect.className = 'custom-emoji-select';
    
    const defaultOpt = document.createElement('option');
    defaultOpt.text = "😊";
    defaultOpt.disabled = true;
    defaultOpt.selected = true;
    emojiSelect.appendChild(defaultOpt);

    const emojis = ["✅", "⚠️", "📅", "😊", "👍", "👎", "⭐", "❗", "❓", "🔥", "🎉", "📝", "🔴", "🟢", "🔵"];
    emojis.forEach(emoji => {
        const opt = document.createElement('option');
        opt.value = emoji;
        opt.text = emoji;
        emojiSelect.appendChild(opt);
    });
    emojiSelect.onchange = function() {
        const val = this.value;
        const range = quill.getSelection(true);
        quill.insertText(range.index, val);
        this.selectedIndex = 0; 
    };
    toolbar.appendChild(emojiSelect);
}
setupEmojiPicker(quillAkt);
setupEmojiPicker(quillKrav);

// --- State ---
let currentFagData = [];
const dagerListe = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];

// --- MENU TOGGLE (DRAWER ANIMATION) ---
document.getElementById('menu-archive-toggle').addEventListener('click', function() {
    this.classList.toggle('menu-open');
    document.getElementById('archive-submenu').classList.toggle('open');
});

// --- View Switcher ---
window.switchView = function(viewName) {
    // Fjern active fra alle hovedmenypunkter
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    // Fjern active fra undermeny-punkter
    document.querySelectorAll('.submenu-item').forEach(el => el.classList.remove('active'));

    // Aktiver riktig knapp
    if (viewName === 'editor') document.getElementById('menu-editor').classList.add('active');
    if (viewName === 'preview') document.getElementById('menu-preview').classList.add('active');
    if (viewName === 'settings') document.getElementById('menu-settings').classList.add('active');
    
    // For undermeny-valg
    if (viewName === 'search') {
        document.getElementById('menu-search').classList.add('active');
        document.getElementById('menu-archive-toggle').classList.add('active'); // Parent også aktiv
        loadSearchDropdown();
    }
    if (viewName === 'timeline') {
        document.getElementById('menu-timeline').classList.add('active');
        document.getElementById('menu-archive-toggle').classList.add('active'); // Parent også aktiv
        loadTimelineDropdown();
    }

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');

    if (viewName === 'preview') loadPreviewDropdown();
    if (viewName === 'settings') loadSettings();
};
const firstMenu = document.querySelector('.menu-item');
if(firstMenu) firstMenu.classList.add('active');


// --- Modal Logic ---
const modalSistUke = document.getElementById("modal-sist-uke");
const modalOm = document.getElementById("modal-om");
const closeBtns = document.querySelectorAll(".close-modal");
closeBtns.forEach(btn => {
    btn.onclick = function() {
        modalSistUke.style.display = "none";
        modalOm.style.display = "none";
    }
});
window.onclick = function(event) {
    if (event.target == modalSistUke) modalSistUke.style.display = "none";
    if (event.target == modalOm) modalOm.style.display = "none";
}
document.getElementById('about-btn').addEventListener('click', () => modalOm.style.display = "block");

// GENERELL FUNKSJON FOR Å VISE MODAL MED PLAN (FIXED LAYOUT)
function visModalMedPlan(data) {
    const container = document.getElementById('prev-week-content');
    modalSistUke.style.display = "block";
    
    if (data) {
        document.getElementById('prev-week-num').textContent = data.uke || data.visningsUke;
        // OPPDATERT: Bruker prev-content klassen for styling av innholdet
        container.innerHTML = `
            <div class="prev-week-grid">
                <div class="prev-col">
                    <div class="prev-header" style="color: #faa61a; border-color: #faa61a;">TEMA</div>
                    <div class="prev-content">${data.tema || '-'}</div>
                </div>
                <div class="prev-col">
                    <div class="prev-header" style="color: #3ba55c; border-color: #3ba55c;">AKTIVITETER</div>
                    <div class="prev-content">${data.aktivitet || '-'}</div>
                </div>
                <div class="prev-col">
                    <div class="prev-header" style="color: #e67e22; border-color: #e67e22;">ARBEIDSKRAV</div>
                    <div class="prev-content">${data.arbeidskrav || '-'}</div>
                </div>
            </div>
        `;
    } else {
        document.getElementById('prev-week-num').textContent = "Ingen data";
        container.innerHTML = "<p style='color: white; padding: 20px;'>Fant ingen plan.</p>";
    }
}


// "SIST UKE?" KNAPPEN
document.getElementById('sist-uke-btn').addEventListener('click', async () => {
    const uke = document.getElementById('uke-input').value;
    const aar = document.getElementById('aar-input').value;
    const fag = document.getElementById('fag-select').value;
    const container = document.getElementById('prev-week-content');
    container.innerHTML = "<p style='color:white'>Laster...</p>";
    modalSistUke.style.display = "block";

    try {
        const res = await fetch(`${API_URL}/plan/forrige?uke=${uke}&år=${aar}&fag=${fag}`);
        const data = await res.json();
        visModalMedPlan(data);
    } catch(e) { container.innerHTML = "<p style='color: red;'>Feil ved henting.</p>"; }
});

// --- Date & Navigation ---
function updateWeekDisplay(newWeek) {
    if (newWeek < 1) newWeek = 52;
    if (newWeek > 53) newWeek = 1;
    document.getElementById('uke-input').value = newWeek;
    document.getElementById('uke-display').textContent = newWeek;
    const nowWeek = getRealWeek();
    const label = document.getElementById('uke-label');
    if(newWeek === nowWeek) label.textContent = "Denne uken";
    else if(newWeek === nowWeek + 1) label.textContent = "Neste uke";
    else label.textContent = "Valgt uke";
    loadPlan();
}
function getRealWeek() {
    const today = new Date();
    const date = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
    return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}
function initDate() {
    const today = new Date();
    const nextWeek = getRealWeek() + 1;
    document.getElementById('uke-display').textContent = nextWeek;
    document.getElementById('uke-input').value = nextWeek;
    document.getElementById('aar-input').value = today.getFullYear();
    document.getElementById('uke-label').textContent = "Neste uke";
}
document.getElementById('prev-week-nav').addEventListener('click', () => {
    let current = parseInt(document.getElementById('uke-input').value);
    updateWeekDisplay(current - 1);
});
document.getElementById('next-week-nav').addEventListener('click', () => {
    let current = parseInt(document.getElementById('uke-input').value);
    updateWeekDisplay(current + 1);
});

// --- Data Loading & Quill Format Fix ---

// HJELPEFUNKSJON: Setter inn tekst slik at overskriften er bold, men resten normalt
function settInnFagDager(quill, dager, labelPrefix = "") {
    quill.setContents([]); // Tøm først
    
    dager.forEach(dag => {
        // 1. Sett inn "Mandag:" i BOLD
        quill.insertText(quill.getLength() - 1, labelPrefix + dag + ":", { 'bold': true });
        
        // 2. Sett inn linjeskift UTEN formatering (viktig!)
        quill.insertText(quill.getLength() - 1, "\n", { 'bold': false });
        
        // 3. Sett inn et ekstra linjeskift for mellomrom
        quill.insertText(quill.getLength() - 1, "\n", { 'bold': false });
    });
}

async function loadSubjects() {
    try {
        const res = await fetch(`${API_URL}/fag`);
        if (!res.ok) throw new Error("Kunne ikke hente fag");
        currentFagData = await res.json();
        const select = document.getElementById('fag-select');
        const oldVal = select.value;
        select.innerHTML = '';
        currentFagData.forEach(fag => {
            const opt = document.createElement('option');
            opt.value = fag.navn;
            opt.textContent = fag.navn;
            select.appendChild(opt);
        });
        if (oldVal && currentFagData.find(f => f.navn === oldVal)) select.value = oldVal;
        else if (currentFagData.length > 0) select.value = currentFagData[0].navn;
        loadPlan();
    } catch (e) { console.error(e); }
}

async function loadPlan() {
    const uke = document.getElementById('uke-input').value;
    const aar = document.getElementById('aar-input').value;
    const fagNavn = document.getElementById('fag-select').value;
    if(!fagNavn) return;
    try {
        const res = await fetch(`${API_URL}/plan?uke=${uke}&år=${aar}&fag=${fagNavn}`);
        const data = await res.json();
        document.getElementById('tema-input').value = data ? data.tema : '';
        
        if (data && data.aktivitet) {
            quillAkt.root.innerHTML = data.aktivitet;
        } else {
            // BRUK NY METODE FOR BOLD-FIX
            const fag = currentFagData.find(f => f.navn === fagNavn);
            if (fag && fag.dager) {
                settInnFagDager(quillAkt, fag.dager);
            } else {
                quillAkt.setContents([]);
            }
        }

        if (data && data.arbeidskrav) {
            quillKrav.root.innerHTML = data.arbeidskrav;
        } else {
            // BRUK NY METODE FOR BOLD-FIX
            const fag = currentFagData.find(f => f.navn === fagNavn);
            if (fag && fag.leksedager) {
                settInnFagDager(quillKrav, fag.leksedager, "Lekse til "); // legger til "lekse til " foran dagen
            } else {
                quillKrav.setContents([]);
            }
        }
    } catch (e) { console.error(e); }
}

document.getElementById('lagre-btn').addEventListener('click', async () => {
    const btn = document.getElementById('lagre-btn');
    const originalText = btn.innerHTML;
    btn.textContent = "Lagrer...";
    btn.disabled = true;
    try {
        const payload = {
            uke: document.getElementById('uke-input').value,
            år: document.getElementById('aar-input').value,
            fag: document.getElementById('fag-select').value,
            tema: document.getElementById('tema-input').value,
            aktivitet: quillAkt.root.innerHTML,
            arbeidskrav: quillKrav.root.innerHTML
        };
        const res = await fetch(`${API_URL}/lagre`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if(!res.ok) throw new Error("Server error");
        const status = document.getElementById('status-msg');
        status.textContent = "Lagret!";
        setTimeout(() => status.textContent = "", 2000);
    } catch (e) { alert("Kunne ikke lagre planen."); } 
    finally { btn.innerHTML = originalText; btn.disabled = false; }
});
document.getElementById('fag-select').addEventListener('change', loadPlan);

// --- SETTINGS LOGIC ---
function createDaySelector(containerId, selectedDays, cssClass) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    dagerListe.forEach(dag => {
        const div = document.createElement('div');
        div.className = `day-toggle ${selectedDays.includes(dag) ? cssClass : ''}`;
        div.textContent = dag;
        div.onclick = () => div.classList.toggle(cssClass);
        container.appendChild(div);
    });
}
function getSelectedDays(containerId, cssClass) {
    const container = document.getElementById(containerId);
    const selected = [];
    container.querySelectorAll(`.${cssClass}`).forEach(el => selected.push(el.textContent));
    return selected;
}
async function loadSettings() {
    const tbody = document.getElementById('settings-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Laster...</td></tr>';
    document.getElementById('setting-fag-navn').value = '';
    createDaySelector('undervisning-selector', [], 'selected');
    createDaySelector('lekse-selector', [], 'selected-homework');
    document.getElementById('slett-fag-btn').style.display = 'none';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    document.getElementById('save-subject-btn').textContent = 'Lagre fag';
    await loadSubjects(); 
    tbody.innerHTML = '';
    currentFagData.forEach(fag => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${fag.navn}</td><td>${fag.dager.join(', ')}</td><td>${(fag.leksedager || []).join(', ')}</td><td><button class="btn btn-small btn-primary" onclick="editSubject('${fag.navn}')">Endre</button></td>`;
        tbody.appendChild(tr);
    });
}
window.editSubject = function(navn) {
    const fag = currentFagData.find(f => f.navn === navn);
    document.getElementById('setting-fag-navn').value = fag.navn;
    createDaySelector('undervisning-selector', fag.dager, 'selected');
    createDaySelector('lekse-selector', fag.leksedager || [], 'selected-homework');
    document.getElementById('slett-fag-btn').style.display = 'inline-block';
    document.getElementById('slett-fag-btn').onclick = () => deleteSubject(navn);
    document.getElementById('cancel-edit-btn').style.display = 'inline-block';
    document.getElementById('save-subject-btn').textContent = 'Oppdater fag';
};
document.getElementById('cancel-edit-btn').addEventListener('click', loadSettings);

document.getElementById('save-subject-btn').addEventListener('click', async () => {
    const navn = document.getElementById('setting-fag-navn').value;
    if(!navn) return;
    const dager = getSelectedDays('undervisning-selector', 'selected');
    const leksedager = getSelectedDays('lekse-selector', 'selected-homework');
    const btn = document.getElementById('save-subject-btn');
    const originalText = btn.textContent;
    btn.textContent = "Lagrer...";
    btn.disabled = true;
    try {
        const res = await fetch(`${API_URL}/fag`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ navn, dager, leksedager }) });
        if (!res.ok) throw new Error("Feil ved lagring");
        await loadSettings();
        const statusSpan = document.getElementById('settings-status');
        if(statusSpan) { statusSpan.textContent = "Lagret!"; setTimeout(() => statusSpan.textContent = "", 2000); }
    } catch (e) { console.error(e); } 
    finally { btn.disabled = false; btn.textContent = originalText === "Oppdater fag" ? "Oppdater fag" : "Lagre fag"; }
});

window.deleteSubject = async function(navn) {
    try { 
        await fetch(`${API_URL}/fag/slett`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ navn }) }); 
        await loadSettings(); 
        const statusSpan = document.getElementById('settings-status');
        if(statusSpan) { statusSpan.textContent = "Fag slettet."; setTimeout(() => statusSpan.textContent = "", 2000); }
    } catch(e) { console.error("Feil ved sletting."); }
};

// --- PREVIEW ---
async function loadPreviewDropdown() {
    const select = document.getElementById('preview-fag-select');
    select.innerHTML = '';
    currentFagData.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = fag.navn; select.appendChild(opt); });
    const editorFag = document.getElementById('fag-select').value;
    if (editorFag) select.value = editorFag;
    renderPreview('preview-container');
}
document.getElementById('oppdater-preview-btn').addEventListener('click', () => renderPreview('preview-container'));

// OPPDATERT: Fjernet årstall i parentes
async function renderPreview(containerId, data = null) {
    // Hvis ingen data sendes inn, hent fra hovedvelgerne
    if (!data) {
        const uke = document.getElementById('uke-input').value;
        const aar = document.getElementById('aar-input').value;
        const fagNavn = document.getElementById('preview-fag-select').value;
        try { 
            const res = await fetch(`${API_URL}/plan?uke=${uke}&år=${aar}&fag=${fagNavn}`); 
            data = await res.json(); 
        } catch(e) { return; }
    }

    const container = document.getElementById(containerId);
    if (!data) {
        container.innerHTML = '<p style="padding:20px; color: white;">Ingen plan funnet.</p>';
        return;
    }
    
    // ENDRING HER: Fjernet ${data.år}
    const card = `
        <div class="preview-card">
            <div class="preview-header">
                <span>${data.fag}</span><span>UKE ${data.uke}</span>
            </div>
            <div class="preview-grid">
                <div class="preview-section" style="border-left: 5px solid #faa61a;">
                    <span class="preview-h" style="color: #faa61a;">TEMA</span>
                    <p>${data.tema || '-'}</p>
                </div>
                <div class="preview-section" style="border-left: 5px solid #3ba55c;">
                    <span class="preview-h" style="color: #3ba55c;">AKTIVITETER</span>
                    <div style="white-space: pre-wrap;">${data.aktivitet || '-'}</div>
                </div>
                <div class="preview-section" style="border-left: 5px solid #e67e22;">
                    <span class="preview-h" style="color: #e67e22;">ARBEIDSKRAV</span>
                    <div style="white-space: pre-wrap;">${data.arbeidskrav || '-'}</div>
                </div>
            </div>
        </div>`;

    if (containerId === 'sok-resultat-container') {
        container.innerHTML += card;
    } else {
        container.innerHTML = card;
    }
}
document.getElementById('kopier-bilde-btn').addEventListener('click', () => {
    const captureArea = document.getElementById('preview-capture-area');
    const status = document.getElementById('bilde-status');
    status.textContent = "Genererer...";
    html2canvas(captureArea, { scale: 3, backgroundColor: null, logging: false, useCORS: true }).then(canvas => {
        canvas.toBlob(blob => { navigator.clipboard.write([new ClipboardItem({'image/png': blob})]).then(() => { status.textContent = "Kopiert!"; setTimeout(() => status.textContent = "", 3000); }).catch(err => status.textContent = "Feil."); });
    });
});


// --- SØK FUNKSJONALITET ---
async function loadSearchDropdown() {
    const select = document.getElementById('sok-fag');
    select.innerHTML = '';
    currentFagData.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = fag.navn; select.appendChild(opt); });
    // Sett default til det som er valgt i editor
    select.value = document.getElementById('fag-select').value;
}

window.utforSok = async function() {
    const fag = document.getElementById('sok-fag').value;
    const tekst = document.getElementById('sok-tekst').value;
    const container = document.getElementById('sok-resultat-container');
    
    container.innerHTML = '<p style="color:white; padding:10px;">Søker...</p>';
    
    try {
        const res = await fetch(`${API_URL}/sok?fag=${fag}&q=${tekst}`);
        const resultater = await res.json();
        
        container.innerHTML = ''; // Tøm "Søker..."
        
        if (resultater.length === 0) {
            container.innerHTML = '<p style="color:white; padding:10px;">Ingen treff funnet.</p>';
            return;
        }

        // Loop gjennom resultatene og lag kort for hver
        resultater.forEach(data => {
            renderPreview('sok-resultat-container', data);
        });

    } catch(e) {
        container.innerHTML = '<p style="color:red; padding:10px;">Feil under søk.</p>';
    }
};

// --- TIDSLINJE FUNKSJONALITET ---
async function loadTimelineDropdown() {
    const select = document.getElementById('tidslinje-fag');
    select.innerHTML = '';
    currentFagData.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = fag.navn; select.appendChild(opt); });
    select.value = document.getElementById('fag-select').value;
    hentTidslinje(); // Hent med en gang
    select.onchange = hentTidslinje;
}

// OPPDATERT: Ny layout (Uke - År)
async function hentTidslinje() {
    const fag = document.getElementById('tidslinje-fag').value;
    const container = document.getElementById('tidslinje-liste');
    container.innerHTML = '<p style="color:white">Laster...</p>';

    try {
        const res = await fetch(`${API_URL}/tidslinje?fag=${fag}`);
        const data = await res.json();
        
        container.innerHTML = '';
        if(data.length === 0) {
            container.innerHTML = '<p style="color:white">Ingen planer funnet for dette faget.</p>';
            return;
        }

        data.forEach(rad => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            
            // ENDRING HER: Ny layout
            item.innerHTML = `
                <div class="timeline-info">Uke ${rad.uke} - ${rad.år}</div>
                <div class="timeline-tema">${rad.tema || 'Uten tema'}</div>
            `;
            
            item.onclick = async () => {
                try {
                    const fullRes = await fetch(`${API_URL}/plan?uke=${rad.uke}&år=${rad.år}&fag=${fag}`);
                    const fullPlan = await fullRes.json();
                    visModalMedPlan(fullPlan);
                } catch(e) { alert("Kunne ikke laste plan"); }
            };
            container.appendChild(item);
        });

    } catch(e) { container.innerHTML = '<p style="color:red">Feil ved henting.</p>'; }
}

initDate();
loadSubjects();