async function invokeCommand(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core) {
        return await window.__TAURI__.core.invoke(cmd, args);
    } else if (window.__TAURI__ && window.__TAURI__.tauri) {
        return await window.__TAURI__.tauri.invoke(cmd, args);
    }
    console.warn("Tauri miljø ikke funnet for kommando:", cmd);
    return null;
}

let autoSaveTimer = null;
let isLoadingData = false;
let currentSchoolYear = "";
let activeEditorFag = null;
let activeEditorUke = null;
let activeEditorAar = null;
let isEditorDirty = false;

// --- INITIERING ---
// VIKTIG FIX: Alt som skal skje ved oppstart legges her for å sikre at knappene fungerer
window.addEventListener('DOMContentLoaded', () => {
    console.log("App initialiserer...");
    fixLogoPath();
    initSchoolYears();
    updateDbPathDisplay();

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
    sel.onchange = async () => {
        if (autoSaveTimer || isEditorDirty) {
            if (autoSaveTimer) clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
            if (activeEditorFag) await utførLagring(false);
        }
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
        const path = await invokeCommand('get_db_path');
        const el = document.getElementById('current-db-path');
        if (el) el.textContent = path || "Ukjent";
    } catch (e) {
        console.error("Feil ved henting av database-sti:", e);
        const el = document.getElementById('current-db-path');
        if (el) el.textContent = "Feil ved tilkobling til database";
    }
}

window.velgNyDatabase = async function () {
    const status = document.getElementById('db-status');
    status.textContent = "Venter på valg...";
    const path = await invokeCommand('open_db_dialog');
    if (path) {
        status.textContent = "Bytter database...";
        try {
            await invokeCommand('set_db_path', { path: path });
            status.textContent = "Oppdatert! Laster på nytt..."; setTimeout(() => location.reload(), 1000);
        } catch (e) {
            status.textContent = "Feil: " + e;
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
            await invokeCommand('set_db_path', { path: path });
            status.textContent = "Opprettet! Laster på nytt..."; setTimeout(() => location.reload(), 1000);
        } catch (e) {
            status.textContent = "Feil: " + e;
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
            await invokeCommand('move_db', { path: path });
            status.textContent = "Flyttet! Laster på nytt..."; setTimeout(() => location.reload(), 1000);
        } catch (e) {
            status.textContent = "Feil: " + e;
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
                document.querySelectorAll('.editor-grid > div').forEach(d => d.style.zIndex = '1');
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

// UTF-8 trygge base64-hjelpefunksjoner for delingskoder
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUtf8(str) {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
}

let currentFagData = [];
const undervisningsDagerListe = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag"];
const lekseDagerListe = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Mandag (neste uke)"];

const SPRAK_CONFIG = {
    "Bokmål": {
        code: "nb",
        days: {
            "Mandag": "Mandag",
            "Tirsdag": "Tirsdag",
            "Onsdag": "Onsdag",
            "Torsdag": "Torsdag",
            "Fredag": "Fredag",
            "Mandag (neste uke)": "Mandag (neste uke)"
        },
        homeworkLabels: {
            "Mandag": "Til mandag:",
            "Tirsdag": "Til tirsdag:",
            "Onsdag": "Til onsdag:",
            "Torsdag": "Til torsdag:",
            "Fredag": "Til fredag:",
            "Mandag (neste uke)": (nextWk) => `Til mandag (uke ${nextWk}):`
        },
        editorHeaders: {
            week: "Uke",
            topic: "Tema",
            activities: "Aktivitet",
            homework: "Arbeidskrav",
            topicPlaceholder: "Tema for uken...",
            thisWeek: "Denne uken",
            nextWeek: "Neste uke"
        },
        previewHeaders: {
            weekPrefix: "UKE",
            topic: "TEMA",
            activities: "AKTIVITETER",
            homework: "ARBEIDSKRAV"
        }
    },
    "Nynorsk": {
        code: "nn",
        days: {
            "Mandag": "Måndag",
            "Tirsdag": "Tysdag",
            "Onsdag": "Onsdag",
            "Torsdag": "Torsdag",
            "Fredag": "Fredag",
            "Mandag (neste uke)": "Måndag (neste veke)"
        },
        homeworkLabels: {
            "Mandag": "Til måndag:",
            "Tirsdag": "Til tysdag:",
            "Onsdag": "Til onsdag:",
            "Torsdag": "Til torsdag:",
            "Fredag": "Til fredag:",
            "Mandag (neste uke)": (nextWk) => `Til måndag (veke ${nextWk}):`
        },
        editorHeaders: {
            week: "Veke",
            topic: "Tema",
            activities: "Aktivitetar",
            homework: "Arbeidskrav",
            topicPlaceholder: "Tema for veka...",
            thisWeek: "Denne veka",
            nextWeek: "Neste veke"
        },
        previewHeaders: {
            weekPrefix: "VEKE",
            topic: "TEMA",
            activities: "AKTIVITETAR",
            homework: "ARBEIDSKRAV"
        }
    },
    "Engelsk": {
        code: "en",
        days: {
            "Mandag": "Monday",
            "Tirsdag": "Tuesday",
            "Onsdag": "Wednesday",
            "Torsdag": "Thursday",
            "Fredag": "Friday",
            "Mandag (neste uke)": "Monday (next week)"
        },
        homeworkLabels: {
            "Mandag": "For Monday:",
            "Tirsdag": "For Tuesday:",
            "Onsdag": "For Wednesday:",
            "Torsdag": "For Thursday:",
            "Fredag": "For Friday:",
            "Mandag (neste uke)": (nextWk) => `For Monday (week ${nextWk}):`
        },
        editorHeaders: {
            week: "Week",
            topic: "Topic",
            activities: "Activities",
            homework: "Homework",
            topicPlaceholder: "Topic of the week...",
            thisWeek: "This week",
            nextWeek: "Next week"
        },
        previewHeaders: {
            weekPrefix: "WEEK",
            topic: "TOPIC",
            activities: "ACTIVITIES",
            homework: "HOMEWORK"
        }
    },
    "Spansk": {
        code: "es",
        days: {
            "Mandag": "Lunes",
            "Tirsdag": "Martes",
            "Onsdag": "Miércoles",
            "Torsdag": "Jueves",
            "Fredag": "Viernes",
            "Mandag (neste uke)": "Lunes (próxima semana)"
        },
        homeworkLabels: {
            "Mandag": "Para el lunes:",
            "Tirsdag": "Para el martes:",
            "Onsdag": "Para el miércoles:",
            "Torsdag": "Para el jueves:",
            "Fredag": "Para el viernes:",
            "Mandag (neste uke)": (nextWk) => `Para el lunes (semana ${nextWk}):`
        },
        editorHeaders: {
            week: "Semana",
            topic: "Tema",
            activities: "Actividades",
            homework: "Tareas",
            topicPlaceholder: "Tema de la semana...",
            thisWeek: "Esta semana",
            nextWeek: "Próxima semana"
        },
        previewHeaders: {
            weekPrefix: "SEMANA",
            topic: "TEMA",
            activities: "ACTIVIDADES",
            homework: "TAREAS"
        }
    },
    "Tysk": {
        code: "de",
        days: {
            "Mandag": "Montag",
            "Tirsdag": "Dienstag",
            "Onsdag": "Mittwoch",
            "Torsdag": "Donnerstag",
            "Fredag": "Freitag",
            "Mandag (neste uke)": "Montag (nächste Woche)"
        },
        homeworkLabels: {
            "Mandag": "Bis Montag:",
            "Tirsdag": "Bis Dienstag:",
            "Onsdag": "Bis Mittwoch:",
            "Torsdag": "Bis Donnerstag:",
            "Fredag": "Bis Freitag:",
            "Mandag (neste uke)": (nextWk) => `Bis Montag (Woche ${nextWk}):`
        },
        editorHeaders: {
            week: "Woche",
            topic: "Thema",
            activities: "Aktivitäten",
            homework: "Hausaufgaben",
            topicPlaceholder: "Thema der Woche...",
            thisWeek: "Diese Woche",
            nextWeek: "Nächste Woche"
        },
        previewHeaders: {
            weekPrefix: "WOCHE",
            topic: "THEMA",
            activities: "AKTIVITÄTEN",
            homework: "HAUSAUFGABEN"
        }
    }
};

document.getElementById('menu-archive-toggle').addEventListener('click', function () { this.classList.toggle('menu-open'); document.getElementById('archive-submenu').classList.toggle('open'); });
document.getElementById('menu-export-toggle').addEventListener('click', function () { this.classList.toggle('menu-open'); document.getElementById('export-submenu').classList.toggle('open'); });
document.getElementById('menu-settings-toggle').addEventListener('click', function () { this.classList.toggle('menu-open'); document.getElementById('settings-submenu').classList.toggle('open'); });

window.switchView = async function (viewName) {
    if (viewName !== 'editor' && (autoSaveTimer || isEditorDirty)) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        if (activeEditorFag) await utførLagring(false);
    }
    document.querySelectorAll('.menu-item, .submenu-item').forEach(el => el.classList.remove('active'));

    if (viewName === 'editor') { document.getElementById('menu-editor').classList.add('active'); if (currentFagData.length > 0) loadPlan(); }
    if (viewName === 'preview') {
        document.getElementById('menu-preview').classList.add('active');
        await loadPreviewDropdown();
    }
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
};
document.querySelector('.menu-item').classList.add('active');

const closeBtns = document.querySelectorAll(".close-modal");
closeBtns.forEach(btn => btn.onclick = () => {
    document.getElementById("modal-sist-uke").style.display = "none";
    document.getElementById("modal-import").style.display = "none";
    document.getElementById("modal-fag").style.display = "none";
    const mNull = document.getElementById("modal-nullstill");
    if (mNull) mNull.style.display = "none";
    const mPdf = document.getElementById("modal-pdf-export");
    if (mPdf) mPdf.style.display = "none";
});
window.onclick = (e) => { if (e.target.classList.contains('modal')) e.target.style.display = "none"; };

function visModalMedPlan(data) {
    const container = document.getElementById('prev-week-content');
    document.getElementById("modal-sist-uke").style.display = "block";
    const fagName = (data && data.fag) || document.getElementById('fag-select')?.value || document.getElementById('tidslinje-fag')?.value;
    const fagObj = currentFagData.find(f => f.navn === fagName);
    const sprak = fagObj ? fagObj.sprak || "Bokmål" : "Bokmål";
    const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];

    if (data && (data.tema || data.aktivitet || data.arbeidskrav)) {
        document.getElementById('prev-week-num').textContent = data.uke || data.visningsUke;
        container.innerHTML = `<div class="prev-week-grid"><div class="prev-col"><div class="prev-header" style="color:#faa61a;border-color:#faa61a;">${cfg.previewHeaders.topic}</div><div class="prev-content">${data.tema || '-'}</div></div><div class="prev-col"><div class="prev-header" style="color:#3ba55c;border-color:#3ba55c;">${cfg.previewHeaders.activities}</div><div class="prev-content">${data.aktivitet || '-'}</div></div><div class="prev-col"><div class="prev-header" style="color:#e67e22;border-color:#e67e22;">${cfg.previewHeaders.homework}</div><div class="prev-content">${data.arbeidskrav || '-'}</div></div></div>`;
    } else {
        document.getElementById('prev-week-num').textContent = data?.visningsUke || "Ingen data";
        container.innerHTML = "<p style='color: white; padding: 20px;'>Fant ingen plan fra forrige undervisningsuke.</p>";
    }
}

document.getElementById('sist-uke-btn').addEventListener('click', async () => {
    try {
        const uke = document.getElementById('uke-input').value; const aar = document.getElementById('aar-input').value; const fag = document.getElementById('fag-select').value;
        const data = await invokeCommand('hent_forrige_plan', { uke: Number(uke), ar: Number(aar), fag: fag });
        visModalMedPlan(data);
    } catch (e) { }
});

function updateEditorLanguageUI(cfg) {
    const headerUke = document.getElementById('header-col-uke');
    const headerTema = document.getElementById('header-col-tema');
    const headerAkt = document.getElementById('header-col-akt');
    const headerKrav = document.getElementById('header-col-krav');
    const temaInput = document.getElementById('tema-input');

    if (headerUke) headerUke.textContent = cfg.editorHeaders.week;
    if (headerTema) headerTema.textContent = cfg.editorHeaders.topic;
    if (headerAkt) headerAkt.textContent = cfg.editorHeaders.activities;
    if (headerKrav) headerKrav.textContent = cfg.editorHeaders.homework;
    if (temaInput) temaInput.placeholder = cfg.editorHeaders.topicPlaceholder;

    const wk = parseInt(document.getElementById('uke-input')?.value);
    const realNextWeek = getRealWeek() + 1;
    const realNextWeekFixed = realNextWeek > 53 ? 1 : realNextWeek;
    const ukeLabel = document.getElementById('uke-label');
    if (ukeLabel) {
        if (wk === realNextWeekFixed) ukeLabel.textContent = cfg.editorHeaders.nextWeek;
        else if (wk === getRealWeek()) ukeLabel.textContent = cfg.editorHeaders.thisWeek;
        else ukeLabel.textContent = "";
    }
}

async function navigateWeek(delta) {
    if (autoSaveTimer || isEditorDirty) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        if (activeEditorFag) await utførLagring(false);
    }
    let currentWeek = parseInt(document.getElementById('uke-input').value) || getRealWeek();
    let currentYear = parseInt(document.getElementById('aar-input').value) || new Date().getFullYear();
    
    let newWeek = currentWeek + delta;
    let newYear = currentYear;

    if (newWeek < 1) {
        newWeek = 52;
        newYear -= 1;
    } else if (newWeek > 52) {
        newWeek = 1;
        newYear += 1;
    }

    document.getElementById('aar-input').value = newYear;
    document.getElementById('uke-input').value = newWeek;
    document.getElementById('uke-display').textContent = newWeek;

    loadPlan();
}

async function updateWeekDisplay(newWeek) {
    if (autoSaveTimer || isEditorDirty) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        if (activeEditorFag) await utførLagring(false);
    }
    if (newWeek < 1) newWeek = 52; 
    if (newWeek > 53) newWeek = 1;
    document.getElementById('uke-input').value = newWeek; 
    document.getElementById('uke-display').textContent = newWeek;

    loadPlan();
}

