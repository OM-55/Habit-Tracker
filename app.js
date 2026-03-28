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
let expiryItems = []; // v50.0 NEW
let habitSteps = []; // Compound habits
let currentModalSteps = [];
let taskLists = []; // Tasks v70.0
let taskItems = [];
let customSubjects = JSON.parse(localStorage.getItem('stellar_custom_subjects') || '{}');
let editingSubjectOriginalName = null;

function getSubjectDisplayName(sub) {
    if (customSubjects[sub] && customSubjects[sub].name) return `${customSubjects[sub].name} (${customSubjects[sub].type || 'Session'})`;
    return sub;
}

function getSubjectType(sub) {
    if (customSubjects[sub] && customSubjects[sub].type) return customSubjects[sub].type;
    return "Standard Session";
}
async function renameHabit(id, oldName) {
    const newName = prompt("Enter new ritual name:", oldName);
    if (!newName || newName === oldName) return;
    const h = habits.find(x => x.id === id);
    if (!h) return;
    h.name = newName;
    await saveAndSync('rituals', habits);
}

// PWA Service Worker (v43.0)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Initial Load Consolidation (v46.0)
document.addEventListener('DOMContentLoaded', async () => {
    console.log("App Initializing...");
    
    // Load from LocalStorage first for instant UI (v46.0 Fallback)
    loadFromLocalStorage();
    
    // Then sync with Supabase
    await fetchInitialData();
    
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = new Date().getDay();
    selectedDay = (todayIndex >= 1 && todayIndex <= 5) ? dayNames[todayIndex] : "Monday";
    
    switchView('dashboard');
    selectDay(selectedDay);

    // Disable SW to prevent caching issues
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
    }

    // Auto-refresh stocks every 60s
    setInterval(async () => {
        await fetchInitialData(); 
        if (stocks.length > 0) fetchLivePrices(); 
    }, 60000);
});

