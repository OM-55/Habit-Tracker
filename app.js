// Version 21.0 - Stable Restored Iteration
// Supabase Configuration
const SUPABASE_URL = 'https://fzqifrigkenzugqveacs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ebz00mT4w6fuLbjridRPZQ_HSm48Vbp';
const USER_ID = 'default_user';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

document.addEventListener('DOMContentLoaded', async () => {
    // Zero database sync dependencies on local storage
    await fetchInitialData();
    
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    selectedDay = (todayIndex >= 1 && todayIndex <= 5) ? dayNames[todayIndex] : "Monday";
    
    navigate('dashboard');
    selectDay(selectedDay);

    // Disable SW to prevent caching issues
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
    }

    // Auto-refresh stocks every 60s (v30.0/v32.0)
    setInterval(async () => {
        await fetchInitialData(); // Sync DB first
        if (stocks.length > 0) fetchLivePrices(); // Then update prices
    }, 60000);
});

// --- Navigation & Drawer ---
function toggleDrawer() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawer-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
    overlay.classList.toggle('hidden');
}

function navigate(view) {
    // Update Views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');

    // Update Title
    const titles = {
        'dashboard': 'Dashboard',
        'habits': 'Daily Rituals',
        'attendance': 'Academy Tracker',
        'reminders': 'Reminders',
        'stocks': 'Stock Tracker'
    };
    document.getElementById('page-title').innerText = titles[view] || 'Stellar';

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.innerText.toLowerCase().includes(view)) item.classList.add('active');
    });

    // Close Drawer
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('drawer-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');

    if (view === 'reminders') renderFullReminders();
    if (view === 'dashboard') renderDashboard();
    
    currentView = view;
}

async function fetchInitialData() {
    try {
        console.log("Syncing with Supabase (v25.0)...");
        const { data: h, error: hErr } = await supabaseClient.from('rituals').select('*').eq('user_id', USER_ID);
        const { data: a, error: aErr } = await supabaseClient.from('attendance').select('*').eq('user_id', USER_ID);
        const { data: m, error: mErr } = await supabaseClient.from('manual_stats').select('*').eq('user_id', USER_ID);
        const { data: r, error: rErr } = await supabaseClient.from('reminders').select('*').eq('user_id', USER_ID);
        const { data: s, error: sErr } = await supabaseClient.from('stocks').select('*');

        if (hErr) console.error("Rituals fetch error:", hErr);
        if (aErr) console.error("Attendance fetch error:", aErr);
        if (mErr) console.error("ManualStats fetch error:", mErr);
        if (rErr) console.error("Reminders fetch error:", rErr);
        if (sErr) console.error("Stocks fetch error:", sErr);

        if (s) stocks = s.map(x => ({
            id: x.id,
            name: x.name,
            buyPrice: parseFloat(x.buy_price),
            quantity: parseFloat(x.quantity),
            currentPrice: 0 // Set on live fetch
        }));

        if (h) habits = h.map(x => ({ 
            id: x.id, 
            name: x.name, 
            goal: x.goal, 
            completedDates: x.completed_dates || [] 
        }));
        if (a) attendance = a.map(x => ({ 
            id: x.id, 
            date: x.date, 
            subject: x.subject, 
            classHappened: x.class_happened || false, 
            attended: x.attended || false 
        }));
        if (m) {
            manualStats = {};
            m.forEach(row => { manualStats[row.subject] = { total: row.total, attended: row.attended }; });
        }
        if (r) reminders = r.map(x => ({ 
            id: x.id, 
            title: x.title, 
            date: x.date, 
            completed: x.completed || false 
        }));
        
        console.log("Sync complete. Habits:", habits.length);
        
        renderHabits();
        renderAttendanceSummary();
        renderReminders();
        renderDashboard();
        
        // Initial Price Fetch
        if (stocks.length > 0) fetchLivePrices();
    } catch (e) {
        console.error("Critical Sync Failure:", e);
    }
}

