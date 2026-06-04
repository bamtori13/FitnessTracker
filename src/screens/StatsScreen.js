import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Modal,
} from 'react-native';
import {
  getOverallStats, getGroupVolumeLast14Days,
  getExerciseSeriesByGroup, getAllExercises, getDB,
} from '../db/database';
import { MUSCLE_GROUPS, C, todayStr } from '../utils/constants';
import { Card, Label, ProgressBar, StatBox, Loading } from '../components/UI';

const SCREEN_W = Dimensions.get('window').width;
const CHART_H  = 130;
const AXIS_L   = 48;
const Y_STEPS  = 4;

// ─── 유틸 ────────────────────────────────────────────────────────────────────

const fmtVol = v => v >= 1000 ? `${(v/1000).toFixed(1)}t` : `${Math.round(v)}`;

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 날짜 범위 계산
function getDateRange(period, unit) {
  // period: 숫자(개수), unit: 'day'|'week'|'month'
  const end   = new Date();
  const start = new Date();
  if (unit === 'day')   start.setDate(end.getDate() - period + 1);
  if (unit === 'week')  start.setDate(end.getDate() - period * 7 + 1);
  if (unit === 'month') start.setMonth(end.getMonth() - period + 1);
  return { start: localDateStr(start), end: localDateStr(end) };
}

// 날짜를 단위로 버킷화
function bucketKey(dateStr, unit) {
  const d = new Date(dateStr + 'T12:00:00');
  if (unit === 'day') return dateStr;
  if (unit === 'week') {
    // ISO 주 시작일(월요일)
    const day = d.getDay() || 7;
    const mon = new Date(d); mon.setDate(d.getDate() - day + 1);
    return localDateStr(mon);
  }
  if (unit === 'month') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  return dateStr;
}

function bucketLabel(key, unit) {
  if (unit === 'day')   return key.slice(5);          // MM-DD
  if (unit === 'week')  return `${key.slice(5)} 주`;  // MM-DD 주
  if (unit === 'month') return `${key.slice(0,7)}`;   // YYYY-MM
  return key;
}

// 버킷 목록 생성 (비어있는 기간도 포함)
function makeBuckets(start, end, unit) {
  const buckets = [];
  const cur = new Date(start + 'T12:00:00');
  const endD = new Date(end + 'T12:00:00');
  const seen = new Set();
  while (cur <= endD) {
    const k = bucketKey(localDateStr(cur), unit);
    if (!seen.has(k)) { seen.add(k); buckets.push(k); }
    if (unit === 'day')   cur.setDate(cur.getDate() + 1);
    if (unit === 'week')  cur.setDate(cur.getDate() + 7);
    if (unit === 'month') cur.setMonth(cur.getMonth() + 1);
  }
  return buckets;
}

// ─── DB 쿼리: 기간+단위별 볼륨 ────────────────────────────────────────────────

async function queryVolByPeriod(start, end) {
  const db = await getDB();
  return db.getAllAsync(
    `SELECT wl.date, e.grp, e.id as exId, e.input_type,
            SUM(
              CASE WHEN s.duration_sec > 0 THEN s.duration_sec/60.0
                   ELSE s.weight * s.reps END
            ) as vol
     FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     JOIN exercises e ON e.id = le.exercise_id
     JOIN sets s ON s.log_exercise_id = le.id
     WHERE wl.date >= ? AND wl.date <= ? AND s.done = 1
     GROUP BY wl.date, e.id`,
    [start, end]
  );
}

async function queryWorkoutDaysByPeriod(start, end) {
  const db = await getDB();
  const rows = await db.getAllAsync(
    `SELECT date FROM workout_logs WHERE date >= ? AND date <= ? ORDER BY date`,
    [start, end]
  );
  return rows.map(r => r.date);
}

// ─── 라인 그래프 컴포넌트 ─────────────────────────────────────────────────────

