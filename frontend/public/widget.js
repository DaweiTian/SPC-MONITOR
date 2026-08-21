// Widget: FT1 桌面半透明小组件
// Data fetching, SPC chart, and interaction logic
// CSP-compliant: no inline scripts

(function () {
  'use strict';

  // ── Constants ──
  const REFRESH_INTERVAL = 10000; // 10 seconds
  const SPC_MAX_POINTS = 20;
  const CHART_LINE_COLOR = '#00d4ff';
  const CHART_LIMIT_COLOR = 'rgba(255,100,100,0.5)';
  const CHART_GRID_COLOR = 'rgba(255,255,255,0.04)';
  const CHART_BG = 'transparent';

  // ── State ──
  let cachedData = null;
  let refreshTimer = null;
  let spcPoints = [];
  let spcMean = 0;
  let spcUcl = 0;
  let spcLcl = 0;

  // ── DOM refs ──
  const $ = (id) => document.getElementById(id);
  const valInspections = $('valInspections');
  const valAlerts = $('valAlerts');
  const valCpk = $('valCpk');
  const trendCpk = $('trendCpk');
  const valCv = $('valCv');
  const collectDot = $('collectDot');
  const collectStatus = $('collectStatus');
  const alertsList = $('alertsList');
  const errorBanner = $('errorBanner');
  const btnClose = $('btnClose');
  const btnSettings = $('btnSettings');
  const settingsPanel = $('settingsPanel');
  const settingsClose = $('settingsClose');
  const opacitySlider = $('opacitySlider');
  const opacityValue = $('opacityValue');
  const spcCanvas = $('spcCanvas');

  // ── Tauri API helpers ──
  async function getTauriInvoke() {
    if (window.__TAURI__ && window.__TAURI__.core) {
      return window.__TAURI__.core.invoke;
    }
    return null;
  }

  async function getTauriWindow() {
    if (window.__TAURI__ && window.__TAURI__.window) {
      return window.__TAURI__.window.Window;
    }
    return null;
  }

  async function getTauriEvent() {
    if (window.__TAURI__ && window.__TAURI__.event) {
      return window.__TAURI__.event;
    }
    return null;
  }

  // ── Data fetching ──
  async function fetchWidgetData() {
    const invoke = await getTauriInvoke();
    if (!invoke) {
      console.warn('Tauri API not available');
      return null;
    }
    try {
      const data = await invoke('get_widget_data');
      cachedData = data;
      hideError();
      return data;
    } catch (err) {
      console.error('Failed to fetch widget data:', err);
      showError();
      return cachedData; // fallback to cached
    }
  }

  // ── UI updates ──
  function updateUI(data) {
    if (!data) return;

    // Today inspections
    const inspections = data.today_inspections ?? data.total_inspections ?? data.inspections ?? '--';
    valInspections.textContent = typeof inspections === 'number' ? inspections.toLocaleString() : inspections;

    // Alert count
    const alertCount = data.alert_count ?? data.alerts_count ?? data.warning_count ?? 0;
    valAlerts.textContent = alertCount;
    valAlerts.className = 'card-value' + (alertCount > 0 ? ' warn' : '');

    // Cpk
    const cpk = data.avg_cpk ?? data.cpk ?? data.average_cpk;
    if (cpk !== undefined && cpk !== null) {
      valCpk.textContent = typeof cpk === 'number' ? cpk.toFixed(2) : cpk;
      // Trend arrow
      const cpkTrend = data.cpk_trend ?? data.cpk_change ?? 0;
      trendCpk.replaceChildren();
      const trendSpan = document.createElement('span');
      if (cpkTrend > 0) {
        trendSpan.className = 'trend-up';
        trendSpan.textContent = '▲ +' + cpkTrend.toFixed(2);
      } else if (cpkTrend < 0) {
        trendSpan.className = 'trend-down';
        trendSpan.textContent = '▼ ' + cpkTrend.toFixed(2);
      } else {
        trendSpan.className = 'trend-flat';
        trendSpan.textContent = '▬';
      }
      trendCpk.appendChild(trendSpan);
    } else {
      valCpk.textContent = '--';
      trendCpk.replaceChildren();
    }

    // CV%
    const cv = data.cv_percent ?? data.cv ?? data.coefficient_variation;
    valCv.textContent = cv !== undefined && cv !== null
      ? (typeof cv === 'number' ? cv.toFixed(1) + '%' : cv)
      : '--';

    // Collection status
    const isCollecting = data.collecting ?? data.is_collecting ?? data.collection_active ?? false;
    collectDot.className = 'status-dot ' + (isCollecting ? 'ok' : 'err');
    collectStatus.textContent = isCollecting ? '采集中' : '已停止';

    // Recent alerts
    const alerts = data.recent_alerts ?? data.alerts ?? data.latest_alerts ?? [];
    renderAlerts(alerts);

    // SPC data
    const points = data.spc_points ?? data.control_chart ?? data.spc_data ?? [];
    spcMean = data.spc_mean ?? data.cl ?? data.center_line ?? 0;
    spcUcl = data.spc_ucl ?? data.ucl ?? (spcMean + 3);
    spcLcl = data.spc_lcl ?? data.lcl ?? (spcMean - 3);

    if (Array.isArray(points) && points.length > 0) {
      // points can be array of numbers or array of {value: ...}
      spcPoints = points.slice(-SPC_MAX_POINTS).map(function (p) {
        return typeof p === 'object' && p !== null ? (p.value ?? p.v ?? 0) : p;
      });
    }
    drawSpcChart();
  }

  function renderAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
      alertsList.replaceChildren();
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'alert-empty';
      emptyDiv.textContent = '暂无预警';
      alertsList.appendChild(emptyDiv);
      return;
    }

    var recent = alerts.slice(0, 3);
    var html = '';
    recent.forEach(function (alert) {
      var level = (alert.level ?? alert.severity ?? alert.type ?? 'info').toLowerCase();
      var dotClass = 'info';
      if (level === 'critical' || level === 'error' || level === '严重') dotClass = 'critical';
      else if (level === 'warning' || level === 'warn' || level === '警告') dotClass = 'warning';

      var message = alert.message ?? alert.msg ?? alert.text ?? alert.description ?? '';
      var time = alert.time ?? alert.timestamp ?? alert.created_at ?? '';
      if (time && typeof time === 'string' && time.length > 5) {
        // Extract HH:MM
        time = time.length >= 16 ? time.substring(11, 16) : time.substring(0, 5);
      }

      var escapedMsg = escapeHtml(String(message));
      html += '<div class="alert-item">' +
        '<span class="alert-dot ' + dotClass + '"></span>' +
        '<span class="alert-text" title="' + escapedMsg + '">' + escapedMsg + '</span>' +
        '<span class="alert-time">' + escapeHtml(String(time)) + '</span>' +
        '</div>';
    });
    alertsList.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── SPC Mini Chart ──
  function drawSpcChart() {
    var canvas = spcCanvas;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = rect.width - 16; // account for padding
    var h = 110;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (spcPoints.length === 0) {
      ctx.fillStyle = '#4a5568';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', w / 2, h / 2);
      return;
    }

    var padding = { top: 10, right: 10, bottom: 16, left: 10 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;

    // Compute Y range from UCL/LCL and data
    var allVals = spcPoints.concat([spcUcl, spcLcl, spcMean]);
    var yMin = Math.min.apply(null, allVals);
    var yMax = Math.max.apply(null, allVals);
    var yPad = (yMax - yMin) * 0.15 || 1;
    yMin -= yPad;
    yMax += yPad;

    function toX(i) {
      return padding.left + (i / Math.max(spcPoints.length - 1, 1)) * chartW;
    }
    function toY(v) {
      return padding.top + (1 - (v - yMin) / (yMax - yMin)) * chartH;
    }

    // Grid lines (subtle)
    ctx.strokeStyle = CHART_GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (var g = 0; g < 4; g++) {
      var gy = padding.top + (g / 3) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(padding.left + chartW, gy);
      ctx.stroke();
    }

    // CL (center line)
    ctx.strokeStyle = 'rgba(0,212,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(spcMean));
    ctx.lineTo(padding.left + chartW, toY(spcMean));
    ctx.stroke();

    // UCL
    ctx.strokeStyle = CHART_LIMIT_COLOR;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(spcUcl));
    ctx.lineTo(padding.left + chartW, toY(spcUcl));
    ctx.stroke();

    // LCL
    ctx.beginPath();
    ctx.moveTo(padding.left, toY(spcLcl));
    ctx.lineTo(padding.left + chartW, toY(spcLcl));
    ctx.stroke();
    ctx.setLineDash([]);

    // Data line
    ctx.strokeStyle = CHART_LINE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < spcPoints.length; i++) {
      var px = toX(i);
      var py = toY(spcPoints[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Data points
    for (var j = 0; j < spcPoints.length; j++) {
      var dx = toX(j);
      var dy = toY(spcPoints[j]);
      // Highlight out-of-control points
      var isOOC = spcPoints[j] > spcUcl || spcPoints[j] < spcLcl;
      ctx.fillStyle = isOOC ? '#ff6b6b' : CHART_LINE_COLOR;
      ctx.beginPath();
      ctx.arc(dx, dy, isOOC ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Labels (UCL/CL/LCL) on right
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,100,100,0.5)';
    ctx.fillText('UCL', padding.left + chartW, toY(spcUcl) - 3);
    ctx.fillStyle = 'rgba(0,212,255,0.4)';
    ctx.fillText('CL', padding.left + chartW, toY(spcMean) - 3);
    ctx.fillStyle = 'rgba(255,100,100,0.5)';
    var lclY = toY(spcLcl);
    ctx.fillText('LCL', padding.left + chartW, lclY + 10 > h - 2 ? lclY - 3 : lclY + 10);
  }

  // ── Error handling ──
  function showError() {
    errorBanner.classList.add('show');
  }
  function hideError() {
    errorBanner.classList.remove('show');
  }

  // ── Refresh loop ──
  async function refresh() {
    var data = await fetchWidgetData();
    updateUI(data);
  }

  function startRefresh() {
    refresh(); // immediate first fetch
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  // ── Interactions ──

  // Close button: hide widget window
  async function handleClose() {
    try {
      var Window = await getTauriWindow();
      if (Window) {
        var current = Window.getCurrent();
        await current.hide();
      }
    } catch (e) {
      console.error('Failed to hide widget:', e);
    }
  }

  // Double-click: show main window
  async function handleDoubleClick() {
    try {
      var Window = await getTauriWindow();
      if (Window) {
        var main = new Window('main');
        await main.show();
        await main.setFocus();
      }
    } catch (e) {
      console.error('Failed to show main window:', e);
    }
  }

  // Settings panel
  function openSettings() {
    settingsPanel.classList.add('open');
  }
  function closeSettings() {
    settingsPanel.classList.remove('open');
  }

  // Opacity slider
  async function handleOpacityChange(value) {
    var clamped = Math.max(0.1, Math.min(1.0, value / 100));
    opacityValue.textContent = value + '%';
    try {
      var invoke = await getTauriInvoke();
      if (invoke) {
        await invoke('set_window_opacity', { opacity: clamped });
      }
    } catch (e) {
      console.error('Failed to set opacity:', e);
    }
  }

  // ── Listen for tray toggle-widget event ──
  async function setupEventListeners() {
    try {
      var eventApi = await getTauriEvent();
      if (eventApi && eventApi.listen) {
        await eventApi.listen('toggle-widget', async function () {
          var Window = await getTauriWindow();
          if (Window) {
            var current = Window.getCurrent();
            if (await current.isVisible()) {
              await current.hide();
            } else {
              await current.show();
              await current.setFocus();
            }
          }
        });
      }
    } catch (e) {
      console.warn('Could not listen for toggle-widget event:', e);
    }
  }

  // ── Resize handling for SPC chart ──
  function handleResize() {
    drawSpcChart();
  }

  // ── Init ──
  window.addEventListener('DOMContentLoaded', function () {
    // Bind events
    btnClose.addEventListener('click', handleClose);
    btnSettings.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    opacitySlider.addEventListener('input', function () {
      handleOpacityChange(parseInt(this.value, 10));
    });

    // Double-click on body to show main window
    document.body.addEventListener('dblclick', handleDoubleClick);

    // Window resize
    window.addEventListener('resize', handleResize);

    // Start data refresh
    startRefresh();

    // Setup Tauri event listeners
    setupEventListeners();

    // Initial SPC chart draw
    drawSpcChart();
  });

  // Cleanup
  window.addEventListener('beforeunload', function () {
    stopRefresh();
  });
})();
