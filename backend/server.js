const express = require('express');
const cors = require('cors');
const path = require('path');
const { init, save, getDb, getToday, getDateOffset, getDayOfWeek, generateTimeSlots } = require('./db');

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

function queryOne(sql, params) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function generateVisitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseTimeSlot(slot) {
  const parts = slot.split('_');
  const timeRange = parts.slice(2).join('_');
  return timeRange;
}

// ==================== 院区 ====================

app.get('/api/branches', (req, res) => {
  const branches = query('SELECT * FROM branches ORDER BY id');
  branches.forEach(b => {
    const count = query('SELECT COUNT(*) as cnt FROM doctors WHERE branch_id = ?', [b.id]);
    b.doctor_count = count[0].cnt;
  });
  res.json({ code: 0, data: branches });
});

app.get('/api/branches/:id/departments', (req, res) => {
  const depts = query(`
    SELECT DISTINCT d.* FROM departments d
    JOIN doctors doc ON doc.department_id = d.id
    WHERE doc.branch_id = ?
    ORDER BY d.id
  `, [req.params.id]);
  res.json({ code: 0, data: depts });
});

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
  let sql = 'SELECT * FROM doctors WHERE department_id = ?';
  const params = [req.params.id];
  if (req.query.branch_id) {
    sql += ' AND branch_id = ?';
    params.push(req.query.branch_id);
  }
  sql += ' ORDER BY id';
  const doctors = query(sql, params);
  doctors.forEach(doc => {
    try { doc.schedule = JSON.parse(doc.schedule); } catch(e) {}
    const branch = queryOne('SELECT * FROM branches WHERE id = ?', [doc.branch_id]);
    doc.branch_name = branch?.name || '';
  });
  res.json({ code: 0, data: doctors });
});

app.get('/api/doctors', (req, res) => {
  let sql = 'SELECT d.*, dept.name as department_name, b.name as branch_name FROM doctors d LEFT JOIN departments dept ON d.department_id = dept.id LEFT JOIN branches b ON d.branch_id = b.id';
  let params = [];
  let conditions = [];
  if (req.query.branch_id) {
    conditions.push('d.branch_id = ?');
    params.push(req.query.branch_id);
  }
  if (req.query.department_id) {
    conditions.push('d.department_id = ?');
    params.push(req.query.department_id);
  }
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY d.id';
  const doctors = query(sql, params);
  doctors.forEach(doc => {
    try { doc.schedule = JSON.parse(doc.schedule); } catch(e) {}
  });
  res.json({ code: 0, data: doctors });
});

app.get('/api/doctors/:id', (req, res) => {
  const doctors = query('SELECT d.*, dept.name as department_name, b.name as branch_name, b.address as branch_address, b.phone as branch_phone FROM doctors d LEFT JOIN departments dept ON d.department_id = dept.id LEFT JOIN branches b ON d.branch_id = b.id WHERE d.id = ?', [req.params.id]);
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

  const allSlots = generateTimeSlots();
  const amSlots = allSlots.filter(s => s.startsWith('am_'));
  const pmSlots = allSlots.filter(s => s.startsWith('pm_'));

  const result = [];
  for (let i = 0; i < 7; i++) {
    const date = getDateOffset(i);
    const dow = new Date(date).getDay() === 0 ? 7 : new Date(date).getDay();
    const daySchedule = schedule[dow] || { am: false, pm: false };

    const slots = [];
    if (daySchedule.am) {
      amSlots.forEach(slot => {
        const slotCount = query('SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND time_slot = ? AND status != ? AND status != ?', [req.params.id, date, slot, 'cancelled', 'no_show']);
        slots.push({
          key: slot,
          time: parseTimeSlot(slot),
          remaining: Math.max(0, 2 - slotCount[0].cnt),
          max: 2
        });
      });
    }
    if (daySchedule.pm) {
      pmSlots.forEach(slot => {
        const slotCount = query('SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND time_slot = ? AND status != ? AND status != ?', [req.params.id, date, slot, 'cancelled', 'no_show']);
        slots.push({
          key: slot,
          time: parseTimeSlot(slot),
          remaining: Math.max(0, 2 - slotCount[0].cnt),
          max: 2
        });
      });
    }

    const totalRemaining = slots.reduce((sum, s) => sum + s.remaining, 0);

    result.push({
      date,
      day_of_week: getDayOfWeek(date),
      am_available: daySchedule.am,
      pm_available: daySchedule.pm,
      am_remaining: slots.filter(s => s.key.startsWith('am_')).reduce((sum, s) => sum + s.remaining, 0),
      pm_remaining: slots.filter(s => s.key.startsWith('pm_')).reduce((sum, s) => sum + s.remaining, 0),
      total_remaining: totalRemaining,
      slots
    });
  }

  res.json({ code: 0, data: result });
});

