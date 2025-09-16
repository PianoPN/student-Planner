/* ===== Student Planner (front-end only) ===== */

const DB_KEYS = {
  USERS: 'sp_users',              // [{email, password, name}]
  SESSION: 'sp_current_user',     // string email
  PROFILES: 'sp_profiles'         // { [email]: { interests:[], schedules:[], notifications:[], classSchedule:{Mon:[],...}, lastStudySubject:null } }
};

function _load(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch{ return fallback; }
}
function _save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function getUsers(){ return _load(DB_KEYS.USERS, []); }
function setUsers(arr){ _save(DB_KEYS.USERS, arr); }

function getSessionEmail(){ return _load(DB_KEYS.SESSION, null); }
function setSessionEmail(email){ _save(DB_KEYS.SESSION, email); }

function getProfiles(){ return _load(DB_KEYS.PROFILES, {}); }
function setProfiles(obj){ _save(DB_KEYS.PROFILES, obj); }

function getProfile(){
  const email = getSessionEmail();
  if(!email) return null;
  const profiles = getProfiles();
  if(!profiles[email]) profiles[email] = {
    interests: [],
    schedules: [],        // {id, title, type, subject, whenISO, notes}
    notifications: [],    // {id, title, body, timeISO, read:false}
    classSchedule: {Mon:[],Tue:[],Wed:[],Thu:[],Fri:[],Sat:[],Sun:[]}, // [{time, subject, room}]
    lastStudySubject: null
  };
  setProfiles(profiles);
  return profiles[email];
}
function saveProfile(p){
  const email = getSessionEmail();
  const profiles = getProfiles();
  profiles[email] = p;
  setProfiles(profiles);
}

function mustAuth(){
  if(!getSessionEmail()){
    window.location.href = 'index.html';
  }
}

/* ---------- Auth ---------- */
function signUp({email,password,name}){
  const users = getUsers();
  if(users.find(u=>u.email===email)) throw new Error('อีเมลนี้ถูกสมัครไว้แล้ว');
  users.push({email,password,name: name || 'นักเรียน'});
  setUsers(users);
  setSessionEmail(email);
  // init profile implicitly via getProfile
  getProfile();
  window.location.href = 'interests.html';
}
function signIn({email,password}){
  const user = getUsers().find(u=>u.email===email && u.password===password);
  if(!user) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  setSessionEmail(email);
  getProfile(); // ensure init
  window.location.href = 'home.html';
}
function signOut(){
  setSessionEmail(null);
  window.location.href = 'index.html';
}

/* ---------- User helpers (NEW) ---------- */
function currentUser(){
  const email = getSessionEmail();
  return getUsers().find(u => u.email === email) || null;
}
function getDisplayName(){
  const u = currentUser();
  return (u && u.name && u.name.trim()) ? u.name.trim() : 'นักเรียน';
}

/* ---------- Interests (first run) ---------- */
const DEFAULT_INTERESTS = [
  'อ่านหนังสือ','เล่นกีฬา','ฟังเพลง','วาดรูป','เขียนโค้ด/ทำโปรเจกต์',
  'เล่นเกม','ทำอาหาร','อาสา/จิตอาสา','ทำสวน/ปลูกต้นไม้','ฝึกภาษา',
  'นั่งสมาธิ/ฝึกสติ','เต้น','ถ่ายภาพ','โต้วาที','สิ่งประดิษฐ์วิทย์',
  'ละครเวที/การแสดง','ชมรมคณิต','ชมรมดนตรี'
];

/* ---------- Schedules & Calendar ---------- */
function addSchedule(item){
  const p = getProfile();
  item.id = crypto.randomUUID();
  p.schedules.push(item);
  saveProfile(p);
  addNotification({
    title: 'เพิ่มกำหนดการใหม่',
    body: `${item.title} • ${fmtDateTime(item.whenISO)}`,
    timeISO: new Date().toISOString()
  });
  return item;
}
function deleteSchedule(id){
  const p = getProfile();
  p.schedules = p.schedules.filter(s=>s.id!==id);
  saveProfile(p);
}
function upcomingSchedules(limit=5){
  const p = getProfile();
  const now = new Date();
  return p.schedules
    .filter(s=> new Date(s.whenISO) >= new Date(now.getTime()-5*60*1000))
    .sort((a,b)=> new Date(a.whenISO)-new Date(b.whenISO))
    .slice(0, limit);
}

/* ---------- Notifications ---------- */
function addNotification({title, body, timeISO, read=false}){
  const p = getProfile();
  p.notifications.unshift({id: crypto.randomUUID(), title, body, timeISO, read});
  saveProfile(p);
}
function unreadCount(){
  const p = getProfile();
  return p.notifications.filter(n=>!n.read).length;
}
function markAllRead(){
  const p = getProfile();
  p.notifications.forEach(n=> n.read = true);
  saveProfile(p);
}
function ensureDailyPrompts(){
  // ถ้ายังไม่ได้ตั้งตารางสอนของวันนี้ ให้สร้างการแจ้งเตือน
  const p = getProfile();
  const d = new Date();
  const dayKey = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const todayClasses = p.classSchedule?.[dayKey] ?? [];
  const todayISO = d.toISOString().slice(0,10);
  const already = p.notifications.find(n=> n.title==='ตั้งตารางสอนวันนี้หรือยัง?' && n.timeISO.startsWith(todayISO));
  if(todayClasses.length===0 && !already){
    addNotification({
      title:'ตั้งตารางสอนวันนี้หรือยัง?',
      body:'เปิดหน้า “ตารางสอน” เพื่อตั้งคาบเรียนของวันนี้ จะช่วยให้ระบบแนะนำเวลาการอ่านแม่นขึ้น',
      timeISO: new Date().toISOString()
    });
  }
  // เตือนการอ่านประจำวันที่ยังไม่ได้เพิ่มในวันนี้
  const studyReminder = p.notifications.find(n=> n.title==='เตือนการอ่านหนังสือประจำวัน' && n.timeISO.startsWith(todayISO));
  if(!studyReminder){
    addNotification({
      title:'เตือนการอ่านหนังสือประจำวัน',
      body:'วางแผนอ่านหนังสือวันนี้ในหน้า “แนะนำการอ่าน” แล้วกดบันทึกลงตาราง',
      timeISO:new Date().toISOString()
    });
  }
}

