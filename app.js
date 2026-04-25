// Version 21.0 - Stable Restored Iteration
// Supabase Configuration
const SUPABASE_URL = 'https://fzqifrigkenzugqveacs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ebz00mT4w6fuLbjridRPZQ_HSm48Vbp';
const USER_ID = 'default_user';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchInitialData() {
    updateSyncStatus(true);
    try {
        console.log("[CORE] Fetching initial cloud data...");
        // Parallel fetch for speed
        const [hRes, sRes, aRes, rRes, mRes, stRes, eRes, tlRes, tiRes, nRes] = await Promise.all([
            supabaseClient.from('rituals').select('*').eq('user_id', USER_ID),
            supabaseClient.from('habit_steps').select('*'),
            supabaseClient.from('attendance').select('*').eq('user_id', USER_ID),
            supabaseClient.from('reminders').select('*').eq('user_id', USER_ID),
            supabaseClient.from('manual_stats').select('*').eq('user_id', USER_ID),
            supabaseClient.from('stocks').select('*').eq('user_id', USER_ID),
            supabaseClient.from('expiry_items').select('*').eq('user_id', USER_ID),
            supabaseClient.from('task_lists').select('*').eq('user_id', USER_ID),
            supabaseClient.from('task_items').select('*'),
            supabaseClient.from('notes').select('*').eq('user_id', USER_ID)
        ]);

        if (hRes.data) habits = hRes.data.map(x => ({ 
            id: x.id, name: x.name, goal: x.goal, completedDates: x.completed_dates || [], history: x.history || {}, bestStreak: x.best_streak || 0
        }));
        if (sRes.data) habitSteps = sRes.data;
        if (aRes.data) attendance = aRes.data.map(x => ({ id: x.id, date: x.date, subject: x.subject, classHappened: x.class_happened, attended: x.attended }));
        if (rRes.data) reminders = rRes.data.map(x => ({ id: x.id, title: x.title, date: x.date, completed: x.completed }));
        if (mRes.data) {
            manualStats = {};
            mRes.data.forEach(item => { manualStats[item.subject] = { total: item.total, attended: item.attended }; });
        }
        if (stRes.data) stocks = stRes.data.map(x => ({ id: x.id, name: x.name, buy_price: x.buy_price, quantity: x.quantity }));
        if (eRes.data) expiryItems = eRes.data.map(x => ({ id: x.id, name: x.name, initialDays: x.days_left, createdAt: x.created_at }));
        if (tlRes.data) taskLists = tlRes.data;
        if (tiRes.data) taskItems = tiRes.data;
        if (nRes.data) notes = nRes.data.map(x => ({ id: x.id, title: x.title, content: x.content, created_at: x.created_at }));

        console.log(`[CORE] Data fully synced (${habits.length} rituals retrieved)`);
        renderPage();
        updateSyncStatus(false);
    } catch (err) {
        console.error("Fetch failed:", err);
        updateSyncStatus(false, true);
    }
}

function generateId() {
    try {
        if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
            return window.crypto.randomUUID();
        }
    } catch (e) {
        console.warn("randomUUID failed, using fallback");
    }
    // Fallback for non-secure contexts or older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const TIMETABLE = {
    "Monday": ["AP Lab", "AC Lab", "Workshop", "EG"],
    "Tuesday": ["Math", "Physics", "EG"],
    "Wednesday": ["Math", "Chemistry", "DSA 1", "DSA 2"], // DSA 3, 4 removed for v25.0
    "Thursday": ["ACAD", "IKS Lecture"],
    "Friday": ["IKS Practical", "Python 1", "Python 2"]
};
const baseSubs = ["AP Lab", "AC Lab", "Workshop", "EG", "Math", "Physics", "Chemistry", "DSA", "ACAD", "IKS Lecture", "IKS Practical", "Python"];



// State
let habits = [];
let attendance = [];
let reminders = [];
let stocks = []; // v30.0
let manualStats = {};
let currentEditingHabitId = null;
let currentEditingStockId = null; // v30.0
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let activeHabitForCalendar = null;
let currentView = 'dashboard';
let selectedDay = "";
let editMode = false;
let expiryItems = []; // v50.0 NEW
let habitSteps = []; // Compound habits
let currentModalSteps = [];
let notes = []; // Notes system v5.0 (Single source of truth)
let customSubjects = JSON.parse(localStorage.getItem('stellar_custom_subjects') || '{}');
let editingSubjectOriginalName = null;

// Timetable State 
let timetableEvents = [];
let ttSubjectsHistory = [];
let ttEventTypesHistory = [];
let ttSelectedDate = new Date();
let ttCurrentMonth = new Date();
let currentEditTtEventId = null;

// Central State Management (v85.0)
function getData(key) {
    try {
        const d = localStorage.getItem(key);
        return d ? JSON.parse(d) : [];
    } catch (e) {
        console.error(`Error loading data for key ${key}`, e);
        return [];
    }
}

function setData(key, value) {
    try {
        const json = JSON.stringify(value);
        localStorage.setItem(key, json);
        console.log(`[Storage] Updated: ${key}`);
    } catch (e) {
        console.error(`Error saving data for key ${key}`, e);
    }
}

let meditationExpanded = false;
let expandedRituals = new Set(); // Track expanded rituals for steps

function getSubjectDisplayName(sub, showType = true) {
    if (customSubjects[sub] && customSubjects[sub].name) {
        const type = customSubjects[sub].type || 'Session';
        return showType ? `${customSubjects[sub].name} (${type})` : customSubjects[sub].name;
    }
    return sub;
}

function getSubjectType(sub) {
    if (customSubjects[sub] && customSubjects[sub].type) return customSubjects[sub].type;
    return "";
}
async function renameHabit(id, oldName) {
    const newName = prompt("Enter new ritual name:", oldName);
    if (!newName || newName === oldName) return;
    const h = habits.find(x => x.id === id);
    if (!h) return;
    h.name = newName;
    await saveAndSync('rituals', habits);
}

async function deleteHabit(id) {
    if (!confirm("Are you sure you want to delete this ritual and all its history?")) return;
    try {
        console.log(`[CORE] Deleting Ritual: ${id}`);
        
        // 1. Instantly update UI (Optimistic Delete)
        habits = habits.filter(h => h.id !== id);
        habitSteps = habitSteps.filter(s => s.habit_id !== id);
        
        closeModal();
        renderHabits();
        renderDashboard();
        updateStats();
        saveToLocalStorage();

        // 2. Perform deletion in background
        const { error: hErr } = await supabaseClient.from('rituals').delete().eq('id', id);
        if (hErr) throw hErr;
        await supabaseClient.from('habit_steps').delete().eq('habit_id', id);
        
        console.log(`[CORE] Ritual ${id} deleted successfully from cloud.`);
    } catch (err) {
        console.error("Delete ritual failed:", err);
    }
}

// PWA Service Worker (v43.0)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Initial Load Consolidation (v46.0)
document.addEventListener('DOMContentLoaded', async () => {
    console.log("App Initializing...");
    
    // Load from LocalStorage first for instant UI (v46.0 Fallback)
    loadFromLocalStorage();
    renderPage();
    
    // Then sync with Supabase
   try {
    await fetchInitialData();
} catch (e) {
    console.warn("Cloud fetch failed, using local data");
}
    
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    selectedDay = (todayIndex >= 1 && todayIndex <= 5) ? dayNames[todayIndex] : "Monday";
    
    // NAVIGATION BUG FIX: Only force dashboard if currentView is the default 'dashboard'
    // This prevents auto-resetting when user navigates during initialization
    if (currentView === 'dashboard') switchView('dashboard');
    selectDay(selectedDay);

 

    // Auto-refresh stocks every 60s
    //setInterval(async () => {
       // await fetchInitialData(); 
      //  if (stocks.length > 0) fetchLivePrices(); 
  //  }, 60000);
});

function saveToLocalStorage() {
    const backup = { habits, attendance, reminders, stocks, manualStats, expiryItems, habitSteps, taskLists, taskItems, notes, timetableEvents, ttSubjectsHistory, ttEventTypesHistory };
    localStorage.setItem('stellar_backup', JSON.stringify(backup));
    console.log("Local backup saved with all data modules.");
}

// --- Background Sync Polling (v26.0) ---
//setInterval(async () => {
  //  if (document.visibilityState === 'visible') {
       // console.log("[SYNC] Background syncing with cloud...");
       // await fetchInitialData(); 
       // if (stocks.length > 0) fetchLivePrices(); 
  //  }
//}, 60000); // 1 minute auto-sync

function loadFromLocalStorage() {
    const data = localStorage.getItem('stellar_backup');
    if (data) {
        try {
            const parsed = JSON.parse(data);
            if (parsed.habits) habits = parsed.habits;
            if (parsed.attendance) attendance = parsed.attendance;
            if (parsed.reminders) reminders = parsed.reminders;
            if (parsed.stocks) stocks = parsed.stocks;
            if (parsed.manualStats) manualStats = parsed.manualStats;
            if (parsed.expiryItems) expiryItems = parsed.expiryItems;
            if (parsed.habitSteps) habitSteps = parsed.habitSteps;
            if (parsed.taskLists) taskLists = parsed.taskLists;
            if (parsed.taskItems) taskItems = parsed.taskItems;
            if (parsed.notes) notes = parsed.notes;
            if (parsed.timetableEvents) timetableEvents = parsed.timetableEvents;
            if (parsed.ttSubjectsHistory) ttSubjectsHistory = parsed.ttSubjectsHistory;
            if (parsed.ttEventTypesHistory) ttEventTypesHistory = parsed.ttEventTypesHistory;

            console.log("Restored all modules from local backup.");
            renderHabits(); renderAttendanceSummary(); renderReminders(); renderDashboard(); renderNotesBoard(); renderStocks();
        } catch (e) { console.error("Local load failed", e); }
    }
}

