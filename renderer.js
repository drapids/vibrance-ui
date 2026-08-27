const { ipcRenderer } = require('electron');

const defaultState = {
  brightness: 100,
  contrast: 100,
  gamma: 100,
  vibrancy: 100,
  saturation: 100,
  cancelDarkness: false,
  darknessBoost: 0,
  volume: 80,
  soundEnabled: true,
  particlesEnabled: true,
  screenshareMode: false,
  theme: 'ocean',
  presets: []
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('bdlConfig'));
    if (saved && typeof saved === 'object') return { ...defaultState, ...saved };
  } catch (e) {}
  return { ...defaultState };
}
const state = loadState();

function saveState() {
  localStorage.setItem('bdlConfig', JSON.stringify(state));
}

const homeTab = document.getElementById('home-tab');
const settingsTab = document.getElementById('settings-tab');
const themeSelect = document.getElementById('themeSelect');
const fpsEl = document.getElementById('fps');
const canvas = document.getElementById('particles');
const ctx = canvas.getContext('2d');

const themeParticles = {
  ocean:     { color: '#7ec8e3', shape: 'bubble', count:50,  speed:0.5 },
  cherry:    { color: '#ffb7c5', shape: 'petal',  count: 80, speed:0.7 },
  winter:    { color: '#ffffff', shape: 'snow',   count:120, speed:1 },
  matrix:    { color: '#0f0',    shape: 'code',   count:200, speed:1.5 },
  sunset:    { color: '#ff7e5f', shape: 'dot',    count:60,  speed:0.4 },
  cyberpunk: { color: '#ff00ff', shape: 'rect',   count:100, speed:2 },
  midnight:  { color: '#aaaaaa', shape: 'star',   count:90,  speed:0.3 },
  forest:    { color: '#a8e6cf', shape: 'leaf',   count:70,  speed:0.6 },
  candy:     { color: '#ffb6c1', shape: 'heart',  count:50,  speed:0.8 },
  crimson:   { color: '#dc143c', shape: 'dot',    count:100, speed:0.9 },
  nebula:    { color: '#b47edc', shape: 'star',   count:110, speed:0.5 },
  lavender:  { color: '#e6e6fa', shape: 'petal',  count:85,  speed:0.6 },
  synthwave: { color: '#ff6ec7', shape: 'rect',   count:95,  speed:1.8 }
};

let particles = [];
function createParticles() {
  if (!state.particlesEnabled) {
    particles = [];
    return;
  }
  const cfg = themeParticles[state.theme];
  if (!cfg) return;
  particles = [];
  for (let i=0; i<cfg.count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: 2 + Math.random() * 6,
      speedY: cfg.speed * (0.5 + Math.random()),
      opacity: 0.5 + Math.random() * 0.5
    });
  }
}

