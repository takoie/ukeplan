async function invokeCommand(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core) {
        return await window.__TAURI__.core.invoke(cmd, args);
    } else if (window.__TAURI__ && window.__TAURI__.tauri) {
        return await window.__TAURI__.tauri.invoke(cmd, args);
    }
    console.warn("Tauri miljø ikke funnet for kommando:", cmd);
    return null;
}

const API_URL = 'http://127.0.0.1:5000/api';

let autoSaveTimer;
let isLoadingData = false;
let currentSchoolYear = "";

// --- INITIERING ---
// VIKTIG FIX: Alt som skal skje ved oppstart legges her for å sikre at knappene fungerer
window.addEventListener('DOMContentLoaded', () => {
    console.log("App initialiserer... API_URL:", API_URL);
    fixLogoPath();
    initSchoolYears();
    updateDbPathDisplay();

    // Test API-tilkobling
    fetch(`${API_URL}/system/get-db-path`)
        .then(r => r.json())
        .then(d => console.log("✓ API-tilkobling OK, database-sti:", d.path))
        .catch(e => console.error("✗ API-tilkoblingsfeil:", e.message));

    // VINDUSKONTROLLER (Flyttet hit for å garantere at de virker)
    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minBtn) minBtn.addEventListener('click', () => invokeCommand('app_minimize'));
    if (maxBtn) maxBtn.addEventListener('click', () => invokeCommand('app_maximize'));
    if (closeBtn) closeBtn.addEventListener('click', () => invokeCommand('app_close'));
});

// --- SKOLEÅR LOGIKK ---
function getInitialSchoolYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

function initSchoolYears() {
    let storedYears = JSON.parse(localStorage.getItem('availableSchoolYears'));
    const initialYear = getInitialSchoolYear();

    if (!storedYears || storedYears.length === 0) {
        storedYears = [initialYear];
        localStorage.setItem('availableSchoolYears', JSON.stringify(storedYears));
    }

    const savedSelected = localStorage.getItem('skoleaar');
    if (savedSelected && storedYears.includes(savedSelected)) {
        currentSchoolYear = savedSelected;
    } else {
        currentSchoolYear = initialYear;
        if (!storedYears.includes(initialYear)) {
            storedYears.push(initialYear);
            storedYears.sort();
            localStorage.setItem('availableSchoolYears', JSON.stringify(storedYears));
        }
    }
    populateSchoolYearDropdown(storedYears);
}

function populateSchoolYearDropdown(years) {
    const sel = document.getElementById('setting-skoleaar');
    if (!sel) return;
    sel.innerHTML = '';
    years.sort();
    years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
    });
    sel.value = currentSchoolYear;
    sel.onchange = () => {
        currentSchoolYear = sel.value;
        localStorage.setItem('skoleaar', currentSchoolYear);
        loadSubjects();
        loadSettings();
    };
}

window.opprettNyttSkoleaar = function () {
    let storedYears = JSON.parse(localStorage.getItem('availableSchoolYears')) || [];
    storedYears.sort();
    const lastYear = storedYears[storedYears.length - 1];

    const parts = lastYear.split('/');
    const startYear = parseInt(parts[0]);
    const nextYearString = `${startYear + 1}/${startYear + 2}`;

    const status = document.getElementById('school-year-status');

    if (!storedYears.includes(nextYearString)) {
        storedYears.push(nextYearString);
        localStorage.setItem('availableSchoolYears', JSON.stringify(storedYears));
        populateSchoolYearDropdown(storedYears);

        const sel = document.getElementById('setting-skoleaar');
        sel.value = nextYearString;
        sel.onchange();

        status.textContent = `Opprettet!`;
        status.style.color = "#43b581";
    } else {
        status.textContent = "Finnes allerede.";
        status.style.color = "#e74c3c";
    }
    setTimeout(() => status.textContent = "", 3000);
};

// --- DATABASE LOGIKK ---
async function updateDbPathDisplay() {
    try {
        const res = await fetch(`${API_URL}/system/get-db-path`);
        const data = await res.json();
        const el = document.getElementById('current-db-path');
        if (el) el.textContent = data.path || "Ukjent";
    } catch (e) {
        console.error("Feil ved henting av database-sti:", e);
        const el = document.getElementById('current-db-path');
        if (el) el.textContent = "Feil ved tilkobling (er Flask-serveren på?)";
    }
}

window.velgNyDatabase = async function () {
    const status = document.getElementById('db-status');
    status.textContent = "Venter på valg...";
    const path = await invokeCommand('open_db_dialog');
    if (path) {
        status.textContent = "Bytter database...";
        try {
            const res = await fetch(`${API_URL}/system/set-db-path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) });
            if (res.ok) { status.textContent = "Oppdatert! Laster på nytt..."; setTimeout(() => location.reload(), 1000); }
            else {
                const err = await res.json();
                status.textContent = "Feil: " + (err.error || "Ukjent feil");
                status.style.color = "#e74c3c";
                console.error("Database-bytte feil:", err);
            }
        } catch (e) {
            status.textContent = "Feil: " + e.message;
            status.style.color = "#e74c3c";
            console.error("Database-bytte exception:", e);
        }
    } else { status.textContent = "Avbrutt."; }
};

window.opprettNyDatabase = async function () {
    const status = document.getElementById('db-status');
    status.textContent = "Velg hvor...";
    const path = await invokeCommand('save_db_dialog');
    if (path) {
        status.textContent = "Oppretter...";
        try {
            const res = await fetch(`${API_URL}/system/set-db-path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) });
            if (res.ok) { status.textContent = "Opprettet! Laster på nytt..."; setTimeout(() => location.reload(), 1000); }
            else {
                const err = await res.json();
                status.textContent = "Feil: " + (err.error || "Ukjent feil");
                status.style.color = "#e74c3c";
                console.error("Database-opprettelse feil:", err);
            }
        } catch (e) {
            status.textContent = "Feil: " + e.message;
            status.style.color = "#e74c3c";
            console.error("Database-opprettelse exception:", e);
        }
    } else { status.textContent = "Avbrutt."; }
};

