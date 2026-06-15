const API = 'http://localhost:8479/api';

let state = {
  departments: [],
  doctors: [],
  patients: [],
  branches: [],
  familyMembers: [],
  currentPatient: null,
  currentDoctor: null,
  appointment: { step: 0, branchId: null, deptId: null, doctorId: null, date: null, timeSlot: null, familyMemberId: null }
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
  const [deptRes, docRes, patRes, branchRes] = await Promise.all([
    api('/departments'),
    api('/doctors'),
    api('/patients'),
    api('/branches')
  ]);

  if (deptRes.code === 0) state.departments = deptRes.data;
  if (docRes.code === 0) state.doctors = docRes.data;
  if (patRes.code === 0) state.patients = patRes.data;
  if (branchRes.code === 0) state.branches = branchRes.data;

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
      triage: renderTriage,
      appointment: renderAppointment,
      queue: renderQueue,
      records: renderRecords,
      followups: renderFollowups,
      family: renderFamily,
      drugs: renderDrugs,
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
  const doctor = state.doctors.find(d => d.id === doctorId);
  state.appointment = {
    step: 3,
    branchId: doctor?.branch_id || null,
    deptId: doctor?.department_id || null,
    doctorId: doctorId,
    date: null,
    timeSlot: null,
    familyMemberId: null
  };
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-page="appointment"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('page-appointment').style.display = 'block';
  renderAppointment();
}

// ==================== 预约挂号 ====================

async function renderStep0() {
  let html = `<div class="card"><div class="card-title">🏥 选择院区</div><div class="grid grid-3">`;
  state.branches.forEach(b => {
    const selected = state.appointment.branchId === b.id ? 'selected' : '';
    html += `
      <div class="card dept-card ${selected}" onclick="selectBranch(${b.id})">
        <div class="dept-icon">🏥</div>
        <div class="dept-name">${b.name}</div>
        <div class="dept-desc">${b.address || ''}</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:6px">${b.doctor_count || 0}位医生出诊</div>
      </div>`;
  });
  html += `</div></div>`;
  return html;
}

function selectBranch(branchId) {
  state.appointment.branchId = branchId;
  state.appointment.deptId = null;
  state.appointment.step = 1;
  renderAppointment();
}

async function renderStep1() {
  const deptIcons = { '内科': '🫀', '外科': '🔪', '儿科': '👶', '口腔科': '🦷', '中医科': '🍵', '妇科': '👩‍⚕️' };
  let depts = state.departments;

  if (state.appointment.branchId) {
    const res = await api(`/branches/${state.appointment.branchId}/departments`);
    if (res.code === 0) depts = res.data;
  }

  let html = `<div class="grid grid-3">`;
  depts.forEach(dept => {
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
  html += `<div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=0;state.appointment.branchId=null;renderAppointment()">← 返回选择院区</button></div>`;
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

  let url = `/departments/${state.appointment.deptId}/doctors`;
  if (state.appointment.branchId) url += `?branch_id=${state.appointment.branchId}`;

  const res = await api(url);
  if (res.code !== 0 || res.data.length === 0) {
    return `<div class="card"><div class="empty-state"><p>该科室在此院区暂无医生出诊</p></div>
      <div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=1;renderAppointment()">← 返回选择科室</button></div>
    </div>`;
  }

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
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">📍 ${doc.branch_name || ''}</div>
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
    const hasSlot = d.total_remaining > 0;
    const cls = d.date === state.appointment.date ? 'selected' : (!hasSlot ? 'disabled' : '');
    html += `
      <div class="date-card ${cls}" onclick="${hasSlot ? `selectDate('${d.date}')` : ''}">
        <div class="date-day">${d.date.slice(5)}</div>
        <div class="date-num">${d.date.slice(8)}</div>
        <div class="date-dow">周${d.day_of_week}</div>
        <div style="font-size:10px;color:var(--text-secondary);margin-top:4px">余${d.total_remaining}号</div>
      </div>`;
  });
  html += `</div></div>`;
  html += `<div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=2;state.appointment.date=null;renderAppointment()">← 返回选择医生</button></div>`;
  return html;
}

function selectDate(date) {
  state.appointment.date = date;
  state.appointment.timeSlot = null;
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

  let html = `<div class="card"><div class="card-title">🕐 选择就诊时段</div>`;

  const amSlots = dateInfo.slots.filter(s => s.key.startsWith('am_'));
  const pmSlots = dateInfo.slots.filter(s => s.key.startsWith('pm_'));

  if (amSlots.length > 0) {
    html += `<div style="margin-bottom:16px">
      <div style="font-weight:500;font-size:14px;margin-bottom:8px">🌅 上午 (08:00 - 12:00)</div>
      <div class="time-slot-grid">`;
    amSlots.forEach(slot => {
      const available = slot.remaining > 0;
      const selected = state.appointment.timeSlot === slot.key ? 'selected' : '';
      html += `
        <div class="time-slot ${selected} ${!available ? 'disabled' : ''}"
             onclick="${available ? `selectTimeSlot('${slot.key}')` : ''}">
          <div class="slot-time">${slot.time}</div>
          <div class="slot-status">${available ? `余${slot.remaining}号` : '已满'}</div>
        </div>`;
    });
    html += `</div></div>`;
  }

  if (pmSlots.length > 0) {
    html += `<div>
      <div style="font-weight:500;font-size:14px;margin-bottom:8px">🌆 下午 (14:00 - 17:00)</div>
      <div class="time-slot-grid">`;
    pmSlots.forEach(slot => {
      const available = slot.remaining > 0;
      const selected = state.appointment.timeSlot === slot.key ? 'selected' : '';
      html += `
        <div class="time-slot ${selected} ${!available ? 'disabled' : ''}"
             onclick="${available ? `selectTimeSlot('${slot.key}')` : ''}">
          <div class="slot-time">${slot.time}</div>
          <div class="slot-status">${available ? `余${slot.remaining}号` : '已满'}</div>
        </div>`;
    });
    html += `</div></div>`;
  }

  html += `</div>`;
  html += `<div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=3;state.appointment.timeSlot=null;renderAppointment()">← 返回选择日期</button></div>`;
  return html;
}

