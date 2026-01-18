/**
 * Pomo - Minimal Pomodoro Timer
 * A distraction-free timer for deep work
 */

// ============================================
// State & Configuration
// ============================================

const STORAGE_KEY = 'pomo_data';
const CIRCUMFERENCE = 2 * Math.PI * 90; // SVG circle circumference (r=90)

const DEFAULT_PRESETS = {
  classic: { work: 25, break: 5 },
  long: { work: 50, break: 10 },
  short: { work: 15, break: 3 },
  custom: { work: 25, break: 5 }
};

const state = {
  // Timer state
  mode: 'work', // 'work' | 'break'
  status: 'idle', // 'idle' | 'running' | 'paused' | 'completed'

  // Time tracking
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,

  // Session tracking
  sessionCount: 1,
  totalFocusedMinutes: 0,

  // Current preset
  currentPreset: 'classic',
  presets: { ...DEFAULT_PRESETS },

  // Timer interval reference
  intervalId: null,

  // Dark mode
  darkMode: false
};

// ============================================
// DOM Elements
// ============================================

const elements = {
  // Timer display
  timerDisplay: document.getElementById('timerDisplay'),
  timerStatus: document.getElementById('timerStatus'),
  progressRing: document.getElementById('progressRing'),

  // Controls
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resetBtn: document.getElementById('resetBtn'),
  skipBtn: document.getElementById('skipBtn'),

  // Presets
  presetBtns: document.querySelectorAll('.preset-btn:not(.preset-btn--custom)'),
  customPresetBtn: document.getElementById('customPresetBtn'),
  customPresetDetail: document.getElementById('customPresetDetail'),

  // Session info
  sessionCount: document.getElementById('sessionCount'),
  totalTime: document.getElementById('totalTime'),

  // Modal
  modalOverlay: document.getElementById('modalOverlay'),
  customWorkInput: document.getElementById('customWorkInput'),
  customBreakInput: document.getElementById('customBreakInput'),
  modalCancelBtn: document.getElementById('modalCancelBtn'),
  modalSaveBtn: document.getElementById('modalSaveBtn'),

  // Dark mode
  darkModeToggle: document.getElementById('darkModeToggle')
};

// ============================================
// Local Storage
// ============================================

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);

      // Restore custom preset
      if (data.customPreset) {
        state.presets.custom = data.customPreset;
        updateCustomPresetDisplay();
      }

      // Restore current preset selection
      if (data.currentPreset && state.presets[data.currentPreset]) {
        state.currentPreset = data.currentPreset;
      }

      // Restore session stats for today
      if (data.date === getTodayDate()) {
        state.sessionCount = data.sessionCount || 1;
        state.totalFocusedMinutes = data.totalFocusedMinutes || 0;
      }

      // Restore dark mode preference
      if (data.darkMode) {
        state.darkMode = true;
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    }
  } catch (e) {
    console.warn('Failed to load from storage:', e);
  }
}