// --- Navigation ---
function switchView(view) {
    currentView = view;
    
    // 1. Sidebar Auto-Close (Mobile Fix v40.0)
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleDrawer();
    }

    // 2. Clear Views
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');

    // 3. Update Mobile Header Title
    const titles = {
        'dashboard': 'Dashboard',
        'habits': 'Daily Rituals',
        'attendance': 'Academy Tracker',
        'reminders': 'Reminders',
        'stocks': 'Stock Tracker'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titles[view] || 'Stellar';

    // 4. Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${view}`);
    if (navBtn) navBtn.classList.add('active');
    
    // 5. Toggle Global Actions
    const globalActions = document.getElementById('global-reminder-actions');
    if (globalActions) {
        if (view === 'reminders') globalActions.classList.remove('hidden');
        else globalActions.classList.add('hidden');
    }
    
    // 6. Refresh Data
    if (view === 'dashboard') { renderDashboard(); renderReminders(); }
    if (view === 'habits') renderHabits();
    if (view === 'reminders') renderFullReminders();
    if (view === 'attendance') { renderSubjects(); renderAttendanceSummary(); }
    if (view === 'stocks') renderStocks();
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
    const hList = document.getElementById('habits-preview-list');
    if (hList) {
        hList.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];
        // Sort by streak and take top 5
        const sortedHabits = [...habits].sort((a, b) => calculateStreak(b) - calculateStreak(a)).slice(0, 5);
        
        sortedHabits.forEach(h => {
            const isDone = h.completedDates.includes(today);
            const div = document.createElement('div');
            // Premium View-Only Card
            div.className = `ritual-card-mini ${isDone ? 'completed' : ''} view-only`;
            div.innerHTML = `
                <div class="ritual-info">
                    <span class="ritual-name">${h.name}</span>
                    <span class="ritual-streak">🔥 ${calculateStreak(h)} day streak</span>
                </div>
                <div class="status-indicator ${isDone ? 'done' : ''}">
                    ${isDone ? '✓' : '—'}
                </div>
            `;
            hList.appendChild(div);
        });
    }

    const aList = document.getElementById('attendance-preview-list');
    if (aList) {
        aList.innerHTML = '';
        const baseSubs = ["AP Lab", "AC Lab", "Workshop", "EG", "Math", "Physics", "Chemistry", "DSA", "ACAD", "IKS Lecture", "IKS Practical", "Python"];
        baseSubs.forEach(sub => {
            const stats = getSubjectStats(sub);
            const perc = stats.total > 0 ? (stats.attended / stats.total * 100).toFixed(0) : 0;
            const div = document.createElement('div');
            div.className = 'ritual-card-mini academy-card-mini view-only'; 
            div.innerHTML = `
                <div class="ritual-info">
                    <span class="ritual-name">${sub}</span>
                </div>
                <div class="habit-streak" style="background:transparent; padding:0; font-size:1rem;">
                    → ${perc}%
                </div>
            `;
            aList.appendChild(div);
        });
        
        let totalC = 0; let totalA = 0;
        baseSubs.forEach(sub => { const s = getSubjectStats(sub); totalC += s.total; totalA += s.attended; });
        const overall = totalC > 0 ? (totalA / totalC * 100).toFixed(0) : 0;
        const badge = document.getElementById('overall-attendance-badge');
        if (badge) badge.innerText = `${overall}% Overall`;
    }
}

function getSubjectStats(sub) {
    const manual = manualStats[sub] || { total: 0, attended: 0 };
    // Multi-slot matching: "DSA" matches "DSA 1", "DSA 2", etc.
    const logs = attendance.filter(a => a.subject === sub || a.subject.startsWith(sub + " "));
    const loggedTotal = logs.filter(l => l.classHappened).length;
    const loggedAttended = logs.filter(l => l.attended).length;
    return { total: manual.total + loggedTotal, attended: manual.attended + loggedAttended };
}

