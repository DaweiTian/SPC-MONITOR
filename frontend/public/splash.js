// Splash → Main window transition logic
// Dual mechanism: Tauri event listener + HTTP health poll fallback
window.addEventListener('DOMContentLoaded', async () => {
  let backendReady = false;

  async function transitionToMain() {
    if (backendReady) return;
    backendReady = true;
    try {
      const mainWindow = window.__TAURI__.window.Window.getByLabel('main');
      if (mainWindow) {
        await mainWindow.show();
        await mainWindow.setFocus();
      }
      const splashWindow = window.__TAURI__.window.Window.getCurrent();
      await splashWindow.close();
    } catch (e) {
      console.error('Window transition failed:', e);
    }
  }

  // Mechanism 1: Tauri event (preferred)
  try {
    if (window.__TAURI__ && window.__TAURI__.event) {
      await window.__TAURI__.event.listen('backend-ready', transitionToMain);
    }
  } catch (e) {
    console.warn('Tauri event listen failed:', e);
  }

  // Mechanism 2: HTTP health poll fallback (always registered)
  const pollInterval = setInterval(async () => {
    if (backendReady) { clearInterval(pollInterval); return; }
    try {
      const resp = await fetch('http://127.0.0.1:18080/api/health');
      if (resp.ok) {
        clearInterval(pollInterval);
        await transitionToMain();
      }
    } catch (e) { /* backend not ready yet */ }
  }, 2000);

  // Timeout after 30 seconds
  setTimeout(async () => {
    if (!backendReady) {
      clearInterval(pollInterval);
      const textEl = document.querySelector('.text');
      const subEl = document.querySelector('.sub');
      if (textEl) textEl.textContent = '后端启动超时';
      if (subEl) {
        subEl.textContent = '请检查后端服务是否正常，右键托盘图标重试';
        subEl.style.color = '#ff6b6b';
      }
      const barWrap = document.querySelector('.bar-wrap');
      if (barWrap) barWrap.style.display = 'none';
    }
  }, 30000);
});
