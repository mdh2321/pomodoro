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

  // Task intent
  currentTask: '',

  // Ambient sounds
  currentSound: 'off', // 'off' | 'rain' | 'fireplace' | 'forest' | 'synthDrive' | 'synthNeon' | 'synthGrid'
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

  // Session info
  sessionCount: document.getElementById('sessionCount'),
  totalTime: document.getElementById('totalTime'),

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

      // Restore volume preference only (sound resets each session)
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
      // Note: currentSound is NOT persisted - resets each session
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

// Rain on tent - soft, warm, muffled (NO harsh white noise)
function playRainOnTent() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.7;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Main rain - soft brown noise, heavily filtered for warmth
  const rainBuffer = createNoiseBuffer(ctx, 'brown', 20);
  const rainSource = ctx.createBufferSource();
  rainSource.buffer = rainBuffer;
  rainSource.loop = true;

  // Heavy low-pass to remove ALL harshness
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'lowpass';
  rainFilter.frequency.value = 300;
  rainFilter.Q.value = 0.3;

  // Second filter for extra smoothness
  const rainFilter2 = ctx.createBiquadFilter();
  rainFilter2.type = 'lowpass';
  rainFilter2.frequency.value = 500;
  rainFilter2.Q.value = 0.2;

  // Gentle modulation
  const rainLfo = ctx.createOscillator();
  rainLfo.type = 'sine';
  rainLfo.frequency.value = 0.015;
  const rainLfoGain = ctx.createGain();
  rainLfoGain.gain.value = 60;
  rainLfo.connect(rainLfoGain);
  rainLfoGain.connect(rainFilter.frequency);
  rainLfo.start();

  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.8;

  rainSource.connect(rainFilter);
  rainFilter.connect(rainFilter2);
  rainFilter2.connect(rainGain);
  rainGain.connect(masterGain);
  rainSource.start();

  ambientNodes.sources.push(rainSource, rainLfo);
  ambientNodes.nodes.push(rainFilter, rainFilter2, rainLfoGain, rainGain);

  // Layer 2: Deep tent resonance - very low rumble only
  const tentBuffer = createNoiseBuffer(ctx, 'brown', 15);
  const tentSource = ctx.createBufferSource();
  tentSource.buffer = tentBuffer;
  tentSource.loop = true;

  const tentFilter = ctx.createBiquadFilter();
  tentFilter.type = 'lowpass';
  tentFilter.frequency.value = 100;
  tentFilter.Q.value = 0.5;

  const tentGain = ctx.createGain();
  tentGain.gain.value = 0.3;

  tentSource.connect(tentFilter);
  tentFilter.connect(tentGain);
  tentGain.connect(masterGain);
  tentSource.start();

  ambientNodes.sources.push(tentSource);
  ambientNodes.nodes.push(tentFilter, tentGain);

  // Occasional soft thunder
  function playThunder() {
    if (!ambientNodes.gain) return;

    const thunderGain = ctx.createGain();
    const intensity = 0.2 + Math.random() * 0.15;
    const duration = 4 + Math.random() * 3;

    thunderGain.gain.setValueAtTime(0, ctx.currentTime);
    thunderGain.gain.linearRampToValueAtTime(intensity * (state.volume / 100), ctx.currentTime + 1);
    thunderGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    thunderGain.connect(masterGain);

    const thunderBuffer = createNoiseBuffer(ctx, 'brown', 6);
    const thunderSource = ctx.createBufferSource();
    thunderSource.buffer = thunderBuffer;

    const thunderFilter = ctx.createBiquadFilter();
    thunderFilter.type = 'lowpass';
    thunderFilter.frequency.value = 50;
    thunderFilter.Q.value = 0.3;

    thunderSource.connect(thunderFilter);
    thunderFilter.connect(thunderGain);
    thunderSource.start();
    thunderSource.stop(ctx.currentTime + duration + 1);
  }

  function scheduleThunder() {
    if (!ambientNodes.gain) return;
    const delay = 40000 + Math.random() * 60000;
    ambientNodes.thunderTimeout = setTimeout(() => {
      playThunder();
      scheduleThunder();
    }, delay);
  }
  scheduleThunder();
}