function getRealWeek() {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
}
document.getElementById('prev-week-nav').addEventListener('click', () => navigateWeek(-1));
document.getElementById('next-week-nav').addEventListener('click', () => navigateWeek(1));

async function loadSubjects() {
    try {
        currentFagData = await invokeCommand('hent_fag');

        const filteredFag = currentFagData.filter(f => f.skoleaar === currentSchoolYear);

        const select = document.getElementById('fag-select'); const currentSelection = select.value;
        select.innerHTML = '';
        filteredFag.forEach(fag => { const opt = document.createElement('option'); opt.value = fag.navn; opt.textContent = fag.navn; select.appendChild(opt); });

        if (currentSelection && filteredFag.some(f => f.navn === currentSelection)) select.value = currentSelection;
        else if (filteredFag.length > 0) select.value = filteredFag[0].navn;
        else select.value = "";

        loadPlan();
        if (document.getElementById('export-fag-select')) loadExportDropdown();
        if (document.getElementById('pdf-fag-select')) loadPdfDropdown();
    } catch (e) { throw e; }
}

async function loadPlan() {
    isLoadingData = true;
    const uke = document.getElementById('uke-input').value;
    const aar = document.getElementById('aar-input').value;
    const fagNavn = document.getElementById('fag-select').value;
    
    const fag = currentFagData.find(f => f.navn === fagNavn);
    const sprak = fag ? fag.sprak || "Bokmål" : "Bokmål";
    const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];

    updateEditorLanguageUI(cfg);

    if (!fagNavn) {
        document.getElementById('tema-input').value = "";
        quillAkt.setContents([]);
        quillKrav.setContents([]);
        activeEditorFag = null;
        activeEditorUke = null;
        activeEditorAar = null;
        isEditorDirty = false;
        isLoadingData = false;
        return;
    }

    activeEditorFag = fagNavn;
    activeEditorUke = uke;
    activeEditorAar = aar;
    isEditorDirty = false;

    try {
        const data = await invokeCommand('hent_plan', { uke: Number(uke), ar: Number(aar), fag: fagNavn });
        document.getElementById('tema-input').value = data ? data.tema : '';

        if (data && data.aktivitet) quillAkt.root.innerHTML = data.aktivitet;
        else { 
            quillAkt.setContents([]); 
            if (fag && fag.dager) {
                fag.dager.forEach(d => {
                    const translatedDay = cfg.days[d] || d;
                    quillAkt.insertText(quillAkt.getLength() - 1, translatedDay + ":", 'bold', true);
                    quillAkt.insertText(quillAkt.getLength() - 1, "\n\n");
                });
            }
        }

        if (data && data.arbeidskrav) quillKrav.root.innerHTML = data.arbeidskrav;
        else {
            quillKrav.setContents([]);
            if (fag && fag.leksedager) {
                const currentWeek = parseInt(document.getElementById('uke-input').value) || getRealWeek();
                const nextWeek = currentWeek >= 52 ? 1 : currentWeek + 1;

                const dayOrder = {
                    "Mandag": 1,
                    "Tirsdag": 2,
                    "Onsdag": 3,
                    "Torsdag": 4,
                    "Fredag": 5,
                    "Mandag (neste uke)": 6
                };

                const sortedDays = [...fag.leksedager].sort((a, b) => (dayOrder[a] || 99) - (dayOrder[b] || 99));

                sortedDays.forEach(d => {
                    let labelFunc = cfg.homeworkLabels[d];
                    let label = "";
                    if (typeof labelFunc === 'function') {
                        label = labelFunc(nextWeek);
                    } else if (typeof labelFunc === 'string') {
                        label = labelFunc;
                    } else {
                        label = "Til " + d.toLowerCase() + ":";
                    }
                    quillKrav.insertText(quillKrav.getLength() - 1, label, 'bold', true);
                    quillKrav.insertText(quillKrav.getLength() - 1, "\n\n");
                });
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => {
            isLoadingData = false;
            isEditorDirty = false;
        }, 100);
    }
}

