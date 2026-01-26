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

  // Timer editor state
  isEditing: false,
  editingMode: 'work', // which duration being edited

  // Session tracking
  sessionCount: 1,
  totalFocusedMinutes: 0,

  // Timer interval reference
  intervalId: null,

  // Theme: 'light' | 'dark' | 'synthwave'
  theme: 'light',

  // Task intent
  currentTask: '',

  // Ambient sounds
  currentSound: 'off', // 'off' | 'rain' | 'fireplace' | 'river' | 'synthDrive' | 'synthNeon' | 'synthGrid'
  volume: 50,

  // History tracking (all-time)
  history: {}, // { "2026-01-18": { sessions: 4, minutes: 100 }, ... }

  // Stats view preference
  statsView: 'sessions' // 'sessions' | 'minutes'
};

// Audio context and nodes for ambient sounds
let audioContext = null;
let ambientNodes = {
  source: null,
  gain: null,
  filter: null
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Timer display
  timerDisplay: document.getElementById('timerDisplay'),
  timerStatus: document.getElementById('timerStatus'),
  progressRing: document.getElementById('progressRing'),
  timerContainer: document.querySelector('.timer-container'),

  // Timer editor
  timerEditor: document.getElementById('timerEditor'),
  timeWheel: document.getElementById('timeWheel'),
  timePrev: document.getElementById('timePrev'),
  timeCurrent: document.getElementById('timeCurrent'),
  timeNext: document.getElementById('timeNext'),
  editToggleBtns: document.querySelectorAll('.edit-toggle-btn'),

  // Controls
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  continueBtn: document.getElementById('continueBtn'),
  doneBtn: document.getElementById('doneBtn'),
  abandonBtn: document.getElementById('abandonBtn'),
  skipBtn: document.getElementById('skipBtn'),

  // Session info
  sessionCount: document.getElementById('sessionCount'),
  totalTime: document.getElementById('totalTime'),

  // Theme toggle
  themeToggle: document.getElementById('themeToggle'),

  // Sound controls
  soundBtns: document.querySelectorAll('.sound-btn'),
  volumeSlider: document.getElementById('volumeSlider'),

  // Stats
  statsBtn: document.getElementById('statsBtn'),
  statsOverlay: document.getElementById('statsOverlay'),
  statsCloseBtn: document.getElementById('statsCloseBtn'),
  statsChart: document.getElementById('statsChart'),
  statsSummary: document.getElementById('statsSummary'),
  statsToggleBtns: document.querySelectorAll('.stats-toggle-btn'),

  // Task intent
  taskTrigger: document.getElementById('taskTrigger'),
  taskModalOverlay: document.getElementById('taskModalOverlay'),
  taskInput: document.getElementById('taskInput'),
  taskDisplay: document.getElementById('taskDisplay'),
  taskText: document.getElementById('taskText'),
  taskCompleteBtn: document.getElementById('taskCompleteBtn'),
  taskClearBtn: document.getElementById('taskClearBtn')
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

      // Restore sound preferences
      if (data.currentSound) {
        state.currentSound = data.currentSound;
      }
      if (typeof data.volume === 'number') {
        state.volume = data.volume;
        elements.volumeSlider.value = data.volume;
      }

      // Restore history
      if (data.history) {
        state.history = data.history;
      }

      // Restore current task
      if (data.currentTask) {
        state.currentTask = data.currentTask;
      }

      // Restore stats view preference
      if (data.statsView) {
        state.statsView = data.statsView;
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
      currentSound: state.currentSound,
      volume: state.volume,
      history: state.history,
      currentTask: state.currentTask,
      statsView: state.statsView,
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
  updateUI();

  // Start ambient sound if in work mode
  if (state.mode === 'work' && state.currentSound !== 'off') {
    playAmbientSound(state.currentSound);
  }

  state.intervalId = setInterval(() => {
    state.remainingSeconds--;

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
  updateUI();
}

function resetTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;

  state.totalSeconds = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

function skipTimer() {
  // Skip is only for break mode
  if (state.mode !== 'break') return;
  if (state.status !== 'paused' && state.status !== 'running') return;

  clearInterval(state.intervalId);
  state.intervalId = null;

  // Stop ambient sounds
  stopAmbientSound();

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
  startTimer();
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

  // Stop ambient sounds
  stopAmbientSound();

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

  // Stop ambient sounds
  stopAmbientSound();

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

  // Stop ambient sounds
  stopAmbientSound();

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
// Timer Editor (Scroll Wheel)
// ============================================

function enterEditMode() {
  if (state.status !== 'idle') return;

  state.isEditing = true;
  state.editingMode = state.mode;

  // Update UI
  elements.timerEditor.hidden = false;
  elements.timerDisplay.classList.remove('editable');
  elements.timerContainer.classList.add('editing');

  // Set initial values
  updateEditToggle();
  updateTimeWheel();

  // Add document click listener to exit
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 0);
}

function exitEditMode() {
  if (!state.isEditing) return;

  state.isEditing = false;

  // Apply edited values to timer
  state.totalSeconds = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  state.remainingSeconds = state.totalSeconds;

  // Update UI
  elements.timerEditor.hidden = true;
  elements.timerContainer.classList.remove('editing');

  // Remove document listener
  document.removeEventListener('click', handleOutsideClick);

  updateUI();
  saveToStorage();
}

function handleOutsideClick(e) {
  const timerContainer = elements.timerContainer;
  if (!timerContainer.contains(e.target)) {
    exitEditMode();
  }
}

function formatMinutes(minutes) {
  return `${minutes}:00`;
}

function updateTimeWheel() {
  const values = TIME_VALUES[state.editingMode];
  const currentMinutes = state.editingMode === 'work' ? state.workMinutes : state.breakMinutes;
  let currentIndex = values.indexOf(currentMinutes);

  // If current value not in list, find closest
  if (currentIndex === -1) {
    currentIndex = values.findIndex(v => v >= currentMinutes);
    if (currentIndex === -1) currentIndex = values.length - 1;
  }

  // Get prev, current, next values
  const prevValue = currentIndex > 0 ? values[currentIndex - 1] : null;
  const currentValue = values[currentIndex];
  const nextValue = currentIndex < values.length - 1 ? values[currentIndex + 1] : null;

  // Update display
  elements.timePrev.textContent = prevValue ? formatMinutes(prevValue) : '';
  elements.timePrev.style.visibility = prevValue ? 'visible' : 'hidden';

  elements.timeCurrent.textContent = formatMinutes(currentValue);

  elements.timeNext.textContent = nextValue ? formatMinutes(nextValue) : '';
  elements.timeNext.style.visibility = nextValue ? 'visible' : 'hidden';

  // Update ARIA
  elements.timeWheel.setAttribute('aria-valuenow', currentValue);
}

function scrollTimeValue(direction) {
  // direction: 1 for up (decrease time), -1 for down (increase time)
  const values = TIME_VALUES[state.editingMode];
  const currentMinutes = state.editingMode === 'work' ? state.workMinutes : state.breakMinutes;
  let currentIndex = values.indexOf(currentMinutes);

  if (currentIndex === -1) {
    currentIndex = values.findIndex(v => v >= currentMinutes);
    if (currentIndex === -1) currentIndex = values.length - 1;
  }

  let newIndex = currentIndex - direction;
  newIndex = Math.max(0, Math.min(newIndex, values.length - 1));

  const newValue = values[newIndex];

  if (state.editingMode === 'work') {
    state.workMinutes = newValue;
  } else {
    state.breakMinutes = newValue;
  }

  // Add animation class
  elements.timeWheel.classList.add(direction > 0 ? 'scrolling-up' : 'scrolling-down');
  setTimeout(() => {
    elements.timeWheel.classList.remove('scrolling-up', 'scrolling-down');
  }, 100);

  updateTimeWheel();
}

function updateEditToggle() {
  elements.editToggleBtns.forEach(btn => {
    const isActive = btn.dataset.editMode === state.editingMode;
    btn.classList.toggle('active', isActive);
  });
}

function switchEditingMode(mode) {
  state.editingMode = mode;
  updateEditToggle();
  updateTimeWheel();
}

// Wheel scroll handler
function handleWheelScroll(e) {
  if (!state.isEditing) return;

  e.preventDefault();
  const direction = e.deltaY > 0 ? -1 : 1;
  scrollTimeValue(direction);
}

// Touch drag handlers
let touchStartY = 0;
let lastTouchY = 0;
const DRAG_THRESHOLD = 30;

function handleTouchStart(e) {
  if (!state.isEditing) return;
  touchStartY = e.touches[0].clientY;
  lastTouchY = touchStartY;
}

function handleTouchMove(e) {
  if (!state.isEditing) return;
  e.preventDefault();

  const currentY = e.touches[0].clientY;
  const deltaY = lastTouchY - currentY;

  if (Math.abs(deltaY) >= DRAG_THRESHOLD) {
    const direction = deltaY > 0 ? -1 : 1;
    scrollTimeValue(direction);
    lastTouchY = currentY;

    // Haptic feedback if available
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }
}

function handleTouchEnd() {
  touchStartY = 0;
  lastTouchY = 0;
}

function handleTimerClick(e) {
  if (state.status === 'idle' && !state.isEditing) {
    e.stopPropagation();
    enterEditMode();
  }
}

function handleEditToggleClick(e) {
  const mode = e.target.dataset.editMode;
  if (mode) {
    switchEditingMode(mode);
  }
}

function updateEditableState() {
  elements.timerDisplay.classList.toggle('editable', state.status === 'idle' && !state.isEditing);
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
  updateEditableState();
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
  elements.sessionCount.textContent = `Session #${state.sessionCount}`;
  elements.totalTime.textContent = `${state.totalFocusedMinutes} min focused today`;
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

// Create noise buffer with specified characteristics
function createNoiseBuffer(ctx, type, duration = 4) {
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
    // Pink noise using Paul Kellet's refined method
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      dataL[i] = pink;
      // Slightly different for stereo width
      const white2 = Math.random() * 2 - 1;
      dataR[i] = pink * 0.7 + white2 * 0.3;
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

// Rain on tent - light, muffled, with occasional thunder
function playRainOnTent() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.5;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Light rain patter - muffled (as if inside tent)
  const patterBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const patterSource = ctx.createBufferSource();
  patterSource.buffer = patterBuffer;
  patterSource.loop = true;

  const patterFilter = ctx.createBiquadFilter();
  patterFilter.type = 'lowpass';
  patterFilter.frequency.value = 400; // More muffled
  patterFilter.Q.value = 0.3;

  const patterGain = ctx.createGain();
  patterGain.gain.value = 0.35;

  patterSource.connect(patterFilter);
  patterFilter.connect(patterGain);
  patterGain.connect(masterGain);
  patterSource.start();

  ambientNodes.sources.push(patterSource);
  ambientNodes.nodes.push(patterFilter, patterGain);

  // Layer 2: Soft tent fabric resonance
  const tentBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const tentSource = ctx.createBufferSource();
  tentSource.buffer = tentBuffer;
  tentSource.loop = true;

  const tentFilter = ctx.createBiquadFilter();
  tentFilter.type = 'bandpass';
  tentFilter.frequency.value = 200; // Lower, more muffled
  tentFilter.Q.value = 0.8;

  const tentGain = ctx.createGain();
  tentGain.gain.value = 0.2;

  tentSource.connect(tentFilter);
  tentFilter.connect(tentGain);
  tentGain.connect(masterGain);
  tentSource.start();

  ambientNodes.sources.push(tentSource);
  ambientNodes.nodes.push(tentFilter, tentGain);

  // Layer 3: Very subtle high detail (distant droplets on tent)
  const dropBuffer = createNoiseBuffer(ctx, 'white', 4);
  const dropSource = ctx.createBufferSource();
  dropSource.buffer = dropBuffer;
  dropSource.loop = true;

  const dropFilter = ctx.createBiquadFilter();
  dropFilter.type = 'bandpass';
  dropFilter.frequency.value = 1200;
  dropFilter.Q.value = 0.5;

  const dropGain = ctx.createGain();
  dropGain.gain.value = 0.03; // Very subtle

  dropSource.connect(dropFilter);
  dropFilter.connect(dropGain);
  dropGain.connect(masterGain);
  dropSource.start();

  ambientNodes.sources.push(dropSource);
  ambientNodes.nodes.push(dropFilter, dropGain);

  // Occasional distant thunder
  function playThunder() {
    if (!ambientNodes.gain) return;

    const thunderGain = ctx.createGain();
    const intensity = 0.15 + Math.random() * 0.2;
    thunderGain.gain.setValueAtTime(0, ctx.currentTime);
    thunderGain.gain.linearRampToValueAtTime(intensity * (state.volume / 100), ctx.currentTime + 0.3);
    thunderGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2 + Math.random() * 2);
    thunderGain.connect(masterGain);

    // Deep rumble using brown noise
    const thunderBuffer = createNoiseBuffer(ctx, 'brown', 4);
    const thunderSource = ctx.createBufferSource();
    thunderSource.buffer = thunderBuffer;

    const thunderFilter = ctx.createBiquadFilter();
    thunderFilter.type = 'lowpass';
    thunderFilter.frequency.value = 100 + Math.random() * 50;
    thunderFilter.Q.value = 0.5;

    thunderSource.connect(thunderFilter);
    thunderFilter.connect(thunderGain);
    thunderSource.start();
    thunderSource.stop(ctx.currentTime + 4);
  }

  // Random thunder every 20-60 seconds
  function scheduleThunder() {
    if (!ambientNodes.gain) return;
    const delay = 20000 + Math.random() * 40000;
    ambientNodes.thunderTimeout = setTimeout(() => {
      playThunder();
      scheduleThunder();
    }, delay);
  }
  scheduleThunder();
}

// Peaceful crackling fireplace
function playFireplace() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.45;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Soft warm base (gentle brown noise)
  const baseBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const baseSource = ctx.createBufferSource();
  baseSource.buffer = baseBuffer;
  baseSource.loop = true;

  const baseFilter = ctx.createBiquadFilter();
  baseFilter.type = 'lowpass';
  baseFilter.frequency.value = 300; // Softer, warmer
  baseFilter.Q.value = 0.5;

  const baseGain = ctx.createGain();
  baseGain.gain.value = 0.4;

  baseSource.connect(baseFilter);
  baseFilter.connect(baseGain);
  baseGain.connect(masterGain);
  baseSource.start();

  ambientNodes.sources.push(baseSource);
  ambientNodes.nodes.push(baseFilter, baseGain);

  // Layer 2: Gentle mid warmth
  const midBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const midSource = ctx.createBufferSource();
  midSource.buffer = midBuffer;
  midSource.loop = true;

  const midFilter = ctx.createBiquadFilter();
  midFilter.type = 'bandpass';
  midFilter.frequency.value = 600;
  midFilter.Q.value = 0.6;

  const midGain = ctx.createGain();
  midGain.gain.value = 0.1;

  midSource.connect(midFilter);
  midFilter.connect(midGain);
  midGain.connect(masterGain);
  midSource.start();

  ambientNodes.sources.push(midSource);
  ambientNodes.nodes.push(midFilter, midGain);

  // Gentle crackle pops - quieter and more varied
  function playCrackle() {
    if (!ambientNodes.gain) return;

    const crackleGain = ctx.createGain();
    const intensity = 0.05 + Math.random() * 0.12; // Quieter
    crackleGain.gain.setValueAtTime(intensity * (state.volume / 100), ctx.currentTime);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03 + Math.random() * 0.08);
    crackleGain.connect(masterGain);

    // Use noise burst for more natural crackle
    const crackleBuffer = createNoiseBuffer(ctx, 'white', 0.2);
    const crackleSource = ctx.createBufferSource();
    crackleSource.buffer = crackleBuffer;

    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 1500 + Math.random() * 2000;
    crackleFilter.Q.value = 3 + Math.random() * 5;

    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleSource.start();
    crackleSource.stop(ctx.currentTime + 0.1);
  }

  // Soft pop sounds
  function playSoftPop() {
    if (!ambientNodes.gain) return;

    const popGain = ctx.createGain();
    const intensity = 0.03 + Math.random() * 0.06;
    popGain.gain.setValueAtTime(intensity * (state.volume / 100), ctx.currentTime);
    popGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    popGain.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200 + Math.random() * 100, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);

    osc.connect(popGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // More frequent but gentler crackles
  ambientNodes.interval = setInterval(() => {
    const rand = Math.random();
    if (rand > 0.6) {
      playCrackle();
    } else if (rand > 0.85) {
      playSoftPop();
    }
  }, 150 + Math.random() * 300);
}

// Slow peaceful river
function playRiver() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.45;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Deep slow current (brown noise, very low and smooth)
  const deepBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const deepSource = ctx.createBufferSource();
  deepSource.buffer = deepBuffer;
  deepSource.loop = true;

  const deepFilter = ctx.createBiquadFilter();
  deepFilter.type = 'lowpass';
  deepFilter.frequency.value = 150; // Very deep
  deepFilter.Q.value = 0.3;

  const deepGain = ctx.createGain();
  deepGain.gain.value = 0.35;

  deepSource.connect(deepFilter);
  deepFilter.connect(deepGain);
  deepGain.connect(masterGain);
  deepSource.start();

  ambientNodes.sources.push(deepSource);
  ambientNodes.nodes.push(deepFilter, deepGain);

  // Layer 2: Gentle main flow (pink noise with very slow modulation)
  const flowBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const flowSource = ctx.createBufferSource();
  flowSource.buffer = flowBuffer;
  flowSource.loop = true;

  const flowFilter = ctx.createBiquadFilter();
  flowFilter.type = 'bandpass';
  flowFilter.frequency.value = 400; // Lower frequency for slower feel
  flowFilter.Q.value = 0.3;

  // Very slow, subtle modulation
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.08; // Very slow modulation
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 50; // Subtle variation
  lfo.connect(lfoGain);
  lfoGain.connect(flowFilter.frequency);
  lfo.start();

  const flowGain = ctx.createGain();
  flowGain.gain.value = 0.3;

  flowSource.connect(flowFilter);
  flowFilter.connect(flowGain);
  flowGain.connect(masterGain);
  flowSource.start();

  ambientNodes.sources.push(flowSource, lfo);
  ambientNodes.nodes.push(flowFilter, lfoGain, flowGain);

  // Layer 3: Very subtle high shimmer (distant water sparkle)
  const shimmerBuffer = createNoiseBuffer(ctx, 'white', 4);
  const shimmerSource = ctx.createBufferSource();
  shimmerSource.buffer = shimmerBuffer;
  shimmerSource.loop = true;

  const shimmerFilter = ctx.createBiquadFilter();
  shimmerFilter.type = 'bandpass';
  shimmerFilter.frequency.value = 2000;
  shimmerFilter.Q.value = 1;

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.015; // Very quiet

  shimmerSource.connect(shimmerFilter);
  shimmerFilter.connect(shimmerGain);
  shimmerGain.connect(masterGain);
  shimmerSource.start();

  ambientNodes.sources.push(shimmerSource);
  ambientNodes.nodes.push(shimmerFilter, shimmerGain);
}

// Synthwave Track 1: Drive - Energetic, pulsing, driving feel
function playSynthDrive() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.35;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Driving bass - pulsing saw wave
  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sawtooth';
  bassOsc.frequency.value = 55; // A1

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 400;
  bassFilter.Q.value = 2;

  // Rhythmic pulse on the bass (eighth notes feel)
  const bassLfo = ctx.createOscillator();
  bassLfo.type = 'square';
  bassLfo.frequency.value = 2; // Pulsing rhythm
  const bassLfoGain = ctx.createGain();
  bassLfoGain.gain.value = 0.15;
  bassLfo.connect(bassLfoGain);
  bassLfoGain.connect(masterGain);

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.25;
  bassLfo.start();

  bassOsc.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start();

  ambientNodes.sources.push(bassOsc, bassLfo);
  ambientNodes.nodes.push(bassFilter, bassLfoGain, bassGain);

  // Arpeggio layer - cycling through notes
  const arpNotes = [220, 277.18, 329.63, 440]; // A3, C#4, E4, A4
  let arpIndex = 0;

  const arpOsc = ctx.createOscillator();
  arpOsc.type = 'sawtooth';
  arpOsc.frequency.value = arpNotes[0];

  const arpFilter = ctx.createBiquadFilter();
  arpFilter.type = 'lowpass';
  arpFilter.frequency.value = 2000;
  arpFilter.Q.value = 3;

  // Filter sweep LFO
  const arpFilterLfo = ctx.createOscillator();
  arpFilterLfo.type = 'sine';
  arpFilterLfo.frequency.value = 0.15;
  const arpFilterLfoGain = ctx.createGain();
  arpFilterLfoGain.gain.value = 1000;
  arpFilterLfo.connect(arpFilterLfoGain);
  arpFilterLfoGain.connect(arpFilter.frequency);
  arpFilterLfo.start();

  const arpGain = ctx.createGain();
  arpGain.gain.value = 0.12;

  arpOsc.connect(arpFilter);
  arpFilter.connect(arpGain);
  arpGain.connect(masterGain);
  arpOsc.start();

  // Cycle through arp notes
  ambientNodes.interval = setInterval(() => {
    if (!ambientNodes.gain) return;
    arpIndex = (arpIndex + 1) % arpNotes.length;
    arpOsc.frequency.setTargetAtTime(arpNotes[arpIndex], ctx.currentTime, 0.02);
  }, 150);

  ambientNodes.sources.push(arpOsc, arpFilterLfo);
  ambientNodes.nodes.push(arpFilter, arpFilterLfoGain, arpGain);

  // Pad layer - warm sustained chords
  const padFreqs = [110, 138.59, 165]; // A2, C#3, E3 (A major)
  padFreqs.forEach((freq, i) => {
    const padOsc = ctx.createOscillator();
    padOsc.type = 'sine';
    padOsc.frequency.value = freq;

    // Slight detuning for warmth
    const detune = (i - 1) * 5;
    padOsc.detune.value = detune;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.06;

    padOsc.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();

    ambientNodes.sources.push(padOsc);
    ambientNodes.nodes.push(padGain);
  });

  // Sub bass for depth
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 27.5; // A0

  const subGain = ctx.createGain();
  subGain.gain.value = 0.18;

  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  ambientNodes.sources.push(subOsc);
  ambientNodes.nodes.push(subGain);
}