function saveToLocalStorage() {
    const backup = { habits, attendance, reminders, stocks, manualStats };
    localStorage.setItem('stellar_backup', JSON.stringify(backup));
    console.log("Local backup saved.");
}

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
            console.log("Restored from local backup.");
            renderHabits(); renderAttendanceSummary(); renderReminders(); renderDashboard();
        } catch (e) { console.error("Local load failed", e); }
    }
}

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
    if (view === 'expiry') renderExpiryTracker();
    
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
        const { data: e, error: eErr } = await supabaseClient.from('expiry_items').select('*').eq('user_id', USER_ID);
        const { data: st, error: stErr } = await supabaseClient.from('habit_steps').select('*').order('created_at', { ascending: true });
        const { data: tl, error: tlErr } = await supabaseClient.from('task_lists').select('*');
        const { data: ti, error: tiErr } = await supabaseClient.from('task_items').select('*');

        if (hErr) console.error("Rituals fetch error:", hErr);
        if (aErr) console.error("Attendance fetch error:", aErr);
        if (mErr) console.error("ManualStats fetch error:", mErr);
        if (rErr) console.error("Reminders fetch error:", rErr);
        if (sErr) console.error("Stocks fetch error:", sErr);
        if (eErr) console.error("Expiry fetch error:", eErr);
        if (stErr) console.error("Steps fetch error:", stErr);
        if (tlErr) console.error("Task lists fetch error:", tlErr);
        if (tiErr) console.error("Task items fetch error:", tiErr);

        if (e) expiryItems = e.map(x => ({
            id: x.id,
            name: x.name,
            initialDays: parseInt(x.days_left),
            createdAt: x.created_at
        }));

        if (s) stocks = s.map(x => ({
            id: x.id,
            name: x.name,
            buy_price: parseFloat(x.buy_price),
            quantity: parseFloat(x.quantity),
            current_price: 0 // Set on live fetch
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

        if (st) {
            habitSteps = st.map(x => ({ id: x.id, habit_id: x.habit_id, name: x.name, completed: x.completed || false }));
            const today = new Date().toISOString().split('T')[0];
            const lastDate = localStorage.getItem('stellar_last_date');
            if (lastDate && lastDate !== today) {
                habitSteps.forEach(s => s.completed = false);
                await supabaseClient.from('habit_steps').update({ completed: false }).neq('name', '~~~dummy~~~');
            }
            localStorage.setItem('stellar_last_date', today);
        }

        if (tl) taskLists = tl.map(x => ({ id: x.id, title: x.title, created_at: x.created_at }));
        if (ti) taskItems = ti.map(x => ({ id: x.id, list_id: x.list_id, content: x.content, is_checked: x.is_checked, type: x.type, created_at: x.created_at }));
        
        console.log("Sync complete. Habits:", habits.length);
        
        // Save to local backup
        saveToLocalStorage();
        
        renderHabits();
        renderAttendanceSummary();
        renderReminders();
        renderExpiryTracker();
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
        'stocks': 'Stock Tracker',
        'tasks': 'Tasks & Notes'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.innerText = titles[view] || 'Stellar';

    // 4. Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${view}`);
    if (navBtn) navBtn.classList.add('active');

    // 4b. Update Bottom Nav Active State
    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));
    const bottomNavBtn = Array.from(document.querySelectorAll('.bottom-nav-item')).find(btn => btn.getAttribute('onclick').includes(`'${view}'`));
    if (bottomNavBtn) bottomNavBtn.classList.add('active');
    
    // 5. Toggle Global Actions
    const globalActions = document.getElementById('global-reminder-actions');
    if (globalActions) {
        if (view === 'reminders') globalActions.classList.remove('hidden');
        else globalActions.classList.add('hidden');
    }
    
    // 5a. Conditional Header "+" Button (v60.0)
    const headerAddBtn = document.getElementById('header-add-btn');
    if (headerAddBtn) {
        const allowedViews = ['habits', 'reminders', 'stocks', 'expiry'];
        if (allowedViews.includes(view)) {
            headerAddBtn.classList.remove('hidden');
        } else {
            headerAddBtn.classList.add('hidden');
        }
    }

    // 5b. Expiry Alert Visibility (v61.0)
    const alertContainer = document.getElementById('priority-alert-container');
    if (alertContainer && view !== 'dashboard' && view !== 'expiry') {
        alertContainer.innerHTML = '';
    }
    
    // 6. Refresh Data
    if (view === 'dashboard') { renderDashboard(); renderReminders(); }
    if (view === 'habits') renderHabits();
    if (view === 'attendance') { renderSubjects(); renderAttendanceSummary(); }
    if (view === 'stocks') renderStocks();
    if (view === 'tasks') renderTasksBoard();
}

/** 
 * Context-aware Add function for Mobile Header (v45.0)
 */
function handleAdd() {
    const view = String(currentView).trim().toLowerCase();
    console.log("handleAdd START. View:", view);
    if (view === 'habits' || view === 'dashboard' || view === 'stellar') {
        console.log("Calling openModal from handleAdd");
        openModal();
    } else if (view === 'reminders') {
        openReminderModal();
    } else if (view === 'stocks') {
        openStockModal();
    } else if (view === 'expiry') {
        openExpiryModal();
    } else {
        console.log("Defaulting to openModal");
        openModal();
    }
}

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

