window.LS = window.LS || {};

// Поведение макета. Вставка/удаление узлов и появление/исчезновение слоёв —
// только через LS.anim.enter/leave; переключение состояний (раскрытие строки,
// сворачивание сайдбара) — просто класс, transition уже выставлен LS.anim.apply.
LS.mock = (function () {
  var sidepage, sidepageOverlay, sidepageTitle;
  var dialog, dialogOverlay;
  var toast, toastHideTimer;

  // Счётчики поколений — чтобы устаревший колбэк leave() от предыдущего
  // закрытия не спрятал слой, который уже успели открыть заново.
  var sidepageGen = 0;
  var dialogGen = 0;
  var toastGen = 0;

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /* ---------- Строки классов: раскрытие/схлопывание ---------- */

  // Просто класс is-open — плавную высоту даёт grid-template-rows (0fr→1fr)
  // на .lm-row__expanded в components.css, а не JS (JS-измерение
  // scrollHeight не давало плавного перехода — убрано).
  function toggleRow(row) {
    var expanded = q('.lm-row__expanded', row);
    if (!expanded) return;
    row.classList.toggle('is-open');
  }

  /* ---------- Сайдбар: сворачивание ---------- */

  function toggleSidebar() {
    var sidebar = q('.lm-sidebar');
    var collapsed = sidebar.classList.toggle('is-collapsed');
    var icon = q('#sidebar-burger-icon');
    var btn = q('#sidebar-burger');
    if (icon) icon.setAttribute('href', collapsed ? '#icon-sidebar-expand' : '#icon-sidebar-collapse');
    if (btn) btn.setAttribute('aria-label', collapsed ? 'Развернуть сайдбар' : 'Свернуть сайдбар');
  }

  /* ---------- Панель якорной навигации: сворачивание ---------- */

  function toggleAnchorNav() {
    var anchorNav = q('.lm-anchor-nav');
    anchorNav.classList.toggle('is-collapsed');
  }

  /* ---------- Тултип обрезанного пункта сайдбара ---------- */

  // Статически привязан к одному пункту (id sidebar-item-teachers) —
  // без общей логики измерения обрезки текста для всех пунктов.
  var sidebarTooltipEl = null;
  var sidebarTooltipGen = 0;

  function showSidebarTooltip() {
    var item = q('#sidebar-item-teachers');
    if (!item || !sidebarTooltipEl || item.closest('.lm-sidebar.is-collapsed')) return;
    var rect = item.getBoundingClientRect();
    sidebarTooltipEl.style.left = rect.right + 'px';
    sidebarTooltipEl.style.top = (rect.top + rect.height / 2) + 'px';
    sidebarTooltipEl.style.transform = 'translateY(-50%)';
    sidebarTooltipGen++;
    sidebarTooltipEl.hidden = false;
    LS.anim.enter(sidebarTooltipEl);
  }

  // force: закрыть, даже если активен режим «Выбор» (используется при
  // выходе из режима — иначе замороженный тултип остался бы висеть).
  function hideSidebarTooltip(force) {
    if (!sidebarTooltipEl || sidebarTooltipEl.hidden) return;
    // в режиме «Выбор» не закрываем по mouseleave — иначе тултип не
    // выбрать (курсор неизбежно уходит с пункта, например к тулбару)
    if (!force && LS.inspector.getMode() === 'pick') return;
    sidebarTooltipGen++;
    var gen = sidebarTooltipGen;
    LS.anim.leave(sidebarTooltipEl, function () {
      if (gen === sidebarTooltipGen) sidebarTooltipEl.hidden = true;
    });
  }

  function initSidebarTooltip() {
    var item = q('#sidebar-item-teachers');
    sidebarTooltipEl = q('#sidebar-item-tooltip');
    if (!item || !sidebarTooltipEl) return;

    item.addEventListener('mouseenter', showSidebarTooltip);
    item.addEventListener('mouseleave', function () {
      hideSidebarTooltip(false);
    });
  }

  /* ---------- Панель якорной навигации ---------- */

  // Подсветка активного пункта следит за скроллом .lm-content (единственный
  // скроллящийся контейнер) через IntersectionObserver по секциям; клик по
  // пункту скроллит контейнер плавно к своей секции без прыжка всей страницы.
  var anchorNavItems = [];
  var anchorObserver = null;

  function setActiveAnchor(id) {
    anchorNavItems.forEach(function (item) {
      item.classList.toggle('is-active', item.getAttribute('data-anchor-target') === id);
    });
  }

  function initAnchorNav() {
    var nav = q('.lm-anchor-nav');
    var scrollEl = q('#content-scroll');
    if (!nav || !scrollEl) return;
    anchorNavItems = qa('.lm-anchor-nav__item', nav);
    var sections = qa('.lm-anchor-section', scrollEl);
    if (!sections.length) return;

    var visibleRatios = {};
    anchorObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visibleRatios[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
        });
        var bestId = null;
        var bestRatio = 0;
        sections.forEach(function (section) {
          var ratio = visibleRatios[section.id] || 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = section.id;
          }
        });
        if (bestId) setActiveAnchor(bestId);
      },
      { root: scrollEl, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    sections.forEach(function (section) {
      anchorObserver.observe(section);
    });
  }

  // Нативный smooth-scroll (не через движок анимаций тулбара): браузер сам
  // отключает его при prefers-reduced-motion — своя rAF-анимация с ручным
  // scrollTop так не умеет без отдельной проверки matchMedia.
  function scrollToAnchor(id) {
    var scrollEl = q('#content-scroll');
    var target = document.getElementById(id);
    if (!scrollEl || !target) return;
    var targetTop = target.offsetTop - scrollEl.offsetTop;
    scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
    setActiveAnchor(id);
  }

  /* ---------- Дропдаун организации в шапке ---------- */

  var orgDropdownGen = 0;

  function openOrgDropdown() {
    var wrap = q('.lm-org-select-wrap');
    var dropdown = q('.lm-org-dropdown', wrap);
    orgDropdownGen++;
    wrap.classList.add('is-open');
    dropdown.hidden = false;
    LS.anim.enter(dropdown);
  }

  function closeOrgDropdown() {
    var wrap = q('.lm-org-select-wrap');
    if (!wrap || !wrap.classList.contains('is-open')) return;
    var dropdown = q('.lm-org-dropdown', wrap);
    orgDropdownGen++;
    var gen = orgDropdownGen;
    wrap.classList.remove('is-open');
    LS.anim.leave(dropdown, function () {
      if (gen === orgDropdownGen) dropdown.hidden = true;
    });
  }

  function toggleOrgDropdown() {
    var wrap = q('.lm-org-select-wrap');
    if (wrap.classList.contains('is-open')) {
      closeOrgDropdown();
    } else {
      openOrgDropdown();
    }
  }

  function selectOrg(item) {
    var dropdown = item.closest('.lm-org-dropdown');
    qa('.lm-org-dropdown__item', dropdown).forEach(function (el) {
      el.classList.remove('is-selected');
    });
    item.classList.add('is-selected');

    var wrap = item.closest('.lm-org-select-wrap');
    var trigger = q('.lm-org-select', wrap);
    q('.t-md-medium', trigger).textContent = q('.t-md-medium', item).textContent;
    q('.lm-avatar', trigger).textContent = q('.lm-avatar', item).textContent;

    closeOrgDropdown();
  }

  /* ---------- Сайдпейдж редактирования ученика ---------- */

  function openSidepage(studentName) {
    sidepageGen++;
    sidepageTitle.textContent = studentName || '{Имя Ученика}';
    sidepageOverlay.hidden = false;
    sidepage.hidden = false;
    LS.anim.enter(sidepage);
    LS.anim.enter(sidepageOverlay);
  }

  function closeSidepage() {
    sidepageGen++;
    var gen = sidepageGen;
    LS.anim.leave(sidepage, function () {
      if (gen === sidepageGen) sidepage.hidden = true;
    });
    LS.anim.leave(sidepageOverlay, function () {
      if (gen === sidepageGen) sidepageOverlay.hidden = true;
    });
  }

  /* ---------- Диалог сохранения ---------- */

  function openDialog() {
    dialogGen++;
    dialogOverlay.hidden = false;
    dialog.hidden = false;
    LS.anim.enter(dialog);
    LS.anim.enter(dialogOverlay);
  }

  function closeDialog() {
    dialogGen++;
    var gen = dialogGen;
    LS.anim.leave(dialog, function () {
      if (gen === dialogGen) dialog.hidden = true;
    });
    LS.anim.leave(dialogOverlay, function () {
      if (gen === dialogGen) dialogOverlay.hidden = true;
    });
  }

  /* ---------- Имитация сохранения: загрузка на кнопке → тост ---------- */

  var SAVE_LOADING_MS = 1200;
  var TOAST_AUTOHIDE_MS = 4000;

  function showToast() {
    toastGen++;
    clearTimeout(toastHideTimer);
    toast.hidden = false;
    LS.anim.enter(toast);
    toastHideTimer = setTimeout(hideToast, TOAST_AUTOHIDE_MS);
  }

  function hideToast() {
    clearTimeout(toastHideTimer);
    toastGen++;
    var gen = toastGen;
    LS.anim.leave(toast, function () {
      if (gen === toastGen) toast.hidden = true;
    });
  }

  function runSaveSequence() {
    var btn = q('#save-changes-btn');
    if (!btn) return;
    btn.classList.add('is-loading');
    btn.disabled = true;
    setTimeout(function () {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      showToast();
    }, SAVE_LOADING_MS);
  }

  /* ---------- Добавление / удаление ученика ---------- */

  function showAddStudent(expandedInner) {
    var inline = q('.lm-inline-edit-row', expandedInner);
    var addRow = q('.lm-add-student-row', expandedInner);
    if (!inline) return;
    inline._gen = (inline._gen || 0) + 1;
    inline.hidden = false;
    if (addRow) addRow.hidden = true;
    LS.anim.enter(inline);
    var firstInput = q('input', inline);
    if (firstInput) firstInput.focus();
  }

  function resetInlineEditInputs(inline) {
    qa('input', inline).forEach(function (input) {
      input.value = '';
    });
  }

  function hideAddStudent(inline) {
    var expandedInner = inline.closest('.lm-row__expanded-inner');
    var addRow = q('.lm-add-student-row', expandedInner);
    inline._gen = (inline._gen || 0) + 1;
    var gen = inline._gen;
    LS.anim.leave(inline, function () {
      if (gen !== inline._gen) return;
      inline.hidden = true;
      resetInlineEditInputs(inline);
    });
    if (addRow) addRow.hidden = false;
  }

  function buildStudentRow(fullName) {
    var row = document.createElement('div');
    row.className = 'lm-student-row';
    row.setAttribute('data-anim', 'student-row');
    row.setAttribute('data-anim-label', 'Строка ученика');
    row.setAttribute('data-anim-group', 'Таблица');
    row.innerHTML =
      '<span class="t-md"></span>' +
      '<div class="lm-student-row__actions" data-anim="student-row-actions" data-anim-label="Кнопки в строке ученика" data-anim-group="Таблица">' +
      '<button type="button" class="lm-btn lm-btn--icon lm-btn--secondary" data-role="edit-student" data-anim="btn-icon" data-anim-label="Icon-кнопка" data-anim-group="Контролы" aria-label="Редактировать"><svg class="lm-icon" width="20" height="20"><use href="#icon-pencil"/></svg></button>' +
      '<button type="button" class="lm-btn lm-btn--icon lm-btn--secondary" data-role="delete-student" data-anim="btn-icon" data-anim-label="Icon-кнопка" data-anim-group="Контролы" aria-label="Удалить"><svg class="lm-icon" width="20" height="20"><use href="#icon-trash"/></svg></button>' +
      '</div>';
    row.querySelector('span').textContent = fullName;
    return row;
  }

  function confirmAddStudent(inline) {
    var nameInput = q('.lm-new-student-name', inline);
    var surnameInput = q('.lm-new-student-surname', inline);
    var name = (nameInput && nameInput.value.trim()) || '';
    var surname = (surnameInput && surnameInput.value.trim()) || '';
    var fullName = (surname || name) ? (surname + ' ' + name).trim() : 'Новый Ученик';

    var newRow = buildStudentRow(fullName);
    inline.parentNode.insertBefore(newRow, inline);
    LS.anim.applyAll(); // у новых узлов те же настройки, что у остальных
    LS.anim.enter(newRow);

    hideAddStudent(inline);
  }

  function deleteStudent(studentRow) {
    LS.anim.leave(studentRow, function () {
      studentRow.remove();
    });
  }

  /* ---------- Делегирование кликов ---------- */

  function onClick(e) {
    var target = e.target;

    var orgWrap = q('.lm-org-select-wrap');
    var mockRoot = document.getElementById('mock');
    if (
      orgWrap &&
      orgWrap.classList.contains('is-open') &&
      !orgWrap.contains(target) &&
      mockRoot.contains(target)
    ) {
      closeOrgDropdown();
    }

    var chevron = target.closest('.lm-row__chevron');
    var rowMain = target.closest('.lm-row__main');
    if (chevron || rowMain) {
      var row = target.closest('.lm-row');
      if (row) toggleRow(row);
      e.preventDefault();
      return;
    }

    var anchorItem = target.closest('.lm-anchor-nav__item');
    if (anchorItem) {
      scrollToAnchor(anchorItem.getAttribute('data-anchor-target'));
      e.preventDefault();
      return;
    }

    var roleEl = target.closest('[data-role]');
    if (!roleEl) return;
    var role = roleEl.getAttribute('data-role');

    switch (role) {
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'toggle-anchor-nav':
        toggleAnchorNav();
        break;
      case 'open-save-dialog':
        openDialog();
        break;
      case 'edit-student': {
        var studentRow = roleEl.closest('.lm-student-row');
        var name = studentRow ? q('span', studentRow).textContent : '';
        openSidepage(name);
        break;
      }
      case 'delete-student': {
        var toDelete = roleEl.closest('.lm-student-row');
        if (toDelete) deleteStudent(toDelete);
        break;
      }
      case 'show-add-student': {
        var expandedInner = roleEl.closest('.lm-row__expanded-inner');
        if (expandedInner) showAddStudent(expandedInner);
        break;
      }
      case 'cancel-add-student': {
        var inlineCancel = roleEl.closest('.lm-inline-edit-row');
        if (inlineCancel) hideAddStudent(inlineCancel);
        break;
      }
      case 'confirm-add-student': {
        var inlineConfirm = roleEl.closest('.lm-inline-edit-row');
        if (inlineConfirm) confirmAddStudent(inlineConfirm);
        break;
      }
      case 'close-sidepage':
        closeSidepage();
        break;
      case 'save-sidepage':
        closeSidepage();
        break;
      case 'close-dialog':
        closeDialog();
        break;
      case 'confirm-dialog':
        closeDialog();
        runSaveSequence();
        break;
      case 'toggle-org-dropdown':
        toggleOrgDropdown();
        break;
      case 'select-org':
        selectOrg(roleEl);
        break;
      case 'toggle-theme':
        toggleTheme();
        break;
      case 'close-toast':
        hideToast();
        break;
    }
    e.preventDefault();
  }

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    if (!dialog.hidden) {
      closeDialog();
      return;
    }
    if (!sidepage.hidden) {
      closeSidepage();
      return;
    }
    closeOrgDropdown();
  }

  /* ---------- Тема: светлая/тёмная ---------- */

  var THEME_KEY = 'lemma-anim-sandbox:theme';

  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (e) {
      // localStorage недоступен — остаёмся на светлой теме по умолчанию
    }
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  function toggleTheme() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
    } catch (e) {
      // localStorage недоступен — переключение просто не переживёт перезагрузку
    }
  }

  function init() {
    sidepage = q('.lm-sidepage');
    sidepageOverlay = q('.lm-sidepage-overlay');
    sidepageTitle = q('#sidepage-title');
    dialog = q('.lm-dialog');
    dialogOverlay = q('.lm-dialog-overlay');
    toast = q('.lm-toast');

    initTheme();
    initSidebarTooltip();
    initAnchorNav();

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeydown);
  }

  return { init: init, hideSidebarTooltip: function () { hideSidebarTooltip(true); } };
})();
