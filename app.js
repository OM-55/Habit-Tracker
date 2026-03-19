// Supabase Configuration - Add your credentials here
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabaseClient = null;
if (SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
    // Note: The global 'supabase' object is provided by the CDN script in index.html
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// State Management
let habits = JSON.parse(localStorage.getItem('habits')) || [];
let currentPin = '';
const CORRECT_PIN = '1116';
let currentEditingHabitId = null;
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let activeHabitForCalendar = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Check if already unlocked (session based)
    if (sessionStorage.getItem('unlocked') === 'true') {
        unlockApp();
    }
    renderHabits();
    updateStats();
});

// --- Lock Screen Logic ---
function inputPin(num) {
    if (currentPin.length < 4) {
        currentPin += num;
        updatePinDots();
        if (currentPin.length === 4) {
            setTimeout(checkPin, 300);
        }
    }
}

function updatePinDots() {
    const dots = document.querySelectorAll('.dot');
    dots.forEach((dot, index) => {
        if (index < currentPin.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    });
}

function clearPin() {
    currentPin = '';
    updatePinDots();
}

function checkPin() {
    if (currentPin === CORRECT_PIN) {
        sessionStorage.setItem('unlocked', 'true');
        unlockApp();
    } else {
        alert('Incorrect Code');
        clearPin();
    }
}

function unlockApp() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}

// --- Habit Management ---
function openModal(habitId = null) {
    currentEditingHabitId = habitId;
    const modal = document.getElementById('habit-modal');
    const title = document.getElementById('modal-title');
    const nameInput = document.getElementById('habit-name');
    const goalInput = document.getElementById('habit-goal');

    if (habitId) {
        const habit = habits.find(h => h.id === habitId);
        title.innerText = 'Edit Habit';
        nameInput.value = habit.name;
        goalInput.value = habit.goal || '';
    } else {
        title.innerText = 'New Habit';
        nameInput.value = '';
        goalInput.value = '';
    }

    modal.classList.remove('hidden');
    nameInput.focus();
}

function closeModal() {
    document.getElementById('habit-modal').classList.add('hidden');
}

async function saveHabit() {
    const name = document.getElementById('habit-name').value.trim();
    const goal = document.getElementById('habit-goal').value.trim();

    if (!name) return;

    if (currentEditingHabitId) {
        const index = habits.findIndex(h => h.id === currentEditingHabitId);
        habits[index].name = name;
        habits[index].goal = goal;
    } else {
        const newHabit = {
            id: Date.now().toString(),
            name,
            goal,
            completedDates: [], // Array of ISO strings (YYYY-MM-DD)
            createdAt: new Date().toISOString()
        };
        habits.push(newHabit);
    }

    saveAndSync();
    renderHabits();
    closeModal();
}

function deleteHabit(id) {
    if (confirm('Delete this habit?')) {
        habits = habits.filter(h => h.id !== id);
        saveAndSync();
        renderHabits();
    }
}

function toggleHabit(id) {
    const today = new Date().toISOString().split('T')[0];
    const habit = habits.find(h => h.id === id);
    
    if (habit.completedDates.includes(today)) {
        habit.completedDates = habit.completedDates.filter(d => d !== today);
    } else {
        habit.completedDates.push(today);
    }

    saveAndSync();
    renderHabits();
}

function renderHabits() {
    const list = document.getElementById('habit-list');
    list.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    habits.forEach(habit => {
        const isDone = habit.completedDates.includes(today);
        const streak = calculateStreak(habit);
        
        const card = document.createElement('div');
        card.className = 'habit-card';
        card.innerHTML = `
            <div class="habit-check ${isDone ? 'done' : ''}" onclick="toggleHabit('${habit.id}')">
                <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
            </div>
            <div class="habit-info" onclick="openCalendarFor('${habit.id}')">
                <h4>${habit.name}</h4>
                <p>${habit.goal || 'No goal set'}</p>
            </div>
            <div class="streak-badge">
                <small>🔥 ${streak}</small>
            </div>
            <div class="habit-actions">
                <button class="action-btn" onclick="openModal('${habit.id}')">✎</button>
                <button class="action-btn" onclick="deleteHabit('${habit.id}')">✕</button>
            </div>
        `;
        list.appendChild(card);
    });
    updateStats();
}

// --- Logic ---
function calculateStreak(habit) {
    if (habit.completedDates.length === 0) return 0;
    
    const dates = [...habit.completedDates].sort().reverse();
    let streak = 0;
    let checkDate = new Date();
    const today = checkDate.toISOString().split('T')[0];
    
    // If not done today, start checking from yesterday
    if (!habit.completedDates.includes(today)) {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (habit.completedDates.includes(dateStr)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function updateStats() {
    const total = habits.length;
    const today = new Date().toISOString().split('T')[0];
    const done = habits.filter(h => h.completedDates.includes(today)).length;

    document.getElementById('completed-count').innerText = done;
    document.getElementById('total-count').innerText = total;
    
    const progress = total > 0 ? (done / total) * 100 : 0;
    document.getElementById('daily-progress').style.width = `${progress}%`;
}

async function saveAndSync() {
    localStorage.setItem('habits', JSON.stringify(habits));
    
    if (supabaseClient) {
        // Simple sync logic: Upsert all habits for this 'user'
        // In a real app, you'd handle specific user IDs
        const { error } = await supabaseClient
            .from('habits')
            .upsert(habits.map(h => ({ ...h, user_id: 'default_user' })));
        
        if (error) console.error('Sync error:', error);
    }
}

// --- Calendar Logic ---
function openCalendarFor(habitId) {
    activeHabitForCalendar = habits.find(h => h.id === habitId);
    renderCalendar();
    document.getElementById('calendar-modal').classList.remove('hidden');
}

function closeCalendar() {
    document.getElementById('calendar-modal').classList.add('hidden');
}

function renderCalendar() {
    const monthYear = document.getElementById('calendar-month-year');
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthYear.innerText = `${monthNames[calendarMonth]} ${calendarYear}`;

    // Fill empty days
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day muted';
        grid.appendChild(empty);
    }

    // Fill actual days
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(calendarYear, calendarMonth, day);
        const dateStr = dateObj.toISOString().split('T')[0];
        const isDone = activeHabitForCalendar.completedDates.includes(dateStr);
        const isToday = dateStr === today;

        const dayEl = document.createElement('div');
        dayEl.className = `calendar-day ${isDone ? 'completed' : ''} ${isToday ? 'today' : ''}`;
        dayEl.innerText = day;
        dayEl.onclick = () => toggleCalendarDate(dateStr);
        grid.appendChild(dayEl);
    }
}

function toggleCalendarDate(dateStr) {
    if (activeHabitForCalendar.completedDates.includes(dateStr)) {
        activeHabitForCalendar.completedDates = activeHabitForCalendar.completedDates.filter(d => d !== dateStr);
    } else {
        activeHabitForCalendar.completedDates.push(dateStr);
    }
    saveAndSync();
    renderCalendar();
    renderHabits(); // Update main view too
}

function prevMonth() {
    calendarMonth--;
    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
    }
    renderCalendar();
}

function nextMonth() {
    calendarMonth++;
    if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
    }
    renderCalendar();
}
