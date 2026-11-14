import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as api from "./api";

// ---------------------------------------------------------------------------
// TYPES & DOMAIN MODELS
// ---------------------------------------------------------------------------

export type Role = "Salesperson" | "Manager" | "Executive";
export type ViewKey =
  | "home" | "visits" | "visit-detail" | "record" | "report" | "email"
  | "reports" | "tasks" | "insights" | "map" | "team" | "organization"
  | "rep-activity" | "settings" | "customers" | "customer-detail" | "leads"
  | "history" | "alerts";

type IconName = keyof typeof Ionicons.glyphMap;

export type Customer = {
  id: string;
  name: string;
  contact: string;
  city: string;
  state: string;
  industry: string;
  email: string;
  phone: string;
  status: "ACTIVE" | "PROSPECT";
  region: string;
  assignedTo: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
};

export type Visit = {
  id: string;
  customerId: string;
  customerName: string;
  userId: string;
  userName: string;
  region: string;
  date: string;
  time: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  approval: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  sentiment: "Positive" | "Cautious" | "Neutral" | "Negative";
  opportunity: "HIGH" | "MEDIUM" | "LOW";
  risk: "HIGH" | "MEDIUM" | "LOW";
  visitType: string;
  summary: string;
};

export type Report = {
  id: string;
  visitId: string;
  customerName: string;
  createdBy: string;
  managerName: string;
  region: string;
  status: "DRAFT" | "EDITED" | "SUBMITTED" | "APPROVED" | "REJECTED";
  title: string;
  transcript: string;
  summary: string;
  insights: string[];
  actions: string[];
  sentiment: string;
  opportunity: string;
  risk: string;
  createdAt: string;
  rejectionReason?: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  customer: string;
  assignedTo: string;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  due: string;
};

export type AlertItem = {
  id: string;
  title: string;
  message: string;
  customer: string;
  region: string;
  manager: string;
  rep: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
};

export type Lead = {
  id: string;
  title: string;
  customer: string;
  stage: "NEW" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
  value: number;
  probability: number;
};

export type AuthUser = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: Role;
  backendRole: string;
  phone?: string;
};

// ---------------------------------------------------------------------------
// THEME SYSTEM
// ---------------------------------------------------------------------------

type ThemeMode = "dark" | "light";
type ThemeColors = {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  muted: string;
  dim: string;
  input: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  onAccent: string;
};

const DARK_COLORS: ThemeColors = {
  bg: "#0B090C",
  surface: "#141015",
  surface2: "#171217",
  border: "#2B252C",
  text: "#EEE3EA",
  muted: "#827781",
  dim: "#6F6570",
  input: "#100D11",
  accent: "#B83B68",
  success: "#72C79A",
  warning: "#E3B45D",
  danger: "#E37D93",
  onAccent: "#FFFFFF",
};

const LIGHT_COLORS: ThemeColors = {
  bg: "#F3F7FB",
  surface: "#FFFFFF",
  surface2: "#EAF2F9",
  border: "#C9D8E7",
  text: "#111827",
  muted: "#4B6075",
  dim: "#6B7C8E",
  input: "#F8FBFE",
  accent: "#155A8A",
  success: "#198754",
  warning: "#9A6A00",
  danger: "#C94056",
  onAccent: "#FFFFFF",
};

const ThemeContext = createContext<{
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}>({ mode: "dark", colors: DARK_COLORS, setMode: () => undefined });

function useTheme() {
  return useContext(ThemeContext);
}

// ---------------------------------------------------------------------------
// SEED / FALLBACK DATA (Graceful offline support)
// ---------------------------------------------------------------------------

const SEED_CUSTOMERS: Customer[] = [
  { id: "44444444-4444-4444-4444-444444444441", name: "Pune Industrial Solutions", contact: "Rahul Sharma", city: "Pune", state: "Maharashtra", industry: "Industrial Equipment", email: "rahul@pis.example", phone: "9876543210", status: "ACTIVE", region: "Pune", assignedTo: "Piyush Kadam", notes: "Strong interest. Pricing remains the main objection." },
  { id: "44444444-4444-4444-4444-444444444442", name: "ABC Industries", contact: "Amit Bhat", city: "Karad", state: "Maharashtra", industry: "Manufacturing", email: "amit@abc.example", phone: "9822001122", status: "ACTIVE", region: "Pune", assignedTo: "Piyush Kadam", notes: "Requested revised quotation." },
  { id: "44444444-4444-4444-4444-444444444443", name: "Metro Components", contact: "Neha Patil", city: "Mumbai", state: "Maharashtra", industry: "Components", email: "neha@metro.example", phone: "9811112233", status: "PROSPECT", region: "Mumbai", assignedTo: "Rohan Patil", notes: "Early qualification stage." },
  { id: "44444444-4444-4444-4444-444444444444", name: "Shree Engineering", contact: "Sagar Joshi", city: "Pune", state: "Maharashtra", industry: "Engineering", email: "sagar@shree.example", phone: "9898989898", status: "ACTIVE", region: "Pune", assignedTo: "Aditi Joshi", notes: "Delivery SLA requested." },
  { id: "44444444-4444-4444-4444-444444444445", name: "Western Auto Systems", contact: "Mohan Kulkarni", city: "Mumbai", state: "Maharashtra", industry: "Automotive", email: "mohan@western.example", phone: "9800000001", status: "ACTIVE", region: "Mumbai", assignedTo: "Rohan Patil", notes: "Competitor comparison underway." },
];

const SEED_VISITS: Visit[] = [
  { id: "55555555-5555-5555-5555-555555555551", customerId: "44444444-4444-4444-4444-444444444441", customerName: "Pune Industrial Solutions", userId: "33333333-3333-3333-3333-333333333333", userName: "Piyush Kadam", region: "Pune", date: "11 Nov 2026", time: "11:20 AM", status: "COMPLETED", approval: "NOT_REQUIRED", sentiment: "Positive", opportunity: "HIGH", risk: "MEDIUM", visitType: "CUSTOMER_VISIT", summary: "Customer is very satisfied and wants to purchase. Pricing is the main concern." },
  { id: "55555555-5555-5555-5555-555555555552", customerId: "44444444-4444-4444-4444-444444444442", customerName: "ABC Industries", userId: "33333333-3333-3333-3333-333333333333", userName: "Piyush Kadam", region: "Pune", date: "10 Nov 2026", time: "03:10 PM", status: "COMPLETED", approval: "NOT_REQUIRED", sentiment: "Cautious", opportunity: "HIGH", risk: "HIGH", visitType: "CUSTOMER_VISIT", summary: "Client is interested but wants a revised quotation." },
  { id: "55555555-5555-5555-5555-555555555553", customerId: "44444444-4444-4444-4444-444444444443", customerName: "Metro Components", userId: "33333333-3333-3333-3333-333333333335", userName: "Rohan Patil", region: "Mumbai", date: "10 Nov 2026", time: "01:45 PM", status: "COMPLETED", approval: "APPROVED", sentiment: "Neutral", opportunity: "MEDIUM", risk: "LOW", visitType: "CUSTOMER_VISIT", summary: "Early qualification completed. Next step is product demonstration." },
  { id: "55555555-5555-5555-5555-555555555554", customerId: "44444444-4444-4444-4444-444444444444", customerName: "Shree Engineering", userId: "33333333-3333-3333-3333-333333333334", userName: "Aditi Joshi", region: "Pune", date: "09 Nov 2026", time: "04:15 PM", status: "COMPLETED", approval: "APPROVED", sentiment: "Positive", opportunity: "HIGH", risk: "LOW", visitType: "CUSTOMER_VISIT", summary: "Customer responded positively and asked for delivery SLA." },
  { id: "55555555-5555-5555-5555-555555555555", customerId: "44444444-4444-4444-4444-444444444445", customerName: "Western Auto Systems", userId: "33333333-3333-3333-3333-333333333335", userName: "Rohan Patil", region: "Mumbai", date: "13 Nov 2026", time: "10:40 AM", status: "IN_PROGRESS", approval: "NOT_REQUIRED", sentiment: "Cautious", opportunity: "MEDIUM", risk: "HIGH", visitType: "CUSTOMER_VISIT", summary: "Customer is comparing another supplier on commercial terms." },
];

const SEED_REPORTS: Report[] = [
  { id: "77777777-7777-7777-7777-777777777771", visitId: "55555555-5555-5555-5555-555555555551", customerName: "Pune Industrial Solutions", createdBy: "Piyush Kadam", managerName: "FieldVoice Demo Manager", region: "Pune", status: "SUBMITTED", title: "Pune Industrial Solutions — Field Visit", transcript: "The customer is very satisfied with our product and wants to purchase. Prices and subscriptions are too high. They want to negotiate and asked for a quotation tomorrow.", summary: "Customer is very satisfied and interested in purchasing. Pricing and subscription cost are the main blockers.", insights: ["Strong buying intent", "Pricing is the decisive blocker", "Quotation requested tomorrow"], actions: ["Send revised quotation", "Share pricing options", "Follow up tomorrow"], sentiment: "Positive", opportunity: "HIGH", risk: "MEDIUM", createdAt: "11 Nov 2026 · 11:29 AM" },
  { id: "77777777-7777-7777-7777-777777777772", visitId: "55555555-5555-5555-5555-555555555552", customerName: "ABC Industries", createdBy: "Piyush Kadam", managerName: "FieldVoice Demo Manager", region: "Pune", status: "APPROVED", title: "ABC Industries — Field Visit", transcript: "Client is interested but pricing is the decisive blocker. Revised quote requested.", summary: "Client is interested but pricing is the decisive blocker. Revised quote requested.", insights: ["High intent", "Pricing objection"], actions: ["Send revised quotation", "Follow up Friday"], sentiment: "Cautious", opportunity: "HIGH", risk: "HIGH", createdAt: "10 Nov 2026 · 03:31 PM" },
  { id: "77777777-7777-7777-7777-777777777773", visitId: "55555555-5555-5555-5555-555555555553", customerName: "Metro Components", createdBy: "Rohan Patil", managerName: "FieldVoice Demo Manager", region: "Mumbai", status: "REJECTED", title: "Metro Components — Field Visit", transcript: "The customer asked for more detail and a product demonstration.", summary: "Customer needs product demonstration before progressing.", insights: ["Qualification complete", "Demo requested"], actions: ["Schedule demo"], sentiment: "Neutral", opportunity: "MEDIUM", risk: "LOW", createdAt: "10 Nov 2026 · 02:10 PM", rejectionReason: "Add the customer's requested demo timeline." },
];

const SEED_TASKS: Task[] = [
  { id: "88888888-8888-8888-8888-888888888881", title: "Send revised quotation", description: "Share the updated pricing based on the negotiation request.", customer: "Pune Industrial Solutions", assignedTo: "Piyush Kadam", priority: "HIGH", status: "PENDING", due: "14 Nov 2026" },
  { id: "88888888-8888-8888-8888-888888888882", title: "Share delivery SLA", description: "Send the latest service-level commitment document.", customer: "Shree Engineering", assignedTo: "Aditi Joshi", priority: "MEDIUM", status: "IN_PROGRESS", due: "15 Nov 2026" },
  { id: "88888888-8888-8888-8888-888888888883", title: "Schedule product demo", description: "Confirm a product demonstration slot with Metro Components.", customer: "Metro Components", assignedTo: "Rohan Patil", priority: "MEDIUM", status: "PENDING", due: "16 Nov 2026" },
  { id: "88888888-8888-8888-8888-888888888884", title: "Follow up pricing discussion", description: "Reconnect after the competitor comparison.", customer: "Western Auto Systems", assignedTo: "Rohan Patil", priority: "URGENT", status: "PENDING", due: "13 Nov 2026" },
  { id: "88888888-8888-8888-8888-888888888885", title: "Confirm quotation receipt", description: "Check whether the customer received the quote.", customer: "ABC Industries", assignedTo: "Piyush Kadam", priority: "LOW", status: "COMPLETED", due: "12 Nov 2026" },
];

const SEED_ALERTS: AlertItem[] = [
  { id: "99999999-9999-9999-9999-999999999991", title: "Pricing risk detected", message: "Customer may delay purchase because of pricing and subscription cost.", customer: "Pune Industrial Solutions", region: "Pune", manager: "FieldVoice Demo Manager", rep: "Piyush Kadam", severity: "HIGH", status: "OPEN" },
  { id: "99999999-9999-9999-9999-999999999992", title: "Competitor mention", message: "Another supplier is being evaluated on commercial terms.", customer: "Western Auto Systems", region: "Mumbai", manager: "FieldVoice Demo Manager", rep: "Rohan Patil", severity: "HIGH", status: "OPEN" },
  { id: "99999999-9999-9999-9999-999999999993", title: "Follow-up overdue", message: "A customer follow-up is approaching the requested decision window.", customer: "ABC Industries", region: "Pune", manager: "FieldVoice Demo Manager", rep: "Piyush Kadam", severity: "MEDIUM", status: "ACKNOWLEDGED" },
  { id: "99999999-9999-9999-9999-999999999994", title: "Strong buying intent", message: "AI detected clear purchase intent from the latest customer conversation.", customer: "Shree Engineering", region: "Pune", manager: "FieldVoice Demo Manager", rep: "Aditi Joshi", severity: "LOW", status: "RESOLVED" },
];

const SEED_LEADS: Lead[] = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title: "Industrial software rollout", customer: "Pune Industrial Solutions", stage: "NEGOTIATION", value: 780000, probability: 72 },
  { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title: "Plant automation package", customer: "Shree Engineering", stage: "PROPOSAL", value: 520000, probability: 58 },
  { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", title: "Components expansion", customer: "Metro Components", stage: "QUALIFIED", value: 310000, probability: 38 },
  { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", title: "Automotive account", customer: "Western Auto Systems", stage: "NEW", value: 440000, probability: 24 },
];

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TREND_REP = [4, 7, 5, 8, 6, 9, 11];
const TREND_TEAM = [31, 46, 42, 55, 51, 63, 72];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "FV";
}

function money(v: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
}

function pageTitle(view: ViewKey) {
  return ({
    home: "Dashboard",
    visits: "Visits",
    "visit-detail": "Visit detail",
    record: "Record visit",
    report: "Report",
    email: "Follow-up email",
    reports: "Reports",
    tasks: "Action Items",
    insights: "AI Intelligence",
    map: "Territory",
    team: "Team",
    organization: "Organization",
    "rep-activity": "Field Rep Performance",
    settings: "Settings",
    customers: "Customers",
    "customer-detail": "Customer",
    leads: "Leads",
    history: "History",
    alerts: "Alerts",
  })[view];
}

function roleLabel(role: Role) {
  return role === "Salesperson" ? "FIELD REP" : role === "Manager" ? "MANAGEMENT" : "EXECUTIVE";
}

function mapBackendRoleToAppRole(backendRole: string): Role {
  const norm = (backendRole || "").toUpperCase();
  if (norm === "EXECUTIVE") return "Executive";
  if (norm === "MANAGER") return "Manager";
  return "Salesperson";
}

// ---------------------------------------------------------------------------
// REUSABLE UI PRIMITIVES
// ---------------------------------------------------------------------------