// --- Attendance ---
function renderSubjects() {
    const container = document.getElementById('subjects-container');
    if (!container) return;
    container.innerHTML = '';
    const locked = isDayLocked(selectedDay);
    const subjects = TIMETABLE[selectedDay] || [];
    
    subjects.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'subject-row glass-card';
        div.style.marginBottom = '1rem';
        div.dataset.subject = sub;
        
        div.innerHTML = `
            <div class="subject-info">
                <span class="subject-name">${sub}</span>
                <span class="subject-slot">Standard Session</span>
            </div>
            <div class="check-inputs">
                <div class="toggle-group" style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                    <span class="toggle-label" style="font-size:0.75rem; color:var(--text-dim); margin-bottom: 2px;">Class Happened</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="class-happened" onchange="validateCheck(this)" ${locked ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="toggle-group" style="display:flex; flex-direction:column; align-items:center; gap:0.4rem;">
                    <span class="toggle-label" style="font-size:0.75rem; color:var(--text-dim); margin-bottom: 2px;">Attended</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="attended" disabled onchange="handleMutual(this, '${sub}')" ${locked ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function validateCheck(cb) {
    const row = cb.closest('.subject-row');
    const att = row.querySelector('.attended');
    att.disabled = !cb.checked;
    if (!cb.checked) att.checked = false;
}

function handleMutual(cb, sub) {
    if (selectedDay !== 'Monday' || !cb.checked) return;
    const rows = document.querySelectorAll('.subject-row');
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
        const rows = document.querySelectorAll('.subject-row');
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

    const baseSubs = ["AP Lab", "AC Lab", "Workshop", "EG", "Math", "Physics", "Chemistry", "DSA", "ACAD", "IKS Lecture", "IKS Practical", "Python"];

    baseSubs.forEach(sub => {
        const stats = getSubjectStats(sub);
        const perc = stats.total > 0 ? (stats.attended / stats.total * 100).toFixed(1) : 0;
        const card = document.createElement('div');
        card.className = 'glass-card stat-card';
        card.style.marginBottom = '1.2rem';
        const manual = manualStats[sub] || { total: 0, attended: 0 };
        
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                <strong>${sub}</strong> <span style="color:var(--primary)">${perc}%</span>
            </div>
            <div style="font-size:0.9rem;color:var(--text-dim);">
                <span>Total: ${stats.total} | Attended: ${stats.attended}</span>
            </div>
            <div class="progress-bar" style="height:5px;margin-top:1rem;background:rgba(255,255,255,0.05);border-radius:100px;overflow:hidden">
                <div class="progress-fill" style="width:${perc}%;height:100%;transition:0.3s;background:var(--primary)"></div>
            </div>
        `;
        summary.appendChild(card);
    });
}

