// Supabase Configuration
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabaseClient = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TIMETABLE = {
    "Monday": ["AP Lab", "AC Lab", "Workshop", "EG"],
    "Tuesday": ["Math", "Physics", "EG"],
    "Wednesday": ["Math", "Chemistry", "DSA 1", "DSA 2", "DSA 3", "DSA 4"],
    "Thursday": ["ACAD", "IKS Lecture"],
    "Friday": ["IKS Practical", "Python 1", "Python 2"]
};

// State
let habits = JSON.parse(localStorage.getItem('habits')) || [];
let attendance = JSON.parse(localStorage.getItem('attendance')) || [];
let reminders = JSON.parse(localStorage.getItem('reminders')) || [];
let manualStats = JSON.parse(localStorage.getItem('manualStats')) || {}; 
let currentPin = '';
const CORRECT_PIN = '1';
let currentEditingHabitId = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let activeHabitForCalendar = null;
let currentView = 'dashboard';
let selectedDay = "";
let editMode = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    unlockApp();
    
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    selectedDay = (todayIndex >= 1 && todayIndex <= 5) ? dayNames[todayIndex] : "Monday";
    
    switchView('dashboard');
    renderHabits();
    renderAttendanceSummary();
    renderReminders();
    selectDay(selectedDay);
    updateStats();
    fetchInitialData();
});

