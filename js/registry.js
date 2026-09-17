window.LS = window.LS || {};

// Реестры: виды перехода, изинги, каталог анимируемых элементов (Приложения B, C, E плана).
LS.registry = (function () {
  var SHIFT = '12px';
  var SCALE_FROM = '0.96';

  var transitions = {
    'fade': { label: 'Прозрачность', props: ['opacity'], from: { opacity: 0 } },
    'slide-up': { label: 'Сдвиг снизу вверх', props: ['translate'], from: { translate: '0 ' + SHIFT } },
    'slide-down': { label: 'Сдвиг сверху вниз', props: ['translate'], from: { translate: '0 -' + SHIFT } },
    'slide-left': { label: 'Сдвиг справа налево', props: ['translate'], from: { translate: SHIFT + ' 0' } },
    'slide-right': { label: 'Сдвиг слева направо', props: ['translate'], from: { translate: '-' + SHIFT + ' 0' } },
    'slide-in-right': { label: 'Выезд справа (панель)', props: ['translate'], from: { translate: '100% 0' } },
    'scale': { label: 'Масштаб', props: ['scale'], from: { scale: SCALE_FROM } },
    'rotate': { label: 'Поворот', props: ['rotate'], from: { rotate: '-180deg' } },
    'resize-width': { label: 'Изменение ширины', props: ['width'] },
    'resize-font': { label: 'Размер текста', props: ['font-size'] },
    'color-bg': { label: 'Цвет фона', props: ['background-color'] },
    'color-text': { label: 'Цвет текста', props: ['color'] },
    'color-border': { label: 'Цвет обводки', props: ['border-color'] },
    'shadow': { label: 'Тень', props: ['box-shadow'] },
    'blur': { label: 'Размытие', props: ['filter'], from: { filter: 'blur(4px)' } },
  };

  var easings = {
    'linear': { label: 'Linear', value: 'cubic-bezier(0, 0, 1, 1)' },
    'ease': { label: 'Ease', value: 'cubic-bezier(0.25, 0.1, 0.25, 1)' },
    'ease-in': { label: 'Ease In', value: 'cubic-bezier(0.42, 0, 1, 1)' },
    'ease-out': { label: 'Ease Out', value: 'cubic-bezier(0, 0, 0.58, 1)' },
    'ease-in-out': { label: 'Ease In Out', value: 'cubic-bezier(0.42, 0, 0.58, 1)' },
    'ease-in-quad': { label: 'Ease In Quad', value: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)' },
    'ease-out-quad': { label: 'Ease Out Quad', value: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' },
    'ease-in-out-quad': { label: 'Ease In Out Quad', value: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)' },
    'ease-in-cubic': { label: 'Ease In Cubic', value: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)' },
    'ease-out-cubic': { label: 'Ease Out Cubic', value: 'cubic-bezier(0.215, 0.61, 0.355, 1)' },
    'ease-in-out-cubic': { label: 'Ease In Out Cubic', value: 'cubic-bezier(0.645, 0.045, 0.355, 1)' },
    'ease-out-expo': { label: 'Ease Out Expo', value: 'cubic-bezier(0.19, 1, 0.22, 1)' },
    'ease-in-out-back': { label: 'Ease In Out Back', value: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)' },
    'custom': { label: 'Свой', value: null },
  };

  // data-anim → { label, group, recommended: [виды перехода-кандидаты] }
  var elements = {
    'sidebar': { label: 'Сайдбар', group: 'Навигация', recommended: ['resize-width'] },
    'sidebar-item': { label: 'Пункт сайдбара', group: 'Навигация', recommended: ['color-bg'] },
    'sidebar-item-label': { label: 'Подпись пункта сайдбара', group: 'Навигация', recommended: ['fade', 'slide-left'] },
    'sidebar-burger': { label: 'Кнопка сворачивания сайдбара', group: 'Навигация', recommended: ['color-text'] },
    'sidebar-item-tooltip': { label: 'Тултип пункта сайдбара', group: 'Навигация', recommended: ['fade'], mountControlled: true },
    'header-tab': { label: 'Вкладка в шапке', group: 'Навигация', recommended: ['color-bg'] },
    'header-org': { label: 'Блок организации', group: 'Навигация', recommended: ['color-bg'] },
    'header-org-chevron': { label: 'Шеврон блока организации', group: 'Навигация', recommended: ['rotate'] },
    'header-org-dropdown': { label: 'Список организаций', group: 'Навигация', recommended: ['fade', 'slide-down'], mountControlled: true },
    'header-org-item': { label: 'Пункт списка организаций', group: 'Навигация', recommended: ['color-bg'] },

    'table-row': { label: 'Строка класса', group: 'Таблица', recommended: ['color-bg'] },
    'row-chevron': { label: 'Шеврон раскрытия', group: 'Таблица', recommended: ['rotate'] },
    'row-expanded': { label: 'Раскрывающийся блок класса', group: 'Таблица', recommended: ['fade'] },
    'student-row': { label: 'Строка ученика', group: 'Таблица', recommended: ['fade', 'slide-up'], mountControlled: true },
    'student-row-actions': { label: 'Кнопки в строке ученика', group: 'Таблица', recommended: ['fade'] },
    'inline-edit-row': { label: 'Строка встроенного добавления', group: 'Таблица', recommended: ['fade', 'slide-up'], mountControlled: true },
    'add-student-row': { label: 'Строка «Добавить ученика»', group: 'Таблица', recommended: ['color-text'] },

    'btn-primary': { label: 'Кнопка Primary Accent', group: 'Контролы', recommended: ['color-bg'] },
    'btn-secondary': { label: 'Кнопка Secondary', group: 'Контролы', recommended: ['color-bg', 'color-border'] },
    'btn-ghost': { label: 'Кнопка Ghost Accent', group: 'Контролы', recommended: ['color-bg'] },
    'btn-icon': { label: 'Icon-кнопка', group: 'Контролы', recommended: ['color-bg'] },
    'input': { label: 'Текстовое поле', group: 'Контролы', recommended: ['color-border', 'shadow'] },
    'input-label': { label: 'Плавающий лейбл поля', group: 'Контролы', recommended: ['slide-up', 'resize-font', 'color-text'] },

    'sidepage': { label: 'Сайдпейдж', group: 'Слои поверх', recommended: ['slide-in-right', 'fade'], mountControlled: true },
    'sidepage-overlay': { label: 'Затемнение под сайдпейджем', group: 'Слои поверх', recommended: ['fade'], mountControlled: true },
    'dialog': { label: 'Диалог', group: 'Слои поверх', recommended: ['fade', 'scale', 'slide-down'], mountControlled: true },
    'dialog-overlay': { label: 'Затемнение под диалогом', group: 'Слои поверх', recommended: ['fade'], mountControlled: true },
    'toast': { label: 'Тост уведомления', group: 'Слои поверх', recommended: ['fade', 'slide-down'], mountControlled: true },
  };

  return { transitions: transitions, easings: easings, elements: elements };
})();