function updateManualStat(sub, type, val) {
    if (!manualStats[sub]) manualStats[sub] = { total: 0, attended: 0 };
    manualStats[sub][type] = parseInt(val) || 0;
    saveAndSync('manual_stats', manualStats); renderAttendanceSummary(); renderDashboard();
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

// --- Sync ---
async function saveAndSync(table, data) {
    try {
        let res;
        if (table === 'rituals') {
            res = await supabaseClient.from('rituals').upsert(data.map(h => ({ 
                id: h.id,
                user_id: USER_ID, 
                name: h.name, 
                goal: h.goal, 
                completed_dates: h.completedDates || [] 
            })));
        } else if (table === 'attendance') {
            res = await supabaseClient.from('attendance').upsert(data.map(a => ({ 
                id: a.id,
                user_id: USER_ID, 
                date: a.date, 
                subject: a.subject, 
                class_happened: a.classHappened || false, 
                attended: a.attended || false 
            })));
        } else if (table === 'reminders') {
            res = await supabaseClient.from('reminders').upsert(data.map(r => ({ 
                id: r.id,
                user_id: USER_ID, 
                title: r.title, 
                date: r.date, 
                completed: r.completed || false 
            })));
        } else if (table === 'manual_stats') {
            const mData = Object.keys(data).map(s => ({ subject: s, total: data[s].total, attended: data[s].attended, user_id: USER_ID }));
            res = await supabaseClient.from('manual_stats').upsert(mData);
        }

        if (res?.error) {
            console.error(`Sync error for ${table}:`, res.error);
        } else {
            console.log(`Synced ${table} successfully`);
            // Immediate Fetch for rock-solid sync
            fetchInitialData();
        }
    } catch (e) {
        console.error(`Sync failed for ${table}`, e);
    }
}

// --- Reminders ---
function openReminderModal() { document.getElementById('reminder-modal').classList.remove('hidden'); }
function closeReminderModal() { document.getElementById('reminder-modal').classList.add('hidden'); }

async function saveReminder() {
    const title = document.getElementById('rem-title').value.trim();
    const date = document.getElementById('rem-date').value;
    if (!title || !date) return;
    
    // Explicit Supabase Insert as requested
    const newRem = { id: generateId(), title, date, completed: false, user_id: USER_ID };
    const { error } = await supabaseClient.from('reminders').insert([newRem]);
    
    if (error) {
        console.error("Insert error:", error);
    } else {
        console.log("Reminder inserted successfully");
        await fetchInitialData(); // Immediate re-fetch for rock-solid sync
        closeReminderModal();
    }
}

function renderReminders() {
    const list = document.getElementById('dashboard-reminders') || document.getElementById('reminders-list');
    if (!list) return;
    list.innerHTML = '';
    
    // Sort ascending
    const sorted = [...reminders].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Upcoming logic: show top 3 dates, but if multiple on same date, show all
    const grouped = {};
    sorted.forEach(r => { if (!grouped[r.date]) grouped[r.date] = []; grouped[r.date].push(r); });
    
    const dates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
    let count = 0;
    
    dates.forEach(date => {
        if (count < 3) {
            const items = grouped[date].filter(r => !r.completed);
            items.forEach(rem => {
                const div = document.createElement('div');
                div.className = 'reminder-item';
                div.innerHTML = `<span class="rem-date">${formatDate(date)}</span> <span class="rem-title">${rem.title}</span>`;
                list.appendChild(div);
            });
            if (items.length > 0) count++;
        }
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
    const list = document.getElementById('full-reminders-list');
    if (!list) return;
    list.innerHTML = '';
    
    const active = reminders.filter(r => !r.completed).sort((a, b) => new Date(a.date) - new Date(b.date));
    active.forEach(rem => {
        const div = document.createElement('div');
        div.className = 'reminder-item full-width-rem';
        div.innerHTML = `
            <div class="rem-left">
                <input type="checkbox" onchange="completeReminder('${rem.id}')" class="rem-check">
                <div class="rem-info">
                    <span class="rem-date">${formatDate(rem.date)}</span>
                    <span class="rem-title">${rem.title}</span>
                </div>
            </div>
            <button class="delete-btn" onclick="deleteReminder('${rem.id}')">×</button>
        `;
        list.appendChild(div);
    });
}

function renderPastReminders() {
    const list = document.getElementById('full-reminders-list');
    if (!list) return;
    list.innerHTML = `<div class="card-header" style="margin-bottom:1rem"><h3>Past Reminders</h3></div>`;
    
    const past = reminders.filter(r => r.completed).sort((a, b) => new Date(b.date) - new Date(a.date));
    past.forEach(rem => {
        const div = document.createElement('div');
        div.className = 'reminder-item full-width-rem completed';
        div.innerHTML = `
            <div class="rem-info">
                <span class="rem-date">${formatDate(rem.date)}</span>
                <span class="rem-title" style="text-decoration:line-through">${rem.title}</span>
            </div>
            <button class="delete-btn" onclick="deleteReminder('${rem.id}')">×</button>
        `;
        list.appendChild(div);
    });
}

async function completeReminder(id) {
    const rem = reminders.find(r => r.id === id);
    if (rem) rem.completed = true;
    saveAndSync('reminders', reminders);
    renderReminders();
    renderFullReminders();
}

async function deleteReminder(id) {
    reminders = reminders.filter(r => r.id !== id);
    saveAndSync('reminders', reminders);
    renderReminders();
    renderFullReminders();
}

// --- Common ---
function calculateStreak(h) {
    let s = 0; let d = new Date(); const today = d.toISOString().split('T')[0];
    if (!h.completedDates.includes(today)) d.setDate(d.getDate()-1);
    while (h.completedDates.includes(d.toISOString().split('T')[0])) { s++; d.setDate(d.getDate()-1); }
    return s;
}

function renderHabits() {
    const l = document.getElementById('habit-list'); 
    if (!l) return; 
    l.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    
    habits.forEach(h => {
        const isDone = h.completedDates.includes(today);
        const card = document.createElement('div'); 
        card.className = `habit-card glass-card ${isDone ? 'completed' : ''}`;
        card.innerHTML = `
            <div class="habit-info">
                <h4 onclick="openCalendarFor('${h.id}')">${h.name}</h4>
                <p>${h.goal || ''}</p>
                <div class="habit-streak">🔥 ${calculateStreak(h)}</div>
            </div>
            <div class="habit-actions">
                <div class="habit-check ${isDone ? 'done' : ''}" onclick="toggleHabit('${h.id}')">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                </div>
            </div>
        `;
        l.appendChild(card);
    });
    updateStats();
}

async function toggleHabit(id) {
    const today = new Date().toISOString().split('T')[0];
    const h = habits.find(x => x.id === id);
    if (!h) return;
    
    // Toggle state locally
    if (h.completedDates.includes(today)) {
        h.completedDates = h.completedDates.filter(d => d !== today);
    } else {
        h.completedDates.push(today);
    }
    
    try {
        const { error } = await supabaseClient.from('rituals').upsert([{ 
            id: h.id, 
            user_id: USER_ID, 
            name: h.name, 
            goal: h.goal, 
            completed_dates: h.completedDates 
        }]);
        
        if (error) throw error;
        
        console.log("Toggle synced successfully");
        await fetchInitialData();
        renderHabits();
        renderDashboard();
    } catch (err) {
        console.error("Toggle sync failed:", err);
        alert("Persistence Error: " + err.message);
    }
}

function updateStats() {
    const total = habits.length; const today = new Date().toISOString().split('T')[0];
    const done = habits.filter(h => h.completedDates.includes(today)).length;
    if (document.getElementById('completed-count')) {
        const statsBox = document.getElementById('today-stats');
        statsBox.innerHTML = `
            <div class="stats-text-row">
                <span style="font-size: 1.1rem; font-weight: 800;">${done} / ${total}</span>
                <span style="font-size: 0.6rem; color: var(--text-dim); text-transform: uppercase; font-weight: 400; letter-spacing: 0.5px;">Done Today</span>
            </div>
            <div class="progress-bar mini"><div id="daily-progress" class="progress-fill" style="width: ${total > 0 ? (done / total) * 100 : 0}%"></div></div>
        `;
    }
}

// --- Modal & Calendar ---
function openModal(id = null) {
    currentEditingHabitId = id;
    const modal = document.getElementById('habit-modal');
    const name = document.getElementById('habit-name');
    const goal = document.getElementById('habit-goal');
    if (id) { const h = habits.find(x => x.id === id); name.value = h.name; goal.value = h.goal || ''; } else { name.value = ''; goal.value = ''; }
    modal.classList.remove('hidden'); name.focus();
}
function closeModal() { document.getElementById('habit-modal').classList.add('hidden'); }
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
        } else { 
            h = { id: generateId(), name, goal, completedDates: [], user_id: USER_ID };
        }

        const { error } = await supabaseClient.from('rituals').upsert([{ 
            id: h.id || undefined,
            user_id: USER_ID, 
            name: h.name, 
            goal: h.goal, 
            completed_dates: h.completedDates || [] 
        }]);

        if (error) throw error;

        alert("Daily Ritual Saved Successfully! 💎");
        await fetchInitialData();
        renderHabits(); 
        renderDashboard(); 
        closeModal();
    } catch (err) {
        console.error("Save ritual failed:", err);
        alert("Save failed: " + err.message);
    }
}
function openCalendarFor(id) { activeHabitForCalendar = habits.find(h => h.id === id); renderCalendar(); document.getElementById('calendar-modal').classList.remove('hidden'); }
function closeCalendar() { document.getElementById('calendar-modal').classList.add('hidden'); }
function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); if (!grid) return; grid.innerHTML = '';
    const first = new Date(calendarYear, calendarMonth, 1).getDay(); const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    document.getElementById('calendar-month-year').innerText = `${new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long' })} ${calendarYear}`;
    for (let i = 0; i < first; i++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'calendar-day muted' }));
    for (let d = 1; d <= days; d++) {
        const dateStr = new Date(calendarYear, calendarMonth, d).toISOString().split('T')[0];
        const isSet = activeHabitForCalendar.completedDates.includes(dateStr);
        const el = document.createElement('div'); el.className = `calendar-day ${isSet ? 'completed' : ''}`;
        el.innerText = d; el.onclick = () => {
            if (isSet) activeHabitForCalendar.completedDates = activeHabitForCalendar.completedDates.filter(x => x !== dateStr); else activeHabitForCalendar.completedDates.push(dateStr);
            saveAndSync('rituals', habits); renderCalendar(); renderHabits(); renderDashboard();
        };
        grid.appendChild(el);
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
                if (s) s.currentPrice = result.regularMarketPrice;
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
    
    // Portfolio Overview Card (v39.0)
    let totalInvested = 0; let totalCurrent = 0;
    stocks.forEach(s => {
        totalInvested += s.buyPrice * s.quantity;
        totalCurrent += (s.currentPrice || s.buyPrice) * s.quantity;
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
        const cur = stock.currentPrice || stock.buyPrice;
        const profit = (cur - stock.buyPrice) * stock.quantity;
        const pPerc = ((profit / (stock.buyPrice * stock.quantity)) * 100).toFixed(2);
        const div = document.createElement('div');
        div.className = `stock-card ${profit >= 0 ? 'profit' : 'loss'}`;
        div.innerHTML = `
            <div class="stock-card-header">
                </div>
            </div>
            <div class="stock-pnl-box">
                <div class="pnl-info">
                    <span class="label" style="display:block; font-size:0.75rem; color:var(--text-dim);">Profit / Loss</span>
                    <span class="pnl-val">${isProfit ? '+' : ''}₹${Math.abs(profit).toLocaleString()}</span>
                </div>
                <span class="pnl-pct">${isProfit ? '+' : ''}${percent}%</span>
            </div>
        `;
        list.appendChild(card);
    });
}

