// Supabase Configuration - Add your credentials here
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabaseClient = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Master Timetable Definition
const TIMETABLE = {
    "Monday": ["AP Lab", "AC Lab", "Workshop", "EG"],
    "Tuesday": ["Math", "Physics", "EG"],
    "Wednesday": ["Math", "Chemistry", "DSA 1", "DSA 2", "DSA 3", "DSA 4"],
    "Thursday": ["ACAD", "ACAT", "IKS Lecture"],
    "Friday": ["IKS Practical", "Python 1", "Python 2"]
};

// State Management
let habits = JSON.parse(localStorage.getItem('habits')) || [];
let attendance = JSON.parse(localStorage.getItem('attendance')) || [];
let currentPin = '';
const CORRECT_PIN = '1116';
let currentEditingHabitId = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let activeHabitForCalendar = null;
let currentView = 'habits';
let selectedDay = "";

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('unlocked') === 'true') {
        unlockApp();
    }
    
    // Auto-select current day
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    // Default to Monday if it's weekend
    selectedDay = (todayIndex >= 1 && todayIndex <= 5) ? dayNames[todayIndex] : "Monday";
    
    updateDateDisplay();
    renderHabits();
    renderAttendanceSummary();
    selectDay(selectedDay);
    updateStats();
    
    fetchInitialData();
});

async function fetchInitialData() {
    if (!supabaseClient) return;
    try {
        const { data: hData } = await supabaseClient.from('habits').select('*').eq('user_id', 'default_user');
        const { data: aData } = await supabaseClient.from('attendance').select('*').eq('user_id', 'default_user');
        if (hData) { habits = hData; renderHabits(); }
        if (aData) { attendance = aData; renderAttendanceSummary(); renderSubjects(); }
    } catch (e) { console.error('Initial fetch failed', e); }
}