// ==================== 家庭成员 ====================

app.get('/api/family/:patientId', (req, res) => {
  const members = query('SELECT * FROM family_members WHERE patient_id = ? ORDER BY id', [req.params.patientId]);
  res.json({ code: 0, data: members });
});

app.post('/api/family', (req, res) => {
  const { patient_id, name, relation, id_card, age, gender } = req.body;
  if (!patient_id || !name || !relation) {
    return res.json({ code: 1, msg: '缺少必要参数' });
  }
  run('INSERT INTO family_members (patient_id, name, relation, id_card, age, gender) VALUES (?, ?, ?, ?, ?, ?)',
    [patient_id, name, relation, id_card || null, age || null, gender || null]);
  const members = query('SELECT * FROM family_members WHERE patient_id = ? ORDER BY id DESC LIMIT 1', [patient_id]);
  res.json({ code: 0, data: members[0], msg: '添加成功' });
});

app.put('/api/family/:id', (req, res) => {
  const { name, relation, id_card, age, gender } = req.body;
  const existing = queryOne('SELECT * FROM family_members WHERE id = ?', [req.params.id]);
  if (!existing) return res.json({ code: 1, msg: '成员不存在' });
  run('UPDATE family_members SET name = ?, relation = ?, id_card = ?, age = ?, gender = ? WHERE id = ?',
    [name || existing.name, relation || existing.relation, id_card !== undefined ? id_card : existing.id_card, age !== undefined ? age : existing.age, gender !== undefined ? gender : existing.gender, req.params.id]);
  const member = queryOne('SELECT * FROM family_members WHERE id = ?', [req.params.id]);
  res.json({ code: 0, data: member, msg: '更新成功' });
});

app.delete('/api/family/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM family_members WHERE id = ?', [req.params.id]);
  if (!existing) return res.json({ code: 1, msg: '成员不存在' });
  run('DELETE FROM family_members WHERE id = ?', [req.params.id]);
  res.json({ code: 0, msg: '删除成功' });
});

// ==================== 预约挂号 ====================

app.get('/api/patients', (req, res) => {
  const patients = query('SELECT * FROM patients ORDER BY id');
  res.json({ code: 0, data: patients });
});

