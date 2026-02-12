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

const state = {
  // Timer state
  mode: 'work', // 'work' | 'break'
  status: 'idle', // 'idle' | 'running' | 'paused' | 'completed'

  // Time tracking
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,

  // Work/break durations (in minutes)
  workMinutes: 25,
  breakMinutes: 5,

  // Session tracking
  sessionCount: 1,
  totalFocusedMinutes: 0,

  // Timer interval reference
  intervalId: null,

  // Theme: 'light' | 'dark' | 'synthwave'
  theme: 'light',

  // Task intent (legacy - keeping for compatibility)
  currentTask: '',

  // Tasks system
  tasks: [], // Array of { id, name, estimatedMinutes, actualSeconds, completed, createdAt }
  activeTaskId: null, // ID of task being worked on during Pomo

  // Task settings
  showCompletedTasks: true, // Show struck-out completed tasks
  taskCompletionBehavior: 'nextTask', // 'endSession' | 'nextTask'
  keepIncompleteTasks: true, // Keep incomplete tasks on new day (vs clear all)
  lastVisitDate: null, // For clearing done tasks on new day

  // Sidebar state
  sidebarOpen: false,

  // Ambient sounds
  currentSound: 'off', // 'off' | 'rain' | 'fireplace' | 'forest' | 'synthDrive' | 'synthNeon' | 'synthGrid' | 'cafeAmbience' | 'lofiJazz' | 'lofiTyping' | 'terminalHum' | 'terminalKeys' | 'terminalData'
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

  // Todoist Integration
  todoist: {
    enabled: false,           // Whether integration is active
    apiToken: null,           // User's Todoist API token
    lastSyncAt: null,         // ISO timestamp of last successful sync
    syncStatus: 'idle',       // 'idle' | 'syncing' | 'error'
    lastError: null           // Last error message for display
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

      // Restore Todoist config
      if (data.todoist) {
        state.todoist.enabled = data.todoist.enabled || false;
        state.todoist.apiToken = data.todoist.apiToken || null;
        state.todoist.lastSyncAt = data.todoist.lastSyncAt || null;
        // Note: syncStatus and lastError are NOT persisted - transient state
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
      sessionCount: state.sessionCount,
      totalFocusedMinutes: state.totalFocusedMinutes,
      theme: state.theme,
      // Note: currentSound is NOT persisted - resets each session
      volume: state.volume,
      history: state.history,
      currentTask: state.currentTask,
      statsView: state.statsView,
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
      // Todoist Integration (only persist config, not transient state)
      todoist: {
        enabled: state.todoist.enabled,
        apiToken: state.todoist.apiToken,
        lastSyncAt: state.todoist.lastSyncAt
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
// Todoist Integration
// ============================================

const TODOIST_API_BASE = 'https://api.todoist.com/rest/v2';

// Validate API token by fetching projects
async function validateTodoistToken(token) {
  try {
    const response = await fetch(`${TODOIST_API_BASE}/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      return { valid: true };
    }

    // Return specific error messages based on status
    if (response.status === 401) {
      return { valid: false, error: 'Invalid API token' };
    } else if (response.status === 403) {
      return { valid: false, error: 'Token does not have required permissions' };
    } else if (response.status === 429) {
      return { valid: false, error: 'Rate limited - please try again later' };
    } else if (response.status >= 500) {
      return { valid: false, error: 'Todoist server error - please try again later' };
    } else {
      return { valid: false, error: `Todoist API error (${response.status})` };
    }
  } catch (error) {
    console.error('Todoist token validation failed:', error);
    return { valid: false, error: 'Could not connect to Todoist - check your internet connection' };
  }
}

// Fetch today's tasks from Todoist
async function fetchTodoistTasks() {
  if (!state.todoist.enabled || !state.todoist.apiToken) {
    return [];
  }

  const response = await fetch(
    `${TODOIST_API_BASE}/tasks?filter=${encodeURIComponent('today | no due date')}`,
    {
      headers: {
        'Authorization': `Bearer ${state.todoist.apiToken}`
      }
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid API token');
    }
    throw new Error(`Todoist API error: ${response.status}`);
  }

  return await response.json();
}

// Complete a task in Todoist
async function completeTodoistTask(todoistId) {
  if (!state.todoist.enabled || !state.todoist.apiToken || !todoistId) {
    return false;
  }

  const response = await fetch(
    `${TODOIST_API_BASE}/tasks/${todoistId}/close`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.todoist.apiToken}`
      }
    }
  );

  return response.ok;
}

// Reopen a task in Todoist
async function reopenTodoistTask(todoistId) {
  if (!state.todoist.enabled || !state.todoist.apiToken || !todoistId) {
    return false;
  }

  const response = await fetch(
    `${TODOIST_API_BASE}/tasks/${todoistId}/reopen`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${state.todoist.apiToken}`
      }
    }
  );

  return response.ok;
}

// Main sync function - pulls tasks from Todoist
async function syncWithTodoist() {
  if (!state.todoist.enabled || !state.todoist.apiToken) {
    return;
  }

  // Prevent concurrent syncs
  if (state.todoist.syncStatus === 'syncing') {
    return;
  }

  state.todoist.syncStatus = 'syncing';
  state.todoist.lastError = null;
  updateTodoistStatusUI();

  try {
    // Fetch remote tasks
    const remoteTasks = await fetchTodoistTasks();

    // Build lookup maps
    const remoteById = new Map(remoteTasks.map(t => [t.id, t]));
    const localTodoistTasks = state.tasks.filter(t => t.todoistId);
    const localByTodoistId = new Map(localTodoistTasks.map(t => [t.todoistId, t]));

    // Process remote tasks (add new, update existing)
    for (const remote of remoteTasks) {
      const local = localByTodoistId.get(remote.id);

      if (local) {
        // Task exists locally - update name if changed (Todoist wins)
        if (local.name !== remote.content) {
          local.name = remote.content;
        }
        local.todoistSyncedAt = new Date().toISOString();
      } else {
        // New task from Todoist - add locally
        const newTask = {
          id: generateTaskId(),
          name: remote.content,
          estimatedMinutes: null,
          actualSeconds: 0,
          completed: false,
          createdAt: Date.now(),
          notes: '',
          todoistId: remote.id,
          todoistSyncedAt: new Date().toISOString(),
          isLocalOnly: false
        };
        state.tasks.push(newTask);
      }
    }

    // Handle deletions (tasks removed from Todoist)
    const tasksToRemove = [];
    for (const local of localTodoistTasks) {
      if (!remoteById.has(local.todoistId)) {
        tasksToRemove.push(local.id);
      }
    }
    state.tasks = state.tasks.filter(t => !tasksToRemove.includes(t.id));

    // Update sync metadata
    state.todoist.lastSyncAt = new Date().toISOString();
    state.todoist.syncStatus = 'idle';

    saveToStorage();
    renderTasks();
    updateTodoistStatusUI();

  } catch (error) {
    console.error('Todoist sync failed:', error);
    state.todoist.syncStatus = 'error';
    state.todoist.lastError = error.message || 'Sync failed';

    // If token is invalid, disable integration
    if (error.message === 'Invalid API token') {
      state.todoist.enabled = false;
      state.todoist.apiToken = null;
      saveToStorage();
      updateTodoistSettingsUI();
    }

    updateTodoistStatusUI();
  }
}

// Sync completion status to Todoist (fire-and-forget)
async function syncTaskCompletionToTodoist(task) {
  if (!task.todoistId || !state.todoist.enabled) {
    return;
  }

  try {
    if (task.completed) {
      await completeTodoistTask(task.todoistId);
    } else {
      await reopenTodoistTask(task.todoistId);
    }
  } catch (error) {
    console.error('Failed to sync completion to Todoist:', error);
    // Don't show error to user - local action succeeded
  }
}

// Debounced sync for rate limiting
let todoistSyncDebounceTimer = null;
function debouncedTodoistSync(delayMs = 2000) {
  if (todoistSyncDebounceTimer) {
    clearTimeout(todoistSyncDebounceTimer);
  }
  todoistSyncDebounceTimer = setTimeout(() => {
    syncWithTodoist();
  }, delayMs);
}

// Update Todoist status UI in settings modal
function updateTodoistStatusUI() {
  const statusIndicator = document.getElementById('todoistStatusIndicator');
  const statusText = document.getElementById('todoistStatusText');

  if (!statusIndicator || !statusText) return;

  statusIndicator.className = 'todoist-status-indicator';

  if (state.todoist.syncStatus === 'syncing') {
    statusIndicator.classList.add('syncing');
    statusText.textContent = 'Syncing...';
  } else if (state.todoist.syncStatus === 'error') {
    statusIndicator.classList.add('error');
    statusText.textContent = state.todoist.lastError || 'Sync error';
  } else if (state.todoist.lastSyncAt) {
    statusIndicator.classList.add('success');
    const syncTime = new Date(state.todoist.lastSyncAt);
    statusText.textContent = `Synced ${formatRelativeTime(syncTime)}`;
  } else {
    statusText.textContent = 'Not synced';
  }
}

// Format relative time (e.g., "2 min ago")
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;

  return 'over a day ago';
}

// Update Todoist settings UI visibility
function updateTodoistSettingsUI() {
  const tokenRow = document.getElementById('todoistTokenRow');
  const statusRow = document.getElementById('todoistStatusRow');
  const syncRow = document.getElementById('todoistSyncRow');
  const enabledToggle = document.getElementById('todoistEnabledToggle');
  const tokenInput = document.getElementById('todoistTokenInput');

  if (!tokenRow || !statusRow || !syncRow || !enabledToggle) return;

  enabledToggle.checked = state.todoist.enabled;

  if (state.todoist.enabled) {
    tokenRow.hidden = false;
    statusRow.hidden = false;
    syncRow.hidden = false;
    if (tokenInput && state.todoist.apiToken) {
      tokenInput.value = state.todoist.apiToken;
    }
  } else {
    tokenRow.hidden = true;
    statusRow.hidden = true;
    syncRow.hidden = true;
  }

  updateTodoistStatusUI();
}

// Handle online/offline events
function initTodoistOnlineHandlers() {
  window.addEventListener('online', () => {
    if (state.todoist.enabled && state.todoist.apiToken) {
      syncWithTodoist();
    }
  });

  window.addEventListener('offline', () => {
    if (state.todoist.enabled) {
      state.todoist.syncStatus = 'idle';
      state.todoist.lastError = 'Offline';
      updateTodoistStatusUI();
    }
  });
}

// ============================================
// Timer Logic
// ============================================

function startTimer() {
  if (state.status === 'running') return;

  state.status = 'running';

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
    state.remainingSeconds--;

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
  if (state.status !== 'running') return;

  clearInterval(state.intervalId);
  state.intervalId = null;
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

  state.status = 'running';
  updateSoundControlVisibility();
  updateUI();

  // Resume ambient sound if one was selected
  if (state.currentSound !== 'off') {
    playAmbientSound(state.currentSound);
  }

  state.intervalId = setInterval(() => {
    state.remainingSeconds--;

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
  // End work early with partial credit
  if (state.status !== 'paused' || state.mode !== 'work') return;

  clearInterval(state.intervalId);
  state.intervalId = null;

  // Calculate partial minutes worked
  const elapsedSeconds = state.totalSeconds - state.remainingSeconds;
  const partialMinutes = Math.floor(elapsedSeconds / 60);

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
  if (state.status !== 'paused') return;

  clearInterval(state.intervalId);
  state.intervalId = null;

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
  state.status = 'completed';

  // Stop ambient sounds and hide control
  stopAmbientSound();
  updateSoundControlVisibility();

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
    // Update dailyGoal to current value (tracks most recent goal for the day)
    state.history[today].dailyGoal = state.dailyGoalMinutes;
    state.history[today].sessions++;
    state.history[today].minutes += minutes;

    saveToStorage();
  }

  // Play notification sound and show notification
  playNotificationSound();
  showBrowserNotification();

  updateUI();
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
  const isActiveWorkSession = state.mode === 'work' && (state.status === 'running' || state.status === 'paused');
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
  // Focus mode is active when running a work session (not paused, not break)
  const isFocused = state.status === 'running' && state.mode === 'work';
  document.body.classList.toggle('focus-mode', isFocused);
}

function updateTimerDisplay() {
  const minutes = Math.floor(state.remainingSeconds / 60);
  const seconds = state.remainingSeconds % 60;
  elements.timerDisplay.textContent =
    `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateProgressRing() {
  const progress = state.remainingSeconds / state.totalSeconds;
  const offset = CIRCUMFERENCE * (1 - progress);
  elements.progressRing.style.strokeDasharray = CIRCUMFERENCE;
  elements.progressRing.style.strokeDashoffset = offset;
}

function updateStatusDisplay() {
  const statusEl = elements.timerStatus;
  statusEl.classList.remove('working', 'break', 'pulsing');

  if (state.status === 'completed') {
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

  // Hide all buttons first
  elements.startBtn.hidden = true;
  elements.pauseBtn.hidden = true;
  elements.continueBtn.hidden = true;
  elements.doneBtn.hidden = true;
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

  } else if (status === 'paused') {
    // Continue is always visible when paused
    elements.continueBtn.hidden = false;
    elements.continueBtn.classList.toggle('break-mode', mode === 'break');

    if (mode === 'work') {
      // Work mode: Continue, Done, Abandon
      elements.doneBtn.hidden = false;
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
  const minutes = Math.floor(state.remainingSeconds / 60);
  const seconds = state.remainingSeconds % 60;
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  let emoji = '🍅';
  if (state.status === 'completed') {
    emoji = '✓';
  } else if (state.mode === 'break') {
    emoji = '☕';
  } else if (state.status === 'paused') {
    emoji = '⏸';
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
  // Show sound control only during active sessions (running or paused)
  const isActiveSession = state.status === 'running' || state.status === 'paused';
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

// Create noise buffer with specified characteristics
// Using longer duration (10+ seconds) for more natural variation
function createNoiseBuffer(ctx, type, duration = 10) {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate); // Stereo
  const dataL = buffer.getChannelData(0);
  const dataR = buffer.getChannelData(1);

  if (type === 'white') {
    for (let i = 0; i < bufferSize; i++) {
      dataL[i] = Math.random() * 2 - 1;
      dataR[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'pink') {
    // Pink noise using Paul Kellet's refined method with independent stereo channels
    let b0L = 0, b1L = 0, b2L = 0, b3L = 0, b4L = 0, b5L = 0, b6L = 0;
    let b0R = 0, b1R = 0, b2R = 0, b3R = 0, b4R = 0, b5R = 0, b6R = 0;
    for (let i = 0; i < bufferSize; i++) {
      // Left channel
      const whiteL = Math.random() * 2 - 1;
      b0L = 0.99886 * b0L + whiteL * 0.0555179;
      b1L = 0.99332 * b1L + whiteL * 0.0750759;
      b2L = 0.96900 * b2L + whiteL * 0.1538520;
      b3L = 0.86650 * b3L + whiteL * 0.3104856;
      b4L = 0.55000 * b4L + whiteL * 0.5329522;
      b5L = -0.7616 * b5L - whiteL * 0.0168980;
      const pinkL = (b0L + b1L + b2L + b3L + b4L + b5L + b6L + whiteL * 0.5362) * 0.11;
      b6L = whiteL * 0.115926;
      dataL[i] = pinkL;

      // Right channel (independent)
      const whiteR = Math.random() * 2 - 1;
      b0R = 0.99886 * b0R + whiteR * 0.0555179;
      b1R = 0.99332 * b1R + whiteR * 0.0750759;
      b2R = 0.96900 * b2R + whiteR * 0.1538520;
      b3R = 0.86650 * b3R + whiteR * 0.3104856;
      b4R = 0.55000 * b4R + whiteR * 0.5329522;
      b5R = -0.7616 * b5R - whiteR * 0.0168980;
      const pinkR = (b0R + b1R + b2R + b3R + b4R + b5R + b6R + whiteR * 0.5362) * 0.11;
      b6R = whiteR * 0.115926;
      dataR[i] = pinkR;
    }
  } else if (type === 'brown') {
    let lastL = 0, lastR = 0;
    for (let i = 0; i < bufferSize; i++) {
      const whiteL = Math.random() * 2 - 1;
      const whiteR = Math.random() * 2 - 1;
      lastL = (lastL + 0.02 * whiteL) / 1.02;
      lastR = (lastR + 0.02 * whiteR) / 1.02;
      dataL[i] = lastL * 3.5;
      dataR[i] = lastR * 3.5;
    }
  }

  return buffer;
}

// Create a textured noise buffer with natural variation (for rain, fire crackle, etc.)
function createTexturedNoiseBuffer(ctx, duration = 15) {
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
  const dataL = buffer.getChannelData(0);
  const dataR = buffer.getChannelData(1);

  // Create brown noise as base
  let lastL = 0, lastR = 0;

  // Add slow amplitude modulation for natural variation
  for (let i = 0; i < bufferSize; i++) {
    const t = i / ctx.sampleRate;

    // Multiple slow modulations at different rates
    const mod1 = 0.7 + 0.3 * Math.sin(t * 0.1 * Math.PI);
    const mod2 = 0.8 + 0.2 * Math.sin(t * 0.23 * Math.PI + 1.2);
    const mod3 = 0.85 + 0.15 * Math.sin(t * 0.07 * Math.PI + 2.5);
    const modulation = mod1 * mod2 * mod3;

    const whiteL = Math.random() * 2 - 1;
    const whiteR = Math.random() * 2 - 1;
    lastL = (lastL + 0.02 * whiteL) / 1.02;
    lastR = (lastR + 0.02 * whiteR) / 1.02;

    dataL[i] = lastL * 3.5 * modulation;
    dataR[i] = lastR * 3.5 * modulation;
  }

  return buffer;
}

// Rain on tent - Uses audio file if available, falls back to particle synthesis
async function playRainOnTent() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('rain.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 4.0);
    return;
  }

  // Fallback to particle-based synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.5;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Create a short impulse buffer for droplets (shared)
  const impulseLength = 0.05; // 50ms
  const impulseBuffer = ctx.createBuffer(2, ctx.sampleRate * impulseLength, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulseBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      // Exponentially decaying noise burst
      const decay = Math.exp(-i / (ctx.sampleRate * 0.008));
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  // Function to play a single raindrop
  function playDrop() {
    if (!ambientNodes.gain) return;

    const dropSource = ctx.createBufferSource();
    dropSource.buffer = impulseBuffer;

    // Randomize playback rate for pitch variation (tent material resonance)
    dropSource.playbackRate.value = 0.5 + Math.random() * 1.5;

    // Filter to shape the drop sound
    const dropFilter = ctx.createBiquadFilter();
    dropFilter.type = 'bandpass';
    dropFilter.frequency.value = 800 + Math.random() * 2000;
    dropFilter.Q.value = 1 + Math.random() * 2;

    // Random volume and panning
    const dropGain = ctx.createGain();
    const intensity = 0.03 + Math.random() * 0.07;
    dropGain.gain.value = intensity;

    // Stereo panning for spatial effect
    const panner = ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.5;

    dropSource.connect(dropFilter);
    dropFilter.connect(dropGain);
    dropGain.connect(panner);
    panner.connect(masterGain);

    dropSource.start();
  }

  // Rain intensity controller - spawn many drops
  let dropsPerSecond = 80; // Moderate rain

  function rainLoop() {
    if (!ambientNodes.gain) return;

    // Spawn a batch of drops
    const batchSize = Math.floor(dropsPerSecond / 20); // 50ms batches
    for (let i = 0; i < batchSize; i++) {
      setTimeout(() => {
        if (ambientNodes.gain) playDrop();
      }, Math.random() * 50);
    }

    // Vary intensity slowly
    dropsPerSecond = 60 + Math.sin(Date.now() / 10000) * 30 + Math.random() * 20;

    ambientNodes.interval = setTimeout(rainLoop, 50);
  }
  rainLoop();

  // Very subtle low-frequency tent resonance (minimal)
  const resonanceBuffer = createNoiseBuffer(ctx, 'brown', 10);
  const resonanceSource = ctx.createBufferSource();
  resonanceSource.buffer = resonanceBuffer;
  resonanceSource.loop = true;

  const resonanceFilter = ctx.createBiquadFilter();
  resonanceFilter.type = 'lowpass';
  resonanceFilter.frequency.value = 80;

  const resonanceGain = ctx.createGain();
  resonanceGain.gain.value = 0.08; // Very quiet, just adds body

  resonanceSource.connect(resonanceFilter);
  resonanceFilter.connect(resonanceGain);
  resonanceGain.connect(masterGain);
  resonanceSource.start();

  ambientNodes.sources.push(resonanceSource);
  ambientNodes.nodes.push(resonanceFilter, resonanceGain);

  // Occasional thunder
  function playThunder() {
    if (!ambientNodes.gain) return;

    const thunderGain = ctx.createGain();
    const intensity = 0.25;
    const duration = 4 + Math.random() * 3;

    thunderGain.gain.setValueAtTime(0, ctx.currentTime);
    thunderGain.gain.linearRampToValueAtTime(intensity * (state.volume / 100), ctx.currentTime + 0.5);
    thunderGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    thunderGain.connect(masterGain);

    const thunderBuffer = createNoiseBuffer(ctx, 'brown', 5);
    const thunderSource = ctx.createBufferSource();
    thunderSource.buffer = thunderBuffer;

    const thunderFilter = ctx.createBiquadFilter();
    thunderFilter.type = 'lowpass';
    thunderFilter.frequency.value = 60;

    thunderSource.connect(thunderFilter);
    thunderFilter.connect(thunderGain);
    thunderSource.start();
    thunderSource.stop(ctx.currentTime + duration + 1);
  }

  function scheduleThunder() {
    if (!ambientNodes.gain) return;
    const delay = 45000 + Math.random() * 60000;
    ambientNodes.thunderTimeout = setTimeout(() => {
      playThunder();
      scheduleThunder();
    }, delay);
  }
  scheduleThunder();
}

// Fireplace - Uses audio file if available, falls back to particle synthesis
async function playFireplace() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('fireplace.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.6);
    return;
  }

  // Fallback to particle-based synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.6;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Create crackle impulse buffer (shared) - short sharp transient
  const crackleLength = 0.03; // 30ms
  const crackleBuffer = ctx.createBuffer(2, ctx.sampleRate * crackleLength, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = crackleBuffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      // Sharp attack, fast decay
      const decay = Math.exp(-i / (ctx.sampleRate * 0.004));
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }

  // Play individual crackle
  function playCrackle() {
    if (!ambientNodes.gain) return;

    const source = ctx.createBufferSource();
    source.buffer = crackleBuffer;
    source.playbackRate.value = 0.8 + Math.random() * 1.2;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000 + Math.random() * 3000;
    filter.Q.value = 2 + Math.random() * 4;

    const gain = ctx.createGain();
    gain.gain.value = 0.08 + Math.random() * 0.12;

    const panner = ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 0.8;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    source.start();
  }

  // Play a deeper pop sound
  function playPop() {
    if (!ambientNodes.gain) return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 + Math.random() * 0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    gain.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const freq = 80 + Math.random() * 60;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.15);

    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }

  // Play a snap/click
  function playSnap() {
    if (!ambientNodes.gain) return;

    const source = ctx.createBufferSource();
    source.buffer = crackleBuffer;
    source.playbackRate.value = 1.5 + Math.random() * 1.0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2000 + Math.random() * 2000;

    const gain = ctx.createGain();
    gain.gain.value = 0.1 + Math.random() * 0.1;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start();
  }

  // Continuous crackle loop - many events per second
  let cracklesPerSecond = 15;

  function crackleLoop() {
    if (!ambientNodes.gain) return;

    // Spawn crackles
    const batchSize = Math.floor(cracklesPerSecond / 10);
    for (let i = 0; i < batchSize; i++) {
      setTimeout(() => {
        if (!ambientNodes.gain) return;
        playCrackle();
        // Occasional pop or snap
        if (Math.random() > 0.92) playPop();
        if (Math.random() > 0.95) playSnap();
      }, Math.random() * 100);
    }

    // Vary intensity
    cracklesPerSecond = 10 + Math.sin(Date.now() / 8000) * 8 + Math.random() * 5;

    ambientNodes.interval = setTimeout(crackleLoop, 100);
  }
  crackleLoop();

  // Very subtle low rumble for fire "body" (minimal!)
  const rumbleBuffer = createNoiseBuffer(ctx, 'brown', 10);
  const rumbleSource = ctx.createBufferSource();
  rumbleSource.buffer = rumbleBuffer;
  rumbleSource.loop = true;

  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 100;

  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.06; // Very quiet background

  rumbleSource.connect(rumbleFilter);
  rumbleFilter.connect(rumbleGain);
  rumbleGain.connect(masterGain);
  rumbleSource.start();

  ambientNodes.sources.push(rumbleSource);
  ambientNodes.nodes.push(rumbleFilter, rumbleGain);
}

// Forest - Uses audio file if available, falls back to bird synthesis
async function playForest() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('forest.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.5);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.5;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Very subtle wind/ambience (quiet background only)
  const windBuffer = createNoiseBuffer(ctx, 'pink', 15);
  const windSource = ctx.createBufferSource();
  windSource.buffer = windBuffer;
  windSource.loop = true;

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 400;
  windFilter.Q.value = 0.3;

  // Gentle wind modulation
  const windLfo = ctx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.05;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 150;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windFilter.frequency);
  windLfo.start();

  const windGain = ctx.createGain();
  windGain.gain.value = 0.06; // Very quiet - just atmosphere

  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  windSource.start();

  ambientNodes.sources.push(windSource, windLfo);
  ambientNodes.nodes.push(windFilter, windLfoGain, windGain);

  // Birds - the main feature! Multiple bird types

  // Small songbird chirp
  function playSongbird() {
    if (!ambientNodes.gain) return;

    const gain = ctx.createGain();
    const intensity = 0.12 + Math.random() * 0.1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';

    const baseFreq = 2000 + Math.random() * 1500;
    const duration = 0.08 + Math.random() * 0.12;

    // Varied patterns
    const pattern = Math.random();
    if (pattern > 0.7) {
      // Two-tone chirp
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.setValueAtTime(baseFreq * 1.3, ctx.currentTime + duration * 0.5);
    } else if (pattern > 0.4) {
      // Rising whistle
      osc.frequency.setValueAtTime(baseFreq * 0.8, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(baseFreq * 1.2, ctx.currentTime + duration);
    } else {
      // Falling chirp
      osc.frequency.setValueAtTime(baseFreq * 1.1, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.7, ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(intensity, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const panner = ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.6;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  // Deeper woodland bird (like a dove or thrush)
  function playWoodlandBird() {
    if (!ambientNodes.gain) return;

    const gain = ctx.createGain();
    const intensity = 0.15 + Math.random() * 0.1;
    const osc = ctx.createOscillator();
    osc.type = 'sine';

    const baseFreq = 800 + Math.random() * 600;
    const duration = 0.15 + Math.random() * 0.2;

    // Cooing pattern
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.9, ctx.currentTime + duration * 0.3);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.05, ctx.currentTime + duration * 0.6);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.85, ctx.currentTime + duration);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(intensity, ctx.currentTime + 0.03);
    gain.gain.setValueAtTime(intensity * 0.8, ctx.currentTime + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    const panner = ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.2;

    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  // Schedule birds - frequent and varied
  function scheduleBirds() {
    if (!ambientNodes.gain) return;

    // Random bird type
    const birdType = Math.random();
    if (birdType > 0.4) {
      // Songbird (more common)
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          if (ambientNodes.gain) playSongbird();
        }, i * (80 + Math.random() * 150));
      }
    } else {
      // Woodland bird (less common)
      playWoodlandBird();
    }

    // Birds call every 1-4 seconds (frequent!)
    const nextDelay = 1000 + Math.random() * 3000;
    ambientNodes.thunderTimeout = setTimeout(scheduleBirds, nextDelay);
  }

  // Start birds quickly
  ambientNodes.thunderTimeout = setTimeout(scheduleBirds, 500);
}

// Synthwave Track 1: Neon Drive - Uses audio file if available
async function playSynthDrive() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('synthwave1.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.35);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.32;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Deep sub bass - foundation
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 55; // A1

  const subGain = ctx.createGain();
  subGain.gain.value = 0.2;

  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  ambientNodes.sources.push(subOsc);
  ambientNodes.nodes.push(subGain);

  // Pulsing bass with filter envelope
  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sawtooth';
  bassOsc.frequency.value = 110; // A2

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 300;
  bassFilter.Q.value = 4;

  // Rhythmic filter pulse
  const bassFilterLfo = ctx.createOscillator();
  bassFilterLfo.type = 'sawtooth';
  bassFilterLfo.frequency.value = 2; // Pumping rhythm
  const bassFilterLfoGain = ctx.createGain();
  bassFilterLfoGain.gain.value = 400;
  bassFilterLfo.connect(bassFilterLfoGain);
  bassFilterLfoGain.connect(bassFilter.frequency);
  bassFilterLfo.start();

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.15;

  bassOsc.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start();

  ambientNodes.sources.push(bassOsc, bassFilterLfo);
  ambientNodes.nodes.push(bassFilter, bassFilterLfoGain, bassGain);

  // Arpeggiator - classic synthwave feel
  const arpNotes = [440, 554.37, 659.25, 880, 659.25, 554.37]; // A4, C#5, E5, A5, E5, C#5
  let arpIndex = 0;

  const arpOsc = ctx.createOscillator();
  arpOsc.type = 'sawtooth';
  arpOsc.frequency.value = arpNotes[0];

  const arpOsc2 = ctx.createOscillator();
  arpOsc2.type = 'sawtooth';
  arpOsc2.frequency.value = arpNotes[0];
  arpOsc2.detune.value = 7; // Slight detune for fatness

  const arpFilter = ctx.createBiquadFilter();
  arpFilter.type = 'lowpass';
  arpFilter.frequency.value = 3000;
  arpFilter.Q.value = 2;

  // Slow filter sweep
  const arpSweepLfo = ctx.createOscillator();
  arpSweepLfo.type = 'sine';
  arpSweepLfo.frequency.value = 0.08;
  const arpSweepGain = ctx.createGain();
  arpSweepGain.gain.value = 1500;
  arpSweepLfo.connect(arpSweepGain);
  arpSweepGain.connect(arpFilter.frequency);
  arpSweepLfo.start();

  const arpGain = ctx.createGain();
  arpGain.gain.value = 0.08;

  const arpMerge = ctx.createGain();
  arpOsc.connect(arpMerge);
  arpOsc2.connect(arpMerge);
  arpMerge.connect(arpFilter);
  arpFilter.connect(arpGain);
  arpGain.connect(masterGain);
  arpOsc.start();
  arpOsc2.start();

  // Arpeggio sequencer
  ambientNodes.interval = setInterval(() => {
    if (!ambientNodes.gain) return;
    arpIndex = (arpIndex + 1) % arpNotes.length;
    const freq = arpNotes[arpIndex];
    arpOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
    arpOsc2.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
  }, 125);

  ambientNodes.sources.push(arpOsc, arpOsc2, arpSweepLfo);
  ambientNodes.nodes.push(arpFilter, arpSweepGain, arpGain, arpMerge);

  // Warm pad layer - A major chord
  const padNotes = [220, 277.18, 329.63, 440]; // A3, C#4, E4, A4
  padNotes.forEach((freq, i) => {
    const padOsc = ctx.createOscillator();
    padOsc.type = 'triangle';
    padOsc.frequency.value = freq;
    padOsc.detune.value = (i - 1.5) * 4;

    // Subtle vibrato
    const vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.value = 4 + i * 0.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.003;
    vibLfo.connect(vibGain);
    vibGain.connect(padOsc.frequency);
    vibLfo.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.04;

    padOsc.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();

    ambientNodes.sources.push(padOsc, vibLfo);
    ambientNodes.nodes.push(vibGain, padGain);
  });

  // Shimmer layer - high octave
  const shimmerOsc = ctx.createOscillator();
  shimmerOsc.type = 'sine';
  shimmerOsc.frequency.value = 1760; // A6

  const shimmerLfo = ctx.createOscillator();
  shimmerLfo.type = 'sine';
  shimmerLfo.frequency.value = 0.2;
  const shimmerLfoGain = ctx.createGain();
  shimmerLfoGain.gain.value = 0.02;

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.02;

  shimmerLfo.connect(shimmerLfoGain);
  shimmerLfoGain.connect(shimmerGain.gain);
  shimmerLfo.start();

  shimmerOsc.connect(shimmerGain);
  shimmerGain.connect(masterGain);
  shimmerOsc.start();

  ambientNodes.sources.push(shimmerOsc, shimmerLfo);
  ambientNodes.nodes.push(shimmerLfoGain, shimmerGain);
}

// Synthwave Track 2: Midnight - Uses audio file if available
async function playSynthNeon() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('synthwave2.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.35);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.32;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Deep sub bass
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 65.41; // C2

  // Subtle sub movement
  const subLfo = ctx.createOscillator();
  subLfo.type = 'sine';
  subLfo.frequency.value = 0.05;
  const subLfoGain = ctx.createGain();
  subLfoGain.gain.value = 3;
  subLfo.connect(subLfoGain);
  subLfoGain.connect(subOsc.frequency);
  subLfo.start();

  const subGain = ctx.createGain();
  subGain.gain.value = 0.18;

  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  ambientNodes.sources.push(subOsc, subLfo);
  ambientNodes.nodes.push(subLfoGain, subGain);

  // Lush evolving pad - C minor 7 for that moody feel
  const padNotes = [130.81, 155.56, 196, 233.08]; // C3, Eb3, G3, Bb3
  padNotes.forEach((freq, i) => {
    // Main oscillator
    const padOsc = ctx.createOscillator();
    padOsc.type = i % 2 === 0 ? 'triangle' : 'sine';
    padOsc.frequency.value = freq;
    padOsc.detune.value = (i - 1.5) * 6;

    // Detuned layer
    const padOsc2 = ctx.createOscillator();
    padOsc2.type = 'triangle';
    padOsc2.frequency.value = freq;
    padOsc2.detune.value = (i - 1.5) * 6 + 8;

    // Slow vibrato
    const vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.value = 0.15 + i * 0.05;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.008;
    vibLfo.connect(vibGain);
    vibGain.connect(padOsc.frequency);
    vibGain.connect(padOsc2.frequency);
    vibLfo.start();

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1500;
    padFilter.Q.value = 0.5;

    // Slow filter movement
    const filterLfo = ctx.createOscillator();
    filterLfo.type = 'sine';
    filterLfo.frequency.value = 0.03 + i * 0.01;
    const filterLfoGain = ctx.createGain();
    filterLfoGain.gain.value = 500;
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(padFilter.frequency);
    filterLfo.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.045;

    const padMerge = ctx.createGain();
    padOsc.connect(padMerge);
    padOsc2.connect(padMerge);
    padMerge.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();
    padOsc2.start();

    ambientNodes.sources.push(padOsc, padOsc2, vibLfo, filterLfo);
    ambientNodes.nodes.push(vibGain, padFilter, filterLfoGain, padGain, padMerge);
  });

  // High shimmer arpeggio
  const shimmerNotes = [523.25, 622.25, 783.99, 932.33]; // C5, Eb5, G5, Bb5
  let shimmerIndex = 0;

  const shimmerOsc = ctx.createOscillator();
  shimmerOsc.type = 'sine';
  shimmerOsc.frequency.value = shimmerNotes[0];

  const shimmerFilter = ctx.createBiquadFilter();
  shimmerFilter.type = 'lowpass';
  shimmerFilter.frequency.value = 4000;

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.025;

  shimmerOsc.connect(shimmerFilter);
  shimmerFilter.connect(shimmerGain);
  shimmerGain.connect(masterGain);
  shimmerOsc.start();

  // Slow shimmer arpeggio
  ambientNodes.interval = setInterval(() => {
    if (!ambientNodes.gain) return;
    shimmerIndex = (shimmerIndex + 1) % shimmerNotes.length;
    shimmerOsc.frequency.setTargetAtTime(shimmerNotes[shimmerIndex], ctx.currentTime, 0.1);
  }, 800);

  ambientNodes.sources.push(shimmerOsc);
  ambientNodes.nodes.push(shimmerFilter, shimmerGain);

  // Atmospheric texture
  const noiseBuffer = createNoiseBuffer(ctx, 'pink', 15);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 1200;
  noiseFilter.Q.value = 1.5;

  // Evolving sweep
  const noiseSweepLfo = ctx.createOscillator();
  noiseSweepLfo.type = 'sine';
  noiseSweepLfo.frequency.value = 0.02;
  const noiseSweepGain = ctx.createGain();
  noiseSweepGain.gain.value = 800;
  noiseSweepLfo.connect(noiseSweepGain);
  noiseSweepGain.connect(noiseFilter.frequency);
  noiseSweepLfo.start();

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.025;

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start();

  ambientNodes.sources.push(noiseSource, noiseSweepLfo);
  ambientNodes.nodes.push(noiseFilter, noiseSweepGain, noiseGain);

  // Occasional "sparkle" high notes
  function playSparkle() {
    if (!ambientNodes.gain) return;

    const sparkleOsc = ctx.createOscillator();
    sparkleOsc.type = 'sine';
    const freq = shimmerNotes[Math.floor(Math.random() * shimmerNotes.length)] * 2;
    sparkleOsc.frequency.value = freq;

    const sparkleGain = ctx.createGain();
    const intensity = 0.015 + Math.random() * 0.015;
    sparkleGain.gain.setValueAtTime(0, ctx.currentTime);
    sparkleGain.gain.linearRampToValueAtTime(intensity * (state.volume / 100), ctx.currentTime + 0.05);
    sparkleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    sparkleOsc.connect(sparkleGain);
    sparkleGain.connect(masterGain);
    sparkleOsc.start();
    sparkleOsc.stop(ctx.currentTime + 1);
  }

  function scheduleSparkles() {
    if (!ambientNodes.gain) return;
    playSparkle();
    const nextDelay = 2000 + Math.random() * 4000;
    ambientNodes.extraInterval = setTimeout(scheduleSparkles, nextDelay);
  }
  setTimeout(scheduleSparkles, 3000);
}

// Synthwave Track 3: Retrowave - Uses audio file if available
async function playSynthGrid() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('synthwave3.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.35);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.32;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Deep sub bass
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 73.42; // D2

  const subGain = ctx.createGain();
  subGain.gain.value = 0.18;

  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  ambientNodes.sources.push(subOsc);
  ambientNodes.nodes.push(subGain);

  // Classic sequenced bass - D minor progression
  const bassNotes = [73.42, 73.42, 87.31, 82.41, 73.42, 73.42, 98, 87.31]; // D2, D2, F2, E2, D2, D2, G2, F2
  let bassIndex = 0;

  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sawtooth';
  bassOsc.frequency.value = bassNotes[0];

  const bassOsc2 = ctx.createOscillator();
  bassOsc2.type = 'square';
  bassOsc2.frequency.value = bassNotes[0];

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 400;
  bassFilter.Q.value = 3;

  // Pumping filter envelope
  const bassEnvLfo = ctx.createOscillator();
  bassEnvLfo.type = 'sawtooth';
  bassEnvLfo.frequency.value = 4; // 16th note feel at 120 BPM
  const bassEnvGain = ctx.createGain();
  bassEnvGain.gain.value = 350;
  bassEnvLfo.connect(bassEnvGain);
  bassEnvGain.connect(bassFilter.frequency);
  bassEnvLfo.start();

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.12;

  const bassMerge = ctx.createGain();
  bassMerge.gain.value = 0.7;
  bassOsc.connect(bassMerge);
  bassOsc2.connect(bassMerge);
  bassMerge.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start();
  bassOsc2.start();

  // Bass sequence
  ambientNodes.interval = setInterval(() => {
    if (!ambientNodes.gain) return;
    bassIndex = (bassIndex + 1) % bassNotes.length;
    const freq = bassNotes[bassIndex];
    bassOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
    bassOsc2.frequency.setTargetAtTime(freq, ctx.currentTime, 0.01);
    subOsc.frequency.setTargetAtTime(freq / 2, ctx.currentTime, 0.02);
  }, 250);

  ambientNodes.sources.push(bassOsc, bassOsc2, bassEnvLfo);
  ambientNodes.nodes.push(bassFilter, bassEnvGain, bassGain, bassMerge);

  // Fast arpeggiator - D minor
  const arpNotes = [587.33, 698.46, 880, 1174.66, 880, 698.46]; // D5, F5, A5, D6, A5, F5
  let arpIndex = 0;

  const arpOsc = ctx.createOscillator();
  arpOsc.type = 'sawtooth';
  arpOsc.frequency.value = arpNotes[0];

  const arpOsc2 = ctx.createOscillator();
  arpOsc2.type = 'sawtooth';
  arpOsc2.frequency.value = arpNotes[0];
  arpOsc2.detune.value = 10;

  const arpFilter = ctx.createBiquadFilter();
  arpFilter.type = 'lowpass';
  arpFilter.frequency.value = 4000;
  arpFilter.Q.value = 1.5;

  // Filter sweep
  const arpSweepLfo = ctx.createOscillator();
  arpSweepLfo.type = 'sine';
  arpSweepLfo.frequency.value = 0.1;
  const arpSweepGain = ctx.createGain();
  arpSweepGain.gain.value = 2000;
  arpSweepLfo.connect(arpSweepGain);
  arpSweepGain.connect(arpFilter.frequency);
  arpSweepLfo.start();

  const arpGain = ctx.createGain();
  arpGain.gain.value = 0.06;

  const arpMerge = ctx.createGain();
  arpOsc.connect(arpMerge);
  arpOsc2.connect(arpMerge);
  arpMerge.connect(arpFilter);
  arpFilter.connect(arpGain);
  arpGain.connect(masterGain);
  arpOsc.start();
  arpOsc2.start();

  // Fast arpeggio (16th notes)
  const arpInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(arpInterval);
      return;
    }
    arpIndex = (arpIndex + 1) % arpNotes.length;
    const freq = arpNotes[arpIndex];
    arpOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.005);
    arpOsc2.frequency.setTargetAtTime(freq, ctx.currentTime, 0.005);
  }, 125);

  ambientNodes.extraInterval = arpInterval;

  ambientNodes.sources.push(arpOsc, arpOsc2, arpSweepLfo);
  ambientNodes.nodes.push(arpFilter, arpSweepGain, arpGain, arpMerge);

  // Warm pad - D minor chord
  const padNotes = [293.66, 349.23, 440]; // D4, F4, A4
  padNotes.forEach((freq, i) => {
    const padOsc = ctx.createOscillator();
    padOsc.type = 'triangle';
    padOsc.frequency.value = freq;
    padOsc.detune.value = (i - 1) * 5;

    // Gentle vibrato
    const vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.value = 4.5 + i * 0.3;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.004;
    vibLfo.connect(vibGain);
    vibGain.connect(padOsc.frequency);
    vibLfo.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.04;

    padOsc.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();

    ambientNodes.sources.push(padOsc, vibLfo);
    ambientNodes.nodes.push(vibGain, padGain);
  });

  // Snare-like accent on beat 2 and 4 feel
  function playAccent() {
    if (!ambientNodes.gain) return;

    const accentGain = ctx.createGain();
    accentGain.gain.setValueAtTime(0.04 * (state.volume / 100), ctx.currentTime);
    accentGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    accentGain.connect(masterGain);

    const noiseBuffer = createNoiseBuffer(ctx, 'white', 0.2);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 2000;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(accentGain);
    noiseSource.start();
    noiseSource.stop(ctx.currentTime + 0.1);
  }

  // Accent on beats
  let accentCount = 0;
  const accentInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(accentInterval);
      return;
    }
    accentCount++;
    if (accentCount % 4 === 2 || accentCount % 4 === 0) {
      playAccent();
    }
  }, 250);

  ambientNodes.thunderTimeout = accentInterval;
}

// ============================================
// Lo-fi Café Ambient Sounds
// ============================================

// Café Ambience - Coffee shop atmosphere with chatter and espresso machine
async function playCafeAmbience() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('cafe.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.4);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.4;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Background murmur (brown noise filtered)
  const murmurBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const murmurSource = ctx.createBufferSource();
  murmurSource.buffer = murmurBuffer;
  murmurSource.loop = true;

  const murmurFilter = ctx.createBiquadFilter();
  murmurFilter.type = 'bandpass';
  murmurFilter.frequency.value = 400;
  murmurFilter.Q.value = 0.8;

  const murmurGain = ctx.createGain();
  murmurGain.gain.value = 0.25;

  // Slow modulation on murmur volume
  const murmurLfo = ctx.createOscillator();
  murmurLfo.type = 'sine';
  murmurLfo.frequency.value = 0.15;
  const murmurLfoGain = ctx.createGain();
  murmurLfoGain.gain.value = 0.08;
  murmurLfo.connect(murmurLfoGain);
  murmurLfoGain.connect(murmurGain.gain);
  murmurLfo.start();

  murmurSource.connect(murmurFilter);
  murmurFilter.connect(murmurGain);
  murmurGain.connect(masterGain);
  murmurSource.start();

  ambientNodes.sources.push(murmurSource, murmurLfo);
  ambientNodes.nodes.push(murmurFilter, murmurGain, murmurLfoGain);

  // Higher pitched chatter layer
  const chatterBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const chatterSource = ctx.createBufferSource();
  chatterSource.buffer = chatterBuffer;
  chatterSource.loop = true;

  const chatterFilter = ctx.createBiquadFilter();
  chatterFilter.type = 'bandpass';
  chatterFilter.frequency.value = 800;
  chatterFilter.Q.value = 1.2;

  const chatterGain = ctx.createGain();
  chatterGain.gain.value = 0.1;

  // Different modulation for variety
  const chatterLfo = ctx.createOscillator();
  chatterLfo.type = 'sine';
  chatterLfo.frequency.value = 0.08;
  const chatterLfoGain = ctx.createGain();
  chatterLfoGain.gain.value = 0.05;
  chatterLfo.connect(chatterLfoGain);
  chatterLfoGain.connect(chatterGain.gain);
  chatterLfo.start();

  chatterSource.connect(chatterFilter);
  chatterFilter.connect(chatterGain);
  chatterGain.connect(masterGain);
  chatterSource.start();

  ambientNodes.sources.push(chatterSource, chatterLfo);
  ambientNodes.nodes.push(chatterFilter, chatterGain, chatterLfoGain);

  // Occasional cup/dish clink
  function playClink() {
    if (!ambientNodes.gain) return;

    const clinkGain = ctx.createGain();
    clinkGain.gain.setValueAtTime(0.08 * (state.volume / 100), ctx.currentTime);
    clinkGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    clinkGain.connect(masterGain);

    // Multiple oscillators for metallic sound
    const freqs = [2200 + Math.random() * 800, 3400 + Math.random() * 600, 4800 + Math.random() * 400];
    freqs.forEach(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      const oscGain = ctx.createGain();
      oscGain.gain.value = 0.3;

      osc.connect(oscGain);
      oscGain.connect(clinkGain);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    });
  }

  // Espresso machine steam hiss
  function playEspressoHiss() {
    if (!ambientNodes.gain) return;

    const hissBuffer = createNoiseBuffer(ctx, 'white', 2);
    const hissSource = ctx.createBufferSource();
    hissSource.buffer = hissBuffer;

    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 3000;

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.001, ctx.currentTime);
    hissGain.gain.exponentialRampToValueAtTime(0.15 * (state.volume / 100), ctx.currentTime + 0.2);
    hissGain.gain.setValueAtTime(0.15 * (state.volume / 100), ctx.currentTime + 1.5);
    hissGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);

    hissSource.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(masterGain);
    hissSource.start();
    hissSource.stop(ctx.currentTime + 2.5);
  }

  // Schedule random café sounds
  const cafeInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(cafeInterval);
      return;
    }
    const rand = Math.random();
    if (rand < 0.15) {
      playClink();
    } else if (rand < 0.2) {
      playEspressoHiss();
    }
  }, 3000);

  ambientNodes.interval = cafeInterval;
}

