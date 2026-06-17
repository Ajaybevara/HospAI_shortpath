import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui";
import { API_BASE } from "../lib/constants";
import { getHospitalCode } from "../lib/api";
import { downloadExportBlob, filenameFromContentDisposition, shareOrDownloadExport } from "../lib/exportShare";
import type { DashboardAnalytics, DistributionItem, HospitalSummary, Patient, Stats, Alert, User } from "../types";

type Props = {
  stats: Stats;
  recentPatients: Patient[];
  analytics: DashboardAnalytics | null;
  hospitalSummary: HospitalSummary | null;
  analyticsLoading: boolean;
  onNavigate: (page: string) => void;
  alerts: Alert[];
  user: User | null;
  onLogout: () => void;
};

function formatCurrency(amount?: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
}

function formatCurrencyShort(amount?: number) {
  const val = amount || 0;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val}`;
}

const dashboardMonthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const dashboardWeekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

// ── Top KPI cards ────────────────────────────────────────────────────────────
function KpiCard({
  icon,
  label,
  value,
  sub,
  trend,
  iconBg,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: string; up: boolean };
  iconBg: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="hosp-kpi-card hosp-clickable-card" onClick={onClick}>
      <div className="hosp-kpi-icon" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="hosp-kpi-body">
        <p className="hosp-kpi-label">{label}</p>
        <h3 className="hosp-kpi-value">{value}</h3>
        {sub && <span className="hosp-kpi-sub">{sub}</span>}
        {trend && (
          <span className={`hosp-kpi-trend ${trend.up ? "up" : "down"}`}>
            {trend.up ? "▲" : "▼"} {trend.value}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Circular / arc gauge ──────────────────────────────────────────────────────
function CircleGauge({
  pct,
  color,
  label,
  center,
}: {
  pct: number;
  color: string;
  label: string;
  center: string;
}) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="hosp-gauge-wrap">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="#e8f2f8" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="51" textAnchor="middle" fontSize="16" fontWeight="800" fill="#12344c">
          {center}
        </text>
        <text x="55" y="66" textAnchor="middle" fontSize="9" fill="#4b6678">
          {label}
        </text>
      </svg>
    </div>
  );
}

// ── Mini donut (OP queue) ──────────────────────────────────────────────────────
function MiniDonut({
  segments,
  total,
}: {
  segments: { color: string; pct: number; label: string; count: number }[];
  total: number;
}) {
  const r = 50;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="hosp-mini-donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        {segments.map((seg) => {
          const dash = (seg.pct / 100) * circ;
          const gap = circ - dash;
          const rot = (offset / 100) * 360 - 90;
          offset += seg.pct;
          return (
            <circle
              key={seg.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="18"
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(${rot} 70 70)`}
            />
          );
        })}
        <text x="70" y="65" textAnchor="middle" fontSize="22" fontWeight="900" fill="#12344c">
          {total}
        </text>
        <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#4b6678">
          Total
        </text>
      </svg>
    </div>
  );
}


