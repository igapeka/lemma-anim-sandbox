window.LS = window.LS || {};

// Хранилище настроек анимаций + localStorage (ключ версионирован).
LS.state = (function () {
  var STORAGE_KEY = 'lemma-anim-sandbox:v2';
  var VERSION = 2;
  var SAVE_DEBOUNCE_MS = 200;

  // Элементы, которых изначально нет на экране (dropdown, сайдпейдж, диалог,
  // тост, встроенные строки таблицы) — у них вход и выход настраиваются
  // раздельно, каждый своим набором слоёв: { enter: [...], leave: [...] }.
  // У остальных элементов (стейт-переходы: hover, раскрытие класса и т.п.)
  // один набор слоёв на элемент, как раньше.
  function isMountControlled(animId) {
    var reg = LS.registry.elements[animId];
    return !!(reg && reg.mountControlled);
  }

  var data = { version: VERSION, elements: {} };
  var saveTimer = null;

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION && parsed.elements) {
        data = parsed;
      }
      // объект другой версии — игнорируем, начинаем с чистого листа
    } catch (e) {
      // повреждённые данные — тоже игнорируем
    }
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
        // localStorage недоступен (например, приватный режим) — молча пропускаем
      }
    }, SAVE_DEBOUNCE_MS);
  }

  // Плоская модель (стейт-переходы: hover, раскрытие класса и т.п.).
  function getLayers(animId) {
    var el = data.elements[animId];
    if (!el) return [];
    if (isMountControlled(animId)) return (el.enter || []).slice();
    return (el.layers || []).slice();
  }

  function setLayers(animId, layers) {
    if (isMountControlled(animId)) {
      setEnterLayers(animId, layers);
      return;
    }
    if (!layers || !layers.length) {
      delete data.elements[animId];
    } else {
      data.elements[animId] = { layers: layers };
    }
    save();
  }

  // Раздельная модель (mountControlled): свой набор слоёв на вход и на выход.
  function getEnterLayers(animId) {
    var el = data.elements[animId];
    return el && el.enter ? el.enter.slice() : [];
  }

  function getLeaveLayers(animId) {
    var el = data.elements[animId];
    return el && el.leave ? el.leave.slice() : [];
  }

  function pruneIfEmpty(animId) {
    var el = data.elements[animId];
    if (el && !(el.enter && el.enter.length) && !(el.leave && el.leave.length)) {
      delete data.elements[animId];
    }
  }

  function setEnterLayers(animId, layers) {
    var el = data.elements[animId] || (data.elements[animId] = {});
    if (!layers || !layers.length) {
      delete el.enter;
    } else {
      el.enter = layers;
    }
    pruneIfEmpty(animId);
    save();
  }

  function setLeaveLayers(animId, layers) {
    var el = data.elements[animId] || (data.elements[animId] = {});
    if (!layers || !layers.length) {
      delete el.leave;
    } else {
      el.leave = layers;
    }
    pruneIfEmpty(animId);
    save();
  }

  function getLayersFor(domEl) {
    var animId = domEl.getAttribute('data-anim');
    return animId ? getLayers(animId) : [];
  }

  function all() {
    return data.elements;
  }

  function version() {
    return VERSION;
  }

  function reset() {
    data = { version: VERSION, elements: {} };
    save();
  }

  // Загрузка настроек из внешнего JSON (модалка «Параметры» → «Загрузить»).
  // Формат — ровно как у all()/экспорта: { version, elements }.
  function importData(obj) {
    if (!obj || typeof obj !== 'object' || obj.version !== VERSION || !obj.elements || typeof obj.elements !== 'object') {
      return false;
    }
    data = { version: VERSION, elements: obj.elements };
    save();
    return true;
  }

  load();

  return {
    load: load,
    save: save,
    isMountControlled: isMountControlled,
    getLayers: getLayers,
    setLayers: setLayers,
    getEnterLayers: getEnterLayers,
    setEnterLayers: setEnterLayers,
    getLeaveLayers: getLeaveLayers,
    setLeaveLayers: setLeaveLayers,
    getLayersFor: getLayersFor,
    all: all,
    version: version,
    reset: reset,
    importData: importData,
  };
})();
