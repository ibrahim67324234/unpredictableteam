/* FLL Robot Game simulator core — physics, sensors and the robot API.
   Loaded as a classic script both in the page (window.SimCore) and in the program worker (self.SimCore).
   Units: millimetres, degrees, milliseconds. Screen coordinates: x → right, y ↓ down, heading 0 = facing right,
   positive angles rotate clockwise on screen (a right turn). */
(function (G) {
  'use strict';
  const TABLE = { w: 2362, h: 1143 };
  const ROBOT = {
    halfL: 100, halfW: 80, track: 112, wheelD: 56, wheelW: 16, wheelL: 56,
    colorPos: [75, 0], distPos: [100, 0],
    bumper: { x0: 100, x1: 110, hw: 45 },
    // Side sweeper arms, folded back along the body at 0°. Positive degrees swing them outward; 180° points them forward.
    arms: { C: { px: 92, py: -80, len: 110, rest: 180, dir: 1, w: 12 }, D: { px: 92, py: 80, len: 110, rest: 180, dir: -1, w: 12 } }
  };
  const DT = 5;
  const COLORS = { black: '#1b1b1b', white: '#ffffff', red: '#e53935', green: '#2e9d4f', blue: '#1e63d6', yellow: '#fbd52f', violet: '#8e44ad', azure: '#35b8e8' };
  const COLOR_AR = { black: 'أسود', white: 'أبيض', red: 'أحمر', green: 'أخضر', blue: 'أزرق', yellow: 'أصفر', violet: 'بنفسجي', azure: 'لبني' };
  const REFL = { black: 7, white: 98, red: 60, green: 22, blue: 26, yellow: 82, violet: 30, azure: 55 };
  const DEG_PER_PCT = 10;   // 100% ≈ 1000°/s (SPIKE large motor ≈ 1050°/s)
  const ACCEL = 8000;       // °/s²
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const ZONES = ['zone', 'line', 'circle', 'ring'];
  const OBSTACLES = ['wall', 'box', 'pillar'];
  const isZone = it => ZONES.includes(it.kind);
  const isObstacle = it => OBSTACLES.includes(it.kind);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- geometry ----------
  function rectPoly(cx, cy, w, h, rot) {
    const c = Math.cos(rot * RAD), s = Math.sin(rot * RAD), hw = w / 2, hh = h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  }
  function circlePoly(cx, cy, r, n = 16) {
    const out = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  }
  function itemPoly(it) {
    if (it.kind === 'pillar' || it.kind === 'circle') return circlePoly(it.x, it.y, it.r);
    return rectPoly(it.x, it.y, it.w, it.h, it.rot || 0);
  }
  function toWorld(pose, lx, ly) {
    const c = Math.cos(pose.h * RAD), s = Math.sin(pose.h * RAD);
    return [pose.x + lx * c - ly * s, pose.y + lx * s + ly * c];
  }
  function localPoly(pose, pts) { return pts.map(([x, y]) => toWorld(pose, x, y)); }
  function bodyPoly(pose) { const L = ROBOT.halfL, W = ROBOT.halfW; return localPoly(pose, [[-L, -W], [L, -W], [L, W], [-L, W]]); }
  function bumperPoly(pose, extra = 0) { const b = ROBOT.bumper; return localPoly(pose, [[b.x0 - 2, -b.hw], [b.x1 + extra, -b.hw], [b.x1 + extra, b.hw], [b.x0 - 2, b.hw]]); }
  function armPoly(pose, port, motorPos) {
    const a = ROBOT.arms[port], ang = (a.rest + a.dir * motorPos) * RAD, c = Math.cos(ang), s = Math.sin(ang), hw = a.w / 2;
    const pts = [[0, -hw], [a.len, -hw], [a.len, hw], [0, hw]].map(([x, y]) => [a.px + x * c - y * s, a.py + x * s + y * c]);
    return localPoly(pose, pts);
  }
  function armTip(pose, port, motorPos) {
    const a = ROBOT.arms[port], ang = (a.rest + a.dir * motorPos) * RAD;
    return { pivot: toWorld(pose, a.px, a.py), tip: toWorld(pose, a.px + a.len * Math.cos(ang), a.py + a.len * Math.sin(ang)) };
  }
  function project(poly, ax, ay) {
    let mn = Infinity, mx = -Infinity;
    for (const p of poly) { const d = p[0] * ax + p[1] * ay; if (d < mn) mn = d; if (d > mx) mx = d; }
    return [mn, mx];
  }
  function centroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; } return [x / poly.length, y / poly.length]; }
  // Separating Axis Test. Returns null when separated, else { depth, nx, ny } with the normal pointing from A to B.
  function sat(A, B) {
    let best = Infinity, bx = 0, by = 0;
    for (const P of [A, B]) {
      for (let i = 0; i < P.length; i++) {
        const p1 = P[i], p2 = P[(i + 1) % P.length];
        let ax = p2[1] - p1[1], ay = p1[0] - p2[0];
        const len = Math.hypot(ax, ay); if (len < 1e-9) continue; ax /= len; ay /= len;
        const [a0, a1] = project(A, ax, ay), [b0, b1] = project(B, ax, ay);
        const o = Math.min(a1, b1) - Math.max(a0, b0);
        if (o <= 0) return null;
        if (o < best) { best = o; bx = ax; by = ay; }
      }
    }
    const ca = centroid(A), cb = centroid(B);
    if ((cb[0] - ca[0]) * bx + (cb[1] - ca[1]) * by < 0) { bx = -bx; by = -by; }
    return { depth: best, nx: bx, ny: by };
  }
  const pen = (A, B) => { const s = sat(A, B); return s ? s.depth : 0; };
  function outside(poly) {
    let d = 0;
    for (const [x, y] of poly) d = Math.max(d, -x, -y, x - TABLE.w, y - TABLE.h);
    return d;
  }
  function pointInItem(it, x, y) {
    if (it.kind === 'circle' || it.kind === 'pillar') return Math.hypot(x - it.x, y - it.y) <= it.r;
    if (it.kind === 'ring') { const d = Math.hypot(x - it.x, y - it.y); return Math.abs(d - it.r) <= it.w / 2; }
    const c = Math.cos(-(it.rot || 0) * RAD), s = Math.sin(-(it.rot || 0) * RAD), dx = x - it.x, dy = y - it.y;
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2;
  }
  function raySeg(ox, oy, dx, dy, p1, p2) {
    const ex = p2[0] - p1[0], ey = p2[1] - p1[1];
    const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) return Infinity;
    const t = ((p1[0] - ox) * ey - (p1[1] - oy) * ex) / den;
    const u = ((p1[0] - ox) * dy - (p1[1] - oy) * dx) / den;
    return t >= 0 && u >= 0 && u <= 1 ? t : Infinity;
  }

  // ---------- world ----------
  function newMotor() { return { pos: 0, vel: 0, want: 0, mode: 'hold', target: 0, goal: 0, cruise: 0, stallMs: 0, stalled: false, done: true }; }
  function rng(world) { world.seed = (world.seed * 1664525 + 1013904223) >>> 0; return world.seed / 4294967296; }
  function createWorld({ items = [], robot = { x: 250, y: 571, h: 0 }, realism = false, seed = Date.now() } = {}) {
    const w = {
      t: 0, t0: 0, robot: { x: robot.x, y: robot.y, h: robot.h },
      motors: { A: newMotor(), B: newMotor(), C: newMotor(), D: newMotor() },
      items: JSON.parse(JSON.stringify(items)),
      yawZero: robot.h, drift: 0, driftRate: 0, realism: !!realism,
      wheelScale: { A: 1, B: 1 }, force: 0, contact: false, seed: seed >>> 0, accel: ACCEL
    };
    if (w.realism) {
      w.wheelScale.A = 1 + (rng(w) - 0.5) * 0.03;
      w.wheelScale.B = 1 + (rng(w) - 0.5) * 0.03;
      w.driftRate = (rng(w) - 0.5) * 0.12;
    }
    return w;
  }
  function motorDelta(mt, dt, accel = ACCEL) {
    mt.justDone = false;
    let want = 0;
    if (mt.mode === 'speed') want = mt.target;
    else if (mt.mode === 'goto') {
      const rem = mt.goal - mt.pos;
      const vmax = Math.sqrt(2 * accel * 0.7 * Math.abs(rem));
      want = Math.sign(rem) * Math.min(mt.cruise, Math.max(40, vmax));
    }
    mt.want = want;
    const maxDv = accel * dt;
    mt.vel += clamp(want - mt.vel, -maxDv, maxDv);
    let d = mt.vel * dt;
    if (mt.mode === 'goto') {
      const rem = mt.goal - mt.pos;
      if (Math.abs(rem) < 0.5 || (Math.sign(d) === Math.sign(rem) && Math.abs(d) >= Math.abs(rem))) { d = rem; mt.vel = 0; mt.mode = 'hold'; mt.done = true; mt.justDone = true; }
    }
    return d;
  }
  function stallUpdate(mt, blocked, dtMs) {
    const trying = mt.mode === 'speed' ? Math.abs(mt.target) > 0 : mt.mode === 'goto';
    if (blocked && trying) { mt.stallMs += dtMs; mt.vel = 0; } else mt.stallMs = 0;
    mt.stalled = mt.stallMs > 350;
    if (mt.stalled && mt.mode === 'goto') { mt.mode = 'hold'; mt.done = true; }
  }
  function canPlace(world, box, nx, ny) {
    const poly = rectPoly(nx, ny, box.w, box.h, box.rot || 0);
    if (outside(poly) > 0.5) return false;
    for (const o of world.items) {
      if (o === box || !isObstacle(o)) continue;
      if (pen(poly, itemPoly(o)) > 0.5) return false;
    }
    return true;
  }
  // Try to move a set of robot polygons from cur → next, pushing movable boxes. Returns false when blocked.
  function tryMove(world, curPolys, nextPolys, moved, checkTable) {
    if (checkTable) {
      const oNew = Math.max(...nextPolys.slice(0, 2).map(outside)), oOld = Math.max(...curPolys.slice(0, 2).map(outside));
      if (oNew > oOld + 0.01) return false;
    }
    for (const it of world.items) {
      if (!isObstacle(it)) continue;
      if (it.kind === 'box') {
        for (let i = 0; i < nextPolys.length; i++) {
          const ip = itemPoly(it);
          const s = sat(nextPolys[i], ip);
          if (!s) continue;
          const nx = it.x + s.nx * (s.depth + 0.05), ny = it.y + s.ny * (s.depth + 0.05);
          if (canPlace(world, it, nx, ny)) { moved.push([it, it.x, it.y]); it.x = nx; it.y = ny; }
          else if (s.depth > pen(curPolys[i], ip) + 0.01) return false;
        }
      } else {
        const ip = itemPoly(it);
        for (let i = 0; i < nextPolys.length; i++) {
          const dn = pen(nextPolys[i], ip);
          if (dn > 0 && dn > pen(curPolys[i], ip) + 0.01) return false;
        }
      }
    }
    return true;
  }
  const revert = moved => { for (let i = moved.length - 1; i >= 0; i--) { moved[i][0].x = moved[i][1]; moved[i][0].y = moved[i][2]; } };
  function robotPolys(world, pose) {
    const M = world.motors;
    return [bodyPoly(pose), bumperPoly(pose), armPoly(pose, 'C', M.C.pos), armPoly(pose, 'D', M.D.pos)];
  }

  function step(world, dtMs = DT) {
    const dt = dtMs / 1000, M = world.motors, r = world.robot;
    // --- drive base ---
    const dA = motorDelta(M.A, dt, world.accel), dB = motorDelta(M.B, dt, world.accel);
    let blocked = false;
    if (dA || dB) {
      const circ = Math.PI * ROBOT.wheelD;
      let sL = dA / 360 * circ * world.wheelScale.A, sR = dB / 360 * circ * world.wheelScale.B;
      if (world.realism) { sL *= 1 + (rng(world) - 0.5) * 0.02; sR *= 1 + (rng(world) - 0.5) * 0.02; }
      const ds = (sL + sR) / 2, dth = (sL - sR) / ROBOT.track;
      const hm = r.h * RAD + dth / 2;
      const next = { x: r.x + ds * Math.cos(hm), y: r.y + ds * Math.sin(hm), h: r.h + dth * DEG };
      const moved = [];
      if (tryMove(world, robotPolys(world, r), robotPolys(world, next), moved, true)) {
        r.x = next.x; r.y = next.y; r.h = next.h; M.A.pos += dA; M.B.pos += dB;
      } else {
        revert(moved); blocked = true;
        for (const mt of [M.A, M.B]) if (mt.justDone) { mt.mode = 'goto'; mt.done = false; }
      }
    }
    stallUpdate(M.A, blocked, dtMs); stallUpdate(M.B, blocked, dtMs);
    // --- attachment motors (arms) ---
    for (const p of ['C', 'D']) {
      const mt = M[p];
      const d = motorDelta(mt, dt);
      let armBlocked = false;
      if (d) {
        const cur = [armPoly(r, p, mt.pos)], next = [armPoly(r, p, mt.pos + d)], moved = [];
        if (tryMove(world, cur, next, moved, false)) mt.pos += d;
        else { revert(moved); armBlocked = true; if (mt.justDone) { mt.mode = 'goto'; mt.done = false; } }
      }
      stallUpdate(mt, armBlocked, dtMs);
    }
    // --- force sensor ---
    const bp = bumperPoly(r, 3);
    let contact = outside(bp) > 0;
    if (!contact) for (const it of world.items) if (isObstacle(it) && sat(bp, itemPoly(it))) { contact = true; break; }
    const effort = Math.max(0, (M.A.want + M.B.want) / 2 / DEG_PER_PCT);
    world.contact = contact;
    world.force = contact ? Math.min(10, 2.5 + effort * 0.12) : 0;
    if (world.realism) world.drift += world.driftRate * dt;
    world.t += dtMs;
  }

  // ---------- sensors ----------
  function colorAt(world, x, y) {
    for (let i = world.items.length - 1; i >= 0; i--) {
      const it = world.items[i];
      if (isZone(it) && pointInItem(it, x, y)) return it.color || 'black';
    }
    return 'white';
  }
  function sensorPos(world) { return toWorld(world.robot, ROBOT.colorPos[0], ROBOT.colorPos[1]); }
  function readColor(world) { const [x, y] = sensorPos(world); return colorAt(world, x, y); }
  function readReflection(world) {
    const [x, y] = sensorPos(world);
    // the sensor sees a ~16 mm spot (weighted to the centre), so the reading changes smoothly across a line edge
    let sum = 2 * REFL[colorAt(world, x, y)], n = 2;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      sum += 1.5 * REFL[colorAt(world, x + 4 * c, y + 4 * s)] + REFL[colorAt(world, x + 8 * c, y + 8 * s)]; n += 2.5;
    }
    let v = sum / n;
    if (world.realism) v += (rng(world) - 0.5) * 3;
    return Math.round(clamp(v, 0, 100));
  }
  function rayHit(world) {
    const r = world.robot;
    const [ox, oy] = toWorld(r, ROBOT.distPos[0], ROBOT.distPos[1]);
    const dx = Math.cos(r.h * RAD), dy = Math.sin(r.h * RAD);
    let best = Infinity;
    const segs = [];
    for (const it of world.items) if (isObstacle(it)) { const p = itemPoly(it); for (let i = 0; i < p.length; i++) segs.push([p[i], p[(i + 1) % p.length]]); }
    const W = TABLE.w, H = TABLE.h;
    segs.push([[0, 0], [W, 0]], [[W, 0], [W, H]], [[W, H], [0, H]], [[0, H], [0, 0]]);
    for (const [a, b] of segs) { const t = raySeg(ox, oy, dx, dy, a, b); if (t < best) best = t; }
    return { ox, oy, t: best, x: ox + dx * best, y: oy + dy * best };
  }
  function readDistance(world) {
    const { t } = rayHit(world);
    if (!isFinite(t) || t > 2000) return -1;
    let cm = t / 10;
    if (world.realism) cm += (rng(world) - 0.5) * 0.6;
    return Math.round(Math.max(0, cm) * 10) / 10;
  }
  const yawAcc = world => world.robot.h - world.yawZero + world.drift;
  function readYaw(world) { let y = yawAcc(world) % 360; if (y > 180) y -= 360; if (y <= -180) y += 360; return Math.round(y * 10) / 10; }
  function sense(world) {
    const M = world.motors;
    return {
      color: readColor(world), reflection: readReflection(world), distance: readDistance(world),
      force: Math.round(world.force * 10) / 10, pressed: world.force >= 1, yaw: readYaw(world),
      A: Math.round(M.A.pos), B: Math.round(M.B.pos), C: Math.round(M.C.pos), D: Math.round(M.D.pos), t: world.t - world.t0
    };
  }

  // ---------- robot API (blocking; `tick(ms)` advances the simulation) ----------
  function makeApi(world, tick, out) {
    const M = world.motors;
    const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`القيمة "${v}" لازم تكون رقم${name ? ' (' + name + ')' : ''}`); return n; };
    const pct = v => clamp(num(v, 'speed'), -100, 100);
    const port = p => { const k = String(p).toUpperCase(); if (!M[k]) throw new Error(`المنفذ "${p}" مش موجود — استخدم "A" أو "B" أو "C" أو "D"`); return k; };
    const setSpeed = (k, v) => { const mt = M[k]; mt.mode = 'speed'; mt.target = v * DEG_PER_PCT; mt.done = true; };
    const hold = k => { const mt = M[k]; mt.mode = 'hold'; mt.goal = mt.pos; mt.done = true; };
    function goto(k, delta, sp) {
      const mt = M[k]; mt.goal = mt.pos + delta; mt.cruise = Math.max(30, Math.abs(sp) * DEG_PER_PCT);
      mt.stallMs = 0; mt.stalled = false;
      if (Math.abs(delta) < 0.5) { mt.mode = 'hold'; mt.done = true; } else { mt.mode = 'goto'; mt.done = false; }
    }
    function waitDone(keys, limit = 60000) { const t0 = world.t; while (keys.some(k => !M[k].done) && world.t - t0 < limit) tick(DT); }
    function brakeDrive() { hold('A'); hold('B'); const t0 = world.t; while ((Math.abs(M.A.vel) > 5 || Math.abs(M.B.vel) > 5) && world.t - t0 < 400) tick(DT); }
    const api = {
      move(cm, speed = 50) {
        const sp = Math.abs(pct(speed)) || 50;
        const deg = num(cm, 'cm') * 10 / (Math.PI * ROBOT.wheelD) * 360 * Math.sign(pct(speed) || 1);
        goto('A', deg, sp); goto('B', deg, sp); waitDone(['A', 'B']);
      },
      turn(deg, speed = 30) {
        const sp = Math.abs(pct(speed)) || 30;
        const w = ROBOT.track * num(deg, 'degrees') / ROBOT.wheelD;
        goto('A', w, sp); goto('B', -w, sp); waitDone(['A', 'B']);
      },
      gyroTurn(deg, speed = 30) {
        const target = yawAcc(world) + num(deg, 'degrees'); const sp = Math.abs(pct(speed)) || 30; const t0 = world.t;
        while (world.t - t0 < 15000) {
          const rem = target - yawAcc(world);
          if (Math.abs(rem) < 0.5) break;
          const s = Math.sign(rem) * clamp(Math.abs(rem) * 1.2, 5, sp);
          setSpeed('A', s); setSpeed('B', -s); tick(DT);
          if (M.A.stalled && M.B.stalled) break;
        }
        brakeDrive();
      },
      drive(l, r) { setSpeed('A', pct(l)); setSpeed('B', pct(r == null ? l : r)); tick(DT); },
      steer(steering, speed = 50) {
        const s = clamp(num(steering, 'steering'), -100, 100), v = pct(speed);
        api.drive(s >= 0 ? v : v * (1 + s / 50), s <= 0 ? v : v * (1 - s / 50));
      },
      stop() { brakeDrive(); },
      wait(ms) { tick(clamp(num(ms, 'ms'), 0, 600000)); },
      runMotor(p, deg, speed = 50) { const k = port(p); const sp = pct(speed); goto(k, num(deg, 'degrees') * Math.sign(sp || 1), Math.abs(sp) || 50); waitDone([k]); },
      startMotor(p, speed = 50) { setSpeed(port(p), pct(speed)); tick(DT); },
      stopMotor(p) { hold(port(p)); tick(DT); },
      motorDegrees(p) { return Math.round(M[port(p)].pos); },
      resetMotors() { for (const k in M) { const mt = M[k]; mt.goal -= mt.pos; mt.pos = 0; } },
      color() { tick(DT); return readColor(world); },
      reflection() { tick(DT); return readReflection(world); },
      distance() { tick(DT); return readDistance(world); },
      force() { tick(DT); return Math.round(world.force * 10) / 10; },
      isPressed() { tick(DT); return world.force >= 1; },
      yaw() { tick(DT); return readYaw(world); },
      resetYaw() { world.yawZero = world.robot.h + world.drift; },
      time() { return Math.round(world.t - world.t0); },
      print: (...a) => out.print(a.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '))
    };
    Object.assign(api, {
      gyro_turn: api.gyroTurn, run_motor: api.runMotor, start_motor: api.startMotor, stop_motor: api.stopMotor,
      motor_degrees: api.motorDegrees, reset_motors: api.resetMotors, is_pressed: api.isPressed, reset_yaw: api.resetYaw
    });
    return api;
  }

  G.SimCore = {
    TABLE, ROBOT, DT, COLORS, COLOR_AR, REFL, DEG_PER_PCT, isZone, isObstacle,
    createWorld, step, sense, makeApi, rayHit, readColor, sensorPos,
    rectPoly, circlePoly, itemPoly, bodyPoly, bumperPoly, armPoly, armTip, toWorld, pointInItem, sat, clamp
  };
})(typeof self !== 'undefined' ? self : this);