function selectTimeSlot(slot) {
  state.appointment.timeSlot = slot;
  state.appointment.step = 5;
  renderAppointment();
}

async function renderStep5() {
  if (!state.currentPatient) {
    return `<div class="card"><div class="empty-state"><div class="empty-icon">⚠️</div><p>请先在左侧选择患者身份后再预约</p></div></div>
      <div style="margin-top:16px"><button class="btn btn-outline" onclick="state.appointment.step=4;renderAppointment()">← 返回选择时段</button></div>`;
  }

  await loadFamilyMembers();
  const patient = state.patients.find(p => p.id === state.currentPatient);
  const doctor = state.doctors.find(d => d.id === state.appointment.doctorId);

  let html = `
    <div class="card">
      <div class="card-title">👤 为谁挂号</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid ${!state.appointment.familyMemberId ? 'var(--primary)' : 'var(--border)'};border-radius:8px;cursor:pointer;background:${!state.appointment.familyMemberId ? '#eff6ff' : 'transparent'}"
               onclick="selectFamilyMember(null)">
          <input type="radio" ${!state.appointment.familyMemberId ? 'checked' : ''} style="width:18px;height:18px">
          <div style="flex:1">
            <div style="font-weight:500">${patient?.name || ''}（本人）</div>
            <div style="font-size:12px;color:var(--text-secondary)">${patient?.phone || ''} | ${patient?.gender || ''}</div>
          </div>
        </label>`;

  state.familyMembers.forEach(m => {
    const selected = state.appointment.familyMemberId === m.id;
    html += `
      <label style="display:flex;align-items:center;gap:10px;padding:12px;border:2px solid ${selected ? 'var(--primary)' : 'var(--border)'};border-radius:8px;cursor:pointer;background:${selected ? '#eff6ff' : 'transparent'}"
             onclick="selectFamilyMember(${m.id})">
        <input type="radio" ${selected ? 'checked' : ''} style="width:18px;height:18px">
        <div style="flex:1">
          <div style="font-weight:500">${m.name} <span class="badge badge-primary">${m.relation}</span></div>
          <div style="font-size:12px;color:var(--text-secondary)">${m.age || '--'}岁 | ${m.gender || '--'}</div>
        </div>
      </label>`;
  });

  html += `</div></div>`;

  if (state.appointment.familyMemberId !== undefined) {
    const memberName = state.appointment.familyMemberId
      ? state.familyMembers.find(m => m.id === state.appointment.familyMemberId)?.name
      : patient?.name;

    const slotTime = state.appointment.timeSlot ? parseTimeSlot(state.appointment.timeSlot) : '';

    html += `
      <div class="card" style="margin-top:16px">
        <div class="card-title">✅ 预约信息确认</div>
        <div style="line-height:2;font-size:14px">
          <p><strong>就诊人：</strong>${memberName || ''}</p>
          <p><strong>院区：</strong>${doctor?.branch_name || ''}</p>
          <p><strong>科室：</strong>${doctor?.department_name || ''}</p>
          <p><strong>医生：</strong>${doctor?.name}（${doctor?.title}）</p>
          <p><strong>日期：</strong>${state.appointment.date} 周${new Date(state.appointment.date).getDay() === 0 ? '日' : ['一','二','三','四','五','六'][new Date(state.appointment.date).getDay()-1]}</p>
          <p><strong>时段：</strong>${slotTime || ''}</p>
          <p><strong>挂号费：</strong><span style="color:var(--danger);font-weight:600">¥${doctor?.registration_fee || 0}</span></p>
        </div>
        <div style="margin-top:20px;display:flex;gap:8px">
          <button class="btn btn-outline" onclick="state.appointment.step=4;renderAppointment()">← 返回修改</button>
          <button class="btn btn-primary" onclick="submitAppointment()">确认预约</button>
        </div>
      </div>`;
  }

  return html;
}

function selectFamilyMember(memberId) {
  state.appointment.familyMemberId = memberId;
  renderAppointment();
}

function parseTimeSlot(slot) {
  if (!slot) return '';
  const parts = slot.split('_');
  return parts.slice(2).join('_');
}