// Soft Jazz - Mellow piano and soft bass
async function playLofiJazz() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('jazz.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.35);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.35;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Warm pad - jazz voicings (Dm7)
  const padNotes = [146.83, 174.61, 220, 261.63]; // D3, F3, A3, C4
  padNotes.forEach((freq, i) => {
    const padOsc = ctx.createOscillator();
    padOsc.type = 'sine';
    padOsc.frequency.value = freq;

    const padOsc2 = ctx.createOscillator();
    padOsc2.type = 'triangle';
    padOsc2.frequency.value = freq;
    padOsc2.detune.value = 3;

    // Gentle vibrato
    const vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.value = 4 + i * 0.2;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.002;
    vibLfo.connect(vibGain);
    vibGain.connect(padOsc.frequency);
    vibLfo.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.06;

    const merge = ctx.createGain();
    merge.gain.value = 0.5;
    padOsc.connect(merge);
    padOsc2.connect(merge);
    merge.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();
    padOsc2.start();

    ambientNodes.sources.push(padOsc, padOsc2, vibLfo);
    ambientNodes.nodes.push(vibGain, padGain, merge);
  });

  // Walking bass pattern
  const bassNotes = [73.42, 82.41, 87.31, 98]; // D2, E2, F2, G2
  let bassIndex = 0;

  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sine';
  bassOsc.frequency.value = bassNotes[0];

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 300;

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.15;

  bassOsc.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start();

  ambientNodes.sources.push(bassOsc);
  ambientNodes.nodes.push(bassFilter, bassGain);

  // Walking bass rhythm
  const bassInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(bassInterval);
      return;
    }
    bassIndex = (bassIndex + 1) % bassNotes.length;
    bassOsc.frequency.setTargetAtTime(bassNotes[bassIndex], ctx.currentTime, 0.05);
  }, 600);

  ambientNodes.interval = bassInterval;

  // Occasional piano note
  function playPianoNote() {
    if (!ambientNodes.gain) return;

    const pianoNotes = [293.66, 329.63, 349.23, 392, 440, 523.25]; // D4, E4, F4, G4, A4, C5
    const noteFreq = pianoNotes[Math.floor(Math.random() * pianoNotes.length)];

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0.12 * (state.volume / 100), ctx.currentTime);
    noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
    noteGain.connect(masterGain);

    // Simple piano-like tone (sine + harmonics)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = noteFreq;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = noteFreq * 2;

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = noteFreq * 3;

    const gain2 = ctx.createGain();
    gain2.gain.value = 0.3;
    const gain3 = ctx.createGain();
    gain3.gain.value = 0.1;

    osc1.connect(noteGain);
    osc2.connect(gain2);
    gain2.connect(noteGain);
    osc3.connect(gain3);
    gain3.connect(noteGain);

    osc1.start();
    osc2.start();
    osc3.start();
    osc1.stop(ctx.currentTime + 2.5);
    osc2.stop(ctx.currentTime + 2.5);
    osc3.stop(ctx.currentTime + 2.5);
  }

  // Play piano notes occasionally
  const pianoInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(pianoInterval);
      return;
    }
    if (Math.random() < 0.3) {
      playPianoNote();
    }
  }, 2000);

  ambientNodes.extraInterval = pianoInterval;
}

