/**
 * Pomo - Minimal Pomodoro Timer
 * A distraction-free timer for deep work
 */

// ============================================
// State & Configuration
// ============================================

const STORAGE_KEY = 'pomo_data';
const CIRCUMFERENCE = 2 * Math.PI * 90; // SVG circle circumference (r=90)

// Time values available for scroll wheel (in minutes)
const TIME_VALUES = {
  work: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90],
  break: [5, 10, 15, 20, 25, 30]
};

// Area colors (max 5 areas = 5 colors)
const AREA_COLORS = [
  { name: 'coral',  value: '#f87171' },
  { name: 'amber',  value: '#fbbf24' },
  { name: 'violet', value: '#a78bfa' },
  { name: 'teal',   value: '#2dd4bf' },
  { name: 'sky',    value: '#38bdf8' },
];

const state = {
  // Timer state
  mode: 'work', // 'work' | 'break'
  status: 'idle', // 'idle' | 'running' | 'paused' | 'completed' | 'overflow'

  // Time tracking
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,

  // Work/break durations (in minutes)
  workMinutes: 25,
  breakMinutes: 5,

  // Flow / overtime state
  timerEndBehavior: 'stop', // 'stop' | 'continue'
  overflowSeconds: 0,       // seconds accrued past pomo end in flow mode
  pausedFromOverflow: false, // true when paused while in overflow

  // Drift-proof timing
  startedAt: null,          // Date.now() when timer started/resumed
  elapsedAtPause: 0,        // seconds elapsed when paused (for resume calc)

  // Abandon confirmation
  abandonConfirmTimeout: null, // timeout ID for resetting confirm state

  // Session tracking
  sessionCount: 1,
  totalFocusedMinutes: 0,

  // Timer interval reference
  intervalId: null,

  // Theme: 'light' | 'dark' | 'synthwave'
  theme: 'light',

  // Task intent (legacy - keeping for compatibility)
  currentTask: '',

  // Areas system
  areas: [], // Array of { id, name, colorIndex, completed, totalSeconds, createdAt }

  // Tasks system
  tasks: [], // Array of { id, name, estimatedMinutes, actualSeconds, completed, createdAt, goalId }
  activeTaskId: null, // ID of task being worked on during Pomo

  // Task settings
  showCompletedTasks: true, // Show struck-out completed tasks
  taskCompletionBehavior: 'nextTask', // 'endSession' | 'nextTask'
  keepIncompleteTasks: true, // Keep incomplete tasks on new day (vs clear all)
  lastVisitDate: null, // For clearing done tasks on new day

  // Sidebar state
  sidebarOpen: false,

  // Ambient sounds
  currentSound: 'off', // 'off' | any key from SOUNDS object
  volume: 50,

  // History tracking (all-time)
  history: {}, // { "2026-01-18": { sessions: 4, minutes: 100 }, ... }

  // Stats view preference
  statsView: 'sessions', // 'sessions' | 'minutes'

  // Daily goal & streaks
  dailyGoalMinutes: 90, // Target focused minutes per day
  currentStreak: 0, // Consecutive days hitting goal
  longestStreak: 0, // All-time best streak
  includeWeekends: true, // Whether to include weekends in stats

  // Summary tracking
  summaryShownDate: null, // Date when summary was last shown (YYYY-MM-DD)
  tasksCompletedYesterday: 0, // Track tasks completed for summary

  // Todoist integration
  todoist: {
    enabled: false,
    apiToken: null,
    syncStatus: 'idle', // 'idle' | 'syncing' | 'error' | 'success'
    lastError: null,
    lastSyncTime: null
  }
};

// Audio context and nodes for ambient sounds
let audioContext = null;
let ambientNodes = {
  source: null,
  gain: null,
  filter: null
};

// Cache for loaded audio file buffers
const audioBufferCache = {};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Timer display
  timerDisplay: document.getElementById('timerDisplay'),
  timerStatus: document.getElementById('timerStatus'),
  progressRing: document.getElementById('progressRing'),
  timerContainer: document.querySelector('.timer-container'),

  // Current task display (during active sessions)
  currentTaskDisplay: document.getElementById('currentTaskDisplay'),
  currentTaskText: document.getElementById('currentTaskText'),

  // Timer inline arrows
  decreaseBtn: document.getElementById('decreaseBtn'),
  increaseBtn: document.getElementById('increaseBtn'),

  // Break settings (in stats modal)
  breakDecreaseBtn: document.getElementById('breakDecreaseBtn'),
  breakIncreaseBtn: document.getElementById('breakIncreaseBtn'),
  breakDurationDisplay: document.getElementById('breakDurationDisplay'),

  // Controls
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  continueBtn: document.getElementById('continueBtn'),
  doneBtn: document.getElementById('doneBtn'),
  abandonBtn: document.getElementById('abandonBtn'),
  skipBtn: document.getElementById('skipBtn'),

  // Goal progress
  goalProgress: document.getElementById('goalProgress'),
  goalProgressBar: document.getElementById('goalProgressBar'),
  goalProgressText: document.getElementById('goalProgressText'),

  // Theme toggle
  themeToggle: document.getElementById('themeToggle'),

  // Sound controls
  soundControl: document.getElementById('soundControl'),
  soundToggle: document.getElementById('soundToggle'),
  soundDropdown: document.getElementById('soundDropdown'),
  soundOptions: document.querySelectorAll('.sound-option'),
  volumeSlider: document.getElementById('volumeSlider'),

  // Stats
  statsBtn: document.getElementById('statsBtn'),
  statsOverlay: document.getElementById('statsOverlay'),
  statsCloseBtn: document.getElementById('statsCloseBtn'),
  statsChart: document.getElementById('statsChart'),
  statsSummary: document.getElementById('statsSummary'),
  statsToggleBtns: document.querySelectorAll('.stats-toggle-btn'),

  // Task sidebar
  taskSidebar: document.getElementById('taskSidebar'),
  sidebarTab: document.getElementById('sidebarTab'),
  sidebarPanel: document.getElementById('sidebarPanel'),
  sidebarClose: document.getElementById('sidebarClose'),
  addTaskInput: document.getElementById('addTaskInput'),
  addTaskEstimate: document.getElementById('addTaskEstimate'),
  taskList: document.getElementById('taskList'),

  // Task settings
  showCompletedToggle: document.getElementById('showCompletedToggle'),
  taskCompletionSelect: document.getElementById('taskCompletionSelect'),
  keepIncompleteTasksToggle: document.getElementById('keepIncompleteTasksToggle'),
  timerEndBehaviorSelect: document.getElementById('timerEndBehaviorSelect'),

  // Undo toast
  undoToast: document.getElementById('undoToast'),
  undoBtn: document.getElementById('undoBtn'),

  // Notes modal
  notesOverlay: document.getElementById('notesOverlay'),
  notesCloseBtn: document.getElementById('notesCloseBtn'),
  notesTaskName: document.getElementById('notesTaskName'),
  notesTextarea: document.getElementById('notesTextarea'),
  notesSaveBtn: document.getElementById('notesSaveBtn'),

  // Summary modal
  summaryOverlay: document.getElementById('summaryOverlay'),
  summaryCloseBtn: document.getElementById('summaryCloseBtn'),
  summaryDismissBtn: document.getElementById('summaryDismissBtn'),
  summaryMinutes: document.getElementById('summaryMinutes'),
  summarySessions: document.getElementById('summarySessions'),
  summaryTasks: document.getElementById('summaryTasks'),
  summaryStreak: document.getElementById('summaryStreak'),
  summaryStreakText: document.getElementById('summaryStreakText'),
  summaryMessage: document.getElementById('summaryMessage'),

  // Settings modal
  settingsBtn: document.getElementById('settingsBtn'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  dailyGoalSelect: document.getElementById('dailyGoalSelect'),
  includeWeekendsToggle: document.getElementById('includeWeekendsToggle'),

  // Daily progress (task sidebar)
  dailyProgressBar: document.getElementById('dailyProgressBar'),
  dailyProgressText: document.getElementById('dailyProgressText'),

  // Streak stats
  currentStreakDisplay: document.getElementById('currentStreak'),
  longestStreakDisplay: document.getElementById('longestStreak')
};

// ============================================
// Local Storage
// ============================================

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);

      // Restore work/break durations (with migration from old preset system)
      if (typeof data.workMinutes === 'number') {
        state.workMinutes = data.workMinutes;
      } else if (data.customPreset) {
        // Migrate from old preset system
        state.workMinutes = data.customPreset.work || 25;
      }
      if (typeof data.breakMinutes === 'number') {
        state.breakMinutes = data.breakMinutes;
      } else if (data.customPreset) {
        // Migrate from old preset system
        state.breakMinutes = data.customPreset.break || 5;
      }

      // Restore session stats for today
      if (data.date === getTodayDate()) {
        state.sessionCount = data.sessionCount || 1;
        state.totalFocusedMinutes = data.totalFocusedMinutes || 0;
      }

      // Restore theme preference (with backward compatibility)
      if (data.theme) {
        state.theme = data.theme;
        if (data.theme !== 'light') {
          document.documentElement.setAttribute('data-theme', data.theme);
        }
      } else if (data.darkMode) {
        // Backward compatibility: convert old darkMode boolean
        state.theme = 'dark';
        document.documentElement.setAttribute('data-theme', 'dark');
      }

      // Restore volume preference only (sound resets each session)
      if (typeof data.volume === 'number') {
        state.volume = data.volume;
        elements.volumeSlider.value = data.volume;
      }

      // Restore history
      if (data.history) {
        state.history = data.history;
      }

      // Restore current task (legacy)
      if (data.currentTask) {
        state.currentTask = data.currentTask;
      }

      // Restore stats view preference
      if (data.statsView) {
        state.statsView = data.statsView;
      }

      // Restore tasks
      if (data.tasks && Array.isArray(data.tasks)) {
        state.tasks = data.tasks;
      }

      // Restore task settings
      if (typeof data.showCompletedTasks === 'boolean') {
        state.showCompletedTasks = data.showCompletedTasks;
      }
      if (data.taskCompletionBehavior) {
        state.taskCompletionBehavior = data.taskCompletionBehavior;
      }
      if (typeof data.keepIncompleteTasks === 'boolean') {
        state.keepIncompleteTasks = data.keepIncompleteTasks;
      }
      if (data.lastVisitDate) {
        state.lastVisitDate = data.lastVisitDate;
      }

      // Restore timer end behavior
      if (data.timerEndBehavior) {
        state.timerEndBehavior = data.timerEndBehavior;
      }

      // Restore daily goal & streaks
      if (typeof data.dailyGoalMinutes === 'number') {
        state.dailyGoalMinutes = data.dailyGoalMinutes;
      }
      if (typeof data.currentStreak === 'number') {
        state.currentStreak = data.currentStreak;
      }
      if (typeof data.longestStreak === 'number') {
        state.longestStreak = data.longestStreak;
      }
      if (typeof data.includeWeekends === 'boolean') {
        state.includeWeekends = data.includeWeekends;
      }

      // Restore summary shown date
      if (data.summaryShownDate) {
        state.summaryShownDate = data.summaryShownDate;
      }

      // Restore areas (migrate from legacy 'goals' key if needed)
      if (data.areas && Array.isArray(data.areas)) {
        state.areas = data.areas;
      } else if (data.goals && Array.isArray(data.goals)) {
        state.areas = data.goals;
      }
    }
  } catch (e) {
    console.warn('Failed to load from storage:', e);
  }
}