function DashboardAlertGlyph({ icon }: { icon: "emergency" | "rupee" | "stock" | "lab" | "backup" }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const filled = { fill: "currentColor", stroke: "none" };

  const icons: Record<typeof icon, React.ReactNode> = {
    emergency: (
      <>
        <path d="M12 4.5 20 18H4L12 4.5Z" {...stroke} />
        <path d="M12 9.2v4.2" {...stroke} />
        <circle cx="12" cy="16" r="1" {...filled} />
      </>
    ),
    rupee: (
      <>
        <path d="M8 6h8M8 9h8M9 6c3.8 0 5.8 1.2 5.8 3.6S12.8 13.2 9 13.2" {...stroke} />
        <path d="M9 13.2 15.5 19" {...stroke} />
      </>
    ),
    stock: (
      <>
        <path d="M12 5 20 18H4L12 5Z" {...stroke} />
        <path d="M12 9.5v3.8" {...stroke} />
        <circle cx="12" cy="16" r="1" {...filled} />
      </>
    ),
    lab: (
      <>
        <path d="M9 4v4.3l-3.6 6.5A3 3 0 0 0 8 19h8a3 3 0 0 0 2.6-4.2L15 8.3V4" {...stroke} />
        <path d="M8 13h8" {...stroke} />
        <path d="M10 4h4" {...stroke} />
      </>
    ),
    backup: (
      <>
        <circle cx="12" cy="12" r="8" {...stroke} />
        <path d="M12 8v5" {...stroke} />
        <path d="M9.8 10.2 12 8l2.2 2.2" {...stroke} />
        <path d="M8.8 15.5h6.4" {...stroke} />
      </>
    ),
  };

  return (
    <span className={`hosp-alert-icon hosp-alert-icon-${icon}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18">
        {icons[icon]}
      </svg>
    </span>
  );
}

export default function DashboardPage({
  stats,
  recentPatients,
  analytics,
  hospitalSummary,
  analyticsLoading,
  onNavigate,
  alerts,
  user,
  onLogout,
}: Props) {
  const [exportStatus, setExportStatus] = useState<"" | "print" | "export">("");
  const todayIso = toIsoDate(new Date());
  const [dashboardDate, setDashboardDate] = useState(todayIso);
  const [pendingDashboardDate, setPendingDashboardDate] = useState(todayIso);
  const [calendarMonth, setCalendarMonth] = useState(parseIsoDate(todayIso).getMonth());
  const [calendarYear, setCalendarYear] = useState(parseIsoDate(todayIso).getFullYear());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const dashboardProfileRef = useRef<HTMLDivElement | null>(null);
  const currentDateLabel = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(parseIsoDate(dashboardDate));
  const pendingDateLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(parseIsoDate(pendingDashboardDate));
  const calendarYears = useMemo(() => {
    const baseYear = new Date().getFullYear();
    return Array.from({ length: 9 }, (_, index) => baseYear - 4 + index);
  }, []);
  const calendarDays = useMemo(() => {
    const first = new Date(calendarYear, calendarMonth, 1);
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const previousMonthDays = new Date(calendarYear, calendarMonth, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];

    for (let index = first.getDay() - 1; index >= 0; index -= 1) {
      cells.push({ date: new Date(calendarYear, calendarMonth - 1, previousMonthDays - index), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(calendarYear, calendarMonth, day), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - first.getDay() - daysInMonth + 1;
      cells.push({ date: new Date(calendarYear, calendarMonth + 1, nextDay), inMonth: false });
    }
    return cells;
  }, [calendarMonth, calendarYear]);

  useEffect(() => {
    const closeOverlays = (event: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setCalendarOpen(false);
      }
      if (dashboardProfileRef.current && !dashboardProfileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOverlays);
    return () => document.removeEventListener("mousedown", closeOverlays);
  }, []);

  const openDashboardCalendar = () => {
    const selected = parseIsoDate(dashboardDate);
    setPendingDashboardDate(dashboardDate);
    setCalendarMonth(selected.getMonth());
    setCalendarYear(selected.getFullYear());
    setCalendarOpen((open) => !open);
  };

  const selectCalendarDay = (date: Date) => {
    setPendingDashboardDate(toIsoDate(date));
    setCalendarMonth(date.getMonth());
    setCalendarYear(date.getFullYear());
  };

  const confirmDashboardCalendar = () => {
    setDashboardDate(pendingDashboardDate);
    setCalendarOpen(false);
  };

  const go = (page: string) => onNavigate(page);

  const goToAlerts = () => {
    const alertsPanel = document.getElementById("dashboard-alerts-notifications");
    if (alertsPanel) {
      alertsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      alertsPanel.classList.add("hosp-alerts-focus");
      window.setTimeout(() => alertsPanel.classList.remove("hosp-alerts-focus"), 1200);
    }
  };

  const fetchDashboardPdf = async () => {
    const response = await fetch(`${API_BASE}/api/dashboard/export/pdf`, {
      method: "GET",
      headers: { "X-Hospital-Code": getHospitalCode() },
      credentials: "include",
    });

    if (!response.ok) {
      let message = "Unable to generate the dashboard PDF.";
      try {
        const payload = await response.json();
        message = payload.error || payload.message || message;
      } catch {
        // The PDF endpoint normally returns binary data. JSON parsing is only for API errors.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error("The dashboard PDF was generated empty.");
    const filename = filenameFromContentDisposition(response.headers.get("Content-Disposition"), "executive-dashboard.pdf");
    return { blob, filename };
  };

  const handlePrintDashboardPdf = async () => {
    if (exportStatus) return;
    setExportStatus("print");
    let pdfUrl = "";

    try {
      const { blob, filename } = await fetchDashboardPdf();
      pdfUrl = window.URL.createObjectURL(blob);

      const iframe = document.createElement("iframe");
      iframe.title = "HospAI Dashboard Print Preview";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = pdfUrl;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          downloadExportBlob(blob, filename);
          window.alert("Print preview was blocked by this browser. The dashboard PDF was downloaded instead.");
        }
        window.setTimeout(() => {
          iframe.remove();
          if (pdfUrl) window.URL.revokeObjectURL(pdfUrl);
        }, 60000);
      };
      document.body.appendChild(iframe);
    } catch (error) {
      if (pdfUrl) window.URL.revokeObjectURL(pdfUrl);
      window.alert(error instanceof Error ? error.message : "Unable to print the dashboard PDF.");
    } finally {
      setExportStatus("");
    }
  };

  const handleShareDashboardPdf = async () => {
    if (exportStatus) return;
    setExportStatus("export");
    try {
      const { blob, filename } = await fetchDashboardPdf();
      const result = await shareOrDownloadExport({
        blob,
        filename,
        title: "HospAI Executive Dashboard",
        text: "HospAI executive dashboard export",
      });
      if (result === "downloaded") {
        window.alert("Native file sharing is not available for this browser/device. The dashboard PDF was downloaded, and an email fallback was opened where supported.");
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Unable to export/share the dashboard PDF.");
    } finally {
      setExportStatus("");
    }
  };

  // Derived values
  const dailyOp = hospitalSummary?.ip_op_counts?.daily_op || 0;
  const dailyIp = hospitalSummary?.ip_op_counts?.daily_ip || 0;
  const totalRevenue = hospitalSummary?.revenue?.total || 0;
  const dueRevenue = hospitalSummary?.revenue?.due || 0;
  const pharmSales = hospitalSummary?.pharmacy_summary?.monthly_sales || 0;
  const diagIncome = hospitalSummary?.diagnostics_summary?.monthly_income || 0;
  const paymentModes = hospitalSummary?.revenue?.payment_mode_breakdown || [];

  const totalBeds = 250;
  const occupiedBeds = Math.min(stats.active_admissions || 0, totalBeds);
  const availableBeds = totalBeds - occupiedBeds;
  const bedPct = Math.round((occupiedBeds / totalBeds) * 100);

  const opWaiting = Math.round(dailyOp * 0.05);
  const opInConsult = Math.round(dailyOp * 0.06);
  const opCompleted = Math.max(dailyOp - opWaiting - opInConsult, 0);
  const opTotal = opWaiting + opInConsult + opCompleted;

  const queueSegments = [
    { color: "#3b82f6", pct: opTotal ? Math.round((opWaiting / opTotal) * 100) : 0, label: "Waiting", count: opWaiting },
    { color: "#f59e0b", pct: opTotal ? Math.round((opInConsult / opTotal) * 100) : 0, label: "In Consultation", count: opInConsult },
    { color: "#10b981", pct: opTotal ? Math.round((opCompleted / opTotal) * 100) : 0, label: "Completed", count: opCompleted },
  ];
  const queueTotal = opTotal;

  const opdRev = totalRevenue * 0.51;
  const labRev = totalRevenue * 0.29;
  const pharmRev = pharmSales;
  const ipdRev = 0;
  const otherRev = Math.max(0, totalRevenue - opdRev - labRev - pharmRev - ipdRev);

  // Payment mix
  const cashAmt = paymentModes.find((p) => /cash/i.test(p.label))?.count || 0;
  const cardAmt = paymentModes.find((p) => /card/i.test(p.label))?.count || 0;
  const upiAmt = paymentModes.find((p) => /upi/i.test(p.label))?.count || 0;
  const netAmt = paymentModes.find((p) => /net|online/i.test(p.label))?.count || 0;

  const ops = [
    { module: "OP Patients", icon: "🏥", count: dailyOp, completed: opCompleted, pending: opWaiting },
    { module: "IP Patients", icon: "🛏️", count: dailyIp, completed: 0, pending: dailyIp },
    { module: "Lab Tests", icon: "🧪", count: 0, completed: 0, pending: 0 },
    { module: "Lab Reports", icon: "📋", count: stats.documents || 0, completed: 0, pending: stats.documents || 0 },
    { module: "Pharmacy Bills", icon: "💊", count: 0, completed: 0, pending: 0 },
    { module: "Prescriptions", icon: "📝", count: 0, completed: 0, pending: 0 },
    { module: "Follow Ups", icon: "🔄", count: 0, completed: 0, pending: 0 },
  ];

  const operationTarget = (module: string) => {
    if (module.includes("OP")) return "op-queue-management";
    if (module.includes("IP")) return "patients";
    if (module.includes("Lab")) return "lab";
    if (module.includes("Pharmacy")) return "pharmacy";
    if (module.includes("Prescriptions")) return "doctor-prescription";
    if (module.includes("Follow")) return "op-desk";
    return "reports";
  };

  const insights = [
    { icon: "📈", text: `Today's registrations: ${stats.today || 0}.` },
    { icon: "🧪", text: `Lab revenue is ${totalRevenue > 0 ? ((labRev / totalRevenue) * 100).toFixed(1) : "0"}% of total revenue.` },
    { icon: "📋", text: `${stats.documents || 0} lab/document reports are pending verification.` },
    { icon: "🛏️", text: `Bed occupancy is ${bedPct}%.` },
    { icon: "🔄", text: "Follow up appointments scheduled today: 0." },
  ];

  return (
    <section className="hosp-dashboard">
      <div className="hosp-dashboard-top">
        <div>
          <p className="hosp-dashboard-page-title">Executive Dashboard</p>
          <p className="hosp-dashboard-page-subtitle">Overview of your clinic performance</p>
        </div>
        <div className="hosp-dashboard-top-actions">
          <div className="hosp-dashboard-calendar-wrap" ref={calendarRef}>
            <button
              type="button"
              className={`hosp-dashboard-pill hosp-dashboard-date-pill ${calendarOpen ? "active" : ""}`}
              onClick={openDashboardCalendar}
              aria-expanded={calendarOpen}
              aria-haspopup="dialog"
            >
              <span className="hosp-dashboard-action-icon">🗓️</span>
              <span>{currentDateLabel}</span>
            </button>
            {calendarOpen && (
              <div className="hosp-dashboard-calendar-popover" role="dialog" aria-label="Dashboard calendar" onMouseDown={(event) => event.stopPropagation()}>
                <div className="hosp-dashboard-calendar-selected">
                  <strong>{pendingDateLabel}</strong>
                  <span>✎</span>
                </div>
                <div className="hosp-dashboard-calendar-selects">
                  <select
                    value={calendarMonth}
                    onChange={(event) => setCalendarMonth(Number(event.target.value))}
                    aria-label="Calendar month"
                  >
                    {dashboardMonthNames.map((month, index) => (
                      <option key={month} value={index}>{month}</option>
                    ))}
                  </select>
                  <select
                    value={calendarYear}
                    onChange={(event) => setCalendarYear(Number(event.target.value))}
                    aria-label="Calendar year"
                  >
                    {calendarYears.map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <div className="hosp-dashboard-calendar-grid">
                  {dashboardWeekdays.map((day) => <span key={day} className="calendar-weekday">{day}</span>)}
                  {calendarDays.map(({ date, inMonth }) => {
                    const iso = toIsoDate(date);
                    const selected = iso === pendingDashboardDate;
                    return (
                      <button
                        key={iso}
                        type="button"
                        className={`${inMonth ? "" : "muted"} ${selected ? "selected" : ""}`}
                        onClick={() => selectCalendarDay(date)}
                      >
                        {String(date.getDate()).padStart(2, "0")}
                      </button>
                    );
                  })}
                </div>
                <div className="hosp-dashboard-calendar-actions">
                  <button type="button" onClick={() => setCalendarOpen(false)}>Cancel</button>
                  <button type="button" onClick={confirmDashboardCalendar}>Confirm</button>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="hosp-dashboard-icon-btn" onClick={() => void handlePrintDashboardPdf()} disabled={exportStatus !== ""}>
            <span className="hosp-dashboard-action-icon">🖨️</span>
            <span>{exportStatus === "print" ? "Preparing..." : "Print"}</span>
          </button>
          <button type="button" className="hosp-dashboard-icon-btn" onClick={() => void handleShareDashboardPdf()} disabled={exportStatus !== ""}>
            <span className="hosp-dashboard-action-icon">↗️</span>
            <span>{exportStatus === "export" ? "Preparing..." : "Export / Share"}</span>
          </button>
          <button type="button" className="hosp-dashboard-notification-btn" aria-label="Dashboard notifications" onClick={() => go("alerts-notifications")}>
            <span className="hosp-dashboard-alert-icon">🔔</span>
            <span className="hosp-dashboard-badge">{alerts.filter(a => !a.read).length}</span>
          </button>
          <div className="hosp-dashboard-profile-wrap" ref={dashboardProfileRef}>
            <button type="button" className="hosp-dashboard-user" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-haspopup="menu">
              <span className="hosp-dashboard-avatar">{(user?.full_name || user?.username || "U").slice(0, 2).toUpperCase()}</span>
              <div>
                <p className="hosp-dashboard-user-name">{user?.full_name || user?.username || "User"}</p>
                <p className="hosp-dashboard-user-role">{user?.user_type === "admin" || user?.role === "admin" ? "Administrator" : "Employee"}</p>
              </div>
              <span className="hosp-dashboard-user-caret">⌄</span>
            </button>
            {profileOpen && (
              <div className="hosp-dashboard-profile-menu" role="menu">
                <button type="button" disabled>
                  {user?.full_name || user?.username || "Signed in user"}
                </button>
                <button type="button" className="danger" onClick={onLogout}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* KPI Row */}
      <div className="hosp-kpi-row">
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          label="Today's Registrations"
          value={stats.today || 0}
          iconBg="linear-gradient(135deg,#6366f1,#8b5cf6)"
          onClick={() => go("add")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          label="OP Queue Waiting"
          value={opWaiting}
          iconBg="linear-gradient(135deg,#06b6d4,#0891b2)"
          onClick={() => go("op-queue-management")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>}
          label="Today's Revenue"
          value={formatCurrencyShort(totalRevenue)}
          iconBg="linear-gradient(135deg,#f59e0b,#d97706)"
          onClick={() => go("billing-invoices")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
          label="Bed Occupancy"
          value={`${bedPct}%`}
          sub={`${occupiedBeds} / ${totalBeds} Beds`}
          iconBg="linear-gradient(135deg,#f97316,#ea580c)"
          onClick={() => go("patients")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>}
          label="Pending Lab Reports"
          value={stats.documents || 0}
          iconBg="linear-gradient(135deg,#3b82f6,#2563eb)"
          onClick={() => go("lab")}
        />
        <KpiCard
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-8 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>}
          label="Pharmacy Pending Bills"
          value={0}
          iconBg="linear-gradient(135deg,#ec4899,#db2777)"
          onClick={() => go("pharmacy")}
        />
      </div>

      {/* Row 2: Quick Actions | Today's Operations | Alerts */}
      <div className="hosp-row-3col">
        {/* Quick Actions */}
        <Card className="panel hosp-section-card">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hosp-quick-actions">
              {[
                { label: "New Registration", icon: "👤", page: "add" },
                { label: "Collect Payment", icon: "💳", page: "billing-record-payment" },
                { label: "OP Queue", icon: "🏥", page: "op-queue-management" },
                { label: "Emergency Registration", icon: "🚨", page: "add" },
                { label: "Lab Billing", icon: "🧪", page: "lab" },
                { label: "Pharmacy Billing", icon: "💊", page: "pharmacy" },
                { label: "Today's OP Visits", icon: "📅", page: "op-desk" },
                { label: "Search Patient", icon: "🔍", page: "patients" },
              ].map((action) => (
                <button
                  key={action.label}
                  className="hosp-quick-btn"
                  onClick={() => go(action.page)}
                >
                  <span className="hosp-quick-icon">{action.icon}</span>
                  <span>{action.label}</span>
                  <span className="hosp-quick-arrow">›</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Today's Operations */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Today's Operations</CardTitle>
            <button className="hosp-view-all" onClick={() => go("reports")}>View All</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-ops-table">
              <div className="hosp-ops-head">
                <span>Module</span>
                <span>Count</span>
                <span>Completed</span>
                <span>Pending</span>
              </div>
              {ops.map((row) => (
                <button key={row.module} type="button" className="hosp-ops-row hosp-table-click" onClick={() => go(operationTarget(row.module))}>
                  <span className="hosp-ops-module">
                    <span className="hosp-ops-icon">{row.icon}</span>
                    {row.module}
                  </span>
                  <span className="hosp-ops-count">{row.count}</span>
                  <span className="hosp-ops-completed">{row.completed}</span>
                  <span className="hosp-ops-pending">{row.pending}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Alerts & Notifications */}
        <Card className="panel hosp-section-card" id="dashboard-alerts-notifications">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Alerts &amp; Notifications</CardTitle>
            <button className="hosp-view-all" onClick={() => go("alerts-notifications")}>View All</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-alerts">
              {alerts.length === 0 ? (
                <p className="muted" style={{ padding: "1rem", textAlign: "center", fontSize: "0.82rem" }}>No active alerts.</p>
              ) : (
                alerts.slice(0, 5).map((alert) => (
                  <button key={alert.id} type="button" className={`hosp-alert hosp-alert-${alert.type} hosp-table-click`} onClick={() => go("alerts-notifications")}>
                    <DashboardAlertGlyph icon={alert.icon} />
                    <div className="hosp-alert-content">
                      <strong>{alert.title}</strong>
                      <p>{alert.desc}</p>
                    </div>
                    <span className="hosp-alert-time">{alert.time}</span>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Revenue Snapshot | OP Queue Snapshot | Bed Occupancy | Payment Summary */}
      <div className="hosp-row-4col">
        {/* Revenue Snapshot */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Revenue Snapshot (Today)</CardTitle>
            <button className="hosp-view-all" onClick={() => go("billing-invoices")}>View Details</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-rev-list">
              {[
                { label: "OPD Revenue", icon: "🏥", value: opdRev },
                { label: "Lab Revenue", icon: "🧪", value: labRev },
                { label: "Pharmacy Revenue", icon: "💊", value: pharmRev },
                { label: "IPD Revenue", icon: "🛏️", value: ipdRev },
                { label: "Other Revenue", icon: "📊", value: otherRev || 0 },
              ].map((row) => (
                <button key={row.label} type="button" className="hosp-rev-row hosp-table-click" onClick={() => go(row.label.includes("Lab") ? "lab" : row.label.includes("Pharmacy") ? "pharmacy" : row.label.includes("IPD") ? "patients" : "billing-invoices")}>
                  <span className="hosp-rev-icon">{row.icon}</span>
                  <span className="hosp-rev-label">{row.label}</span>
                  <span className="hosp-rev-value">{formatCurrencyShort(row.value)}</span>
                </button>
              ))}
            </div>
            <div className="hosp-rev-total-row">
              <span>Total Revenue</span>
              <span>{formatCurrencyShort(totalRevenue)}</span>
            </div>
            <div className="hosp-rev-due-row">
              <span>Outstanding Amount</span>
              <span style={{ color: "#dc2626" }}>{formatCurrencyShort(dueRevenue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* OP Queue Snapshot */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>OP Queue Snapshot</CardTitle>
            <button className="hosp-view-all" onClick={() => go("op-queue-management")}>View All</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-queue-layout">
              <MiniDonut segments={queueSegments} total={queueTotal} />
              <div className="hosp-queue-legend">
                {queueSegments.map((seg) => (
                  <div key={seg.label} className="hosp-queue-leg-row">
                    <span className="hosp-queue-dot" style={{ background: seg.color }} />
                    <span className="hosp-queue-leg-label">{seg.label}</span>
                    <span className="hosp-queue-leg-count">{seg.count} ({seg.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bed Occupancy */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Bed Occupancy</CardTitle>
            <button className="hosp-view-all" onClick={() => go("patients")}>View Details</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-bed-layout">
              <CircleGauge
                pct={bedPct}
                color="#10b981"
                label="Occupied"
                center={`${bedPct}%`}
              />
              <div className="hosp-bed-stats">
                <div className="hosp-bed-stat-row">
                  <span>Total Beds</span><strong>{totalBeds}</strong>
                </div>
                <div className="hosp-bed-stat-row">
                  <span>Occupied Beds</span><strong>{occupiedBeds}</strong>
                </div>
                <div className="hosp-bed-stat-row">
                  <span>Available Beds</span><strong>{availableBeds}</strong>
                </div>
                <div className="hosp-bed-stat-row icu">
                  <span>ICU Occupancy</span><strong style={{ color: "#ef4444" }}>0%</strong>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card className="panel hosp-section-card">
          <CardHeader style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <CardTitle>Payment Summary (Today)</CardTitle>
            <button className="hosp-view-all" onClick={() => go("billing-invoices")}>View Details</button>
          </CardHeader>
          <CardContent>
            <div className="hosp-pay-list">
              {[
                { label: "Cash", icon: "💵", value: cashAmt },
                { label: "Card", icon: "💳", value: cardAmt },
                { label: "UPI", icon: "📱", value: upiAmt },
                { label: "Net Banking", icon: "🌐", value: netAmt },
              ].map((row) => (
                <button key={row.label} type="button" className="hosp-pay-row hosp-table-click" onClick={() => go("billing-record-payment")}>
                  <span className="hosp-pay-icon">{row.icon}</span>
                  <span className="hosp-pay-label">{row.label}</span>
                  <span className="hosp-pay-value">{formatCurrencyShort(row.value)}</span>
                </button>
              ))}
            </div>
            <div className="hosp-pay-total-row">
              <span>Total Collected</span>
              <span style={{ color: "#0891b2", fontWeight: 700 }}>{formatCurrencyShort(totalRevenue)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Insights Row */}
      <Card className="panel hosp-ai-card">
        <CardHeader>
          <CardTitle>
            <span style={{ marginRight: "0.4rem" }}>✨</span> AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hosp-insights-row">
            {insights.map((ins) => (
              <div key={ins.text} className="hosp-insight-tile">
                <span className="hosp-insight-icon">{ins.icon}</span>
                <p>{ins.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {analyticsLoading ? <p className="muted" style={{ marginTop: "0.5rem" }}>Refreshing analytics…</p> : null}
    </section>
  );
}
