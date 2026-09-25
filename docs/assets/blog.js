(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Схемы в статьях: просмотр крупно.

     В колонке текста схема шириной 1200 точек ужимается до ~760, а на
     телефоне до ~340 — подписи становятся нечитаемыми. По клику схема
     открывается поверх страницы:
       • на широком экране — вписанной в окно, по кнопке «Крупнее» —
         в полтора раза больше натуральной величины, с прокруткой;
       • на телефоне — сразу в натуральную величину, двигается пальцем.
     Закрыть — крестик, Esc или клик мимо схемы.

     Обычные фотографии не увеличиваются: ссылка a.scheme-zoom есть
     только у схем (её ставит сборка, scripts/blog-bundle.js).
     --------------------------------------------------------------------- */

  var links = document.querySelectorAll('a.scheme-zoom');
  if (!links.length) return;

  var NARROW = window.matchMedia('(max-width: 900px)');

  var box = document.createElement('div');
  box.className = 'lightbox';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Схема крупно');
  box.innerHTML =
    '<div class="lightbox__bar">' +
      '<button type="button" class="lightbox__btn" data-lightbox-zoom></button>' +
      '<button type="button" class="lightbox__btn lightbox__close" data-lightbox-close aria-label="Закрыть">' +
        '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 2l14 14M16 2L2 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="lightbox__stage" data-lightbox-stage><img class="lightbox__img" alt="" /></div>';
  document.body.appendChild(box);

  var stage = box.querySelector('[data-lightbox-stage]');
  var img = box.querySelector('.lightbox__img');
  var zoomBtn = box.querySelector('[data-lightbox-zoom]');
  var closeBtn = box.querySelector('[data-lightbox-close]');
  var returnFocus = null;

  function setZoomed(zoomed) {
    box.classList.toggle('is-zoomed', zoomed);
    zoomBtn.textContent = zoomed ? 'Вписать в экран' : 'Крупнее';
    zoomBtn.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
  }

  function open(link) {
    returnFocus = link;
    img.src = link.getAttribute('href');
    img.alt = (link.querySelector('img') || {}).alt || '';
    // На телефоне вписанная схема — те же нечитаемые 340 точек,
    // поэтому сразу натуральная величина.
    setZoomed(NARROW.matches);
    box.hidden = false;
    document.body.classList.add('lightbox-open');
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    box.hidden = true;
    document.body.classList.remove('lightbox-open');
    img.removeAttribute('src');
    if (returnFocus) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener('click', function (e) {
      // Ctrl/Cmd-клик — как обычная ссылка, в новой вкладке.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      open(link);
    });
  });

  zoomBtn.addEventListener('click', function () {
    setZoomed(!box.classList.contains('is-zoomed'));
  });
  closeBtn.addEventListener('click', close);

  // Клик по самой схеме переключает масштаб, мимо неё — закрывает.
  stage.addEventListener('click', function (e) {
    if (e.target === img) setZoomed(!box.classList.contains('is-zoomed'));
    else close();
  });

  document.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      // фокус не уходит со страницы под затемнением
      e.preventDefault();
      (document.activeElement === closeBtn ? zoomBtn : closeBtn).focus();
    }
  });
})();