function LineChart({ points, color, height = CHART_H, isDuration = false, xLabels }) {
  if (!points.length) return <Text style={gs.empty}>데이터 없음</Text>;

  const maxVal  = Math.max(1, ...points.map(p => p.vol || 0));
  const mag     = Math.pow(10, Math.floor(Math.log10(maxVal / Y_STEPS || 1)));
  const step    = Math.ceil((maxVal / Y_STEPS) / mag) * mag || 1;
  const yMax    = step * Y_STEPS;
  const yTicks  = Array.from({ length: Y_STEPS + 1 }, (_, i) => i * step);
  const chartW  = SCREEN_W - 28 - 24 - AXIS_L;
  const n       = points.length;
  const xPos    = i => n > 1 ? (i / (n - 1)) * chartW : chartW / 2;
  const yPos    = v  => height - (v / yMax) * height;

  const segs = points.slice(0, -1).map((p, i) => {
    const q   = points[i + 1];
    const dx  = xPos(i+1) - xPos(i);
    const dy  = yPos(q.vol) - yPos(p.vol);
    const len = Math.sqrt(dx*dx + dy*dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    return { lx: xPos(i), ty: yPos(p.vol), len, ang };
  });

  const showXLabel = i => n <= 6 || i === 0 || i === n-1 || i % Math.ceil(n/5) === 0;

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {/* Y축 */}
        <View style={{ width:AXIS_L, height, justifyContent:'space-between', alignItems:'flex-end', paddingRight:5 }}>
          {[...yTicks].reverse().map((v,i) => (
            <Text key={i} style={gs.axisLabel}>{isDuration ? `${v}분` : fmtVol(v)}</Text>
          ))}
        </View>
        {/* 플롯 */}
        <View style={{ flex:1, height, position:'relative' }}>
          {yTicks.map((v,i) => (
            <View key={i} style={{
              position:'absolute', left:0, right:0, top:yPos(v), height:1,
              backgroundColor: i===0 ? C.border2 : C.bg3,
            }}/>
          ))}
          {segs.map((seg,i) => (
            <View key={i} style={{
              position:'absolute', left:seg.lx, top:seg.ty,
              width:seg.len, height:2.5,
              backgroundColor:color, opacity:0.9,
              transform:[{rotate:`${seg.ang}deg`}],
              transformOrigin:'left center',
            }}/>
          ))}
          {points.map((p,i) => p.vol > 0 && (
            <React.Fragment key={i}>
              <View style={{
                position:'absolute',
                left:xPos(i)-4, top:yPos(p.vol)-4,
                width:9, height:9, borderRadius:5,
                backgroundColor:color, borderWidth:2, borderColor:'#fff',
              }}/>
              <Text style={{
                position:'absolute',
                left:xPos(i)-18, top:yPos(p.vol)-17,
                width:36, textAlign:'center',
                fontSize:9, color, fontWeight:'600',
              }}>
                {isDuration ? `${Math.round(p.vol)}` : fmtVol(p.vol)}
              </Text>
            </React.Fragment>
          ))}
        </View>
      </View>
      {/* X축 */}
      <View style={{ flexDirection:'row', marginLeft:AXIS_L, marginTop:3, position:'relative', height:16 }}>
        {points.map((p,i) => showXLabel(i) ? (
          <Text key={i} style={[gs.axisLabel,{
            position:'absolute', left:xPos(i)-16, width:32, textAlign:'center',
          }]}>
            {xLabels ? xLabels[i] : fmtVol(p.vol)}
          </Text>
        ) : null)}
      </View>
    </View>
  );
}

// ─── 기간/단위 선택 모달 ──────────────────────────────────────────────────────

const PERIOD_OPTIONS = {
  day:   [7, 14, 30, 60, 90],
  week:  [4, 8, 12, 24],
  month: [3, 6, 12, 24],
};
const UNIT_LABELS = { day:'일간', week:'주간', month:'월간' };
const PERIOD_LABELS = {
  day:   { 7:'1주', 14:'2주', 30:'1개월', 60:'2개월', 90:'3개월' },
  week:  { 4:'4주', 8:'8주', 12:'3개월', 24:'6개월' },
  month: { 3:'3개월', 6:'6개월', 12:'1년', 24:'2년' },
};