/* ---------- Study Recommendation ---------- */
const SUBJECTS = ['ภาษาไทย','คณิตศาสตร์','วิทยาศาสตร์','อังกฤษ','สังคมศึกษา','คอมพิวเตอร์','ศิลปะ'];
function nextStudySuggestion(){
  const p = getProfile();
  const last = p.lastStudySubject;
  const idx = last ? (SUBJECTS.indexOf(last)+1) % SUBJECTS.length : (new Date().getDay() % SUBJECTS.length);
  const subject = SUBJECTS[idx];
  // สร้างช่วงเวลาที่แนะนำ (หลังเลิกเรียน 17:00–21:00) ช่วงละ 60 นาที
  const base = new Date();
  base.setHours(17,0,0,0);
  // หาช่วงถัดไปที่ยังไม่ทับกับกำหนดการ
  let slot = null;
  for(let h=17; h<=21; h++){
    const s = new Date(); s.setHours(h,0,0,0);
    if(!conflictAt(s.toISOString())){ slot = s; break; }
  }
  // backup: ถ้าทับหมด ให้เป็นพรุ่งนี้ 19:00
  if(!slot){
    slot = new Date(); slot.setDate(slot.getDate()+1); slot.setHours(19,0,0,0);
  }
  return {subject, whenISO: slot.toISOString(), durationMin: 60, tip: buildTip(subject, p.interests)};
}
function conflictAt(whenISO){
  const when = new Date(whenISO);
  return getProfile().schedules.some(s=> Math.abs(new Date(s.whenISO) - when) < 60*60*1000);
}
function buildTip(subject, interests){
  let tip = `โฟกัส ${subject} 25 นาที พัก 5 นาที ทำ 2 รอบ (Pomodoro x2)`;
  if(interests?.includes('ฟังเพลง')) tip += ' • เปิดเพลงบรรเลงเบาๆ (ไม่มีเนื้อร้อง) ช่วยโฟกัส';
  if(interests?.includes('นั่งสมาธิ/ฝึกสติ')) tip += ' • ก่อนเริ่ม ตั้งลมหายใจ 1 นาที';
  if(interests?.includes('เขียนโค้ด/ทำโปรเจกต์') && subject==='คอมพิวเตอร์') tip += ' • ลองทำโจทย์สั้นๆ 1 ข้อ';
  return tip;
}
function acceptSuggestion(sug){
  // บันทึกเป็นกำหนดการ
  addSchedule({
    title:`อ่านหนังสือ: ${sug.subject}`,
    type:'study',
    subject:sug.subject,
    whenISO:sug.whenISO,
    notes:sug.tip
  });
  const p = getProfile();
  p.lastStudySubject = sug.subject;
  saveProfile(p);
}

/* ---------- Utilities & Header ---------- */
function fmtDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'});
}
function fmtTime(t){ return t.replace(/:00$/,''); }

function mountHeader(active){
  const email = getSessionEmail();
  const headerRoot = document.getElementById('app-header');
  if(!headerRoot) return;

  const name = email ? getDisplayName() : null;

  headerRoot.innerHTML = `
  <header class="navbar">
    <div class="navwrap container">
      <div class="brand">📚 Student Planner</div>
      <nav aria-label="เมนูหลัก">
        <a href="home.html" ${active==='home'?'class="active"':''}>หน้าแรก</a>
        <a href="calendar.html" ${active==='calendar'?'class="active"':''}>ปฏิทิน</a>
        <a href="study.html" ${active==='study'?'class="active"':''}>แนะนำการอ่าน</a>
        <a href="timetable.html" ${active==='timetable'?'class="active"':''}>ตารางสอน</a>
        <a href="notifications.html" ${active==='notifications'?'class="active"':''}>
          การแจ้งเตือน <span id="bell-dot" class="badge" style="display:none"></span>
        </a>
      </nav>
      <div style="margin-left:auto"></div>
      ${email ? `<small class="muted" style="margin-right:8px" title="${email}">${name}</small>`:''}
      ${email ? `<button class="ghost" onclick="signOut()">ออกจากระบบ</button>`:''}
    </div>
  </header>`;

  if(email){
    // แสดงจุดแดง
    const cnt = unreadCount();
    const dot = document.getElementById('bell-dot');
    if(dot){ dot.style.display = cnt>0?'inline-block':'none'; dot.textContent = cnt; }
  }

  // ถ้ามีหัวข้อ welcome ในหน้า ให้ใส่ชื่อเล่นอัตโนมัติ
  const welcomeEl = document.getElementById('welcomeTitle');
  if(welcomeEl && email){
    welcomeEl.textContent = `ยินดีต้อนรับ ${getDisplayName()} 👋`;
  }
}
