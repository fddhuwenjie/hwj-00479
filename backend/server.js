const express = require('express');
const cors = require('cors');
const path = require('path');
const { init, save, getDb, getToday, getDateOffset, getDayOfWeek } = require('./db');

const app = express();
const FRONTEND_PORT = 3479;
const PORT = 8479;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

function query(sql, params) {
  const db = getDb();
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function run(sql, params) {
  const db = getDb();
  db.run(sql, params);
  save();
}

function generateVisitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ==================== 科室与医生 ====================

app.get('/api/departments', (req, res) => {
  const departments = query('SELECT * FROM departments ORDER BY id');
  departments.forEach(dept => {
    const count = query('SELECT COUNT(*) as cnt FROM doctors WHERE department_id = ?', [dept.id]);
    dept.doctor_count = count[0].cnt;
  });
  res.json({ code: 0, data: departments });
});

app.get('/api/departments/:id/doctors', (req, res) => {
  const doctors = query('SELECT * FROM doctors WHERE department_id = ? ORDER BY id', [req.params.id]);
  doctors.forEach(doc => {
    try { doc.schedule = JSON.parse(doc.schedule); } catch(e) {}
  });
  res.json({ code: 0, data: doctors });
});

app.get('/api/doctors', (req, res) => {
  const doctors = query('SELECT d.*, dept.name as department_name FROM doctors d LEFT JOIN departments dept ON d.department_id = dept.id ORDER BY d.id');
  doctors.forEach(doc => {
    try { doc.schedule = JSON.parse(doc.schedule); } catch(e) {}
  });
  res.json({ code: 0, data: doctors });
});

app.get('/api/doctors/:id', (req, res) => {
  const doctors = query('SELECT d.*, dept.name as department_name FROM doctors d LEFT JOIN departments dept ON d.department_id = dept.id WHERE d.id = ?', [req.params.id]);
  if (doctors.length === 0) return res.json({ code: 1, msg: '医生不存在' });
  const doc = doctors[0];
  try { doc.schedule = JSON.parse(doc.schedule); } catch(e) {}

  const reviews = query('SELECT r.*, p.name as patient_name FROM reviews r LEFT JOIN patients p ON r.patient_id = p.id WHERE r.doctor_id = ? ORDER BY r.created_at DESC', [req.params.id]);
  const totalReviews = reviews.length;
  let avgSkill = 0, avgAttitude = 0, avgEfficiency = 0;
  if (totalReviews > 0) {
    reviews.forEach(r => { avgSkill += r.rating_skill; avgAttitude += r.rating_attitude; avgEfficiency += r.rating_efficiency; });
    avgSkill = (avgSkill / totalReviews).toFixed(1);
    avgAttitude = (avgAttitude / totalReviews).toFixed(1);
    avgEfficiency = (avgEfficiency / totalReviews).toFixed(1);
  }
  doc.reviews = reviews;
  doc.rating = { avg_skill: avgSkill, avg_attitude: avgAttitude, avg_efficiency: avgEfficiency, overall: totalReviews > 0 ? ((parseFloat(avgSkill) + parseFloat(avgAttitude) + parseFloat(avgEfficiency)) / 3).toFixed(1) : '0.0', total: totalReviews };

  res.json({ code: 0, data: doc });
});

app.get('/api/doctors/:id/schedule', (req, res) => {
  const doctors = query('SELECT schedule FROM doctors WHERE id = ?', [req.params.id]);
  if (doctors.length === 0) return res.json({ code: 1, msg: '医生不存在' });
  let schedule = {};
  try { schedule = JSON.parse(doctors[0].schedule); } catch(e) {}

  const result = [];
  for (let i = 0; i < 7; i++) {
    const date = getDateOffset(i);
    const dow = new Date(date).getDay() === 0 ? 7 : new Date(date).getDay();
    const daySchedule = schedule[dow] || { am: false, pm: false };

    const amAppointments = query('SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND period = ? AND status != ? AND status != ?', [req.params.id, date, 'am', 'cancelled', 'no_show']);
    const pmAppointments = query('SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND period = ? AND status != ? AND status != ?', [req.params.id, date, 'pm', 'cancelled', 'no_show']);

    result.push({
      date,
      day_of_week: getDayOfWeek(date),
      am_available: daySchedule.am,
      pm_available: daySchedule.pm,
      am_remaining: daySchedule.am ? Math.max(0, 15 - amAppointments[0].cnt) : 0,
      pm_remaining: daySchedule.pm ? Math.max(0, 15 - pmAppointments[0].cnt) : 0
    });
  }

  res.json({ code: 0, data: result });
});

// ==================== 预约挂号 ====================

app.get('/api/patients', (req, res) => {
  const patients = query('SELECT * FROM patients ORDER BY id');
  res.json({ code: 0, data: patients });
});

app.post('/api/appointments', (req, res) => {
  const { patient_id, doctor_id, date, period } = req.body;

  if (!patient_id || !doctor_id || !date || !period) {
    return res.json({ code: 1, msg: '缺少必要参数' });
  }

  const today = getToday();
  if (date < today) return res.json({ code: 1, msg: '不能预约过去的日期' });
  const maxDate = getDateOffset(6);
  if (date > maxDate) return res.json({ code: 1, msg: '只能预约未来7天' });
  if (!['am', 'pm'].includes(period)) return res.json({ code: 1, msg: '时段无效' });

  const existing = query('SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? AND date = ? AND status != ? AND status != ?', [patient_id, doctor_id, date, 'cancelled', 'no_show']);
  if (existing.length > 0) return res.json({ code: 1, msg: '每人每医生每天限挂1号' });

  const doctors = query('SELECT schedule, registration_fee FROM doctors WHERE id = ?', [doctor_id]);
  if (doctors.length === 0) return res.json({ code: 1, msg: '医生不存在' });

  let schedule = {};
  try { schedule = JSON.parse(doctors[0].schedule); } catch(e) {}
  const dow = new Date(date).getDay() === 0 ? 7 : new Date(date).getDay();
  const daySchedule = schedule[dow] || { am: false, pm: false };
  if (!daySchedule[period]) return res.json({ code: 1, msg: '该时段医生不出诊' });

  const count = query('SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND period = ? AND status != ? AND status != ?', [doctor_id, date, period, 'cancelled', 'no_show']);
  if (count[0].cnt >= 15) return res.json({ code: 1, msg: '该时段号源已满' });

  const queueNumber = count[0].cnt + 1;
  const visitCode = generateVisitCode();

  run('INSERT INTO appointments (patient_id, doctor_id, date, period, queue_number, status, visit_code) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [patient_id, doctor_id, date, period, queueNumber, 'pending', visitCode]);

  const newAppts = query('SELECT * FROM appointments WHERE visit_code = ?', [visitCode]);

  res.json({ code: 0, data: newAppts[0], msg: '预约成功' });
});

app.get('/api/appointments/patient/:patientId', (req, res) => {
  const appointments = query(
    `SELECT a.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name
     FROM appointments a
     LEFT JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     WHERE a.patient_id = ?
     ORDER BY a.date DESC, a.period ASC`,
    [req.params.patientId]
  );
  res.json({ code: 0, data: appointments });
});

app.get('/api/appointments/:id', (req, res) => {
  const appointments = query(
    `SELECT a.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name,
     p.name as patient_name, p.phone as patient_phone
     FROM appointments a
     LEFT JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN patients p ON a.patient_id = p.id
     WHERE a.id = ?`,
    [req.params.id]
  );
  if (appointments.length === 0) return res.json({ code: 1, msg: '预约不存在' });
  res.json({ code: 0, data: appointments[0] });
});

app.put('/api/appointments/:id/cancel', (req, res) => {
  const appointments = query('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (appointments.length === 0) return res.json({ code: 1, msg: '预约不存在' });
  const appt = appointments[0];
  if (appt.status === 'cancelled') return res.json({ code: 1, msg: '预约已取消' });
  if (appt.status === 'checked') return res.json({ code: 1, msg: '已就诊的预约不能取消' });

  const today = getToday();
  if (appt.date === today) {
    const now = new Date();
    const hour = now.getHours();
    if (appt.period === 'am' && hour >= 6) return res.json({ code: 1, msg: '上午号需在开诊前2小时取消' });
    if (appt.period === 'pm' && hour >= 12) return res.json({ code: 1, msg: '下午号需在开诊前2小时取消' });
  }

  run('UPDATE appointments SET status = ? WHERE id = ?', ['cancelled', req.params.id]);
  res.json({ code: 0, msg: '取消成功' });
});

// ==================== 排队叫号 ====================

app.get('/api/queue/today/:doctorId', (req, res) => {
  const today = getToday();
  const appointments = query(
    `SELECT a.*, p.name as patient_name, p.phone as patient_phone
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.id
     WHERE a.doctor_id = ? AND a.date = ? AND a.status != 'cancelled'
     ORDER BY a.period ASC, a.queue_number ASC`,
    [req.params.doctorId, today]
  );

  const state = query('SELECT current_number FROM queue_state WHERE doctor_id = ? AND date = ?', [req.params.doctorId, today]);
  const currentNumber = state.length > 0 ? state[0].current_number : 0;

  res.json({ code: 0, data: { appointments, current_number: currentNumber } });
});

app.post('/api/queue/next/:doctorId', (req, res) => {
  const today = getToday();
  const state = query('SELECT current_number FROM queue_state WHERE doctor_id = ? AND date = ?', [req.params.doctorId, today]);
  let currentNumber = state.length > 0 ? state[0].current_number : 0;

  const nextAppts = query(
    `SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'pending' ORDER BY period ASC, queue_number ASC LIMIT 1`,
    [req.params.doctorId, today]
  );

  if (nextAppts.length === 0) {
    return res.json({ code: 1, msg: '没有等待就诊的患者' });
  }

  const skippedAppts = query(
    `SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND queue_number <= ? AND status = 'pending' AND id != ?`,
    [req.params.doctorId, today, currentNumber, nextAppts[0].id]
  );

  skippedAppts.forEach(appt => {
    const noShowCount = (appt.no_show_count || 0) + 1;
    if (noShowCount >= 3) {
      run('UPDATE appointments SET status = ?, no_show_count = ? WHERE id = ?', ['no_show', noShowCount, appt.id]);
    } else {
      run('UPDATE appointments SET no_show_count = ? WHERE id = ?', [noShowCount, appt.id]);
    }
  });

  currentNumber = nextAppts[0].queue_number;

  run('INSERT OR REPLACE INTO queue_state (doctor_id, date, current_number) VALUES (?, ?, ?)', [req.params.doctorId, today, currentNumber]);

  res.json({ code: 0, data: { current_number: currentNumber, appointment: nextAppts[0] }, msg: '叫号成功' });
});

app.get('/api/queue/current/:doctorId', (req, res) => {
  const today = getToday();
  const state = query('SELECT current_number FROM queue_state WHERE doctor_id = ? AND date = ?', [req.params.doctorId, today]);
  const currentNumber = state.length > 0 ? state[0].current_number : 0;

  let currentAppt = null;
  if (currentNumber > 0) {
    const curAppts = query(
      `SELECT a.*, p.name as patient_name FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id
       WHERE a.doctor_id = ? AND a.date = ? AND a.queue_number = ?`,
      [req.params.doctorId, today, currentNumber]
    );
    if (curAppts.length > 0) currentAppt = curAppts[0];
  }

  const waiting = query(
    `SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'pending' AND queue_number > ?`,
    [req.params.doctorId, today, currentNumber]
  );

  res.json({ code: 0, data: { current_number: currentNumber, current_appointment: currentAppt, waiting_count: waiting[0].cnt } });
});

app.get('/api/queue/status/:appointmentId', (req, res) => {
  const appointments = query(
    `SELECT a.*, d.name as doctor_name FROM appointments a LEFT JOIN doctors d ON a.doctor_id = d.id WHERE a.id = ?`,
    [req.params.appointmentId]
  );
  if (appointments.length === 0) return res.json({ code: 1, msg: '预约不存在' });

  const appt = appointments[0];
  const today = getToday();
  const state = query('SELECT current_number FROM queue_state WHERE doctor_id = ? AND date = ?', [appt.doctor_id, appt.date]);
  const currentNumber = state.length > 0 ? state[0].current_number : 0;

  const ahead = query(
    `SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'pending' AND queue_number < ? AND queue_number > ?`,
    [appt.doctor_id, appt.date, appt.queue_number, currentNumber]
  );

  res.json({
    code: 0,
    data: {
      your_number: appt.queue_number,
      current_number: currentNumber,
      ahead_count: Math.max(0, ahead[0].cnt),
      status: appt.status,
      doctor_name: appt.doctor_name,
      period: appt.period === 'am' ? '上午' : '下午'
    }
  });
});

// ==================== 病历管理 ====================

app.post('/api/records', (req, res) => {
  const { appointment_id, patient_id, doctor_id, chief_complaint, present_illness, diagnosis, prescription } = req.body;
  if (!appointment_id || !patient_id || !doctor_id || !chief_complaint || !diagnosis) {
    return res.json({ code: 1, msg: '缺少必要参数' });
  }

  run('INSERT INTO medical_records (appointment_id, patient_id, doctor_id, chief_complaint, present_illness, diagnosis, prescription) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [appointment_id, patient_id, doctor_id, chief_complaint, present_illness || '', diagnosis, prescription ? JSON.stringify(prescription) : '[]']);

  run('UPDATE appointments SET status = ? WHERE id = ?', ['checked', appointment_id]);

  const newRecords = query('SELECT * FROM medical_records WHERE appointment_id = ?', [appointment_id]);
  res.json({ code: 0, data: newRecords[0], msg: '病历保存成功' });
});

app.get('/api/records/patient/:patientId', (req, res) => {
  const records = query(
    `SELECT mr.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name, a.date, a.period
     FROM medical_records mr
     LEFT JOIN doctors d ON mr.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN appointments a ON mr.appointment_id = a.id
     WHERE mr.patient_id = ?
     ORDER BY mr.created_at DESC`,
    [req.params.patientId]
  );
  records.forEach(r => {
    try { r.prescription = JSON.parse(r.prescription); } catch(e) { r.prescription = []; }
  });
  res.json({ code: 0, data: records });
});

app.get('/api/records/:id', (req, res) => {
  const records = query(
    `SELECT mr.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name, a.date, a.period
     FROM medical_records mr
     LEFT JOIN doctors d ON mr.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN appointments a ON mr.appointment_id = a.id
     WHERE mr.id = ?`,
    [req.params.id]
  );
  if (records.length === 0) return res.json({ code: 1, msg: '病历不存在' });
  const r = records[0];
  try { r.prescription = JSON.parse(r.prescription); } catch(e) { r.prescription = []; }
  res.json({ code: 0, data: r });
});

// ==================== 评价与反馈 ====================

app.post('/api/reviews', (req, res) => {
  const { patient_id, doctor_id, appointment_id, rating_skill, rating_attitude, rating_efficiency, comment } = req.body;
  if (!patient_id || !doctor_id || !rating_skill || !rating_attitude || !rating_efficiency) {
    return res.json({ code: 1, msg: '缺少必要参数' });
  }
  if (rating_skill < 1 || rating_skill > 5 || rating_attitude < 1 || rating_attitude > 5 || rating_efficiency < 1 || rating_efficiency > 5) {
    return res.json({ code: 1, msg: '评分必须在1-5之间' });
  }

  run('INSERT INTO reviews (patient_id, doctor_id, appointment_id, rating_skill, rating_attitude, rating_efficiency, comment) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [patient_id, doctor_id, appointment_id || null, rating_skill, rating_attitude, rating_efficiency, comment || '']);

  res.json({ code: 0, msg: '评价成功' });
});

app.get('/api/reviews/doctor/:doctorId', (req, res) => {
  const reviews = query(
    `SELECT r.*, p.name as patient_name FROM reviews r LEFT JOIN patients p ON r.patient_id = p.id WHERE r.doctor_id = ? ORDER BY r.created_at DESC`,
    [req.params.doctorId]
  );

  const total = reviews.length;
  let avgSkill = 0, avgAttitude = 0, avgEfficiency = 0;
  let goodCount = 0;
  if (total > 0) {
    reviews.forEach(r => {
      avgSkill += r.rating_skill;
      avgAttitude += r.rating_attitude;
      avgEfficiency += r.rating_efficiency;
      const avg = (r.rating_skill + r.rating_attitude + r.rating_efficiency) / 3;
      if (avg >= 4) goodCount++;
    });
    avgSkill = (avgSkill / total).toFixed(1);
    avgAttitude = (avgAttitude / total).toFixed(1);
    avgEfficiency = (avgEfficiency / total).toFixed(1);
  }

  const overall = total > 0 ? ((parseFloat(avgSkill) + parseFloat(avgAttitude) + parseFloat(avgEfficiency)) / 3).toFixed(1) : '0.0';
  const goodRate = total > 0 ? ((goodCount / total) * 100).toFixed(0) + '%' : '0%';

  res.json({ code: 0, data: { reviews, stats: { avg_skill: avgSkill, avg_attitude: avgAttitude, avg_efficiency: avgEfficiency, overall, good_rate: goodRate, total } } });
});

// ==================== 数据统计 ====================

app.get('/api/stats/department-today', (req, res) => {
  const today = getToday();
  const stats = query(
    `SELECT dept.id, dept.name,
     (SELECT COUNT(*) FROM appointments a JOIN doctors d ON a.doctor_id = d.id WHERE d.department_id = dept.id AND a.date = ? AND a.status != 'cancelled' AND a.status != 'no_show') as total_appointments,
     (SELECT SUM(CASE WHEN a.period = 'am' THEN 1 ELSE 0 END) FROM appointments a JOIN doctors d ON a.doctor_id = d.id WHERE d.department_id = dept.id AND a.date = ? AND a.status != 'cancelled' AND a.status != 'no_show') as am_count,
     (SELECT SUM(CASE WHEN a.period = 'pm' THEN 1 ELSE 0 END) FROM appointments a JOIN doctors d ON a.doctor_id = d.id WHERE d.department_id = dept.id AND a.date = ? AND a.status != 'cancelled' AND a.status != 'no_show') as pm_count
     FROM departments dept ORDER BY dept.id`,
    [today, today, today]
  );

  const deptDoctors = query('SELECT department_id, COUNT(*) as cnt FROM doctors GROUP BY department_id');
  const docMap = {};
  deptDoctors.forEach(d => { docMap[d.department_id] = d.cnt; });

  stats.forEach(s => {
    const docCount = docMap[s.id] || 0;
    s.total_quota = docCount * 30;
    s.remaining = Math.max(0, s.total_quota - s.total_appointments);
    s.am_remaining = Math.max(0, docCount * 15 - s.am_count);
    s.pm_remaining = Math.max(0, docCount * 15 - s.pm_count);
  });

  res.json({ code: 0, data: stats });
});

app.get('/api/stats/doctor-weekly', (req, res) => {
  const startDate = getDateOffset(0);
  const endDate = getDateOffset(6);

  const stats = query(
    `SELECT d.id, d.name, d.title, dept.name as department_name,
     (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.date >= ? AND a.date <= ? AND a.status = 'checked') as checked_count,
     (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.date >= ? AND a.date <= ? AND a.status != 'cancelled') as total_count
     FROM doctors d LEFT JOIN departments dept ON d.department_id = dept.id ORDER BY d.id`,
    [startDate, endDate, startDate, endDate]
  );

  res.json({ code: 0, data: stats });
});

app.get('/api/stats/patient-frequency', (req, res) => {
  const stats = query(
    `SELECT p.id, p.name, p.phone,
     (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'checked') as visit_count,
     (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id AND a.status != 'cancelled') as appointment_count
     FROM patients p ORDER BY visit_count DESC`
  );
  res.json({ code: 0, data: stats });
});

app.get('/api/stats/hot-periods', (req, res) => {
  const stats = query(
    `SELECT a.date, a.period, d.name as doctor_name, dept.name as department_name, COUNT(*) as count
     FROM appointments a
     LEFT JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     WHERE a.status != 'cancelled'
     GROUP BY a.date, a.period, a.doctor_id
     ORDER BY count DESC`
  );

  const periodStats = query(
    `SELECT period, COUNT(*) as count FROM appointments WHERE status != 'cancelled' GROUP BY period`
  );

  const fullPeriods = query(
    `SELECT a.doctor_id, a.date, a.period, d.name as doctor_name, COUNT(*) as count
     FROM appointments a LEFT JOIN doctors d ON a.doctor_id = d.id
     WHERE a.status != 'cancelled' AND a.status != 'no_show'
     GROUP BY a.doctor_id, a.date, a.period
     HAVING count >= 15
     ORDER BY a.date DESC`
  );

  res.json({ code: 0, data: { detail: stats, period_summary: periodStats, full_periods: fullPeriods } });
});

app.get('/api/stats/revenue', (req, res) => {
  const today = getToday();
  const startDate = getDateOffset(0);
  const endDate = getDateOffset(6);

  const byDept = query(
    `SELECT dept.id, dept.name,
     SUM(d.registration_fee) as revenue,
     COUNT(*) as count
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     JOIN departments dept ON d.department_id = dept.id
     WHERE a.status != 'cancelled' AND a.status != 'no_show'
     GROUP BY dept.id ORDER BY revenue DESC`
  );

  const byDoctor = query(
    `SELECT d.id, d.name, d.title, dept.name as department_name, d.registration_fee,
     COUNT(*) as count,
     SUM(d.registration_fee) as revenue
     FROM appointments a
     JOIN doctors d ON a.doctor_id = d.id
     JOIN departments dept ON d.department_id = dept.id
     WHERE a.status != 'cancelled' AND a.status != 'no_show'
     GROUP BY d.id ORDER BY revenue DESC`
  );

  const total = query(
    `SELECT SUM(d.registration_fee) as total_revenue, COUNT(*) as total_count
     FROM appointments a JOIN doctors d ON a.doctor_id = d.id
     WHERE a.status != 'cancelled' AND a.status != 'no_show'`
  );

  res.json({ code: 0, data: { by_department: byDept, by_doctor: byDoctor, total: total[0] } });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`后端API已启动: http://localhost:${PORT}`);
  });

  const frontendApp = express();
  frontendApp.use(express.static(path.join(__dirname, '..', 'frontend')));
  frontendApp.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });
  frontendApp.listen(FRONTEND_PORT, () => {
    console.log(`前端页面已启动: http://localhost:${FRONTEND_PORT}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
