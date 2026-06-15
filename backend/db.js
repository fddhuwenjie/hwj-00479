const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'clinic.db');

let db = null;

function getToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getDateOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getDayOfWeek(dateStr) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return days[new Date(dateStr).getDay()];
}

function generateTimeSlots() {
  const slots = [];
  const amStart = 8 * 60;
  for (let i = 0; i < 8; i++) {
    const start = amStart + i * 30;
    const end = start + 30;
    slots.push(`am_${i}_${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}-${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`);
  }
  const pmStart = 14 * 60;
  for (let i = 0; i < 6; i++) {
    const start = pmStart + i * 30;
    const end = start + 30;
    slots.push(`pm_${i}_${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}-${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`);
  }
  return slots;
}

async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
    createSchema();
    seedData();
    save();
  }

  return db;
}

function createSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      address TEXT,
      phone TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      department_id INTEGER NOT NULL,
      branch_id INTEGER DEFAULT 1,
      specialty TEXT,
      schedule TEXT,
      photo_url TEXT,
      intro TEXT,
      registration_fee REAL DEFAULT 0,
      FOREIGN KEY (department_id) REFERENCES departments(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      gender TEXT,
      birth_date TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS family_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      relation TEXT NOT NULL,
      id_card TEXT,
      age INTEGER,
      gender TEXT,
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      family_member_id INTEGER,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      period TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      queue_number INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      visit_code TEXT,
      no_show_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (family_member_id) REFERENCES family_members(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      family_member_id INTEGER,
      doctor_id INTEGER NOT NULL,
      chief_complaint TEXT,
      present_illness TEXT,
      diagnosis TEXT,
      prescription TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (family_member_id) REFERENCES family_members(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      appointment_id INTEGER,
      rating_skill INTEGER NOT NULL,
      rating_attitude INTEGER NOT NULL,
      rating_efficiency INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS queue_state (
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      current_number INTEGER DEFAULT 0,
      PRIMARY KEY (doctor_id, date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS symptoms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      department_id INTEGER NOT NULL,
      weight INTEGER DEFAULT 1,
      FOREIGN KEY (department_id) REFERENCES departments(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS drugs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      specification TEXT,
      unit TEXT,
      price REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      expiry_date TEXT,
      category TEXT,
      low_stock_threshold INTEGER DEFAULT 10
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      family_member_id INTEGER,
      doctor_id INTEGER NOT NULL,
      followup_date TEXT NOT NULL,
      content TEXT,
      status TEXT DEFAULT 'pending',
      feedback TEXT,
      current_symptoms TEXT,
      improved TEXT,
      need_revisit TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (record_id) REFERENCES medical_records(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (family_member_id) REFERENCES family_members(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )
  `);
}

function seedData() {
  const branches = [
    { name: '中心院区', address: '市中心健康路88号', phone: '0571-88888888' },
    { name: '东区分院', address: '东区人民路128号', phone: '0571-88888801' },
    { name: '西区分院', address: '西区科技大道256号', phone: '0571-88888802' }
  ];
  const branchStmt = db.prepare('INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)');
  branches.forEach(b => branchStmt.run([b.name, b.address, b.phone]));
  branchStmt.free();

  const depts = [
    { name: '内科', description: '内科常见病、多发病的诊治，包括呼吸系统、消化系统、心血管系统等疾病' },
    { name: '外科', description: '外科疾病的诊断与手术治疗，包括普外科、骨科等' },
    { name: '儿科', description: '儿童常见病的诊治，新生儿保健，儿童生长发育指导' },
    { name: '口腔科', description: '口腔疾病的诊治，包括牙齿修复、正畸、牙周治疗等' },
    { name: '中医科', description: '中医内科、针灸推拿、中医养生保健等特色诊疗' },
    { name: '妇科', description: '妇科常见病诊治，孕产保健，女性健康管理' }
  ];
  const stmt = db.prepare('INSERT INTO departments (name, description) VALUES (?, ?)');
  depts.forEach(d => stmt.run([d.name, d.description]));
  stmt.free();

  const doctors = [
    { name: '张明华', title: '主任医师', dept: 1, branch: 1, specialty: '心血管疾病、高血压、糖尿病', schedule: JSON.stringify({1:{am:true,pm:true},3:{am:true,pm:false},5:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=zhangmh', intro: '从医30年，擅长各类心血管疾病的诊治，曾获省级科技进步奖。', fee: 50 },
    { name: '李秀英', title: '副主任医师', dept: 1, branch: 2, specialty: '呼吸系统疾病、支气管哮喘', schedule: JSON.stringify({2:{am:true,pm:true},4:{am:true,pm:true},6:{am:true,pm:false}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=lixy', intro: '呼吸内科专家，对慢阻肺、支气管哮喘有丰富的临床经验。', fee: 35 },
    { name: '王建国', title: '主任医师', dept: 2, branch: 1, specialty: '普外科手术、腹腔镜微创手术', schedule: JSON.stringify({1:{am:true,pm:false},2:{am:true,pm:true},4:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=wangjg', intro: '外科主任，擅长各类微创手术，手术经验超过5000例。', fee: 50 },
    { name: '陈晓红', title: '副主任医师', dept: 3, branch: 2, specialty: '儿童呼吸道疾病、新生儿疾病', schedule: JSON.stringify({1:{am:true,pm:true},3:{am:true,pm:true},5:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=chenxh', intro: '儿科副主任医师，从事儿科临床工作20年，对儿童常见病有丰富经验。', fee: 35 },
    { name: '赵德明', title: '主治医师', dept: 4, branch: 3, specialty: '牙齿修复、根管治疗、牙周病', schedule: JSON.stringify({2:{am:true,pm:true},4:{am:true,pm:true},6:{am:true,pm:false}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=zhaodm', intro: '口腔科主治医师，擅长各类牙齿修复和根管治疗。', fee: 25 },
    { name: '刘芳', title: '主治医师', dept: 5, branch: 1, specialty: '中医内科、针灸推拿、失眠调理', schedule: JSON.stringify({1:{am:true,pm:true},3:{am:true,pm:false},5:{am:false,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=liufang', intro: '中医世家传承，擅长运用中医中药及针灸治疗各类内科疾病。', fee: 25 },
    { name: '周美玲', title: '副主任医师', dept: 6, branch: 2, specialty: '妇科常见病、孕产保健', schedule: JSON.stringify({1:{am:true,pm:true},2:{am:true,pm:true},4:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=zhouml', intro: '妇科专家，从医18年，对妇科各类疾病有丰富诊疗经验。', fee: 35 }
  ];
  const docStmt = db.prepare('INSERT INTO doctors (name, title, department_id, branch_id, specialty, schedule, photo_url, intro, registration_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  doctors.forEach(d => docStmt.run([d.name, d.title, d.dept, d.branch, d.specialty, d.schedule, d.photo_url, d.intro, d.fee]));
  docStmt.free();

  const patients = [
    { name: '王丽', phone: '13800001001', gender: '女', birth_date: '1985-03-15' },
    { name: '张伟', phone: '13800001002', gender: '男', birth_date: '1978-07-22' },
    { name: '李娜', phone: '13800001003', gender: '女', birth_date: '1990-11-08' },
    { name: '刘强', phone: '13800001004', gender: '男', birth_date: '1972-01-30' },
    { name: '陈静', phone: '13800001005', gender: '女', birth_date: '1995-06-12' },
    { name: '杨洋', phone: '13800001006', gender: '男', birth_date: '1988-09-25' },
    { name: '赵敏', phone: '13800001007', gender: '女', birth_date: '2000-04-18' },
    { name: '周涛', phone: '13800001008', gender: '男', birth_date: '1965-12-05' },
    { name: '吴婷', phone: '13800001009', gender: '女', birth_date: '1982-08-20' },
    { name: '孙磊', phone: '13800001010', gender: '男', birth_date: '1993-02-14' }
  ];
  const patStmt = db.prepare('INSERT INTO patients (name, phone, gender, birth_date) VALUES (?, ?, ?, ?)');
  patients.forEach(p => patStmt.run([p.name, p.phone, p.gender, p.birth_date]));
  patStmt.free();

  const familyMembers = [
    { patient_id: 1, name: '王梓涵', relation: '女儿', id_card: '330101201501011234', age: 10, gender: '女' },
    { patient_id: 1, name: '王建国', relation: '父亲', id_card: '330101195505051234', age: 70, gender: '男' },
    { patient_id: 1, name: '李秀兰', relation: '母亲', id_card: '330101195808081234', age: 67, gender: '女' },
    { patient_id: 2, name: '张小宝', relation: '儿子', id_card: '330101201806061234', age: 7, gender: '男' },
    { patient_id: 2, name: '张老太', relation: '母亲', id_card: '330101195001011234', age: 75, gender: '女' },
    { patient_id: 5, name: '陈小明', relation: '弟弟', id_card: '330101200012121234', age: 25, gender: '男' }
  ];
  const fmStmt = db.prepare('INSERT INTO family_members (patient_id, name, relation, id_card, age, gender) VALUES (?, ?, ?, ?, ?, ?)');
  familyMembers.forEach(fm => fmStmt.run([fm.patient_id, fm.name, fm.relation, fm.id_card, fm.age, fm.gender]));
  fmStmt.free();

  const symptoms = [
    { name: '头痛', dept: 1, weight: 3 },
    { name: '头晕', dept: 1, weight: 3 },
    { name: '胸闷', dept: 1, weight: 3 },
    { name: '胸痛', dept: 1, weight: 4 },
    { name: '心悸', dept: 1, weight: 3 },
    { name: '高血压', dept: 1, weight: 4 },
    { name: '咳嗽', dept: 1, weight: 3 },
    { name: '咳痰', dept: 1, weight: 3 },
    { name: '呼吸困难', dept: 1, weight: 4 },
    { name: '哮喘', dept: 1, weight: 4 },
    { name: '腹痛', dept: 1, weight: 2 },
    { name: '腹泻', dept: 1, weight: 2 },
    { name: '恶心', dept: 1, weight: 2 },
    { name: '呕吐', dept: 1, weight: 2 },
    { name: '发烧', dept: 1, weight: 2 },
    { name: '伤口', dept: 2, weight: 4 },
    { name: '疼痛', dept: 2, weight: 2 },
    { name: '骨折', dept: 2, weight: 5 },
    { name: '扭伤', dept: 2, weight: 4 },
    { name: '红肿', dept: 2, weight: 3 },
    { name: '流血', dept: 2, weight: 4 },
    { name: '肿块', dept: 2, weight: 3 },
    { name: '发热', dept: 3, weight: 3 },
    { name: '吐奶', dept: 3, weight: 4 },
    { name: '夜哭', dept: 3, weight: 3 },
    { name: '食欲不振', dept: 3, weight: 2 },
    { name: '发育迟缓', dept: 3, weight: 3 },
    { name: '皮疹', dept: 3, weight: 3 },
    { name: '牙痛', dept: 4, weight: 4 },
    { name: '牙龈出血', dept: 4, weight: 3 },
    { name: '蛀牙', dept: 4, weight: 4 },
    { name: '口腔溃疡', dept: 4, weight: 3 },
    { name: '口臭', dept: 4, weight: 2 },
    { name: '牙齿松动', dept: 4, weight: 3 },
    { name: '失眠', dept: 5, weight: 4 },
    { name: '体虚', dept: 5, weight: 3 },
    { name: '湿气重', dept: 5, weight: 3 },
    { name: '上火', dept: 5, weight: 3 },
    { name: '气血不足', dept: 5, weight: 3 },
    { name: '内分泌失调', dept: 5, weight: 3 },
    { name: '月经不调', dept: 6, weight: 4 },
    { name: '痛经', dept: 6, weight: 4 },
    { name: '白带异常', dept: 6, weight: 3 },
    { name: '怀孕', dept: 6, weight: 4 },
    { name: '孕检', dept: 6, weight: 3 },
    { name: '更年期', dept: 6, weight: 3 }
  ];
  const symStmt = db.prepare('INSERT INTO symptoms (name, department_id, weight) VALUES (?, ?, ?)');
  symptoms.forEach(s => symStmt.run([s.name, s.dept, s.weight]));
  symStmt.free();

  const drugs = [
    { name: '氨氯地平片', spec: '5mg*14片', unit: '盒', price: 28.5, stock: 200, expiry: '2027-12-31', category: '心血管' },
    { name: '阿司匹林肠溶片', spec: '100mg*30片', unit: '盒', price: 15.8, stock: 300, expiry: '2027-06-30', category: '心血管' },
    { name: '硝苯地平缓释片', spec: '30mg*7片', unit: '盒', price: 42.0, stock: 150, expiry: '2027-09-30', category: '心血管' },
    { name: '头孢克洛缓释片', spec: '0.375g*6片', unit: '盒', price: 65.0, stock: 80, expiry: '2026-12-31', category: '抗生素' },
    { name: '氨溴索口服液', spec: '100ml:0.3g', unit: '瓶', price: 25.0, stock: 120, expiry: '2026-10-31', category: '呼吸系统' },
    { name: '沙美特罗替卡松吸入剂', spec: '250/50μg*60吸', unit: '盒', price: 198.0, stock: 50, expiry: '2027-03-31', category: '呼吸系统' },
    { name: '孟鲁司特钠片', spec: '10mg*7片', unit: '盒', price: 78.0, stock: 60, expiry: '2027-06-30', category: '呼吸系统' },
    { name: '复方氯己定含漱液', spec: '200ml', unit: '瓶', price: 18.5, stock: 5, expiry: '2026-08-31', category: '口腔用药', threshold: 20 },
    { name: '甲硝唑片', spec: '0.2g*100片', unit: '瓶', price: 8.5, stock: 3, expiry: '2026-05-31', category: '抗生素', threshold: 30 },
    { name: '布洛芬缓释胶囊', spec: '0.3g*20粒', unit: '盒', price: 22.0, stock: 180, expiry: '2027-12-31', category: '解热镇痛' },
    { name: '对乙酰氨基酚片', spec: '0.5g*20片', unit: '盒', price: 6.5, stock: 250, expiry: '2028-01-31', category: '解热镇痛' },
    { name: '奥美拉唑肠溶胶囊', spec: '20mg*14粒', unit: '盒', price: 35.0, stock: 90, expiry: '2027-08-31', category: '消化系统' },
    { name: '蒙脱石散', spec: '3g*10袋', unit: '盒', price: 18.0, stock: 110, expiry: '2027-05-31', category: '消化系统' },
    { name: '维生素C片', spec: '0.1g*100片', unit: '瓶', price: 4.5, stock: 400, expiry: '2028-06-30', category: '维生素' },
    { name: '葡萄糖酸钙口服溶液', spec: '10ml*12支', unit: '盒', price: 28.0, stock: 70, expiry: '2027-04-30', category: '维生素' }
  ];
  const drugStmt = db.prepare('INSERT INTO drugs (name, specification, unit, price, stock, expiry_date, category, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  drugs.forEach(d => drugStmt.run([d.name, d.spec, d.unit, d.price, d.stock, d.expiry, d.category, d.threshold || 10]));
  drugStmt.free();

  const today = getToday();
  const timeSlots = generateTimeSlots();
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay();

  const appointments = [
    { pid: 1, did: 1, date: today, slot: 0, queue: 1, status: 'checked', code: '638291' },
    { pid: 2, did: 1, date: today, slot: 1, queue: 2, status: 'checked', code: '527184' },
    { pid: 3, did: 1, date: today, slot: 2, queue: 3, status: 'pending', code: '419372' },
    { pid: 4, did: 2, date: today, slot: 0, queue: 1, status: 'checked', code: '832056' },
    { pid: 5, did: 2, date: today, slot: 1, queue: 2, status: 'pending', code: '294617' },
    { pid: 6, did: 3, date: today, slot: 0, queue: 1, status: 'checked', code: '715284' },
    { pid: 7, did: 4, date: today, slot: 0, queue: 1, status: 'pending', code: '368492' },
    { pid: 8, did: 5, date: today, slot: 0, queue: 1, status: 'checked', code: '950317' },
    { pid: 9, did: 6, date: today, slot: 8, queue: 1, status: 'checked', code: '481639' },
    { pid: 10, did: 1, date: today, slot: 9, queue: 1, status: 'pending', code: '572048' },
    { pid: 3, did: 2, date: getDateOffset(1), slot: 0, queue: 1, status: 'pending', code: '693150' },
    { pid: 5, did: 1, date: getDateOffset(1), slot: 1, queue: 1, status: 'pending', code: '147285' },
    { pid: 7, did: 3, date: getDateOffset(1), slot: 9, queue: 1, status: 'pending', code: '859364' },
    { pid: 1, did: 4, date: getDateOffset(2), slot: 2, queue: 1, status: 'pending', code: '204671' },
    { pid: 2, did: 6, date: getDateOffset(2), slot: 10, queue: 1, status: 'pending', code: '736918' },
    { pid: 4, did: 1, date: getDateOffset(3), slot: 3, queue: 1, status: 'pending', code: '381540' },
    { pid: 6, did: 2, date: getDateOffset(3), slot: 0, queue: 1, status: 'pending', code: '524073' },
    { pid: 8, did: 3, date: getDateOffset(4), slot: 1, queue: 1, status: 'pending', code: '617892' },
    { pid: 9, did: 1, date: getDateOffset(5), slot: 10, queue: 1, status: 'pending', code: '403826' },
    { pid: 10, did: 5, date: getDateOffset(6), slot: 4, queue: 1, status: 'pending', code: '950217' }
  ];

  const appStmt = db.prepare('INSERT INTO appointments (patient_id, family_member_id, doctor_id, date, period, time_slot, queue_number, status, visit_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\', \'localtime\'))');
  appointments.forEach(a => {
    const period = timeSlots[a.slot].startsWith('am') ? 'am' : 'pm';
    appStmt.run([a.pid, null, a.did, a.date, period, timeSlots[a.slot], a.queue, a.status, a.code]);
  });
  appStmt.free();

  const records = [
    { aid: 1, pid: 1, did: 1, complaint: '头晕、乏力一周', illness: '患者一周前无明显诱因出现头晕、乏力，伴胸闷，无恶心呕吐。既往高血压病史5年。', diagnosis: '高血压病2级，中度风险', prescription: JSON.stringify([{drug_id:1,name:'氨氯地平片',specification:'5mg*14片',unit:'盒',price:28.5,dosage:'5mg',usage:'每日一次口服',days:30,quantity:1},{drug_id:2,name:'阿司匹林肠溶片',specification:'100mg*30片',unit:'盒',price:15.8,dosage:'100mg',usage:'每日一次口服',days:30,quantity:1}]), needFollowup: true, followupDate: getDateOffset(7), followupContent: '复查血压，调整用药' },
    { aid: 2, pid: 2, did: 1, complaint: '咳嗽、咳痰两周', illness: '患者两周前受凉后出现咳嗽、咳白色粘痰，伴低热，体温最高37.8℃。', diagnosis: '急性支气管炎', prescription: JSON.stringify([{drug_id:4,name:'头孢克洛缓释片',specification:'0.375g*6片',unit:'盒',price:65.0,dosage:'0.375g',usage:'每日两次口服',days:7,quantity:2},{drug_id:5,name:'氨溴索口服液',specification:'100ml:0.3g',unit:'瓶',price:25.0,dosage:'10ml',usage:'每日三次口服',days:7,quantity:2}]), needFollowup: false },
    { aid: 4, pid: 4, did: 2, complaint: '反复咳嗽喘息三月', illness: '患者三个月来反复发作咳嗽喘息，夜间及清晨加重，有过敏史。', diagnosis: '支气管哮喘', prescription: JSON.stringify([{drug_id:6,name:'沙美特罗替卡松吸入剂',specification:'250/50μg*60吸',unit:'盒',price:198.0,dosage:'250/50μg',usage:'每日两次吸入',days:60,quantity:2},{drug_id:7,name:'孟鲁司特钠片',specification:'10mg*7片',unit:'盒',price:78.0,dosage:'10mg',usage:'每晚一次口服',days:30,quantity:5}]), needFollowup: true, followupDate: getDateOffset(14), followupContent: '评估哮喘控制情况' },
    { aid: 6, pid: 6, did: 3, complaint: '右下腹疼痛两天', illness: '患者两天前出现右下腹持续性疼痛，伴恶心，无呕吐，无发热。查体：右下腹麦氏点压痛阳性。', diagnosis: '急性阑尾炎', prescription: JSON.stringify([{drug_id:4,name:'头孢克洛缓释片',specification:'0.375g*6片',unit:'盒',price:65.0,dosage:'0.375g',usage:'每日两次口服',days:5,quantity:2}]), needFollowup: true, followupDate: getDateOffset(3), followupContent: '复查伤口愈合情况' },
    { aid: 8, pid: 8, did: 5, complaint: '牙龈出血一月', illness: '患者一月来刷牙时牙龈出血，伴口臭，无牙痛。查体：牙龈红肿，牙石较多。', diagnosis: '牙龈炎', prescription: JSON.stringify([{drug_id:8,name:'复方氯己定含漱液',specification:'200ml',unit:'瓶',price:18.5,dosage:'10ml',usage:'每日三次含漱',days:14,quantity:2}]), needFollowup: false }
  ];

  const recStmt = db.prepare('INSERT INTO medical_records (appointment_id, patient_id, family_member_id, doctor_id, chief_complaint, present_illness, diagnosis, prescription, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\', \'localtime\'))');
  records.forEach(r => recStmt.run([r.aid, r.pid, null, r.did, r.complaint, r.illness, r.diagnosis, r.prescription]));
  recStmt.free();

  const followupStmt = db.prepare('INSERT INTO followups (record_id, patient_id, family_member_id, doctor_id, followup_date, content, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
  records.filter(r => r.needFollowup).forEach(r => {
    const lastRec = queryOne('SELECT id FROM medical_records WHERE appointment_id = ?', [r.aid]);
    if (lastRec) followupStmt.run([lastRec.id, r.pid, null, r.did, r.followupDate, r.followupContent, 'pending']);
  });
  followupStmt.free();

  const reviews = [
    { pid: 1, did: 1, aid: 1, skill: 5, attitude: 5, efficiency: 4, comment: '张主任看病非常仔细，态度和蔼，解释病情很清楚，就是等的时间有点长。' },
    { pid: 2, did: 1, aid: 2, skill: 5, attitude: 4, efficiency: 5, comment: '张主任医术精湛，用药后症状明显改善，效率很高。' },
    { pid: 4, did: 2, aid: 4, skill: 4, attitude: 5, efficiency: 5, comment: '李医生非常耐心，对病人的问题一一解答，处方效果不错。' },
    { pid: 6, did: 3, aid: 6, skill: 5, attitude: 4, efficiency: 4, comment: '王主任手术做得很好，恢复很快，非常感谢！' },
    { pid: 8, did: 5, aid: 8, skill: 4, attitude: 4, efficiency: 5, comment: '赵医生技术不错，洗牙很仔细，治疗过程也很舒适。' },
    { pid: 1, did: 4, aid: null, skill: 5, attitude: 5, efficiency: 5, comment: '陈医生对小孩特别有耐心，孩子不害怕了，非常满意！' },
    { pid: 9, did: 6, aid: 9, skill: 4, attitude: 5, efficiency: 4, comment: '刘医生的针灸效果很好，失眠症状明显改善，态度也特别好。' },
    { pid: 3, did: 1, aid: null, skill: 5, attitude: 4, efficiency: 4, comment: '张主任看诊很专业，就是号比较难挂，建议增加号源。' }
  ];
  const revStmt = db.prepare('INSERT INTO reviews (patient_id, doctor_id, appointment_id, rating_skill, rating_attitude, rating_efficiency, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\', \'localtime\'))');
  reviews.forEach(r => revStmt.run([r.pid, r.did, r.aid, r.skill, r.attitude, r.efficiency, r.comment]));
  revStmt.free();

  db.run(`INSERT INTO queue_state (doctor_id, date, current_number) VALUES (1, '${today}', 2)`);
  db.run(`INSERT INTO queue_state (doctor_id, date, current_number) VALUES (2, '${today}', 1)`);
  db.run(`INSERT INTO queue_state (doctor_id, date, current_number) VALUES (3, '${today}', 1)`);
  db.run(`INSERT INTO queue_state (doctor_id, date, current_number) VALUES (5, '${today}', 1)`);
  db.run(`INSERT INTO queue_state (doctor_id, date, current_number) VALUES (6, '${today}', 1)`);
}

function queryOne(sql, params) {
  const stmt = db.prepare(sql);
  if (params && params.length > 0) stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  return db;
}

module.exports = { init, save, getDb, getToday, getDateOffset, getDayOfWeek, generateTimeSlots };