window.flyttDatabase = async function () {
    const status = document.getElementById('db-status');
    status.textContent = "Velg destinasjon...";
    const path = await invokeCommand('save_db_dialog');
    if (path) {
        status.textContent = "Flytter...";
        try {
            const res = await fetch(`${API_URL}/system/move-db`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: path }) });
            if (res.ok) { status.textContent = "Flyttet! Laster på nytt..."; setTimeout(() => location.reload(), 1000); }
            else {
                const err = await res.json();
                status.textContent = "Feil: " + (err.error || "Ukjent feil");
                status.style.color = "#e74c3c";
                console.error("Database-flytt feil:", err);
            }
        } catch (e) {
            status.textContent = "Feil: " + e.message;
            status.style.color = "#e74c3c";
            console.error("Database-flytt exception:", e);
        }
    } else { status.textContent = "Avbrutt."; }
};

function fixLogoPath() {
    const aboutLogo = document.querySelector('#modal-om img');
    if (aboutLogo) {
        aboutLogo.src = 'ikon.png';
    }
}

const toolbarOptions = [['bold', 'italic', 'underline', 'strike'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], [{ 'color': [] }, { 'background': [] }], ['clean']];
const quillOptions = { theme: 'snow', modules: { toolbar: toolbarOptions }, spellcheck: false };
const quillAkt = new Quill('#editor-aktivitet', quillOptions);
const quillKrav = new Quill('#editor-krav', quillOptions);
quillAkt.root.setAttribute('spellcheck', 'false'); quillKrav.root.setAttribute('spellcheck', 'false');

function setupEmojiPicker(quill) {
    const toolbar = quill.getModule('toolbar').container;

    const formatsGroup = document.createElement('span');
    formatsGroup.className = 'ql-formats';
    formatsGroup.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'ql-emoji-btn';
    btn.type = 'button';
    btn.title = 'Sett inn ikon';
    btn.innerHTML = '<i class="far fa-smile" style="font-size: 14px; color:#cbd5e1;"></i>';

    const popover = document.createElement('div');
    popover.className = 'emoji-popover glass-panel';
    popover.style.display = 'none';

    const categories = [
        {
            name: "Skole & Fag",
            emojis: ["📝", "📚", "📖", "✏️", "💻", "🧪", "🔬", "🎨", "🎵", "⚽", "🏀", "🎓"]
        },
        {
            name: "Status & Vurdering",
            emojis: ["✅", "❌", "⚠️", "ℹ️", "❓", "❗", "💡", "⭐", "🔴", "🟢", "🔵", "🟡", "📌", "🚩"]
        },
        {
            name: "Reaksjoner & Symboler",
            emojis: ["👍", "👎", "😊", "😃", "🎉", "🔥", "👏", "🙌", "💯", "🌟", "💬", "📅", "⏰", "⏳"]
        }
    ];

    categories.forEach(cat => {
        const catTitle = document.createElement('div');
        catTitle.className = 'emoji-cat-title';
        catTitle.textContent = cat.name;
        popover.appendChild(catTitle);

        const grid = document.createElement('div');
        grid.className = 'emoji-grid';

        cat.emojis.forEach(emoji => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'emoji-item';
            item.textContent = emoji;
            item.onclick = (e) => {
                e.stopPropagation();
                const sel = quill.getSelection(true);
                const idx = sel ? sel.index : quill.getLength();
                quill.insertText(idx, emoji + " ");
                quill.setSelection(idx + emoji.length + 1);
                popover.style.display = 'none';
            };
            grid.appendChild(item);
        });
        popover.appendChild(grid);
    });

    btn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.emoji-popover').forEach(p => {
            if (p !== popover) p.style.display = 'none';
        });
        const isHidden = popover.style.display === 'none';
        popover.style.display = isHidden ? 'block' : 'none';
        document.querySelectorAll('.editor-grid > div').forEach(d => d.style.zIndex = '1');
        const col = btn.closest('.editor-grid > div');
        if (col && isHidden) col.style.zIndex = '9999';
    };

    formatsGroup.appendChild(btn);
    formatsGroup.appendChild(popover);
    toolbar.appendChild(formatsGroup);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-popover') && !e.target.closest('.ql-emoji-btn')) {
        document.querySelectorAll('.emoji-popover').forEach(p => p.style.display = 'none');
        document.querySelectorAll('.editor-grid > div').forEach(d => d.style.zIndex = '1');
    }
});
setupEmojiPicker(quillAkt); setupEmojiPicker(quillKrav);

let currentFagData = [];
const dagerListe = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];