async function utførLagring(erAutolagring = false) {
    const targetFag = activeEditorFag || document.getElementById('fag-select')?.value;
    const targetUke = activeEditorUke || document.getElementById('uke-input')?.value;
    const targetAar = activeEditorAar || document.getElementById('aar-input')?.value;
    if (!targetFag) return;

    const status = document.getElementById('status-msg');
    const btn = document.getElementById('lagre-btn');
    if (!erAutolagring) {
        if (btn) { btn.textContent = "Lagrer..."; btn.disabled = true; }
    } else {
        if (status) status.textContent = "Lagrer...";
    }

    try {
        const payload = {
            uke: Number(targetUke),
            ar: Number(targetAar),
            fag: targetFag,
            tema: document.getElementById('tema-input').value,
            aktivitet: quillAkt.root.innerHTML,
            arbeidskrav: quillKrav.root.innerHTML
        };
        await invokeCommand('lagre_plan', payload);
        isEditorDirty = false;
        const msg = erAutolagring ? "Lagret (Auto)" : "Lagret! ✅";
        if (status) {
            status.textContent = msg;
            status.style.color = "#43b581";
        }
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
        setTimeout(() => {
            if (status && status.textContent === msg) status.textContent = "";
        }, 2000);
    } catch (e) {
        if (status) {
            status.textContent = "Feil ved lagring";
            status.style.color = "#e74c3c";
        }
    } finally {
        if (!erAutolagring && btn) {
            btn.innerHTML = '<i class="fas fa-save"></i> Lagre';
            btn.disabled = false;
        }
    }
}
document.getElementById('lagre-btn').addEventListener('click', () => utførLagring(false));

window.openNullstillModal = function() {
    const fagNavn = document.getElementById('fag-select').value;
    const uke = document.getElementById('uke-input').value;
    const aar = document.getElementById('aar-input').value;
    if (!fagNavn) return;

    const undertittel = document.getElementById('nullstill-modal-undertittel');
    if (undertittel) {
        undertittel.textContent = `Dette vil fjerne alt innhold du har skrevet for "${fagNavn}" i uke ${uke} (${aar}) og tilbakestille til standard mal.`;
    }
    const modal = document.getElementById('modal-nullstill');
    if (modal) modal.style.display = 'block';
};

