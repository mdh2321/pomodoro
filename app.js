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
  lastVisitDate: null, // For clearing done tasks on new day

  // Sidebar state
  sidebarOpen: false,

  // Ambient sounds
  currentSound: 'off', // 'off' | 'rain' | 'fireplace' | 'forest' | 'synthDrive' | 'synthNeon' | 'synthGrid'
  volume: 50,

  // History tracking (all-time)
  history: {}, // { "2026-01-18": { sessions: 4, minutes: 100 }, ... }

  // Stats view preference
  statsView: 'sessions', // 'sessions' | 'minutes'

  // Daily goal & streaks
  dailyGoalMinutes: 90, // Target focused minutes per day
  currentStreak: 0, // Consecutive days hitting goal
  longestStreak: 0 // All-time best streak
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

  // Settings modal
  settingsBtn: document.getElementById('settingsBtn'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsCloseBtn: document.getElementById('settingsCloseBtn'),
  dailyGoalSelect: document.getElementById('dailyGoalSelect'),

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
      lastVisitDate: state.lastVisitDate,
      // Daily goal & streaks
      dailyGoalMinutes: state.dailyGoalMinutes,
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
      date: getTodayDate()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save to storage:', e);
  }
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
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
  // Skip is only for break mode
  if (state.mode !== 'break') return;
  if (state.status !== 'paused' && state.status !== 'running') return;

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
      state.history[today] = { sessions: 0, minutes: 0 };
    }
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
      state.history[today] = { sessions: 0, minutes: 0 };
    }
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
    totalStats.sessions += data.sessions;
    totalStats.minutes += data.minutes || 0;

    if (date >= weekStart) {
      weekStats.sessions += data.sessions;
      weekStats.minutes += data.minutes || 0;
    }
    if (date >= monthStart) {
      monthStats.sessions += data.sessions;
      monthStats.minutes += data.minutes || 0;
    }
  }

  // Display based on current view mode
  const isMinutes = state.statsView === 'minutes';

  document.getElementById('statToday').textContent =
    isMinutes ? todayData.minutes || 0 : todayData.sessions;
  document.getElementById('statWeek').textContent =
    isMinutes ? weekStats.minutes : weekStats.sessions;
  document.getElementById('statMonth').textContent =
    isMinutes ? monthStats.minutes : monthStats.sessions;
  document.getElementById('statTotal').textContent =
    isMinutes ? totalStats.minutes : totalStats.sessions;

  // Update toggle button states
  elements.statsToggleBtns.forEach(btn => {
    const isActive = btn.dataset.view === state.statsView;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Update streak displays
  if (elements.currentStreakDisplay) {
    elements.currentStreakDisplay.textContent = state.currentStreak;
  }
  if (elements.longestStreakDisplay) {
    elements.longestStreakDisplay.textContent = state.longestStreak;
  }

  // Generate chart
  generateChart();
}

function generateChart() {
  const chartContainer = elements.statsChart;
  chartContainer.innerHTML = '';

  const isMinutes = state.statsView === 'minutes';

  // Get last 14 days
  const days = [];
  const now = new Date();

  for (let i = 13; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const data = state.history[dateStr] || { sessions: 0, minutes: 0 };

    days.push({
      date: date,
      dateStr: dateStr,
      value: isMinutes ? (data.minutes || 0) : data.sessions,
      label: date.getDate().toString()
    });
  }

  // Find max value for scaling
  const maxValue = Math.max(...days.map(d => d.value), 1);

  // Create bars
  days.forEach(day => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';

    const fill = document.createElement('div');
    fill.className = 'chart-bar-fill' + (day.value === 0 ? ' empty' : '');
    const heightPercent = (day.value / maxValue) * 100;
    fill.style.height = Math.max(heightPercent, 4) + 'px';

    const label = document.createElement('span');
    label.className = 'chart-bar-label';
    label.textContent = day.label;

    if (day.value > 0) {
      const value = document.createElement('span');
      value.className = 'chart-bar-value';
      value.textContent = day.value;
      bar.appendChild(value);
    }

    bar.appendChild(fill);
    bar.appendChild(label);
    chartContainer.appendChild(bar);
  });
}

