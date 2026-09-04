import React, { useState, useEffect, useMemo } from "react";
import { useCloudState } from "./lib/useCloudState";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import {
  Compass, Home, Target, Flame, CheckSquare, Wallet, BookOpen, Plus, Trash2,
  Pencil, X, Check, ChevronLeft, ChevronRight, PiggyBank, Stamp, TrendingUp,
  TrendingDown, Landmark, Loader2, ListPlus, Sparkles, Wand2, AlertTriangle, Trophy, Users, UserPlus, ImagePlus, Cloud, CloudOff
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/* Constantes                                                              */
/* ---------------------------------------------------------------------- */

const STORAGE_KEY = "bitacora-perfiles-v2";
const PROFILES_V1_KEY = "bitacora-perfiles-v1";
const LEGACY_STORAGE_KEY = "bitacora-hogar-v2";

const GOAL_CATEGORIES = ["Personal", "Viaje", "Financiero", "Salud", "Familia", "Otro"];
const INCOME_CATS = ["Sueldo", "Freelance / changas", "Alquileres", "Otros ingresos"];
const EXPENSE_CATS = [
  "Alquiler / hipoteca", "Supermercado", "Servicios (luz, agua, gas, internet)",
  "Transporte", "Salud", "Educación", "Entretenimiento", "Ropa",
  "Ahorro / Objetivo", "Otros gastos"
];
const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAY_FULL_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Datos propios de cada perfil (lo personal)
const DEFAULT_DATA = {
  goals: [],
  habits: [],
  habitLogs: {},
  tasks: [],
  notes: [],
  challenges: [],
  challengeLogs: {}
};

// Datos compartidos por TODOS los perfiles: la economía de la casa
// más las metas/hábitos/retos que se marcan como compartidos.
const DEFAULT_SHARED = {
  transactions: [],
  settings: { currencySymbol: "$", bankBalance: 0, annualGoal: 0, annualOverrides: {} },
  goals: [],
  habits: [],
  habitLogs: {},
  challenges: [],
  challengeLogs: {}
};

const MIN_CHALLENGE_DAYS = 30;
const CHALLENGE_PRESETS = [30, 60, 90, 180, 365];

const TABS = [
  { id: "resumen", label: "Resumen", icon: Home },
  { id: "metas", label: "Metas", icon: Target },
  { id: "habitos", label: "Hábitos", icon: Flame },
  { id: "retos", label: "Retos", icon: Trophy },
  { id: "tareas", label: "Tareas", icon: CheckSquare },
  { id: "finanzas", label: "Finanzas", icon: Wallet },
  { id: "notas", label: "Notas", icon: BookOpen }
];

/* ---------------------------------------------------------------------- */
/* Helpers                                                                  */
/* ---------------------------------------------------------------------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKeyOf = (iso) => (iso || todayISO()).slice(0, 7);
const currentMonthKey = () => todayISO().slice(0, 7);
const firstOfMonthISO = () => `${todayISO().slice(0, 8)}01`;

function fmtMoney(n, symbol) {
  const val = Math.round(Number(n) || 0);
  return `${symbol}${val.toLocaleString("es-UY")}`;
}

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" });
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("es-UY", { month: "short", year: "2-digit" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthShortName(m) {
  const d = new Date(2000, m - 1, 1);
  const s = d.toLocaleDateString("es-UY", { month: "short" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastNMonthKeys(n, endKey) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(shiftMonthKey(endKey, -i));
  return arr;
}

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offset * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function monthTotals(transactions, key) {
  let income = 0, expense = 0;
  transactions.forEach((t) => {
    if (monthKeyOf(t.date) === key) {
      if (t.type === "income") income += Number(t.amount);
      else expense += Number(t.amount);
    }
  });
  return { income, expense, balance: income - expense };
}

function sumTotals(txns) {
  let income = 0, expense = 0;
  txns.forEach((t) => (t.type === "income" ? (income += Number(t.amount)) : (expense += Number(t.amount))));
  return { income, expense, balance: income - expense };
}

function goalCurrency(goal) {
  return goal && goal.currency ? goal.currency : "$";
}

function goalHasAmount(goal) {
  return Number(goal.targetAmount) > 0;
}

function goalProgress(goal) {
  if (Number(goal.targetAmount) > 0) {
    return Math.min(100, Math.round((Number(goal.currentAmount || 0) / Number(goal.targetAmount)) * 100));
  }
  return 0;
}

function habitAppliesToDate(habit, dateISO) {
  if (habit.frequency === "diario") return true;
  const dow = new Date(dateISO + "T00:00:00").getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return (habit.days || []).includes(idx);
}

function habitStreak(habitId, logs) {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 3650; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (logs[`${habitId}|${iso}`]) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

function weekPointsInfo(habits, logs, weekDates) {
  // "possible" = TODA la semana (los 5 días de un hábito de L a V suman 5 x sus puntos).
  // "possibleSoFar" = solo hasta hoy, para saber si venís al día.
  let earned = 0, possible = 0, possibleSoFar = 0, earnedSoFar = 0;
  const today = todayISO();
  habits.forEach((h) => {
    const pts = Number(h.points) || 10;
    weekDates.forEach((d) => {
      if (!habitAppliesToDate(h, d)) return;
      possible += pts;
      const done = !!logs[`${h.id}|${d}`];
      if (done) earned += pts;
      if (d <= today) {
        possibleSoFar += pts;
        if (done) earnedSoFar += pts;
      }
    });
  });
  const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const pctSoFar = possibleSoFar > 0 ? Math.round((earnedSoFar / possibleSoFar) * 100) : 0;
  const weekComplete = possible > 0 && possibleSoFar >= possible;
  const extraordinary = possible > 0 && earned === possible;
  const onTrack = !extraordinary && possibleSoFar > 0 && earnedSoFar === possibleSoFar;
  return { earned, possible, pct, earnedSoFar, possibleSoFar, pctSoFar, weekComplete, extraordinary, onTrack };
}

function dayCompletionInfo(habits, logs, dateISO) {
  const applicable = habits.filter((h) => habitAppliesToDate(h, dateISO));
  if (applicable.length === 0) return { applicable: 0, done: 0, ratio: 0, extraordinary: false, earned: 0, possible: 0, pct: 0 };
  const doneHabits = applicable.filter((h) => logs[`${h.id}|${dateISO}`]);
  const possible = applicable.reduce((s, h) => s + (Number(h.points) || 10), 0);
  const earned = doneHabits.reduce((s, h) => s + (Number(h.points) || 10), 0);
  return {
    applicable: applicable.length,
    done: doneHabits.length,
    ratio: doneHabits.length / applicable.length,
    extraordinary: doneHabits.length === applicable.length,
    earned,
    possible,
    pct: possible > 0 ? Math.round((earned / possible) * 100) : 0
  };
}

function monthPointsInfo(habits, logs, year, month) {
  const total = daysInMonth(year, month);
  const today = todayISO();
  let earned = 0, possible = 0, earnedSoFar = 0, possibleSoFar = 0;
  for (let d = 1; d <= total; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = dayCompletionInfo(habits, logs, iso);
    possible += info.possible;
    earned += info.earned;
    if (iso <= today) { possibleSoFar += info.possible; earnedSoFar += info.earned; }
  }
  return {
    earned, possible,
    pct: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    earnedSoFar, possibleSoFar,
    pctSoFar: possibleSoFar > 0 ? Math.round((earnedSoFar / possibleSoFar) * 100) : 0,
    monthComplete: possible > 0 && possibleSoFar >= possible
  };
}

function weeksOfMonth(habits, logs, year, month) {
  const total = daysInMonth(year, month);
  const weeks = [];
  let current = null;
  for (let d = 1; d <= total; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(year, month - 1, d).getDay();
    const idx = dow === 0 ? 6 : dow - 1; // 0 = lunes
    if (!current || idx === 0) {
      current = { label: "", earned: 0, possible: 0, startDay: d, endDay: d };
      weeks.push(current);
    }
    const info = dayCompletionInfo(habits, logs, iso);
    current.earned += info.earned;
    current.possible += info.possible;
    current.endDay = d;
  }
  return weeks
    .filter((w) => w.possible > 0)
    .map((w, i) => ({ ...w, label: `Sem ${i + 1}`, range: `${w.startDay}–${w.endDay}`, pct: Math.round((w.earned / w.possible) * 100) }));
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function monthCalendarInfo(habits, logs, year, month) {
  const total = daysInMonth(year, month);
  const today = todayISO();
  const days = [];
  // applicableDaysCount = TODOS los días del mes con hábitos programados (no solo los pasados),
  // así el "mes extraordinario" solo se logra al terminar el mes entero sin fallar.
  let extraordinaryCount = 0, applicableDaysCount = 0, elapsedApplicable = 0;
  for (let d = 1; d <= total; d++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const future = iso > today;
    const info = dayCompletionInfo(habits, logs, iso);
    if (info.applicable > 0) {
      applicableDaysCount++;
      if (!future) elapsedApplicable++;
      if (info.extraordinary) extraordinaryCount++;
    }
    days.push({ iso, day: d, future, ...info });
  }
  const firstDow = new Date(year, month - 1, 1).getDay();
  const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1;
  const monthExtraordinario = applicableDaysCount > 0 && extraordinaryCount === applicableDaysCount;
  return { days, leadingBlanks, extraordinaryCount, applicableDaysCount, elapsedApplicable, monthExtraordinario };
}

function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function challengeInfo(challenge, logs) {
  const total = Number(challenge.days) || MIN_CHALLENGE_DAYS;
  const start = challenge.startDate;
  const endDate = addDaysISO(start, total - 1);
  const today = todayISO();

  const days = [];
  let doneCount = 0, elapsed = 0;
  for (let i = 0; i < total; i++) {
    const iso = addDaysISO(start, i);
    const done = !!logs[`${challenge.id}|${iso}`];
    const past = iso <= today;
    const future = iso > today;
    if (past) elapsed++;
    if (done) doneCount++;
    days.push({ iso, index: i + 1, done, future, missed: past && !done && iso !== today });
  }

  const notStarted = today < start;
  const finished = today > endDate;
  const daysLeft = notStarted ? total : Math.max(0, total - elapsed);
  const pct = Math.round((doneCount / total) * 100);
  const perfect = finished && doneCount === total;

  // racha actual (desde hoy hacia atrás, dentro del reto)
  let streak = 0;
  let cursor = today > endDate ? endDate : today;
  while (cursor >= start) {
    if (logs[`${challenge.id}|${cursor}`]) { streak++; cursor = addDaysISO(cursor, -1); }
    else break;
  }

  const missedCount = days.filter((d) => d.missed).length;
  return { total, start, endDate, days, doneCount, elapsed, daysLeft, pct, perfect, finished, notStarted, streak, missedCount };
}

function monthTargetFromAnnualPlan(settings, key) {
  const overrides = settings.annualOverrides || {};
  if (overrides[key] != null) return Number(overrides[key]);
  const goal = Number(settings.annualGoal || 0);
  return goal > 0 ? Math.round(goal / 12) : 0;
}

async function classifyExpensesWithAI({ text, images }) {
  // Llamamos a nuestra propia función serverless (/api/classify).
  // La clave de Anthropic vive en el servidor de Vercel, nunca en el navegador.
  const response = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, images })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "No se pudo contactar al servicio de IA.");
  }
  if (!Array.isArray(payload.items)) {
    throw new Error("Formato inesperado.");
  }
  return payload.items;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve({ mediaType: file.type || "image/jpeg", data: comma >= 0 ? result.slice(comma + 1) : result, name: file.name, preview: result });
    };
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

/* ---------------------------------------------------------------------- */
/* Componentes reutilizables                                               */
/* ---------------------------------------------------------------------- */

function Modal({ title, onClose, children }) {
  return (
    <div className="los-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="los-modal">
        <div className="los-modal-head">
          <h3>{title}</h3>
          <button className="los-icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="los-modal-body">{children}</div>
      </div>
    </div>
  );
}

function ProgressBar({ value, tone = "brass" }) {
  return (
    <div className="los-progress-track">
      <div className={`los-progress-fill fill-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function EmptyState({ icon: Icon, text, actionLabel, onAction }) {
  return (
    <div className="los-empty">
      <Icon size={28} strokeWidth={1.5} />
      <p>{text}</p>
      {actionLabel && <button className="los-btn los-btn-primary" onClick={onAction}><Plus size={16} /> {actionLabel}</button>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Metas                                                                    */
/* ---------------------------------------------------------------------- */

function GoalForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || GOAL_CATEGORIES[0]);
  const [targetDate, setTargetDate] = useState(initial?.targetDate || "");
  const [hasAmount, setHasAmount] = useState(!!initial?.targetAmount);
  const [currency, setCurrency] = useState(initial?.currency || "$");
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount || "");
  const [currentAmount, setCurrentAmount] = useState(initial?.currentAmount || "");
  const [steps, setSteps] = useState(initial?.steps || []);
  const [stepText, setStepText] = useState("");
  const [isShared, setIsShared] = useState(!!initial?.shared);
  const [error, setError] = useState("");

  function addStepLocal() {
    if (!stepText.trim()) return;
    setSteps((prev) => [...prev, { id: uid(), text: stepText.trim() }]);
    setStepText("");
  }
  function removeStepLocal(id) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }
  function handleStepKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      addStepLocal();
    }
  }

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim()) { setError("Escribí un título para poder guardar el objetivo."); return; }
    setError("");
    onSave({
      id: initial?.id || uid(),
      title: title.trim(),
      description: description.trim(),
      category,
      targetDate: targetDate || "",
      shared: isShared,
      currency: hasAmount ? currency : (initial?.currency || "$"),
      targetAmount: hasAmount && targetAmount ? Number(targetAmount) : 0,
      currentAmount: hasAmount && currentAmount ? Number(currentAmount) : 0,
      steps,
      status: initial?.status || "en curso"
    });
  }

  return (
    <Modal title={initial ? "Editar objetivo" : "Nuevo objetivo"} onClose={onCancel}>
      <form className="los-form" onSubmit={submit}>
        <label className="los-label">Título
          <input className="los-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Comprarme una camioneta" autoFocus />
        </label>
        <label className="los-label">Descripción / notas (opcional)
          <textarea className="los-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Por qué es importante? ¿Cómo se ve cumplido?" rows={2} />
        </label>
        <div className="los-form-row">
          <label className="los-label">Tipo de objetivo
            <select className="los-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {GOAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="los-label">Fecha límite
            <input className="los-input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
        </div>

        <label className="los-checkline los-shared-line">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          <Users size={15} /> Objetivo compartido (lo ven todos los perfiles)
        </label>

        <label className="los-checkline">
          <input type="checkbox" checked={hasAmount} onChange={(e) => setHasAmount(e.target.checked)} />
          Este objetivo cuesta dinero
        </label>
        {hasAmount && (
          <>
            <div className="los-currency-picker">
              <span className="los-label" style={{ marginRight: 4 }}>Moneda</span>
              <button type="button" className={`los-cur-btn ${currency === "$" ? "active" : ""}`} onClick={() => setCurrency("$")}>$ Pesos</button>
              <button type="button" className={`los-cur-btn ${currency === "US$" ? "active" : ""}`} onClick={() => setCurrency("US$")}>US$ Dólares</button>
            </div>
            <div className="los-form-row">
              <label className="los-label">¿Cuánto cuesta?
                <input className="los-input" type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="0" />
              </label>
              <label className="los-label">¿Cuánto juntaste?
                <input className="los-input" type="number" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} placeholder="0" />
              </label>
            </div>
          </>
        )}

        <h4 className="los-plan-title">Plan de acción</h4>
        <p className="los-plan-hint">Los puntos que te van a llevar a esta meta. Ej: "escalar mi negocio", "hacer 1 video por semana". Escribí uno y tocá el botón (o Enter) para sumarlo a la lista.</p>
        {steps.length > 0 && (
          <ul className="los-plan-list">
            {steps.map((s) => (
              <li key={s.id}>
                <span className="los-bullet">•</span>
                <span className="los-step-text">{s.text}</span>
                <button type="button" className="los-step-del" onClick={() => removeStepLocal(s.id)} aria-label="Borrar punto"><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="los-add-step">
          <input className="los-input los-input-sm" value={stepText} onChange={(e) => setStepText(e.target.value)} onKeyDown={handleStepKeyDown} placeholder="Ej: Hacer 1 video por semana" />
          <button type="button" className="los-icon-btn" onClick={addStepLocal} aria-label="Agregar punto"><ListPlus size={16} /></button>
        </div>

        {error && <p className="los-error">{error}</p>}
        <div className="los-form-actions">
          <button type="button" className="los-btn los-btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" onClick={submit} className="los-btn los-btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function GoalCard({ goal, onEdit, onDelete, onToggleStatus, onAddStep, onDeleteStep }) {
  const [stepText, setStepText] = useState("");
  const progress = goalProgress(goal);
  const done = goal.status === "completada";
  const hasAmount = goalHasAmount(goal);
  const cur = goalCurrency(goal);

  function submitStep(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!stepText.trim()) return;
    onAddStep(goal.id, stepText.trim());
    setStepText("");
  }

  return (
    <div className={`los-card los-goal-card ${done ? "is-done" : ""}`}>
      {done && <div className="los-stamp"><Stamp size={16} /> Cumplida</div>}
      <div className="los-goal-top">
        <span className="los-badge">{goal.category}</span>
        {goal.shared && <span className="los-shared-badge"><Users size={11} /> Compartido</span>}
        {goal.targetDate && <span className="los-goal-date">Límite: {formatDateShort(goal.targetDate)}</span>}
      </div>
      <h3 className="los-goal-title">{goal.title}</h3>
      {goal.description && <p className="los-goal-desc">{goal.description}</p>}

      {hasAmount && (
        <>
          <p className="los-goal-amounts">
            {fmtMoney(goal.currentAmount, cur)} <span>de</span> {fmtMoney(goal.targetAmount, cur)}
            <span className="los-cur-tag">{cur === "US$" ? "USD" : "Pesos"}</span>
          </p>
          <ProgressBar value={progress} tone={done ? "forest" : "brass"} />
          <p className="los-progress-label">{progress}% juntado</p>
        </>
      )}

      <h4 className="los-plan-title">Plan de acción</h4>
      {goal.steps && goal.steps.length > 0 ? (
        <ul className="los-plan-list">
          {goal.steps.map((s) => (
            <li key={s.id}>
              <span className="los-bullet">•</span>
              <span className="los-step-text">{s.text}</span>
              <button className="los-step-del" onClick={() => onDeleteStep(goal.id, s.id)} aria-label="Borrar punto"><X size={13} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="los-plan-hint">Todavía no cargaste puntos para este plan.</p>
      )}

      <form className="los-add-step" onSubmit={submitStep}>
        <input className="los-input los-input-sm" value={stepText} onChange={(e) => setStepText(e.target.value)} placeholder="Agregar un punto al plan..." />
        <button type="button" onClick={submitStep} className="los-icon-btn" aria-label="Agregar punto"><ListPlus size={16} /></button>
      </form>

      <div className="los-card-footer">
        <button className="los-link-btn" onClick={() => onToggleStatus(goal.id)}>{done ? "Reabrir" : "Marcar cumplida"}</button>
        <div className="los-card-actions">
          <button className="los-icon-btn" onClick={() => onEdit(goal)} aria-label="Editar"><Pencil size={15} /></button>
          <button className="los-icon-btn" onClick={() => onDelete(goal.id)} aria-label="Borrar"><Trash2 size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function MetasTab({ data, actions, currencySymbol }) {
  const [filter, setFilter] = useState("todas");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const goals = data.goals.filter((g) => {
    if (filter === "curso") return g.status !== "completada";
    if (filter === "cumplidas") return g.status === "completada";
    return true;
  });

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>Tus metas</h2>
          <p className="los-section-sub">Escribí tus objetivos y armá el plan de acción para llegar.</p>
        </div>
        <button className="los-btn los-btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus size={16} /> Nuevo objetivo
        </button>
      </div>

      <div className="los-filters">
        {[["todas", "Todas"], ["curso", "En curso"], ["cumplidas", "Cumplidas"]].map(([k, l]) => (
          <button key={k} className={`los-filter-btn ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={Target} text="Todavía no cargaste ningún objetivo." actionLabel="Crear el primero" onAction={() => setShowForm(true)} />
      ) : (
        <div className="los-grid">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onEdit={(goal) => { setEditing(goal); setShowForm(true); }}
              onDelete={actions.deleteGoal}
              onToggleStatus={actions.toggleGoalStatus}
              onAddStep={actions.addGoalStep}
              onDeleteStep={actions.deleteGoalStep}
            />
          ))}
        </div>
      )}

      {showForm && (
        <GoalForm
          initial={editing}
          onCancel={() => setShowForm(false)}
          onSave={(g) => { editing ? actions.updateGoal(g) : actions.addGoal(g); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Hábitos                                                                  */
/* ---------------------------------------------------------------------- */

function HabitForm({ initial, onCancel, onSave, goals }) {
  const [name, setName] = useState(initial?.name || "");
  const [frequency, setFrequency] = useState(initial?.frequency || "diario");
  const [days, setDays] = useState(initial?.days && initial.days.length ? initial.days : [0, 1, 2, 3, 4]);
  const [goalId, setGoalId] = useState(initial?.goalId || "");
  const [points, setPoints] = useState(initial?.points || 10);
  const [isShared, setIsShared] = useState(!!initial?.shared);
  const [error, setError] = useState("");

  function toggleDay(i) {
    setDays((prev) => prev.includes(i) ? prev.filter((d) => d !== i) : [...prev, i].sort());
  }

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!name.trim()) { setError("Escribí un nombre para el hábito."); return; }
    if (frequency === "dias" && days.length === 0) { setError("Elegí al menos un día de la semana."); return; }
    setError("");
    onSave({ id: initial?.id || uid(), name: name.trim(), frequency, days: frequency === "dias" ? days : [], goalId: goalId || null, points: Number(points) || 10, shared: isShared });
  }

  return (
    <Modal title={initial ? "Editar hábito" : "Nuevo hábito"} onClose={onCancel}>
      <form className="los-form" onSubmit={submit}>
        <label className="los-label">Nombre
          <input className="los-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Tomar 2L de agua" autoFocus />
        </label>
        <div className="los-type-toggle">
          <button type="button" className={`los-toggle-btn ${frequency === "diario" ? "active brass" : ""}`} onClick={() => setFrequency("diario")}>Todos los días</button>
          <button type="button" className={`los-toggle-btn ${frequency === "dias" ? "active brass" : ""}`} onClick={() => setFrequency("dias")}>Días específicos</button>
        </div>
        {frequency === "dias" && (
          <div className="los-weekday-picker">
            {WEEKDAY_LABELS.map((l, i) => (
              <button type="button" key={i} className={`los-weekday-btn ${days.includes(i) ? "active" : ""}`} onClick={() => toggleDay(i)}>{l}</button>
            ))}
          </div>
        )}
        <label className="los-label">Puntos por día cumplido
          <input className="los-input" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
        </label>
        <label className="los-label">Vincular a un objetivo (opcional)
          <select className="los-select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">— Ninguno —</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
        <label className="los-checkline los-shared-line">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          <Users size={15} /> Hábito compartido (lo ven y lo marcan todos los perfiles)
        </label>
        {error && <p className="los-error">{error}</p>}
        <div className="los-form-actions">
          <button type="button" className="los-btn los-btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" onClick={submit} className="los-btn los-btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function HabitMonthCalendar({ data, monthOffset, setMonthOffset }) {
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth() + 1;
  const info = useMemo(() => monthCalendarInfo(data.habits, data.habitLogs, year, month), [data.habits, data.habitLogs, year, month]);
  const pts = useMemo(() => monthPointsInfo(data.habits, data.habitLogs, year, month), [data.habits, data.habitLogs, year, month]);
  const weeks = useMemo(() => weeksOfMonth(data.habits, data.habitLogs, year, month), [data.habits, data.habitLogs, year, month]);
  const label = base.toLocaleDateString("es-UY", { month: "long", year: "numeric" });

  return (
    <div className="los-card">
      <div className="los-week-nav" style={{ marginBottom: 6 }}>
        <button className="los-icon-btn" onClick={() => setMonthOffset((m) => m - 1)} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
        <span>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
        <button className="los-icon-btn" onClick={() => setMonthOffset((m) => m + 1)} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
        {monthOffset !== 0 && <button className="los-link-btn" onClick={() => setMonthOffset(0)}>Volver a este mes</button>}
      </div>

      {info.monthExtraordinario && (
        <div className="los-extraordinary-banner"><Sparkles size={15} /> ¡Mes extraordinario! Cumpliste el 100% todos los días.</div>
      )}
      <p className="los-section-sub" style={{ marginBottom: 12 }}>
        {info.extraordinaryCount} de {info.applicableDaysCount} días extraordinarios este mes
        {info.elapsedApplicable < info.applicableDaysCount && ` (van ${info.elapsedApplicable} días transcurridos)`}
      </p>

      {pts.possible > 0 && (
        <div className="los-month-score">
          <div>
            <span className="los-hero-label" style={{ color: "var(--slate)" }}>Cumplimiento del mes</span>
            <span className="los-hero-value tone-azul">{pts.pct}%</span>
          </div>
          <div className="los-score-right">
            <span className="los-score-pts">{pts.earned} / {pts.possible} pts</span>
            {!pts.monthComplete && pts.possibleSoFar > 0 && (
              <span className="los-score-sub">Hasta hoy: {pts.earnedSoFar} de {pts.possibleSoFar} pts ({pts.pctSoFar}%)</span>
            )}
          </div>
        </div>
      )}

      {weeks.length > 0 && (
        <div className="los-week-breakdown">
          <h4 className="los-plan-title" style={{ marginTop: 4 }}>Semana por semana</h4>
          <ul className="los-mini-goal-list">
            {weeks.map((w) => (
              <li key={w.label}>
                <span>{w.label} <span className="los-week-range">({w.range})</span></span>
                <ProgressBar value={w.pct} tone={w.pct === 100 ? "forest" : "brass"} />
                <span className="los-mini-goal-amt">{w.earned}/{w.possible} · {w.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="los-cal-weekdays">
        {WEEKDAY_LABELS.map((l) => <span key={l}>{l}</span>)}
      </div>
      <div className="los-cal-grid">
        {Array.from({ length: info.leadingBlanks }).map((_, i) => <div key={`b${i}`} className="los-cal-cell blank" />)}
        {info.days.map((d) => {
          let style = {};
          let cls = "los-cal-cell";
          if (d.future) cls += " future";
          else if (d.applicable === 0) cls += " empty";
          else if (d.extraordinary) cls += " extraordinary";
          else style = { backgroundColor: `rgba(59,110,82,${0.12 + d.ratio * 0.55})` };
          return (
            <div key={d.iso} className={cls} style={style} title={d.applicable ? `${d.done}/${d.applicable} hábitos cumplidos` : ""}>
              {d.extraordinary ? <Sparkles size={11} /> : <span>{d.day}</span>}
            </div>
          );
        })}
      </div>
      <div className="los-cal-legend">
        <span><i className="los-legend-dot extraordinary" /> Día extraordinario (100%)</span>
        <span><i className="los-legend-dot partial" /> Parcial</span>
        <span><i className="los-legend-dot empty" /> Sin hábitos</span>
      </div>
    </div>
  );
}

function HabitDayView({ data, actions, dayOffset, setDayOffset }) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const dateISO = d.toISOString().slice(0, 10);
  const applicable = data.habits.filter((h) => habitAppliesToDate(h, dateISO));
  const info = dayCompletionInfo(data.habits, data.habitLogs, dateISO);
  const label = d.toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="los-card">
      <div className="los-week-nav" style={{ marginBottom: 10 }}>
        <button className="los-icon-btn" onClick={() => setDayOffset((x) => x - 1)} aria-label="Día anterior"><ChevronLeft size={18} /></button>
        <span>{label.charAt(0).toUpperCase() + label.slice(1)}</span>
        <button className="los-icon-btn" onClick={() => setDayOffset((x) => x + 1)} aria-label="Día siguiente"><ChevronRight size={18} /></button>
        {dayOffset !== 0 && <button className="los-link-btn" onClick={() => setDayOffset(0)}>Volver a hoy</button>}
      </div>
      {info.applicable > 0 && info.extraordinary && (
        <div className="los-extraordinary-banner"><Sparkles size={15} /> ¡Día extraordinario! Cumpliste todo.</div>
      )}
      {applicable.length === 0 ? (
        <p className="los-section-sub">No tenés hábitos programados para este día.</p>
      ) : (
        <ul className="los-today-habit-list">
          {applicable.map((h) => {
            const checked = !!data.habitLogs[`${h.id}|${dateISO}`];
            return (
              <li key={h.id}>
                <button className={`los-step-check ${checked ? "done" : ""}`} onClick={() => actions.toggleHabitLog(h.id, dateISO)}>
                  {checked && <Check size={12} />}
                </button>
                <span>{h.name}</span>
                <span className="los-badge sm">{h.points || 10} pts</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function HabitosTab({ data, actions }) {
  const [viewMode, setViewMode] = useState("semana");
  const [dayOffset, setDayOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekInfo = useMemo(() => weekPointsInfo(data.habits, data.habitLogs, weekDates), [data.habits, data.habitLogs, weekDates]);
  const weekIsExtraordinary = weekInfo.extraordinary;

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>Tus hábitos</h2>
          <p className="los-section-sub">Sumá puntos cada día cumplido y mirá tu porcentaje semanal.</p>
        </div>
        <button className="los-btn los-btn-primary" onClick={() => { setEditingHabit(null); setShowForm(true); }}><Plus size={16} /> Nuevo hábito</button>
      </div>

      <div className={`los-card los-score-card ${weekIsExtraordinary ? "is-extraordinary" : ""}`}>
        <div>
          <span className="los-hero-label" style={{ color: "var(--slate)" }}>Puntaje de la semana</span>
          <span className="los-hero-value tone-azul">{weekInfo.pct}%</span>
          {weekIsExtraordinary && <span className="los-extraordinary-badge"><Sparkles size={12} /> Semana extraordinaria</span>}
          {weekInfo.onTrack && <span className="los-ontrack-badge"><Check size={12} /> Vas perfecto hasta hoy</span>}
        </div>
        <div className="los-score-right">
          <span className="los-score-pts">{weekInfo.earned} / {weekInfo.possible} pts</span>
          {!weekInfo.weekComplete && weekInfo.possibleSoFar > 0 && (
            <span className="los-score-sub">Hasta hoy: {weekInfo.earnedSoFar} de {weekInfo.possibleSoFar} pts ({weekInfo.pctSoFar}%)</span>
          )}
        </div>
      </div>

      {data.habits.length > 0 && (
        <div className="los-card">
          <h3 className="los-card-title">Puntos día por día</h3>
          <div className="los-daybreak">
            {weekDates.map((d, i) => {
              const di = dayCompletionInfo(data.habits, data.habitLogs, d);
              const future = d > todayISO();
              const isToday = d === todayISO();
              return (
                <div key={d} className={`los-daybreak-col ${di.extraordinary && !future ? "extraordinary" : ""} ${future ? "future" : ""} ${isToday ? "is-today" : ""}`}>
                  <span className="los-db-day">{WEEKDAY_FULL_SHORT[i]}</span>
                  {di.possible === 0 ? (
                    <span className="los-db-empty">—</span>
                  ) : (
                    <>
                      <div className="los-db-bar-track">
                        <div className="los-db-bar-fill" style={{ height: `${di.pct}%` }} />
                      </div>
                      <span className="los-db-pts">{di.earned}/{di.possible}</span>
                      <span className="los-db-pct">{future ? "—" : `${di.pct}%`}</span>
                      {di.extraordinary && !future && <Sparkles size={11} className="los-db-star" />}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <p className="los-plan-hint" style={{ marginTop: 10 }}>
            Un día con estrella es un <strong>día extraordinario</strong>: cumpliste todos los hábitos que tenías para ese día.
          </p>
        </div>
      )}

      <div className="los-filters">
        {[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, l]) => (
          <button key={k} className={`los-filter-btn ${viewMode === k ? "active" : ""}`} onClick={() => setViewMode(k)}>{l}</button>
        ))}
      </div>

      {data.habits.length === 0 ? (
        <EmptyState icon={Flame} text="Todavía no cargaste ningún hábito." actionLabel="Crear el primero" onAction={() => setShowForm(true)} />
      ) : viewMode === "dia" ? (
        <HabitDayView data={data} actions={actions} dayOffset={dayOffset} setDayOffset={setDayOffset} />
      ) : viewMode === "mes" ? (
        <HabitMonthCalendar data={data} monthOffset={monthOffset} setMonthOffset={setMonthOffset} />
      ) : (
        <>
          <div className="los-week-nav">
            <button className="los-icon-btn" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Semana anterior"><ChevronLeft size={18} /></button>
            <span>{weekOffset === 0 ? "Esta semana" : `${formatDateShort(weekDates[0])} – ${formatDateShort(weekDates[6])}`}</span>
            <button className="los-icon-btn" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Semana siguiente"><ChevronRight size={18} /></button>
            {weekOffset !== 0 && <button className="los-link-btn" onClick={() => setWeekOffset(0)}>Volver a hoy</button>}
          </div>

          <div className="los-card los-habit-table">
            <div className="los-habit-row los-habit-head">
              <span>Hábito</span>
              <div className="los-habit-days">
                {weekDates.map((d, i) => {
                  const dInfo = dayCompletionInfo(data.habits, data.habitLogs, d);
                  const future = d > todayISO();
                  return (
                    <span key={d} className={d === todayISO() ? "is-today" : ""}>
                      {!future && dInfo.extraordinary && <Sparkles size={10} style={{ display: "block", margin: "0 auto 2px", color: "var(--brass)" }} />}
                      {WEEKDAY_LABELS[i]}
                    </span>
                  );
                })}
              </div>
              <span></span>
            </div>
            {data.habits.map((h) => {
              const streak = habitStreak(h.id, data.habitLogs);
              const goal = data.goals.find((g) => g.id === h.goalId);
              return (
                <div className="los-habit-row" key={h.id}>
                  <div className="los-habit-name">
                    <strong>{h.name}</strong>
                    <span className="los-badge sm">{h.points || 10} pts</span>
                    {h.shared && <span className="los-shared-badge"><Users size={11} /> Compartido</span>}
                    {goal && <span className="los-badge sm">{goal.title}</span>}
                    {streak > 0 && (
                      <span className={`los-streak-badge ${streak >= 7 ? "hot" : ""}`} title={`${streak} días seguidos cumpliendo este hábito`}>
                        <Flame size={13} /> {streak} {streak === 1 ? "día" : "días"} seguidos
                      </span>
                    )}
                  </div>
                  <div className="los-habit-days">
                    {weekDates.map((d) => {
                      const applies = habitAppliesToDate(h, d);
                      const checked = !!data.habitLogs[`${h.id}|${d}`];
                      const future = d > todayISO();
                      return (
                        <button
                          key={d}
                          disabled={!applies}
                          className={`los-day-cell ${checked ? "checked" : ""} ${!applies ? "muted" : ""} ${future ? "future" : ""}`}
                          onClick={() => applies && actions.toggleHabitLog(h.id, d)}
                          aria-label={`${h.name} ${d}`}
                        >
                          {checked && <Check size={13} />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="los-card-actions">
                    <button className="los-icon-btn" onClick={() => { setEditingHabit(h); setShowForm(true); }} aria-label="Editar hábito"><Pencil size={14} /></button>
                    <button className="los-icon-btn" onClick={() => actions.deleteHabit(h.id)} aria-label="Borrar hábito"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>

        </>
      )}

      {showForm && (
        <HabitForm
          initial={editingHabit}
          goals={data.goals}
          onCancel={() => setShowForm(false)}
          onSave={(h) => { editingHabit ? actions.updateHabit(h) : actions.addHabit(h); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Retos                                                                     */
/* ---------------------------------------------------------------------- */

function ChallengeForm({ initial, onCancel, onSave, goals }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [startDate, setStartDate] = useState(initial?.startDate || todayISO());
  const [days, setDays] = useState(initial?.days || 30);
  const [goalId, setGoalId] = useState(initial?.goalId || "");
  const [isShared, setIsShared] = useState(!!initial?.shared);
  const [error, setError] = useState("");

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim()) { setError("Escribí un nombre para el reto."); return; }
    const n = Number(days);
    if (!n || n < MIN_CHALLENGE_DAYS) { setError(`Un reto tiene que durar al menos ${MIN_CHALLENGE_DAYS} días. Esa es la idea: sostenerlo en el tiempo.`); return; }
    setError("");
    onSave({ id: initial?.id || uid(), title: title.trim(), description: description.trim(), startDate, days: n, goalId: goalId || null, shared: isShared });
  }

  const endPreview = addDaysISO(startDate, (Number(days) || MIN_CHALLENGE_DAYS) - 1);

  return (
    <Modal title={initial ? "Editar reto" : "Nuevo reto"} onClose={onCancel}>
      <form className="los-form" onSubmit={submit}>
        <label className="los-label">Nombre del reto
          <input className="los-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: 90 días sin alcohol" autoFocus />
        </label>
        <label className="los-label">¿En qué consiste? (opcional)
          <textarea className="los-textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Las reglas del reto, para tenerlas claras." />
        </label>

        <label className="los-label">Duración</label>
        <div className="los-preset-row">
          {CHALLENGE_PRESETS.map((d) => (
            <button type="button" key={d} className={`los-preset-btn ${Number(days) === d ? "active" : ""}`} onClick={() => setDays(d)}>{d} días</button>
          ))}
        </div>
        <div className="los-form-row">
          <label className="los-label">Días (mínimo {MIN_CHALLENGE_DAYS})
            <input className="los-input" type="number" value={days} onChange={(e) => setDays(e.target.value)} />
          </label>
          <label className="los-label">Fecha de arranque
            <input className="los-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <p className="los-plan-hint">Termina el {formatDateShort(endPreview)}. Un reto no puede durar menos de {MIN_CHALLENGE_DAYS} días.</p>

        <label className="los-label">Vincular a una meta (opcional)
          <select className="los-select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">— Ninguna —</option>
            {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
        <label className="los-checkline los-shared-line">
          <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
          <Users size={15} /> Reto compartido (lo hacemos juntos)
        </label>

        {error && <p className="los-error">{error}</p>}
        <div className="los-form-actions">
          <button type="button" className="los-btn los-btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" onClick={submit} className="los-btn los-btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function ChallengeCard({ challenge, logs, goals, actions, onEdit }) {
  const info = challengeInfo(challenge, logs);
  const goal = goals.find((g) => g.id === challenge.goalId);
  const today = todayISO();
  const todayInRange = today >= info.start && today <= info.endDate;
  const todayDone = !!logs[`${challenge.id}|${today}`];

  return (
    <div className={`los-card los-challenge-card ${info.perfect ? "is-perfect" : ""}`}>
      {info.perfect && <div className="los-stamp"><Trophy size={15} /> Completado</div>}
      <div className="los-goal-top">
        <span className="los-badge">{info.total} días</span>
        {challenge.shared && <span className="los-shared-badge"><Users size={11} /> Compartido</span>}
        <span className="los-goal-date">{formatDateShort(info.start)} → {formatDateShort(info.endDate)}</span>
      </div>
      <h3 className="los-goal-title">{challenge.title}</h3>
      {challenge.description && <p className="los-goal-desc">{challenge.description}</p>}
      {goal && <span className="los-badge sm">{goal.title}</span>}

      <div className="los-challenge-stats">
        <div><strong>{info.doneCount}</strong><span>cumplidos</span></div>
        <div><strong>{info.notStarted ? info.total : info.daysLeft}</strong><span>restantes</span></div>
        <div><strong>{info.streak}</strong><span>racha</span></div>
        <div className={info.missedCount > 0 ? "tone-rust" : ""}><strong>{info.missedCount}</strong><span>fallados</span></div>
      </div>

      <ProgressBar value={info.pct} tone={info.perfect ? "forest" : "brass"} />
      <p className="los-progress-label">{info.pct}% del reto ({info.doneCount} de {info.total} días)</p>

      {info.notStarted ? (
        <p className="los-plan-hint">Arranca el {formatDateShort(info.start)}.</p>
      ) : todayInRange ? (
        <button className={`los-btn ${todayDone ? "los-btn-ghost" : "los-btn-primary"} los-today-btn`} onClick={() => actions.toggleChallengeLog(challenge.id, today)}>
          {todayDone ? <><Check size={16} /> Hoy cumplido</> : <>Marcar hoy como cumplido</>}
        </button>
      ) : (
        <p className="los-plan-hint">{info.perfect ? "¡Lo completaste entero, sin fallar un día!" : "El reto terminó."}</p>
      )}

      <div className="los-challenge-grid">
        {info.days.map((d) => (
          <button
            key={d.iso}
            className={`los-chal-cell ${d.done ? "done" : ""} ${d.missed ? "missed" : ""} ${d.future ? "future" : ""} ${d.iso === today ? "is-today" : ""}`}
            disabled={d.future}
            onClick={() => !d.future && actions.toggleChallengeLog(challenge.id, d.iso)}
            title={`Día ${d.index} — ${formatDateShort(d.iso)}`}
          >
            {d.index}
          </button>
        ))}
      </div>

      <div className="los-card-footer">
        <span className="los-goal-date">Día {Math.min(info.elapsed || 1, info.total)} de {info.total}</span>
        <div className="los-card-actions">
          <button className="los-icon-btn" onClick={() => onEdit(challenge)} aria-label="Editar reto"><Pencil size={15} /></button>
          <button className="los-icon-btn" onClick={() => actions.deleteChallenge(challenge.id)} aria-label="Borrar reto"><Trash2 size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function RetosTab({ data, actions }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("activos");

  const challenges = (data.challenges || []).filter((ch) => {
    const info = challengeInfo(ch, data.challengeLogs || {});
    if (filter === "activos") return !info.finished;
    if (filter === "terminados") return info.finished;
    return true;
  });

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>Tus retos</h2>
          <p className="los-section-sub">Compromisos largos para trabajar la disciplina. Mínimo {MIN_CHALLENGE_DAYS} días.</p>
        </div>
        <button className="los-btn los-btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> Nuevo reto</button>
      </div>

      <div className="los-filters">
        {[["activos", "Activos"], ["terminados", "Terminados"], ["todos", "Todos"]].map(([k, l]) => (
          <button key={k} className={`los-filter-btn ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {challenges.length === 0 ? (
        <EmptyState icon={Trophy} text="No tenés retos acá." actionLabel="Crear un reto" onAction={() => { setEditing(null); setShowForm(true); }} />
      ) : (
        <div className="los-grid">
          {challenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              logs={data.challengeLogs || {}}
              goals={data.goals}
              actions={actions}
              onEdit={(c) => { setEditing(c); setShowForm(true); }}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ChallengeForm
          initial={editing}
          goals={data.goals}
          onCancel={() => setShowForm(false)}
          onSave={(ch) => { editing ? actions.updateChallenge(ch) : actions.addChallenge(ch); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Tareas                                                                   */
/* ---------------------------------------------------------------------- */

function TaskForm({ onCancel, onSave, goals }) {
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [goalId, setGoalId] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!text.trim()) { setError("Escribí qué tarea querés agregar."); return; }
    setError("");
    onSave({ id: uid(), text: text.trim(), dueDate: dueDate || "", goalId: goalId || null, done: false });
  }

  return (
    <Modal title="Nueva tarea" onClose={onCancel}>
      <form className="los-form" onSubmit={submit}>
        <label className="los-label">Tarea
          <input className="los-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej: Llamar al banco" autoFocus />
        </label>
        <div className="los-form-row">
          <label className="los-label">Fecha límite (opcional)
            <input className="los-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="los-label">Objetivo vinculado (opcional)
            <select className="los-select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">— Ninguno —</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
        </div>
        {error && <p className="los-error">{error}</p>}
        <div className="los-form-actions">
          <button type="button" className="los-btn los-btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" onClick={submit} className="los-btn los-btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function TareasTab({ data, actions }) {
  const [filter, setFilter] = useState("pendientes");
  const [showForm, setShowForm] = useState(false);

  const tasks = data.tasks
    .filter((t) => filter === "todas" ? true : filter === "pendientes" ? !t.done : t.done)
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>Tus tareas</h2>
          <p className="los-section-sub">Lo concreto del día a día para avanzar en tus metas.</p>
        </div>
        <button className="los-btn los-btn-primary" onClick={() => setShowForm(true)}><Plus size={16} /> Nueva tarea</button>
      </div>

      <div className="los-filters">
        {[["pendientes", "Pendientes"], ["completadas", "Completadas"], ["todas", "Todas"]].map(([k, l]) => (
          <button key={k} className={`los-filter-btn ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} text="No hay tareas acá." actionLabel="Agregar una tarea" onAction={() => setShowForm(true)} />
      ) : (
        <div className="los-card los-task-list">
          {tasks.map((t) => {
            const goal = data.goals.find((g) => g.id === t.goalId);
            const overdue = t.dueDate && !t.done && t.dueDate < todayISO();
            return (
              <div className={`los-task-row ${t.done ? "done" : ""}`} key={t.id}>
                <button className="los-step-check" onClick={() => actions.toggleTask(t.id)} aria-label="Completar tarea">
                  {t.done && <Check size={12} />}
                </button>
                <div className="los-task-info">
                  <span>{t.text}</span>
                  <div className="los-task-meta">
                    {t.dueDate && <span className={overdue ? "overdue" : ""}>{formatDateShort(t.dueDate)}</span>}
                    {goal && <span className="los-badge sm">{goal.title}</span>}
                  </div>
                </div>
                <button className="los-icon-btn" onClick={() => actions.deleteTask(t.id)} aria-label="Borrar tarea"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <TaskForm goals={data.goals} onCancel={() => setShowForm(false)} onSave={(t) => { actions.addTask(t); setShowForm(false); }} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Finanzas                                                                  */
/* ---------------------------------------------------------------------- */

function TransactionForm({ onCancel, onSave, goals, presetType }) {
  const [type, setType] = useState(presetType || "expense");
  const [category, setCategory] = useState(type === "income" ? INCOME_CATS[0] : EXPENSE_CATS[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [goalId, setGoalId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setCategory(type === "income" ? INCOME_CATS[0] : EXPENSE_CATS[0]);
    setGoalId("");
  }, [type]);

  const isGoalLinked = type === "expense" && category === "Ahorro / Objetivo";
  const financialGoals = goals.filter((g) => Number(g.targetAmount) > 0);

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!amount || Number(amount) <= 0) { setError("Ingresá un monto mayor a 0."); return; }
    setError("");
    onSave({
      id: uid(), type, category, amount: Number(amount), description: description.trim(), date,
      goalId: isGoalLinked && goalId ? goalId : null
    });
  }

  return (
    <Modal title={type === "income" ? "Nuevo ingreso" : "Nuevo gasto"} onClose={onCancel}>
      <form className="los-form" onSubmit={submit}>
        <div className="los-type-toggle">
          <button type="button" className={`los-toggle-btn ${type === "expense" ? "active rust" : ""}`} onClick={() => setType("expense")}>Gasto</button>
          <button type="button" className={`los-toggle-btn ${type === "income" ? "active forest" : ""}`} onClick={() => setType("income")}>Ingreso</button>
        </div>
        <label className="los-label">Categoría
          <select className="los-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {(type === "income" ? INCOME_CATS : EXPENSE_CATS).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {isGoalLinked && (
          <label className="los-label">Vincular a objetivo (suma al monto ahorrado)
            <select className="los-select" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">— Ninguno —</option>
              {financialGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </label>
        )}
        <div className="los-form-row">
          <label className="los-label">Monto
            <input className="los-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <label className="los-label">Fecha
            <input className="los-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="los-label">Descripción (opcional)
          <input className="los-input" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Compra en el Disco" />
        </label>
        {error && <p className="los-error">{error}</p>}
        <div className="los-form-actions">
          <button type="button" className="los-btn los-btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" onClick={submit} className="los-btn los-btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function AiImportCard({ actions, currencySymbol }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [date, setDate] = useState(todayISO());
  const fileRef = React.useRef(null);

  async function handleFiles(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setError("");
    try {
      const loaded = await Promise.all(files.slice(0, 4).map(fileToBase64));
      setImages((prev) => [...prev, ...loaded].slice(0, 4));
    } catch (err) {
      setError("No pude leer esa imagen. Probá con otra.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function removeImage(i) {
    setImages((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleClassify() {
    if (!text.trim() && images.length === 0) return;
    setLoading(true); setError(""); setPreview(null);
    try {
      const items = await classifyExpensesWithAI({ text, images });
      if (!items.length) {
        setError("No encontré gastos ni ingresos ahí. Probá con otra imagen o escribilos a mano.");
        setLoading(false);
        return;
      }
      setPreview(items.map((it) => {
        const type = it.type === "income" ? "income" : "expense";
        const validCats = type === "income" ? INCOME_CATS : EXPENSE_CATS;
        const validDate = it.date && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : null;
        return {
          id: uid(),
          amount: Number(it.amount) || 0,
          type,
          category: validCats.includes(it.category) ? it.category : (type === "income" ? "Otros ingresos" : "Otros gastos"),
          description: it.description || "",
          date: validDate,
          include: true
        };
      }));
    } catch (e) {
      setError("No pude interpretar eso. Probá reformular el texto (uno por línea) o mandar una imagen más nítida.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(id, patch) {
    setPreview((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function confirmImport() {
    preview.filter((r) => r.include && Number(r.amount) > 0).forEach((r) => {
      actions.addTransaction({
        id: uid(), type: r.type, category: r.category, amount: Number(r.amount),
        description: r.description, date: r.date || date, goalId: null
      });
    });
    setPreview(null);
    setText("");
    setImages([]);
  }

  const total = preview ? preview.filter((r) => r.include).reduce((s, r) => s + (r.type === "expense" ? -Number(r.amount) : Number(r.amount)), 0) : 0;

  return (
    <div className="los-card">
      <h3 className="los-card-title"><Sparkles size={16} /> Cargar con IA</h3>
      <p className="los-section-sub">
        Pegá tus notas tal cual las anotaste (ej: "3400 almacen, 400 nafta") <strong>o subí una foto</strong> de una factura,
        un ticket o una captura de un chat. La IA separa y clasifica todo, y te lo deja para revisar antes de guardar.
      </p>

      <textarea className="los-textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="3400 almacen, 400 nafta, 45000 auto..." />

      {images.length > 0 && (
        <div className="los-ai-thumbs">
          {images.map((img, i) => (
            <div className="los-ai-thumb" key={i}>
              <img src={img.preview} alt={img.name || `imagen ${i + 1}`} />
              <button className="los-thumb-del" onClick={() => removeImage(i)} aria-label="Quitar imagen"><X size={12} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="los-ai-controls">
        <div className="los-ai-left">
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: "none" }} />
          <button className="los-btn los-btn-ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={images.length >= 4}>
            <ImagePlus size={15} /> {images.length ? `Otra foto (${images.length}/4)` : "Subir foto"}
          </button>
          <label className="los-label los-inline-label">Fecha
            <input className="los-input los-input-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Se usa si la imagen no trae fecha" />
          </label>
        </div>
        <button className="los-btn los-btn-primary" onClick={handleClassify} disabled={loading || (!text.trim() && images.length === 0)}>
          {loading ? <><Loader2 size={15} className="spin" /> Leyendo...</> : <><Sparkles size={15} /> Interpretar</>}
        </button>
      </div>
      {error && <p className="los-error">{error}</p>}

      {preview && (
        <div className="los-ai-preview">
          {preview.map((r) => (
            <div className="los-ai-row" key={r.id}>
              <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.id, { include: e.target.checked })} aria-label="Incluir" />
              <select className="los-select los-select-sm" value={r.type} onChange={(e) => { const t = e.target.value; updateRow(r.id, { type: t, category: t === "income" ? INCOME_CATS[0] : EXPENSE_CATS[0] }); }}>
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
              <select className="los-select los-select-sm" value={r.category} onChange={(e) => updateRow(r.id, { category: e.target.value })}>
                {(r.type === "income" ? INCOME_CATS : EXPENSE_CATS).map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <input className="los-input los-input-sm los-ai-desc" type="text" value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value })} placeholder="Descripción" />
              <input className="los-input los-input-sm los-ai-amount" type="number" value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} />
              {r.date && <span className="los-ai-date">{formatDateShort(r.date)}</span>}
            </div>
          ))}
          <div className="los-card-footer">
            <span className={total >= 0 ? "tone-forest" : "tone-rust"} style={{ fontFamily: "IBM Plex Mono", fontWeight: 600 }}>Neto: {fmtMoney(total, currencySymbol)}</span>
            <div className="los-card-actions">
              <button className="los-btn los-btn-ghost" onClick={() => setPreview(null)}>Descartar</button>
              <button className="los-btn los-btn-primary" onClick={confirmImport}>Confirmar e importar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnnualPlanCard({ data, actions, currencySymbol }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const annualGoal = Number(data.settings.annualGoal || 0);
  const overrides = data.settings.annualOverrides || {};

  function setGoal(v) { actions.updateSettings({ annualGoal: Number(v || 0) }); }
  function setOverride(key, v) {
    const next = { ...overrides };
    if (v === "" || v == null) delete next[key];
    else next[key] = Number(v);
    actions.updateSettings({ annualOverrides: next });
  }

  const months = useMemo(() => {
    let cumulative = 0;
    const arr = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      const target = overrides[key] != null ? Number(overrides[key]) : (annualGoal > 0 ? Math.round(annualGoal / 12) : 0);
      const t = monthTotals(data.transactions, key);
      cumulative += t.balance;
      const pctMonth = target > 0 ? Math.round((t.balance / target) * 100) : null;
      arr.push({ key, label: monthShortName(m), target, actual: t.balance, cumulative, pctMonth });
    }
    return arr;
  }, [data.transactions, year, annualGoal, overrides]);

  const totalCumulative = months[11] ? months[11].cumulative : 0;
  const pct = annualGoal > 0 ? Math.min(100, Math.round((Math.max(0, totalCumulative) / annualGoal) * 100)) : 0;

  return (
    <div className="los-card">
      <h3 className="los-card-title"><PiggyBank size={16} /> Plan anual de ahorro</h3>
      <p className="los-section-sub">Definí cuánto querés ahorrar cada mes y compará contra lo que realmente ahorraste (ingresos − gastos de ese mes).</p>
      <div className="los-form-row">
        <label className="los-label">Año
          <input className="los-input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
        </label>
        <label className="los-label">Meta anual de ahorro
          <input className="los-input" type="number" defaultValue={annualGoal || ""} onBlur={(e) => setGoal(e.target.value)} placeholder="0" />
        </label>
      </div>
      {annualGoal > 0 && (
        <>
          <ProgressBar value={pct} tone={pct >= 100 ? "forest" : "azul"} />
          <p className="los-progress-label">Ahorrado en {year}: <span className="tone-azul">{fmtMoney(totalCumulative, currencySymbol)}</span> de {fmtMoney(annualGoal, currencySymbol)} ({pct}%)</p>
        </>
      )}
      <div className="los-annual-table-wrap">
        <div className="los-annual-table">
          <div className="los-annual-row los-annual-head">
            <span>Mes</span><span>Meta de ahorro</span><span>Ahorrado real</span><span>% cumplido</span>
          </div>
          {months.map((m) => (
            <div className="los-annual-row" key={m.key}>
              <span>{m.label}</span>
              <input className="los-input los-input-sm" type="number" defaultValue={m.target || ""} placeholder="0" onBlur={(e) => setOverride(m.key, e.target.value)} />
              <span className={m.actual >= 0 ? "tone-forest" : "tone-rust"}>{fmtMoney(m.actual, currencySymbol)}</span>
              <span className={m.pctMonth == null ? "tone-muted" : m.pctMonth >= 100 ? "tone-forest" : "tone-rust"}>
                {m.pctMonth == null ? "—" : `${m.pctMonth}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FinanzasTab({ data, actions, currencySymbol }) {
  const [filterMode, setFilterMode] = useState("mes");
  const [month, setMonth] = useState(currentMonthKey());
  const [rangeStart, setRangeStart] = useState(firstOfMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [showForm, setShowForm] = useState(false);
  const [presetType, setPresetType] = useState("expense");

  const filtered = useMemo(() => {
    if (filterMode === "rango") {
      return data.transactions.filter((t) => (!rangeStart || t.date >= rangeStart) && (!rangeEnd || t.date <= rangeEnd));
    }
    return data.transactions.filter((t) => monthKeyOf(t.date) === month);
  }, [data.transactions, filterMode, month, rangeStart, rangeEnd]);

  const totals = useMemo(() => sumTotals(filtered), [filtered]);
  const breakdown = useMemo(() => {
    const map = {};
    filtered.forEach((t) => { if (t.type === "expense") map[t.category] = (map[t.category] || 0) + Number(t.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const trend = useMemo(() => {
    const keys = lastNMonthKeys(6, currentMonthKey());
    return keys.map((k) => {
      const t = monthTotals(data.transactions, k);
      return { mes: monthLabel(k), Ingresos: t.income, Gastos: t.expense };
    });
  }, [data.transactions]);

  const periodLabel = filterMode === "rango" ? `${formatDateShort(rangeStart)} – ${formatDateShort(rangeEnd)}` : monthLabel(month);
  const sharedFinancialGoals = data.goals.filter((g) => Number(g.targetAmount) > 0 && g.shared);
  const periodTxns = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const maxCat = breakdown.length ? breakdown[0][1] : 0;

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>Economía del hogar</h2>
          <p className="los-section-sub">Ingresos, gastos y cuánto debería quedar en el banco.</p>
        </div>
        <div className="los-card-actions">
          <button className="los-btn los-btn-income" onClick={() => { setPresetType("income"); setShowForm(true); }}><TrendingUp size={16} /> Cargar ingreso</button>
          <button className="los-btn los-btn-expense" onClick={() => { setPresetType("expense"); setShowForm(true); }}><TrendingDown size={16} /> Cargar gasto</button>
        </div>
      </div>

      <div className="los-shared-note"><Users size={15} /> Las finanzas son una sola para toda la casa: lo que carga cualquier perfil lo ven todos.</div>

      <div className="los-filters">
        <button className={`los-filter-btn ${filterMode === "mes" ? "active" : ""}`} onClick={() => setFilterMode("mes")}>Por mes</button>
        <button className={`los-filter-btn ${filterMode === "rango" ? "active" : ""}`} onClick={() => setFilterMode("rango")}>Por rango de fechas</button>
      </div>

      {filterMode === "mes" ? (
        <div className="los-week-nav">
          <button className="los-icon-btn" onClick={() => setMonth((m) => shiftMonthKey(m, -1))} aria-label="Mes anterior"><ChevronLeft size={18} /></button>
          <span>{monthLabel(month)}</span>
          <button className="los-icon-btn" onClick={() => setMonth((m) => shiftMonthKey(m, 1))} aria-label="Mes siguiente"><ChevronRight size={18} /></button>
          {month !== currentMonthKey() && <button className="los-link-btn" onClick={() => setMonth(currentMonthKey())}>Volver a este mes</button>}
        </div>
      ) : (
        <div className="los-range-nav">
          <label className="los-label los-inline-label">Desde
            <input className="los-input los-input-sm" type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
          </label>
          <label className="los-label los-inline-label">Hasta
            <input className="los-input los-input-sm" type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
          </label>
        </div>
      )}

      <div className="los-stat-row">
        <div className="los-stat">
          <span className="los-stat-label"><TrendingUp size={14} /> Ingresos</span>
          <span className="los-stat-value tone-azul">{fmtMoney(totals.income, currencySymbol)}</span>
        </div>
        <div className="los-stat">
          <span className="los-stat-label"><TrendingDown size={14} /> Gastos</span>
          <span className="los-stat-value tone-rust">{fmtMoney(totals.expense, currencySymbol)}</span>
        </div>
        <div className="los-stat">
          <span className="los-stat-label"><Landmark size={14} /> Plata en banco</span>
          <span className={`los-stat-value ${totals.balance >= 0 ? "tone-forest" : "tone-rust"}`}>{fmtMoney(totals.balance, currencySymbol)}</span>
          {totals.balance < 0 && <span className="los-stat-hint">gastaste más de lo que entró</span>}
        </div>
      </div>

      <div className="los-card">
        <h3 className="los-card-title">Movimientos — {periodLabel}</h3>
        {periodTxns.length === 0 ? <p className="los-section-sub">No hay movimientos cargados en este período.</p> : (
          <div className="los-txn-list">
            {periodTxns.map((t) => (
              <div className="los-txn-row" key={t.id}>
                <span className="los-txn-date">{formatDateShort(t.date)}</span>
                <div className="los-txn-info">
                  <strong>{t.category}</strong>
                  {t.description && <span className="los-txn-desc">{t.description}</span>}
                </div>
                <span className={`los-txn-amt ${t.type === "income" ? "tone-forest" : "tone-rust"}`}>
                  {t.type === "income" ? "+" : "−"}{fmtMoney(t.amount, currencySymbol)}
                </span>
                <button className="los-icon-btn" onClick={() => actions.deleteTransaction(t.id)} aria-label="Borrar movimiento"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="los-card">
        <h3 className="los-card-title">Gastos por categoría — {periodLabel}</h3>
        {breakdown.length === 0 ? <p className="los-section-sub">Sin gastos cargados en este período.</p> : (
          <ul className="los-cat-list">
            {breakdown.map(([cat, amt]) => (
              <li key={cat}>
                <span className="los-cat-name">{cat}</span>
                <div className="los-cat-bar-track"><div className="los-cat-bar-fill" style={{ width: `${maxCat ? (amt / maxCat) * 100 : 0}%` }} /></div>
                <span className="los-cat-amt">{fmtMoney(amt, currencySymbol)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AiImportCard actions={actions} currencySymbol={currencySymbol} />

      {sharedFinancialGoals.length > 0 && (
        <div className="los-card">
          <h3 className="los-card-title"><Target size={16} /> Objetivos compartidos de la casa</h3>
          <ul className="los-mini-goal-list">
            {sharedFinancialGoals.map((g) => (
              <li key={g.id}>
                <span>{g.title}</span>
                <ProgressBar value={goalProgress(g)} tone="brass" />
                <span className="los-mini-goal-amt">{fmtMoney(g.currentAmount, goalCurrency(g))} / {fmtMoney(g.targetAmount, goalCurrency(g))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AnnualPlanCard data={data} actions={actions} currencySymbol={currencySymbol} />

      <div className="los-card">
        <h3 className="los-card-title">Ingresos vs. gastos — últimos 6 meses</h3>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8D8C8" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#5B6B66" }} />
              <YAxis tick={{ fontSize: 12, fill: "#5B6B66" }} width={48} />
              <Tooltip formatter={(v) => fmtMoney(v, currencySymbol)} contentStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos" fill="#2F5570" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Gastos" fill="#A14B36" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {showForm && (
        <TransactionForm
          goals={data.goals}
          presetType={presetType}
          onCancel={() => setShowForm(false)}
          onSave={(t) => { actions.addTransaction(t); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Notas                                                                     */
/* ---------------------------------------------------------------------- */

function NoteForm({ initial, onCancel, onSave }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const [error, setError] = useState("");

  function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!title.trim() && !content.trim()) { setError("Escribí al menos un título o contenido para guardar la nota."); return; }
    setError("");
    onSave({ id: initial?.id || uid(), title: title.trim() || "Sin título", content: content.trim(), date: initial?.date || todayISO() });
  }

  return (
    <Modal title={initial ? "Editar nota" : "Nueva nota"} onClose={onCancel}>
      <form className="los-form" onSubmit={submit}>
        <label className="los-label">Título
          <input className="los-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Por qué quiero esto" autoFocus />
        </label>
        <label className="los-label">Contenido
          <textarea className="los-textarea" value={content} onChange={(e) => setContent(e.target.value)} rows={8} placeholder="Escribí acá tus objetivos, reflexiones, planes..." />
        </label>
        {error && <p className="los-error">{error}</p>}
        <div className="los-form-actions">
          <button type="button" className="los-btn los-btn-ghost" onClick={onCancel}>Cancelar</button>
          <button type="button" onClick={submit} className="los-btn los-btn-primary">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

function NotasTab({ data, actions }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const notes = [...data.notes].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>Tus notas</h2>
          <p className="los-section-sub">Un espacio libre para escribir objetivos, ideas y reflexiones.</p>
        </div>
        <button className="los-btn los-btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}><Plus size={16} /> Nueva nota</button>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={BookOpen} text="Todavía no escribiste ninguna nota." actionLabel="Escribir la primera" onAction={() => setShowForm(true)} />
      ) : (
        <div className="los-grid">
          {notes.map((n) => (
            <div className="los-card los-note-card" key={n.id}>
              <div className="los-card-footer" style={{ marginBottom: 8 }}>
                <span className="los-goal-date">{formatDateShort(n.date)}</span>
                <div className="los-card-actions">
                  <button className="los-icon-btn" onClick={() => { setEditing(n); setShowForm(true); }} aria-label="Editar nota"><Pencil size={14} /></button>
                  <button className="los-icon-btn" onClick={() => actions.deleteNote(n.id)} aria-label="Borrar nota"><Trash2 size={14} /></button>
                </div>
              </div>
              <h3 className="los-goal-title">{n.title}</h3>
              <p className="los-note-content">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <NoteForm
          initial={editing}
          onCancel={() => setShowForm(false)}
          onSave={(n) => { editing ? actions.updateNote(n) : actions.addNote(n); setShowForm(false); }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Resumen                                                                    */
/* ---------------------------------------------------------------------- */

function ResumenTab({ data, currencySymbol, actions, goTo }) {
  const key = currentMonthKey();
  const totals = monthTotals(data.transactions, key);
  const target = monthTargetFromAnnualPlan(data.settings, key);
  const pct = target > 0 ? Math.min(100, Math.round((Math.max(0, totals.balance) / target) * 100)) : null;

  const today = todayISO();
  const todayHabits = data.habits.filter((h) => habitAppliesToDate(h, today));
  const pendingTasks = data.tasks.filter((t) => !t.done).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")).slice(0, 5);
  const topGoals = [...data.goals].filter((g) => g.status !== "completada").sort((a, b) => goalProgress(b) - goalProgress(a)).slice(0, 3);
  const weekInfo = useMemo(() => weekPointsInfo(data.habits, data.habitLogs, getWeekDates(0)), [data.habits, data.habitLogs]);

  const trend = useMemo(() => {
    const keys = lastNMonthKeys(6, key);
    return keys.map((k) => {
      const t = monthTotals(data.transactions, k);
      return { mes: monthLabel(k), Ingresos: t.income, Gastos: t.expense };
    });
  }, [data.transactions]);

  const dateLabel = new Date().toLocaleDateString("es-UY", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="los-section">
      <div className="los-section-head">
        <div>
          <h2>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</h2>
          <p className="los-section-sub">Tu rumbo, de un vistazo.</p>
        </div>
      </div>

      <div className="los-card los-hero-card">
        <span className="los-hero-label">Plata en banco este mes</span>
        <span className={`los-hero-value ${totals.balance >= 0 ? "tone-forest" : "tone-rust"}`}>{fmtMoney(totals.balance, currencySymbol)}</span>
        {totals.balance < 0 && <span className="los-negative-flag">gastaste más de lo que entró</span>}
        <div className="los-stat-row" style={{ marginTop: 14 }}>
          <div className="los-stat"><span className="los-stat-label"><TrendingUp size={14} /> Ingresos</span><span className="los-stat-value tone-azul">{fmtMoney(totals.income, currencySymbol)}</span></div>
          <div className="los-stat"><span className="los-stat-label"><TrendingDown size={14} /> Gastos</span><span className="los-stat-value tone-rust">{fmtMoney(totals.expense, currencySymbol)}</span></div>
          {pct !== null && <div className="los-stat"><span className="los-stat-label"><PiggyBank size={14} /> Meta de ahorro</span><span className="los-stat-value tone-brass">{pct}%</span></div>}
        </div>
      </div>

      <div className="los-two-col">
        <div className="los-card">
          <h3 className="los-card-title"><Target size={16} /> Metas con más avance</h3>
          {topGoals.length === 0 ? <p className="los-section-sub">Cargá tu primera meta en la pestaña Metas.</p> : (
            <ul className="los-mini-goal-list">
              {topGoals.map((g) => (
                <li key={g.id}>
                  <span>{g.title}</span>
                  <ProgressBar value={goalProgress(g)} tone="brass" />
                  <span className="los-mini-goal-amt">{goalProgress(g)}%</span>
                </li>
              ))}
            </ul>
          )}
          <button className="los-link-btn" onClick={() => goTo("metas")}>Ver todas las metas →</button>
        </div>

        <div className="los-card">
          <h3 className="los-card-title"><Flame size={16} /> Hábitos de hoy <span className="los-badge sm">{weekInfo.earned}/{weekInfo.possible} pts esta semana</span></h3>
          {todayHabits.length === 0 ? <p className="los-section-sub">No tenés hábitos programados para hoy.</p> : (
            <ul className="los-today-habit-list">
              {todayHabits.map((h) => {
                const checked = !!data.habitLogs[`${h.id}|${today}`];
                return (
                  <li key={h.id}>
                    <button className={`los-step-check ${checked ? "done" : ""}`} onClick={() => actions.toggleHabitLog(h.id, today)}>
                      {checked && <Check size={12} />}
                    </button>
                    <span>{h.name}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <button className="los-link-btn" onClick={() => goTo("habitos")}>Ver todos los hábitos →</button>
        </div>
      </div>

      <div className="los-card">
        <h3 className="los-card-title"><CheckSquare size={16} /> Próximas tareas</h3>
        {pendingTasks.length === 0 ? <p className="los-section-sub">No tenés tareas pendientes. ¡Bien ahí!</p> : (
          <div className="los-task-list">
            {pendingTasks.map((t) => (
              <div className="los-task-row" key={t.id}>
                <button className="los-step-check" onClick={() => actions.toggleTask(t.id)}></button>
                <div className="los-task-info">
                  <span>{t.text}</span>
                  {t.dueDate && <div className="los-task-meta"><span>{formatDateShort(t.dueDate)}</span></div>}
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="los-link-btn" onClick={() => goTo("tareas")}>Ver todas las tareas →</button>
      </div>

      <div className="los-card">
        <h3 className="los-card-title">Ingresos vs. gastos — últimos 6 meses</h3>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D8D8C8" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#5B6B66" }} />
              <YAxis tick={{ fontSize: 12, fill: "#5B6B66" }} width={48} />
              <Tooltip formatter={(v) => fmtMoney(v, currencySymbol)} contentStyle={{ fontFamily: "IBM Plex Sans", fontSize: 13, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos" fill="#2F5570" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Gastos" fill="#A14B36" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ProfilesModal({ profiles, activeId, actions, onClose }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");

  function addProfile() {
    if (!newName.trim()) { setError("Escribí un nombre para el nuevo perfil."); return; }
    setError("");
    actions.add(newName.trim());
    setNewName("");
  }
  function saveRename(id) {
    if (!editName.trim()) return;
    actions.rename(id, editName.trim());
    setEditingId(null);
  }

  return (
    <Modal title="Perfiles" onClose={onClose}>
      <p className="los-plan-hint">Cada perfil tiene sus propias metas, hábitos, retos, tareas, finanzas y notas. Nada se mezcla entre uno y otro.</p>

      <ul className="los-profile-list">
        {profiles.map((p) => (
          <li key={p.id} className={p.id === activeId ? "active" : ""}>
            <span className="los-profile-avatar big">{p.name.trim().charAt(0).toUpperCase() || "?"}</span>
            {editingId === p.id ? (
              <>
                <input
                  className="los-input los-input-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveRename(p.id); } }}
                  autoFocus
                />
                <button className="los-icon-btn" onClick={() => saveRename(p.id)} aria-label="Guardar nombre"><Check size={15} /></button>
                <button className="los-icon-btn" onClick={() => setEditingId(null)} aria-label="Cancelar"><X size={15} /></button>
              </>
            ) : (
              <>
                <span className="los-profile-name">{p.name}{p.id === activeId && <span className="los-badge sm" style={{ marginLeft: 8 }}>viendo ahora</span>}</span>
                <button className="los-icon-btn" onClick={() => { setEditingId(p.id); setEditName(p.name); }} aria-label="Renombrar perfil"><Pencil size={14} /></button>
                <button
                  className="los-icon-btn"
                  disabled={profiles.length <= 1}
                  title={profiles.length <= 1 ? "Tiene que quedar al menos un perfil" : "Borrar perfil"}
                  onClick={() => { if (profiles.length > 1) actions.remove(p.id); }}
                  aria-label="Borrar perfil"
                ><Trash2 size={14} /></button>
              </>
            )}
          </li>
        ))}
      </ul>

      <h4 className="los-plan-title" style={{ marginTop: 16 }}>Agregar un perfil</h4>
      <div className="los-add-step">
        <input
          className="los-input los-input-sm"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProfile(); } }}
          placeholder="Nombre del perfil"
        />
        <button className="los-icon-btn" onClick={addProfile} aria-label="Agregar perfil"><UserPlus size={16} /></button>
      </div>
      {error && <p className="los-error">{error}</p>}

      <div className="los-form-actions">
        <button className="los-btn los-btn-primary" onClick={onClose}>Listo</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/* Datos de ejemplo                                                          */
/* ---------------------------------------------------------------------- */

function buildDemoData() {
  const today = new Date();
  const iso = (daysOffset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysOffset);
    return d.toISOString().slice(0, 10);
  };
  const monthIso = (monthsAgo, day) => {
    const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day);
    return d.toISOString().slice(0, 10);
  };

  const goalViaje = { id: uid(), shared: true, title: "Viaje a Cabo Polonio", description: "Un fin de semana largo con la familia, para marzo que viene.", category: "Viaje", targetDate: iso(150), currency: "$", targetAmount: 60000, currentAmount: 18000, status: "en curso", steps: [
    { id: uid(), text: "Reservar la cabaña con seña" },
    { id: uid(), text: "Apartar $6.000 por mes" },
    { id: uid(), text: "Planear la ruta y el auto" }
  ] };
  const goalDeuda = { id: uid(), shared: false, title: "Comprarme una camioneta", description: "Una 4x4 usada en buen estado para el laburo y los viajes.", category: "Financiero", targetDate: iso(400), currency: "US$", targetAmount: 15000, currentAmount: 4200, status: "en curso", steps: [
    { id: uid(), text: "Escalar el negocio para subir los ingresos" },
    { id: uid(), text: "Guardar US$ 500 por mes" }
  ] };
  const goalHabito = { id: uid(), title: "Bajar de peso", description: "Sentirme mejor y con más energía.", category: "Salud", targetDate: iso(180), targetAmount: 0, currentAmount: 0, status: "en curso", steps: [
    { id: uid(), text: "Caminar 30 min por día" },
    { id: uid(), text: "Ir al nutricionista una vez por mes" }
  ] };
  const goalCurso = { id: uid(), title: "Terminar el curso de inglés", description: "", category: "Personal", targetDate: iso(-10), targetAmount: 0, currentAmount: 0, status: "completada", steps: [
    { id: uid(), text: "Rendir el examen final" }
  ] };

  const goals = [goalViaje, goalDeuda, goalHabito, goalCurso];

  const habits = [
    { id: uid(), name: "Tomar 2L de agua", frequency: "diario", days: [], goalId: null, points: 10 },
    { id: uid(), name: "Caminar 30 minutos", frequency: "diario", days: [], goalId: goalHabito.id, points: 15 },
    { id: uid(), name: "Leer inglés 15 min", frequency: "dias", days: [0, 1, 2, 3, 4], goalId: goalCurso.id, points: 10 },
    { id: uid(), name: "Anotar gastos del día", frequency: "dias", days: [0, 2, 4], goalId: null, points: 5 }
  ];

  const habitLogs = {};
  habits.forEach((h) => {
    for (let i = 1; i <= 6; i++) {
      const d = iso(-i);
      if (habitAppliesToDate(h, d) && Math.random() > 0.3) habitLogs[`${h.id}|${d}`] = true;
    }
  });

  const tasks = [
    { id: uid(), text: "Mirar precios de camionetas usadas", dueDate: iso(3), goalId: goalDeuda.id, done: false },
    { id: uid(), text: "Reservar la cabaña en Cabo Polonio", dueDate: iso(20), goalId: goalViaje.id, done: false },
    { id: uid(), text: "Comprar zapatillas para caminar", dueDate: iso(-2), goalId: goalHabito.id, done: true },
    { id: uid(), text: "Pagar la luz", dueDate: iso(-1), goalId: null, done: true },
    { id: uid(), text: "Sacar turno con nutricionista", dueDate: iso(10), goalId: goalHabito.id, done: false }
  ];

  const transactions = [];
  for (let m = 2; m >= 0; m--) {
    transactions.push({ id: uid(), type: "income", category: "Sueldo", amount: 95000, description: "Sueldo", date: monthIso(m, 1), goalId: null });
    if (m === 1) transactions.push({ id: uid(), type: "income", category: "Freelance / changas", amount: 12000, description: "Trabajo extra", date: monthIso(m, 14), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Alquiler / hipoteca", amount: 35000, description: "", date: monthIso(m, 5), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Supermercado", amount: 18000, description: "Compra del mes", date: monthIso(m, 6), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Supermercado", amount: 6500, description: "Almacén", date: monthIso(m, 18), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Servicios (luz, agua, gas, internet)", amount: 8200, description: "", date: monthIso(m, 10), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Transporte", amount: 5400, description: "Nafta", date: monthIso(m, 12), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Entretenimiento", amount: 3200, description: "", date: monthIso(m, 20), goalId: null });
    transactions.push({ id: uid(), type: "expense", category: "Ahorro / Objetivo", amount: 6000, description: "Ahorro para el viaje", date: monthIso(m, 25), goalId: goalViaje.id });
  }

  const challenges = [
    { id: uid(), title: "90 días de gimnasio", description: "Ir al gimnasio o entrenar en casa, sin excusas.", startDate: iso(-12), days: 90, goalId: goalHabito.id },
    { id: uid(), title: "30 días sin delivery", description: "Cocinar en casa para bajar los gastos del mes.", startDate: iso(-5), days: 30, goalId: null, shared: true }
  ];
  const challengeLogs = {};
  challenges.forEach((ch) => {
    for (let i = 0; i < 90; i++) {
      const d = addDaysISO(ch.startDate, i);
      if (d > todayISO()) break;
      if (Math.random() > 0.18) challengeLogs[`${ch.id}|${d}`] = true;
    }
  });

  const notes = [
    { id: uid(), title: "Por qué quiero este viaje", content: "Hace tiempo que no nos tomamos un fin de semana en familia. Cabo Polonio siempre nos gustó, y creo que nos va a hacer bien desconectar un poco.", date: iso(-6) },
    { id: uid(), title: "Ideas para bajar gastos", content: "- Cocinar más en casa\n- Revisar suscripciones que no uso\n- Comparar precios del súper antes de comprar", date: iso(-2) }
  ];

  const personalGoals = goals.filter((g) => !g.shared);
  const sharedGoals = goals.filter((g) => g.shared);
  const personalChallenges = challenges.filter((ch) => !ch.shared);
  const sharedChallenges = challenges.filter((ch) => ch.shared);
  const sharedChallengeLogs = {}, personalChallengeLogs = {};
  Object.keys(challengeLogs).forEach((k) => {
    const chId = k.split("|")[0];
    if (sharedChallenges.some((ch) => ch.id === chId)) sharedChallengeLogs[k] = true;
    else personalChallengeLogs[k] = true;
  });

  return {
    personal: {
      goals: personalGoals, habits, habitLogs, tasks, notes,
      challenges: personalChallenges, challengeLogs: personalChallengeLogs
    },
    shared: {
      transactions,
      goals: sharedGoals,
      habits: [], habitLogs: {},
      challenges: sharedChallenges, challengeLogs: sharedChallengeLogs,
      settings: { currencySymbol: "$", bankBalance: 42000, annualGoal: 200000, annualOverrides: {} }
    }
  };
}

/* ---------------------------------------------------------------------- */
/* App principal                                                              */
/* ---------------------------------------------------------------------- */

function normalizeProfileData(raw) {
  const d = raw || {};
  return { ...DEFAULT_DATA, ...d };
}

function normalizeShared(raw) {
  const s = raw || {};
  return { ...DEFAULT_SHARED, ...s, settings: { ...DEFAULT_SHARED.settings, ...(s.settings || {}) } };
}

function buildInitialRoot() {
  const p1 = uid(), p2 = uid();
  return {
    profiles: [{ id: p1, name: "Jhona" }, { id: p2, name: "Katy" }],
    activeProfileId: p1,
    byProfile: { [p1]: { ...DEFAULT_DATA }, [p2]: { ...DEFAULT_DATA } },
    shared: { ...DEFAULT_SHARED }
  };
}

function App() {
  const { state: rootRaw, setState: setRoot, loaded, status } = useCloudState(null);
  const [activeTab, setActiveTab] = useState("resumen");
  const [showReset, setShowReset] = useState(false);
  const [showDemoConfirm, setShowDemoConfirm] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);

  // Si todavía no hay nada guardado (primera vez), arrancamos con la base.
  const root = useMemo(() => {
    if (rootRaw && rootRaw.profiles && rootRaw.byProfile) {
      const byProfile = {};
      rootRaw.profiles.forEach((p) => { byProfile[p.id] = normalizeProfileData(rootRaw.byProfile[p.id]); });
      return { ...rootRaw, byProfile, shared: normalizeShared(rootRaw.shared) };
    }
    return buildInitialRoot();
  }, [rootRaw]);

  useEffect(() => {
    if (loaded && (!rootRaw || !rootRaw.profiles)) setRoot(buildInitialRoot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const activeProfile = root.profiles.find((p) => p.id === root.activeProfileId) || root.profiles[0];
  const mine = normalizeProfileData(root.byProfile[activeProfile ? activeProfile.id : ""]);
  const shared = normalizeShared(root.shared);

  // Lo que ve la pantalla: lo personal del perfil activo + lo compartido.
  // Las finanzas (movimientos y ajustes) son SIEMPRE compartidas.
  const data = useMemo(() => ({
    goals: [...mine.goals.map((g) => ({ ...g, shared: false })), ...shared.goals.map((g) => ({ ...g, shared: true }))],
    habits: [...mine.habits.map((h) => ({ ...h, shared: false })), ...shared.habits.map((h) => ({ ...h, shared: true }))],
    habitLogs: { ...mine.habitLogs, ...shared.habitLogs },
    challenges: [...(mine.challenges || []).map((x) => ({ ...x, shared: false })), ...(shared.challenges || []).map((x) => ({ ...x, shared: true }))],
    challengeLogs: { ...(mine.challengeLogs || {}), ...(shared.challengeLogs || {}) },
    tasks: mine.tasks,
    notes: mine.notes,
    transactions: shared.transactions,
    settings: shared.settings
  }), [mine, shared]);

  const profileActions = {
    select: (id) => setRoot((r) => ({ ...r, activeProfileId: id })),
    add: (name) => setRoot((r) => {
      const id = uid();
      return { ...r, profiles: [...r.profiles, { id, name }], byProfile: { ...r.byProfile, [id]: { ...DEFAULT_DATA } }, activeProfileId: id };
    }),
    rename: (id, name) => setRoot((r) => ({ ...r, profiles: r.profiles.map((p) => (p.id === id ? { ...p, name } : p)) })),
    remove: (id) => setRoot((r) => {
      if (r.profiles.length <= 1) return r;
      const profiles = r.profiles.filter((p) => p.id !== id);
      const byProfile = { ...r.byProfile };
      delete byProfile[id];
      return { ...r, profiles, byProfile, activeProfileId: r.activeProfileId === id ? profiles[0].id : r.activeProfileId };
    })
  };

  /* Helpers de escritura -----------------------------------------------
     writeMine  -> modifica solo el perfil activo
     writeShared-> modifica el espacio compartido (finanzas y items compartidos)
     writeWhere -> decide según dónde vive el item (por id) */
  function writeMine(updater) {
    setRoot((r) => {
      const id = r.activeProfileId;
      const current = normalizeProfileData(r.byProfile[id]);
      return { ...r, byProfile: { ...r.byProfile, [id]: updater(current) } };
    });
  }
  function writeShared(updater) {
    setRoot((r) => ({ ...r, shared: updater(normalizeShared(r.shared)) }));
  }
  function writeIn(isShared, updater) {
    if (isShared) writeShared(updater); else writeMine(updater);
  }
  function writeWhereItem(collection, itemId, updater) {
    setRoot((r) => {
      const sh = normalizeShared(r.shared);
      const inShared = (sh[collection] || []).some((x) => x.id === itemId);
      if (inShared) return { ...r, shared: updater(sh) };
      const pid = r.activeProfileId;
      const current = normalizeProfileData(r.byProfile[pid]);
      return { ...r, byProfile: { ...r.byProfile, [pid]: updater(current) } };
    });
  }

  const actions = {
    addGoal: (g) => writeIn(!!g.shared, (p) => ({ ...p, goals: [...(p.goals || []), g] })),
    updateGoal: (g) => setRoot((r) => {
      const sh = normalizeShared(r.shared);
      const pid = r.activeProfileId;
      const pd = normalizeProfileData(r.byProfile[pid]);
      const wasShared = sh.goals.some((x) => x.id === g.id);
      const wantShared = !!g.shared;
      if (wasShared === wantShared) {
        return wantShared
          ? { ...r, shared: { ...sh, goals: sh.goals.map((x) => (x.id === g.id ? { ...x, ...g } : x)) } }
          : { ...r, byProfile: { ...r.byProfile, [pid]: { ...pd, goals: pd.goals.map((x) => (x.id === g.id ? { ...x, ...g } : x)) } } };
      }
      // cambió de personal <-> compartido: se mueve de lugar
      if (wantShared) {
        return { ...r,
          byProfile: { ...r.byProfile, [pid]: { ...pd, goals: pd.goals.filter((x) => x.id !== g.id) } },
          shared: { ...sh, goals: [...sh.goals, g] } };
      }
      return { ...r,
        shared: { ...sh, goals: sh.goals.filter((x) => x.id !== g.id) },
        byProfile: { ...r.byProfile, [pid]: { ...pd, goals: [...pd.goals, g] } } };
    }),
    deleteGoal: (id) => writeWhereItem("goals", id, (p) => ({ ...p, goals: p.goals.filter((g) => g.id !== id) })),
    toggleGoalStatus: (id) => writeWhereItem("goals", id, (p) => ({ ...p, goals: p.goals.map((g) => g.id === id ? { ...g, status: g.status === "completada" ? "en curso" : "completada" } : g) })),
    addGoalStep: (goalId, text) => writeWhereItem("goals", goalId, (p) => ({ ...p, goals: p.goals.map((g) => g.id === goalId ? { ...g, steps: [...(g.steps || []), { id: uid(), text }] } : g) })),
    deleteGoalStep: (goalId, stepId) => writeWhereItem("goals", goalId, (p) => ({ ...p, goals: p.goals.map((g) => g.id === goalId ? { ...g, steps: (g.steps || []).filter((s) => s.id !== stepId) } : g) })),

    addHabit: (h) => writeIn(!!h.shared, (p) => ({ ...p, habits: [...(p.habits || []), h] })),
    updateHabit: (h) => writeWhereItem("habits", h.id, (p) => ({ ...p, habits: p.habits.map((x) => (x.id === h.id ? { ...x, ...h } : x)) })),
    deleteHabit: (id) => writeWhereItem("habits", id, (p) => {
      const logs = { ...(p.habitLogs || {}) };
      Object.keys(logs).forEach((k) => { if (k.startsWith(id + "|")) delete logs[k]; });
      return { ...p, habits: p.habits.filter((h) => h.id !== id), habitLogs: logs };
    }),
    toggleHabitLog: (habitId, dateISO) => writeWhereItem("habits", habitId, (p) => {
      const key = `${habitId}|${dateISO}`;
      const logs = { ...(p.habitLogs || {}) };
      if (logs[key]) delete logs[key]; else logs[key] = true;
      return { ...p, habitLogs: logs };
    }),

    addTask: (t) => writeMine((p) => ({ ...p, tasks: [...p.tasks, t] })),
    toggleTask: (id) => writeMine((p) => ({ ...p, tasks: p.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) })),
    deleteTask: (id) => writeMine((p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) })),

    // FINANZAS: siempre compartidas entre todos los perfiles
    addTransaction: (t) => setRoot((r) => {
      const sh = normalizeShared(r.shared);
      const pid = r.activeProfileId;
      const pd = normalizeProfileData(r.byProfile[pid]);
      let nextShared = { ...sh, transactions: [...sh.transactions, t] };
      let nextProfile = pd;
      if (t.goalId) {
        if (sh.goals.some((g) => g.id === t.goalId)) {
          nextShared = { ...nextShared, goals: sh.goals.map((g) => g.id === t.goalId ? { ...g, currentAmount: Number(g.currentAmount || 0) + Number(t.amount) } : g) };
        } else {
          nextProfile = { ...pd, goals: pd.goals.map((g) => g.id === t.goalId ? { ...g, currentAmount: Number(g.currentAmount || 0) + Number(t.amount) } : g) };
        }
      }
      return { ...r, shared: nextShared, byProfile: { ...r.byProfile, [pid]: nextProfile } };
    }),
    deleteTransaction: (id) => setRoot((r) => {
      const sh = normalizeShared(r.shared);
      const pid = r.activeProfileId;
      const pd = normalizeProfileData(r.byProfile[pid]);
      const txn = sh.transactions.find((t) => t.id === id);
      let nextShared = { ...sh, transactions: sh.transactions.filter((t) => t.id !== id) };
      let nextProfile = pd;
      if (txn && txn.goalId) {
        if (sh.goals.some((g) => g.id === txn.goalId)) {
          nextShared = { ...nextShared, goals: nextShared.goals.map((g) => g.id === txn.goalId ? { ...g, currentAmount: Math.max(0, Number(g.currentAmount || 0) - Number(txn.amount)) } : g) };
        } else {
          nextProfile = { ...pd, goals: pd.goals.map((g) => g.id === txn.goalId ? { ...g, currentAmount: Math.max(0, Number(g.currentAmount || 0) - Number(txn.amount)) } : g) };
        }
      }
      return { ...r, shared: nextShared, byProfile: { ...r.byProfile, [pid]: nextProfile } };
    }),

    addChallenge: (ch) => writeIn(!!ch.shared, (p) => ({ ...p, challenges: [...(p.challenges || []), ch] })),
    updateChallenge: (ch) => writeWhereItem("challenges", ch.id, (p) => ({ ...p, challenges: (p.challenges || []).map((x) => (x.id === ch.id ? { ...x, ...ch } : x)) })),
    deleteChallenge: (id) => writeWhereItem("challenges", id, (p) => {
      const logs = { ...(p.challengeLogs || {}) };
      Object.keys(logs).forEach((k) => { if (k.startsWith(id + "|")) delete logs[k]; });
      return { ...p, challenges: (p.challenges || []).filter((x) => x.id !== id), challengeLogs: logs };
    }),
    toggleChallengeLog: (chId, dateISO) => writeWhereItem("challenges", chId, (p) => {
      const key = `${chId}|${dateISO}`;
      const logs = { ...(p.challengeLogs || {}) };
      if (logs[key]) delete logs[key]; else logs[key] = true;
      return { ...p, challengeLogs: logs };
    }),

    addNote: (n) => writeMine((p) => ({ ...p, notes: [...p.notes, n] })),
    updateNote: (n) => writeMine((p) => ({ ...p, notes: p.notes.map((x) => (x.id === n.id ? { ...x, ...n } : x)) })),
    deleteNote: (id) => writeMine((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) })),

    // Los ajustes financieros también son compartidos
    updateSettings: (s) => writeShared((sh) => ({ ...sh, settings: { ...sh.settings, ...s } }))
  };

  const currencySymbol = data.settings.currencySymbol || "$";

  function resetAll() {
    writeMine(() => ({ ...DEFAULT_DATA }));
    setShowReset(false);
  }

  function loadDemoData() {
    const demo = buildDemoData();
    setRoot((r) => ({
      ...r,
      byProfile: { ...r.byProfile, [r.activeProfileId]: normalizeProfileData(demo.personal) },
      shared: normalizeShared(demo.shared)
    }));
    setShowDemoConfirm(false);
  }

  if (!loaded) {
    return (
      <div className="los-app los-loading">
        <style>{CSS}</style>
        <Loader2 className="spin" size={26} />
        <span>Abriendo tu bitácora...</span>
      </div>
    );
  }

  return (
    <div className="los-app">
      <style>{CSS}</style>

      <header className="los-topbar">
        <div className="los-brand-row">
          <div className="los-brand">
            <Compass size={22} />
            <div>
              <h1>Bitácora</h1>
              <span>Tu casa, tus metas, tu rumbo</span>
            </div>
          </div>
          <div className="los-profiles">
            {root.profiles.map((p) => (
              <button
                key={p.id}
                className={`los-profile-chip ${p.id === root.activeProfileId ? "active" : ""}`}
                onClick={() => profileActions.select(p.id)}
                title={`Ver el perfil de ${p.name}`}
              >
                <span className="los-profile-avatar">{p.name.trim().charAt(0).toUpperCase() || "?"}</span>
                {p.name}
              </button>
            ))}
            <button className="los-icon-btn" onClick={() => setShowProfiles(true)} aria-label="Administrar perfiles" title="Administrar perfiles"><Users size={16} /></button>
          </div>
        </div>
        <nav className="los-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`los-tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="los-main">
        {activeTab === "resumen" && <ResumenTab data={data} currencySymbol={currencySymbol} actions={actions} goTo={setActiveTab} />}
        {activeTab === "metas" && <MetasTab data={data} actions={actions} currencySymbol={currencySymbol} />}
        {activeTab === "habitos" && <HabitosTab data={data} actions={actions} />}
        {activeTab === "retos" && <RetosTab data={data} actions={actions} />}
        {activeTab === "tareas" && <TareasTab data={data} actions={actions} />}
        {activeTab === "finanzas" && <FinanzasTab data={data} actions={actions} currencySymbol={currencySymbol} />}
        {activeTab === "notas" && <NotasTab data={data} actions={actions} />}
      </main>

      <footer className="los-footer">
        <span className={`los-sync los-sync-${status.replace(/\s/g, "-")}`}>
          {status === "en línea" && <><Cloud size={13} /> Sincronizado — se ve en todos tus dispositivos</>}
          {status === "guardando" && <><Loader2 size={13} className="spin" /> Guardando...</>}
          {status === "conectando" && <><Loader2 size={13} className="spin" /> Conectando...</>}
          {status === "sin conexión" && <><CloudOff size={13} /> Sin conexión — se guarda en este dispositivo y se sube al volver</>}
          {status === "local" && <><CloudOff size={13} /> Modo local (falta configurar Supabase)</>}
        </span>
        <div className="los-footer-actions">
          <button className="los-link-btn" onClick={() => setShowDemoConfirm(true)}><Wand2 size={13} style={{ verticalAlign: "-2px" }} /> Cargar datos de ejemplo</button>
          <button className="los-link-btn" onClick={() => setShowReset(true)}>Borrar todos los datos</button>
        </div>
      </footer>

      {showProfiles && (
        <ProfilesModal
          profiles={root.profiles}
          activeId={root.activeProfileId}
          actions={profileActions}
          onClose={() => setShowProfiles(false)}
        />
      )}

      {showReset && (
        <Modal title={`¿Borrar los datos de ${activeProfile ? activeProfile.name : "este perfil"}?`} onClose={() => setShowReset(false)}>
          <p style={{ marginBottom: 16 }}>Esto borra metas, hábitos, retos, tareas, movimientos y notas <strong>solo de este perfil</strong>, de forma permanente. Los demás perfiles no se tocan.</p>
          <div className="los-form-actions">
            <button className="los-btn los-btn-ghost" onClick={() => setShowReset(false)}>Cancelar</button>
            <button className="los-btn los-btn-danger" onClick={resetAll}>Sí, borrar todo</button>
          </div>
        </Modal>
      )}

      {showDemoConfirm && (
        <Modal title="¿Cargar datos de ejemplo?" onClose={() => setShowDemoConfirm(false)}>
          <p style={{ marginBottom: 16 }}>Esto reemplaza lo que tengas cargado por metas, hábitos, tareas, movimientos y notas de ejemplo, para que puedas probar cómo funciona el sistema. Después podés borrarlo todo cuando quieras.</p>
          <div className="los-form-actions">
            <button className="los-btn los-btn-ghost" onClick={() => setShowDemoConfirm(false)}>Cancelar</button>
            <button className="los-btn los-btn-primary" onClick={loadDemoData}><Wand2 size={15} /> Cargar ejemplo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Bitácora - error capturado:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="los-app">
          <style>{CSS}</style>
          <div className="los-crash">
            <AlertTriangle size={28} />
            <h2>Algo se rompió</h2>
            <p>Hubo un error inesperado en la app. Tus datos guardados no se perdieron.</p>
            <button className="los-btn los-btn-primary" onClick={() => this.setState({ error: null })}>Intentar de nuevo</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithBoundary;

/* ---------------------------------------------------------------------- */
/* CSS                                                                        */
/* ---------------------------------------------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.los-app {
  --ink:#1B2B28; --paper:#EEF0E4; --paper2:#E2E6D6; --brass:#B98B2E; --brassLight:#F3E3BE;
  --forest:#3B6E52; --forestLight:#DCE9E0; --rust:#A14B36; --rustLight:#F1DED7;
  --azul:#2F5570; --azulLight:#DCE6EC;
  --slate:#5B6B66; --card:#FBFAF4; --line:#D9D9C6;
  background: var(--paper);
  color: var(--ink);
  font-family: 'IBM Plex Sans', sans-serif;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.los-app *, .los-app *::before, .los-app *::after { box-sizing: border-box; }
.los-app h1, .los-app h2, .los-app h3 { font-family: 'Fraunces', serif; margin: 0; font-weight: 600; color: var(--ink); }

.los-loading { align-items: center; justify-content: center; gap: 10px; flex-direction: row; color: var(--slate); font-family: 'IBM Plex Sans', sans-serif; }
.spin { animation: los-spin 1s linear infinite; }
@keyframes los-spin { to { transform: rotate(360deg); } }

.los-topbar { background: var(--card); border-bottom: 2px solid var(--ink); padding: 16px 20px 0; position: sticky; top: 0; z-index: 10; }
.los-brand-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.los-brand { display: flex; align-items: center; gap: 10px; color: var(--ink); }
.los-brand h1 { font-size: 21px; letter-spacing: 0.3px; }
.los-brand span { font-size: 11.5px; color: var(--slate); text-transform: uppercase; letter-spacing: 0.6px; }


.los-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.los-tabs::-webkit-scrollbar { display: none; }
.los-tab {
  display: flex; align-items: center; gap: 6px; white-space: nowrap;
  padding: 9px 14px; border: none; background: transparent; color: var(--slate);
  font-family: 'IBM Plex Sans'; font-size: 13.5px; font-weight: 500; cursor: pointer;
  border-radius: 8px 8px 0 0; border-bottom: 3px solid transparent; transition: background .15s, color .15s;
}
.los-tab:hover { background: var(--paper2); color: var(--ink); }
.los-tab.active { background: var(--paper); color: var(--ink); border-bottom: 3px solid var(--brass); }

.los-main { flex: 1; padding: 22px 20px 40px; max-width: 980px; width: 100%; margin: 0 auto; }
.los-footer { text-align: center; padding: 14px; font-size: 12px; color: var(--slate); display: flex; flex-direction: column; gap: 6px; }
.los-sync { display: inline-flex; align-items: center; gap: 6px; justify-content: center; font-size: 11.5px; }
.los-sync-en-línea { color: var(--forest); }
.los-sync-sin-conexión, .los-sync-local { color: var(--rust); }
.los-footer-actions { display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; }

.los-crash { max-width: 420px; margin: 60px auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--ink); }
.los-crash svg { color: var(--rust); }
.los-crash p { color: var(--slate); font-size: 13.5px; }

.los-section-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.los-section-head h2 { font-size: 22px; }
.los-section-sub { color: var(--slate); font-size: 13.5px; margin: 4px 0 0; }

.los-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 8px; font-size: 13.5px; font-weight: 500; cursor: pointer; border: 1.5px solid transparent; font-family: 'IBM Plex Sans'; transition: filter .15s, background .15s; }
.los-btn-primary { background: var(--ink); color: var(--paper); }
.los-btn-primary:hover { filter: brightness(1.2); }
.los-btn-primary:disabled { opacity: 0.55; cursor: default; }
.los-btn-ghost { background: transparent; border-color: var(--line); color: var(--ink); }
.los-btn-ghost:hover { background: var(--paper2); }
.los-btn-danger { background: var(--rust); color: #fff; }
.los-btn-danger:hover { filter: brightness(1.1); }

.los-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 7px; background: transparent; border: 1px solid var(--line); color: var(--slate); cursor: pointer; }
.los-icon-btn:hover { background: var(--paper2); color: var(--ink); }
.los-link-btn { background: none; border: none; color: var(--brass); font-weight: 600; font-size: 13px; cursor: pointer; padding: 6px 0; font-family: 'IBM Plex Sans'; }
.los-link-btn:hover { text-decoration: underline; }

.los-filters { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.los-filter-btn { padding: 6px 13px; border-radius: 20px; border: 1.5px solid var(--line); background: var(--card); color: var(--slate); font-size: 12.5px; font-weight: 500; cursor: pointer; font-family: 'IBM Plex Sans'; }
.los-filter-btn.active { background: var(--ink); border-color: var(--ink); color: var(--paper); }

.los-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.los-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
@media (max-width: 680px) { .los-two-col { grid-template-columns: 1fr; } }

.los-card { background: var(--card); border: 1.5px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 14px; position: relative; }
.los-card-title { display: flex; align-items: center; gap: 7px; font-size: 15px; margin-bottom: 12px; flex-wrap: wrap; }
.los-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 44px 20px; color: var(--slate); text-align: center; border: 1.5px dashed var(--line); border-radius: 12px; }

.los-badge { display: inline-block; background: var(--brassLight); color: #6E5217; font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.3px; }
.los-badge.sm { background: var(--paper2); color: var(--slate); text-transform: none; font-weight: 500; letter-spacing: 0; }

.los-goal-card { display: flex; flex-direction: column; }
.los-goal-card.is-done { border-color: var(--forest); background: var(--forestLight); }
.los-stamp { position: absolute; top: 14px; right: 14px; display: flex; align-items: center; gap: 4px; color: var(--forest); font-weight: 700; font-size: 11px; border: 1.5px solid var(--forest); border-radius: 20px; padding: 3px 9px; transform: rotate(4deg); }
.los-goal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.los-goal-date { font-size: 11.5px; color: var(--slate); font-family: 'IBM Plex Mono'; }
.los-goal-title { font-size: 17px; margin-bottom: 4px; }
.los-goal-desc { font-size: 13px; color: var(--slate); margin: 0 0 10px; line-height: 1.5; }
.los-goal-amounts { font-family: 'IBM Plex Mono'; font-size: 13.5px; margin: 0 0 8px; }
.los-goal-amounts span { color: var(--slate); font-family: 'IBM Plex Sans'; }
.los-progress-label { font-size: 11.5px; color: var(--slate); margin: 5px 0 0; font-family: 'IBM Plex Mono'; }
.los-plan-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--slate); margin: 14px 0 4px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; }
.los-plan-hint { font-size: 12px; color: var(--slate); margin: 0 0 8px; line-height: 1.5; }

.los-progress-track { height: 8px; background: var(--paper2); border-radius: 20px; overflow: hidden; }
.los-progress-fill { height: 100%; border-radius: 20px; transition: width .3s; }
.los-progress-fill.fill-brass { background: var(--brass); }
.los-progress-fill.fill-forest { background: var(--forest); }
.los-progress-fill.fill-rust { background: var(--rust); }
.los-progress-fill.fill-azul { background: var(--azul); }
.tone-forest { color: var(--forest); }
.tone-rust { color: var(--rust); }
.tone-brass { color: var(--brass); }
.tone-azul { color: var(--azul); }
.tone-muted { color: var(--slate); }

.los-plan-list { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 7px; }
.los-plan-list li { display: flex; align-items: flex-start; gap: 8px; font-size: 13.5px; line-height: 1.45; }
.los-bullet { color: var(--brass); font-weight: 700; line-height: 1.35; flex-shrink: 0; }
.los-step-text { flex: 1; }
.los-step-check { width: 19px; height: 19px; border-radius: 5px; border: 1.5px solid var(--slate); background: var(--card); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--forest); flex-shrink: 0; }
.los-step-check.done { background: var(--forest); border-color: var(--forest); color: #fff; }
.los-step-del { background: none; border: none; color: var(--slate); cursor: pointer; opacity: 0.45; display: flex; flex-shrink: 0; padding: 2px 0 0; }
.los-step-del:hover { opacity: 1; color: var(--rust); }

.los-preset-row { display: flex; gap: 6px; flex-wrap: wrap; }
.los-preset-btn { padding: 7px 12px; border-radius: 20px; border: 1.5px solid var(--line); background: var(--card); color: var(--slate); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'IBM Plex Sans'; }
.los-preset-btn.active { background: var(--brass); border-color: var(--brass); color: #fff; }

.los-challenge-card.is-perfect { border-color: var(--brass); background: var(--brassLight); }
.los-challenge-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 10px; }
.los-challenge-stats div { display: flex; flex-direction: column; align-items: center; text-align: center; }
.los-challenge-stats strong { font-family: 'IBM Plex Mono'; font-size: 19px; font-weight: 600; }
.los-challenge-stats span { font-size: 10.5px; color: var(--slate); text-transform: uppercase; letter-spacing: 0.3px; }
.los-challenge-stats .tone-rust strong { color: var(--rust); }

.los-today-btn { width: 100%; justify-content: center; margin: 10px 0 4px; }

.los-challenge-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; margin-top: 12px; }
.los-chal-cell { aspect-ratio: 1; border-radius: 6px; border: 1px solid var(--line); background: var(--paper2); color: var(--slate); font-size: 9.5px; font-family: 'IBM Plex Mono'; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
.los-chal-cell.done { background: var(--forest); border-color: var(--forest); color: #fff; font-weight: 600; }
.los-chal-cell.missed { background: var(--rustLight); border-color: var(--rustLight); color: var(--rust); }
.los-chal-cell.future { background: transparent; border-style: dashed; opacity: 0.5; cursor: default; }
.los-chal-cell.is-today { outline: 2px solid var(--brass); outline-offset: 1px; }
@media (max-width: 560px) { .los-challenge-grid { grid-template-columns: repeat(8, 1fr); } }

.los-currency-picker { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.los-cur-btn { padding: 7px 13px; border-radius: 20px; border: 1.5px solid var(--line); background: var(--card); color: var(--slate); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'IBM Plex Sans'; }
.los-cur-btn.active { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.los-cur-tag { font-family: 'IBM Plex Sans'; font-size: 10.5px; color: var(--slate); background: var(--paper2); border-radius: 20px; padding: 2px 8px; margin-left: 6px; }
.los-add-step { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.los-add-step .los-input { flex: 1 1 140px; }
.los-input-sm { padding: 7px 10px; font-size: 12.5px; }

.los-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); flex-wrap: wrap; gap: 8px; }
.los-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }

.los-form { display: flex; flex-direction: column; gap: 13px; }
.los-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.los-label { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--slate); }
.los-inline-label { flex-direction: row; align-items: center; gap: 8px; }
.los-input, .los-select, .los-textarea { font-family: 'IBM Plex Sans'; font-size: 14px; padding: 9px 11px; border-radius: 7px; border: 1.5px solid var(--line); background: #fff; color: var(--ink); width: 100%; }
.los-input:focus, .los-select:focus, .los-textarea:focus { outline: 2px solid var(--brass); outline-offset: 1px; }
.los-textarea { resize: vertical; font-family: 'IBM Plex Sans'; }
.los-checkline { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink); font-weight: 500; }
.los-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }

.los-type-toggle { display: flex; border: 1.5px solid var(--line); border-radius: 8px; overflow: hidden; }
.los-toggle-btn { flex: 1; padding: 9px; background: var(--card); border: none; font-family: 'IBM Plex Sans'; font-size: 13px; font-weight: 600; color: var(--slate); cursor: pointer; }
.los-toggle-btn.active.rust { background: var(--rustLight); color: var(--rust); }
.los-toggle-btn.active.forest { background: var(--forestLight); color: var(--forest); }
.los-toggle-btn.active.brass { background: var(--brassLight); color: #6E5217; }

.los-weekday-picker { display: flex; gap: 6px; }
.los-weekday-btn { width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid var(--line); background: var(--card); color: var(--slate); font-weight: 700; font-size: 12px; cursor: pointer; }
.los-weekday-btn.active { background: var(--brass); border-color: var(--brass); color: #fff; }

.los-week-nav, .los-range-nav { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; font-weight: 600; font-family: 'IBM Plex Mono'; font-size: 13px; flex-wrap: wrap; }
.los-range-nav .los-label { font-family: 'IBM Plex Sans'; }

.los-score-card { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
.los-score-card.is-extraordinary { border-color: var(--brass); background: var(--brassLight); }
.los-score-pts { font-family: 'IBM Plex Mono'; color: var(--slate); font-size: 13px; }

.los-btn-income { background: var(--forest); color: #fff; }
.los-btn-income:hover { filter: brightness(1.12); }
.los-btn-expense { background: var(--rust); color: #fff; }
.los-btn-expense:hover { filter: brightness(1.12); }
.los-stat-hint { font-size: 10.5px; color: var(--slate); }

.los-ai-thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.los-ai-thumb { position: relative; width: 72px; height: 72px; border-radius: 9px; overflow: hidden; border: 1.5px solid var(--line); }
.los-ai-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.los-thumb-del { position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(27,43,40,0.75); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
.los-ai-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.los-ai-date { font-family: 'IBM Plex Mono'; font-size: 10.5px; color: var(--slate); }

.los-shared-badge { display: inline-flex; align-items: center; gap: 4px; background: var(--azulLight); color: var(--azul); font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
.los-shared-line { background: var(--azulLight); border: 1px solid rgba(47,85,112,0.25); border-radius: 8px; padding: 9px 11px; color: var(--azul); }
.los-shared-line svg { flex-shrink: 0; }
.los-shared-note { display: flex; align-items: center; gap: 7px; background: var(--azulLight); color: var(--azul); font-size: 12.5px; font-weight: 600; padding: 9px 12px; border-radius: 8px; margin-bottom: 14px; }

.los-profiles { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.los-profile-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px 5px 5px; border-radius: 20px; border: 1.5px solid var(--line); background: var(--card); color: var(--slate); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'IBM Plex Sans'; }
.los-profile-chip:hover { background: var(--paper2); }
.los-profile-chip.active { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.los-profile-avatar { width: 22px; height: 22px; border-radius: 50%; background: var(--brass); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.los-profile-avatar.big { width: 32px; height: 32px; font-size: 14px; }
.los-profile-list { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 8px; }
.los-profile-list li { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1.5px solid var(--line); border-radius: 10px; background: var(--card); }
.los-profile-list li.active { border-color: var(--brass); background: var(--brassLight); }
.los-profile-name { flex: 1; font-size: 14px; font-weight: 500; }
.los-icon-btn:disabled { opacity: 0.35; cursor: default; }

.los-daybreak { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.los-daybreak-col { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 2px; border-radius: 9px; border: 1.5px solid transparent; background: var(--paper2); position: relative; }
.los-daybreak-col.extraordinary { background: var(--brassLight); border-color: var(--brass); }
.los-daybreak-col.future { opacity: 0.5; }
.los-daybreak-col.is-today { outline: 2px solid var(--brass); outline-offset: 1px; }
.los-db-day { font-size: 10.5px; font-weight: 700; color: var(--slate); text-transform: uppercase; }
.los-db-bar-track { width: 12px; height: 44px; background: var(--card); border-radius: 20px; display: flex; align-items: flex-end; overflow: hidden; border: 1px solid var(--line); }
.los-db-bar-fill { width: 100%; background: var(--forest); border-radius: 20px; transition: height .3s; }
.los-db-pts { font-family: 'IBM Plex Mono'; font-size: 10.5px; color: var(--ink); }
.los-db-pct { font-family: 'IBM Plex Mono'; font-size: 10px; color: var(--slate); }
.los-db-empty { color: var(--slate); font-size: 12px; padding: 20px 0; }
.los-db-star { color: var(--brass); position: absolute; top: 4px; right: 4px; }
@media (max-width: 560px) { .los-db-pct { display: none; } .los-db-bar-track { height: 34px; width: 10px; } }

.los-month-score { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 0; margin-bottom: 6px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.los-week-breakdown { margin-bottom: 14px; }
.los-week-range { color: var(--slate); font-size: 11px; }

.los-score-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.los-score-sub { font-size: 11px; color: var(--slate); font-family: 'IBM Plex Mono'; }
.los-ontrack-badge { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; background: var(--forestLight); color: var(--forest); font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; vertical-align: middle; }
.los-extraordinary-badge { display: inline-flex; align-items: center; gap: 4px; margin-left: 10px; background: var(--brass); color: #fff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; vertical-align: middle; }
.los-extraordinary-banner { display: flex; align-items: center; gap: 8px; background: var(--brassLight); color: #6E5217; font-weight: 600; font-size: 13px; padding: 9px 12px; border-radius: 8px; margin-bottom: 12px; }

.los-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 6px; }
.los-cal-weekdays span { text-align: center; font-size: 11px; font-weight: 700; color: var(--slate); text-transform: uppercase; }
.los-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.los-cal-cell { aspect-ratio: 1; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-family: 'IBM Plex Mono'; color: var(--ink); background: var(--paper2); }
.los-cal-cell.blank { background: transparent; }
.los-cal-cell.future { background: transparent; border: 1px dashed var(--line); color: var(--slate); opacity: 0.6; }
.los-cal-cell.empty { background: var(--paper2); color: var(--slate); opacity: 0.6; }
.los-cal-cell.extraordinary { background: var(--brass); color: #fff; }
.los-cal-legend { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 12px; font-size: 11.5px; color: var(--slate); }
.los-cal-legend span { display: flex; align-items: center; gap: 5px; }
.los-legend-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.los-legend-dot.extraordinary { background: var(--brass); }
.los-legend-dot.partial { background: rgba(59,110,82,0.5); }
.los-legend-dot.empty { background: var(--paper2); border: 1px solid var(--line); }

.los-habit-table { padding: 10px 14px; }
.los-habit-row { display: grid; grid-template-columns: 1fr auto 34px; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
.los-habit-row:last-child { border-bottom: none; }
.los-habit-head { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--slate); font-weight: 600; }
.los-habit-name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; }
.los-habit-days { display: flex; gap: 5px; }
.los-habit-days span { width: 30px; text-align: center; font-size: 11px; color: var(--slate); }
.los-habit-days span.is-today { color: var(--brass); font-weight: 700; }
.los-day-cell { width: 30px; height: 30px; border-radius: 7px; border: 1.5px solid var(--line); background: var(--card); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #fff; }
.los-day-cell.checked { background: var(--forest); border-color: var(--forest); }
.los-day-cell.muted { background: repeating-linear-gradient(45deg, var(--paper2), var(--paper2) 3px, var(--card) 3px, var(--card) 6px); cursor: default; opacity: 0.6; }
.los-day-cell.future:not(.checked) { opacity: 0.55; }
.los-streak-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--rustLight); color: var(--rust); border: 1px solid rgba(161,75,54,0.35); white-space: nowrap; }
.los-streak-badge.hot { background: var(--rust); color: #fff; border-color: var(--rust); box-shadow: 0 1px 6px rgba(161,75,54,0.35); }

.los-task-list { display: flex; flex-direction: column; }
.los-task-row { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
.los-task-row:last-child { border-bottom: none; }
.los-task-row.done .los-task-info span { text-decoration: line-through; color: var(--slate); }
.los-task-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.los-task-info > span { font-size: 13.5px; }
.los-task-meta { display: flex; gap: 8px; align-items: center; font-size: 11.5px; color: var(--slate); font-family: 'IBM Plex Mono'; }
.los-task-meta .overdue { color: var(--rust); font-weight: 700; }

.los-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 14px; }
.los-stat { display: flex; flex-direction: column; gap: 4px; }
.los-stat-label { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--slate); text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; }
.los-stat-value { font-family: 'IBM Plex Mono'; font-size: 21px; font-weight: 600; }

.los-negative-flag { display: inline-block; margin-left: 0; margin-top: 4px; font-size: 10.5px; font-weight: 700; color: #fff; background: var(--rust); padding: 2px 8px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.3px; }

.los-hero-card { background: var(--ink); color: var(--paper); border: none; }
.los-hero-card .los-stat-label { color: #C8D0CB; }
.los-hero-label { display: block; font-size: 12px; color: #C8D0CB; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; font-weight: 600; }
.los-hero-value { font-family: 'IBM Plex Mono'; font-size: 38px; font-weight: 600; display: block; }
.los-hero-card .tone-forest { color: #7FD9A6; }
.los-hero-card .tone-rust { color: #F0917A; }
.los-hero-card .tone-brass { color: var(--brassLight); }
.los-hero-card .tone-azul { color: #8FC1DE; }

.los-projection { font-size: 13px; color: var(--slate); margin: 6px 0 0; }
.los-projection strong { font-family: 'IBM Plex Mono'; font-size: 15px; }

.los-mini-goal-list { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 10px; }
.los-mini-goal-list li { display: grid; grid-template-columns: 100px 1fr 70px; align-items: center; gap: 10px; font-size: 12.5px; }
.los-mini-goal-list li span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.los-mini-goal-amt { font-family: 'IBM Plex Mono'; font-size: 11.5px; color: var(--slate); text-align: right; }

.los-today-habit-list { list-style: none; padding: 0; margin: 0 0 8px; display: flex; flex-direction: column; gap: 9px; }
.los-today-habit-list li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; }

.los-cat-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
.los-cat-list li { display: grid; grid-template-columns: 160px 1fr 80px; align-items: center; gap: 10px; font-size: 12.5px; }
.los-cat-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.los-cat-bar-track { height: 8px; background: var(--paper2); border-radius: 20px; overflow: hidden; }
.los-cat-bar-fill { height: 100%; background: var(--rust); border-radius: 20px; }
.los-cat-amt { font-family: 'IBM Plex Mono'; text-align: right; }
@media (max-width: 560px) { .los-cat-list li, .los-mini-goal-list li { grid-template-columns: 90px 1fr 60px; } }

.los-txn-list { display: flex; flex-direction: column; }
.los-txn-row { display: grid; grid-template-columns: 60px 1fr auto 30px; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid var(--line); font-size: 13px; }
.los-txn-row:last-child { border-bottom: none; }
.los-txn-date { font-family: 'IBM Plex Mono'; font-size: 11.5px; color: var(--slate); }
.los-txn-info { display: flex; flex-direction: column; }
.los-txn-desc { font-size: 11.5px; color: var(--slate); }
.los-txn-amt { font-family: 'IBM Plex Mono'; font-weight: 600; }
@media (max-width: 560px) { .los-txn-row { grid-template-columns: 50px 1fr auto; } .los-txn-row .los-icon-btn { display: none; } }

.los-ai-controls { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.los-error { color: var(--rust); font-size: 12.5px; margin-top: 8px; }
.los-ai-preview { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
.los-ai-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 7px 2px; border-bottom: 1px solid var(--line); }
.los-ai-row input[type="checkbox"] { flex: 0 0 auto; width: 16px; height: 16px; }
.los-select-sm { padding: 7px 8px; font-size: 12px; flex: 1 1 130px; }
.los-ai-desc { flex: 2 1 140px; }
.los-ai-amount { flex: 1 1 90px; max-width: 120px; }

.los-annual-table-wrap { overflow-x: auto; }
.los-annual-table { min-width: 380px; }
.los-annual-row { display: grid; grid-template-columns: 46px 100px 1fr 1fr; gap: 8px; align-items: center; padding: 6px 2px; border-bottom: 1px solid var(--line); font-size: 12.5px; font-family: 'IBM Plex Mono'; }
.los-annual-head { font-family: 'IBM Plex Sans'; font-weight: 700; text-transform: uppercase; font-size: 10.5px; color: var(--slate); letter-spacing: 0.3px; }
.los-annual-row .los-input { padding: 6px 8px; font-size: 12px; }

.los-note-card { min-height: 140px; }
.los-note-content { font-size: 13.5px; line-height: 1.6; white-space: pre-wrap; color: var(--ink); }

.los-modal-backdrop { position: fixed; inset: 0; background: rgba(27, 43, 40, 0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
.los-modal { background: var(--card); border-radius: 14px; max-width: 460px; width: 100%; max-height: 88vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.los-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--card); border-radius: 14px 14px 0 0; }
.los-modal-head h3 { font-size: 17px; }
.los-modal-body { padding: 18px; }
`;
