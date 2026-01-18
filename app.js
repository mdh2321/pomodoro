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
  darkMode: false,

  // Ambient sounds
  currentSound: 'off', // 'off' | 'rain' | 'fireplace' | 'river'
  volume: 50,

  // History tracking (all-time)
  history: {} // { "2026-01-18": { sessions: 4, minutes: 100 }, ... }
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
  darkModeToggle: document.getElementById('darkModeToggle'),

  // Sound controls
  soundBtns: document.querySelectorAll('.sound-btn'),
  volumeSlider: document.getElementById('volumeSlider'),

  // Stats
  statsBtn: document.getElementById('statsBtn'),
  statsOverlay: document.getElementById('statsOverlay'),
  statsCloseBtn: document.getElementById('statsCloseBtn'),
  statsChart: document.getElementById('statsChart'),
  statsSummary: document.getElementById('statsSummary')
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
      currentSound: state.currentSound,
      volume: state.volume,
      history: state.history,
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

  const preset = state.presets[state.currentPreset];
  state.totalSeconds = (state.mode === 'work' ? preset.work : preset.break) * 60;
  state.remainingSeconds = state.totalSeconds;
  state.status = 'idle';

  updateUI();
  updateAmbientSoundForMode();
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

  ambientNodes = { source: null, gain: null, filter: null, sources: [], nodes: [], interval: null };
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

// Rain on tent - layered approach with patter and droplets
function playRainOnTent() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.6;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Continuous rain patter (pink noise, low-passed)
  const patterBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const patterSource = ctx.createBufferSource();
  patterSource.buffer = patterBuffer;
  patterSource.loop = true;

  const patterFilter = ctx.createBiquadFilter();
  patterFilter.type = 'lowpass';
  patterFilter.frequency.value = 800;
  patterFilter.Q.value = 0.5;

  const patterGain = ctx.createGain();
  patterGain.gain.value = 0.4;

  patterSource.connect(patterFilter);
  patterFilter.connect(patterGain);
  patterGain.connect(masterGain);
  patterSource.start();

  ambientNodes.sources.push(patterSource);
  ambientNodes.nodes.push(patterFilter, patterGain);

  // Layer 2: Tent fabric resonance (filtered brown noise, mid frequencies)
  const tentBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const tentSource = ctx.createBufferSource();
  tentSource.buffer = tentBuffer;
  tentSource.loop = true;

  const tentFilter = ctx.createBiquadFilter();
  tentFilter.type = 'bandpass';
  tentFilter.frequency.value = 300;
  tentFilter.Q.value = 1.5;

  const tentGain = ctx.createGain();
  tentGain.gain.value = 0.25;

  tentSource.connect(tentFilter);
  tentFilter.connect(tentGain);
  tentGain.connect(masterGain);
  tentSource.start();

  ambientNodes.sources.push(tentSource);
  ambientNodes.nodes.push(tentFilter, tentGain);

  // Layer 3: High frequency droplet detail
  const dropBuffer = createNoiseBuffer(ctx, 'white', 4);
  const dropSource = ctx.createBufferSource();
  dropSource.buffer = dropBuffer;
  dropSource.loop = true;

  const dropFilter = ctx.createBiquadFilter();
  dropFilter.type = 'highpass';
  dropFilter.frequency.value = 2000;

  const dropFilter2 = ctx.createBiquadFilter();
  dropFilter2.type = 'lowpass';
  dropFilter2.frequency.value = 6000;

  const dropGain = ctx.createGain();
  dropGain.gain.value = 0.08;

  dropSource.connect(dropFilter);
  dropFilter.connect(dropFilter2);
  dropFilter2.connect(dropGain);
  dropGain.connect(masterGain);
  dropSource.start();

  ambientNodes.sources.push(dropSource);
  ambientNodes.nodes.push(dropFilter, dropFilter2, dropGain);
}

// Fireplace with crackling
function playFireplace() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.5;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Base fire roar (brown noise)
  const baseBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const baseSource = ctx.createBufferSource();
  baseSource.buffer = baseBuffer;
  baseSource.loop = true;

  const baseFilter = ctx.createBiquadFilter();
  baseFilter.type = 'lowpass';
  baseFilter.frequency.value = 500;
  baseFilter.Q.value = 0.7;

  const baseGain = ctx.createGain();
  baseGain.gain.value = 0.5;

  baseSource.connect(baseFilter);
  baseFilter.connect(baseGain);
  baseGain.connect(masterGain);
  baseSource.start();

  ambientNodes.sources.push(baseSource);
  ambientNodes.nodes.push(baseFilter, baseGain);

  // Layer 2: Mid crackle layer
  const midBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const midSource = ctx.createBufferSource();
  midSource.buffer = midBuffer;
  midSource.loop = true;

  const midFilter = ctx.createBiquadFilter();
  midFilter.type = 'bandpass';
  midFilter.frequency.value = 1000;
  midFilter.Q.value = 1.0;

  const midGain = ctx.createGain();
  midGain.gain.value = 0.15;

  midSource.connect(midFilter);
  midFilter.connect(midGain);
  midGain.connect(masterGain);
  midSource.start();

  ambientNodes.sources.push(midSource);
  ambientNodes.nodes.push(midFilter, midGain);

  // Layer 3: Random crackle pops
  function playCrackle() {
    if (!ambientNodes.gain) return;

    const crackleGain = ctx.createGain();
    const intensity = 0.1 + Math.random() * 0.2;
    crackleGain.gain.setValueAtTime(intensity * (state.volume / 100), ctx.currentTime);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05 + Math.random() * 0.1);
    crackleGain.connect(masterGain);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 100 + Math.random() * 200;

    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 800 + Math.random() * 1500;
    crackleFilter.Q.value = 5 + Math.random() * 10;

    osc.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  // Random crackles at varying intervals
  ambientNodes.interval = setInterval(() => {
    if (Math.random() > 0.3) {
      playCrackle();
    }
  }, 200 + Math.random() * 400);
}