document.getElementById('menu-archive-toggle').addEventListener('click', function () { this.classList.toggle('menu-open'); document.getElementById('archive-submenu').classList.toggle('open'); });
document.getElementById('menu-export-toggle').addEventListener('click', function () { this.classList.toggle('menu-open'); document.getElementById('export-submenu').classList.toggle('open'); });
document.getElementById('menu-settings-toggle').addEventListener('click', function () { this.classList.toggle('menu-open'); document.getElementById('settings-submenu').classList.toggle('open'); });

window.switchView = function (viewName) {
    if (viewName !== 'editor' && autoSaveTimer) { clearTimeout(autoSaveTimer); utførLagring(false); }
    document.querySelectorAll('.menu-item, .submenu-item').forEach(el => el.classList.remove('active'));

    if (viewName === 'editor') { document.getElementById('menu-editor').classList.add('active'); if (currentFagData.length > 0) loadPlan(); }
    if (viewName === 'preview') document.getElementById('menu-preview').classList.add('active');
    if (viewName === 'fag') { document.getElementById('menu-fag').classList.add('active'); loadSettings(); }

    if (viewName === 'search') { document.getElementById('menu-search').classList.add('active'); document.getElementById('menu-archive-toggle').classList.add('active'); loadSearchDropdown(); }
    if (viewName === 'timeline') { document.getElementById('menu-timeline').classList.add('active'); document.getElementById('menu-archive-toggle').classList.add('active'); loadTimelineDropdown(); }
    if (viewName === 'export-fag') { document.getElementById('menu-export-fag').classList.add('active'); document.getElementById('menu-export-toggle').classList.add('active'); loadExportDropdown(); document.getElementById('export-status').innerText = ""; document.getElementById('import-status').innerText = ""; }
    if (viewName === 'export-pdf') { document.getElementById('menu-export-pdf').classList.add('active'); document.getElementById('menu-export-toggle').classList.add('active'); loadPdfDropdown(); }

    if (viewName === 'settings-skoleaar') { document.getElementById('menu-settings-skoleaar').classList.add('active'); document.getElementById('menu-settings-toggle').classList.add('active'); }
    if (viewName === 'settings-db') { document.getElementById('menu-settings-db').classList.add('active'); document.getElementById('menu-settings-toggle').classList.add('active'); }
    if (viewName === 'about') { document.getElementById('menu-about').classList.add('active'); document.getElementById('menu-settings-toggle').classList.add('active'); document.getElementById('settings-submenu').classList.add('open'); }

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    if (viewName === 'preview') loadPreviewDropdown();
};
document.querySelector('.menu-item').classList.add('active');

const closeBtns = document.querySelectorAll(".close-modal");
closeBtns.forEach(btn => btn.onclick = () => { document.getElementById("modal-sist-uke").style.display = "none"; document.getElementById("modal-import").style.display = "none"; document.getElementById("modal-fag").style.display = "none"; });
window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = "none"; };

function visModalMedPlan(data) {
    const container = document.getElementById('prev-week-content');
    document.getElementById("modal-sist-uke").style.display = "block";
    if (data) {
        document.getElementById('prev-week-num').textContent = data.uke || data.visningsUke;
        container.innerHTML = `<div class="prev-week-grid"><div class="prev-col"><div class="prev-header" style="color:#faa61a;border-color:#faa61a;">TEMA</div><div class="prev-content">${data.tema || '-'}</div></div><div class="prev-col"><div class="prev-header" style="color:#3ba55c;border-color:#3ba55c;">AKTIVITETER</div><div class="prev-content">${data.aktivitet || '-'}</div></div><div class="prev-col"><div class="prev-header" style="color:#e67e22;border-color:#e67e22;">ARBEIDSKRAV</div><div class="prev-content">${data.arbeidskrav || '-'}</div></div></div>`;
    } else { document.getElementById('prev-week-num').textContent = "Ingen data"; container.innerHTML = "<p style='color: white; padding: 20px;'>Fant ingen plan.</p>"; }
}

document.getElementById('sist-uke-btn').addEventListener('click', async () => {
    try {
        const uke = document.getElementById('uke-input').value; const aar = document.getElementById('aar-input').value; const fag = document.getElementById('fag-select').value;
        const res = await fetch(`${API_URL}/plan/forrige?uke=${uke}&år=${aar}&fag=${fag}`);
        visModalMedPlan(await res.json());
    } catch (e) { }
});

function updateWeekDisplay(newWeek) {
    if (newWeek < 1) newWeek = 52; if (newWeek > 53) newWeek = 1;
    document.getElementById('uke-input').value = newWeek; document.getElementById('uke-display').textContent = newWeek;

    const realNextWeek = getRealWeek() + 1;
    const realNextWeekFixed = realNextWeek > 53 ? 1 : realNextWeek;
    const label = document.getElementById('uke-label');

    if (newWeek === realNextWeekFixed) label.textContent = "Neste uke";
    else if (newWeek === getRealWeek()) label.textContent = "Denne uken";
    else label.textContent = "";

    loadPlan();
}
function getRealWeek() {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
}
document.getElementById('prev-week-nav').addEventListener('click', () => updateWeekDisplay(parseInt(document.getElementById('uke-input').value) - 1));
document.getElementById('next-week-nav').addEventListener('click', () => updateWeekDisplay(parseInt(document.getElementById('uke-input').value) + 1));