window.bekreftNullstillUke = async function() {
    const modal = document.getElementById('modal-nullstill');
    if (modal) modal.style.display = 'none';

    const fagNavn = document.getElementById('fag-select').value;
    const uke = document.getElementById('uke-input').value;
    const aar = document.getElementById('aar-input').value;
    if (!fagNavn) return;

    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    isLoadingData = true;

    const fag = currentFagData.find(f => f.navn === fagNavn);
    const sprak = fag ? fag.sprak || "Bokmål" : "Bokmål";
    const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];

    document.getElementById('tema-input').value = "";
    quillAkt.setContents([]);
    if (fag && fag.dager) {
        fag.dager.forEach(d => {
            const translatedDay = cfg.days[d] || d;
            quillAkt.insertText(quillAkt.getLength() - 1, translatedDay + ":", 'bold', true);
            quillAkt.insertText(quillAkt.getLength() - 1, "\n\n");
        });
    }

    quillKrav.setContents([]);
    if (fag && fag.leksedager) {
        const currentWeek = parseInt(uke) || getRealWeek();
        const nextWeek = currentWeek >= 52 ? 1 : currentWeek + 1;

        const dayOrder = {
            "Mandag": 1,
            "Tirsdag": 2,
            "Onsdag": 3,
            "Torsdag": 4,
            "Fredag": 5,
            "Mandag (neste uke)": 6
        };

        const sortedDays = [...fag.leksedager].sort((a, b) => (dayOrder[a] || 99) - (dayOrder[b] || 99));

        sortedDays.forEach(d => {
            let labelFunc = cfg.homeworkLabels[d];
            let label = "";
            if (typeof labelFunc === 'function') {
                label = labelFunc(nextWeek);
            } else if (typeof labelFunc === 'string') {
                label = labelFunc;
            } else {
                label = "Til " + d.toLowerCase() + ":";
            }
            quillKrav.insertText(quillKrav.getLength() - 1, label, 'bold', true);
            quillKrav.insertText(quillKrav.getLength() - 1, "\n\n");
        });
    }

    isLoadingData = false;
    activeEditorFag = fagNavn;
    activeEditorUke = uke;
    activeEditorAar = aar;
    isEditorDirty = false;

    // Lagre den nullstilte planen umiddelbart i databasen
    try {
        const payload = {
            uke: Number(uke),
            ar: Number(aar),
            fag: fagNavn,
            tema: "",
            aktivitet: quillAkt.root.innerHTML,
            arbeidskrav: quillKrav.root.innerHTML
        };
        await invokeCommand('lagre_plan', payload);
    } catch (e) {
        console.error("Feil ved nullstilling:", e);
    }
};

document.getElementById('nullstill-uke-btn')?.addEventListener('click', window.openNullstillModal);
document.getElementById('nullstill-avbryt-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-nullstill');
    if (modal) modal.style.display = 'none';
});
document.getElementById('nullstill-bekreft-btn')?.addEventListener('click', window.bekreftNullstillUke);

function triggerAutoSave() {
    if (isLoadingData) return;
    isEditorDirty = true;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        utførLagring(true);
    }, 1500);
}
document.getElementById('tema-input').addEventListener('input', triggerAutoSave);
quillAkt.on('text-change', (delta, oldDelta, source) => { if (source === 'user') triggerAutoSave(); });
quillKrav.on('text-change', (delta, oldDelta, source) => { if (source === 'user') triggerAutoSave(); });

document.getElementById('fag-select').addEventListener('change', async () => {
    if (autoSaveTimer || isEditorDirty) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        if (activeEditorFag) {
            await utførLagring(false);
        }
    }
    loadPlan();
});

document.getElementById('share-btn').addEventListener('click', () => {
    const status = document.getElementById('status-msg');
    try {
        const payload = { tema: document.getElementById('tema-input').value, aktivitet: quillAkt.root.innerHTML, arbeidskrav: quillKrav.root.innerHTML };
        const code = "UPLAN::" + utf8ToBase64(JSON.stringify(payload));
        navigator.clipboard.writeText(code).then(() => { status.textContent = "Kode kopiert! 📋"; setTimeout(() => status.textContent = "", 3000); }).catch(err => { status.textContent = "Kunne ikke kopiere"; status.style.color = "#e74c3c"; });
    } catch (e) {
        status.textContent = "Feil ved deling";
        status.style.color = "#e74c3c";
    }
});
document.getElementById('import-modal-btn').addEventListener('click', () => { document.getElementById('import-textarea').value = ""; document.getElementById('modal-import').style.display = "block"; });
document.getElementById('confirm-import-btn').addEventListener('click', () => {
    try {
        const raw = document.getElementById('import-textarea').value.trim().replace("UPLAN::", ""); 
        const data = JSON.parse(base64ToUtf8(raw));
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
    try { const data = await invokeCommand('eksporter_fag', { navn: fag }); status.textContent = `Lagret: ${data.filename} ✅`; status.style.color = "#43b581"; } catch (e) { status.textContent = "Eksport feilet: " + e; status.style.color = "#e74c3c"; }
});
document.getElementById('open-export-folder-btn').addEventListener('click', async () => { await invokeCommand('open_export_folder'); });
document.getElementById('import-json-input').addEventListener('change', async (e) => {
    const file = e.target.files[0]; const status = document.getElementById('import-status'); if (!file) return;
    status.textContent = "Leser fil..."; status.style.color = "#ccc";
    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const jsonData = JSON.parse(evt.target.result);
            if (!jsonData.meta.skoleaar) jsonData.meta.skoleaar = currentSchoolYear;
            status.textContent = "Importerer..."; const result = await invokeCommand('importer_fag', { meta: jsonData.meta, planer: jsonData.planer }); status.textContent = `Suksess! Fag: ${result.nyttNavn} (${result.antallPlaner} planer)`; status.style.color = "#43b581"; await loadSubjects();
        } catch (err) { status.textContent = "Feil: " + (err.message || err); status.style.color = "#e74c3c"; }
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
    const fagObj = currentFagData.find(f => f.navn === fag);
    const sprak = fagObj ? fagObj.sprak || "Bokmål" : "Bokmål";
    const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];

    try {
        const data = await invokeCommand('hent_planer_periode', { fag: fag, aar: Number(aar), start: Number(start), slutt: Number(slutt) });
        printArea.innerHTML = "";
        const tittel = document.createElement('h1'); tittel.textContent = `${fag} (${aar})`; tittel.style.textAlign = 'center'; tittel.style.marginBottom = '30px'; printArea.appendChild(tittel);
        if (data.length === 0) { printArea.innerHTML += "<p style='text-align:center'>Ingen planer funnet.</p>"; }
        else {
            data.forEach(p => {
                const card = document.createElement('div'); card.className = 'preview-card'; card.style.pageBreakInside = 'avoid';
                card.innerHTML = `<div class="preview-header"><span>${fag}</span><span>${cfg.previewHeaders.weekPrefix} ${p.uke}</span></div><div class="preview-grid"><div class="preview-section" style="border-left: 5px solid #faa61a;"><span class="preview-h" style="color: #faa61a;">${cfg.previewHeaders.topic}</span><div style="white-space: pre-wrap;">${p.tema || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #3ba55c;"><span class="preview-h" style="color: #3ba55c;">${cfg.previewHeaders.activities}</span><div style="white-space: pre-wrap;">${p.aktivitet || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #e67e22;"><span class="preview-h" style="color: #e67e22;">${cfg.previewHeaders.homework}</span><div style="white-space: pre-wrap;">${p.arbeidskrav || '-'}</div></div></div>`;
                printArea.appendChild(card);
            });
        }
        setTimeout(() => { window.print(); }, 500);
    } catch (e) { alert("Feil ved generering av PDF"); }
};