// River/stream sound
function playRiver() {
  const ctx = initAudioContext();
  stopAmbientSound();

  const masterGain = ctx.createGain();
  masterGain.gain.value = state.volume / 100 * 0.5;
  masterGain.connect(ctx.destination);
  ambientNodes.gain = masterGain;
  ambientNodes.sources = [];
  ambientNodes.nodes = [];

  // Layer 1: Deep water flow (brown noise, very low)
  const deepBuffer = createNoiseBuffer(ctx, 'brown', 4);
  const deepSource = ctx.createBufferSource();
  deepSource.buffer = deepBuffer;
  deepSource.loop = true;

  const deepFilter = ctx.createBiquadFilter();
  deepFilter.type = 'lowpass';
  deepFilter.frequency.value = 200;

  const deepGain = ctx.createGain();
  deepGain.gain.value = 0.3;

  deepSource.connect(deepFilter);
  deepFilter.connect(deepGain);
  deepGain.connect(masterGain);
  deepSource.start();

  ambientNodes.sources.push(deepSource);
  ambientNodes.nodes.push(deepFilter, deepGain);

  // Layer 2: Main water flow (pink noise with modulation)
  const flowBuffer = createNoiseBuffer(ctx, 'pink', 4);
  const flowSource = ctx.createBufferSource();
  flowSource.buffer = flowBuffer;
  flowSource.loop = true;

  const flowFilter = ctx.createBiquadFilter();
  flowFilter.type = 'bandpass';
  flowFilter.frequency.value = 600;
  flowFilter.Q.value = 0.5;

  // Add subtle modulation for movement
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 100;
  lfo.connect(lfoGain);
  lfoGain.connect(flowFilter.frequency);
  lfo.start();

  const flowGain = ctx.createGain();
  flowGain.gain.value = 0.4;

  flowSource.connect(flowFilter);
  flowFilter.connect(flowGain);
  flowGain.connect(masterGain);
  flowSource.start();

  ambientNodes.sources.push(flowSource, lfo);
  ambientNodes.nodes.push(flowFilter, lfoGain, flowGain);

  // Layer 3: Bubbling/splashing high frequencies
  const bubbleBuffer = createNoiseBuffer(ctx, 'white', 4);
  const bubbleSource = ctx.createBufferSource();
  bubbleSource.buffer = bubbleBuffer;
  bubbleSource.loop = true;

  const bubbleFilter = ctx.createBiquadFilter();
  bubbleFilter.type = 'bandpass';
  bubbleFilter.frequency.value = 3000;
  bubbleFilter.Q.value = 2;

  const bubbleGain = ctx.createGain();
  bubbleGain.gain.value = 0.06;

  bubbleSource.connect(bubbleFilter);
  bubbleFilter.connect(bubbleGain);
  bubbleGain.connect(masterGain);
  bubbleSource.start();

  ambientNodes.sources.push(bubbleSource);
  ambientNodes.nodes.push(bubbleFilter, bubbleGain);
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

  let weekSessions = 0;
  let monthSessions = 0;
  let totalSessions = 0;

  for (const [dateStr, data] of Object.entries(state.history)) {
    const date = new Date(dateStr);
    totalSessions += data.sessions;

    if (date >= weekStart) {
      weekSessions += data.sessions;
    }
    if (date >= monthStart) {
      monthSessions += data.sessions;
    }
  }

  // Update summary cards
  document.getElementById('statToday').textContent = todayData.sessions;
  document.getElementById('statWeek').textContent = weekSessions;
  document.getElementById('statMonth').textContent = monthSessions;
  document.getElementById('statTotal').textContent = totalSessions;

  // Generate chart
  generateChart();
}

function generateChart() {
  const chartContainer = elements.statsChart;
  chartContainer.innerHTML = '';

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
      sessions: data.sessions,
      label: date.getDate().toString()
    });
  }

  // Find max sessions for scaling
  const maxSessions = Math.max(...days.map(d => d.sessions), 1);

  // Create bars
  days.forEach(day => {
    const bar = document.createElement('div');
    bar.className = 'chart-bar';

    const fill = document.createElement('div');
    fill.className = 'chart-bar-fill' + (day.sessions === 0 ? ' empty' : '');
    const heightPercent = (day.sessions / maxSessions) * 100;
    fill.style.height = Math.max(heightPercent, 4) + 'px';

    const label = document.createElement('span');
    label.className = 'chart-bar-label';
    label.textContent = day.label;

    if (day.sessions > 0) {
      const value = document.createElement('span');
      value.className = 'chart-bar-value';
      value.textContent = day.sessions;
      bar.appendChild(value);
    }

    bar.appendChild(fill);
    bar.appendChild(label);
    chartContainer.appendChild(bar);
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

  // Restore sound button UI state
  elements.soundBtns.forEach(btn => {
    const isActive = btn.dataset.sound === state.currentSound;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  // Initial UI update
  updateUI();

  console.log('🍅 Pomo initialized. Keyboard shortcuts: Space (start/pause), R (reset), S (skip), D (dark mode)');
}

// Start the app
init();
