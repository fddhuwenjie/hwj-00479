const API = 'http://localhost:8479/api';

let state = {
  departments: [],
  doctors: [],
  patients: [],
  currentPatient: null,
  currentDoctor: null,
  appointment: { step: 1, deptId: null, doctorId: null, date: null, period: null }
};

async function api(path, options = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', e);
    return { code: 1, msg: '网络请求失败' };
  }
}

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').style.display = 'flex';
}

function hideModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideModal();
});

function stars(rating, max = 5) {
  let html = '';
  for (let i = 1; i <= max; i++) {
    html += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
  }
  return html;
}

function formatDate(dateStr) {
  return dateStr || '';
}

function statusText(s) {
  const m = { pending: '待就诊', checked: '已就诊', cancelled: '已取消', no_show: '过号' };
  return m[s] || s;
}

function statusClass(s) {
  const m = { pending: 'status-pending', checked: 'status-checked', cancelled: 'status-cancelled', no_show: 'status-no_show' };
  return m[s] || '';
}

function periodText(p) {
  return p === 'am' ? '上午' : '下午';
}

async function initData() {
  const [deptRes, docRes, patRes] = await Promise.all([
    api('/departments'),
    api('/doctors'),
    api('/patients')
  ]);

  if (deptRes.code === 0) state.departments = deptRes.data;
  if (docRes.code === 0) state.doctors = docRes.data;
  if (patRes.code === 0) state.patients = patRes.data;

  const sel = document.getElementById('currentPatient');
  state.patients.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });

  const dSel = document.getElementById('currentDoctor');
  state.doctors.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = `${d.name}（${d.department_name}）`;
    dSel.appendChild(opt);
  });

  sel.addEventListener('change', () => {
    state.currentPatient = sel.value ? parseInt(sel.value) : null;
  });

  dSel.addEventListener('change', () => {
    state.currentDoctor = dSel.value ? parseInt(dSel.value) : null;
    const page = document.querySelector('.nav-item.active')?.dataset.page;
    if (page === 'queue') renderQueue();
  });

  renderDepartments();
}

// ==================== Navigation ====================

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    const page = item.dataset.page;
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById('page-' + page).style.display = 'block';
    const renderers = {
      departments: renderDepartments,
      appointment: renderAppointment,
      queue: renderQueue,
      records: renderRecords,
      reviews: renderReviews,
      stats: renderStats
    };
    if (renderers[page]) renderers[page]();
  });
});

// ==================== 科室与医生 ====================

async function renderDepartments() {
  const el = document.getElementById('page-departments');
  const deptIcons = { '内科': '🫀', '外科': '🔪', '儿科': '👶', '口腔科': '🦷', '中医科': '🍵', '妇科': '👩‍⚕️' };

  let html = `<div class="page-header"><h1>科室与医生</h1><p>浏览各科室及医生信息，了解出诊安排</p></div>`;
  html += `<div class="grid grid-3">`;

  state.departments.forEach(dept => {
    const icon = deptIcons[dept.name] || '🏥';
    const docCount = dept.doctor_count || 0;
    html += `
      <div class="card dept-card" onclick="showDeptDoctors(${dept.id})">
        <div class="dept-icon">${icon}</div>
        <div class="dept-name">${dept.name}</div>
        <div class="dept-desc">${dept.description || ''}</div>
        <div class="dept-count">${docCount}位医生出诊</div>
      </div>`;
  });

  html += `</div>`;
  html += `<div id="dept-doctors-area"></div>`;
  el.innerHTML = html;
}