// Typing & Rain - Keyboard typing sounds with light rain
async function playLofiTyping() {
  // Try to load audio file first
  const audioBuffer = await loadAudioFile('typing.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.4);
    return;
  }

  // Fallback to synthesis
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.4;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Light rain background
  const rainBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const rainSource = ctx.createBufferSource();
  rainSource.buffer = rainBuffer;
  rainSource.loop = true;

  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'lowpass';
  rainFilter.frequency.value = 2500;

  const rainFilter2 = ctx.createBiquadFilter();
  rainFilter2.type = 'highpass';
  rainFilter2.frequency.value = 200;

  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.2;

  rainSource.connect(rainFilter);
  rainFilter.connect(rainFilter2);
  rainFilter2.connect(rainGain);
  rainGain.connect(masterGain);
  rainSource.start();

  ambientNodes.sources.push(rainSource);
  ambientNodes.nodes.push(rainFilter, rainFilter2, rainGain);

  // Keyboard click sound
  function playKeyClick() {
    if (!ambientNodes.gain) return;

    const clickGain = ctx.createGain();
    const volume = (0.05 + Math.random() * 0.05) * (state.volume / 100);
    clickGain.gain.setValueAtTime(volume, ctx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    clickGain.connect(masterGain);

    // Click is noise burst + tone
    const clickBuffer = createNoiseBuffer(ctx, 'white', 0.1);
    const clickSource = ctx.createBufferSource();
    clickSource.buffer = clickBuffer;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 1500 + Math.random() * 1000;
    clickFilter.Q.value = 2;

    clickSource.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickSource.start();
    clickSource.stop(ctx.currentTime + 0.08);

    // Subtle thock
    const thockOsc = ctx.createOscillator();
    thockOsc.type = 'sine';
    thockOsc.frequency.value = 150 + Math.random() * 50;

    const thockGain = ctx.createGain();
    thockGain.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
    thockGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    thockOsc.connect(thockGain);
    thockGain.connect(masterGain);
    thockOsc.start();
    thockOsc.stop(ctx.currentTime + 0.06);
  }

  // Typing rhythm - variable speed typing
  let typingActive = true;
  let pauseUntil = 0;

  const typingInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(typingInterval);
      return;
    }

    const now = Date.now();
    if (now < pauseUntil) return;

    // Random pause between typing bursts
    if (Math.random() < 0.05) {
      pauseUntil = now + 1000 + Math.random() * 2000;
      return;
    }

    playKeyClick();
  }, 80 + Math.random() * 100);

  ambientNodes.interval = typingInterval;

  // Occasional space bar (slightly different sound)
  const spaceInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(spaceInterval);
      return;
    }

    if (Math.random() < 0.2) {
      // Space bar sound - lower, longer
      const spaceGain = ctx.createGain();
      spaceGain.gain.setValueAtTime(0.08 * (state.volume / 100), ctx.currentTime);
      spaceGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      spaceGain.connect(masterGain);

      const spaceOsc = ctx.createOscillator();
      spaceOsc.type = 'sine';
      spaceOsc.frequency.value = 100;
      spaceOsc.connect(spaceGain);
      spaceOsc.start();
      spaceOsc.stop(ctx.currentTime + 0.15);
    }
  }, 500);

  ambientNodes.extraInterval = spaceInterval;
}