async function submitAppointment() {
  const res = await api('/appointments', {
    method: 'POST',
    body: JSON.stringify({
      patient_id: state.currentPatient,
      family_member_id: state.appointment.familyMemberId || null,
      doctor_id: state.appointment.doctorId,
      date: state.appointment.date,
      time_slot: state.appointment.timeSlot
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
      <p><strong>就诊日期：</strong>${data.date} ${data.time_display || ''}</p>
      ${data.family_member_name ? `<p><strong>就诊人：</strong>${data.family_member_name}（${data.family_member_relation}）</p>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="hideModal();state.appointment={step:0,branchId:null,deptId:null,doctorId:null,date:null,timeSlot:null,familyMemberId:null};renderAppointment()">完成</button>
    </div>
  `);
}

// ==================== 我的预约 ====================

async function renderAppointment() {
  const el = document.getElementById('page-appointment');
  const { step } = state.appointment;

  let stepsHtml = `<div class="step-indicator">`;
  const stepNames = ['选院区', '选科室', '选医生', '选日期', '选时段', '确认预约'];
  for (let i = 0; i < 6; i++) {
    const cls = i < step ? 'done' : (i === step ? 'active' : '');
    stepsHtml += `<div class="step ${cls}"><span class="step-num">${i < step ? '✓' : i + 1}</span><span>${stepNames[i]}</span></div>`;
    if (i < 5) stepsHtml += `<div class="step-line ${i < step ? 'done' : ''}"></div>`;
  }
  stepsHtml += `</div>`;

  let contentHtml = '';
  if (step === 0) contentHtml = await renderStep0();
  else if (step === 1) contentHtml = await renderStep1();
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
              <div class="appointment-doctor">${a.doctor_name}（${a.department_name}）${a.branch_name ? ' - ' + a.branch_name : ''}</div>
              <div class="appointment-detail">${a.date} ${a.time_display || ''} | 就诊码：${a.visit_code}</div>
              ${a.family_member_name ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">就诊人：${a.family_member_name}（${a.family_member_relation}）</div>` : ''}
            </div>
            <span class="queue-status ${statusClass(a.status)}">${statusText(a.status)}</span>
            ${a.status === 'pending' ? `<button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="cancelAppointment(${a.id})">取消</button>` : ''}
          </div>`;
      });
      myApptsHtml += `</div>`;
    }
  }

  el.innerHTML = `<div class="page-header"><h1>预约挂号</h1><p>选择院区、科室、医生、日期和时段完成预约</p></div>${stepsHtml}${contentHtml}${myApptsHtml}`;
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
          <div class="card-title" style="margin-top:16px">💊 处方（从药品库选择）</div>
          <div id="prescriptionList"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="showDrugSelector()">+ 从药品库选择</button>
            <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="addManualPrescriptionItem()">+ 手动输入</button>
          </div>
          <div class="card-title" style="margin-top:20px">📞 随访设置</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <input type="checkbox" id="needFollowup" onchange="toggleFollowupFields()">
            <label for="needFollowup" style="margin:0;cursor:pointer">需要随访</label>
          </div>
          <div id="followupFields" style="display:none">
            <div class="grid grid-2" style="gap:12px">
              <div class="form-group" style="margin:0"><label>随访日期</label><input type="date" id="followupDate"></div>
              <div class="form-group" style="margin:0"><label>随访内容提示</label><input type="text" id="followupContent" placeholder="如：复查血压、调整用药等"></div>
            </div>
          </div>
          <div style="margin-top:16px">
            <button class="btn btn-primary" onclick="saveRecord(${appt.id}, ${appt.patient_id}, ${appt.family_member_id ? appt.family_member_id : 'null'}, ${appt.doctor_id})">保存病历</button>
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

function toggleFollowupFields() {
  const cb = document.getElementById('needFollowup');
  document.getElementById('followupFields').style.display = cb.checked ? 'block' : 'none';
}

function showDrugSelector() {
  showModal(`
    <h3>💊 选择药品</h3>
    <div class="form-group">
      <input type="text" id="drugSearchInput" placeholder="搜索药品名称..." oninput="searchDrugList()">
    </div>
    <div id="drugSelectList" style="max-height:300px;overflow-y:auto"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">取消</button>
    </div>
  `);
  searchDrugList();
}

async function searchDrugList() {
  const keyword = document.getElementById('drugSearchInput')?.value?.trim() || '';
  const url = keyword ? `/drugs?keyword=${encodeURIComponent(keyword)}` : '/drugs';
  const res = await api(url);
  const listArea = document.getElementById('drugSelectList');
  if (!listArea) return;

  if (res.code !== 0 || res.data.length === 0) {
    listArea.innerHTML = '<div class="empty-state"><p>未找到药品</p></div>';
    return;
  }

  let html = '';
  res.data.forEach(d => {
    const lowStock = d.stock <= (d.low_stock_threshold || 10);
    html += `
      <div style="display:flex;align-items:center;gap:12px;padding:10px;border-bottom:1px solid var(--border);cursor:pointer"
           onclick="selectDrugForPrescription(${d.id}, '${d.name.replace(/'/g, "\\'")}', '${(d.specification || '').replace(/'/g, "\\'")}', ${d.price}, '${(d.unit || '').replace(/'/g, "\\'")}', ${d.stock})">
        <div style="flex:1">
          <div style="font-weight:500">${d.name}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${d.specification || ''} | ${d.category || ''} | 库存：${d.stock}${d.unit || ''}</div>
        </div>
        <div style="color:var(--primary);font-weight:500">¥${d.price?.toFixed(2) || '0.00'}</div>
        ${lowStock ? '<span class="badge badge-danger">库存不足</span>' : ''}
      </div>`;
  });
  listArea.innerHTML = html;
}

function selectDrugForPrescription(drugId, name, spec, price, unit, stock) {
  addPrescriptionItem({ drug_id: drugId, name, specification: spec, price, unit, stock });
  hideModal();
}

function addManualPrescriptionItem() {
  addPrescriptionItem({});
}

function addPrescriptionItem(preset = {}) {
  const list = document.getElementById('prescriptionList');
  if (!list) return;
  const idx = list.children.length;
  const div = document.createElement('div');
  div.className = 'prescription-item';
  div.dataset.drugId = preset.drug_id || '';
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:flex-start">
      <div style="flex:1">
        <div style="font-weight:500;margin-bottom:6px">
          ${preset.name || '未选择药品'}
          ${preset.drug_id ? `<span class="badge badge-primary" style="margin-left:6px">已选</span>` : ''}
        </div>
        ${preset.specification ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">规格：${preset.specification} | 单价：¥${preset.price?.toFixed(2) || '0.00'}/${preset.unit || ''}</div>` : ''}
        <div class="grid grid-4" style="gap:6px">
          <div class="form-group" style="margin:0"><input type="text" class="presc-dosage" placeholder="剂量" value="${preset.dosage || ''}"></div>
          <div class="form-group" style="margin:0"><input type="text" class="presc-usage" placeholder="用法" value="${preset.usage || ''}"></div>
          <div class="form-group" style="margin:0"><input type="number" class="presc-days" placeholder="天数" value="${preset.days || ''}"></div>
          <div class="form-group" style="margin:0"><input type="number" class="presc-quantity" placeholder="数量" value="${preset.quantity || 1}"></div>
        </div>
        <input type="hidden" class="presc-name" value="${preset.name || ''}">
        <input type="hidden" class="presc-spec" value="${preset.specification || ''}">
        <input type="hidden" class="presc-price" value="${preset.price || 0}">
        <input type="hidden" class="presc-unit" value="${preset.unit || ''}">
      </div>
      <button class="btn btn-danger btn-sm" onclick="this.closest('.prescription-item').remove()" style="margin-top:4px">✕</button>
    </div>`;
  list.appendChild(div);
}

async function saveRecord(appointmentId, patientId, familyMemberId, doctorId) {
  const complaint = document.getElementById('recComplaint').value;
  const illness = document.getElementById('recIllness').value;
  const diagnosis = document.getElementById('recDiagnosis').value;

  if (!complaint || !diagnosis) { alert('请填写主诉和诊断'); return; }

  const needFollowup = document.getElementById('needFollowup')?.checked || false;
  const followupDate = document.getElementById('followupDate')?.value || '';
  const followupContent = document.getElementById('followupContent')?.value || '';

  if (needFollowup && !followupDate) {
    alert('请设置随访日期');
    return;
  }

  const prescription = [];
  document.querySelectorAll('#prescriptionList .prescription-item').forEach(item => {
    const name = item.querySelector('.presc-name')?.value || '';
    const drugId = item.dataset.drugId ? parseInt(item.dataset.drugId) : null;
    const dosage = item.querySelector('.presc-dosage')?.value || '';
    const usage = item.querySelector('.presc-usage')?.value || '';
    const days = item.querySelector('.presc-days')?.value || 0;
    const quantity = item.querySelector('.presc-quantity')?.value || 1;
    const specification = item.querySelector('.presc-spec')?.value || '';
    const price = item.querySelector('.presc-price')?.value || 0;
    const unit = item.querySelector('.presc-unit')?.value || '';
    if (name) {
      prescription.push({
        drug_id: drugId,
        name,
        specification,
        unit,
        price: parseFloat(price) || 0,
        dosage,
        usage,
        days: parseInt(days) || 0,
        quantity: parseInt(quantity) || 1
      });
    }
  });

  const res = await api('/records', {
    method: 'POST',
    body: JSON.stringify({
      appointment_id: appointmentId,
      patient_id: patientId,
      family_member_id: familyMemberId,
      doctor_id: doctorId,
      chief_complaint: complaint,
      present_illness: illness,
      diagnosis,
      prescription,
      need_followup: needFollowup,
      followup_date: followupDate,
      followup_content: followupContent
    })
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
    let amCount = 0, pmCount = 0;
    (data.detail || []).forEach(d => {
      if (d.time_slot?.startsWith('am_')) amCount += d.count || 0;
      else if (d.time_slot?.startsWith('pm_')) pmCount += d.count || 0;
    });
    html += `<div class="grid grid-2" style="margin-bottom:16px">
      <div class="card stat-card"><div class="stat-value">${amCount}</div><div class="stat-label">上午挂号总数</div></div>
      <div class="card stat-card"><div class="stat-value">${pmCount}</div><div class="stat-label">下午挂号总数</div></div>
    </div>`;

    if (data.full_periods && data.full_periods.length > 0) {
      html += `<div class="card-title" style="margin-top:12px">⚠️ 已满时段</div><div class="table-wrapper"><table>
        <thead><tr><th>医生</th><th>日期</th><th>时段</th><th>挂号数</th></tr></thead><tbody>`;
      data.full_periods.forEach(f => {
        const timeStr = f.time_slot ? parseTimeSlot(f.time_slot) : '';
        html += `<tr><td>${f.doctor_name}</td><td>${f.date}</td><td>${timeStr || '-'}</td><td>${f.count}</td></tr>`;
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

// ==================== 家庭成员管理 ====================

async function loadFamilyMembers() {
  if (!state.currentPatient) {
    state.familyMembers = [];
    return;
  }
  const res = await api(`/family/${state.currentPatient}`);
  if (res.code === 0) state.familyMembers = res.data;
}

async function renderFamily() {
  const el = document.getElementById('page-family');
  if (!state.currentPatient) {
    el.innerHTML = `<div class="page-header"><h1>家庭成员管理</h1><p>管理您的家庭成员，可代为预约挂号</p></div>
      <div class="card"><div class="empty-state"><div class="empty-icon">👨‍👩‍👧‍👦</div><p>请先在左侧选择患者身份</p></div></div>`;
    return;
  }

  await loadFamilyMembers();
  const patient = state.patients.find(p => p.id === state.currentPatient);

  let html = `<div class="page-header"><h1>家庭成员管理</h1><p>${patient?.name || ''}的家庭成员，可代为预约挂号</p></div>`;

  html += `<div class="card"><div class="card-title">👤 主账户信息</div>
    <div style="display:flex;gap:16px;align-items:center">
      <div style="width:60px;height:60px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:28px">👤</div>
      <div>
        <div style="font-weight:600;font-size:16px">${patient?.name || ''}（本人）</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${patient?.phone || ''} | ${patient?.gender || ''}</div>
      </div>
    </div>
  </div>`;

  html += `<div class="card"><div class="card-title">👨‍👩‍👧‍👦 家庭成员列表
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="showAddFamilyModal()">+ 添加成员</button>
  </div>`;

  if (state.familyMembers.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">👨‍👩‍👧‍👦</div><p>暂无家庭成员，点击上方按钮添加</p></div>';
  } else {
    state.familyMembers.forEach(m => {
      html += `
        <div class="card" style="margin-bottom:12px;padding:16px">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="width:48px;height:48px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:22px">${m.gender === '女' ? '👩' : '👨'}</div>
            <div style="flex:1">
              <div style="font-weight:600">${m.name} <span class="badge badge-primary">${m.relation}</span></div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
                ${m.age || '--'}岁 | ${m.gender || '--'} | ${m.id_card ? '身份证：' + m.id_card : '未填写身份证号'}
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-outline btn-sm" onclick="showEditFamilyModal(${m.id})">编辑</button>
              <button class="btn btn-danger btn-sm" onclick="deleteFamilyMember(${m.id})">删除</button>
            </div>
          </div>
        </div>`;
    });
  }
  html += `</div>`;

  el.innerHTML = html;
}

function showAddFamilyModal() {
  showModal(`
    <h3>➕ 添加家庭成员</h3>
    <div class="form-group"><label>姓名 *</label><input type="text" id="fmName" placeholder="请输入姓名"></div>
    <div class="form-group"><label>与本人关系 *</label>
      <select id="fmRelation">
        <option value="">请选择</option>
        <option value="父亲">父亲</option>
        <option value="母亲">母亲</option>
        <option value="配偶">配偶</option>
        <option value="儿子">儿子</option>
        <option value="女儿">女儿</option>
        <option value="兄弟">兄弟</option>
        <option value="姐妹">姐妹</option>
        <option value="其他">其他</option>
      </select>
    </div>
    <div class="grid grid-2" style="gap:12px">
      <div class="form-group"><label>年龄</label><input type="number" id="fmAge" placeholder="年龄"></div>
      <div class="form-group"><label>性别</label>
        <select id="fmGender"><option value="">请选择</option><option value="男">男</option><option value="女">女</option></select>
      </div>
    </div>
    <div class="form-group"><label>身份证号</label><input type="text" id="fmIdCard" placeholder="请输入身份证号"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" onclick="addFamilyMember()">确认添加</button>
    </div>
  `);
}

async function addFamilyMember() {
  const name = document.getElementById('fmName').value.trim();
  const relation = document.getElementById('fmRelation').value;
  const age = document.getElementById('fmAge').value;
  const gender = document.getElementById('fmGender').value;
  const id_card = document.getElementById('fmIdCard').value.trim();

  if (!name || !relation) { alert('请填写姓名和关系'); return; }

  const res = await api('/family', {
    method: 'POST',
    body: JSON.stringify({ patient_id: state.currentPatient, name, relation, age: age || null, gender: gender || null, id_card: id_card || null })
  });

  if (res.code === 0) {
    hideModal();
    renderFamily();
  } else {
    alert(res.msg);
  }
}

function showEditFamilyModal(id) {
  const member = state.familyMembers.find(m => m.id === id);
  if (!member) return;
  showModal(`
    <h3>✏️ 编辑家庭成员</h3>
    <div class="form-group"><label>姓名 *</label><input type="text" id="fmName" value="${member.name}"></div>
    <div class="form-group"><label>与本人关系 *</label>
      <select id="fmRelation">
        <option value="">请选择</option>
        <option value="父亲" ${member.relation === '父亲' ? 'selected' : ''}>父亲</option>
        <option value="母亲" ${member.relation === '母亲' ? 'selected' : ''}>母亲</option>
        <option value="配偶" ${member.relation === '配偶' ? 'selected' : ''}>配偶</option>
        <option value="儿子" ${member.relation === '儿子' ? 'selected' : ''}>儿子</option>
        <option value="女儿" ${member.relation === '女儿' ? 'selected' : ''}>女儿</option>
        <option value="兄弟" ${member.relation === '兄弟' ? 'selected' : ''}>兄弟</option>
        <option value="姐妹" ${member.relation === '姐妹' ? 'selected' : ''}>姐妹</option>
        <option value="其他" ${member.relation === '其他' ? 'selected' : ''}>其他</option>
      </select>
    </div>
    <div class="grid grid-2" style="gap:12px">
      <div class="form-group"><label>年龄</label><input type="number" id="fmAge" value="${member.age || ''}"></div>
      <div class="form-group"><label>性别</label>
        <select id="fmGender">
          <option value="">请选择</option>
          <option value="男" ${member.gender === '男' ? 'selected' : ''}>男</option>
          <option value="女" ${member.gender === '女' ? 'selected' : ''}>女</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>身份证号</label><input type="text" id="fmIdCard" value="${member.id_card || ''}"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" onclick="updateFamilyMember(${id})">保存修改</button>
    </div>
  `);
}

async function updateFamilyMember(id) {
  const name = document.getElementById('fmName').value.trim();
  const relation = document.getElementById('fmRelation').value;
  const age = document.getElementById('fmAge').value;
  const gender = document.getElementById('fmGender').value;
  const id_card = document.getElementById('fmIdCard').value.trim();

  if (!name || !relation) { alert('请填写姓名和关系'); return; }

  const res = await api(`/family/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, relation, age: age || null, gender: gender || null, id_card: id_card || null })
  });

  if (res.code === 0) {
    hideModal();
    renderFamily();
  } else {
    alert(res.msg);
  }
}

