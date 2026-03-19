// Supabase Configuration
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
let supabaseClient = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TIMETABLE = {
    "Monday": ["AP Lab", "AC Lab", "Workshop", "EG"],
    "Tuesday": ["Math", "Physics", "EG"],
    "Wednesday": ["Math", "Chemistry", "DSA 1", "DSA 2", "DSA 3", "DSA 4"],
    "Thursday": ["ACAD", "ACAT", "IKS Lecture"],
    "Friday": ["IKS Practical", "Python 1", "Python 2"]
};

// State
let habits = JSON.parse(localStorage.getItem('habits')) || [];
let attendance = JSON.parse(localStorage.getItem('attendance')) || [];
let manualStats = JSON.parse(localStorage.getItem('manualStats')) || {}; // { Subject: { total: X, attended: Y } }
let currentPin = '';
const CORRECT_PIN = '1116';
let currentEditingHabitId = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let activeHabitForCalendar = null;
let currentView = 'dashboard';
let selectedDay = "";
let editMode = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('unlocked') === 'true') unlockApp();
    
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    selectedDay = (todayIndex >= 1 && todayIndex <= 5) ? dayNames[todayIndex] : "Monday";
    
    switchView('dashboard');
    renderHabits();
    renderAttendanceSummary();
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
        if (h) { habits = h; renderHabits(); renderDashboard(); }
        if (a) { attendance = a; renderAttendanceSummary(); renderSubjects(); renderDashboard(); }
        if (m) {
            manualStats = {};
            m.forEach(row => { manualStats[row.subject] = { total: row.total, attended: row.attended }; });
            renderAttendanceSummary(); renderDashboard();
        }
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
    
    if (view === 'dashboard') renderDashboard();
    if (view === 'habits') renderHabits();
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
    // Habits Preview (Top 3 streaks)
    const hList = document.getElementById('habits-preview-list');
    if (hList) {
        hList.innerHTML = '';
        const sortedHabits = [...habits].sort((a, b) => calculateStreak(b) - calculateStreak(a)).slice(0, 3);
        sortedHabits.forEach(h => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `<span>${h.name}</span> <span class="streak">🔥 ${calculateStreak(h)}</span>`;
            hList.appendChild(div);
        });
    }

    // Attendance Preview
    const aList = document.getElementById('attendance-preview-list');
    if (aList) {
        aList.innerHTML = '';
        const allSubjects = Array.from(new Set(Object.values(TIMETABLE).flat().map(s => s.includes('DSA') ? 'DSA' : (s.includes('Python') ? 'Python' : s))));
        let totalClassesAll = 0; let totalAttendedAll = 0;

        allSubjects.slice(0, 4).forEach(sub => {
            const stats = getSubjectStats(sub);
            totalClassesAll += stats.total; totalAttendedAll += stats.attended;
            const perc = stats.total > 0 ? (stats.attended / stats.total * 100).toFixed(0) : 0;
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.innerHTML = `<span>${sub}</span> <span class="streak">${perc}%</span>`;
            aList.appendChild(div);
        });
        
        const overallPerc = totalClassesAll > 0 ? (totalAttendedAll / totalClassesAll * 100).toFixed(0) : 0;
        document.getElementById('overall-attendance-badge').innerText = `${overallPerc}% Overall`;
    }
}

function getSubjectStats(sub) {
    const manual = manualStats[sub] || { total: 0, attended: 0 };
    const logs = attendance.filter(a => {
        if (sub === 'DSA') return a.subject.includes('DSA');
        if (sub === 'Python') return a.subject.includes('Python');
        return a.subject === sub;
    });
    const loggedTotal = logs.filter(l => l.classHappened).length;
    const loggedAttended = logs.filter(l => l.attended).length;
    return { total: manual.total + loggedTotal, attended: manual.attended + loggedAttended };
}

