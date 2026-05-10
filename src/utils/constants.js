// ─── MUSCLE GROUPS ────────────────────────────────────────────────────────────

export const MUSCLE_GROUPS = {
  chest:     { label: '가슴',   color: '#e05c5c', bg: '#fdeaea' },  // 빨강
  back:      { label: '등',     color: '#2e86c1', bg: '#dceefb' },  // 파랑
  shoulders: { label: '어깨',  color: '#d4820a', bg: '#fdf0d8' },  // 주황
  arms:      { label: '팔',     color: '#27a06e', bg: '#d8f5eb' },  // 초록
  legs:      { label: '하체',  color: '#8e44ad', bg: '#f0e4f9' },  // 보라
  core:      { label: '코어',  color: '#c0932a', bg: '#fdf4dd' },  // 황금
  cardio:    { label: '유산소', color: '#1a9e9e', bg: '#d8f4f4' },  // 청록
};

// ─── COLORS ───────────────────────────────────────────────────────────────────

export const C = {
  bg:      '#f7f8fa',
  bg1:     '#ffffff',
  bg2:     '#f0f2f5',
  bg3:     '#e8eaee',
  blue:    '#3b7dd8',
  blueL:   '#e8f0fc',
  blueMid: '#b8d0f5',
  t0:      '#1a1d24',
  t1:      '#4a5166',
  t2:      '#8b92a5',
  t3:      '#c2c7d4',
  border:  '#dde1ea',
  border2: '#c8cdd8',
  red:     '#8a2020',
  redBg:   '#fdf0f0',
  redBdr:  '#ddbcbc',
};

// ─── DATE UTILS ───────────────────────────────────────────────────────────────

export const todayStr = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const addDays = (s, n) => {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
};

export const fmtDate = (s) => {
  const d = new Date(s + 'T12:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date(todayStr() + 'T12:00:00');
  const diff = Math.round((d - today) / 86400000);
  const base = `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === -1) return `어제 · ${base}`;
  if (diff === 1) return `내일 · ${base}`;
  return base;
};

// ─── ID GEN ───────────────────────────────────────────────────────────────────

export const genId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
