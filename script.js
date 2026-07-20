/* =========================================================
   Screen Fit — поведение
   Растягиваемое окно + проверка по устройствам.
   ========================================================= */

(function () {
  'use strict';

  // ----- База устройств (логические / дизайнерские px) -----
  const DEVICES = [
    { group: 'phones',  name: 'iPhone SE',         w:  375, h:  667, ratio: '375:667' },
    { group: 'phones',  name: 'iPhone 14',         w:  390, h:  844, ratio: '390:844' },
    { group: 'phones',  name: 'iPhone 15 Pro Max', w:  430, h:  932, ratio: '430:932' },
    { group: 'phones',  name: 'Pixel 7',           w:  412, h:  915, ratio: '412:915' },
    { group: 'phones',  name: 'Galaxy S23',        w:  360, h:  800, ratio: '360:800' },

    { group: 'tablets', name: 'iPad mini',         w:  768, h: 1024, ratio: '768:1024' },
    { group: 'tablets', name: 'iPad Air',          w:  820, h: 1180, ratio: '820:1180' },
    { group: 'tablets', name: 'iPad Pro 12.9"',    w: 1024, h: 1366, ratio: '1024:1366' },
    { group: 'tablets', name: 'Galaxy Tab S8',     w:  800, h: 1280, ratio: '800:1280' },

    { group: 'laptops', name: '13" ноутбук',       w: 1280, h:  800, ratio: '1280:800' },
    { group: 'laptops', name: '15" ноутбук (FHD)', w: 1920, h: 1080, ratio: '1920:1080' },
    { group: 'laptops', name: 'MacBook 14"',       w: 1512, h:  982, ratio: '1512:982' },
    { group: 'laptops', name: 'MacBook 16"',       w: 1728, h: 1080, ratio: '1728:1080' },

    { group: 'monitors', name: 'FullHD монитор',   w: 1920, h: 1080, ratio: '1920:1080' },
    { group: 'monitors', name: 'QHD монитор',      w: 2560, h: 1440, ratio: '2560:1440' },
    { group: 'monitors', name: '4K монитор',       w: 3840, h: 2160, ratio: '3840:2160' },
    { group: 'monitors', name: 'Ultrawide 21:9',   w: 3440, h: 1440, ratio: '3440:1440' }
  ];

  const GROUP_LABELS = {
    phones:   'Телефон',
    tablets:  'Планшет',
    laptops:  'Ноутбук',
    monitors: 'Монитор'
  };

  const TIGHT_RATIO = 0.05; // 5% запаса — граница «впритык»

  // ----- DOM -----
  const sizer       = document.getElementById('sizer');
  const winEl       = document.getElementById('window');
  const readout     = document.getElementById('readout');
  const hint        = document.getElementById('sizerHint');
  const resetBtn    = document.getElementById('resetBtn');
  const resultsEl   = document.getElementById('results');
  const sumWindow   = document.getElementById('summaryWindow');
  const sumArea     = document.getElementById('summaryArea');
  const sumFit      = document.getElementById('summaryFit');

  if (!sizer || !winEl || !readout || !resultsEl) {
    console.error('Не найден один из обязательных элементов.');
    return;
  }

  // ----- Состояние окна (в дизайнерских px) -----
  // Эти значения — «истина» в логических пикселях пользователя.
  // Внутри sizer они отображаются в масштабе, чтобы помещаться
  // в видимую область, и масштаб пересчитывается на ресайз.
  const state = {
    w: 619,         // логическая ширина окна
    h: 264,         // логическая высота окна
    // Коэффициент масштабирования: 1 дизайн-px = scale CSS-px
    scale: 1,
    // Минимальный/максимальный размер в дизайн-px
    minW: 50, maxW: 8000,
    minH: 50, maxH: 8000,
    // Позиция окна (left/top) в ДИЗАЙН-px, если задана пользователем.
    // Если null — окно центрируется в sizer.
    x: null,
    y: null
  };

  // ----- Утилиты -----

  function formatNumber(n) {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // ----- Масштабирование sizer -----
  // Подгоняем scale так, чтобы окно с текущим W×H помещалось
  // в видимую область sizer с небольшим отступом.
  function recalcScale() {
    const rect = sizer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const padding = 8; // px
    const sx = (rect.width  - padding * 2) / state.w;
    const sy = (rect.height - padding * 2) / state.h;
    state.scale = Math.min(sx, sy);
  }

  // ----- Применение состояния к DOM -----
  function renderWindow() {
    recalcScale();
    const displayW = state.w * state.scale;
    const displayH = state.h * state.scale;

    let xDisplay, yDisplay;
    if (state.x === null || state.y === null) {
      // Стартовая инициализация: центрируем.
      const sizerRect = sizer.getBoundingClientRect();
      xDisplay = (sizerRect.width  - displayW) / 2;
      yDisplay = (sizerRect.height - displayH) / 2;
    } else {
      // После drag: используем сохранённую позицию.
      xDisplay = state.x * state.scale;
      yDisplay = state.y * state.scale;
    }

    winEl.style.setProperty('--win-w', displayW + 'px');
    winEl.style.setProperty('--win-h', displayH + 'px');
    winEl.style.setProperty('--win-x', xDisplay + 'px');
    winEl.style.setProperty('--win-y', yDisplay + 'px');

    readout.textContent = state.w + ' × ' + state.h;
    hint.classList.add('sizer__hint--hidden');

    updateSummary();
    renderResults();
  }

  // ----- Drag-логика -----
  // Принцип: противоположная грань/угол ФИКСИРОВАНА.
  // Тянем за угол — двигается только он, противоположный стоит.
  // Тянем за сторону — двигается только она, противоположная стоит.
  // Для этого при pointerdown запоминаем и размер, и позицию
  // окна в CSS-px, а в pointermove обновляем обе величины.
  let drag = null;

  function onPointerDown(e) {
    // Только основная кнопка мыши / касание.
    if (e.button && e.button !== 0) return;

    const handle = e.target.closest('.handle');
    const sizerRect = sizer.getBoundingClientRect();

    // Запоминаем текущую позицию окна (left/top) в CSS-px
    // относительно sizer, чтобы корректно её обновлять.
    const winRect = winEl.getBoundingClientRect();
    const startLeftCSS = winRect.left - sizerRect.left;
    const startTopCSS  = winRect.top  - sizerRect.top;

    if (handle) {
      // --- Режим ресайза: тянем за ручку ---
      e.preventDefault();
      drag = {
        mode: 'resize',
        id: handle.dataset.handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startW: state.w,       // дизайн-px (логический размер)
        startH: state.h,       // дизайн-px
        startLeft: startLeftCSS, // CSS-px внутри sizer
        startTop:  startTopCSS,  // CSS-px внутри sizer
        scale: state.scale
      };
      try { handle.setPointerCapture(e.pointerId); } catch (_) { /* старые браузеры */ }
    } else if (winEl.contains(e.target)) {
      // --- Режим перемещения: тянем за тело квадрата ---
      // Позволяет двигать окно по полю, даже если часть его
      // уехала за край (границы sizer не ограничивают позицию).
      e.preventDefault();
      drag = {
        mode: 'move',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLeft: startLeftCSS,
        startTop:  startTopCSS,
        scale: state.scale
      };
      winEl.classList.add('sizer__window--dragging');
      try { winEl.setPointerCapture(e.pointerId); } catch (_) { /* старые браузеры */ }
    } else {
      return;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup',   onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag) return;
    e.preventDefault();

    // Смещение курсора в CSS-px и в дизайн-px.
    const dxCSS = e.clientX - drag.startClientX;
    const dyCSS = e.clientY - drag.startClientY;

    // --- Перемещение всего окна ---
    if (drag.mode === 'move') {
      const nL = drag.startLeft + dxCSS;
      const nT = drag.startTop  + dyCSS;
      winEl.style.setProperty('--win-x', nL + 'px');
      winEl.style.setProperty('--win-y', nT + 'px');
      // Сохраняем позицию в ДИЗАЙН-px, чтобы renderWindow()
      // (на ресайзе окна браузера) её не сбросил.
      state.x = nL / drag.scale;
      state.y = nT / drag.scale;
      return;
    }

    const dx    = dxCSS / drag.scale;
    const dy    = dyCSS / drag.scale;

    // Стартовые значения (дизайн-px) и новая позиция (CSS-px).
    let w  = drag.startW;
    let h  = drag.startH;
    let nL = drag.startLeft;   // new left  в CSS-px
    let nT = drag.startTop;    // new top   в CSS-px
    let nW = w * drag.scale;   // display width  (CSS-px)
    let nH = h * drag.scale;   // display height (CSS-px)

    switch (drag.id) {
      // Углы: противоположный угол стоит, двигаем этот.
      case 'se': // юго-восток → правый-нижний двигается
        nW = (w + dx) * drag.scale;
        nH = (h + dy) * drag.scale;
        w  = w + dx; h = h + dy;
        break;
      case 'sw': // юго-запад → левый-нижний двигается
        nL = drag.startLeft + dxCSS;
        nW = (w - dx) * drag.scale;
        nH = (h + dy) * drag.scale;
        w  = w - dx; h = h + dy;
        break;
      case 'ne': // северо-восток → правый-верхний двигается
        nT = drag.startTop + dyCSS;
        nW = (w + dx) * drag.scale;
        nH = (h - dy) * drag.scale;
        w  = w + dx; h = h - dy;
        break;
      case 'nw': // северо-запад → левый-верхний двигается
        nL = drag.startLeft + dxCSS;
        nT = drag.startTop  + dyCSS;
        nW = (w - dx) * drag.scale;
        nH = (h - dy) * drag.scale;
        w  = w - dx; h = h - dy;
        break;
      // Стороны: противоположная сторона стоит.
      case 'e': // восток → правая сторона двигается
        nW = (w + dx) * drag.scale;
        w  = w + dx;
        break;
      case 'w': // запад → левая сторона двигается
        nL = drag.startLeft + dxCSS;
        nW = (w - dx) * drag.scale;
        w  = w - dx;
        break;
      case 's': // юг → нижняя сторона двигается
        nH = (h + dy) * drag.scale;
        h  = h + dy;
        break;
      case 'n': // север → верхняя сторона двигается
        nT = drag.startTop + dyCSS;
        nH = (h - dy) * drag.scale;
        h  = h - dy;
        break;
    }

    // Защита от слишком маленьких/перевёрнутых размеров ДО
    // обновления позиции, чтобы окно не "уехало" за границы.
    const minDisplayW = state.minW * drag.scale;
    const minDisplayH = state.minH * drag.scale;
    if (nW < minDisplayW) {
      const corr = (minDisplayW - nW);
      nW = minDisplayW;
      w  = minDisplayW / drag.scale;
      if (drag.id === 'w' || drag.id === 'sw' || drag.id === 'nw') nL -= corr;
    }
    if (nH < minDisplayH) {
      const corr = (minDisplayH - nH);
      nH = minDisplayH;
      h  = minDisplayH / drag.scale;
      if (drag.id === 'n' || drag.id === 'nw' || drag.id === 'ne') nT -= corr;
    }

    state.w = clamp(Math.round(w), state.minW, state.maxW);
    state.h = clamp(Math.round(h), state.minH, state.maxH);

    // Пересчёт display на случай clamp.
    nW = state.w * drag.scale;
    nH = state.h * drag.scale;
    // И соответствующая коррекция позиции, если размер изменился clamp'ом.
    if (drag.id === 'w' || drag.id === 'sw' || drag.id === 'nw') {
      nL = drag.startLeft + dxCSS + (drag.startW - state.w) * drag.scale;
    }
    if (drag.id === 'n' || drag.id === 'nw' || drag.id === 'ne') {
      nT = drag.startTop + dyCSS + (drag.startH - state.h) * drag.scale;
    }

    winEl.style.setProperty('--win-w', nW + 'px');
    winEl.style.setProperty('--win-h', nH + 'px');
    winEl.style.setProperty('--win-x', nL + 'px');
    winEl.style.setProperty('--win-y', nT + 'px');

    // Сохраняем позицию в ДИЗАЙН-px — чтобы renderWindow()
    // (на ресайзе окна браузера) не вернул окно в центр.
    state.x = nL / drag.scale;
    state.y = nT / drag.scale;

    readout.textContent = state.w + ' × ' + state.h;
    updateSummary();
  }

  function onPointerUp() {
    if (!drag) return;
    winEl.classList.remove('sizer__window--dragging');
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup',   onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    renderResults();
  }

  // ----- Клавиатура: фокус на ручке позволяет +/- -----
  function onHandleKey(e) {
    const handle = e.target.closest('.handle');
    if (!handle) return;
    const id = handle.dataset.handle;
    const step = e.shiftKey ? 50 : 10; // Shift — крупный шаг
    let dx = 0, dy = 0;
    switch (id) {
      case 'se': dx =  1; dy =  1; break;
      case 'sw': dx = -1; dy =  1; break;
      case 'ne': dx =  1; dy = -1; break;
      case 'nw': dx = -1; dy = -1; break;
      case 'e':  dx =  1; break;
      case 'w':  dx = -1; break;
      case 's':  dy =  1; break;
      case 'n':  dy = -1; break;
    }
    let nextW = state.w + dx * step;
    let nextH = state.h + dy * step;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' &&
        e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    state.w = clamp(Math.round(nextW), state.minW, state.maxW);
    state.h = clamp(Math.round(nextH), state.minH, state.maxH);
    renderWindow();
  }

  // ----- Сводка и результаты -----

  function updateSummary() {
    sumWindow.textContent = state.w + ' × ' + state.h + ' px';
    sumArea.textContent   = formatNumber(state.w * state.h) + ' px²';
  }

  function fitStatus(winW, winH, devW, devH) {
    if (winW <= devW && winH <= devH) {
      const marginX = (devW - winW) / devW;
      const marginY = (devH - winH) / devH;
      const margin = Math.min(marginX, marginY);
      if (margin < TIGHT_RATIO) {
        return { status: 'tight', note: 'Помещается почти без запаса.' };
      }
      return {
        status: 'ok',
        note: 'Запас: ' + Math.round(Math.min(marginX, marginY) * 100) + '% по меньшей стороне.'
      };
    }
    const overW = Math.max(0, winW - devW);
    const overH = Math.max(0, winH - devH);
    return {
      status: 'no',
      note: 'Не хватает: ' + overW + '×' + overH + ' px.'
    };
  }

  function renderDevice(dev) {
    const card = document.createElement('article');
    const fit = fitStatus(state.w, state.h, dev.w, dev.h);
    card.className = 'device device--' + fit.status;
    card.dataset.group = dev.group;

    const head = document.createElement('div');
    head.className = 'device__head';
    const name = document.createElement('div');
    name.className = 'device__name';
    name.textContent = dev.name;
    const group = document.createElement('div');
    group.className = 'device__group';
    group.textContent = GROUP_LABELS[dev.group] || dev.group;
    head.appendChild(name);
    head.appendChild(group);

    const specs = document.createElement('div');
    specs.className = 'device__specs';
    specs.innerHTML =
      '<b>Экран:</b> ' + dev.w + ' × ' + dev.h + ' px<br>' +
      '<b>Соотношение:</b> ' + dev.ratio;

    const preview = document.createElement('div');
    preview.className = 'device__preview';
    const frame = document.createElement('div');
    frame.className = 'device__preview-frame';
    preview.appendChild(frame);
    requestAnimationFrame(function () { drawPreview(preview, frame, dev); });

    const status = document.createElement('div');
    status.className = 'device__status';
    status.textContent =
      fit.status === 'ok'    ? 'Помещается' :
      fit.status === 'tight' ? 'Впритык'    :
                               'Не помещается';

    const note = document.createElement('div');
    note.className = 'device__note';
    note.textContent = fit.note;

    card.appendChild(head);
    card.appendChild(specs);
    card.appendChild(preview);
    card.appendChild(status);
    card.appendChild(note);
    return card;
  }

  function drawPreview(preview, frame, dev) {
    const pr = preview.getBoundingClientRect();
    if (pr.width === 0 || pr.height === 0) return;
    const devAspect = dev.w / dev.h;
    const boxAspect = pr.width / pr.height;
    let renderW, renderH;
    if (devAspect > boxAspect) {
      renderW = pr.width;
      renderH = pr.width / devAspect;
    } else {
      renderH = pr.height;
      renderW = pr.height * devAspect;
    }
    const offX = (pr.width  - renderW) / 2;
    const offY = (pr.height - renderH) / 2;
    const scale = renderW / dev.w;
    frame.style.width  = (state.w * scale) + 'px';
    frame.style.height = (state.h * scale) + 'px';
    frame.style.left   = offX + 'px';
    frame.style.top    = offY + 'px';
  }

  function renderResults() {
    resultsEl.replaceChildren();
    let fitCount = 0;
    DEVICES.forEach(function (dev) {
      const card = renderDevice(dev);
      resultsEl.appendChild(card);
      if (card.classList.contains('device--ok')) fitCount++;
    });
    sumFit.textContent = fitCount + ' из ' + DEVICES.length;
  }

  // ----- Сброс -----
  resetBtn.addEventListener('click', function () {
    state.w = 619;
    state.h = 264;
    state.x = null; // следующий renderWindow отцентрирует
    state.y = null;
    renderWindow();
  });

  // ----- События -----
  sizer.addEventListener('pointerdown', onPointerDown);
  sizer.addEventListener('keydown', onHandleKey);

  // Ресайз окна браузера — пересчитать масштаб и превью.
  let resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderWindow, 80);
  });

  // ----- Старт -----
  renderWindow();
})();
