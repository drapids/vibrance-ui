const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const koffi = require('koffi');
const path = require('path');

app.setName('BDL');
app.setAppUserModelId('com.bdl.bdl-lighting');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=64');

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');
const GetDC = user32.func('__stdcall', 'GetDC', 'void*', ['void*']);
const ReleaseDC = user32.func('__stdcall', 'ReleaseDC', 'int32', ['void*', 'void*']);
const SetDeviceGammaRamp = gdi32.func('__stdcall', 'SetDeviceGammaRamp', 'int32', ['void*', 'void*']);
const GetDesktopWindow = user32.func('__stdcall', 'GetDesktopWindow', 'void*', []);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let hdc = null;

let magInitialized = false;
let magSetFullscreenColorEffect = null;
let magSetFullscreenTransform = null;
let magUninit = null;

let curBrightness = 1.0;
let curContrast = 1.0;
let curGamma = 1.0;
let curVibrancy = 1.0;
let curSaturation = 1.0;
let curShadow = 0.0;
let screenshareMode = false;

function initMagnification() {
  try {
    const mag = koffi.load('Magnification.dll');
    const magInit = mag.func('__stdcall', 'MagInitialize', 'bool', []);
    const magSetTransform = mag.func('__stdcall', 'MagSetFullscreenTransform', 'bool', ['float', 'int', 'int']);
    const magSetColor = mag.func('__stdcall', 'MagSetFullscreenColorEffect', 'bool', ['void*']);
    const magUninitFunc = mag.func('__stdcall', 'MagUninitialize', 'bool', []);

    if (!magInit()) return false;
    magSetTransform(1.0, 0, 0);
    magSetFullscreenColorEffect = magSetColor;
    magSetFullscreenTransform = magSetTransform;
    magUninit = magUninitFunc;
    magInitialized = true;
    return true;
  } catch (e) {
    console.error('[MAG] Init error:', e);
    return false;
  }
}

const Lr = 0.2126, Lg = 0.7152, Lb = 0.0722;

function rowMajorToColumnMajor(m) {
  const out = new Float32Array(25);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      out[c * 5 + r] = m[r][c];
    }
  }
  return out;
}

function multiplyMatrices(A, B) {
  const result = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      for (let k = 0; k < 5; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

function identityMatrix() {
  return [
    [1,0,0,0,0],
    [0,1,0,0,0],
    [0,0,1,0,0],
    [0,0,0,1,0],
    [0,0,0,0,1]
  ];
}

function saturationMatrix(strength) {
  const s = strength;
  const inv = 1 - s;
  return [
    [Lr * inv + s,  Lg * inv,      Lb * inv,      0, 0],
    [Lr * inv,      Lg * inv + s,  Lb * inv,      0, 0],
    [Lr * inv,      Lg * inv,      Lb * inv + s,  0, 0],
    [0,             0,             0,             1, 0],
    [0,             0,             0,             0, 1]
  ];
}

function vibrancyMatrix(strength) {
  const s = strength;
  const inv = 1 - s;
  const lift = (s - 1) * 0.08;
  return [
    [Lr * inv + s + lift,  Lg * inv + lift,       Lb * inv + lift,       0, 0],
    [Lr * inv + lift,      Lg * inv + s + lift,   Lb * inv + lift,       0, 0],
    [Lr * inv + lift,      Lg * inv + lift,       Lb * inv + s + lift,   0, 0],
    [0,                    0,                     0,                     1, 0],
    [0,                    0,                     0,                     0, 1]
  ];
}

function brightnessContrastMatrix(brightness, contrast) {
  const offset = 0.5 * (1 - contrast) * brightness;
  const scale = contrast * brightness;
  return [
    [scale, 0, 0, 0, offset],
    [0, scale, 0, 0, offset],
    [0, 0, scale, 0, offset],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1]
  ];
}

function applyMagnificationEffects(includeBrightnessContrast) {
  if (!magInitialized || !magSetFullscreenColorEffect) return;
  let matrix = identityMatrix();
  matrix = multiplyMatrices(matrix, saturationMatrix(curSaturation));
  matrix = multiplyMatrices(matrix, vibrancyMatrix(curVibrancy));
  if (includeBrightnessContrast) {
    matrix = multiplyMatrices(matrix, brightnessContrastMatrix(curBrightness, curContrast));
  }
  const colMajor = rowMajorToColumnMajor(matrix);
  magSetFullscreenColorEffect(Buffer.from(colMajor.buffer));
}

function applyGammaRamp(includeBrightnessContrast) {
  const brightness = includeBrightnessContrast ? curBrightness : 1.0;
  const contrast = includeBrightnessContrast ? curContrast : 1.0;
  const gammaVal = curGamma;
  const shadow = curShadow;

  const ramp = new Array(768);
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    v = Math.pow(v, 1 / gammaVal);
    v = (v - 0.5) * contrast + 0.5;
    v *= brightness;
    if (shadow > 0) {
      v += shadow * 0.9 * (1 - v) * (1 - v);
    }
    v = Math.min(Math.max(v, 0), 1);
    const out = Math.round(v * 65535);
    ramp[i] = out;
    ramp[256 + i] = out;
    ramp[512 + i] = out;
  }

  const buf = Buffer.alloc(3 * 256 * 2);
  for (let i = 0; i < 256; i++) {
    buf.writeUInt16LE(ramp[i], i * 2);
    buf.writeUInt16LE(ramp[256 + i], (256 + i) * 2);
    buf.writeUInt16LE(ramp[512 + i], (512 + i) * 2);
  }
  SetDeviceGammaRamp(getHDC(), buf);
}