async function showDeptDoctors(deptId) {
  document.querySelectorAll('.dept-card').forEach(c => c.classList.remove('selected'));
  event.currentTarget.classList.add('selected');

  const res = await api(`/departments/${deptId}/doctors`);
  if (res.code !== 0) return;

  const area = document.getElementById('dept-doctors-area');
  if (res.data.length === 0) {
    area.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📋</div><p>该科室暂无医生出诊</p></div></div>`;
    return;
  }

  let html = `<div class="card"><div class="card-title">👨‍⚕️ 医生列表</div>`;
  res.data.forEach(doc => {
    html += `
      <div class="doctor-card card" style="margin-bottom:12px" onclick="showDoctorDetail(${doc.id})">
        <div class="doctor-avatar"><img src="${doc.photo_url}" onerror="this.parentElement.innerHTML='👨‍⚕️'"></div>
        <div class="doctor-info">
          <div class="doctor-name">${doc.name} <span class="doctor-title">${doc.title}</span></div>
          <div class="doctor-specialty">擅长：${doc.specialty}</div>
          <div class="doctor-intro">${doc.intro}</div>
          <div class="doctor-fee">挂号费：¥${doc.registration_fee}</div>
        </div>
      </div>`;
  });
  html += `</div>`;
  area.innerHTML = html;
}

async function showDoctorDetail(doctorId) {
  const res = await api(`/doctors/${doctorId}`);
  if (res.code !== 0) return;
  const doc = res.data;

  let scheduleHtml = '';
  const schedule = doc.schedule || {};
  const dayNames = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' };
  for (let d = 1; d <= 7; d++) {
    const s = schedule[d] || { am: false, pm: false };
    scheduleHtml += `<div style="display:flex;gap:4px;align-items:center;">
      <span style="width:36px;font-size:13px;color:var(--text-secondary)">${dayNames[d]}</span>
      <span class="badge ${s.am ? 'badge-success' : 'badge-warning'}">${s.am ? '上午✓' : '上午—'}</span>
      <span class="badge ${s.pm ? 'badge-success' : 'badge-warning'}">${s.pm ? '下午✓' : '下午—'}</span>
    </div>`;
  }

  let reviewsHtml = '';
  if (doc.reviews && doc.reviews.length > 0) {
    doc.reviews.forEach(r => {
      reviewsHtml += `
        <div class="review-card">
          <div class="review-header">
            <span class="review-author">${r.patient_name}</span>
            <span class="review-date">${r.created_at}</span>
          </div>
          <div class="review-stars">
            <span>医术 ${stars(r.rating_skill)}</span>
            <span>态度 ${stars(r.rating_attitude)}</span>
            <span>效率 ${stars(r.rating_efficiency)}</span>
          </div>
          <div class="review-comment">${r.comment}</div>
        </div>`;
    });
  } else {
    reviewsHtml = '<div class="empty-state"><p>暂无评价</p></div>';
  }

  showModal(`
    <h3>👨‍⚕️ ${doc.name} - ${doc.title}</h3>
    <div style="margin-bottom:16px">
      <p style="color:var(--text-secondary);font-size:13px">科室：${doc.department_name} | 挂号费：¥${doc.registration_fee}</p>
      <p style="margin-top:8px;font-size:14px"><strong>擅长：</strong>${doc.specialty}</p>
      <p style="margin-top:6px;font-size:13px;color:var(--text-secondary)">${doc.intro}</p>
    </div>
    <div class="card" style="padding:12px">
      <div class="card-title">📅 出诊时间</div>
      <div style="display:flex;flex-direction:column;gap:6px">${scheduleHtml}</div>
    </div>
    <div style="margin-top:16px">
      <div class="card-title">⭐ 评价（综合评分 ${doc.rating.overall}）</div>
      ${reviewsHtml}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">关闭</button>
      <button class="btn btn-primary" onclick="hideModal();goAppointment(${doc.id})">预约挂号</button>
    </div>
  `);
}

function goAppointment(doctorId) {
  state.appointment = { step: 1, deptId: null, doctorId: doctorId, date: null, period: null };
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-page="appointment"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('page-appointment').style.display = 'block';
  renderAppointment();
}

// ==================== 预约挂号 ====================

async function renderStep1() {
  const deptIcons = { '内科': '🫀', '外科': '🔪', '儿科': '👶', '口腔科': '🦷', '中医科': '🍵', '妇科': '👩‍⚕️' };
  let html = `<div class="grid grid-3">`;
  state.departments.forEach(dept => {
    const icon = deptIcons[dept.name] || '🏥';
    const selected = state.appointment.deptId === dept.id ? 'selected' : '';
    html += `
      <div class="card dept-card ${selected}" onclick="selectDept(${dept.id})">
        <div class="dept-icon">${icon}</div>
        <div class="dept-name">${dept.name}</div>
        <div class="dept-desc">${dept.description || ''}</div>
      </div>`;
  });
  html += `</div>`;
  return html;
}

async function selectDept(deptId) {
  state.appointment.deptId = deptId;
  state.appointment.doctorId = null;
  state.appointment.step = 2;
  renderAppointment();
}

async function renderStep2() {
  if (!state.appointment.deptId) {
    state.appointment.step = 1;
    renderAppointment();
    return '';
  }
  const res = await api(`/departments/${state.appointment.deptId}/doctors`);
  if (res.code !== 0) return '<div class="empty-state"><p>该科室暂无医生</p></div>';

  let html = '';
  res.data.forEach(doc => {
    const selected = state.appointment.doctorId === doc.id ? 'selected' : '';
    html += `
      <div class="card doctor-card ${selected}" onclick="selectDoctor(${doc.id})">
        <div class="doctor-avatar"><img src="${doc.photo_url}" onerror="this.parentElement.innerHTML='👨‍⚕️'"></div>
        <div class="doctor-info">
          <div class="doctor-name">${doc.name} <span class="doctor-title">${doc.title}</span></div>
          <div class="doctor-specialty">擅长：${doc.specialty}</div>
          <div class="doctor-intro">${doc.intro}</div>
          <div class="doctor-fee">挂号费：¥${doc.registration_fee}</div>
        </div>
      </div>`;
  });

  html += `<div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=1;renderAppointment()">← 返回选择科室</button></div>`;
  return html;
}

async function selectDoctor(doctorId) {
  state.appointment.doctorId = doctorId;
  state.appointment.step = 3;
  renderAppointment();
}

async function renderStep3() {
  if (!state.appointment.doctorId) {
    state.appointment.step = 2;
    renderAppointment();
    return '';
  }
  const res = await api(`/doctors/${state.appointment.doctorId}/schedule`);
  if (res.code !== 0) return '';

  const doctor = state.doctors.find(d => d.id === state.appointment.doctorId);
  let html = `<div class="card"><div class="card-title">📅 选择就诊日期 — ${doctor?.name || ''}</div><div class="date-grid">`;
  res.data.forEach(d => {
    const hasSlot = d.am_remaining > 0 || d.pm_remaining > 0;
    const cls = d.date === state.appointment.date ? 'selected' : (!hasSlot ? 'disabled' : '');
    html += `
      <div class="date-card ${cls}" onclick="${hasSlot ? `selectDate('${d.date}')` : ''}">
        <div class="date-day">${d.date.slice(5)}</div>
        <div class="date-num">${d.date.slice(8)}</div>
        <div class="date-dow">周${d.day_of_week}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:4px">余${d.am_remaining + d.pm_remaining}号</div>
      </div>`;
  });
  html += `</div></div>`;
  html += `<div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=2;state.appointment.date=null;renderAppointment()">← 返回选择医生</button></div>`;
  return html;
}

function selectDate(date) {
  state.appointment.date = date;
  state.appointment.step = 4;
  renderAppointment();
}

async function renderStep4() {
  if (!state.appointment.date || !state.appointment.doctorId) {
    state.appointment.step = 3;
    renderAppointment();
    return '';
  }
  const res = await api(`/doctors/${state.appointment.doctorId}/schedule`);
  if (res.code !== 0) return '';

  const dateInfo = res.data.find(d => d.date === state.appointment.date);
  if (!dateInfo) return '<div class="empty-state"><p>该日期无排班</p></div>';

  let html = `<div class="card"><div class="card-title">🕐 选择就诊时段</div><div class="period-selector">`;

  html += `
    <div class="period-card ${state.appointment.period === 'am' ? 'selected' : ''} ${dateInfo.am_remaining <= 0 ? 'disabled' : ''}"
         onclick="${dateInfo.am_remaining > 0 ? "selectPeriod('am')" : ''}">
      <div class="period-name">上午</div>
      <div class="period-time">08:00 - 12:00</div>
      <div class="period-remaining">剩余 ${dateInfo.am_remaining} 个号源</div>
    </div>`;

  html += `
    <div class="period-card ${state.appointment.period === 'pm' ? 'selected' : ''} ${dateInfo.pm_remaining <= 0 ? 'disabled' : ''}"
         onclick="${dateInfo.pm_remaining > 0 ? "selectPeriod('pm')" : ''}">
      <div class="period-name">下午</div>
      <div class="period-time">14:00 - 17:00</div>
      <div class="period-remaining">剩余 ${dateInfo.pm_remaining} 个号源</div>
    </div>`;

  html += `</div></div>`;
  html += `<div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=3;state.appointment.period=null;renderAppointment()">← 返回选择日期</button></div>`;
  return html;
}

function selectPeriod(period) {
  state.appointment.period = period;
  state.appointment.step = 5;
  renderAppointment();
}

async function renderStep5() {
  if (!state.currentPatient) {
    return `<div class="card"><div class="empty-state"><div class="empty-icon">⚠️</div><p>请先在左侧选择患者身份后再预约</p></div></div>
      <div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=4;renderAppointment()">← 返回选择时段</button></div>`;
  }

  const doctor = state.doctors.find(d => d.id === state.appointment.doctorId);
  const patient = state.patients.find(p => p.id === state.currentPatient);

  let html = `
    <div class="card">
      <div class="card-title">✅ 确认预约信息</div>
      <div style="line-height:2;font-size:14px">
        <p><strong>患者：</strong>${patient?.name || ''}</p>
        <p><strong>科室：</strong>${doctor?.department_name || ''}</p>
        <p><strong>医生：</strong>${doctor?.name}（${doctor?.title}）</p>
        <p><strong>日期：</strong>${state.appointment.date} 周${new Date(state.appointment.date).getDay() === 0 ? '日' : ['一','二','三','四','五','六'][new Date(state.appointment.date).getDay()-1]}</p>
        <p><strong>时段：</strong>${periodText(state.appointment.period)}</p>
        <p><strong>挂号费：</strong><span style="color:var(--danger);font-weight:600">¥${doctor?.registration_fee || 0}</span></p>
      </div>
      <div style="margin-top:20px;display:flex;gap:8px">
        <button class="btn btn-outline" onclick="state.appointment.step=4;renderAppointment()">← 返回修改</button>
        <button class="btn btn-primary" onclick="submitAppointment()">确认预约</button>
      </div>
    </div>`;
  return html;
}

async function submitAppointment() {
  const res = await api('/appointments', {
    method: 'POST',
    body: JSON.stringify({
      patient_id: state.currentPatient,
      doctor_id: state.appointment.doctorId,
      date: state.appointment.date,
      period: state.appointment.period
    })
  });

  if (res.code !== 0) {
    showModal(`<h3>❌ 预约失败</h3><p>${res.msg}</p><div class="modal-actions"><button class="btn btn-primary" onclick="hideModal()">确定</button></div>`);
    return;
  }

  const data = res.data;
  showModal(`
    <h3>🎉 预约成功</h3>
    <div class="visit-code">${data.visit_code}</div>
    <p style="text-align:center;color:var(--text-secondary);font-size:13px">请牢记此就诊码，就诊时出示</p>
    <div style="margin-top:16px;line-height:2;font-size:14px">
      <p><strong>就诊序号：</strong>${data.queue_number}号</p>
      <p><strong>就诊日期：</strong>${data.date} ${periodText(data.period)}</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="hideModal();state.appointment={step:1,deptId:null,doctorId:null,date:null,period:null};renderAppointment()">完成</button>
    </div>
  `);
}

// ==================== 我的预约 ====================

async function renderAppointment() {
  const el = document.getElementById('page-appointment');
  const { step } = state.appointment;

  let stepsHtml = `<div class="step-indicator">`;
  const stepNames = ['选科室', '选医生', '选日期', '选时段', '确认预约'];
  for (let i = 0; i < 5; i++) {
    const cls = i + 1 < step ? 'done' : (i + 1 === step ? 'active' : '');
    stepsHtml += `<div class="step ${cls}"><span class="step-num">${i + 1 < step ? '✓' : i + 1}</span><span>${stepNames[i]}</span></div>`;
    if (i < 4) stepsHtml += `<div class="step-line ${i + 1 < step ? 'done' : ''}"></div>`;
  }
  stepsHtml += `</div>`;

  let contentHtml = '';
  if (step === 1) contentHtml = await renderStep1();
  else if (step === 2) contentHtml = await renderStep2();
  else if (step === 3) contentHtml = await renderStep3();
  else if (step === 4) contentHtml = await renderStep4();
  else if (step === 5) contentHtml = await renderStep5();

  let myApptsHtml = '';
  if (state.currentPatient) {
    const myRes = await api(`/appointments/patient/${state.currentPatient}`);
    if (myRes.code === 0 && myRes.data.length > 0) {
      myApptsHtml = `<div class="card" style="margin-top:24px"><div class="card-title">📋 我的预约</div>`;
      myRes.data.forEach(a => {
        myApptsHtml += `
          <div class="appointment-card" style="margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:8px">
            <div class="queue-number">${a.queue_number}</div>
            <div class="appointment-info">
              <div class="appointment-doctor">${a.doctor_name}（${a.department_name}）</div>
              <div class="appointment-detail">${a.date} ${periodText(a.period)} | 就诊码：${a.visit_code}</div>
            </div>
            <span class="queue-status ${statusClass(a.status)}">${statusText(a.status)}</span>
            ${a.status === 'pending' ? `<button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="cancelAppointment(${a.id})">取消</button>` : ''}
          </div>`;
      });
      myApptsHtml += `</div>`;
    }
  }

  el.innerHTML = `<div class="page-header"><h1>预约挂号</h1><p>选择科室、医生、日期和时段完成预约</p></div>${stepsHtml}${contentHtml}${myApptsHtml}`;
}

async function cancelAppointment(id) {
  if (!confirm('确定要取消此预约吗？')) return;
  const res = await api(`/appointments/${id}/cancel`, { method: 'PUT' });
  if (res.code === 0) {
    alert('取消成功');
    renderAppointment();
  } else {
    alert(res.msg);
  }
}

// ==================== 排队叫号 ====================

async function renderQueue() {
  const el = document.getElementById('page-queue');
  el.innerHTML = `<div class="page-header"><h1>排队叫号</h1><p>实时查看叫号进度，管理就诊排队</p></div><div class="loading">加载中...</div>`;

  if (!state.currentDoctor) {
    el.innerHTML = `<div class="page-header"><h1>排队叫号</h1><p>实时查看叫号进度，管理就诊排队</p></div>
      <div class="card"><div class="empty-state"><div class="empty-icon">👨‍⚕️</div><p>请在左侧选择医生身份以使用叫号功能</p></div></div>`;
    return;
  }

  const doctor = state.doctors.find(d => d.id === state.currentDoctor);
  const queueRes = await api(`/queue/today/${state.currentDoctor}`);
  const currentRes = await api(`/queue/current/${state.currentDoctor}`);

  if (queueRes.code !== 0) return;

  const queue = queueRes.data;
  const current = currentRes.code === 0 ? currentRes.data : null;

  let html = `<div class="page-header"><h1>排队叫号</h1><p>${doctor?.name} — 今日叫号管理</p></div>`;

  html += `
    <div class="queue-board">
      <div class="queue-label">当前叫号</div>
      <div class="queue-current">${current?.current_number || 0}</div>
      ${current?.current_appointment ? `<div class="queue-patient">${current.current_appointment.patient_name} 就诊中</div>` : '<div class="queue-patient">等待叫号</div>'}
      <div class="queue-waiting">等待人数：${current?.waiting_count || 0}</div>
      <div style="margin-top:16px">
        <button class="btn btn-warning" onclick="callNext()" style="font-size:16px;padding:12px 32px">🔔 叫下一位</button>
      </div>
    </div>`;

  if (queue.appointments.length > 0) {
    html += `<div class="card"><div class="card-title">📋 今日排队列表</div><div class="queue-list">`;
    queue.appointments.forEach(a => {
      const isCurrent = a.queue_number === current?.current_number;
      html += `
        <div class="queue-item ${isCurrent ? 'current' : ''} ${a.status === 'checked' ? 'checked' : ''}">
          <div class="queue-number">${a.queue_number}</div>
          <div class="queue-info">
            <div style="font-weight:500">${a.patient_name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${periodText(a.period)} | 就诊码：${a.visit_code}</div>
          </div>
          <span class="queue-status ${statusClass(a.status)}">${statusText(a.status)}</span>
        </div>`;
    });
    html += `</div></div>`;
  }

  html += `<div class="card" style="margin-top:16px"><div class="card-title">🔍 查询我的排队状态</div>
    <div class="form-group">
      <label>选择预约</label>
      <select id="queueApptSelect"><option value="">请选择今日预约</option></select>
    </div>
    <button class="btn btn-primary" onclick="checkQueueStatus()">查询</button>
    <div id="queueStatusResult" style="margin-top:12px"></div>
  </div>`;

  el.innerHTML = html;

  if (state.currentPatient) {
    const myAppts = await api(`/appointments/patient/${state.currentPatient}`);
    if (myAppts.code === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const todayAppts = myAppts.data.filter(a => a.date === today && a.status === 'pending');
      const sel = document.getElementById('queueApptSelect');
      todayAppts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.doctor_name} ${periodText(a.period)} ${a.queue_number}号`;
        sel.appendChild(opt);
      });
    }
  }
}

async function callNext() {
  const res = await api(`/queue/next/${state.currentDoctor}`, { method: 'POST' });
  if (res.code !== 0) {
    alert(res.msg);
    return;
  }
  renderQueue();
}

async function checkQueueStatus() {
  const sel = document.getElementById('queueApptSelect');
  const apptId = sel.value;
  if (!apptId) { alert('请选择预约'); return; }

  const res = await api(`/queue/status/${apptId}`);
  if (res.code !== 0) { alert(res.msg); return; }

  const d = res.data;
  document.getElementById('queueStatusResult').innerHTML = `
    <div style="background:#eff6ff;padding:16px;border-radius:8px;text-align:center">
      <div style="font-size:14px;color:var(--text-secondary)">当前叫到</div>
      <div style="font-size:48px;font-weight:700;color:var(--primary)">${d.current_number}号</div>
      <div style="margin-top:12px;font-size:16px">你是 <strong style="color:var(--danger);font-size:24px">${d.your_number}号</strong></div>
      <div style="margin-top:8px;font-size:14px;color:var(--text-secondary)">前面还有 <strong style="color:var(--warning)">${d.ahead_count}</strong> 人</div>
      <div style="margin-top:8px"><span class="queue-status ${statusClass(d.status)}">${statusText(d.status)}</span></div>
    </div>`;
}

// ==================== 病历管理 ====================

async function renderRecords() {
  const el = document.getElementById('page-records');

  if (!state.currentPatient && !state.currentDoctor) {
    el.innerHTML = `<div class="page-header"><h1>病历管理</h1><p>请先在左侧选择患者或医生身份</p></div>
      <div class="card"><div class="empty-state"><div class="empty-icon">📋</div><p>请先在左侧选择患者身份查看病历，或选择医生身份填写病历</p></div></div>`;
    return;
  }

  let html = `<div class="page-header"><h1>病历管理</h1></div>`;

  if (state.currentDoctor) {
    html += `<div class="card" style="margin-bottom:20px">
      <div class="card-title">✍️ 医生端 — 填写病历</div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">为今日已叫号的患者填写病历</p>
      <div class="form-group"><label>选择患者预约</label><select id="recordApptSelect"><option value="">请选择今日已叫号预约</option></select></div>
      <div id="recordFormArea"></div>
    </div>`;
  }

  if (state.currentPatient) {
    html += `<div class="card"><div class="card-title">📋 我的病历</div><div id="recordsListArea"><div class="loading">加载中...</div></div></div>`;
  }

  el.innerHTML = html;

  if (state.currentDoctor) {
    const queueRes = await api(`/queue/today/${state.currentDoctor}`);
    if (queueRes.code === 0) {
      const current = queueRes.data.current_number;
      const calledAppts = queueRes.data.appointments.filter(a => a.queue_number <= current && a.status !== 'checked' && a.status !== 'cancelled' && a.status !== 'no_show');
      const sel = document.getElementById('recordApptSelect');
      sel.dataset.info = JSON.stringify(calledAppts);
      calledAppts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.patient_name} ${periodText(a.period)} ${a.queue_number}号`;
        sel.appendChild(opt);
      });

      sel.addEventListener('change', () => {
        const apptId = parseInt(sel.value);
        if (!apptId) { document.getElementById('recordFormArea').innerHTML = ''; return; }
        const info = JSON.parse(sel.dataset.info || '[]');
        const appt = info.find(a => a.id === apptId);
        if (!appt) return;
        document.getElementById('recordFormArea').innerHTML = `
          <div class="form-group"><label>主诉</label><input type="text" id="recComplaint" placeholder="患者主要症状"></div>
          <div class="form-group"><label>现病史</label><textarea id="recIllness" placeholder="详细描述病史"></textarea></div>
          <div class="form-group"><label>诊断</label><input type="text" id="recDiagnosis" placeholder="诊断结果"></div>
          <div class="card-title" style="margin-top:16px">💊 处方</div>
          <div id="prescriptionList"></div>
          <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="addPrescriptionItem()">+ 添加药品</button>
          <div style="margin-top:16px">
            <button class="btn btn-primary" onclick="saveRecord(${appt.id}, ${appt.patient_id}, ${appt.doctor_id})">保存病历</button>
          </div>`;
      });
    }
  }

  if (state.currentPatient) {
    const res = await api(`/records/patient/${state.currentPatient}`);
    const area = document.getElementById('recordsListArea');
    if (res.code !== 0 || res.data.length === 0) {
      area.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>暂无病历记录</p></div>';
    } else {
      let listHtml = '';
      res.data.forEach(r => {
        let prescHtml = '';
        if (r.prescription && r.prescription.length > 0) {
          r.prescription.forEach(p => {
            prescHtml += `<div class="prescription-item"><div class="prescription-drug">${p.name}</div><div class="prescription-detail">${p.dosage} | ${p.usage} | ${p.days}天</div></div>`;
          });
        }
        listHtml += `
          <div class="card" style="margin-bottom:12px;cursor:pointer" onclick="showRecordDetail(${r.id})">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600">${r.diagnosis}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${r.date} ${periodText(r.period)} | ${r.doctor_name}（${r.department_name}）</div>
              </div>
              <span style="color:var(--primary)">查看详情 →</span>
            </div>
          </div>`;
      });
      area.innerHTML = listHtml;
    }
  }
}