function updateSyncStatus(isSyncing, error = false) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    if (isSyncing) {
        el.className = 'sync-status-indicator syncing';
        el.title = "Syncing with cloud...";
    } else if (error) {
        el.className = 'sync-status-indicator error';
        el.title = "Cloud sync failed. Working offline.";
    } else {
        el.className = 'sync-status-indicator synced';
        el.title = "Synced with cloud";
    }
}

// --- Navigation & Drawer ---
function toggleDrawer() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawer-overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
    overlay.classList.toggle('hidden');
}

function navigate(view) {
    if (view === currentView) return;
    switchView(view);
}

/**
 * Universal Page Rendering Engine (v80.0)
 * Forces immediate UI update after data changes
 */
function renderPage(view) {
    if (!view) view = currentView;
    console.log(`[UI] Refreshing View: ${view}`);
    const addBtn = document.getElementById('header-add-btn');

if (view === 'notes') {
    addBtn.style.display = 'flex';
} else {
    addBtn.style.display = 'none';
}
    
    if (view === 'dashboard') { renderDashboard(); renderReminders(); renderStocksDashboard(); }
    else if (view === 'habits') renderHabits();
    else if (view === 'attendance') { renderSubjects(); renderAttendanceSummary(); }
    else if (view === 'reminders') { renderFullReminders(); renderReminders(); }
    else if (view === 'notes') renderNotesBoard();
    else if (view === 'stocks') renderStocks();
    else if (view === 'expiry') renderExpiryTracker();
    else if (view === 'timetable') renderTimetable();
}

function switchView(view) {
    console.log(`[NAV] Switching to: ${view}`);
    currentView = view;
    
    // 1. Sidebar/Drawer Auto-Close
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) toggleDrawer();

    // 2. Update Views visibility
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const targetEl = document.getElementById(`${view}-view`);
    if (targetEl) targetEl.classList.remove('hidden');

    // 3. Update Nav Active States (Sidebar)
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        if (btn.id === `nav-${view}`) btn.classList.add('active');
    });

    // 4. Update Bottom Nav Active States
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes(`'${view}'`)) btn.classList.add('active');
    });

    // 5. Header Plus Button Visibility
    const headerAddBtn = document.getElementById('header-add-btn');
    if (headerAddBtn) {
        const showOn = ['habits', 'notes', 'reminders', 'stocks', 'expiry', 'timetable'];
        if (showOn.includes(view)) {
            headerAddBtn.classList.remove('hidden');
            headerAddBtn.style.setProperty("display", "flex", "important");
        } else {
            headerAddBtn.classList.add('hidden');
            headerAddBtn.style.setProperty("display", "none", "important");
        }
    }

    // 6. Refresh View Data
    renderPage(view);
}

/**
 * Contextual Add Function Router
 */
function handleAdd() {
    const view = String(currentView).trim().toLowerCase();
    
    if (view === 'habits') openAddRitual();
    else if (view === 'notes') openAddNote();
    else if (view === 'reminders') openAddReminder();
    else if (view === 'stocks') openAddStock();
    else if (view === 'expiry') openAddExpiry();
    else if (view === 'timetable') openAddTimetableEvent();
    else console.warn("No 'Add' action defined for view:", view);
}

function openAddRitual() { openModal(); }
function openAddNote() {
    document.getElementById('note-modal').classList.remove('hidden');
}
function openAddReminder() { openReminderModal(); }
function openAddStock() { openStockModal(); }
function openAddExpiry() { openExpiryModal(); }

function handleEdit() {
    if (currentView === 'attendance') {
        const toggle = document.getElementById('edit-mode-toggle');
        if (toggle) {
            toggle.checked = !toggle.checked;
            toggleEditMode();
        }
    } else {
        console.log("Edit mode only available in Academy Tracker.");
    }
}

function toggleMobileClassTracker() {
    const wrapper = document.getElementById('class-tracker-wrapper');
    if (wrapper) {
        wrapper.classList.toggle('open');
        const btn = document.getElementById('toggle-class-tracker');
        if (btn) {
            btn.innerHTML = wrapper.classList.contains('open') ? '<span>✕</span> Close Tracker' : '<span>📅</span> Edit Class Tracker';
        }
    }
}

function selectDay(day) {
    selectedDay = day;
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`day-${day}`);
    if (btn) btn.classList.add('active');
    const el = document.getElementById('selected-date-display');
    if (el) el.innerText = `${selectedDay} Session`;
    renderSubjects();
}

// --- Dashboard ---
function renderDashboard() {
    const alertContainer = document.getElementById('priority-alert-container');
    if (alertContainer) {
        alertContainer.innerHTML = '';
        const expired = expiryItems.filter(item => calculateDaysLeft(item.createdAt, item.initialDays) <= 0);
        if (expired.length > 0) {
            const alertCard = document.createElement('div');
            alertCard.className = 'priority-alert-card';
            alertCard.innerHTML = `
                <div class="alert-icon">⚠️</div>
                <div class="alert-content">
                    <strong>Expiry Alert</strong>
                    <p>${expired.map(i => i.name).join(', ')} expired today</p>
                </div>
            `;
            alertContainer.appendChild(alertCard);
        }
    }

    const expiryList = document.getElementById('dashboard-expiry-list');
    if (expiryList) {
        expiryList.innerHTML = '';
        const activeItems = expiryItems.filter(item => calculateDaysLeft(item.createdAt, item.initialDays) > 0);
        if (activeItems.length === 0) {
            expiryList.innerHTML = '<div class="empty-msg" style="padding:1rem 0; font-size:0.9rem; color:var(--text-dim);">No expiring items</div>';
        } else {
            activeItems.sort((a,b) => calculateDaysLeft(a.createdAt, a.initialDays) - calculateDaysLeft(b.createdAt, b.initialDays)).slice(0, 4).forEach(item => {
                const daysLeft = calculateDaysLeft(item.createdAt, item.initialDays);
                const el = document.createElement('div');
                el.className = 'ritual-card-mini dashboard-expiry-item';
                el.innerHTML = `
                    <div class="ritual-info" style="flex:1;">
                        <span class="ritual-name">${item.name}</span>
                    </div>
                    <div class="ritual-streak" style="background:${daysLeft === 1 ? 'rgba(251,191,36,0.1)' : 'transparent'}; color:${daysLeft === 1 ? '#fbbf24' : 'var(--text-dim)'}; border:${daysLeft === 1 ? '1px solid rgba(251,191,36,0.3)' : 'none'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; margin-right: 10px;">
                        ${daysLeft} d 
                    </div>
                `;
                el.onclick = () => navigate('expiry');
                expiryList.appendChild(el);
            });
        }
    }

    const hList = document.getElementById('habits-preview-list');
    if (hList) {
        hList.innerHTML = '';
        const today = new Date().toLocaleDateString("en-CA");
        const sortedHabits = [...habits].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 4);
        
        sortedHabits.forEach(h => {
            const isDone = h.completedDates.includes(today);
            const streak = calculateStreak(h);
            const div = document.createElement('div');
            div.className = `ritual-card-mini ${isDone ? 'completed' : ''}`;
            div.innerHTML = `
                <div class="ritual-info" onclick="navigate('habits')">
                    <span class="ritual-name">${h.name}</span>
                    <span class="ritual-streak-inline">🔥 ${streak}</span>
                </div>
                <div class="status-indicator">${isDone ? '✦' : '✧'}</div>
            `;
            hList.appendChild(div);
        });
    }

    const aList = document.getElementById('attendance-preview-list');
    if (aList) {
        aList.innerHTML = '';
        const subjectsToRender = [...new Set([...baseSubs, ...Object.keys(customSubjects)])].slice(0, 4);
        subjectsToRender.forEach(sub => {
            const stats = getSubjectStats(sub);
            const perc = stats.total > 0 ? (stats.attended / stats.total * 100).toFixed(0) : 0;
            const div = document.createElement('div');
            div.className = 'ritual-card-mini academy-card-mini view-only'; 
            div.innerHTML = `
                <div class="ritual-info">
                    <span class="ritual-name">${getSubjectDisplayName(sub, false)}</span>
                </div>
                <div class="habit-streak" style="background:transparent; padding:0; font-size:1rem;">
                    → ${perc}%
                </div>
            `;
            aList.appendChild(div);
        });
        
        let totalC = 0; let totalA = 0;
        baseSubs.forEach(sub => { const s = getSubjectStats(sub); totalC += s.total; totalA += s.attended; });
        const overall = (totalC > 0 ? (totalA / totalC * 100).toFixed(0) : 0);
        const badge = document.getElementById('overall-attendance-badge');
        if (badge) badge.innerText = `${overall}% Overall`;
    }

    renderReminders();
    renderStocksDashboard();
    renderNotesBoard();
}

function renderStocksDashboard() {
    const list = document.getElementById('stocks-summary');
    if (!list) return;
    list.innerHTML = '';
    
    if (stocks.length === 0) {
        list.innerHTML = '<p class="empty-msg">No stocks added yet.</p>';
        return;
    }

    stocks.slice(0, 4).forEach(s => {
        const cur = s.current_price || s.buy_price;
        const profit = (cur - s.buy_price) * s.quantity;
        const perc = ((profit / (s.buy_price * s.quantity)) * 100).toFixed(1);
        
        const div = document.createElement('div');
        div.className = 'ritual-card-mini view-only row-compact';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.innerHTML = `
            <div class="ritual-info" style="flex:1;">
                <span class="ritual-name" style="font-weight:700;">${s.name.toUpperCase()}</span>
                <span style="font-size:0.75rem; color:var(--text-dim); margin-left:8px;">₹${cur}</span>
            </div>
            <div class="${profit >= 0 ? 'success-text' : 'error-text'}" style="font-weight:800; font-size:0.95rem;">
                ${profit >= 0 ? '▲' : '▼'} ${Math.abs(perc)}%
            </div>
        `;
        list.appendChild(div);
    });
}

