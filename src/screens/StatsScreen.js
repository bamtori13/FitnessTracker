import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from "react-native";
import { Picker as RNPicker } from "@react-native-picker/picker";
import {
  getOverallStats,
  getGroupVolumeLast14Days,
  getExerciseSeriesByGroup,
  getVolumeByExercise,
  getAllExercises,
} from "../db/database";
import { MUSCLE_GROUPS, C } from "../utils/constants";
import { Card, Label, ProgressBar, StatBox, Loading } from "../components/UI";

const SCREEN_W = Dimensions.get("window").width;
const CHART_H = 140; // 그래프 내부 높이 (축 제외)
const AXIS_L = 44; // Y축 라벨 너비
const AXIS_B = 22; // X축 라벨 높이
const Y_STEPS = 4; // Y축 눈금 개수

const TABS = ["개요", "부위별", "종목별"];

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function fmtVol(v) {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}t`;
  return `${Math.round(v)}`;
}

// 최근 14일 날짜 배열 생성
function last14Dates() {
  const arr = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    arr.push(d.toISOString().split("T")[0]);
  }
  return arr;
}

// ─── 라인 그래프 (개요 탭) ────────────────────────────────────────────────────

function LineGraph({ dates, series, height = CHART_H }) {
  // series: [{group, color, data:[{date,vol}]}]
  if (!dates.length) return <Text style={gs.empty}>데이터 없음</Text>;

  const allVals = series.flatMap((s) => s.data.map((d) => d || 0));
  const maxVal = Math.max(1, ...allVals);
  const step = Math.ceil(maxVal / Y_STEPS);
  const yMax = step * Y_STEPS;

  const chartW = SCREEN_W - 32 - 16 - AXIS_L; // 패딩 고려
  const xStep = chartW / Math.max(dates.length - 1, 1);

  const yPos = (v) => height - (v / yMax) * height;
  const xPos = (i) => i * xStep;

  // 선 경로: SVG 없이 View 선분으로 근사 (slope segments)
  const renderLines = (data, color) => {
    const pts = dates.map((d, i) => ({
      x: xPos(i),
      y: yPos(data[i] || 0),
      v: data[i] || 0,
    }));
    return pts.slice(0, -1).map((p, i) => {
      const q = pts[i + 1];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
      return (
        <View
          key={i}
          style={{
            position: "absolute",
            left: p.x + AXIS_L,
            top: p.y,
            width: len,
            height: 2,
            backgroundColor: color,
            opacity: 0.85,
            transform: [{ rotate: `${ang}deg` }],
            transformOrigin: "left center",
          }}
        />
      );
    });
  };

  // 점
  const renderDots = (data, color) =>
    dates.map((d, i) => {
      const v = data[i] || 0;
      if (!v) return null;
      return (
        <View
          key={i}
          style={{
            position: "absolute",
            left: xPos(i) + AXIS_L - 3,
            top: yPos(v) - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: "#fff",
          }}
        />
      );
    });

  // Y축 눈금
  const yTicks = Array.from({ length: Y_STEPS + 1 }, (_, i) => i * step);

  // X축: 14일 중 짝수 인덱스만 표시
  const xLabels = dates.map((d, i) => ({
    label: i % 2 === 0 ? d.slice(5) : "",
    x: xPos(i),
  }));

  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {/* Y축 */}
        <View
          style={{
            width: AXIS_L,
            height: height,
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingRight: 4,
          }}
        >
          {[...yTicks].reverse().map((v, i) => (
            <Text key={i} style={gs.axisLabel}>
              {fmtVol(v)}
            </Text>
          ))}
        </View>

        {/* 그래프 영역 */}
        <View style={{ flex: 1, height, position: "relative" }}>
          {/* Y 가이드라인 */}
          {yTicks.map((v, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: yPos(v),
                height: 1,
                backgroundColor: i === 0 ? C.border2 : C.bg3,
              }}
            />
          ))}

          {/* 각 시리즈 */}
          {series.map((s) => (
            <React.Fragment key={s.group}>
              {renderLines(s.data, s.color)}
              {renderDots(s.data, s.color)}
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* X축 */}
      <View style={{ flexDirection: "row", marginLeft: AXIS_L }}>
        {xLabels.map((xl, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={gs.axisLabel}>{xl.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── 종목별 라인 그래프 (부위별 탭 전용) ─────────────────────────────────────
// points: [{x: n회, vol, date}]  — x는 운동한 날 순번 (1,2,3...)
// X축은 날짜가 아닌 "n회차" 숫자로 표시

function ExerciseLineChart({ points, color, isDuration, height = CHART_H }) {
  if (!points.length) return <Text style={gs.empty}>데이터 없음</Text>;

  const vals = points.map((p) => p.vol || 0);
  const maxVal = Math.max(1, ...vals);
  const step = maxVal <= Y_STEPS ? 1 : Math.ceil(maxVal / Y_STEPS);
  const yMax = step * Y_STEPS;
  const yTicks = Array.from({ length: Y_STEPS + 1 }, (_, i) => i * step);

  // 차트 너비 = 화면 - 좌우패딩(28) - 카드패딩(24) - Y축(AXIS_L)
  const chartW = SCREEN_W - 28 - 24 - AXIS_L;
  const n = points.length;
  const xStep = n > 1 ? chartW / (n - 1) : chartW / 2;

  const yPos = (v) => height - (v / yMax) * height;
  const xPos = (i) => (n === 1 ? chartW / 2 : i * xStep);

  // 선분 세그먼트
  const segs = points.slice(0, -1).map((p, i) => {
    const q = points[i + 1];
    const dx = xStep;
    const dy = yPos(q.vol) - yPos(p.vol);
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx) * (180 / Math.PI);
    return { left: xPos(i), top: yPos(p.vol), len, ang };
  });

  // X축: 포인트가 많으면 홀수만 표시
  const showLabel = (i) => n <= 5 || i % 2 === 0 || i === n - 1;

  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {/* Y축 */}
        <View
          style={{
            width: AXIS_L,
            height,
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingRight: 5,
          }}
        >
          {[...yTicks].reverse().map((v, i) => (
            <Text key={i} style={gs.axisLabel}>
              {isDuration ? `${v}분` : fmtVol(v)}
            </Text>
          ))}
        </View>

        {/* 그래프 영역 */}
        <View style={{ flex: 1, height, position: "relative" }}>
          {/* Y 가이드라인 */}
          {yTicks.map((v, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: yPos(v),
                height: 1,
                backgroundColor: i === 0 ? C.border2 : C.bg3,
              }}
            />
          ))}

          {/* 선분 */}
          {segs.map((seg, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: seg.left,
                top: seg.top,
                width: seg.len,
                height: 2.5,
                backgroundColor: color,
                opacity: 0.9,
                transform: [{ rotate: `${seg.ang}deg` }],
                transformOrigin: "left center",
              }}
            />
          ))}

          {/* 점 + 값 라벨 */}
          {points.map((p, i) => {
            const cx = xPos(i);
            const cy = yPos(p.vol);
            return (
              <React.Fragment key={i}>
                <View
                  style={{
                    position: "absolute",
                    left: cx - 4,
                    top: cy - 4,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: color,
                    borderWidth: 2,
                    borderColor: "#fff",
                    elevation: 2,
                  }}
                />
                {/* 값 라벨 (점 위에) */}
                <Text
                  style={{
                    position: "absolute",
                    left: cx - 18,
                    top: cy - 17,
                    width: 36,
                    textAlign: "center",
                    fontSize: 9,
                    color: color,
                    fontWeight: "600",
                  }}
                >
                  {isDuration ? `${Math.round(p.vol)}` : fmtVol(p.vol)}
                </Text>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* X축: n회차 */}
      <View style={{ flexDirection: "row", marginLeft: AXIS_L, marginTop: 3 }}>
        {points.map((p, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: xPos(i) - 10,
              width: 20,
              alignItems: "center",
            }}
          >
            <Text style={gs.axisLabel}>{showLabel(i) ? `${p.x}회` : ""}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── 종목별 바 차트 (종목별 탭) — 더미 시작 표시용
function _REMOVED_StackedBarChart_placeholder() {
  return null;
}
// 실제 사용되던 StackedBarChart 제거 완료
// X축 날짜 슬라이스 구버전:
/*
      {dates.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={gs.axisLabel}>{d.slice(5)}</Text>
          </View>
        ))}
      </View>

      {/* 범례 }
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginLeft: AXIS_L }}>
        {series.map((ser, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: seriesColors[i] }} />
            <Text style={{ fontSize: 10, color: C.t2 }}>{exNames[i] || ser.exId}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
*/

// ─── 종목별 바 차트 ───────────────────────────────────────────────────────────

function ExBarChart({ data, color, height = CHART_H }) {
  if (!data.length) return <Text style={gs.empty}>데이터 없음</Text>;

  const maxVal = Math.max(1, ...data.map((d) => d.vol || 0));
  const step = Math.ceil(maxVal / Y_STEPS);
  const yMax = step * Y_STEPS;
  const yTicks = Array.from({ length: Y_STEPS + 1 }, (_, i) => i * step);
  const yPos = (v) => height - (v / yMax) * height;

  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        {/* Y축 */}
        <View
          style={{
            width: AXIS_L,
            height,
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingRight: 4,
          }}
        >
          {[...yTicks].reverse().map((v, i) => (
            <Text key={i} style={gs.axisLabel}>
              {fmtVol(v)}
            </Text>
          ))}
        </View>

        {/* 바 영역 */}
        <View
          style={{
            flex: 1,
            height,
            position: "relative",
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 3,
          }}
        >
          {yTicks.map((v, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: yPos(v),
                height: 1,
                backgroundColor: i === 0 ? C.border2 : C.bg3,
              }}
            />
          ))}
          {data.map((d, i) => {
            const barH = d.vol
              ? Math.max(4, Math.round((d.vol / yMax) * height))
              : 4;
            return (
              <View key={i} style={{ flex: 1 }}>
                <View
                  style={{
                    height: barH,
                    backgroundColor: d.vol ? color : C.bg3,
                    borderRadius: 3,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* X축 */}
      <View style={{ flexDirection: "row", marginLeft: AXIS_L, gap: 3 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: "center" }}>
            <Text style={gs.axisLabel}>{d.label || ""}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const [tab, setTab] = useState(0);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);

  // 개요
  const [overview, setOverview] = useState(null);
  const [lineDates, setLineDates] = useState([]);
  const [lineSeries, setLineSeries] = useState([]);

  // 부위별
  const [selGroup, setSelGroup] = useState("chest");
  const [exSeriesData, setExSeriesData] = useState([]); // [{exId, points, exName, color}]

  // 종목별
  const [selEx, setSelEx] = useState("");
  const [exData, setExData] = useState([]);
  const [exMaxW, setExMaxW] = useState(0);

  useEffect(() => {
    getAllExercises().then(setExercises);
  }, []);

  // 개요 로드
  useEffect(() => {
    if (tab !== 0) return;
    setLoading(true);
    Promise.all([getOverallStats(), getGroupVolumeLast14Days()]).then(
      ([ov, rows]) => {
        setOverview(ov);

        // 라인 시리즈 구성: 14일 날짜 × 각 부위
        const dates = last14Dates();
        setLineDates(dates);

        const series = Object.entries(MUSCLE_GROUPS)
          .map(([grp, gv]) => {
            const data = dates.map((d) => {
              const row = rows.find((r) => r.date === d && r.grp === grp);
              return row?.vol || 0;
            });
            const hasData = data.some((v) => v > 0);
            return hasData ? { group: grp, color: gv.color, data } : null;
          })
          .filter(Boolean);

        setLineSeries(series);
        setLoading(false);
      },
    );
  }, [tab]);

  // 부위별 종목 라인 로드
  useEffect(() => {
    if (tab !== 1 || !exercises.length) return;
    setLoading(true);
    const ids = exercises.filter((e) => e.group === selGroup).map((e) => e.id);
    const gv = MUSCLE_GROUPS[selGroup];
    getExerciseSeriesByGroup(selGroup, ids, 10).then((series) => {
      // 각 시리즈에 이름과 색 부여 (명도 변형)
      const result = series.map((s, i) => {
        const ex = exercises.find((e) => e.id === s.exId);
        const alpha = Math.round(
          180 + 70 * (i / Math.max(series.length - 1, 1)),
        );
        return { ...s, exName: ex?.name || s.exId, color: gv.color };
      });
      setExSeriesData(result);
      setLoading(false);
    });
  }, [tab, selGroup, exercises]);

  // 종목별 로드
  useEffect(() => {
    if (tab !== 2 || !selEx) return;
    setLoading(true);
    getVolumeByExercise(selEx, 10).then((rows) => {
      setExMaxW(Math.max(0, ...rows.map((r) => r.maxW || 0)));
      setExData(
        rows.map((r) => ({
          vol: r.vol || 0,
          label: r.date?.slice(5) || "",
          maxW: r.maxW || 0,
          date: r.date,
        })),
      );
      setLoading(false);
    });
  }, [tab, selEx]);

  const maxGroupC = overview
    ? Math.max(1, ...Object.values(overview.groupCounts))
    : 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 탭 바 */}
      <View style={gs.tabBar}>
        {TABS.map((t, i) => (
          <TouchableOpacity
            key={i}
            style={[gs.tabBtn, tab === i && gs.tabBtnOn]}
            onPress={() => setTab(i)}
          >
            <Text style={[gs.tabText, tab === i && gs.tabTextOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={gs.page}>
        {/* ── 개요 ─────────────────────────────────────── */}
        {tab === 0 &&
          (loading || !overview ? (
            <Loading />
          ) : (
            <>
              <View style={gs.statGrid}>
                <StatBox
                  label="총 운동일"
                  value={overview.totalDays}
                  unit="일"
                  color={C.blue}
                  style={{ flex: 1 }}
                />
                <StatBox
                  label="최근 30일"
                  value={overview.last30}
                  unit="회"
                  style={{ flex: 1 }}
                />
              </View>
              <View style={[gs.inlineBox, { marginTop: 8, marginBottom: 14 }]}>
                <Text style={gs.inlineLabel}>누적 볼륨</Text>
                <Text style={gs.inlineValue}>
                  {(overview.totalVol / 1000).toFixed(1)}
                  <Text style={gs.inlineUnit}> 톤</Text>
                </Text>
              </View>

              {/* 부위별 횟수 */}
              <Card style={{ padding: 12, marginBottom: 14 }}>
                <Label text="부위별 운동 횟수" />
                {Object.entries(MUSCLE_GROUPS).map(([g, gv]) => {
                  const cnt = overview.groupCounts[g] || 0;
                  if (!cnt) return null;
                  return (
                    <View key={g} style={{ marginBottom: 8 }}>
                      <View style={gs.barLabelRow}>
                        <Text style={gs.barLabelText}>{gv.label}</Text>
                        <Text style={gs.barLabelCount}>{cnt}회</Text>
                      </View>
                      <ProgressBar value={cnt / maxGroupC} color={gv.color} />
                    </View>
                  );
                })}
                {Object.values(overview.groupCounts).every((v) => v === 0) && (
                  <Text style={gs.empty}>운동 기록이 없습니다</Text>
                )}
              </Card>

              {/* 최근 2주 부위별 라인 그래프 */}
              <Card style={{ padding: 12 }}>
                <Label text="최근 2주 부위별 볼륨 추이" />
                {lineSeries.length === 0 ? (
                  <Text style={gs.empty}>데이터 없음</Text>
                ) : (
                  <>
                    <LineGraph dates={lineDates} series={lineSeries} />
                    {/* 범례 */}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 10,
                        marginLeft: AXIS_L,
                      }}
                    >
                      {lineSeries.map((s) => (
                        <View
                          key={s.group}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <View
                            style={{
                              width: 18,
                              height: 3,
                              borderRadius: 2,
                              backgroundColor: s.color,
                            }}
                          />
                          <Text style={{ fontSize: 10, color: C.t2 }}>
                            {MUSCLE_GROUPS[s.group]?.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </Card>
            </>
          ))}

        {/* ── 부위별: 종목별 개별 라인그래프, X축 = 운동 회차 ── */}
        {tab === 1 && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              <View style={{ flexDirection: "row", gap: 5 }}>
                {Object.entries(MUSCLE_GROUPS).map(([k, v]) => (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setSelGroup(k)}
                    style={[
                      gs.groupBtn,
                      selGroup === k && {
                        backgroundColor: v.bg,
                        borderColor: v.color,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        gs.groupBtnText,
                        selGroup === k && { color: v.color },
                      ]}
                    >
                      {v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {loading ? (
              <Loading />
            ) : exSeriesData.length === 0 ? (
              <Card style={{ padding: 20 }}>
                <Text style={gs.empty}>데이터 없음</Text>
              </Card>
            ) : (
              exSeriesData.map((ser, si) => {
                const pts = ser.points; // [{x(회차), vol, date}]
                const n = pts.length;
                if (!n) return null;

                // Y축 눈금 — 깔끔한 숫자로
                const maxVal = Math.max(1, ...pts.map((p) => p.vol || 0));
                const mag = Math.pow(
                  10,
                  Math.floor(Math.log10(maxVal / Y_STEPS || 1)),
                );
                const step = Math.ceil(maxVal / Y_STEPS / mag) * mag || 1;
                const yMax = step * Y_STEPS;
                const yTicks = Array.from(
                  { length: Y_STEPS + 1 },
                  (_, i) => i * step,
                );
                const yPos = (v) => CHART_H - (v / yMax) * CHART_H;

                // X 좌표 — 회차(1,2,3...) 기준 균등 배치
                const chartW = SCREEN_W - 32 - 16 - AXIS_L - 8;
                const xPos = (i) =>
                  n > 1 ? (i / (n - 1)) * chartW : chartW / 2;

                // 선분 세그먼트
                const segs = pts.slice(0, -1).map((p, i) => {
                  const q = pts[i + 1];
                  const dx = xPos(i + 1) - xPos(i);
                  const dy = yPos(q.vol) - yPos(p.vol);
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
                  return { lx: xPos(i), ty: yPos(p.vol), len, ang };
                });

                const gColor = MUSCLE_GROUPS[selGroup]?.color || C.blue;
                const opacity =
                  0.55 + 0.45 * (si / Math.max(exSeriesData.length - 1, 1));
                const isDur =
                  exercises.find((e) => e.id === ser.exId)?.inputType ===
                  "duration";
                const yUnit = isDur ? "분" : "kg";

                return (
                  <Card
                    key={ser.exId}
                    style={{ padding: 12, marginBottom: 10 }}
                  >
                    {/* 헤더 */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: C.t0,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {ser.exName}
                      </Text>
                      <View
                        style={[
                          gs.sessionBadge,
                          { backgroundColor: MUSCLE_GROUPS[selGroup]?.bg },
                        ]}
                      >
                        <Text style={[gs.sessionBadgeText, { color: gColor }]}>
                          최근 {n}회
                        </Text>
                      </View>
                    </View>

                    {/* 그래프 */}
                    <View style={{ flexDirection: "row" }}>
                      {/* Y축 */}
                      <View
                        style={{
                          width: AXIS_L,
                          height: CHART_H,
                          justifyContent: "space-between",
                          alignItems: "flex-end",
                          paddingRight: 5,
                        }}
                      >
                        {[...yTicks].reverse().map((v, i) => (
                          <Text key={i} style={gs.axisLabel}>
                            {fmtVol(v)}
                          </Text>
                        ))}
                      </View>
                      {/* 플롯 */}
                      <View
                        style={{
                          flex: 1,
                          height: CHART_H,
                          position: "relative",
                        }}
                      >
                        {yTicks.map((v, i) => (
                          <View
                            key={i}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              top: yPos(v),
                              height: 1,
                              backgroundColor: i === 0 ? C.border2 : C.bg3,
                            }}
                          />
                        ))}
                        {segs.map((seg, i) => (
                          <View
                            key={i}
                            style={{
                              position: "absolute",
                              left: seg.lx,
                              top: seg.ty,
                              width: seg.len,
                              height: 2.5,
                              backgroundColor: gColor,
                              opacity,
                              transform: [{ rotate: `${seg.ang}deg` }],
                              transformOrigin: "left center",
                            }}
                          />
                        ))}
                        {pts.map(
                          (p, i) =>
                            p.vol > 0 && (
                              <View
                                key={i}
                                style={{
                                  position: "absolute",
                                  left: xPos(i) - 4,
                                  top: yPos(p.vol) - 4,
                                  width: 9,
                                  height: 9,
                                  borderRadius: 5,
                                  backgroundColor: gColor,
                                  opacity,
                                  borderWidth: 2,
                                  borderColor: "#fff",
                                }}
                              />
                            ),
                        )}
                      </View>
                    </View>

                    {/* X축: 회차 번호 */}
                    <View
                      style={{
                        flexDirection: "row",
                        marginLeft: AXIS_L,
                        marginTop: 3,
                      }}
                    >
                      {pts.map((_, i) => (
                        <View
                          key={i}
                          style={{
                            flex: n > 1 ? 1 : 0,
                            width: n === 1 ? chartW : undefined,
                            alignItems: "center",
                          }}
                        >
                          <Text style={gs.axisLabel}>{i + 1}회</Text>
                        </View>
                      ))}
                    </View>

                    {/* 트렌드 요약 */}
                    {n >= 2 &&
                      (() => {
                        const vols = pts.map((p) => p.vol);
                        const maxV = Math.max(...vols);
                        const diff = vols[n - 1] - vols[0];
                        const trend = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
                        const tc =
                          diff > 0 ? "#27a06e" : diff < 0 ? "#e05c5c" : C.t2;
                        return (
                          <View style={gs.seriesSummary}>
                            <Text style={gs.seriesSumText}>
                              최고 {fmtVol(maxV)}
                              {yUnit}
                            </Text>
                            <Text
                              style={[
                                gs.seriesSumText,
                                { color: tc, fontWeight: "600" },
                              ]}
                            >
                              {trend} {Math.abs(diff).toFixed(0)}
                              {yUnit}
                            </Text>
                            <Text style={gs.seriesSumText}>
                              마지막 {fmtVol(vols[n - 1])}
                              {yUnit}
                            </Text>
                          </View>
                        );
                      })()}
                  </Card>
                );
              })
            )}
          </>
        )}

        {/* ── 종목별 ───────────────────────────────────── */}
        {tab === 2 && (
          <>
            <View style={gs.pickerWrap}>
              <RNPicker
                selectedValue={selEx}
                onValueChange={(v) => {
                  setSelEx(v);
                  setExData([]);
                  setExMaxW(0);
                }}
                style={gs.picker}
              >
                <RNPicker.Item label="종목 선택..." value="" color={C.t2} />
                {Object.entries(MUSCLE_GROUPS).map(([gk, gv]) =>
                  exercises
                    .filter((e) => e.group === gk)
                    .map((ex) => (
                      <RNPicker.Item
                        key={ex.id}
                        label={`[${gv.label}] ${ex.name}`}
                        value={ex.id}
                        color={C.t0}
                      />
                    )),
                )}
              </RNPicker>
            </View>

            {selEx &&
              (loading ? (
                <Loading />
              ) : (
                <>
                  <View style={gs.statGrid}>
                    <StatBox
                      label="최대 중량"
                      value={`${exMaxW}kg`}
                      style={{ flex: 1 }}
                    />
                    <StatBox
                      label="총 세션"
                      value={`${exData.length}회`}
                      style={{ flex: 1 }}
                    />
                  </View>

                  <Card style={{ padding: 12, marginTop: 10 }}>
                    <Label text="볼륨 추이 (최근 10회)" />
                    {exData.length === 0 ? (
                      <Text style={gs.empty}>데이터 없음</Text>
                    ) : (
                      <ExBarChart
                        data={exData}
                        color={
                          MUSCLE_GROUPS[
                            exercises.find((e) => e.id === selEx)?.group
                          ]?.color || C.blue
                        }
                      />
                    )}
                  </Card>

                  <Card style={{ padding: 12, marginTop: 10 }}>
                    <Label text="최근 기록" />
                    {/* 헤더 */}
                    <View style={gs.histHeader}>
                      <Text style={[gs.histCell, { flex: 1.2, color: C.t2 }]}>
                        날짜
                      </Text>
                      <Text style={[gs.histCell, { color: C.t2 }]}>
                        최대 중량
                      </Text>
                      <Text style={[gs.histCell, { color: C.t2 }]}>
                        총 볼륨
                      </Text>
                    </View>
                    {exData
                      .slice()
                      .reverse()
                      .map((d, i) => (
                        <View key={i} style={gs.histRow}>
                          <Text
                            style={[gs.histCell, { flex: 1.2, color: C.t2 }]}
                          >
                            {d.date}
                          </Text>
                          <Text style={[gs.histCell, { fontWeight: "500" }]}>
                            {d.maxW}kg
                          </Text>
                          <Text style={[gs.histCell, { color: C.t1 }]}>
                            {fmtVol(d.vol)}kg
                          </Text>
                        </View>
                      ))}
                  </Card>
                </>
              ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const gs = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    gap: 5,
    padding: 12,
    backgroundColor: C.bg1,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg1,
    alignItems: "center",
  },
  tabBtnOn: { backgroundColor: C.blueL, borderColor: C.blue },
  tabText: { fontSize: 12, fontWeight: "500", color: C.t1 },
  tabTextOn: { color: C.blue },

  page: { padding: 14, paddingBottom: 40 },
  statGrid: { flexDirection: "row", gap: 8 },

  inlineBox: {
    backgroundColor: C.bg2,
    borderRadius: 8,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inlineLabel: { fontSize: 11, color: C.t2 },
  inlineValue: { fontSize: 20, fontWeight: "600", color: C.t0 },
  inlineUnit: { fontSize: 12, fontWeight: "400", color: C.t2 },

  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  barLabelText: { fontSize: 12, color: C.t0 },
  barLabelCount: { fontSize: 11, color: C.t2 },

  axisLabel: { fontSize: 9, color: C.t2, textAlign: "center" },

  groupBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg1,
  },
  groupBtnText: { fontSize: 11, color: C.t1 },

  pickerWrap: {
    backgroundColor: C.bg1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  picker: { color: C.t0 },

  histHeader: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.bg3,
  },
  histRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.bg2,
  },
  histCell: { flex: 1, fontSize: 12, color: C.t0, textAlign: "center" },

  empty: { color: C.t2, fontSize: 12, textAlign: "center", padding: 20 },

  sessionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  sessionBadgeText: { fontSize: 11, fontWeight: "600" },

  seriesSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.bg2,
  },
  seriesSumText: { fontSize: 11, color: C.t2 },
});
