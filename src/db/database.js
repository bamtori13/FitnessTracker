import * as SQLite from 'expo-sqlite';

let db = null;

export async function getDB() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('fitness.db');
  await initSchema(db);
  return db;
}

async function initSchema(db) {
  // 기존 컬럼이 없을 때만 추가 (ALTER TABLE은 에러 무시)
  await db.execAsync(`PRAGMA journal_mode = WAL;`);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grp TEXT NOT NULL,
      equipment TEXT NOT NULL,
      input_type TEXT NOT NULL DEFAULT 'weight_reps'
    );
    CREATE TABLE IF NOT EXISTS programs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      exercise_ids TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      notes TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS log_exercises (
      id TEXT PRIMARY KEY,
      log_date TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      cardio_distance_m REAL DEFAULT 0,
      cardio_speed_kmh REAL DEFAULT 0,
      cardio_calories INTEGER DEFAULT 0,
      FOREIGN KEY (log_date) REFERENCES workout_logs(date)
    );
    CREATE TABLE IF NOT EXISTS sets (
      id TEXT PRIMARY KEY,
      log_exercise_id TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      weight REAL DEFAULT 0,
      reps INTEGER DEFAULT 0,
      duration_sec INTEGER DEFAULT 0,
      done INTEGER DEFAULT 0,
      FOREIGN KEY (log_exercise_id) REFERENCES log_exercises(id)
    );
  `);

  // ALTER TABLE — 이미 있으면 에러 무시
  try { await db.execAsync(`ALTER TABLE exercises ADD COLUMN input_type TEXT DEFAULT 'weight_reps';`); } catch {}
  try { await db.execAsync(`ALTER TABLE sets ADD COLUMN duration_sec INTEGER DEFAULT 0;`); } catch {}
  try { await db.execAsync(`ALTER TABLE log_exercises ADD COLUMN cardio_distance_m REAL DEFAULT 0;`); } catch {}
  try { await db.execAsync(`ALTER TABLE log_exercises ADD COLUMN cardio_speed_kmh REAL DEFAULT 0;`); } catch {}
  try { await db.execAsync(`ALTER TABLE log_exercises ADD COLUMN cardio_calories INTEGER DEFAULT 0;`); } catch {}

  const count = await db.getFirstAsync('SELECT COUNT(*) as c FROM exercises');
  if (count.c === 0) await seedExercises(db);
}

async function seedExercises(db) {
  const defaults = [
    { id:'e001', name:'벤치프레스',            grp:'chest',     eq:'바벨',   t:'weight_reps' },
    { id:'e002', name:'덤벨 플라이',           grp:'chest',     eq:'덤벨',   t:'weight_reps' },
    { id:'e003', name:'인클라인 벤치프레스',   grp:'chest',     eq:'바벨',   t:'weight_reps' },
    { id:'e004', name:'푸시업',                grp:'chest',     eq:'맨몸',   t:'weight_reps' },
    { id:'e010', name:'데드리프트',            grp:'back',      eq:'바벨',   t:'weight_reps' },
    { id:'e011', name:'바벨 로우',             grp:'back',      eq:'바벨',   t:'weight_reps' },
    { id:'e012', name:'풀업',                 grp:'back',      eq:'맨몸',   t:'weight_reps' },
    { id:'e013', name:'랫 풀다운',             grp:'back',      eq:'케이블', t:'weight_reps' },
    { id:'e014', name:'케이블 로우',           grp:'back',      eq:'케이블', t:'weight_reps' },
    { id:'e020', name:'오버헤드프레스',        grp:'shoulders', eq:'바벨',   t:'weight_reps' },
    { id:'e021', name:'덤벨 숄더프레스',      grp:'shoulders', eq:'덤벨',   t:'weight_reps' },
    { id:'e022', name:'사이드 레터럴 레이즈',  grp:'shoulders', eq:'덤벨',   t:'weight_reps' },
    { id:'e023', name:'프론트 레이즈',         grp:'shoulders', eq:'덤벨',   t:'weight_reps' },
    { id:'e030', name:'바벨 컬',              grp:'arms',      eq:'바벨',   t:'weight_reps' },
    { id:'e031', name:'덤벨 컬',              grp:'arms',      eq:'덤벨',   t:'weight_reps' },
    { id:'e032', name:'트라이셉스 푸시다운',  grp:'arms',      eq:'케이블', t:'weight_reps' },
    { id:'e033', name:'해머 컬',              grp:'arms',      eq:'덤벨',   t:'weight_reps' },
    { id:'e034', name:'스컬 크러셔',           grp:'arms',      eq:'바벨',   t:'weight_reps' },
    { id:'e040', name:'스쿼트',               grp:'legs',      eq:'바벨',   t:'weight_reps' },
    { id:'e041', name:'레그 프레스',          grp:'legs',      eq:'머신',   t:'weight_reps' },
    { id:'e042', name:'런지',                 grp:'legs',      eq:'덤벨',   t:'weight_reps' },
    { id:'e043', name:'레그 컬',              grp:'legs',      eq:'머신',   t:'weight_reps' },
    { id:'e044', name:'레그 익스텐션',         grp:'legs',      eq:'머신',   t:'weight_reps' },
    { id:'e045', name:'루마니안 데드리프트',   grp:'legs',      eq:'바벨',   t:'weight_reps' },
    { id:'e046', name:'카프 레이즈',           grp:'legs',      eq:'맨몸',   t:'weight_reps' },
    { id:'e050', name:'플랭크',               grp:'core',      eq:'맨몸',   t:'duration'    },
    { id:'e051', name:'크런치',               grp:'core',      eq:'맨몸',   t:'weight_reps' },
    { id:'e052', name:'레그 레이즈',           grp:'core',      eq:'맨몸',   t:'weight_reps' },
    { id:'e053', name:'케이블 크런치',         grp:'core',      eq:'케이블', t:'weight_reps' },
    { id:'e060', name:'트레드밀',             grp:'cardio',    eq:'머신',   t:'duration'    },
    { id:'e061', name:'사이클',               grp:'cardio',    eq:'머신',   t:'duration'    },
    { id:'e062', name:'로잉머신',             grp:'cardio',    eq:'머신',   t:'duration'    },
    { id:'e063', name:'줄넘기',               grp:'cardio',    eq:'기구',   t:'duration'    },
  ];
  for (const ex of defaults) {
    await db.runAsync(
      'INSERT OR IGNORE INTO exercises (id, name, grp, equipment, input_type) VALUES (?,?,?,?,?)',
      [ex.id, ex.name, ex.grp, ex.eq, ex.t]
    );
  }
}

// ─── EXERCISES ───────────────────────────────────────────────────────────────

export async function getAllExercises() {
  const db = await getDB();
  const rows = await db.getAllAsync('SELECT * FROM exercises ORDER BY grp, name');
  return rows.map(r => ({
    id: r.id, name: r.name, group: r.grp, eq: r.equipment,
    inputType: r.input_type || 'weight_reps',
  }));
}

export async function addExercise(ex) {
  const db = await getDB();
  await db.runAsync(
    'INSERT INTO exercises (id, name, grp, equipment, input_type) VALUES (?,?,?,?,?)',
    [ex.id, ex.name, ex.group, ex.eq, ex.inputType || 'weight_reps']
  );
}

export async function updateExercise(ex) {
  const db = await getDB();
  await db.runAsync(
    'UPDATE exercises SET name=?, grp=?, equipment=?, input_type=? WHERE id=?',
    [ex.name, ex.group, ex.eq, ex.inputType || 'weight_reps', ex.id]
  );
}

export async function deleteExercise(id) {
  const db = await getDB();
  await db.runAsync('DELETE FROM exercises WHERE id=?', [id]);
}

// ─── PROGRAMS ────────────────────────────────────────────────────────────────

export async function getAllPrograms() {
  const db = await getDB();
  const rows = await db.getAllAsync('SELECT * FROM programs ORDER BY name');
  return rows.map(r => ({
    id: r.id, name: r.name, exercises: JSON.parse(r.exercise_ids || '[]'),
  }));
}

export async function saveProgram(prog) {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO programs (id, name, exercise_ids) VALUES (?,?,?)',
    [prog.id, prog.name, JSON.stringify(prog.exercises)]
  );
}

export async function deleteProgram(id) {
  const db = await getDB();
  await db.runAsync('DELETE FROM programs WHERE id=?', [id]);
}

// ─── WORKOUT LOGS ────────────────────────────────────────────────────────────

export async function getLogByDate(date) {
  const db  = await getDB();
  const log = await db.getFirstAsync('SELECT * FROM workout_logs WHERE date=?', [date]);
  if (!log) return null;
  const logExercises = await db.getAllAsync(
    'SELECT * FROM log_exercises WHERE log_date=? ORDER BY position', [date]
  );
  const exercises = [];
  for (const le of logExercises) {
    const sets = await db.getAllAsync(
      'SELECT * FROM sets WHERE log_exercise_id=? ORDER BY position', [le.id]
    );
    exercises.push({
      id: le.id, exerciseId: le.exercise_id,
      cardio: {
        distanceM:  le.cardio_distance_m  || 0,
        speedKmh:   le.cardio_speed_kmh   || 0,
        calories:   le.cardio_calories    || 0,
      },
      sets: sets.map(s => ({
        id: s.id, weight: s.weight, reps: s.reps,
        durationSec: s.duration_sec || 0, done: s.done === 1,
      })),
    });
  }
  return { date: log.date, notes: log.notes || '', exercises };
}

export async function getAllLogDates() {
  const db = await getDB();
  const rows = await db.getAllAsync('SELECT date FROM workout_logs ORDER BY date');
  return rows.map(r => r.date);
}

export async function getLogSummariesByMonth(year, month) {
  const db = await getDB();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const rows = await db.getAllAsync(
    `SELECT wl.date, le.exercise_id
     FROM workout_logs wl
     LEFT JOIN log_exercises le ON le.log_date = wl.date
     WHERE wl.date LIKE ? ORDER BY wl.date`,
    [`${prefix}%`]
  );
  const map = {};
  for (const r of rows) {
    if (!map[r.date]) map[r.date] = [];
    if (r.exercise_id) map[r.date].push(r.exercise_id);
  }
  return map;
}

export async function createLog(date) {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR IGNORE INTO workout_logs (id, date, notes) VALUES (?,?,?)',
    [genId(), date, '']
  );
  return getLogByDate(date);
}

export async function updateLogNotes(date, notes) {
  const db = await getDB();
  await db.runAsync('UPDATE workout_logs SET notes=? WHERE date=?', [notes, date]);
}

export async function addExerciseToLog(date, exerciseId, position) {
  const db = await getDB();
  const id = genId();
  await db.runAsync(
    'INSERT INTO log_exercises (id, log_date, exercise_id, position) VALUES (?,?,?,?)',
    [id, date, exerciseId, position]
  );
  return id;
}

export async function removeExerciseFromLog(logExerciseId) {
  const db = await getDB();
  await db.runAsync('DELETE FROM sets WHERE log_exercise_id=?', [logExerciseId]);
  await db.runAsync('DELETE FROM log_exercises WHERE id=?', [logExerciseId]);
}

// 유산소 추가 정보 저장
export async function updateCardioInfo(logExerciseId, { distanceM = 0, speedKmh = 0, calories = 0 }) {
  const db = await getDB();
  await db.runAsync(
    'UPDATE log_exercises SET cardio_distance_m=?, cardio_speed_kmh=?, cardio_calories=? WHERE id=?',
    [distanceM, speedKmh, calories, logExerciseId]
  );
}

export async function reorderLogExercises(orderedIds) {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE log_exercises SET position=? WHERE id=?', [i, orderedIds[i]]);
    }
  });
}

// sets — weight_reps 또는 duration 모드
export async function addSet(logExerciseId, weight, reps, position, durationSec = 0) {
  const db = await getDB();
  const id = genId();
  await db.runAsync(
    'INSERT INTO sets (id, log_exercise_id, position, weight, reps, duration_sec, done) VALUES (?,?,?,?,?,?,0)',
    [id, logExerciseId, position, weight, reps, durationSec]
  );
  return id;
}

export async function updateSet(setId, weight, reps, done, durationSec = 0) {
  const db = await getDB();
  await db.runAsync(
    'UPDATE sets SET weight=?, reps=?, duration_sec=?, done=? WHERE id=?',
    [weight, reps, durationSec, done ? 1 : 0, setId]
  );
}

export async function deleteSet(setId) {
  const db = await getDB();
  await db.runAsync('DELETE FROM sets WHERE id=?', [setId]);
}

export async function getLastLogForExercise(exerciseId, beforeDate) {
  const db = await getDB();
  const le = await db.getFirstAsync(
    `SELECT le.* FROM log_exercises le
     JOIN workout_logs wl ON wl.date = le.log_date
     WHERE le.exercise_id=? AND wl.date < ?
     ORDER BY wl.date DESC LIMIT 1`,
    [exerciseId, beforeDate]
  );
  if (!le) return null;
  const sets = await db.getAllAsync(
    'SELECT * FROM sets WHERE log_exercise_id=? ORDER BY position', [le.id]
  );
  return {
    id: le.id, exerciseId: le.exercise_id,
    sets: sets.map(s => ({
      weight: s.weight, reps: s.reps,
      durationSec: s.duration_sec || 0, done: s.done === 1,
    })),
  };
}

export async function getLastVolForExercise(exerciseId, beforeDate) {
  const db = await getDB();
  const row = await db.getFirstAsync(
    `SELECT SUM(
       CASE WHEN s.duration_sec > 0 THEN s.duration_sec / 60.0
            ELSE s.weight * s.reps END
     ) as vol
     FROM sets s
     JOIN log_exercises le ON le.id = s.log_exercise_id
     JOIN workout_logs wl ON wl.date = le.log_date
     WHERE le.exercise_id = ?
       AND wl.date = (
         SELECT wl2.date FROM workout_logs wl2
         JOIN log_exercises le2 ON le2.log_date = wl2.date
         WHERE le2.exercise_id = ? AND wl2.date < ?
         ORDER BY wl2.date DESC LIMIT 1
       ) AND s.done = 1`,
    [exerciseId, exerciseId, beforeDate]
  );
  return row?.vol || 0;
}

export async function getPRForExercise(exerciseId) {
  const db = await getDB();
  const row = await db.getFirstAsync(
    `SELECT MAX(s.weight) as maxW FROM sets s
     JOIN log_exercises le ON le.id = s.log_exercise_id
     WHERE le.exercise_id=? AND s.done=1`,
    [exerciseId]
  );
  return row?.maxW || 0;
}

// ─── STATS ───────────────────────────────────────────────────────────────────

export async function getVolumeByGroup(group, exerciseIds, limit = 8) {
  const db = await getDB();
  if (!exerciseIds.length) return [];
  const ph = exerciseIds.map(() => '?').join(',');
  const rows = await db.getAllAsync(
    `SELECT wl.date, SUM(s.weight * s.reps) as vol
     FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     JOIN sets s ON s.log_exercise_id = le.id
     WHERE le.exercise_id IN (${ph}) AND s.done=1
     GROUP BY wl.date ORDER BY wl.date DESC LIMIT ?`,
    [...exerciseIds, limit]
  );
  return rows.reverse();
}

export async function getVolumeByExercise(exerciseId, limit = 10) {
  const db = await getDB();
  const rows = await db.getAllAsync(
    `SELECT wl.date, MAX(s.weight) as maxW, SUM(s.weight * s.reps) as vol
     FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     JOIN sets s ON s.log_exercise_id = le.id
     WHERE le.exercise_id=? AND s.done=1
     GROUP BY wl.date ORDER BY wl.date DESC LIMIT ?`,
    [exerciseId, limit]
  );
  return rows.reverse();
}

export async function getOverallStats() {
  const db = await getDB();
  const totalDays = await db.getFirstAsync('SELECT COUNT(*) as c FROM workout_logs');
  const totalVol  = await db.getFirstAsync('SELECT SUM(weight * reps) as v FROM sets WHERE done=1');
  const cut30 = new Date(); cut30.setDate(cut30.getDate() - 30);
  const d30 = cut30.toISOString().split('T')[0];
  const last30 = await db.getFirstAsync('SELECT COUNT(*) as c FROM workout_logs WHERE date > ?', [d30]);
  const groupRows = await db.getAllAsync(
    `SELECT e.grp, COUNT(DISTINCT wl.date) as cnt
     FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     JOIN exercises e ON e.id = le.exercise_id GROUP BY e.grp`
  );
  return {
    totalDays: totalDays.c, totalVol: totalVol.v || 0, last30: last30.c,
    groupCounts: Object.fromEntries(groupRows.map(r => [r.grp, r.cnt])),
  };
}

export async function getGroupVolumeLast14Days() {
  const db = await getDB();
  const cut = new Date(); cut.setDate(cut.getDate() - 13);
  const since = cut.toISOString().split('T')[0];
  const rows = await db.getAllAsync(
    `SELECT wl.date, e.grp, SUM(s.weight * s.reps) as vol
     FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     JOIN exercises e ON e.id = le.exercise_id
     JOIN sets s ON s.log_exercise_id = le.id
     WHERE wl.date >= ? AND s.done = 1
     GROUP BY wl.date, e.grp ORDER BY wl.date`,
    [since]
  );
  return rows;
}

// 부위별 탭: 종목별 라인그래프용 — 운동한 날 순번 기준 최근 10회
export async function getExerciseSeriesByGroup(group, exerciseIds, limit = 10) {
  const db = await getDB();
  if (!exerciseIds.length) return [];
  const series = [];
  for (const exId of exerciseIds) {
    const rows = await db.getAllAsync(
      `SELECT wl.date,
              SUM(CASE WHEN s.duration_sec > 0 THEN s.duration_sec / 60.0
                       ELSE s.weight * s.reps END) as vol
       FROM workout_logs wl
       JOIN log_exercises le ON le.log_date = wl.date
       JOIN sets s ON s.log_exercise_id = le.id
       WHERE le.exercise_id = ? AND s.done = 1
       GROUP BY wl.date ORDER BY wl.date DESC LIMIT ?`,
      [exId, limit]
    );
    if (rows.length > 0) {
      series.push({
        exId,
        points: rows.reverse().map((r, i) => ({ x: i + 1, vol: r.vol || 0, date: r.date })),
      });
    }
  }
  return series;
}

export async function getStackedVolumeByGroup(group, exerciseIds, limit = 10) {
  const db = await getDB();
  if (!exerciseIds.length) return { dates: [], series: [] };
  const ph = exerciseIds.map(() => '?').join(',');
  const dateRows = await db.getAllAsync(
    `SELECT DISTINCT wl.date FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     WHERE le.exercise_id IN (${ph}) ORDER BY wl.date DESC LIMIT ?`,
    [...exerciseIds, limit]
  );
  const dates = dateRows.map(r => r.date).reverse();
  if (!dates.length) return { dates: [], series: [] };
  const dph = dates.map(() => '?').join(',');
  const rows = await db.getAllAsync(
    `SELECT wl.date, le.exercise_id,
            SUM(CASE WHEN s.duration_sec > 0 THEN s.duration_sec / 60.0
                     ELSE s.weight * s.reps END) as vol
     FROM workout_logs wl
     JOIN log_exercises le ON le.log_date = wl.date
     JOIN sets s ON s.log_exercise_id = le.id
     WHERE le.exercise_id IN (${ph}) AND wl.date IN (${dph}) AND s.done = 1
     GROUP BY wl.date, le.exercise_id`,
    [...exerciseIds, ...dates]
  );
  const series = exerciseIds.map(exId => ({
    exId,
    data: dates.map(d => {
      const row = rows.find(r => r.date === d && r.exercise_id === exId);
      return row?.vol || 0;
    }),
  }));
  return { dates, series };
}

export async function getGroupLastBest(group, exerciseIds, beforeDate) {
  const db = await getDB();
  if (!exerciseIds.length) return 0;
  const ph = exerciseIds.map(() => '?').join(',');
  const row = await db.getFirstAsync(
    `SELECT MAX(s.weight) as maxW FROM sets s
     JOIN log_exercises le ON le.id = s.log_exercise_id
     JOIN workout_logs wl ON wl.date = le.log_date
     WHERE le.exercise_id IN (${ph}) AND wl.date < ? AND s.done = 1`,
    [...exerciseIds, beforeDate]
  );
  return row?.maxW || 0;
}

// ─── BACKUP ──────────────────────────────────────────────────────────────────

export async function exportAllData() {
  const db = await getDB();
  // 각 테이블을 컬럼명 포함해서 명시적으로 조회
  const exercises    = await db.getAllAsync(
    'SELECT id, name, grp, equipment, input_type FROM exercises'
  );
  const programs     = await db.getAllAsync(
    'SELECT id, name, exercise_ids FROM programs'
  );
  const logs         = await db.getAllAsync(
    'SELECT id, date, notes FROM workout_logs'
  );
  const logExercises = await db.getAllAsync(
    'SELECT id, log_date, exercise_id, position, cardio_distance_m, cardio_speed_kmh, cardio_calories FROM log_exercises'
  );
  const sets         = await db.getAllAsync(
    'SELECT id, log_exercise_id, position, weight, reps, duration_sec, done FROM sets'
  );
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    exercises,
    programs,
    logs,
    logExercises,
    sets,
  };
}

export async function importAllData(data) {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    // 기존 데이터 전체 삭제
    await db.runAsync('DELETE FROM sets');
    await db.runAsync('DELETE FROM log_exercises');
    await db.runAsync('DELETE FROM workout_logs');
    await db.runAsync('DELETE FROM programs');
    await db.runAsync('DELETE FROM exercises');

    // exercises — 사용자 추가 종목 포함 전체 복원
    for (const r of (data.exercises || [])) {
      await db.runAsync(
        'INSERT OR REPLACE INTO exercises (id, name, grp, equipment, input_type) VALUES (?,?,?,?,?)',
        [
          r.id,
          r.name,
          r.grp   || r.group || 'chest',
          r.equipment || r.eq || '기타',
          r.input_type || r.inputType || 'weight_reps',
        ]
      );
    }

    // programs
    for (const r of (data.programs || [])) {
      await db.runAsync(
        'INSERT OR REPLACE INTO programs (id, name, exercise_ids) VALUES (?,?,?)',
        [r.id, r.name, r.exercise_ids || JSON.stringify(r.exercises || [])]
      );
    }

    // workout_logs
    for (const r of (data.logs || [])) {
      await db.runAsync(
        'INSERT OR REPLACE INTO workout_logs (id, date, notes) VALUES (?,?,?)',
        [r.id, r.date, r.notes || '']
      );
    }

    // log_exercises — cardio 컬럼 포함
    for (const r of (data.logExercises || [])) {
      await db.runAsync(
        `INSERT OR REPLACE INTO log_exercises
           (id, log_date, exercise_id, position,
            cardio_distance_m, cardio_speed_kmh, cardio_calories)
         VALUES (?,?,?,?,?,?,?)`,
        [
          r.id,
          r.log_date,
          r.exercise_id,
          r.position || 0,
          r.cardio_distance_m || 0,
          r.cardio_speed_kmh  || 0,
          r.cardio_calories   || 0,
        ]
      );
    }

    // sets
    for (const r of (data.sets || [])) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sets
           (id, log_exercise_id, position, weight, reps, duration_sec, done)
         VALUES (?,?,?,?,?,?,?)`,
        [
          r.id,
          r.log_exercise_id,
          r.position     || 0,
          r.weight       || 0,
          r.reps         || 0,
          r.duration_sec || 0,
          r.done         || 0,
        ]
      );
    }
  });
}

function genId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