function saveToStorage() {
  try {
    const data = {
      workMinutes: state.workMinutes,
      breakMinutes: state.breakMinutes,
      timerEndBehavior: state.timerEndBehavior,
      sessionCount: state.sessionCount,
      totalFocusedMinutes: state.totalFocusedMinutes,
      theme: state.theme,
      // Note: currentSound is NOT persisted - resets each session
      volume: state.volume,
      history: state.history,
      currentTask: state.currentTask,
      statsView: state.statsView,
      // Areas
      areas: state.areas,
      // Tasks
      tasks: state.tasks,
      showCompletedTasks: state.showCompletedTasks,
      taskCompletionBehavior: state.taskCompletionBehavior,
      keepIncompleteTasks: state.keepIncompleteTasks,
      lastVisitDate: state.lastVisitDate,
      // Daily goal & streaks
      dailyGoalMinutes: state.dailyGoalMinutes,
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
      includeWeekends: state.includeWeekends,
      // Summary
      summaryShownDate: state.summaryShownDate,
      // Todoist
      todoist: {
        enabled: state.todoist.enabled,
        apiToken: state.todoist.apiToken,
        lastSyncTime: state.todoist.lastSyncTime
      },
      date: getTodayDate()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save to storage:', e);
  }
}

function getTodayDate() {
  return getDateInAEST(new Date());
}

// Get date string (YYYY-MM-DD) in AEST/AEDT timezone
function getDateInAEST(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

// ============================================
// Timer Logic
// ============================================

function startTimer() {
  if (state.status === 'running' || state.status === 'overflow') return;

  // If break just completed, transition to work/idle so user can pick focus time
  if (state.status === 'completed' && state.mode === 'break') {
    switchMode();
    return;
  }

  state.status = 'running';
  state.startedAt = Date.now();
  state.elapsedAtPause = 0;

  // Set active task for this Pomo session
  setActiveTaskForPomo();

  // Reset sound to off at session start (don't persist between sessions)
  if (state.currentSound !== 'off') {
    state.currentSound = 'off';
    updateSoundUI();
  }

  // Show sound control during active sessions
  updateSoundControlVisibility();

  updateUI();

  state.intervalId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000) + state.elapsedAtPause;
    state.remainingSeconds = Math.max(0, state.totalSeconds - elapsed);

    // Track time on active task
    trackTaskTime();

    if (state.remainingSeconds <= 0) {
      completeTimer();
    } else {
      updateTimerDisplay();
      updateProgressRing();
      updateBrowserTab();
    }
  }, 1000);
}

function pauseTimer() {
  if (state.status !== 'running' && state.status !== 'overflow') return;

  clearInterval(state.intervalId);
  state.intervalId = null;

  // Snapshot elapsed time for drift-proof resume
  if (state.status === 'overflow') {
    // For overflow, store accumulated overflow seconds so we can resume from them
    state.elapsedAtPause = state.overflowSeconds;
  } else {
    state.elapsedAtPause = state.totalSeconds - state.remainingSeconds;
  }
  state.startedAt = null;

  state.pausedFromOverflow = state.status === 'overflow';
  state.status = 'paused';
  stopAmbientSound();
  updateSoundControlVisibility();
  updateUI();
}

function resetTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;

  state.totalSeconds = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  stopAmbientSound();
  updateSoundControlVisibility();
  updateUI();
}

function skipTimer() {
  // Skip break - when in break mode (any status) or when about to start break (work completed)
  const isBreakMode = state.mode === 'break' && (state.status === 'paused' || state.status === 'running' || state.status === 'idle');
  const isAboutToBreak = state.mode === 'work' && state.status === 'completed';

  if (!isBreakMode && !isAboutToBreak) return;

  clearInterval(state.intervalId);
  state.intervalId = null;

  // Stop ambient sounds and hide control
  stopAmbientSound();
  updateSoundControlVisibility();

  // Switch to work mode without counting
  state.mode = 'work';
  state.totalSeconds = state.workMinutes * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

function continueTimer() {
  // Resume from paused state
  if (state.status !== 'paused') return;

  // Resume ambient sound if one was selected
  if (state.currentSound !== 'off') {
    playAmbientSound(state.currentSound);
  }

  // Restart drift-proof clock from where we left off
  state.startedAt = Date.now();

  // If we were in overflow when paused, resume overflow counting
  if (state.pausedFromOverflow) {
    const overflowAtPause = state.elapsedAtPause; // overflow seconds accumulated before pause
    state.status = 'overflow';
    state.pausedFromOverflow = false;
    updateSoundControlVisibility();
    updateUI();

    state.intervalId = setInterval(() => {
      state.overflowSeconds = overflowAtPause + Math.floor((Date.now() - state.startedAt) / 1000);
      trackTaskTime();
      updateTimerDisplay();
      updateProgressRing();
      updateBrowserTab();
      if (state.overflowSeconds % 30 === 0) {
        saveToStorage();
      }
    }, 1000);
    return;
  }

  state.status = 'running';
  updateSoundControlVisibility();
  updateUI();

  state.intervalId = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000) + state.elapsedAtPause;
    state.remainingSeconds = Math.max(0, state.totalSeconds - elapsed);

    // Track time on active task
    trackTaskTime();

    if (state.remainingSeconds <= 0) {
      completeTimer();
    } else {
      updateTimerDisplay();
      updateProgressRing();
      updateBrowserTab();
    }
  }, 1000);
}

function doneTimer() {
  // End work early with partial credit, or end an overflow session
  const isOverflow = state.status === 'overflow' || (state.status === 'paused' && state.pausedFromOverflow);
  if (state.status !== 'paused' && state.status !== 'overflow') return;
  if (state.mode !== 'work') return;

  clearInterval(state.intervalId);
  state.intervalId = null;

  // If ending from overflow, record the extra time beyond the base session
  // (base session minutes were already recorded when pomo ended)
  // If ending early (pre-completion), calculate partial minutes from the countdown
  let partialMinutes;
  if (isOverflow) {
    partialMinutes = Math.floor(state.overflowSeconds / 60);
  } else {
    const elapsedSeconds = state.totalSeconds - state.remainingSeconds;
    partialMinutes = Math.floor(elapsedSeconds / 60);
  }

  // Only record if at least 1 minute was worked
  if (partialMinutes > 0) {
    state.totalFocusedMinutes += partialMinutes;

    // Record in history - minutes only, NOT as a completed session
    const today = getTodayDate();
    if (!state.history[today]) {
      state.history[today] = { sessions: 0, minutes: 0, dailyGoal: state.dailyGoalMinutes };
    }
    // Update dailyGoal to current value (tracks most recent goal for the day)
    state.history[today].dailyGoal = state.dailyGoalMinutes;
    // Note: sessions NOT incremented for "Done" - only minutes
    state.history[today].minutes += partialMinutes;

    saveToStorage();
  }

  // Reset overflow state
  state.overflowSeconds = 0;
  state.pausedFromOverflow = false;

  // Stop ambient sounds and hide control
  stopAmbientSound();
  updateSoundControlVisibility();

  // Transition to break mode
  state.mode = 'break';
  state.totalSeconds = state.breakMinutes * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

function abandonTimer() {
  // Full reset, no stats recorded
  if (state.status !== 'paused' && state.status !== 'overflow') return;

  // First click: show "Sure?" confirmation
  if (!state.abandonConfirmTimeout) {
    elements.abandonBtn.textContent = 'Sure?';
    elements.abandonBtn.classList.add('confirming');
    state.abandonConfirmTimeout = setTimeout(() => {
      elements.abandonBtn.textContent = 'Abandon';
      elements.abandonBtn.classList.remove('confirming');
      state.abandonConfirmTimeout = null;
    }, 2000);
    return;
  }

  // Second click: actually abandon
  clearTimeout(state.abandonConfirmTimeout);
  state.abandonConfirmTimeout = null;
  elements.abandonBtn.textContent = 'Abandon';
  elements.abandonBtn.classList.remove('confirming');

  clearInterval(state.intervalId);
  state.intervalId = null;

  // Reset overflow state
  state.overflowSeconds = 0;
  state.pausedFromOverflow = false;

  // Stop ambient sounds and hide control
  stopAmbientSound();
  updateSoundControlVisibility();

  // Full reset to work mode idle - NO stats recorded
  state.mode = 'work';
  state.totalSeconds = state.workMinutes * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

function completeTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.remainingSeconds = 0;

  // Track completed work session
  if (state.mode === 'work') {
    const minutes = Math.round(state.totalSeconds / 60);
    state.totalFocusedMinutes += minutes;
    state.sessionCount++;

    // Record in history
    const today = getTodayDate();
    if (!state.history[today]) {
      state.history[today] = { sessions: 0, minutes: 0, dailyGoal: state.dailyGoalMinutes };
    }
    state.history[today].dailyGoal = state.dailyGoalMinutes;
    state.history[today].sessions++;
    state.history[today].minutes += minutes;

    saveToStorage();
  }

  // Play notification sound and show notification
  playNotificationSound();
  showBrowserNotification();

  // If flow mode is on and this was a work session, count up instead of stopping
  if (state.timerEndBehavior === 'continue' && state.mode === 'work') {
    startOverflow();
    return;
  }

  state.status = 'completed';

  // Stop ambient sounds and hide control
  stopAmbientSound();
  updateSoundControlVisibility();

  updateUI();
}

function startOverflow() {
  state.status = 'overflow';
  state.overflowSeconds = 0;
  state.pausedFromOverflow = false;
  state.startedAt = Date.now();
  state.elapsedAtPause = 0;

  // Keep sound playing and control visible
  updateSoundControlVisibility();
  updateUI();

  state.intervalId = setInterval(() => {
    state.overflowSeconds = Math.floor((Date.now() - state.startedAt) / 1000);

    // Track time on active task
    trackTaskTime();

    updateTimerDisplay();
    updateProgressRing();
    updateBrowserTab();

    // Periodic save
    if (state.overflowSeconds % 30 === 0) {
      saveToStorage();
    }
  }, 1000);
}

function switchMode() {
  state.mode = state.mode === 'work' ? 'break' : 'work';

  state.totalSeconds = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
  updateAmbientSoundForMode();
}

// ============================================
// Timer Stepper Controls
// ============================================

function decreaseWorkTime() {
  const values = TIME_VALUES.work;
  const idx = values.indexOf(state.workMinutes);
  if (idx > 0) {
    state.workMinutes = values[idx - 1];
    applyWorkTime();
  }
  updateStepperButtons();
}

function increaseWorkTime() {
  const values = TIME_VALUES.work;
  const idx = values.indexOf(state.workMinutes);
  if (idx < values.length - 1) {
    state.workMinutes = values[idx + 1];
    applyWorkTime();
  }
  updateStepperButtons();
}

function applyWorkTime() {
  if (state.mode === 'work' && state.status === 'idle') {
    state.totalSeconds = state.workMinutes * 60;
    state.remainingSeconds = state.totalSeconds;
  }
  updateUI();
  saveToStorage();
}

function decreaseBreakTime() {
  const values = TIME_VALUES.break;
  const idx = values.indexOf(state.breakMinutes);
  if (idx > 0) {
    state.breakMinutes = values[idx - 1];
    updateBreakDisplay();
    saveToStorage();
  }
}

function increaseBreakTime() {
  const values = TIME_VALUES.break;
  const idx = values.indexOf(state.breakMinutes);
  if (idx < values.length - 1) {
    state.breakMinutes = values[idx + 1];
    updateBreakDisplay();
    saveToStorage();
  }
}

function updateBreakDisplay() {
  elements.breakDurationDisplay.textContent = `${state.breakMinutes} min`;
}

function updateStepperVisibility() {
  // Show arrows only in work mode when idle
  const show = state.mode === 'work' && state.status === 'idle';
  elements.decreaseBtn.hidden = !show;
  elements.increaseBtn.hidden = !show;
}

function updateStepperButtons() {
  const values = TIME_VALUES.work;
  const idx = values.indexOf(state.workMinutes);

  // Disable buttons at min/max
  elements.decreaseBtn.disabled = idx <= 0;
  elements.increaseBtn.disabled = idx >= values.length - 1;
}

// ============================================
// UI Updates
// ============================================

function updateUI() {
  updateTimerDisplay();
  updateProgressRing();
  updateStatusDisplay();
  updateControlButtons();
  updateSessionInfo();
  updateBrowserTab();
  updateModeStyles();
  updateStepperVisibility();
  updateStepperButtons();
  updateFocusMode();
  updateTaskDraggable();
  updateCurrentTaskDisplay();
}

// Update current task display (shown during active/paused work sessions)
function updateCurrentTaskDisplay() {
  const isActiveWorkSession = state.mode === 'work' &&
    (state.status === 'running' || state.status === 'paused' || state.status === 'overflow');
  const nextTask = getNextIncompleteTask();

  if (isActiveWorkSession && nextTask) {
    elements.currentTaskText.textContent = nextTask.name;
    elements.currentTaskDisplay.hidden = false;
  } else {
    elements.currentTaskDisplay.hidden = true;
  }
}

// Update draggable state of tasks based on timer status
function updateTaskDraggable() {
  const canDrag = state.status !== 'running';
  document.querySelectorAll('.task-item').forEach(el => {
    const isCompleted = el.classList.contains('completed');
    el.draggable = canDrag && !isCompleted;
  });
}

function updateFocusMode() {
  // Focus mode is active when running a work session (including overflow)
  const isFocused = (state.status === 'running' || state.status === 'overflow') && state.mode === 'work';
  document.body.classList.toggle('focus-mode', isFocused);
}

function updateTimerDisplay() {
  const isOverflowDisplay = state.status === 'overflow' ||
    (state.status === 'paused' && state.pausedFromOverflow);

  if (isOverflowDisplay) {
    const minutes = Math.floor(state.overflowSeconds / 60);
    const seconds = state.overflowSeconds % 60;
    elements.timerDisplay.textContent =
      `+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    elements.timerDisplay.classList.add('overflow-display');
  } else {
    const minutes = Math.floor(state.remainingSeconds / 60);
    const seconds = state.remainingSeconds % 60;
    elements.timerDisplay.textContent =
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    elements.timerDisplay.classList.remove('overflow-display');
  }
}

function updateProgressRing() {
  const isOverflow = state.status === 'overflow' ||
    (state.status === 'paused' && state.pausedFromOverflow);

  elements.progressRing.classList.toggle('overflow-mode', isOverflow);

  if (isOverflow) {
    // Ring stays fully filled during overflow
    elements.progressRing.style.strokeDasharray = CIRCUMFERENCE;
    elements.progressRing.style.strokeDashoffset = 0;
  } else {
    elements.progressRing.classList.remove('overflow-mode');
    const progress = state.remainingSeconds / state.totalSeconds;
    const offset = CIRCUMFERENCE * (1 - progress);
    elements.progressRing.style.strokeDasharray = CIRCUMFERENCE;
    elements.progressRing.style.strokeDashoffset = offset;
  }
}

function updateStatusDisplay() {
  const statusEl = elements.timerStatus;
  statusEl.classList.remove('working', 'break', 'pulsing');

  if (state.status === 'overflow') {
    statusEl.textContent = 'In flow...';
    statusEl.classList.add('working');
  } else if (state.status === 'completed') {
    if (state.mode === 'work') {
      statusEl.textContent = 'Work complete!';
      statusEl.classList.add('working', 'pulsing');
    } else {
      statusEl.textContent = 'Break over!';
      statusEl.classList.add('break', 'pulsing');
    }
  } else if (state.status === 'running') {
    if (state.mode === 'work') {
      statusEl.textContent = 'Working...';
      statusEl.classList.add('working');
    } else {
      statusEl.textContent = 'On break';
      statusEl.classList.add('break');
    }
  } else if (state.status === 'paused') {
    statusEl.textContent = 'Paused';
  } else {
    statusEl.textContent = state.mode === 'work' ? 'Ready to focus' : 'Ready for break';
  }
}

function updateControlButtons() {
  const { status, mode } = state;

  // Hide all buttons first and reset dynamic labels
  elements.startBtn.hidden = true;
  elements.pauseBtn.hidden = true;
  elements.continueBtn.hidden = true;
  elements.doneBtn.hidden = true;
  elements.doneBtn.textContent = 'Done';
  elements.abandonBtn.hidden = true;
  elements.skipBtn.hidden = true;

  if (status === 'idle') {
    // Only Start visible
    elements.startBtn.hidden = false;
    elements.startBtn.textContent = 'Start';
    elements.startBtn.classList.toggle('break-mode', mode === 'break');

    // Show skip button when about to start break (after clicking Done)
    if (mode === 'break') {
      elements.skipBtn.hidden = false;
    }

  } else if (status === 'running') {
    // Only Pause visible
    elements.pauseBtn.hidden = false;

  } else if (status === 'overflow') {
    // In flow: Pause + Stop (done with credit) + Abandon
    elements.pauseBtn.hidden = false;
    elements.doneBtn.hidden = false;
    elements.doneBtn.textContent = 'Stop';
    elements.abandonBtn.hidden = false;

  } else if (status === 'paused') {
    // Continue is always visible when paused
    elements.continueBtn.hidden = false;
    elements.continueBtn.classList.toggle('break-mode', mode === 'break');

    if (mode === 'work') {
      // Work mode: Continue, Done/Stop, Abandon
      elements.doneBtn.hidden = false;
      elements.doneBtn.textContent = state.pausedFromOverflow ? 'Stop' : 'Done';
      elements.abandonBtn.hidden = false;
    } else {
      // Break mode: Continue, Skip
      elements.skipBtn.hidden = false;
    }

  } else if (status === 'completed') {
    // Show transition button
    elements.startBtn.hidden = false;
    elements.startBtn.textContent = mode === 'work' ? 'Start Break' : 'Start Work';
    elements.startBtn.classList.toggle('break-mode', mode === 'work');

    // Show skip button when about to start break (just finished work)
    if (mode === 'work') {
      elements.skipBtn.hidden = false;
    }
  }
}

function updateSessionInfo() {
  updateGoalProgress();
}

function updateGoalProgress() {
  const progress = state.totalFocusedMinutes;
  const goal = state.dailyGoalMinutes;
  const percentage = Math.min(100, Math.round((progress / goal) * 100));
  const isComplete = progress >= goal;

  // Update progress bar
  if (elements.goalProgressBar) {
    elements.goalProgressBar.style.width = `${percentage}%`;
  }

  // Update text
  if (elements.goalProgressText) {
    elements.goalProgressText.textContent = `${progress} / ${goal} min`;
  }

  // Toggle completed state for gold styling
  if (elements.goalProgress) {
    elements.goalProgress.classList.toggle('goal-complete', isComplete);
  }
}

function updateBrowserTab() {
  if (state.status === 'overflow') {
    const minutes = Math.floor(state.overflowSeconds / 60);
    const seconds = state.overflowSeconds % 60;
    const timeStr = `+${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.title = `🌊 ${timeStr} - Pomo`;
    return;
  }

  const minutes = Math.floor(state.remainingSeconds / 60);
  const seconds = state.remainingSeconds % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  let emoji = '🍅';
  if (state.status === 'completed') {
    emoji = '✓';
  } else if (state.mode === 'break') {
    emoji = '☕';
  } else if (state.status === 'paused') {
    emoji = state.pausedFromOverflow ? '🌊' : '⏸';
  }

  if (state.status === 'running' || state.status === 'paused') {
    document.title = `${emoji} ${timeStr} - Pomo`;
  } else if (state.status === 'completed') {
    document.title = `${emoji} Done! - Pomo`;
  } else {
    document.title = 'Pomo';
  }
}

function updateModeStyles() {
  const isBreakMode = state.mode === 'break';
  elements.progressRing.classList.toggle('break-mode', isBreakMode);
}

// ============================================
// Notifications
// ============================================

function playNotificationSound() {
  try {
    // Create a simple beep using Web Audio API as fallback
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // Play a second beep
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.frequency.value = 1000;
      osc2.type = 'sine';

      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.5);
    }, 200);
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}