// --- Lock & Edit Mode ---
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
    // Lock if target day is BEFORE today (current week logic)
    return targetIndex < todayIndex;
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
        let displayName = sub.includes('DSA') ? "DSA" : (sub.includes('Python') ? "Python" : sub);
        
        div.innerHTML = `
            <div class="subject-info">
                <span class="subject-name">${displayName}</span>
                <span class="subject-slot">${sub.includes(' ') ? sub : ''}</span>
            </div>
            <div class="check-inputs">
                <label class="custom-check">
                    <input type="checkbox" class="class-happened" onchange="validateCheck(this)" ${locked ? 'disabled' : ''}>
                    <span class="checkmark"></span> Class
                </label>
                <label class="custom-check">
                    <input type="checkbox" class="attended" disabled onchange="handleMutual(this, '${sub}')" ${locked ? 'disabled' : ''}>
                    <span class="checkmark"></span> Attended
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
    
    // Auto-progression (Always move to next day on Save Click)
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const currIdx = days.indexOf(selectedDay);
    if (currIdx !== -1 && currIdx < 4) {
        selectDay(days[currIdx + 1]);
        alert('Day progress saved. Moving to the next session.');
    } else {
        alert('Day progress saved.');
    }
}

function renderAttendanceSummary() {
    const summary = document.getElementById('attendance-summary');
    if (!summary) return;
    summary.innerHTML = `<div class="card-header"><h3>Subject Breakdown</h3></div>`;

    const allSubs = Array.from(new Set(Object.values(TIMETABLE).flat().map(s => s.includes('DSA') ? 'DSA' : (s.includes('Python') ? 'Python' : s))));
    allSubs.forEach(sub => {
        const stats = getSubjectStats(sub);
        const perc = stats.total > 0 ? (stats.attended / stats.total * 100).toFixed(1) : 0;
        const card = document.createElement('div');
        card.className = 'glass-card stat-card';
        card.style.marginBottom = '1rem';
        
        const manual = manualStats[sub] || { total: 0, attended: 0 };
        
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem">
                <strong>${sub}</strong> <span style="color:var(--primary)">${perc}%</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim); display:flex; justify-content:space-between;">
                ${editMode ? `
                    <div class="edit-stat-group">
                        T: <input type="number" value="${manual.total}" onchange="updateManualStat('${sub}', 'total', this.value)">
                        A: <input type="number" value="${manual.attended}" onchange="updateManualStat('${sub}', 'attended', this.value)">
                    </div>
                ` : `
                    <span>Total: ${stats.total} | Attended: ${stats.attended}</span>
                `}
            </div>
            <div class="progress-bar" style="height:4px;margin-top:0.8rem">
                <div class="progress-fill" style="width:${perc}%"></div>
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

// --- Lock Screen ---
function inputPin(n) { if (currentPin.length < 4) { currentPin += n; updateDots(); if (currentPin.length === 4) setTimeout(checkPin, 300); } }
function updateDots() { document.querySelectorAll('.dot').forEach((d, i) => i < currentPin.length ? d.classList.add('filled') : d.classList.remove('filled')); }
function clearPin() { currentPin = ''; updateDots(); }
function checkPin() { if (currentPin === CORRECT_PIN) { sessionStorage.setItem('unlocked','true'); unlockApp(); } else { alert('Incorrect'); clearPin(); } }
function unlockApp() { document.getElementById('lock-screen').classList.add('hidden'); document.getElementById('app-container').classList.remove('hidden'); }

// --- Sync ---
async function saveAndSync() {
    localStorage.setItem('habits', JSON.stringify(habits));
    localStorage.setItem('attendance', JSON.stringify(attendance));
    localStorage.setItem('manualStats', JSON.stringify(manualStats));
    if (supabaseClient) {
        try {
            await supabaseClient.from('habits').upsert(habits.map(h => ({ ...h, user_id: 'default_user' })));
            await supabaseClient.from('attendance').upsert(attendance.map(a => ({ ...a, user_id: 'default_user' })));
            const mData = Object.keys(manualStats).map(s => ({ subject: s, total: manualStats[s].total, attended: manualStats[s].attended, user_id: 'default_user' }));
            await supabaseClient.from('manual_stats').upsert(mData);
        } catch (e) { console.error('Sync failed', e); }
    }
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
        card.innerHTML = `<div class="habit-check ${isDone?'done':''}" onclick="toggleHabit('${h.id}')"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg></div>
            <div class="habit-info" onclick="openCalendarFor('${h.id}')"><h4>${h.name}</h4><p>${h.goal||''}</p></div>
            <div class="badge">🔥 ${calculateStreak(h)}</div>`;
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

// --- Calendar & Modal ---
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
