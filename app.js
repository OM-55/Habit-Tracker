// Version 21.0 - Stable Restored Iteration
// Supabase Configuration
const SUPABASE_URL = 'https://fzqifrigkenzugqveacs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ebz00mT4w6fuLbjridRPZQ_HSm48Vbp';
const USER_ID = 'default_user';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TIMETABLE = {
    "Monday": ["AP Lab", "AC Lab", "Workshop", "EG"],
    "Tuesday": ["Math", "Physics", "EG"],
    "Wednesday": ["Math", "Chemistry", "DSA 1", "DSA 2", "DSA 3", "DSA 4"],
    "Thursday": ["ACAD", "IKS Lecture"],
    "Friday": ["IKS Practical", "Python 1", "Python 2"]
};

// State
let habits = [];
let attendance = [];
let reminders = [];
let manualStats = {};
let currentEditingHabitId = null;
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
        'reminders': 'Reminders'
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
        const { data: h } = await supabaseClient.from('rituals').select('*').eq('user_id', USER_ID);
        const { data: a } = await supabaseClient.from('attendance').select('*').eq('user_id', USER_ID);
        const { data: m } = await supabaseClient.from('manual_stats').select('*').eq('user_id', USER_ID);
        const { data: r } = await supabaseClient.from('reminders').select('*').eq('user_id', USER_ID);

        console.log("Fetched rituals:", h);
        console.log("Fetched reminders:", r);

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

        renderHabits();
        renderAttendanceSummary();
        renderReminders(); // Dashboard preview
        renderDashboard();
    } catch (e) {
        console.error('Fetch failed', e);
    }
}

// --- Navigation ---
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${view}`);
    if (navBtn) navBtn.classList.add('active');
    
    if (view === 'dashboard') { renderDashboard(); renderReminders(); }
    if (view === 'habits') renderHabits();
    if (view === 'reminders') renderFullReminders();
    if (view === 'attendance') { renderSubjects(); renderAttendanceSummary(); }
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
                <div class="toggle-group" style="display:flex; flex-direction:column; align-items:center; gap:0.5rem;">
                    <span class="toggle-label" style="font-size:0.8rem; color:var(--text-dim);">Class Happened</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="class-happened" onchange="validateCheck(this)" ${locked ? 'disabled' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="toggle-group" style="display:flex; flex-direction:column; align-items:center; gap:0.5rem;">
                    <span class="toggle-label" style="font-size:0.8rem; color:var(--text-dim);">Attended</span>
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
                    attendance.push({ id: Date.now()+Math.random().toString(), date: today, subject: sub, classHappened: true, attended, user_id: USER_ID });
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
    const newRem = { title, date, completed: false, user_id: USER_ID };
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
    const list = document.getElementById('reminders-list');
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
                <div class="habit-streak">🔥 ${calculateStreak(h)} day streak</div>
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
    if (h.completedDates.includes(today)) h.completedDates = h.completedDates.filter(d => d !== today); else h.completedDates.push(today);
    
    // Direct Upsert with ALL fields to prevent data loss (v23.0)
    await supabaseClient.from('rituals').upsert([{ 
        id: h.id, 
        user_id: USER_ID, 
        name: h.name,
        goal: h.goal,
        completed_dates: h.completedDates 
    }]);
    
    await fetchInitialData();
    renderHabits(); renderDashboard();
}

function updateStats() {
    const total = habits.length; const today = new Date().toISOString().split('T')[0];
    const done = habits.filter(h => h.completedDates.includes(today)).length;
    if (document.getElementById('completed-count')) {
        document.getElementById('completed-count').innerText = done;
        document.getElementById('total-count').innerText = total;
        document.getElementById('daily-progress').style.width = `${total > 0 ? (done / total) * 100 : 0}%`;
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
    const name = document.getElementById('habit-name').value.trim(); if (!name) return;
    let h;
    if (currentEditingHabitId) { 
        h = habits.find(x => x.id === currentEditingHabitId); 
        h.name = name; 
        h.goal = document.getElementById('habit-goal').value; 
    } else { 
        h = { name, goal: document.getElementById('habit-goal').value, completedDates: [], user_id: USER_ID };
    }

    // Direct Upsert with ALL fields & Refetch (v23.0)
    await supabaseClient.from('rituals').upsert([{ 
        id: h.id || undefined,
        user_id: USER_ID, 
        name: h.name, 
        goal: h.goal, 
        completed_dates: h.completedDates || [] 
    }]);

    await fetchInitialData();
    renderHabits(); renderDashboard(); closeModal();
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