async function deleteFamilyMember(id) {
  if (!confirm('确定要删除该家庭成员吗？')) return;
  const res = await api(`/family/${id}`, { method: 'DELETE' });
  if (res.code === 0) {
    renderFamily();
  } else {
    alert(res.msg);
  }
}

// ==================== 智能导诊 ====================

async function renderTriage() {
  const el = document.getElementById('page-triage');

  let html = `<div class="page-header"><h1>🤖 智能导诊</h1><p>输入您的症状，AI为您推荐最相关的科室和医生</p></div>`;

  html += `
    <div class="card">
      <div class="card-title">💬 描述您的症状</div>
      <div class="form-group">
        <textarea id="triageInput" placeholder="例如：头痛、发烧、咳嗽、胸闷..." style="min-height:100px;font-size:15px"></textarea>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        <span style="font-size:13px;color:var(--text-secondary);margin-right:4px">常见症状：</span>
        ${['头痛', '咳嗽', '发烧', '腹痛', '牙痛', '失眠', '皮疹', '月经不调'].map(s =>
          `<span class="badge badge-primary" style="cursor:pointer;padding:4px 10px" onclick="addTriageSymptom('${s}')">${s}</span>`
        ).join('')}
      </div>
      <button class="btn btn-primary" onclick="doTriage()" style="width:100%;padding:12px;font-size:16px">
        🔍 开始智能导诊
      </button>
    </div>
    <div id="triageResult"></div>
  `;

  el.innerHTML = html;
}