function Badge({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const { colors, mode } = useTheme();
  const c = tone === "neutral"
    ? { bg: colors.surface2, bd: colors.border, tx: colors.muted }
    : tone === "success"
      ? { bg: mode === "dark" ? "#102019" : "#E8F6EF", bd: mode === "dark" ? "#274A3A" : "#A8D8BE", tx: colors.success }
      : tone === "warning"
        ? { bg: mode === "dark" ? "#241B0E" : "#FFF6DF", bd: mode === "dark" ? "#57441D" : "#E7C97A", tx: colors.warning }
        : { bg: mode === "dark" ? "#28131C" : "#FCEBED", bd: mode === "dark" ? "#5D2A3A" : "#E6AAB4", tx: colors.danger };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Text style={[styles.badgeText, { color: c.tx }]}>{text}</Text>
    </View>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: any }) {
  const { colors } = useTheme();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

function SectionHeader({ eyebrow, title, sub, action }: { eyebrow?: string; title: string; sub?: string; action?: { label: string; onPress: () => void; icon?: IconName } }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={[styles.h1, { color: colors.text }]}>{title}</Text>
        {sub ? <Text style={[styles.sectionSub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable style={styles.compactAction} onPress={action.onPress}>
          {action.icon ? <Ionicons name={action.icon} size={14} color="#FFF" /> : null}
          <Text style={styles.compactActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({ icon, label, value, sub, tone = "wine", onPress }: { icon: IconName; label: string; value: string | number; sub?: string; tone?: "wine" | "green" | "amber" | "red" | "blue"; onPress?: () => void }) {
  const { colors, mode } = useTheme();
  const cc: any = { wine: colors.accent, green: colors.success, amber: colors.warning, red: colors.danger, blue: mode === "dark" ? "#7EB8FF" : "#1C679A" };
  const node = (
    <View style={[styles.metricCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.metricTop}>
        <View style={[styles.metricIcon, { backgroundColor: `${cc[tone]}18` }]}>
          <Ionicons name={icon} size={16} color={cc[tone]} />
        </View>
        <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      {sub ? <Text style={[styles.metricSub, { color: colors.dim }]}>{sub}</Text> : null}
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.metricWrap}>
      {node}
    </Pressable>
  );
}

function ListRow({ icon, title, sub, right, onPress, danger = false }: { icon: IconName; title: string; sub?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  const body = (
    <View style={styles.listRow}>
      <View style={[styles.rowIcon, { backgroundColor: colors.surface2 }, danger && { backgroundColor: colors.danger + "18" }]}>
        <Ionicons name={icon} size={15} color={danger ? colors.danger : colors.accent} />
      </View>
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.muted }]}>{sub}</Text> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={15} color={colors.dim} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="search" size={15} color={colors.muted} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.dim} style={[styles.searchInput, { color: colors.text }]} />
      {value ? (
        <Pressable onPress={() => onChange("")}>
          <Ionicons name="close-circle" size={15} color={colors.dim} />
        </Pressable>
      ) : null}
    </View>
  );
}

function SelectPill({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable style={[styles.selectPill, { backgroundColor: colors.surface2, borderColor: colors.border }]} onPress={onPress}>
      <Text style={[styles.selectLabel, { color: colors.dim }]}>{label}</Text>
      <Text style={[styles.selectValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
      <Ionicons name="chevron-down" size={13} color={colors.dim} />
    </Pressable>
  );
}

function EmptyState({ icon = "file-tray-outline", text }: { icon?: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={23} color={colors.dim} />
      <Text style={[styles.emptyText, { color: colors.dim }]}>{text}</Text>
    </View>
  );
}

function MiniBars({ values, labels, max }: { values: number[]; labels: string[]; max?: number }) {
  const m = max || Math.max(...values, 1);
  return (
    <View style={styles.miniBars}>
      {values.map((v, i) => (
        <View style={styles.miniBarItem} key={`${labels[i]}-${i}`}>
          <Text style={styles.miniBarValue}>{v}</Text>
          <View style={styles.miniBarTrack}>
            <View style={[styles.miniBarFill, { height: `${Math.max(5, (v / m) * 100)}%` }]} />
          </View>
          <Text style={styles.miniBarLabel}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  );
}

function LineMiniChart({ values, labels }: { values: number[]; labels: string[] }) {
  const m = Math.max(...values, 1);
  return (
    <View style={styles.lineChart}>
      {[0.25, 0.5, 0.75].map(n => <View key={n} style={[styles.lineGuide, { top: `${n * 100}%` }]} />)}
      <View style={styles.lineColumns}>
        {values.map((v, i) => (
          <View key={i} style={styles.lineColumn}>
            <View style={[styles.lineDot, { bottom: `${Math.max(5, (v / m) * 88)}%` }]} />
            <View style={[styles.lineStem, { height: `${Math.max(8, (v / m) * 72)}%` }]} />
            <Text style={styles.lineLabel}>{labels[i]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// NAVIGATION & HEADERS
// ---------------------------------------------------------------------------

function Drawer({
  visible,
  role,
  view,
  onGo,
  onClose,
  onRole,
  user,
  alertCount,
  taskCount,
}: {
  alertCount: number;
  taskCount: number;
  visible: boolean;
  role: Role;
  view: ViewKey;
  onGo: (v: ViewKey) => void;
  onClose: () => void;
  onRole: (r: Role) => void;
  user: AuthUser | null;
}) {
  const { colors } = useTheme();
  if (!visible) return null;

  const rep: [ViewKey, string, IconName][] = [
    ["home", "Dashboard", "grid-outline"],
    ["visits", "My Visits", "map-outline"],
    ["record", "Record Visit", "mic-outline"],
    ["reports", "Reports", "document-text-outline"],
    ["customers", "Customers", "people-outline"],
    ["tasks", "Action Items", "checkmark-done-outline"],
    ["alerts", "Alerts", "notifications-outline"],
    ["insights", "AI Insights", "sparkles-outline"],
    ["history", "History", "time-outline"],
    ["map", "Territory Map", "navigate-outline"],
    ["settings", "Settings", "settings-outline"],
  ];
  const man: [ViewKey, string, IconName][] = [
    ["home", "Dashboard", "grid-outline"],
    ["visits", "Team Visits", "map-outline"],
    ["record", "Record Visit", "mic-outline"],
    ["reports", "Reports", "document-text-outline"],
    ["history", "History", "time-outline"],
    ["customers", "Customers", "people-outline"],
    ["tasks", "Action Items", "checkmark-done-outline"],
    ["alerts", "Alerts", "notifications-outline"],
    ["insights", "AI Insights", "sparkles-outline"],
    ["team", "Team", "briefcase-outline"],
    ["map", "Territory", "navigate-outline"],
    ["settings", "Settings", "settings-outline"],
  ];
  const ex: [ViewKey, string, IconName][] = [
    ["home", "Executive View", "speedometer-outline"],
    ["reports", "Reports", "document-text-outline"],
    ["visits", "Visits", "map-outline"],
    ["customers", "Customers", "people-outline"],
    ["tasks", "Action Items", "checkmark-done-outline"],
    ["insights", "AI Intelligence", "sparkles-outline"],
    ["map", "Territory", "navigate-outline"],
    ["organization", "Organization", "briefcase-outline"],
    ["team", "Team", "people-outline"],
    ["leads", "Leads", "trending-up-outline"],
    ["settings", "Settings", "settings-outline"],
  ];
  const nav = role === "Manager" ? man : role === "Executive" ? ex : rep;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.drawerBackdrop} onPress={onClose} />
      <View style={[styles.drawer, { backgroundColor: colors.bg, borderRightColor: colors.border }]}>
        <View style={styles.drawerBrand}>
          <View style={styles.brandMark}><Ionicons name="mic" size={17} color="#FFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>FIELDVOICE</Text>
            <Text style={styles.brandSub}>AI FIELD INTELLIGENCE</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={18} color="#BAACB5" />
          </Pressable>
        </View>

        <View style={[styles.drawerRoleCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.drawerAvatar}>
            <Text style={styles.drawerAvatarText}>{initials(user?.full_name || "FieldVoice")}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.drawerRoleTitle, { color: colors.text }]}>
              {user?.full_name || (role === "Executive" ? "Executive Overview" : role === "Manager" ? "FieldVoice Demo Manager" : "Piyush Kadam")}
            </Text>
            <Text style={[styles.drawerRoleSub, { color: colors.dim }]}>{roleLabel(role)}</Text>
          </View>
        </View>

        <Text style={styles.drawerKicker}>ACTIVE ROLE</Text>
        <View style={styles.roleSegment}>
          {(["Salesperson", "Manager", "Executive"] as Role[]).map(r => (
            <Pressable
              key={r}
              style={[styles.roleSegmentItem, role === r && styles.roleSegmentActive]}
              onPress={() => { onRole(r); onGo("home"); }}
            >
              <Text style={[styles.roleSegmentText, role === r && styles.roleSegmentTextActive]}>
                {r === "Salesperson" ? "Field Rep" : r}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          {nav.map(([key, label, icon]) => {
            const active = view === key ||
              (view === "visit-detail" && key === "visits") ||
              (view === "customer-detail" && key === "customers") ||
              (view === "rep-activity" && key === "team");
            return (
              <Pressable
                key={key}
                style={[styles.drawerItem, active && styles.drawerItemActive]}
                onPress={() => onGo(key)}
              >
                <Ionicons name={icon} size={18} color={active ? colors.accent : colors.dim} />
                <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text>
                {key === "alerts" && alertCount > 0 ? <Text style={styles.navCount}>{alertCount}</Text> : null}
                {key === "tasks" && taskCount > 0 ? <Text style={styles.navCount}>{taskCount}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.drawerFooter}>
          <Text style={styles.drawerFooterLabel}>API: {api.getApiBaseUrl()}</Text>
          <Text style={styles.drawerFooterValue}>Connected to Backend</Text>
        </View>
      </View>
    </View>
  );
}

function AppHeader({
  role,
  view,
  onMenu,
  onGo,
  apiConnected,
}: {
  role: Role;
  view: ViewKey;
  onMenu: () => void;
  onGo: (v: ViewKey) => void;
  apiConnected: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.appHeader, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      <Pressable style={styles.iconButton} onPress={onMenu}>
        <Ionicons name="menu" size={22} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, paddingHorizontal: 12 }}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{pageTitle(view)}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
          <View style={[styles.statusDot, { backgroundColor: apiConnected ? "#198754" : "#E3B45D" }]} />
          <Text style={[styles.headerSub, { color: colors.dim }]}>
            {roleLabel(role)} · {apiConnected ? "LIVE BACKEND" : "OFFLINE / LOCAL"}
          </Text>
        </View>
      </View>
      <Pressable style={styles.iconButton} onPress={() => onGo("alerts")}>
        <Ionicons name="notifications-outline" size={19} color={colors.text} />
        <View style={styles.notificationDot} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SCREENS & VIEWS
// ---------------------------------------------------------------------------

function DashboardHome({
  role,
  onGo,
  onRecord,
  customers,
  visits,
  tasks,
  alerts,
}: {
  role: Role;
  onGo: (v: ViewKey) => void;
  onRecord: () => void;
  customers: Customer[];
  visits: Visit[];
  tasks: Task[];
  alerts: AlertItem[];
}) {
  const pendingTasks = tasks.filter(t => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const openAlerts = alerts.filter(a => a.status === "OPEN" || a.status === "ACKNOWLEDGED");
  const highOppVisits = visits.filter(v => v.opportunity === "HIGH");
  const highRiskVisits = visits.filter(v => v.risk === "HIGH");

  if (role === "Executive") {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <SectionHeader
          eyebrow="EXECUTIVE INTELLIGENCE"
          title="The field, without the reporting gap."
          sub="A consolidated view of customer signals, pipeline movement and field coverage."
          action={{ label: "New Customer", icon: "add", onPress: () => onGo("customers") }}
        />
        <View style={styles.metricGrid}>
          <Metric icon="map-outline" label="Field visits" value={visits.length} sub="Organization-wide" onPress={() => onGo("visits")} />
          <Metric icon="people-outline" label="Customers" value={customers.length} sub="Accounts covered" tone="blue" onPress={() => onGo("customers")} />
          <Metric icon="trending-up-outline" label="High opportunities" value={highOppVisits.length} sub="From AI analysis" tone="green" onPress={() => onGo("insights")} />
          <Metric icon="alert-outline" label="High risks" value={highRiskVisits.length} sub="Needs attention" tone="red" onPress={() => onGo("alerts")} />
        </View>

        <Panel style={styles.heroPanel}>
          <View style={styles.pillRow}>
            <Badge text="RAW FIELD VISIBILITY" />
            <Badge text="LIVE INTELLIGENCE" tone="success" />
          </View>
          <Text style={styles.heroTitle}>Voice → evidence →{"\n"}management action.</Text>
          <Text style={styles.heroCopy}>Executives can trace commercial signals back to the underlying field report and original voice experience.</Text>
          <View style={styles.execStats}>
            <View>
              <Text style={styles.execNumber}>{highOppVisits.length}</Text>
              <Text style={styles.execLabel}>high opportunities</Text>
            </View>
            <View>
              <Text style={styles.execNumber}>{highRiskVisits.length}</Text>
              <Text style={styles.execLabel}>high risks</Text>
            </View>
            <View>
              <Text style={styles.execNumber}>{openAlerts.length}</Text>
              <Text style={styles.execLabel}>open alerts</Text>
            </View>
          </View>
        </Panel>

        <SectionHeader eyebrow="ORGANIZATION PERFORMANCE" title="Manager performance" action={{ label: "Organization", onPress: () => onGo("organization") }} />
        <Panel>
          <ListRow icon="person-outline" title="FieldVoice Demo Manager" sub="Mumbai + Pune · Active" right={<Text style={styles.scoreText}>94</Text>} onPress={() => onGo("organization")} />
          <ListRow icon="person-outline" title="Rahul Mehta" sub="Nashik · Active" right={<Text style={styles.scoreText}>88</Text>} onPress={() => onGo("organization")} />
          <ListRow icon="person-outline" title="Neha Kulkarni" sub="Nagpur · Active" right={<Text style={styles.scoreText}>81</Text>} onPress={() => onGo("organization")} />
        </Panel>

        <SectionHeader eyebrow="RECENT ORGANIZATION ACTIVITY" title="Field signals" action={{ label: "View all", onPress: () => onGo("visits") }} />
        <Panel>
          {visits.slice(0, 4).map(v => (
            <ListRow
              key={v.id}
              icon="location-outline"
              title={v.customerName}
              sub={`${v.userName} · ${v.date} · ${v.opportunity} opportunity`}
              right={<Badge text={v.sentiment} tone={v.sentiment === "Positive" ? "success" : "warning"} />}
              onPress={() => onGo("visits")}
            />
          ))}
        </Panel>
      </ScrollView>
    );
  }

  if (role === "Manager") {
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <SectionHeader
          eyebrow="FIELD INTELLIGENCE"
          title="Good afternoon, Manager."
          sub="Run your own customer sales activity while managing your Field Rep team."
          action={{ label: "New Visit", icon: "mic", onPress: onRecord }}
        />
        <View style={styles.metricGrid}>
          <Metric icon="mic-outline" label="My visits today" value={visits.length} sub="Start another visit" onPress={onRecord} />
          <Metric icon="map-outline" label="Team visits" value={visits.length} sub="Team + your field activity" onPress={() => onGo("visits")} />
          <Metric icon="time-outline" label="Pending actions" value={pendingTasks.length} sub="Tasks awaiting execution" tone="amber" onPress={() => onGo("tasks")} />
          <Metric icon="checkmark-circle-outline" label="Open alerts" value={openAlerts.length} sub="Needs manager review" tone="red" onPress={() => onGo("alerts")} />
        </View>

        <Panel style={styles.managerHero}>
          <View style={styles.managerHeroTop}>
            <Badge text="TEAM COMMAND CENTER" />
            <Badge text="MUMBAI + PUNE" tone="success" />
          </View>
          <Text style={styles.heroTitle}>Run the team.{"\n"}Stay close to the field.</Text>
          <Text style={styles.heroCopy}>Monitor Field Reps, customer activity, follow-ups and AI risk signals from one workspace.</Text>
        </Panel>

        <SectionHeader eyebrow="MY RECENT VISITS" title="Personal activity" action={{ label: "History", onPress: () => onGo("history") }} />
        <Panel>
          {visits.slice(0, 3).map(v => (
            <ListRow
              key={v.id}
              icon="mic-outline"
              title={v.customerName}
              sub={`${v.date} · ${v.time} · ${v.approval}`}
              right={<Badge text={v.status.replace("_", " ")} tone={v.status === "COMPLETED" ? "success" : "warning"} />}
              onPress={() => onGo("visits")}
            />
          ))}
        </Panel>

        <SectionHeader eyebrow="TEAM SNAPSHOT" title="Field Rep performance" action={{ label: "Manage team", onPress: () => onGo("team") }} />
        <Panel>
          <MiniBars values={[18, 16, 14, 12]} labels={["Piyush", "Aditi", "Rohan", "Sneha"]} max={20} />
        </Panel>

        <View style={styles.twoCardRow}>
          <Pressable style={styles.signalCard} onPress={() => onGo("tasks")}>
            <Ionicons name="checkmark-done-outline" size={18} color="#D06A90" />
            <Text style={styles.signalNumber}>{pendingTasks.length}</Text>
            <Text style={styles.signalLabel}>Pending action items</Text>
          </Pressable>
          <Pressable style={[styles.signalCard, styles.signalRed]} onPress={() => onGo("alerts")}>
            <Ionicons name="alert-circle-outline" size={18} color="#E37D93" />
            <Text style={styles.signalNumber}>{openAlerts.length}</Text>
            <Text style={styles.signalLabel}>Open alerts</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  // Field Rep
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader
        eyebrow="FIELD INTELLIGENCE"
        title="Good afternoon, Piyush."
        sub="Your field intelligence workspace — real-time data from your visits, voice notes, and AI analysis."
        action={{ label: "New Visit", icon: "mic", onPress: onRecord }}
      />
      <View style={styles.metricGrid}>
        <Metric icon="map-outline" label="Today's visits" value={visits.length} sub="Click to manage visits" onPress={() => onGo("visits")} />
        <Metric icon="checkmark-done-outline" label="Pending actions" value={pendingTasks.length} sub="Needs attention" tone="amber" onPress={() => onGo("tasks")} />
        <Metric icon="notifications-outline" label="Open alerts" value={openAlerts.length} sub="Tap to review" tone="red" onPress={() => onGo("alerts")} />
        <Metric icon="flash-outline" label="High opportunities" value={highOppVisits.length} sub="From AI analysis" tone="green" onPress={() => onGo("insights")} />
      </View>

      <Pressable style={styles.recordHero} onPress={onRecord}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Badge text="VOICE CAPTURE" />
          <Text style={styles.recordHeroTitle}>Start a new{"\n"}field visit.</Text>
          <Text style={styles.heroCopy}>Select customer → Record voice note → AI generates insights → Submit report.</Text>
          <View style={styles.buttonInline}>
            <Ionicons name="mic" size={14} color="#FFF" />
            <Text style={styles.buttonInlineText}>Start recording</Text>
          </View>
        </View>
        <View style={styles.orbArt}>
          <View style={styles.orbRingLarge} />
          <View style={styles.orbRingMedium} />
          <View style={styles.orbCenter}>
            <Ionicons name="mic" size={28} color="#FFF" />
          </View>
        </View>
      </Pressable>

      <SectionHeader eyebrow="RECENT VISITS" title="Field activity" action={{ label: "View all", onPress: () => onGo("visits") }} />
      <Panel>
        {visits.slice(0, 3).map(v => (
          <ListRow
            key={v.id}
            icon="location-outline"
            title={v.customerName}
            sub={`${v.date} · ${v.time}`}
            right={<Badge text={`${v.opportunity} opportunity`} tone={v.opportunity === "HIGH" ? "success" : "warning"} />}
            onPress={() => onGo("visits")}
          />
        ))}
      </Panel>

      <SectionHeader eyebrow="ACTION ITEMS" title="Pending follow-ups" action={{ label: "View all", onPress: () => onGo("tasks") }} />
      <Panel>
        {pendingTasks.slice(0, 3).map(t => (
          <ListRow
            key={t.id}
            icon="checkmark-done-outline"
            title={t.title}
            sub={`${t.customer} · ${t.priority} · Due ${t.due}`}
            right={<Badge text={t.priority} tone={t.priority === "HIGH" || t.priority === "URGENT" ? "danger" : "warning"} />}
            onPress={() => onGo("tasks")}
          />
        ))}
      </Panel>

      <SectionHeader eyebrow="OPEN ALERTS" title="AI attention signals" action={{ label: "View all", onPress: () => onGo("alerts") }} />
      <Panel>
        {openAlerts.slice(0, 3).map(a => (
          <ListRow
            key={a.id}
            icon="warning-outline"
            title={a.title}
            sub={`${a.customer} · ${a.severity}`}
            right={<Badge text={a.status} tone="danger" />}
            danger
            onPress={() => onGo("alerts")}
          />
        ))}
      </Panel>
    </ScrollView>
  );
}

function VisitsView({
  visits,
  role,
  onOpen,
}: {
  visits: Visit[];
  role: Role;
  onOpen: (v: Visit) => void;
}) {
  const [filter, setFilter] = useState("ALL");
  const rows = filter === "ALL" ? visits : visits.filter(v => v.status === filter);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader
        eyebrow="FIELD ACTIVITY"
        title={role === "Salesperson" ? "My Visits" : role === "Manager" ? "Team Visits" : "Visits"}
        sub="Review visit execution, customer activity and AI field signals."
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {["ALL", "COMPLETED", "IN_PROGRESS"].map(x => (
          <Pressable key={x} style={[styles.filterChip, filter === x && styles.filterChipActive]} onPress={() => setFilter(x)}>
            <Text style={[styles.filterChipText, filter === x && styles.filterChipTextActive]}>
              {x === "ALL" ? "All" : x.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon="map-outline" text="No visits found for current filter." />
        ) : (
          rows.map(v => (
            <Pressable key={v.id} style={styles.visitCard} onPress={() => onOpen(v)}>
              <View style={styles.visitCardTop}>
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>{initials(v.customerName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{v.customerName}</Text>
                  <Text style={styles.rowSub}>{v.userName} · {v.region}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6E646D" />
              </View>
              <View style={styles.visitMetaRow}>
                <Text style={styles.metaText}>{v.date} · {v.time}</Text>
                <Badge text={v.status.replace("_", " ")} tone={v.status === "COMPLETED" ? "success" : "warning"} />
              </View>
              <View style={styles.visitSignalRow}>
                <Badge text={v.sentiment} tone={v.sentiment === "Positive" ? "success" : "warning"} />
                <Badge text={`${v.opportunity} opportunity`} tone={v.opportunity === "HIGH" ? "success" : "neutral"} />
                <Badge text={`${v.risk} risk`} tone={v.risk === "HIGH" ? "danger" : "neutral"} />
              </View>
            </Pressable>
          ))
        )}
      </Panel>
    </ScrollView>
  );
}

function VisitDetailView({
  visit,
  onBack,
  onGo,
}: {
  visit: Visit | null;
  onBack: () => void;
  onGo: (v: ViewKey) => void;
}) {
  if (!visit) {
    return (
      <View style={styles.page}>
        <EmptyState text="No visit selected." />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={15} color="#C87394" />
        <Text style={styles.backLinkText}>Back to visits</Text>
      </Pressable>
      <SectionHeader eyebrow="FIELD VISIT" title={visit.customerName} sub={`${visit.date} · ${visit.time} · ${visit.region}`} />

      <View style={styles.twoCardRow}>
        <Metric icon="sparkles-outline" label="Opportunity" value={visit.opportunity} sub="AI signal" tone="green" />
        <Metric icon="alert-outline" label="Risk" value={visit.risk} sub="AI signal" tone={visit.risk === "HIGH" ? "red" : "amber"} />
      </View>

      <Panel>
        <Text style={styles.panelKicker}>VISIT SUMMARY</Text>
        <Text style={styles.bodyText}>{visit.summary}</Text>
        <View style={styles.divider} />
        <View style={styles.detailGrid}>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Visit type</Text>
            <Text style={styles.detailValue}>{visit.visitType.replace("_", " ")}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Rep</Text>
            <Text style={styles.detailValue}>{visit.userName}</Text>
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Approval</Text>
            <Badge text={visit.approval} tone={visit.approval === "APPROVED" ? "success" : visit.approval === "REJECTED" ? "danger" : "warning"} />
          </View>
          <View style={styles.detailCell}>
            <Text style={styles.detailLabel}>Sentiment</Text>
            <Text style={styles.detailValue}>{visit.sentiment}</Text>
          </View>
        </View>
      </Panel>

      <SectionHeader eyebrow="AI INTELLIGENCE" title="Customer signals" />
      <Panel>
        <ListRow icon="heart-outline" title="Customer sentiment" sub={visit.sentiment} right={<Badge text={visit.sentiment} tone="success" />} />
        <ListRow icon="trending-up-outline" title="Opportunity level" sub="Detected from customer conversation" right={<Badge text={visit.opportunity} tone="success" />} />
        <ListRow icon="warning-outline" title="Risk level" sub="Commercial or relationship risk" right={<Badge text={visit.risk} tone={visit.risk === "HIGH" ? "danger" : "warning"} />} />
      </Panel>

      <SectionHeader eyebrow="RELATED WORK" title="What happens next" />
      <Panel>
        <ListRow icon="document-text-outline" title="Open field report" sub="Review report and submission state" onPress={() => onGo("reports")} />
        <ListRow icon="checkmark-done-outline" title="View action items" sub="Tasks generated from this visit" onPress={() => onGo("tasks")} />
        <ListRow icon="notifications-outline" title="Review alerts" sub="AI attention signals" onPress={() => onGo("alerts")} />
      </Panel>
    </ScrollView>
  );
}

function RecordView({
  customer,
  customers,
  onNext,
  onSelectCustomer,
}: {
  customer: Customer;
  customers: Customer[];
  onNext: (report: Report) => void;
  onSelectCustomer: (c: Customer) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const processTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleToggleRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Enforce the advertised 60 second maximum
  useEffect(() => {
    if (recording && seconds >= 60) handleToggleRef.current();
  }, [recording, seconds]);

  // Never fire the pending "processing" timer after leaving the screen
  useEffect(() => () => {
    if (processTimer.current) clearTimeout(processTimer.current);
  }, []);

  async function handleToggle() {
    if (!recording) {
      setSeconds(0);
      setRecording(true);
      return;
    }
    setRecording(false);
    setProcessing(true);

    try {
      // Simulate real audio capture processing
      processTimer.current = setTimeout(() => {
        setProcessing(false);
        const newReport: Report = {
          id: `draft-${Date.now()}`,
          visitId: `v-${Date.now()}`,
          customerName: customer.name,
          createdBy: "Piyush Kadam",
          managerName: "FieldVoice Demo Manager",
          region: customer.region || "Pune",
          status: "DRAFT",
          title: `${customer.name} — Field Visit`,
          transcript: `Met with ${customer.contact || "client"} at ${customer.name}. Client is very interested in the automation solution. Discussion revolved around customized pricing models and delivery timelines. They asked for a revised quotation tomorrow.`,
          summary: `Strong interest shown by ${customer.name}. Pricing terms requested for upcoming review.`,
          insights: ["Commercial pricing is primary evaluation factor", "Strong buyer intent detected", "Prompt quote requested"],
          actions: ["Prepare revised pricing proposal", "Send quotation tomorrow morning", "Follow up on SLA details"],
          sentiment: "Positive",
          opportunity: "HIGH",
          risk: "MEDIUM",
          createdAt: "Just now",
        };
        onNext(newReport);
      }, 1400);
    } catch {
      setProcessing(false);
    }
  }

  handleToggleRef.current = handleToggle;

  if (processing) {
    return (
      <View style={styles.processingScreen}>
        <View style={styles.aiOrbit}>
          <ActivityIndicator size="large" color="#D77598" />
        </View>
        <Text style={styles.processingTitle}>Turning voice into intelligence</Text>
        <Text style={styles.processingCopy}>Transcribing field speech, extracting commercial signals and generating structured report.</Text>
        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>
        <View style={styles.processingSteps}>
          {["Transcribe voice", "Extract signals", "Build report"].map((s, i) => (
            <View key={s} style={[styles.processingStep, i === 0 && styles.processingStepActive]}>
              <Text style={[styles.processingStepText, i === 0 && styles.processingStepActiveText]}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader
        eyebrow="VOICE CAPTURE"
        title="Record a field visit"
        sub="Select the customer, speak naturally, then let AI turn the conversation into a structured report."
      />

      <Pressable style={styles.customerSelectCard} onPress={() => setShowPicker(!showPicker)}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(customer.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerSelectLabel}>CUSTOMER</Text>
          <Text style={styles.customerSelectName}>{customer.name}</Text>
          <Text style={styles.customerSelectMeta}>{customer.city} · {customer.industry}</Text>
        </View>
        <Ionicons name={showPicker ? "chevron-up" : "chevron-down"} size={17} color="#897A84" />
      </Pressable>

      {showPicker && (
        <Panel style={{ marginBottom: 12 }}>
          <Text style={styles.panelKicker}>CHOOSE CUSTOMER</Text>
          {customers.map(c => (
            <ListRow
              key={c.id}
              icon="business-outline"
              title={c.name}
              sub={`${c.city} · ${c.industry}`}
              right={c.id === customer.id ? <Badge text="Selected" tone="success" /> : undefined}
              onPress={() => {
                onSelectCustomer(c);
                setShowPicker(false);
              }}
            />
          ))}
        </Panel>
      )}

      <Panel style={styles.recordStage}>
        <Badge text="MAX 60 SEC" />
        <Text style={styles.recordTimer}>
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
        </Text>
        <Text style={styles.recordInstruction}>
          Tell us how the meeting went — include customer sentiment, pricing discussions, objections, and next steps.
        </Text>
        <View style={styles.waveZone}>
          {Array.from({ length: 27 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.waveBar,
                { height: recording ? 14 + ((i * 19) % 43) : 9 + ((i * 7) % 12) },
              ]}
            />
          ))}
        </View>
        <Pressable onPress={handleToggle} style={[styles.micOrb, recording && styles.micOrbLive]}>
          {recording ? <View style={styles.stopSquare} /> : <Ionicons name="mic" size={31} color="#FFF" />}
        </Pressable>
        <Text style={styles.micHint}>{recording ? "Tap to stop & analyze" : "Tap to start recording"}</Text>
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <Text style={styles.panelKicker}>HOW IT WORKS</Text>
        {[
          ["1", "Record", "30–60 second voice note from the field"],
          ["2", "AI transcription", "Convert the natural conversation into text"],
          ["3", "AI analysis", "Extract sentiment, opportunities, risks and actions"],
          ["4", "Report", "Review, edit and submit the final report"],
        ].map(([n, t, d]) => (
          <View key={n} style={styles.workflowRow}>
            <View style={styles.workflowNumber}>
              <Text style={styles.workflowNumberText}>{n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t}</Text>
              <Text style={styles.rowSub}>{d}</Text>
            </View>
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}

function ReportEditorView({
  report,
  onChange,
  onSubmit,
  onEmail,
  onRecordAgain,
}: {
  report: Report;
  onChange: (r: Report) => void;
  onSubmit: () => void;
  onEmail: () => void;
  onRecordAgain: () => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page}>
        <SectionHeader
          eyebrow="AI FIELD REPORT"
          title="Review, edit & submit"
          sub="FieldVoice AI extracted the important signals. The report remains editable before submission."
        />

        <Panel>
          <View style={styles.reportHeaderRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(report.customerName)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{report.customerName}</Text>
              <Text style={styles.rowSub}>{report.createdBy} · {report.region}</Text>
            </View>
            <Badge text={report.status} tone={report.status === "APPROVED" ? "success" : report.status === "REJECTED" ? "danger" : "warning"} />
          </View>

          <View style={styles.divider} />

          <Text style={styles.panelKicker}>ORIGINAL VOICE NOTE</Text>
          <View style={styles.voiceStrip}>
            <View style={styles.playButton}>
              <Ionicons name="play" size={14} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Original field recording</Text>
              <Text style={styles.rowSub}>00:27 · captured today</Text>
            </View>
            <Ionicons name="headset-outline" size={18} color="#766B74" />
          </View>

          <Text style={styles.panelKicker}>TRANSCRIPT</Text>
          <View style={styles.textBlock}>
            <Text style={styles.bodyText}>{report.transcript}</Text>
          </View>

          <View style={styles.editHeader}>
            <Text style={styles.panelKicker}>SUMMARY</Text>
            <Pressable style={styles.inlineEditButton} onPress={() => setEditing(v => !v)}>
              <Ionicons name={editing ? "checkmark" : "create-outline"} size={13} color={colors.accent} />
              <Text style={styles.inlineEditText}>{editing ? "Done" : "Edit"}</Text>
            </Pressable>
          </View>

          {editing ? (
            <TextInput
              multiline
              value={report.summary}
              onChangeText={v => onChange({ ...report, summary: v })}
              style={styles.editInput}
            />
          ) : (
            <View style={styles.textBlock}>
              <Text style={styles.bodyText}>{report.summary}</Text>
            </View>
          )}

          <Text style={styles.panelKicker}>KEY INSIGHTS</Text>
          <View style={styles.tagWrap}>
            {report.insights.map(x => (
              <View key={x} style={styles.tag}>
                <Text style={styles.tagText}>{x}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.panelKicker}>ACTION ITEMS</Text>
          <View style={styles.actionList}>
            {report.actions.map(x => (
              <View key={x} style={styles.actionLine}>
                <Ionicons name="checkmark-circle" size={15} color="#74C49A" />
                <Text style={styles.actionText}>{x}</Text>
              </View>
            ))}
          </View>
        </Panel>

        <Panel style={{ marginTop: 12 }}>
          <Text style={styles.panelKicker}>AI SIGNAL CARD</Text>
          <View style={styles.aiSignalGrid}>
            <View style={styles.aiSignalCell}>
              <Text style={styles.detailLabel}>Sentiment</Text>
              <Badge text={report.sentiment} tone={report.sentiment === "Positive" ? "success" : "warning"} />
            </View>
            <View style={styles.aiSignalCell}>
              <Text style={styles.detailLabel}>Interest</Text>
              <Text style={styles.aiBig}>86%</Text>
            </View>
            <View style={styles.aiSignalCell}>
              <Text style={styles.detailLabel}>Opportunity</Text>
              <Badge text={report.opportunity} tone="success" />
            </View>
            <View style={styles.aiSignalCell}>
              <Text style={styles.detailLabel}>Risk</Text>
              <Badge text={report.risk} tone={report.risk === "HIGH" ? "danger" : "warning"} />
            </View>
          </View>

          <View style={styles.insightCallout}>
            <Ionicons name="bulb-outline" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.panelKicker}>AI KEY INSIGHT</Text>
              <Text style={styles.calloutTitle}>High intent, pricing is the blocker.</Text>
              <Text style={styles.calloutText}>Prompt follow-up with customized pricing protects momentum.</Text>
            </View>
          </View>
        </Panel>

        <View style={styles.buttonStack}>
          <Pressable style={styles.secondaryButton} onPress={onRecordAgain}>
            <Ionicons name="mic-outline" size={15} color="#D4C7CF" />
            <Text style={styles.secondaryButtonText}>Record again</Text>
          </Pressable>

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButtonHalf} onPress={onEmail}>
              <Ionicons name="mail-outline" size={14} color="#D4C7CF" />
              <Text style={styles.secondaryButtonText}>Email draft</Text>
            </Pressable>
            <Pressable style={styles.primaryButtonHalf} onPress={onSubmit}>
              <Text style={styles.primaryButtonText}>Submit report</Text>
              <Ionicons name="arrow-up" size={15} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ReportsView({
  reports,
  onOpen,
}: {
  reports: Report[];
  onOpen: (r: Report) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");

  const rows = reports.filter(r =>
    (!search || `${r.customerName} ${r.title}`.toLowerCase().includes(search.toLowerCase())) &&
    (filter === "ALL" || r.status === filter)
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader
        eyebrow="REPORTING"
        title="Field reports"
        sub="All AI-generated field visit reports. Review content, original field voice and submission status."
      />
      <SearchField value={search} onChange={setSearch} placeholder="Search reports…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {["ALL", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].map(x => (
          <Pressable key={x} style={[styles.filterChip, filter === x && styles.filterChipActive]} onPress={() => setFilter(x)}>
            <Text style={[styles.filterChipText, filter === x && styles.filterChipTextActive]}>
              {x === "ALL" ? "All" : x}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon="document-text-outline" text="No reports found." />
        ) : (
          rows.map(r => (
            <Pressable key={r.id} style={styles.reportListCard} onPress={() => onOpen(r)}>
              <View style={styles.reportHeaderRow}>
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>{initials(r.customerName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{r.customerName}</Text>
                  <Text style={styles.rowSub}>{r.region} · {r.createdAt}</Text>
                </View>
                <Badge text={r.status} tone={r.status === "APPROVED" ? "success" : r.status === "REJECTED" ? "danger" : "warning"} />
              </View>
              <Text style={styles.reportPreview}>{r.summary}</Text>
              <View style={styles.visitSignalRow}>
                <Badge text={r.sentiment} tone={r.sentiment === "Positive" ? "success" : "warning"} />
                <Badge text={`${r.opportunity} opportunity`} tone="success" />
                <Badge text={`${r.risk} risk`} tone={r.risk === "HIGH" ? "danger" : "warning"} />
              </View>
            </Pressable>
          ))
        )}
      </Panel>
    </ScrollView>
  );
}

function ReportSheet({
  report,
  onClose,
  onStatus,
}: {
  report: Report | null;
  onClose: () => void;
  onStatus: (r: Report) => void;
}) {
  if (!report) return null;
  return (
    <View style={styles.sheetLayer}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>FIELD REPORT</Text>
            <Text style={styles.sheetTitle}>{report.customerName}</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={onClose}>
            <Ionicons name="close" size={18} color="#C4B5BE" />
          </Pressable>
        </View>
        <ScrollView style={{ flexShrink: 1 }}>
          <Badge text={report.status} tone={report.status === "APPROVED" ? "success" : report.status === "REJECTED" ? "danger" : "warning"} />
          <Text style={styles.panelKicker}>SUMMARY</Text>
          <Text style={styles.bodyText}>{report.summary}</Text>
          <Text style={styles.panelKicker}>KEY INSIGHTS</Text>
          {report.insights.map(x => <Text key={x} style={styles.bulletText}>• {x}</Text>)}
          <Text style={styles.panelKicker}>ACTION ITEMS</Text>
          {report.actions.map(x => <Text key={x} style={styles.bulletText}>• {x}</Text>)}
          {report.rejectionReason ? (
            <View style={styles.rejectionBox}>
              <Text style={styles.rejectionTitle}>Rejection reason</Text>
              <Text style={styles.rejectionText}>{report.rejectionReason}</Text>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButtonHalf} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
          <Pressable
            style={styles.primaryButtonHalf}
            onPress={() => onStatus({
              ...report,
              status: report.status === "SUBMITTED" ? "APPROVED" : report.status === "REJECTED" ? "EDITED" : "SUBMITTED",
            })}
          >
            <Text style={styles.primaryButtonText}>
              {report.status === "SUBMITTED" ? "Approve" : report.status === "REJECTED" ? "Mark edited" : "Submit"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function EmailView({
  report,
  onBack,
}: {
  report: Report;
  onBack: () => void;
}) {
  const [to, setTo] = useState("customer@company.com");
  const [subject, setSubject] = useState(`Follow-up — ${report.customerName} field visit`);
  const [body, setBody] = useState(
    `Hi,\n\nThank you for meeting with us today. Following up on our discussion regarding ${report.customerName}:\n\nSUMMARY\n${report.summary}\n\nACTION ITEMS\n${report.actions.map(x => `• ${x}`).join("\n")}\n\nRegards,\n${report.createdBy}\nFieldVoice AI`
  );

  function handleSendEmail() {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Email App", "Could not open external mail application. Your message was preserved.");
    });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={15} color="#C87394" />
          <Text style={styles.backLinkText}>Back to report</Text>
        </Pressable>
        <SectionHeader eyebrow="FOLLOW-UP EMAIL" title="Compose follow-up" sub="Draft uses the AI-generated report. Edit before sending." />

        <Panel>
          <View style={styles.reportHeaderRow}>
            <View style={styles.mailAvatar}>
              <Ionicons name="mail-outline" size={20} color="#D27294" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>FieldVoice Follow-up</Text>
              <Text style={styles.rowSub}>Generated from field report — {report.customerName}</Text>
            </View>
            <Badge text="READY TO SEND" tone="success" />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>TO (CUSTOMER EMAIL)</Text>
            <TextInput value={to} onChangeText={setTo} placeholder="customer@company.com" placeholderTextColor="#625861" style={styles.formInput} />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>SUBJECT</Text>
            <TextInput value={subject} onChangeText={setSubject} placeholder="Follow-up" placeholderTextColor="#625861" style={styles.formInput} />
          </View>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>MESSAGE</Text>
            <TextInput value={body} onChangeText={setBody} multiline style={[styles.formInput, styles.emailInput]} />
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButtonHalf} onPress={() => { Share.share({ message: body, title: subject }).catch(() => undefined); }}>
              <Text style={styles.secondaryButtonText}>Share / copy</Text>
            </Pressable>
            <Pressable style={styles.primaryButtonHalf} onPress={handleSendEmail}>
              <Ionicons name="mail" size={14} color="#FFF" />
              <Text style={styles.primaryButtonText}>Open email app</Text>
            </Pressable>
          </View>
        </Panel>

        <View style={styles.scopeNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#76C69B" />
          <Text style={styles.scopeNoteText}>Seamless integration directly launches your native mobile mail client with the drafted text.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CustomersView({
  customers,
  onOpen,
  onCreate,
}: {
  customers: Customer[];
  onOpen: (c: Customer) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("ALL");

  const rows = customers.filter(c =>
    (!search || `${c.name} ${c.city} ${c.industry}`.toLowerCase().includes(search.toLowerCase())) &&
    (region === "ALL" || c.region === region || c.city === region)
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader
        eyebrow="CRM"
        title="Customers"
        sub="Your organization's customer accounts. Create, assign and manage accounts from one workspace."
        action={{ label: "New Customer", icon: "add", onPress: onCreate }}
      />
      <SearchField value={search} onChange={setSearch} placeholder="Search customers, cities, industries…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {["ALL", "Pune", "Mumbai"].map(x => (
          <Pressable key={x} style={[styles.filterChip, region === x && styles.filterChipActive]} onPress={() => setRegion(x)}>
            <Text style={[styles.filterChipText, region === x && styles.filterChipTextActive]}>
              {x === "ALL" ? "All regions" : x}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.metricGrid}>
        <Metric icon="people-outline" label="Accounts" value={rows.length} sub="Current filter" />
        <Metric icon="checkmark-circle-outline" label="Active" value={rows.filter(c => c.status === "ACTIVE").length} sub="Active accounts" tone="green" />
      </View>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon="people-outline" text="No customers match criteria." />
        ) : (
          rows.map(c => (
            <Pressable key={c.id} onPress={() => onOpen(c)} style={styles.customerCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(c.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.rowSub}>{c.contact} · {c.city} · {c.industry}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                  <Badge text={c.region || c.city} />
                  <Badge text={c.status} tone={c.status === "ACTIVE" ? "success" : "warning"} />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#6E646D" />
            </Pressable>
          ))
        )}
      </Panel>
    </ScrollView>
  );
}

function CreateCustomerView({
  onClose,
  onCreated,
  token,
}: {
  onClose: () => void;
  onCreated: (c: Customer) => void;
  token: string | null;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("Pune");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("Pune");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const field = (label: string, value: string, setter: (v: string) => void, placeholder: string) => (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput value={value} onChangeText={setter} placeholder={placeholder} placeholderTextColor="#625861" style={styles.formInput} />
    </View>
  );

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Validation", "Customer name is required.");
      return;
    }
    setLoading(true);
    try {
      if (token) {
        await api.createCustomer(token, {
          name: name.trim(),
          contact_person: contact.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          city: city.trim() || region,
          industry: industry.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      onCreated({
        id: `c-${Date.now()}`,
        name: name.trim(),
        contact: contact.trim() || "Contact pending",
        city: city.trim() || region,
        state: "Maharashtra",
        industry: industry.trim() || "General",
        email: email.trim() || "info@customer.example",
        phone: phone.trim() || "—",
        status: "ACTIVE",
        region,
        assignedTo: "Piyush Kadam",
        notes,
      });
    } catch (e: any) {
      Alert.alert("Customer Created Locally", `Note: ${e.message}`);
      onCreated({
        id: `c-${Date.now()}`,
        name: name.trim(),
        contact: contact.trim() || "Contact pending",
        city: city.trim() || region,
        state: "Maharashtra",
        industry: industry.trim() || "General",
        email: email.trim() || "info@customer.example",
        phone: phone.trim() || "—",
        status: "ACTIVE",
        region,
        assignedTo: "Piyush Kadam",
        notes,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page}>
        <Pressable onPress={onClose} style={styles.backLink}>
          <Ionicons name="chevron-back" size={15} color="#C87394" />
          <Text style={styles.backLinkText}>Back to customers</Text>
        </Pressable>
        <SectionHeader eyebrow="CRM MANAGEMENT" title="Create customer" sub="Create the account, region and Field Rep assignment together." />

        <Panel>
          {field("Customer name *", name, setName, "e.g. Pune Industrial Solutions")}
          {field("Contact person", contact, setContact, "Rahul Sharma")}
          {field("Industry", industry, setIndustry, "Industrial Equipment")}
          {field("City", city, setCity, "Pune")}
          {field("Email", email, setEmail, "contact@company.com")}
          {field("Phone", phone, setPhone, "9876543210")}

          <Text style={styles.formLabel}>REGION *</Text>
          <View style={styles.choiceRow}>
            {["Pune", "Mumbai"].map(x => (
              <Pressable
                key={x}
                style={[styles.choiceButton, region === x && styles.choiceButtonActive]}
                onPress={() => { setRegion(x); setCity(x); }}
              >
                <Text style={[styles.choiceText, region === x && styles.choiceTextActive]}>{x}</Text>
              </Pressable>
            ))}
          </View>

          {field("Notes", notes, setNotes, "Customer context and account notes…")}

          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButtonHalf} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryButtonHalf} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.primaryButtonText}>Create customer</Text>}
            </Pressable>
          </View>
        </Panel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CustomerDetailView({
  customer,
  onBack,
  onRecord,
  visits,
  tasks,
}: {
  customer: Customer | null;
  onBack: () => void;
  onRecord: () => void;
  visits: Visit[];
  tasks: Task[];
}) {
  const { colors } = useTheme();
  if (!customer) {
    return (
      <View style={styles.page}>
        <EmptyState text="No customer selected." />
      </View>
    );
  }

  const vs = visits.filter(v => v.customerId === customer.id || v.customerName === customer.name);
  const ts = tasks.filter(t => t.customer === customer.name);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={15} color={colors.accent} />
        <Text style={styles.backLinkText}>Back to customers</Text>
      </Pressable>
      <SectionHeader eyebrow="CUSTOMER" title={customer.name} sub={`${customer.industry} · ${customer.city} · ${customer.state}`} action={{ label: "Start visit", icon: "mic", onPress: onRecord }} />

      <View style={styles.metricGrid}>
        <Metric icon="map-outline" label="Total visits" value={vs.length} />
        <Metric icon="checkmark-done-outline" label="Action items" value={ts.length} tone="amber" />
        <Metric icon="pulse-outline" label="Status" value={customer.status} tone="green" />
        <Metric icon="people-outline" label="Owner" value={customer.assignedTo ? customer.assignedTo.split(" ")[0] : "Piyush"} tone="blue" />
      </View>

      <Panel>
        <Text style={styles.panelKicker}>CONTACT INFORMATION</Text>
        <ListRow icon="person-outline" title={customer.contact} sub="Primary contact" />
        <ListRow icon="mail-outline" title={customer.email} sub="Customer email" />
        <ListRow icon="call-outline" title={customer.phone} sub="Phone" />
        <ListRow icon="location-outline" title={`${customer.city}, ${customer.state}`} sub={customer.region} />
      </Panel>

      <SectionHeader eyebrow="ACCOUNT HISTORY" title="Visit history" />
      <Panel>
        {vs.length ? (
          vs.map(v => (
            <ListRow
              key={v.id}
              icon="map-outline"
              title={v.date}
              sub={`${v.time} · ${v.userName} · ${v.sentiment}`}
              right={<Badge text={v.status.replace("_", " ")} tone={v.status === "COMPLETED" ? "success" : "warning"} />}
            />
          ))
        ) : (
          <EmptyState icon="map-outline" text="No visits recorded yet." />
        )}
      </Panel>

      <SectionHeader eyebrow="FOLLOW-UPS" title="Action items" />
      <Panel>
        {ts.length ? (
          ts.map(t => (
            <ListRow
              key={t.id}
              icon="checkmark-done-outline"
              title={t.title}
              sub={`${t.priority} · Due ${t.due}`}
              right={<Badge text={t.status} tone={t.status === "COMPLETED" ? "success" : "warning"} />}
            />
          ))
        ) : (
          <EmptyState icon="checkmark-done-outline" text="No action items." />
        )}
      </Panel>

      <View style={styles.insightCallout}>
        <Ionicons name="bulb-outline" size={18} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.panelKicker}>ACCOUNT NOTE</Text>
          <Text style={styles.calloutTitle}>{customer.notes || "No account notes yet."}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function TasksView({
  tasks,
  setTasks,
  role,
  token,
}: {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  role: Role;
  token: string | null;
}) {
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");

  const rows = tasks.filter(t =>
    (status === "ALL" || t.status === status) &&
    (priority === "ALL" || t.priority === priority)
  );

  async function cycleStatus(id: string) {
    const cur = tasks.find(t => t.id === id);
    if (!cur) return;
    const nextStatus: Task["status"] =
      cur.status === "PENDING"
        ? "IN_PROGRESS"
        : cur.status === "IN_PROGRESS"
          ? "COMPLETED"
          : cur.status === "COMPLETED"
            ? "CANCELLED"
            : "PENDING";

    setTasks(all => all.map(t => (t.id === id ? { ...t, status: nextStatus } : t)));

    if (token) {
      try {
        await api.updateActionItemStatus(token, id, nextStatus);
      } catch {
        // Keep optimistic local update
      }
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader
        eyebrow={role === "Manager" ? "FOLLOW-UP CONTROL CENTER" : "EXECUTION"}
        title={role === "Manager" ? "Follow-up control center" : "Tasks & follow-ups"}
        sub={role === "Manager" ? "Monitor action workload across your Field Rep team." : "Turn AI insights into executable follow-up work."}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"].map(x => (
          <Pressable key={x} style={[styles.filterChip, status === x && styles.filterChipActive]} onPress={() => setStatus(x)}>
            <Text style={[styles.filterChipText, status === x && styles.filterChipTextActive]}>
              {x === "ALL" ? "All" : x.replace("_", " ")}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Panel>
        {rows.length ? (
          rows.map(t => (
            <Pressable key={t.id} style={styles.taskCard} onPress={() => cycleStatus(t.id)}>
              <View style={styles.taskTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.title}</Text>
                  <Text style={styles.rowSub}>{t.customer} · {t.assignedTo}</Text>
                </View>
                <Badge text={t.priority} tone={t.priority === "URGENT" || t.priority === "HIGH" ? "danger" : "warning"} />
              </View>
              <Text style={styles.taskDescription}>{t.description}</Text>
              <View style={styles.taskFooter}>
                <Text style={styles.metaText}>Due {t.due}</Text>
                <Badge text={t.status.replace("_", " ")} tone={t.status === "COMPLETED" ? "success" : t.status === "CANCELLED" ? "danger" : "warning"} />
              </View>
              <Text style={styles.tapHint}>Tap to update status · syncs to backend</Text>
            </Pressable>
          ))
        ) : (
          <EmptyState icon="checkmark-done-outline" text="No tasks match current filters." />
        )}
      </Panel>
    </ScrollView>
  );
}

function AlertsView({
  alerts,
  setAlerts,
  role,
  token,
}: {
  alerts: AlertItem[];
  setAlerts: React.Dispatch<React.SetStateAction<AlertItem[]>>;
  role: Role;
  token: string | null;
}) {
  const [status, setStatus] = useState("ALL");
  const rows = alerts.filter(a => status === "ALL" || a.status === status);

  async function cycleAlert(id: string) {
    const cur = alerts.find(a => a.id === id);
    if (!cur) return;
    const nextStatus: AlertItem["status"] =
      cur.status === "OPEN"
        ? "ACKNOWLEDGED"
        : cur.status === "ACKNOWLEDGED"
          ? "RESOLVED"
          : cur.status === "RESOLVED"
            ? "DISMISSED"
            : "OPEN";

    setAlerts(all => all.map(a => (a.id === id ? { ...a, status: nextStatus } : a)));

    if (token) {
      try {
        await api.updateAlertStatus(token, id, nextStatus);
      } catch {
        // Keep optimistic update
      }
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="AI ATTENTION" title="Field alerts" sub="AI-detected risks, opportunities and urgent items from your field visits." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {["ALL", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map(x => (
          <Pressable key={x} style={[styles.filterChip, status === x && styles.filterChipActive]} onPress={() => setStatus(x)}>
            <Text style={[styles.filterChipText, status === x && styles.filterChipTextActive]}>
              {x === "ALL" ? "All" : x}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Panel>
        {rows.length ? (
          rows.map(a => (
            <Pressable key={a.id} style={styles.alertCard} onPress={() => cycleAlert(a.id)}>
              <View style={styles.alertIcon}>
                <Ionicons name="warning-outline" size={18} color={a.severity === "HIGH" ? "#E67F96" : "#E4B15B"} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.alertTitleRow}>
                  <Text style={styles.rowTitle}>{a.title}</Text>
                  <Badge text={a.severity} tone={a.severity === "HIGH" ? "danger" : "warning"} />
                </View>
                <Text style={styles.alertMessage}>{a.message}</Text>
                <Text style={styles.rowSub}>{a.customer} · {a.rep} · {a.region}</Text>
                <View style={{ marginTop: 7 }}>
                  <Badge text={a.status} tone={a.status === "RESOLVED" ? "success" : a.status === "OPEN" ? "danger" : "warning"} />
                </View>
              </View>
            </Pressable>
          ))
        ) : (
          <EmptyState icon="notifications-outline" text="No alerts match the current filter." />
        )}
      </Panel>
      <Text style={styles.tapHint}>Tap an alert to advance status · syncs to backend</Text>
    </ScrollView>
  );
}

function HistoryView({
  visits,
  reports,
  tasks,
  alerts,
  onGo,
}: {
  visits: Visit[];
  reports: Report[];
  tasks: Task[];
  alerts: AlertItem[];
  onGo: (v: ViewKey) => void;
}) {
  const [tab, setTab] = useState<"Visits" | "Reports" | "Tasks" | "Alerts">("Visits");

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="ACTIVITY HISTORY" title="History" sub="Visits, reports, tasks, alerts and approval state in one place." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {(["Visits", "Reports", "Tasks", "Alerts"] as const).map(x => (
          <Pressable key={x} style={[styles.filterChip, tab === x && styles.filterChipActive]} onPress={() => setTab(x)}>
            <Text style={[styles.filterChipText, tab === x && styles.filterChipTextActive]}>{x}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Panel>
        {tab === "Visits" && visits.map(v => (
          <ListRow
            key={v.id}
            icon="map-outline"
            title={v.customerName}
            sub={`${v.date} · ${v.time}`}
            right={<Badge text={v.approval} tone={v.approval === "APPROVED" ? "success" : "warning"} />}
            onPress={() => onGo("visits")}
          />
        ))}

        {tab === "Reports" && reports.map(r => (
          <ListRow
            key={r.id}
            icon="document-text-outline"
            title={r.customerName}
            sub={`${r.createdAt} · ${r.status}`}
            right={<Badge text={r.status} tone={r.status === "APPROVED" ? "success" : "warning"} />}
            onPress={() => onGo("reports")}
          />
        ))}

        {tab === "Tasks" && tasks.map(t => (
          <ListRow
            key={t.id}
            icon="checkmark-done-outline"
            title={t.title}
            sub={`${t.customer} · ${t.due}`}
            right={<Badge text={t.status} tone={t.status === "COMPLETED" ? "success" : "warning"} />}
            onPress={() => onGo("tasks")}
          />
        ))}

        {tab === "Alerts" && alerts.map(a => (
          <ListRow
            key={a.id}
            icon="notifications-outline"
            title={a.title}
            sub={`${a.customer} · ${a.region}`}
            right={<Badge text={a.status} tone={a.status === "RESOLVED" ? "success" : "danger"} />}
            onPress={() => onGo("alerts")}
          />
        ))}
      </Panel>
    </ScrollView>
  );
}

function InsightsView({ role, onGo }: { role: Role; onGo: (v: ViewKey) => void }) {
  const sentiment = role === "Executive" ? [48, 21, 19, 12] : role === "Manager" ? [56, 19, 17, 8] : [62, 16, 14, 8];
  const visitsTrend = role === "Executive" ? [78, 92, 81, 109, 126, 144, 161] : role === "Manager" ? [10, 13, 12, 17, 15, 20, 24] : TREND_REP;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="AI INTELLIGENCE" title="Field intelligence insights" sub="Aggregated AI signals from field visits and voice notes." />
      <View style={styles.metricGrid}>
        <Metric icon="trending-up-outline" label="High opportunities" value={role === "Executive" ? 146 : role === "Manager" ? 34 : 8} sub="From AI analysis" tone="green" />
        <Metric icon="warning-outline" label="High risks" value={role === "Executive" ? 38 : role === "Manager" ? 11 : 2} sub="Needs attention" tone="red" />
        <Metric icon="notifications-outline" label="Open alerts" value={role === "Executive" ? 57 : role === "Manager" ? 11 : 2} sub="Unresolved" tone="amber" />
        <Metric icon="map-outline" label="Total visits" value={role === "Executive" ? 924 : role === "Manager" ? 112 : 18} sub="Current scope" />
      </View>

      <SectionHeader eyebrow="CUSTOMER SENTIMENT" title="Sentiment distribution" />
      <Panel>
        <MiniBars values={sentiment} labels={["Positive", "Cautious", "Neutral", "Negative"]} max={100} />
      </Panel>

      <View style={styles.twoCardRow}>
        <Pressable style={[styles.signalCard, styles.signalGreen]} onPress={() => onGo("tasks")}>
          <Ionicons name="trending-up-outline" size={18} color="#70C89A" />
          <Text style={styles.signalNumber}>{role === "Executive" ? 146 : role === "Manager" ? 34 : 8}</Text>
          <Text style={styles.signalLabel}>High opportunities</Text>
        </Pressable>
        <Pressable style={[styles.signalCard, styles.signalRed]} onPress={() => onGo("alerts")}>
          <Ionicons name="warning-outline" size={18} color="#E37D93" />
          <Text style={styles.signalNumber}>{role === "Executive" ? 38 : role === "Manager" ? 11 : 2}</Text>
          <Text style={styles.signalLabel}>High risks</Text>
        </Pressable>
      </View>

      <SectionHeader eyebrow="7-DAY FIELD ACTIVITY" title="Visits & reports" />
      <Panel>
        <LineMiniChart values={visitsTrend} labels={WEEK} />
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Visits</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#7CB7FF" }]} />
            <Text style={styles.legendText}>Reports</Text>
          </View>
        </View>
      </Panel>
    </ScrollView>
  );
}

function TeamView({ role, onOpenRep, onGo }: { role: Role; onOpenRep: (rep: any) => void; onGo: (v: ViewKey) => void }) {
  const reps = [
    { id: "33333333-3333-3333-3333-333333333333", name: "Piyush Kadam", email: "piyush.login@fieldvoice.demo", region: "Pune", manager: "FieldVoice Demo Manager", active: true },
    { id: "33333333-3333-3333-3333-333333333334", name: "Aditi Joshi", email: "aditi@fieldvoice.demo", region: "Pune", manager: "FieldVoice Demo Manager", active: true },
    { id: "33333333-3333-3333-3333-333333333335", name: "Rohan Patil", email: "rohan@fieldvoice.demo", region: "Mumbai", manager: "FieldVoice Demo Manager", active: true },
    { id: "rep-4", name: "Sneha More", email: "sneha@fieldvoice.demo", region: "Mumbai", manager: "FieldVoice Demo Manager", active: true },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="TEAM WORKSPACE" title="Field sales representatives" sub="Manage field personnel, assign territories, and review activity volume." />
      <Panel>
        {reps.map(r => (
          <Pressable key={r.id} style={styles.teamCard} onPress={() => onOpenRep(r)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(r.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{r.name}</Text>
              <Text style={styles.rowSub}>{r.region} · {r.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#6E646D" />
          </Pressable>
        ))}
      </Panel>
    </ScrollView>
  );
}

function RepActivityView({ rep, onBack, onGo }: { rep: any; onBack: () => void; onGo: (v: ViewKey) => void }) {
  const { colors } = useTheme();
  if (!rep) return <View style={styles.page}><EmptyState text="No rep selected" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable onPress={onBack} style={styles.backLink}>
        <Ionicons name="chevron-back" size={15} color={colors.accent} />
        <Text style={styles.backLinkText}>Back to team</Text>
      </Pressable>
      <SectionHeader eyebrow="REP ACTIVITY" title={rep.name} sub={`${rep.region} · ${rep.email}`} />
      <View style={styles.metricGrid}>
        <Metric icon="map-outline" label="Recorded visits" value="18" sub="This month" />
        <Metric icon="document-text-outline" label="Reports filed" value="14" sub="Submitted" tone="green" />
      </View>
    </ScrollView>
  );
}

function OrganizationView({ onOpenRep }: { onOpenRep: (r: any) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="ORGANIZATION" title="Structure & regions" sub="Review management hierarchy and territory assignments." />
      <Panel>
        <ListRow icon="business-outline" title="Pune Territory" sub="Active · Manager: FieldVoice Demo Manager" right={<Badge text="2 Reps" tone="success" />} />
        <ListRow icon="business-outline" title="Mumbai Territory" sub="Active · Manager: FieldVoice Demo Manager" right={<Badge text="2 Reps" tone="success" />} />
      </Panel>
    </ScrollView>
  );
}

function TerritoryView({ role }: { role: Role }) {
  const [heat, setHeat] = useState(true);
  const [custs, setCusts] = useState(true);
  const [reps, setReps] = useState(true);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="TERRITORY INTELLIGENCE" title="Field coverage" sub="Customer density, visit activity, live Field Reps and conflict awareness." />
      <View style={styles.mapCard}>
        <View style={styles.mapHeader}>
          <View>
            <Text style={styles.mapTitle}>Pune + Mumbai territory</Text>
            <Text style={styles.mapSub}>Live GPS & territory telemetry</Text>
          </View>
          <Badge text={role === "Executive" ? "ORG VIEW" : "TEAM VIEW"} />
        </View>
        <View style={styles.mapSurface}>
          {heat && (
            <>
              <View style={styles.heatBlobOne} />
              <View style={styles.heatBlobTwo} />
              <View style={styles.heatBlobThree} />
            </>
          )}
          <View style={styles.mapRoadOne} />
          <View style={styles.mapRoadTwo} />
          {custs && (
            <>
              <View style={[styles.mapMarker, { left: "20%", top: "35%" }]}>
                <View style={styles.mapMarkerDot} />
                <Text style={styles.mapMarkerText}>Pune Ind Solutions</Text>
              </View>
              <View style={[styles.mapMarker, { left: "65%", top: "25%" }]}>
                <View style={styles.mapMarkerDot} />
                <Text style={styles.mapMarkerText}>Shree Engineering</Text>
              </View>
            </>
          )}
          {reps && (
            <View style={[styles.mapMarker, { left: "45%", top: "60%" }]}>
              <View style={[styles.mapMarkerDot, styles.mapMarkerRep]} />
              <Text style={styles.mapMarkerText}>Piyush (Live)</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.mapControlGrid}>
        {[
          ["Activity heat", heat, setHeat, "flame-outline"],
          ["Customers", custs, setCusts, "people-outline"],
          ["Live reps", reps, setReps, "navigate-outline"],
        ].map(([label, val, setter, icon]: any) => (
          <Pressable key={label} style={[styles.mapControl, val && styles.mapControlActive]} onPress={() => setter(!val)}>
            <Ionicons name={icon} size={15} color={val ? "#D57396" : "#766B74"} />
            <Text style={[styles.mapControlText, val && styles.mapControlTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function LeadsView({ leads }: { leads: Lead[] }) {
  const [stage, setStage] = useState("ALL");
  const rows = leads.filter(l => stage === "ALL" || l.stage === stage);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="COMMERCIAL PIPELINE" title="Leads & opportunities" sub="Opportunity pipeline signals surfaced from field visits." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalFilters}>
        {["ALL", "NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON"].map(x => (
          <Pressable key={x} style={[styles.filterChip, stage === x && styles.filterChipActive]} onPress={() => setStage(x)}>
            <Text style={[styles.filterChipText, stage === x && styles.filterChipTextActive]}>
              {x === "ALL" ? "All" : x}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon="trending-up-outline" text="No leads found for this stage." />
        ) : (
          rows.map(l => (
            <View key={l.id} style={styles.leadCard}>
              <View style={styles.leadTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{l.title}</Text>
                  <Text style={styles.rowSub}>{l.customer} · {l.stage}</Text>
                </View>
                <Text style={styles.leadValue}>{money(l.value)}</Text>
              </View>
              <View style={styles.leadProgressTrack}>
                <View style={[styles.leadProgressFill, { width: `${l.probability}%` }]} />
              </View>
              <View style={styles.leadBottom}>
                <Text style={styles.metaText}>{l.probability}% probability</Text>
                <Badge text={l.stage} tone={l.stage === "NEGOTIATION" ? "warning" : l.stage === "WON" ? "success" : "neutral"} />
              </View>
            </View>
          ))
        )}
      </Panel>
    </ScrollView>
  );
}

function SettingsView({
  role,
  user,
  onLogout,
}: {
  role: Role;
  user: AuthUser | null;
  onLogout: () => void;
}) {
  const { mode, colors, setMode } = useTheme();
  const [apiUrl, setApiUrl] = useState(api.getApiBaseUrl());
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleTestConnection() {
    setTesting(true);
    api.setApiBaseUrl(apiUrl);
    const result = await api.checkBackendHealth();
    setTesting(false);
    setTestResult(result.ok ? "Connected successfully" : `Failed: ${result.statusText}`);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <SectionHeader eyebrow="SETTINGS" title="Workspace settings" sub="Appearance, API connection, account, and session controls." />

      <Panel>
        <Text style={[styles.panelKicker, { color: colors.dim }]}>APPEARANCE</Text>
        <View style={styles.settingsRow}>
          <View style={styles.settingsIcon}><Ionicons name="color-palette-outline" size={18} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Theme</Text>
            <Text style={[styles.rowSub, { color: colors.muted }]}>Switch between dark and light themes.</Text>
          </View>
          <Pressable style={[styles.themeChoice, { backgroundColor: colors.surface2, borderColor: colors.border }]} onPress={() => setMode(mode === "dark" ? "light" : "dark")}>
            <Ionicons name={mode === "dark" ? "moon-outline" : "sunny-outline"} size={14} color="#D67A9A" />
            <Text style={styles.themeChoiceText}>{mode === "dark" ? "Dark" : "Light"}</Text>
          </Pressable>
        </View>
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <Text style={[styles.panelKicker, { color: colors.dim }]}>BACKEND API CONNECTION</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>BACKEND BASE URL</Text>
          <TextInput
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="http://10.0.2.2:8000"
            placeholderTextColor="#625861"
            style={styles.formInput}
            autoCapitalize="none"
          />
        </View>
        <Pressable style={styles.compactAction} onPress={handleTestConnection} disabled={testing}>
          {testing ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="flash-outline" size={14} color="#FFF" />}
          <Text style={styles.compactActionText}>Test Connection</Text>
        </Pressable>
        {testResult && (
          <Text style={[styles.testResultText, { color: testResult.includes("success") ? "#72C79A" : "#E37D93" }]}>
            {testResult}
          </Text>
        )}
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <Text style={[styles.panelKicker, { color: colors.dim }]}>USER ACCOUNT</Text>
        <ListRow icon="person-circle-outline" title={user?.full_name || "Field User"} sub={`${user?.email || "user@fieldvoice.ai"} · ${roleLabel(role)}`} />
        <ListRow icon="business-outline" title="FieldVoice AI Corp" sub="Organization ID verified" />
      </Panel>

      <Pressable style={styles.dangerWideButton} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={16} color="#FFF" />
        <Text style={styles.primaryButtonText}>Sign Out / Return to Login</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// LOGIN SCREEN
// ---------------------------------------------------------------------------

function LoginScreen({
  onLoginSuccess,
}: {
  onLoginSuccess: (user: AuthUser, token: string) => void;
}) {
  const { colors, mode } = useTheme();
  const [email, setEmail] = useState("piyush.login@fieldvoice.demo");
  const [password, setPassword] = useState("fieldvoice");
  const [apiUrl, setApiUrl] = useState(api.getApiBaseUrl());
  const [showConfig, setShowConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleLogin() {
    setErrorMsg(null);
    setLoading(true);
    api.setApiBaseUrl(apiUrl);

    try {
      const res = await api.login(email.trim(), password);
      const appRole = mapBackendRoleToAppRole(res.user.role);
      const authUser: AuthUser = {
        id: res.user.id,
        organization_id: res.user.organization_id,
        full_name: res.user.full_name,
        email: res.user.email,
        role: appRole,
        backendRole: res.user.role,
        phone: res.user.phone,
      };
      onLoginSuccess(authUser, res.access_token);
    } catch (e: any) {
      setErrorMsg(e.message || "Login failed. Check your credentials and server connection.");
    } finally {
      setLoading(false);
    }
  }

  function setQuickDemo(roleKey: Role) {
    if (roleKey === "Salesperson") {
      setEmail("piyush.login@fieldvoice.demo");
      setPassword("fieldvoice");
    } else if (roleKey === "Manager") {
      setEmail("onkar.dixit@fieldvoice.demo");
      setPassword("fieldvoice");
    } else {
      setEmail("executive@fieldvoice.demo");
      setPassword("fieldvoice");
    }
    setErrorMsg(null);
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <ScrollView contentContainerStyle={styles.loginPage} keyboardShouldPersistTaps="handled">
        <View style={styles.loginBrand}>
          <View style={styles.brandMarkLarge}>
            <Ionicons name="mic" size={20} color="#FFF" />
          </View>
          <Text style={styles.brandName}>FIELDVOICE</Text>
          <Text style={styles.brandSub}>AI FIELD INTELLIGENCE</Text>
        </View>

        <View style={styles.loginOrbWrap}>
          <View style={styles.loginOrbRingOne} />
          <View style={styles.loginOrbRingTwo} />
          <View style={styles.loginOrb}>
            <Ionicons name="sparkles" size={28} color="#E68FA9" />
          </View>
        </View>

        <Text style={styles.loginEyebrow}>ENTERPRISE FIELD SALES</Text>
        <Text style={styles.loginTitle}>The field,{"\n"}without the reporting gap.</Text>
        <Text style={styles.loginCopy}>Voice capture → AI intelligence → structured report → management action.</Text>

        <Panel style={styles.loginCard}>
          <Text style={styles.panelKicker}>AUTHENTICATION</Text>

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#E37D93" />
              <Text style={styles.errorBoxText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={styles.formField}>
            <Text style={styles.formLabel}>EMAIL ADDRESS</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.formInput}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="user@fieldvoice.demo"
              placeholderTextColor="#665D65"
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={styles.formInput}
              placeholder="••••••••"
              placeholderTextColor="#665D65"
            />
          </View>

          <Text style={styles.formLabel}>QUICK DEMO ROLES</Text>
          <View style={styles.roleSegment}>
            <Pressable style={styles.roleSegmentItem} onPress={() => setQuickDemo("Salesperson")}>
              <Text style={styles.roleSegmentText}>Field Rep</Text>
            </Pressable>
            <Pressable style={styles.roleSegmentItem} onPress={() => setQuickDemo("Manager")}>
              <Text style={styles.roleSegmentText}>Manager</Text>
            </Pressable>
            <Pressable style={styles.roleSegmentItem} onPress={() => setQuickDemo("Executive")}>
              <Text style={styles.roleSegmentText}>Executive</Text>
            </Pressable>
          </View>

          <Pressable style={styles.primaryWideButton} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Sign In with FieldVoice</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </>
            )}
          </Pressable>

          <Pressable style={styles.configToggle} onPress={() => setShowConfig(!showConfig)}>
            <Ionicons name="options-outline" size={14} color="#8D7B85" />
            <Text style={styles.configToggleText}>{showConfig ? "Hide API Server settings" : "Configure Backend URL"}</Text>
          </Pressable>

          {showConfig && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.formLabel}>API SERVER URL</Text>
              <TextInput
                value={apiUrl}
                onChangeText={setApiUrl}
                style={[styles.formInput, { fontSize: 8 }]}
                autoCapitalize="none"
              />
            </View>
          )}
        </Panel>

        <View style={styles.loginFeatureRow}>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="mic-outline" size={16} color="#D27596" />
            <Text style={styles.loginFeatureText}>Voice first</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="sparkles-outline" size={16} color="#D27596" />
            <Text style={styles.loginFeatureText}>AI insights</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="people-outline" size={16} color="#D27596" />
            <Text style={styles.loginFeatureText}>Team control</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// MAIN APPLICATION ROOT
// ---------------------------------------------------------------------------

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<ThemeMode>("dark");

  const colors = mode === "dark" ? DARK_COLORS : LIGHT_COLORS;
  styles = getThemedStyles(mode);

  return (
    <ThemeContext.Provider value={{ mode, colors, setMode }}>
      {authUser && token ? (
        <MobileAppShell
          user={authUser}
          token={token}
          onLogout={() => {
            setAuthUser(null);
            setToken(null);
          }}
        />
      ) : (
        <LoginScreen
          onLoginSuccess={(user, receivedToken) => {
            setAuthUser(user);
            setToken(receivedToken);
          }}
        />
      )}
    </ThemeContext.Provider>
  );
}

function MobileAppShell({
  user,
  token,
  onLogout,
}: {
  user: AuthUser;
  token: string;
  onLogout: () => void;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [view, setView] = useState<ViewKey>("home");
  const [drawer, setDrawer] = useState(false);
  const [apiConnected, setApiConnected] = useState(true);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Live state with seed fallbacks
  const [customers, setCustomers] = useState<Customer[]>(SEED_CUSTOMERS);
  const [visits, setVisits] = useState<Visit[]>(SEED_VISITS);
  const [reports, setReports] = useState<Report[]>(SEED_REPORTS);
  const [tasks, setTasks] = useState<Task[]>(SEED_TASKS);
  const [alerts, setAlerts] = useState<AlertItem[]>(SEED_ALERTS);
  const [leads, setLeads] = useState<Lead[]>(SEED_LEADS);

  // Active selections
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [selectedRep, setSelectedRep] = useState<any>(null);
  const [draft, setDraft] = useState<Report>(SEED_REPORTS[0]);

  // Load live data from backend
  useEffect(() => {
    async function loadData() {
      const health = await api.checkBackendHealth();
      setApiConnected(health.ok);

      if (health.ok) {
        try {
          const custRes = await api.getCustomers(token);
          if (custRes.customers && Array.isArray(custRes.customers)) {
            setCustomers(custRes.customers.map((c: any) => ({
              id: c.id,
              name: c.name,
              contact: c.contact_person || "Contact Pending",
              city: c.city || "Pune",
              state: c.state || "Maharashtra",
              industry: c.industry || "General",
              email: c.email || "info@example.com",
              phone: c.phone || "—",
              status: c.status || "ACTIVE",
              region: c.city || "Pune",
              assignedTo: c.assigned_to_name || "Piyush Kadam",
              notes: c.notes,
            })));
          }

          const visitRes = await api.getVisits(token);
          if (visitRes.visits && Array.isArray(visitRes.visits)) {
            setVisits(visitRes.visits.map((v: any) => ({
              id: v.id,
              customerId: v.customer_id,
              customerName: v.customer_name || "Customer",
              userId: v.user_id,
              userName: v.user_name || "Representative",
              region: v.region_name || "Pune",
              date: v.visit_date ? v.visit_date.slice(0, 10) : "Today",
              time: "11:00 AM",
              status: v.status || "IN_PROGRESS",
              approval: v.approval_status || "NOT_REQUIRED",
              sentiment: "Positive",
              opportunity: "HIGH",
              risk: "LOW",
              visitType: v.visit_type || "CUSTOMER_VISIT",
              summary: v.notes || "Customer visit completed successfully.",
            })));
          }

          const repRes = await api.getReports(token);
          if (repRes.reports && Array.isArray(repRes.reports)) {
            setReports(repRes.reports.map((r: any) => ({
              id: r.id,
              visitId: r.visit_id,
              customerName: r.customer_name || "Customer",
              createdBy: r.created_by_name || "Piyush Kadam",
              managerName: r.manager_name || "FieldVoice Demo Manager",
              region: r.region_name || "Pune",
              status: r.status || "SUBMITTED",
              title: r.title || "Field Visit Report",
              transcript: r.ai_draft || "Original recording transcription.",
              summary: r.final_report || r.ai_draft || "Meeting completed.",
              insights: ["Strong purchase intent", "Commercial negotiation requested"],
              actions: ["Send revised quotation", "Follow up tomorrow"],
              sentiment: "Positive",
              opportunity: "HIGH",
              risk: "MEDIUM",
              createdAt: r.created_at ? r.created_at.slice(0, 10) : "Today",
              rejectionReason: r.rejection_reason,
            })));
          }

          const actRes = await api.getActionItems(token);
          if (actRes.action_items && Array.isArray(actRes.action_items)) {
            setTasks(actRes.action_items.map((a: any) => ({
              id: a.id,
              title: a.title,
              description: a.description || "Follow-up action item.",
              customer: a.customer_name || "Customer",
              assignedTo: a.assigned_user_name || "Piyush Kadam",
              priority: a.priority || "MEDIUM",
              status: a.status || "PENDING",
              due: a.due_date || "Tomorrow",
            })));
          }

          const alertRes = await api.getAlerts(token);
          if (alertRes.alerts && Array.isArray(alertRes.alerts)) {
            setAlerts(alertRes.alerts.map((al: any) => ({
              id: al.id,
              title: al.title,
              message: al.message,
              customer: al.customer_name || "Customer",
              region: al.region_name || "Pune",
              manager: al.manager_name || "Manager",
              rep: al.rep_name || "Representative",
              severity: al.severity || "MEDIUM",
              status: al.status || "OPEN",
            })));
          }

          const leadRes = await api.getLeads(token);
          if (leadRes.leads && Array.isArray(leadRes.leads)) {
            setLeads(leadRes.leads.map((l: any) => ({
              id: l.id,
              title: l.title,
              customer: l.customer_name || "Customer",
              stage: l.stage || "NEW",
              value: Number(l.value || 0),
              probability: Number(l.probability || 50),
            })));
          }
        } catch {
          // Keep offline seeds
        }
      }
    }

    loadData();
  }, [token]);

  // Android hardware back: close overlays first, then return home
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedReport) { setSelectedReport(null); return true; }
      if (drawer) { setDrawer(false); return true; }
      if (view !== "home") { setView("home"); return true; }
      return false;
    });
    return () => sub.remove();
  }, [selectedReport, drawer, view]);

  const go = (next: ViewKey) => {
    setView(next);
    setDrawer(false);
  };

  const startRecord = () => go("record");
  const openVisit = (v: Visit) => {
    setSelectedVisit(v);
    go("visit-detail");
  };
  const openCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCreatingCustomer(false);
    go("customer-detail");
  };
  const openReport = (r: Report) => setSelectedReport(r);

  let content: React.ReactNode = null;
  if (view === "home") {
    content = <DashboardHome role={role} onGo={go} onRecord={startRecord} customers={customers} visits={visits} tasks={tasks} alerts={alerts} />;
  } else if (view === "visits") {
    content = <VisitsView visits={visits} role={role} onOpen={openVisit} />;
  } else if (view === "visit-detail") {
    content = <VisitDetailView visit={selectedVisit || visits[0]} onBack={() => go("visits")} onGo={go} />;
  } else if (view === "record") {
    content = (
      <RecordView
        customer={selectedCustomer || customers[0] || SEED_CUSTOMERS[0]}
        customers={customers}
        onSelectCustomer={setSelectedCustomer}
        onNext={r => {
          setDraft(r);
          setReports(all => [r, ...all]);
          go("report");
        }}
      />
    );
  } else if (view === "report") {
    content = (
      <ReportEditorView
        report={draft}
        onChange={setDraft}
        onSubmit={async () => {
          setDraft({ ...draft, status: "SUBMITTED" });
          setReports(all => all.map(r => r.id === draft.id ? { ...r, status: "SUBMITTED" } : r));
          try {
            await api.submitReport(token, draft.id);
          } catch {
            // Keep local state
          }
          Alert.alert("Report Submitted", "Field visit report successfully submitted for manager approval.");
          go("reports");
        }}
        onEmail={() => go("email")}
        onRecordAgain={startRecord}
      />
    );
  } else if (view === "email") {
    content = <EmailView report={draft} onBack={() => go("report")} />;
  } else if (view === "reports") {
    content = <ReportsView reports={reports} onOpen={openReport} />;
  } else if (view === "customers") {
    content = <CustomersView customers={customers} onOpen={openCustomer} onCreate={() => { setCreatingCustomer(true); setSelectedCustomer(null); go("customer-detail"); }} />;
  } else if (view === "customer-detail") {
    content = creatingCustomer ? (
      <CreateCustomerView
        token={token}
        onClose={() => go("customers")}
        onCreated={c => {
          setCustomers(all => [c, ...all]);
          setSelectedCustomer(c);
          setCreatingCustomer(false);
          go("customer-detail");
        }}
      />
    ) : (
      <CustomerDetailView
        customer={selectedCustomer}
        onBack={() => go("customers")}
        onRecord={startRecord}
        visits={visits}
        tasks={tasks}
      />
    );
  } else if (view === "tasks") {
    content = <TasksView tasks={tasks} setTasks={setTasks} role={role} token={token} />;
  } else if (view === "alerts") {
    content = <AlertsView alerts={alerts} setAlerts={setAlerts} role={role} token={token} />;
  } else if (view === "history") {
    content = <HistoryView visits={visits} reports={reports} tasks={tasks} alerts={alerts} onGo={go} />;
  } else if (view === "insights") {
    content = <InsightsView role={role} onGo={go} />;
  } else if (view === "team") {
    content = <TeamView role={role} onOpenRep={r => { setSelectedRep(r); go("rep-activity"); }} onGo={go} />;
  } else if (view === "rep-activity") {
    content = <RepActivityView rep={selectedRep} onBack={() => go("team")} onGo={go} />;
  } else if (view === "organization") {
    content = <OrganizationView onOpenRep={r => { setSelectedRep(r); go("rep-activity"); }} />;
  } else if (view === "map") {
    content = <TerritoryView role={role} />;
  } else if (view === "leads") {
    content = <LeadsView leads={leads} />;
  } else if (view === "settings") {
    content = <SettingsView role={role} user={user} onLogout={onLogout} />;
  }

  const bottom: [ViewKey, string, IconName][] = [
    ["home", "Home", "grid-outline"],
    ["visits", "Visits", "map-outline"],
    ["record", "Record", "mic-outline"],
    ["insights", "AI", "sparkles-outline"],
    ["team", "Menu", "menu-outline"],
  ];
  const { colors, mode } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppHeader role={role} view={view} onMenu={() => setDrawer(true)} onGo={go} apiConnected={apiConnected} />
        <View style={{ flex: 1, width: "100%", maxWidth: 860, alignSelf: "center" }}>{content}</View>
        <View style={[styles.bottomNav, { backgroundColor: colors.surface, borderTopColor: colors.border }, isLandscape && { height: 56, paddingBottom: 0 }]}>
          {bottom.map(([key, label, icon]) => (
            <Pressable key={key} style={[styles.bottomNavItem, isLandscape && { flexDirection: "row", gap: 6 }]} onPress={() => (key === "team" ? setDrawer(true) : go(key))}>
              <Ionicons name={icon} size={20} color={view === key ? colors.accent : colors.dim} />
              <Text style={[styles.bottomNavText, view === key && styles.bottomNavTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Drawer visible={drawer} role={role} view={view} onGo={go} onClose={() => setDrawer(false)} onRole={r => { setRole(r); setView("home"); }} user={user}
          alertCount={alerts.filter(a => a.status === "OPEN" || a.status === "ACKNOWLEDGED").length}
          taskCount={tasks.filter(t => t.status === "PENDING" || t.status === "IN_PROGRESS").length} />
      </View>
      {selectedReport ? (
        <ReportSheet
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onStatus={r => {
            setSelectedReport(r);
            setReports(all => all.map(x => x.id === r.id ? r : x));
            Alert.alert("Report Status Updated", `Report marked as ${r.status}`);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// STYLESHEET
// ---------------------------------------------------------------------------

const darkStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B090C", paddingTop: Platform.OS === "android" ? StatusBar.currentHeight || 0 : 0 },
  appHeader: { height: 68, backgroundColor: "#100D11", borderBottomWidth: 1, borderBottomColor: "#252026", flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  headerTitle: { color: "#EDE2E9", fontSize: 13, fontWeight: "900" },
  headerSub: { color: "#6F6570", fontSize: 8, letterSpacing: 0.8, fontWeight: "800" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  notificationDot: { position: "absolute", right: 6, top: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: "#E05C76" },
  iconButton: { width: 37, height: 37, borderRadius: 11, borderWidth: 1, borderColor: "#342B34", backgroundColor: "#171217", alignItems: "center", justifyContent: "center" },
  bottomNav: { height: 73, backgroundColor: "#100D11", borderTopWidth: 1, borderTopColor: "#282129", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: 4 },
  bottomNavItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomNavText: { color: "#6F6570", fontSize: 7, fontWeight: "800" },
  bottomNavTextActive: { color: "#D77598" },
  drawerBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.66)" },
  drawer: { position: "absolute", left: 0, top: 0, bottom: 0, width: "88%", maxWidth: 370, backgroundColor: "#100D11", borderRightWidth: 1, borderRightColor: "#342B34", paddingTop: Platform.OS === "android" ? 18 : 10, paddingHorizontal: 14, zIndex: 60, elevation: 15 },
  drawerBrand: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, marginBottom: 12 },
  drawerRoleCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#171217", borderWidth: 1, borderColor: "#2C252E", borderRadius: 13, padding: 11, marginBottom: 10 },
  drawerAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#2B1722", borderWidth: 1, borderColor: "#503044", alignItems: "center", justifyContent: "center" },
  drawerAvatarText: { color: "#E0A2B9", fontSize: 11, fontWeight: "900" },
  drawerRoleTitle: { color: "#E4D8E0", fontSize: 11, fontWeight: "900" },
  drawerRoleSub: { color: "#766B75", fontSize: 8, marginTop: 3, letterSpacing: 1.1 },
  drawerKicker: { color: "#675E66", fontSize: 7, fontWeight: "900", letterSpacing: 1.2, marginBottom: 6 },
  roleSegment: { flexDirection: "row", borderWidth: 1, borderColor: "#332A31", backgroundColor: "#110E12", borderRadius: 11, padding: 3, marginBottom: 9 },
  roleSegmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  roleSegmentActive: { backgroundColor: "#2B1722" },
  roleSegmentText: { color: "#6E646D", fontSize: 8, fontWeight: "800" },
  roleSegmentTextActive: { color: "#E2A1B8" },
  drawerItem: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 11, paddingVertical: 11, borderRadius: 10, marginVertical: 2 },
  drawerItemActive: { backgroundColor: "#21151D", borderLeftWidth: 2, borderLeftColor: "#B83B68" },
  drawerItemText: { flex: 1, color: "#8A808A", fontSize: 10, fontWeight: "800" },
  drawerItemTextActive: { color: "#F1E7EC" },
  navCount: { color: "#E38AA5", backgroundColor: "#2B1722", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, fontSize: 7, fontWeight: "900" },
  drawerFooter: { borderTopWidth: 1, borderTopColor: "#282129", paddingVertical: 13 },
  drawerFooterLabel: { color: "#655C64", fontSize: 7, letterSpacing: 1.0 },
  drawerFooterValue: { color: "#BAADB5", fontSize: 8, marginTop: 3 },
  brandMark: { width: 35, height: 35, borderRadius: 11, backgroundColor: "#8E2D50", alignItems: "center", justifyContent: "center" },
  brandMarkLarge: { width: 45, height: 45, borderRadius: 14, backgroundColor: "#8E2D50", alignItems: "center", justifyContent: "center" },
  brandName: { color: "#F1E7EC", fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  brandSub: { color: "#745F69", fontSize: 7, letterSpacing: 1.1, marginTop: 2 },
  page: { padding: 17, paddingBottom: 105, width: "100%" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", marginBottom: 15, gap: 8, minWidth: 0 },
  eyebrow: { color: "#B55378", fontSize: 8, fontWeight: "900", letterSpacing: 1.7, marginBottom: 5 },
  h1: { color: "#EEE3EA", fontSize: 24, fontWeight: "900", letterSpacing: -0.6, lineHeight: 29 },
  sectionSub: { color: "#827781", fontSize: 10, lineHeight: 15, marginTop: 6 },
  compactAction: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#8B2A4D", borderRadius: 9 },
  compactActionText: { color: "#FFF", fontSize: 8, fontWeight: "900" },
  panel: { backgroundColor: "#141015", borderWidth: 1, borderColor: "#282129", borderRadius: 14, padding: 14 },
  panelKicker: { color: "#8D7B85", fontSize: 8, fontWeight: "900", letterSpacing: 1.3, marginBottom: 8, marginTop: 6 },
  bodyText: { color: "#9B8D96", fontSize: 10, lineHeight: 16 },
  divider: { height: 1, backgroundColor: "#272028", marginVertical: 13 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#272129" },
  rowIcon: { width: 31, height: 31, borderRadius: 9, backgroundColor: "#1F161D", alignItems: "center", justifyContent: "center" },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { color: "#E8DDE4", fontSize: 10, fontWeight: "800" },
  rowSub: { color: "#746A73", fontSize: 8, lineHeight: 13, marginTop: 3 },
  scoreText: { color: "#DCA3B8", fontSize: 13, fontWeight: "900" },
  metaText: { color: "#746A73", fontSize: 7, fontWeight: "700" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 11, width: "100%", alignSelf: "stretch" },
  metricWrap: { flexGrow: 1, flexShrink: 1, flexBasis: "45%", minWidth: 140 },
  metricCard: { width: "100%", backgroundColor: "#141015", borderWidth: 1, borderColor: "#282129", borderRadius: 13, padding: 12, minHeight: 95 },
  metricTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  metricIcon: { width: 29, height: 29, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  metricLabel: { color: "#796F78", fontSize: 8, flex: 1, textAlign: "right" },
  metricValue: { color: "#F0E7EC", fontSize: 23, fontWeight: "900", marginTop: 10 },
  metricSub: { color: "#615961", fontSize: 7, marginTop: 2 },
  badge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 },
  badgeText: { fontSize: 7, fontWeight: "900", letterSpacing: 0.35 },
  filterChip: { borderWidth: 1, borderColor: "#342B34", backgroundColor: "#171217", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, marginRight: 7 },
  filterChipActive: { backgroundColor: "#2B1722", borderColor: "#774056" },
  filterChipText: { color: "#7B7079", fontSize: 8, fontWeight: "800" },
  filterChipTextActive: { color: "#E6B0C2" },
  horizontalFilters: { marginBottom: 12, paddingBottom: 1, flexGrow: 0 },
  selectPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 9, borderWidth: 1, borderColor: "#342B34", backgroundColor: "#171217", borderRadius: 9 },
  selectLabel: { color: "#6F646D", fontSize: 7, fontWeight: "800", textTransform: "uppercase" },
  selectValue: { color: "#C7B9C2", fontSize: 8, fontWeight: "800", maxWidth: 112 },
  heroPanel: { marginBottom: 7, backgroundColor: "#171017", overflow: "hidden" },
  heroTitle: { color: "#F1E6EB", fontSize: 23, lineHeight: 26, fontWeight: "900", letterSpacing: -0.6, marginTop: 11 },
  heroCopy: { color: "#857983", fontSize: 9, lineHeight: 15, marginTop: 7 },
  pillRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  execStats: { flexDirection: "row", gap: 22, marginTop: 18, paddingTop: 13, borderTopWidth: 1, borderTopColor: "#282129" },
  execNumber: { color: "#E1A4B9", fontSize: 20, fontWeight: "900" },
  execLabel: { color: "#716771", fontSize: 7, marginTop: 2 },
  managerHero: { backgroundColor: "#191016", marginBottom: 5 },
  managerHeroTop: { flexDirection: "row", justifyContent: "space-between" },
  recordHero: { backgroundColor: "#1C0F16", borderWidth: 1, borderColor: "#513044", borderRadius: 15, padding: 15, flexDirection: "row", alignItems: "center", marginBottom: 8 },
  recordHeroTitle: { color: "#F1E6EB", fontSize: 21, fontWeight: "900", lineHeight: 23, marginTop: 11 },
  buttonInline: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#9E2F55", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, alignSelf: "flex-start", marginTop: 11 },
  buttonInlineText: { color: "#FFF", fontSize: 8, fontWeight: "900" },
  orbArt: { width: 82, height: 110, alignItems: "center", justifyContent: "center" },
  orbRingLarge: { position: "absolute", width: 82, height: 82, borderRadius: 41, borderWidth: 1, borderColor: "#602C45", opacity: 0.45 },
  orbRingMedium: { position: "absolute", width: 61, height: 61, borderRadius: 31, borderWidth: 1, borderColor: "#81405B", opacity: 0.55 },
  orbCenter: { width: 53, height: 53, borderRadius: 27, backgroundColor: "#772744", alignItems: "center", justifyContent: "center", shadowColor: "#B83B68", shadowOpacity: 0.3, shadowRadius: 18 },
  twoCardRow: { flexDirection: "row", gap: 9, width: "100%" },
  signalCard: { flex: 1, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#3A2B33", backgroundColor: "#191217" },
  signalGreen: { backgroundColor: "#102018", borderColor: "#234533" },
  signalRed: { backgroundColor: "#24131A", borderColor: "#512637" },
  signalNumber: { color: "#F0E7EC", fontSize: 24, fontWeight: "900", marginTop: 10 },
  signalLabel: { color: "#8B7E87", fontSize: 9, marginTop: 3 },
  visitCard: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#272129" },
  visitCardTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  visitMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  visitSignalRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" },
  avatarSmall: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#2A1923", borderWidth: 1, borderColor: "#533048", alignItems: "center", justifyContent: "center" },
  avatarSmallText: { color: "#DDA4B9", fontSize: 9, fontWeight: "900" },
  reportListCard: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#272129" },
  reportPreview: { color: "#8C7E88", fontSize: 9, lineHeight: 14, marginTop: 9 },
  reportHeaderRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  customerName: { color: "#E8DDE4", fontSize: 11, fontWeight: "900" },
  customerSelectCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: "#171217", borderWidth: 1, borderColor: "#3B2A34", borderRadius: 13, marginBottom: 11 },
  customerSelectLabel: { color: "#7C6F78", fontSize: 7, fontWeight: "900", letterSpacing: 1.2 },
  customerSelectName: { color: "#E9DEE5", fontSize: 12, fontWeight: "900", marginTop: 3 },
  customerSelectMeta: { color: "#746A73", fontSize: 8, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#2C1823", borderWidth: 1, borderColor: "#573148", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#E5A9BE", fontSize: 11, fontWeight: "900" },
  recordStage: { minHeight: 420, alignItems: "center", justifyContent: "center" },
  recordTimer: { color: "#F5EAF0", fontSize: 49, fontWeight: "900", letterSpacing: -2, marginTop: 10 },
  recordInstruction: { color: "#83767F", fontSize: 9, lineHeight: 15, textAlign: "center", maxWidth: 315, marginTop: 8 },
  waveZone: { height: 66, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, marginTop: 17 },
  waveBar: { width: 4, backgroundColor: "#9B3157", borderRadius: 4, opacity: 0.56 },
  micOrb: { width: 82, height: 82, borderRadius: 41, backgroundColor: "#762640", borderWidth: 1, borderColor: "#B83B68", alignItems: "center", justifyContent: "center", marginTop: 18, shadowColor: "#B83B68", shadowOpacity: 0.25, shadowRadius: 25 },
  micOrbLive: { backgroundColor: "#9B3157" },
  stopSquare: { width: 23, height: 23, borderRadius: 4, backgroundColor: "#FFF" },
  micHint: { color: "#8C5C6E", fontSize: 8, marginTop: 9 },
  workflowRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#272129" },
  workflowNumber: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#2A1722", alignItems: "center", justifyContent: "center" },
  workflowNumberText: { color: "#D07898", fontSize: 9, fontWeight: "900" },
  processingScreen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: "#0B090C" },
  aiOrbit: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#251620", borderWidth: 1, borderColor: "#6F2B48", alignItems: "center", justifyContent: "center", shadowColor: "#B83B68", shadowOpacity: 0.24, shadowRadius: 30 },
  processingTitle: { color: "#EFE4EA", fontSize: 17, fontWeight: "900", marginTop: 18, textAlign: "center" },
  processingCopy: { color: "#7E737C", fontSize: 9, lineHeight: 15, textAlign: "center", maxWidth: 300, marginTop: 7 },
  progressTrack: { width: "88%", height: 5, borderRadius: 5, backgroundColor: "#2C232A", overflow: "hidden", marginTop: 24 },
  progressFill: { width: "78%", height: "100%", backgroundColor: "#B83B68" },
  processingSteps: { flexDirection: "row", gap: 6, marginTop: 15, flexWrap: "wrap", justifyContent: "center" },
  processingStep: { borderWidth: 1, borderColor: "#2B252C", backgroundColor: "#151116", paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  processingStepActive: { borderColor: "#5B3044", backgroundColor: "#21151D" },
  processingStepText: { color: "#6C616A", fontSize: 7, fontWeight: "700" },
  processingStepActiveText: { color: "#CD7E9A" },
  voiceStrip: { flexDirection: "row", alignItems: "center", gap: 9, padding: 10, backgroundColor: "#120D11", borderWidth: 1, borderColor: "#2C252C", borderRadius: 11, marginBottom: 8 },
  playButton: { width: 31, height: 31, borderRadius: 16, backgroundColor: "#2B1722", alignItems: "center", justifyContent: "center" },
  textBlock: { padding: 11, backgroundColor: "#120E12", borderWidth: 1, borderColor: "#29232A", borderRadius: 11, marginBottom: 10 },
  editHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  inlineEditButton: { flexDirection: "row", alignItems: "center", gap: 5 },
  inlineEditText: { color: "#D57C9B", fontSize: 8, fontWeight: "900" },
  editInput: { minHeight: 100, color: "#E8DDE4", backgroundColor: "#100D11", borderWidth: 1, borderColor: "#43313A", borderRadius: 11, padding: 10, fontSize: 10, textAlignVertical: "top" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  tag: { backgroundColor: "#231720", borderWidth: 1, borderColor: "#49303D", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  tagText: { color: "#CE90A7", fontSize: 7, fontWeight: "800" },
  actionList: { borderWidth: 1, borderColor: "#2C252C", borderRadius: 11, paddingHorizontal: 10, backgroundColor: "#120E12" },
  actionLine: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#262028" },
  actionText: { color: "#B1A3AC", fontSize: 9, flex: 1 },
  aiSignalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%" },
  aiSignalCell: { flexGrow: 1, flexBasis: "45%", minWidth: 120, borderWidth: 1, borderColor: "#2A242B", backgroundColor: "#120E12", borderRadius: 10, padding: 10, minHeight: 72 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, width: "100%" },
  detailCell: { flexGrow: 1, flexBasis: "45%", minWidth: 120, paddingVertical: 8 },
  detailLabel: { color: "#6F646D", fontSize: 7, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  detailValue: { color: "#C7BAC1", fontSize: 9, fontWeight: "800" },
  aiBig: { color: "#E6A7BA", fontSize: 20, fontWeight: "900" },
  insightCallout: { flexDirection: "row", gap: 9, borderWidth: 1, borderColor: "#432837", backgroundColor: "#1C1118", borderRadius: 12, padding: 12, marginTop: 9 },
  calloutTitle: { color: "#E9DEE4", fontSize: 10, fontWeight: "900", marginTop: 2 },
  calloutText: { color: "#81737C", fontSize: 8, lineHeight: 13, marginTop: 3 },
  buttonStack: { gap: 8, marginTop: 12 },
  buttonRow: { flexDirection: "row", gap: 8 },
  secondaryButton: { minHeight: 43, borderWidth: 1, borderColor: "#392F36", backgroundColor: "#171217", borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 11 },
  secondaryButtonHalf: { flex: 1, minHeight: 43, borderWidth: 1, borderColor: "#392F36", backgroundColor: "#171217", borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  primaryButtonHalf: { flex: 1, minHeight: 43, borderWidth: 1, borderColor: "#B83B68", backgroundColor: "#8E2D50", borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 8 },
  secondaryButtonText: { color: "#CDBFC8", fontSize: 8, fontWeight: "900" },
  primaryButtonText: { color: "#FFF", fontSize: 8, fontWeight: "900" },
  sheetLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "flex-end", zIndex: 50 },
  sheetBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.66)" },
  bottomSheet: { backgroundColor: "#141015", borderTopWidth: 1, borderColor: "#3A2D35", borderTopLeftRadius: 21, borderTopRightRadius: 21, padding: 16, paddingBottom: 20, maxHeight: "92%", width: "100%", maxWidth: 720, alignSelf: "center" },
  sheetHandle: { width: 42, height: 4, borderRadius: 3, backgroundColor: "#4A3A44", alignSelf: "center", marginBottom: 11 },
  sheetTitleRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 },
  sheetTitle: { color: "#EFE4EA", fontSize: 17, fontWeight: "900", marginTop: 2 },
  bulletText: { color: "#9B8E96", fontSize: 9, lineHeight: 15, marginBottom: 5 },
  rejectionBox: { marginTop: 12, borderWidth: 1, borderColor: "#5A2B3A", backgroundColor: "#25131B", borderRadius: 10, padding: 10 },
  rejectionTitle: { color: "#E58AA2", fontSize: 8, fontWeight: "900" },
  rejectionText: { color: "#B18B96", fontSize: 9, lineHeight: 14, marginTop: 4 },
  searchField: { flexDirection: "row", alignItems: "center", gap: 8, height: 39, borderWidth: 1, borderColor: "#342B34", backgroundColor: "#171217", borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  searchInput: { flex: 1, color: "#E9DFE6", fontSize: 9 },
  customerCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#272129" },
  formField: { marginTop: 9, marginBottom: 2 },
  formLabel: { color: "#796D77", fontSize: 7, fontWeight: "900", letterSpacing: 1.0, marginBottom: 6 },
  formInput: { minHeight: 40, color: "#E8DDE4", backgroundColor: "#100D11", borderWidth: 1, borderColor: "#2F2930", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 9 },
  emailInput: { minHeight: 180, textAlignVertical: "top", paddingTop: 10 },
  choiceRow: { flexDirection: "row", gap: 7, marginBottom: 7 },
  choiceButton: { flex: 1, minHeight: 39, borderWidth: 1, borderColor: "#342B34", borderRadius: 10, backgroundColor: "#171217", alignItems: "center", justifyContent: "center" },
  choiceButtonActive: { backgroundColor: "#2B1722", borderColor: "#7A4056" },
  choiceText: { color: "#80747D", fontSize: 8, fontWeight: "800" },
  choiceTextActive: { color: "#E3A3B8" },
  scopeNote: { flexDirection: "row", gap: 8, padding: 10, borderWidth: 1, borderColor: "#294334", backgroundColor: "#102018", borderRadius: 10, marginTop: 11 },
  scopeNoteText: { flex: 1, color: "#83B89E", fontSize: 8, lineHeight: 13 },
  mailAvatar: { width: 35, height: 35, borderRadius: 11, backgroundColor: "#2A1824", alignItems: "center", justifyContent: "center" },
  taskCard: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#272129" },
  taskTop: { flexDirection: "row", gap: 8, alignItems: "center" },
  taskDescription: { color: "#8C7E88", fontSize: 8, lineHeight: 13, marginTop: 7 },
  taskFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 9 },
  tapHint: { color: "#776A76", fontSize: 7, marginTop: 7, fontStyle: "italic" },
  alertCard: { flexDirection: "row", gap: 9, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#272129" },
  alertIcon: { width: 31, height: 31, borderRadius: 9, backgroundColor: "#28131B", alignItems: "center", justifyContent: "center" },
  alertTitleRow: { flexDirection: "row", gap: 7, justifyContent: "space-between", alignItems: "center" },
  alertMessage: { color: "#8F808A", fontSize: 8, lineHeight: 13, marginTop: 5 },
  miniBars: { height: 175, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", gap: 7, paddingTop: 15 },
  miniBarItem: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  miniBarValue: { color: "#BFAFB9", fontSize: 7, fontWeight: "800", marginBottom: 5 },
  miniBarTrack: { width: "58%", flex: 1, maxHeight: 115, backgroundColor: "#261F25", borderRadius: 8, justifyContent: "flex-end", overflow: "hidden" },
  miniBarFill: { width: "100%", backgroundColor: "#A6375D", borderRadius: 8 },
  miniBarLabel: { color: "#70666F", fontSize: 7, marginTop: 6 },
  lineChart: { height: 170, position: "relative", width: "100%", overflow: "hidden" },
  lineGuide: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "#252027" },
  lineColumns: { flex: 1, flexDirection: "row", alignItems: "stretch", justifyContent: "space-between", paddingHorizontal: 3, paddingBottom: 20 },
  lineColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end", position: "relative" },
  lineStem: { width: 8, minHeight: 4, backgroundColor: "#732744", borderRadius: 6, opacity: 0.82 },
  lineDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: "#C9678D", zIndex: 2 },
  lineLabel: { color: "#6A6069", fontSize: 7, position: "absolute", bottom: 0 },
  chartLegend: { flexDirection: "row", justifyContent: "center", gap: 15, marginTop: 9 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#C9678D" },
  legendText: { color: "#7A6F78", fontSize: 7 },
  teamCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#272129" },
  mapCard: { backgroundColor: "#141015", borderWidth: 1, borderColor: "#2B252C", borderRadius: 15, overflow: "hidden" },
  mapHeader: { padding: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mapTitle: { color: "#E8DDE4", fontSize: 11, fontWeight: "900" },
  mapSub: { color: "#6E646D", fontSize: 7, marginTop: 3 },
  mapSurface: { height: 260, backgroundColor: "#161319", position: "relative", overflow: "hidden" },
  mapRoadOne: { position: "absolute", width: "135%", height: 2, backgroundColor: "#312C34", transform: [{ rotate: "24deg" }], left: -30, top: 120 },
  mapRoadTwo: { position: "absolute", width: "140%", height: 2, backgroundColor: "#2A2730", transform: [{ rotate: "-19deg" }], left: -20, top: 180 },
  heatBlobOne: { position: "absolute", width: 145, height: 145, borderRadius: 73, backgroundColor: "rgba(184,59,104,0.16)", left: 10, top: 20 },
  heatBlobTwo: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(222,174,77,0.13)", right: 25, top: 45 },
  heatBlobThree: { position: "absolute", width: 90, height: 90, borderRadius: 45, backgroundColor: "rgba(93,157,232,0.10)", left: "42%", bottom: 15 },
  mapMarker: { position: "absolute", alignItems: "center", transform: [{ translateX: -12 }] },
  mapMarkerDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: "#C75E84", borderWidth: 2, borderColor: "#F7EAF0", shadowColor: "#C75E84", shadowOpacity: 0.35, shadowRadius: 10 },
  mapMarkerRep: { backgroundColor: "#72C79A", borderColor: "#E1FFF0" },
  mapMarkerText: { color: "#AFA3AB", fontSize: 6, backgroundColor: "#161319CC", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, marginTop: 3, maxWidth: 90, textAlign: "center" },
  mapControlGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  mapControl: { flex: 1, minWidth: "46%", flexDirection: "row", alignItems: "center", gap: 7, padding: 10, backgroundColor: "#171217", borderWidth: 1, borderColor: "#312A31", borderRadius: 10 },
  mapControlActive: { backgroundColor: "#21151D", borderColor: "#593247" },
  mapControlText: { color: "#746A73", fontSize: 8, fontWeight: "800" },
  mapControlTextActive: { color: "#D789A2" },
  leadCard: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#272129" },
  leadTop: { flexDirection: "row", gap: 8, alignItems: "center" },
  leadValue: { color: "#DDA6B9", fontSize: 11, fontWeight: "900" },
  leadProgressTrack: { height: 6, backgroundColor: "#282129", borderRadius: 5, overflow: "hidden", marginTop: 9 },
  leadProgressFill: { height: "100%", backgroundColor: "#A3395E" },
  leadBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 7 },
  settingsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#272129" },
  settingsIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: "#21161E", alignItems: "center", justifyContent: "center" },
  themeChoice: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#231821", borderWidth: 1, borderColor: "#523044", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 },
  themeChoiceText: { color: "#D98AA4", fontSize: 7, fontWeight: "900" },
  testResultText: { fontSize: 8, fontWeight: "800", marginTop: 6 },
  primaryWideButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#8E2D50", borderWidth: 1, borderColor: "#B83B68", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 12 },
  dangerWideButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#5A2334", borderWidth: 1, borderColor: "#8A314E", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16 },
  loginPage: { padding: 22, paddingTop: 34, paddingBottom: 45, backgroundColor: "#0B090C", minHeight: "100%" },
  loginBrand: { alignItems: "center" },
  loginOrbWrap: { height: 155, alignItems: "center", justifyContent: "center", marginTop: 12, marginBottom: 6 },
  loginOrbRingOne: { position: "absolute", width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: "#5E2B43", opacity: 0.6 },
  loginOrbRingTwo: { position: "absolute", width: 94, height: 94, borderRadius: 47, borderWidth: 1, borderColor: "#7B3554", opacity: 0.65 },
  loginOrb: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#27131E", borderWidth: 1, borderColor: "#8F3055", alignItems: "center", justifyContent: "center", shadowColor: "#B83B68", shadowOpacity: 0.3, shadowRadius: 30 },
  loginEyebrow: { color: "#AF5678", fontSize: 8, fontWeight: "900", letterSpacing: 1.8, textAlign: "center" },
  loginTitle: { color: "#F1E6EC", fontSize: 31, lineHeight: 34, fontWeight: "900", letterSpacing: -1.3, textAlign: "center", marginTop: 8 },
  loginCopy: { color: "#857881", fontSize: 10, lineHeight: 16, textAlign: "center", marginTop: 8, maxWidth: 330, alignSelf: "center" },
  loginCard: { marginTop: 22 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#29131C", borderWidth: 1, borderColor: "#5C2638", borderRadius: 8, padding: 9, marginBottom: 10 },
  errorBoxText: { color: "#E37D93", fontSize: 8, flex: 1, fontWeight: "700" },
  configToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 12 },
  configToggleText: { color: "#8D7B85", fontSize: 8, fontWeight: "700" },
  loginFeatureRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 22 },
  loginFeatureText: { color: "#665C65", fontSize: 7, textAlign: "center", marginTop: 4 },
  emptyState: { minHeight: 130, alignItems: "center", justifyContent: "center", gap: 7 },
  emptyText: { color: "#645A63", fontSize: 8 },
  backLink: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 9 },
  backLinkText: { color: "#C87595", fontSize: 8, fontWeight: "800" },
});

// Light mode translation map
const LIGHT_STYLE_COLORS: Record<string, string> = {
  "#8E2D50": "#155A8A", "#8B2A4D": "#174F7D", "#9E2F55": "#155A8A",
  "#B83B68": "#1C5D92", "#D77598": "#1C638F", "#D77698": "#1C679A",
  "#D06A90": "#206A9F", "#D07193": "#1D638F", "#D27294": "#1D638F",
  "#D57396": "#1C679A", "#D67A9A": "#1E679A", "#D98AA4": "#2A6F9F",
  "#C87394": "#155A8A", "#C87595": "#155A8A", "#C36B8D": "#1D668F",
  "#0B090C": "#F3F7FB", "#100D11": "#0B2C4A", "#110E12": "#EDF4FA", "#120E12": "#EDF4FA",
  "#141015": "#FFFFFF", "#151116": "#F7FAFD", "#161319": "#EEF4F9", "#171217": "#F1F6FA",
  "#191016": "#EAF1F8", "#1A0C13": "#EAF1F8", "#1C0F16": "#E7F0F8", "#1F161D": "#E7EFF7",
  "#21151D": "#E7F0F8", "#21161E": "#E6EFF7", "#221A20": "#E4EDF5", "#231821": "#E6EFF7",
  "#24131A": "#E7EEF5", "#24131C": "#E6EEF6", "#25151E": "#E4EEF7", "#261F25": "#DCE7F0",
  "#27131E": "#E4EFF8", "#271521": "#E4EEF7", "#28131B": "#E5EDF5", "#281A23": "#E4EDF5",
  "#291925": "#E4EDF7", "#2A1824": "#DFEAF4", "#2A242B": "#C8D5E2", "#2B1722": "#DDEAF5",
  "#2B1924": "#E2ECF5", "#2B252C": "#C9D8E7", "#2C252C": "#CAD8E5", "#2C252E": "#CAD8E6",
  "#2E1A23": "#CFDDE9", "#2F2930": "#C4D2DF", "#312A31": "#C3D1DE", "#32272F": "#C6D4E1",
  "#332A31": "#C2D2E1", "#342B34": "#BCCDDD", "#351322": "#DCE9F4", "#351423": "#DFEAF5",
  "#351525": "#DCE8F3", "#391E2B": "#D8E6F1", "#3A1828": "#D9E7F2", "#422231": "#B4C8DA",
  "#432635": "#B8CDDE", "#493944": "#AABFD1", "#4B3040": "#9AB6CD", "#503044": "#8EACC5",
  "#513044": "#8AA9C3", "#523044": "#89A7C0", "#583044": "#83A3BF", "#593247": "#7E9FBA",
  "#5A3045": "#87A8C1", "#5B3045": "#80A2BC", "#5E2B43": "#91ADC6", "#642039": "#5B7894",
  "#6D2847": "#6D91AE", "#6E2340": "#155A8A", "#70203E": "#123F68", "#732744": "#5D87A6",
  "#745F69": "#52677B", "#756B74": "#56697B", "#766B74": "#596D80", "#7A4056": "#6E93B1",
  "#7B3554": "#779AB8", "#7B7079": "#5C7083", "#7D747D": "#566A7D", "#7D6571": "#51687D",
  "#7F737D": "#607488", "#80747D": "#5E7284", "#827781": "#52687E", "#857983": "#5A6E80",
  "#857881": "#5A6E80", "#897A84": "#5C7184", "#8A808A": "#52667A",
  "#8C7E88": "#586D80", "#8D7B85": "#52697F", "#8F808A": "#5C7083", "#907C86": "#52677B",
  "#938891": "#6B7C8E", "#958892": "#5B7084", "#9A3157": "#1C5F96", "#9B8D96": "#53697D",
  "#9E8C95": "#5A6F82", "#A3395E": "#1C5F96", "#A44A68": "#165B8F", "#A6375D": "#1A5A8B",
  "#AF5678": "#1D638F", "#B55378": "#185D8C", "#BAACB5": "#455B70",
  "#BAADB5": "#4C6074", "#BFAFB9": "#465B70", "#C3B4BE": "#465B70",
  "#C4B5BE": "#52677A", "#C7B9C2": "#3D5368", "#C8B6BF": "#DCEAF5", "#C9678D": "#2A6F9F",
  "#CE7193": "#185B8C", "#D07294": "#1D638F", "#D27596": "#1D638F",
  "#D36B91": "#1C679A", "#D4C7CF": "#25394D",
  "#D66C91": "#1F6A9C", "#D77899": "#236A9A",
  "#D789A2": "#2A6E9E", "#DCA3B8": "#1A5F91", "#DDA6B9": "#1A5F91", "#DD5A74": "#C94056",
  "#E0A2B9": "#245F88", "#E17D93": "#C94056", "#E2A1B8": "#1B5F91", "#E3A3B8": "#1B5F91",
  "#E38AA5": "#215F8D", "#E4D9E0": "#172434", "#E5A7BA": "#1D5E90", "#E8DDE4": "#111827",
  "#E9DDE2": "#111827", "#EDE2E9": "#111827", "#EEE3EA": "#111827", "#F0E7EC": "#111827",
  "#F1E6EB": "#111827", "#F1E7EC": "#111827", "#F1E6EC": "#111827", "#F4EDF2": "#111827",
  "#5F565E": "#5B7083", "#615961": "#65788A", "#645A63": "#64788B", "#655C64": "#5E7184",
  "#665D65": "#5D7183", "#675E66": "#5B6F83", "#6A6069": "#607488", "#6E5B65": "#607488",
  "#6F5B65": "#607488", "#6F646D": "#5B7083", "#6F6570": "#5C7184", "#705D67": "#627689",
  "#70666F": "#607488", "#715C66": "#50667A", "#716771": "#5D7184", "#725E68": "#5E7488",
  "#77616C": "#5A6F82", "#79C49A": "#198754", "#70C89A": "#198754", "#72C79A": "#198754",
  "#74C49A": "#198754", "#76C69B": "#198754", "#78D5A7": "#198754", "#E68FA9": "#2A6F9F",
};

function lightStyleValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lightStyleValue);
  if (typeof value === "string") return LIGHT_STYLE_COLORS[value.toUpperCase()] ?? value;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, lightStyleValue(item)])
  );
}

// Original sizes (7-10px) are unreadable on phones, so scale small text up
// and keep line heights proportional.
function scaleTextStyle(value: any): any {
  const flat: any = StyleSheet.flatten(value) || {};
  const out: any = { ...flat };
  if (typeof flat.fontSize === "number" && flat.fontSize <= 14) {
    const next = Math.max(11, Math.round(flat.fontSize * 1.4));
    if (typeof flat.lineHeight === "number") out.lineHeight = Math.round(flat.lineHeight * (next / flat.fontSize));
    out.fontSize = next;
  }
  return out;
}

let scaledDarkCache: any = null;
let lightStylesCache: any = null;
function getThemedStyles(mode: ThemeMode): any {
  if (!scaledDarkCache) {
    scaledDarkCache = StyleSheet.create(
      Object.fromEntries(Object.entries(darkStyles).map(([k, v]) => [k, scaleTextStyle(v)])) as any
    );
  }
  if (mode === "dark") return scaledDarkCache;
  if (lightStylesCache) return lightStylesCache;
  const source: Record<string, any> = Object.fromEntries(
    Object.entries(scaledDarkCache).map(([key, value]) => [key, lightStyleValue(StyleSheet.flatten(value as any))])
  );
  lightStylesCache = StyleSheet.create(source as any);
  return lightStylesCache;
}

let styles: any = getThemedStyles("dark");