// Peaceful crackling fireplace - warm, cozy (NO harsh noise)
function playFireplace() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.6;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Deep warm base - very low brown noise only
  const baseBuffer = createNoiseBuffer(ctx, 'brown', 20);
  const baseSource = ctx.createBufferSource();
  baseSource.buffer = baseBuffer;
  baseSource.loop = true;

  // Heavy filtering for warmth
  const baseFilter = ctx.createBiquadFilter();
  baseFilter.type = 'lowpass';
  baseFilter.frequency.value = 180;
  baseFilter.Q.value = 0.3;

  const baseFilter2 = ctx.createBiquadFilter();
  baseFilter2.type = 'lowpass';
  baseFilter2.frequency.value = 300;
  baseFilter2.Q.value = 0.2;

  // Slow breathing modulation
  const baseLfo = ctx.createOscillator();
  baseLfo.type = 'sine';
  baseLfo.frequency.value = 0.025;
  const baseLfoGain = ctx.createGain();
  baseLfoGain.gain.value = 40;
  baseLfo.connect(baseLfoGain);
  baseLfoGain.connect(baseFilter.frequency);
  baseLfo.start();

  const baseGain = ctx.createGain();
  baseGain.gain.value = 0.7;

  baseSource.connect(baseFilter);
  baseFilter.connect(baseFilter2);
  baseFilter2.connect(baseGain);
  baseGain.connect(masterGain);
  baseSource.start();

  ambientNodes.sources.push(baseSource, baseLfo);
  ambientNodes.nodes.push(baseFilter, baseFilter2, baseLfoGain, baseGain);

  // Soft pops only - using sine waves, no harsh noise
  function playPop() {
    if (!ambientNodes.gain) return;

    const popGain = ctx.createGain();
    const intensity = 0.08 + Math.random() * 0.1;
    popGain.gain.setValueAtTime(intensity * (state.volume / 100), ctx.currentTime);
    popGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    popGain.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = 120 + Math.random() * 80;
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.12);

    osc.connect(popGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // Very soft crackle - low frequency, filtered
  function playSoftCrackle() {
    if (!ambientNodes.gain) return;

    const crackleGain = ctx.createGain();
    const intensity = 0.05 + Math.random() * 0.06;
    crackleGain.gain.setValueAtTime(intensity * (state.volume / 100), ctx.currentTime);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    crackleGain.connect(masterGain);

    // Use filtered brown noise for softer crackle
    const crackleBuffer = createNoiseBuffer(ctx, 'brown', 0.2);
    const crackleSource = ctx.createBufferSource();
    crackleSource.buffer = crackleBuffer;

    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 300 + Math.random() * 400;
    crackleFilter.Q.value = 1;

    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleSource.start();
    crackleSource.stop(ctx.currentTime + 0.1);
  }

  // Schedule gentle sounds
  function scheduleSounds() {
    if (!ambientNodes.gain) return;

    const rand = Math.random();
    if (rand > 0.6) {
      playSoftCrackle();
    }
    if (rand > 0.85) {
      playPop();
    }

    const nextDelay = 200 + Math.random() * 600;
    ambientNodes.interval = setTimeout(scheduleSounds, nextDelay);
  }
  scheduleSounds();
}