// ============================================
// Terminal Ambient Sounds
// ============================================

// System Hum - Low electronic drone
async function playTerminalHum() {
  const audioBuffer = await loadAudioFile('terminal-hum.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.35);
    return;
  }

  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.35;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Base hum (60Hz electrical)
  const humOsc = ctx.createOscillator();
  humOsc.type = 'sine';
  humOsc.frequency.value = 60;

  const humGain = ctx.createGain();
  humGain.gain.value = 0.15;

  humOsc.connect(humGain);
  humGain.connect(masterGain);
  humOsc.start();

  ambientNodes.sources.push(humOsc);
  ambientNodes.nodes.push(humGain);

  // Harmonic at 120Hz
  const harmOsc = ctx.createOscillator();
  harmOsc.type = 'sine';
  harmOsc.frequency.value = 120;

  const harmGain = ctx.createGain();
  harmGain.gain.value = 0.08;

  harmOsc.connect(harmGain);
  harmGain.connect(masterGain);
  harmOsc.start();

  ambientNodes.sources.push(harmOsc);
  ambientNodes.nodes.push(harmGain);

  // High frequency CRT whine
  const whineOsc = ctx.createOscillator();
  whineOsc.type = 'sine';
  whineOsc.frequency.value = 15750; // CRT horizontal scan frequency

  const whineGain = ctx.createGain();
  whineGain.gain.value = 0.02;

  // Subtle modulation
  const whineLfo = ctx.createOscillator();
  whineLfo.type = 'sine';
  whineLfo.frequency.value = 0.5;
  const whineLfoGain = ctx.createGain();
  whineLfoGain.gain.value = 0.01;
  whineLfo.connect(whineLfoGain);
  whineLfoGain.connect(whineGain.gain);
  whineLfo.start();

  whineOsc.connect(whineGain);
  whineGain.connect(masterGain);
  whineOsc.start();

  ambientNodes.sources.push(whineOsc, whineLfo);
  ambientNodes.nodes.push(whineGain, whineLfoGain);

  // Subtle noise floor
  const noiseBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 500;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.05;

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start();

  ambientNodes.sources.push(noiseSource);
  ambientNodes.nodes.push(noiseFilter, noiseGain);
}