function getSubjectStats(sub) {
    const manual = manualStats[sub] || { total: 0, attended: 0 };
    // Multi-slot matching: "DSA" matches "DSA 1", "DSA 2", etc.
    const logs = attendance.filter(a => a.subject === sub || a.subject.startsWith(sub + " "));
    const loggedTotal = logs.filter(l => l.classHappened).length;
    const loggedAttended = logs.filter(l => l.attended).length;
    return { total: manual.total + loggedTotal, attended: manual.attended + loggedAttended };
}

function renderSubjects() {
    const container = document.getElementById('subjects-container');
    if (!container) return;
    container.innerHTML = '';
    const canEdit = editMode;
    const subjects = TIMETABLE[selectedDay] || [];
    
    subjects.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'subject-card glass-card';
        div.dataset.subject = sub;
        
        div.innerHTML = `
            <div class="left" onclick="if(editMode) openClassSubjectModal('${sub}')" style="cursor: ${canEdit ? 'pointer' : 'default'};" title="${canEdit ? 'Click to rename' : ''}">
                <div class="subject-name">${getSubjectDisplayName(sub, false)}</div>
                <div class="subject-type">${getSubjectType(sub)}</div>
            </div>
            <div class="right">
                <div class="toggle-group">
                    <label>Happened</label>
                    <label class="toggle-switch">
                        <input type="checkbox" class="class-happened" onchange="validateCheck(this)" ${!canEdit ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="toggle-group">
                    <label>Attended</label>
                    <label class="toggle-switch">
                        <input type="checkbox" class="attended" disabled onchange="handleMutual(this, '${sub}')" ${!canEdit ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function validateCheck(cb) {
    const row = cb.closest('.subject-card');
    const att = row.querySelector('.attended');
    att.disabled = !cb.checked;
    if (!cb.checked) att.checked = false;
}

function handleMutual(cb, sub) {
    if (selectedDay !== 'Monday' || !cb.checked) return;
    const rows = document.querySelectorAll('.subject-card');
    if (sub === 'AP Lab') {
        const ac = Array.from(rows).find(r => r.dataset.subject === 'AC Lab');
        if (ac) ac.querySelector('.attended').checked = false;
    } else if (sub === 'AC Lab') {
        const ap = Array.from(rows).find(r => r.dataset.subject === 'AP Lab');
        if (ap) ap.querySelector('.attended').checked = false;
    }
}

async function saveAttendanceDay() {
    try {
        const today = new Date().toLocaleDateString('en-CA');
        const rows = document.querySelectorAll('.subject-card');
        rows.forEach(row => {
            const sub = row.dataset.subject;
            const happened = row.querySelector('.class-happened').checked;
            const attended = row.querySelector('.attended').checked;
            
            if (happened) {
                const existing = attendance.find(a => a.date === today && a.subject === sub);
                if (!existing) {
                    attendance.push({ 
                        id: generateId(), 
                        date: today, 
                        subject: sub, 
                        classHappened: true, 
                        attended, 
                        user_id: USER_ID 
                    });
                } else {
                    existing.attended = attended;
                }
            }
        });

        await saveAndSync('attendance', attendance); 
        renderAttendanceSummary(); 
        renderDashboard();
        
        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        const currIdx = days.indexOf(selectedDay);
        if (currIdx !== -1) {
            const nextIdx = (currIdx + 1) % days.length;
            selectedDay = days[nextIdx];
            selectDay(selectedDay);
            alert(`Attendance saved. Moved to ${selectedDay}!`);
        } else {
            alert("Attendance saved!");
        }
    } catch (err) {
        console.error("Save failed:", err);
        alert("Action failed. Check console.");
    }
}

function renderAttendanceSummary() {
    const summary = document.getElementById('attendance-summary');
    if (!summary) return;
    summary.innerHTML = '';

    const subjectsToRender = [...new Set([...baseSubs, ...Object.keys(customSubjects)])].sort();


    subjectsToRender.forEach(sub => {
        const stats = getSubjectStats(sub);
        const perc = stats.total > 0 ? (stats.attended / stats.total * 100).toFixed(1) : 0;
        const card = document.createElement('div');
        card.className = 'glass-card stat-card';
        card.style.marginBottom = '1.2rem';
        
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">
                <strong>${getSubjectDisplayName(sub, false)}</strong> 
                <div style="display:flex; gap:10px; align-items:center;">
                    <span style="color:var(--primary); font-weight:800;">${perc}%</span>
                    <button class="secondary modern-btn ${!editMode ? 'hidden' : ''}" style="padding:4px 8px; font-size:0.7rem; box-shadow:none;" onclick="openEditAttendanceStats('${sub}')">Edit</button>
                </div>
            </div>
            <div style="font-size:0.85rem;color:var(--text-dim);">
                <span>Total: ${stats.total} | Attended: ${stats.attended}</span>
            </div>
            <div class="progress-bar" style="height:4px;margin-top:0.8rem;background:rgba(255,255,255,0.05);border-radius:100px;overflow:hidden">
                <div class="progress-fill" style="width:${perc}%;height:100%;transition:0.3s;background:var(--primary)"></div>
            </div>
        `;
        summary.appendChild(card);
    });
}

function openEditAttendanceStats(sub) {
    const stats = manualStats[sub] || { total: 0, attended: 0 };
    const newTotal = prompt(`Enter Total classes for ${sub}:`, stats.total);
    if (newTotal === null) return;
    const newAttended = prompt(`Enter Attended classes for ${sub}:`, stats.attended);
    if (newAttended === null) return;
    
    manualStats[sub] = { 
        total: parseInt(newTotal) || 0, 
        attended: parseInt(newAttended) || 0 
    };
    
    console.log(`Updated manual stats for ${sub}:`, manualStats[sub]);
    saveAndSync('manual_stats', manualStats);
    renderAttendanceSummary();
    renderDashboard();
}

function updateManualStat(sub, type, val) {
    if (!manualStats[sub]) manualStats[sub] = { total: 0, attended: 0 };
    manualStats[sub][type] = parseInt(val) || 0;
    saveAndSync('manual_stats', manualStats); renderAttendanceSummary(); renderDashboard();
}

function openClassSubjectModal(sub) {
    editingSubjectOriginalName = sub;
    const m = document.getElementById('class-subject-modal');
    if (!m) return;
    document.getElementById('class-subject-name').value = customSubjects[sub]?.name || sub;
    document.getElementById('class-subject-type').value = customSubjects[sub]?.type || 'Lecture';
    m.classList.remove('hidden');
    m.classList.add('visible');
}

function closeClassSubjectModal() {
    const m = document.getElementById('class-subject-modal');
    if (m) { m.classList.remove('visible'); m.classList.add('hidden'); }
}

function saveClassSubject() {
    console.log("SAVE TRIGGERED: Class Subject");
    const name = document.getElementById('class-subject-name').value.trim();
    const type = document.getElementById('class-subject-type').value.trim();
    if (!name) return;
    
    customSubjects[editingSubjectOriginalName] = { name, type };
    localStorage.setItem('stellar_custom_subjects', JSON.stringify(customSubjects));
    closeAllModals();
    renderPage('attendance');
    renderPage('dashboard');
}

function toggleEditMode() {
    editMode = document.getElementById('edit-mode-toggle').checked;
    renderSubjects();
    renderAttendanceSummary();
}

function isDayLocked(day) {
    if (editMode) return false;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    const targetIndex = dayNames.indexOf(day);
    return targetIndex < todayIndex;
}

function unlockApp() { 
    const lock = document.getElementById('lock-screen');
    if (lock) lock.classList.add('hidden'); 
    document.getElementById('app-container').classList.remove('hidden'); 
}

async function saveAndSync(table, data) {
    try {
        console.log(`Syncing ${table} to Supabase...`, data);
        let payload;
        if (table === 'rituals') {
            payload = data.map(h => ({ 
                id: h.id, user_id: USER_ID, name: h.name, goal: h.goal, completed_dates: h.completedDates || []
            }));
        } else if (table === 'attendance') {
            payload = data.map(a => ({ 
                id: a.id, user_id: USER_ID, date: a.date, subject: a.subject, class_happened: a.classHappened || false, attended: a.attended || false 
            }));
        } else if (table === 'reminders') {
            payload = data.map(r => ({ 
                id: r.id, user_id: USER_ID, title: r.title, date: r.date, completed: r.completed || false 
            }));
        } else if (table === 'manual_stats') {
            payload = Object.keys(data).map(s => ({ subject: s, total: data[s].total, attended: data[s].attended, user_id: USER_ID }));
        } else if (table === 'stocks') {
            payload = data.map(s => ({ id: s.id, user_id: USER_ID, name: s.name, buy_price: s.buy_price, quantity: s.quantity }));
        } else if (table === 'expiry_items') {
            payload = data.map(e => ({ id: e.id, user_id: USER_ID, name: e.name, days_left: e.initialDays, created_at: e.createdAt }));
        } else if (table === 'notes') {
            payload = data.map(n => ({ id: n.id, user_id: USER_ID, title: n.title, content: n.content, created_at: n.created_at }));
        } else if (table === 'task_lists') {
            payload = data.map(l => ({ id: l.id, user_id: USER_ID, title: l.title, created_at: l.created_at }));
        } else if (table === 'task_items') {
            payload = data.map(it => ({ id: it.id, list_id: it.list_id, content: it.content, is_checked: it.is_checked, type: it.type || 'task', created_at: it.created_at }));
        }

        if (payload) {
            const { error } = await supabaseClient.from(table).upsert(payload);
            if (error) throw error;
            console.log(`Synced ${table} successfully`);
        }

        saveToLocalStorage();
    } catch (e) {
        console.error(`Sync failed for ${table}:`, e);
        saveToLocalStorage();
    }
}

// --- Reminders ---
function openReminderModal() { 
    console.log("Opening Reminder Modal");
    const m = document.getElementById('reminder-modal');
    if (m) {
        m.classList.remove('hidden'); 
        m.classList.add('visible');
    }
}
function closeReminderModal() { 
    const m = document.getElementById('reminder-modal');
    if (m) {
        m.classList.remove('visible');
        m.classList.add('hidden'); 
    }
}

