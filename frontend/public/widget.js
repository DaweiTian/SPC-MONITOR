// Widget: FT1 桌面半透明小组件
// Data fetching, SPC chart, dynamic indicator cards, and interaction logic
// CSP-compliant: no inline scripts

(function () {
  'use strict';

  // ── Constants ──
  const REFRESH_INTERVAL = 10000;
  const SPC_MAX_POINTS = 20;
  const CHART_LINE_COLOR = '#00d4ff';
  const CHART_LIMIT_COLOR = 'rgba(255,100,100,0.5)';
  const CHART_GRID_COLOR = 'rgba(255,255,255,0.04)';
  const MAX_SELECTED = 6;

  // ── Indicator Registry ──
  var INDICATORS = [
    {
      id: 'inspections', name: '今日检测', desc: '今日检测总数',
      gradient: 'linear-gradient(90deg, #00d4ff, #3b82f6)',
      color: '#00d4ff',
      extract: function (d) { return d.today_data_count ?? d.today_inspections ?? d.total_inspections; },
      format: function (v) { return typeof v === 'number' ? v.toLocaleString() : String(v); }
    },
    {
      id: 'alerts', name: '预警数', desc: '待处理预警总数',
      gradient: 'linear-gradient(90deg, #ef4444, #f59e0b)',
      color: '#ef4444',
      extract: function (d) {
        var pa = d.pending_alerts;
        if (pa && typeof pa === 'object') return (pa.CRITICAL || 0) + (pa.WARNING || 0);
        return d.alert_count ?? d.alerts_count ?? d.warning_count ?? 0;
      },
      format: function (v) { return String(v); },
      warnIfPositive: true
    },
    {
      id: 'avg_cpk', name: '平均Cpk', desc: '过程能力指数均值',
      gradient: 'linear-gradient(90deg, #10b981, #059669)',
      color: '#10b981',
      extract: function (d) { return d.avg_cpk ?? d.cpk ?? d.average_cpk; },
      format: function (v) { return typeof v === 'number' ? v.toFixed(2) : String(v); }
    },
    {
      id: 'cv', name: '变异系数', desc: 'CV% 变异系数',
      gradient: 'linear-gradient(90deg, #f59e0b, #d97706)',
      color: '#f59e0b',
      extract: function (d) { return d.cv_percent ?? d.cv ?? d.coefficient_variation; },
      format: function (v) { return typeof v === 'number' ? v.toFixed(1) + '%' : String(v); }
    },
    {
      id: 'shift', name: '偏移', desc: '相对目标值偏移',
      gradient: 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
      color: '#8b5cf6',
      extract: function (d) { return d.shift_percent ?? d.deviation ?? d.offset_percent; },
      format: function (v) { return typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : String(v); }
    },
    {
      id: 'unqualified', name: '不合格数', desc: '今日不合格计数',
      gradient: 'linear-gradient(90deg, #ef4444, #dc2626)',
      color: '#ef4444',
      extract: function (d) { return d.today_unqualified_count ?? d.unqualified_count ?? 0; },
      format: function (v) { return typeof v === 'number' ? v.toLocaleString() : String(v); },
      warnIfPositive: true
    },
    {
      id: 'cp', name: '平均Cp', desc: '过程能力指数Cp',
      gradient: 'linear-gradient(90deg, #10b981, #3b82f6)',
      color: '#10b981',
      extract: function (d) { return d.avg_cp; },
      format: function (v) { return typeof v === 'number' ? v.toFixed(2) : String(v); }
    },
    {
      id: 'pp', name: '平均Pp', desc: '过程性能指数Pp',
      gradient: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
      color: '#3b82f6',
      extract: function (d) { return d.avg_pp; },
      format: function (v) { return typeof v === 'number' ? v.toFixed(2) : String(v); }
    },
    {
      id: 'ppk', name: '平均Ppk', desc: '修正性能指数Ppk',
      gradient: 'linear-gradient(90deg, #8b5cf6, #ec4899)',
      color: '#8b5cf6',
      extract: function (d) { return d.avg_ppk; },
      format: function (v) { return typeof v === 'number' ? v.toFixed(2) : String(v); }
    },
    {
      id: 'sigma', name: '西格玛', desc: '西格玛水平',
      gradient: 'linear-gradient(90deg, #00d4ff, #10b981)',
      color: '#00d4ff',
      extract: function (d) { return d.avg_sigma; },
      format: function (v) { return typeof v === 'number' ? v.toFixed(1) + '\u03c3' : String(v); }
    },
    {
      id: 'ppm', name: '缺陷率', desc: '不合格率(PPM)',
      gradient: 'linear-gradient(90deg, #f59e0b, #ef4444)',
      color: '#f59e0b',
      extract: function (d) { return d.avg_ppm; },
      format: function (v) {
        if (typeof v !== 'number') return String(v);
        return v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(1);
      }
    },
    {
      id: 'collect_rate', name: '采集成功率', desc: '今日采集成功率',
      gradient: 'linear-gradient(90deg, #10b981, #00d4ff)',
      color: '#10b981',
      extract: function (d) {
        var attempts = d.today_collect_attempts ?? 0;
        var success = d.today_collect_success ?? 0;
        if (attempts === 0) return null;
        return (success / attempts) * 100;
      },
      format: function (v) { return typeof v === 'number' ? v.toFixed(1) + '%' : String(v); }
    }
  ];

  var DEFAULT_SELECTED = ['inspections', 'alerts', 'avg_cpk', 'cv', 'shift'];

  // ── State ──
  var cachedData = null;
  var refreshTimer = null;
  var spcPoints = [];
  var spcMean = 0;
  var spcUcl = 0;
  var spcLcl = 0;
  var selectedIndicators = [];

  // ── DOM refs ──
  var $ = function (id) { return document.getElementById(id); };
  var cardsRow = null;
  var currentProduct = null;
  var currentIndicator = null;
  var instrumentName = null;
  var collectDot = null;
  var collectStatus = null;
  var alertsList = null;
  var errorBanner = null;
  var btnClose = null;
  var btnSettings = null;
  var settingsPanel = null;
  var settingsClose = null;
  var opacitySlider = null;
  var opacityValue = null;
  var spcCanvas = null;
  var indicatorGrid = null;

  // ── Indicator Selection Management ──
  function loadSelection() {
    try {
      var saved = localStorage.getItem('widget_selected_indicators');
      if (saved) {
        var parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          selectedIndicators = parsed.filter(function (id) {
            return INDICATORS.some(function (ind) { return ind.id === id; });
          }).slice(0, MAX_SELECTED);
          return;
        }
      }
    } catch (e) {}
    selectedIndicators = DEFAULT_SELECTED.slice();
  }

  function saveSelection() {
    try {
      localStorage.setItem('widget_selected_indicators', JSON.stringify(selectedIndicators));
    } catch (e) {}
  }

  function toggleIndicator(id) {
    var idx = selectedIndicators.indexOf(id);
    if (idx >= 0) {
      selectedIndicators.splice(idx, 1);
    } else {
      if (selectedIndicators.length >= MAX_SELECTED) {
        selectedIndicators.shift();
      }
      selectedIndicators.push(id);
    }
    saveSelection();
    renderCards();
    renderSettingsCheckboxes();
    updateUI(cachedData);
  }

  // ── Dynamic Card Rendering ──
  function renderCards() {
    if (!cardsRow) return;
    cardsRow.innerHTML = '';
    var count = selectedIndicators.length;
    cardsRow.style.gridTemplateColumns = 'repeat(' + count + ', 1fr)';

    selectedIndicators.forEach(function (id, i) {
      var ind = INDICATORS.find(function (x) { return x.id === id; });
      if (!ind) return;
      var card = document.createElement('div');
      card.className = 'card';
      card.style.animationDelay = (i * 0.05) + 's';
      card.setAttribute('data-indicator', id);

      var before = document.createElement('style');
      card.appendChild(before);

      var label = document.createElement('div');
      label.className = 'card-label';
      label.textContent = ind.name;

      var value = document.createElement('div');
      value.className = 'card-value';
      value.id = 'val_' + id;
      value.textContent = '--';
      value.style.color = ind.color;

      card.appendChild(label);
      card.appendChild(value);
      cardsRow.appendChild(card);
    });
  }

  // ── Settings Checkboxes ──
  function renderSettingsCheckboxes() {
    if (!indicatorGrid) return;
    indicatorGrid.innerHTML = '';

    INDICATORS.forEach(function (ind) {
      var isSelected = selectedIndicators.indexOf(ind.id) >= 0;
      var item = document.createElement('label');
      item.className = 'indicator-checkbox' + (isSelected ? ' selected' : '');
      if (!isSelected && selectedIndicators.length >= MAX_SELECTED) {
        item.classList.add('disabled');
      }

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = isSelected;
      cb.setAttribute('data-id', ind.id);
      cb.addEventListener('change', function () {
        toggleIndicator(ind.id);
      });

      var nameSpan = document.createElement('span');
      nameSpan.className = 'cb-name';
      nameSpan.textContent = ind.name;

      var descSpan = document.createElement('span');
      descSpan.className = 'cb-desc';
      descSpan.textContent = ind.desc;

      var textWrap = document.createElement('span');
      textWrap.className = 'cb-text';
      textWrap.appendChild(nameSpan);
      textWrap.appendChild(descSpan);

      item.appendChild(cb);
      item.appendChild(textWrap);
      indicatorGrid.appendChild(item);
    });

    var countHint = document.querySelector('.indicator-count-hint');
    if (countHint) {
      countHint.textContent = selectedIndicators.length + '/' + MAX_SELECTED + ' 已选';
    }
  }

  // ── Tauri API helpers ──
  async function getTauriInvoke() {
    if (window.__TAURI__ && window.__TAURI__.core) return window.__TAURI__.core.invoke;
    return null;
  }
  async function getTauriWindow() {
    if (window.__TAURI__ && window.__TAURI__.window) return window.__TAURI__.window.Window;
    return null;
  }
  async function getTauriEvent() {
    if (window.__TAURI__ && window.__TAURI__.event) return window.__TAURI__.event;
    return null;
  }

  // ── Data fetching ──
  async function fetchWidgetData() {
    var invoke = await getTauriInvoke();
    if (!invoke) { console.warn('Tauri API not available'); return null; }
    try {
      var data = await invoke('get_widget_data');
      cachedData = data;
      hideError();
      return data;
    } catch (err) {
      console.error('Failed to fetch widget data:', err);
      showError();
      return cachedData;
    }
  }

  // ── UI updates ──
  function updateUI(data) {
    if (!data) return;

    // Update dynamic indicator cards
    selectedIndicators.forEach(function (id) {
      var ind = INDICATORS.find(function (x) { return x.id === id; });
      if (!ind) return;
      var el = document.getElementById('val_' + id);
      if (!el) return;
      var raw = ind.extract(data);
      if (raw === undefined || raw === null) {
        el.textContent = '--';
      } else {
        el.textContent = ind.format(raw);
      }
      if (ind.warnIfPositive && typeof raw === 'number' && raw > 0) {
        el.classList.add('warn');
      } else {
        el.classList.remove('warn');
      }
    });

    // Current product
    if (currentProduct) {
      try {
        var saved = localStorage.getItem('app_current_product');
        currentProduct.textContent = saved || data.current_product || '--';
      } catch (e) {
        currentProduct.textContent = data.current_product || '--';
      }
    }

    // Current indicator
    if (currentIndicator) {
      try {
        var savedIndicator = localStorage.getItem('app_current_indicator');
        currentIndicator.textContent = savedIndicator || data.current_indicator || '--';
      } catch (e) {
        currentIndicator.textContent = data.current_indicator || '--';
      }
    }

    // Instrument name
    if (instrumentName) {
      instrumentName.textContent = data.instrument_name ?? '--';
    }

    // Collection status
    var isCollecting = data.collecting ?? data.is_collecting ?? data.collection_active ?? false;
    if (collectDot) collectDot.className = 'status-dot ' + (isCollecting ? 'ok' : 'err');
    if (collectStatus) collectStatus.textContent = isCollecting ? '采集中' : '已停止';

    // Recent alerts
    var alerts = Array.isArray(data.recent_alerts) ? data.recent_alerts : Array.isArray(data.alerts) ? data.alerts : [];
    renderAlerts(alerts);

    // SPC data
    var points = data.spc_points ?? data.control_chart ?? data.spc_data ?? [];
    spcMean = data.spc_mean ?? data.cl ?? data.center_line ?? 0;
    spcUcl = data.spc_ucl ?? data.ucl ?? (spcMean + 3);
    spcLcl = data.spc_lcl ?? data.lcl ?? (spcMean - 3);
    if (Array.isArray(points) && points.length > 0) {
      spcPoints = points.slice(-SPC_MAX_POINTS).map(function (p) {
        return typeof p === 'object' && p !== null ? (p.value ?? p.v ?? 0) : p;
      });
    }
    drawSpcChart();
  }

  function renderAlerts(alerts) {
    if (!alertsList) return;
    if (!alerts || alerts.length === 0) {
      alertsList.replaceChildren();
      var emptyDiv = document.createElement('div');
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
      var badgeLabel = '信息';
      if (level === 'critical' || level === 'error' || level === '严重') { dotClass = 'critical'; badgeLabel = '严重'; }
      else if (level === 'warning' || level === 'warn' || level === '警告') { dotClass = 'warning'; badgeLabel = '警告'; }
      var message = alert.message ?? alert.msg ?? alert.text ?? alert.description ?? '';
      var time = alert.time ?? alert.timestamp ?? alert.created_at ?? '';
      if (time && typeof time === 'string' && time.length > 5) {
        time = time.length >= 16 ? time.substring(11, 16) : time.substring(0, 5);
      }
      var escapedMsg = escapeHtml(String(message));
      html += '<div class="alert-item">' +
        '<span class="alert-dot ' + dotClass + '"></span>' +
        '<span class="alert-badge ' + dotClass + '">' + escapeHtml(badgeLabel) + '</span>' +
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
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = rect.width - 16;
    var h = 150;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (spcPoints.length === 0) {
      ctx.fillStyle = '#4a5568';
      ctx.font = '11px "PingFang SC", -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无数据', w / 2, h / 2);
      return;
    }

    var padding = { top: 10, right: 10, bottom: 16, left: 10 };
    var chartW = w - padding.left - padding.right;
    var chartH = h - padding.top - padding.bottom;
    var allVals = spcPoints.concat([spcUcl, spcLcl, spcMean]);
    var yMin = Math.min.apply(null, allVals);
    var yMax = Math.max.apply(null, allVals);
    var yPad = (yMax - yMin) * 0.15 || 1;
    yMin -= yPad; yMax += yPad;

    function toX(i) { return padding.left + (i / Math.max(spcPoints.length - 1, 1)) * chartW; }
    function toY(v) { return padding.top + (1 - (v - yMin) / (yMax - yMin)) * chartH; }

    // Grid
    ctx.strokeStyle = CHART_GRID_COLOR; ctx.lineWidth = 0.5;
    for (var g = 0; g < 4; g++) {
      var gy = padding.top + (g / 3) * chartH;
      ctx.beginPath(); ctx.moveTo(padding.left, gy); ctx.lineTo(padding.left + chartW, gy); ctx.stroke();
    }

    // CL
    ctx.strokeStyle = 'rgba(0,212,255,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(padding.left, toY(spcMean)); ctx.lineTo(padding.left + chartW, toY(spcMean)); ctx.stroke();

    // UCL
    ctx.strokeStyle = CHART_LIMIT_COLOR; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padding.left, toY(spcUcl)); ctx.lineTo(padding.left + chartW, toY(spcUcl)); ctx.stroke();

    // LCL
    ctx.beginPath(); ctx.moveTo(padding.left, toY(spcLcl)); ctx.lineTo(padding.left + chartW, toY(spcLcl)); ctx.stroke();
    ctx.setLineDash([]);

    // Gradient fill
    ctx.beginPath();
    for (var fi = 0; fi < spcPoints.length; fi++) {
      if (fi === 0) ctx.moveTo(toX(fi), toY(spcPoints[fi]));
      else ctx.lineTo(toX(fi), toY(spcPoints[fi]));
    }
    ctx.lineTo(toX(spcPoints.length - 1), padding.top + chartH);
    ctx.lineTo(toX(0), padding.top + chartH);
    ctx.closePath();
    var fillGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    fillGrad.addColorStop(0, 'rgba(0, 212, 255, 0.12)');
    fillGrad.addColorStop(1, 'rgba(0, 212, 255, 0)');
    ctx.fillStyle = fillGrad; ctx.fill();

    // Data line
    ctx.strokeStyle = CHART_LINE_COLOR; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < spcPoints.length; i++) {
      if (i === 0) ctx.moveTo(toX(i), toY(spcPoints[i]));
      else ctx.lineTo(toX(i), toY(spcPoints[i]));
    }
    ctx.stroke();

    // Data points
    for (var j = 0; j < spcPoints.length; j++) {
      var isOOC = spcPoints[j] > spcUcl || spcPoints[j] < spcLcl;
      ctx.fillStyle = isOOC ? '#ff6b6b' : CHART_LINE_COLOR;
      ctx.beginPath(); ctx.arc(toX(j), toY(spcPoints[j]), isOOC ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Labels
    ctx.font = '9px "Roboto Mono", "Consolas", monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,100,100,0.5)'; ctx.fillText('UCL', padding.left + chartW, toY(spcUcl) - 3);
    ctx.fillStyle = 'rgba(0,212,255,0.4)'; ctx.fillText('CL', padding.left + chartW, toY(spcMean) - 3);
    ctx.fillStyle = 'rgba(255,100,100,0.5)';
    var lclY = toY(spcLcl);
    ctx.fillText('LCL', padding.left + chartW, lclY + 10 > h - 2 ? lclY - 3 : lclY + 10);
  }

  // ── Error handling ──
  function showError() { if (errorBanner) errorBanner.classList.add('show'); }
  function hideError() { if (errorBanner) errorBanner.classList.remove('show'); }

  // ── Refresh loop ──
  async function refresh() {
    var data = await fetchWidgetData();
    updateUI(data);
  }
  function startRefresh() { refresh(); refreshTimer = setInterval(refresh, REFRESH_INTERVAL); }
  function stopRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }

  // ── Interactions ──
  async function handleClose() {
    try {
      var Window = await getTauriWindow();
      if (Window) { var current = Window.getCurrent(); await current.hide(); }
    } catch (e) { console.error('Failed to hide widget:', e); }
  }

  async function handleDoubleClick() {
    try {
      var Window = await getTauriWindow();
      if (Window) { var main = new Window('main'); await main.show(); await main.setFocus(); }
    } catch (e) { console.error('Failed to show main window:', e); }
  }

  function openSettings() { if (settingsPanel) settingsPanel.classList.add('open'); }
  function closeSettings() { if (settingsPanel) settingsPanel.classList.remove('open'); }

  function handleOpacityChange(value) {
    var alpha = Math.max(0.1, Math.min(1.0, value / 100));
    if (opacityValue) opacityValue.textContent = value + '%';
    document.body.style.background = 'rgba(10, 14, 26,' + alpha + ')';
    try { localStorage.setItem('widget_opacity', value); } catch (e) {}
  }

  async function setupEventListeners() {
    try {
      var eventApi = await getTauriEvent();
      if (eventApi && eventApi.listen) {
        await eventApi.listen('toggle-widget', async function () {
          var Window = await getTauriWindow();
          if (Window) {
            var current = Window.getCurrent();
            if (await current.isVisible()) await current.hide();
            else { await current.show(); await current.setFocus(); }
          }
        });
      }
    } catch (e) { console.warn('Could not listen for toggle-widget event:', e); }
  }

  function handleResize() { drawSpcChart(); }

  // ── Init ──
  window.addEventListener('DOMContentLoaded', function () {
    // Cache DOM refs
    cardsRow = document.querySelector('.cards-row');
    currentProduct = $('currentProduct');
    currentIndicator = $('currentIndicator');
    instrumentName = $('instrumentName');
    collectDot = $('collectDot');
    collectStatus = $('collectStatus');
    alertsList = $('alertsList');
    errorBanner = $('errorBanner');
    btnClose = $('btnClose');
    btnSettings = $('btnSettings');
    settingsPanel = $('settingsPanel');
    settingsClose = $('settingsClose');
    opacitySlider = $('opacitySlider');
    opacityValue = $('opacityValue');
    spcCanvas = $('spcCanvas');
    indicatorGrid = $('indicatorGrid');

    // Load indicator selection and render cards
    loadSelection();
    renderCards();
    renderSettingsCheckboxes();

    // Bind events
    if (btnClose) btnClose.addEventListener('click', handleClose);
    if (btnSettings) btnSettings.addEventListener('click', openSettings);
    if (settingsClose) settingsClose.addEventListener('click', closeSettings);
    if (opacitySlider) {
      opacitySlider.addEventListener('input', function () {
        handleOpacityChange(parseInt(this.value, 10));
      });
    }

    // Restore saved opacity
    try {
      var savedOpacity = localStorage.getItem('widget_opacity');
      if (savedOpacity && opacitySlider) {
        opacitySlider.value = savedOpacity;
        handleOpacityChange(parseInt(savedOpacity, 10));
      }
    } catch (e) {}

    // Pin toggle
    var btnPin = $('btnPin');
    var isPinned = true;
    if (btnPin) {
      btnPin.addEventListener('click', async function () {
        try {
          var Window = await getTauriWindow();
          if (Window) {
            var current = Window.getCurrent();
            isPinned = !isPinned;
            await current.setAlwaysOnTop(isPinned);
            btnPin.style.color = isPinned ? '#00d4ff' : '#4a5568';
            btnPin.title = isPinned ? '取消置顶' : '置顶';
          }
        } catch (e) { console.error('Failed to toggle always-on-top:', e); }
      });
    }

    // Footer double-click
    var footerHint = document.querySelector('.footer-hint');
    if (footerHint) footerHint.addEventListener('dblclick', handleDoubleClick);

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
  window.addEventListener('beforeunload', function () { stopRefresh(); });
})();