// Mechanical Keyboard - Typing sounds
async function playTerminalKeys() {
  const audioBuffer = await loadAudioFile('terminal-keys.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.4);
    return;
  }

  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.4;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Background hum
  const humOsc = ctx.createOscillator();
  humOsc.type = 'sine';
  humOsc.frequency.value = 60;

  const humGain = ctx.createGain();
  humGain.gain.value = 0.03;

  humOsc.connect(humGain);
  humGain.connect(masterGain);
  humOsc.start();

  ambientNodes.sources.push(humOsc);
  ambientNodes.nodes.push(humGain);

  // Mechanical key click
  function playMechKey() {
    if (!ambientNodes.gain) return;

    const clickGain = ctx.createGain();
    const vol = (0.08 + Math.random() * 0.06) * (state.volume / 100);
    clickGain.gain.setValueAtTime(vol, ctx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    clickGain.connect(masterGain);

    // Click down
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.value = 800 + Math.random() * 400;

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 2000;
    clickFilter.Q.value = 1;

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickOsc.start();
    clickOsc.stop(ctx.currentTime + 0.02);

    // Thock sound
    const thockOsc = ctx.createOscillator();
    thockOsc.type = 'sine';
    thockOsc.frequency.value = 200 + Math.random() * 100;

    const thockGain = ctx.createGain();
    thockGain.gain.setValueAtTime(vol * 0.7, ctx.currentTime);
    thockGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    thockOsc.connect(thockGain);
    thockGain.connect(masterGain);
    thockOsc.start();
    thockOsc.stop(ctx.currentTime + 0.1);
  }

  // Typing rhythm
  let pauseUntil = 0;
  const typingInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(typingInterval);
      return;
    }

    const now = Date.now();
    if (now < pauseUntil) return;

    if (Math.random() < 0.03) {
      pauseUntil = now + 500 + Math.random() * 1500;
      return;
    }

    playMechKey();
  }, 60 + Math.random() * 80);

  ambientNodes.interval = typingInterval;
}

