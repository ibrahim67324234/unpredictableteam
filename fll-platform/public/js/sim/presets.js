// Table presets and example programs for the Robot Game simulator.
export const PRESETS = {
  missions: {
    name: 'مهمات وعقبات', robot: { x: 250, y: 571, h: 0 },
    items: [
      { kind: 'line', color: 'black', x: 600, y: 571, w: 450, h: 20, rot: 90 },
      { kind: 'zone', color: 'green', x: 1400, y: 300, w: 200, h: 200, rot: 0 },
      { kind: 'zone', color: 'red', x: 2080, y: 571, w: 160, h: 160, rot: 0 },
      { kind: 'circle', color: 'blue', x: 1760, y: 240, r: 90 },
      { kind: 'zone', color: 'yellow', x: 900, y: 960, w: 300, h: 120, rot: 0 },
      { kind: 'wall', x: 1300, y: 571, w: 40, h: 360, rot: 0 },
      { kind: 'box', x: 1000, y: 300, w: 120, h: 120, rot: 0 },
      { kind: 'pillar', x: 1700, y: 860, r: 50 },
      { kind: 'box', x: 1950, y: 960, w: 100, h: 100, rot: 0 }
    ]
  },
  pid: {
    name: 'مسار PID (حلقة سودا)', robot: { x: 1181, y: 955, h: 0 },
    items: [
      { kind: 'ring', color: 'black', x: 1181, y: 571, r: 380, w: 22 },
      { kind: 'circle', color: 'azure', x: 1181, y: 571, r: 120 }
    ]
  },
  maze: {
    name: 'متاهة', robot: { x: 300, y: 950, h: 0 },
    items: [
      { kind: 'wall', x: 700, y: 375, w: 40, h: 750, rot: 0 },
      { kind: 'wall', x: 1300, y: 768, w: 40, h: 750, rot: 0 },
      { kind: 'wall', x: 1900, y: 375, w: 40, h: 750, rot: 0 },
      { kind: 'zone', color: 'green', x: 2150, y: 200, w: 260, h: 260, rot: 0 },
      { kind: 'pillar', x: 1000, y: 180, r: 45 },
      { kind: 'pillar', x: 1600, y: 960, r: 45 }
    ]
  },
  empty: { name: 'طاولة فاضية', robot: { x: 400, y: 350, h: 0 }, items: [] }
};