// --- Navigation ---
function switchView(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`${view}-view`).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${view}`).classList.add('active');
    if (view === 'habits') renderHabits();
    if (view === 'attendance') {
        selectDay(selectedDay);
        renderAttendanceSummary();
    }
}

function selectDay(day) {
    selectedDay = day;
    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`day-${day}`).classList.add('active');
    updateDateDisplay();
    renderSubjects();
}

function updateDateDisplay() {
    const el = document.getElementById('selected-date-display');
    if (el) el.innerText = `${selectedDay} Session`;
}

// --- Lock Screen ---
function inputPin(num) {
    if (currentPin.length < 4) {
        currentPin += num;
        updatePinDots();
        if (currentPin.length === 4) setTimeout(checkPin, 300);
    }
}
function updatePinDots() {
    const dots = document.querySelectorAll('.dot');
    dots.forEach((dot, index) => index < currentPin.length ? dot.classList.add('filled') : dot.classList.remove('filled'));
}
function clearPin() { currentPin = ''; updatePinDots(); }
function checkPin() {
    if (currentPin === CORRECT_PIN) {
        sessionStorage.setItem('unlocked', 'true');
        unlockApp();
    } else { alert('Incorrect Code'); clearPin(); }
}
function unlockApp() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
}

// --- Habit Management ---
function openModal(habitId = null) {
    currentEditingHabitId = habitId;
    const modal = document.getElementById('habit-modal');
    const nameInput = document.getElementById('habit-name');
    const goalInput = document.getElementById('habit-goal');
    if (habitId) {
        const h = habits.find(x => x.id === habitId);
        nameInput.value = h.name; goalInput.value = h.goal || '';
    } else { nameInput.value = ''; goalInput.value = ''; }
    modal.classList.remove('hidden');
    nameInput.focus();
}
function closeModal() { document.getElementById('habit-modal').classList.add('hidden'); }
async function saveHabit() {
    const name = document.getElementById('habit-name').value.trim();
    if (!name) return;
    if (currentEditingHabitId) {
        const h = habits.find(x => x.id === currentEditingHabitId);
        h.name = name; h.goal = document.getElementById('habit-goal').value;
    } else {
        habits.push({ id: Date.now().toString(), name, goal: document.getElementById('habit-goal').value, completedDates: [], createdAt: new Date().toISOString() });
    }
    saveAndSync(); renderHabits(); closeModal();
}
function toggleHabit(id) {
    const today = new Date().toISOString().split('T')[0];
    const h = habits.find(x => x.id === id);
    h.completedDates.includes(today) ? h.completedDates = h.completedDates.filter(d => d !== today) : h.completedDates.push(today);
    saveAndSync(); renderHabits();
}
function renderHabits() {
    const list = document.getElementById('habit-list');
    if (!list) return; list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];
    habits.forEach(h => {
        const isDone = h.completedDates.includes(today);
        const streak = calculateStreak(h);
        const card = document.createElement('div');
        card.className = 'habit-card';
        card.innerHTML = `
            <div class="habit-check ${isDone ? 'done' : ''}" onclick="toggleHabit('${h.id}')">
                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
            </div>
            <div class="habit-info" onclick="openCalendarFor('${h.id}')">
                <h4>${h.name}</h4><p>${h.goal || ''}</p>
            </div>
            <div class="streak-badge">🔥 ${streak}</div>
        `;
        list.appendChild(card);
    });
    updateStats();
}
function calculateStreak(h) {
    let streak = 0; let check = new Date();
    const today = check.toISOString().split('T')[0];
    if (!h.completedDates.includes(today)) check.setDate(check.getDate() - 1);
    while (h.completedDates.includes(check.toISOString().split('T')[0])) { streak++; check.setDate(check.getDate() - 1); }
    return streak;
}
function updateStats() {
    const total = habits.length;
    const today = new Date().toISOString().split('T')[0];
    const done = habits.filter(h => h.completedDates.includes(today)).length;
    if (document.getElementById('completed-count')) {
        document.getElementById('completed-count').innerText = done;
        document.getElementById('total-count').innerText = total;
        document.getElementById('daily-progress').style.width = `${total > 0 ? (done/total)*100 : 0}%`;
    }
}

// --- Attendance Tracker ---
function renderSubjects() {
    const container = document.getElementById('subjects-container');
    if (!container) return;
    container.innerHTML = '';
    
    const subjects = TIMETABLE[selectedDay] || [];
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

    subjects.forEach(sub => {
        const div = document.createElement('div');
        div.className = 'subject-row';
        div.dataset.subject = sub;
        
        // Multi-slot check
        let displayName = sub;
        if (sub.includes('DSA')) displayName = "DSA";
        if (sub.includes('Python')) displayName = "Python";

        div.innerHTML = `
            <div class="subject-info">
                <span class="subject-name">${displayName}</span>
                <span class="subject-slot">${sub.includes(' ') ? sub : ''}</span>
            </div>
            <div class="check-inputs">
                <label class="custom-check">
                    <input type="checkbox" class="class-happened" onchange="validateAttendanceInputs(this)">
                    <span class="checkmark"></span> Class
                </label>
                <label class="custom-check">
                    <input type="checkbox" class="attended" disabled onchange="handleMutualExclusivity(this, '${sub}')">
                    <span class="checkmark"></span> Attended
                </label>
            </div>
        `;
        container.appendChild(div);
    });
}

function validateAttendanceInputs(checkbox) {
    const row = checkbox.closest('.subject-row');
    const attendedCheck = row.querySelector('.attended');
    attendedCheck.disabled = !checkbox.checked;
    if (!checkbox.checked) attendedCheck.checked = false;
}

function handleMutualExclusivity(checkbox, subject) {
    if (selectedDay !== 'Monday' || !checkbox.checked) return;
    
    const container = document.getElementById('subjects-container');
    const rows = container.querySelectorAll('.subject-row');
    
    if (subject === 'AP Lab') {
        const acRow = Array.from(rows).find(r => r.dataset.subject === 'AC Lab');
        if (acRow) acRow.querySelector('.attended').checked = false;
    } else if (subject === 'AC Lab') {
        const apRow = Array.from(rows).find(r => r.dataset.subject === 'AP Lab');
        if (apRow) apRow.querySelector('.attended').checked = false;
    }
}

async function saveAttendanceDay() {
    const today = new Date().toLocaleDateString('en-CA');
    const rows = document.querySelectorAll('.subject-row');
    let count = 0;

    rows.forEach(row => {
        const subject = row.dataset.subject;
        const classHappened = row.querySelector('.class-happened').checked;
        const attended = row.querySelector('.attended').checked;

        if (classHappened) {
            // Check for existing entry for this specific subject slot on this day
            const exists = attendance.find(a => a.date === today && a.subject === subject);
            if (!exists) {
                attendance.push({
                    id: Date.now() + Math.random().toString(),
                    date: today,
                    subject,
                    classHappened,
                    attended,
                    user_id: 'default_user'
                });
                count++;
            }
        }
    });

    if (count > 0) {
        saveAndSync();
        renderAttendanceSummary();
        renderSubjects(); // This will clear inputs due to reset
        alert(`Saved ${count} entries.`);
    } else {
        alert('No new entries to save (or duplicates detected).');
    }
}

function renderAttendanceSummary() {
    const summary = document.getElementById('attendance-summary');
    if (!summary) return;
    summary.innerHTML = '<h3>Attendance Summary</h3>';

    // Unique subjects from all timetable days
    const allSubjects = [...new Set(Object.values(TIMETABLE).flat().map(s => {
        if (s.includes('DSA')) return 'DSA';
        if (s.includes('Python')) return 'Python';
        return s;
    }))];

    allSubjects.forEach(sub => {
        const relevantEntries = attendance.filter(a => {
            const aName = a.subject;
            if (sub === 'DSA') return aName.includes('DSA');
            if (sub === 'Python') return aName.includes('Python');
            return aName === sub;
        });

        const total = relevantEntries.filter(e => e.classHappened).length;
        const done = relevantEntries.filter(e => e.attended).length;
        const perc = total > 0 ? (done/total*100).toFixed(1) : 0;

        const card = document.createElement('div');
        card.className = 'glass-card subject-stat-card';
        card.style.marginBottom = '1rem';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem">
                <strong>${sub}</strong>
                <span style="color:var(--primary)">${perc}%</span>
            </div>
            <div style="font-size:0.8rem;color:var(--text-dim)">
                Total: ${total} | Attended: ${done}
            </div>
            <div class="progress-bar" style="height:4px;margin-top:0.8rem">
                <div style="width:${perc}%;background:var(--primary);height:100%"></div>
            </div>
        `;
        summary.appendChild(card);
    });
}

