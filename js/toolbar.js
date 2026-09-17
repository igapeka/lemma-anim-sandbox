window.LS = window.LS || {};

// Отрисовка тулбара и панели настроек анимации (Фаза 6: автоприменение,
// без кнопки «Применить» — любое изменение поля сразу пишется в LS.state
// и переприменяется через LS.anim.apply).
LS.toolbar = (function () {
  var root, panelEl, nameEl, groupEl, playBtn;
  var currentAnimId = null;

  var DEFAULT_EASING_ID = 'ease-out-cubic';
  var DEFAULT_DURATION = 200;

  /* ---------- Разбор/сопоставление cubic-bezier ---------- */

  function parseBezier(raw) {
    if (!raw) return null;
    var m = raw.match(/^cubic-bezier\(\s*([^)]+?)\s*\)$/i);
    var inner = m ? m[1] : raw;
    var parts = inner.split(',').map(function (s) {
      return parseFloat(s.trim());
    });
    if (parts.length !== 4 || parts.some(function (n) { return isNaN(n); })) return null;
    if (parts[0] < 0 || parts[0] > 1 || parts[2] < 0 || parts[2] > 1) return null;
    return parts;
  }

  function findEasingPreset(value) {
    var found = null;
    Object.keys(LS.registry.easings).forEach(function (id) {
      if (id === 'custom') return;
      if (LS.registry.easings[id].value === value) found = id;
    });
    return found;
  }

  /* ---------- Панель настроек выбранного элемента ---------- */

  function usedTypes(layers, excludeIndex) {
    var set = {};
    layers.forEach(function (l, i) {
      if (i !== excludeIndex) set[l.type] = true;
    });
    return set;
  }

  function labelField(text, control, extraClass) {
    var wrap = document.createElement('label');
    wrap.className = 'lm-layer-field' + (extraClass ? ' ' + extraClass : '');
    var span = document.createElement('span');
    span.className = 't-sm lm-layer-field-label';
    span.textContent = text;
    wrap.appendChild(span);
    wrap.appendChild(control);
    return wrap;
  }

  // getLayers/setLayers по умолчанию — либо плоская модель, либо (для
  // mountControlled) переопределяются вызывающей стороной на enter/leave.
  function buildLayerRow(animId, layer, index, layers, getLayers, setLayers) {
    var row = document.createElement('div');
    row.className = 'lm-layer-row';

    var typeSelect = document.createElement('select');
    var used = usedTypes(layers, index);
    Object.keys(LS.registry.transitions).forEach(function (typeId) {
      var opt = document.createElement('option');
      opt.value = typeId;
      opt.textContent = LS.registry.transitions[typeId].label;
      if (used[typeId] && typeId !== layer.type) opt.disabled = true;
      if (typeId === layer.type) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    var easingSelect = document.createElement('select');
    Object.keys(LS.registry.easings).forEach(function (easId) {
      var opt = document.createElement('option');
      opt.value = easId;
      opt.textContent = LS.registry.easings[easId].label;
      easingSelect.appendChild(opt);
    });
    easingSelect.value = findEasingPreset(layer.easing) || 'custom';

    var bezierInput = document.createElement('input');
    bezierInput.type = 'text';
    bezierInput.value = layer.easing;

    var durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.min = '0';
    durationInput.max = '5000';
    durationInput.step = '10';
    durationInput.value = layer.duration;

    var delayInput = document.createElement('input');
    delayInput.type = 'number';
    delayInput.min = '0';
    delayInput.step = '10';
    delayInput.value = layer.delay || 0;

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'lm-layer-remove';
    removeBtn.setAttribute('aria-label', 'Удалить слой');
    removeBtn.textContent = '✕';

    row.appendChild(labelField('Вид перехода', typeSelect));
    row.appendChild(labelField('Изинг', easingSelect));
    row.appendChild(labelField('cubic-bezier', bezierInput));
    row.appendChild(labelField('Длительность, мс', durationInput));
    row.appendChild(labelField('Задержка, мс', delayInput));
    row.appendChild(removeBtn);

    function commit(patch) {
      var current = getLayers(animId);
      if (!current[index]) return;
      current[index] = Object.assign({}, current[index], patch);
      setLayers(animId, current);
      LS.anim.apply(animId);
    }

    typeSelect.addEventListener('change', function () {
      // изинг и длительность сохраняются — меняется только type
      commit({ type: typeSelect.value });
      renderPanel(animId);
    });

    easingSelect.addEventListener('change', function () {
      var easId = easingSelect.value;
      if (easId === 'custom') return;
      var value = LS.registry.easings[easId].value;
      bezierInput.value = value;
      bezierInput.classList.remove('is-invalid');
      commit({ easing: value, easingPreset: easId });
    });

    bezierInput.addEventListener('input', function () {
      var parsed = parseBezier(bezierInput.value.trim());
      if (!parsed) {
        bezierInput.classList.add('is-invalid');
        return; // невалидно — не применяем, последнее валидное значение остаётся в state
      }
      bezierInput.classList.remove('is-invalid');
      var normalized = 'cubic-bezier(' + parsed.join(', ') + ')';
      var preset = findEasingPreset(normalized);
      easingSelect.value = preset || 'custom';
      commit({ easing: normalized, easingPreset: preset || 'custom' });
    });

    durationInput.addEventListener('input', function () {
      var val = parseInt(durationInput.value, 10);
      if (isNaN(val) || val < 0 || val > 5000) return;
      commit({ duration: val });
    });

    delayInput.addEventListener('input', function () {
      var val = parseInt(delayInput.value, 10);
      if (isNaN(val) || val < 0) return;
      commit({ delay: val });
    });

    removeBtn.addEventListener('click', function () {
      var current = getLayers(animId);
      current.splice(index, 1);
      setLayers(animId, current);
      LS.anim.apply(animId);
      renderPanel(currentAnimId);
    });

    return row;
  }

  function addLayer(animId, getLayers, setLayers, onDone) {
    var current = getLayers(animId);
    var used = {};
    current.forEach(function (l) { used[l.type] = true; });
    var availableType = Object.keys(LS.registry.transitions).filter(function (t) {
      return !used[t];
    })[0];
    if (!availableType) return; // все виды перехода уже использованы

    current.push({
      type: availableType,
      easingPreset: DEFAULT_EASING_ID,
      easing: LS.registry.easings[DEFAULT_EASING_ID].value,
      duration: DEFAULT_DURATION,
      delay: 0,
    });
    setLayers(animId, current);
    LS.anim.apply(animId);
    onDone();
  }

  // Один блок «список слоёв + добавить переход» для заданной пары
  // геттер/сеттер (плоская модель или одно из направлений enter/leave).
  function buildLayerBlock(animId, getLayers, setLayers) {
    var wrap = document.createElement('div');
    wrap.className = 'lm-layer-block';

    var layers = getLayers(animId);
    var list = document.createElement('div');
    list.className = 'lm-layer-list';
    layers.forEach(function (layer, index) {
      list.appendChild(buildLayerRow(animId, layer, index, layers, getLayers, setLayers));
    });
    if (!layers.length) {
      var empty = document.createElement('p');
      empty.className = 't-sm lm-layer-empty';
      empty.textContent = 'Переходов пока нет — добавьте первый.';
      list.appendChild(empty);
    }
    wrap.appendChild(list);

    var addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'lm-toolbar__add-layer';
    addBtn.textContent = '+ Добавить переход';
    addBtn.addEventListener('click', function () {
      addLayer(animId, getLayers, setLayers, function () {
        renderPanel(currentAnimId);
      });
    });
    wrap.appendChild(addBtn);

    return wrap;
  }

  function renderPanel(animId) {
    panelEl.innerHTML = '';
    if (!animId) return;

    if (LS.state.isMountControlled(animId)) {
      var enterSection = document.createElement('div');
      enterSection.className = 'lm-layer-section';
      var enterTitle = document.createElement('p');
      enterTitle.className = 't-sm-medium lm-layer-section-title';
      enterTitle.textContent = 'Вход';
      enterSection.appendChild(enterTitle);
      enterSection.appendChild(buildLayerBlock(animId, LS.state.getEnterLayers, LS.state.setEnterLayers));

      var leaveSection = document.createElement('div');
      leaveSection.className = 'lm-layer-section';
      var leaveTitle = document.createElement('p');
      leaveTitle.className = 't-sm-medium lm-layer-section-title';
      leaveTitle.textContent = 'Выход';
      leaveSection.appendChild(leaveTitle);
      leaveSection.appendChild(buildLayerBlock(animId, LS.state.getLeaveLayers, LS.state.setLeaveLayers));

      panelEl.appendChild(enterSection);
      panelEl.appendChild(leaveSection);
      return;
    }

    panelEl.appendChild(buildLayerBlock(animId, LS.state.getLayers, LS.state.setLayers));
  }

  /* ---------- Каркас тулбара ---------- */

  function render() {
    root = document.getElementById('toolbar');
    root.innerHTML =
      '<div class="lm-toolbar">' +
      '<div class="lm-toolbar__bar">' +
      '<div class="lm-toolbar__segment" role="group" aria-label="Режим песочницы">' +
      '<button type="button" class="lm-segment-btn" data-mode="pick">Выбор</button>' +
      '<button type="button" class="lm-segment-btn is-active" data-mode="view">Просмотр</button>' +
      '</div>' +
      '<div class="lm-toolbar__divider"></div>' +
      '<div class="lm-toolbar__selected">' +
      '<span class="lm-toolbar__selected-name t-md-semibold">Элемент не выбран</span>' +
      '<span class="lm-toolbar__selected-group t-sm"></span>' +
      '</div>' +
      '<button type="button" class="lm-toolbar__play" disabled>Проиграть</button>' +
      '<button type="button" class="lm-toolbar__slowmo" aria-pressed="false">Замедленно ×5</button>' +
      '<div class="lm-toolbar__spacer"></div>' +
      '<button type="button" class="lm-toolbar__params">Параметры</button>' +
      '<button type="button" class="lm-toolbar__reset">Сбросить всё</button>' +
      '</div>' +
      '<div class="lm-toolbar__panel" hidden></div>' +
      '</div>';

    panelEl = root.querySelector('.lm-toolbar__panel');
    nameEl = root.querySelector('.lm-toolbar__selected-name');
    groupEl = root.querySelector('.lm-toolbar__selected-group');
    playBtn = root.querySelector('.lm-toolbar__play');

    Array.prototype.forEach.call(root.querySelectorAll('.lm-segment-btn'), function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.getAttribute('data-mode'));
      });
    });
    playBtn.addEventListener('click', function () {
      LS.inspector.playSelected();
    });
    var slowMoBtn = root.querySelector('.lm-toolbar__slowmo');
    slowMoBtn.addEventListener('click', function () {
      var next = !LS.anim.isSlowMotion();
      LS.anim.setSlowMotion(next);
      slowMoBtn.classList.toggle('is-active', next);
      slowMoBtn.setAttribute('aria-pressed', String(next));
    });
    root.querySelector('.lm-toolbar__reset').addEventListener('click', onReset);
    root.querySelector('.lm-toolbar__params').addEventListener('click', function () {
      if (window.LS.export && LS.export.open) LS.export.open();
    });
  }

  function setMode(mode) {
    Array.prototype.forEach.call(root.querySelectorAll('.lm-segment-btn'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === mode);
    });
    LS.inspector.setMode(mode);
  }

  function setSelected(info) {
    if (!info) {
      currentAnimId = null;
      nameEl.textContent = 'Элемент не выбран';
      groupEl.textContent = '';
      playBtn.disabled = true;
      panelEl.hidden = true;
      panelEl.innerHTML = '';
      return;
    }
    currentAnimId = info.animId;
    nameEl.textContent = info.label;
    groupEl.textContent = info.group;
    playBtn.disabled = false;
    panelEl.hidden = false;
    renderPanel(info.animId);
  }

  function onReset() {
    if (!window.confirm('Сбросить все настройки анимаций?')) return;
    LS.state.reset();
    LS.anim.applyAll();
    setSelected(null);
  }

  function init() {
    render();
  }

  // Перерисовать панель текущего выбранного элемента (например, после
  // загрузки настроек из файла в модалке «Параметры»).
  function refresh() {
    if (currentAnimId) renderPanel(currentAnimId);
  }

  return { init: init, setSelected: setSelected, refresh: refresh };
})();
