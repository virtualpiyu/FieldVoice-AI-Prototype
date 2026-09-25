import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bell, Bot, BriefcaseBusiness, Check,
  CircleCheck, ChevronDown, Cloud, CloudOff, RefreshCw, Wifi, WifiOff, Mail,
  ChevronRight, CircleUserRound, ClipboardCheck, Clock3, Eye, EyeOff, FileAudio,
  FileText, Flag, Gauge, Headphones, LayoutDashboard, Lightbulb, LogOut, MapPin,
  Menu, Mic, MicOff, Navigation, Play, Plus, Search, Send, Settings, ShieldCheck,
  Sun, Moon, Palette, Database,
  Sparkles, Square, Target, TrendingUp, Users, WandSparkles, X, Zap, Building2,
  Phone, Globe, Star, Calendar, History, ClipboardList, Filter, ChevronUp,
  BarChart3, CheckCircle2, XCircle, AlertCircle, Info, Trash2, Edit3, ExternalLink
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart,
  Cell, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { Circle as LeafletCircle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

// ─── TYPES ───────────────────────────────────────────────────────────────────
type Role = "Salesperson" | "Manager" | "Executive";
type Theme = "light" | "dark";
type View =
  | "home" | "visits" | "visit-detail" | "record" | "report" | "email"
  | "reports" | "tasks" | "insights" | "map" | "team" | "settings"
  | "customers" | "customer-detail" | "leads" | "history" | "alerts";

type Report = {
  id: string; client: string; person: string; location: string; time: string;
  sentiment: "Positive" | "Cautious" | "Neutral" | "Negative";
  interest: number; priority: "High" | "Medium" | "Low";
  summary: string; concerns: string[]; actions: string[];
  competitor?: string; sourceDuration: string;
  voiceNoteId?: string; visitId?: string; reportId?: string;
  audioUrl?: string; transcript?: string;
  offlinePending?: boolean; offlineId?: string;
  opportunity?: string; risk?: string;
};

type DashboardData = {
  status: string; role: string;
  overview: {
    total_visits: number; total_customers: number; pending_action_items: number;
    open_alerts: number; total_leads: number; pipeline_value: number;
    won_value: number; high_opportunities: number; high_risks: number;
  };
  sentiment: { sentiment: string | null; count: number }[];
  pipeline: { stage: string; count: number; value: number }[];
  recent_visits: {
    id: string; visit_date: string; status: string; visit_type: string;
    customer_name: string; rep_name: string;
    sentiment: string | null; opportunity_level: string | null; risk_level: string | null;
  }[];
};

type AuthUser = {
  id: string; full_name: string; email: string; role: string;
  organization_id: string; organization_name?: string | null;
};

type ApiActionItem = {
  id: string; title: string; description: string | null;
  priority: string; status: string; due_date: string | null;
  customer_name: string | null; visit_id?: string | null; source?: string;
};

type ApiAlert = {
  id: string; severity: string; title: string; message: string;
  status: string; customer_name: string | null; alert_type?: string;
  created_at?: string;
};

type ApiLead = {
  id: string; title: string; stage: string; value: number | null;
  probability: number | null; source: string; customer_name: string | null;
  description?: string | null; created_at?: string;
};

type ApiCustomer = {
  id: string; name: string; contact_person?: string | null;
  city?: string | null; state?: string | null; email?: string | null;
  phone?: string | null; industry?: string | null; status?: string;
  latitude?: number | null; longitude?: number | null;
  address?: string | null; notes?: string | null; created_at?: string;
};

type ApiVisit = {
  id: string; customer_id: string; customer_name: string;
  user_id: string; user_name: string; visit_date: string;
  status: string; visit_type: string; notes: string | null;
  latitude?: number | null; longitude?: number | null;
};

type ApiVoiceNote = {
  id: string; visit_id: string; file_url: string; file_name: string;
  transcription: string | null; processing_status: string;
  duration_seconds: number | null; recorded_at: string;
  user_name: string;
};

type ApiReport = {
  id: string; visit_id: string; voice_note_id: string | null;
  title: string; ai_draft: string | null; edited_report: string | null;
  final_report: string | null; status: string;
  customer_name: string; created_by_name: string;
  submitted_at: string | null; created_at: string;
};

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const API_BASE_URL = "http://127.0.0.1:8000";
const TOKEN_KEY = "fieldvoice_token";
const COLORS = ["#b83b68", "#f5b84b", "#7f7180", "#dd5a74", "#6c8cff"];

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────────
function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(x => x[0]?.toUpperCase()).join("") || "FV";
}
function uiRole(role: string): Role | null {
  const r = role.toUpperCase();
  if (r === "FIELD_REP" || r === "SALESPERSON") return "Salesperson";
  if (r === "MANAGER") return "Manager";
  if (r === "EXECUTIVE") return "Executive";
  return null;
}
function money(v: number | null | undefined) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v || 0);
}
function timeFmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; }
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}
function relTime(d: string | null | undefined) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── API HELPERS ─────────────────────────────────────────────────────────────
async function apiError(r: Response) {
  const raw = await r.text();
  try {
    const j = JSON.parse(raw);
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return j.detail.map((x: any) => x.msg).filter(Boolean).join("; ");
  } catch { }
  return raw || `API ${r.status}`;
}
async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token()}` }
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await apiError(r)}`);
  return r.json();
}
async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await apiError(r)}`);
  return r.json();
}
async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await apiError(r)}`);
  return r.json();
}
async function loginApi(email: string, password: string) {
  const r = await fetch(
    `${API_BASE_URL}/auth/login?email=${encodeURIComponent(email.trim())}&password=${encodeURIComponent(password)}`,
    { method: "POST", headers: { Accept: "application/json" } }
  );
  if (!r.ok) throw new Error(await apiError(r));
  const j = await r.json();
  const t = j.access_token || j.token;
  if (!t) throw new Error("Login succeeded but no access token was returned.");
  return t;
}
async function meApi(t: string) {
  const r = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${t.replace(/^Bearer\s+/i, "")}` }
  });
  if (!r.ok) throw new Error(await apiError(r));
  const j = await r.json();
  return (j.user || j) as AuthUser;
}

// ─── OFFLINE DB (IndexedDB) ───────────────────────────────────────────────────
const OFFLINE_DB = "fieldvoice-offline-v1";
const OFFLINE_STORE = "voice_queue";

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_STORE))
        db.createObjectStore(OFFLINE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Offline storage unavailable."));
  });
}
async function saveOfflineRecording(item: { id: string; visitId: string; customerId?: string; customerName: string; duration: number; recordedAt: string; blob: Blob }) {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    tx.objectStore(OFFLINE_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function getOfflineRecordings(): Promise<any[]> {
  const db = await openOfflineDb();
  const rows = await new Promise<any[]>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readonly");
    const req = tx.objectStore(OFFLINE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows;
}
async function deleteOfflineRecording(id: string) {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OFFLINE_STORE, "readwrite");
    tx.objectStore(OFFLINE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ─── SMALL SHARED COMPONENTS ──────────────────────────────────────────────────
function SectionHeader({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}
function PanelTitle({ title, icon: Icon, action }: { title: string; icon?: any; action?: React.ReactNode }) {
  return (
    <div className="panel-title">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={15} />}
        <strong>{title}</strong>
      </div>
      {action && action}
    </div>
  );
}
function Metric({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string | number; sub?: string; tone?: "amber" | "green" | "red" }) {
  return (
    <div className={`metric-card ${tone || ""}`}>
      <div className="metric-top"><Icon size={18} /><span>{label}</span></div>
      <strong className="metric-value">{value}</strong>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}
function Empty({ text, icon: Icon }: { text: string; icon?: any }) {
  const I = Icon || FileText;
  return <div className="empty"><I size={20} /><span>{text}</span></div>;
}
function Spinner({ size = 18 }: { size?: number }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}
function Badge({ label, type }: { label: string; type?: string }) {
  const cls = type ? `badge badge-${type.toLowerCase()}` : "badge";
  return <span className={cls}>{label}</span>;
}
function StatusChip({ label, ok }: { label: string; ok?: boolean }) {
  return <span className={`status-chip ${ok ? "success" : "pending"}`}><i />{label}</span>;
}

// ─── RECENT VISITS (shared) ───────────────────────────────────────────────────
function RecentVisits({ dashboard }: { dashboard: DashboardData | null }) {
  if (!dashboard) return <Empty text="Loading activity..." />;
  const visits = dashboard.recent_visits || [];
  if (!visits.length) return <Empty text="No recent visits." />;
  return (
    <div className="activity-list">
      {visits.map(v => (
        <div className="activity-item" key={v.id}>
          <div className={`activity-dot ${(v.sentiment || "").toLowerCase()}`} />
          <div className="activity-body">
            <strong>{v.customer_name}</strong>
            <span>{v.rep_name} · {fmtDateTime(v.visit_date)}</span>
          </div>
          <div className="activity-meta">
            {v.sentiment && <Badge label={v.sentiment} type={v.sentiment} />}
            {v.opportunity_level === "HIGH" && <Badge label="High Opp" type="success" />}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── PIPELINE CHART ───────────────────────────────────────────────────────────
function PipelineBar({ pipeline }: { pipeline: { stage: string; count: number; value: number }[] }) {
  if (!pipeline.length) return <Empty text="No pipeline data." />;
  const total = pipeline.reduce((s, p) => s + p.count, 0) || 1;
  const colors: Record<string, string> = {
    NEW: "#6c8cff", QUALIFIED: "#f5b84b", PROPOSAL: "#b83b68",
    NEGOTIATION: "#dd5a74", WON: "#4caf7d", LOST: "#7f7180"
  };
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      {pipeline.map(p => (
        <div className="pipeline-row" key={p.stage}>
          <span style={{ color: colors[p.stage] || "#aaa" }}>{p.stage}</span>
          <div className="pipeline-bar-track">
            <div className="pipeline-bar-fill" style={{ width: `${Math.min(100, (p.count / total) * 100)}%`, background: colors[p.stage] || "#b83b68" }} />
          </div>
          <strong>{money(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    setErr(""); setLoading(true);
    try { await onLogin(email, password); }
    catch (ex: any) { setErr(ex.message || "Login failed."); }
    finally { setLoading(false); }
  }

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <div className="auth-hero">
          <div className="auth-brand-row">
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#8e2d53,#c94d7b)", display: "grid", placeItems: "center" }}>
              <Mic size={18} color="#fff" />
            </div>
            <div>
              <strong style={{ fontSize: 13, letterSpacing: "-.02em" }}>FieldVoice AI</strong>
              <span>AI-Powered Field Intelligence</span>
            </div>
          </div>
          <span className="eyebrow" style={{ marginTop: 55 }}>THE NEXT GENERATION</span>
          <h1>Voice-first<br /><span style={{ color: "#b83b68" }}>field sales</span><br />intelligence.</h1>
          <p>Record 30-second voice notes in the field. Let AI extract insights, generate reports, and keep management informed — automatically.</p>
          <div className="auth-feature-list">
            <div><Mic size={15} /><div><strong>Voice → Intelligence</strong><span>Speak naturally. AI extracts insights, risks, and opportunities.</span></div></div>
            <div><CloudOff size={15} /><div><strong>Offline-first capture</strong><span>Record even without internet. Syncs automatically when connected.</span></div></div>
            <div><Bot size={15} /><div><strong>Gemini-powered analysis</strong><span>Sentiment, buying signals, competitor mentions — all extracted automatically.</span></div></div>
            <div><ShieldCheck size={15} /><div><strong>Role-based access</strong><span>Field rep, manager, and executive views governed by backend RBAC.</span></div></div>
          </div>
        </div>
        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-icon"><ShieldCheck size={18} /></div>
            <StatusChip label="Secure login" ok />
          </div>
          <h2>Welcome back</h2>
          <p className="auth-subtitle">Sign in with your FieldVoice account credentials to access your field intelligence workspace.</p>
          <form onSubmit={submit}>
            <label className="auth-field">
              <span>Email address</span>
              <div className="auth-input-wrap">
                <CircleUserRound size={15} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
              </div>
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-input-wrap">
                <ShieldCheck size={15} />
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required />
                <button type="button" className="auth-eye" onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
            </label>
            {err && <div className="auth-error"><AlertTriangle size={14} /><span>{err}</span></div>}
            <div className="auth-note"><ShieldCheck size={13} /><span>This is a real backend login. Your role and permissions are determined by the authenticated account — no frontend role switching.</span></div>
            <button className="button primary auth-submit" type="submit" disabled={loading}>
              {loading ? <><Spinner size={14} /> Signing in…</> : <><LogOut size={15} /> Sign in to FieldVoice</>}
            </button>
          </form>
          <div className="auth-footer">
            <span>FieldVoice AI v0.1 · Prototype</span>
            <span>JWT-secured · Role-based access</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth & UI state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [boot, setBoot] = useState(true);
  const [view, setView] = useState<View>("home");
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ title: string; message: string; type?: "success" | "error" | "info"; action?: string } | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("fv_theme");
    return saved === "dark" ? "dark" : "light";
  });

  // ── Data state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [tasks, setTasks] = useState<ApiActionItem[]>([]);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [visits, setVisits] = useState<ApiVisit[]>([]);
  const [reports, setReports] = useState<ApiReport[]>([]);
  const [apiOK, setApiOK] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Visit / recording state
  const [selectedCustomer, setSelectedCustomer] = useState<ApiCustomer | null>(null);
  const [activeVisit, setActiveVisit] = useState<ApiVisit | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<ApiVisit | null>(null);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<ApiCustomer | null>(null);
  const [selectedReport, setSelectedReport] = useState<ApiReport | null>(null);

  // ── Recording state
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [generated, setGenerated] = useState(false);
  const [editing, setEditing] = useState(false);

  // ── Offline state
  const [online, setOnline] = useState(navigator.onLine);
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // ── Recorder refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");

  const role = uiRole(user?.role || "");

  // ── Helpers
  const notify = (m: string) => setToast(m);
  const go = (v: View) => { setView(v); setMenu(false); setMobile(false); };
  const showModal = (title: string, message: string, type: "success" | "error" | "info" = "info", action?: string) =>
    setModal({ title, message, type, action });
  const closeModal = () => setModal(null);

  // ─── Bootstrap auth ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = token();
    if (!t) { setBoot(false); return; }
    meApi(t)
      .then(u => setUser(u))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setUser(null); })
      .finally(() => setBoot(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("fv_theme", theme);
  }, [theme]);


  // ─── Toast auto-dismiss ──────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const x = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(x);
  }, [toast]);

  // ─── Recording timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!recording) return;
    const x = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(x);
  }, [recording]);

  // ─── Data loading ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const results = await Promise.allSettled([
        apiGet<DashboardData>("/dashboard/overview"),
        apiGet<any>("/action-items/"),
        apiGet<any>("/alerts/"),
        apiGet<any>("/leads/"),
        apiGet<any>("/customers/"),
        apiGet<any>("/visits/"),
        apiGet<any>("/reports/"),
      ]);
      const [d, t, a, l, c, v, rp] = results;
      if (d.status === "fulfilled") setDashboard(d.value);
      if (t.status === "fulfilled") setTasks(t.value.action_items || []);
      if (a.status === "fulfilled") setAlerts(a.value.alerts || []);
      if (l.status === "fulfilled") setLeads(l.value.leads || []);
      if (c.status === "fulfilled") setCustomers(c.value.customers || []);
      if (v.status === "fulfilled") setVisits(v.value.visits || []);
      if (rp.status === "fulfilled") setReports(rp.value.reports || []);
      const failed = results.filter(x => x.status === "rejected");
      setApiOK(failed.length === 0);
      if (failed.length && !navigator.onLine) notify("Offline: showing the latest available data.");
      else if (failed.length) notify("Some workspace data could not be refreshed.");
    } catch (e: any) {
      setApiOK(false);
      notify(e.message || "Failed to load data.");
    }
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  // ─── Auto-poll every 30s ─────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const x = setInterval(() => load(), 30000);
    return () => clearInterval(x);
  }, [user, load]);

  // ─── Offline count ───────────────────────────────────────────────────────
  async function refreshOfflineCount() {
    try { setOfflineCount((await getOfflineRecordings()).length); } catch { }
  }
  useEffect(() => { refreshOfflineCount(); }, []);

  // ─── Online/offline events ───────────────────────────────────────────────
  useEffect(() => {
    const onOnline = async () => {
      setOnline(true);
      notify("Back online — syncing saved recordings.");
      await syncOfflineQueue(true);
    };
    const onOffline = () => { setOnline(false); notify("You are offline. Recordings will be saved locally."); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [user]);

  // ─── Local data cleanup ─────────────────────────────────────────────────────
  async function clearOfflineQueue() {
    try {
      const rows = await getOfflineRecordings();
      for (const row of rows) {
        await deleteOfflineRecording(row.id);
      }
      setOfflineCount(0);
      notify(rows.length
        ? `${rows.length} queued recording${rows.length > 1 ? "s" : ""} removed from this device.`
        : "No queued recordings found.");
    } catch (e: any) {
      notify(e?.message || "Could not clear offline recordings.");
    }
  }

  // ─── Auth actions ────────────────────────────────────────────────────────
  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null); setDashboard(null); setTasks([]); setAlerts([]); setLeads([]);
    setCustomers([]); setVisits([]); setReports([]); setActiveVisit(null);
    setReport(null); setGenerated(false); setApiOK(false);
    go("home"); notify("Signed out successfully.");
  }

  async function signIn(email: string, password: string) {
    const t = await loginApi(email, password);
    const u = await meApi(t);
    if (!uiRole(u.role)) throw new Error("Unsupported role.");
    localStorage.setItem(TOKEN_KEY, t);
    setUser(u);
    notify(`Welcome back, ${u.full_name.split(" ")[0]}!`);
  }

  // ─── Visit management ────────────────────────────────────────────────────
  async function startVisit(customer: ApiCustomer) {
    setSelectedCustomer(customer);
    setReport(null); setGenerated(false); setEditing(false);
    setAudioUrl(null); setAudioBlob(null); setSeconds(0); setAudioDuration(0);

    // Offline-first: create a local visit shell. The real server visit is created during sync.
    if (!navigator.onLine) {
      const localVisit: ApiVisit = {
        id: `offline-visit-${Date.now()}`,
        customer_id: customer.id,
        customer_name: customer.name,
        user_id: user?.id || "offline-user",
        user_name: user?.full_name || "Field Representative",
        visit_date: new Date().toISOString(),
        status: "IN_PROGRESS",
        visit_type: "CUSTOMER_VISIT",
        notes: "Offline visit — pending server sync.",
        latitude: customer.latitude,
        longitude: customer.longitude,
      };
      setActiveVisit(localVisit);
      go("record");
      notify(`Offline visit started with ${customer.name}`);
      return;
    }

    try {
      const r = await fetch(
        `${API_BASE_URL}/visits/?customer_id=${encodeURIComponent(customer.id)}&visit_type=CUSTOMER_VISIT&status_value=IN_PROGRESS`,
        { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } }
      );
      if (!r.ok) throw new Error(await apiError(r));
      const data = await r.json();
      const newVisit: ApiVisit = data.visit || data;
      setActiveVisit(newVisit);
      go("record");
      notify(`Visit started with ${customer.name}`);
      await load();
    } catch (e: any) {
      // If connectivity drops between the online check and POST, keep the visit usable locally.
      const localVisit: ApiVisit = {
        id: `offline-visit-${Date.now()}`, customer_id: customer.id, customer_name: customer.name,
        user_id: user?.id || "offline-user", user_name: user?.full_name || "Field Representative",
        visit_date: new Date().toISOString(), status: "IN_PROGRESS", visit_type: "CUSTOMER_VISIT",
        notes: "Offline visit — pending server sync.", latitude: customer.latitude, longitude: customer.longitude,
      };
      setActiveVisit(localVisit);
      go("record");
      notify(`Connection lost. Visit saved locally for ${customer.name}.`);
    }
  }

  async function completeVisit(visitId: string) {
    try {
      await fetch(
        `${API_BASE_URL}/visits/${visitId}`,
        { method: "PATCH", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token()}` }, body: JSON.stringify({ status: "COMPLETED" }) }
      );
    } catch { /* non-fatal — visit status patch may not exist yet */ }
  }

  // ─── Voice recording ─────────────────────────────────────────────────────
  async function startRecording() {
    try {
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
      const supported = types.find(t => MediaRecorder.isTypeSupported(t)) || "";
      mimeRef.current = supported.split(";")[0] || "audio/webm";

      const mr = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      recorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob); setAudioUrl(url); setAudioDuration(seconds);
      };
      mr.start(250);
      setRecording(true); setSeconds(0);
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        showModal("Microphone Permission Denied", "Please allow microphone access in your browser settings and try again.", "error");
      } else {
        showModal("Recording Error", e.message || "Could not start recording.", "error");
      }
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRecording(false);
  }

  function discardRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null); setAudioBlob(null); setSeconds(0); setAudioDuration(0);
    setReport(null); setGenerated(false);
  }

  // ─── Upload & AI processing ───────────────────────────────────────────────
  async function uploadAndProcess() {
    if (!audioBlob) return;
    const visitId = activeVisit?.id;
    if (!visitId) {
      showModal("No Active Visit", "Please start a visit before uploading a voice note.", "error");
      return;
    }

    setProcessing(true);
    setProcessingStep("Uploading voice note…");

    try {
      // 1. Upload voice note
      const fd = new FormData();
      fd.append("visit_id", visitId);
      fd.append("duration_seconds", String(audioDuration || seconds));
      fd.append("recorded_at", new Date().toISOString());
      const ext = mimeRef.current.includes("mp4") ? "m4a" : mimeRef.current.includes("ogg") ? "ogg" : "webm";
      fd.append("audio_file", audioBlob, `fieldvoice-${Date.now()}.${ext}`);

      const upRes = await fetch(`${API_BASE_URL}/voice-notes/upload`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
        body: fd
      });
      if (!upRes.ok) throw new Error(`Upload failed: ${await apiError(upRes)}`);
      const upData = await upRes.json();

      setProcessingStep("Generating AI report draft…");

      // 2. Create report draft
      const voiceNote = upData.voice_note || {};
      const aiAnalysis = upData.ai_analysis || {};
      let reportData: any = null;

      try {
        const draftRes = await fetch(
          `${API_BASE_URL}/reports/draft?visit_id=${encodeURIComponent(visitId)}${voiceNote.id ? `&voice_note_id=${encodeURIComponent(voiceNote.id)}` : ""}`,
          { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } }
        );
        if (draftRes.ok) reportData = await draftRes.json();
      } catch { /* report draft is optional — continue */ }

      setProcessingStep("Building insights…");

      // 3. Build frontend report object
      const transcript = String(voiceNote.transcription || upData.transcription || "").trim();
      const customer = selectedCustomer;
      const visit = activeVisit;

      const sentimentMap: Record<string, Report["sentiment"]> = {
        POSITIVE: "Positive", NEUTRAL: "Neutral", NEGATIVE: "Negative", MIXED: "Cautious"
      };
      const sentiment = sentimentMap[String(aiAnalysis.sentiment || "").toUpperCase()] || "Neutral";
      const opp = String(aiAnalysis.opportunity_signal || "").toUpperCase();
      const risk = String(aiAnalysis.risk_signal || "").toUpperCase();
      const interest = opp === "HIGH" ? 90 : opp === "MEDIUM" ? 65 : 40;
      const priority: Report["priority"] = (risk === "HIGH" || opp === "HIGH") ? "High" : (risk === "MEDIUM" || opp === "MEDIUM") ? "Medium" : "Low";

      const insights = Array.isArray(aiAnalysis.key_insights)
        ? aiAnalysis.key_insights.filter(Boolean).map(String)
        : [];
      const actions = Array.isArray(aiAnalysis.action_items)
        ? aiAnalysis.action_items.filter(Boolean).map(String)
        : [];

      const builtReport: Report = {
        id: reportData?.report?.id || `FV-${Date.now()}`,
        reportId: reportData?.report?.id,
        client: customer?.name || visit?.customer_name || "Customer",
        person: user?.full_name || "Field Representative",
        location: [customer?.city, customer?.state].filter(Boolean).join(", ") || "Field location",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        sentiment,
        interest,
        priority,
        summary: String(aiAnalysis.summary || reportData?.report?.ai_draft || transcript || "Voice visit recorded.").trim(),
        concerns: insights.length ? insights.slice(0, 6) : ["Visit completed and recorded."],
        actions: actions.length ? actions.slice(0, 5) : ["Review visit and follow up as needed."],
        sourceDuration: timeFmt(audioDuration || seconds),
        voiceNoteId: voiceNote.id,
        visitId,
        audioUrl: audioUrl || undefined,
        transcript,
        offlinePending: false,
        opportunity: opp,
        risk,
      };

      setReport(builtReport);
      setGenerated(true);
      setProcessing(false);
      setProcessingStep("");
      await load();
      go("report");
    } catch (e: any) {
      setProcessing(false);
      setProcessingStep("");

      // Try offline save
      if (!navigator.onLine || e.message?.includes("fetch")) {
        try {
          const offId = `offline-${Date.now()}`;
          await saveOfflineRecording({
            id: offId,
            visitId: activeVisit?.id || "unknown",
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer?.name || "Unknown Customer",
            duration: audioDuration || seconds,
            recordedAt: new Date().toISOString(),
            blob: audioBlob!
          });
          await refreshOfflineCount();
          const offlineReport: Report = {
            id: offId,
            client: selectedCustomer?.name || "Customer",
            person: user?.full_name || "Field Rep",
            location: selectedCustomer?.city || "Field",
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            sentiment: "Neutral", interest: 50, priority: "Medium",
            summary: "Voice note saved offline. AI analysis will run after reconnecting.",
            concerns: ["Transcript pending — awaiting sync."],
            actions: ["Recording will sync automatically when online."],
            sourceDuration: timeFmt(audioDuration || seconds),
            visitId: activeVisit?.id,
            audioUrl: audioUrl || undefined,
            offlinePending: true, offlineId: offId,
          };
          setReport(offlineReport); setGenerated(true); setEditing(false);
          go("report");
          notify("Saved offline. Will sync when connected.");
        } catch {
          showModal("Upload Failed", e.message || "Could not upload voice note.", "error");
        }
      } else {
        showModal("Upload Failed", e.message || "Could not upload voice note.", "error");
      }
    }
  }

  // ─── Offline sync ─────────────────────────────────────────────────────────
  async function syncOfflineQueue(showNotif = false) {
    if (!navigator.onLine) return;
    const rows = await getOfflineRecordings();
    if (!rows.length) { setOfflineCount(0); return; }
    setSyncing(true);
    let synced = 0;
    for (const row of rows) {
      try {
        let serverVisitId = row.visitId;
        if (String(serverVisitId).startsWith("offline-visit-") || serverVisitId === "unknown") {
          if (!row.customerId) throw new Error("Offline recording has no customer reference.");
          const visitRes = await fetch(
            `${API_BASE_URL}/visits/?customer_id=${encodeURIComponent(row.customerId)}&visit_type=CUSTOMER_VISIT&status_value=IN_PROGRESS`,
            { method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${token()}` } }
          );
          if (!visitRes.ok) throw new Error(await apiError(visitRes));
          const visitData = await visitRes.json();
          serverVisitId = (visitData.visit || visitData).id;
        }
        const fd = new FormData();
        fd.append("visit_id", serverVisitId);
        fd.append("duration_seconds", String(row.duration));
        fd.append("recorded_at", row.recordedAt);
        fd.append("audio_file", row.blob, `fieldvoice-sync-${row.id}.webm`);
        const res = await fetch(`${API_BASE_URL}/voice-notes/upload`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: `Bearer ${token()}` },
          body: fd
        });
        if (res.ok) { await deleteOfflineRecording(row.id); synced++; }
      } catch { }
    }
    setSyncing(false);
    setOfflineCount(Math.max(0, rows.length - synced));
    if (showNotif && synced) showModal("Sync Complete", `${synced} offline recording${synced > 1 ? "s" : ""} synced successfully.`, "success");
    await load();
  }

  // ─── Report submit ────────────────────────────────────────────────────────
  async function submitReport(edited?: Report) {
    const current = edited || report;
    if (!current?.reportId) {
      showModal("Report Error", "No report draft found in the system. Please regenerate the report.", "error");
      return;
    }
    try {
      if (edited) {
        const editedText = [
          `FIELD VISIT REPORT — ${edited.client}`,
          `Summary: ${edited.summary}`,
          `Key Insights:
${edited.concerns.map(x => `• ${x}`).join("\n")}`,
          `Action Items:
${edited.actions.map(x => `• ${x}`).join("\n")}`,
        ].join("\n\n");
        await apiPatch(`/reports/${current.reportId}/edit`, { edited_report: editedText });
        setReport(current);
      }
      await apiPost(`/reports/${current.reportId}/submit`);
      await completeVisit(current.visitId || "");
      await load();
      showModal("Report Submitted", "Your field report has been submitted to management successfully.", "success", "Back to dashboard");
    } catch (e: any) {
      showModal("Submission Failed", e.message || "Could not submit report.", "error");
    }
  }

  async function editAndSaveReport(editedText: string) {
    if (!report?.reportId) return;
    try {
      await apiPatch(`/reports/${report.reportId}/edit`, { edited_report: editedText });
      setReport({ ...report, summary: editedText });
      notify("Report saved.");
    } catch (e: any) {
      notify(`Save failed: ${e.message}`);
    }
  }

  // ─── Task / Alert updates ─────────────────────────────────────────────────
  async function updateTaskStatus(id: string, status: string) {
    try {
      await apiPatch(`/action-items/${id}`, { status });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
      notify("Task updated.");
    } catch (e: any) { notify(`Update failed: ${e.message}`); }
  }

  async function updateAlertStatus(id: string, status: string) {
    try {
      await apiPatch(`/alerts/${id}`, { status });
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      notify("Alert updated.");
    } catch (e: any) { notify(`Update failed: ${e.message}`); }
  }

  // ─── Navigation helpers ───────────────────────────────────────────────────
  function openCustomer(c: ApiCustomer) { setSelectedCustomerDetail(c); go("customer-detail"); }
  function openVisit(v: ApiVisit) { setSelectedVisit(v); go("visit-detail"); }
  function openReport(r: ApiReport) { setSelectedReport(r); go("reports"); }

  // ─── Search results ───────────────────────────────────────────────────────
  const searchResults = searchQ.trim().length > 1 ? {
    customers: customers.filter(c => c.name.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 4),
    leads: leads.filter(l => l.title.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 3),
    tasks: tasks.filter(t => t.title.toLowerCase().includes(searchQ.toLowerCase())).slice(0, 3),
  } : null;

  // ─── SIDEBAR ──────────────────────────────────────────────────────────────
  const salespersonNav = [
    { id: "home", label: "Dashboard", icon: LayoutDashboard },
    { id: "visits", label: "My Visits", icon: MapPin },
    { id: "record", label: "Record Visit", icon: Mic },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "customers", label: "Customers", icon: Users },
    { id: "tasks", label: "Action Items", icon: ClipboardCheck },
    { id: "alerts", label: "Alerts", icon: Bell },
    { id: "history", label: "History", icon: History },
    { id: "map", label: "Territory Map", icon: Navigation },
    { id: "settings", label: "Settings", icon: Settings },
  ];
  const managerNav = [
    { id: "home", label: "Dashboard", icon: LayoutDashboard },
    { id: "visits", label: "Team Visits", icon: MapPin },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "leads", label: "Pipeline", icon: Target },
    { id: "customers", label: "Customers", icon: Users },
    { id: "tasks", label: "Action Items", icon: ClipboardCheck },
    { id: "alerts", label: "Alerts", icon: Bell },
    { id: "insights", label: "AI Insights", icon: Sparkles },
    { id: "team", label: "Team", icon: BriefcaseBusiness },
    { id: "map", label: "Territory", icon: Navigation },
    { id: "settings", label: "Settings", icon: Settings },
  ];
  const executiveNav = [
    { id: "home", label: "Executive View", icon: Gauge },
    { id: "reports", label: "Reports", icon: FileText },
    { id: "leads", label: "Pipeline", icon: Target },
    { id: "insights", label: "AI Intelligence", icon: Sparkles },
    { id: "map", label: "Territory", icon: Navigation },
    { id: "team", label: "Organization", icon: BriefcaseBusiness },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const navItems = role === "Manager" ? managerNav : role === "Executive" ? executiveNav : salespersonNav;

  // ─── LOADING SCREEN ───────────────────────────────────────────────────────
  if (boot) {
    return (
      <div className="auth-shell auth-loading-shell">
        <div className="auth-card auth-loading-card">
          <div className="auth-brand-mark">
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#8e2d53,#c94d7b)", display: "grid", placeItems: "center", margin: "0 auto" }}>
              <Mic size={24} color="#fff" />
            </div>
          </div>
          <h1>FieldVoice AI</h1>
          <p>Loading your workspace…</p>
          <div className="auth-loading-bar"><span /></div>
        </div>
      </div>
    );
  }

  // ─── LOGIN GATE ───────────────────────────────────────────────────────────
  if (!user) return <LoginPage onLogin={signIn} />;

  // ─── MAIN SHELL ───────────────────────────────────────────────────────────
  return (
    <div className="shell">
      {/* SIDEBAR */}
      <nav className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark"><Mic size={16} /></div>
          <div>
            <strong>FieldVoice AI</strong>
            <span>{role}</span>
          </div>
          <button className="close-nav" onClick={() => setMobile(false)}><X size={18} /></button>
        </div>
        <div className="sidebar-nav">
          {navItems.map(n => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id || (view === "visit-detail" && n.id === "visits") || (view === "customer-detail" && n.id === "customers") ? "active" : ""}`}
              onClick={() => go(n.id as View)}
            >
              <n.icon size={16} />
              <span>{n.label}</span>
              {n.id === "alerts" && alerts.filter(a => a.status === "OPEN").length > 0 && (
                <span className="nav-badge">{alerts.filter(a => a.status === "OPEN").length}</span>
              )}
              {n.id === "tasks" && tasks.filter(t => t.status === "PENDING").length > 0 && (
                <span className="nav-badge">{tasks.filter(t => t.status === "PENDING").length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-user-mini">
          <div className="avatar">{initials(user.full_name)}</div>
          <div>
            <strong>{user.full_name}</strong>
            <span>{user.email}</span>
          </div>
        </div>
      </nav>

      {/* MAIN */}
      <div className="main-shell">
        {/* TOPBAR */}
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-only icon-btn" onClick={() => setMobile(true)}><Menu size={20} /></button>
            <div className="crumb">
              <span>FieldVoice</span>
              <ChevronRight size={13} />
              <b>{navItems.find(n => n.id === view)?.label || view}</b>
            </div>
          </div>
          <div className="top-actions">
            {/* Search */}
            <div className={`search-box ${searchOpen ? "wide" : ""}`} style={{ position: "relative" }}>
              <Search size={14} />
              <input
                placeholder="Search customers, reports…"
                value={searchQ}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                onChange={e => setSearchQ(e.target.value)}
              />
              {searchResults && searchOpen && (
                <div className="search-dropdown">
                  {searchResults.customers.length > 0 && <>
                    <div className="search-group">Customers</div>
                    {searchResults.customers.map(c => (
                      <div key={c.id} className="search-item" onMouseDown={() => { openCustomer(c); setSearchQ(""); }}>
                        <Building2 size={12} />{c.name}
                      </div>
                    ))}
                  </>}
                  {searchResults.leads.length > 0 && <>
                    <div className="search-group">Leads</div>
                    {searchResults.leads.map(l => (
                      <div key={l.id} className="search-item" onMouseDown={() => { go("leads"); setSearchQ(""); }}>
                        <Target size={12} />{l.title}
                      </div>
                    ))}
                  </>}
                  {searchResults.tasks.length > 0 && <>
                    <div className="search-group">Tasks</div>
                    {searchResults.tasks.map(t => (
                      <div key={t.id} className="search-item" onMouseDown={() => { go("tasks"); setSearchQ(""); }}>
                        <ClipboardCheck size={12} />{t.title}
                      </div>
                    ))}
                  </>}
                  {!searchResults.customers.length && !searchResults.leads.length && !searchResults.tasks.length && (
                    <div className="search-item" style={{ color: "#6d5963" }}>No results for "{searchQ}"</div>
                  )}
                </div>
              )}
            </div>

            {/* Online status */}
            <span className={`pill ${online ? "" : "offline-pill"}`} style={{ gap: 5 }}>
              {online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {syncing ? "Syncing…" : online ? "Online" : "Offline"}
            </span>
            {offlineCount > 0 && (
              <button className="offline-queue-chip" onClick={() => syncOfflineQueue(true)}>
                <CloudOff size={13} /><b>{offlineCount}</b> pending
              </button>
            )}

            {/* Refresh */}
            <button className="icon-btn" onClick={load} title="Refresh data"><RefreshCw size={16} /></button>

            {/* Profile */}
            <div className="profile-wrap">
              <div className="profile">
                <div className="avatar">{initials(user.full_name)}</div>
              <div className="profile-copy">
                <strong>{user.full_name.split(" ")[0]}</strong>
                <span>{role}</span>
              </div>
              </div>
            </div>
          </div>
        </header>

        {/* BANNERS */}
        {!online && (
          <div className="offline-banner">
            <WifiOff size={17} />
            <div>
              <strong>You are offline</strong>
              <span>Recordings are saved on this device and will sync automatically when you reconnect.</span>
            </div>
          </div>
        )}
        {syncing && (
          <div className="sync-banner">
            <RefreshCw size={17} />
            <div><strong>Syncing offline recordings…</strong></div>
            <button onClick={() => setSyncing(false)}><X size={13} /></button>
          </div>
        )}

        {/* CONTENT */}
        <main className="content">
          {/* Role-based routing */}
          {role === "Salesperson" && (
            <SalespersonViews
              view={view} dashboard={dashboard} tasks={tasks} alerts={alerts}
              leads={leads} customers={customers} visits={visits} reports={reports}
              report={report} generated={generated} editing={editing}
              recording={recording} processing={processing} processingStep={processingStep}
              seconds={seconds} audioUrl={audioUrl} audioBlob={audioBlob}
              online={online} user={user} selectedCustomer={selectedCustomer}
              activeVisit={activeVisit} selectedVisit={selectedVisit}
              selectedCustomerDetail={selectedCustomerDetail}
              setEditing={setEditing} setReport={setReport}
              onGo={go} onStartVisit={startVisit} onStartRec={startRecording}
              onStopRec={stopRecording} onDiscard={discardRecording}
              onUpload={uploadAndProcess} onSubmit={submitReport}
              onEmail={() => go("email")} onRecordAgain={() => { discardRecording(); go("record"); }}
              onUpdateTask={updateTaskStatus} onUpdateAlert={updateAlertStatus}
              onOpenCustomer={openCustomer} onOpenVisit={openVisit}
            />
          )}
          {role === "Manager" && (
            <ManagerViews
              view={view} dashboard={dashboard} tasks={tasks} alerts={alerts}
              leads={leads} customers={customers} visits={visits} reports={reports}
              user={user} onGo={go} onUpdateTask={updateTaskStatus}
              onUpdateAlert={updateAlertStatus} onOpenCustomer={openCustomer}
              selectedCustomerDetail={selectedCustomerDetail}
            />
          )}
          {role === "Executive" && (
            <ExecutiveViews
              view={view} dashboard={dashboard} alerts={alerts}
              leads={leads} customers={customers} reports={reports} onGo={go}
            />
          )}

          {/* SHARED VIEWS (all roles) */}
          {view === "settings" && (
            <SettingsView user={user} apiOK={apiOK} onLogout={logout} theme={theme} onThemeChange={setTheme} offlineCount={offlineCount} onClearOffline={clearOfflineQueue} />
          )}
          {view === "email" && report && (
            <EmailView report={report} onGo={go} user={user} />
          )}
        </main>
      </div>

      {/* TOAST */}
      {toast && <div className="toast"><Check size={14} />{toast}</div>}

      {/* MODAL */}
      {modal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="success-modal">
            <div className={`success-icon ${modal.type === "error" ? "error-icon" : modal.type === "success" ? "ok-icon" : ""}`}>
              {modal.type === "error" ? <XCircle size={28} /> : modal.type === "success" ? <CheckCircle2 size={28} /> : <Info size={28} />}
            </div>
            <h2>{modal.title}</h2>
            <p>{modal.message}</p>
            <button className="button primary" onClick={() => {
              if (modal.action === "Back to dashboard") go("home");
              closeModal();
            }}>
              {modal.action || "Close"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALESPERSON VIEWS
// ═══════════════════════════════════════════════════════════════════════════════
function SalespersonViews(props: any) {
  const { view } = props;
  if (view === "home") return <SalesHome {...props} />;
  if (view === "visits") return <VisitsView {...props} />;
  if (view === "visit-detail") return <VisitDetailView {...props} />;
  if (view === "record") return <RecordView {...props} />;
  if (view === "report") return <ReportEditorView {...props} />;
  if (view === "reports") return <ReportsListView {...props} />;
  if (view === "customers") return <CustomersView {...props} />;
  if (view === "customer-detail") return <CustomerDetailView {...props} />;
  if (view === "tasks") return <TasksView {...props} />;
  if (view === "alerts") return <AlertsView {...props} />;
  if (view === "history") return <HistoryView {...props} />;
  if (view === "map") return <TerritoryView customers={props.customers} />;
  if (view === "settings" || view === "email") return null;
  return <SalesHome {...props} />;
}

// ─── SALES DASHBOARD ─────────────────────────────────────────────────────────
function SalesHome({ dashboard, tasks, alerts, visits, onGo, user }: any) {
  const pendingTasks = tasks.filter((t: any) => t.status === "PENDING").length;
  const openAlerts = alerts.filter((a: any) => a.status === "OPEN").length;
  const todayVisits = visits.filter((v: any) => {
    const vd = new Date(v.visit_date);
    const today = new Date();
    return vd.toDateString() === today.toDateString();
  }).length;

  return (
    <>
      <SectionHeader
        eyebrow="FIELD INTELLIGENCE"
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user?.full_name?.split(" ")[0] || "Rep"}.`}
        sub="Your field intelligence workspace — real-time data from your visits, voice notes, and AI analysis."
        action={<button className="button primary" onClick={() => onGo("record")}><Mic size={14} /> New Visit</button>}
      />
      <div className="metric-grid">
        <div className="metric-card" style={{ cursor: "pointer" }} onClick={() => onGo("visits")}>
          <div className="metric-top"><MapPin size={18} /><span>Today's visits</span></div>
          <strong className="metric-value">{todayVisits}</strong>
          <span className="metric-sub">Click to manage visits</span>
        </div>
        <div className="metric-card" style={{ cursor: "pointer" }} onClick={() => onGo("tasks")}>
          <div className="metric-top"><ClipboardCheck size={18} /><span>Pending actions</span></div>
          <strong className="metric-value">{pendingTasks}</strong>
          <span className="metric-sub">{pendingTasks > 0 ? "Needs attention" : "All clear"}</span>
        </div>
        <div className="metric-card amber" style={{ cursor: "pointer" }} onClick={() => onGo("alerts")}>
          <div className="metric-top"><Bell size={18} /><span>Open alerts</span></div>
          <strong className="metric-value">{openAlerts}</strong>
          <span className="metric-sub">{openAlerts > 0 ? "Tap to review" : "No open alerts"}</span>
        </div>
        <div className="metric-card green">
          <div className="metric-top"><Zap size={18} /><span>High opportunities</span></div>
          <strong className="metric-value">{dashboard?.overview.high_opportunities ?? 0}</strong>
          <span className="metric-sub">From AI analysis</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid-2" style={{ marginTop: 8 }}>
        <div className="panel hero-record" style={{ cursor: "pointer" }} onClick={() => onGo("record")}>
          <div>
            <span className="pill"><Mic size={13} /> VOICE CAPTURE</span>
            <h2>Start a new<br /><span>field visit.</span></h2>
            <p>Select customer → Record voice note → AI generates insights → Submit report.</p>
            <button className="button primary" onClick={(e) => { e.stopPropagation(); onGo("record"); }}>
              <Mic size={15} /> Start recording
            </button>
          </div>
          <div className="orb-art">
            <div className="orb-ring" /><div className="orb-ring" /><div className="orb-ring" />
            <div className="orb-center"><Mic size={32} /></div>
          </div>
        </div>
        <div className="panel">
          <PanelTitle title="Recent visits" icon={Activity} action={<button className="text-button" onClick={() => onGo("visits")}>View all <ArrowUpRight size={12} /></button>} />
          <RecentVisits dashboard={dashboard} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 8 }}>
        <div className="panel">
          <PanelTitle title="Pending action items" icon={ClipboardCheck} action={<button className="text-button" onClick={() => onGo("tasks")}>View all <ArrowUpRight size={12} /></button>} />
          {tasks.filter((t: any) => t.status === "PENDING").slice(0, 4).length === 0
            ? <Empty text="No pending action items." />
            : tasks.filter((t: any) => t.status === "PENDING").slice(0, 4).map((t: any) => (
              <div className="activity-item" key={t.id}>
                <div className={`activity-dot ${t.priority?.toLowerCase()}`} />
                <div className="activity-body">
                  <strong>{t.title}</strong>
                  <span>{t.customer_name || "General"} · {t.priority}</span>
                </div>
                <Badge label={t.status} type={t.status === "COMPLETED" ? "success" : "pending"} />
              </div>
            ))}
        </div>
        <div className="panel">
          <PanelTitle title="Open alerts" icon={Bell} action={<button className="text-button" onClick={() => onGo("alerts")}>View all <ArrowUpRight size={12} /></button>} />
          {alerts.filter((a: any) => a.status === "OPEN").slice(0, 4).length === 0
            ? <Empty text="No open alerts." />
            : alerts.filter((a: any) => a.status === "OPEN").slice(0, 4).map((a: any) => (
              <div className="activity-item" key={a.id}>
                <AlertTriangle size={14} style={{ color: a.severity === "HIGH" ? "#e05a7a" : "#f5b84b", flexShrink: 0 }} />
                <div className="activity-body">
                  <strong>{a.title}</strong>
                  <span>{a.customer_name || "—"} · {a.severity}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

// ─── VISITS VIEW ──────────────────────────────────────────────────────────────
function VisitsView({ visits, customers, onGo, onStartVisit, onOpenVisit }: any) {
  const [filter, setFilter] = useState("ALL");
  const filtered = visits.filter((v: ApiVisit) => filter === "ALL" || v.status === filter);

  return (
    <>
      <SectionHeader
        eyebrow="VISIT MANAGEMENT"
        title="My visits"
        sub="Manage your field visits. Start a new visit to record a voice note and generate AI insights."
        action={<button className="button primary" onClick={() => onGo("record")}><Plus size={14} /> New Visit</button>}
      />
      <div className="filter-row">
        {["ALL", "IN_PROGRESS", "COMPLETED", "PLANNED"].map(f => (
          <button key={f} className={`pill ${filter === f ? "active-pill" : ""}`} onClick={() => setFilter(f)}>
            {f === "ALL" ? "All" : f.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? <Empty text="No visits found." icon={MapPin} /> : (
          <div className="table-list">
            <div className="table-header">
              <span>Customer</span><span>Date</span><span>Status</span><span>Type</span><span />
            </div>
            {filtered.map((v: ApiVisit) => (
              <div className="table-row" key={v.id} onClick={() => onOpenVisit(v)} style={{ cursor: "pointer" }}>
                <div>
                  <strong>{v.customer_name}</strong>
                  <span style={{ fontSize: 9, color: "#6d5963" }}>{v.user_name}</span>
                </div>
                <span>{fmtDateTime(v.visit_date)}</span>
                <Badge label={v.status.replace("_", " ")} type={v.status === "COMPLETED" ? "success" : v.status === "IN_PROGRESS" ? "active" : "pending"} />
                <span style={{ fontSize: 9, color: "#9c8a94" }}>{v.visit_type}</span>
                <ChevronRight size={14} style={{ color: "#5d4d56" }} />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Start new visit */}
      <div className="panel" style={{ marginTop: 14 }}>
        <PanelTitle title="Start a new visit" icon={Plus} />
        <p style={{ fontSize: 10, color: "#8d808a", margin: "8px 0 14px" }}>Select a customer from the list below to begin a visit and record a voice note.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {customers.slice(0, 6).map((c: ApiCustomer) => (
            <div className="customer-row" key={c.id} onClick={() => onStartVisit(c)} style={{ cursor: "pointer" }}>
              <div className="avatar">{initials(c.name)}</div>
              <div>
                <strong>{c.name}</strong>
                <span>{c.city}{c.industry ? ` · ${c.industry}` : ""}</span>
              </div>
              <button className="button primary" style={{ padding: "6px 14px", fontSize: 10 }} onClick={e => { e.stopPropagation(); onStartVisit(c); }}>
                <Mic size={12} /> Start visit
              </button>
            </div>
          ))}
        </div>
        {customers.length > 6 && <button className="text-button" style={{ marginTop: 10 }} onClick={() => onGo("customers")}>View all {customers.length} customers <ArrowUpRight size={12} /></button>}
      </div>
    </>
  );
}

// ─── VISIT DETAIL VIEW ────────────────────────────────────────────────────────
function VisitDetailView({ selectedVisit, visits, customers, onGo, onStartVisit }: any) {
  const visit: ApiVisit | null = selectedVisit;
  if (!visit) { onGo("visits"); return null; }
  const customer = customers.find((c: ApiCustomer) => c.id === visit.customer_id);

  return (
    <>
      <SectionHeader
        eyebrow="VISIT DETAIL"
        title={visit.customer_name}
        sub={`${visit.visit_type.replace("_", " ")} · ${fmtDateTime(visit.visit_date)}`}
        action={<button className="button ghost" onClick={() => onGo("visits")}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Back</button>}
      />
      <div className="grid-2">
        <div className="panel">
          <PanelTitle title="Visit information" icon={MapPin} />
          <div className="settings-list">
            <div><span>Status</span><Badge label={visit.status.replace("_", " ")} type={visit.status === "COMPLETED" ? "success" : "active"} /></div>
            <div><span>Type</span><strong>{visit.visit_type.replace("_", " ")}</strong></div>
            <div><span>Date</span><strong>{fmtDateTime(visit.visit_date)}</strong></div>
            <div><span>Sales rep</span><strong>{visit.user_name}</strong></div>
            {visit.notes && <div><span>Notes</span><strong style={{ whiteSpace: "pre-wrap" }}>{visit.notes}</strong></div>}
          </div>
          <button className="button primary" style={{ marginTop: 14, width: "100%" }} onClick={() => { if (customer) onStartVisit(customer); }}>
            <Mic size={14} /> Record voice note for this visit
          </button>
        </div>
        {customer && (
          <div className="panel">
            <PanelTitle title="Customer" icon={Building2} />
            <div className="settings-list">
              <div><span>Name</span><strong>{customer.name}</strong></div>
              {customer.contact_person && <div><span>Contact</span><strong>{customer.contact_person}</strong></div>}
              {customer.phone && <div><span>Phone</span><strong>{customer.phone}</strong></div>}
              {customer.city && <div><span>City</span><strong>{customer.city}</strong></div>}
              {customer.industry && <div><span>Industry</span><strong>{customer.industry}</strong></div>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── RECORD VIEW ──────────────────────────────────────────────────────────────
function RecordView({
  customers, activeVisit, selectedCustomer, recording, processing, processingStep,
  seconds, audioUrl, audioBlob, online, onGo, onStartVisit, onStartRec, onStopRec,
  onDiscard, onUpload
}: any) {
  const [playingPreview, setPlayingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function togglePreview() {
    if (!audioUrl) return;
    if (!audioRef.current) { audioRef.current = new Audio(audioUrl); audioRef.current.onended = () => setPlayingPreview(false); }
    if (playingPreview) { audioRef.current.pause(); setPlayingPreview(false); }
    else { audioRef.current.play().then(() => setPlayingPreview(true)).catch(() => setPlayingPreview(false)); }
  }

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  return (
    <>
      <SectionHeader
        eyebrow="VOICE CAPTURE"
        title="Record a field visit"
        sub="Select a customer, start a visit, record your voice note, and let AI handle the rest."
      />

      {/* Step 1: Customer selection */}
      {!activeVisit && (
        <div className="panel" style={{ marginBottom: 14 }}>
          <PanelTitle title="Step 1 — Select customer & start visit" icon={Users} />
          <p style={{ fontSize: 10, color: "#8d808a", margin: "8px 0 14px" }}>Choose the customer you are visiting. A visit will be created automatically.</p>
          {customers.length === 0 ? <Empty text="No customers available. Add customers first." /> : (
            <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {customers.map((c: ApiCustomer) => (
                <div className="customer-row" key={c.id}>
                  <div className="avatar">{initials(c.name)}</div>
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.city}{c.industry ? ` · ${c.industry}` : ""}{c.contact_person ? ` · ${c.contact_person}` : ""}</span>
                  </div>
                  <button className="button primary" style={{ padding: "7px 16px", fontSize: 10 }} onClick={() => onStartVisit(c)}>
                    <MapPin size={12} /> Start visit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Recording */}
      {activeVisit && (
        <div className="recorder panel">
          <div className="rec-visit-badge">
            <MapPin size={13} />
            <span>Visit: <strong>{selectedCustomer?.name || activeVisit.customer_name}</strong></span>
            <span className="pill" style={{ fontSize: 8 }}>IN PROGRESS</span>
          </div>

          <div className="hero-record" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span className="eyebrow">STEP 2 — VOICE NOTE</span>
              <h2>{recording ? "Recording…" : audioUrl ? "Recording saved" : "Ready to record"}</h2>
              <p>{recording ? "Speak clearly about your visit, customer needs, and next steps." : audioUrl ? "Preview your recording below or upload for AI analysis." : "Press the button to start your 30-60 second voice note."}</p>
            </div>
            <div className="orb-art" style={{ opacity: recording ? 1 : 0.4 }}>
              <div className={`orb-ring ${recording ? "pulse" : ""}`} />
              <div className={`orb-ring ${recording ? "pulse" : ""}`} />
              <div className="orb-center">
                {recording ? <Square size={28} style={{ color: "#e05a7a" }} /> : <Mic size={28} />}
              </div>
            </div>
          </div>

          {recording && (
            <div className="voice-bars">
              {[...Array(20)].map((_, i) => (
                <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          )}

          <div className="rec-timer">
            {recording ? timeFmt(seconds) : audioUrl ? timeFmt(seconds) : "00:00"}
          </div>

          {!recording && !audioUrl && (
            <div className="rec-bottom">
              <button className="button primary large" onClick={onStartRec}>
                <Mic size={18} /> Start Recording
              </button>
            </div>
          )}

          {recording && (
            <div className="rec-bottom">
              <button className="button danger large" onClick={onStopRec}>
                <Square size={18} /> Stop Recording
              </button>
            </div>
          )}

          {audioUrl && !recording && !processing && (
            <>
              {/* Audio preview */}
              <div className="source-trace" style={{ margin: "12px 0" }}>
                <FileAudio size={17} />
                <div>
                  <strong>Voice recording ready</strong>
                  <span>{timeFmt(seconds)} · Ready for AI analysis</span>
                </div>
                <button className="icon-btn" onClick={togglePreview}>
                  {playingPreview ? <Square size={15} /> : <Play size={15} />}
                </button>
              </div>

              <div className="rec-bottom">
                <button className="button ghost" onClick={() => { setPlayingPreview(false); onDiscard(); }}>
                  <Trash2 size={14} /> Discard
                </button>
                <button className="button ghost" onClick={() => { setPlayingPreview(false); audioRef.current?.pause(); onDiscard(); }}>
                  <Mic size={14} /> Record again
                </button>
                <button className="button primary" onClick={onUpload}>
                  {online ? <><Cloud size={14} /> Upload & Analyze</> : <><CloudOff size={14} /> Save Offline</>}
                </button>
              </div>
            </>
          )}

          {processing && (
            <div className="processing-state">
              <div className="processing-steps">
                <div className={`processing-step active`}><Spinner size={14} /><span>{processingStep || "Processing…"}</span></div>
              </div>
            </div>
          )}

          {!online && !audioUrl && (
            <div className="pending-ai-card">
              <WifiOff size={18} />
              <div>
                <strong>Offline mode</strong>
                <span>You can still record. Your voice note will be saved locally and synced when you reconnect.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI workflow info */}
      <div className="panel" style={{ marginTop: 14 }}>
        <PanelTitle title="How it works" icon={Bot} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginTop: 12 }}>
          {[
            { icon: Mic, label: "1. Record", desc: "30-60 second voice note from the field" },
            { icon: Cloud, label: "2. Upload", desc: "Audio synced to backend securely" },
            { icon: WandSparkles, label: "3. AI Analysis", desc: "Gemini transcribes and extracts insights" },
            { icon: FileText, label: "4. Report", desc: "Review, edit, and submit to management" },
          ].map((s, i) => (
            <div key={i} className="check-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <s.icon size={18} style={{ color: "#b83b68" }} />
              <strong style={{ fontSize: 10 }}>{s.label}</strong>
              <p style={{ fontSize: 9, color: "#8d808a", margin: 0, lineHeight: 1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── REPORT EDITOR VIEW ───────────────────────────────────────────────────────
function ReportEditorView({ report, editing, setEditing, setReport, onSubmit, onEmail, onRecordAgain, onGo }: any) {
  const [playingAudio, setPlayingAudio] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editedSummary, setEditedSummary] = useState(report?.summary || "");
  const [editedConcerns, setEditedConcerns] = useState<string[]>(report?.concerns || []);
  const [editedActions, setEditedActions] = useState<string[]>(report?.actions || []);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (report) {
      setEditedSummary(report.summary || "");
      setEditedConcerns(report.concerns || []);
      setEditedActions(report.actions || []);
    }
  }, [report]);

  if (!report) { onGo("record"); return null; }

  function toggleAudio() {
    if (!report.audioUrl) return;
    if (!audioRef.current) { audioRef.current = new Audio(report.audioUrl); audioRef.current.onended = () => setPlayingAudio(false); }
    if (playingAudio) { audioRef.current.pause(); setPlayingAudio(false); }
    else { audioRef.current.play().then(() => setPlayingAudio(true)).catch(() => setPlayingAudio(false)); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    // Save edits first if editing
    const updatedReport = editing
      ? { ...report, summary: editedSummary, concerns: editedConcerns, actions: editedActions }
      : report;
    if (editing) setReport(updatedReport);
    await onSubmit(updatedReport);
    setSubmitting(false);
  }

  const sentimentClass = report.sentiment?.toLowerCase() || "neutral";

  return (
    <>
      <SectionHeader
        eyebrow={report.offlinePending ? "OFFLINE CAPTURE" : "AI REPORT DRAFT"}
        title={report.offlinePending ? "Recording saved — awaiting sync" : "Review, edit & submit"}
        sub={report.offlinePending
          ? "Your audio is safe on this device. Reconnect to generate transcript and AI insights."
          : "Listen to your recording, verify the AI analysis, edit the draft, then submit to management."}
        action={
          <span className={`pill ${report.offlinePending ? "pending-pill" : ""}`}>
            {report.offlinePending ? <><CloudOff size={13} /> Pending sync</> : <><ShieldCheck size={13} /> Human review required</>}
          </span>
        }
      />

      <div className="report-layout">
        {/* Main report */}
        <div className="panel report-main">
          <div className="report-top">
            <div>
              <span className="eyebrow">FIELD VISIT REPORT</span>
              <h2>{report.client}</h2>
              <span>{report.location} · {report.time}</span>
            </div>
            <div className="report-badges">
              <span className={`sentiment ${sentimentClass}`}>{report.sentiment}</span>
              <span className="priority">{report.priority} priority</span>
              {report.reportId && <span className="pill" style={{ fontSize: 8 }}>#{report.id}</span>}
            </div>
          </div>

          {/* Audio playback */}
          <div className="source-trace">
            <FileAudio size={17} />
            <div>
              <strong>Original voice recording</strong>
              <span>{report.sourceDuration} · {report.offlinePending ? "Stored locally" : "Actual recorded audio"}</span>
            </div>
            <button className="icon-btn" onClick={toggleAudio} disabled={!report.audioUrl}>
              {playingAudio ? <Square size={15} /> : <Play size={15} />}
            </button>
          </div>

          {/* Transcript */}
          {report.transcript ? (
            <div className="field-block transcript-block">
              <h3>Transcript</h3>
              <p>{report.transcript}</p>
            </div>
          ) : report.offlinePending ? (
            <div className="pending-ai-card">
              <CloudOff size={18} />
              <div><strong>Transcript pending</strong><span>AI processing starts automatically after sync.</span></div>
            </div>
          ) : null}

          {/* Summary */}
          <div className="field-block">
            <h3>Summary</h3>
            {editing && !report.offlinePending ? (
              <textarea value={editedSummary} onChange={e => setEditedSummary(e.target.value)} rows={4} />
            ) : <p>{report.summary}</p>}
          </div>

          <div className="field-grid">
            {/* Key insights */}
            <div className="field-block">
              <h3>Key Insights</h3>
              {editing && !report.offlinePending ? (
                <textarea
                  className="tag-editor"
                  value={editedConcerns.join("\n")}
                  onChange={e => setEditedConcerns(e.target.value.split("\n").map(x => x.trim()).filter(Boolean))}
                />
              ) : (
                <div className="tag-list">
                  {(report.concerns || []).map((x: string, i: number) => <span key={i}>{x}</span>)}
                </div>
              )}
            </div>
            {/* Actions */}
            <div className="field-block">
              <h3>Action Items</h3>
              {editing && !report.offlinePending ? (
                <textarea
                  className="tag-editor"
                  value={editedActions.join("\n")}
                  onChange={e => setEditedActions(e.target.value.split("\n").map(x => x.trim()).filter(Boolean))}
                />
              ) : (
                <div className="tag-list">
                  {(report.actions || []).map((x: string, i: number) => <span key={i}>{x}</span>)}
                </div>
              )}
            </div>
          </div>

          <div className="report-actions">
            <button className="button ghost" onClick={onRecordAgain}><Mic size={14} /> Record again</button>
            <button className="button ghost" onClick={() => setEditing(!editing)} disabled={!!report.offlinePending}>
              {editing ? <><Check size={14} /> Done editing</> : <><Edit3 size={14} /> Edit draft</>}
            </button>
            <button className="button secondary" onClick={onEmail} disabled={!!report.offlinePending}><Mail size={14} /> Email draft</button>
            <button className="button primary" onClick={handleSubmit} disabled={!!report.offlinePending || submitting}>
              {submitting ? <><Spinner size={13} /> Submitting…</> : <><Check size={14} /> Submit report</>}
            </button>
          </div>
        </div>

        {/* AI Signal sidebar */}
        <div>
          <div className="panel">
            <PanelTitle title="AI Signal Card" icon={Sparkles} />
            <div className="score-card">
              <div className="score-ring">
                <strong>{report.interest}</strong>
                <span>intent score</span>
              </div>
              <div>
                <b>{report.sentiment} customer signal</b>
                <p style={{ fontSize: 9, color: "#8d808a", margin: "4px 0 0" }}>
                  {report.offlinePending ? "AI analysis pending sync." : "Derived from Gemini transcript analysis."}
                </p>
              </div>
            </div>
            <div className="evidence">
              <div><span>Opportunity</span><strong className={report.opportunity === "HIGH" ? "ok" : ""}>{report.opportunity || "—"}</strong></div>
              <div><span>Risk</span><strong className={report.risk === "HIGH" ? "bad" : ""}>{report.risk || "—"}</strong></div>
              <div><span>Priority</span><strong>{report.priority}</strong></div>
              <div><span>Source</span><strong>Voice note</strong></div>
              <div><span>Transcript</span><strong>{report.transcript ? "Available" : "Pending"}</strong></div>
              <div><span>Report in DB</span><strong>{report.reportId ? "Saved" : "Unsaved"}</strong></div>
            </div>
          </div>

          {/* AI Intelligence breakdown */}
          {!report.offlinePending && (
            <div className="panel" style={{ marginTop: 10 }}>
              <PanelTitle title="AI Intelligence" icon={Bot} />
              <div style={{ display: "grid", gap: 12, marginTop: 10 }}>
                <AISignalRow icon={TrendingUp} label="Opportunity" value={report.opportunity || "LOW"} />
                <AISignalRow icon={AlertTriangle} label="Risk" value={report.risk || "LOW"} />
                <AISignalRow icon={Lightbulb} label="Sentiment" value={report.sentiment} />
              </div>
              {report.transcript && (
                <div style={{ marginTop: 14, padding: "10px", background: "#0f0c10", borderRadius: 9, border: "1px solid #2a2028" }}>
                  <div style={{ fontSize: 8, color: "#6d5963", letterSpacing: "0.08em", marginBottom: 5 }}>EVIDENCE SOURCE</div>
                  <p style={{ fontSize: 9, color: "#9c8a94", lineHeight: 1.6, margin: 0 }}>
                    "{report.transcript.slice(0, 180)}{report.transcript.length > 180 ? "…" : ""}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function AISignalRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  const isHigh = ["HIGH", "Positive"].includes(value);
  const isMed = ["MEDIUM", "Cautious", "Neutral"].includes(value);
  const isLow = ["LOW", "Negative"].includes(value);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={13} style={{ color: "#9c5a76" }} />
        <span style={{ fontSize: 10, color: "#8d808a" }}>{label}</span>
      </div>
      <span className={`pill ${isHigh ? "success-pill" : isMed ? "warn-pill" : ""}`} style={{ fontSize: 8 }}>{value}</span>
    </div>
  );
}

// ─── REPORTS LIST VIEW ────────────────────────────────────────────────────────
// ─── REPORTS LIST VIEW ────────────────────────────────────────────────────────
function ReportsListView({ reports }: any) {
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<ApiReport | null>(null);

  const [voiceNote, setVoiceNote] = useState<ApiVoiceNote | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  const filtered = reports.filter(
    (r: ApiReport) => filter === "ALL" || r.status === filter
  );

  // Load the original field voice note whenever a report is opened.
  useEffect(() => {
    let cancelled = false;

    async function loadVoiceNote() {
      if (!selected?.voice_note_id) {
        setVoiceNote(null);
        setVoiceError("");
        return;
      }

      setVoiceLoading(true);
      setVoiceError("");
      setVoiceNote(null);

      try {
        const response = await apiGet<{
          status: string;
          voice_note: ApiVoiceNote;
        }>(`/voice-notes/${selected.voice_note_id}`);

        if (!cancelled) {
          setVoiceNote(response.voice_note);
        }
      } catch (error: any) {
        if (!cancelled) {
          setVoiceNote(null);
          setVoiceError(
            error?.message || "Unable to load the original voice note."
          );
        }
      } finally {
        if (!cancelled) {
          setVoiceLoading(false);
        }
      }
    }

    loadVoiceNote();

    return () => {
      cancelled = true;
    };
  }, [selected]);

  function closeReport() {
    setSelected(null);
    setVoiceNote(null);
    setVoiceError("");
  }

  function getAudioUrl(fileUrl: string) {
    if (!fileUrl) return "";

    // If backend already returns a complete URL, use it directly.
    if (/^https?:\/\//i.test(fileUrl)) {
      return fileUrl;
    }

    // Otherwise prepend the backend URL.
    return `${API_BASE_URL}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
  }

  return (
    <>
      <SectionHeader
        eyebrow="REPORTS"
        title="Field reports"
        sub="All AI-generated field visit reports. Review content, original field voice, and submission status."
      />

      {/* Report overview — derived entirely from the reports already loaded from the backend. */}
      <div className="report-overview-grid">
        {[
          {
            label: "Total reports",
            value: reports.length,
            icon: FileText,
            tone: "blue",
          },
          {
            label: "Submitted",
            value: reports.filter((r: ApiReport) => r.status === "SUBMITTED").length,
            icon: Send,
            tone: "green",
          },
          {
            label: "Approved",
            value: reports.filter((r: ApiReport) => r.status === "APPROVED").length,
            icon: CircleCheck,
            tone: "navy",
          },
          {
            label: "Drafts",
            value: reports.filter((r: ApiReport) => r.status === "DRAFT").length,
            icon: Edit3,
            tone: "amber",
          },
        ].map(item => {
          const Icon = item.icon;
          return (
            <div className={`report-overview-card ${item.tone}`} key={item.label}>
              <div className="report-overview-icon">
                <Icon size={17} />
              </div>
              <div className="report-overview-copy">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="filter-row">
        {["ALL", "DRAFT", "EDITED", "SUBMITTED", "APPROVED"].map(f => (
          <button
            key={f}
            className={`pill ${filter === f ? "active-pill" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "All" : f}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? (
          <Empty
            text="No reports found. Complete a visit and submit a report to see it here."
            icon={FileText}
          />
        ) : (
          <div className="table-list">
            <div className="table-header">
              <span>Customer</span>
              <span>Created by</span>
              <span>Status</span>
              <span>Date</span>
              <span />
            </div>

            {filtered.map((r: ApiReport) => (
              <button
                className="table-row report-click-row"
                key={r.id}
                onClick={() => setSelected(r)}
                type="button"
              >
                <div>
                  <strong>{r.customer_name || "Unknown"}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      color: "#6d5963",
                    }}
                  >
                    {r.title}
                  </span>
                </div>

                <span style={{ fontSize: 10 }}>
                  {r.created_by_name}
                </span>

                <Badge
                  label={r.status}
                  type={
                    r.status === "SUBMITTED" || r.status === "APPROVED"
                      ? "success"
                      : "pending"
                  }
                />

                <span style={{ fontSize: 9 }}>
                  {fmtDate(r.created_at)}
                </span>

                <Eye
                  size={13}
                  style={{ color: "#a85b78" }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div
          className="modal-backdrop"
          onClick={e => {
            if (e.target === e.currentTarget) {
              closeReport();
            }
          }}
        >
          <div className="report-detail-modal">

            {/* HEADER */}
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  REPORT DETAIL
                </span>

                <h2>
                  {selected.customer_name || "Report"}
                </h2>
              </div>

              <button
                className="icon-btn"
                onClick={closeReport}
              >
                <X size={15} />
              </button>
            </div>

            {/* META */}
            <div className="modal-meta">
              <Badge
                label={selected.status}
                type={
                  selected.status === "SUBMITTED" ||
                  selected.status === "APPROVED"
                    ? "success"
                    : "pending"
                }
              />

              <span>
                {fmtDateTime(selected.created_at)}
              </span>

              <span>
                By {selected.created_by_name}
              </span>
            </div>

            {/* ORIGINAL FIELD VOICE */}
            <div
              className="panel"
              style={{
                marginTop: 14,
                padding: 14,
                background: "#110d12",
                border: "1px solid #30232b",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: "rgba(184,59,104,.12)",
                      border: "1px solid rgba(184,59,104,.25)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Headphones
                      size={14}
                      style={{ color: "#c35b7e" }}
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#eee7eb",
                      }}
                    >
                      Original Field Voice
                    </div>

                    <div
                      style={{
                        fontSize: 8,
                        color: "#6d5963",
                        marginTop: 2,
                      }}
                    >
                      Recorded by {selected.created_by_name}
                    </div>
                  </div>
                </div>

                {voiceNote?.duration_seconds != null && (
                  <span
                    className="pill"
                    style={{ fontSize: 8 }}
                  >
                    {timeFmt(
                      Math.round(voiceNote.duration_seconds)
                    )}
                  </span>
                )}
              </div>

              {/* LOADING */}
              {voiceLoading && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 0",
                    color: "#8d808a",
                    fontSize: 10,
                  }}
                >
                  <Spinner size={14} />
                  Loading original field recording…
                </div>
              )}

              {/* ERROR */}
              {!voiceLoading && voiceError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: 10,
                    borderRadius: 8,
                    background: "rgba(221,90,116,.08)",
                    border: "1px solid rgba(221,90,116,.2)",
                    color: "#dd5a74",
                    fontSize: 9,
                    lineHeight: 1.5,
                  }}
                >
                  <AlertTriangle size={13} />

                  <div>
                    <strong>
                      Voice recording could not be loaded.
                    </strong>

                    <div style={{ marginTop: 3 }}>
                      {voiceError}
                    </div>
                  </div>
                </div>
              )}

              {/* AUDIO PLAYER */}
              {!voiceLoading &&
                !voiceError &&
                voiceNote?.file_url && (
                  <div>
                    <audio
                      controls
                      preload="metadata"
                      src={getAudioUrl(voiceNote.file_url)}
                      style={{
                        width: "100%",
                        height: 42,
                        marginTop: 4,
                      }}
                    >
                      Your browser does not support audio playback.
                    </audio>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 7,
                        fontSize: 8,
                        color: "#6d5963",
                      }}
                    >
                      <FileAudio size={11} />

                      <span>
                        {voiceNote.file_name || "Field voice recording"}
                      </span>

                      <span>•</span>

                      <span>
                        {voiceNote.processing_status || "RECORDED"}
                      </span>
                    </div>
                  </div>
                )}

              {/* NO VOICE NOTE */}
              {!voiceLoading &&
                !voiceError &&
                !voiceNote &&
                !selected.voice_note_id && (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: "#0f0c10",
                      color: "#6d5963",
                      fontSize: 9,
                    }}
                  >
                    No original voice recording is linked to this report.
                  </div>
                )}

              {/* TRANSCRIPTION */}
              {!voiceLoading &&
                voiceNote?.transcription && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      borderRadius: 8,
                      background: "#0f0c10",
                      border: "1px solid #241b21",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 8,
                        color: "#6d5963",
                        letterSpacing: "0.08em",
                        marginBottom: 6,
                      }}
                    >
                      ORIGINAL TRANSCRIPTION
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: 9,
                        color: "#b9adb5",
                        lineHeight: 1.65,
                      }}
                    >
                      {voiceNote.transcription}
                    </p>
                  </div>
                )}
            </div>

            {/* REPORT */}
            <div className="report-detail-body">
              <h3>AI Field Report</h3>

              <pre>
                {selected.final_report ||
                  selected.edited_report ||
                  selected.ai_draft ||
                  "No report content available."}
              </pre>
            </div>

            {/* ACTIONS */}
            <div className="modal-actions">
              <button
                className="button primary"
                onClick={closeReport}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}

// ─── CUSTOMERS VIEW ───────────────────────────────────────────────────────────
function CustomersView({ customers, onGo, onOpenCustomer, onStartVisit, canStartVisit = true }: any) {
  const [search, setSearch] = useState("");
  const filtered = customers.filter((c: ApiCustomer) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.city || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <SectionHeader eyebrow="CRM" title="Customers" sub="Your organization's customer accounts. Click a customer to view their complete profile." />
      <div className="filter-row">
        <div className="search-box wide">
          <Search size={14} />
          <input placeholder="Search customers, cities, industries…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")} style={{ border: 0, background: "transparent", color: "#8d808a" }}><X size={13} /></button>}
        </div>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? <Empty text="No customers found." icon={Users} /> : (
          <div style={{ display: "grid", gap: 8 }}>
            {filtered.map((c: ApiCustomer) => (
              <div className="customer-row" key={c.id} onClick={() => onOpenCustomer(c)} style={{ cursor: "pointer" }}>
                <div className="avatar large">{initials(c.name)}</div>
                <div style={{ flex: 1 }}>
                  <strong>{c.name}</strong>
                  <span>{[c.contact_person, c.city, c.industry].filter(Boolean).join(" · ")}</span>
                </div>
                <Badge label={c.status || "ACTIVE"} type={c.status === "ACTIVE" ? "success" : "pending"} />
                {canStartVisit && onStartVisit && (
                  <button className="button ghost" style={{ padding: "6px 12px", fontSize: 10 }} onClick={e => { e.stopPropagation(); onStartVisit(c); }}>
                    <Mic size={11} /> Visit
                  </button>
                )}
                <ChevronRight size={14} style={{ color: "#5d4d56" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── CUSTOMER DETAIL VIEW ─────────────────────────────────────────────────────
function CustomerDetailView({ selectedCustomerDetail, visits, reports, tasks, onGo, onStartVisit, canStartVisit = true }: any) {
  const c: ApiCustomer | null = selectedCustomerDetail;
  if (!c) { onGo("customers"); return null; }

  const customerVisits = visits.filter((v: ApiVisit) => v.customer_id === c.id);
  const customerTasks = tasks.filter((t: ApiActionItem) => t.customer_name === c.name);

  return (
    <>
      <SectionHeader
        eyebrow="CUSTOMER PROFILE"
        title={c.name}
        sub={[c.industry, c.city, c.state].filter(Boolean).join(" · ")}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button ghost" onClick={() => onGo("customers")}><ChevronRight size={14} style={{ transform: "rotate(180deg)" }} /> Back</button>
            {canStartVisit && onStartVisit && <button className="button primary" onClick={() => onStartVisit(c)}><Mic size={14} /> Start visit</button>}
          </div>
        }
      />

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="metric-card"><div className="metric-top"><MapPin size={16} /><span>Total visits</span></div><strong className="metric-value">{customerVisits.length}</strong></div>
        <div className="metric-card"><div className="metric-top"><ClipboardCheck size={16} /><span>Action items</span></div><strong className="metric-value">{customerTasks.length}</strong></div>
        <div className="metric-card"><div className="metric-top"><Activity size={16} /><span>Status</span></div><strong className="metric-value" style={{ fontSize: 14 }}>{c.status || "ACTIVE"}</strong></div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <PanelTitle title="Contact information" icon={Building2} />
          <div className="settings-list">
            {c.contact_person && <div><span>Contact person</span><strong>{c.contact_person}</strong></div>}
            {c.email && <div><span>Email</span><strong>{c.email}</strong></div>}
            {c.phone && <div><span>Phone</span><strong>{c.phone}</strong></div>}
            {c.address && <div><span>Address</span><strong>{c.address}</strong></div>}
            {c.city && <div><span>City</span><strong>{c.city}</strong></div>}
            {c.state && <div><span>State</span><strong>{c.state}</strong></div>}
            {c.industry && <div><span>Industry</span><strong>{c.industry}</strong></div>}
            {c.notes && <div><span>Notes</span><strong>{c.notes}</strong></div>}
          </div>
        </div>

        <div className="panel">
          <PanelTitle title="Visit history" icon={History} action={<span style={{ fontSize: 9, color: "#6d5963" }}>{customerVisits.length} visits</span>} />
          {customerVisits.length === 0 ? <Empty text="No visits yet." icon={MapPin} /> : (
            <div className="activity-list">
              {customerVisits.slice(0, 6).map((v: ApiVisit) => (
                <div className="activity-item" key={v.id}>
                  <div className={`activity-dot ${v.status === "COMPLETED" ? "positive" : "neutral"}`} />
                  <div className="activity-body">
                    <strong>{fmtDateTime(v.visit_date)}</strong>
                    <span>{v.visit_type.replace("_", " ")} · {v.user_name}</span>
                  </div>
                  <Badge label={v.status.replace("_", " ")} type={v.status === "COMPLETED" ? "success" : "active"} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {customerTasks.length > 0 && (
        <div className="panel" style={{ marginTop: 14 }}>
          <PanelTitle title="Action items" icon={ClipboardCheck} />
          <div className="table-list">
            {customerTasks.map((t: ApiActionItem) => (
              <div className="table-row" key={t.id}>
                <div><strong>{t.title}</strong><span style={{ fontSize: 9, color: "#6d5963" }}>{t.description || ""}</span></div>
                <Badge label={t.priority} />
                <Badge label={t.status} type={t.status === "COMPLETED" ? "success" : "pending"} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── TASKS VIEW ───────────────────────────────────────────────────────────────
function TasksView({ tasks, onUpdateTask }: any) {
  const [filter, setFilter] = useState("PENDING");
  const filtered = tasks.filter((t: ApiActionItem) => filter === "ALL" || t.status === filter);

  return (
    <>
      <SectionHeader eyebrow="ACTION ITEMS" title="Tasks & follow-ups" sub="AI-generated and manual action items from your field visits." />
      <div className="filter-row">
        {["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"].map(f => (
          <button key={f} className={`pill ${filter === f ? "active-pill" : ""}`} onClick={() => setFilter(f)}>{f === "ALL" ? "All" : f.replace("_", " ")}</button>
        ))}
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? <Empty text="No tasks found." icon={ClipboardCheck} /> : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((t: ApiActionItem) => (
              <div className="task-card" key={t.id}>
                <div className={`priority-bar ${t.priority?.toLowerCase()}`} />
                <div style={{ flex: 1 }}>
                  <strong>{t.title}</strong>
                  {t.description && <p style={{ fontSize: 9, color: "#8d808a", margin: "3px 0 0" }}>{t.description}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                    {t.customer_name && <span style={{ fontSize: 8, color: "#6d5963" }}>{t.customer_name}</span>}
                    {t.due_date && <span style={{ fontSize: 8, color: "#6d5963" }}>Due: {fmtDate(t.due_date)}</span>}
                    <span style={{ fontSize: 8, color: "#6d5963" }}>Source: {t.source || "AI"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <Badge label={t.priority} />
                  <select
                    value={t.status}
                    onChange={e => onUpdateTask(t.id, e.target.value)}
                    style={{ background: "#1a1018", border: "1px solid #38272f", borderRadius: 8, color: "#c3b2ba", fontSize: 9, padding: "4px 8px" }}
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── ALERTS VIEW ──────────────────────────────────────────────────────────────
function AlertsView({ alerts, onUpdateAlert }: any) {
  const [filter, setFilter] = useState("OPEN");
  const filtered = alerts.filter((a: ApiAlert) => filter === "ALL" || a.status === filter);

  return (
    <>
      <SectionHeader eyebrow="ALERTS" title="Field alerts" sub="AI-detected risks, opportunities, and urgent items from your field visits." />
      <div className="filter-row">
        {["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map(f => (
          <button key={f} className={`pill ${filter === f ? "active-pill" : ""}`} onClick={() => setFilter(f)}>{f === "ALL" ? "All" : f}</button>
        ))}
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? <Empty text="No alerts." icon={Bell} /> : (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((a: ApiAlert) => (
              <div className="alert-card" key={a.id}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
                  <AlertTriangle size={16} style={{ color: a.severity === "HIGH" ? "#e05a7a" : a.severity === "MEDIUM" ? "#f5b84b" : "#9c8a94", flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>{a.title}</strong>
                    <p style={{ fontSize: 10, color: "#8d808a", margin: "4px 0 0", lineHeight: 1.5 }}>{a.message}</p>
                    {a.customer_name && <span style={{ fontSize: 8, color: "#6d5963", marginTop: 4, display: "block" }}>{a.customer_name}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <Badge label={a.severity} type={a.severity === "HIGH" ? "error" : a.severity === "MEDIUM" ? "warn" : "pending"} />
                  <select
                    value={a.status}
                    onChange={e => onUpdateAlert(a.id, e.target.value)}
                    style={{ background: "#1a1018", border: "1px solid #38272f", borderRadius: 8, color: "#c3b2ba", fontSize: 9, padding: "4px 8px" }}
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="DISMISSED">DISMISSED</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── HISTORY VIEW ─────────────────────────────────────────────────────────────
function HistoryView({ visits, reports, tasks, alerts, onGo }: any) {
  const [tab, setTab] = useState<"visits" | "reports" | "tasks" | "alerts">("visits");
  const [search, setSearch] = useState("");

  const filteredVisits = visits.filter((v: ApiVisit) =>
    v.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    v.status.toLowerCase().includes(search.toLowerCase())
  );
  const filteredReports = reports.filter((r: ApiReport) =>
    (r.customer_name || "").toLowerCase().includes(search.toLowerCase()) ||
    r.status.toLowerCase().includes(search.toLowerCase())
  );
  const filteredTasks = tasks.filter((t: ApiActionItem) =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.customer_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <SectionHeader
        eyebrow="HISTORY"
        title="Activity history"
        sub="Your complete field activity record — visits, reports, action items, and alerts."
      />
      <div className="filter-row">
        <div className="search-box" style={{ flex: 1 }}>
          <Search size={14} />
          <input placeholder="Search history…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {(["visits", "reports", "tasks", "alerts"] as const).map(t => (
          <button key={t} className={`pill ${tab === t ? "active-pill" : ""}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        {tab === "visits" && (
          <>
            <PanelTitle title={`Visits (${filteredVisits.length})`} icon={MapPin} />
            {filteredVisits.length === 0 ? <Empty text="No visits found." icon={MapPin} /> : (
              <div className="table-list" style={{ marginTop: 10 }}>
                <div className="table-header"><span>Customer</span><span>Date</span><span>Status</span><span>Rep</span></div>
                {filteredVisits.map((v: ApiVisit) => (
                  <div className="table-row" key={v.id}>
                    <strong>{v.customer_name}</strong>
                    <span style={{ fontSize: 9 }}>{fmtDateTime(v.visit_date)}</span>
                    <Badge label={v.status.replace("_", " ")} type={v.status === "COMPLETED" ? "success" : "active"} />
                    <span style={{ fontSize: 9 }}>{v.user_name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "reports" && (
          <>
            <PanelTitle title={`Reports (${filteredReports.length})`} icon={FileText} />
            {filteredReports.length === 0 ? <Empty text="No reports found." icon={FileText} /> : (
              <div className="table-list" style={{ marginTop: 10 }}>
                <div className="table-header"><span>Customer</span><span>Status</span><span>Submitted</span><span>By</span></div>
                {filteredReports.map((r: ApiReport) => (
                  <div className="table-row" key={r.id}>
                    <div><strong>{r.customer_name || "Unknown"}</strong><span style={{ fontSize: 8, color: "#6d5963" }}>{r.title}</span></div>
                    <Badge label={r.status} type={r.status === "SUBMITTED" || r.status === "APPROVED" ? "success" : "pending"} />
                    <span style={{ fontSize: 9 }}>{r.submitted_at ? fmtDate(r.submitted_at) : "—"}</span>
                    <span style={{ fontSize: 9 }}>{r.created_by_name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "tasks" && (
          <>
            <PanelTitle title={`Action Items (${filteredTasks.length})`} icon={ClipboardCheck} />
            {filteredTasks.length === 0 ? <Empty text="No tasks found." icon={ClipboardCheck} /> : (
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {filteredTasks.map((t: ApiActionItem) => (
                  <div className="task-card" key={t.id}>
                    <div className={`priority-bar ${t.priority?.toLowerCase()}`} />
                    <div style={{ flex: 1 }}>
                      <strong>{t.title}</strong>
                      <span style={{ fontSize: 8, color: "#6d5963", marginTop: 3, display: "block" }}>{t.customer_name || "—"} · {t.priority} · {t.status}</span>
                    </div>
                    <Badge label={t.status} type={t.status === "COMPLETED" ? "success" : "pending"} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "alerts" && (
          <>
            <PanelTitle title={`Alerts (${alerts.length})`} icon={Bell} />
            {alerts.length === 0 ? <Empty text="No alerts." icon={Bell} /> : (
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {alerts.map((a: ApiAlert) => (
                  <div className="alert-card" key={a.id}>
                    <AlertTriangle size={14} style={{ color: a.severity === "HIGH" ? "#e05a7a" : "#f5b84b" }} />
                    <div style={{ flex: 1 }}>
                      <strong>{a.title}</strong>
                      <p style={{ fontSize: 9, color: "#8d808a", margin: "3px 0 0" }}>{a.message}</p>
                    </div>
                    <Badge label={a.status} type={a.status === "RESOLVED" ? "success" : "pending"} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGER VIEWS
// ═══════════════════════════════════════════════════════════════════════════════
function ManagerViews({ view, dashboard, tasks, alerts, leads, customers, visits, reports, user, onGo, onUpdateTask, onUpdateAlert, onOpenCustomer, selectedCustomerDetail }: any) {
  if (view === "home") return <ManagerHome dashboard={dashboard} tasks={tasks} alerts={alerts} leads={leads} visits={visits} onGo={onGo} />;
  if (view === "visits") return <ManagerVisits visits={visits} onGo={onGo} />;
  if (view === "reports") return <ReportsListView reports={reports} onGo={onGo} />;
  if (view === "leads") return <LeadsView leads={leads} customers={customers} onGo={onGo} />;
  if (view === "customers") return <CustomersView customers={customers} onGo={onGo} onOpenCustomer={onOpenCustomer} canStartVisit={false} />;
  if (view === "customer-detail") return <CustomerDetailView selectedCustomerDetail={selectedCustomerDetail} visits={visits} reports={reports} tasks={tasks} onGo={onGo} canStartVisit={false} />;
  if (view === "tasks") return <TasksView tasks={tasks} onUpdateTask={onUpdateTask} />;
  if (view === "alerts") return <AlertsView alerts={alerts} onUpdateAlert={onUpdateAlert} />;
  if (view === "insights") return <InsightsView dashboard={dashboard} alerts={alerts} />;
  if (view === "team") return <TeamView />;
  if (view === "map") return <TerritoryView customers={customers} />;
  return <ManagerHome dashboard={dashboard} tasks={tasks} alerts={alerts} leads={leads} visits={visits} onGo={onGo} />;
}

function ManagerHome({ dashboard, tasks, alerts, leads, visits, onGo }: any) {
  return (
    <>
      <SectionHeader eyebrow="MANAGER DASHBOARD" title="Team intelligence" sub="Real-time field intelligence from your team's visits, reports, and AI analysis." />
      <div className="metric-grid">
        <Metric icon={MapPin} label="Team visits" value={dashboard?.overview.total_visits ?? 0} sub="Total visits" />
        <Metric icon={Users} label="Customers" value={dashboard?.overview.total_customers ?? 0} sub="Accounts" />
        <Metric icon={Target} label="Pipeline" value={money(dashboard?.overview.pipeline_value)} sub="Open value" tone="amber" />
        <Metric icon={Bell} label="Open alerts" value={dashboard?.overview.open_alerts ?? 0} sub="Needs attention" tone="red" />
      </div>
      <div className="grid-2">
        <div className="panel">
          <PanelTitle title="Recent team visits" icon={Activity} action={<button className="text-button" onClick={() => onGo("visits")}>View all <ArrowUpRight size={12} /></button>} />
          <RecentVisits dashboard={dashboard} />
        </div>
        <div className="panel">
          <PanelTitle title="Pipeline distribution" icon={Target} action={<button className="text-button" onClick={() => onGo("leads")}>View leads <ArrowUpRight size={12} /></button>} />
          <PipelineBar pipeline={dashboard?.pipeline || []} />
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 8 }}>
        <div className="panel">
          <PanelTitle title="Pending action items" icon={ClipboardCheck} action={<button className="text-button" onClick={() => onGo("tasks")}>View all <ArrowUpRight size={12} /></button>} />
          {tasks.filter((t: any) => t.status === "PENDING").slice(0, 5).length === 0
            ? <Empty text="No pending tasks." />
            : tasks.filter((t: any) => t.status === "PENDING").slice(0, 5).map((t: any) => (
              <div className="activity-item" key={t.id}>
                <div className={`activity-dot ${t.priority?.toLowerCase()}`} />
                <div className="activity-body"><strong>{t.title}</strong><span>{t.customer_name || "—"}</span></div>
                <Badge label={t.priority} />
              </div>
            ))}
        </div>
        <div className="panel">
          <PanelTitle title="Open alerts" icon={Bell} action={<button className="text-button" onClick={() => onGo("alerts")}>View all <ArrowUpRight size={12} /></button>} />
          {alerts.filter((a: any) => a.status === "OPEN").slice(0, 5).length === 0
            ? <Empty text="No open alerts." />
            : alerts.filter((a: any) => a.status === "OPEN").slice(0, 5).map((a: any) => (
              <div className="activity-item" key={a.id}>
                <AlertTriangle size={13} style={{ color: "#e05a7a" }} />
                <div className="activity-body"><strong>{a.title}</strong><span>{a.customer_name || "—"} · {a.severity}</span></div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

function ManagerVisits({ visits, onGo }: any) {
  const [filter, setFilter] = useState("ALL");
  const filtered = visits.filter((v: ApiVisit) => filter === "ALL" || v.status === filter);
  return (
    <>
      <SectionHeader eyebrow="TEAM VISITS" title="All team visits" sub="Monitor your team's field visit activity." />
      <div className="filter-row">
        {["ALL", "IN_PROGRESS", "COMPLETED"].map(f => (
          <button key={f} className={`pill ${filter === f ? "active-pill" : ""}`} onClick={() => setFilter(f)}>{f === "ALL" ? "All" : f.replace("_", " ")}</button>
        ))}
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? <Empty text="No visits." icon={MapPin} /> : (
          <div className="table-list">
            <div className="table-header"><span>Customer</span><span>Sales Rep</span><span>Date</span><span>Status</span></div>
            {filtered.map((v: ApiVisit) => (
              <div className="table-row" key={v.id}>
                <strong>{v.customer_name}</strong>
                <span style={{ fontSize: 10 }}>{v.user_name}</span>
                <span style={{ fontSize: 9 }}>{fmtDateTime(v.visit_date)}</span>
                <Badge label={v.status.replace("_", " ")} type={v.status === "COMPLETED" ? "success" : "active"} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── LEADS / PIPELINE VIEW ────────────────────────────────────────────────────
function LeadsView({ leads, customers, onGo }: any) {
  const [filter, setFilter] = useState("ALL");
  const filtered = leads.filter((l: ApiLead) => filter === "ALL" || l.stage === filter);
  const stages = ["NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"];
  const stageColors: Record<string, string> = { NEW: "#6c8cff", QUALIFIED: "#f5b84b", PROPOSAL: "#b83b68", NEGOTIATION: "#dd5a74", WON: "#4caf7d", LOST: "#7f7180" };

  return (
    <>
      <SectionHeader eyebrow="PIPELINE" title="Leads & opportunities" sub="Track your sales pipeline from first contact to close." />
      <div className="filter-row">
        <button className={`pill ${filter === "ALL" ? "active-pill" : ""}`} onClick={() => setFilter("ALL")}>All</button>
        {stages.map(s => (
          <button key={s} className={`pill ${filter === s ? "active-pill" : ""}`} onClick={() => setFilter(s)} style={filter === s ? { background: stageColors[s] + "22", borderColor: stageColors[s] } : {}}>
            {s}
          </button>
        ))}
      </div>

      {/* Stage summary */}
      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(6,1fr)", marginTop: 8 }}>
        {stages.map(s => {
          const stageLeads = leads.filter((l: ApiLead) => l.stage === s);
          const stageVal = stageLeads.reduce((sum: number, l: ApiLead) => sum + (l.value || 0), 0);
          return (
            <div key={s} className="metric-card" style={{ cursor: "pointer", borderColor: filter === s ? stageColors[s] : "" }} onClick={() => setFilter(s === filter ? "ALL" : s)}>
              <div className="metric-top"><span style={{ width: 8, height: 8, borderRadius: "50%", background: stageColors[s] }} /><span style={{ fontSize: 8 }}>{s}</span></div>
              <strong className="metric-value" style={{ fontSize: 18 }}>{stageLeads.length}</strong>
              <span className="metric-sub">{money(stageVal)}</span>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        {filtered.length === 0 ? <Empty text="No leads in this stage." icon={Target} /> : (
          <div className="table-list">
            <div className="table-header"><span>Title</span><span>Customer</span><span>Stage</span><span>Value</span><span>Source</span></div>
            {filtered.map((l: ApiLead) => (
              <div className="table-row" key={l.id}>
                <div><strong>{l.title}</strong></div>
                <span style={{ fontSize: 10 }}>{l.customer_name || "—"}</span>
                <span className="badge" style={{ background: stageColors[l.stage] + "22", color: stageColors[l.stage], border: `1px solid ${stageColors[l.stage]}44` }}>{l.stage}</span>
                <strong style={{ fontSize: 11, color: "#c3b2ba" }}>{l.value ? money(l.value) : "—"}</strong>
                <span style={{ fontSize: 9, color: "#6d5963" }}>{l.source}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── AI INSIGHTS VIEW ─────────────────────────────────────────────────────────
function InsightsView({ dashboard, alerts }: any) {
  return (
    <>
      <SectionHeader eyebrow="AI INTELLIGENCE" title="Field intelligence insights" sub="Aggregated AI signals from all field visits and voice notes." />
      <div className="metric-grid">
        <Metric icon={Zap} label="High opportunities" value={dashboard?.overview.high_opportunities ?? 0} sub="From AI analysis" tone="green" />
        <Metric icon={AlertTriangle} label="High risks" value={dashboard?.overview.high_risks ?? 0} sub="Needs attention" tone="red" />
        <Metric icon={Bell} label="Open alerts" value={dashboard?.overview.open_alerts ?? 0} sub="Unresolved" tone="amber" />
        <Metric icon={Activity} label="Total visits" value={dashboard?.overview.total_visits ?? 0} sub="Organization-wide" />
      </div>

      <div className="grid-2">
        <div className="panel">
          <PanelTitle title="Sentiment distribution" icon={Activity} />
          {(dashboard?.sentiment || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={dashboard.sentiment.map((s: any) => ({ name: s.sentiment || "Unknown", value: s.count }))}
                  cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {dashboard.sentiment.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1018", border: "1px solid #38272f", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty text="No sentiment data yet." />}
        </div>
        <div className="panel">
          <PanelTitle title="Recent alerts" icon={Bell} />
          {alerts.slice(0, 6).length === 0 ? <Empty text="No alerts." /> : alerts.slice(0, 6).map((a: ApiAlert) => (
            <div className="activity-item" key={a.id}>
              <AlertTriangle size={13} style={{ color: a.severity === "HIGH" ? "#e05a7a" : "#f5b84b" }} />
              <div className="activity-body"><strong>{a.title}</strong><span>{a.message.slice(0, 60)}{a.message.length > 60 ? "…" : ""}</span></div>
              <Badge label={a.severity} type={a.severity === "HIGH" ? "error" : "warn"} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTIVE VIEWS
// ═══════════════════════════════════════════════════════════════════════════════
function ExecutiveViews({ view, dashboard, alerts, leads, customers, reports, onGo }: any) {
  if (view === "home") return <ExecutiveHome dashboard={dashboard} leads={leads} onGo={onGo} />;
  if (view === "reports") return <ReportsListView reports={reports} onGo={onGo} />;
  if (view === "leads") return <LeadsView leads={leads} customers={customers} onGo={onGo} />;
  if (view === "insights") return <InsightsView dashboard={dashboard} alerts={alerts} />;
  if (view === "map") return <TerritoryView customers={customers} />;
  if (view === "team") return <TeamView executive />;
  return <ExecutiveHome dashboard={dashboard} leads={leads} onGo={onGo} />;
}

function ExecutiveHome({ dashboard, leads, onGo }: { dashboard: DashboardData | null; leads: ApiLead[]; onGo: (v: View) => void }) {
  return (
    <>
      <SectionHeader
        eyebrow="EXECUTIVE INTELLIGENCE"
        title="The field, without the reporting gap."
        sub="A consolidated view of customer signals, pipeline movement and field coverage."
      />
      <div className="metric-grid">
        <Metric icon={MapPin} label="Field visits" value={dashboard?.overview.total_visits ?? 0} sub="Organization-wide" />
        <Metric icon={Users} label="Customers" value={dashboard?.overview.total_customers ?? 0} sub="Accounts covered" />
        <Metric icon={Target} label="Open pipeline" value={money(dashboard?.overview.pipeline_value)} sub="Current value" tone="amber" />
        <Metric icon={Zap} label="Won value" value={money(dashboard?.overview.won_value)} sub="Closed value" tone="green" />
      </div>
      <div className="grid-2">
        <div className="panel hero-exec">
          <span className="pill"><Eye size={13} /> RAW FIELD VISIBILITY</span>
          <h2>Voice → evidence →<br /><span>management action.</span></h2>
          <p>Executives can trace commercial signals back to the underlying field report and original voice experience.</p>
          <div className="exec-stats">
            <div><strong>{dashboard?.overview.high_opportunities ?? 0}</strong><span>high opportunities</span></div>
            <div><strong>{dashboard?.overview.high_risks ?? 0}</strong><span>high risks</span></div>
          </div>
        </div>
        <div className="panel">
          <PanelTitle title="Pipeline distribution" icon={Target} action={<button className="text-button" onClick={() => onGo("leads")}>View leads <ArrowUpRight size={12} /></button>} />
          <PipelineBar pipeline={dashboard?.pipeline || []} />
        </div>
      </div>
      <div className="panel" style={{ marginTop: 8 }}>
        <PanelTitle title="Recent organization activity" icon={Activity} />
        <RecentVisits dashboard={dashboard} />
      </div>
    </>
  );
}

// ─── TERRITORY MAP ────────────────────────────────────────────────────────────
function TerritoryView({ customers = [] }: { customers?: ApiCustomer[] }) {
  const [pos, setPos] = useState<[number, number]>([18.5913, 73.7389]);
  const [loc, setLoc] = useState(false);
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => { setPos([p.coords.latitude, p.coords.longitude]); setLoc(true); },
      () => { }
    );
  }, []);

  return (
    <>
      <SectionHeader
        eyebrow="TERRITORY INTELLIGENCE"
        title="Field coverage map"
        sub="Customer locations, field position and territory context."
        action={<span className="pill"><Navigation size={13} />{loc ? "Live location" : "Demo center"}</span>}
      />
      <div className="map-layout">
        <div className="panel map-card">
          <MapContainer center={pos} zoom={11} scrollWheelZoom style={{ height: "560px", width: "100%" }}>
            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <Marker position={pos}>
              <Popup><b>Your current field position</b><br />{loc ? "Browser GPS location" : "Demo location"}</Popup>
            </Marker>
            <LeafletCircle center={pos} radius={5000} pathOptions={{ color: "#b83b68", fillOpacity: 0.06 }} />
            {customers.filter(c => c.latitude && c.longitude).map(c => (
              <Marker key={c.id} position={[c.latitude!, c.longitude!]}>
                <Popup><b>{c.name}</b><br />{c.contact_person || ""}<br />{c.city || ""}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="panel">
          <PanelTitle title="Coverage" icon={MapPin} />
          <div className="map-stat"><strong>{customers.length}</strong><span>customers in organization</span></div>
          <div className="map-stat"><strong>{customers.filter(c => c.latitude && c.longitude).length}</strong><span>mapped customers</span></div>
          <div className="privacy-note">
            <Navigation size={15} />
            <span>Location is requested only by the browser and is not persisted unless a visit is recorded.</span>
          </div>
          <div className="map-legend">
            <span><i className="legend-dot customer" /> Customer</span>
            <span><i className="legend-dot rep" /> Field position</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── TEAM VIEW ────────────────────────────────────────────────────────────────
function TeamView({ executive = false }: { executive?: boolean }) {
  return (
    <>
      <SectionHeader
        eyebrow={executive ? "ORGANIZATION" : "TEAM"}
        title={executive ? "Organization access" : "Team visibility"}
        sub="Authenticated users are governed by backend RBAC. Role changes are not performed here — they are set in the backend."
      />
      <div className="team-grid">
        <TeamCard name="Field Representative" role="FIELD_REP" desc="Records visits, voice notes, and submits reports." status="Active" />
        <TeamCard name="Sales Manager" role="MANAGER" desc="Reviews team reports, manages leads and alerts." status="Active" />
        <TeamCard name="Executive" role="EXECUTIVE" desc="Views org-level intelligence and pipeline." status="Backend-controlled" />
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <PanelTitle title="Role-based access control" icon={ShieldCheck} />
        <p style={{ fontSize: 10, color: "#8d808a", margin: "8px 0" }}>All permissions are enforced by the backend JWT middleware. There is no frontend role switching.</p>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            { role: "FIELD_REP", access: "Own visits, voice notes, reports, action items, customers" },
            { role: "MANAGER", access: "Team visits, all reports, leads, alerts, insights, team overview" },
            { role: "EXECUTIVE", access: "Org-level intelligence, pipeline, all reports, territory" },
          ].map(r => (
            <div key={r.role} className="settings-row">
              <div><strong style={{ fontSize: 10 }}>{r.role}</strong><span style={{ fontSize: 9, color: "#8d808a" }}>{r.access}</span></div>
              <StatusChip label="Backend enforced" ok />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function TeamCard({ name, role, desc, status }: { name: string; role: string; desc: string; status: string }) {
  return (
    <div className="panel team-card">
      <div className="avatar large">{initials(name)}</div>
      <div>
        <h3>{name}</h3>
        <span className="badge">{role}</span>
        <p style={{ fontSize: 9, color: "#8d808a", margin: "6px 0 0", lineHeight: 1.5 }}>{desc}</p>
      </div>
      <StatusChip label={status} ok={status === "Active"} />
    </div>
  );
}

// ─── SETTINGS VIEW ────────────────────────────────────────────────────────────
function SettingsView({
  user,
  apiOK,
  onLogout,
  theme,
  onThemeChange,
  offlineCount,
  onClearOffline,
}: {
  user: AuthUser;
  apiOK: boolean;
  onLogout: () => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  offlineCount: number;
  onClearOffline: () => Promise<void>;
}) {
  type SettingsTab = "appearance" | "account" | "privacy" | "notifications" | "security" | "about";
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [notifField, setNotifField] = useState(() => localStorage.getItem("fv_notif_field") !== "false");
  const [notifAlert, setNotifAlert] = useState(() => localStorage.getItem("fv_notif_alert") !== "false");
  const [notifReport, setNotifReport] = useState(() => localStorage.getItem("fv_notif_report") !== "false");

  function toggleNotif(key: string, val: boolean, setter: (v: boolean) => void) {
    setter(val);
    localStorage.setItem(key, String(val));
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      alert(`${label} copied.`);
    } catch {
      alert(`Unable to copy ${label.toLowerCase()}.`);
    }
  }

  const tabs: { id: SettingsTab; label: string; icon: any; desc: string }[] = [
    { id: "appearance", label: "Appearance", icon: Palette, desc: "Theme and visual preferences" },
    { id: "account", label: "Account", icon: CircleUserRound, desc: "Profile and workspace identity" },
    { id: "privacy", label: "Privacy & Data", icon: ShieldCheck, desc: "Local data and privacy controls" },
    { id: "notifications", label: "Notifications", icon: Bell, desc: "Choose which updates you receive" },
    { id: "security", label: "Security", icon: ShieldCheck, desc: "Session and access status" },
    { id: "about", label: "About", icon: Info, desc: "Product and application details" },
  ];

  return (
    <>
      <SectionHeader
        eyebrow="SETTINGS"
        title="Account & preferences"
        sub="Manage your FieldVoice appearance, account details, privacy controls, notifications, and session information."
      />

      <div className="settings-shell">
        <aside className="panel settings-tabs-card">
          <div className="settings-tabs-title">
            <Settings size={16} />
            <span>Settings</span>
          </div>

          <div className="settings-tabs">
            {tabs.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`settings-tab ${tab === item.id ? "active" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={15} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.desc}</small>
                  </span>
                  <ChevronRight size={13} />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="settings-content">
          {tab === "appearance" && (
            <div className="panel settings-panel">
              <div className="settings-section-head">
                <div><Palette size={20} /><h3>Appearance</h3></div>
                <span className="pill">Saved on this device</span>
              </div>
              <p className="settings-intro">
                Choose the visual theme for the FieldVoice workspace. Your choice is stored locally and does not affect backend data.
              </p>
              <div className="appearance-grid">
                <button type="button" className={`appearance-option ${theme === "light" ? "active" : ""}`} onClick={() => onThemeChange("light")}>
                  <div className="appearance-preview light-preview"><div /><div /><div /></div>
                  <div className="appearance-option-copy">
                    <div><Sun size={15} /><strong>Light</strong></div>
                    <span>Professional blue, white and dark-blue workspace</span>
                  </div>
                  {theme === "light" && <CheckCircle2 size={18} className="appearance-check" />}
                </button>
                <button type="button" className={`appearance-option ${theme === "dark" ? "active" : ""}`} onClick={() => onThemeChange("dark")}>
                  <div className="appearance-preview dark-preview"><div /><div /><div /></div>
                  <div className="appearance-option-copy">
                    <div><Moon size={15} /><strong>Dark</strong></div>
                    <span>Original wine-red FieldVoice dark interface</span>
                  </div>
                  {theme === "dark" && <CheckCircle2 size={18} className="appearance-check" />}
                </button>
              </div>
              <div className="settings-callout">
                <Palette size={15} />
                <div><strong>Theme affects the UI only</strong><span>Reports, customers, recordings, AI processing, and backend permissions remain unchanged.</span></div>
              </div>
            </div>
          )}

          {tab === "account" && (
            <div className="panel settings-panel">
              <div className="settings-section-head">
                <div><CircleUserRound size={20} /><h3>Account</h3></div>
                <span className="status-chip success"><i /> Active account</span>
              </div>
              <div className="settings-profile-main">
                <div className="avatar settings-avatar">{initials(user.full_name)}</div>
                <div><h2>{user.full_name}</h2><p>{user.email}</p></div>
                <span className="pill">{uiRole(user.role) || user.role}</span>
              </div>
              <div className="settings-detail-grid">
                <div className="settings-detail-card"><span>Full name</span><strong>{user.full_name}</strong></div>
                <div className="settings-detail-card"><span>Email</span><strong>{user.email}</strong><button className="settings-inline-action" type="button" onClick={() => copyText(user.email, "Email")}>Copy</button></div>
                <div className="settings-detail-card"><span>Role</span><strong>{uiRole(user.role) || user.role}</strong></div>
                <div className="settings-detail-card"><span>Organization</span><strong>{user.organization_name || "FieldVoice Demo Corp"}</strong></div>
                <div className="settings-detail-card"><span>Organization ID</span><code>{user.organization_id}</code><button className="settings-inline-action" type="button" onClick={() => copyText(user.organization_id, "Organization ID")}>Copy</button></div>
                <div className="settings-detail-card"><span>User ID</span><code>{user.id}</code><button className="settings-inline-action" type="button" onClick={() => copyText(user.id, "User ID")}>Copy</button></div>
              </div>
              <div className="settings-divider" />
              <div className="settings-action-row">
                <div><strong>Sign out</strong><span>End the current FieldVoice session on this browser.</span></div>
                <button className="button danger" type="button" onClick={onLogout}><LogOut size={14} /> Sign out</button>
              </div>
            </div>
          )}

          {tab === "privacy" && (
            <div className="panel settings-panel">
              <div className="settings-section-head"><div><ShieldCheck size={20} /><h3>Privacy & Data</h3></div></div>
              <div className="settings-row"><div><strong>Organization isolation</strong><span>Backend tenant isolation is enforced by the authenticated account.</span></div><StatusChip label="Enforced" ok /></div>
              <div className="settings-row"><div><strong>Browser session</strong><span>Authentication token is kept in local browser storage for this prototype.</span></div><StatusChip label="Local" /></div>
              <div className="settings-row">
                <div><strong>Offline recordings</strong><span>{offlineCount} recording{offlineCount === 1 ? "" : "s"} currently queued on this device.</span></div>
                <div className="settings-row-actions">
                  <span className="pill"><Database size={12} /> {offlineCount} queued</span>
                  <button className="button ghost" type="button" disabled={!offlineCount} onClick={onClearOffline}><Trash2 size={13} /> Clear local queue</button>
                </div>
              </div>
              <div className="privacy-note settings-privacy-card">
                <ShieldCheck size={16} />
                <div><strong>Privacy note</strong><span>FieldVoice keeps organization data separated through backend authorization. Clearing the local queue only removes recordings waiting on this browser and does not delete submitted backend records.</span></div>
              </div>
            </div>
          )}

          {tab === "notifications" && (
            <div className="panel settings-panel">
              <div className="settings-section-head"><div><Bell size={20} /><h3>Notification preferences</h3></div><span className="pill">Browser preferences</span></div>
              <div className="settings-row settings-toggle-row"><div><strong>Field sync alerts</strong><span>Show a notification when offline recordings are synchronized.</span></div><button className={`toggle ${notifField ? "on" : ""}`} onClick={() => toggleNotif("fv_notif_field", !notifField, setNotifField)}><span /></button></div>
              <div className="settings-row settings-toggle-row"><div><strong>AI alert notifications</strong><span>Show high-severity AI alerts in the workspace.</span></div><button className={`toggle ${notifAlert ? "on" : ""}`} onClick={() => toggleNotif("fv_notif_alert", !notifAlert, setNotifAlert)}><span /></button></div>
              <div className="settings-row settings-toggle-row"><div><strong>Report submission alerts</strong><span>Show a confirmation when a report is submitted.</span></div><button className={`toggle ${notifReport ? "on" : ""}`} onClick={() => toggleNotif("fv_notif_report", !notifReport, setNotifReport)}><span /></button></div>
              <div className="settings-callout" style={{ marginTop: 16 }}><Bell size={15} /><div><strong>These preferences are local</strong><span>They change workspace notification behavior in this browser only; they do not alter backend records.</span></div></div>
            </div>
          )}

          {tab === "security" && (
            <div className="panel settings-panel">
              <div className="settings-section-head"><div><ShieldCheck size={20} /><h3>Security</h3></div><StatusChip label={apiOK ? "Connected" : "Offline"} ok={apiOK} /></div>
              <div className="settings-security-grid">
                <div className="settings-security-card"><ShieldCheck size={18} /><strong>Authentication</strong><span>JWT-based authenticated session</span><b>Active</b></div>
                <div className="settings-security-card"><Users size={18} /><strong>Role authorization</strong><span>{uiRole(user.role) || user.role}</span><b>Backend enforced</b></div>
                <div className="settings-security-card"><Globe size={18} /><strong>API connection</strong><span>{apiOK ? API_BASE_URL : "API unavailable"}</span><b>{apiOK ? "Reachable" : "Disconnected"}</b></div>
                <div className="settings-security-card"><Calendar size={18} /><strong>Session storage</strong><span>Browser local storage</span><b>Prototype</b></div>
              </div>
              <div className="privacy-note settings-privacy-card"><ShieldCheck size={16} /><div><strong>Role control</strong><span>Your FieldVoice permissions come from the signed-in backend account. There is no frontend role switch.</span></div></div>
            </div>
          )}

          {tab === "about" && (
            <div className="panel settings-panel">
              <div className="settings-section-head"><div><Info size={20} /><h3>About FieldVoice AI</h3></div><span className="pill">v0.1 Prototype</span></div>
              <div className="about-hero"><div className="brand-mark"><Mic size={17} /></div><div><strong>FieldVoice AI</strong><span>Voice-first field sales intelligence</span></div></div>
              <div className="settings-detail-grid">
                <div className="settings-detail-card"><span>Frontend</span><strong>React + Vite</strong></div>
                <div className="settings-detail-card"><span>Backend</span><strong>FastAPI</strong></div>
                <div className="settings-detail-card"><span>Database</span><strong>PostgreSQL / Supabase</strong></div>
                <div className="settings-detail-card"><span>AI</span><strong>Gemini</strong></div>
              </div>
              <div className="privacy-note settings-privacy-card"><Info size={16} /><div><strong>Prototype status</strong><span>UI preferences are handled in the frontend. Business data, authentication, AI processing, and report permissions continue to use the existing backend.</span></div></div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

// ─── EMAIL VIEW ───────────────────────────────────────────────────────────────
function EmailView({ report, onGo, user }: { report: Report; onGo: (v: View) => void; user: AuthUser }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(`Follow-up — ${report.client} field visit`);
  const [body, setBody] = useState(
    `Hi,\n\nThank you for your time today. Here is the follow-up from our field visit.\n\n` +
    `VISIT SUMMARY\n${report.summary}\n\n` +
    `KEY INSIGHTS\n${(report.concerns || []).map(x => `• ${x}`).join("\n")}\n\n` +
    `NEXT ACTIONS\n${(report.actions || []).map(x => `• ${x}`).join("\n")}\n\n` +
    `Regards,\n${report.person}\n${user.email}`
  );
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { }
  }

  function openComposer(kind: "gmail" | "mailto") {
    if (!to.trim() || !to.includes("@")) { alert("Please enter a valid customer email address first."); return; }
    const q = `to=${encodeURIComponent(to.trim())}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const url = kind === "gmail"
      ? `https://mail.google.com/mail/?view=cm&fs=1&${q}`
      : `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <SectionHeader
        eyebrow="FOLLOW-UP EMAIL"
        title="Compose follow-up"
        sub="Draft uses the AI-generated report. Edit before sending via Gmail or your email client."
        action={<span className="pill"><Mail size={13} /> Report ready</span>}
      />
      <div className="email-layout">
        <div className="panel email-compose">
          <div className="email-compose-head">
            <div className="mail-avatar"><Mail size={20} /></div>
            <div><strong>FieldVoice Follow-up</strong><span>Generated from field report — {report.client}</span></div>
            <span className="status-chip success"><Check size={12} /> Ready to send</span>
          </div>
          <div className="email-fields">
            <label>To (Customer Email)
              <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@company.com" inputMode="email" />
            </label>
            <label>Subject
              <input value={subject} onChange={e => setSubject(e.target.value)} />
            </label>
            <label>Message
              <textarea rows={16} value={body} onChange={e => setBody(e.target.value)} />
            </label>
          </div>
          <div className="email-compose-foot">
            <button className="button ghost" onClick={() => onGo("report")}>← Back to report</button>
            <button className="button secondary" onClick={copyMessage}>
              {copied ? <><Check size={14} /> Copied!</> : <>Copy message</>}
            </button>
            <button className="button secondary" onClick={() => openComposer("gmail")}><Mail size={14} /> Open Gmail</button>
            <button className="button primary" onClick={() => openComposer("mailto")}><Send size={14} /> Open email app</button>
          </div>
          <div className="email-truth-note">
            <ShieldCheck size={14} />
            <span>FieldVoice opens your email client with a pre-filled draft. Actual email delivery and sent confirmation occurs in your email application, not here. This is by design for privacy and security.</span>
          </div>
        </div>
      </div>

      {/* Back to dashboard */}
      <div style={{ textAlign: "center", marginTop: 18 }}>
        <button className="button ghost" onClick={() => onGo("home")}>← Return to dashboard</button>
      </div>
    </>
  );
}