function createDaySelector(c, s, k, isHomework = false, currentSprak = "Bokmål") {
    const el = document.getElementById(c);
    if (!el) return;
    el.innerHTML = '';
    const cfg = SPRAK_CONFIG[currentSprak] || SPRAK_CONFIG["Bokmål"];
    const days = isHomework ? lekseDagerListe : undervisningsDagerListe;
    days.forEach(d => {
        const x = document.createElement('div');
        x.className = `day-toggle ${s.includes(d) ? k : ''}`;
        x.dataset.canonical = d;
        x.textContent = cfg.days[d] || d;
        x.onclick = () => x.classList.toggle(k);
        el.appendChild(x);
    });
}
function getSelectedDays(c, k) { 
    const el = document.getElementById(c); 
    if (!el) return [];
    const s = []; 
    el.querySelectorAll(`.${k}`).forEach(x => s.push(x.dataset.canonical || x.textContent)); 
    return s;
}

document.getElementById('setting-fag-sprak')?.addEventListener('change', (e) => {
    const sprak = e.target.value;
    const selectedUndervisning = getSelectedDays('undervisning-selector', 'selected');
    const selectedHomework = getSelectedDays('lekse-selector', 'selected-homework');
    createDaySelector('undervisning-selector', selectedUndervisning, 'selected', false, sprak);
    createDaySelector('lekse-selector', selectedHomework, 'selected-homework', true, sprak);
});