async function loadSubjects() {
    try {
        const res = await fetch(`${API_URL}/fag`); if (!res.ok) throw new Error('Not ready');
        currentFagData = await res.json();

        const filteredFag = currentFagData.filter(f => f.skoleaar === currentSchoolYear);

        const select = document.getElementById('fag-select'); const currentSelection = select.value;
        select.innerHTML = '';
        filteredFag.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = fag.navn; select.appendChild(opt); });

        if (currentSelection && filteredFag.some(f => f.navn === currentSelection)) select.value = currentSelection;
        else if (filteredFag.length > 0) select.value = filteredFag[0].navn;
        else select.value = "";

        loadPlan();
    } catch (e) { throw e; }
}

async function loadPlan() {
    isLoadingData = true;
    const uke = document.getElementById('uke-input').value; const aar = document.getElementById('aar-input').value; const fagNavn = document.getElementById('fag-select').value;
    if (!fagNavn) { document.getElementById('tema-input').value = ""; quillAkt.setContents([]); quillKrav.setContents([]); isLoadingData = false; return; }
    try {
        const res = await fetch(`${API_URL}/plan?uke=${uke}&år=${aar}&fag=${fagNavn}`); const data = await res.json();
        document.getElementById('tema-input').value = data ? data.tema : '';
        const fag = currentFagData.find(f => f.navn === fagNavn);

        if (data && data.aktivitet) quillAkt.root.innerHTML = data.aktivitet;
        else { quillAkt.setContents([]); if (fag && fag.dager) fag.dager.forEach(d => { quillAkt.insertText(quillAkt.getLength() - 1, d + ":", 'bold', true); quillAkt.insertText(quillAkt.getLength() - 1, "\n\n"); }); }

        if (data && data.arbeidskrav) quillKrav.root.innerHTML = data.arbeidskrav;
        else {
            quillKrav.setContents([]);
            if (fag && fag.leksedager) fag.leksedager.forEach(d => {
                quillKrav.insertText(quillKrav.getLength() - 1, "Til " + d.toLowerCase() + ":", 'bold', true);
                quillKrav.insertText(quillKrav.getLength() - 1, "\n\n");
            });
        }
    } catch (e) { console.error(e); }
    finally { setTimeout(() => { isLoadingData = false; }, 100); }
}

async function utførLagring(erAutolagring = false) {
    if (!document.getElementById('fag-select').value) return;
    const status = document.getElementById('status-msg'); const btn = document.getElementById('lagre-btn');
    if (!erAutolagring) { btn.textContent = "Lagrer..."; btn.disabled = true; } else { status.textContent = "Lagrer..."; }
    try {
        const payload = { uke: document.getElementById('uke-input').value, år: document.getElementById('aar-input').value, fag: document.getElementById('fag-select').value, tema: document.getElementById('tema-input').value, aktivitet: quillAkt.root.innerHTML, arbeidskrav: quillKrav.root.innerHTML };
        const res = await fetch(`${API_URL}/lagre`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) { const msg = erAutolagring ? "Lagret (Auto)" : "Lagret! ✅"; status.textContent = msg; if (autoSaveTimer) clearTimeout(autoSaveTimer); setTimeout(() => { if (status.textContent === msg) status.textContent = ""; }, 2000); }
    } catch (e) { status.textContent = "Feil ved lagring"; status.style.color = "#e74c3c"; } finally { if (!erAutolagring) { btn.innerHTML = '<i class="fas fa-save"></i> Lagre'; btn.disabled = false; } }
}
document.getElementById('lagre-btn').addEventListener('click', () => utførLagring(false));
function triggerAutoSave() { if (isLoadingData) return; clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { utførLagring(true); }, 1500); }
document.getElementById('tema-input').addEventListener('input', triggerAutoSave);
quillAkt.on('text-change', (delta, oldDelta, source) => { if (source === 'user') triggerAutoSave(); });
quillKrav.on('text-change', (delta, oldDelta, source) => { if (source === 'user') triggerAutoSave(); });
document.getElementById('fag-select').addEventListener('change', loadPlan);

document.getElementById('share-btn').addEventListener('click', () => {
    const status = document.getElementById('status-msg');
    const code = "UPLAN::" + btoa(unescape(encodeURIComponent(JSON.stringify({ tema: document.getElementById('tema-input').value, aktivitet: quillAkt.root.innerHTML, arbeidskrav: quillKrav.root.innerHTML }))));
    navigator.clipboard.writeText(code).then(() => { status.textContent = "Kode kopiert! 📋"; setTimeout(() => status.textContent = "", 3000); }).catch(err => { status.textContent = "Kunne ikke kopiere"; status.style.color = "#e74c3c"; });
});
document.getElementById('import-modal-btn').addEventListener('click', () => { document.getElementById('import-textarea').value = ""; document.getElementById('modal-import').style.display = "block"; });
document.getElementById('confirm-import-btn').addEventListener('click', () => {
    try {
        const raw = document.getElementById('import-textarea').value.trim().replace("UPLAN::", ""); const data = JSON.parse(decodeURIComponent(escape(window.atob(raw))));
        isLoadingData = true; document.getElementById('tema-input').value = data.tema || ""; quillAkt.root.innerHTML = data.aktivitet || ""; quillKrav.root.innerHTML = data.arbeidskrav || ""; isLoadingData = false; utførLagring(true);
        document.getElementById('modal-import').style.display = "none"; document.getElementById('status-msg').textContent = "Importert! ✅"; setTimeout(() => document.getElementById('status-msg').textContent = "", 3000);
    } catch (e) { document.getElementById('import-error-msg').textContent = "Ugyldig kode."; }
});

