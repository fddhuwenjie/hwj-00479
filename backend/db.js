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
      specialty TEXT,
      schedule TEXT,
      photo_url TEXT,
      intro TEXT,
      registration_fee REAL DEFAULT 0,
      FOREIGN KEY (department_id) REFERENCES departments(id)
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
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      period TEXT NOT NULL,
      queue_number INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      visit_code TEXT,
      no_show_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (doctor_id) REFERENCES doctors(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      doctor_id INTEGER NOT NULL,
      chief_complaint TEXT,
      present_illness TEXT,
      diagnosis TEXT,
      prescription TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (appointment_id) REFERENCES appointments(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
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
}

function seedData() {
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
    { name: '张明华', title: '主任医师', dept: 1, specialty: '心血管疾病、高血压、糖尿病', schedule: JSON.stringify({1:{am:true,pm:true},3:{am:true,pm:false},5:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=zhangmh', intro: '从医30年，擅长各类心血管疾病的诊治，曾获省级科技进步奖。', fee: 50 },
    { name: '李秀英', title: '副主任医师', dept: 1, specialty: '呼吸系统疾病、支气管哮喘', schedule: JSON.stringify({2:{am:true,pm:true},4:{am:true,pm:true},6:{am:true,pm:false}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=lixy', intro: '呼吸内科专家，对慢阻肺、支气管哮喘有丰富的临床经验。', fee: 35 },
    { name: '王建国', title: '主任医师', dept: 2, specialty: '普外科手术、腹腔镜微创手术', schedule: JSON.stringify({1:{am:true,pm:false},2:{am:true,pm:true},4:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=wangjg', intro: '外科主任，擅长各类微创手术，手术经验超过5000例。', fee: 50 },
    { name: '陈晓红', title: '副主任医师', dept: 3, specialty: '儿童呼吸道疾病、新生儿疾病', schedule: JSON.stringify({1:{am:true,pm:true},3:{am:true,pm:true},5:{am:true,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=chenxh', intro: '儿科副主任医师，从事儿科临床工作20年，对儿童常见病有丰富经验。', fee: 35 },
    { name: '赵德明', title: '主治医师', dept: 4, specialty: '牙齿修复、根管治疗、牙周病', schedule: JSON.stringify({2:{am:true,pm:true},4:{am:true,pm:true},6:{am:true,pm:false}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=zhaodm', intro: '口腔科主治医师，擅长各类牙齿修复和根管治疗。', fee: 25 },
    { name: '刘芳', title: '主治医师', dept: 5, specialty: '中医内科、针灸推拿、失眠调理', schedule: JSON.stringify({1:{am:true,pm:true},3:{am:true,pm:false},5:{am:false,pm:true}}), photo_url: 'https://api.dicebear.com/7.x/personas/svg?seed=liufang', intro: '中医世家传承，擅长运用中医中药及针灸治疗各类内科疾病。', fee: 25 }
  ];

  const docStmt = db.prepare('INSERT INTO doctors (name, title, department_id, specialty, schedule, photo_url, intro, registration_fee) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  doctors.forEach(d => docStmt.run([d.name, d.title, d.dept, d.specialty, d.schedule, d.photo_url, d.intro, d.fee]));
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

  const today = getToday();
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay();

  const appointments = [
    { pid: 1, did: 1, date: today, period: 'am', queue: 1, status: 'checked', code: '638291' },
    { pid: 2, did: 1, date: today, period: 'am', queue: 2, status: 'checked', code: '527184' },
    { pid: 3, did: 1, date: today, period: 'am', queue: 3, status: 'pending', code: '419372' },
    { pid: 4, did: 2, date: today, period: 'am', queue: 1, status: 'checked', code: '832056' },
    { pid: 5, did: 2, date: today, period: 'am', queue: 2, status: 'pending', code: '294617' },
    { pid: 6, did: 3, date: today, period: 'am', queue: 1, status: 'checked', code: '715284' },
    { pid: 7, did: 4, date: today, period: 'am', queue: 1, status: 'pending', code: '368492' },
    { pid: 8, did: 5, date: today, period: 'am', queue: 1, status: 'checked', code: '950317' },
    { pid: 9, did: 6, date: today, period: 'am', queue: 1, status: 'checked', code: '481639' },
    { pid: 10, did: 1, date: today, period: 'pm', queue: 1, status: 'pending', code: '572048' },
    { pid: 3, did: 2, date: getDateOffset(1), period: 'am', queue: 1, status: 'pending', code: '693150' },
    { pid: 5, did: 1, date: getDateOffset(1), period: 'am', queue: 1, status: 'pending', code: '147285' },
    { pid: 7, did: 3, date: getDateOffset(1), period: 'pm', queue: 1, status: 'pending', code: '859364' },
    { pid: 1, did: 4, date: getDateOffset(2), period: 'am', queue: 1, status: 'pending', code: '204671' },
    { pid: 2, did: 6, date: getDateOffset(2), period: 'pm', queue: 1, status: 'pending', code: '736918' },
    { pid: 4, did: 1, date: getDateOffset(3), period: 'am', queue: 1, status: 'pending', code: '381540' },
    { pid: 6, did: 2, date: getDateOffset(3), period: 'am', queue: 1, status: 'pending', code: '524073' },
    { pid: 8, did: 3, date: getDateOffset(4), period: 'am', queue: 1, status: 'pending', code: '617892' },
    { pid: 9, did: 1, date: getDateOffset(5), period: 'pm', queue: 1, status: 'pending', code: '403826' },
    { pid: 10, did: 5, date: getDateOffset(6), period: 'am', queue: 1, status: 'pending', code: '950217' }
  ];

  const appStmt = db.prepare('INSERT INTO appointments (patient_id, doctor_id, date, period, queue_number, status, visit_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\', \'localtime\'))');
  appointments.forEach(a => appStmt.run([a.pid, a.did, a.date, a.period, a.queue, a.status, a.code]));
  appStmt.free();

  const records = [
    { aid: 1, pid: 1, did: 1, complaint: '头晕、乏力一周', illness: '患者一周前无明显诱因出现头晕、乏力，伴胸闷，无恶心呕吐。既往高血压病史5年。', diagnosis: '高血压病2级，中度风险', prescription: JSON.stringify([{name:'氨氯地平片',dosage:'5mg',usage:'每日一次口服',days:30},{name:'阿司匹林肠溶片',dosage:'100mg',usage:'每日一次口服',days:30}]) },
    { aid: 2, pid: 2, did: 1, complaint: '咳嗽、咳痰两周', illness: '患者两周前受凉后出现咳嗽、咳白色粘痰，伴低热，体温最高37.8℃。', diagnosis: '急性支气管炎', prescription: JSON.stringify([{name:'头孢克洛缓释片',dosage:'0.375g',usage:'每日两次口服',days:7},{name:'氨溴索口服液',dosage:'10ml',usage:'每日三次口服',days:7}]) },
    { aid: 4, pid: 4, did: 2, complaint: '反复咳嗽喘息三月', illness: '患者三个月来反复发作咳嗽喘息，夜间及清晨加重，有过敏史。', diagnosis: '支气管哮喘', prescription: JSON.stringify([{name:'沙美特罗替卡松吸入剂',dosage:'250/50μg',usage:'每日两次吸入',days:60},{name:'孟鲁司特钠片',dosage:'10mg',usage:'每晚一次口服',days:30}]) },
    { aid: 6, pid: 6, did: 3, complaint: '右下腹疼痛两天', illness: '患者两天前出现右下腹持续性疼痛，伴恶心，无呕吐，无发热。查体：右下腹麦氏点压痛阳性。', diagnosis: '急性阑尾炎', prescription: JSON.stringify([{name:'头孢呋辛钠',dosage:'1.5g',usage:'每日两次静脉注射',days:5},{name:'甲硝唑注射液',dosage:'0.5g',usage:'每日两次静脉注射',days:5}]) },
    { aid: 8, pid: 8, did: 5, complaint: '牙龈出血一月', illness: '患者一月来刷牙时牙龈出血，伴口臭，无牙痛。查体：牙龈红肿，牙石较多。', diagnosis: '牙龈炎', prescription: JSON.stringify([{name:'复方氯己定含漱液',dosage:'10ml',usage:'每日三次含漱',days:14},{name:'甲硝唑片',dosage:'0.2g',usage:'每日三次口服',days:7}]) }
  ];

  const recStmt = db.prepare('INSERT INTO medical_records (appointment_id, patient_id, doctor_id, chief_complaint, present_illness, diagnosis, prescription, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\', \'localtime\'))');
  records.forEach(r => recStmt.run([r.aid, r.pid, r.did, r.complaint, r.illness, r.diagnosis, r.prescription]));
  recStmt.free();

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

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function getDb() {
  return db;
}

module.exports = { init, save, getDb, getToday, getDateOffset, getDayOfWeek };
