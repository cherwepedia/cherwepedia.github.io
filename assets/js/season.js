/*!
 * Осень: тыквы на «дне» шапки главной. Больше никаких эффектов.
 * Проверка вручную: ?season=autumn (показать) или ?season=off (скрыть).
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search).get('season');
  var m = new Date().getMonth(); // 8..10 = сентябрь–ноябрь
  var autumn = q === 'autumn' || (q !== 'off' && m >= 8 && m <= 10);
  var hero = document.querySelector('[data-hero]');
  if (!autumn || !hero) return;

  var SVG = '<svg class="pumpkin" viewBox="0 0 100 84" aria-hidden="true">' +
    '<ellipse cx="29" cy="52" rx="26" ry="29" fill="#cf9a62"/><ellipse cx="71" cy="52" rx="26" ry="29" fill="#cf9a62"/>' +
    '<ellipse cx="50" cy="52" rx="24" ry="31" fill="#dcaa72"/><ellipse cx="36" cy="52" rx="14" ry="30" fill="#d4a068"/><ellipse cx="64" cy="52" rx="14" ry="30" fill="#d4a068"/>' +
    '<path d="M50 22 C47 12 52 8 58 5" fill="none" stroke="#8c9a74" stroke-width="5" stroke-linecap="round"/>' +
    '<path d="M58 6 C66 6 70 12 66 16" fill="none" stroke="#9aa886" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M22 40 C18 55 22 68 30 76 M78 40 C82 55 78 68 70 76" fill="none" stroke="rgba(120,80,40,.18)" stroke-width="2"/></svg>';

  var box = document.createElement('div');
  box.className = 'hero-fx';
  box.setAttribute('aria-hidden', 'true');
  [['left:10px;width:96px'], ['left:92px;width:56px'], ['right:12px;width:84px'], ['right:86px;width:48px']].forEach(function (s) {
    var d = document.createElement('div');
    d.innerHTML = SVG;
    d.firstChild.setAttribute('style', s[0]);
    box.appendChild(d.firstChild);
  });
  hero.insertBefore(box, hero.firstChild);
})();