function showBrowserNotification() {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    createNotification();
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        createNotification();
      }
    });
  }
}

function createNotification() {
  let title, body;

  if (state.mode === 'work') {
    title = '🍅 Work session complete!';
    body = 'Time for a well-deserved break!';
  } else {
    title = '☕ Break is over!';
    body = 'Ready to get back to work?';
  }

  new Notification(title, {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍅</text></svg>',
    tag: 'pomo-notification',
    requireInteraction: true
  });
}

// ============================================
// Sound Control UI
// ============================================

function updateSoundControlVisibility() {
  // Show sound control only during active sessions (running, overflow, or paused)
  const isActiveSession = state.status === 'running' || state.status === 'paused' || state.status === 'overflow';
  elements.soundControl.hidden = !isActiveSession;

  // Close dropdown when hiding
  if (!isActiveSession) {
    closeSoundDropdown();
  }
}

function toggleSoundDropdown() {
  const isOpen = !elements.soundDropdown.hidden;
  if (isOpen) {
    closeSoundDropdown();
  } else {
    openSoundDropdown();
  }
}

function openSoundDropdown() {
  elements.soundDropdown.hidden = false;
  elements.soundToggle.setAttribute('aria-expanded', 'true');
}

function closeSoundDropdown() {
  elements.soundDropdown.hidden = true;
  elements.soundToggle.setAttribute('aria-expanded', 'false');
}