window.openAddFagModal = function () {
    document.getElementById('modal-fag-title').innerHTML = '<i class="fas fa-plus-circle" style="color:#6366f1; margin-right:8px;"></i>Legg til nytt fag';
    document.getElementById('setting-fag-navn').value = '';
    const sprakSel = document.getElementById('setting-fag-sprak');
    if (sprakSel) sprakSel.value = 'Bokmål';
    createDaySelector('undervisning-selector', [], 'selected', false, 'Bokmål');
    createDaySelector('lekse-selector', [], 'selected-homework', true, 'Bokmål');
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

        const sprak = f.sprak || 'Bokmål';
        const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG['Bokmål'];

        const undervisningBadges = f.dager && f.dager.length > 0
            ? f.dager.map(d => `<span class="fag-badge">${cfg.days[d] || d}</span>`).join('')
            : '<span style="font-size:12px; color:#64748b; font-style:italic;">Ingen satt</span>';

        const arbeidskravBadges = f.leksedager && f.leksedager.length > 0
            ? f.leksedager.map(d => `<span class="fag-badge fag-badge-homework">${cfg.days[d] || d}</span>`).join('')
            : '<span style="font-size:12px; color:#64748b; font-style:italic;">Ingen satt</span>';

        card.innerHTML = `
            <div class="fag-card-header">
                <div class="fag-card-title-row">
                    <i class="fas fa-book fag-card-icon"></i>
                    <div class="fag-card-title">${f.navn}</div>
                </div>
                <div class="fag-card-actions-row">
                    <span class="fag-badge-lang"><i class="fas fa-globe"></i> ${sprak}</span>
                    <button class="btn btn-small btn-primary" onclick="editSubject('${f.navn}')">
                        <i class="fas fa-edit"></i> Rediger
                    </button>
                </div>
            </div>
            
            <div class="fag-card-section">
                <div class="fag-card-label">Undervisningsdager</div>
                <div class="fag-badge-list">${undervisningBadges}</div>
            </div>
            
            <div class="fag-card-section" style="margin-top:12px;">
                <div class="fag-card-label" style="color:#f59e0b;">Arbeidskrav-dager</div>
                <div class="fag-badge-list">${arbeidskravBadges}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.editSubject = function (n) {
    const f = currentFagData.find(x => x.navn === n);
    if (!f) return;
    const sprak = f.sprak || 'Bokmål';
    document.getElementById('modal-fag-title').innerHTML = `<i class="fas fa-edit" style="color:#6366f1; margin-right:8px;"></i>Rediger ${f.navn}`;
    document.getElementById('setting-fag-navn').value = f.navn;
    const sprakSel = document.getElementById('setting-fag-sprak');
    if (sprakSel) sprakSel.value = sprak;
    createDaySelector('undervisning-selector', f.dager || [], 'selected', false, sprak);
    createDaySelector('lekse-selector', f.leksedager || [], 'selected-homework', true, sprak);
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
    const sprak = document.getElementById('setting-fag-sprak')?.value || 'Bokmål';
    const d = getSelectedDays('undervisning-selector', 'selected');
    const l = getSelectedDays('lekse-selector', 'selected-homework');
    try {
        await invokeCommand('lagre_nytt_fag', { navn: n, dager: d, leksedager: l, skoleaar: currentSchoolYear, sprak: sprak });
        await loadSettings();
        document.getElementById('modal-fag').style.display = 'none';
    } catch (e) {
        alert("Feil ved lagring av fag.");
    }
});

window.deleteSubject = async function (n) {
    if (confirm(`Er du sikker på at du vil slette faget "${n}"? Ukeplaner i historikken beholdes, men faget fjernes fra listen.`)) {
        try {
            await invokeCommand('slett_fag', { navn: n });
            await loadSettings();
            document.getElementById('modal-fag').style.display = 'none';
        } catch (e) { }
    }
};

window.renameSubject = async function (oldName) {
    const newName = prompt("Skriv inn nytt navn på faget:", oldName);
    if (newName && newName !== oldName) {
        try {
            await invokeCommand('endre_navn_fag', { gammeltNavn: oldName, nyttNavn: newName });
            await loadSettings();
            document.getElementById('modal-fag').style.display = 'none';
        } catch (e) {
            alert(e || "Feil ved endring av navn.");
        }
    }
};

async function loadPreviewDropdown() {
    const s = document.getElementById('preview-fag-select');
    s.innerHTML = '';
    const filtered = currentFagData.filter(f => f.skoleaar === currentSchoolYear);
    filtered.forEach(f => {
        const o = document.createElement('option');
        o.value = f.navn;
        o.textContent = f.navn;
        s.appendChild(o);
    });

    const activeFag = document.getElementById('fag-select')?.value;
    if (activeFag && filtered.some(f => f.navn === activeFag)) {
        s.value = activeFag;
    } else if (filtered.length > 0) {
        s.value = filtered[0].navn;
    }

    // Sync uke fra planlegger-editoren
    const editorUke = parseInt(document.getElementById('uke-input')?.value);
    if (editorUke) {
        document.getElementById('preview-uke-input').value = editorUke;
    } else {
        const nextWeek = getRealWeek() + 1;
        const nextWeekFixed = nextWeek > 53 ? 1 : nextWeek;
        document.getElementById('preview-uke-input').value = nextWeekFixed;
    }

    await renderPreview('preview-container');
}

document.getElementById('toggle-all-fag')?.addEventListener('change', (e) => {
    const sel = document.getElementById('preview-fag-select');
    if (sel) sel.disabled = e.target.checked;
    renderPreview('preview-container');
});

document.getElementById('toggle-hide-header')?.addEventListener('change', () => {
    renderPreview('preview-container');
});

document.getElementById('preview-uke-input')?.addEventListener('input', () => {
    renderPreview('preview-container');
});

document.getElementById('preview-uke-input')?.addEventListener('change', () => {
    renderPreview('preview-container');
});

document.getElementById('preview-fag-select')?.addEventListener('change', () => {
    renderPreview('preview-container');
});

function buildCardHtml(d, hideHeader = false, cardId = null) {
    const fagObj = currentFagData.find(f => f.navn === d.fag);
    const sprak = fagObj ? fagObj.sprak || "Bokmål" : "Bokmål";
    const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];

    const headerHtml = hideHeader ? '' : `<div class="preview-header"><span>${d.fag}</span><span>${cfg.previewHeaders.weekPrefix} ${d.uke}</span></div>`;
    const idAttr = cardId ? `id="${cardId}"` : '';
    return `<div ${idAttr} class="preview-card" style="margin-bottom: 0; background:#ffffff; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); border-radius:0; overflow:hidden;">${headerHtml}<div class="preview-grid"><div class="preview-section" style="border-left: 5px solid #faa61a;"><span class="preview-h" style="color: #faa61a;">${cfg.previewHeaders.topic}</span><div style="white-space: pre-wrap;">${d.tema || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #3ba55c;"><span class="preview-h" style="color: #3ba55c;">${cfg.previewHeaders.activities}</span><div style="white-space: pre-wrap;">${d.aktivitet || '-'}</div></div><div class="preview-section" style="border-left: 5px solid #e67e22;"><span class="preview-h" style="color: #e67e22;">${cfg.previewHeaders.homework}</span><div style="white-space: pre-wrap;">${d.arbeidskrav || '-'}</div></div></div></div>`;
}

async function renderPreview(c, d = null) {
    const el = document.getElementById(c);
    if (!el) return;
    const hideHeader = document.getElementById('toggle-hide-header')?.checked || false;
    const showAll = document.getElementById('toggle-all-fag')?.checked || false;
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
        const uke = document.getElementById('preview-uke-input')?.value || document.getElementById('uke-input').value;
        const aar = document.getElementById('aar-input').value;
        const subjects = currentFagData.filter(f => f.skoleaar === currentSchoolYear);

        if (subjects.length === 0) {
            el.innerHTML = '<p style="padding:20px; color: white;">Ingen fag registrert for dette skoleåret.</p>';
            return;
        }

        try {
            const promises = subjects.map(f => invokeCommand('hent_plan', { uke: Number(uke), ar: Number(aar), fag: f.navn }).catch(() => null));
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
                const previewAar = document.getElementById('aar-input').value;
                d = await invokeCommand('hent_plan', { uke: Number(previewUke), ar: Number(previewAar), fag: fag });
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
    const target = document.getElementById(cardId) || document.querySelector('#preview-container .preview-card');
    if (!target) return alert("Fant ikke kortet som skal kopieres.");

    if (s) {
        s.textContent = `Genererer bilde for ${fagnavn}...`;
        s.style.color = "#43b581";
    }

    html2canvas(target, { scale: 3, backgroundColor: null, logging: false, useCORS: true }).then(c => {
        c.toBlob(b => {
            try {
                navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => {
                    if (s) {
                        s.textContent = `Kopiert bilde for ${fagnavn}! ✅ (Klar til å limes inn i Teams / OneNote)`;
                        setTimeout(() => { if (s && s.textContent.includes(fagnavn)) s.textContent = ""; }, 4000);
                    }
                }).catch(err => {
                    if (s) {
                        s.textContent = "Feil ved kopiering til utklippstavle: " + err.message;
                        s.style.color = "#ef4444";
                    }
                });
            } catch (e) {
                if (s) {
                    s.textContent = "Nettleseren støtter ikke direkte bildekopiering.";
                    s.style.color = "#ef4444";
                }
            }
        });
    }).catch(err => {
        if (s) {
            s.textContent = "Feil ved bildegenerering: " + err.message;
            s.style.color = "#ef4444";
        }
    });
};

let pdfExportLastPath = null;

function openPdfExportModal() {
    const modal = document.getElementById('modal-pdf-export');
    const list = document.getElementById('pdf-export-fag-list');
    const showAll = document.getElementById('toggle-all-fag')?.checked || false;
    const singleFag = document.getElementById('preview-fag-select')?.value;
    const subjects = currentFagData.filter(f => f.skoleaar === currentSchoolYear);
    const uke = document.getElementById('preview-uke-input')?.value || document.getElementById('uke-input').value;

    document.getElementById('pdf-export-uke-label').textContent = uke;

    list.innerHTML = '';
    if (subjects.length === 0) {
        list.innerHTML = '<p style="color:#94a3b8; font-size:13px;">Ingen fag registrert for dette skoleåret.</p>';
    } else {
        subjects.forEach(f => {
            const checked = showAll || f.navn === singleFag;
            const row = document.createElement('label');
            row.className = 'switch-label';
            row.style.width = '100%';
            row.style.justifyContent = 'space-between';
            row.innerHTML = `<span>${f.navn}</span><span class="switch"><input type="checkbox" class="pdf-export-fag-checkbox" data-fag="${f.navn}" ${checked ? 'checked' : ''}><span class="slider"></span></span>`;
            list.appendChild(row);
        });
    }

    document.getElementById('pdf-export-view-select').style.display = '';
    document.getElementById('pdf-export-view-status').style.display = 'none';
    modal.style.display = 'block';
}

function closePdfExportModal() {
    document.getElementById('modal-pdf-export').style.display = 'none';
}

function showPdfExportStatus({ icon, iconColor, text, actions }) {
    document.getElementById('pdf-export-view-select').style.display = 'none';
    document.getElementById('pdf-export-view-status').style.display = '';
    document.getElementById('pdf-export-status-icon').innerHTML = `<i class="fas ${icon}" style="color:${iconColor};"></i>`;
    document.getElementById('pdf-export-status-text').textContent = text;
    document.getElementById('pdf-export-status-actions').innerHTML = actions
        .map(a => `<button class="btn ${a.cls}" data-action="${a.action}">${a.html}</button>`)
        .join('');
}

document.getElementById('lagre-pdf-btn')?.addEventListener('click', () => {
    const previewContainer = document.getElementById('preview-container');
    const status = document.getElementById('bilde-status');
    if (!previewContainer || !previewContainer.innerHTML.trim()) {
        if (status) { status.textContent = 'Ingen plan å lagre.'; status.style.color = '#e74c3c'; }
        return;
    }
    openPdfExportModal();
});

document.getElementById('pdf-export-avbryt-btn')?.addEventListener('click', closePdfExportModal);

document.getElementById('pdf-export-status-actions')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'close') {
        closePdfExportModal();
    } else if (btn.dataset.action === 'open-file' && pdfExportLastPath) {
        try { await invokeCommand('apne_pdf_fil', { sti: pdfExportLastPath }); } catch (err) { /* ignorer */ }
    } else if (btn.dataset.action === 'open-folder' && pdfExportLastPath) {
        invokeCommand('vis_pdf_i_utforsker', { sti: pdfExportLastPath });
    }
});