async function saveReminder() {
    console.log("SAVE TRIGGERED: Reminder");
    const title = document.getElementById('rem-title').value.trim();
    const date = document.getElementById('rem-date').value;
    if (!title || !date) return;
    
    const newRem = { id: generateId(), title, date, completed: false };
    reminders.push(newRem);
    
    closeAllModals();
    renderPage('reminders');
    renderPage('dashboard');
    await saveAndSync('reminders', reminders);
}

function renderReminders() {
    const dashList = document.getElementById('dashboard-reminders');
    if (!dashList) return;
    dashList.innerHTML = '';
    
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
    const activeReminders = reminders.filter(r => !r.completed);
    
    // Check priority
    const hasToday = activeReminders.some(r => r.date <= todayStr);
    const remCard = document.getElementById('dashboard-reminder-card');
    if (remCard) {
        if (hasToday) {
            remCard.style.order = '-2';
        } else {
            remCard.style.order = '4'; // fallback position matching initial CSS order approx
        }
    }

    if (activeReminders.length === 0) {
        dashList.innerHTML = '<div class="empty-msg" style="padding:1rem 0; font-size:0.9rem; color:var(--text-dim);">No pending reminders</div>';
        return;
    }
    
    // Sort logic for Dashboard: Today/Overdue first, then upcoming
    const sorted = [...activeReminders].sort((a,b) => {
        const aUrgent = a.date <= todayStr;
        const bUrgent = b.date <= todayStr;
        if (aUrgent && !bUrgent) return -1;
        if (!aUrgent && bUrgent) return 1;
        return new Date(a.date) - new Date(b.date);
    });

    sorted.slice(0, 4).forEach(rem => {
        const isToday = rem.date <= todayStr;
        const div = document.createElement('div');
        div.className = `reminder-item row-compact ${isToday ? 'reminder-today-highlight' : ''}`;
        div.id = `rem-card-${rem.id}`;
        div.style.cursor = 'pointer';
        div.onclick = () => navigate('reminders');
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; flex:1;">
                <span class="rem-title" style="font-weight:700; color:${isToday ? 'var(--primary)' : 'var(--text-color)'}; font-size:0.9rem;">${rem.title}</span>
                <span class="rem-date" style="font-size:0.75rem; color:var(--text-dim); opacity:0.7;">${isToday ? '⚠ ' : ''}${formatDate(rem.date)}</span>
            </div>
            <div style="font-size:1.1rem; color:var(--text-dim); opacity:0.4;">→</div>
        `;
        dashList.appendChild(div);
    });
}

function formatDate(ds) {
    if (!ds) return '--/--/----';
    const d = new Date(ds);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

function renderFullReminders() {
    const activeList = document.getElementById('full-reminders-list');
    const completedList = document.getElementById('completed-reminders-list');
    const completedSection = document.getElementById('completed-reminders-section');
    
    if (!activeList || !completedList) return;
    
    activeList.innerHTML = '';
    completedList.innerHTML = '';
    
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
    const activeReminders = reminders.filter(r => !r.completed);
    const completedReminders = reminders.filter(r => r.completed);
    
    const todayReminders = activeReminders.filter(r => r.date === todayStr);
    const upcomingReminders = activeReminders.filter(r => r.date > todayStr).sort((a, b) => new Date(a.date) - new Date(b.date));
    const backlogReminders = activeReminders.filter(r => r.date < todayStr).sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const renderItems = (items, container, isHighlight = false) => {
        items.forEach(rem => {
            const card = document.createElement('div');
            card.className = `reminder-card-modern ${rem.completed ? 'completed' : ''} ${isHighlight ? 'urgent-highlight' : ''}`;
            card.id = `rem-card-full-${rem.id}`;
            card.innerHTML = `
                <div class="rem-content-main">
                    <span class="rem-title-modern" style="${isHighlight ? 'color: var(--primary);' : ''}">${rem.title}</span>
                    <span class="rem-date-modern" style="${isHighlight ? 'color: var(--primary); opacity:0.8;' : ''}">
                        ${isHighlight && !rem.completed ? '⚠ ' : ''}${formatDate(rem.date)}
                    </span>
                </div>
                <div class="rem-actions-modern">
                    <button class="rem-btn complete-btn ${rem.completed ? 'completed-active' : ''}" onclick="toggleReminder('${rem.id}')" style="${isHighlight && !rem.completed ? 'border-color:var(--primary); color:var(--primary);' : ''}">
                        ✓
                    </button>
                    <button class="rem-btn delete-btn-modern" onclick="deleteReminder('${rem.id}')">
                        ✕
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    };

    if (backlogReminders.length > 0) {
        const h = document.createElement('h3'); h.className = 'rem-section-title'; h.innerText = '⚠️ Overdue';
        activeList.appendChild(h);
        renderItems(backlogReminders, activeList, true);
    }
    if (todayReminders.length > 0) {
        const h = document.createElement('h3'); h.className = 'rem-section-title'; h.innerText = '📅 Today';
        activeList.appendChild(h);
        renderItems(todayReminders, activeList, true);
    }
    if (upcomingReminders.length > 0) {
        const h = document.createElement('h3'); h.className = 'rem-section-title'; h.innerText = '🚀 Upcoming';
        activeList.appendChild(h);
        renderItems(upcomingReminders, activeList, false);
    }

    if (completedReminders.length > 0) {
        completedSection.classList.remove('hidden');
        renderItems(completedReminders.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 15), completedList, false);
    } else {
        completedSection.classList.add('hidden');
    }

    if (activeReminders.length === 0) {
        activeList.innerHTML = '<div class="empty-state-modern">No pending reminders here.</div>';
    }
}

function toggleCompletedReminders() {
    const list = document.getElementById('completed-reminders-list');
    const icon = document.getElementById('completed-toggle-icon');
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        icon.innerText = '▼';
    } else {
        list.classList.add('hidden');
        icon.innerText = '▶';
    }
}

async function toggleReminder(id) {
    const rem = reminders.find(r => r.id === id);
    if (!rem) return;
    
    const cardDash = document.getElementById(`rem-card-${id}`);
    const cardFull = document.getElementById(`rem-card-full-${id}`);
    
    if (cardDash) {
        cardDash.style.transform = "scale(0.95)";
        cardDash.style.opacity = "0";
    }
    if (cardFull) {
        cardFull.style.transform = "scale(0.95)";
        cardFull.style.opacity = "0";
    }

    setTimeout(async () => {
        rem.completed = !rem.completed;
        await saveAndSync('reminders', reminders);
        renderReminders();
        renderFullReminders();
    }, 250);
}

async function deleteReminder(id) {
    try {
        const { error } = await supabaseClient.from('reminders').delete().eq('id', id);
        if (error) throw error;
        await fetchInitialData();
    } catch (err) {
        console.error("Delete reminder failed:", err);
    }
}

// --- Expiry Tracker (v50.0) ---
function calculateDaysLeft(createdAtStr, initialDays) {
    const created = new Date(createdAtStr);
    const now = new Date();
    
    // Normalize to midnight for calendar-based logic
    const createdDate = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffTime = nowDate - createdDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return initialDays - diffDays;
}

function renderExpiryTracker() {
    const list = document.getElementById('expiry-list');
    if (!list) return;
    list.innerHTML = '';

    if (expiryItems.length === 0) {
        list.innerHTML = '<div class="empty-state-modern">No items tracked. Add your first item!</div>';
        return;
    }

    expiryItems.forEach(item => {
        const daysLeft = calculateDaysLeft(item.createdAt, item.initialDays);
        let statusClass = 'status-normal';
        if (daysLeft === 1) statusClass = 'status-warning';
        if (daysLeft <= 0) statusClass = 'status-expired';

        const card = document.createElement('div');
        card.className = `expiry-card glass-card ${statusClass}`;
        card.innerHTML = `
            <div class="exp-info">
                <span class="exp-name">${item.name}</span>
                <span class="exp-days">${daysLeft} days left</span>
            </div>
            <div class="exp-status-badge">${daysLeft <= 0 ? 'EXPIRED' : daysLeft === 1 ? 'LOW' : 'GOOD'}</div>
            <button class="delete-btn-modern" onclick="deleteExpiryItem('${item.id}')" title="Delete">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            </button>
        `;
        list.appendChild(card);
    });
}

function openExpiryModal() {
    console.log("Opening Expiry Modal");
    const modal = document.getElementById('expiry-modal');
    if (!modal) {
        console.error("Expiry modal not found in DOM");
        return;
    }
    document.getElementById('exp-name').value = '';
    document.getElementById('exp-days').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('visible');
}

function closeExpiryModal() {
    console.log("Closing Expiry Modal");
    const modal = document.getElementById('expiry-modal');
    if (modal) {
        modal.classList.remove('visible');
        modal.classList.add('hidden');
    }
}

async function saveExpiryItem() {
    const name = document.getElementById('exp-name').value.trim();
    const days = parseInt(document.getElementById('exp-days').value);

    if (!name || isNaN(days)) return;

    try {
        const dbItem = {
            id: generateId(),
            user_id: USER_ID,
            name: name,
            days_left: days,
            created_at: new Date().toISOString()
        };
        
        const localItem = {
            id: dbItem.id,
            name: dbItem.name,
            initialDays: dbItem.days_left,
            createdAt: dbItem.created_at
        };

        expiryItems.push(localItem);
        closeExpiryModal();
        saveToLocalStorage(); 
        renderPage();

        try {
            if (supabaseClient) {
                const { error } = await supabaseClient.from('expiry_items').insert([dbItem]);
                if (error) throw error;
            }
        } catch (syncErr) {
            console.warn("Backend sync failed for expiry", syncErr);
        }
    } catch (err) {
        console.error("Save expiry item failed:", err);
        closeExpiryModal();
    }
}

async function deleteExpiryItem(id) {
    if (!confirm("Are you sure?")) return;
    try {
        const { error } = await supabaseClient.from('expiry_items').delete().eq('id', id);
        if (error) throw error;
        await fetchInitialData();
    } catch (err) {
        console.error("Delete expiry failed:", err);
    }
}