app.post('/api/appointments', (req, res) => {
  const { patient_id, family_member_id, doctor_id, date, time_slot } = req.body;

  if (!patient_id || !doctor_id || !date || !time_slot) {
    return res.json({ code: 1, msg: '缺少必要参数' });
  }

  const today = getToday();
  if (date < today) return res.json({ code: 1, msg: '不能预约过去的日期' });
  const maxDate = getDateOffset(6);
  if (date > maxDate) return res.json({ code: 1, msg: '只能预约未来7天' });

  const period = time_slot.startsWith('am_') ? 'am' : 'pm';

  const existing = query('SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? AND date = ? AND status != ? AND status != ? AND family_member_id ' + (family_member_id ? '= ' + family_member_id : 'IS NULL'), [patient_id, doctor_id, date, 'cancelled', 'no_show']);
  if (existing.length > 0) return res.json({ code: 1, msg: '每人每医生每天限挂1号' });

  const doctors = query('SELECT schedule, registration_fee FROM doctors WHERE id = ?', [doctor_id]);
  if (doctors.length === 0) return res.json({ code: 1, msg: '医生不存在' });

  let schedule = {};
  try { schedule = JSON.parse(doctors[0].schedule); } catch(e) {}
  const dow = new Date(date).getDay() === 0 ? 7 : new Date(date).getDay();
  const daySchedule = schedule[dow] || { am: false, pm: false };
  if (!daySchedule[period]) return res.json({ code: 1, msg: '该时段医生不出诊' });

  const count = query('SELECT COUNT(*) as cnt FROM appointments WHERE doctor_id = ? AND date = ? AND time_slot = ? AND status != ? AND status != ?', [doctor_id, date, time_slot, 'cancelled', 'no_show']);
  if (count[0].cnt >= 2) return res.json({ code: 1, msg: '该时段号源已满' });

  const queueNumber = count[0].cnt + 1;
  const visitCode = generateVisitCode();

  run('INSERT INTO appointments (patient_id, family_member_id, doctor_id, date, period, time_slot, queue_number, status, visit_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [patient_id, family_member_id || null, doctor_id, date, period, time_slot, queueNumber, 'pending', visitCode]);

  const newAppts = query('SELECT * FROM appointments WHERE visit_code = ?', [visitCode]);

  res.json({ code: 0, data: newAppts[0], msg: '预约成功' });
});

app.get('/api/appointments/patient/:patientId', (req, res) => {
  const appointments = query(
    `SELECT a.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name, b.name as branch_name,
     fm.name as family_member_name, fm.relation as family_member_relation
     FROM appointments a
     LEFT JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN branches b ON d.branch_id = b.id
     LEFT JOIN family_members fm ON a.family_member_id = fm.id
     WHERE a.patient_id = ?
     ORDER BY a.date DESC, a.time_slot ASC`,
    [req.params.patientId]
  );
  appointments.forEach(a => {
    a.time_display = parseTimeSlot(a.time_slot);
  });
  res.json({ code: 0, data: appointments });
});

app.get('/api/appointments/:id', (req, res) => {
  const appointments = query(
    `SELECT a.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name, b.name as branch_name,
     p.name as patient_name, p.phone as patient_phone,
     fm.name as family_member_name, fm.relation as family_member_relation
     FROM appointments a
     LEFT JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN branches b ON d.branch_id = b.id
     LEFT JOIN patients p ON a.patient_id = p.id
     LEFT JOIN family_members fm ON a.family_member_id = fm.id
     WHERE a.id = ?`,
    [req.params.id]
  );
  if (appointments.length === 0) return res.json({ code: 1, msg: '预约不存在' });
  appointments[0].time_display = parseTimeSlot(appointments[0].time_slot);
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

// ==================== 智能导诊 ====================

app.get('/api/symptoms', (req, res) => {
  const symptoms = query('SELECT s.*, d.name as department_name FROM symptoms s LEFT JOIN departments d ON s.department_id = d.id ORDER BY s.department_id, s.weight DESC');
  res.json({ code: 0, data: symptoms });
});

app.post('/api/triage', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.json({ code: 1, msg: '请输入症状描述' });
  }

  const allSymptoms = query('SELECT s.*, d.name as department_name FROM symptoms s LEFT JOIN departments d ON s.department_id = d.id');
  const deptScores = {};
  const matchedSymptoms = [];

  allSymptoms.forEach(sym => {
    if (text.includes(sym.name)) {
      if (!deptScores[sym.department_id]) {
        deptScores[sym.department_id] = {
          department_id: sym.department_id,
          department_name: sym.department_name,
          score: 0,
          matched: []
        };
      }
      deptScores[sym.department_id].score += sym.weight;
      deptScores[sym.department_id].matched.push(sym.name);
      if (!matchedSymptoms.includes(sym.name)) matchedSymptoms.push(sym.name);
    }
  });

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    allSymptoms.forEach(sym => {
      if (sym.name.length === 1 && sym.name === char) {
        if (!deptScores[sym.department_id]) {
          deptScores[sym.department_id] = {
            department_id: sym.department_id,
            department_name: sym.department_name,
            score: 0,
            matched: []
          };
        }
        if (!deptScores[sym.department_id].matched.includes(sym.name)) {
          deptScores[sym.department_id].score += sym.weight;
          deptScores[sym.department_id].matched.push(sym.name);
        }
      }
    });
  }

  let results = Object.values(deptScores).sort((a, b) => b.score - a.score).slice(0, 3);

  if (results.length === 0) {
    const topDepts = query('SELECT * FROM departments ORDER BY id LIMIT 3');
    results = topDepts.map(d => ({
      department_id: d.id,
      department_name: d.name,
      score: 0,
      matched: []
    }));
  }

  results.forEach(r => {
    const doctors = query(`
      SELECT d.*, dept.name as department_name, b.name as branch_name
      FROM doctors d
      LEFT JOIN departments dept ON d.department_id = dept.id
      LEFT JOIN branches b ON d.branch_id = b.id
      WHERE d.department_id = ?
      ORDER BY d.id
      LIMIT 3
    `, [r.department_id]);
    doctors.forEach(doc => { try { doc.schedule = JSON.parse(doc.schedule); } catch(e) {} });
    r.doctors = doctors;
  });

  res.json({ code: 0, data: { matched_symptoms: matchedSymptoms, recommendations: results } });
});

