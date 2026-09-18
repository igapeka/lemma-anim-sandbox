window.LS = window.LS || {};

// Движок анимаций: сборка transition из слоёв, применение к DOM, enter/leave.
LS.anim = (function () {
  var SLOW_MOTION_FACTOR = 5;
  var slowMotion = false;

  function setSlowMotion(on) {
    slowMotion = !!on;
    applyAll();
  }

  function isSlowMotion() {
    return slowMotion;
  }

  function timeFactor() {
    return slowMotion ? SLOW_MOTION_FACTOR : 1;
  }

  // публичный alias для мест вне anim.js, которым нужен текущий коэффициент
  // (например, ручной таймер flipClass в inspector.js)
  function getTimeFactor() {
    return timeFactor();
  }

  // Собирает CSS-строку transition для одного элемента из его слоёв.
  // Длительность и задержка умножаются на текущий коэффициент замедления.
  function buildTransition(layers) {
    var factor = timeFactor();
    var parts = [];
    layers.forEach(function (layer) {
      var def = LS.registry.transitions[layer.type];
      if (!def) return;
      def.props.forEach(function (prop) {
        parts.push(prop + ' ' + (layer.duration * factor) + 'ms ' + layer.easing + ' ' + ((layer.delay || 0) * factor) + 'ms');
      });
    });
    return parts.join(', ');
  }

  // Применяет настройки ко всем элементам с данным data-anim. Для
  // mountControlled элементов transition задаётся динамически в enter/leave
  // (у входа и выхода разные слои) — здесь ничего не выставляем.
  function apply(animId) {
    if (LS.state.isMountControlled(animId)) return;
    var layers = LS.state.getLayers(animId);
    var css = layers.length ? buildTransition(layers) : 'none';
    document.querySelectorAll('[data-anim="' + animId + '"]').forEach(function (el) {
      el.style.transition = css;
    });
  }

  // Переприменяет анимации ко всем элементам реестра — вызывать после
  // изменения настроек и после вставки новых узлов в DOM.
  function applyAll() {
    Object.keys(LS.registry.elements).forEach(apply);
  }

  // Слои входа/выхода элемента: для mountControlled — свой набор на каждое
  // направление, для остальных (обратная совместимость вызова) — общий.
  function layersForDirection(el, direction) {
    var animId = el.getAttribute('data-anim');
    if (!animId) return [];
    if (LS.state.isMountControlled(animId)) {
      return direction === 'leave' ? LS.state.getLeaveLayers(animId) : LS.state.getEnterLayers(animId);
    }
    return LS.state.getLayersFor(el);
  }

  // Появление: ставим "from"-состояние, форсим reflow, снимаем — браузер
  // проигрывает переход к обычному состоянию элемента.
  function enter(el) {
    var layers = layersForDirection(el, 'enter');
    if (!layers.length) return;
    var from = {};
    layers.forEach(function (l) {
      var def = LS.registry.transitions[l.type];
      if (def && def.from) Object.assign(from, def.from);
    });
    if (!Object.keys(from).length) return;
    Object.keys(from).forEach(function (prop) {
      el.style[prop] = from[prop];
    });
    el.style.transition = 'none';
    void el.offsetWidth; // принудительный reflow
    el.style.transition = buildTransition(layers);
    Object.keys(from).forEach(function (prop) {
      el.style[prop] = '';
    });
  }

  // Исчезновение: ставим "to"-состояние (то же, что "from" для enter, но по
  // своим слоям выхода) и вызываем колбэк после максимальной длительности.
  function leave(el, done) {
    var layers = layersForDirection(el, 'leave');
    if (!layers.length) {
      done();
      return;
    }
    var total = 0;
    var to = {};
    layers.forEach(function (l) {
      var def = LS.registry.transitions[l.type];
      if (def && def.from) Object.assign(to, def.from);
      total = Math.max(total, (l.duration || 0) + (l.delay || 0));
    });
    if (!Object.keys(to).length) {
      done();
      return;
    }
    el.style.transition = buildTransition(layers);
    Object.keys(to).forEach(function (prop) {
      el.style[prop] = to[prop];
    });
    setTimeout(done, total * timeFactor());
  }

  // cubic-bezier(x1,y1,x2,y2) → функция t(0..1) → прогресс(0..1). Решение
  // ищем бинарным поиском по x (t — параметр кривой, не сам прогресс).
  function bezierEasing(x1, y1, x2, y2) {
    function bezierAt(t, a, b) {
      var mt = 1 - t;
      return 3 * mt * mt * t * a + 3 * mt * t * t * b + t * t * t;
    }
    return function (x) {
      var t = x;
      for (var i = 0; i < 8; i++) {
        var xEst = bezierAt(t, x1, x2) - x;
        if (Math.abs(xEst) < 1e-4) break;
        var d = (bezierAt(t + 1e-4, x1, x2) - bezierAt(t - 1e-4, x1, x2)) / 2e-4;
        if (Math.abs(d) < 1e-6) break;
        t -= xEst / d;
        t = Math.min(1, Math.max(0, t));
      }
      return bezierAt(t, y1, y2);
    };
  }

  // 'cubic-bezier(a, b, c, d)' → easing-функция. Именованные keyword'ы вида
  // 'ease'/'linear' в реестре не встречаются (см. registry.js: все easings
  // заданы как cubic-bezier), так что других форм не поддерживаем.
  function parseEasing(value) {
    var m = /cubic-bezier\(\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*,\s*([\d.\-]+)\s*\)/.exec(value || '');
    if (!m) return function (x) { return x; };
    return bezierEasing(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4]));
  }

  // CSS transition не умеет анимировать scrollTop — крутим его вручную по
  // duration/easing текущих слоёв animId (настраиваются в тулбаре как у
  // любой другой анимации). Слой без duration (или отсутствие слоёв вовсе)
  // — мгновенный прыжок, как раньше без анимации.
  function animateScroll(el, top, animId) {
    var layers = LS.state.getLayers(animId);
    var layer = layers[0];
    var duration = layer ? layer.duration * timeFactor() : 0;
    var delay = layer ? (layer.delay || 0) * timeFactor() : 0;
    var from = el.scrollTop;
    var distance = top - from;
    if (!duration || !distance) {
      el.scrollTop = top;
      return;
    }
    var ease = parseEasing(layer.easing);
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var elapsed = ts - start - delay;
      if (elapsed < 0) {
        requestAnimationFrame(step);
        return;
      }
      var progress = Math.min(1, elapsed / duration);
      el.scrollTop = from + distance * ease(progress);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return {
    buildTransition: buildTransition,
    apply: apply,
    applyAll: applyAll,
    enter: enter,
    leave: leave,
    animateScroll: animateScroll,
    setSlowMotion: setSlowMotion,
    isSlowMotion: isSlowMotion,
    getTimeFactor: getTimeFactor,
  };
})();