function renderStocksDashboard() {
    const list = document.getElementById('dashboard-stocks');
    const pnlHeader = document.getElementById('total-pnl');
    if (!list) return;
    list.innerHTML = '';

    let totalInvested = 0;
    let totalCurrent = 0;

    stocks.slice(0, 3).forEach(s => {
        const invested = s.buyPrice * s.quantity;
        const current = (s.currentPrice || s.buyPrice) * s.quantity;
        totalInvested += invested;
        totalCurrent += current;

        const profit = current - invested;
        const isProfit = profit >= 0;

        const row = document.createElement('div');
        row.className = `stock-mini-row ${isProfit ? 'profit' : 'loss'}`;
        row.innerHTML = `
            <span class="name">${s.name.toUpperCase()}</span>
            <span class="pnl">${isProfit ? '+' : '-'}${Math.abs(((profit/invested)*100)).toFixed(1)}%</span>
        `;
        list.appendChild(row);
    });

    if (pnlHeader && stocks.length > 0) {
        const totalProfit = totalCurrent - totalInvested;
        const totalPercent = totalInvested > 0 ? ((totalProfit / totalInvested) * 100).toFixed(1) : 0;
        pnlHeader.innerText = `${totalProfit >= 0 ? '+' : ''}${totalPercent}%`;
        pnlHeader.style.color = totalProfit >= 0 ? 'var(--success)' : '#ff5f56';
    } else if (pnlHeader) {
        pnlHeader.innerText = '--';
    }
}

function openStockModal() {
    document.getElementById('stock-modal-title').innerText = "Add New Stock";
    document.getElementById('stock-name').value = '';
    document.getElementById('stock-buy-price').value = '';
    document.getElementById('stock-quantity').value = '';
    document.getElementById('stock-modal').classList.remove('hidden');
}

function closeStockModal() {
    document.getElementById('stock-modal').classList.add('hidden');
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
        const { error } = await supabaseClient.from('stocks').insert([{
            id: generateId(),
            name,
            buy_price: buyPrice,
            quantity
        }]); // Removed user_id

        if (error) throw error;

        alert("Stock added successfully! 💎");
        closeStockModal();
        await fetchInitialData();
        fetchLivePrices();
    } catch (err) {
        console.error("Save stock failed:", err);
        alert("Error: " + err.message);
    }
}

async function deleteStock(id) {
    if (!confirm("Remove this stock from portfolio?")) return;
    try {
        const { error } = await supabaseClient.from('stocks').delete().eq('id', id);
        if (error) throw error;
        await fetchInitialData();
        renderStocksView();
        renderStocksDashboard();
    } catch (err) {
        console.error("Delete stock failed:", err);
    }
}
