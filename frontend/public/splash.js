// Splash → Main window transition logic
// Listens for the "backend-ready" event emitted by the Rust backend (lib.rs)
// when the health check passes, then shows the main window and closes the splash.
window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Tauri v2 injects window.__TAURI__ automatically
    const { listen } = window.__TAURI__.event;
    const { Window } = window.__TAURI__.window;

    await listen('backend-ready', async () => {
      try {
        // Show and focus the main window
        const mainWindow = new Window('main');
        await mainWindow.show();
        await mainWindow.setFocus();

        // Close the splash window
        const splashWindow = Window.getCurrent();
        await splashWindow.close();
      } catch (e) {
        console.error('Window transition failed:', e);
      }
    });
  } catch (e) {
    console.error('Failed to setup backend-ready listener:', e);
  }
});