function addPrescriptionItem() {
  const list = document.getElementById('prescriptionList');
  const idx = list.children.length;
  const div = document.createElement('div');
  div.className = 'prescription-item';
  div.innerHTML = `
    <div class="grid grid-4" style="gap:8px">
      <div class="form-group" style="margin:0"><input type="text" class="presc-name" placeholder="药品名"></div>
      <div class="form-group" style="margin:0"><input type="text" class="presc-dosage" placeholder="剂量"></div>
      <div class="form-group" style="margin:0"><input type="text" class="presc-usage" placeholder="用法"></div>
      <div class="form-group" style="margin:0"><input type="text" class="presc-days" placeholder="天数"></div>
    </div>`;
  list.appendChild(div);
}

async function saveRecord(appointmentId, patientId, doctorId) {
  const complaint = document.getElementById('recComplaint').value;
  const illness = document.getElementById('recIllness').value;
  const diagnosis = document.getElementById('recDiagnosis').value;

  if (!complaint || !diagnosis) { alert('请填写主诉和诊断'); return; }

  const prescription = [];
  document.querySelectorAll('#prescriptionList .prescription-item').forEach(item => {
    const name = item.querySelector('.presc-name').value;
    const dosage = item.querySelector('.presc-dosage').value;
    const usage = item.querySelector('.presc-usage').value;
    const days = item.querySelector('.presc-days').value;
    if (name) prescription.push({ name, dosage, usage, days: parseInt(days) || 0 });
  });

  const res = await api('/records', {
    method: 'POST',
    body: JSON.stringify({ appointment_id: appointmentId, patient_id: patientId, doctor_id: doctorId, chief_complaint: complaint, present_illness: illness, diagnosis, prescription })
  });

  if (res.code === 0) {
    alert('病历保存成功');
    renderRecords();
  } else {
    alert(res.msg);
  }
}