function handleMenu() {
    console.log("More options coming soon!");
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
            activeItems.sort((a,b) => calculateDaysLeft(a.createdAt, a.initialDays) - calculateDaysLeft(b.createdAt, b.initialDays)).slice(0, 3).forEach(item => {
                const daysLeft = calculateDaysLeft(item.createdAt, item.initialDays);
                const el = document.createElement('div');
                el.className = 'ritual-card-mini dashboard-expiry-item';
                el.style.display = 'flex';
                el.style.justifyContent = 'space-between';
                el.style.alignItems = 'center';
                el.style.cursor = 'pointer';
                el.onclick = () => switchView('expiry');
                el.innerHTML = `
                    <div class="ritual-info" style="flex:1;">
                        <span class="ritual-name">${item.name}</span>
                    </div>
                    <div class="ritual-streak" style="background:${daysLeft === 1 ? 'rgba(251,191,36,0.1)' : 'transparent'}; color:${daysLeft === 1 ? '#fbbf24' : 'var(--text-dim)'}; border:${daysLeft === 1 ? '1px solid rgba(251,191,36,0.3)' : 'none'}; padding: 2px 8px; border-radius: 4px; font-weight: 600; margin-right: 10px;">
                        ${daysLeft} d left
                    </div>
                    <div style="font-size:1.2rem; color:var(--text-dim); opacity:0.5;">→</div>
                `;
                expiryList.appendChild(el);
            });
        }
    }

    const hList = document.getElementById('habits-preview-list');
    if (hList) {
        hList.innerHTML = '';
        const today = new Date().toISOString().split('T')[0];
        // Sort by streak and take top 5
        const sortedHabits = [...habits].sort((a, b) => calculateStreak(b) - calculateStreak(a)).slice(0, 5);
        
        sortedHabits.forEach(h => {
            const isDone = h.completedDates.includes(today);
            const streak = calculateStreak(h);
            const hSteps = habitSteps.filter(s => s.habit_id === h.id);
            const totalSteps = hSteps.length;
            const compSteps = hSteps.filter(s => s.completed).length;

            let progressHtml = '';
            let stepText = '';
            if (totalSteps > 0) {
                stepText = `<span style="font-size:0.75rem; color:var(--text-dim); margin-left:8px;">(${compSteps}/${totalSteps})</span>`;
                const perc = (compSteps / totalSteps) * 100;
                progressHtml = `
                <div style="width: 100%; height: 3px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-top: 6px; overflow: hidden; pointer-events: none;">
                    <div style="width: ${perc}%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
                </div>`;
            }

            const div = document.createElement('div');
            div.className = `ritual-card-mini glass-card ${isDone ? 'completed' : ''}`;
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.marginBottom = '0.5rem';
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; cursor:pointer;" onclick="switchView('habits')">
                    <div class="ritual-info" style="margin-right: 15px; flex:1;">
                        <span class="ritual-name" style="display:block; margin-bottom: 2px;">${h.name} ${stepText}</span>
                        <span class="ritual-streak" style="font-size: 0.75rem; color: var(--text-dim);">🔥 ${streak} &nbsp; ⭐ ${h.bestStreak || streak}</span>
                    </div>
                    <div class="status-indicator ${isDone ? 'done' : ''}" style="margin-left: auto; color:${isDone ? 'var(--primary)' : 'var(--text-dim)'}; font-weight:bold;">
                        ${isDone ? '✓' : '—'}
                    </div>
                </div>
                ${progressHtml}
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
                    <span class="ritual-name">${getSubjectDisplayName(sub)}</span>
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

    renderStocksDashboard();
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
                <span style="font-size:0.7rem; color:var(--text-dim);">₹${cur}</span>
            </div>
            <div class="${profit >= 0 ? 'success-text' : 'error-text'}" style="font-weight:700;">
                ${profit >= 0 ? '+' : ''}${perc}%
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
            <div class="subject-info" style="cursor:pointer;" onclick="openClassSubjectModal('${sub}')" title="Click to rename subject">
                <span class="subject-name">${getSubjectDisplayName(sub)}</span>
                <span class="subject-slot">${getSubjectType(sub)}</span>
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
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">
                <strong>${getSubjectDisplayName(sub)}</strong> <span style="color:var(--primary)">${perc}%</span>
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
    const name = document.getElementById('class-subject-name').value.trim();
    const type = document.getElementById('class-subject-type').value.trim();
    if (!name) return;
    
    customSubjects[editingSubjectOriginalName] = { name, type };
    localStorage.setItem('stellar_custom_subjects', JSON.stringify(customSubjects));
    closeClassSubjectModal();
    renderSubjects();
    renderAttendanceSummary();
    renderDashboard();
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
        console.log(`Syncing ${table} to Supabase...`);
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
        }

        const { error } = await supabaseClient.from(table).upsert(payload);
        if (error) throw error;

        console.log(`Synced ${table} successfully`);
        await fetchInitialData(); // Re-fetch to confirm and update UI
    } catch (e) {
        console.error(`Sync failed for ${table}:`, e);
        // Fallback: save to localStorage anyway
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
    const title = document.getElementById('rem-title').value.trim();
    const date = document.getElementById('rem-date').value;
    if (!title || !date) return;
    
    const newRem = { id: generateId(), title, date, completed: false };
    reminders.push(newRem);
    
    // Render immediately for UX
    renderFullReminders();
    renderReminders();
    
    closeReminderModal();
    await saveAndSync('reminders', reminders);
}

function renderReminders() {
    const dashList = document.getElementById('dashboard-reminders');
    if (!dashList) return;
    dashList.innerHTML = '';
    
    const todayStr = new Date().toISOString().split('T')[0];
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
        div.className = `reminder-item ${isToday ? 'reminder-today-highlight' : ''}`;
        div.id = `rem-card-${rem.id}`;
        div.style.cursor = 'pointer';
        div.onclick = () => switchView('reminders');
        
        div.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                <span class="rem-title" style="font-weight:600; color:${isToday ? 'var(--primary)' : 'var(--text-color)'};">${rem.title}</span>
                <span class="rem-date" style="align-self:flex-start; font-size:0.8rem; color:${isToday ? 'var(--primary)' : 'var(--text-dim)'}; opacity:${isToday ? '0.8' : '1'};">${isToday ? '⚠ ' : ''}${formatDate(rem.date)}</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <span style="font-size:1.2rem; color:var(--text-dim); opacity:0.5;">→</span>
            </div>
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
    
    const todayStr = new Date().toISOString().split('T')[0];
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
    const diffTime = now - created;
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
        const newItem = {
            id: generateId(),
            user_id: USER_ID,
            name: name,
            days_left: days,
            created_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('expiry_items').insert([newItem]);
        if (error) throw error;

        await fetchInitialData();
        closeExpiryModal();
    } catch (err) {
        console.error("Save expiry item failed:", err);
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
function calculateStreak(h) {
    let s = 0; let d = new Date(); const today = d.toISOString().split('T')[0];
    if (!h.completedDates.includes(today)) d.setDate(d.getDate()-1);
    while (h.completedDates.includes(d.toISOString().split('T')[0])) { s++; d.setDate(d.getDate()-1); }
    
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
    const today = new Date().toISOString().split('T')[0];
    
    habits.forEach(h => {
        const isDone = h.completedDates.includes(today);
        const currentStreak = calculateStreak(h);
        
        const hSteps = habitSteps.filter(s => s.habit_id === h.id);
        const totalSteps = hSteps.length;
        const compSteps = hSteps.filter(s => s.completed).length;
        
        let progressHtml = '';
        let stepText = '';
        if (totalSteps > 0) {
            stepText = `<span style="font-size:0.8rem; color:var(--text-dim); margin-left:8px;">(${compSteps}/${totalSteps})</span>`;
            const perc = (compSteps / totalSteps) * 100;
            progressHtml = `
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 4px; margin-top: 10px; overflow: hidden; pointer-events: none;">
                <div style="width: ${perc}%; height: 100%; background: var(--primary); transition: width 0.3s ease;"></div>
            </div>`;
        }

        const card = document.createElement('div'); 
        card.className = `habit-card-v2 glass-card ${isDone ? 'completed' : ''}`;
        card.style.flexDirection = 'column';
        card.style.alignItems = 'stretch';
        card.style.gap = '0';
        
        card.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:1.5rem;">
                <div class="habit-left" onclick="openDetailModal('${h.id}')">
                    <span class="habit-name">${h.name} ${stepText}</span>
                    <span class="habit-subtext">${h.goal || ''}</span>
                </div>
                
                <div class="habit-middle" onclick="openDetailModal('${h.id}')">
                    <div class="streak-pill" style="display:flex; gap:6px; align-items:center;">
                        <span>🔥 ${currentStreak}</span>
                        <span style="opacity:0.3;">|</span>
                        <span>⭐ ${h.bestStreak || currentStreak}</span>
                    </div>
                </div>
                
                <div class="habit-right">
                    <div class="habit-check-v2 ${isDone ? 'done' : ''}" onclick="toggleHabit('${h.id}')">
                        <div class="check-inner"></div>
                    </div>
                </div>
            </div>
            ${progressHtml}
        `;
        l.appendChild(card);
    });
    updateStats();
}

async function toggleHabit(id) {
    const today = new Date().toISOString().split('T')[0];
    const h = habits.find(x => x.id === id);
    if (!h) return;
    
    // Maintain references to master habitSteps
    const hSteps = habitSteps.filter(s => s.habit_id === id);

    if (h.completedDates.includes(today)) {
        // C: If parent manually unchecked -> all steps = unchecked
        h.completedDates = h.completedDates.filter(d => d !== today);
        if (hSteps.length > 0) {
            hSteps.forEach(s => s.completed = false);
            await supabaseClient.from('habit_steps').update({ completed: false }).eq('habit_id', id);
        }
    } else {
        // D: If parent manually checked -> all steps complete
        h.completedDates.push(today);
        if (hSteps.length > 0) {
            hSteps.forEach(s => s.completed = true);
            await supabaseClient.from('habit_steps').update({ completed: true }).eq('habit_id', id);
        }
    }
    
    await saveAndSync('rituals', habits);
    renderHabits();
    renderDashboard();
    updateStats();
}

function updateStats() {
    const total = habits.length; 
    const today = new Date().toISOString().split('T')[0];
    const done = habits.filter(h => h.completedDates.includes(today)).length;
    
    const statsBox = document.getElementById('today-stats');
    if (statsBox) {
        statsBox.innerHTML = `
            <div class="stats-text-row" id="completed-count-wrapper">
                <span style="font-size: 1.1rem; font-weight: 800;"><span id="completed-count">${done}</span> / <span id="total-count">${total}</span></span>
                <span style="font-size: 0.6rem; color: var(--text-dim); text-transform: uppercase; font-weight: 400; letter-spacing: 0.5px;">Done Today</span>
            </div>
            <div class="progress-bar mini"><div id="daily-progress" class="progress-fill" style="width: ${total > 0 ? (done / total) * 100 : 0}%"></div></div>
        `;
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
            if (streakGroup) streakGroup.classList.remove('hidden');
            if (currentStreakInput) currentStreakInput.value = calculateStreak(h);
            currentModalSteps = habitSteps.filter(s => s.habit_id === id).map(s => ({...s}));
        }
    } else { 
        if (title) title.innerText = 'New Ritual';
        name.value = ''; 
        goal.value = ''; 
        if (streakGroup) streakGroup.classList.add('hidden');
        currentModalSteps = [];
    }
    
    renderModalSteps();
    modal.classList.remove('hidden');
    modal.classList.add('visible'); // Added for extra safety
    setTimeout(() => {
        try { name.focus(); } catch(e) { console.warn("Focus failed", e); }
    }, 100);
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
        div.style = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:8px;";
        div.innerHTML = `
            <span style="flex:1;">${step.name}</span>
            <div style="display:flex; gap:8px; align-items:center;">
                <button class="secondary" style="padding:2px 6px; font-size:1rem; min-width:unset; width:auto; border-radius:4px;" onclick="moveModalStep(${index}, -1)" ${index === 0 ? 'disabled style="opacity:0.3;padding:2px 6px;font-size:1rem;min-width:unset;"' : ''}>↑</button>
                <button class="secondary" style="padding:2px 6px; font-size:1rem; min-width:unset; width:auto; border-radius:4px;" onclick="moveModalStep(${index}, 1)" ${index === currentModalSteps.length - 1 ? 'disabled style="opacity:0.3;padding:2px 6px;font-size:1rem;min-width:unset;"' : ''}>↓</button>
                <span onclick="removeModalStep(${index})" style="cursor:pointer; color:var(--error); font-weight:bold; font-size:1.1rem; padding:4px; margin-left:8px;">✕</span>
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
                <div class="habit-check-v2 ${step.completed ? 'done' : ''}" style="width:28px; height:28px; margin-right:12px;">
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
    
    const today = new Date().toISOString().split('T')[0];
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
            
            if (currentStreakInput) {
                const newCurrentStreak = parseInt(currentStreakInput.value) || 0;
                h.bestStreak = Math.max(h.bestStreak || 0, newCurrentStreak);
                
                // Regenerate completedDates based on newCurrentStreak
                const today = new Date().toISOString().split('T')[0];
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
            h = { id: generateId(), name, goal, completedDates: [], user_id: USER_ID };
            habits.push(h);
        }

        const dbHabitId = h.id;
        
        await supabaseClient.from('habit_steps').delete().eq('habit_id', dbHabitId);
        
        const stepsToInsert = currentModalSteps.map(st => ({
            id: generateId(), // Refresh ID to avoid stale reference
            habit_id: dbHabitId,
            name: st.name,
            completed: st.completed || false
        }));

        if (stepsToInsert.length > 0) {
            await supabaseClient.from('habit_steps').insert(stepsToInsert);
        }
        
        // Rebuild local list safely
        habitSteps = habitSteps.filter(s => s.habit_id !== dbHabitId);
        stepsToInsert.forEach(st => {
            habitSteps.push(st);
        });

        await saveAndSync('rituals', habits);
        closeModal();
    } catch (err) {
        console.error("Save ritual failed:", err);
    }
}
function openCalendarFor(id) { activeHabitForCalendar = habits.find(h => h.id === id); renderCalendar(); document.getElementById('calendar-modal').classList.remove('hidden'); }
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

    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < first; i++) daysGrid.appendChild(Object.assign(document.createElement('div'), { className: 'calendar-day muted' }));
    for (let d = 1; d <= days; d++) {
        const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isSet = activeHabitForCalendar.completedDates.includes(dateStr);
        const isToday = (dateStr === todayStr);
        const el = document.createElement('div'); el.className = `calendar-day ${isSet ? 'completed' : ''} ${isToday ? 'today' : ''}`;
        el.innerText = d; el.onclick = () => {
            if (isSet) activeHabitForCalendar.completedDates = activeHabitForCalendar.completedDates.filter(x => x !== dateStr); else activeHabitForCalendar.completedDates.push(dateStr);
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
            <div class="stock-card-header">
                <div>
                    <span class="symbol">${stock.name}</span>
                    <span class="qty">${stock.quantity} Shares</span>
                </div>
                <button class="delete-btn" onclick="deleteStock('${stock.id}')">×</button>
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
        stocks.push({ id: generateId(), name, buy_price: buyPrice, quantity });
        await saveAndSync('stocks', stocks);
        closeStockModal();
    } catch (err) {
        console.error("Save stock failed:", err);
    }
}

async function deleteStock(id) {
    if (!confirm("Remove this stock from portfolio?")) return;
    try {
        const { error } = await supabaseClient.from('stocks').delete().eq('id', id);
        if (error) throw error;
        await fetchInitialData(); 
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

// --- Tasks & Notes (v70.0) ---
let currentTaskInputType = 'task'; // 'task' or 'note'
let activeTaskListId = null;

function renderTasksBoard() {
    const grid = document.getElementById('tasks-board-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const sortedLists = [...taskLists].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    
    if (sortedLists.length === 0) {
        grid.innerHTML = '<div class="empty-state-modern" style="grid-column:1/-1;">No task lists yet. Create your first!</div>';
        return;
    }
    
    sortedLists.forEach(list => {
        const items = taskItems.filter(i => i.list_id === list.id).sort((a,b) => {
            if (a.is_checked === b.is_checked) return new Date(a.created_at) - new Date(b.created_at);
            return a.is_checked ? 1 : -1;
        });
        
        const card = document.createElement('div');
        card.className = 'task-card glass-card';
        card.onclick = () => openTaskListEditor(list.id);
        
        const header = document.createElement('div');
        header.className = 'task-card-header';
        header.innerHTML = `<h3 style="font-size:1.1rem; margin:0;">${list.title}</h3>`;
        card.appendChild(header);
        
        const content = document.createElement('div');
        content.className = 'task-card-content';
        
        items.slice(0, 5).forEach(it => {
            const line = document.createElement('div');
            line.className = 'task-item-line';
            line.style.transition = 'all 0.3s ease';
            line.style.opacity = it.is_checked ? '0.6' : '1';
            
            line.innerHTML = `
                <div class="task-checkbox-mock ${it.is_checked ? 'checked' : ''}" style="transition: all 0.2s;">
                    ${it.is_checked ? '✓' : ''}
                </div> 
                <span class="${it.is_checked ? 'done' : ''}" style="${it.is_checked ? 'text-decoration:line-through; color:var(--text-dim);' : ''}; font-size:1rem;">
                    ${it.content}
                </span>`;
            content.appendChild(line);
        });
        if (items.length === 0) content.innerHTML = '<span style="color:var(--text-dim); font-size:0.85rem; font-style:italic;">Empty list</span>';
        
        card.appendChild(content);
        grid.appendChild(card);
    });
}

function createNewTaskList() {
    const title = prompt("Enter new list name:");
    if (!title || !title.trim()) return;
    const newList = { id: generateId(), title: title.trim(), created_at: new Date().toISOString() };
    taskLists.push(newList);
    supabaseClient.from('task_lists').insert(newList).then();
    renderTasksBoard();
    openTaskListEditor(newList.id);
}

function openTaskListEditor(id) {
    const list = taskLists.find(l => l.id === id);
    if (!list) return;
    activeTaskListId = id;
    
    document.getElementById('task-editor-title').innerText = list.title;
    currentTaskInputType = 'task';
    updateTaskTypeToggleUI();
    renderTaskItemsEditor();
    
    const m = document.getElementById('task-editor-modal');
    m.classList.remove('hidden');
    m.classList.add('visible');
    setTimeout(() => { document.getElementById('new-task-input').focus(); }, 100);
}

function closeTaskEditor() {
    const m = document.getElementById('task-editor-modal');
    m.classList.remove('visible');
    m.classList.add('hidden');
    activeTaskListId = null;
    renderTasksBoard();
}

function renderTaskItemsEditor() {
    const container = document.getElementById('task-editor-items');
    if (!container) return;
    container.innerHTML = '';
    
    const items = taskItems.filter(i => i.list_id === activeTaskListId).sort((a,b) => {
        if (a.is_checked === b.is_checked) return new Date(a.created_at) - new Date(b.created_at);
        return a.is_checked ? 1 : -1;
    });
    
    items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'task-input-row';
        row.style.transition = 'all 0.3s ease';
        row.style.opacity = it.is_checked ? '0.6' : '1';
        
        row.innerHTML = `
            <div class="task-checkbox-mock ${it.is_checked ? 'checked' : ''}" style="cursor:pointer; flex-shrink:0; transition: all 0.2s;" onclick="toggleTaskItemCheck('${it.id}')">
                ${it.is_checked ? '✓' : ''}
            </div>
            <input type="text" class="task-item-edit-input" value="${it.content.replace(/"/g, '&quot;')}" 
                style="flex:1; background:transparent; border:none; color:${it.is_checked ? 'var(--text-dim)' : 'white'}; text-decoration:${it.is_checked ? 'line-through' : 'none'}; font-size:1rem; padding:4px 8px; font-family:inherit; outline:none; transition: all 0.3s;"
                onblur="editTaskItemContent('${it.id}', this.value)"
                onkeydown="if(event.key === 'Enter') { this.blur(); }">
            <button class="delete-btn-modern" style="padding:4px; flex-shrink:0;" onclick="deleteTaskItem('${it.id}')">✕</button>
        `;
        container.appendChild(row);
    });
}

// Task types removed


async function addTaskItem() {
    const input = document.getElementById('new-task-input');
    const content = input.value.trim();
    if (!content) return;
    
    const newItem = {
        id: generateId(),
        list_id: activeTaskListId,
        content: content,
        is_checked: false,
        type: 'task', // Only tasks now as per user instruction
        created_at: new Date().toISOString()
    };
    taskItems.push(newItem);
    input.value = '';
    renderTaskItemsEditor();
    await supabaseClient.from('task_items').insert(newItem);
}

async function toggleTaskItemCheck(id) {
    const it = taskItems.find(i => i.id === id);
    if (!it) return;
    it.is_checked = !it.is_checked;
    renderTaskItemsEditor();
    await supabaseClient.from('task_items').update({ is_checked: it.is_checked }).eq('id', id);
}

async function editTaskItemContent(id, newContent) {
    if (!newContent || !newContent.trim()) return;
    const it = taskItems.find(i => i.id === id);
    if (!it || it.content === newContent.trim()) return;
    
    it.content = newContent.trim();
    renderTaskItemsEditor(); // visually confirm change
    await supabaseClient.from('task_items').update({ content: it.content }).eq('id', id);
}

async function deleteTaskItem(id) {
    taskItems = taskItems.filter(i => i.id !== id);
    renderTaskItemsEditor();
    await supabaseClient.from('task_items').delete().eq('id', id);
}