// Data Stream - Digital processing sounds
async function playTerminalData() {
  const audioBuffer = await loadAudioFile('terminal-data.mp3');
  if (audioBuffer) {
    playLoadedAudio(audioBuffer, 0.35);
    return;
  }

  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.35;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Base digital noise
  const noiseBuffer = createNoiseBuffer(ctx, 'white', 4);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 2000;
  noiseFilter.Q.value = 2;

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.03;

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start();

  ambientNodes.sources.push(noiseSource);
  ambientNodes.nodes.push(noiseFilter, noiseGain);

  // Low digital drone
  const droneOsc = ctx.createOscillator();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 55;

  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 200;

  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.08;

  droneOsc.connect(droneFilter);
  droneFilter.connect(droneGain);
  droneGain.connect(masterGain);
  droneOsc.start();

  ambientNodes.sources.push(droneOsc);
  ambientNodes.nodes.push(droneFilter, droneGain);

  // Data blips
  function playBlip() {
    if (!ambientNodes.gain) return;

    const blipGain = ctx.createGain();
    blipGain.gain.setValueAtTime(0.06 * (state.volume / 100), ctx.currentTime);
    blipGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    blipGain.connect(masterGain);

    const blipOsc = ctx.createOscillator();
    blipOsc.type = 'sine';
    blipOsc.frequency.value = 400 + Math.random() * 1200;
    blipOsc.connect(blipGain);
    blipOsc.start();
    blipOsc.stop(ctx.currentTime + 0.05 + Math.random() * 0.05);
  }

  // Occasional data burst
  function playBurst() {
    if (!ambientNodes.gain) return;

    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
      setTimeout(() => playBlip(), i * 50);
    }
  }

  const dataInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(dataInterval);
      return;
    }

    if (Math.random() < 0.3) {
      playBlip();
    }
    if (Math.random() < 0.1) {
      playBurst();
    }
  }, 300);

  ambientNodes.interval = dataInterval;
}