function setStatsView(view) {
  state.statsView = view;
  updateStatsDisplay();
  saveToStorage();
}

// ============================================
// Theme Management
// ============================================

const THEMES = ['light', 'dark', 'synthwave'];

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
    createdAt: Date.now()
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
}

// Uncomplete a task
function uncompleteTaskById(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = false;
  saveToStorage();
  renderTasks();
}

// Delete a task
function deleteTask(taskId) {
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  if (state.activeTaskId === taskId) {
    state.activeTaskId = null;
  }
  saveToStorage();
  renderTasks();
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

// Clear completed tasks (for new day)
function clearCompletedTasks() {
  state.tasks = state.tasks.filter(t => !t.completed);
  saveToStorage();
  renderTasks();
}

// Check if it's a new day and clear completed tasks
function checkNewDay() {
  const today = getTodayDate();
  if (state.lastVisitDate && state.lastVisitDate !== today) {
    // Update streak based on yesterday's performance
    updateStreakForNewDay(state.lastVisitDate);
    // Clear completed tasks
    clearCompletedTasks();
  }
  state.lastVisitDate = today;
  saveToStorage();
}

// Update streak when a new day starts
function updateStreakForNewDay(lastDate) {
  // Check if the last visit date was yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Get the minutes focused on the last visit date
  const lastDayData = state.history[lastDate];
  const lastDayMinutes = lastDayData?.minutes || 0;

  if (lastDate === yesterdayStr) {
    // Last visit was yesterday - check if goal was met
    if (lastDayMinutes >= state.dailyGoalMinutes) {
      state.currentStreak++;
      if (state.currentStreak > state.longestStreak) {
        state.longestStreak = state.currentStreak;
      }
    } else {
      // Goal not met, reset streak
      state.currentStreak = 0;
    }
  } else {
    // Missed one or more days, reset streak
    state.currentStreak = 0;
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

    taskEl.innerHTML = `
      <button class="task-item-checkbox" aria-label="${task.completed ? 'Uncomplete' : 'Complete'} task"></button>
      <div class="task-item-content">
        <div class="task-item-name" contenteditable="false">${escapeHtml(task.name)}</div>
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
let draggedTaskIndex = null;

function handleDragStart(e) {
  if (state.status === 'running') {
    e.preventDefault();
    return;
  }
  draggedTaskIndex = parseInt(e.target.dataset.index);
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
  draggedTaskIndex = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const taskItem = e.target.closest('.task-item');
  if (taskItem && !taskItem.classList.contains('dragging')) {
    taskItem.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const taskItem = e.target.closest('.task-item');
  if (taskItem) {
    taskItem.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  const taskItem = e.target.closest('.task-item');
  if (taskItem && draggedTaskIndex !== null) {
    const toIndex = parseInt(taskItem.dataset.index);
    if (draggedTaskIndex !== toIndex) {
      reorderTasks(draggedTaskIndex, toIndex);
    }
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
}

// Initialize task sidebar event listeners
function initTaskSidebarListeners() {
  // Sidebar toggle
  elements.sidebarTab.addEventListener('click', openSidebar);
  elements.sidebarClose.addEventListener('click', closeSidebar);

  // Add task form - Enter to add
  elements.addTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = elements.addTaskInput.value.trim();
      const estimate = elements.addTaskEstimate.value ? parseInt(elements.addTaskEstimate.value) : null;
      if (name) {
        addTask(name, estimate);
        elements.addTaskInput.value = '';
        elements.addTaskEstimate.value = '';
      }
    }
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

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in input
    if (e.target.tagName === 'INPUT') return;

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

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause/continue), D (done - work), S (skip - break), Esc (abandon), T (theme)');
}

// Start the app
init();
