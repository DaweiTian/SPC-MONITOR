// Splash → Main window transition logic
// Dual mechanism: Tauri event listener + HTTP health poll fallback
window.addEventListener('DOMContentLoaded', async () => {
  let backendReady = false;
  const statusEl = document.querySelector('.text');
  const subEl = document.querySelector('.sub');

  function log(msg) {
    console.log('[Splash] ' + msg);
    if (subEl) subEl.textContent = msg;
  }

  async function transitionToMain() {
    if (backendReady) return;
    backendReady = true;
    log('后端就绪，正在切换到主窗口...');

    // Check if Tauri API is available
    if (!window.__TAURI__) {
      log('错误: Tauri API 不可用 (withGlobalTauri 未启用)');
      backendReady = false;
      return;
    }

    try {
      const Window = window.__TAURI__.window.Window;
      const mainWindow = Window.getByLabel('main');
      if (mainWindow) {
        await mainWindow.show();
        await mainWindow.setFocus();
        log('主窗口已显示');
      } else {
        log('错误: 找不到 main 窗口');
      }
      const splashWindow = Window.getCurrent();
      await splashWindow.close();
    } catch (e) {
      console.error('[Splash] Window transition failed:', e);
      log('窗口切换失败: ' + e.message);
      backendReady = false;
    }
  }

  log('等待后端服务启动...');

  // Mechanism 1: Tauri event (preferred)
  try {
    if (window.__TAURI__ && window.__TAURI__.event) {
      await window.__TAURI__.event.listen('backend-ready', () => {
        log('收到 backend-ready 事件');
        transitionToMain();
      });
      log('Tauri 事件监听已注册');
    } else {
      log('Tauri 事件 API 不可用，仅使用轮询');
    }
  } catch (e) {
    console.warn('[Splash] Tauri event listen failed:', e);
    log('事件监听失败: ' + e.message);
  }

  // Mechanism 2: HTTP health poll fallback (always registered)
  let pollCount = 0;
  const pollInterval = setInterval(async () => {
    if (backendReady) { clearInterval(pollInterval); return; }
    pollCount++;
    try {
      const resp = await fetch('http://127.0.0.1:18080/api/health');
      if (resp.ok) {
        log('健康检查通过 (第' + pollCount + '次)，准备切换...');
        clearInterval(pollInterval);
        await transitionToMain();
      }
    } catch (e) {
      if (pollCount <= 3) {
        log('轮询中... (' + pollCount + ') ' + e.message);
      }
    }
  }, 2000);

  // Timeout after 30 seconds
  setTimeout(async () => {
    if (!backendReady) {
      clearInterval(pollInterval);
      if (statusEl) statusEl.textContent = '后端启动超时';
      if (subEl) {
        subEl.textContent = '请检查后端服务是否正常，右键托盘图标重试';
        subEl.style.color = '#ff6b6b';
      }
      const barWrap = document.querySelector('.bar-wrap');
      if (barWrap) barWrap.style.display = 'none';
    }
  }, 30000);
});