async function loadExportDropdown() {
    const select = document.getElementById('export-fag-select'); select.innerHTML = '';
    currentFagData.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = `${fag.navn} (${fag.skoleaar})`; select.appendChild(opt); });
    const activeFag = document.getElementById('fag-select').value; if (activeFag) select.value = activeFag;
}
document.getElementById('do-export-fag-btn').addEventListener('click', async () => {
    const fag = document.getElementById('export-fag-select').value; const status = document.getElementById('export-status'); if (!fag) return;
    try { const res = await fetch(`${API_URL}/fag/eksport?navn=${fag}`); const data = await res.json(); if (data.error) throw new Error(data.error); status.textContent = `Lagret: ${data.filename} ✅`; status.style.color = "#43b581"; } catch (e) { status.textContent = "Eksport feilet: " + e.message; status.style.color = "#e74c3c"; }
});
document.getElementById('open-export-folder-btn').addEventListener('click', async () => { await fetch(`${API_URL}/system/open-export`); });
document.getElementById('import-json-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]; const status = document.getElementById('import-status'); if (!file) return;
    status.textContent = "Leser fil..."; status.style.color = "#ccc";
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const jsonData = JSON.parse(evt.target.result);
            if (!jsonData.meta.skoleaar) jsonData.meta.skoleaar = currentSchoolYear;
            status.textContent = "Importerer..."; const res = await fetch(`${API_URL}/fag/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jsonData) }); const result = await res.json(); if (result.error) throw new Error(result.error); status.textContent = `Suksess! Fag: ${result.nyttNavn} (${result.antallPlaner} planer)`; status.style.color = "#43b581"; await loadSubjects();
        } catch (err) { status.textContent = "Feil: " + err.message; status.style.color = "#e74c3c"; }
        e.target.value = '';
    };
    reader.readAsText(file);
});

async function loadPdfDropdown() {
    const select = document.getElementById('pdf-fag-select'); select.innerHTML = '';
    currentFagData.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = `${fag.navn} (${fag.skoleaar})`; select.appendChild(opt); });
    const uke = parseInt(document.getElementById('uke-input').value);
    document.getElementById('pdf-aar').value = new Date().getFullYear();
    document.getElementById('pdf-start').value = uke;
    document.getElementById('pdf-slutt').value = uke + 4;
}
window.genererPDF = async function () {
    const fag = document.getElementById('pdf-fag-select').value;
    const aar = document.getElementById('pdf-aar').value;
    const start = document.getElementById('pdf-start').value;
    const slutt = document.getElementById('pdf-slutt').value;
    const printArea = document.getElementById('print-area');
    if (!fag) return alert("Velg et fag");
    try {
        const res = await fetch(`${API_URL}/planer/periode?fag=${fag}&start=${start}&slutt=${slutt}&aar=${aar}`);
        const data = await res.json();
        printArea.innerHTML = "";
        const tittel = document.createElement('h1'); tittel.textContent = `${fag} (${aar})`; tittel.style.textAlign = 'center'; tittel.style.marginBottom = '30px'; printArea.appendChild(tittel);
        if (data.length === 0) { printArea.innerHTML += "<p style='text-align:center'>Ingen planer funnet.</p>"; }
        else {
            data.forEach(p => {
                const card = document.createElement('div'); card.className = 'preview-card'; card.style.pageBreakInside = 'avoid';
                card.innerHTML = `<div class="preview-header"><span>${fag}</span><span>UKE ${p.uke}</span></div><div class="preview-grid"><div class="preview-section" style="border-left: 5px solid #faa61a;"><span class="preview-h" style="color: #faa61a;">TEMA</span><div style="white-space: pre-wrap;">${p.tema || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #3ba55c;"><span class="preview-h" style="color: #3ba55c;">AKTIVITETER</span><div style="white-space: pre-wrap;">${p.aktivitet || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #e67e22;"><span class="preview-h" style="color: #e67e22;">ARBEIDSKRAV</span><div style="white-space: pre-wrap;">${p.arbeidskrav || '-'}</div></div></div>`;
                printArea.appendChild(card);
            });
        }
        setTimeout(() => { window.print(); }, 500);
    } catch (e) { alert("Feil ved generering av PDF"); }
};

function createDaySelector(c, s, k) { const el = document.getElementById(c); el.innerHTML = ''; dagerListe.forEach(d => { const x = document.createElement('div'); x.className = `day-toggle ${s.includes(d) ? k : ''}`; x.textContent = d; x.onclick = () => x.classList.toggle(k); el.appendChild(x) }) }
function getSelectedDays(c, k) { const el = document.getElementById(c); const s = []; el.querySelectorAll(`.${k}`).forEach(x => s.push(x.textContent)); return s }
window.openAddFagModal = function () {
    document.getElementById('modal-fag-title').innerHTML = '<i class="fas fa-plus-circle" style="color:#6366f1; margin-right:8px;"></i>Legg til nytt fag';
    document.getElementById('setting-fag-navn').value = '';
    createDaySelector('undervisning-selector', [], 'selected');
    createDaySelector('lekse-selector', [], 'selected-homework');
    document.getElementById('save-subject-btn').innerHTML = '<i class="fas fa-save"></i> Lagre fag';
    document.getElementById('slett-fag-btn').style.display = 'none';
    document.getElementById('rename-fag-btn').style.display = 'none';
    document.getElementById('settings-status').textContent = '';
    document.getElementById('modal-fag').style.display = 'block';
};