// --- Common ---
function handleRitualClick(id) {
    const h = habits.find(x => x.id === id);
    if (!h) return;
    
    if (h.name.toLowerCase() === 'meditation') {
        meditationExpanded = !meditationExpanded;
        renderHabits();
        return;
    }
    
    const hSteps = habitSteps.filter(s => s.habit_id === id);
    if (hSteps.length > 0) {
        if (expandedRituals.has(id)) expandedRituals.delete(id);
        else expandedRituals.add(id);
        renderHabits();
    }
}

function calculateStreak(h) {
    let s = 0; let d = new Date(); const today = d.toLocaleDateString("en-CA");
    if (!h.completedDates.includes(today)) d.setDate(d.getDate()-1);
    while (h.completedDates.includes(d.toLocaleDateString("en-CA"))) { s++; d.setDate(d.getDate()-1); }
    
    // Update Best Streak
    if (!h.bestStreak || s > h.bestStreak) {
        h.bestStreak = s;
    }
    return s;
}

function renderHabits() {
    const l = document.getElementById('habit-list'); 
    if (!l) return; 
    l.innerHTML = '';
    const today = new Date().toLocaleDateString("en-CA");
    const sortedHabits = [...habits].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedHabits.forEach(h => {
        const isDone = h.completedDates.includes(today);
        const currentStreak = calculateStreak(h);
        const hSteps = habitSteps.filter(s => s.habit_id === h.id);
        const totalSteps = hSteps.length;
        const compSteps = hSteps.filter(s => s.completed).length;
        
        let progressHtml = '';
        if (totalSteps > 0) {
            const perc = (compSteps / totalSteps) * 100;
            progressHtml = `
            <div class="habit-steps-mini-progress">
                <div class="progress-fill" style="width: ${perc}%;"></div>
            </div>`;
        }

        const isMeditation = h.name.toLowerCase() === 'meditation';
        
        let meditationHtml = '';
        if (isMeditation && meditationExpanded) {
            const filtered = meditationVideos.filter(v => v.duration === selectedMeditationTime);
            meditationHtml = `
                <div class="meditation-expansion">
                    <div class="time-filters">
                        ${[2, 5, 10, 20].map(t => `
                            <button class="time-btn ${selectedMeditationTime === t ? 'active' : ''}" onclick="filterMeditationBy(${t})">${t} min</button>
                        `).join('')}
                    </div>
                    <div class="video-carousel">
                        ${filtered.map(v => `
                            <div class="video-card" onclick="playMeditation('${v.file}', '${v.title}')">
                                <div class="video-thumb" style="background-image: url('${v.thumbnail}')">
                                    <div class="play-overlay"><div class="play-icon">▶</div></div>
                                </div>
                                <div class="video-info">
                                    <span class="v-title">${v.title}</span>
                                    <span class="v-duration">${v.duration} min</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        const card = document.createElement('div'); 
        card.className = `habit-card-v2 glass-card ${isDone ? 'completed' : ''}`;
        card.style.width = '100%'; 
        card.onclick = () => handleRitualClick(h.id);
        
        let stepsListHtml = '';
        if (expandedRituals.has(h.id) && totalSteps > 0) {
            stepsListHtml = `
            <div class="ritual-steps-expansion" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; gap: 6px;">
                ${hSteps.map(s => `
                <div class="step-expand-row" style="display:flex; align-items:center; gap:12px; cursor:pointer;" onclick="event.stopPropagation(); toggleStepDetail('${s.id}')">
                    <div class="habit-check-v2 ${s.completed ? 'done' : ''}" style="width:26px; height:26px; min-width:26px;">
                        <div class="check-inner" style="width:7px; height:12px; margin-top:-2px;"></div>
                    </div>
                    <span style="font-weight:600; font-size:0.95rem; color:${s.completed ? 'var(--text-dim)' : 'white'}; text-decoration:${s.completed ? 'line-through' : 'none'};">${s.name}</span>
                </div>
                `).join('')}
            </div>`;
        }
        
        card.innerHTML = `
            <div class="habit-main-row">
                <div class="habit-info-group">
                    <span class="habit-name" onclick="event.stopPropagation(); openModal('${h.id}')">${h.name}</span>
                    <span class="habit-goal">${h.goal || ''}</span>
                </div>
                
                <div class="habit-stats-group">
                    <div class="streak-pill">
                        <span>🔥 ${currentStreak}</span>
                        <span class="streak-sep">|</span>
                        <span>⭐ ${h.bestStreak || currentStreak}</span>
                    </div>
                    ${totalSteps > 0 ? `<span class="steps-count">${compSteps}/${totalSteps} ${expandedRituals.has(h.id) ? '▲' : '▼'}</span>` : ''}
                </div>
                
                <div class="habit-actions-group">
                    <div class="habit-check-v2 ${isDone ? 'done' : ''}" onclick="event.stopPropagation(); toggleHabit('${h.id}')">
                        <div class="check-inner"></div>
                    </div>
                </div>
            </div>
            ${progressHtml}
            ${stepsListHtml}
        `;
        l.appendChild(card);
    });
    updateStats();
}

// Standard Close for all modals (v81.0)
function closeAllModals() {
    console.log("[UI] Closing all modals");
    document.querySelectorAll('.modal').forEach(m => {
        m.classList.add('hidden');
        m.classList.remove('visible');
    });
}

async function toggleHabit(id) {
    console.log(`[UI] Toggling habit: ${id}`);
    const todayIST = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    const todayYYYYMMDD = new Date().toLocaleDateString("en-CA");
    const h = habits.find(x => x.id === id);
    if (!h) return;
    
    // Maintain references to master habitSteps
    const hSteps = habitSteps.filter(s => s.habit_id === id);

    if (h.completedDates.includes(todayYYYYMMDD)) {
        console.log(`[CORE] Unmarking habit ${h.name} for ${todayYYYYMMDD}`);
        h.completedDates = h.completedDates.filter(d => d !== todayYYYYMMDD);
        if (h.history) delete h.history[todayIST];
        if (hSteps.length > 0) {
            hSteps.forEach(s => s.completed = false);
            await supabaseClient.from('habit_steps').update({ completed: false }).eq('habit_id', id);
        }
    } else {
        console.log(`[CORE] Marking habit ${h.name} for ${todayYYYYMMDD}`);
        h.completedDates.push(todayYYYYMMDD);
        if (!h.history) h.history = {};
        h.history[todayIST] = true;
        if (hSteps.length > 0) {
            hSteps.forEach(s => s.completed = true);
            await supabaseClient.from('habit_steps').update({ completed: true }).eq('habit_id', id);
        }
    }
    
    // UI update first for responsiveness
    renderHabits();
    renderDashboard();
    updateStats();
    
    // Then async sync
    await saveAndSync('rituals', habits);
}

function updateStats() {
    const total = habits.length; 
    const today = new Date().toLocaleDateString("en-CA");
    const done = habits.filter(h => h.completedDates.includes(today)).length;
    
    const progressEl = document.getElementById('habit-progress-mobile');
    const desktopEl = document.getElementById('habit-progress-desktop') 
    const text = `${done}/${total} DONE TODAY`
    
    if (progressEl) {
        progressEl.innerText = text;
    }

    if(desktopEl){
        desktopEl.innerText = text;
    }
}

// --- Modal & Calendar ---
function openModal(id = null) {
    console.log("Opening Habit Modal, ID:", id);
    currentEditingHabitId = id;
    const modal = document.getElementById('habit-modal');
    const name = document.getElementById('habit-name');
    const goal = document.getElementById('habit-goal');
    const title = document.getElementById('habit-modal-title');
    const streakGroup = document.getElementById('streak-edit-group');
    const currentStreakInput = document.getElementById('habit-current-streak');
    const bestStreakInput = document.getElementById('habit-best-streak');
    
    if (!modal || !name) {
        console.error("Modal elements not found!");
        return;
    }

    if (id) { 
        const h = habits.find(x => x.id === id); 
        if (h) {
            if (title) title.innerText = 'Edit Ritual';
            name.value = h.name; 
            goal.value = h.goal || ''; 
            if (streakGroup) streakGroup.style.display = 'flex';
            if (currentStreakInput) currentStreakInput.value = calculateStreak(h);
            if (bestStreakInput) bestStreakInput.value = h.bestStreak || calculateStreak(h);
            currentModalSteps = habitSteps.filter(s => s.habit_id === id).map(s => ({...s}));
        }
    } else { 
        if (title) title.innerText = 'New Ritual';
        name.value = ''; 
        goal.value = ''; 
        if (streakGroup) streakGroup.style.display = 'none';
        currentModalSteps = [];
    }
    
    const deleteBtn = document.getElementById('delete-habit-btn');
    if (deleteBtn) {
        if (id) {
            deleteBtn.style.display = 'flex';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteHabit(id);
            };
        } else {
            deleteBtn.style.display = 'none';
        }
    }

    renderModalSteps();
    modal.classList.remove('hidden');
    modal.classList.add('visible');
    try { name.focus(); } catch(e) { console.warn("Focus failed", e); }
}
function closeModal() { 
    const m = document.getElementById('habit-modal');
    if (m) {
        m.classList.remove('visible');
        m.classList.add('hidden'); 
    }
}