function PeriodSelector({ unit, period, onChange }) {
  const [open, setOpen] = useState(false);
  const opts = PERIOD_OPTIONS[unit] || [7];
  const pLabel = PERIOD_LABELS[unit]?.[period] || `${period}`;
  return (
    <>
      <TouchableOpacity style={gs.periodBtn} onPress={() => setOpen(true)}>
        <Text style={gs.periodBtnTxt}>{UNIT_LABELS[unit]} · {pLabel} ▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
        <TouchableOpacity style={gs.modalOverlay} activeOpacity={1} onPress={()=>setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={gs.modalBox}>
            <Text style={gs.modalTitle}>보기 단위</Text>
            <View style={gs.unitRow}>
              {Object.entries(UNIT_LABELS).map(([k,l]) => (
                <TouchableOpacity key={k} style={[gs.unitBtn, unit===k && gs.unitBtnOn]}
                  onPress={() => { onChange(k, PERIOD_OPTIONS[k][0]); }}>
                  <Text style={[gs.unitBtnTxt, unit===k && gs.unitBtnTxtOn]}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={gs.modalTitle}>기간</Text>
            <View style={gs.unitRow}>
              {opts.map(p => (
                <TouchableOpacity key={p} style={[gs.unitBtn, period===p && gs.unitBtnOn]}
                  onPress={() => { onChange(unit, p); setOpen(false); }}>
                  <Text style={[gs.unitBtnTxt, period===p && gs.unitBtnTxtOn]}>
                    {PERIOD_LABELS[unit]?.[p] || `${p}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={gs.modalClose} onPress={()=>setOpen(false)}>
              <Text style={{ color:C.blue, fontWeight:'500', fontSize:14 }}>닫기</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

const TABS = ['개요', '부위별'];

export default function StatsScreen() {
  const [tab,       setTab]       = useState(0);
  const [unit,      setUnit]      = useState('week');   // 'day'|'week'|'month'
  const [period,    setPeriod]    = useState(8);         // 개수
  const [exercises, setExercises] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [rawRows,   setRawRows]   = useState([]);       // DB 원본
  const [workoutDays, setWorkoutDays] = useState([]);
  const [overview,  setOverview]  = useState(null);

  // 부위별 탭
  const [selGroup,  setSelGroup]  = useState('chest');

  const { start, end } = useMemo(() => getDateRange(period, unit), [period, unit]);

  useEffect(() => { getAllExercises().then(setExercises); }, []);

  // 데이터 로드
  useEffect(() => {
    setLoading(true);
    Promise.all([
      queryVolByPeriod(start, end),
      queryWorkoutDaysByPeriod(start, end),
      getOverallStats(),
    ]).then(([rows, days, ov]) => {
      setRawRows(rows);
      setWorkoutDays(days);
      setOverview(ov);
      setLoading(false);
    });
  }, [start, end]);

  // ── 개요 탭: 버킷별 총 볼륨 (부위 합계) ───────────────────────────────────
  const overviewPoints = useMemo(() => {
    const buckets = makeBuckets(start, end, unit);
    const bucketVol = {};
    buckets.forEach(k => { bucketVol[k] = 0; });
    rawRows.forEach(r => {
      const k = bucketKey(r.date, unit);
      if (bucketVol[k] !== undefined) bucketVol[k] += r.vol || 0;
    });
    return buckets.map((k,i) => ({
      x: i+1, vol: bucketVol[k] || 0, label: bucketLabel(k, unit),
    }));
  }, [rawRows, start, end, unit]);

  // 개요: 부위별 버킷 볼륨
  const groupOverviewSeries = useMemo(() => {
    const buckets = makeBuckets(start, end, unit);
    return Object.entries(MUSCLE_GROUPS).map(([grp, gv]) => {
      const bucketVol = {};
      buckets.forEach(k => { bucketVol[k] = 0; });
      rawRows.filter(r => r.grp === grp).forEach(r => {
        const k = bucketKey(r.date, unit);
        if (bucketVol[k] !== undefined) bucketVol[k] += r.vol || 0;
      });
      const pts = buckets.map((k,i) => ({ x:i+1, vol: bucketVol[k]||0, label: bucketLabel(k,unit) }));
      const hasData = pts.some(p => p.vol > 0);
      return hasData ? { grp, color: gv.color, label: gv.label, pts } : null;
    }).filter(Boolean);
  }, [rawRows, start, end, unit]);

  // 개요 요약 수치 (선택 기간)
  const periodStats = useMemo(() => {
    const totalVol   = rawRows.reduce((s,r) => s + (r.vol||0), 0);
    const workDays   = workoutDays.length;
    const buckets    = makeBuckets(start, end, unit);
    const activeBuckets = new Set(rawRows.map(r => bucketKey(r.date, unit)));
    return { totalVol, workDays, totalBuckets: buckets.length, activeBuckets: activeBuckets.size };
  }, [rawRows, workoutDays, start, end, unit]);

  // ── 부위별 탭: 종목별 라인 ────────────────────────────────────────────────
  const groupExSeries = useMemo(() => {
    const grpExercises = exercises.filter(e => e.group === selGroup);
    const buckets = makeBuckets(start, end, unit);
    const gv = MUSCLE_GROUPS[selGroup];

    return grpExercises.map(ex => {
      const exRows = rawRows.filter(r => r.exId === ex.id);
      // 버킷별 합산
      const bucketVol = {};
      buckets.forEach(k => { bucketVol[k] = 0; });
      exRows.forEach(r => {
        const k = bucketKey(r.date, unit);
        if (bucketVol[k] !== undefined) bucketVol[k] += r.vol || 0;
      });
      const pts = buckets
        .map((k, i) => ({ x:i+1, vol: bucketVol[k]||0, label: bucketLabel(k, unit) }));
      const hasData = pts.some(p => p.vol > 0);
      return hasData ? {
        exId: ex.id, exName: ex.name,
        isDur: ex.inputType === 'duration',
        color: gv.color, pts,
      } : null;
    }).filter(Boolean);
  }, [rawRows, exercises, selGroup, start, end, unit]);

  const overallMaxC = overview
    ? Math.max(1, ...Object.values(overview.groupCounts))
    : 1;

  const xLabels = overviewPoints.map(p => p.label);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>

      {/* 상단: 탭 + 기간 선택 */}
      <View style={gs.header}>
        <View style={gs.tabRow}>
          {TABS.map((t,i) => (
            <TouchableOpacity key={i} style={[gs.tabBtn, tab===i && gs.tabBtnOn]} onPress={()=>setTab(i)}>
              <Text style={[gs.tabTxt, tab===i && gs.tabTxtOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <PeriodSelector unit={unit} period={period}
          onChange={(u, p) => { setUnit(u); setPeriod(p); }} />
      </View>

      <ScrollView contentContainerStyle={gs.page}>
        {loading ? <Loading /> : (
          <>
            {/* ── 개요 탭 ─────────────────────────────────── */}
            {tab === 0 && (
              <>
                {/* 기간 요약 수치 */}
                <View style={[gs.statGrid, { marginBottom:10 }]}>
                  <StatBox label="운동일" value={periodStats.workDays} unit="일" color={C.blue} style={{flex:1}} />
                  <StatBox label={`${UNIT_LABELS[unit]} 볼륨`}
                    value={(periodStats.totalVol/1000).toFixed(1)} unit="톤" style={{flex:1}} />
                  {overview && (
                    <StatBox label="누적 총" value={overview.totalDays} unit="일" style={{flex:1}} />
                  )}
                </View>

                {/* 전체 볼륨 추이 */}
                <Card style={{ padding:12, marginBottom:12 }}>
                  <Label text={`전체 볼륨 추이 (${UNIT_LABELS[unit]})`} />
                  {overviewPoints.every(p=>p.vol===0) ? (
                    <Text style={gs.empty}>데이터 없음</Text>
                  ) : (
                    <LineChart
                      points={overviewPoints} color={C.blue}
                      xLabels={xLabels}
                    />
                  )}
                </Card>

                {/* 부위별 개별 라인 */}
                {groupOverviewSeries.length > 0 && (
                  <Card style={{ padding:12, marginBottom:12 }}>
                    <Label text="부위별 볼륨 추이" />
                    {groupOverviewSeries.map(ser => (
                      <View key={ser.grp} style={{ marginBottom:14 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:6 }}>
                          <View style={{ width:10, height:10, borderRadius:5, backgroundColor:ser.color }} />
                          <Text style={{ fontSize:12, fontWeight:'600', color:C.t0 }}>{ser.label}</Text>
                        </View>
                        <LineChart
                          points={ser.pts} color={ser.color}
                          height={90} xLabels={ser.pts.map(p=>p.label)}
                        />
                      </View>
                    ))}
                    {/* 전체 범례 */}
                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:4, marginLeft:AXIS_L }}>
                      {groupOverviewSeries.map(s => (
                        <View key={s.grp} style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                          <View style={{ width:14, height:3, borderRadius:2, backgroundColor:s.color }} />
                          <Text style={{ fontSize:10, color:C.t2 }}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                )}

                {/* 부위별 횟수 바 */}
                {overview && (
                  <Card style={{ padding:12, marginBottom:12 }}>
                    <Label text="부위별 운동 횟수 (전체)" />
                    {Object.entries(MUSCLE_GROUPS).map(([g,gv]) => {
                      const cnt = overview.groupCounts[g] || 0;
                      if (!cnt) return null;
                      return (
                        <View key={g} style={{ marginBottom:8 }}>
                          <View style={gs.barRow}>
                            <Text style={gs.barLabel}>{gv.label}</Text>
                            <Text style={gs.barCount}>{cnt}회</Text>
                          </View>
                          <ProgressBar value={cnt/overallMaxC} color={gv.color} />
                        </View>
                      );
                    })}
                    {Object.values(overview.groupCounts).every(v=>v===0) &&
                      <Text style={gs.empty}>운동 기록이 없습니다</Text>}
                  </Card>
                )}
              </>
            )}

            {/* ── 부위별 탭 ────────────────────────────────── */}
            {tab === 1 && (
              <>
                {/* 부위 선택 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                  <View style={{ flexDirection:'row', gap:5 }}>
                    {Object.entries(MUSCLE_GROUPS).map(([k,v]) => (
                      <TouchableOpacity key={k} onPress={() => setSelGroup(k)}
                        style={[gs.groupBtn, selGroup===k && { backgroundColor:v.bg, borderColor:v.color }]}>
                        <Text style={[gs.groupBtnTxt, selGroup===k && { color:v.color }]}>{v.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                {groupExSeries.length === 0 ? (
                  <Card style={{ padding:20 }}>
                    <Text style={gs.empty}>선택한 기간에 데이터 없음</Text>
                  </Card>
                ) : groupExSeries.map(ser => {
                  const n = ser.pts.length;
                  const vols = ser.pts.map(p => p.vol);
                  const maxV = Math.max(...vols);
                  const lastV = vols[n-1] || 0;
                  const diff  = vols[n-1] - vols[0];
                  const trend = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
                  const tc    = diff > 0 ? '#27a06e' : diff < 0 ? '#e05c5c' : C.t2;
                  const unit_label = ser.isDur ? '분' : 'kg';
                  return (
                    <Card key={ser.exId} style={{ padding:12, marginBottom:10 }}>
                      {/* 헤더 */}
                      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                        <Text style={{ fontSize:13, fontWeight:'600', color:C.t0, flex:1 }} numberOfLines={1}>
                          {ser.exName}
                        </Text>
                        <View style={[gs.sessionBadge, { backgroundColor:MUSCLE_GROUPS[selGroup]?.bg }]}>
                          <Text style={[gs.sessionBadgeTxt, { color:ser.color }]}>
                            {ser.pts.filter(p=>p.vol>0).length}회 기록
                          </Text>
                        </View>
                      </View>

                      {ser.pts.every(p=>p.vol===0) ? (
                        <Text style={gs.empty}>데이터 없음</Text>
                      ) : (
                        <>
                          <LineChart
                            points={ser.pts} color={ser.color}
                            isDuration={ser.isDur}
                            xLabels={ser.pts.map(p=>p.label)}
                          />
                          {/* 트렌드 요약 */}
                          {ser.pts.filter(p=>p.vol>0).length >= 2 && (
                            <View style={gs.summary}>
                              <Text style={gs.summaryTxt}>최고 {fmtVol(maxV)}{unit_label}</Text>
                              <Text style={[gs.summaryTxt, {color:tc, fontWeight:'600'}]}>
                                {trend} {Math.abs(diff).toFixed(0)}{unit_label}
                              </Text>
                              <Text style={gs.summaryTxt}>마지막 {fmtVol(lastV)}{unit_label}</Text>
                            </View>
                          )}
                        </>
                      )}
                    </Card>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  header:    { backgroundColor:C.bg1, borderBottomWidth:1, borderBottomColor:C.border, paddingHorizontal:12, paddingTop:10, paddingBottom:8, gap:8 },
  tabRow:    { flexDirection:'row', gap:6 },
  tabBtn:    { flex:1, paddingVertical:7, borderRadius:8, borderWidth:1, borderColor:C.border, backgroundColor:C.bg1, alignItems:'center' },
  tabBtnOn:  { backgroundColor:C.blueL, borderColor:C.blue },
  tabTxt:    { fontSize:13, fontWeight:'500', color:C.t1 },
  tabTxtOn:  { color:C.blue },

  periodBtn:    { alignSelf:'flex-start', paddingHorizontal:12, paddingVertical:6, backgroundColor:C.bg2, borderRadius:8, borderWidth:1, borderColor:C.border },
  periodBtnTxt: { fontSize:12, fontWeight:'500', color:C.t0 },

  page:     { padding:14, paddingBottom:40 },
  statGrid: { flexDirection:'row', gap:8 },

  axisLabel: { fontSize:9, color:C.t2, textAlign:'center' },

  barRow:   { flexDirection:'row', justifyContent:'space-between', marginBottom:2 },
  barLabel: { fontSize:12, color:C.t0 },
  barCount: { fontSize:11, color:C.t2 },

  groupBtn:    { paddingHorizontal:10, paddingVertical:5, borderRadius:14, borderWidth:1, borderColor:C.border, backgroundColor:C.bg1 },
  groupBtnTxt: { fontSize:11, color:C.t1 },

  sessionBadge:    { paddingHorizontal:8, paddingVertical:2, borderRadius:10 },
  sessionBadgeTxt: { fontSize:11, fontWeight:'600' },

  summary:    { flexDirection:'row', justifyContent:'space-between', marginTop:8, paddingTop:8, borderTopWidth:1, borderTopColor:C.bg2 },
  summaryTxt: { fontSize:11, color:C.t2 },

  empty: { color:C.t2, fontSize:12, textAlign:'center', padding:16 },

  // 모달
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', justifyContent:'center', alignItems:'center' },
  modalBox:     { backgroundColor:C.bg1, borderRadius:14, padding:20, width:'82%', gap:10 },
  modalTitle:   { fontSize:11, fontWeight:'600', color:C.t2, letterSpacing:0.5, textTransform:'uppercase', marginTop:4 },
  unitRow:      { flexDirection:'row', flexWrap:'wrap', gap:7 },
  unitBtn:      { paddingHorizontal:12, paddingVertical:7, borderRadius:8, borderWidth:1, borderColor:C.border, backgroundColor:C.bg2 },
  unitBtnOn:    { backgroundColor:C.blueL, borderColor:C.blue },
  unitBtnTxt:   { fontSize:13, color:C.t1 },
  unitBtnTxtOn: { color:C.blue, fontWeight:'600' },
  modalClose:   { alignItems:'center', paddingTop:10, borderTopWidth:1, borderTopColor:C.border, marginTop:4 },
});
