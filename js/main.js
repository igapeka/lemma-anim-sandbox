window.LS = window.LS || {};

document.addEventListener('DOMContentLoaded', function () {
  LS.mock.init();
  LS.toolbar.init();
  LS.inspector.init();
  LS.export.init();
  LS.anim.applyAll();
});