async function showRecordDetail(id) {
  const res = await api(`/records/${id}`);
  if (res.code !== 0) { alert(res.msg); return; }
  const r = res.data;

  let prescHtml = '';
  if (r.prescription && r.prescription.length > 0) {
    r.prescription.forEach(p => {
      prescHtml += `<div class="prescription-item"><div class="prescription-drug">${p.name}</div><div class="prescription-detail">${p.dosage} | ${p.usage} | ${p.days}天</div></div>`;
    });
  } else {
    prescHtml = '<p style="color:var(--text-secondary);font-size:13px">无处方</p>';
  }

  showModal(`
    <h3>📋 病历详情</h3>
    <div style="line-height:2;font-size:14px">
      <p><strong>就诊日期：</strong>${r.date} ${periodText(r.period)}</p>
      <p><strong>医生：</strong>${r.doctor_name}（${r.department_name}）</p>
      <p><strong>主诉：</strong>${r.chief_complaint}</p>
      <p><strong>现病史：</strong>${r.present_illness || '无'}</p>
      <p><strong>诊断：</strong><span style="color:var(--danger);font-weight:600">${r.diagnosis}</span></p>
    </div>
    <div style="margin-top:16px">
      <div class="card-title">💊 处方</div>
      ${prescHtml}
    </div>
    <div class="modal-actions"><button class="btn btn-primary" onclick="hideModal()">关闭</button></div>
  `);
}

