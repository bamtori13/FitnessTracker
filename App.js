import React, { useEffect, useState, createContext, useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  SafeAreaView, StatusBar, Platform,
} from 'react-native';
import { getDB } from './src/db/database';
import { C, todayStr } from './src/utils/constants';
import WorkoutScreen  from './src/screens/WorkoutScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import ProgramsScreen from './src/screens/ProgramsScreen';
import StatsScreen    from './src/screens/StatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { Loading } from './src/components/UI';

// ─── 앱 전역 Context ─────────────────────────────────────────────────────────
// 달력 → 오늘탭 날짜 전달 / 탭 이동에 사용
export const AppContext = createContext({
  tab: 'workout',
  setTab: () => {},
  sharedDate: null,
  setSharedDate: () => {},
});

export function useApp() { return useContext(AppContext); }

// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'workout',  label: '오늘',  icon: '○' },
  { id: 'calendar', label: '달력',  icon: '□' },
  { id: 'programs', label: '루틴',  icon: '≡' },
  { id: 'stats',    label: '통계',  icon: '▦' },
  { id: 'settings', label: '설정',  icon: '◎' },
];

export default function App() {
  const [tab,         setTab]         = useState('workout');
  const [sharedDate,  setSharedDate]  = useState(null); // 달력에서 선택한 날짜
  const [ready,       setReady]       = useState(false);

  useEffect(() => {
    getDB()
      .then(() => setReady(true))
      .catch(e => { console.error('DB init error:', e); setReady(true); });
  }, []);

  if (!ready) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <Loading />
      </SafeAreaView>
    );
  }

  const renderScreen = () => {
    switch (tab) {
      case 'workout':  return <WorkoutScreen />;
      case 'calendar': return <CalendarScreen />;
      case 'programs': return <ProgramsScreen />;
      case 'stats':    return <StatsScreen />;
      case 'settings': return <SettingsScreen />;
      default:         return <WorkoutScreen />;
    }
  };

  return (
    <AppContext.Provider value={{ tab, setTab, sharedDate, setSharedDate }}>
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg1} />

        {/* Screen */}
        <View style={{ flex: 1 }}>
          {renderScreen()}
        </View>

        {/* Bottom Tab Bar */}
        <View style={s.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.id}
              style={s.tabBtn}
              onPress={() => setTab(t.id)}
              activeOpacity={0.7}
            >
              <Text style={[s.tabIcon, tab === t.id && s.tabIconOn]}>{t.icon}</Text>
              <Text style={[s.tabLabel, tab === t.id && s.tabLabelOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </AppContext.Provider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.bg1,
    borderTopWidth: 1, borderTopColor: C.border,
    paddingBottom: Platform.OS === 'ios' ? 20 : 6,
    paddingTop: 6,
  },
  tabBtn:    { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon:   { fontSize: 17, color: C.t3, lineHeight: 20 },
  tabIconOn: { color: C.blue },
  tabLabel:  { fontSize: 10, fontWeight: '500', color: C.t2 },
  tabLabelOn:{ color: C.blue },
});