function addTriageSymptom(symptom) {
  const input = document.getElementById('triageInput');
  const val = input.value.trim();
  input.value = val ? val + '、' + symptom : symptom;
}

async function doTriage() {
  const text = document.getElementById('triageInput').value.trim();
  if (!text) { alert('请输入症状描述'); return; }

  const resultArea = document.getElementById('triageResult');
  resultArea.innerHTML = '<div class="card"><div class="loading">分析中...</div></div>';

  const res = await api('/triage', {
    method: 'POST',
    body: JSON.stringify({ text })
  });

  if (res.code !== 0) {
    resultArea.innerHTML = `<div class="card"><div class="empty-state"><p>${res.msg}</p></div></div>`;
    return;
  }

  const data = res.data;
  let html = `<div class="card"><div class="card-title">📊 匹配结果</div>`;

  if (data.matched_symptoms && data.matched_symptoms.length > 0) {
    html += `<div style="margin-bottom:16px">
      <span style="font-size:13px;color:var(--text-secondary)">识别到的症状：</span>
      ${data.matched_symptoms.map(s => `<span class="badge badge-warning" style="margin:0 4px">${s}</span>`).join('')}
    </div>`;
  }

  html += `<div style="margin-top:12px">`;
  data.recommendations.forEach((r, idx) => {
    const rankColors = ['#fbbf24', '#9ca3af', '#cd7f32'];
    html += `
      <div class="card" style="margin-bottom:16px;padding:16px;border-left:4px solid ${rankColors[idx]}">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:36px;height:36px;border-radius:50%;background:${rankColors[idx]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">${idx + 1}</div>
          <div>
            <div style="font-weight:600;font-size:16px">${r.department_name}</div>
            <div style="font-size:12px;color:var(--text-secondary)">匹配度：${r.score}分 | 匹配症状：${r.matched.join('、') || '无'}</div>
          </div>
        </div>
        <div class="card-title" style="font-size:14px;margin-bottom:8px">👨‍⚕️ 推荐医生</div>
        <div style="display:flex;flex-direction:column;gap:8px">`;
    (r.doctors || []).forEach(doc => {
      html += `
        <div style="display:flex;align-items:center;gap:12px;padding:10px;background:#f8fafc;border-radius:8px;cursor:pointer" onclick="goAppointmentFromTriage(${doc.id}, ${r.department_id})">
          <div style="width:40px;height:40px;border-radius:50%;background:#e0e7ff;display:flex;align-items:center;justify-content:center;font-size:20px">👨‍⚕️</div>
          <div style="flex:1">
            <div style="font-weight:500">${doc.name} <span style="font-size:11px;color:var(--primary)">${doc.title}</span></div>
            <div style="font-size:11px;color:var(--text-secondary)">${doc.branch_name || ''} | 擅长：${doc.specialty || ''}</div>
          </div>
          <span style="color:var(--primary);font-size:12px">预约 →</span>
        </div>`;
    });
    html += `</div></div>`;
  });
  html += `</div></div>`;

  resultArea.innerHTML = html;
}

