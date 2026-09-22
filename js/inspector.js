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

  // Alt+клик поднимает выбор к родительскому data-anim (как «выбрать
  // родителя» в Figma/Sketch) — нужно, когда нужный элемент-обёртка
  // (например .lm-row__expanded) внутри плотно занят более вложенными
  // data-anim и не оставляет пикселя, по которому можно кликнуть напрямую.
  // Повторный Alt+клик по тому же месту поднимает выбор ещё на уровень.
  var altClimbBase = null;
  var altClimbEl = null;
  var altKeyDown = false;
  // Сырой ближайший data-anim под курсором, без учёта Alt — нужен, чтобы
  // пересчитать подсветку по нажатию/отпусканию Alt, даже если мышь не
  // двигалась (иначе непонятно, что выберется, пока не кликнешь).
  var hoverDeepest = null;

  function onCaptureClick(e) {
    if (mode !== 'pick') return;
    e.preventDefault();
    e.stopPropagation();
    var deepest = e.target.closest('[data-anim]');
    if (!deepest) return;

    if (e.altKey) {
      if (altClimbBase !== deepest) {
        altClimbBase = deepest;
        altClimbEl = deepest;
      }
      var parent = altClimbEl.parentElement && altClimbEl.parentElement.closest('[data-anim]');
      if (parent) altClimbEl = parent;
      select(altClimbEl);
      return;
    }

    altClimbBase = null;
    altClimbEl = null;
    select(deepest);
  }

  // Что реально подсветится при наведении — с учётом Alt: на один уровень
  // выше сырого hoverDeepest, тем же способом, что и первый Alt+клик.
  function hoverTarget() {
    if (!hoverDeepest) return null;
    if (!altKeyDown) return hoverDeepest;
    var parent = hoverDeepest.parentElement && hoverDeepest.parentElement.closest('[data-anim]');
    return parent || hoverDeepest;
  }

  function applyHover(target) {
    if (target === hoverEl) return;
    if (hoverEl) hoverEl.classList.remove('is-anim-hover');
    hoverEl = target;
    if (!hoverEl) {
      hideBadge();
      return;
    }
    hoverEl.classList.add('is-anim-hover');
    showBadge(hoverEl);
  }

  function onMouseOver(e) {
    if (mode !== 'pick') return;
    hoverDeepest = e.target.closest('[data-anim]');
    applyHover(hoverTarget());
  }

  function onMouseOut(e) {
    if (mode !== 'pick') return;
    var related = e.relatedTarget;
    if (related && hoverDeepest && hoverDeepest.contains(related)) return;
    hoverDeepest = null;
    applyHover(null);
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && mode === 'pick' && selectedEl) {
      deselect();
    }
    if (e.key === 'Alt' && mode === 'pick' && !altKeyDown) {
      altKeyDown = true;
      applyHover(hoverTarget());
    }
  }

  function onKeyup(e) {
    if (e.key === 'Alt' && altKeyDown) {
      altKeyDown = false;
      applyHover(hoverTarget());
    }
  }

  // Alt+Tab/переключение окна с зажатым Alt не даёт keyup — без этого
  // подсветка застряла бы в «поднятом» состоянии после возврата на страницу.
  function onWindowBlur() {
    if (altKeyDown) {
      altKeyDown = false;
      applyHover(hoverTarget());
    }
  }

  function setMode(newMode) {
    mode = newMode;
    mock.classList.toggle('is-picking', mode === 'pick');
    if (mode !== 'pick') {
      hoverDeepest = null;
      applyHover(null);
      deselect();
      altClimbBase = null;
      altClimbEl = null;
      if (LS.mock && LS.mock.hideSidebarTooltip) LS.mock.hideSidebarTooltip();
    } else if (!selectedEl) {
      // Подсказка про Alt в тулбаре зависит от текущего режима — обновляем
      // её и при входе в «Выбор», а не только при выходе из него.
      LS.toolbar.setSelected(null);
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
    } else if (animId === 'anchor-nav' || animId === 'anchor-nav-toggle') {
      flipClass(document.querySelector('.lm-anchor-nav'), 'is-collapsed', maxDuration);
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
    document.addEventListener('keyup', onKeyup);
    window.addEventListener('blur', onWindowBlur);
  }

  function getMode() {
    return mode;
  }

  return { init: init, setMode: setMode, playSelected: playSelected, getMode: getMode };
})();