function playAmbientSound(soundType) {
  state.currentSound = soundType;

  // Update UI
  updateSoundUI();

  // Stop current sound
  stopAmbientSound();

  // Only play during active session (running)
  const shouldPlay = state.status === 'running';

  if (soundType !== 'off' && shouldPlay) {
    switch (soundType) {
      case 'rain':
        playRainOnTent();
        break;
      case 'fireplace':
        playFireplace();
        break;
      case 'forest':
        playForest();
        break;
      case 'synthDrive':
        playSynthDrive();
        break;
      case 'synthNeon':
        playSynthNeon();
        break;
      case 'synthGrid':
        playSynthGrid();
        break;
      case 'cafeAmbience':
        playCafeAmbience();
        break;
      case 'lofiJazz':
        playLofiJazz();
        break;
      case 'lofiTyping':
        playLofiTyping();
        break;
      case 'terminalHum':
        playTerminalHum();
        break;
      case 'terminalKeys':
        playTerminalKeys();
        break;
      case 'terminalData':
        playTerminalData();
        break;
    }
  }

  // Don't persist sound selection between sessions
  // saveToStorage();
}

function updateVolume(value) {
  state.volume = value;

  if (ambientNodes.gain) {
    // Scale based on sound type
    let scale = 0.5;
    if (state.currentSound === 'rain') scale = 0.5;
    if (state.currentSound === 'fireplace') scale = 0.45;
    if (state.currentSound === 'forest') scale = 0.5;
    if (state.currentSound === 'synthDrive') scale = 0.35;
    if (state.currentSound === 'synthNeon') scale = 0.35;
    if (state.currentSound === 'synthGrid') scale = 0.35;
    if (state.currentSound === 'cafeAmbience') scale = 0.4;
    if (state.currentSound === 'lofiJazz') scale = 0.35;
    if (state.currentSound === 'lofiTyping') scale = 0.4;
    if (state.currentSound === 'terminalHum') scale = 0.35;
    if (state.currentSound === 'terminalKeys') scale = 0.4;
    if (state.currentSound === 'terminalData') scale = 0.35;

    ambientNodes.gain.gain.value = value / 100 * scale;
  }

  saveToStorage();
}

