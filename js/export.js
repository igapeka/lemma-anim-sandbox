window.LS = window.LS || {};

// Модалка «Параметры»: полный список применённых настроек, JSON/CSS, копирование.
LS.export = (function () {
  var GROUP_ORDER = ['Навигация', 'Таблица', 'Контролы', 'Слои поверх'];

  var overlayEl, modalEl, activeTab = 'json';

  function buildJson() {
    return JSON.stringify({ version: LS.state.version(), elements: LS.state.all() }, null, 2);
  }

  function transitionLinesFor(layers) {
    var lines = [];
    layers.forEach(function (layer) {
      var tdef = LS.registry.transitions[layer.type];
      if (!tdef) return;
      tdef.props.forEach(function (prop) {
        lines.push(prop + ' ' + layer.duration + 'ms ' + layer.easing + ' ' + (layer.delay || 0) + 'ms');
      });
    });
    return lines;
  }

  function cssBlock(comment, animId, transitionLines) {
    var body = transitionLines
      .map(function (line, i) {
        return '    ' + line + (i === transitionLines.length - 1 ? ';' : ',');
      })
      .join('\n');
    return '/* ' + comment + ' */\n[data-anim="' + animId + '"] {\n  transition:\n' + body + '\n}';
  }

  function buildCss() {
    var elements = LS.state.all();
    var blocks = [];
    GROUP_ORDER.forEach(function (group) {
      Object.keys(LS.registry.elements).forEach(function (animId) {
        var def = LS.registry.elements[animId];
        if (def.group !== group) return;
        var stored = elements[animId];
        if (!stored) return;

        if (def.mountControlled) {
          var enterLines = transitionLinesFor(stored.enter || []);
          if (enterLines.length) blocks.push(cssBlock(group + ' — ' + def.label + ' (вход)', animId, enterLines));
          var leaveLines = transitionLinesFor(stored.leave || []);
          if (leaveLines.length) blocks.push(cssBlock(group + ' — ' + def.label + ' (выход)', animId, leaveLines));
          return;
        }

        var transitionLines = transitionLinesFor(stored.layers || []);
        if (!transitionLines.length) return;
        blocks.push(cssBlock(group + ' — ' + def.label, animId, transitionLines));
      });
    });
    return blocks.join('\n\n');
  }

  function hasAnySettings() {
    return Object.keys(LS.state.all()).length > 0;
  }

  function renderContent() {
    var body = modalEl.querySelector('.lm-export-body');
    if (!hasAnySettings()) {
      body.innerHTML = '<p class="t-sm lm-export-empty">Пока ничего не настроено.</p>';
      return;
    }
    body.innerHTML = '<pre class="lm-export-pre"></pre>';
    body.querySelector('.lm-export-pre').textContent = activeTab === 'json' ? buildJson() : buildCss();
  }

  function showToast(message) {
    var toast = modalEl.querySelector('.lm-export-toast');
    toast.textContent = message || 'Скопировано';
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.hidden = true;
    }, 2000);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      showToast();
    } catch (e) {
      // копирование недоступно — молча пропускаем
    }
    document.body.removeChild(ta);
  }

  function copyCurrent() {
    var pre = modalEl.querySelector('.lm-export-pre');
    var text = pre ? pre.textContent : '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showToast, function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function timestamp() {
    var d = new Date();
    function pad(n) {
      return String(n).padStart(2, '0');
    }
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      '_' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds())
    );
  }

  function downloadJson() {
    var json = buildJson();
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'lemma-anim-sandbox_' + timestamp() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    var input = modalEl.querySelector('.lm-export-file-input');
    input.value = ''; // чтобы повторный выбор того же файла тоже срабатывал
    input.click();
  }

  function handleImportFile(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        showToast('Файл повреждён: не JSON');
        return;
      }
      var ok = LS.state.importData(parsed);
      if (!ok) {
        showToast('Неверный формат файла');
        return;
      }
      LS.anim.applyAll();
      if (LS.toolbar && LS.toolbar.refresh) LS.toolbar.refresh();
      renderContent();
      showToast('Настройки загружены');
    };
    reader.onerror = function () {
      showToast('Не удалось прочитать файл');
    };
    reader.readAsText(file);
  }

  function setTab(tab) {
    activeTab = tab;
    Array.prototype.forEach.call(modalEl.querySelectorAll('.lm-export-tab'), function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tab);
    });
    renderContent();
  }

  function open() {
    renderContent();
    overlayEl.hidden = false;
    modalEl.hidden = false;
  }

  function close() {
    overlayEl.hidden = true;
    modalEl.hidden = true;
  }

  function isOpen() {
    return modalEl && !modalEl.hidden;
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && isOpen()) close();
  }

  function build() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'lm-export-overlay';
    overlayEl.hidden = true;
    overlayEl.addEventListener('click', close);

    modalEl = document.createElement('div');
    modalEl.className = 'lm-export-modal';
    modalEl.hidden = true;
    modalEl.innerHTML =
      '<div class="lm-export-header">' +
      '<div class="lm-export-tabs">' +
      '<button type="button" class="lm-export-tab is-active" data-tab="json">JSON</button>' +
      '<button type="button" class="lm-export-tab" data-tab="css">CSS</button>' +
      '</div>' +
      '<div class="lm-export-actions">' +
      '<button type="button" class="lm-export-download">Скачать JSON</button>' +
      '<button type="button" class="lm-export-upload">Загрузить</button>' +
      '<button type="button" class="lm-export-copy">Скопировать</button>' +
      '<input type="file" class="lm-export-file-input" accept="application/json,.json" hidden />' +
      '<button type="button" class="lm-export-close" aria-label="Закрыть">✕</button>' +
      '</div>' +
      '</div>' +
      '<div class="lm-export-body"><pre class="lm-export-pre"></pre></div>' +
      '<div class="lm-export-toast" hidden>Скопировано</div>';

    Array.prototype.forEach.call(modalEl.querySelectorAll('.lm-export-tab'), function (btn) {
      btn.addEventListener('click', function () {
        setTab(btn.getAttribute('data-tab'));
      });
    });
    modalEl.querySelector('.lm-export-copy').addEventListener('click', copyCurrent);
    modalEl.querySelector('.lm-export-download').addEventListener('click', downloadJson);
    modalEl.querySelector('.lm-export-upload').addEventListener('click', triggerImport);
    modalEl.querySelector('.lm-export-file-input').addEventListener('change', handleImportFile);
    modalEl.querySelector('.lm-export-close').addEventListener('click', close);

    document.body.appendChild(overlayEl);
    document.body.appendChild(modalEl);
    document.addEventListener('keydown', onKeydown);
  }

  function init() {
    build();
  }

  return { init: init, open: open, close: close };
})();