// Peaceful forest - soft wind, gentle birds (NO harsh noise)
function playForest() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.6;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Deep forest ambience - very low brown noise only
  const ambientBuffer = createNoiseBuffer(ctx, 'brown', 20);
  const ambientSource = ctx.createBufferSource();
  ambientSource.buffer = ambientBuffer;
  ambientSource.loop = true;

  const ambientFilter = ctx.createBiquadFilter();
  ambientFilter.type = 'lowpass';
  ambientFilter.frequency.value = 120;
  ambientFilter.Q.value = 0.3;

  const ambientGain = ctx.createGain();
  ambientGain.gain.value = 0.4;

  ambientSource.connect(ambientFilter);
  ambientFilter.connect(ambientGain);
  ambientGain.connect(masterGain);
  ambientSource.start();

  ambientNodes.sources.push(ambientSource);
  ambientNodes.nodes.push(ambientFilter, ambientGain);

  // Layer 2: Gentle wind - soft brown noise with modulation
  const windBuffer = createNoiseBuffer(ctx, 'brown', 15);
  const windSource = ctx.createBufferSource();
  windSource.buffer = windBuffer;
  windSource.loop = true;

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 250;
  windFilter.Q.value = 0.2;

  // Slow breathing modulation for wind
  const windLfo = ctx.createOscillator();
  windLfo.type = 'sine';
  windLfo.frequency.value = 0.03;
  const windLfoGain = ctx.createGain();
  windLfoGain.gain.value = 80;
  windLfo.connect(windLfoGain);
  windLfoGain.connect(windFilter.frequency);
  windLfo.start();

  const windGain = ctx.createGain();
  windGain.gain.value = 0.35;

  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  windSource.start();

  ambientNodes.sources.push(windSource, windLfo);
  ambientNodes.nodes.push(windFilter, windLfoGain, windGain);

  // Bird chirps - gentle sine wave birds
  function playBirdChirp() {
    if (!ambientNodes.gain) return;

    const chirpGain = ctx.createGain();
    const intensity = 0.06 + Math.random() * 0.08;

    const osc = ctx.createOscillator();
    osc.type = 'sine';

    // Softer, lower bird frequencies
    const baseFreq = 1200 + Math.random() * 800;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);

    const chirpDuration = 0.1 + Math.random() * 0.15;
    const pattern = Math.random();

    if (pattern > 0.5) {
      // Rising chirp
      osc.frequency.linearRampToValueAtTime(baseFreq * 1.2, ctx.currentTime + chirpDuration * 0.5);
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.95, ctx.currentTime + chirpDuration);
    } else {
      // Falling chirp
      osc.frequency.linearRampToValueAtTime(baseFreq * 0.8, ctx.currentTime + chirpDuration);
    }

    // Soft envelope
    chirpGain.gain.setValueAtTime(0, ctx.currentTime);
    chirpGain.gain.linearRampToValueAtTime(intensity * (state.volume / 100), ctx.currentTime + 0.02);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + chirpDuration + 0.1);

    osc.connect(chirpGain);
    chirpGain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + chirpDuration + 0.15);
  }

  // Schedule bird chirps - less frequent
  function scheduleBirdChirps() {
    if (!ambientNodes.gain) return;

    const chirpCount = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < chirpCount; i++) {
      setTimeout(() => {
        if (ambientNodes.gain) playBirdChirp();
      }, i * (150 + Math.random() * 250));
    }

    // Longer gaps between bird sequences
    const nextDelay = 5000 + Math.random() * 10000;
    ambientNodes.thunderTimeout = setTimeout(scheduleBirdChirps, nextDelay);
  }

  ambientNodes.thunderTimeout = setTimeout(scheduleBirdChirps, 3000);
}

// Synthwave Track 1: Neon Drive - Upbeat, driving, energetic ambient synthwave
function playSynthDrive() {
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

// Synthwave Track 2: Midnight - Atmospheric, dreamy, evolving ambient synthwave
function playSynthNeon() {
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

// Synthwave Track 3: Retrowave - Classic 80s, driving, energetic
function playSynthGrid() {
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

  // Initialize break duration display
  updateBreakDisplay();

  // Reset sound to off (don't persist between sessions)
  state.currentSound = 'off';
  updateSoundUI();

  // Restore task UI state
  updateTaskUI();

  // Initial UI update
  updateUI();

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause/continue), D (done - work), S (skip - break), Esc (abandon), T (theme)');
}

// Start the app
init();