function updateAmbientSoundForMode() {
  // Stop sounds when timer completes, keep playing during work and break
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

const THEMES = ['light', 'dark', 'synthwave', 'lofi', 'terminal', 'fireside'];

function cycleTheme() {
  const currentIndex = THEMES.indexOf(state.theme);
  const nextIndex = (currentIndex + 1) % THEMES.length;
  state.theme = THEMES[nextIndex];

  if (state.theme === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  saveToStorage();
}

// Request notification permission on first interaction
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
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
function addTask(name, estimatedMinutes = null) {
  if (!name.trim()) return;

  const task = {
    id: generateTaskId(),
    name: name.trim(),
    estimatedMinutes: estimatedMinutes,
    actualSeconds: 0,
    completed: false,
    createdAt: Date.now(),
    notes: '',
    // Todoist fields - local tasks are never synced to Todoist
    todoistId: null,
    todoistSyncedAt: null,
    isLocalOnly: true
  };

  state.tasks.push(task);
  saveToStorage();
  renderTasks();
}

// Complete a task
function completeTaskById(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = true;

  // Sync to Todoist (fire-and-forget)
  syncTaskCompletionToTodoist(task);

  // Play ding sound
  playCompletionDing();

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

  // Sync to Todoist (fire-and-forget)
  syncTaskCompletionToTodoist(task);

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
    // Only clear completed tasks
    state.tasks = state.tasks.filter(t => !t.completed);
  } else {
    // Clear all tasks
    state.tasks = [];
  }
  // Reset actual time on remaining tasks for the new day
  state.tasks.forEach(t => {
    t.actualSeconds = 0;
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

    const taskEl = document.createElement('div');
    taskEl.className = 'task-item';
    taskEl.dataset.taskId = task.id;
    taskEl.dataset.index = state.tasks.findIndex(t => t.id === task.id);
    taskEl.draggable = state.status !== 'running' && !task.completed;

    if (task.completed) taskEl.classList.add('completed');
    if (isNext) taskEl.classList.add('next-task');
    if (isActive) taskEl.classList.add('active-task');

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

    // Todoist badge for synced tasks
    const todoistBadge = task.todoistId ? '<span class="task-todoist-badge" title="Synced with Todoist">T</span>' : '';

    taskEl.innerHTML = `
      <button class="task-item-checkbox" aria-label="${task.completed ? 'Uncomplete' : 'Complete'} task"></button>
      <div class="task-item-content" data-has-notes="${hasNotes}">
        <div class="task-item-name-row">
          <div class="task-item-name" contenteditable="false">${escapeHtml(task.name)}</div>
          ${todoistBadge}
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
  if (state.status === 'running' && state.mode === 'work' && state.activeTaskId) {
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

  // Initialize Todoist settings
  initTodoistSettings();
}

// Initialize Todoist integration settings UI
function initTodoistSettings() {
  const enabledToggle = document.getElementById('todoistEnabledToggle');
  const tokenRow = document.getElementById('todoistTokenRow');
  const tokenInput = document.getElementById('todoistTokenInput');
  const tokenToggle = document.getElementById('todoistTokenToggle');
  const statusRow = document.getElementById('todoistStatusRow');
  const syncRow = document.getElementById('todoistSyncRow');
  const syncBtn = document.getElementById('todoistSyncBtn');

  if (!enabledToggle) return;

  // Initialize toggle state
  enabledToggle.checked = state.todoist.enabled;

  // Show/hide dependent rows based on enabled state
  const updateVisibility = () => {
    const show = state.todoist.enabled;
    if (tokenRow) tokenRow.hidden = !show;
    if (statusRow) statusRow.hidden = !show;
    if (syncRow) syncRow.hidden = !show;
  };
  updateVisibility();

  // Restore token if exists
  if (tokenInput && state.todoist.apiToken) {
    tokenInput.value = state.todoist.apiToken;
  }

  // Enable toggle handler
  enabledToggle.addEventListener('change', async (e) => {
    state.todoist.enabled = e.target.checked;
    updateVisibility();

    if (state.todoist.enabled && state.todoist.apiToken) {
      // Validate and sync
      syncWithTodoist();
    } else if (!state.todoist.enabled) {
      // Clear sync status when disabled
      state.todoist.syncStatus = 'idle';
      state.todoist.lastError = null;
    }

    saveToStorage();
    updateTodoistStatusUI();
  });

  // Token input handler
  if (tokenInput) {
    let tokenDebounceTimer = null;
    tokenInput.addEventListener('input', (e) => {
      const token = e.target.value.trim();

      // Debounce validation
      if (tokenDebounceTimer) clearTimeout(tokenDebounceTimer);
      tokenDebounceTimer = setTimeout(async () => {
        if (token) {
          state.todoist.syncStatus = 'syncing';
          updateTodoistStatusUI();

          const result = await validateTodoistToken(token);
          if (result.valid) {
            state.todoist.apiToken = token;
            saveToStorage();
            syncWithTodoist();
          } else {
            state.todoist.syncStatus = 'error';
            state.todoist.lastError = result.error;
            updateTodoistStatusUI();
          }
        } else {
          state.todoist.apiToken = null;
          state.todoist.syncStatus = 'idle';
          state.todoist.lastError = null;
          saveToStorage();
          updateTodoistStatusUI();
        }
      }, 500);
    });
  }

  // Token visibility toggle
  if (tokenToggle && tokenInput) {
    tokenToggle.addEventListener('click', () => {
      const isPassword = tokenInput.type === 'password';
      tokenInput.type = isPassword ? 'text' : 'password';
      tokenToggle.querySelector('.token-eye-icon').textContent = isPassword ? '🙈' : '👁';
    });
  }

  // Sync button handler
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      if (state.todoist.enabled && state.todoist.apiToken) {
        const syncIcon = document.getElementById('syncIcon');
        if (syncIcon) syncIcon.classList.add('spinning');
        syncWithTodoist().finally(() => {
          if (syncIcon) syncIcon.classList.remove('spinning');
        });
      }
    });
  }

  // Update status UI
  updateTodoistStatusUI();
}

// Initialize task sidebar event listeners
function initTaskSidebarListeners() {
  // Sidebar toggle
  elements.sidebarTab.addEventListener('click', openSidebar);
  elements.sidebarClose.addEventListener('click', closeSidebar);

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

  // Initialize break duration display
  updateBreakDisplay();

  // Reset sound to off (don't persist between sessions)
  state.currentSound = 'off';
  updateSoundUI();

  // Initial UI update
  updateUI();

  // Check if we need to show yesterday's summary
  checkAndShowSummary();

  // Initialize Todoist online/offline handlers
  initTodoistOnlineHandlers();

  // Auto-sync with Todoist on page load if enabled
  if (state.todoist.enabled && state.todoist.apiToken) {
    syncWithTodoist();
  }

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause/continue), D (done - work), S (skip - break), Esc (abandon), T (theme)');
}

// Start the app
init();