function updateSoundUI() {
  // Update sound option buttons
  elements.soundOptions.forEach(btn => {
    const isActive = btn.dataset.sound === state.currentSound;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Update toggle button to show if sound is playing
  const isPlaying = state.currentSound !== 'off';
  elements.soundToggle.classList.toggle('active', isPlaying);
}

// ============================================
// Ambient Sounds (High Quality)
// ============================================

function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function stopAmbientSound() {
  // Stop all sources and nodes
  if (ambientNodes.sources) {
    ambientNodes.sources.forEach(s => {
      try { s.stop(); } catch(e) {}
      s.disconnect();
    });
  }
  if (ambientNodes.source) {
    try { ambientNodes.source.stop(); } catch(e) {}
    ambientNodes.source.disconnect();
  }
  if (ambientNodes.nodes) {
    ambientNodes.nodes.forEach(n => n.disconnect());
  }
  if (ambientNodes.gain) {
    ambientNodes.gain.disconnect();
  }
  if (ambientNodes.interval) {
    clearInterval(ambientNodes.interval);
  }
  if (ambientNodes.extraInterval) {
    clearInterval(ambientNodes.extraInterval);
  }
  if (ambientNodes.thunderTimeout) {
    clearTimeout(ambientNodes.thunderTimeout);
  }

  ambientNodes = { source: null, gain: null, filter: null, sources: [], nodes: [], interval: null, extraInterval: null, thunderTimeout: null };
}

// Load audio file from /audio/ folder
async function loadAudioFile(filename) {
  const ctx = initAudioContext();

  // Check cache first
  if (audioBufferCache[filename]) {
    return audioBufferCache[filename];
  }

  try {
    const response = await fetch(`audio/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load ${filename}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache[filename] = audioBuffer;
    return audioBuffer;
  } catch (error) {
    console.log(`Audio file ${filename} not available, using synthesis fallback`);
    return null;
  }
}

// Play a loaded audio buffer in a seamless loop
function playLoadedAudio(buffer, volumeScale = 0.5) {
  const ctx = initAudioContext();
  stopAmbientSound();

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const gainNode = ctx.createGain();
  gainNode.gain.value = state.volume / 100 * volumeScale;

  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  source.start();

  ambientNodes.source = source;
  ambientNodes.gain = gainNode;
  ambientNodes.sources = [source];
  ambientNodes.nodes = [gainNode];
}

// Sound configuration - maps IDs to filenames and volume scales
const SOUNDS = {
  'light-rain':    { file: 'sounds/light-rain.mp3',    volume: 0.5 },
  'heavy-rain':    { file: 'sounds/heavy-rain.mp3',    volume: 0.5 },
  'rain-on-tent':  { file: 'sounds/rain-on-tent.mp3',  volume: 0.5 },
  'river':         { file: 'sounds/river.mp3',         volume: 0.5 },
  'waves':         { file: 'sounds/waves.mp3',         volume: 0.5 },
  'campfire':      { file: 'sounds/campfire.mp3',      volume: 0.45 },
  'wind':          { file: 'sounds/wind.mp3',          volume: 0.5 },
  'birds':         { file: 'sounds/birds.mp3',         volume: 0.5 },
  'crickets':      { file: 'sounds/crickets.mp3',      volume: 0.5 },
  'cafe':          { file: 'sounds/cafe.mp3',          volume: 0.4 },
  'clock':         { file: 'sounds/clock.mp3',         volume: 0.4 },
  'wind-chimes':   { file: 'sounds/wind-chimes.mp3',   volume: 0.5 },
  'pink-noise':    { file: 'sounds/pink-noise.wav',    volume: 0.35 },
  'brown-noise':   { file: 'sounds/brown-noise.wav',   volume: 0.35 },
  'train':         { file: 'sounds/train.mp3',         volume: 0.5 },
};


async function playAmbientSound(soundType) {
  state.currentSound = soundType;
  updateSoundUI();
  stopAmbientSound();

  const shouldPlay = state.status === 'running' || state.status === 'overflow';
  if (soundType !== 'off' && shouldPlay) {
    const config = SOUNDS[soundType];
    if (config) {
      const buffer = await loadAudioFile(config.file);
      if (buffer) {
        playLoadedAudio(buffer, config.volume);
      }
    }
  }
}

function updateVolume(value) {
  state.volume = value;

  if (ambientNodes.gain) {
    const config = SOUNDS[state.currentSound];
    const scale = config ? config.volume : 0.5;
    ambientNodes.gain.gain.value = value / 100 * scale;
  }

  saveToStorage();
}

function updateAmbientSoundForMode() {
  if (state.status === 'completed') {
    stopAmbientSound();
  } else if (state.currentSound !== 'off' && state.status === 'running') {
    playAmbientSound(state.currentSound);
  }
}


// ============================================
// Statistics
// ============================================

function openStatsModal() {
  updateStatsDisplay();
  elements.statsOverlay.classList.add('active');
  elements.statsOverlay.setAttribute('aria-hidden', 'false');
}

function closeStatsModal() {
  elements.statsOverlay.classList.remove('active');
  elements.statsOverlay.setAttribute('aria-hidden', 'true');
}

// ============================================
// Settings Modal
// ============================================

function openSettingsModal() {
  elements.settingsOverlay.classList.add('active');
  elements.settingsOverlay.setAttribute('aria-hidden', 'false');
}

function closeSettingsModal() {
  elements.settingsOverlay.classList.remove('active');
  elements.settingsOverlay.setAttribute('aria-hidden', 'true');
}

// ============================================
// Notes Modal
// ============================================

function openNotesModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  editingNotesTaskId = taskId;
  elements.notesTaskName.textContent = task.name;
  elements.notesTextarea.value = task.notes || '';
  elements.notesOverlay.classList.add('active');
  elements.notesOverlay.setAttribute('aria-hidden', 'false');
  elements.notesTextarea.focus();
}

function closeNotesModal() {
  elements.notesOverlay.classList.remove('active');
  elements.notesOverlay.setAttribute('aria-hidden', 'true');
  editingNotesTaskId = null;
}

function saveTaskNotes() {
  if (!editingNotesTaskId) return;

  const task = state.tasks.find(t => t.id === editingNotesTaskId);
  if (!task) return;

  const notes = elements.notesTextarea.value.trim();
  task.notes = notes;
  saveToStorage();
  renderTasks();
  closeNotesModal();
}

// ============================================
// End of Day Summary Modal
// ============================================

function getYesterdayDate() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateInAEST(yesterday);
}

function shouldShowSummary() {
  const today = getTodayDate();
  const yesterday = getYesterdayDate();

  // Don't show if already shown today
  if (state.summaryShownDate === today) {
    return false;
  }

  // Check if there's data from yesterday
  const yesterdayData = state.history[yesterday];
  if (!yesterdayData || (yesterdayData.minutes === 0 && yesterdayData.sessions === 0)) {
    return false;
  }

  return true;
}

function openSummaryModal() {
  const yesterday = getYesterdayDate();
  const yesterdayData = state.history[yesterday] || { sessions: 0, minutes: 0 };

  // Update summary display
  elements.summaryMinutes.textContent = yesterdayData.minutes || 0;
  elements.summarySessions.textContent = yesterdayData.sessions || 0;

  // Count tasks completed yesterday (we'll estimate based on sessions if not tracked)
  // For now, show sessions as a proxy (in future could track task completions per day)
  elements.summaryTasks.textContent = yesterdayData.sessions || 0;

  // Update streak display
  const metGoal = (yesterdayData.minutes || 0) >= state.dailyGoalMinutes;
  if (metGoal) {
    elements.summaryStreak.classList.remove('goal-missed');
    elements.summaryStreakText.textContent = `${state.currentStreak} day streak`;
    elements.summaryMessage.textContent = getMotivationalMessage(true, state.currentStreak);
  } else {
    elements.summaryStreak.classList.add('goal-missed');
    elements.summaryStreakText.textContent = 'Streak reset';
    elements.summaryMessage.textContent = getMotivationalMessage(false, 0);
  }

  elements.summaryOverlay.classList.add('active');
  elements.summaryOverlay.setAttribute('aria-hidden', 'false');
}

function closeSummaryModal() {
  elements.summaryOverlay.classList.remove('active');
  elements.summaryOverlay.setAttribute('aria-hidden', 'true');

  // Mark summary as shown for today
  state.summaryShownDate = getTodayDate();
  saveToStorage();
}

function getMotivationalMessage(metGoal, streak) {
  if (metGoal) {
    if (streak >= 7) {
      return "Amazing dedication! You're on fire! 🔥";
    } else if (streak >= 3) {
      return "Great consistency! Keep the momentum going.";
    } else {
      return "Solid work yesterday! Let's do it again.";
    }
  } else {
    return "Every day is a fresh start. Let's make today count!";
  }
}

function checkAndShowSummary() {
  if (shouldShowSummary()) {
    // Small delay to let the app load first
    setTimeout(() => {
      openSummaryModal();
    }, 500);
  }
}

function updateStatsDisplay() {
  // Calculate summary stats
  const today = getTodayDate();
  const todayData = state.history[today] || { sessions: 0, minutes: 0 };

  // Get dates for this week and month
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let weekStats = { sessions: 0, minutes: 0 };
  let monthStats = { sessions: 0, minutes: 0 };
  let totalStats = { sessions: 0, minutes: 0 };

  for (const [dateStr, data] of Object.entries(state.history)) {
    const date = new Date(dateStr);
    const minutes = data.minutes || 0;

    totalStats.sessions += data.sessions;
    totalStats.minutes += minutes;

    if (date >= weekStart) {
      weekStats.sessions += data.sessions;
      weekStats.minutes += minutes;
    }
    if (date >= monthStart) {
      monthStats.sessions += data.sessions;
      monthStats.minutes += minutes;
    }
  }

  // Display stats (always show minutes now)
  document.getElementById('statToday').textContent = formatMinutesShort(todayData.minutes || 0);
  document.getElementById('statWeek').textContent = formatMinutesShort(weekStats.minutes);
  document.getElementById('statMonth').textContent = formatMinutesShort(monthStats.minutes);
  document.getElementById('statTotal').textContent = formatMinutesShort(totalStats.minutes);

  // Update streak displays
  if (elements.currentStreakDisplay) {
    elements.currentStreakDisplay.textContent = state.currentStreak;
  }
  if (elements.longestStreakDisplay) {
    elements.longestStreakDisplay.textContent = state.longestStreak;
  }

  // Generate charts
  generateChart('daily');
  generateHeatMap();
}

// Format minutes for display (e.g., 90 -> "1h 30min", 45 -> "45 min")
function formatMinutesShort(minutes) {
  if (minutes === 0) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

// Current chart view state
let currentChartView = 'daily';

function generateChart(view) {
  currentChartView = view;
  const chartContainer = elements.statsChart;
  chartContainer.innerHTML = '';

  // Update tab states
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.chart === view);
  });

  let data = [];

  if (view === 'daily') {
    data = getDailyChartData(14);
  } else if (view === 'weekly') {
    data = getWeeklyChartData(12);
  } else if (view === 'monthly') {
    data = getMonthlyChartData(12);
  }

  // Calculate average for display
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);
  const avgValue = data.length > 0 ? Math.round(totalValue / data.length) : 0;
  const avgDisplay = document.getElementById('chartAverage');
  if (avgDisplay) {
    const avgLabel = view === 'daily' ? 'Daily' : (view === 'weekly' ? 'Weekly' : 'Monthly');
    avgDisplay.textContent = `${avgLabel} Avg: ${formatMinutesShort(avgValue)}`;
  }

  // Find max value for scaling - include all goals for daily view
  const maxGoal = view === 'daily' ? Math.max(...data.map(d => d.goal || 0)) : 0;
  const maxValue = Math.max(...data.map(d => d.value), maxGoal, 1);

  // Hide old goal line element (we'll use SVG instead)
  const oldGoalLine = document.getElementById('chartGoalLine');
  if (oldGoalLine) {
    oldGoalLine.classList.remove('visible');
  }

  // Create bars with proper structure for percentage heights
  data.forEach((item, index) => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-bar-wrapper';

    const fill = document.createElement('div');
    fill.className = 'chart-bar-fill';
    // Only apply goal-met styling on daily view
    if (view === 'daily' && item.goalMet) {
      fill.classList.add('goal-met');
    }
    if (item.value === 0) {
      fill.classList.add('empty');
    }
    const heightPercent = (item.value / maxValue) * 100;
    fill.style.height = Math.max(heightPercent, 3) + '%';

    // Add tooltip for hover (value shown on hover)
    if (item.value > 0) {
      const valueText = item.value >= 60 ? `${Math.round(item.value / 60)}h` : `${item.value} min`;
      bar.setAttribute('data-value', valueText);
      bar.setAttribute('title', valueText);
    }

    wrapper.appendChild(fill);
    bar.appendChild(wrapper);

    const label = document.createElement('span');
    label.className = 'chart-bar-label';
    label.textContent = item.label;
    bar.appendChild(label);

    chartContainer.appendChild(bar);
  });

  // Draw goal line SVG for daily view
  if (view === 'daily') {
    drawGoalLineSVG(data, maxValue);
  }
}

function drawGoalLineSVG(data, maxValue) {
  const chartContainer = elements.statsChart;

  // Remove existing SVG if any
  const existingSvg = chartContainer.querySelector('.goal-line-svg');
  if (existingSvg) existingSvg.remove();

  // Create SVG overlay - inserted first so it renders behind bars
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('goal-line-svg');
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';
  svg.style.overflow = 'visible';
  svg.style.zIndex = '1'; // Behind bars which have higher z-index

  // Wait for bars to render then draw line
  requestAnimationFrame(() => {
    const bars = chartContainer.querySelectorAll('.chart-bar');
    if (bars.length === 0) return;

    const chartHeight = chartContainer.querySelector('.chart-bar-wrapper')?.offsetHeight || 120;
    let pathD = '';

    bars.forEach((bar, i) => {
      const barRect = bar.getBoundingClientRect();
      const containerRect = chartContainer.getBoundingClientRect();
      const x = barRect.left - containerRect.left + barRect.width / 2;
      const goal = data[i]?.goal || state.dailyGoalMinutes;
      const goalPercent = goal / maxValue;
      const y = chartHeight - (goalPercent * chartHeight);

      if (i === 0) {
        pathD = `M ${x} ${y}`;
      } else {
        // Get previous goal
        const prevGoal = data[i - 1]?.goal || state.dailyGoalMinutes;
        const prevGoalPercent = prevGoal / maxValue;
        const prevY = chartHeight - (prevGoalPercent * chartHeight);

        // Draw horizontal line at previous level, then vertical step if changed
        const prevBar = bars[i - 1];
        const prevBarRect = prevBar.getBoundingClientRect();
        const midX = (prevBarRect.left - containerRect.left + prevBarRect.width / 2 + x) / 2;

        pathD += ` L ${midX} ${prevY}`;
        if (Math.abs(y - prevY) > 1) {
          pathD += ` L ${midX} ${y}`;
        }
        pathD += ` L ${x} ${y}`;
      }
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', 'var(--color-text-muted)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '4 4');
    path.setAttribute('fill', 'none');
    path.setAttribute('opacity', '0.6');
    svg.appendChild(path);
  });

  chartContainer.appendChild(svg);
}

function getDailyChartData(numDays) {
  const days = [];
  const now = new Date();
  let collected = 0;
  let daysBack = 0;

  while (collected < numDays) {
    const date = new Date(now);
    date.setDate(now.getDate() - daysBack);
    const dayOfWeek = date.getDay();

    // Skip weekends if setting is off
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    if (!state.includeWeekends && isWeekend) {
      daysBack++;
      continue;
    }

    const dateStr = getDateInAEST(date);
    const data = state.history[dateStr] || { sessions: 0, minutes: 0 };
    const minutes = data.minutes || 0;
    const goalForDay = data.dailyGoal || state.dailyGoalMinutes;

    days.unshift({
      date: date,
      dateStr: dateStr,
      value: minutes,
      label: date.getDate().toString(),
      goal: goalForDay,
      goalMet: minutes >= goalForDay
    });
    collected++;
    daysBack++;
  }

  return days;
}

function getWeeklyChartData(numWeeks) {
  const weeks = [];
  const now = new Date();

  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(now.getDate() - (i * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);

    let weekTotal = 0;
    let daysMetGoal = 0;
    let dayCount = 0;

    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const dayOfWeek = date.getDay();

      // Skip weekends if setting is off
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      if (!state.includeWeekends && isWeekend) continue;

      dayCount++;
      const dateStr = getDateInAEST(date);
      const data = state.history[dateStr] || { sessions: 0, minutes: 0 };
      const minutes = data.minutes || 0;
      const goalForDay = data.dailyGoal || state.dailyGoalMinutes;
      weekTotal += minutes;
      if (minutes >= goalForDay) daysMetGoal++;
    }

    // Week label: "Jan 5" format
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const label = `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()}`;

    // Goal threshold: 80% of days counted
    const goalThreshold = Math.ceil(dayCount * 0.8);
    weeks.push({
      value: weekTotal,
      label: i === 0 ? 'This' : (i === 1 ? 'Last' : label),
      goalMet: daysMetGoal >= goalThreshold
    });
  }

  return weeks;
}

function getMonthlyChartData(numMonths) {
  const months = [];
  const now = new Date();

  for (let i = numMonths - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

    let monthTotal = 0;
    let daysMetGoal = 0;
    let daysInMonth = monthEnd.getDate();
    let dayCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
      const dayOfWeek = date.getDay();

      // Skip weekends if setting is off
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      if (!state.includeWeekends && isWeekend) continue;

      dayCount++;
      const dateStr = getDateInAEST(date);
      const data = state.history[dateStr] || { sessions: 0, minutes: 0 };
      const minutes = data.minutes || 0;
      const goalForDay = data.dailyGoal || state.dailyGoalMinutes;
      monthTotal += minutes;
      if (minutes >= goalForDay) daysMetGoal++;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    months.push({
      value: monthTotal,
      label: monthNames[monthDate.getMonth()],
      goalMet: daysMetGoal >= Math.floor(dayCount * 0.7) // 70% of counted days
    });
  }

  return months;
}

// Heat map state
let heatmapDate = new Date();

function generateHeatMap() {
  const grid = document.getElementById('heatmapGrid');
  const monthLabel = document.getElementById('heatmapMonth');
  if (!grid || !monthLabel) return;

  grid.innerHTML = '';

  const year = heatmapDate.getFullYear();
  const month = heatmapDate.getMonth();

  // Update month label
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  monthLabel.textContent = `${monthNames[month]} ${year}`;

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Find max minutes in this month for scaling
  let maxMinutes = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = getDateInAEST(new Date(year, month, d));
    const data = state.history[dateStr] || { sessions: 0, minutes: 0 };
    maxMinutes = Math.max(maxMinutes, data.minutes || 0);
  }
  maxMinutes = Math.max(maxMinutes, state.dailyGoalMinutes);

  // Add empty cells for days before first of month
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell empty';
    grid.appendChild(cell);
  }

  // Add cells for each day
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = getDateInAEST(new Date(year, month, d));
    const data = state.history[dateStr] || { sessions: 0, minutes: 0 };
    const minutes = data.minutes || 0;

    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';

    // Calculate level (0-4)
    let level = 0;
    if (minutes > 0) {
      const ratio = minutes / maxMinutes;
      if (ratio >= 0.8) level = 4;
      else if (ratio >= 0.6) level = 3;
      else if (ratio >= 0.4) level = 2;
      else if (ratio > 0) level = 1;
    }

    cell.setAttribute('data-level', level);
    cell.title = `${monthNames[month]} ${d}: ${minutes} min`;

    grid.appendChild(cell);
  }
}

function navigateHeatmap(direction) {
  heatmapDate.setMonth(heatmapDate.getMonth() + direction);
  generateHeatMap();
}

function setStatsView(view) {
  state.statsView = view;
  updateStatsDisplay();
  saveToStorage();
}

// ============================================
// Theme Management
// ============================================

const THEMES = ['light', 'dark', 'synthwave', 'lofi', 'terminal', 'fireside', 'todoist'];
const THEME_NAMES = { light: 'Light', dark: 'Dark', synthwave: 'Synthwave', lofi: 'Lo-fi', terminal: 'Terminal', fireside: 'Fireside', todoist: 'Todoist' };

let themeLabelTimeout = null;

function cycleTheme() {
  const currentIndex = THEMES.indexOf(state.theme);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  state.theme = THEMES[nextIndex];

  if (state.theme === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  // Show theme name indicator
  showThemeLabel(THEME_NAMES[state.theme]);

  saveToStorage();
}

function showThemeLabel(name) {
  const label = document.getElementById('themeLabel');
  if (!label) return;
  label.textContent = name;
  label.classList.remove('visible');
  // Force reflow for re-triggering animation
  void label.offsetWidth;
  label.classList.add('visible');
  clearTimeout(themeLabelTimeout);
  themeLabelTimeout = setTimeout(() => {
    label.classList.remove('visible');
  }, 1500);
}

// Request notification permission on first interaction
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ============================================
// Areas System
// ============================================

function generateAreaId() {
  return 'a_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getActiveAreas() {
  return state.areas.filter(a => !a.completed);
}

function getNextAvailableColorIndex() {
  const usedIndices = getActiveAreas().map(a => a.colorIndex);
  for (let i = 0; i < AREA_COLORS.length; i++) {
    if (!usedIndices.includes(i)) return i;
  }
  return 0;
}

function addArea(name, colorIndex) {
  if (!name.trim()) return;
  if (getActiveAreas().length >= 5) return;

  const area = {
    id: generateAreaId(),
    name: name.trim(),
    colorIndex: colorIndex,
    completed: false,
    createdAt: Date.now()
  };

  state.areas.push(area);
  saveToStorage();
  renderAreas();
}

function completeArea(areaId) {
  const area = state.areas.find(a => a.id === areaId);
  if (!area) return;
  area.completed = true;
  saveToStorage();
  renderAreas();
  renderTasks();
}

function uncompleteArea(areaId) {
  if (getActiveAreas().length >= 5) return;
  const area = state.areas.find(a => a.id === areaId);
  if (!area) return;
  area.completed = false;
  saveToStorage();
  renderAreas();
  renderTasks();
}

function deleteArea(areaId) {
  state.areas = state.areas.filter(a => a.id !== areaId);
  // Unlink all tasks from this area
  state.tasks.forEach(t => {
    if (t.goalId === areaId) t.goalId = null;
  });
  saveToStorage();
  renderAreas();
  renderTasks();
}

function editAreaName(areaId, newName) {
  if (!newName.trim()) return;
  const area = state.areas.find(a => a.id === areaId);
  if (!area) return;
  area.name = newName.trim();
  saveToStorage();
  renderAreas();
  renderTasks();
}

let editingAreaId = null;

function openAreaForm(areaId) {
  const form = document.getElementById('areaForm');
  const input = document.getElementById('areaFormInput');
  if (!form || !input) return;

  editingAreaId = areaId || null;

  if (areaId) {
    const area = state.areas.find(a => a.id === areaId);
    if (!area) return;
    input.value = area.name;
    renderAreaColorSwatches(area.colorIndex);
  } else {
    input.value = '';
    renderAreaColorSwatches(getNextAvailableColorIndex());
  }

  form.hidden = false;
  input.focus();
}

function closeAreaForm() {
  const form = document.getElementById('areaForm');
  if (form) form.hidden = true;
  editingAreaId = null;
}

function saveAreaForm() {
  const input = document.getElementById('areaFormInput');
  if (!input || !input.value.trim()) return;

  const selectedSwatch = document.querySelector('.area-color-swatch.selected');
  const colorIndex = selectedSwatch ? parseInt(selectedSwatch.dataset.index) : 0;

  if (editingAreaId) {
    const area = state.areas.find(a => a.id === editingAreaId);
    if (area) {
      area.name = input.value.trim();
      area.colorIndex = colorIndex;
      saveToStorage();
      renderAreas();
      renderTasks();
    }
  } else {
    addArea(input.value.trim(), colorIndex);
  }

  closeAreaForm();
}

function renderAreaColorSwatches(selectedIndex) {
  const container = document.getElementById('areaFormColors');
  if (!container) return;

  // Find colors already used by other active areas (excluding the one being edited)
  const usedIndices = getActiveAreas()
    .filter(a => a.id !== editingAreaId)
    .map(a => a.colorIndex);

  container.innerHTML = AREA_COLORS.map((color, i) => {
    const isUsed = usedIndices.includes(i);
    return `<button type="button" class="area-color-swatch ${i === selectedIndex ? 'selected' : ''} ${isUsed ? 'disabled' : ''}"
      style="background: ${color.value}" data-index="${i}" aria-label="${color.name}" ${isUsed ? 'disabled' : ''}></button>`;
  }).join('');

  container.querySelectorAll('.area-color-swatch:not(.disabled)').forEach(swatch => {
    swatch.addEventListener('click', () => {
      container.querySelectorAll('.area-color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
  });
}

function renderAreas() {
  const list = document.getElementById('areasList');
  const addBtn = document.getElementById('areasAddBtn');
  if (!list) return;

  const activeAreas = getActiveAreas();
  const completedAreas = state.areas.filter(a => a.completed);

  if (addBtn) {
    addBtn.classList.toggle('hidden', activeAreas.length >= 5);
  }

  if (state.areas.length === 0) {
    list.innerHTML = '';
    return;
  }

  // Render active areas first, then completed
  const allAreas = [...activeAreas, ...completedAreas];

  list.innerHTML = allAreas.map(area => {
    const color = AREA_COLORS[area.colorIndex] || AREA_COLORS[0];

    return `
      <div class="area-card ${area.completed ? 'completed' : ''}" data-area-id="${area.id}"
           style="border-left-color: ${color.value}">
        <div class="area-card-main">
          <button class="area-card-checkbox" aria-label="${area.completed ? 'Uncomplete' : 'Complete'} area"></button>
          <div class="area-card-content">
            <div class="area-card-name">${escapeHtml(area.name)}</div>
          </div>
          <div class="area-card-actions">
            <button class="area-card-action edit" aria-label="Edit area">✎</button>
            <button class="area-card-action delete" aria-label="Delete area">×</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach event listeners
  list.querySelectorAll('.area-card').forEach(card => {
    const areaId = card.dataset.areaId;
    const area = state.areas.find(a => a.id === areaId);
    if (!area) return;

    card.querySelector('.area-card-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      if (area.completed) {
        uncompleteArea(areaId);
      } else {
        completeArea(areaId);
      }
    });

    card.querySelector('.area-card-action.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openAreaForm(areaId);
    });

    card.querySelector('.area-card-action.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteArea(areaId);
    });

  });
}