// ==================== 药品管理 ====================

app.get('/api/drugs', (req, res) => {
  let sql = 'SELECT * FROM drugs';
  const params = [];
  const conditions = [];
  if (req.query.keyword) {
    conditions.push('name LIKE ?');
    params.push('%' + req.query.keyword + '%');
  }
  if (req.query.category) {
    conditions.push('category = ?');
    params.push(req.query.category);
  }
  if (req.query.low_stock) {
    conditions.push('stock <= low_stock_threshold');
  }
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY id';
  const drugs = query(sql, params);
  drugs.forEach(d => {
    d.is_low = d.stock <= d.low_stock_threshold;
  });
  res.json({ code: 0, data: drugs });
});

app.get('/api/drugs/categories', (req, res) => {
  const rows = query('SELECT DISTINCT category FROM drugs WHERE category IS NOT NULL AND category != "" ORDER BY category');
  res.json({ code: 0, data: rows.map(r => r.category) });
});

app.get('/api/drugs/:id', (req, res) => {
  const drug = queryOne('SELECT * FROM drugs WHERE id = ?', [req.params.id]);
  if (!drug) return res.json({ code: 1, msg: '药品不存在' });
  drug.is_low = drug.stock <= drug.low_stock_threshold;
  res.json({ code: 0, data: drug });
});

app.post('/api/drugs', (req, res) => {
  const { name, specification, unit, price, stock, expiry_date, category, low_stock_threshold } = req.body;
  if (!name) return res.json({ code: 1, msg: '药品名称必填' });
  run('INSERT INTO drugs (name, specification, unit, price, stock, expiry_date, category, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, specification || null, unit || null, price || 0, stock || 0, expiry_date || null, category || null, low_stock_threshold || 10]);
  const drugs = query('SELECT * FROM drugs WHERE name = ? ORDER BY id DESC LIMIT 1', [name]);
  res.json({ code: 0, data: drugs[0], msg: '添加成功' });
});

app.put('/api/drugs/:id', (req, res) => {
  const existing = queryOne('SELECT * FROM drugs WHERE id = ?', [req.params.id]);
  if (!existing) return res.json({ code: 1, msg: '药品不存在' });
  const { name, specification, unit, price, stock, expiry_date, category, low_stock_threshold } = req.body;
  run('UPDATE drugs SET name = ?, specification = ?, unit = ?, price = ?, stock = ?, expiry_date = ?, category = ?, low_stock_threshold = ? WHERE id = ?',
    [name || existing.name, specification !== undefined ? specification : existing.specification, unit !== undefined ? unit : existing.unit,
     price !== undefined ? price : existing.price, stock !== undefined ? stock : existing.stock,
     expiry_date !== undefined ? expiry_date : existing.expiry_date, category !== undefined ? category : existing.category,
     low_stock_threshold !== undefined ? low_stock_threshold : existing.low_stock_threshold, req.params.id]);
  const drug = queryOne('SELECT * FROM drugs WHERE id = ?', [req.params.id]);
  res.json({ code: 0, data: drug, msg: '更新成功' });
});

app.post('/api/drugs/:id/restock', (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity <= 0) return res.json({ code: 1, msg: '入库数量必须大于0' });
  const existing = queryOne('SELECT * FROM drugs WHERE id = ?', [req.params.id]);
  if (!existing) return res.json({ code: 1, msg: '药品不存在' });
  run('UPDATE drugs SET stock = stock + ? WHERE id = ?', [quantity, req.params.id]);
  const drug = queryOne('SELECT * FROM drugs WHERE id = ?', [req.params.id]);
  res.json({ code: 0, data: drug, msg: '入库成功' });
});