// Synthwave Track 2: Neon - Dreamy, atmospheric, lush
function playSynthNeon() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.35;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Lush pad - layered triangle waves with slow modulation
  const padFreqs = [130.81, 164.81, 196, 261.63]; // C3, E3, G3, C4 (C major)
  padFreqs.forEach((freq, i) => {
    const padOsc = ctx.createOscillator();
    padOsc.type = 'triangle';
    padOsc.frequency.value = freq;

    // Slow vibrato
    const vibLfo = ctx.createOscillator();
    vibLfo.type = 'sine';
    vibLfo.frequency.value = 0.3 + i * 0.1;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.01;
    vibLfo.connect(vibGain);
    vibGain.connect(padOsc.frequency);
    vibLfo.start();

    const padGain = ctx.createGain();
    padGain.gain.value = 0.08;

    padOsc.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();

    ambientNodes.sources.push(padOsc, vibLfo);
    ambientNodes.nodes.push(vibGain, padGain);
  });

  // Shimmering high layer
  const shimmerOsc = ctx.createOscillator();
  shimmerOsc.type = 'sine';
  shimmerOsc.frequency.value = 523.25; // C5

  // Tremolo effect
  const shimmerLfo = ctx.createOscillator();
  shimmerLfo.type = 'sine';
  shimmerLfo.frequency.value = 6;
  const shimmerLfoGain = ctx.createGain();
  shimmerLfoGain.gain.value = 0.04;

  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.04;

  shimmerLfo.connect(shimmerLfoGain);
  shimmerLfoGain.connect(shimmerGain.gain);
  shimmerLfo.start();

  shimmerOsc.connect(shimmerGain);
  shimmerGain.connect(masterGain);
  shimmerOsc.start();

  ambientNodes.sources.push(shimmerOsc, shimmerLfo);
  ambientNodes.nodes.push(shimmerLfoGain, shimmerGain);

  // Deep bass drone
  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'sine';
  bassOsc.frequency.value = 65.41; // C2

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 200;

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.2;

  bassOsc.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start();

  ambientNodes.sources.push(bassOsc);
  ambientNodes.nodes.push(bassFilter, bassGain);

  // Slow evolving filter sweep on noise for texture
  const noiseBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const noiseSource = ctx.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;

  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 2;

  // Slow sweep
  const noiseLfo = ctx.createOscillator();
  noiseLfo.type = 'sine';
  noiseLfo.frequency.value = 0.05;
  const noiseLfoGain = ctx.createGain();
  noiseLfoGain.gain.value = 400;
  noiseLfo.connect(noiseLfoGain);
  noiseLfoGain.connect(noiseFilter.frequency);
  noiseLfo.start();

  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.03;

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseSource.start();

  ambientNodes.sources.push(noiseSource, noiseLfo);
  ambientNodes.nodes.push(noiseFilter, noiseLfoGain, noiseGain);
}