function linkTaskToArea(taskId, areaId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.goalId = areaId || null;
  saveToStorage();
  renderTasks();
  renderAreas();
}

let activeAreaLinkMenu = null;

function showAreaLinkMenu(taskId, anchorEl) {
  // Remove any existing menu
  closeAreaLinkMenu();

  const activeAreas = getActiveAreas();
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  const menu = document.createElement('div');
  menu.className = 'area-link-menu';

  menu.innerHTML = activeAreas.map(a => {
    const color = AREA_COLORS[a.colorIndex] || AREA_COLORS[0];
    return `<button class="area-link-option" data-area-id="${a.id}">
      <span class="task-area-dot" style="background:${color.value}"></span>
      ${escapeHtml(a.name)}
    </button>`;
  }).join('') + (task.goalId ? '<button class="area-link-option unlink" data-area-id="">Unlink</button>' : '');

  menu.querySelectorAll('.area-link-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      linkTaskToArea(taskId, opt.dataset.areaId || null);
      closeAreaLinkMenu();
    });
  });

  // Position relative to anchor
  const parent = anchorEl.closest('.task-item');
  if (parent) {
    parent.style.position = 'relative';
    parent.appendChild(menu);
  }

  activeAreaLinkMenu = menu;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', closeAreaLinkMenu, { once: true });
  }, 0);
}

