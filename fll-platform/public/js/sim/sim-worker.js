/* Runs a student's program (JavaScript or Python) against the simulator, in a background thread,
   so infinite loops never freeze the page. The robot API is blocking: each call advances simulated time
   and the worker waits in real time (scaled by the speed factor) so the page can animate it. */
importScripts('/js/sim/sim-core.js');
const S = self.SimCore;
let pyodide = null, pyLoading = null;

function post(type, data) { self.postMessage({ type, ...data }); }

function snapshot(world) {
  const M = world.motors;
  return {
    robot: { ...world.robot },
    motors: { A: M.A.pos, B: M.B.pos, C: M.C.pos, D: M.D.pos },
    movables: world.items.filter(i => i.kind === 'box').map(i => ({ id: i.id, x: i.x, y: i.y })),
    sensors: S.sense(world), yawZero: world.yawZero, drift: world.drift
  };
}

const PY_PRELUDE = `
import _sim, time as _time
class Robot:
    def move(self, cm, speed=50): _sim.move(cm, speed)
    def turn(self, degrees, speed=30): _sim.turn(degrees, speed)
    def gyro_turn(self, degrees, speed=30): _sim.gyroTurn(degrees, speed)
    def drive(self, left_speed, right_speed=None): _sim.drive(left_speed, left_speed if right_speed is None else right_speed)
    def steer(self, steering, speed=50): _sim.steer(steering, speed)
    def stop(self): _sim.stop()
    def wait(self, ms): _sim.wait(ms)
    def run_motor(self, port, degrees, speed=50): _sim.runMotor(port, degrees, speed)
    def start_motor(self, port, speed=50): _sim.startMotor(port, speed)
    def stop_motor(self, port): _sim.stopMotor(port)
    def motor_degrees(self, port): return _sim.motorDegrees(port)
    def reset_motors(self): _sim.resetMotors()
    def color(self): return _sim.color()
    def reflection(self): return _sim.reflection()
    def distance(self): return _sim.distance()
    def force(self): return _sim.force()
    def is_pressed(self): return bool(_sim.isPressed())
    def yaw(self): return _sim.yaw()
    def reset_yaw(self): _sim.resetYaw()
    def time(self): return _sim.time()
    gyroTurn = gyro_turn; runMotor = run_motor; startMotor = start_motor; stopMotor = stop_motor
    motorDegrees = motor_degrees; resetMotors = reset_motors; isPressed = is_pressed; resetYaw = reset_yaw
robot = Robot()
def wait(ms): _sim.wait(ms)
_time.sleep = lambda s: _sim.wait(s * 1000)
`;

async function loadPython() {
  if (pyodide) return pyodide;
  if (!pyLoading) pyLoading = (async () => {
    post('status', { text: '⏳ بيحمّل Python لأول مرة (ممكن ياخد 10-20 ثانية)...' });
    importScripts('/vendor/pyodide/pyodide.js');
    const py = await self.loadPyodide({ indexURL: '/vendor/pyodide/' });
    pyodide = py; return py;
  })();
  return pyLoading;
}

function jsLineOffset() {
  try { new Function('robot', 'print', 'wait', '"use strict";\nthrow new Error("x")')(); }
  catch (e) { const m = String(e.stack || '').match(/(?:<anonymous>|Function|eval[^:]*):(\d+):\d+/); if (m) return Number(m[1]) - 2; }
  return 2;
}
function jsErrorLine(e, off) {
  const m = String(e && e.stack || '').match(/(?:<anonymous>|Function|eval[^:]*):(\d+):\d+/);
  return m ? Number(m[1]) - off - 1 : null;
}

self.onmessage = async (ev) => {
  const msg = ev.data;
  if (msg.type === 'preload') { try { await loadPython(); post('status', { text: '✅ Python جاهز' }); } catch (e) { post('error', { message: 'مش قادر يحمّل Python: ' + e.message }); } return; }
  if (msg.type !== 'run') return;
  const world = S.createWorld({ items: msg.items, robot: msg.robot, realism: msg.realism, seed: msg.seed });
  if (msg.motors) for (const k of ['A', 'B', 'C', 'D']) { world.motors[k].pos = msg.motors[k] || 0; world.motors[k].goal = world.motors[k].pos; }
  const speed = msg.speed || 1;
  let simElapsed = 0, lastPost = 0, realStart = 0;
  const LIMIT = 10 * 60 * 1000;
  function tick(ms) {
    const steps = Math.max(1, Math.round(ms / S.DT));
    for (let i = 0; i < steps; i++) {
      S.step(world, S.DT);
      simElapsed += S.DT;
      if (simElapsed > LIMIT) throw new Error('البرنامج اشتغل أكتر من 10 دقايق — وقفناه.');
      let now = performance.now();
      if (now - lastPost > 30) { post('state', { state: snapshot(world) }); lastPost = now; }
      if (speed < 50) { const target = realStart + simElapsed / speed; while (now < target) now = performance.now(); }
    }
  }
  const out = { print: (s) => post('print', { text: s }) };
  const api = S.makeApi(world, tick, out);
  try {
    if (msg.lang === 'python') {
      const py = await loadPython();
      py.setStdout({ batched: s => post('print', { text: s }) });
      py.setStderr({ batched: s => post('print', { text: s, err: true }) });
      // a fresh robot API for every run (Python caches imported modules, so drop the old one first)
      py.runPython("import sys\nsys.modules.pop('_sim', None)");
      try { py.unregisterJsModule('_sim'); } catch {}
      py.registerJsModule('_sim', api);
      const g = py.globals.get('dict')();
      py.runPython(PY_PRELUDE, { globals: g });
      post('started', {});
      realStart = performance.now();
      try { py.runPython(msg.code, { globals: g, filename: '<exec>' }); }
      finally { try { g.destroy(); } catch {} }
    } else {
      const off = jsLineOffset();
      let fn;
      try { fn = new Function('robot', 'print', 'wait', '"use strict";\n' + msg.code); }
      catch (e) { throw Object.assign(new Error('خطأ في كتابة الكود (Syntax): ' + e.message), { line: null }); }
      post('started', {});
      realStart = performance.now();
      try { fn(api, api.print, api.wait); }
      catch (e) { e.line = jsErrorLine(e, off); throw e; }
    }
    // let the robot coast to a stop
    api.stop();
    post('state', { state: snapshot(world) });
    post('done', { ms: Math.round(world.t) });
  } catch (e) {
    post('state', { state: snapshot(world) });
    let message = String(e && e.message || e);
    let line = e && e.line;
    if (msg.lang === 'python' && /Traceback/.test(message)) {
      const lines = message.trim().split('\n');
      const ls = [...message.matchAll(/File "<exec>", line (\d+)/g)];
      if (ls.length) line = Number(ls[ls.length - 1][1]);
      message = lines[lines.length - 1];
    }
    post('error', { message, line });
  }
};