async function loadSettings() {
    await loadSubjects();
    const container = document.getElementById('fag-cards-container');
    if (!container) return;
    container.innerHTML = '';
    const filtered = currentFagData.filter(f => f.skoleaar === currentSchoolYear);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; background: rgba(30, 41, 59, 0.5); padding: 40px; text-align: center; border-radius: 12px; border: 1px dashed rgba(255,255,255,0.15);" class="glass-panel">
                <i class="fas fa-book-open" style="font-size: 36px; color: #64748b; margin-bottom: 15px; display: block;"></i>
                <h3 style="color: white; margin-bottom: 8px;">Ingen fag registrert ennå</h3>
                <p style="color: #94a3b8; font-size: 13px; margin-bottom: 20px;">Klikk på knappen under for å opprette ditt første fag.</p>
                <button class="btn btn-primary" onclick="openAddFagModal()"><i class="fas fa-plus-circle"></i> Legg til fag</button>
            </div>
        `;
        return;
    }

    filtered.forEach(f => {
        const card = document.createElement('div');
        card.className = 'fag-card';

        const undervisningBadges = f.dager && f.dager.length > 0
            ? f.dager.map(d => `<span class="fag-badge">${d}</span>`).join('')
            : '<span style="font-size:12px; color:#64748b; font-style:italic;">Ingen satt</span>';

        const arbeidskravBadges = f.leksedager && f.leksedager.length > 0
            ? f.leksedager.map(d => `<span class="fag-badge fag-badge-homework">${d}</span>`).join('')
            : '<span style="font-size:12px; color:#64748b; font-style:italic;">Ingen satt</span>';

        card.innerHTML = `
            <div>
                <div class="fag-card-header">
                    <div class="fag-card-title">
                        <i class="fas fa-book" style="color:#6366f1;"></i> ${f.navn}
                    </div>
                    <button class="btn btn-small btn-primary" onclick="editSubject('${f.navn}')">
                        <i class="fas fa-edit"></i> Rediger
                    </button>
                </div>
                
                <div class="fag-card-section">
                    <div class="fag-card-label">Undervisningsdager</div>
                    <div class="fag-badge-list">${undervisningBadges}</div>
                </div>
                
                <div class="fag-card-section" style="margin-top:12px;">
                    <div class="fag-card-label" style="color:#f59e0b;">Arbeidskrav-dager</div>
                    <div class="fag-badge-list">${arbeidskravBadges}</div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.editSubject = function (n) {
    const f = currentFagData.find(x => x.navn === n);
    if (!f) return;
    document.getElementById('modal-fag-title').innerHTML = `<i class="fas fa-edit" style="color:#6366f1; margin-right:8px;"></i>Rediger ${f.navn}`;
    document.getElementById('setting-fag-navn').value = f.navn;
    createDaySelector('undervisning-selector', f.dager || [], 'selected');
    createDaySelector('lekse-selector', f.leksedager || [], 'selected-homework');
    document.getElementById('slett-fag-btn').style.display = 'inline-block';
    document.getElementById('slett-fag-btn').onclick = () => deleteSubject(n);
    document.getElementById('rename-fag-btn').style.display = 'inline-block';
    document.getElementById('rename-fag-btn').onclick = () => renameSubject(n);
    document.getElementById('save-subject-btn').innerHTML = '<i class="fas fa-save"></i> Oppdater fag';
    document.getElementById('settings-status').textContent = '';
    document.getElementById('modal-fag').style.display = 'block';
};

document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    document.getElementById('modal-fag').style.display = 'none';
});