function closeAreaLinkMenu() {
  if (activeAreaLinkMenu) {
    activeAreaLinkMenu.remove();
    activeAreaLinkMenu = null;
  }
}

function initAreas() {
  const addBtn = document.getElementById('areasAddBtn');
  const cancelBtn = document.getElementById('areaFormCancel');
  const saveBtn = document.getElementById('areaFormSave');
  const formInput = document.getElementById('areaFormInput');

  if (addBtn) {
    addBtn.addEventListener('click', () => openAreaForm());
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeAreaForm);
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', saveAreaForm);
  }

  if (formInput) {
    formInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveAreaForm();
      if (e.key === 'Escape') closeAreaForm();
    });
  }

  renderAreas();
}

// ============================================
// Task Sidebar
// ============================================

// Generate unique ID for tasks
function generateTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Open sidebar
function openSidebar() {
  state.sidebarOpen = true;
  elements.taskSidebar.classList.add('open');
}

// Close sidebar
function closeSidebar() {
  state.sidebarOpen = false;
  elements.taskSidebar.classList.remove('open');
}

// Toggle sidebar
function toggleSidebar() {
  if (state.sidebarOpen) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

// Add a new task
function addTask(name, estimatedMinutes = null, goalId = null) {
  if (!name.trim()) return;

  const task = {
    id: generateTaskId(),
    name: name.trim(),
    estimatedMinutes: estimatedMinutes,
    actualSeconds: 0,
    completed: false,
    createdAt: Date.now(),
    notes: '',
    goalId: goalId || null
  };

  state.tasks.push(task);
  saveToStorage();
  renderTasks();
  renderAreas();
}

// Complete a task
function completeTaskById(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = true;

  // Play ding sound
  playCompletionDing();

  // Sync completion to Todoist (fire-and-forget)
  if (task.todoistId && state.todoist.enabled && state.todoist.apiToken) {
    todoistCloseTask(task.todoistId);
  }

  // If this was the active task during a Pomo
  if (state.activeTaskId === taskId && state.status === 'running') {
    if (state.taskCompletionBehavior === 'endSession') {
      // End the session
      doneTimer();
    } else {
      // Move to next task
      const nextTask = getNextIncompleteTask();
      if (nextTask) {
        state.activeTaskId = nextTask.id;
      } else {
        state.activeTaskId = null;
      }
    }
  }

  saveToStorage();
  renderTasks();
  updateCurrentTaskDisplay();
}

// Uncomplete a task
function uncompleteTaskById(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = false;

  // Sync reopen to Todoist
  if (task.todoistId && state.todoist.enabled && state.todoist.apiToken) {
    todoistReopenTask(task.todoistId);
  }

  saveToStorage();
  renderTasks();
  updateCurrentTaskDisplay();
}

// Undo delete state
let deletedTaskBackup = null;
let editingNotesTaskId = null; // Task ID currently being edited in notes modal
let undoTimeout = null;

// Delete a task
function deleteTask(taskId) {
  const taskIndex = state.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  // Store backup for undo
  deletedTaskBackup = {
    task: { ...state.tasks[taskIndex] },
    index: taskIndex
  };

  state.tasks = state.tasks.filter(t => t.id !== taskId);
  if (state.activeTaskId === taskId) {
    state.activeTaskId = null;
  }
  saveToStorage();
  renderTasks();

  // Show undo toast
  showUndoToast();
}

// Show undo toast
function showUndoToast() {
  // Clear any existing timeout
  if (undoTimeout) {
    clearTimeout(undoTimeout);
  }

  const toast = elements.undoToast;
  toast.hidden = false;
  // Force reflow for animation
  toast.offsetHeight;
  toast.classList.add('visible');

  // Auto-hide after 5 seconds
  undoTimeout = setTimeout(() => {
    hideUndoToast();
    deletedTaskBackup = null;
  }, 5000);
}

// Hide undo toast
function hideUndoToast() {
  const toast = elements.undoToast;
  toast.classList.remove('visible');
  setTimeout(() => {
    toast.hidden = true;
  }, 300);
}

// Undo delete
function undoDelete() {
  if (!deletedTaskBackup) return;

  // Restore task at original position
  state.tasks.splice(deletedTaskBackup.index, 0, deletedTaskBackup.task);
  saveToStorage();
  renderTasks();

  // Clear backup and hide toast
  deletedTaskBackup = null;
  if (undoTimeout) {
    clearTimeout(undoTimeout);
    undoTimeout = null;
  }
  hideUndoToast();
}

// Edit task name
function editTaskName(taskId, newName) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task || !newName.trim()) return;

  task.name = newName.trim();
  saveToStorage();
}

// Get the next incomplete task (first in list)
function getNextIncompleteTask() {
  return state.tasks.find(t => !t.completed);
}

// Reorder tasks (for drag and drop)
function reorderTasks(fromIndex, toIndex) {
  // Don't allow reordering during a Pomo session
  if (state.status === 'running') return;

  const task = state.tasks.splice(fromIndex, 1)[0];
  state.tasks.splice(toIndex, 0, task);
  saveToStorage();
  renderTasks();
}

// Clear tasks for new day (respects keepIncompleteTasks setting)
function clearTasksForNewDay() {
  if (state.keepIncompleteTasks) {
    // Remove completed tasks that aren't linked to an area
    state.tasks = state.tasks.filter(t => !t.completed || t.goalId);
  } else {
    // Remove tasks that aren't linked to an area
    state.tasks = state.tasks.filter(t => t.goalId);
  }
  // Reset actual time on remaining tasks for the new day (only unlinked tasks)
  state.tasks.forEach(t => {
    if (!t.goalId) t.actualSeconds = 0;
  });
  saveToStorage();
  renderTasks();
}

// Check if it's a new day and clear tasks
function checkNewDay() {
  const today = getTodayDate();
  if (state.lastVisitDate && state.lastVisitDate !== today) {
    // Update streak based on yesterday's performance
    updateStreakForNewDay(state.lastVisitDate);
    // Clear tasks for new day
    clearTasksForNewDay();
  }
  state.lastVisitDate = today;
  saveToStorage();
}

// Update streak when a new day starts
// Streaks only count weekdays (Mon-Fri), weekends are skipped
function updateStreakForNewDay(lastDate) {
  const today = new Date();
  const todayDayOfWeek = today.getDay();

  // If today is a weekend, don't update streak
  if (todayDayOfWeek === 0 || todayDayOfWeek === 6) {
    return;
  }

  // Find the previous weekday (could be yesterday, or Friday if today is Monday)
  let prevWeekday = new Date(today);
  prevWeekday.setDate(today.getDate() - 1);

  // Skip back over weekends to find the last weekday
  while (prevWeekday.getDay() === 0 || prevWeekday.getDay() === 6) {
    prevWeekday.setDate(prevWeekday.getDate() - 1);
  }

  const prevWeekdayStr = getDateInAEST(prevWeekday);

  // Get the minutes focused on the previous weekday
  const prevDayData = state.history[prevWeekdayStr];
  const prevDayMinutes = prevDayData?.minutes || 0;
  const goalForDay = prevDayData?.dailyGoal || state.dailyGoalMinutes;

  if (lastDate === prevWeekdayStr) {
    // Last visit was the previous weekday - check if goal was met
    if (prevDayMinutes >= goalForDay) {
      state.currentStreak++;
      if (state.currentStreak > state.longestStreak) {
        state.longestStreak = state.currentStreak;
      }
    } else {
      // Goal not met, reset streak
      state.currentStreak = 0;
    }
  } else {
    // Check if we missed weekdays (not just weekends)
    const lastDateObj = new Date(lastDate);
    const lastDayOfWeek = lastDateObj.getDay();

    // If last date was also a weekend, find the weekday before it
    let checkDate = new Date(lastDateObj);
    while (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // If we only missed weekends between last weekday and today, streak continues
    if (getDateInAEST(checkDate) === prevWeekdayStr) {
      // Check if goal was met on that day
      if (prevDayMinutes >= goalForDay) {
        state.currentStreak++;
        if (state.currentStreak > state.longestStreak) {
          state.longestStreak = state.currentStreak;
        }
      } else {
        state.currentStreak = 0;
      }
    } else {
      // Missed one or more weekdays, reset streak
      state.currentStreak = 0;
    }
  }
}

// Format time for display (seconds to "Xm" or "Xh Ym")
function formatTimeSpent(seconds) {
  if (seconds < 60) return '< 1m';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Render tasks in the sidebar
function renderTasks() {
  const taskList = elements.taskList;
  taskList.innerHTML = '';

  // Update progress bar
  updateDailyProgress();

  const nextTask = getNextIncompleteTask();
  let visibleTasks = [...state.tasks];

  // Filter out completed tasks if setting is off
  if (!state.showCompletedTasks) {
    visibleTasks = visibleTasks.filter(t => !t.completed);
  } else {
    // Sort completed tasks to bottom
    visibleTasks.sort((a, b) => {
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      return 0;
    });
  }

  visibleTasks.forEach((task, index) => {
    const isNext = task.id === nextTask?.id && !task.completed;
    const isActive = task.id === state.activeTaskId && state.status === 'running';

    // Area left border color
    const areaBorderColor = task.goalId ? (() => {
      const area = state.areas.find(a => a.id === task.goalId);
      return area ? AREA_COLORS[area.colorIndex].value : '';
    })() : '';

    const taskEl = document.createElement('div');
    taskEl.className = 'task-item';
    taskEl.dataset.taskId = task.id;
    taskEl.dataset.index = state.tasks.findIndex(t => t.id === task.id);
    taskEl.draggable = state.status !== 'running' && !task.completed;

    if (task.completed) taskEl.classList.add('completed');
    if (isNext) taskEl.classList.add('next-task');
    if (isActive) taskEl.classList.add('active-task');
    if (areaBorderColor) {
      taskEl.classList.add('has-area');
      taskEl.style.borderLeftColor = areaBorderColor;
    }

    // Time display - always show
    const actualTime = task.actualSeconds > 0 ? formatTimeSpent(task.actualSeconds) : '0m';
    const estTime = task.estimatedMinutes ? `${task.estimatedMinutes}m` : '-';

    // Build estimate options
    const estimateOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 90, 120];
    const optionsHtml = estimateOptions.map(m =>
      `<option value="${m}" ${task.estimatedMinutes === m ? 'selected' : ''}>${m}m</option>`
    ).join('');

    // Note indicator
    const hasNotes = task.notes && task.notes.trim().length > 0;

    // Area link button (only show when areas exist)
    const hasActiveAreas = getActiveAreas().length > 0;
    const areaLinkBtn = hasActiveAreas ? '<button class="task-item-action area-link" aria-label="Link to area">⊕</button>' : '';

    taskEl.innerHTML = `
      <button class="task-item-checkbox" aria-label="${task.completed ? 'Uncomplete' : 'Complete'} task"></button>
      <div class="task-item-content" data-has-notes="${hasNotes}">
        <div class="task-item-name-row">
          <div class="task-item-name" contenteditable="false">${escapeHtml(task.name)}</div>
          ${task.todoistId ? '<span class="task-todoist-badge" title="Synced from Todoist"><svg viewBox="0 0 256 256" width="12" height="12"><rect width="256" height="256" rx="32" fill="#E44332"/><path fill="#FFF" d="M54.1 120.8c4.5-2.6 100.4-58.3 102.5-59.6 2.2-1.3 2.3-5.2-.2-6.6l-8.8-5.1a8 8 0 0 0-7.9.1L43.2 99.4c-3.3 1.9-7.3 1.9-10.6 0L0 74v21.6l43.1 25.2c3.8 2.2 7.4 2.1 11 0"/><path fill="#FFF" d="M54.1 161.6c4.5-2.6 100.4-58.3 102.5-59.6 2.2-1.3 2.3-5.2-.2-6.6l-8.8-5.1a8 8 0 0 0-7.9.1l-85.9 49.8c-3.3 1.9-7.3 1.9-10.6 0L0 114.8v21.6l43.1 25.2c3.8 2.2 7.4 2.1 11 0"/><path fill="#FFF" d="M54.1 205c4.5-2.6 100.4-58.3 102.5-59.6 2.2-1.3 2.3-5.2-.2-6.6l-8.8-5.1a8 8 0 0 0-7.9.1l-85.9 49.8c-3.3 1.9-7.3 1.9-10.6 0L0 158.2v21.6l43.1 25.2c3.8 2.2 7.4 2.1 11 0"/></svg></span>' : ''}
          ${hasNotes ? '<span class="task-note-dot" title="Has notes"></span>' : ''}
        </div>
        <div class="task-item-time">
          <span class="task-item-time-actual">${actualTime}</span>
          <span class="task-item-time-separator">/</span>
          <select class="task-item-estimate-select" aria-label="Estimated time">
            <option value="" ${!task.estimatedMinutes ? 'selected' : ''}>Est: -</option>
            ${optionsHtml}
          </select>
        </div>
      </div>
      <div class="task-item-actions">
        ${areaLinkBtn}
        <button class="task-item-action edit" aria-label="Edit task">✎</button>
        <button class="task-item-action delete" aria-label="Delete task">×</button>
      </div>
    `;

    // Event listeners
    const checkbox = taskEl.querySelector('.task-item-checkbox');
    checkbox.addEventListener('click', () => {
      if (task.completed) {
        uncompleteTaskById(task.id);
      } else {
        completeTaskById(task.id);
      }
    });

    const nameEl = taskEl.querySelector('.task-item-name');
    const editBtn = taskEl.querySelector('.task-item-action.edit');
    editBtn.addEventListener('click', () => {
      nameEl.contentEditable = 'true';
      nameEl.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    nameEl.addEventListener('blur', () => {
      nameEl.contentEditable = 'false';
      editTaskName(task.id, nameEl.textContent);
    });

    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nameEl.blur();
      } else if (e.key === 'Escape') {
        nameEl.textContent = task.name;
        nameEl.blur();
      }
    });

    // Estimate select
    const estimateSelect = taskEl.querySelector('.task-item-estimate-select');
    estimateSelect.addEventListener('change', (e) => {
      const newEstimate = e.target.value ? parseInt(e.target.value) : null;
      editTaskEstimate(task.id, newEstimate);
    });

    // Click on task content to open notes (but not when editing name or using select)
    const contentEl = taskEl.querySelector('.task-item-content');
    contentEl.addEventListener('click', (e) => {
      // Don't open notes if clicking on the select dropdown
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      // Don't open notes if the name is being edited
      if (nameEl.contentEditable === 'true') return;
      openNotesModal(task.id);
    });

    const deleteBtn = taskEl.querySelector('.task-item-action.delete');
    deleteBtn.addEventListener('click', () => {
      deleteTask(task.id);
    });

    // Area link button
    const areaLinkBtnEl = taskEl.querySelector('.task-item-action.area-link');
    if (areaLinkBtnEl) {
      areaLinkBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showAreaLinkMenu(task.id, areaLinkBtnEl);
      });
    }

    // Drag and drop (only for incomplete tasks)
    if (!task.completed) {
      taskEl.addEventListener('dragstart', handleDragStart);
      taskEl.addEventListener('dragend', handleDragEnd);
      taskEl.addEventListener('dragover', handleDragOver);
      taskEl.addEventListener('drop', handleDrop);
      taskEl.addEventListener('dragleave', handleDragLeave);
    }

    taskList.appendChild(taskEl);
  });
}

