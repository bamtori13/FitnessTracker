import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { MUSCLE_GROUPS, C } from '../utils/constants';

// ─── CHIP ─────────────────────────────────────────────────────────────────────

export function Chip({ group }) {
  const g = MUSCLE_GROUPS[group];
  if (!g) return null;
  return (
    <View style={[s.chip, { backgroundColor: g.bg, borderColor: g.color + '44' }]}>
      <Text style={[s.chipText, { color: g.color }]}>{g.label}</Text>
    </View>
  );
}

// ─── BOTTOM SHEET MODAL ───────────────────────────────────────────────────────

export function Sheet({ visible, onClose, children }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <View style={s.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── BUTTON ───────────────────────────────────────────────────────────────────

export function BtnPrimary({ label, onPress, style, disabled }) {
  return (
    <TouchableOpacity
      style={[s.btnP, style, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={s.btnPText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function BtnSecondary({ label, onPress, style, textStyle }) {
  return (
    <TouchableOpacity style={[s.btnS, style]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[s.btnSText, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── CARD ─────────────────────────────────────────────────────────────────────

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

// ─── SECTION LABEL ────────────────────────────────────────────────────────────

export function Label({ text, style }) {
  return <Text style={[s.label, style]}>{text}</Text>;
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, color }) {
  return (
    <View style={s.pbTrack}>
      <View style={[s.pbFill, { width: `${Math.min(100, Math.round(value * 100))}%`, backgroundColor: color || C.blue }]} />
    </View>
  );
}

// ─── FILTER BUTTONS ───────────────────────────────────────────────────────────

export function FilterBtns({ current, onChange }) {
  const items = [['all', '전체'], ...Object.entries(MUSCLE_GROUPS).map(([k, v]) => [k, v.label])];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', gap: 5, paddingRight: 8 }}>
        {items.map(([k, l]) => (
          <TouchableOpacity
            key={k}
            onPress={() => onChange(k)}
            style={[
              s.filterBtn,
              current === k && { backgroundColor: C.blueL, borderColor: C.blue },
            ]}
          >
            <Text style={[s.filterBtnText, current === k && { color: C.blue }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── LOADING ──────────────────────────────────────────────────────────────────

export function Loading() {
  return (
    <View style={s.loading}>
      <ActivityIndicator size="large" color={C.blue} />
    </View>
  );
}

// ─── STAT BOX ─────────────────────────────────────────────────────────────────

export function StatBox({ label, value, unit, color, style }) {
  return (
    <View style={[s.statBox, style]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, color && { color }]}>{value}</Text>
      {unit && <Text style={s.statUnit}>{unit}</Text>}
    </View>
  );
}

// ─── MINI BAR CHART ───────────────────────────────────────────────────────────

export function BarChart({ data, color, height = 60 }) {
  const max = Math.max(1, ...data.map(d => d.val || 0));
  return (
    <View>
      <View style={[s.barWrap, { height }]}>
        {data.map((d, i) => (
          <View
            key={i}
            style={[
              s.bar,
              {
                height: d.val ? Math.max(4, Math.round((d.val / max) * (height - 4))) : 4,
                backgroundColor: d.val ? (color || C.blue) : C.bg3,
              },
            ]}
          />
        ))}
      </View>
      <View style={s.barLabels}>
        {data.map((d, i) => (
          <Text key={i} style={s.barLabel}>{d.label || ''}</Text>
        ))}
      </View>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  chip: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 20, borderWidth: 1,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 11, fontWeight: '500' },

  overlay: {
    flex: 1, backgroundColor: 'rgba(20,24,35,0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg1,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 34,
    maxHeight: '85%',
    borderTopWidth: 1, borderTopColor: C.border,
  },
  handle: {
    width: 32, height: 3, backgroundColor: C.border2,
    borderRadius: 2, alignSelf: 'center', marginBottom: 14,
  },

  btnP: {
    backgroundColor: C.blue, borderRadius: 8,
    paddingVertical: 11, paddingHorizontal: 18,
    alignItems: 'center',
  },
  btnPText: { color: '#fff', fontSize: 14, fontWeight: '500' },

  btnS: {
    backgroundColor: C.bg2, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center',
  },
  btnSText: { color: C.t1, fontSize: 13 },

  card: {
    backgroundColor: C.bg1, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    overflow: 'hidden',
  },

  label: {
    fontSize: 10, fontWeight: '500', color: C.t2,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5,
  },

  pbTrack: { height: 2, backgroundColor: C.bg3, borderRadius: 1, overflow: 'hidden' },
  pbFill:  { height: 2, borderRadius: 1 },

  filterBtn: {
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.bg1,
  },
  filterBtnText: { fontSize: 11, color: C.t1 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  statBox: {
    backgroundColor: C.bg2, borderRadius: 8,
    padding: 12, flex: 1,
  },
  statLabel: { fontSize: 10, color: C.t2, marginBottom: 3 },
  statValue: { fontSize: 22, fontWeight: '600', color: C.t0 },
  statUnit:  { fontSize: 11, color: C.t2, marginTop: 1 },

  barWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar:     { flex: 1, borderRadius: 3, minWidth: 8 },
  barLabels: { flexDirection: 'row', marginTop: 4 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 9, color: C.t2 },
});
