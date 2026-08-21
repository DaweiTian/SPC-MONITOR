// Splash → Main window transition logic
// Listens for the "backend-ready" event emitted by the Rust backend (lib.rs)
// when the health check passes, then shows the main window and closes the splash.
// Falls back to an error message after 30 seconds if backend never starts.
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Tauri v2 injects window.__TAURI__ automatically
    const { listen } = window.__TAURI__.event;
    const { Window } = window.__TAURI__.window;
    const { invoke } = window.__TAURI__.core;

    let backendReady = false;

    await listen('backend-ready', async () => {
      if (backendReady) return;
      backendReady = true;
      try {
        const mainWindow = new Window('main');
        await mainWindow.show();
        await mainWindow.setFocus();
        const splashWindow = Window.getCurrent();
        await splashWindow.close();
      } catch (e) {
        console.error('Window transition failed:', e);
      }
    });

    // Timeout after 30 seconds
    setTimeout(async () => {
      if (!backendReady) {
        const textEl = document.querySelector('.text');
        const subEl = document.querySelector('.sub');
        if (textEl) textEl.textContent = '后端启动超时';
        if (subEl) {
          subEl.textContent = '请检查后端服务是否正常，右键托盘图标重试';
          subEl.style.color = '#ff6b6b';
        }
        // Hide the progress bar
        const barWrap = document.querySelector('.bar-wrap');
        if (barWrap) barWrap.style.display = 'none';
      }
    }, 30000);
  } catch (e) {
    console.error('Failed to setup window transition:', e);
  }
});