function reapplyEffects() {
  if (screenshareMode) {
    applyMagnificationEffects(false); // vibrancy/saturation only (visible)
    applyGammaRamp(true);             // brightness/contrast/gamma/darkness (local)
  } else {
    applyMagnificationEffects(true);  // everything visible
    applyGammaRamp(false);            // gamma/darkness only (local)
  }
}

function setBrightness(strength) { curBrightness = strength; reapplyEffects(); }
function setContrast(strength) { curContrast = strength; reapplyEffects(); }
function setGamma(strength) { curGamma = strength; reapplyEffects(); }
function setVibrancy(strength) { curVibrancy = strength; reapplyEffects(); }
function setSaturation(strength) { curSaturation = strength; reapplyEffects(); }
function setDarkness(strength) { curShadow = strength; reapplyEffects(); }
function setScreenshareMode(enabled) { screenshareMode = enabled; reapplyEffects(); }

function resetToLinear() {
  const ramp = new Array(768);
  for (let i = 0; i < 256; i++) {
    const val = (i << 8) & 0xFFFF;
    ramp[i] = val;
    ramp[256 + i] = val;
    ramp[512 + i] = val;
  }
  applyRamp(ramp);
  if (magInitialized && magSetFullscreenColorEffect) {
    const identity = rowMajorToColumnMajor(identityMatrix());
    magSetFullscreenColorEffect(Buffer.from(identity.buffer));
  }
}

function applyRamp(rampArray) {
  const buf = Buffer.alloc(3 * 256 * 2);
  for (let i = 0; i < 256; i++) {
    buf.writeUInt16LE(rampArray[i], i * 2);
    buf.writeUInt16LE(rampArray[256 + i], (256 + i) * 2);
    buf.writeUInt16LE(rampArray[512 + i], (512 + i) * 2);
  }
  SetDeviceGammaRamp(getHDC(), buf);
}

function getHDC() {
  if (!hdc) hdc = GetDC(GetDesktopWindow());
  return hdc;
}

function createTrayIcon() {
  try {
    const fallbackDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    let icon = nativeImage.createFromDataURL(fallbackDataUrl);
    tray = new Tray(icon);
    tray.setToolTip('BDL');
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show BDL', click: () => mainWindow.show() },
      { label: 'Hide BDL', click: () => mainWindow.hide() },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    });
  } catch (e) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 600,
    resizable: true,
    center: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: true,
    title: 'BDL - le geeked hippo',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    resetToLinear();
    if (magInitialized && magUninit) magUninit();
    if (hdc) ReleaseDC(null, hdc);
    hdc = null;
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initMagnification();
  reapplyEffects();
  createWindow();
  createTrayIcon();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    resetToLinear();
    if (magInitialized && magUninit) magUninit();
    app.quit();
  }
});

ipcMain.on('set-brightness', (_, strength) => setBrightness(strength));
ipcMain.on('set-contrast', (_, strength) => setContrast(strength));
ipcMain.on('set-gamma', (_, strength) => setGamma(strength));
ipcMain.on('set-vibrancy', (_, strength) => setVibrancy(strength));
ipcMain.on('set-saturation', (_, strength) => setSaturation(strength));
ipcMain.on('set-darkness', (_, strength) => setDarkness(strength));
ipcMain.on('set-screenshare', (_, enabled) => setScreenshareMode(enabled));

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-hide', () => mainWindow.hide());
ipcMain.on('window-close', () => { isQuitting = true; app.quit(); });