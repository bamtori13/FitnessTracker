import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Animated, PanResponder,
  Vibration, BackHandler, Platform, UIManager,
  Modal, Dimensions,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  getDB,
  getLogByDate, createLog, updateLogNotes,
  addExerciseToLog, removeExerciseFromLog, reorderLogExercises,
  addSet, updateSet, deleteSet,
  getLastLogForExercise, getLastVolForExercise, getPRForExercise,
  getAllPrograms, getAllExercises, saveProgram,
} from '../db/database';
import { MUSCLE_GROUPS, C, todayStr, addDays, fmtDate, genId } from '../utils/constants';
import {
  Chip, Sheet, BtnPrimary, BtnSecondary,
  Card, Label, ProgressBar, FilterBtns, Loading,
} from '../components/UI';
import { useApp } from '../../App';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental)
  UIManager.setLayoutAnimationEnabledExperimental(true);

const SCREEN_W = Dimensions.get('window').width;
const ITEM_H   = 72; // 접힌 카드 기본 높이 근사치

// ─── 스테퍼 ──────────────────────────────────────────────────────────────────
// onChange: 버튼 클릭 또는 입력 완료(blur) 시에만 호출 → DB 저장 빈도 최소화

function Stepper({ value, onChange, step = 1, min = 0, placeholder }) {
  const [text, setText] = useState(value != null && value !== 0 ? String(value) : '');
  // 외부 value가 reloadLog로 갱신될 때 동기화
  useEffect(() => {
    setText(value != null && value !== 0 ? String(value) : '');
  }, [value]);

  const adjust = (d) => {
    const next = Math.max(min, Math.round(((parseFloat(text) || 0) + d) * 100) / 100);
    const s = String(next);
    setText(s);
    onChange(next); // 버튼은 즉시 저장
  };

  const handleEndEditing = () => {
    const parsed = parseFloat(text);
    const next   = isNaN(parsed) ? 0 : Math.max(min, parsed);
    onChange(next); // 입력 완료 시 저장
  };

  return (
    <View style={st.wrap}>
      <TouchableOpacity style={st.btn} onPress={() => adjust(-step)} activeOpacity={0.6}>
        <Text style={st.btnText}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={st.input}
        keyboardType="decimal-pad"
        value={text}
        placeholder={placeholder || '0'}
        placeholderTextColor={C.t3}
        onChangeText={t => setText(t)}       // 로컬만 업데이트 (DB 저장 X)
        onEndEditing={handleEndEditing}       // 키보드 완료 시 DB 저장
        onBlur={handleEndEditing}             // 포커스 잃을 때도 저장
        textAlign="center"
        selectTextOnFocus
      />
      <TouchableOpacity style={st.btn} onPress={() => adjust(step)} activeOpacity={0.6}>
        <Text style={st.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── 드래그 정렬 리스트 ──────────────────────────────────────────────────────
// 핵심 개선: PanResponder를 최상위 View 하나에만 붙이고,
// 어느 아이템 위에 있는지는 측정된 Y좌표로 계산

function SortableList({ items, renderItem, onReorder, setScrollEnabled }) {
  const [orderIds, setOrderIds] = useState(() => items.map(i => i.id));
  const [dragIdx,  setDragIdx]  = useState(-1);   // 드래그 중인 인덱스
  const [overIdx,  setOverIdx]  = useState(-1);   // 현재 올라가 있는 인덱스

  const dragIdxRef  = useRef(-1);
  const overIdxRef  = useRef(-1);
  const orderRef    = useRef(orderIds);
  const heightsRef  = useRef({});   // {id: height}
  const dragY       = useRef(new Animated.Value(0)).current;

  // items 변경 시 orderIds 동기화
  useEffect(() => {
    setOrderIds(prev => {
      const newIds = items.map(i => i.id);
      const kept   = prev.filter(id => newIds.includes(id));
      const added  = newIds.filter(id => !kept.includes(id));
      const next   = [...kept, ...added];
      orderRef.current = next;
      return next;
    });
  }, [items.map(i => i.id).join(',')]);

  // dy를 기반으로 드래그 아이템이 어느 위치로 이동해야 하는지 계산
  // 각 아이템 높이를 누적해서 절대 Y를 계산
  const getOverIdx = useCallback((fromIdx, dy) => {
    const ids   = orderRef.current;
    const n     = ids.length;

    // 각 카드의 누적 top
    const tops = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      tops.push(acc);
      acc += (heightsRef.current[ids[i]] || ITEM_H) + 8; // 8 = marginBottom
    }

    const fromH    = heightsRef.current[ids[fromIdx]] || ITEM_H;
    const fromTop  = tops[fromIdx];
    const center   = fromTop + fromH / 2 + dy; // 드래그 카드 중심 Y

    let best = fromIdx;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      if (i === fromIdx) continue;
      const h   = heightsRef.current[ids[i]] || ITEM_H;
      const mid = tops[i] + h / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }, []);

  // 최상위 PanResponder — 한 개만 생성
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:       () => dragIdxRef.current >= 0,
      onMoveShouldSetPanResponder:        () => dragIdxRef.current >= 0,
      onMoveShouldSetPanResponderCapture: () => dragIdxRef.current >= 0,
      onPanResponderMove: (_, g) => {
        if (dragIdxRef.current < 0) return;
        dragY.setValue(g.dy);
        const oi = getOverIdx(dragIdxRef.current, g.dy);
        if (oi !== overIdxRef.current) {
          overIdxRef.current = oi;
          setOverIdx(oi);
        }
      },
      onPanResponderRelease: (_, g) => {
        if (dragIdxRef.current < 0) return;
        const fromIdx = dragIdxRef.current;
        const toIdx   = getOverIdx(fromIdx, g.dy);

        // 스프링으로 제자리 복귀 후 순서 확정
        Animated.spring(dragY, {
          toValue: 0, useNativeDriver: true,
          tension: 220, friction: 18,
        }).start(() => {
          if (toIdx !== fromIdx) {
            const next = [...orderRef.current];
            const [moved] = next.splice(fromIdx, 1);
            next.splice(toIdx, 0, moved);
            orderRef.current = next;
            setOrderIds(next);
            onReorder(next);
          }
          dragIdxRef.current = -1;
          overIdxRef.current = -1;
          setDragIdx(-1);
          setOverIdx(-1);
          setScrollEnabled(true);
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, tension: 220, friction: 18 }).start();
        dragIdxRef.current = -1;
        overIdxRef.current = -1;
        setDragIdx(-1);
        setOverIdx(-1);
        setScrollEnabled(true);
      },
    })
  ).current;

  const handleLongPress = (id, idx) => {
    Vibration.vibrate(35);
    dragIdxRef.current = idx;
    overIdxRef.current = idx;
    dragY.setValue(0);
    setDragIdx(idx);
    setOverIdx(idx);
    setScrollEnabled(false);
  };

  const orderedItems = orderIds.map(id => items.find(i => i.id === id)).filter(Boolean);

  return (
    <View {...pan.panHandlers}>
      {orderedItems.map((item, idx) => {
        const isDragging = dragIdx === idx;
        const isOver     = overIdx === idx && !isDragging;

        return (
          <Animated.View
            key={item.id}
            onLayout={e => { heightsRef.current[item.id] = e.nativeEvent.layout.height; }}
            style={[
              { marginBottom: 8 },
              isDragging && {
                transform: [{ translateY: dragY }],
                zIndex: 999, elevation: 12,
                shadowColor: '#000', shadowOpacity: 0.25,
                shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                opacity: 0.97,
              },
              isOver && {
                opacity: 0.35,
                transform: [{ scale: 0.97 }],
              },
            ]}
          >
            {renderItem(item, idx, isDragging, handleLongPress)}
          </Animated.View>
        );
      })}
    </View>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function WorkoutScreen() {
  const { sharedDate, setSharedDate, setTab } = useApp();

  const [date,          setDate]          = useState(sharedDate || todayStr());
  const [log,           setLog]           = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [collapsed,     setCollapsed]     = useState({});
  const [showAddEx,     setShowAddEx]     = useState(false);
  const [showSaveRt,    setShowSaveRt]    = useState(false);
  const [showCal,       setShowCal]       = useState(false);
  const [routineName,   setRoutineName]   = useState('');
  const [exercises,     setExercises]     = useState([]);
  const [programs,      setPrograms]      = useState([]);
  const [exFilter,      setExFilter]      = useState('all');
  const [exSearch,      setExSearch]      = useState('');
  const [entryMeta,     setEntryMeta]     = useState({});
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [fromCal,       setFromCal]       = useState(false);

  // ── 날짜 슬라이드 애니메이션 ─────────────────────────────────────────────
  const slideAnim      = useRef(new Animated.Value(0)).current;
  const currentDateRef = useRef(date);
  // swipe 핸들러가 항상 최신 함수를 참조하도록 ref 사용
  const changeDateRef  = useRef(null);

  const animateAndSetDate = useCallback((newDate, direction) => {
    // direction: -1=미래(왼쪽 슬라이드), 1=과거(오른쪽 슬라이드), 0=오늘(페이드)
    const startX = direction === 0 ? 0 : direction < 0 ? SCREEN_W : -SCREEN_W;
    slideAnim.setValue(startX);
    currentDateRef.current = newDate;
    setDate(newDate);
    Animated.spring(slideAnim, {
      toValue: 0, useNativeDriver: true,
      tension: 160, friction: 20,
    }).start();
  }, [slideAnim]);

  const changeDate = useCallback((delta) => {
    const newDate = addDays(currentDateRef.current, delta);
    animateAndSetDate(newDate, delta < 0 ? -1 : 1);
  }, [animateAndSetDate]);

  // changeDateRef를 항상 최신으로 유지
  useEffect(() => { changeDateRef.current = changeDate; }, [changeDate]);

  // 스와이프 PanResponder — ref를 통해 최신 changeDate 호출 (생성 시점 클로저 문제 없음)
  const swipePan = useRef(null);
  if (!swipePan.current) {
    swipePan.current = PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 18 && Math.abs(g.dy) < 40,
      onPanResponderRelease: (_, g) => {
        if (g.dx < -55)     changeDateRef.current?.(-1);
        else if (g.dx > 55) changeDateRef.current?.(1);
      },
    });
  }

  // 달력에서 날짜 수신
  useEffect(() => {
    if (sharedDate) {
      animateAndSetDate(sharedDate, sharedDate > currentDateRef.current ? -1 : 1);
      setSharedDate(null);
      setFromCal(true);
    }
  }, [sharedDate]);

  // Android 뒤로가기
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (fromCal) { setFromCal(false); setTab('calendar'); return true; }
      return false;
    });
    return () => h.remove();
  }, [fromCal]);

  useEffect(() => {
    getAllExercises().then(setExercises);
    getAllPrograms().then(setPrograms);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getLogByDate(date).then(l => {
      if (!alive) return;
      setLog(l);
      if (l?.exercises?.length) {
        const init = {};
        l.exercises.forEach(e => { init[e.id] = true; });
        setCollapsed(init);
      } else { setCollapsed({}); }
      setLoading(false);
    }).catch(err => {
      console.warn('Failed to load workout log:', err);
      if (alive) {
        setLog(null);
        setCollapsed({});
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [date]);

  useEffect(() => {
    if (!log?.exercises?.length) return;
    (async () => {
      const meta = {};
      for (const entry of log.exercises) {
        const [pr, lastLog, lastVol] = await Promise.all([
          getPRForExercise(entry.exerciseId),
          getLastLogForExercise(entry.exerciseId, date),
          getLastVolForExercise(entry.exerciseId, date),
        ]);
        meta[entry.id] = { prW: pr, lastVol, lastSets: lastLog?.sets || [] };
      }
      setEntryMeta(meta);
    })();
  }, [log?.exercises?.length, date]);

  const reloadLog = useCallback(async () => {
    const l = await getLogByDate(date);
    setLog(l);
  }, [date]);

  // ── 운동 조작 ────────────────────────────────────────────────────────────

  const handleStartWorkout = async () => {
    const l = await createLog(date); setLog(l);
  };

  const handleAddExercise = async (exId) => {
    if (!log) return;
    const lastLog = await getLastLogForExercise(exId, date);
    const leId    = await addExerciseToLog(date, exId, log.exercises.length);
    if (lastLog?.sets?.length) {
      for (let i = 0; i < lastLog.sets.length; i++)
        await addSet(leId, lastLog.sets[i].weight, lastLog.sets[i].reps, i, lastLog.sets[i].durationSec || 0);
    } else { await addSet(leId, 0, 10, 0, 0); }
    setCollapsed(c => ({ ...c, [leId]: true }));
    await reloadLog(); setShowAddEx(false);
  };

  const handleAddProgram = async (prog) => {
    if (!log) return;
    let pos = log.exercises.length;
    const newIds = [];
    for (const exId of prog.exercises) {
      const lastLog = await getLastLogForExercise(exId, date);
      const leId    = await addExerciseToLog(date, exId, pos++);
      newIds.push(leId);
      if (lastLog?.sets?.length) {
        for (let i = 0; i < lastLog.sets.length; i++)
          await addSet(leId, lastLog.sets[i].weight, lastLog.sets[i].reps, i, lastLog.sets[i].durationSec || 0);
      } else { await addSet(leId, 0, 10, 0, 0); }
    }
    setCollapsed(c => { const n = {...c}; newIds.forEach(id => { n[id] = true; }); return n; });
    await reloadLog(); setShowAddEx(false);
  };

  const handleRemoveEntry = (leId) => Alert.alert('운동 삭제', '삭제하시겠습니까?', [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive',
      onPress: async () => { await removeExerciseFromLog(leId); await reloadLog(); } },
  ]);

  const handleAddSet = async (leId) => {
    const entry = log.exercises.find(e => e.id === leId);
    const last  = entry.sets[entry.sets.length - 1];
    await addSet(leId, last?.weight || 0, last?.reps || 10, entry.sets.length, last?.durationSec || 0);
    await reloadLog();
  };

  const handleDeleteSet = async (setId) => { await deleteSet(setId); await reloadLog(); };

  // DB에서 최신 세트 값을 읽어서 병합 저장 — stale log state 문제 완전 해결
  const handleUpdateSet = async (setId, field, value) => {
    const db  = await getDB();
    const cur = await db.getFirstAsync('SELECT * FROM sets WHERE id=?', [setId]);
    if (!cur) return;
    await updateSet(
      setId,
      field === 'weight'      ? value : cur.weight,
      field === 'reps'        ? value : cur.reps,
      field === 'done'        ? value : (cur.done === 1),
      field === 'durationSec' ? value : (cur.duration_sec || 0),
    );
    await reloadLog();
  };

  const handleReorder = useCallback(async (newOrderIds) => {
    await reorderLogExercises(newOrderIds);
    setLog(prev => {
      if (!prev) return prev;
      const map = {};
      prev.exercises.forEach(e => { map[e.id] = e; });
      return { ...prev, exercises: newOrderIds.map(id => map[id]).filter(Boolean) };
    });
  }, []);

  const handleSaveAsRoutine = async () => {
    if (!routineName.trim()) { Alert.alert('알림', '루틴 이름을 입력해주세요'); return; }
    await saveProgram({
      id: genId(), name: routineName.trim(),
      exercises: log.exercises.map(e => e.exerciseId),
    });
    setPrograms(await getAllPrograms());
    setShowSaveRt(false); setRoutineName('');
    Alert.alert('완료', `"${routineName.trim()}" 루틴이 저장됐습니다.`);
  };

  const totalVol = log
    ? log.exercises.reduce((t, e) =>
        t + e.sets.filter(s => s.done).reduce((v, s) =>
          v + (s.durationSec > 0 ? s.durationSec / 60 : (s.weight||0)*(s.reps||0)), 0), 0)
    : 0;

  const filteredEx = exercises.filter(e =>
    (exFilter === 'all' || e.group === exFilter) && e.name.includes(exSearch)
  );
  const isToday = date === todayStr();

  // ── 카드 렌더 — useCallback 제거 (stale closure 방지) ─────────────────────

  const renderEntry = (entry, idx, isDragging, onLongPress) => {
    const ex       = exercises.find(e => e.id === entry.exerciseId);
    if (!ex) return null;
    const isDur    = ex.inputType === 'duration';
    const done     = entry.sets.filter(s => s.done).length;
    const prog     = entry.sets.length ? done / entry.sets.length : 0;
    const entryVol = entry.sets.filter(s => s.done)
      .reduce((v, s) => v + (s.durationSec > 0 ? s.durationSec / 60 : (s.weight||0)*(s.reps||0)), 0);
    const isCol    = collapsed[entry.id];
    const meta     = entryMeta[entry.id] || {};

    return (
      <Card style={[isDragging && { borderColor: C.blue, borderWidth: 2 }]}>
        {/* 헤더 */}
        <TouchableOpacity
          style={s.entryHeader}
          onPress={() => setCollapsed(c => ({ ...c, [entry.id]: !c[entry.id] }))}
          onLongPress={() => onLongPress(entry.id, idx)}
          delayLongPress={300}
          activeOpacity={0.8}
        >
          <Text style={[s.dragDots, isDragging && { color: C.blue }]}>⠿</Text>
          <Text style={s.collapseIcon}>{isCol ? '▶' : '▼'}</Text>
          <Text style={s.exName} numberOfLines={1}>{ex.name}</Text>
          {isDragging && <View style={s.movingBadge}><Text style={s.movingText}>이동 중</Text></View>}
          {!isDragging && done === entry.sets.length && entry.sets.length > 0 &&
            <View style={s.doneBadge}><Text style={s.doneBadgeText}>완료</Text></View>}
          {isDur && <View style={s.typeBadge}><Text style={s.typeBadgeText}>시간</Text></View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Chip group={ex.group} />
            <TouchableOpacity onPress={() => handleRemoveEntry(entry.id)}
              hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Text style={{ color: C.t3, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* 배지 */}
        <View style={s.badgeRow}>
          {entryVol > 0 &&
            <View style={s.volPill}>
              <Text style={s.volPillText}>{isDur ? `${entryVol.toFixed(0)}분` : `${entryVol.toLocaleString()} kg`}</Text>
            </View>}
          {meta.lastVol > 0 &&
            <View style={s.prevPill}>
              <Text style={s.prevPillText}>직전 {isDur ? `${meta.lastVol.toFixed(0)}분` : `${meta.lastVol.toLocaleString()} kg`}</Text>
            </View>}
          {!isDur && meta.prW > 0 &&
            <View style={s.prPill}><Text style={s.prPillText}>PR {meta.prW} kg</Text></View>}
        </View>
        <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
          <ProgressBar value={prog} />
        </View>

        {/* 세트 */}
        {!isCol && (
          <View style={{ borderTopWidth:1, borderTopColor:C.bg2, paddingHorizontal:10, paddingBottom:10 }}>
            {isDur ? (
              <View style={[s.setRow, { paddingVertical: 4 }]}>
                <View style={{ width:18 }} /><Text style={s.colHeader}>시간 (분)</Text>
                <View style={{ width:28 }} /><View style={{ width:28 }} />
              </View>
            ) : (
              <View style={[s.setRow, { paddingVertical: 4 }]}>
                <View style={{ width:18 }} />
                <Text style={s.colHeader}>중량 (kg)</Text>
                <Text style={s.colHeader}>횟수</Text>
                <View style={{ width:28 }} /><View style={{ width:28 }} />
              </View>
            )}
            {entry.sets.map((set, si) => {
              const ls   = meta.lastSets?.[si];
              const isPR = !isDur && ls && set.done &&
                (set.weight > ls.weight || (set.weight === ls.weight && set.reps > ls.reps));
              return (
                <View key={set.id || si} style={s.setRow}>
                  <Text style={s.setNum}>{si + 1}</Text>
                  {isDur ? (
                    <View style={{ flex: 2 }}>
                      <Stepper value={set.durationSec ? Math.round(set.durationSec / 60) : null}
                        step={1} min={0}
                        placeholder={ls?.durationSec ? String(Math.round(ls.durationSec / 60)) : '0'}
                        onChange={v => handleUpdateSet(set.id, 'durationSec', Math.round(v * 60))} />
                      {ls?.durationSec > 0 &&
                        <Text style={s.prevHint}>직전 {Math.round(ls.durationSec / 60)}분</Text>}
                    </View>
                  ) : (
                    <>
                      <View style={{ flex: 1 }}>
                        <Stepper value={set.weight} step={2.5} min={0}
                          placeholder={ls?.weight ? String(ls.weight) : '0'}
                          onChange={v => handleUpdateSet(set.id, 'weight', v)} />
                        {ls && <Text style={s.prevHint}>{ls.weight}×{ls.reps}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Stepper value={set.reps} step={1} min={1}
                          placeholder={ls?.reps ? String(ls.reps) : '10'}
                          onChange={v => handleUpdateSet(set.id, 'reps', Math.round(v))} />
                        {isPR && <Text style={s.prHint}>PR ↑</Text>}
                      </View>
                    </>
                  )}
                  <TouchableOpacity style={[s.doneBtn, set.done && s.doneBtnOn]}
                    onPress={() => handleUpdateSet(set.id, 'done', !set.done)}>
                    <Text style={{ color: set.done ? '#fff' : C.t2, fontSize: 12 }}>✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.delBtn} onPress={() => handleDeleteSet(set.id)}>
                    <Text style={{ color: C.t3, fontSize: 11 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity style={s.addSetBtn} onPress={() => handleAddSet(entry.id)}>
              <Text style={s.addSetText}>+ 세트 추가</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 날짜 스와이프 감지 영역 (드래그 중에는 비활성) */}
      <View style={{ flex: 1 }} {...(scrollEnabled ? swipePan.current.panHandlers : {})}>
        <Animated.View style={{ flex: 1, transform: [{ translateX: slideAnim }] }}>
          <ScrollView
            contentContainerStyle={s.page}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={scrollEnabled}
          >
            {/* 날짜 헤더 */}
            <View style={s.dateNav}>
              {fromCal ? (
                <TouchableOpacity style={s.calBackBtn}
                  onPress={() => { setFromCal(false); setTab('calendar'); }}>
                  <Text style={s.calBackText}>← 달력</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.navArrow} onPress={() => changeDate(-1)}>
                  <Text style={s.navArrowText}>‹</Text>
                </TouchableOpacity>
              )}

              {/* 날짜 텍스트 터치 → 캘린더 팝업 */}
              <TouchableOpacity style={s.dateLabelWrap} onPress={() => setShowCal(true)} activeOpacity={0.7}>
                <Text style={s.dateLabel}>{fmtDate(date)}</Text>
                <Text style={s.calHint}>▾</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.todayBtn, isToday && s.todayBtnOn]}
                onPress={() => { animateAndSetDate(todayStr(), 0); setFromCal(false); }}>
                <Text style={[s.todayBtnTxt, isToday && { color: '#fff' }]}>오늘</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.navArrow} onPress={() => changeDate(1)}>
                <Text style={s.navArrowText}>›</Text>
              </TouchableOpacity>
            </View>

            {!loading && !log && <Text style={s.swipeHint}>← 스와이프로 날짜 이동 →</Text>}

            {loading ? (
              <Loading />
            ) : !log ? (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>운동을 시작해볼까요?</Text>
                <Text style={s.emptySub}>{fmtDate(date)} 운동을 기록합니다</Text>
                <BtnPrimary label="운동 시작" onPress={handleStartWorkout} style={{ marginTop: 20 }} />
              </View>
            ) : (
              <>
                <View style={s.summaryRow}>
                  {totalVol > 0 && (
                    <View style={s.volBanner}>
                      <Text style={s.volLabel}>총 볼륨</Text>
                      <Text style={s.volValue}>
                        {totalVol.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
                      </Text>
                    </View>
                  )}
                  {log.exercises.length > 0 && (
                    <TouchableOpacity style={s.saveRtBtn}
                      onPress={() => { setRoutineName(''); setShowSaveRt(true); }}>
                      <Text style={s.saveRtTxt}>루틴 저장</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {log.exercises.length === 0 && <Text style={s.hintText}>운동을 추가해주세요</Text>}
                {log.exercises.length > 1 && <Text style={s.dragHint}>길게 눌러서 순서 변경</Text>}

                <SortableList
                  items={log.exercises}
                  onReorder={handleReorder}
                  setScrollEnabled={setScrollEnabled}
                  renderItem={renderEntry}
                />

                <BtnSecondary label="+ 운동 추가" onPress={() => setShowAddEx(true)} style={{ marginBottom: 10 }} />

                <Card style={{ padding: 12 }}>
                  <Label text="메모" />
                  <TextInput style={s.notes} multiline
                    placeholder="운동 메모..." placeholderTextColor={C.t3}
                    value={log.notes || ''}
                    onChangeText={async t => { await updateLogNotes(date, t); setLog(l => ({...l, notes: t})); }} />
                </Card>
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* 날짜 캘린더 팝업 */}
      {showCal && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowCal(false)}>
          <TouchableOpacity style={s.calOverlay} activeOpacity={1} onPress={() => setShowCal(false)}>
            <TouchableOpacity activeOpacity={1} style={s.calBox}>
              <Text style={s.calTitle}>날짜 선택</Text>
              <DateTimePicker
                value={new Date(date + 'T12:00:00')}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                onChange={(e, d) => {
                  if (e.type === 'dismissed') { setShowCal(false); return; }
                  setShowCal(false);
                  if (d) {
                    const nd  = d.toISOString().split('T')[0];
                    const dir = nd > currentDateRef.current ? -1 : nd < currentDateRef.current ? 1 : 0;
                    animateAndSetDate(nd, dir);
                  }
                }}
              />
              <TouchableOpacity style={s.calCancelBtn} onPress={() => setShowCal(false)}>
                <Text style={s.calCancelText}>취소</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 운동 추가 시트 */}
      <Sheet visible={showAddEx} onClose={() => setShowAddEx(false)}>
        {programs.length > 0 && (
          <>
            <Label text="루틴에서 추가" />
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:12 }}>
              {programs.map(p => (
                <TouchableOpacity key={p.id} onPress={() => handleAddProgram(p)} style={s.progChip}>
                  <Text style={s.progChipText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.divider} />
          </>
        )}
        <TextInput style={[s.searchInput, { marginBottom:8 }]}
          placeholder="운동 검색..." placeholderTextColor={C.t3}
          value={exSearch} onChangeText={setExSearch} />
        <FilterBtns current={exFilter} onChange={setExFilter} />
        <ScrollView style={{ maxHeight: 280 }}>
          {filteredEx.map(ex => {
            const already = log?.exercises?.some(e => e.exerciseId === ex.id);
            return (
              <TouchableOpacity key={ex.id}
                onPress={() => !already && handleAddExercise(ex.id)}
                style={[s.exItem, already && { opacity: 0.4 }]}>
                <Text style={s.exItemName}>{ex.name}</Text>
                <View style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
                  <View style={[s.typeBadgeSm, ex.inputType === 'duration' && s.typeDurSm]}>
                    <Text style={s.typeSmTxt}>{ex.inputType === 'duration' ? '시간' : '중량'}</Text>
                  </View>
                  <Chip group={ex.group} />
                  {already && <Text style={{ fontSize:10, color:C.t2 }}>추가됨</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Sheet>

      {/* 루틴 저장 시트 */}
      <Sheet visible={showSaveRt} onClose={() => setShowSaveRt(false)}>
        <Text style={s.sheetTitle}>오늘 운동을 루틴으로 저장</Text>
        <Text style={s.sheetSub}>
          {log?.exercises?.map(e => exercises.find(x => x.id === e.exerciseId)?.name).filter(Boolean).join(' · ')}
        </Text>
        <View style={s.divider} />
        <Label text="루틴 이름" />
        <TextInput style={[s.searchInput, { marginBottom:14 }]}
          placeholder="예: 상체 루틴 A" placeholderTextColor={C.t3}
          value={routineName} onChangeText={setRoutineName} autoFocus />
        <BtnPrimary label="저장" onPress={handleSaveAsRoutine} />
      </Sheet>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  wrap:    { flexDirection:'row', alignItems:'center', backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:7, overflow:'hidden' },
  btn:     { width:32, height:34, alignItems:'center', justifyContent:'center', backgroundColor:C.bg3 },
  btnText: { fontSize:18, color:C.t0, lineHeight:22 },
  input:   { flex:1, height:34, fontSize:14, fontWeight:'500', color:C.t0, textAlign:'center', padding:0 },
});

const s = StyleSheet.create({
  page:  { padding:14, paddingBottom:40 },

  dateNav:       { flexDirection:'row', alignItems:'center', gap:6, marginBottom:12, paddingVertical:4 },
  navArrow:      { paddingHorizontal:10, paddingVertical:6, backgroundColor:C.bg2, borderRadius:8, borderWidth:1, borderColor:C.border },
  navArrowText:  { fontSize:18, color:C.t1, lineHeight:22 },
  dateLabelWrap: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, paddingVertical:6 },
  dateLabel:     { fontSize:14, fontWeight:'600', color:C.t0 },
  calHint:       { fontSize:10, color:C.t2 },
  todayBtn:      { paddingHorizontal:9, paddingVertical:5, borderRadius:8, backgroundColor:C.bg2, borderWidth:1, borderColor:C.border },
  todayBtnOn:    { backgroundColor:C.blue, borderColor:C.blue },
  todayBtnTxt:   { fontSize:11, fontWeight:'500', color:C.t1 },
  calBackBtn:    { paddingHorizontal:10, paddingVertical:5, borderRadius:8, backgroundColor:C.blueL, borderWidth:1, borderColor:C.blueMid },
  calBackText:   { fontSize:12, fontWeight:'500', color:C.blue },

  calOverlay:    { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' },
  calBox:        { backgroundColor:C.bg1, borderRadius:16, overflow:'hidden', margin:20, maxWidth:360, width:'90%' },
  calTitle:      { fontSize:15, fontWeight:'600', color:C.t0, padding:16, paddingBottom:8, textAlign:'center' },
  calCancelBtn:  { padding:14, alignItems:'center', borderTopWidth:1, borderTopColor:C.border },
  calCancelText: { fontSize:15, color:C.blue, fontWeight:'500' },

  swipeHint:  { textAlign:'center', color:C.t3, fontSize:11, marginBottom:8 },
  dragHint:   { textAlign:'center', color:C.t3, fontSize:11, marginBottom:6 },
  emptyState: { alignItems:'center', paddingVertical:60 },
  emptyTitle: { fontSize:15, fontWeight:'500', color:C.t0, marginBottom:6 },
  emptySub:   { fontSize:12, color:C.t2 },
  hintText:   { textAlign:'center', padding:24, color:C.t2, fontSize:13 },

  summaryRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  volBanner:  { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:10, backgroundColor:C.blueL, borderRadius:8, borderWidth:1, borderColor:C.blueMid },
  volLabel:   { fontSize:12, color:'#1a4d9e', fontWeight:'500' },
  volValue:   { fontSize:14, fontWeight:'600', color:'#1a4d9e' },
  saveRtBtn:  { paddingHorizontal:12, paddingVertical:10, backgroundColor:C.bg1, borderRadius:8, borderWidth:1, borderColor:C.blue },
  saveRtTxt:  { fontSize:12, fontWeight:'500', color:C.blue },

  entryHeader:   { flexDirection:'row', alignItems:'center', padding:10, paddingBottom:6, gap:4 },
  dragDots:      { fontSize:16, color:C.t3, lineHeight:20, marginRight:2 },
  collapseIcon:  { fontSize:9, color:C.t2 },
  exName:        { fontSize:14, fontWeight:'500', color:C.t0, flex:1 },
  doneBadge:     { backgroundColor:C.blueL, borderWidth:1, borderColor:C.blueMid, borderRadius:8, paddingHorizontal:5, paddingVertical:1 },
  doneBadgeText: { fontSize:10, color:C.blue },
  movingBadge:   { backgroundColor:'#fff3cd', borderWidth:1, borderColor:'#ffc107', borderRadius:8, paddingHorizontal:5, paddingVertical:1 },
  movingText:    { fontSize:10, color:'#856404', fontWeight:'600' },
  typeBadge:     { backgroundColor:C.bg2, borderRadius:5, paddingHorizontal:5, paddingVertical:1 },
  typeBadgeText: { fontSize:9, color:C.t2 },

  badgeRow:    { flexDirection:'row', gap:5, flexWrap:'wrap', paddingHorizontal:12, paddingBottom:6 },
  volPill:     { backgroundColor:C.blueL, borderWidth:1, borderColor:C.blueMid, borderRadius:10, paddingHorizontal:7, paddingVertical:2 },
  volPillText: { fontSize:11, color:'#1a4d9e', fontWeight:'500' },
  prevPill:    { backgroundColor:'#f0f7ee', borderWidth:1, borderColor:'#a8d5a0', borderRadius:10, paddingHorizontal:7, paddingVertical:2 },
  prevPillText:{ fontSize:10, color:'#2e6b28', fontWeight:'600' },
  prPill:      { backgroundColor:'#fdf6e3', borderWidth:1, borderColor:'#d4b84a', borderRadius:10, paddingHorizontal:7, paddingVertical:2 },
  prPillText:  { fontSize:10, color:'#7a5c00', fontWeight:'600' },

  setRow:    { flexDirection:'row', alignItems:'center', gap:5, paddingVertical:5, borderBottomWidth:1, borderBottomColor:C.bg2 },
  setNum:    { width:18, textAlign:'center', fontSize:11, fontWeight:'500', color:C.t2 },
  colHeader: { flex:1, textAlign:'center', fontSize:10, color:C.t2 },
  prevHint:  { textAlign:'center', fontSize:9, color:C.t3, marginTop:2 },
  prHint:    { textAlign:'center', fontSize:9, color:C.blue, fontWeight:'600' },
  doneBtn:   { width:28, height:34, borderRadius:6, borderWidth:1.5, borderColor:C.border2, backgroundColor:C.bg2, alignItems:'center', justifyContent:'center' },
  doneBtnOn: { backgroundColor:C.blue, borderColor:C.blue },
  delBtn:    { width:28, height:34, borderRadius:6, borderWidth:1, borderColor:C.border, alignItems:'center', justifyContent:'center' },
  addSetBtn: { marginTop:8, padding:7, backgroundColor:C.bg2, borderWidth:1, borderColor:C.border2, borderStyle:'dashed', borderRadius:6, alignItems:'center' },
  addSetText:{ fontSize:11, color:C.t2 },
  notes:     { fontSize:13, color:C.t0, padding:0, marginTop:4, minHeight:48, textAlignVertical:'top' },

  searchInput: { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:8, padding:9, fontSize:13, color:C.t0 },
  exItem:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:10, borderRadius:8, backgroundColor:C.bg2, marginBottom:3 },
  exItemName:  { fontSize:13, fontWeight:'500', color:C.t0, flex:1 },
  typeBadgeSm: { backgroundColor:C.bg3, borderRadius:5, paddingHorizontal:5, paddingVertical:1 },
  typeDurSm:   { backgroundColor:'#fdf0d8' },
  typeSmTxt:   { fontSize:9, color:C.t2, fontWeight:'500' },
  progChip:    { paddingHorizontal:10, paddingVertical:4, borderRadius:14, borderWidth:1, borderColor:C.border, backgroundColor:C.bg2 },
  progChipText:{ fontSize:11, color:C.t1 },
  divider:     { height:1, backgroundColor:C.border, marginVertical:10 },
  sheetTitle:  { fontSize:15, fontWeight:'600', color:C.t0, marginBottom:6 },
  sheetSub:    { fontSize:12, color:C.t2, lineHeight:18 },
});