function renderModalSteps() {
    const container = document.getElementById('habit-steps-container');
    if (!container) return;
    container.innerHTML = '';
    currentModalSteps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = 'glass-card';
        div.style = "display:flex; justify-content:space-between; align-items:center; padding:8px 12px !important; border-radius:12px; margin-bottom:0; background:rgba(255,255,255,0.03);";
        div.innerHTML = `
            <span style="flex:1; font-weight:600; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:10px;">${step.name}</span>
            <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                <button class="step-tool-btn" onclick="moveModalStep(${index}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="step-tool-btn" onclick="moveModalStep(${index}, 1)" ${index === currentModalSteps.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="step-delete-btn" onclick="removeModalStep(${index})" style="background:none; border:none; margin-left:4px;">✕</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function moveModalStep(index, direction) {
    if (index + direction < 0 || index + direction >= currentModalSteps.length) return;
    const temp = currentModalSteps[index];
    currentModalSteps[index] = currentModalSteps[index + direction];
    currentModalSteps[index + direction] = temp;
    renderModalSteps();
}

function addStepToHabitModal() {
    const input = document.getElementById('habit-new-step-name');
    const name = input.value.trim();
    if (!name) return;
    currentModalSteps.push({ id: generateId(), name: name, completed: false });
    input.value = '';
    renderModalSteps();
}

function removeModalStep(index) {
    currentModalSteps.splice(index, 1);
    renderModalSteps();
}

let activeDetailHabitId = null;

function openDetailModal(id) {
    const h = habits.find(x => x.id === id);
    if (!h) return;
    activeDetailHabitId = id;
    
    const m = document.getElementById('habit-detail-modal');
    if (!m) return;
    
    document.getElementById('detail-habit-name').innerText = h.name;
    const editBtn = document.getElementById('edit-habit-btn');
    if (editBtn) {
        editBtn.onclick = () => { closeDetailModal(); openModal(id); };
    }
    
    renderDetailSteps();
    m.classList.remove('hidden');
    m.classList.add('visible');
}

function renderDetailSteps() {
    const list = document.getElementById('detail-steps-list');
    if (!list) return;
    list.innerHTML = '';
    const hSteps = habitSteps.filter(s => s.habit_id === activeDetailHabitId);
    
    if (hSteps.length === 0) {
        list.innerHTML = '<p style="color:var(--text-dim);font-size:0.9rem;">No steps configured. Standard ritual.</p>';
    } else {
        hSteps.forEach(step => {
            const div = document.createElement('div');
            div.style = `display:flex; align-items:center; padding:10px 12px; background:rgba(255,255,255,0.05); border-radius:8px; cursor:pointer; opacity:${step.completed ? '0.6' : '1'};`;
            div.onclick = () => toggleStepDetail(step.id);
            div.innerHTML = `
                <div class="habit-check-v2 ${step.completed ? 'done' : ''}" style="width:32px; height:32px; min-width:32px; margin-right:12px;">
                    <div class="check-inner" style="width:8px; height:14px; margin-top:-2px;"></div>
                </div>
                <span style="font-weight:600; text-decoration:${step.completed ? 'line-through' : 'none'};">${step.name}</span>
            `;
            list.appendChild(div);
        });
    }
}

function closeDetailModal() {
    const m = document.getElementById('habit-detail-modal');
    if (m) { m.classList.remove('visible'); m.classList.add('hidden'); }
    activeDetailHabitId = null;
}

async function toggleStepDetail(stepId) {
    const step = habitSteps.find(s => s.id === stepId);
    if (!step) return;
    
    step.completed = !step.completed;
    renderDetailSteps();
    
    const hId = step.habit_id;
    const hSteps = habitSteps.filter(s => s.habit_id === hId);
    const allDone = hSteps.every(s => s.completed);
    const h = habits.find(x => x.id === hId);
    
    const today = new Date().toLocaleDateString("en-CA");
    const isHabitDone = h.completedDates.includes(today);

    if (allDone && !isHabitDone) {
        h.completedDates.push(today);
    } else if (!allDone && isHabitDone) {
        h.completedDates = h.completedDates.filter(d => d !== today);
    }
    
    await saveAndSync('rituals', habits);
    await supabaseClient.from('habit_steps').update({ completed: step.completed }).eq('id', stepId);
    
    renderHabits();
    renderDashboard();
}

async function saveHabit() {
    try {
        const name = document.getElementById('habit-name').value.trim();
        const goal = document.getElementById('habit-goal').value;
        if (!name) return;
        
        let h;
        if (currentEditingHabitId) { 
            h = habits.find(x => x.id === currentEditingHabitId); 
            h.name = name; 
            h.goal = goal; 
            
            const currentStreakInput = document.getElementById('habit-current-streak');
            const bestStreakInput = document.getElementById('habit-best-streak');
            
            if (currentStreakInput) {
                const newCurrentStreak = parseInt(currentStreakInput.value) || 0;
                const newBestStreak = bestStreakInput ? (parseInt(bestStreakInput.value) || 0) : newCurrentStreak;
                h.bestStreak = Math.max(h.bestStreak || 0, newBestStreak);
                
                // Regenerate completedDates based on newCurrentStreak manually
                const today = new Date().toLocaleDateString("en-CA");
                const isCompletedToday = h.completedDates.includes(today);
                
                h.completedDates = [];
                const d = new Date();
                if (!isCompletedToday && newCurrentStreak > 0) {
                    d.setDate(d.getDate() - 1);
                }
                
                for (let i = 0; i < newCurrentStreak; i++) {
                    const iterDate = new Date(d);
                    iterDate.setDate(d.getDate() - i);
                    h.completedDates.push(iterDate.toISOString().split('T')[0]);
                }
            }
        } else { 
            h = { id: generateId(), name, goal, completedDates: [], bestStreak: 0, user_id: USER_ID };
            habits.push(h);
        }

        const dbHabitId = h.id;
        
        const stepsToInsert = currentModalSteps.map(st => ({
            id: generateId(), // Refresh ID to avoid stale reference
            habit_id: dbHabitId,
            name: st.name,
            completed: st.completed || false
        }));

        // Rebuild local list safely
        habitSteps = habitSteps.filter(s => s.habit_id !== dbHabitId);
        stepsToInsert.forEach(st => {
            habitSteps.push(st);
        });

        // 1. Instantly Close and Update UI
        closeModal();
        renderPage();
        
        // 2. Safely sync to backend
        try {
            await saveAndSync('rituals', habits);
            saveToLocalStorage(); // Full local backup ensure
            
            if (supabaseClient) {
                await supabaseClient.from('habit_steps').delete().eq('habit_id', dbHabitId);
                if (stepsToInsert.length > 0) {
                    await supabaseClient.from('habit_steps').insert(stepsToInsert);
                }
            }
            console.log("SAVE CLICKED: Rituals synced safely");
        } catch (syncErr) {
            console.warn("Backend sync failed, saved locally", syncErr);
        }
    } catch (err) {
        console.error("Save ritual failed:", err);
        closeModal();
    }
}
function openCalendarFor(id) { 
    activeHabitForCalendar = habits.find(h => h.id === id); 
    renderCalendar(); 
    document.getElementById('calendar-modal').classList.remove('hidden'); 
}
function closeCalendar() { document.getElementById('calendar-modal').classList.add('hidden'); }
function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); if (!grid) return; grid.innerHTML = '';
    const first = new Date(calendarYear, calendarMonth, 1).getDay(); const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    document.getElementById('calendar-month-year').innerText = `${new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long' })} ${calendarYear}`;
    
    // Add Days Headers
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const headerRow = document.createElement('div');
    headerRow.className = 'calendar-day-headers';
    dayNames.forEach(d => {
        const el = document.createElement('div');
        el.className = 'calendar-day-header';
        el.innerText = d;
        headerRow.appendChild(el);
    });
    grid.appendChild(headerRow);

    const daysGrid = document.createElement('div');
    daysGrid.className = 'calendar-days-grid';
    grid.appendChild(daysGrid);

    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local

    for (let i = 0; i < first; i++) daysGrid.appendChild(Object.assign(document.createElement('div'), { className: 'calendar-day muted' }));
    for (let d = 1; d <= days; d++) {
        const dateObj = new Date(calendarYear, calendarMonth, d);
        const dateStrEN = dateObj.toLocaleDateString("en-IN");
        const dateStrCA = dateObj.toLocaleDateString("en-CA");
        
        // Check both historical formats for backward compatibility
        const isSet = (activeHabitForCalendar.history && activeHabitForCalendar.history[dateStrEN]) || 
                     activeHabitForCalendar.completedDates.includes(dateStrCA);
        
        const isToday = (dateStrCA === todayStr);
        const el = document.createElement('div'); el.className = `calendar-day ${isSet ? 'completed' : ''} ${isToday ? 'today' : ''}`;
        el.innerText = d; 
        el.onclick = () => {
            if (!activeHabitForCalendar.history) activeHabitForCalendar.history = {};
            
            if (isSet) {
                if (activeHabitForCalendar.history[dateStrEN]) delete activeHabitForCalendar.history[dateStrEN];
                activeHabitForCalendar.completedDates = activeHabitForCalendar.completedDates.filter(x => x !== dateStrCA);
            } else {
                activeHabitForCalendar.history[dateStrEN] = true;
                if (!activeHabitForCalendar.completedDates.includes(dateStrCA)) {
                    activeHabitForCalendar.completedDates.push(dateStrCA);
                }
            }
            saveAndSync('rituals', habits); renderCalendar(); renderHabits(); renderDashboard();
        };
        daysGrid.appendChild(el);
    }
}
function prevMonth() { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); }
function nextMonth() { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); }