// Edit task estimated time
function editTaskEstimate(taskId, estimatedMinutes) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.estimatedMinutes = estimatedMinutes;
  saveToStorage();
  updateDailyProgress();
}

// Calculate and update daily progress bar
function updateDailyProgress() {
  const progressBar = document.getElementById('dailyProgressBar');
  const progressText = document.getElementById('dailyProgressText');
  if (!progressBar || !progressText) return;

  const incompleteTasks = state.tasks.filter(t => !t.completed);
  const completedTasks = state.tasks.filter(t => t.completed);

  // Total estimated for all tasks with estimates
  const totalEstimatedMinutes = state.tasks
    .filter(t => t.estimatedMinutes)
    .reduce((sum, t) => sum + t.estimatedMinutes, 0);

  // Completed time: use estimated time for completed tasks (completing = full credit)
  // This avoids gaps where actual < estimated
  const completedMinutes = completedTasks.reduce((sum, t) => {
    // Use estimated time if available, otherwise use actual time
    if (t.estimatedMinutes) {
      return sum + t.estimatedMinutes;
    }
    // Fall back to actual time for tasks without estimates
    return sum + Math.round(t.actualSeconds / 60);
  }, 0);

  // Calculate percentage
  let percentage = 0;
  if (totalEstimatedMinutes > 0) {
    percentage = Math.min(100, Math.round((completedMinutes / totalEstimatedMinutes) * 100));
  }

  progressBar.style.width = `${percentage}%`;

  // Format text like Sunsama: "Xh Ym / Xh Ym"
  const formatDuration = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const completedStr = formatDuration(completedMinutes);
  const totalStr = totalEstimatedMinutes > 0 ? formatDuration(totalEstimatedMinutes) : '-';
  progressText.textContent = `${completedStr} / ${totalStr}`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Drag and drop handlers
let draggedTaskId = null;

function handleDragStart(e) {
  if (state.status === 'running') {
    e.preventDefault();
    return;
  }
  const taskItem = e.target.closest('.task-item');
  if (!taskItem) return;

  draggedTaskId = taskItem.dataset.taskId;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
  draggedTaskId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const taskItem = e.target.closest('.task-item');
  if (!taskItem) return;

  // Remove drag-over from all items first
  document.querySelectorAll('.task-item.drag-over').forEach(el => {
    if (el !== taskItem) el.classList.remove('drag-over');
  });

  if (!taskItem.classList.contains('dragging') && !taskItem.classList.contains('completed')) {
    taskItem.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  // Only remove if we're actually leaving the task item
  const taskItem = e.target.closest('.task-item');
  const relatedTarget = e.relatedTarget?.closest('.task-item');

  if (taskItem && taskItem !== relatedTarget) {
    taskItem.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  const targetItem = e.target.closest('.task-item');
  if (!targetItem || !draggedTaskId) return;

  const targetTaskId = targetItem.dataset.taskId;
  if (draggedTaskId === targetTaskId) return;

  // Find indices in the actual state.tasks array
  const fromIndex = state.tasks.findIndex(t => t.id === draggedTaskId);
  const toIndex = state.tasks.findIndex(t => t.id === targetTaskId);

  if (fromIndex !== -1 && toIndex !== -1) {
    reorderTasks(fromIndex, toIndex);
  }

  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
}

// Play completion ding sound
function playCompletionDing() {
  const ctx = initAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
  osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

// Track time on active task during Pomo
function trackTaskTime() {
  if ((state.status === 'running' || state.status === 'overflow') && state.mode === 'work' && state.activeTaskId) {
    const task = state.tasks.find(t => t.id === state.activeTaskId);
    if (task && !task.completed) {
      task.actualSeconds += 1;
      // Save periodically (every 30 seconds) to avoid too many writes
      if (task.actualSeconds % 30 === 0) {
        saveToStorage();
      }
      // Update task display every minute to show accrued time
      if (task.actualSeconds % 60 === 0) {
        renderTasks();
      }
    }
  }
}

// Set active task when Pomo starts
function setActiveTaskForPomo() {
  if (state.mode === 'work') {
    const nextTask = getNextIncompleteTask();
    if (nextTask) {
      state.activeTaskId = nextTask.id;
    } else {
      state.activeTaskId = null;
    }
    renderTasks();
  }
}

// Initialize task settings UI
function initTaskSettings() {
  // Show completed toggle
  if (elements.showCompletedToggle) {
    elements.showCompletedToggle.checked = state.showCompletedTasks;
    elements.showCompletedToggle.addEventListener('change', (e) => {
      state.showCompletedTasks = e.target.checked;
      saveToStorage();
      renderTasks();
    });
  }

  // Task completion behavior select
  if (elements.taskCompletionSelect) {
    elements.taskCompletionSelect.value = state.taskCompletionBehavior;
    elements.taskCompletionSelect.addEventListener('change', (e) => {
      state.taskCompletionBehavior = e.target.value;
      saveToStorage();
    });
  }

  // Daily goal select
  if (elements.dailyGoalSelect) {
    elements.dailyGoalSelect.value = state.dailyGoalMinutes.toString();
    elements.dailyGoalSelect.addEventListener('change', (e) => {
      state.dailyGoalMinutes = parseInt(e.target.value, 10);
      saveToStorage();
      updateGoalProgress();
    });
  }

  // Keep incomplete tasks toggle
  if (elements.keepIncompleteTasksToggle) {
    elements.keepIncompleteTasksToggle.checked = state.keepIncompleteTasks;
    elements.keepIncompleteTasksToggle.addEventListener('change', (e) => {
      state.keepIncompleteTasks = e.target.checked;
      saveToStorage();
    });
  }

  // Timer end behavior select
  if (elements.timerEndBehaviorSelect) {
    elements.timerEndBehaviorSelect.value = state.timerEndBehavior;
    elements.timerEndBehaviorSelect.addEventListener('change', (e) => {
      state.timerEndBehavior = e.target.value;
      saveToStorage();
    });
  }

  // Include weekends toggle
  if (elements.includeWeekendsToggle) {
    elements.includeWeekendsToggle.checked = state.includeWeekends;
    elements.includeWeekendsToggle.addEventListener('change', (e) => {
      state.includeWeekends = e.target.checked;
      saveToStorage();
      // Refresh stats display if analytics modal is open
      if (elements.statsOverlay && !elements.statsOverlay.getAttribute('aria-hidden')) {
        updateStatsDisplay();
        generateChart(currentChartView);
      }
    });
  }

  // Undo button
  if (elements.undoBtn) {
    elements.undoBtn.addEventListener('click', undoDelete);
  }
}

// Sidebar tab switching (Tasks / Areas)
function switchSidebarTab(tabName) {
  const tasksView = document.getElementById('tasksView');
  const areasView = document.getElementById('areasView');
  const tasksTabBtn = document.getElementById('tasksTabBtn');
  const areasTabBtn = document.getElementById('areasTabBtn');

  if (tabName === 'areas') {
    tasksView.hidden = true;
    areasView.hidden = false;
    tasksTabBtn.classList.remove('active');
    areasTabBtn.classList.add('active');
  } else {
    tasksView.hidden = false;
    areasView.hidden = true;
    tasksTabBtn.classList.add('active');
    areasTabBtn.classList.remove('active');
  }
}

// Initialize task sidebar event listeners
function initTaskSidebarListeners() {
  // Sidebar toggle
  elements.sidebarTab.addEventListener('click', openSidebar);
  elements.sidebarClose.addEventListener('click', closeSidebar);

  // Tab switching
  document.getElementById('tasksTabBtn').addEventListener('click', () => switchSidebarTab('tasks'));
  document.getElementById('areasTabBtn').addEventListener('click', () => switchSidebarTab('areas'));

  // Add task form - Enter to add (from either input or estimate dropdown)
  const submitNewTask = () => {
    const name = elements.addTaskInput.value.trim();
    const estimate = elements.addTaskEstimate.value ? parseInt(elements.addTaskEstimate.value) : null;
    if (name) {
      addTask(name, estimate);
      elements.addTaskInput.value = '';
      elements.addTaskEstimate.value = '';
    }
  };

  elements.addTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNewTask();
  });

  elements.addTaskEstimate.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitNewTask();
  });

  // Initialize settings
  initTaskSettings();

  // Check for new day and clear completed tasks
  checkNewDay();

  // Initial render
  renderTasks();
}

// ============================================
// Event Listeners
// ============================================

