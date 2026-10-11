/*!
 * Осень: одна тыква в левом нижнем углу шапки главной.
 * Проверка вручную: ?season=autumn (показать) или ?season=off (скрыть).
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search).get('season');
  var m = new Date().getMonth(); // 8..10 = сентябрь–ноябрь
  var autumn = q === 'autumn' || (q !== 'off' && m >= 8 && m <= 10);
  var hero = document.querySelector('[data-hero]');
  if (!autumn || !hero) return;
  var base = document.body.getAttribute('data-base') || '';
  var box = document.createElement('div');
  box.className = 'hero-fx';
  box.setAttribute('aria-hidden', 'true');
  var img = new Image();
  img.className = 'pumpkin';
  img.alt = '';
  img.width = 88;
  img.decoding = 'async';
  img.src = base + '/assets/img/pumpkin.png';
  box.appendChild(img);
  hero.insertBefore(box, hero.firstChild);
})();