function stripHtmlToText(html) {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    container.querySelectorAll('p, li, br, div').forEach(el => {
        el.insertAdjacentText('afterend', '\n');
    });
    return container.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

document.getElementById('pdf-export-start-btn')?.addEventListener('click', async () => {
    const checkboxes = Array.from(document.querySelectorAll('.pdf-export-fag-checkbox:checked'));
    if (checkboxes.length === 0) {
        alert('Velg minst ett fag.');
        return;
    }

    const fagNavn = checkboxes.map(cb => cb.dataset.fag);
    const uke = document.getElementById('preview-uke-input')?.value || document.getElementById('uke-input').value;
    const aar = document.getElementById('aar-input').value;
    const hideHeader = document.getElementById('toggle-hide-header')?.checked || false;

    showPdfExportStatus({ icon: 'fa-spinner fa-spin', iconColor: '#6366f1', text: 'Genererer PDF...', actions: [] });

    try {
        const plans = await Promise.all(
            fagNavn.map(fag => invokeCommand('hent_plan', { uke: Number(uke), ar: Number(aar), fag }).catch(() => null))
        );
        const fagListe = plans
            .filter(p => p && (p.tema || p.aktivitet || p.arbeidskrav))
            .map(p => {
                const fagObj = currentFagData.find(f => f.navn === p.fag);
                const sprak = fagObj ? fagObj.sprak || "Bokmål" : "Bokmål";
                const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];
                return {
                    headerTekst: hideHeader ? null : p.fag,
                    ukeLabel: `${cfg.previewHeaders.weekPrefix} ${p.uke}`,
                    temaLabel: cfg.previewHeaders.topic,
                    aktivitetLabel: cfg.previewHeaders.activities,
                    arbeidskravLabel: cfg.previewHeaders.homework,
                    tema: p.tema || '-',
                    aktivitet: stripHtmlToText(p.aktivitet) || '-',
                    arbeidskrav: stripHtmlToText(p.arbeidskrav) || '-',
                };
            });

        if (fagListe.length === 0) {
            showPdfExportStatus({
                icon: 'fa-exclamation-triangle', iconColor: '#f59e0b',
                text: 'Ingen ukeplaner funnet for de valgte fagene denne uken.',
                actions: [{ action: 'close', cls: 'btn-secondary', html: 'Lukk' }],
            });
            return;
        }

        const result = await invokeCommand('lagre_forhandsvisning_som_pdf', { uke: Number(uke), fagListe });

        if (result) {
            pdfExportLastPath = result;
            showPdfExportStatus({
                icon: 'fa-check-circle', iconColor: '#43b581',
                text: `Lagret: ${result}`,
                actions: [
                    { action: 'open-folder', cls: 'btn-secondary', html: '<i class="fas fa-folder-open"></i> Åpne mappe' },
                    { action: 'open-file', cls: 'btn-success', html: '<i class="fas fa-file-pdf"></i> Åpne fil' },
                    { action: 'close', cls: 'btn-secondary', html: 'Lukk' },
                ],
            });
        } else {
            // result === null betyr at brukeren avbrøt lagre-dialogen — ingen feilmelding.
            closePdfExportModal();
        }
    } catch (e) {
        showPdfExportStatus({
            icon: 'fa-exclamation-triangle', iconColor: '#ef4444',
            text: 'Kunne ikke lagre PDF: ' + (e.message || e),
            actions: [{ action: 'close', cls: 'btn-secondary', html: 'Lukk' }],
        });
    }
});

document.getElementById('oppdater-preview-btn')?.addEventListener('click', () => renderPreview('preview-container'));
document.getElementById('kopier-bilde-btn')?.addEventListener('click', () => {
    const singleCard = document.getElementById('single-preview-card') || document.querySelector('#preview-container .preview-card');
    if (!singleCard) return alert("Ingen plan å kopiere.");
    const fag = document.getElementById('preview-fag-select')?.value || 'Ukeplan';
    window.kopierFagBilde('single-preview-card', fag);
});

async function loadSearchDropdown() {
    const s = document.getElementById('sok-fag');
    s.innerHTML = '';
    currentFagData.forEach(f => {
        const o = document.createElement('option');
        o.value = f.navn;
        o.textContent = `${f.navn} (${f.skoleaar})`;
        s.appendChild(o);
    });
    s.value = document.getElementById('fag-select').value;
}

window.utforSok = async function () {
    const c = document.getElementById('sok-resultat-container');
    c.innerHTML = '<p style="color:white; padding:10px;">Søker...</p>';
    try {
        const r = await invokeCommand('sok_planer', { fag: document.getElementById('sok-fag').value, q: document.getElementById('sok-tekst').value });
        c.innerHTML = '';
        if (r.length === 0) c.innerHTML = '<p style="color:white; padding:10px;">Ingen treff funnet.</p>';
        r.forEach(d => renderPreview('sok-resultat-container', d));
    } catch (e) {
        c.innerHTML = '<p style="color:red; padding:10px;">Feil ved søk.</p>';
    }
};

async function loadTimelineDropdown() {
    const s = document.getElementById('tidslinje-fag');
    s.innerHTML = '';
    currentFagData.forEach(f => {
        const o = document.createElement('option');
        o.value = f.navn;
        o.textContent = `${f.navn} (${f.skoleaar})`;
        s.appendChild(o);
    });
    s.value = document.getElementById('fag-select').value;
    hentTidslinje();
    s.onchange = hentTidslinje;
}