// --- Stock Tracker (v30.0) ---
async function fetchLivePrices() {
    try {
        const symbols = stocks.map(s => s.name.toUpperCase().endsWith('.NS') ? s.name.toUpperCase() : `${s.name.toUpperCase()}.NS`).join(',');
        if (!symbols) return;

        // Note: query1.finance.yahoo.com might require a proxy in some environments, 
        // but using directly as requested by USER.
        const response = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`);
        const json = await response.json();
        
        if (json.quoteResponse && json.quoteResponse.result) {
            json.quoteResponse.result.forEach(result => {
                const s = stocks.find(stock => 
                    stock.name.toUpperCase() === result.symbol.replace('.NS', '') || 
                    stock.name.toUpperCase() === result.symbol
                );
                if (s) s.current_price = result.regularMarketPrice;
            });
        }
        
        renderStocks();
        renderStocksDashboard();
    } catch (err) {
        console.error("Stock price fetch failed:", err);
    }
}

function renderStocks() {
    const list = document.getElementById('stocks-list');
    if (!list) return;
    list.innerHTML = '';
    
    // Portfolio Overview Card (v41.0)
    let totalInvested = 0; let totalCurrent = 0;
    stocks.forEach(s => {
        totalInvested += s.buy_price * s.quantity;
        totalCurrent += (s.current_price || s.buy_price) * s.quantity;
    });
    const totalProfit = totalCurrent - totalInvested;
    const totalPercent = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(2) : 0;

    const overview = document.createElement('div');
    overview.className = 'portfolio-overview-card glass-card';
    overview.innerHTML = `
        <div class="overview-content">
            <div class="main-stats">
                <h1 class="${totalProfit >= 0 ? 'success-text' : 'error-text'}">${totalProfit >= 0 ? '+' : ''}${totalPercent}%</h1>
                <p>Total Portfolio Yield</p>
            </div>
            <div class="sub-stats">
                <div class="stat-item"><span>Invested</span> <strong>₹${totalInvested.toLocaleString()}</strong></div>
                <div class="stat-item"><span>Current</span> <strong>₹${totalCurrent.toLocaleString()}</strong></div>
            </div>
        </div>
    `;
    list.appendChild(overview);

    const grid = document.createElement('div');
    grid.className = 'stocks-grid';
    list.appendChild(grid);

    stocks.forEach(stock => {
        const cur = stock.current_price || stock.buy_price;
        const profit = (cur - stock.buy_price) * stock.quantity;
        const pPerc = ((profit / (stock.buy_price * stock.quantity)) * 100).toFixed(2);
        const div = document.createElement('div');
        div.className = `stock-card ${profit >= 0 ? 'profit' : 'loss'}`;
        div.innerHTML = `
                <div>
                    <span class="symbol">${stock.name}</span>
                    <span class="qty">${stock.quantity} Shares</span>
                </div>
                <button class="simple-delete" onclick="deleteStock('${stock.id}')">×</button>
            </div>
            <div class="stock-prices">
                <div class="price-row"><span>Buy</span> <strong>₹${stock.buy_price}</strong></div>
                <div class="price-row"><span>Market</span> <strong class="market-price">₹${cur}</strong></div>
            </div>
            <div class="stock-pnl-footer">
                <span class="pnl-val">${profit >= 0 ? '+' : ''}₹${Math.abs(profit).toLocaleString()}</span>
                <span class="pnl-perc">${pPerc}%</span>
            </div>
        `;
        grid.appendChild(div);
    });
}

function renderStocksDashboard() {
    const list = document.getElementById('stocks-summary');
    if (!list) return;
    list.innerHTML = '';
    
    if (stocks.length === 0) {
        list.innerHTML = '<p class="empty-msg">No stocks added yet.</p>';
        return;
    }

    stocks.slice(0, 4).forEach(s => {
        const cur = s.current_price || s.buy_price;
        const profit = (cur - s.buy_price) * s.quantity;
        const perc = ((profit / (s.buy_price * s.quantity)) * 100).toFixed(1);
        
        const div = document.createElement('div');
        div.className = 'ritual-card-mini view-only';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.innerHTML = `
            <div class="ritual-info">
                <span class="ritual-name">${s.name.toUpperCase()}</span>
                <span style="font-size:0.75rem; color:var(--text-dim);">₹${cur}</span>
            </div>
            <div class="${profit >= 0 ? 'success-text' : 'error-text'}" style="font-weight:700;">
                ${profit >= 0 ? '+' : ''}${perc}%
            </div>
        `;
        list.appendChild(div);
    });
}

function openStockModal() {
    console.log("Opening Stock Modal");
    document.getElementById('stock-modal-title').innerText = "Add New Stock";
    document.getElementById('stock-name').value = '';
    document.getElementById('stock-buy-price').value = '';
    document.getElementById('stock-quantity').value = '';
    const m = document.getElementById('stock-modal');
    if (m) {
        m.classList.remove('hidden');
        m.classList.add('visible');
    }
}

function closeStockModal() {
    const m = document.getElementById('stock-modal');
    if (m) m.classList.remove('visible');
    m.classList.add('hidden');
}

async function saveStock() {
    const name = document.getElementById('stock-name').value.trim().toUpperCase();
    const buyPrice = parseFloat(document.getElementById('stock-buy-price').value);
    const quantity = parseFloat(document.getElementById('stock-quantity').value);

    if (!name || isNaN(buyPrice) || isNaN(quantity)) {
        alert("Please fill all fields correctly");
        return;
    }

    try {
        console.log("SAVE TRIGGERED: Stock");
        const newStock = { id: generateId(), name, buy_price: buyPrice, quantity, current_price: buyPrice };
        stocks.push(newStock);
        saveStocks(stocks);
        closeAllModals();
        renderPage('stocks');
        renderPage('dashboard');
        
        await saveAndSync('stocks', stocks);
        fetchLivePrices(); // Try to get real price immediately
    } catch (err) {
        console.error("Save stock failed:", err);
    }
}

async function deleteStock(id) {
    if (!confirm("Remove this stock from portfolio?")) return;
    try {
        const { error } = await supabaseClient.from('stocks').delete().eq('id', id);
        if (error) throw error;
        stocks = stocks.filter(s => s.id !== id);
        saveStocks(stocks);
        renderStocks();
    } catch (err) {
        console.error("Delete stock failed:", err);
    }
}

async function manualEditStreak(id) {
    const h = habits.find(x => x.id === id);
    if (!h) return;
    const newVal = prompt(`Edit streak for "${h.name}":`, h.bestStreak || calculateStreak(h));
    if (newVal !== null && !isNaN(newVal)) {
        h.bestStreak = parseInt(newVal);
        await saveAndSync('rituals', habits);
        renderHabits();
    }
}

// --- Notes System (v5.0) ---
function loadNotes() {
    const saved = localStorage.getItem("notes");
    try {
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error("Failed to load notes", e);
        return [];
    }
}

function saveNotes(notes) {
    localStorage.setItem("notes", JSON.stringify(notes));
}

async function addNote() {
    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');

    const title = titleInput?.value.trim() || "Untitled";
    const content = contentInput?.value.trim();

    if (!content) return;

    const note = {
        id: generateId(),
        title: title,
        content: content,
        created_at: new Date().toISOString(),
        user_id: USER_ID
    };

    notes.push(note);

    renderNotesBoard(); // instant UI

    await saveAndSync('notes', notes); // 🔥 THIS WAS MISSING
}

function deleteNote(id) {
    if (!confirm("Delete this note?")) return;
    notes = notes.filter(n => n.id !== id);
    saveNotes(notes);
    renderNotesBoard();
}

function updateNote(id, field, value) {
    const note = notes.find(n => n.id === id);
    if (note) {
        note[field] = value;
        saveNotes(notes);
    }
}

function renderNotesBoard() {
    const grid = document.getElementById('notes-board-grid');
    const dashList = document.getElementById('dashboard-notes-list');
    const isDashboard = currentView === 'dashboard';
    const target = isDashboard ? dashList : grid;

    if (!target) return;
    target.innerHTML = '';

    if (notes.length === 0) {
        target.innerHTML = '<div class="empty-state-modern" style="grid-column:1/-1;">No notes yet. Click + to add one.</div>';
        return;
    }

    const notesToRender = isDashboard ? notes.slice(0, 4) : notes;

    notesToRender.forEach(note => {
        if (isDashboard) {
            const el = document.createElement('div');
            el.className = 'ritual-card-mini note-preview-item';
            el.innerHTML = `
                <div class="ritual-info">
                    <span class="ritual-name" style="font-weight:700;">${note.title || 'Untitled Note'}</span>
                </div>
                <div style="font-size:1.1rem; color:var(--text-dim); opacity:0.4;">→</div>
            `;
            el.onclick = () => switchView('notes');
            dashList.appendChild(el);
            return;
        }

        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <input class="note-title" placeholder="Note Title" value="${note.title}" oninput="updateNote('${note.id}', 'title', this.value)" />
                <button class="delete-btn-modern" onclick="deleteNote('${note.id}')">✕</button>
            </div>
            <div class="note-content" contenteditable="true" oninput="updateNote('${note.id}', 'content', this.innerText)">${note.content}</div>
        `;
        grid.appendChild(card);
    });
}
// Initialize notes on load
notes = loadNotes();

// --- Stocks Persistence Fix ---
function saveNotes(notes) {
    if (!notes) return;
    setData("notes", notes);
}

function loadNotes() {
    return getData("notes") || [];
}

function saveStocks(stocksList) {
    if (!stocksList) return;
    setData("stocks", stocksList);
}

function loadStocks() {
    return getData("stocks") || [];
}

async function fetchLivePrices() {
    if (stocks.length === 0) return;
    console.log("Fetching live stock prices...");
    
    for (let s of stocks) {
        try {
            // Yahoo Finance Query API fallback/example
            // Note: In a real browser environment without a proxy, this might hit CORS.
            // Using a simple interval fetch provided by user's request.
            const symbol = s.name.toUpperCase();
            const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
            const data = await res.json();
            if (data.quoteResponse && data.quoteResponse.result && data.quoteResponse.result[0]) {
                s.current_price = data.quoteResponse.result[0].regularMarketPrice;
                console.log(`Updated ${symbol} price to ${s.current_price}`);
            }
        } catch (e) {
            console.warn(`Could not fetch price for ${s.name}:`, e);
            if (!s.current_price) s.current_price = s.buy_price;
        }
    }
    saveStocks(stocks);
    renderStocks();
    renderStocksDashboard();
}
stocks = loadStocks();
loadFromLocalStorage();
renderPage();
fetchInitialData();

// ==========================================
// NEW TIMETABLE MODULE LOGIC
// ==========================================
function updateTtSuggestions() {
    const subList = document.getElementById('tt-subjects-list');
    const typeList = document.getElementById('tt-event-types-list');
    if (subList) subList.innerHTML = ttSubjectsHistory.map(h => `<option value="${h}">`).join('');
    if (typeList) typeList.innerHTML = ttEventTypesHistory.map(h => `<option value="${h}">`).join('');
}