// Synthwave Track 3: Grid - Retro, sequenced, classic 80s
function playSynthGrid() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.35;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Classic sequenced bass pattern (D minor)
  const bassNotes = [73.42, 73.42, 87.31, 98]; // D2, D2, F2, G2
  let bassIndex = 0;

  const bassOsc = ctx.createOscillator();
  bassOsc.type = 'square';
  bassOsc.frequency.value = bassNotes[0];

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = 600;
  bassFilter.Q.value = 4;

  // Filter envelope simulation with LFO
  const bassEnvLfo = ctx.createOscillator();
  bassEnvLfo.type = 'sawtooth';
  bassEnvLfo.frequency.value = 2;
  const bassEnvGain = ctx.createGain();
  bassEnvGain.gain.value = 300;
  bassEnvLfo.connect(bassEnvGain);
  bassEnvGain.connect(bassFilter.frequency);
  bassEnvLfo.start();

  const bassGain = ctx.createGain();
  bassGain.gain.value = 0.15;

  bassOsc.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(masterGain);
  bassOsc.start();

  // Sequence the bass
  ambientNodes.interval = setInterval(() => {
    if (!ambientNodes.gain) return;
    bassIndex = (bassIndex + 1) % bassNotes.length;
    bassOsc.frequency.setTargetAtTime(bassNotes[bassIndex], ctx.currentTime, 0.01);
  }, 250);

  ambientNodes.sources.push(bassOsc, bassEnvLfo);
  ambientNodes.nodes.push(bassFilter, bassEnvGain, bassGain);

  // Arpeggiated lead (D minor: D, F, A, D)
  const leadNotes = [293.66, 349.23, 440, 587.33]; // D4, F4, A4, D5
  let leadIndex = 0;

  const leadOsc = ctx.createOscillator();
  leadOsc.type = 'sawtooth';
  leadOsc.frequency.value = leadNotes[0];

  const leadFilter = ctx.createBiquadFilter();
  leadFilter.type = 'lowpass';
  leadFilter.frequency.value = 3000;
  leadFilter.Q.value = 2;

  const leadGain = ctx.createGain();
  leadGain.gain.value = 0.08;

  leadOsc.connect(leadFilter);
  leadFilter.connect(leadGain);
  leadGain.connect(masterGain);
  leadOsc.start();

  // Faster arpeggio for lead
  const leadInterval = setInterval(() => {
    if (!ambientNodes.gain) {
      clearInterval(leadInterval);
      return;
    }
    leadIndex = (leadIndex + 1) % leadNotes.length;
    leadOsc.frequency.setTargetAtTime(leadNotes[leadIndex], ctx.currentTime, 0.01);
  }, 125);

  ambientNodes.sources.push(leadOsc);
  ambientNodes.nodes.push(leadFilter, leadGain);

  // Pad for fullness
  const padFreqs = [146.83, 174.61, 220]; // D3, F3, A3
  padFreqs.forEach((freq) => {
    const padOsc = ctx.createOscillator();
    padOsc.type = 'triangle';
    padOsc.frequency.value = freq;

    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;

    padOsc.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();

    ambientNodes.sources.push(padOsc);
    ambientNodes.nodes.push(padGain);
  });

  // Sub bass
  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.value = 36.71; // D1

  const subGain = ctx.createGain();
  subGain.gain.value = 0.15;

  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  ambientNodes.sources.push(subOsc);
  ambientNodes.nodes.push(subGain);

  // Store extra interval for cleanup
  const originalStop = stopAmbientSound;
  ambientNodes.extraInterval = leadInterval;
}