function drawParticles() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (!state.particlesEnabled || particles.length === 0) return;
  const cfg = themeParticles[state.theme];
  if (!cfg) return;
  ctx.fillStyle = cfg.color;
  for (let p of particles) {
    ctx.globalAlpha = p.opacity;
    if (cfg.shape === 'snow') { ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }
    else if (cfg.shape === 'petal') { ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(Math.sin(p.y*0.01)*0.2); ctx.beginPath(); ctx.ellipse(0,0,p.size,p.size*0.5,0,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    else if (cfg.shape === 'code') { ctx.font = `${p.size*2}px monospace`; ctx.fillText(String.fromCharCode(0x30A0+Math.random()*96), p.x, p.y); }
    else if (cfg.shape === 'bubble') { ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.strokeStyle = cfg.color; ctx.stroke(); }
    else if (cfg.shape === 'dot') { ctx.beginPath(); ctx.arc(p.x,p.y,p.size*0.8,0,Math.PI*2); ctx.fill(); }
    else if (cfg.shape === 'rect') { ctx.fillRect(p.x, p.y, p.size, p.size); }
    else if (cfg.shape === 'star') { ctx.beginPath(); for (let i=0;i<5;i++) { let ang = i*4*Math.PI/5; let xx = p.x+Math.cos(ang)*p.size, yy = p.y+Math.sin(ang)*p.size; if (i===0) ctx.moveTo(xx,yy); else ctx.lineTo(xx,yy); } ctx.closePath(); ctx.fill(); }
    else if (cfg.shape === 'leaf') { ctx.beginPath(); ctx.ellipse(p.x,p.y,p.size,p.size*0.3,0,0,Math.PI*2); ctx.fill(); }
    else if (cfg.shape === 'heart') { ctx.save(); ctx.translate(p.x,p.y); ctx.scale(p.size/15,p.size/15); ctx.beginPath(); ctx.moveTo(0,-5); ctx.bezierCurveTo(-5,-12,-14,-12,-14,-3); ctx.bezierCurveTo(-14,5,0,12,0,12); ctx.bezierCurveTo(0,12,14,5,14,-3); ctx.bezierCurveTo(14,-12,5,-12,0,-5); ctx.fill(); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
}

function updateParticles() {
  if (!state.particlesEnabled) return;
  for (let p of particles) {
    p.y += p.speedY;
    if (p.y > canvas.height+10) { p.y = -10; p.x = Math.random() * canvas.width; }
  }
}

function particleLoop() {
  if (state.particlesEnabled) {
    updateParticles();
    drawParticles();
  } else {
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  requestAnimationFrame(particleLoop);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (state.particlesEnabled) createParticles();
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let gainNode = audioCtx.createGain();
gainNode.connect(audioCtx.destination);
gainNode.gain.value = state.volume / 100;
function playTone(freq, type, dur, vol=0.3) {
  if (!state.soundEnabled) return;
  const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
  osc.type = type; osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain); gain.connect(gainNode); osc.start(); osc.stop(audioCtx.currentTime + dur);
}
function playSound(name) {
  if (name==='click') playTone(800,'sine',0.08,0.2);
  else if (name==='toggle') playTone(600,'square',0.05,0.15);
  else if (name==='reset') playTone(300,'triangle',0.2,0.3);
  else if (name==='slider') playTone(1000,'sine',0.03,0.1);
}

const themeConfigs = {
  ocean:     { bg:'#0a1f2e', text:'#7ec8e3', accent:'#7ec8e3', subtitle:'#4f8a9e', panel:'rgba(0,0,0,0.35)', tab:'rgba(126,200,227,0.15)', slider:'rgba(126,200,227,0.2)', gradStart:'#0a1f2e', gradEnd:'#06141e' },
  cherry:    { bg:'#3b2f2f', text:'#ffb7c5', accent:'#ffb7c5', subtitle:'#d4a0a7', panel:'rgba(0,0,0,0.35)', tab:'rgba(255,183,197,0.25)', slider:'rgba(255,183,197,0.25)', gradStart:'#3b2f2f', gradEnd:'#2b1f1f' },
  winter:    { bg:'#1e1e1e', text:'#ffffff', accent:'#ffffff', subtitle:'#aaaaaa', panel:'rgba(0,0,0,0.25)', tab:'rgba(255,255,255,0.15)', slider:'rgba(255,255,255,0.2)', gradStart:'#1e1e1e', gradEnd:'#121212' },
  matrix:    { bg:'#0d0d0d', text:'#0f0', accent:'#0f0', subtitle:'#0a0', panel:'rgba(0,255,0,0.05)', tab:'rgba(0,255,0,0.2)', slider:'rgba(0,255,0,0.2)', gradStart:'#0d0d0d', gradEnd:'#050505' },
  sunset:    { bg:'#2d1b1b', text:'#ff7e5f', accent:'#feb47b', subtitle:'#b37a6b', panel:'rgba(0,0,0,0.35)', tab:'rgba(255,126,95,0.2)', slider:'rgba(255,126,95,0.2)', gradStart:'#2d1b1b', gradEnd:'#1a1010' },
  cyberpunk: { bg:'#0b0015', text:'#ff00ff', accent:'#00ffff', subtitle:'#9900cc', panel:'rgba(0,0,0,0.45)', tab:'rgba(255,0,255,0.2)', slider:'rgba(0,255,255,0.2)', gradStart:'#0b0015', gradEnd:'#05000a' },
  midnight:  { bg:'#0f0f1a', text:'#cccccc', accent:'#8888cc', subtitle:'#666688', panel:'rgba(0,0,0,0.45)', tab:'rgba(136,136,204,0.15)', slider:'rgba(136,136,204,0.2)', gradStart:'#0f0f1a', gradEnd:'#08080f' },
  forest:    { bg:'#1a2e1a', text:'#a8e6cf', accent:'#dcedc1', subtitle:'#6b8e6b', panel:'rgba(0,0,0,0.35)', tab:'rgba(168,230,207,0.15)', slider:'rgba(168,230,207,0.2)', gradStart:'#1a2e1a', gradEnd:'#0f1a0f' },
  candy:     { bg:'#2e1a2e', text:'#ffb6c1', accent:'#ff69b4', subtitle:'#c987a0', panel:'rgba(0,0,0,0.35)', tab:'rgba(255,182,193,0.2)', slider:'rgba(255,105,180,0.2)', gradStart:'#2e1a2e', gradEnd:'#1a0f1a' },
  crimson:   { bg:'#2c0a0a', text:'#dc143c', accent:'#dc143c', subtitle:'#a01020', panel:'rgba(0,0,0,0.4)', tab:'rgba(220,20,60,0.25)', slider:'rgba(220,20,60,0.2)', gradStart:'#2c0a0a', gradEnd:'#1a0505' },
  nebula:    { bg:'#1a122e', text:'#b47edc', accent:'#b47edc', subtitle:'#7a5a9a', panel:'rgba(0,0,0,0.4)', tab:'rgba(180,126,220,0.2)', slider:'rgba(180,126,220,0.2)', gradStart:'#1a122e', gradEnd:'#0f0a1a' },
  lavender:  { bg:'#2e2e3a', text:'#e6e6fa', accent:'#e6e6fa', subtitle:'#b0b0d0', panel:'rgba(0,0,0,0.35)', tab:'rgba(230,230,250,0.2)', slider:'rgba(230,230,250,0.2)', gradStart:'#2e2e3a', gradEnd:'#1e1e2a' },
  synthwave: { bg:'#1a1a3e', text:'#ff6ec7', accent:'#ff6ec7', subtitle:'#b04a80', panel:'rgba(0,0,0,0.4)', tab:'rgba(255,110,199,0.2)', slider:'rgba(255,110,199,0.2)', gradStart:'#1a1a3e', gradEnd:'#0f0f2a' }
};

function applyTheme(name) {
  const t = themeConfigs[name];
  const root = document.documentElement;
  root.style.setProperty('--bg', t.bg);
  root.style.setProperty('--text', t.text);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--subtitle', t.subtitle);
  root.style.setProperty('--panel', t.panel);
  root.style.setProperty('--tab-active', t.tab);
  root.style.setProperty('--slider-track', t.slider);
  root.style.setProperty('--gradient-start', t.gradStart);
  root.style.setProperty('--gradient-end', t.gradEnd);
  state.theme = name;
  saveState();
  if (state.particlesEnabled) createParticles();
}

function updateSliderDisplay(id, value) {
  const container = document.querySelector(`[data-id="${id}"]`);
  if (!container) return;
  const valEl = container.querySelector('.val');
  if (valEl) valEl.textContent = value;
}

function updateSliderFill(input) {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const val = parseFloat(input.value);
  const percent = ((val - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(to right, var(--accent) ${percent}%, var(--slider-track) ${percent}%)`;
}

const brightnessSlider = document.querySelector('[data-id="brightness"] input');
brightnessSlider.value = state.brightness;
updateSliderDisplay('brightness', state.brightness);
updateSliderFill(brightnessSlider);
brightnessSlider.addEventListener('input', () => {
  state.brightness = parseInt(brightnessSlider.value, 10);
  updateSliderDisplay('brightness', state.brightness);
  updateSliderFill(brightnessSlider);
  saveState();
  ipcRenderer.send('set-brightness', state.brightness / 100);
});

const contrastSlider = document.querySelector('[data-id="contrast"] input');
contrastSlider.value = state.contrast;
updateSliderDisplay('contrast', state.contrast);
updateSliderFill(contrastSlider);
contrastSlider.addEventListener('input', () => {
  state.contrast = parseInt(contrastSlider.value, 10);
  updateSliderDisplay('contrast', state.contrast);
  updateSliderFill(contrastSlider);
  saveState();
  ipcRenderer.send('set-contrast', state.contrast / 100);
});

const gammaSlider = document.querySelector('[data-id="gamma"] input');
gammaSlider.value = state.gamma;
updateSliderDisplay('gamma', (state.gamma / 100).toFixed(1));
updateSliderFill(gammaSlider);
gammaSlider.addEventListener('input', () => {
  state.gamma = parseInt(gammaSlider.value, 10);
  updateSliderDisplay('gamma', (state.gamma / 100).toFixed(1));
  updateSliderFill(gammaSlider);
  saveState();
  ipcRenderer.send('set-gamma', state.gamma / 100);
});

const vibrancySlider = document.querySelector('[data-id="vibrancy"] input');
vibrancySlider.value = state.vibrancy;
updateSliderDisplay('vibrancy', state.vibrancy);
updateSliderFill(vibrancySlider);
vibrancySlider.addEventListener('input', () => {
  state.vibrancy = parseInt(vibrancySlider.value, 10);
  updateSliderDisplay('vibrancy', state.vibrancy);
  updateSliderFill(vibrancySlider);
  saveState();
  ipcRenderer.send('set-vibrancy', state.vibrancy / 100);
});

const saturationSlider = document.querySelector('[data-id="saturation"] input');
saturationSlider.value = state.saturation;
updateSliderDisplay('saturation', state.saturation);
updateSliderFill(saturationSlider);
saturationSlider.addEventListener('input', () => {
  state.saturation = parseInt(saturationSlider.value, 10);
  updateSliderDisplay('saturation', state.saturation);
  updateSliderFill(saturationSlider);
  saveState();
  ipcRenderer.send('set-saturation', state.saturation / 100);
});

const darknessSlider = document.querySelector('[data-id="darknessBoost"] input');
darknessSlider.value = state.darknessBoost;
updateSliderDisplay('darknessBoost', state.darknessBoost);
updateSliderFill(darknessSlider);
darknessSlider.addEventListener('input', () => {
  state.darknessBoost = parseInt(darknessSlider.value, 10);
  updateSliderDisplay('darknessBoost', state.darknessBoost);
  updateSliderFill(darknessSlider);
  saveState();
  ipcRenderer.send('set-darkness', state.darknessBoost / 100);
});

const volumeSlider = document.querySelector('[data-id="volume"] input');
volumeSlider.value = state.volume;
updateSliderDisplay('volume', state.volume);
updateSliderFill(volumeSlider);
volumeSlider.addEventListener('input', () => {
  state.volume = parseInt(volumeSlider.value, 10);
  updateSliderDisplay('volume', state.volume);
  updateSliderFill(volumeSlider);
  gainNode.gain.value = state.volume / 100;
  saveState();
});

const cancelDarkToggle = document.querySelector('[data-id="cancelDarkness"]');
if (state.cancelDarkness) cancelDarkToggle.querySelector('.switch').classList.add('on');
cancelDarkToggle.addEventListener('click', () => {
  const sw = cancelDarkToggle.querySelector('.switch');
  sw.classList.toggle('on');
  state.cancelDarkness = sw.classList.contains('on');
  document.querySelector('[data-id="darknessBoost"]').style.display = state.cancelDarkness ? 'block' : 'none';
  saveState();
  ipcRenderer.send('set-darkness', state.cancelDarkness ? state.darknessBoost / 100 : 0);
  playSound('toggle');
});

const soundToggle = document.querySelector('[data-id="soundEnabled"]');
if (state.soundEnabled) soundToggle.querySelector('.switch').classList.add('on');
soundToggle.addEventListener('click', () => {
  const sw = soundToggle.querySelector('.switch');
  sw.classList.toggle('on');
  state.soundEnabled = sw.classList.contains('on');
  saveState();
  playSound('toggle');
});

const particlesToggle = document.querySelector('[data-id="particlesEnabled"]');
if (state.particlesEnabled) particlesToggle.querySelector('.switch').classList.add('on');
particlesToggle.addEventListener('click', () => {
  const sw = particlesToggle.querySelector('.switch');
  sw.classList.toggle('on');
  state.particlesEnabled = sw.classList.contains('on');
  saveState();
  createParticles();
  playSound('toggle');
});

const screenshareToggle = document.querySelector('[data-id="screenshareMode"]');
if (state.screenshareMode) screenshareToggle.querySelector('.switch').classList.add('on');
screenshareToggle.addEventListener('click', () => {
  const sw = screenshareToggle.querySelector('.switch');
  sw.classList.toggle('on');
  state.screenshareMode = sw.classList.contains('on');
  saveState();
  ipcRenderer.send('set-screenshare', state.screenshareMode);
  playSound('toggle');
});

const gpuVendorDisplay = document.getElementById('gpuVendorDisplay');
if (gpuVendorDisplay) {
  ipcRenderer.invoke('get-gpu-vendor').then((vendor) => {
    gpuVendorDisplay.textContent = `GPU: ${vendor}`;
  }).catch(() => {
    gpuVendorDisplay.textContent = 'GPU: Unknown';
  });
}

const presetList = document.getElementById('preset-list');
const presetNameInput = document.getElementById('presetName');
const savePresetBtn = document.getElementById('savePresetBtn');

function renderPresets() {
  presetList.innerHTML = '';
  state.presets.forEach((preset, index) => {
    const item = document.createElement('div');
    item.className = 'preset-item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = preset.name;
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadPreset(index));
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deletePreset(index));
    item.appendChild(nameSpan);
    item.appendChild(loadBtn);
    item.appendChild(deleteBtn);
    presetList.appendChild(item);
  });
}

function loadPreset(index) {
  const preset = state.presets[index];
  if (!preset) return;
  const settings = preset.settings;
  state.brightness = settings.brightness;
  state.contrast = settings.contrast;
  state.gamma = settings.gamma;
  state.vibrancy = settings.vibrancy;
  state.saturation = settings.saturation;
  state.cancelDarkness = settings.cancelDarkness;
  state.darknessBoost = settings.darknessBoost;
  state.volume = settings.volume;
  state.soundEnabled = settings.soundEnabled;
  state.particlesEnabled = settings.particlesEnabled;
  state.screenshareMode = settings.screenshareMode;
  state.theme = settings.theme;
  syncUIFromState();
  saveState();
  playSound('click');
}

function deletePreset(index) {
  state.presets.splice(index, 1);
  saveState();
  renderPresets();
}

savePresetBtn.addEventListener('click', () => {
  const name = presetNameInput.value.trim();
  if (!name) return;
  const settings = {
    brightness: state.brightness,
    contrast: state.contrast,
    gamma: state.gamma,
    vibrancy: state.vibrancy,
    saturation: state.saturation,
    cancelDarkness: state.cancelDarkness,
    darknessBoost: state.darknessBoost,
    volume: state.volume,
    soundEnabled: state.soundEnabled,
    particlesEnabled: state.particlesEnabled,
    screenshareMode: state.screenshareMode,
    theme: state.theme
  };
  state.presets.push({ name, settings });
  presetNameInput.value = '';
  saveState();
  renderPresets();
  playSound('click');
});

function syncUIFromState() {
  brightnessSlider.value = state.brightness;
  updateSliderDisplay('brightness', state.brightness);
  updateSliderFill(brightnessSlider);
  ipcRenderer.send('set-brightness', state.brightness / 100);

  contrastSlider.value = state.contrast;
  updateSliderDisplay('contrast', state.contrast);
  updateSliderFill(contrastSlider);
  ipcRenderer.send('set-contrast', state.contrast / 100);

  gammaSlider.value = state.gamma;
  updateSliderDisplay('gamma', (state.gamma / 100).toFixed(1));
  updateSliderFill(gammaSlider);
  ipcRenderer.send('set-gamma', state.gamma / 100);

  vibrancySlider.value = state.vibrancy;
  updateSliderDisplay('vibrancy', state.vibrancy);
  updateSliderFill(vibrancySlider);
  ipcRenderer.send('set-vibrancy', state.vibrancy / 100);

  saturationSlider.value = state.saturation;
  updateSliderDisplay('saturation', state.saturation);
  updateSliderFill(saturationSlider);
  ipcRenderer.send('set-saturation', state.saturation / 100);

  darknessSlider.value = state.darknessBoost;
  updateSliderDisplay('darknessBoost', state.darknessBoost);
  updateSliderFill(darknessSlider);
  ipcRenderer.send('set-darkness', state.cancelDarkness ? state.darknessBoost / 100 : 0);

  volumeSlider.value = state.volume;
  updateSliderDisplay('volume', state.volume);
  updateSliderFill(volumeSlider);
  gainNode.gain.value = state.volume / 100;

  const cancelSwitch = cancelDarkToggle.querySelector('.switch');
  if (state.cancelDarkness) cancelSwitch.classList.add('on');
  else cancelSwitch.classList.remove('on');
  document.querySelector('[data-id="darknessBoost"]').style.display = state.cancelDarkness ? 'block' : 'none';

  const soundSwitch = soundToggle.querySelector('.switch');
  if (state.soundEnabled) soundSwitch.classList.add('on');
  else soundSwitch.classList.remove('on');

  const particlesSwitch = particlesToggle.querySelector('.switch');
  if (state.particlesEnabled) particlesSwitch.classList.add('on');
  else particlesSwitch.classList.remove('on');

  const screenshareSwitch = screenshareToggle.querySelector('.switch');
  if (state.screenshareMode) screenshareSwitch.classList.add('on');
  else screenshareSwitch.classList.remove('on');

  themeSelect.value = state.theme;
  applyTheme(state.theme);
  renderPresets();
}

document.querySelectorAll('.slider-container input[type=range]').forEach(input => {
  input.addEventListener('pointerdown', () => input.closest('.slider-container').classList.add('dragging'));
  input.addEventListener('pointerup', () => input.closest('.slider-container').classList.remove('dragging'));
  input.addEventListener('input', () => playSound('slider'));
});

document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    homeTab.style.display = tab === 'home' ? 'block' : 'none';
    settingsTab.style.display = tab === 'settings' ? 'block' : 'none';
    playSound('click');
  });
});

themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

document.getElementById('resetBtn').addEventListener('click', () => {
  state.brightness = 100; state.contrast = 100; state.gamma = 100; state.vibrancy = 100; state.saturation = 100;
  state.cancelDarkness = false; state.darknessBoost = 0;
  syncUIFromState();
  saveState();
  ipcRenderer.send('set-darkness', 0);
  playSound('reset');
});

document.getElementById('resetSettingsBtn').addEventListener('click', () => {
  state.volume = 80; state.soundEnabled = true; state.particlesEnabled = true; state.screenshareMode = false;
  state.theme = 'ocean';
  syncUIFromState();
  saveState();
  createParticles();
  playSound('reset');
});

document.getElementById('min-btn').addEventListener('click', () => ipcRenderer.send('window-minimize'));
document.getElementById('hide-btn').addEventListener('click', () => ipcRenderer.send('window-hide'));
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('window-close'));

let lastTime = performance.now();
function fpsLoop() {
  const now = performance.now();
  fpsEl.textContent = `FPS: ${Math.round(1000 / (now - lastTime))}`;
  lastTime = now;
  requestAnimationFrame(fpsLoop);
}

function initUI() {
  if (state.cancelDarkness) {
    document.querySelector('[data-id="darknessBoost"]').style.display = 'block';
  } else {
    document.querySelector('[data-id="darknessBoost"]').style.display = 'none';
  }
  resizeCanvas();
  particleLoop();
  fpsLoop();
  syncUIFromState();
}

initUI();