function goAppointmentFromTriage(doctorId, deptId) {
  state.appointment = { step: 0, branchId: null, deptId: deptId, doctorId: doctorId, date: null, timeSlot: null, familyMemberId: null };
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('[data-page="appointment"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById('page-appointment').style.display = 'block';
  renderAppointment();
}

// ==================== 药品管理 ====================

async function renderDrugs() {
  const el = document.getElementById('page-drugs');
  el.innerHTML = `<div class="page-header"><h1>💊 药品管理</h1><p>药品库存查询、入库操作与低库存预警</p></div><div class="loading">加载中...</div>`;

  const [drugRes, catRes] = await Promise.all([
    api('/drugs'),
    api('/drugs/categories')
  ]);

  let html = `<div class="page-header"><h1>💊 药品管理</h1><p>药品库存查询、入库操作与低库存预警</p></div>`;

  html += `<div class="card">
    <div class="card-title">🔍 筛选查询</div>
    <div class="grid grid-3" style="gap:12px">
      <div class="form-group" style="margin:0">
        <input type="text" id="drugKeyword" placeholder="搜索药品名称..." onkeyup="if(event.key==='Enter')searchDrugs()">
      </div>
      <div class="form-group" style="margin:0">
        <select id="drugCategory" onchange="searchDrugs()">
          <option value="">全部分类</option>
          ${(catRes.data || []).map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="lowStockOnly" onchange="searchDrugs()"> 仅看低库存
        </label>
        <button class="btn btn-primary btn-sm" onclick="searchDrugs()">查询</button>
        <button class="btn btn-success btn-sm" onclick="showAddDrugModal()">+ 新增药品</button>
      </div>
    </div>
  </div>`;

  html += `<div id="drugListArea"></div>`;

  el.innerHTML = html;
  renderDrugList(drugRes.data || []);
}

function renderDrugList(drugs) {
  const area = document.getElementById('drugListArea');
  if (!area) return;

  if (drugs.length === 0) {
    area.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">💊</div><p>暂无药品数据</p></div></div>';
    return;
  }

  let html = '<div class="card"><div class="table-wrapper"><table>';
  html += '<thead><tr><th>药品名称</th><th>规格</th><th>分类</th><th>单价</th><th>库存</th><th>单位</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead><tbody>';

  drugs.forEach(d => {
    const lowStock = d.is_low || d.stock <= (d.low_stock_threshold || 10);
    html += `<tr>
      <td style="font-weight:500">${d.name}</td>
      <td>${d.specification || '-'}</td>
      <td>${d.category || '-'}</td>
      <td style="color:var(--primary);font-weight:500">¥${d.price?.toFixed(2) || '0.00'}</td>
      <td style="font-weight:600;${lowStock ? 'color:var(--danger)' : ''}">${d.stock}</td>
      <td>${d.unit || '-'}</td>
      <td>${d.expiry_date || '-'}</td>
      <td>${lowStock ? '<span class="badge badge-danger">库存不足</span>' : '<span class="badge badge-success">正常</span>'}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showRestockModal(${d.id})">入库</button>
        <button class="btn btn-outline btn-sm" onclick="showEditDrugModal(${d.id})">编辑</button>
      </td>
    </tr>`;
  });

  html += '</tbody></table></div></div>';
  area.innerHTML = html;
}

async function searchDrugs() {
  const keyword = document.getElementById('drugKeyword').value.trim();
  const category = document.getElementById('drugCategory').value;
  const lowStock = document.getElementById('lowStockOnly').checked;

  let url = '/drugs?';
  const params = [];
  if (keyword) params.push(`keyword=${encodeURIComponent(keyword)}`);
  if (category) params.push(`category=${encodeURIComponent(category)}`);
  if (lowStock) params.push('low_stock=1');
  url += params.join('&');

  const res = await api(url);
  if (res.code === 0) {
    renderDrugList(res.data || []);
  }
}

function showAddDrugModal() {
  showModal(`
    <h3>➕ 新增药品</h3>
    <div class="grid grid-2" style="gap:12px">
      <div class="form-group"><label>药品名称 *</label><input type="text" id="newDrugName"></div>
      <div class="form-group"><label>分类</label><input type="text" id="newDrugCategory" placeholder="如：心血管"></div>
      <div class="form-group"><label>规格</label><input type="text" id="newDrugSpec" placeholder="如：5mg*14片"></div>
      <div class="form-group"><label>单位</label><input type="text" id="newDrugUnit" placeholder="如：盒/瓶"></div>
      <div class="form-group"><label>单价 (元)</label><input type="number" step="0.01" id="newDrugPrice" value="0"></div>
      <div class="form-group"><label>库存</label><input type="number" id="newDrugStock" value="0"></div>
      <div class="form-group"><label>有效期</label><input type="date" id="newDrugExpiry"></div>
      <div class="form-group"><label>低库存预警阈值</label><input type="number" id="newDrugThreshold" value="10"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" onclick="addDrug()">确认添加</button>
    </div>
  `);
}

async function addDrug() {
  const name = document.getElementById('newDrugName').value.trim();
  if (!name) { alert('请输入药品名称'); return; }

  const data = {
    name,
    specification: document.getElementById('newDrugSpec').value.trim() || null,
    unit: document.getElementById('newDrugUnit').value.trim() || null,
    price: parseFloat(document.getElementById('newDrugPrice').value) || 0,
    stock: parseInt(document.getElementById('newDrugStock').value) || 0,
    expiry_date: document.getElementById('newDrugExpiry').value || null,
    category: document.getElementById('newDrugCategory').value.trim() || null,
    low_stock_threshold: parseInt(document.getElementById('newDrugThreshold').value) || 10
  };

  const res = await api('/drugs', {
    method: 'POST',
    body: JSON.stringify(data)
  });

  if (res.code === 0) {
    hideModal();
    renderDrugs();
  } else {
    alert(res.msg);
  }
}

function showEditDrugModal(id) {
  const drugInfo = state.drugsCache?.find(d => d.id === id);
  // 重新获取一下
  api(`/drugs/${id}`).then(res => {
    if (res.code !== 0) { alert(res.msg); return; }
    const d = res.data;
    showModal(`
      <h3>✏️ 编辑药品</h3>
      <div class="grid grid-2" style="gap:12px">
        <div class="form-group"><label>药品名称 *</label><input type="text" id="editDrugName" value="${d.name}"></div>
        <div class="form-group"><label>分类</label><input type="text" id="editDrugCategory" value="${d.category || ''}"></div>
        <div class="form-group"><label>规格</label><input type="text" id="editDrugSpec" value="${d.specification || ''}"></div>
        <div class="form-group"><label>单位</label><input type="text" id="editDrugUnit" value="${d.unit || ''}"></div>
        <div class="form-group"><label>单价 (元)</label><input type="number" step="0.01" id="editDrugPrice" value="${d.price}"></div>
        <div class="form-group"><label>库存</label><input type="number" id="editDrugStock" value="${d.stock}"></div>
        <div class="form-group"><label>有效期</label><input type="date" id="editDrugExpiry" value="${d.expiry_date || ''}"></div>
        <div class="form-group"><label>低库存预警阈值</label><input type="number" id="editDrugThreshold" value="${d.low_stock_threshold || 10}"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-outline" onclick="hideModal()">取消</button>
        <button class="btn btn-primary" onclick="updateDrug(${d.id})">保存修改</button>
      </div>
    `);
  });
}

async function updateDrug(id) {
  const name = document.getElementById('editDrugName').value.trim();
  if (!name) { alert('请输入药品名称'); return; }

  const data = {
    name,
    specification: document.getElementById('editDrugSpec').value.trim() || null,
    unit: document.getElementById('editDrugUnit').value.trim() || null,
    price: parseFloat(document.getElementById('editDrugPrice').value) || 0,
    stock: parseInt(document.getElementById('editDrugStock').value) || 0,
    expiry_date: document.getElementById('editDrugExpiry').value || null,
    category: document.getElementById('editDrugCategory').value.trim() || null,
    low_stock_threshold: parseInt(document.getElementById('editDrugThreshold').value) || 10
  };

  const res = await api(`/drugs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  if (res.code === 0) {
    hideModal();
    renderDrugs();
  } else {
    alert(res.msg);
  }
}

function showRestockModal(id) {
  showModal(`
    <h3>📦 药品入库</h3>
    <div class="form-group"><label>入库数量</label><input type="number" id="restockQty" placeholder="请输入入库数量" min="1" value="10"></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">取消</button>
      <button class="btn btn-success" onclick="restockDrug(${id})">确认入库</button>
    </div>
  `);
}

async function restockDrug(id) {
  const qty = parseInt(document.getElementById('restockQty').value);
  if (!qty || qty <= 0) { alert('请输入有效的入库数量'); return; }

  const res = await api(`/drugs/${id}/restock`, {
    method: 'POST',
    body: JSON.stringify({ quantity: qty })
  });

  if (res.code === 0) {
    hideModal();
    searchDrugs();
  } else {
    alert(res.msg);
  }
}

// ==================== 随访管理 ====================

async function renderFollowups() {
  const el = document.getElementById('page-followups');

  if (!state.currentPatient && !state.currentDoctor) {
    el.innerHTML = `<div class="page-header"><h1>📞 随访管理</h1><p>查看和管理随访记录</p></div>
      <div class="card"><div class="empty-state"><div class="empty-icon">📞</div><p>请先在左侧选择患者或医生身份</p></div></div>`;
    return;
  }

  let html = `<div class="page-header"><h1>📞 随访管理</h1><p>${state.currentDoctor ? '医生端' : '患者端'}随访管理</p></div>`;

  html += `<div class="tabs">
    <div class="tab active" onclick="switchFollowupTab(this, 'pending')">待随访</div>
    <div class="tab" onclick="switchFollowupTab(this, 'completed')">已完成</div>
    <div class="tab" onclick="switchFollowupTab(this, 'missed')">已逾期</div>
    <div class="tab" onclick="switchFollowupTab(this, 'all')">全部</div>
  </div>`;

  html += `<div id="followupListArea"><div class="loading">加载中...</div></div>`;

  el.innerHTML = html;
  loadFollowups('pending');
}

async function switchFollowupTab(tabEl, status) {
  document.querySelectorAll('#page-followups .tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  await loadFollowups(status);
}

async function loadFollowups(status) {
  const area = document.getElementById('followupListArea');
  if (!area) return;
  area.innerHTML = '<div class="loading">加载中...</div>';

  let url = state.currentDoctor
    ? `/followups/doctor/${state.currentDoctor}${status !== 'all' ? '?status=' + status : ''}`
    : `/followups/patient/${state.currentPatient}`;

  const res = await api(url);
  if (res.code !== 0) {
    area.innerHTML = `<div class="card"><div class="empty-state"><p>${res.msg}</p></div></div>`;
    return;
  }

  let data = res.data || [];
  if (!state.currentDoctor && status !== 'all') {
    data = data.filter(f => {
      if (status === 'pending') return f.status === 'pending';
      if (status === 'completed') return f.status === 'completed';
      if (status === 'missed') return f.status === 'missed' || (f.status === 'pending' && f.is_today === false && f.followup_date < new Date().toISOString().slice(0, 10));
      return true;
    });
  }

  if (data.length === 0) {
    area.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-icon">📋</div><p>暂无随访记录</p></div></div>';
    return;
  }

  let html = '';
  data.forEach(f => {
    const isToday = f.is_today;
    const statusBadge = f.status === 'completed'
      ? '<span class="badge badge-success">已完成</span>'
      : (f.status === 'missed' || (f.status === 'pending' && !isToday && f.followup_date < new Date().toISOString().slice(0, 10))
        ? '<span class="badge badge-danger">已逾期</span>'
        : (isToday ? '<span class="badge badge-warning">今日随访</span>' : '<span class="badge badge-primary">待随访</span>'));

    html += `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div>
            <div style="font-weight:600">${f.record_diagnosis || '随访'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
              ${state.currentDoctor ? '患者：' + (f.patient_name || '') : '医生：' + (f.doctor_name || '')}
              ${f.family_member_name ? `（${f.family_member_relation}：${f.family_member_name}）` : ''}
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
              科室：${f.department_name || '-'}
            </div>
          </div>
          <div style="text-align:right">
            ${statusBadge}
            <div style="font-size:13px;margin-top:6px;color:${isToday ? 'var(--danger)' : 'var(--text-secondary)'}">
              📅 ${f.followup_date}${isToday ? ' (今天)' : ''}
            </div>
          </div>
        </div>
        <div style="background:#f8fafc;padding:10px;border-radius:8px;margin-bottom:12px">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">随访内容提示：</div>
          <div style="font-size:14px">${f.content || '无'}</div>
        </div>
        ${f.status === 'completed' ? `
          <div style="background:#dcfce7;padding:10px;border-radius:8px">
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">随访反馈：</div>
            <div style="font-size:13px"><strong>当前症状：</strong>${f.current_symptoms || '-'}</div>
            <div style="font-size:13px"><strong>是否好转：</strong>${f.improved || '-'}</div>
            <div style="font-size:13px"><strong>是否复诊：</strong>${f.need_revisit || '-'}</div>
            ${f.feedback ? `<div style="font-size:13px;margin-top:4px"><strong>备注：</strong>${f.feedback}</div>` : ''}
          </div>
        ` : `
          ${state.currentPatient && (isToday || f.status === 'pending') ? `
            <button class="btn btn-primary btn-sm" onclick="showFollowupForm(${f.id})">📝 填写随访反馈</button>
          ` : ''}
          ${state.currentDoctor ? `
            <button class="btn btn-outline btn-sm" onclick="updateFollowupStatus(${f.id}, '${f.status === 'completed' ? 'pending' : 'completed'}')">
              ${f.status === 'completed' ? '标记为待随访' : '标记为已完成'}
            </button>
          ` : ''}
        `}
      </div>`;
  });

  area.innerHTML = html;
}

function showFollowupForm(id) {
  showModal(`
    <h3>📝 填写随访反馈</h3>
    <div class="form-group"><label>当前症状</label><textarea id="fuSymptoms" placeholder="请描述您当前的症状..."></textarea></div>
    <div class="form-group"><label>是否好转</label>
      <select id="fuImproved">
        <option value="">请选择</option>
        <option value="明显好转">明显好转</option>
        <option value="略有好转">略有好转</option>
        <option value="无变化">无变化</option>
        <option value="加重">加重</option>
      </select>
    </div>
    <div class="form-group"><label>是否需要复诊</label>
      <select id="fuRevisit">
        <option value="">请选择</option>
        <option value="需要">需要</option>
        <option value="不需要">不需要</option>
        <option value="待定">待定</option>
      </select>
    </div>
    <div class="form-group"><label>其他备注</label><textarea id="fuFeedback" placeholder="其他需要说明的情况..."></textarea></div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" onclick="submitFollowup(${id})">提交反馈</button>
    </div>
  `);
}

async function submitFollowup(id) {
  const data = {
    current_symptoms: document.getElementById('fuSymptoms').value.trim(),
    improved: document.getElementById('fuImproved').value,
    need_revisit: document.getElementById('fuRevisit').value,
    feedback: document.getElementById('fuFeedback').value.trim()
  };

  const res = await api(`/followups/${id}/submit`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

  if (res.code === 0) {
    hideModal();
    const activeTab = document.querySelector('#page-followups .tab.active');
    loadFollowups(activeTab?.textContent === '待随访' ? 'pending' : activeTab?.textContent === '已完成' ? 'completed' : activeTab?.textContent === '已逾期' ? 'missed' : 'all');
  } else {
    alert(res.msg);
  }
}

async function updateFollowupStatus(id, status) {
  const res = await api(`/followups/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
  if (res.code === 0) {
    const activeTab = document.querySelector('#page-followups .tab.active');
    loadFollowups(activeTab?.textContent === '待随访' ? 'pending' : activeTab?.textContent === '已完成' ? 'completed' : activeTab?.textContent === '已逾期' ? 'missed' : 'all');
  } else {
    alert(res.msg);
  }
}

// ==================== Init ====================

initData();