function saveToStorage() {
  try {
    const data = {
      customPreset: state.presets.custom,
      currentPreset: state.currentPreset,
      sessionCount: state.sessionCount,
      totalFocusedMinutes: state.totalFocusedMinutes,
      darkMode: state.darkMode,
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
  updateUI();
}

function resetTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;

  const preset = state.presets[state.currentPreset];
  state.totalSeconds = (state.mode === 'work' ? preset.work : preset.break) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

function skipTimer() {
  // Don't count skipped sessions - just move to the next mode
  clearInterval(state.intervalId);
  state.intervalId = null;

  // Switch mode without counting the session
  state.mode = state.mode === 'work' ? 'break' : 'work';

  const preset = state.presets[state.currentPreset];
  state.totalSeconds = (state.mode === 'work' ? preset.work : preset.break) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

function completeTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.remainingSeconds = 0;
  state.status = 'completed';

  // Track completed work session
  if (state.mode === 'work') {
    state.totalFocusedMinutes += Math.round(state.totalSeconds / 60);
    state.sessionCount++;
    saveToStorage();
  }

  // Play notification sound and show notification
  playNotificationSound();
  showBrowserNotification();

  updateUI();
}

function switchMode() {
  state.mode = state.mode === 'work' ? 'break' : 'work';

  const preset = state.presets[state.currentPreset];
  state.totalSeconds = (state.mode === 'work' ? preset.work : preset.break) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
}

// ============================================
// Preset Management
// ============================================

function selectPreset(presetName) {
  state.currentPreset = presetName;

  // Update active state on buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
  });

  if (presetName === 'custom') {
    elements.customPresetBtn.classList.add('active');
    elements.customPresetBtn.setAttribute('aria-pressed', 'true');
  } else {
    const activeBtn = document.querySelector(`.preset-btn[data-work="${state.presets[presetName].work}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.setAttribute('aria-pressed', 'true');
    }
  }

  // Reset timer with new preset
  resetTimer();
  saveToStorage();
}

function openCustomPresetModal() {
  elements.customWorkInput.value = state.presets.custom.work;
  elements.customBreakInput.value = state.presets.custom.break;
  elements.modalOverlay.classList.add('active');
  elements.modalOverlay.setAttribute('aria-hidden', 'false');
  elements.customWorkInput.focus();
}

function closeCustomPresetModal() {
  elements.modalOverlay.classList.remove('active');
  elements.modalOverlay.setAttribute('aria-hidden', 'true');
}

function saveCustomPreset() {
  const work = parseInt(elements.customWorkInput.value, 10);
  const breakTime = parseInt(elements.customBreakInput.value, 10);

  if (work >= 1 && work <= 120 && breakTime >= 1 && breakTime <= 60) {
    state.presets.custom = { work, break: breakTime };
    updateCustomPresetDisplay();
    selectPreset('custom');
    closeCustomPresetModal();
    saveToStorage();
  }
}

function updateCustomPresetDisplay() {
  elements.customPresetDetail.textContent =
    `${state.presets.custom.work}/${state.presets.custom.break}`;
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

  // Start button
  if (status === 'completed') {
    elements.startBtn.textContent = mode === 'work' ? 'Start Break' : 'Start Work';
    elements.startBtn.disabled = false;
  } else if (status === 'running') {
    elements.startBtn.textContent = 'Start';
    elements.startBtn.disabled = true;
  } else {
    elements.startBtn.textContent = 'Start';
    elements.startBtn.disabled = false;
  }

  // Pause button
  elements.pauseBtn.disabled = status !== 'running';

  // Skip button
  elements.skipBtn.disabled = status === 'idle' || status === 'completed';

  // Update primary button style based on mode
  elements.startBtn.classList.toggle('break-mode', mode === 'break' || status === 'completed' && mode === 'work');
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
// Dark Mode
// ============================================

function toggleDarkMode() {
  state.darkMode = !state.darkMode;

  if (state.darkMode) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
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
  elements.resetBtn.addEventListener('click', resetTimer);
  elements.skipBtn.addEventListener('click', skipTimer);

  // Preset buttons
  elements.presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const work = parseInt(btn.dataset.work, 10);
      const breakTime = parseInt(btn.dataset.break, 10);

      // Find preset name by matching values
      let presetName = 'classic';
      for (const [name, preset] of Object.entries(state.presets)) {
        if (preset.work === work && preset.break === breakTime) {
          presetName = name;
          break;
        }
      }

      selectPreset(presetName);
    });
  });

  // Custom preset
  elements.customPresetBtn.addEventListener('click', openCustomPresetModal);
  elements.modalCancelBtn.addEventListener('click', closeCustomPresetModal);
  elements.modalSaveBtn.addEventListener('click', saveCustomPreset);

  // Close modal on overlay click
  elements.modalOverlay.addEventListener('click', (e) => {
    if (e.target === elements.modalOverlay) {
      closeCustomPresetModal();
    }
  });

  // Modal keyboard handling
  elements.modalOverlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCustomPresetModal();
    } else if (e.key === 'Enter') {
      saveCustomPreset();
    }
  });

  // Dark mode toggle
  elements.darkModeToggle.addEventListener('click', toggleDarkMode);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in input
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (state.status === 'running') {
          pauseTimer();
        } else if (state.status === 'completed') {
          switchMode();
          startTimer();
        } else {
          startTimer();
        }
        break;
      case 'KeyR':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          resetTimer();
        }
        break;
      case 'KeyS':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (state.status === 'running' || state.status === 'paused') {
            skipTimer();
          }
        }
        break;
      case 'KeyD':
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleDarkMode();
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
  updateCustomPresetDisplay();
  selectPreset(state.currentPreset);
  initEventListeners();

  // Initial UI update
  updateUI();

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause), R (reset), S (skip), D (dark mode)');
}

// Start the app
init();