function renderTimetable() {
    updateTtSuggestions();
    
    // Date formatting
    const dStr = ttSelectedDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
    const disp = document.getElementById('tt-selected-date-display');
    if (disp) disp.innerText = dStr;

    // Filter events for selected date
    const target = new Date(ttSelectedDate);
    target.setHours(0,0,0,0);
    
    const filtered = timetableEvents.filter(ev => {
        const evDate = new Date(ev.date);
        evDate.setHours(0,0,0,0);
        
        let diffTime = target.getTime() - evDate.getTime();
        let diffDays = Math.round(diffTime / (1000 * 3600 * 24));
        
        if (diffDays < 0) return false; // Future event
        
        if (ev.repeat === 'none') {
            return diffDays === 0;
        } else if (ev.repeat === 'daily') {
            return true;
        } else if (ev.repeat === 'weekly') {
            return target.getDay() === evDate.getDay();
        } else if (ev.repeat === 'biweekly') {
            return target.getDay() === evDate.getDay() && (diffDays % 14 === 0);
        } else if (ev.repeat === 'monthly') {
            return target.getDate() === evDate.getDate();
        }
        return false;
    });

    // Sort by start time
    filtered.sort((a,b) => {
        if (!a.startTime || !b.startTime) return 0;
        return a.startTime.localeCompare(b.startTime);
    });

    const list = document.getElementById('timetable-events-list');
    if (!list) return;

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-dim); margin-top:20px;">No events scheduled for this day</div>`;
    } else {
        list.innerHTML = filtered.map(ev => {
            const rgbInfo = hexToRgb(ev.color) || {r:129, g:140, b:248};
            const overlay = `rgba(${rgbInfo.r}, ${rgbInfo.g}, ${rgbInfo.b}, 0.2)`;
            const borderCol = `rgba(${rgbInfo.r}, ${rgbInfo.g}, ${rgbInfo.b}, 0.8)`;
            
            return `
            <div class="tt-event-card" style="background: ${overlay}; border-left: 6px solid ${borderCol};" onclick="openAddTimetableEvent('${ev.id}')">
                <div class="tt-time-left">
                    <span>${formatTime(ev.startTime)}</span>
                    <span>${formatTime(ev.endTime)}</span>
                </div>
                <div class="tt-details">
                    <span class="tt-subject">${ev.subject}</span>
                    <span class="tt-event-type" style="color: ${ev.color}; font-weight:700;">${ev.eventType}</span>
                </div>
            </div>`;
        }).join('');
    }

    renderTtCalendar();
}

function hexToRgb(hex) {
    if (!hex) return null;
    let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) { return r + r + g + g + b + b; });
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function formatTime(timeStr) {
    if (!timeStr) return "";
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0]);
    let m = parts[1];
    let ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h}:${m} ${ampm}`;
}

// Desktop Calendar Logic
function renderTtCalendar() {
    const calGrid = document.getElementById('tt-calendar-grid');
    const calHeader = document.getElementById('tt-calendar-month-year');
    if (!calGrid || !calHeader) return;

    const y = ttCurrentMonth.getFullYear();
    const m = ttCurrentMonth.getMonth();
    const d = new Date(y, m, 1);
    
    calHeader.innerText = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const firstDayIndex = d.getDay();
    
    let html = `
        <div class="tt-cal-day-header">Su</div>
        <div class="tt-cal-day-header">Mo</div>
        <div class="tt-cal-day-header">Tu</div>
        <div class="tt-cal-day-header">We</div>
        <div class="tt-cal-day-header">Th</div>
        <div class="tt-cal-day-header">Fr</div>
        <div class="tt-cal-day-header">Sa</div>
    `;

    for (let i = 0; i < firstDayIndex; i++) {
        html += `<div class="tt-cal-date different-month"></div>`;
    }

    for (let i = 1; i <= daysInMonth; i++) {
        const iterDate = new Date(y, m, i);
        const isActive = (iterDate.toDateString() === ttSelectedDate.toDateString());
        
        let hasEvent = timetableEvents.some(ev => {
            const evDate = new Date(ev.date);
            evDate.setHours(0,0,0,0);
            let diffTime = iterDate.getTime() - evDate.getTime();
            let diffDays = Math.round(diffTime / (1000 * 3600 * 24));
            if (diffDays < 0) return false;
            
            if (ev.repeat === 'none') {
                return diffDays === 0;
            } else if (ev.repeat === 'daily') {
                return true;
            } else if (ev.repeat === 'weekly') {
                return iterDate.getDay() === evDate.getDay();
            } else if (ev.repeat === 'biweekly') {
                return iterDate.getDay() === evDate.getDay() && (diffDays % 14 === 0);
            } else if (ev.repeat === 'monthly') {
                return iterDate.getDate() === evDate.getDate();
            }
            return false;
        });

        const activeCls = isActive ? "active" : "";
        const dotCls = hasEvent && !isActive ? "has-events" : "";
        
        html += `<div class="tt-cal-date ${activeCls} ${dotCls}" onclick="ttSelectDate(${y}, ${m}, ${i})">${i}</div>`;
    }

    calGrid.innerHTML = html;
}

function ttSelectDate(y, m, d) {
    ttSelectedDate = new Date(y, m, d);
    renderTimetable();
}

function ttPrevMonth() {
    ttCurrentMonth.setMonth(ttCurrentMonth.getMonth() - 1);
    renderTtCalendar();
}

function ttNextMonth() {
    ttCurrentMonth.setMonth(ttCurrentMonth.getMonth() + 1);
    renderTtCalendar();
}

// Modal Logic
function openAddTimetableEvent(id = null) {
    const modal = document.getElementById('timetable-modal');
    if (!modal) return;
    
    currentEditTtEventId = typeof id === 'string' ? id : null;
    
    // adjust for local timezone offset when getting ISO string
    let localDateStr = ttSelectedDate.toLocaleDateString('en-CA');

    const delBtn = document.getElementById('tt-delete-btn');
    document.getElementById('tt-modal-title').innerText = currentEditTtEventId ? 'Edit Event' : 'Add Event';
    
    if (currentEditTtEventId) {
        delBtn.style.display = 'block';
        const ev = timetableEvents.find(e => e.id === currentEditTtEventId);
        if (ev) {
            document.getElementById('tt-subject').value = ev.subject || '';
            document.getElementById('tt-event-type').value = ev.eventType || '';
            document.getElementById('tt-repeat').value = ev.repeat || 'none';
            document.getElementById('tt-date').value = ev.date || '';
            document.getElementById('tt-start-time').value = ev.startTime || '';
            document.getElementById('tt-end-time').value = ev.endTime || '';
            document.getElementById('tt-custom-color').value = ev.color || '#818cf8';
            updateTtSwatches(ev.color || '#818cf8');
        }
    } else {
        delBtn.style.display = 'none';
        document.getElementById('tt-subject').value = '';
        document.getElementById('tt-event-type').value = '';
        document.getElementById('tt-repeat').value = 'none';
        document.getElementById('tt-date').value = localDateStr;
        document.getElementById('tt-start-time').value = '09:00';
        document.getElementById('tt-end-time').value = '10:00';
        document.getElementById('tt-custom-color').value = '#818cf8';
        updateTtSwatches('#818cf8');
    }
    
    modal.classList.remove('hidden');
}

function closeTimetableModal() {
    const modal = document.getElementById('timetable-modal');
    if(modal) modal.classList.add('hidden');
}

function selectTtColor(color, element) {
    document.getElementById('tt-custom-color').value = color;
    updateTtSwatches(color);
}

function updateTtSwatches(colorHex) {
    document.querySelectorAll('.tt-color-swatch').forEach(sw => sw.classList.remove('selected'));
    const swatches = document.querySelectorAll('.tt-color-swatch');
    for (let sw of swatches) {
        if (!sw.classList.contains('custom-color-wrapper') && sw.style.backgroundColor) {
            const rgb = hexToRgb(colorHex);
            if (rgb && sw.style.backgroundColor === `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`) {
                sw.classList.add('selected');
                return;
            }
        }
    }
    // If none matches preset, select custom wrapper
    const customWrapper = document.querySelector('.custom-color-wrapper');
    if (customWrapper) customWrapper.classList.add('selected');
}

const colorPickerEl = document.getElementById('tt-custom-color');
if (colorPickerEl) {
    colorPickerEl.addEventListener('input', function() {
        updateTtSwatches(this.value);
    });
}

function saveTimetableEvent() {
    const subject = document.getElementById('tt-subject').value.trim();
    const eventType = document.getElementById('tt-event-type').value.trim();
    if (!subject) return alert('Subject is required');
    
    const repeat = document.getElementById('tt-repeat').value;
    const date = document.getElementById('tt-date').value;
    const startTime = document.getElementById('tt-start-time').value;
    const endTime = document.getElementById('tt-end-time').value;
    const color = document.getElementById('tt-custom-color').value;

    if (!ttSubjectsHistory.includes(subject)) ttSubjectsHistory.push(subject);
    if (eventType && !ttEventTypesHistory.includes(eventType)) ttEventTypesHistory.push(eventType);

    if (currentEditTtEventId) {
        const idx = timetableEvents.findIndex(e => e.id === currentEditTtEventId);
        if (idx > -1) {
            timetableEvents[idx] = { id: currentEditTtEventId, subject, eventType, repeat, date, startTime, endTime, color };
        }
    } else {
        timetableEvents.push({ id: generateId(), subject, eventType, repeat, date, startTime, endTime, color });
    }

    saveToLocalStorage();
    closeTimetableModal();
    renderTimetable();
}

function deleteTimetableEvent() {
    if (!currentEditTtEventId) return;
    if (!confirm('Are you sure you want to delete this event?')) return;
    timetableEvents = timetableEvents.filter(e => e.id !== currentEditTtEventId);
    saveToLocalStorage();
    closeTimetableModal();
    renderTimetable();
}
