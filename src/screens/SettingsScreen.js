import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, Alert, Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  getAllExercises, addExercise, updateExercise, deleteExercise,
  exportAllData, importAllData,
} from '../db/database';
import { MUSCLE_GROUPS, C, genId } from '../utils/constants';
import { Chip, Sheet, BtnPrimary, BtnSecondary, Card, Label, FilterBtns, Loading, StatBox } from '../components/UI';

const EQUIPMENT_OPTIONS = ['바벨', '덤벨', '케이블', '머신', '맨몸', '기구', '기타'];

export default function SettingsScreen() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [msg, setMsg]             = useState('');

  const [filter,   setFilter]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [formEx,   setFormEx]   = useState(null); // null | {id?,name,group,eq}
  const [showGrp,  setShowGrp]  = useState(false);
  const [showEq,   setShowEq]   = useState(false);

  useEffect(() => {
    getAllExercises().then(list => {
      setExercises(list);
      setLoading(false);
    });
  }, []);

  const showMsg = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  const reload = async () => {
    const list = await getAllExercises();
    setExercises(list);
  };

  const handleSaveEx = async () => {
    if (!formEx?.name?.trim()) {
      Alert.alert('알림', '운동 이름을 입력해주세요');
      return;
    }
    const ex = { id: formEx.id || genId(), name: formEx.name.trim(), group: formEx.group, eq: formEx.eq, inputType: formEx.inputType || 'weight_reps' };
    if (formEx.id) {
      await updateExercise(ex);
    } else {
      await addExercise(ex);
    }
    await reload();
    setFormEx(null);
  };

  const handleDeleteEx = (id, name) => {
    Alert.alert('운동 삭제', `"${name}"을 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          await deleteExercise(id);
          await reload();
        },
      },
    ]);
  };

  // ─── BACKUP ──────────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const data  = await exportAllData();
      const json  = JSON.stringify(data, null, 2);
      const ts    = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const path  = FileSystem.documentDirectory + `fitness_backup_${ts}.json`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: '백업 파일 저장' });
        showMsg('백업 파일을 공유했습니다.');
      } else {
        showMsg(`파일 저장 완료: ${path}`);
      }
    } catch (e) {
      Alert.alert('오류', '백업 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const json = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const data = JSON.parse(json);
      Alert.alert(
        '데이터 복원',
        '현재 데이터가 모두 교체됩니다. 계속하시겠습니까?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '복원',
            onPress: async () => {
              await importAllData(data);
              await reload();
              showMsg('복원 완료!');
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('오류', '복원 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const filteredEx = exercises.filter(e =>
    (filter === 'all' || e.group === filter) && e.name.includes(search)
  );

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">

        {msg !== '' && (
          <View style={s.msgBanner}>
            <Text style={s.msgText}>{msg}</Text>
          </View>
        )}

        {/* Stats */}
        <View style={s.statRow}>
          <StatBox label="운동 종목" value={exercises.length} style={{ flex: 1 }} />
        </View>

        {/* Backup */}
        <Card style={{ padding: 12, marginBottom: 10 }}>
          <Text style={s.sectionTitle}>백업 내보내기</Text>
          <Text style={s.sectionDesc}>JSON 파일로 저장합니다. Google Drive에 업로드하면 다른 기기에서 복원 가능합니다.</Text>
          <BtnPrimary label="백업 파일 내보내기" onPress={handleExport} />
        </Card>

        <Card style={{ padding: 12, marginBottom: 10 }}>
          <Text style={s.sectionTitle}>백업 복원</Text>
          <Text style={s.sectionDesc}>이전에 내보낸 JSON 파일을 불러옵니다.</Text>
          <BtnSecondary label="파일 선택하여 복원" onPress={handleImport} />
        </Card>

        {/* Exercise List */}
        <View style={s.exHeader}>
          <Text style={s.sectionTitle} style={{ marginBottom: 0 }}>운동 목록</Text>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setFormEx({ name: '', group: 'chest', eq: '바벨', inputType: 'weight_reps' })}
          >
            <Text style={s.addBtnText}>+ 추가</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={s.searchInput}
          placeholder="운동 검색..."
          placeholderTextColor={C.t3}
          value={search}
          onChangeText={setSearch}
        />
        <FilterBtns current={filter} onChange={setFilter} />

        <Card>
          {filteredEx.length === 0 && (
            <Text style={[s.emptyText, { padding: 20 }]}>운동이 없습니다</Text>
          )}
          {filteredEx.map((ex, i) => (
            <View
              key={ex.id}
              style={[s.exRow, i === filteredEx.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.exName}>{ex.name}</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, alignItems: 'center' }}>
                  <Chip group={ex.group} />
                  <Text style={s.exEq}>{ex.eq}</Text>
                  {ex.inputType === 'duration' && (
                    <Text style={[s.exEq, { color: '#2e7d6b', fontWeight: '500' }]}>시간</Text>
                  )}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity
                  style={s.editBtn}
                  onPress={() => setFormEx({ ...ex, inputType: ex.inputType || 'weight_reps' })}
                >
                  <Text style={s.editBtnText}>편집</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.editBtn, { borderColor: C.redBdr }]}
                  onPress={() => handleDeleteEx(ex.id, ex.name)}
                >
                  <Text style={[s.editBtnText, { color: C.red }]}>삭제</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      {/* Exercise Form Sheet */}
      <Sheet visible={!!formEx} onClose={() => setFormEx(null)}>
        {formEx && (
          <>
            <Text style={s.sheetTitle}>{formEx.id ? '운동 편집' : '운동 추가'}</Text>
            <Label text="운동 이름" />
            <TextInput
              style={s.nameInput}
              placeholder="운동 이름"
              placeholderTextColor={C.t3}
              value={formEx.name}
              onChangeText={t => setFormEx(f => ({ ...f, name: t }))}
            />

            <Label text="부위" style={{ marginTop: 12 }} />
            <TouchableOpacity style={s.selectBtn} onPress={() => setShowGrp(true)}>
              <Text style={s.selectBtnText}>
                {MUSCLE_GROUPS[formEx.group]?.label || '선택...'}
              </Text>
              <Text style={{ color: C.t2 }}>›</Text>
            </TouchableOpacity>

            <Label text="장비" style={{ marginTop: 12 }} />
            <TouchableOpacity style={s.selectBtn} onPress={() => setShowEq(true)}>
              <Text style={s.selectBtnText}>{formEx.eq || '선택...'}</Text>
              <Text style={{ color: C.t2 }}>›</Text>
            </TouchableOpacity>

            <Label text="입력 방식" style={{ marginTop: 12 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              {[['weight_reps', '중량 × 횟수'], ['duration', '시간 (분)']].map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setFormEx(f => ({ ...f, inputType: val }))}
                  style={{
                    flex: 1, padding: 10, borderRadius: 8, alignItems: 'center',
                    borderWidth: 1.5,
                    borderColor: formEx?.inputType === val ? C.blue : C.border,
                    backgroundColor: formEx?.inputType === val ? C.blueL : C.bg2,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '500', color: formEx?.inputType === val ? C.blue : C.t1 }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <BtnPrimary label="저장" onPress={handleSaveEx} style={{ marginTop: 18 }} />
          </>
        )}
      </Sheet>

      {/* Group picker */}
      <Sheet visible={showGrp} onClose={() => setShowGrp(false)}>
        <Text style={s.sheetTitle}>부위 선택</Text>
        {Object.entries(MUSCLE_GROUPS).map(([k, v]) => (
          <TouchableOpacity
            key={k}
            style={[s.optionRow, formEx?.group === k && { backgroundColor: C.blueL }]}
            onPress={() => { setFormEx(f => ({ ...f, group: k })); setShowGrp(false); }}
          >
            <Text style={[s.optionText, formEx?.group === k && { color: C.blue, fontWeight: '500' }]}>
              {v.label}
            </Text>
            {formEx?.group === k && <Text style={{ color: C.blue }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </Sheet>

      {/* Equipment picker */}
      <Sheet visible={showEq} onClose={() => setShowEq(false)}>
        <Text style={s.sheetTitle}>장비 선택</Text>
        {EQUIPMENT_OPTIONS.map(eq => (
          <TouchableOpacity
            key={eq}
            style={[s.optionRow, formEx?.eq === eq && { backgroundColor: C.blueL }]}
            onPress={() => { setFormEx(f => ({ ...f, eq })); setShowEq(false); }}
          >
            <Text style={[s.optionText, formEx?.eq === eq && { color: C.blue, fontWeight: '500' }]}>
              {eq}
            </Text>
            {formEx?.eq === eq && <Text style={{ color: C.blue }}>✓</Text>}
          </TouchableOpacity>
        ))}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  page:   { padding: 14, paddingBottom: 40 },
  statRow:{ flexDirection: 'row', gap: 8, marginBottom: 12 },

  msgBanner: {
    backgroundColor: C.blueL, borderWidth: 1, borderColor: C.blueMid,
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  msgText: { fontSize: 13, color: '#1a4d9e' },

  sectionTitle: { fontSize: 13, fontWeight: '500', color: C.t0, marginBottom: 4 },
  sectionDesc:  { fontSize: 11, color: C.t2, marginBottom: 12, lineHeight: 16 },

  exHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  addBtn: { backgroundColor: C.blue, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '500' },

  searchInput: {
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, padding: 9, fontSize: 13, color: C.t0, marginBottom: 10,
  },

  exRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: 1, borderBottomColor: C.bg2,
  },
  exName: { fontSize: 14, fontWeight: '500', color: C.t0 },
  exEq:   { fontSize: 11, color: C.t2 },
  editBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 7, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.bg2,
  },
  editBtnText: { fontSize: 12, color: C.t1 },

  sheetTitle: { fontSize: 15, fontWeight: '500', color: C.t0, marginBottom: 14 },
  nameInput: {
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, padding: 10, fontSize: 14, color: C.t0, marginBottom: 4,
  },
  selectBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, padding: 11,
  },
  selectBtnText: { fontSize: 14, color: C.t0 },

  optionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 13, borderRadius: 8, marginBottom: 3,
  },
  optionText: { fontSize: 14, color: C.t0 },

  emptyText: { color: C.t2, fontSize: 13, textAlign: 'center' },
});