export const EXAMPLES = [
  {
    id: 'square', name: 'مربع (move + gyro turn)', preset: 'empty',
    js: `// المربع: الروبوت يمشي 40 سم ويلف يمين 90 درجة، 4 مرات
for (let i = 0; i < 4; i++) {
  robot.move(40, 50);      // امشي 40 سم بسرعة 50%
  robot.gyroTurn(90);      // لف يمين 90 درجة بالجيرو
}
print("خلصت المربع! الزاوية دلوقتي:", robot.yaw());
`,
    py: `# المربع: الروبوت يمشي 40 سم ويلف يمين 90 درجة، 4 مرات
for i in range(4):
    robot.move(40, 50)       # امشي 40 سم بسرعة 50%
    robot.gyro_turn(90)      # لف يمين 90 درجة بالجيرو

print("خلصت المربع! الزاوية دلوقتي:", robot.yaw())
`
  },
  {
    id: 'line', name: 'وقّف عند الخط الأسود (Color sensor)', preset: 'missions',
    js: `// امشي لحد ما حساس اللون يشوف أسود
robot.drive(40, 40);
while (robot.color() !== "black") {}   // كل قراءة للحساس بتمشي الوقت شوية
robot.stop();
print("لقيت الخط! 🎯 الانعكاس =", robot.reflection());
`,
    py: `# امشي لحد ما حساس اللون يشوف أسود
robot.drive(40, 40)
while robot.color() != "black":
    pass                    # كل قراءة للحساس بتمشي الوقت شوية
robot.stop()
print("لقيت الخط! 🎯 الانعكاس =", robot.reflection())
`
  },
  {
    id: 'pid', name: 'Line follower بالـ PID', preset: 'pid',
    js: `// تتبع حافة الخط بالـ PID — غيّر Kp و Kd وشوف الفرق
const Kp = 0.6, Ki = 0.0, Kd = 2.0;
const target = 50;     // نص المسافة بين الأسود (7) والأبيض (98)
const base = 40;       // السرعة الأساسية
let integral = 0, lastError = 0;

while (robot.time() < 30000) {            // 30 ثانية
  const error = robot.reflection() - target;
  integral += error;
  const derivative = error - lastError;
  lastError = error;
  const turn = Kp * error + Ki * integral + Kd * derivative;
  robot.drive(base - turn, base + turn);   // أبيض (error موجب) → لف شمال ناحية الخط
}
robot.stop();
`,
    py: `# تتبع حافة الخط بالـ PID — غيّر Kp و Kd وشوف الفرق
Kp, Ki, Kd = 0.6, 0.0, 2.0
target = 50      # نص المسافة بين الأسود (7) والأبيض (98)
base = 40        # السرعة الأساسية
integral = 0
last_error = 0

while robot.time() < 30000:              # 30 ثانية
    error = robot.reflection() - target
    integral += error
    derivative = error - last_error
    last_error = error
    turn = Kp * error + Ki * integral + Kd * derivative
    robot.drive(base - turn, base + turn)  # أبيض (error موجب) → لف شمال ناحية الخط

robot.stop()
`
  },
  {
    id: 'wall', name: 'وقّف قبل الحيطة (Distance sensor)', preset: 'missions',
    js: `// امشي لحد ما حساس المسافة يقرا أقل من 15 سم
robot.drive(50, 50);
while (true) {
  const d = robot.distance();       // -1 معناها مفيش حاجة قدامي
  if (d !== -1 && d < 15) break;
}
robot.stop();
print("وقفت على بعد", robot.distance(), "سم من الحيطة");
`,
    py: `# امشي لحد ما حساس المسافة يقرا أقل من 15 سم
robot.drive(50, 50)
while True:
    d = robot.distance()       # -1 معناها مفيش حاجة قدامي
    if d != -1 and d < 15:
        break
robot.stop()
print("وقفت على بعد", robot.distance(), "سم من الحيطة")
`
  },
  {
    id: 'push', name: 'زق الصندوق للمنطقة الخضرا (Force sensor)', preset: 'missions',
    js: `robot.gyroTurn(-90);          // لف شمال
robot.move(27);               // اطلع لمستوى الصندوق
robot.gyroTurn(90);           // ارجع بص يمين
robot.drive(40, 40);
while (!robot.isPressed()) {} // امشي لحد ما حساس الـ force يلمس الصندوق
print("لمست الصندوق! القوة =", robot.force(), "N");
robot.move(45, 40);           // زق الصندوق 45 سم
robot.move(-20);              // ارجع لورا
print("المهمة خلصت ✅");
`,
    py: `robot.gyro_turn(-90)          # لف شمال
robot.move(27)                # اطلع لمستوى الصندوق
robot.gyro_turn(90)           # ارجع بص يمين
robot.drive(40, 40)
while not robot.is_pressed(): # امشي لحد ما حساس الـ force يلمس الصندوق
    pass
print("لمست الصندوق! القوة =", robot.force(), "N")
robot.move(45, 40)            # زق الصندوق 45 سم
robot.move(-20)               # ارجع لورا
print("المهمة خلصت ✅")
`
  },
  {
    id: 'arms', name: 'تحريك الأذرع (Medium motors C و D)', preset: 'missions',
    js: `robot.runMotor("C", 90, 60);   // افتح الدراع الشمال لبره
robot.runMotor("D", 90, 60);   // افتح الدراع اليمين لبره
robot.wait(500);
robot.runMotor("C", 90);       // كمّل لقدام (180 درجة من البداية)
robot.runMotor("D", 90);
robot.move(20);
robot.runMotor("C", -180);     // اقفل الدراعين
robot.runMotor("D", -180);
print("C =", robot.motorDegrees("C"), " D =", robot.motorDegrees("D"));
`,
    py: `robot.run_motor("C", 90, 60)   # افتح الدراع الشمال لبره
robot.run_motor("D", 90, 60)   # افتح الدراع اليمين لبره
robot.wait(500)
robot.run_motor("C", 90)       # كمّل لقدام (180 درجة من البداية)
robot.run_motor("D", 90)
robot.move(20)
robot.run_motor("C", -180)     # اقفل الدراعين
robot.run_motor("D", -180)
print("C =", robot.motor_degrees("C"), " D =", robot.motor_degrees("D"))
`
  },
  {
    id: 'gyro', name: 'امشي مستقيم بالجيرو (P control)', preset: 'empty',
    js: `// شغّل "أخطاء واقعية" من فوق وقارن بين robot.move(100) والكود ده
robot.resetYaw();
robot.resetMotors();
const Kp = 2;
while (robot.motorDegrees("A") < 2000) {   // تقريبًا 98 سم
  const error = robot.yaw();                // المفروض يفضل 0
  robot.drive(50 - Kp * error, 50 + Kp * error);
}
robot.stop();
print("الانحراف في الزاوية:", robot.yaw(), "درجة");
`,
    py: `# شغّل "أخطاء واقعية" من فوق وقارن بين robot.move(100) والكود ده
robot.reset_yaw()
robot.reset_motors()
Kp = 2
while robot.motor_degrees("A") < 2000:    # تقريبًا 98 سم
    error = robot.yaw()                   # المفروض يفضل 0
    robot.drive(50 - Kp * error, 50 + Kp * error)
robot.stop()
print("الانحراف في الزاوية:", robot.yaw(), "درجة")
`
  }
];

export const ITEM_DEFAULTS = {
  zone: { w: 200, h: 200, rot: 0, label: 'منطقة لون' },
  line: { w: 500, h: 20, rot: 0, label: 'خط / شريط' },
  circle: { r: 100, label: 'دايرة لون' },
  ring: { r: 300, w: 22, label: 'حلقة (مسار)' },
  wall: { w: 40, h: 300, rot: 0, label: 'حيطة ثابتة' },
  box: { w: 120, h: 120, rot: 0, label: 'صندوق يتزق' },
  pillar: { r: 45, label: 'عمود' }
};
