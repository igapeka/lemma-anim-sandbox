window.LS = window.LS || {};

// Режим «Выбор»: перехват кликов по макету, подсветка при наведении,
// постоянное выделение выбранного элемента.
LS.inspector = (function () {
  var mock;
  var mode = 'view';
  var selectedEl = null;
  var hoverEl = null;
  var badgeEl = null;

  function elementInfo(el) {
    var animId = el.getAttribute('data-anim');
    var reg = LS.registry.elements[animId];
    return {
      animId: animId,
      label: (reg && reg.label) || el.getAttribute('data-anim-label') || animId,
      group: (reg && reg.group) || el.getAttribute('data-anim-group') || '',
    };
  }

  function select(el) {
    if (selectedEl === el) {
      deselect();
      return;
    }
    if (selectedEl) selectedEl.classList.remove('is-anim-selected');
    selectedEl = el;
    el.classList.add('is-anim-selected');
    LS.toolbar.setSelected(elementInfo(el));
  }

  function deselect() {
    if (selectedEl) selectedEl.classList.remove('is-anim-selected');
    selectedEl = null;
    LS.toolbar.setSelected(null);
  }

  function showBadge(el) {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.className = 'lm-inspector-badge';
      document.body.appendChild(badgeEl);
    }
    badgeEl.textContent = elementInfo(el).label;
    badgeEl.hidden = false;
    var rect = el.getBoundingClientRect();
    var top = rect.top - badgeEl.offsetHeight - 4;
    badgeEl.style.top = (top < 0 ? rect.bottom + 4 : top) + 'px';
    badgeEl.style.left = rect.left + 'px';
  }

  function hideBadge() {
    if (badgeEl) badgeEl.hidden = true;
  }

  function clearHover() {
    if (hoverEl) hoverEl.classList.remove('is-anim-hover');
    hoverEl = null;
    hideBadge();
  }

  function onCaptureClick(e) {
    if (mode !== 'pick') return;
    e.preventDefault();
    e.stopPropagation();
    var target = e.target.closest('[data-anim]');
    if (target) select(target);
  }

  function onMouseOver(e) {
    if (mode !== 'pick') return;
    var target = e.target.closest('[data-anim]');
    if (target === hoverEl) return;
    clearHover();
    if (!target) return;
    hoverEl = target;
    hoverEl.classList.add('is-anim-hover');
    showBadge(target);
  }

  function onMouseOut(e) {
    if (mode !== 'pick') return;
    var related = e.relatedTarget;
    if (related && hoverEl && hoverEl.contains(related)) return;
    clearHover();
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && mode === 'pick' && selectedEl) {
      deselect();
    }
  }

  function setMode(newMode) {
    mode = newMode;
    mock.classList.toggle('is-picking', mode === 'pick');
    if (mode !== 'pick') {
      clearHover();
      deselect();
      if (LS.mock && LS.mock.hideSidebarTooltip) LS.mock.hideSidebarTooltip();
    }
  }

  // Для видов с "from" (enter-подобных) — проигрываем появление. Для
  // переходов между состояниями (hover, раскрытие, сворачивание) —
  // временно переключаем известный класс-состояние туда-обратно.
  function hasEnterCapableLayer(animId) {
    return LS.state.getLayers(animId).some(function (l) {
      var def = LS.registry.transitions[l.type];
      return def && def.from;
    });
  }

  function flipClass(el, className, duration) {
    if (!el) return;
    el.classList.toggle(className);
    setTimeout(function () {
      el.classList.toggle(className);
    }, duration || 400);
  }

  function playSelected() {
    if (!selectedEl) return;
    var animId = selectedEl.getAttribute('data-anim');

    if (hasEnterCapableLayer(animId)) {
      LS.anim.enter(selectedEl);
      return;
    }

    var layers = LS.state.getLayers(animId);
    var maxDuration = layers.reduce(function (m, l) {
      return Math.max(m, (l.duration || 0) + (l.delay || 0));
    }, 400) * LS.anim.getTimeFactor();

    if (animId === 'row-chevron' || animId === 'row-expanded' || animId === 'table-row') {
      flipClass(selectedEl.closest('.lm-row'), 'is-open', maxDuration);
    } else if (animId === 'sidebar' || animId === 'sidebar-item-label') {
      flipClass(document.querySelector('.lm-sidebar'), 'is-collapsed', maxDuration);
    } else if (animId === 'sidebar-item') {
      flipClass(selectedEl, 'is-selected', maxDuration);
    }
    // для остальных стейт-переходов (hover/focus кнопок и полей) готового
    // класса-состояния нет — «Проиграть» для них пока не демонстрирует эффект
  }

  function init() {
    mock = document.getElementById('mock');
    mock.addEventListener('click', onCaptureClick, true); // фаза захвата
    mock.addEventListener('mouseover', onMouseOver);
    mock.addEventListener('mouseout', onMouseOut);
    document.addEventListener('keydown', onKeydown);
  }

  function getMode() {
    return mode;
  }

  return { init: init, setMode: setMode, playSelected: playSelected, getMode: getMode };
})();