async function fetchInitialData() {
    if (!supabaseClient) return;
    try {
        const { data: h } = await supabaseClient.from('habits').select('*').eq('user_id', 'default_user');
        const { data: a } = await supabaseClient.from('attendance').select('*').eq('user_id', 'default_user');
        const { data: m } = await supabaseClient.from('manual_stats').select('*').eq('user_id', 'default_user');
        const { data: r } = await supabaseClient.from('reminders').select('*').eq('user_id', 'default_user');
        if (h) { habits = h; renderHabits(); renderDashboard(); }
        if (a) { attendance = a; renderAttendanceSummary(); renderSubjects(); renderDashboard(); }
        if (m) {
            manualStats = {};
            m.forEach(row => { manualStats[row.subject] = { total: row.total, attended: row.attended }; });
            renderAttendanceSummary(); renderDashboard();
        }
        if (r) { reminders = r; renderReminders(); }
    } catch (e) { console.error('Fetch failed', e); }
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
        const sortedHabits = [...habits].sort((a, b) => calculateStreak(b) - calculateStreak(a)).slice(0, 3);
        sortedHabits.forEach(h => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `<span class="label">${h.name}</span> <span class="val">🔥 ${calculateStreak(h)}</span>`;
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
            div.className = 'preview-item';
            div.innerHTML = `<span class="label">${sub}</span> <span class="val">${perc}%</span>`;
            aList.appendChild(div);
        });
        
        let totalC = 0; let totalA = 0;
        baseSubs.forEach(sub => { const s = getSubjectStats(sub); totalC += s.total; totalA += s.attended; });
        const overall = totalC > 0 ? (totalA / totalC * 100).toFixed(0) : 0;
        document.getElementById('overall-attendance-badge').innerText = `${overall}% Overall`;
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
        div.className = 'subject-row';
        div.dataset.subject = sub;
        
        // Clean Display: No "DSA DSA 1", just "DSA 1"
        // If sub contains a number or space, it might already be specific. 
        // Requirements: "if there is 1, 2, 3, 4, write DSA 1, DSA 2..."
        let label = sub; 
        
        div.innerHTML = `
            <div class="subject-info">
                <span class="subject-name">${label}</span>
            </div>
            <div class="check-inputs" style="display:flex;gap:1.5rem">
                <label class="toggle-control" style="font-size:0.8rem">
                    <input type="checkbox" class="class-happened" onchange="validateCheck(this)" ${locked ? 'disabled' : ''}>
                    <span class="toggle-slider" style="width:36px;height:18px"></span> Class
                </label>
                <label class="toggle-control" style="font-size:0.8rem">
                    <input type="checkbox" class="attended" disabled onchange="handleMutual(this, '${sub}')" ${locked ? 'disabled' : ''}>
                    <span class="toggle-slider" style="width:36px;height:18px"></span> Attended
                </label>
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
    const today = new Date().toLocaleDateString('en-CA');
    const rows = document.querySelectorAll('.subject-row');
    let added = 0;
    rows.forEach(row => {
        const sub = row.dataset.subject;
        if (row.querySelector('.class-happened').checked) {
            if (!attendance.find(a => a.date === today && a.subject === sub)) {
                attendance.push({ id: Date.now()+Math.random().toString(), date: today, subject: sub, classHappened: true, attended: row.querySelector('.attended').checked, user_id: 'default_user' });
                added++;
            }
        }
    });

    saveAndSync(); renderAttendanceSummary(); renderSubjects(); renderDashboard();
    
    // Auto-progress to next day
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const currIdx = days.indexOf(selectedDay);
    const nextIdx = (currIdx + 1) % days.length;
    selectDay(days[nextIdx]);
    
    alert(`Attendance saved. Moved to ${days[nextIdx]}!`);
}

function renderAttendanceSummary() {
    const summary = document.getElementById('attendance-summary');
    if (!summary) return;
    summary.innerHTML = `<div class="card-header"><h3>Academy Summary</h3></div>`;

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
                ${editMode ? `
                    <div class="edit-stat-group">
                        T: <input type="number" value="${manual.total}" onchange="updateManualStat('${sub}', 'total', this.value)">
                        A: <input type="number" value="${manual.attended}" onchange="updateManualStat('${sub}', 'attended', this.value)">
                    </div>
                ` : `
                    <span>Total: ${stats.total} | Attended: ${stats.attended}</span>
                `}
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
    saveAndSync(); renderAttendanceSummary(); renderDashboard();
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
async function saveAndSync() {
    localStorage.setItem('habits', JSON.stringify(habits));
    localStorage.setItem('attendance', JSON.stringify(attendance));
    localStorage.setItem('reminders', JSON.stringify(reminders));
    localStorage.setItem('manualStats', JSON.stringify(manualStats));
    if (supabaseClient) {
        try {
            await supabaseClient.from('habits').upsert(habits.map(h => ({ ...h, user_id: 'default_user' })));
            await supabaseClient.from('attendance').upsert(attendance.map(a => ({ ...a, user_id: 'default_user' })));
            await supabaseClient.from('reminders').upsert(reminders.map(r => ({ ...r, user_id: 'default_user' })));
            const mData = Object.keys(manualStats).map(s => ({ subject: s, total: manualStats[s].total, attended: manualStats[s].attended, user_id: 'default_user' }));
            await supabaseClient.from('manual_stats').upsert(mData);
        } catch (e) { console.error('Sync failed', e); }
    }
}

// --- Reminders ---
function openReminderModal() { document.getElementById('reminder-modal').classList.remove('hidden'); }
function closeReminderModal() { document.getElementById('reminder-modal').classList.add('hidden'); }

async function saveReminder() {
    const title = document.getElementById('rem-title').value.trim();
    const date = document.getElementById('rem-date').value;
    if (!title || !date) return;
    reminders.push({ id: Date.now().toString(), title, date, user_id: 'default_user' });
    saveAndSync(); renderReminders(); closeReminderModal();
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
            const items = grouped[date];
            items.forEach(rem => {
                const div = document.createElement('div');
                div.className = 'reminder-item';
                div.innerHTML = `<span class="rem-date">${formatDate(date)}</span> <span class="rem-title">${rem.title}</span>`;
                list.appendChild(div);
            });
            count++;
        }
    });
}

function formatDate(ds) {
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
    
    const sorted = [...reminders].sort((a, b) => new Date(a.date) - new Date(b.date));
    sorted.forEach(rem => {
        const div = document.createElement('div');
        div.className = 'reminder-item full-width-rem';
        div.innerHTML = `
            <div class="rem-info">
                <span class="rem-date">${formatDate(rem.date)}</span>
                <span class="rem-title">${rem.title}</span>
            </div>
            <button class="delete-btn" onclick="deleteReminder('${rem.id}')">×</button>
        `;
        list.appendChild(div);
    });
}

async function deleteReminder(id) {
    reminders = reminders.filter(r => r.id !== id);
    saveAndSync();
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
    const l = document.getElementById('habit-list'); if (!l) return; l.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    habits.forEach(h => {
        const isDone = h.completedDates.includes(today);
        const card = document.createElement('div'); card.className = 'habit-card glass-card';
        card.innerHTML = `
            <div class="habit-check ${isDone?'done':''}" onclick="toggleHabit('${h.id}')">
                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
            </div>
            <div class="habit-info">
                <h4 onclick="openCalendarFor('${h.id}')">${h.name}</h4>
                <p>${h.goal||''}</p>
            </div>
            <div class="habit-streak">🔥 ${calculateStreak(h)}</div>
        `;
        l.appendChild(card);
    });
    updateStats();
}

function toggleHabit(id) {
    const today = new Date().toISOString().split('T')[0];
    const h = habits.find(x => x.id === id);
    if (h.completedDates.includes(today)) h.completedDates = h.completedDates.filter(d => d !== today); else h.completedDates.push(today);
    saveAndSync(); renderHabits(); renderDashboard();
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
    if (currentEditingHabitId) { const h = habits.find(x => x.id === currentEditingHabitId); h.name = name; h.goal = document.getElementById('habit-goal').value; }
    else { habits.push({ id: Date.now().toString(), name, goal: document.getElementById('habit-goal').value, completedDates: [], createdAt: new Date().toISOString() }); }
    saveAndSync(); renderHabits(); renderDashboard(); closeModal();
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
            saveAndSync(); renderCalendar(); renderHabits(); renderDashboard();
        };
        grid.appendChild(el);
    }
}
function prevMonth() { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); }
function nextMonth() { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); }