function playAmbientSound(soundType) {
  state.currentSound = soundType;

  // Update UI
  elements.soundBtns.forEach(btn => {
    const isActive = btn.dataset.sound === soundType;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Stop current sound
  stopAmbientSound();

  // Only play during work mode or if timer is idle
  const shouldPlay = state.mode === 'work' || state.status === 'idle';

  if (soundType !== 'off' && shouldPlay) {
    switch (soundType) {
      case 'rain':
        playRainOnTent();
        break;
      case 'fireplace':
        playFireplace();
        break;
      case 'river':
        playRiver();
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

  saveToStorage();
}

function updateVolume(value) {
  state.volume = value;

  if (ambientNodes.gain) {
    // Scale based on sound type
    let scale = 0.5;
    if (state.currentSound === 'rain') scale = 0.6;
    if (state.currentSound === 'fireplace') scale = 0.5;
    if (state.currentSound === 'river') scale = 0.5;
    if (state.currentSound === 'synthDrive') scale = 0.35;
    if (state.currentSound === 'synthNeon') scale = 0.35;
    if (state.currentSound === 'synthGrid') scale = 0.35;

    ambientNodes.gain.gain.value = value / 100 * scale;
  }

  saveToStorage();
}

function updateAmbientSoundForMode() {
  // Pause sounds during breaks, resume during work
  if (state.mode === 'break' || state.status === 'completed') {
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
// Task Intent
// ============================================

function openTaskModal() {
  elements.taskModalOverlay.hidden = false;
  elements.taskModalOverlay.setAttribute('aria-hidden', 'false');
  elements.taskInput.value = '';
  elements.taskInput.focus();
}

function closeTaskModal() {
  elements.taskModalOverlay.hidden = true;
  elements.taskModalOverlay.setAttribute('aria-hidden', 'true');
}

function setTask(text) {
  const trimmed = text.trim().slice(0, 70);
  if (!trimmed) return;

  state.currentTask = trimmed;
  elements.taskText.textContent = trimmed;
  elements.taskInput.value = '';
  elements.taskTrigger.hidden = true;
  elements.taskDisplay.hidden = false;
  closeTaskModal();
  saveToStorage();
}

function clearTask() {
  state.currentTask = '';
  elements.taskInput.value = '';
  elements.taskTrigger.hidden = false;
  elements.taskDisplay.hidden = true;
  saveToStorage();
}

function completeTask() {
  playCompleteSound();

  // Animate the card and checkbox
  elements.taskDisplay.classList.add('completing');
  elements.taskCompleteBtn.classList.add('checked');

  setTimeout(() => {
    elements.taskDisplay.classList.remove('completing');
    elements.taskCompleteBtn.classList.remove('checked');
    clearTask();
  }, 500);
}

function playCompleteSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Pleasant two-tone chime
    const playTone = (freq, delay, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const startTime = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    playTone(880, 0, 0.12);       // A5
    playTone(1318.5, 0.08, 0.18); // E6
  } catch (e) {
    console.warn('Could not play complete sound:', e);
  }
}

function updateTaskUI() {
  if (state.currentTask) {
    elements.taskText.textContent = state.currentTask;
    elements.taskTrigger.hidden = true;
    elements.taskDisplay.hidden = false;
  } else {
    elements.taskTrigger.hidden = false;
    elements.taskDisplay.hidden = true;
  }
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

  // Timer editor
  elements.timerDisplay.addEventListener('click', handleTimerClick);

  // Time wheel interactions
  elements.timeWheel.addEventListener('wheel', handleWheelScroll, { passive: false });
  elements.timeWheel.addEventListener('touchstart', handleTouchStart, { passive: true });
  elements.timeWheel.addEventListener('touchmove', handleTouchMove, { passive: false });
  elements.timeWheel.addEventListener('touchend', handleTouchEnd);

  // Edit toggle buttons
  elements.editToggleBtns.forEach(btn => {
    btn.addEventListener('click', handleEditToggleClick);
  });

  // Theme toggle
  elements.themeToggle.addEventListener('click', cycleTheme);

  // Sound controls
  elements.soundBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playAmbientSound(btn.dataset.sound);
    });
  });

  elements.volumeSlider.addEventListener('input', (e) => {
    updateVolume(parseInt(e.target.value, 10));
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

  // Task intent
  elements.taskTrigger.addEventListener('click', openTaskModal);

  elements.taskModalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.taskModalOverlay) {
      closeTaskModal();
    }
  });

  elements.taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && elements.taskInput.value.trim()) {
      setTask(elements.taskInput.value);
    } else if (e.key === 'Escape') {
      closeTaskModal();
    }
  });

  elements.taskCompleteBtn.addEventListener('click', completeTask);
  elements.taskClearBtn.addEventListener('click', clearTask);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in input
    if (e.target.tagName === 'INPUT') return;

    // Timer editor keyboard controls
    if (state.isEditing) {
      switch (e.code) {
        case 'ArrowUp':
          e.preventDefault();
          scrollTimeValue(1); // Decrease time
          break;
        case 'ArrowDown':
          e.preventDefault();
          scrollTimeValue(-1); // Increase time
          break;
        case 'Tab':
          e.preventDefault();
          // Toggle between work and break
          switchEditingMode(state.editingMode === 'work' ? 'break' : 'work');
          break;
        case 'Escape':
        case 'Enter':
          e.preventDefault();
          exitEditMode();
          break;
      }
      return;
    }

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

  // Restore sound button UI state
  elements.soundBtns.forEach(btn => {
    const isActive = btn.dataset.sound === state.currentSound;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Restore task UI state
  updateTaskUI();

  // Initial UI update
  updateUI();

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause/continue), D (done - work), S (skip - break), Esc (abandon), T (theme)');
}

// Start the app
init();