// ==================== 评价反馈 ====================

async function renderReviews() {
  const el = document.getElementById('page-reviews');
  el.innerHTML = `<div class="page-header"><h1>评价反馈</h1><p>查看医生评价，提交就诊反馈</p></div><div class="loading">加载中...</div>`;

  let html = '';

  if (state.currentPatient) {
    html += `<div class="card" style="margin-bottom:20px">
      <div class="card-title">✍️ 提交评价</div>
      <div class="form-group"><label>选择医生</label><select id="reviewDoctorSelect"><option value="">请选择医生</option></select></div>
      <div id="reviewFormArea"></div>
    </div>`;
  }

  html += `<div class="tabs">
    <div class="tab active" onclick="switchReviewTab(this, 'all')">全部评价</div>`;

  state.doctors.forEach(d => {
    html += `<div class="tab" onclick="switchReviewTab(this, ${d.id})">${d.name}</div>`;
  });

  html += `</div><div id="reviewsListArea"><div class="loading">加载中...</div></div>`;

  el.innerHTML = `<div class="page-header"><h1>评价反馈</h1><p>查看医生评价，提交就诊反馈</p></div>${html}`;

  if (state.currentPatient) {
    const sel = document.getElementById('reviewDoctorSelect');
    state.doctors.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.name}（${d.department_name}）`;
      sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
      const docId = parseInt(sel.value);
      if (!docId) { document.getElementById('reviewFormArea').innerHTML = ''; return; }
      document.getElementById('reviewFormArea').innerHTML = `
        <div class="form-group"><label>医术评分</label><div class="star-input" id="starSkill">${[1,2,3,4,5].map(i=>`<span class="star" onclick="setStarRating('starSkill',${i})">★</span>`).join('')}</div><input type="hidden" id="ratingSkill" value="0"></div>
        <div class="form-group"><label>态度评分</label><div class="star-input" id="starAttitude">${[1,2,3,4,5].map(i=>`<span class="star" onclick="setStarRating('starAttitude',${i})">★</span>`).join('')}</div><input type="hidden" id="ratingAttitude" value="0"></div>
        <div class="form-group"><label>效率评分</label><div class="star-input" id="starEfficiency">${[1,2,3,4,5].map(i=>`<span class="star" onclick="setStarRating('starEfficiency',${i})">★</span>`).join('')}</div><input type="hidden" id="ratingEfficiency" value="0"></div>
        <div class="form-group"><label>文字评价</label><textarea id="reviewComment" placeholder="请分享您的就诊体验"></textarea></div>
        <button class="btn btn-primary" onclick="submitReview(${docId})">提交评价</button>`;
    });
  }

  await loadReviews('all');
}

function setStarRating(containerId, value) {
  const container = document.getElementById(containerId);
  const stars = container.querySelectorAll('.star');
  stars.forEach((s, i) => {
    s.classList.toggle('filled', i < value);
  });
  const fieldMap = { starSkill: 'ratingSkill', starAttitude: 'ratingAttitude', starEfficiency: 'ratingEfficiency' };
  document.getElementById(fieldMap[containerId]).value = value;
}

async function switchReviewTab(tabEl, doctorId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  await loadReviews(doctorId);
}

async function loadReviews(doctorId) {
  const area = document.getElementById('reviewsListArea');

  if (doctorId === 'all') {
    let allHtml = '';
    for (const doc of state.doctors) {
      const res = await api(`/reviews/doctor/${doc.id}`);
      if (res.code !== 0) continue;
      const data = res.data;
      if (data.reviews.length === 0) continue;

      allHtml += `<div class="card" style="margin-bottom:16px">
        <div class="review-summary">
          <div class="review-overall"><div class="score">${data.stats.overall}</div><div class="total">${data.stats.total}条评价</div></div>
          <div class="review-bars">
            <div class="review-bar-item"><span class="label">医术</span><div class="bar"><div class="bar-fill" style="width:${data.stats.avg_skill*20}%"></div></div><span class="val">${data.stats.avg_skill}</span></div>
            <div class="review-bar-item"><span class="label">态度</span><div class="bar"><div class="bar-fill" style="width:${data.stats.avg_attitude*20}%"></div></div><span class="val">${data.stats.avg_attitude}</span></div>
            <div class="review-bar-item"><span class="label">效率</span><div class="bar"><div class="bar-fill" style="width:${data.stats.avg_efficiency*20}%"></div></div><span class="val">${data.stats.avg_efficiency}</span></div>
          </div>
          <div style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--success)">${data.stats.good_rate}</div><div style="font-size:12px;color:var(--text-secondary)">好评率</div></div>
        </div>
        <div class="card-title" style="margin-top:12px">👨‍⚕️ ${doc.name}</div>`;

      data.reviews.forEach(r => {
        allHtml += `
          <div class="review-card">
            <div class="review-header">
              <span class="review-author">${r.patient_name}</span>
              <span class="review-date">${r.created_at}</span>
            </div>
            <div class="review-stars">
              <span>医术 ${stars(r.rating_skill)}</span>
              <span>态度 ${stars(r.rating_attitude)}</span>
              <span>效率 ${stars(r.rating_efficiency)}</span>
            </div>
            <div class="review-comment">${r.comment}</div>
          </div>`;
      });
      allHtml += `</div>`;
    }
    area.innerHTML = allHtml || '<div class="empty-state"><div class="empty-icon">⭐</div><p>暂无评价</p></div>';
  } else {
    const res = await api(`/reviews/doctor/${doctorId}`);
    if (res.code !== 0) { area.innerHTML = '<div class="empty-state"><p>加载失败</p></div>'; return; }
    const data = res.data;

    let html = `<div class="card">
      <div class="review-summary">
        <div class="review-overall"><div class="score">${data.stats.overall}</div><div class="total">${data.stats.total}条评价</div></div>
        <div class="review-bars">
          <div class="review-bar-item"><span class="label">医术</span><div class="bar"><div class="bar-fill" style="width:${data.stats.avg_skill*20}%"></div></div><span class="val">${data.stats.avg_skill}</span></div>
          <div class="review-bar-item"><span class="label">态度</span><div class="bar"><div class="bar-fill" style="width:${data.stats.avg_attitude*20}%"></div></div><span class="val">${data.stats.avg_attitude}</span></div>
          <div class="review-bar-item"><span class="label">效率</span><div class="bar"><div class="bar-fill" style="width:${data.stats.avg_efficiency*20}%"></div></div><span class="val">${data.stats.avg_efficiency}</span></div>
        </div>
        <div style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--success)">${data.stats.good_rate}</div><div style="font-size:12px;color:var(--text-secondary)">好评率</div></div>
      </div>`;

    if (data.reviews.length === 0) {
      html += '<div class="empty-state"><p>暂无评价</p></div>';
    } else {
      data.reviews.forEach(r => {
        html += `
          <div class="review-card">
            <div class="review-header">
              <span class="review-author">${r.patient_name}</span>
              <span class="review-date">${r.created_at}</span>
            </div>
            <div class="review-stars">
              <span>医术 ${stars(r.rating_skill)}</span>
              <span>态度 ${stars(r.rating_attitude)}</span>
              <span>效率 ${stars(r.rating_efficiency)}</span>
            </div>
            <div class="review-comment">${r.comment}</div>
          </div>`;
      });
    }
    html += `</div>`;
    area.innerHTML = html;
  }
}

async function submitReview(doctorId) {
  const skill = parseInt(document.getElementById('ratingSkill').value);
  const attitude = parseInt(document.getElementById('ratingAttitude').value);
  const efficiency = parseInt(document.getElementById('ratingEfficiency').value);
  const comment = document.getElementById('reviewComment').value;

  if (!skill || !attitude || !efficiency) { alert('请完成所有评分'); return; }

  const res = await api('/reviews', {
    method: 'POST',
    body: JSON.stringify({
      patient_id: state.currentPatient,
      doctor_id: doctorId,
      rating_skill: skill,
      rating_attitude: attitude,
      rating_efficiency: efficiency,
      comment
    })
  });

  if (res.code === 0) {
    alert('评价成功');
    renderReviews();
  } else {
    alert(res.msg);
  }
}

// ==================== 数据统计 ====================

async function renderStats() {
  const el = document.getElementById('page-stats');
  el.innerHTML = `<div class="page-header"><h1>数据统计</h1><p>诊所运营数据概览与分析</p></div><div class="loading">加载中...</div>`;

  const [deptRes, docRes, patRes, hotRes, revRes] = await Promise.all([
    api('/stats/department-today'),
    api('/stats/doctor-weekly'),
    api('/stats/patient-frequency'),
    api('/stats/hot-periods'),
    api('/stats/revenue')
  ]);

  let html = `<div class="page-header"><h1>数据统计</h1><p>诊所运营数据概览与分析</p></div>`;

  html += `<div class="card" style="margin-bottom:20px"><div class="card-title">📊 今日各科室挂号量</div>`;

  if (deptRes.code === 0 && deptRes.data.length > 0) {
    html += `<div class="grid grid-3" style="margin-bottom:16px">`;
    deptRes.data.forEach(dept => {
      html += `
        <div class="card stat-card">
          <div class="stat-value">${dept.total_appointments}</div>
          <div class="stat-label">${dept.name}</div>
          <div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">上午 ${dept.am_count} | 下午 ${dept.pm_count}</div>
          <div class="progress-bar"><div class="progress-fill blue" style="width:${dept.total_quota > 0 ? (dept.total_appointments / dept.total_quota * 100) : 0}%"></div></div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">剩余 ${dept.remaining} / ${dept.total_quota}</div>
        </div>`;
    });
    html += `</div>`;

    const maxVal = Math.max(...deptRes.data.map(d => d.total_appointments), 1);
    html += `<div class="bar-chart">`;
    deptRes.data.forEach(dept => {
      const pct = (dept.total_appointments / maxVal * 100);
      html += `<div class="bar-item"><div class="bar-value">${dept.total_appointments}</div><div class="bar-rect" style="height:${pct}%"></div><div class="bar-label">${dept.name}</div></div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  html += `<div class="card" style="margin-bottom:20px"><div class="card-title">👨‍⚕️ 医生本周接诊量</div>`;
  if (docRes.code === 0 && docRes.data.length > 0) {
    html += `<div class="table-wrapper"><table>
      <thead><tr><th>医生</th><th>科室</th><th>已接诊</th><th>总预约</th><th>接诊率</th></tr></thead><tbody>`;
    docRes.data.forEach(d => {
      const rate = d.total_count > 0 ? ((d.checked_count / d.total_count) * 100).toFixed(0) : 0;
      html += `<tr><td>${d.name}（${d.title}）</td><td>${d.department_name}</td><td>${d.checked_count}</td><td>${d.total_count}</td><td><span class="badge ${parseInt(rate)>=80?'badge-success':'badge-warning'}">${rate}%</span></td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  html += `</div>`;

  html += `<div class="card" style="margin-bottom:20px"><div class="card-title">👥 患者就诊频率分析</div>`;
  if (patRes.code === 0 && patRes.data.length > 0) {
    html += `<div class="table-wrapper"><table>
      <thead><tr><th>患者</th><th>联系电话</th><th>就诊次数</th><th>预约次数</th><th>频率</th></tr></thead><tbody>`;
    patRes.data.forEach(p => {
      const freq = p.visit_count >= 3 ? '高频' : (p.visit_count >= 2 ? '中频' : '低频');
      const badge = freq === '高频' ? 'badge-danger' : (freq === '中频' ? 'badge-warning' : 'badge-primary');
      html += `<tr><td>${p.name}</td><td>${p.phone}</td><td>${p.visit_count}</td><td>${p.appointment_count}</td><td><span class="badge ${badge}">${freq}</span></td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  html += `</div>`;

  html += `<div class="card" style="margin-bottom:20px"><div class="card-title">🔥 热门时段统计</div>`;
  if (hotRes.code === 0) {
    const data = hotRes.data;
    html += `<div class="grid grid-2" style="margin-bottom:16px">`;
    data.period_summary.forEach(p => {
      html += `<div class="card stat-card"><div class="stat-value">${p.count}</div><div class="stat-label">${periodText(p.period)}挂号总数</div></div>`;
    });
    html += `</div>`;

    if (data.full_periods && data.full_periods.length > 0) {
      html += `<div class="card-title" style="margin-top:12px">⚠️ 已满时段</div><div class="table-wrapper"><table>
        <thead><tr><th>医生</th><th>日期</th><th>时段</th><th>挂号数</th></tr></thead><tbody>`;
      data.full_periods.forEach(f => {
        html += `<tr><td>${f.doctor_name}</td><td>${f.date}</td><td>${periodText(f.period)}</td><td>${f.count}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }
  }
  html += `</div>`;

  html += `<div class="card"><div class="card-title">💰 营收统计</div>`;
  if (revRes.code === 0) {
    const total = revRes.data.total || {};
    html += `<div class="revenue-total"><div class="amount">¥${(total.total_revenue || 0).toFixed(0)}</div><div class="label">总营收 | 共 ${total.total_count || 0} 人次就诊</div></div>`;

    html += `<div class="grid grid-2">`;
    html += `<div><div class="card-title">按科室</div><div class="table-wrapper"><table>
      <thead><tr><th>科室</th><th>人次</th><th>营收</th></tr></thead><tbody>`;
    (revRes.data.by_department || []).forEach(d => {
      html += `<tr><td>${d.name}</td><td>${d.count}</td><td style="color:var(--primary);font-weight:600">¥${(d.revenue||0).toFixed(0)}</td></tr>`;
    });
    html += `</tbody></table></div></div>`;

    html += `<div><div class="card-title">按医生</div><div class="table-wrapper"><table>
      <thead><tr><th>医生</th><th>人次</th><th>营收</th></tr></thead><tbody>`;
    (revRes.data.by_doctor || []).forEach(d => {
      html += `<tr><td>${d.name}</td><td>${d.count}</td><td style="color:var(--primary);font-weight:600">¥${(d.revenue||0).toFixed(0)}</td></tr>`;
    });
    html += `</tbody></table></div></div>`;

    html += `</div>`;
  }
  html += `</div>`;

  el.innerHTML = html;
}

// ==================== Init ====================

initData();
