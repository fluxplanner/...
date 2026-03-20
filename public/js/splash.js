/* ── FLUX PLANNER · splash.js — Hyperspace Orbital Laser ── */
window.runSplash = function(callback) {
  const splash = document.getElementById('splash');
  if (!splash) { callback(); return; }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', '#000810');

  splash.style.cssText = [
    'position:fixed','inset:0','background:#000810',
    'z-index:9999','overflow:hidden','display:block'
  ].join(';');

  splash.innerHTML = `<canvas id="fluxSplash" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
<div id="fluxLogo" style="
  position:absolute;inset:0;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  pointer-events:none;z-index:10;
  opacity:0;transition:opacity 1s ease;
">
  <svg width="52" height="52" viewBox="0 0 52 52" style="margin-bottom:14px;filter:drop-shadow(0 0 12px #00d4ff) drop-shadow(0 0 24px #0066ff)">
    <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(0,180,255,.15)" stroke-width="1"/>
    <circle cx="26" cy="26" r="18" fill="none" stroke="rgba(0,200,255,.28)" stroke-width="1.2"/>
    <circle cx="26" cy="26" r="12" fill="none" stroke="rgba(0,220,255,.45)" stroke-width="1.6"/>
    <circle cx="26" cy="26" r="7"  fill="none" stroke="rgba(0,240,255,.7)" stroke-width="2"/>
    <line x1="26" y1="1"  x2="26" y2="8"  stroke="#00d4ff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
    <line x1="26" y1="44" x2="26" y2="51" stroke="#00d4ff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
    <line x1="1"  y1="26" x2="8"  y2="26" stroke="#00d4ff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
    <line x1="44" y1="26" x2="51" y2="26" stroke="#00d4ff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>
    <path d="M38 8 A 24 24 0 0 1 44 18" fill="none" stroke="#00c8ff" stroke-width="2" stroke-linecap="round" opacity=".65"/>
    <path d="M14 44 A 24 24 0 0 1 8 34" fill="none" stroke="#00c8ff" stroke-width="2" stroke-linecap="round" opacity=".65"/>
    <circle cx="26" cy="26" r="10" fill="radial-gradient(circle,#00e5ff,transparent)" opacity=".35"/>
    <circle cx="26" cy="26" r="4"  fill="#00ddff" opacity=".9"/>
    <circle cx="26" cy="26" r="2"  fill="white"/>
  </svg>
  <div style="
    font-family:'Plus Jakarta Sans',system-ui,sans-serif;
    font-size:clamp(2rem,7vw,3rem);font-weight:800;
    letter-spacing:-0.04em;line-height:1;
    background:linear-gradient(90deg,#fff 0%,#00d4ff 55%,#3b82f6 100%);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  ">Flux</div>
  <div style="
    font-family:'JetBrains Mono',monospace;
    font-size:clamp(.55rem,1.5vw,.68rem);
    letter-spacing:.35em;color:rgba(0,180,255,.35);
    text-transform:uppercase;margin-top:9px;
  ">Smart School Planner</div>
</div>`;

  const canvas = document.getElementById('fluxSplash');
  const ctx    = canvas.getContext('2d');
  let W, H, cx, cy, animId;
  let tick = 0;
  let phase = 'charge'; // charge → orbit → converge → flash → done
  let chargeT   = 0;   // 0→1 over ~100 frames
  let orbitT    = 0;   // time in orbit phase (frames)
  let convergeT = 0;   // 0→1 over ~60 frames
  let flashT    = 0;   // 0→1
  let logoShown = false;

  /* ── ORBITAL RINGS ── */
  const ORBITS = [
    { rx:0.36, ry:0.14, tilt:  15, speed: 0.008, phase:0,    color:[0,200,255],  lw:1.2 },
    { rx:0.28, ry:0.20, tilt:  70, speed:-0.011, phase:1.8,  color:[80,140,255], lw:0.9 },
    { rx:0.44, ry:0.10, tilt: -25, speed: 0.006, phase:3.5,  color:[0,160,255],  lw:0.8 },
    { rx:0.20, ry:0.28, tilt: 120, speed:-0.014, phase:0.8,  color:[0,220,255],  lw:1.0 },
    { rx:0.52, ry:0.08, tilt:  50, speed: 0.005, phase:2.4,  color:[120,80,255], lw:0.7 },
  ];

  /* ── LASER BEAM ── */
  const beam = {
    angle: 0,
    speed: 0,
    targetSpeed: 0.045,
    orbitA: 0,   // semi-major
    orbitB: 0,   // semi-minor
    tiltRad: Math.PI / 6,
    // Sparks trailing the beam
    sparks: [],
  };

  /* ── HYPERSPACE STREAKS ── */
  const STREAK_COUNT = 140;
  const streaks = Array.from({ length: STREAK_COUNT }, () => ({
    angle: Math.random() * Math.PI * 2,
    dist:  Math.random() * 0.9 + 0.05,
    speed: Math.random() * 0.012 + 0.006,
    len:   Math.random() * 0.08 + 0.02,
    alpha: Math.random() * 0.5 + 0.15,
    w:     Math.random() * 1.2 + 0.3,
  }));

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W / 2; cy = H / 2;
    const r = Math.min(W, H) * 0.5;
    beam.orbitA = r * 0.55;
    beam.orbitB = r * 0.22;
  }
  resize();
  window.addEventListener('resize', resize);

  /* ── DRAW TILTED ELLIPSE ── */
  function drawTiltedEllipse(ox, oy, rx, ry, tiltDeg, alpha, lw, color) {
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(tiltDeg * Math.PI / 180);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
    ctx.lineWidth = lw;
    // Dashed for back-half depth illusion
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* ── DRAW LASER BEAM ── */
  function drawBeam(angle, alpha, blurAmount) {
    // Compute position on tilted ellipse
    const bx = cx + Math.cos(angle) * beam.orbitA;
    const by = cy + Math.sin(angle) * beam.orbitB;

    // Depth: sine of angle tells us if in front or behind
    const depth = Math.sin(angle); // -1=back, +1=front
    const beamAlpha = alpha * (0.3 + 0.7 * ((depth + 1) / 2));

    // Glow layers (back → front)
    const layers = [
      { blur: blurAmount + 18, w: 22, a: beamAlpha * 0.08 },
      { blur: blurAmount + 10, w: 12, a: beamAlpha * 0.15 },
      { blur: blurAmount + 4,  w:  6, a: beamAlpha * 0.35 },
      { blur: blurAmount,      w:  2, a: beamAlpha * 0.8  },
      { blur: 0,               w:  1, a: beamAlpha        },
    ];

    layers.forEach(({ blur, w, a }) => {
      ctx.save();
      ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
      // Beam: draw line from near-center to orbit position
      const tailFrac = 0.18;
      const tx = cx + Math.cos(angle) * beam.orbitA * tailFrac;
      const ty = cy + Math.sin(angle) * beam.orbitB * tailFrac;

      const grad = ctx.createLinearGradient(tx, ty, bx, by);
      grad.addColorStop(0, `rgba(255,255,255,0)`);
      grad.addColorStop(0.4, `rgba(160,220,255,${a * 0.5})`);
      grad.addColorStop(0.8, `rgba(0,220,255,${a})`);
      grad.addColorStop(1,   `rgba(255,255,255,${a})`);

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = grad;
      ctx.lineWidth = w * (0.6 + 0.4 * ((depth + 1) / 2));
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    });

    // Tip flare
    if (depth > -0.3) {
      ctx.save();
      ctx.filter = `blur(${3 + blurAmount * 0.3}px)`;
      const flareGrad = ctx.createRadialGradient(bx, by, 0, bx, by, 14 + chargeT * 10);
      flareGrad.addColorStop(0, `rgba(255,255,255,${beamAlpha * 0.9})`);
      flareGrad.addColorStop(0.3, `rgba(0,220,255,${beamAlpha * 0.6})`);
      flareGrad.addColorStop(1, 'rgba(0,100,255,0)');
      ctx.beginPath();
      ctx.arc(bx, by, 14 + chargeT * 10, 0, Math.PI * 2);
      ctx.fillStyle = flareGrad;
      ctx.fill();
      ctx.restore();
    }

    return { bx, by, depth };
  }

  /* ── SPAWN SPARKS ── */
  function spawnSparks(bx, by, depth) {
    if (Math.random() > 0.4 || depth < -0.2) return;
    const count = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < count; i++) {
      beam.sparks.push({
        x: bx + (Math.random() - 0.5) * 8,
        y: by + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 3.5,
        vy: (Math.random() - 0.5) * 3.5 - 0.5,
        life: 1,
        decay: Math.random() * 0.06 + 0.04,
        size: Math.random() * 2.5 + 0.8,
      });
    }
  }

  /* ── UPDATE & DRAW SPARKS ── */
  function updateSparks() {
    beam.sparks = beam.sparks.filter(s => s.life > 0);
    beam.sparks.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.08; // gravity
      s.life -= s.decay;
      const a = s.life * 0.9;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,210,255,${a})`;
      ctx.fill();
    });
  }

  /* ── HYPERSPACE STREAKS ── */
  function drawStreaks(progress) {
    if (progress < 0.001) return;
    streaks.forEach(s => {
      // Zoom outward from center
      s.dist += s.speed * (0.5 + progress * 2.5);
      if (s.dist > 1.2) {
        s.dist = 0.02 + Math.random() * 0.05;
        s.angle = Math.random() * Math.PI * 2;
      }
      const tailDist = Math.max(0, s.dist - s.len * (0.5 + progress));
      const r = Math.min(W, H);
      const sx = cx + Math.cos(s.angle) * s.dist   * r;
      const sy = cy + Math.sin(s.angle) * s.dist   * r;
      const tx = cx + Math.cos(s.angle) * tailDist * r;
      const ty = cy + Math.sin(s.angle) * tailDist * r;

      const a = s.alpha * progress * Math.min(s.dist * 4, 1);
      const grad = ctx.createLinearGradient(tx, ty, sx, sy);
      grad.addColorStop(0, `rgba(0,180,255,0)`);
      grad.addColorStop(1, `rgba(180,220,255,${a})`);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.w;
      ctx.stroke();
    });
  }

  /* ── MAIN RENDER LOOP ── */
  function frame() {
    tick++;
    ctx.clearRect(0, 0, W, H);

    /* Background */
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#001428');
    bg.addColorStop(0.5, '#000c1e');
    bg.addColorStop(1, '#000408');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* ─ PHASE: CHARGE ─ */
    if (phase === 'charge') {
      chargeT = Math.min(chargeT + 0.012, 1);
      beam.speed += (beam.targetSpeed * chargeT - beam.speed) * 0.06;

      // Occasional "lock-on" snap
      if (tick % 38 === 0 && chargeT > 0.4) {
        beam.speed += 0.025;
      }

      drawHyperspace(chargeT * 0.5);
      drawOrbits(chargeT);
      const { bx, by, depth } = drawBeam(beam.angle, chargeT, 4 - chargeT * 3);
      spawnSparks(bx, by, depth);
      updateSparks();
      drawCore(chargeT);
      beam.angle += beam.speed;

      if (chargeT >= 1) {
        phase = 'orbit';
      }
    }

    /* ─ PHASE: ORBIT ─ */
    else if (phase === 'orbit') {
      orbitT++;

      // Occasional snap/lock
      if (orbitT % 55 === 0) beam.speed = beam.targetSpeed * (1 + Math.random() * 0.3);
      beam.speed += (beam.targetSpeed - beam.speed) * 0.03;

      drawHyperspace(0.5 + Math.sin(orbitT * 0.02) * 0.1);
      drawOrbits(1);
      const { bx, by, depth } = drawBeam(beam.angle, 1, 0);
      spawnSparks(bx, by, depth);
      updateSparks();
      drawCore(1);
      beam.angle += beam.speed;

      if (!logoShown) {
        logoShown = true;
        document.getElementById('fluxLogo').style.opacity = '1';
      }

      if (orbitT > 100) {
        phase = 'converge';
      }
    }

    /* ─ PHASE: CONVERGE ─ */
    else if (phase === 'converge') {
      convergeT = Math.min(convergeT + 0.028, 1);

      // Beam spirals inward
      const rFac = 1 - convergeT;
      const savedA = beam.orbitA, savedB = beam.orbitB;
      beam.orbitA *= rFac; beam.orbitB *= rFac;
      beam.speed = beam.targetSpeed * (1 + convergeT * 3);

      drawHyperspace(0.5 * rFac);
      drawOrbits(rFac);
      drawBeam(beam.angle, rFac, 0);
      updateSparks();
      drawCore(1);
      beam.angle += beam.speed;

      beam.orbitA = savedA; beam.orbitB = savedB;

      if (convergeT >= 1) {
        phase = 'flash';
        document.getElementById('fluxLogo').style.opacity = '0';
      }
    }

    /* ─ PHASE: FLASH ─ */
    else if (phase === 'flash') {
      flashT = Math.min(flashT + 0.06, 1);

      // Flash expands then fades
      const flashProgress = flashT < 0.5 ? flashT * 2 : 2 - flashT * 2;
      ctx.fillStyle = `rgba(0,200,255,${flashProgress * 0.7})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${flashProgress * 0.35})`;
      ctx.fillRect(0, 0, W, H);

      if (flashT >= 1) {
        phase = 'done';
      }
    }

    /* ─ PHASE: DONE ─ */
    else if (phase === 'done') {
      // Handled by the exit timeout below
    }

    animId = requestAnimationFrame(frame);
  }

  /* ── DRAW ORBIT RINGS ── */
  function drawOrbits(alpha) {
    ORBITS.forEach(orb => {
      const rx = orb.rx * Math.min(W, H) * 0.95;
      const ry = orb.ry * Math.min(W, H) * 0.95;

      // Draw the ellipse in segments: back half dashed/faint, front half solid/bright
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(orb.tiltRad || orb.tilt * Math.PI / 180);

      // Back half (dashed, faint)
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = `rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},${alpha * 0.18})`;
      ctx.lineWidth = orb.lw;
      ctx.stroke();

      // Front half (solid, brighter)
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},${alpha * 0.45})`;
      ctx.lineWidth = orb.lw * 1.2;
      ctx.stroke();

      ctx.restore();

      // Animate a small glowing dot around each orbit (like a satellite)
      orb.phase += orb.speed;
      const dotX = cx + Math.cos(orb.phase) * rx * Math.cos(orb.tilt * Math.PI / 180)
                      - Math.sin(orb.phase) * ry * Math.sin(orb.tilt * Math.PI / 180);
      const dotY = cy + Math.cos(orb.phase) * rx * Math.sin(orb.tilt * Math.PI / 180)
                      + Math.sin(orb.phase) * ry * Math.cos(orb.tilt * Math.PI / 180);
      const dotDepth = Math.sin(orb.phase);
      const dotA = alpha * (0.3 + 0.7 * ((dotDepth + 1) / 2));

      ctx.save();
      ctx.filter = `blur(${dotDepth < 0 ? 2 : 0}px)`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5 * dotA, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${orb.color[0]},${orb.color[1]},${orb.color[2]},${dotA * 0.9})`;
      ctx.fill();
      ctx.restore();
    });
  }

  /* ── DRAW HYPERSPACE ── */
  function drawHyperspace(progress) {
    drawStreaks(progress);
  }

  /* ── DRAW CENTER CORE ── */
  function drawCore(alpha) {
    // Outer glow
    const pulse = 0.7 + Math.sin(tick * 0.08) * 0.3;
    ctx.save();
    ctx.filter = `blur(${12 * alpha}px)`;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60 * alpha * pulse);
    cg.addColorStop(0, `rgba(0,210,255,${alpha * 0.3})`);
    cg.addColorStop(0.5, `rgba(0,120,255,${alpha * 0.12})`);
    cg.addColorStop(1, 'rgba(0,50,200,0)');
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Inner bright core
    ctx.save();
    const innerR = 6 * alpha * pulse;
    const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR + 8);
    innerGrad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    innerGrad.addColorStop(0.3, `rgba(0,230,255,${alpha * 0.8})`);
    innerGrad.addColorStop(1, 'rgba(0,100,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, innerR + 8, 0, Math.PI * 2);
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.restore();
  }

  animId = requestAnimationFrame(frame);

  /* ── EXIT ── */
  // Total: charge ~83 frames + orbit 100 frames + converge ~36 frames + flash ~17 frames
  // ≈ ~4s at 60fps. Give it 4.2s then fade.
  setTimeout(() => {
    window.removeEventListener('resize', resize);
    cancelAnimationFrame(animId);
    splash.style.transition = 'opacity .55s ease';
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      splash.innerHTML = '';
      callback();
    }, 560);
  }, 4200);
};
