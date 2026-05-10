import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions,
} from 'react-native';
import { getLogSummariesByMonth, getAllExercises } from '../db/database';
import { MUSCLE_GROUPS, C, todayStr } from '../utils/constants';
import { Loading } from '../components/UI';
import { useApp } from '../../App';

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
const DAY_NAMES   = ['일','월','화','수','목','금','토'];
const SCREEN_W    = Dimensions.get('window').width;
// 좌우 padding 각 14, 요일 7칸
const CELL_W      = Math.floor((SCREEN_W - 28) / 7);
const CELL_H      = CELL_W + 24; // 날짜 + 부위 텍스트 공간 확보

export default function CalendarScreen() {
  const { setTab, setSharedDate } = useApp();
  const today = new Date();
  const [year,  setYear]   = useState(today.getFullYear());
  const [month, setMonth]  = useState(today.getMonth());
  const [summaries, setSummaries] = useState({});
  const [exercises, setExercises] = useState([]);
  const [loading,   setLoading]   = useState(false);

  useEffect(() => { getAllExercises().then(setExercises); }, []);

  useEffect(() => {
    setLoading(true);
    getLogSummariesByMonth(year, month).then(s => {
      setSummaries(s);
      setLoading(false);
    });
  }, [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // 날짜 탭 → 오늘 탭으로 이동하면서 날짜 전달
  const handleDayPress = useCallback((ds) => {
    setSharedDate(ds);
    setTab('workout');
  }, [setSharedDate, setTab]);

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayS      = todayStr();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.page}>

        {/* 월 네비 */}
        <View style={s.monthNav}>
          <TouchableOpacity style={s.navBtn} onPress={prevMonth}>
            <Text style={s.navBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.monthTitle}>{year}년 {MONTH_NAMES[month]}</Text>
          <TouchableOpacity style={s.navBtn} onPress={nextMonth}>
            <Text style={s.navBtnText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 요일 헤더 */}
        <View style={s.dayHeaders}>
          {DAY_NAMES.map((d, i) => (
            <Text
              key={d}
              style={[
                s.dayHeader,
                i === 0 && { color: '#d63031' },
                i === 6 && { color: C.blue },
              ]}
            >{d}</Text>
          ))}
        </View>

        {/* 달력 그리드 */}
        {loading ? <Loading /> : (
          <View style={s.grid}>
            {cells.map((d, i) => {
              if (!d) return <View key={i} style={[s.cell, { height: CELL_H }]} />;

              const ds     = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const hasLog = !!summaries[ds]?.length;
              const isToday = ds === todayS;
              const isSun  = (i % 7) === 0;
              const isSat  = (i % 7) === 6;

              // 부위별 라벨 (중복 제거)
              const groups = hasLog
                ? [...new Set(
                    summaries[ds]
                      .map(id => exercises.find(e => e.id === id)?.group)
                      .filter(Boolean)
                  )]
                : [];

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.cell,
                    { height: CELL_H },
                    isToday && s.cellToday,
                    !isToday && hasLog && s.cellHasLog,
                  ]}
                  onPress={() => handleDayPress(ds)}
                  activeOpacity={0.75}
                >
                  {/* 날짜 숫자 */}
                  <Text style={[
                    s.cellDay,
                    isToday && s.cellDayToday,
                    !isToday && isSun && { color: '#d63031' },
                    !isToday && isSat && { color: C.blue },
                  ]}>{d}</Text>

                  {/* 부위명 텍스트 블록 */}
                  {groups.map(g => {
                    const gv = MUSCLE_GROUPS[g];
                    return (
                      <View
                        key={g}
                        style={[
                          s.groupLabel,
                          { backgroundColor: gv.color },
                        ]}
                      >
                        <Text style={s.groupLabelText} numberOfLines={1}>
                          {gv.label}
                        </Text>
                      </View>
                    );
                  })}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* 범례 */}
        <View style={s.legendWrap}>
          <Text style={s.legendTitle}>부위 범례</Text>
          <View style={s.legend}>
            {Object.entries(MUSCLE_GROUPS).map(([k, v]) => (
              <View key={k} style={s.legendItem}>
                <View style={[s.legendBlock, { backgroundColor: v.color }]} />
                <Text style={s.legendLabel}>{v.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 안내 */}
        <View style={s.tipBox}>
          <Text style={s.tipText}>날짜를 누르면 해당 날짜의 운동으로 이동합니다</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 14, paddingBottom: 40 },

  monthNav: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  navBtn:    { paddingHorizontal: 16, paddingVertical: 7, backgroundColor: C.bg2, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  navBtnText:{ fontSize: 20, color: C.t1 },
  monthTitle:{ fontSize: 16, fontWeight: '700', color: C.t0 },

  dayHeaders: { flexDirection: 'row', marginBottom: 2 },
  dayHeader:  { width: CELL_W, textAlign: 'center', fontSize: 10, color: C.t2, paddingVertical: 4, fontWeight: '500' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL_W,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 5, paddingHorizontal: 1,
    borderRadius: 6, marginBottom: 2,
    overflow: 'hidden',
  },
  cellToday:  { backgroundColor: C.blue },
  cellHasLog: { backgroundColor: C.bg1, borderWidth: 1, borderColor: C.border },

  cellDay:       { fontSize: 12, color: C.t1, fontWeight: '400', marginBottom: 2 },
  cellDayToday:  { color: '#fff', fontWeight: '700' },

  groupLabel: {
    width: CELL_W - 4,
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 2,
    marginBottom: 1,
    alignItems: 'center',
  },
  groupLabelText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  legendWrap:  { marginTop: 16 },
  legendTitle: { fontSize: 10, fontWeight: '600', color: C.t2, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  legend:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendBlock: { width: 16, height: 8, borderRadius: 2 },
  legendLabel: { fontSize: 11, color: C.t1 },

  tipBox: { marginTop: 12, padding: 10, backgroundColor: C.bg2, borderRadius: 8 },
  tipText:{ fontSize: 11, color: C.t2, textAlign: 'center' },
});
