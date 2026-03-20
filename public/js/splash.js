/* ── FLUX PLANNER · splash.js ── */
window.runSplash = function(callback) {
  const splash = document.getElementById('splash');
  if (!splash) { callback(); return; }

  // Fix purple status bar
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', '#0c0d12');

  splash.style.cssText = 'position:fixed;inset:0;background:#0c0d12;z-index:9999;overflow:hidden;display:block';

  splash.innerHTML = `
    <canvas id="splashCanvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>

    <div style="
      position:absolute;inset:0;
      display:flex;flex-direction:column;
      align-items:center;justify-content:center;
      pointer-events:none;
      text-align:center;
    ">
      <!-- Glow ring behind logo -->
      <div id="splRing" style="
        position:absolute;
        width:260px;height:260px;
        border-radius:50%;
        border:1px solid rgba(99,102,241,0);
        opacity:0;
        transform:scale(0.4);
        transition:opacity .5s ease, transform 1s cubic-bezier(.16,1,.3,1), border-color .5s ease;
      "></div>

      <!-- FLUX — single element, no letter spacing issues -->
      <div id="splFlux" style="
        font-family:'Plus Jakarta Sans',sans-serif;
        font-size:clamp(4.5rem,15vw,7rem);
        font-weight:800;
        letter-spacing:-0.03em;
        line-height:1;
        background:linear-gradient(135deg,#6366f1 0%,#a78bfa 55%,#10d9a0 100%);
        -webkit-background-clip:text;
        -webkit-text-fill-color:transparent;
        background-clip:text;
        opacity:0;
        transform:translateY(40px) scale(0.85);
        transition:opacity .6s cubic-bezier(.16,1,.3,1), transform .7s cubic-bezier(.16,1,.3,1);
        display:block;
        width:100%;
      ">FLUX</div>

      <!-- PLANNER — centered directly below, same width context -->
      <div id="splPl" style="
        font-family:'JetBrains Mono',monospace;
        font-size:clamp(.65rem,2vw,.9rem);
        font-weight:400;
        color:#4a5070;
        letter-spacing:0.45em;
        text-transform:uppercase;
        margin-top:10px;
        opacity:0;
        transform:translateY(12px) scaleX(0.7);
        transition:opacity .5s ease .45s, transform .6s cubic-bezier(.16,1,.3,1) .45s;
        display:block;
        width:100%;
      ">PLANNER</div>

      <!-- Tagline -->
      <div id="splSub" style="
        font-family:'JetBrains Mono',monospace;
        font-size:.58rem;
        letter-spacing:0.25em;
        color:#2a3050;
        text-transform:uppercase;
        margin-top:28px;
        opacity:0;
        transition:opacity .5s ease .9s;
      ">YOUR SMART SCHOOL PLANNER</div>

      <!-- Dots -->
      <div id="splDots" style="display:flex;gap:8px;margin-top:32px;opacity:0;transition:opacity .4s ease 1.1s">
        <div style="width:6px;height:6px;border-radius:50%;background:#6366f1;animation:spB 1.3s ease-in-out infinite"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:#a78bfa;animation:spB 1.3s ease-in-out .22s infinite"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:#10d9a0;animation:spB 1.3s ease-in-out .44s infinite"></div>
      </div>
    </div>

    <style>
      @keyframes spB {
        0%,60%,100% { transform:translateY(0);opacity:.3 }
        30% { transform:translateY(-10px);opacity:1 }
      }
    </style>
  `;

  // ── Canvas ──────────────────────────────────────────────────
  const canvas = document.getElementById('splashCanvas');
  const ctx    = canvas.getContext('2d');
  let W = 0, H = 0, animId, tick = 0;

  function resize() {
    W = canvas.width  = splash.offsetWidth  || window.innerWidth;
    H = canvas.height = splash.offsetHeight || window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#6366f1','#a78bfa','#10d9a0','#3b82f6','#e879f9','#fbbf24'];

  const pts = Array.from({length: 75}, () => ({
    x: Math.random() * W, y: Math.random() * H,
    r: Math.random() * 1.8 + 0.2,
    dx: (Math.random() - .5) * .4,
    dy: (Math.random() - .5) * .4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    a: Math.random() * .45 + .05
  }));

  const stars = [];
  function spawnStar() {
    stars.push({
      x: Math.random() * W * 0.8,
      y: Math.random() * H * 0.4,
      len: Math.random() * 130 + 60,
      speed: Math.random() * 5 + 4,
      angle: Math.PI / 4 + (Math.random() - .5) * .25,
      life: 0,
      maxLife: Math.random() * 28 + 20
    });
  }

  const ripples = [];
  function spawnRipple() {
    ripples.push({ x: W/2, y: H/2, r: 10, alpha: 0.3 });
  }

  function frame() {
    tick++;
    ctx.clearRect(0, 0, W, H);

    // Particle connections
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 100) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(99,102,241,${(1-d/100)*.06})`;
          ctx.lineWidth = .4;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }

    // Particles
    pts.forEach(p => {
      p.x += p.dx; p.y += p.dy;
      if (p.x < 0 || p.x > W) p.dx *= -1;
      if (p.y < 0 || p.y > H) p.dy *= -1;
      const pulse = 0.8 + Math.sin(tick * 0.04 + p.x * 0.01) * 0.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI*2);
      ctx.fillStyle = p.color + Math.floor(p.a * 255).toString(16).padStart(2,'0');
      ctx.fill();
    });

    // Ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 3;
      rp.alpha *= 0.93;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(99,102,241,${rp.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (rp.alpha < 0.004) ripples.splice(i, 1);
    }

    // Shooting stars
    if (tick % 60 === 0) spawnStar();
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      s.life++;
      const pct = s.life / s.maxLife;
      const alpha = pct < .2 ? pct/.2 : Math.max(0, 1 - (pct-.2)/.8);
      const ox = Math.cos(s.angle) * s.speed * s.life;
      const oy = Math.sin(s.angle) * s.speed * s.life;
      const ex = s.x + Math.cos(s.angle) * s.len;
      const ey = s.y + Math.sin(s.angle) * s.len;
      const grad = ctx.createLinearGradient(s.x + ox, s.y + oy, ex + ox, ey + oy);
      grad.addColorStop(0, `rgba(255,255,255,0)`);
      grad.addColorStop(1, `rgba(255,255,255,${alpha * .85})`);
      ctx.beginPath();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.moveTo(s.x + ox, s.y + oy);
      ctx.lineTo(ex + ox, ey + oy);
      ctx.stroke();
      if (s.life >= s.maxLife) stars.splice(i, 1);
    }

    // Center glow
    const grd = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 180);
    const ga = (0.05 + Math.sin(tick * 0.025) * 0.025).toFixed(3);
    grd.addColorStop(0, `rgba(99,102,241,${ga})`);
    grd.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    animId = requestAnimationFrame(frame);
  }
  animId = requestAnimationFrame(frame);

  // ── Reveal sequence ─────────────────────────────────────────
  const show = (id, delay) => setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.opacity = '1';
    el.style.transform = 'none';
  }, delay);

  setTimeout(() => spawnRipple(), 220);
  setTimeout(() => spawnRipple(), 520);
  setTimeout(() => spawnRipple(), 900);

  show('splFlux', 200);
  show('splPl',   520);
  show('splSub',  900);
  show('splDots', 1100);

  setTimeout(() => {
    const ring = document.getElementById('splRing');
    if (ring) {
      ring.style.opacity = '1';
      ring.style.transform = 'scale(1)';
      ring.style.borderColor = 'rgba(99,102,241,0.18)';
    }
  }, 280);

  // ── Exit ────────────────────────────────────────────────────
  setTimeout(() => {
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animId);
    splash.style.transition = 'opacity .55s ease';
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      callback();
    }, 560);
  }, 3000);
};