function initEventListeners() {
  // Control buttons
  elements.startBtn.addEventListener('click', () => {
    requestNotificationPermission();

    if (state.status === 'completed') {
      switchMode();
      startTimer();
    } else {
      startTimer();
    }
  });

  elements.pauseBtn.addEventListener('click', pauseTimer);
  elements.continueBtn.addEventListener('click', continueTimer);
  elements.doneBtn.addEventListener('click', doneTimer);
  elements.abandonBtn.addEventListener('click', abandonTimer);
  elements.skipBtn.addEventListener('click', skipTimer);

  // Timer stepper buttons
  elements.decreaseBtn.addEventListener('click', decreaseWorkTime);
  elements.increaseBtn.addEventListener('click', increaseWorkTime);

  // Break duration stepper (in stats modal)
  elements.breakDecreaseBtn.addEventListener('click', decreaseBreakTime);
  elements.breakIncreaseBtn.addEventListener('click', increaseBreakTime);

  // Theme toggle
  elements.themeToggle.addEventListener('click', cycleTheme);

  // Sound controls
  elements.soundToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSoundDropdown();
  });

  elements.soundOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      playAmbientSound(btn.dataset.sound);
      closeSoundDropdown();
    });
  });

  elements.volumeSlider.addEventListener('input', (e) => {
    updateVolume(parseInt(e.target.value, 10));
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.soundControl.contains(e.target)) {
      closeSoundDropdown();
    }
  });

  // Stats modal
  elements.statsBtn.addEventListener('click', openStatsModal);
  elements.statsCloseBtn.addEventListener('click', closeStatsModal);
  elements.statsOverlay.addEventListener('click', (e) => {
    if (e.target === elements.statsOverlay) {
      closeStatsModal();
    }
  });
  elements.statsOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeStatsModal();
    }
  });

  // Stats toggle
  elements.statsToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setStatsView(btn.dataset.view);
    });
  });

  // Chart tabs (daily/weekly/monthly)
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      generateChart(tab.dataset.chart);
    });
  });

  // Heat map navigation
  const heatmapPrev = document.getElementById('heatmapPrev');
  const heatmapNext = document.getElementById('heatmapNext');
  if (heatmapPrev) heatmapPrev.addEventListener('click', () => navigateHeatmap(-1));
  if (heatmapNext) heatmapNext.addEventListener('click', () => navigateHeatmap(1));

  // Keyboard shortcuts popover
  const helpBtn = document.getElementById('helpBtn');
  const shortcutsPopover = document.getElementById('shortcutsPopover');
  if (helpBtn && shortcutsPopover) {
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      shortcutsPopover.hidden = !shortcutsPopover.hidden;
    });
    document.addEventListener('click', (e) => {
      if (!shortcutsPopover.hidden && !shortcutsPopover.contains(e.target) && e.target !== helpBtn) {
        shortcutsPopover.hidden = true;
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !shortcutsPopover.hidden) {
        shortcutsPopover.hidden = true;
      }
    });
  }

  // Settings modal
  elements.settingsBtn.addEventListener('click', openSettingsModal);
  elements.settingsCloseBtn.addEventListener('click', closeSettingsModal);
  elements.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === elements.settingsOverlay) {
      closeSettingsModal();
    }
  });
  elements.settingsOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
    }
  });

  // Notes modal
  elements.notesCloseBtn.addEventListener('click', closeNotesModal);
  elements.notesSaveBtn.addEventListener('click', saveTaskNotes);
  elements.notesOverlay.addEventListener('click', (e) => {
    if (e.target === elements.notesOverlay) {
      closeNotesModal();
    }
  });
  elements.notesOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeNotesModal();
    }
  });
  // Save notes on Cmd/Ctrl+Enter
  elements.notesTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveTaskNotes();
    }
  });

  // Summary modal
  elements.summaryCloseBtn.addEventListener('click', closeSummaryModal);
  elements.summaryDismissBtn.addEventListener('click', closeSummaryModal);
  elements.summaryOverlay.addEventListener('click', (e) => {
    if (e.target === elements.summaryOverlay) {
      closeSummaryModal();
    }
  });
  elements.summaryOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSummaryModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in input or contenteditable
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (state.status === 'running') {
          pauseTimer();
        } else if (state.status === 'paused') {
          continueTimer();
        } else if (state.status === 'completed') {
          switchMode();
          startTimer();
        } else {
          startTimer();
        }
        break;
      case 'KeyD':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (state.status === 'paused' && state.mode === 'work') {
            doneTimer();
          }
        }
        break;
      case 'KeyS':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (state.status === 'paused' && state.mode === 'break') {
            skipTimer();
          }
        }
        break;
      case 'Escape':
        if (state.status === 'paused') {
          abandonTimer();
        }
        break;
      case 'KeyT':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          cycleTheme();
        }
        break;
    }
  });

  // Handle visibility change - update tab when returning
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      updateBrowserTab();
    }
  });
}

// ============================================
// Todoist Integration
// ============================================

const TODOIST_API = 'https://api.todoist.com/api/v1';

function todoistFetch(endpoint, options = {}) {
  const headers = {
    'Authorization': `Bearer ${state.todoist.apiToken}`,
    ...options.headers
  };
  return fetch(`${TODOIST_API}${endpoint}`, { ...options, headers });
}

async function todoistCloseTask(todoistId) {
  try {
    await todoistFetch(`/tasks/${todoistId}/close`, { method: 'POST' });
  } catch (e) {
    console.warn('Failed to close Todoist task:', e);
  }
}

async function todoistReopenTask(todoistId) {
  try {
    await todoistFetch(`/tasks/${todoistId}/reopen`, { method: 'POST' });
  } catch (e) {
    console.warn('Failed to reopen Todoist task:', e);
  }
}

async function todoistValidateToken() {
  try {
    const resp = await todoistFetch('/projects');
    return resp.ok;
  } catch {
    return false;
  }
}

async function syncWithTodoist() {
  if (!state.todoist.enabled || !state.todoist.apiToken) return;

  state.todoist.syncStatus = 'syncing';
  updateTodoistUI();

  try {
    // 1. Fetch tasks from Todoist with pagination
    let allTasks = [];
    let cursor = null;
    while (true) {
      const url = '/tasks' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
      const resp = await todoistFetch(url);
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const page = Array.isArray(data) ? data : (data.results || data.items || []);
      allTasks = allTasks.concat(page);
      cursor = data.next_cursor || null;
      if (!cursor || page.length === 0) break;
    }

    // Filter to today and overdue tasks (Australia/Sydney timezone)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
    const todoistTasks = allTasks.filter(t => {
      const dueDate = t.due?.date?.split('T')[0];
      const deadlineDate = t.deadline?.date?.split('T')[0];
      if (dueDate && dueDate <= today) return true;
      if (deadlineDate && deadlineDate <= today) return true;
      return false;
    });

    // 2. Import new Todoist tasks
    for (const tt of todoistTasks) {
      const exists = state.tasks.some(t => t.todoistId === tt.id);
      if (!exists) {
        state.tasks.push({
          id: generateTaskId(),
          name: tt.content,
          estimatedMinutes: tt.duration ? tt.duration.amount : null,
          actualSeconds: 0,
          completed: false,
          createdAt: Date.now(),
          todoistId: tt.id
        });
      }
    }

    // 3. Close completed local tasks in Todoist
    const todoistIds = new Set(todoistTasks.map(t => t.id));
    for (const task of state.tasks) {
      if (task.todoistId && task.completed && todoistIds.has(task.todoistId)) {
        await todoistFetch(`/tasks/${task.todoistId}/close`, { method: 'POST' });
      }
    }

    // 4. Mark locally incomplete tasks as completed if they're no longer open in Todoist
    const allOpenIds = new Set(allTasks.map(t => t.id));
    for (const task of state.tasks) {
      if (task.todoistId && !task.completed && !allOpenIds.has(task.todoistId)) {
        task.completed = true;
      }
    }

    state.todoist.syncStatus = 'success';
    state.todoist.lastError = null;
    state.todoist.lastSyncTime = Date.now();
    saveToStorage();
    renderTasks();
  } catch (e) {
    state.todoist.syncStatus = 'error';
    state.todoist.lastError = e.message;
    console.warn('Todoist sync failed:', e);
  }

  updateTodoistUI();
}

function updateTodoistUI() {
  const enableToggle = document.getElementById('todoistEnableToggle');
  const details = document.getElementById('todoistDetails');
  const tokenInput = document.getElementById('todoistTokenInput');
  const syncDot = document.querySelector('.todoist-sync-dot');
  const syncText = document.getElementById('todoistSyncText');
  const syncBtn = document.getElementById('todoistSyncBtn');

  if (!enableToggle) return;

  enableToggle.checked = state.todoist.enabled;
  details.hidden = !state.todoist.enabled;

  if (state.todoist.apiToken && tokenInput.value === '') {
    tokenInput.value = state.todoist.apiToken;
  }

  if (syncDot) {
    syncDot.setAttribute('data-status', state.todoist.syncStatus);
  }

  if (syncText) {
    switch (state.todoist.syncStatus) {
      case 'syncing':
        syncText.textContent = 'Syncing...';
        break;
      case 'success':
        if (state.todoist.lastSyncTime) {
          const ago = Math.round((Date.now() - state.todoist.lastSyncTime) / 60000);
          syncText.textContent = ago < 1 ? 'Synced just now' : `Synced ${ago}m ago`;
        } else {
          syncText.textContent = 'Synced';
        }
        break;
      case 'error':
        syncText.textContent = state.todoist.lastError || 'Sync failed';
        break;
      default:
        syncText.textContent = 'Not synced';
    }
  }

  if (syncBtn) {
    syncBtn.disabled = state.todoist.syncStatus === 'syncing';
    syncBtn.textContent = state.todoist.syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now';
  }
}

function initTodoistListeners() {
  const enableToggle = document.getElementById('todoistEnableToggle');
  const tokenInput = document.getElementById('todoistTokenInput');
  const tokenToggle = document.getElementById('todoistTokenToggle');
  const syncBtn = document.getElementById('todoistSyncBtn');

  if (!enableToggle) return;

  enableToggle.addEventListener('change', () => {
    state.todoist.enabled = enableToggle.checked;
    if (!state.todoist.enabled) {
      // Remove all Todoist-synced tasks
      state.tasks = state.tasks.filter(t => !t.todoistId);
      state.todoist.syncStatus = 'idle';
      state.todoist.lastSyncTime = null;
      renderTasks();
    }
    saveToStorage();
    updateTodoistUI();
    if (state.todoist.enabled && state.todoist.apiToken) {
      syncWithTodoist();
    }
  });

  tokenInput.addEventListener('change', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      state.todoist.apiToken = null;
      state.todoist.syncStatus = 'idle';
      saveToStorage();
      updateTodoistUI();
      return;
    }
    state.todoist.apiToken = token;
    saveToStorage();

    // Validate
    const valid = await todoistValidateToken();
    if (valid) {
      state.todoist.syncStatus = 'idle';
      updateTodoistUI();
      syncWithTodoist();
    } else {
      state.todoist.syncStatus = 'error';
      state.todoist.lastError = 'Invalid token';
      updateTodoistUI();
    }
  });

  tokenToggle.addEventListener('click', () => {
    const isPassword = tokenInput.type === 'password';
    tokenInput.type = isPassword ? 'text' : 'password';
    tokenToggle.textContent = isPassword ? 'Hide' : 'Show';
  });

  syncBtn.addEventListener('click', () => {
    syncWithTodoist();
  });
}

// ============================================
// Initialization
// ============================================

function init() {
  loadFromStorage();

  // Apply loaded work/break durations to timer
  state.totalSeconds = state.workMinutes * 60;
  state.remainingSeconds = state.totalSeconds;

  initEventListeners();

  // Initialize task sidebar
  initTaskSidebarListeners();

  // Initialize areas
  initAreas();

  // Initialize break duration display
  updateBreakDisplay();

  // Reset sound to off (don't persist between sessions)
  state.currentSound = 'off';
  updateSoundUI();

  // Initial UI update
  updateUI();

  // Check if we need to show yesterday's summary
  checkAndShowSummary();

  // Initialize Todoist
  initTodoistListeners();
  updateTodoistUI();
  if (state.todoist.enabled && state.todoist.apiToken) {
    syncWithTodoist();
  }

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause/continue), D (done - work), S (skip - break), Esc (abandon), T (theme)');
}

// Start the app
init();
