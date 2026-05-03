/**
 * Flux + anime.js v4 — scroll-synced SVG draws, staggers, and light shell motion.
 * Respects prefers-reduced-motion and data-flux-perf="on" (snappy mode).
 */
(function () {
  'use strict';

  /** @type {Array<{revert:()=>unknown}>} */
  let loginRevertibles = [];
  /** @type {Array<{revert:()=>unknown}>} */
  let appShellRevertibles = [];
  /** @type {Array<{revert:()=>unknown}>} */
  let appPanelRevertibles = [];
  let appShellAnimated = false;

  function lib() {
    return typeof anime !== 'undefined' ? anime : null;
  }

  function reducedMotion() {
    try {
      return matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function perfSnappy() {
    try {
      return document.documentElement.getAttribute('data-flux-perf') === 'on';
    } catch (_) {
      return false;
    }
  }

  function skipMotion() {
    return reducedMotion() || perfSnappy() || !lib();
  }

  function track(arr, obj) {
    if (obj && typeof obj.revert === 'function') arr.push(obj);
  }

  function revertAll(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      try {
        arr[i].revert();
      } catch (_) {}
    }
    arr.length = 0;
  }

  function ensureLoginSvgLayer(loginRoot) {
    let el = document.getElementById('loginAnimeSvg');
    if (el) return el;
    const ns = 'http://www.w3.org/2000/svg';
    el = document.createElementNS(ns, 'svg');
    el.id = 'loginAnimeSvg';
    el.setAttribute('class', 'login-anime-layer');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('viewBox', '0 0 1200 800');
    el.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    const strokes = [
      { d: 'M-40,420 C180,280 320,520 520,380 S920,200 1240,340', c: 'rgba(0,194,255,0.38)' },
      { d: 'M60,720 C260,600 400,760 620,620 S980,480 1280,560', c: 'rgba(124,92,255,0.3)' },
      { d: 'M-20,180 C200,80 380,240 560,120 S880,-40 1180,100', c: 'rgba(34,255,136,0.22)' },
      { d: 'M200,800 C400,640 540,880 760,700 S1000,620 1220,780', c: 'rgba(0,194,255,0.26)' },
      { d: 'M-60,560 C140,440 300,600 480,500 S840,360 1160,480', c: 'rgba(192,132,252,0.28)' },
      { d: 'M400,-20 C520,120 680,80 820,200 S1080,320 1220,140', c: 'rgba(99,102,241,0.32)' }
    ];
    strokes.forEach(function (s) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', s.d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', s.c);
      p.setAttribute('stroke-width', '1.25');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      el.appendChild(p);
    });
    const particles = document.getElementById('loginParticles');
    if (particles && particles.parentNode === loginRoot) {
      loginRoot.insertBefore(el, particles.nextSibling);
    } else {
      loginRoot.insertBefore(el, loginRoot.firstChild);
    }
    return el;
  }

  window.teardownFluxAnimeLogin = function () {
    revertAll(loginRevertibles);
    const svg = document.getElementById('loginAnimeSvg');
    if (svg) svg.remove();
  };

  window.initFluxAnimeLogin = function () {
    const L = lib();
    const loginRoot = document.getElementById('loginScreen');
    if (skipMotion() || !L || !loginRoot || !loginRoot.classList.contains('visible')) return;

    window.teardownFluxAnimeLogin();

    try {
      ensureLoginSvgLayer(loginRoot);
      const drawables = L.svg.createDrawable('#loginAnimeSvg path');
      const canScroll = loginRoot.scrollHeight > loginRoot.clientHeight + 32;
      const scrollCtl = canScroll
        ? L.onScroll({ target: loginRoot, sync: true })
        : null;

      const lineAnim = L.animate(drawables, {
        draw: ['0 0', '0 1', '1 1'],
        duration: canScroll ? 5200 : 2600,
        ease: 'inOut(3)',
        delay: L.stagger(75, { from: 'first' }),
        loop: !canScroll,
        alternate: !canScroll,
        autoplay: scrollCtl === null ? true : scrollCtl
      });
      track(loginRevertibles, lineAnim);
      if (scrollCtl) track(loginRevertibles, scrollCtl);
    } catch (e) {
      console.warn('flux-anime: login lines', e);
    }

    try {
      const tag = loginRoot.querySelector('.login-tagline');
      if (tag) {
        const pulse = L.animate(tag, {
          letterSpacing: ['0.2em', '0.34em'],
          opacity: [0.78, 1],
          duration: 2200,
          direction: 'alternate',
          loop: true,
          ease: 'inOut(2)'
        });
        track(loginRevertibles, pulse);
      }
    } catch (_) {}

    try {
      const spots = loginRoot.querySelectorAll('.login-spotlight-item');
      if (spots.length) {
        const canScroll = loginRoot.scrollHeight > loginRoot.clientHeight + 32;
        const sc = canScroll ? L.onScroll({ target: loginRoot, sync: true }) : null;
        const sp = L.animate(spots, {
          translateY: [10, 0],
          opacity: [0.5, 1],
          duration: 640,
          ease: 'out(3)',
          delay: L.stagger(42, { from: 'first' }),
          autoplay: sc === null ? true : sc
        });
        track(loginRevertibles, sp);
        if (sc) track(loginRevertibles, sc);
      }
    } catch (_) {}

    try {
      const pills = loginRoot.querySelectorAll('#featPillsLoginCard .feat-pill');
      if (pills.length) {
        const pillAnim = L.animate(pills, {
          scale: [0.92, 1],
          opacity: [0.65, 1],
          duration: 480,
          delay: L.stagger(28, { from: 'first' }),
          ease: 'out(3)'
        });
        track(loginRevertibles, pillAnim);
      }
    } catch (_) {}
  };

  function animateActivePanelCards() {
    const L = lib();
    const app = document.getElementById('app');
    if (skipMotion() || !L || !app || !app.classList.contains('visible')) return;

    revertAll(appPanelRevertibles);

    const main = document.getElementById('flux-main');
    const panel = main && main.querySelector('.panel.active');
    const cards = panel ? panel.querySelectorAll('.card') : [];
    if (!cards.length) return;

    try {
      const cardA = L.animate(cards, {
        translateY: [10, 0],
        opacity: [0.94, 1],
        duration: 560,
        delay: L.stagger(34, { from: 'first' }),
        ease: 'out(3)',
        autoplay: true
      });
      track(appPanelRevertibles, cardA);
    } catch (_) {}
  }

  window.teardownFluxAnimeApp = function () {
    revertAll(appShellRevertibles);
    revertAll(appPanelRevertibles);
    appShellAnimated = false;
  };

  window.initFluxAnimeApp = function () {
    const L = lib();
    const app = document.getElementById('app');
    if (skipMotion() || !L || !app || !app.classList.contains('visible')) return;

    if (!appShellAnimated) {
      try {
        const navItems = document.querySelectorAll('#sidebar .nav-item');
        if (navItems.length) {
          const navA = L.animate(navItems, {
            translateX: [-10, 0],
            duration: 520,
            delay: L.stagger(28, { from: 'first' }),
            ease: 'out(3)'
          });
          track(appShellRevertibles, navA);
        }
      } catch (_) {}
      appShellAnimated = true;
    }

    animateActivePanelCards();
  };

  /** After tab change — stagger cards in the newly active panel */
  window.fluxAnimeNavAfter = function () {
    animateActivePanelCards();
  };
})();