document.getElementById('save-subject-btn').addEventListener('click', async () => {
    const n = document.getElementById('setting-fag-navn').value.trim();
    if (!n) return alert("Vennligst oppgi fagnavn.");
    const d = getSelectedDays('undervisning-selector', 'selected');
    const l = getSelectedDays('lekse-selector', 'selected-homework');
    try {
        await fetch(`${API_URL}/fag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ navn: n, dager: d, leksedager: l, skoleaar: currentSchoolYear })
        });
        await loadSettings();
        document.getElementById('modal-fag').style.display = 'none';
    } catch (e) {
        alert("Feil ved lagring av fag.");
    }
});

window.deleteSubject = async function (n) {
    if (confirm(`Er du sikker på at du vil slette faget "${n}"? Ukeplaner i historikken beholdes, men faget fjernes fra listen.`)) {
        try {
            await fetch(`${API_URL}/fag/slett`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ navn: n })
            });
            await loadSettings();
            document.getElementById('modal-fag').style.display = 'none';
        } catch (e) { }
    }
};

window.renameSubject = async function (oldName) {
    const newName = prompt("Skriv inn nytt navn på faget:", oldName);
    if (newName && newName !== oldName) {
        try {
            const res = await fetch(`${API_URL}/fag/endre_navn`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gammeltNavn: oldName, nyttNavn: newName })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error);
                return;
            }
            await loadSettings();
            document.getElementById('modal-fag').style.display = 'none';
        } catch (e) {
            alert("Feil ved endring av navn.");
        }
    }
};

async function loadPreviewDropdown() {
    const s = document.getElementById('preview-fag-select'); s.innerHTML = '';
    const filtered = currentFagData.filter(f => f.skoleaar === currentSchoolYear);
    filtered.forEach(f => { const o = document.createElement('option'); o.value = f.navn; o.textContent = f.navn; s.appendChild(o) }); const e = document.getElementById('fag-select').value; if (e) s.value = e;

    // Initialize preview week/year with next week as default
    const nextWeek = getRealWeek() + 1;
    const nextWeekFixed = nextWeek > 53 ? 1 : nextWeek;
    document.getElementById('preview-uke-input').value = nextWeekFixed;
    document.getElementById('preview-aar-input').value = new Date().getFullYear();

    renderPreview('preview-container')
}
document.getElementById('toggle-all-fag').addEventListener('change', (e) => {
    document.getElementById('preview-fag-select').disabled = e.target.checked;
    renderPreview('preview-container');
});

document.getElementById('toggle-hide-header').addEventListener('change', () => {
    renderPreview('preview-container');
});

document.getElementById('preview-uke-input').addEventListener('change', () => {
    renderPreview('preview-container');
});

document.getElementById('preview-aar-input').addEventListener('change', () => {
    renderPreview('preview-container');
});

document.getElementById('preview-fag-select').addEventListener('change', () => {
    renderPreview('preview-container');
});

function buildCardHtml(d, hideHeader = false, cardId = null) {
    const headerHtml = hideHeader ? '' : `<div class="preview-header"><span>${d.fag}</span><span>UKE ${d.uke}</span></div>`;
    const idAttr = cardId ? `id="${cardId}"` : '';
    return `<div ${idAttr} class="preview-card" style="margin-bottom: 0; background:#ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border-radius:0; overflow:hidden;">${headerHtml}<div class="preview-grid"><div class="preview-section" style="border-left: 5px solid #faa61a;"><span class="preview-h" style="color: #faa61a;">TEMA</span><div style="white-space: pre-wrap;">${d.tema || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #3ba55c;"><span class="preview-h" style="color: #3ba55c;">AKTIVITETER</span><div style="white-space: pre-wrap;">${d.aktivitet || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #e67e22;"><span class="preview-h" style="color: #e67e22;">ARBEIDSKRAV</span><div style="white-space: pre-wrap;">${d.arbeidskrav || '-'}</div></div></div></div>`;
}

async function renderPreview(c, d = null) {
    const el = document.getElementById(c);
    const hideHeader = document.getElementById('toggle-hide-header').checked;
    const showAll = document.getElementById('toggle-all-fag').checked;
    const mainKopierBtn = document.getElementById('kopier-bilde-btn');

    if (c === 'preview-container') {
        if (showAll) {
            if (mainKopierBtn) mainKopierBtn.style.display = 'none';
        } else {
            if (mainKopierBtn) mainKopierBtn.style.display = 'inline-flex';
        }
    }

    if (c === 'preview-container' && showAll) {
        el.innerHTML = '<p style="padding:20px; color: white;">Laster alle fag...</p>';
        const uke = document.getElementById('uke-input').value;
        const aar = document.getElementById('aar-input').value;
        const subjects = currentFagData.filter(f => f.skoleaar === currentSchoolYear);

        if (subjects.length === 0) {
            el.innerHTML = '<p style="padding:20px; color: white;">Ingen fag registrert for dette skoleåret.</p>';
            return;
        }

        try {
            const promises = subjects.map(f => fetch(`${API_URL}/plan?uke=${uke}&år=${aar}&fag=${encodeURIComponent(f.navn)}`).then(r => r.ok ? r.json() : null));
            const plans = await Promise.all(promises);

            el.innerHTML = '';
            let count = 0;
            plans.forEach((plan, idx) => {
                if (plan && (plan.tema || plan.aktivitet || plan.arbeidskrav)) {
                    const cardId = `fag-card-${idx}`;
                    const wrapper = document.createElement('div');
                    wrapper.className = 'fag-card-block';
                    wrapper.style.marginBottom = '30px';

                    wrapper.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding: 0 2px;">
                            <span style="font-weight: 700; color: #f8fafc; font-size: 14px;"><i class="fas fa-book" style="color: #6366f1; margin-right: 6px;"></i>${plan.fag} (Uke ${plan.uke})</span>
                            <button class="btn btn-small btn-success" onclick="kopierFagBilde('${cardId}', '${plan.fag}')" style="display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fas fa-copy"></i> Kopier ${plan.fag}
                            </button>
                        </div>
                        ${buildCardHtml(plan, hideHeader, cardId)}
                    `;
                    el.appendChild(wrapper);
                    count++;
                }
            });

            if (count === 0) {
                el.innerHTML = '<p style="padding:20px; color: white;">Ingen ukeplaner funnet for noen fag denne uken.</p>';
            }
        } catch (e) {
            el.innerHTML = '<p style="padding:20px; color: red;">Feil ved henting av ukeplaner.</p>';
        }
        return;
    }

    if (!d) {
        try {
            const fag = document.getElementById('preview-fag-select').value;
            if (fag) {
                const previewUke = document.getElementById('preview-uke-input')?.value || document.getElementById('uke-input').value;
                const previewAar = document.getElementById('preview-aar-input')?.value || document.getElementById('aar-input').value;
                d = await (await fetch(`${API_URL}/plan?uke=${previewUke}&år=${previewAar}&fag=${encodeURIComponent(fag)}`)).json();
            }
        } catch (e) { }
    }

    if (!d) {
        el.innerHTML = '<p style="padding:20px; color: white;">Ingen plan funnet.</p>';
        return;
    }

    const h = buildCardHtml(d, hideHeader, 'single-preview-card');
    if (c === 'sok-resultat-container') el.innerHTML += h;
    else el.innerHTML = h;
}

window.kopierFagBilde = function (cardId, fagnavn) {
    const s = document.getElementById('bilde-status');
    const target = document.getElementById(cardId);
    if (!target) return;

    s.textContent = `Genererer bilde for ${fagnavn}...`;
    s.style.color = "#43b581";

    html2canvas(target, { scale: 3, backgroundColor: null, logging: false, useCORS: true }).then(c => {
        c.toBlob(b => {
            try {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => {
                    s.textContent = `Kopiert ${fagnavn}! ✅`;
                    setTimeout(() => { if (s.textContent.includes(fagnavn)) s.textContent = ""; }, 3000);
                });
            } catch (e) {
                s.textContent = "Feil ved kopiering til utklippstavle.";
                s.style.color = "#ef4444";
            }
        });
    }).catch(() => {
        s.textContent = "Feil ved bildegenerering.";
        s.style.color = "#ef4444";
    });
};

document.getElementById('oppdater-preview-btn').addEventListener('click', () => renderPreview('preview-container'));
document.getElementById('kopier-bilde-btn').addEventListener('click', () => {
    const singleCard = document.getElementById('single-preview-card') || document.querySelector('#preview-container .preview-card');
    if (!singleCard) return alert("Ingen plan å kopiere.");
    const fag = document.getElementById('preview-fag-select').value || 'Ukeplan';
    window.kopierFagBilde(singleCard.id || 'single-preview-card', fag);
});
async function loadSearchDropdown() { const s = document.getElementById('sok-fag'); s.innerHTML = ''; currentFagData.forEach(f => { const o = document.createElement('option'); o.value = f.navn; o.textContent = `${f.navn} (${f.skoleaar})`; s.appendChild(o) }); s.value = document.getElementById('fag-select').value }
window.utforSok = async function () { const c = document.getElementById('sok-resultat-container'); c.innerHTML = '<p style="color:white; padding:10px;">Søker...</p>'; try { const r = await (await fetch(`${API_URL}/sok?fag=${document.getElementById('sok-fag').value}&q=${document.getElementById('sok-tekst').value}`)).json(); c.innerHTML = ''; if (r.length === 0) c.innerHTML = '<p style="color:white; padding:10px;">Ingen treff.</p>'; r.forEach(d => renderPreview('sok-resultat-container', d)) } catch (e) { c.innerHTML = '<p style="color:red; padding:10px;">Feil.</p>' } };
async function loadTimelineDropdown() { const s = document.getElementById('tidslinje-fag'); s.innerHTML = ''; currentFagData.forEach(f => { const o = document.createElement('option'); o.value = f.navn; o.textContent = `${f.navn} (${f.skoleaar})`; s.appendChild(o) }); s.value = document.getElementById('fag-select').value; hentTidslinje(); s.onchange = hentTidslinje }
async function hentTidslinje() { const c = document.getElementById('tidslinje-liste'); c.innerHTML = '<p style="color:white">Laster...</p>'; try { const r = await (await fetch(`${API_URL}/tidslinje?fag=${document.getElementById('tidslinje-fag').value}`)).json(); c.innerHTML = ''; if (r.length === 0) { c.innerHTML = '<p style="color:white">Ingen planer.</p>'; return } r.forEach(d => { const i = document.createElement('div'); i.className = 'timeline-item'; i.innerHTML = `<div class="timeline-info">Uke ${d.uke} - ${d.år}</div><div class="timeline-tema">${d.tema || 'Uten tema'}</div>`; i.onclick = async () => { const p = await (await fetch(`${API_URL}/plan?uke=${d.uke}&år=${d.år}&fag=${document.getElementById('tidslinje-fag').value}`)).json(); visModalMedPlan(p) }; c.appendChild(i) }) } catch (e) { c.innerHTML = '<p style="color:red">Feil.</p>' } }

function initDate() {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const wk = Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7) + 1;
    document.getElementById('uke-display').textContent = wk; document.getElementById('uke-input').value = wk; document.getElementById('aar-input').value = new Date().getFullYear();
    const realNextWeek = getRealWeek() + 1;
    const realNextWeekFixed = realNextWeek > 53 ? 1 : realNextWeek;
    if (wk === realNextWeekFixed) document.getElementById('uke-label').textContent = "Neste uke";
    else if (wk === getRealWeek()) document.getElementById('uke-label').textContent = "Denne uken";
    else document.getElementById('uke-label').textContent = "";
}

async function checkTauriUpdate() {
    try {
        if (window.__TAURI__ && window.__TAURI__.updater) {
            const update = await window.__TAURI__.updater.check();
            if (update) {
                const notif = document.getElementById('notification');
                if (notif) {
                    document.getElementById('notification-message').textContent = `Ny versjon v${update.version} er tilgjengelig!`;
                    notif.style.display = 'flex';
                }
            }
        }
    } catch (e) { }
}

async function initApp() {
    initDate();
    const checkBackend = async () => {
        try {
            const res = await fetch(`${API_URL}/fag`);
            if (res.ok) {
                loadSubjects();
                checkTauriUpdate();
            }
            else setTimeout(checkBackend, 500);
        } catch (e) { setTimeout(checkBackend, 500); }
    };
    checkBackend();
}

initApp();