// --- Sync ---
async function saveAndSync() {
    localStorage.setItem('habits', JSON.stringify(habits));
    localStorage.setItem('attendance', JSON.stringify(attendance));
    if (supabaseClient) {
        try {
            await supabaseClient.from('habits').upsert(habits.map(h => ({ ...h, user_id: 'default_user' })));
            await supabaseClient.from('attendance').upsert(attendance.map(a => ({ ...a, user_id: 'default_user' })));
        } catch (err) { console.error('Sync error', err); }
    }
}

// --- Calendar ---
function openCalendarFor(id) {
    activeHabitForCalendar = habits.find(h => h.id === id);
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
}
function closeCalendar() { document.getElementById('calendar-modal').classList.add('hidden'); }
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return; grid.innerHTML = '';
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    document.getElementById('calendar-month-year').innerText = `${new Date(calendarYear, calendarMonth).toLocaleString('default', { month: 'long' })} ${calendarYear}`;
    for (let i = 0; i < firstDay; i++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'calendar-day muted' }));
    for (let d = 1; d <= days; d++) {
        const dateStr = new Date(calendarYear, calendarMonth, d).toISOString().split('T')[0];
        const isSet = activeHabitForCalendar.completedDates.includes(dateStr);
        const el = document.createElement('div');
        el.className = `calendar-day ${isSet ? 'completed' : ''}`;
        el.innerText = d;
        el.onclick = () => {
            isSet ? activeHabitForCalendar.completedDates = activeHabitForCalendar.completedDates.filter(x => x !== dateStr) : activeHabitForCalendar.completedDates.push(dateStr);
            saveAndSync(); renderCalendar(); renderHabits();
        };
        grid.appendChild(el);
    }
}
function prevMonth() { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); }
function nextMonth() { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); }