// ==================== 排队叫号 ====================

app.get('/api/queue/today/:doctorId', (req, res) => {
  const today = getToday();
  const appointments = query(
    `SELECT a.*, p.name as patient_name, p.phone as patient_phone,
     fm.name as family_member_name, fm.relation as family_member_relation
     FROM appointments a
     LEFT JOIN patients p ON a.patient_id = p.id
     LEFT JOIN family_members fm ON a.family_member_id = fm.id
     WHERE a.doctor_id = ? AND a.date = ? AND a.status != 'cancelled'
     ORDER BY a.time_slot ASC, a.queue_number ASC`,
    [req.params.doctorId, today]
  );
  appointments.forEach(a => {
    a.time_display = parseTimeSlot(a.time_slot);
  });

  const state = query('SELECT current_number FROM queue_state WHERE doctor_id = ? AND date = ?', [req.params.doctorId, today]);
  const currentNumber = state.length > 0 ? state[0].current_number : 0;

  res.json({ code: 0, data: { appointments, current_number: currentNumber } });
});

app.post('/api/queue/next/:doctorId', (req, res) => {
  const today = getToday();
  const state = query('SELECT current_number FROM queue_state WHERE doctor_id = ? AND date = ?', [req.params.doctorId, today]);
  let currentNumber = state.length > 0 ? state[0].current_number : 0;

  const nextAppts = query(
    `SELECT * FROM appointments WHERE doctor_id = ? AND date = ? AND status = 'pending' ORDER BY time_slot ASC, queue_number ASC LIMIT 1`,
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
      `SELECT a.*, p.name as patient_name, fm.name as family_member_name
       FROM appointments a LEFT JOIN patients p ON a.patient_id = p.id
       LEFT JOIN family_members fm ON a.family_member_id = fm.id
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
      time_display: parseTimeSlot(appt.time_slot)
    }
  });
});

// ==================== 病历管理 ====================

app.post('/api/records', (req, res) => {
  const { appointment_id, patient_id, family_member_id, doctor_id, chief_complaint, present_illness, diagnosis, prescription, need_followup, followup_date, followup_content } = req.body;
  if (!appointment_id || !patient_id || !doctor_id || !chief_complaint || !diagnosis) {
    return res.json({ code: 1, msg: '缺少必要参数' });
  }

  if (prescription && prescription.length > 0) {
    for (const drug of prescription) {
      if (drug.drug_id) {
        const d = queryOne('SELECT * FROM drugs WHERE id = ?', [drug.drug_id]);
        if (!d) {
          return res.json({ code: 1, msg: `药品 ${drug.name} 不存在` });
        }
        const qty = drug.quantity || 1;
        if (d.stock < qty) {
          return res.json({ code: 1, msg: `药品 ${d.name} 库存不足（剩余${d.stock}${d.unit || ''}），请更换药品` });
        }
      }
    }
    for (const drug of prescription) {
      if (drug.drug_id) {
        const qty = drug.quantity || 1;
        run('UPDATE drugs SET stock = stock - ? WHERE id = ?', [qty, drug.drug_id]);
      }
    }
  }

  run('INSERT INTO medical_records (appointment_id, patient_id, family_member_id, doctor_id, chief_complaint, present_illness, diagnosis, prescription) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [appointment_id, patient_id, family_member_id || null, doctor_id, chief_complaint, present_illness || '', diagnosis, prescription ? JSON.stringify(prescription) : '[]']);

  run('UPDATE appointments SET status = ? WHERE id = ?', ['checked', appointment_id]);

  const newRecords = query('SELECT * FROM medical_records WHERE appointment_id = ?', [appointment_id]);
  const record = newRecords[0];

  if (need_followup && followup_date) {
    run('INSERT INTO followups (record_id, patient_id, family_member_id, doctor_id, followup_date, content, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [record.id, patient_id, family_member_id || null, doctor_id, followup_date, followup_content || '', 'pending']);
  }

  res.json({ code: 0, data: record, msg: '病历保存成功' });
});

app.get('/api/records/patient/:patientId', (req, res) => {
  const records = query(
    `SELECT mr.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name, a.date, a.time_slot,
     fm.name as family_member_name, fm.relation as family_member_relation
     FROM medical_records mr
     LEFT JOIN doctors d ON mr.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN appointments a ON mr.appointment_id = a.id
     LEFT JOIN family_members fm ON mr.family_member_id = fm.id
     WHERE mr.patient_id = ?
     ORDER BY mr.created_at DESC`,
    [req.params.patientId]
  );
  records.forEach(r => {
    try { r.prescription = JSON.parse(r.prescription); } catch(e) { r.prescription = []; }
    r.time_display = r.time_slot ? parseTimeSlot(r.time_slot) : '';
  });
  res.json({ code: 0, data: records });
});

app.get('/api/records/:id', (req, res) => {
  const records = query(
    `SELECT mr.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name, a.date, a.time_slot,
     fm.name as family_member_name, fm.relation as family_member_relation
     FROM medical_records mr
     LEFT JOIN doctors d ON mr.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN appointments a ON mr.appointment_id = a.id
     LEFT JOIN family_members fm ON mr.family_member_id = fm.id
     WHERE mr.id = ?`,
    [req.params.id]
  );
  if (records.length === 0) return res.json({ code: 1, msg: '病历不存在' });
  const r = records[0];
  try { r.prescription = JSON.parse(r.prescription); } catch(e) { r.prescription = []; }
  r.time_display = r.time_slot ? parseTimeSlot(r.time_slot) : '';
  res.json({ code: 0, data: r });
});

// ==================== 随访管理 ====================

app.get('/api/followups/patient/:patientId', (req, res) => {
  const followups = query(
    `SELECT f.*, d.name as doctor_name, d.title as doctor_title, dept.name as department_name,
     mr.diagnosis as record_diagnosis,
     fm.name as family_member_name, fm.relation as family_member_relation
     FROM followups f
     LEFT JOIN doctors d ON f.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     LEFT JOIN medical_records mr ON f.record_id = mr.id
     LEFT JOIN family_members fm ON f.family_member_id = fm.id
     WHERE f.patient_id = ?
     ORDER BY f.followup_date DESC`,
    [req.params.patientId]
  );
  const today = getToday();
  followups.forEach(f => {
    if (f.status === 'pending' && f.followup_date < today) {
      f.status = 'missed';
    }
    f.is_today = f.followup_date === today;
  });
  res.json({ code: 0, data: followups });
});

app.get('/api/followups/doctor/:doctorId', (req, res) => {
  let sql = `
    SELECT f.*, p.name as patient_name, p.phone as patient_phone,
     fm.name as family_member_name, fm.relation as family_member_relation,
     mr.diagnosis as record_diagnosis, dept.name as department_name
     FROM followups f
     LEFT JOIN patients p ON f.patient_id = p.id
     LEFT JOIN family_members fm ON f.family_member_id = fm.id
     LEFT JOIN medical_records mr ON f.record_id = mr.id
     LEFT JOIN doctors d ON f.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     WHERE f.doctor_id = ?`;
  const params = [req.params.doctorId];
  if (req.query.status) {
    sql += ' AND f.status = ?';
    params.push(req.query.status);
  }
  sql += ' ORDER BY f.followup_date DESC';
  const followups = query(sql, params);
  const today = getToday();
  followups.forEach(f => {
    if (f.status === 'pending' && f.followup_date < today) {
      f.status = 'missed';
    }
    f.is_today = f.followup_date === today;
  });
  res.json({ code: 0, data: followups });
});

app.put('/api/followups/:id/submit', (req, res) => {
  const { current_symptoms, improved, need_revisit, feedback } = req.body;
  const existing = queryOne('SELECT * FROM followups WHERE id = ?', [req.params.id]);
  if (!existing) return res.json({ code: 1, msg: '随访不存在' });
  run('UPDATE followups SET status = ?, current_symptoms = ?, improved = ?, need_revisit = ?, feedback = ? WHERE id = ?',
    ['completed', current_symptoms || '', improved || '', need_revisit || '', feedback || '', req.params.id]);
  const followup = queryOne('SELECT * FROM followups WHERE id = ?', [req.params.id]);
  res.json({ code: 0, data: followup, msg: '随访反馈已提交' });
});

app.put('/api/followups/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['pending', 'completed', 'missed'].includes(status)) {
    return res.json({ code: 1, msg: '状态无效' });
  }
  const existing = queryOne('SELECT * FROM followups WHERE id = ?', [req.params.id]);
  if (!existing) return res.json({ code: 1, msg: '随访不存在' });
  run('UPDATE followups SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ code: 0, msg: '状态已更新' });
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
    s.total_quota = docCount * 28;
    s.remaining = Math.max(0, s.total_quota - s.total_appointments);
  });

  res.json({ code: 0, data: stats });
});

app.get('/api/stats/doctor-weekly', (req, res) => {
  const startDate = getDateOffset(0);
  const endDate = getDateOffset(6);

  const stats = query(
    `SELECT d.id, d.name, d.title, dept.name as department_name, b.name as branch_name,
     (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.date >= ? AND a.date <= ? AND a.status = 'checked') as checked_count,
     (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.date >= ? AND a.date <= ? AND a.status != 'cancelled') as total_count
     FROM doctors d LEFT JOIN departments dept ON d.department_id = dept.id LEFT JOIN branches b ON d.branch_id = b.id ORDER BY d.id`,
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
    `SELECT a.date, a.time_slot, d.name as doctor_name, dept.name as department_name, COUNT(*) as count
     FROM appointments a
     LEFT JOIN doctors d ON a.doctor_id = d.id
     LEFT JOIN departments dept ON d.department_id = dept.id
     WHERE a.status != 'cancelled'
     GROUP BY a.date, a.time_slot, a.doctor_id
     ORDER BY count DESC`
  );

  const fullPeriods = query(
    `SELECT a.doctor_id, a.date, a.time_slot, d.name as doctor_name, COUNT(*) as count
     FROM appointments a LEFT JOIN doctors d ON a.doctor_id = d.id
     WHERE a.status != 'cancelled' AND a.status != 'no_show'
     GROUP BY a.doctor_id, a.date, a.time_slot
     HAVING count >= 2
     ORDER BY a.date DESC`
  );

  res.json({ code: 0, data: { detail: stats, full_periods: fullPeriods } });
});

app.get('/api/stats/revenue', (req, res) => {
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

app.get('/api/stats/drugs', (req, res) => {
  const lowStock = query('SELECT * FROM drugs WHERE stock <= low_stock_threshold ORDER BY stock ASC');
  const byCategory = query('SELECT category, COUNT(*) as count, SUM(stock) as total_stock, SUM(stock * price) as total_value FROM drugs GROUP BY category ORDER BY total_value DESC');
  const totalValue = query('SELECT SUM(stock * price) as total FROM drugs');

  res.json({ code: 0, data: { low_stock: lowStock, by_category: byCategory, total_value: totalValue[0]?.total || 0 } });
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