async function hentTidslinje() {
    const fagNavn = document.getElementById('tidslinje-fag').value;
    const c = document.getElementById('tidslinje-liste');
    c.innerHTML = '<p style="color:white; padding: 15px;">Laster...</p>';
    try {
        const r = await invokeCommand('hent_tidslinje', { fag: fagNavn });
        c.innerHTML = '';
        if (r.length === 0) {
            c.innerHTML = '<p style="color:white; padding: 15px;">Ingen planer funnet.</p>';
            return;
        }
        const fagObj = currentFagData.find(f => f.navn === fagNavn);
        const sprak = fagObj ? fagObj.sprak || "Bokmål" : "Bokmål";
        const cfg = SPRAK_CONFIG[sprak] || SPRAK_CONFIG["Bokmål"];

        r.forEach(d => {
            const i = document.createElement('div');
            i.className = 'timeline-item';
            i.innerHTML = `<div class="timeline-info">${cfg.editorHeaders.week} ${d.uke} - ${d.år}</div><div class="timeline-tema">${d.tema || 'Uten tema'}</div>`;
            i.onclick = async () => {
                const p = await invokeCommand('hent_plan', { uke: d.uke, ar: d.år, fag: fagNavn });
                visModalMedPlan(p);
            };
            c.appendChild(i);
        });
    } catch (e) {
        c.innerHTML = '<p style="color:red; padding: 15px;">Feil ved henting av tidslinje.</p>';
    }
}

function initDate() {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const wk = Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7) + 1;
    document.getElementById('uke-display').textContent = wk; document.getElementById('uke-input').value = wk; document.getElementById('aar-input').value = new Date().getFullYear();
    const realNextWeek = getRealWeek() + 1;
    const realNextWeekFixed = realNextWeek > 53 ? 1 : realNextWeek;
    if (wk === realNextWeekFixed) document.getElementById('uke-label').textContent = "Neste uke";
    else if (wk === getRealWeek()) document.getElementById('uke-label').textContent = "Denne uken";
    else document.getElementById('uke-label').textContent = "";
}

async function checkTauriUpdate(manual = false) {
    const notif = document.getElementById('notification');
    const notifMsg = document.getElementById('notification-message');
    const notifSubMsg = document.getElementById('notification-submessage');
    const restartBtn = document.getElementById('restart-button');
    const progressContainer = document.getElementById('update-progress-container');
    const progressBar = document.getElementById('update-progress-bar');
    const manualStatus = document.getElementById('manual-update-status');
    const manualBtn = document.getElementById('check-update-manual-btn');

    if (manual && manualStatus) {
        manualStatus.textContent = "Søker etter oppdateringer...";
        manualStatus.style.color = "#94a3b8";
        if (manualBtn) manualBtn.disabled = true;
    }

    try {
        if (window.__TAURI__ && window.__TAURI__.updater) {
            const update = await window.__TAURI__.updater.check();
            if (update) {
                console.log("Oppdatering funnet:", update);
                if (manual && manualStatus) {
                    manualStatus.textContent = `Ny versjon v${update.version} er tilgjengelig!`;
                    manualStatus.style.color = "#22c55e";
                }
                if (notif) {
                    if (notifMsg) notifMsg.textContent = `Ny versjon v${update.version} er tilgjengelig!`;
                    if (notifSubMsg) notifSubMsg.textContent = 'Klikk for å laste ned og restarte automatisk.';
                    if (progressContainer) progressContainer.style.display = 'none';
                    if (progressBar) progressBar.style.width = '0%';
                    notif.style.display = 'flex';
                }
                if (restartBtn) {
                    restartBtn.disabled = false;
                    restartBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Oppdater nå';
                    restartBtn.onclick = async () => {
                        restartBtn.disabled = true;
                        restartBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Forbereder...';
                        if (progressContainer) progressContainer.style.display = 'block';
                        if (notifSubMsg) notifSubMsg.textContent = 'Forbereder oppdatering...';

                        // 1. Frigjør backend-prosesser slik at filer ikke er låst ved overskriving
                        try {
                            await invokeCommand('prepare_for_update');
                        } catch (e) {
                            console.warn("Kunne ikke kjøre prepare_for_update:", e);
                        }

                        let downloaded = 0;
                        let contentLength = 0;

                        try {
                            await update.downloadAndInstall((event) => {
                                switch (event.event) {
                                    case 'Started':
                                        contentLength = event.data.contentLength || 0;
                                        if (progressContainer) progressContainer.style.display = 'block';
                                        restartBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Laster ned...';
                                        if (notifSubMsg) notifSubMsg.textContent = 'Laster ned...';
                                        break;
                                    case 'Progress':
                                        downloaded += event.data.chunkLength;
                                        if (contentLength > 0 && progressBar) {
                                            const pct = Math.min(100, Math.round((downloaded / contentLength) * 100));
                                            progressBar.style.width = `${pct}%`;
                                            const mb = (downloaded / (1024 * 1024)).toFixed(1);
                                            const totalMb = (contentLength / (1024 * 1024)).toFixed(1);
                                            if (notifSubMsg) notifSubMsg.textContent = `Laster ned: ${pct}% (${mb}/${totalMb} MB)`;
                                        }
                                        break;
                                    case 'Finished':
                                        if (progressBar) progressBar.style.width = '100%';
                                        if (notifSubMsg) notifSubMsg.textContent = 'Installerer og starter på nytt...';
                                        restartBtn.innerHTML = '<i class="fas fa-check"></i> Installert!';
                                        break;
                                }
                            });

                            if (notifSubMsg) notifSubMsg.textContent = 'Starter på nytt...';
                            await new Promise(r => setTimeout(r, 600));
                            await invokeCommand('restart_app');
                        } catch (err) {
                            console.error("Oppdateringsfeil:", err);
                            if (notifSubMsg) notifSubMsg.textContent = 'Feil: ' + (err.message || err);
                            restartBtn.disabled = false;
                            restartBtn.innerHTML = '<i class="fas fa-redo"></i> Prøv igjen';
                        }
                    };
                }
            } else {
                if (manual && manualStatus) {
                    manualStatus.textContent = "Du har allerede nyeste versjon!";
                    manualStatus.style.color = "#43b581";
                }
            }
        } else {
            if (manual && manualStatus) {
                manualStatus.textContent = "Oppdateringsfunksjon krever installert desktop-app.";
                manualStatus.style.color = "#f59e0b";
            }
        }
    } catch (e) {
        console.error("Feil ved sjekk etter oppdatering:", e);
        if (manual && manualStatus) {
            manualStatus.textContent = "Feil ved sjekk: " + (e.message || e);
            manualStatus.style.color = "#ef4444";
        }
    } finally {
        if (manual && manualBtn) {
            manualBtn.disabled = false;
        }
    }
}

document.getElementById('close-notification-btn')?.addEventListener('click', () => {
    const notif = document.getElementById('notification');
    if (notif) notif.style.display = 'none';
});

document.getElementById('check-update-manual-btn')?.addEventListener('click', () => {
    checkTauriUpdate(true);
});

async function initApp() {
    initDate();
    if (window.__TAURI__ && window.__TAURI__.app) {
        try {
            const ver = await window.__TAURI__.app.getVersion();
            const badge = document.getElementById('app-version-badge');
            const sidebarVer = document.getElementById('sidebar-version');
            if (badge) badge.textContent = `v${ver}`;
            if (sidebarVer) sidebarVer.textContent = `v${ver}`;
        } catch (e) { }
    }
    try {
        await loadSubjects();
        checkTauriUpdate();
    } catch (e) {
        console.error("Feil ved oppstart:", e);
    }
}

initApp();