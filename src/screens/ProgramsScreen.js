import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert,
} from 'react-native';
import { getAllPrograms, saveProgram, deleteProgram, getAllExercises } from '../db/database';
import { MUSCLE_GROUPS, C, genId } from '../utils/constants';
import { Chip, Sheet, BtnPrimary, BtnSecondary, Card, Label, FilterBtns, Loading } from '../components/UI';

export default function ProgramsScreen() {
  const [programs,  setPrograms]  = useState([]);
  const [exercises, setExercises] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const [viewProg,  setViewProg]  = useState(null);
  const [formProg,  setFormProg]  = useState(null); // null | {id?,name,exercises:[]}
  const [exFilter,  setExFilter]  = useState('all');
  const [exSearch,  setExSearch]  = useState('');

  useEffect(() => {
    Promise.all([getAllPrograms(), getAllExercises()]).then(([p, e]) => {
      setPrograms(p);
      setExercises(e);
      setLoading(false);
    });
  }, []);

  const reload = async () => {
    const p = await getAllPrograms();
    setPrograms(p);
  };

  const handleSave = async () => {
    if (!formProg?.name?.trim()) {
      Alert.alert('알림', '루틴 이름을 입력해주세요');
      return;
    }
    const prog = {
      id: formProg.id || genId(),
      name: formProg.name.trim(),
      exercises: formProg.exercises,
    };
    await saveProgram(prog);
    await reload();
    setFormProg(null);
  };

  const handleDelete = async (id) => {
    Alert.alert('루틴 삭제', '이 루틴을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          await deleteProgram(id);
          await reload();
          setViewProg(null);
        },
      },
    ]);
  };

  const toggleEx = (exId) => {
    setFormProg(f => {
      const already = f.exercises.includes(exId);
      return {
        ...f,
        exercises: already ? f.exercises.filter(e => e !== exId) : [...f.exercises, exId],
      };
    });
  };

  const filteredEx = useMemo(() =>
    exercises.filter(e =>
      (exFilter === 'all' || e.group === exFilter) &&
      e.name.includes(exSearch)
    ), [exercises, exFilter, exSearch]);

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.pageTitle}>루틴</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setFormProg({ name: '', exercises: [] })}
          >
            <Text style={s.addBtnText}>+ 만들기</Text>
          </TouchableOpacity>
        </View>

        {programs.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyText}>루틴을 만들어보세요</Text>
          </View>
        )}

        {programs.map(prog => {
          const groups = [
            ...new Set(
              prog.exercises
                .map(id => exercises.find(e => e.id === id)?.group)
                .filter(Boolean)
            ),
          ];
          return (
            <Card key={prog.id} style={{ marginBottom: 8, padding: 12 }}>
              <TouchableOpacity onPress={() => setViewProg(prog)}>
                <Text style={s.progName}>{prog.name}</Text>
                <Text style={s.progCount}>{prog.exercises.length}가지 운동</Text>
                <View style={s.chipRow}>
                  {groups.map(g => <Chip key={g} group={g} />)}
                </View>
              </TouchableOpacity>
            </Card>
          );
        })}
      </ScrollView>

      {/* View Program Sheet */}
      <Sheet visible={!!viewProg} onClose={() => setViewProg(null)}>
        {viewProg && (
          <>
            <Text style={s.sheetTitle}>{viewProg.name}</Text>
            {viewProg.exercises.map(eId => {
              const ex = exercises.find(e => e.id === eId);
              if (!ex) return null;
              return (
                <View key={eId} style={s.progExRow}>
                  <Text style={s.progExName}>{ex.name}</Text>
                  <Chip group={ex.group} />
                </View>
              );
            })}
            <View style={s.actionRow}>
              <BtnSecondary
                label="편집"
                style={{ flex: 1 }}
                onPress={() => {
                  setFormProg({ ...viewProg, exercises: [...viewProg.exercises] });
                  setViewProg(null);
                }}
              />
              <BtnSecondary
                label="삭제"
                style={{ flex: 1, borderColor: C.redBdr }}
                textStyle={{ color: C.red }}
                onPress={() => handleDelete(viewProg.id)}
              />
            </View>
          </>
        )}
      </Sheet>

      {/* Form Sheet */}
      <Sheet visible={!!formProg} onClose={() => setFormProg(null)}>
        {formProg && (
          <>
            <TextInput
              style={s.nameInput}
              placeholder="루틴 이름"
              placeholderTextColor={C.t3}
              value={formProg.name}
              onChangeText={t => setFormProg(f => ({ ...f, name: t }))}
            />
            <Label text={`운동 선택 (${formProg.exercises.length}개)`} style={{ marginTop: 10 }} />
            <TextInput
              style={[s.nameInput, { marginBottom: 8 }]}
              placeholder="운동 검색..."
              placeholderTextColor={C.t3}
              value={exSearch}
              onChangeText={setExSearch}
            />
            <FilterBtns current={exFilter} onChange={setExFilter} />
            <ScrollView style={{ maxHeight: 240 }}>
              {filteredEx.map(ex => {
                const sel = formProg.exercises.includes(ex.id);
                return (
                  <TouchableOpacity
                    key={ex.id}
                    onPress={() => toggleEx(ex.id)}
                    style={[s.exItem, sel && s.exItemSel]}
                  >
                    <View style={[s.checkbox, sel && s.checkboxSel]}>
                      {sel && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
                    </View>
                    <Text style={s.exItemName}>{ex.name}</Text>
                    <Chip group={ex.group} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <BtnPrimary label="저장" onPress={handleSave} style={{ marginTop: 14 }} />
          </>
        )}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 14, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pageTitle: { fontSize: 17, fontWeight: '600', color: C.t0 },
  addBtn: {
    backgroundColor: C.blue, borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 14,
  },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },

  empty: { alignItems: 'center', padding: 50 },
  emptyText: { fontSize: 13, color: C.t2 },

  progName:  { fontSize: 14, fontWeight: '500', color: C.t0, marginBottom: 5 },
  progCount: { fontSize: 11, color: C.t2, marginBottom: 6 },
  chipRow:   { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },

  sheetTitle: { fontSize: 15, fontWeight: '500', color: C.t0, marginBottom: 12 },
  progExRow:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.bg2,
  },
  progExName: { fontSize: 13, fontWeight: '500', color: C.t0 },
  actionRow:  { flexDirection: 'row', gap: 8, marginTop: 14 },

  nameInput: {
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, padding: 10, fontSize: 14, color: C.t0,
    marginBottom: 4,
  },

  exItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 8, backgroundColor: C.bg2,
    marginBottom: 3, borderWidth: 1, borderColor: 'transparent',
  },
  exItemSel: { backgroundColor: C.blueL, borderColor: C.blueMid },
  exItemName: { flex: 1, fontSize: 13, color: C.t0 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 1.5, borderColor: C.border2,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkboxSel: { backgroundColor: C.blue, borderColor: C.blue },
});
