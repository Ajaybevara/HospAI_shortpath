import { useState, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Card, CardContent, Badge } from "../components/ui";
import type { Notice, Alert } from "../types";

type Props = {
  alerts: Alert[];
  setAlerts: Dispatch<SetStateAction<Alert[]>>;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onNavigate: (page: string) => void;
};

function AlertGlyph({ icon }: { icon: "emergency" | "rupee" | "stock" | "lab" | "backup" }) {
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
    <span className={`hosp-alert-icon hosp-alert-icon-${icon}`} aria-hidden="true" style={{ width: "36px", height: "36px", borderRadius: "12px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" width="20" height="20">
        {icons[icon]}
      </svg>
    </span>
  );
}

export default function AlertsNotificationsPage({ alerts, setAlerts, setNotice, onNavigate }: Props) {
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info" | "success">("all");

  const counts = useMemo(() => {
    return {
      total: alerts.length,
      unread: alerts.filter((a) => !a.read).length,
      critical: alerts.filter((a) => a.type === "error").length,
      warning: alerts.filter((a) => a.type === "warning").length,
      info: alerts.filter((a) => a.type === "info").length,
    };
  }, [alerts]);

  const handleDismiss = (id: string) => {
    setAlerts((current) => current.filter((a) => a.id !== id));
    setNotice({ type: "success", message: "Alert dismissed." });
  };

  const handleMarkAsRead = (id: string) => {
    setAlerts((current) => current.map((a) => (a.id === id ? { ...a, read: true } : a)));
  };

  const handleMarkAllAsRead = () => {
    setAlerts((current) => current.map((a) => ({ ...a, read: true })));
    setNotice({ type: "success", message: "All alerts marked as read." });
  };

  const handleClearAll = () => {
    setAlerts([]);
    setNotice({ type: "success", message: "All alerts cleared." });
  };

  const handleTakeAction = (alert: Alert) => {
    handleMarkAsRead(alert.id);
    if (alert.module) {
      onNavigate(alert.module);
    } else {
      setNotice({ type: "success", message: "Alert completed." });
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchesSearch =
        alert.title.toLowerCase().includes(search.toLowerCase()) ||
        alert.desc.toLowerCase().includes(search.toLowerCase());

      const matchesFilter =
        severityFilter === "all" ||
        (severityFilter === "critical" && alert.type === "error") ||
        (severityFilter === "warning" && alert.type === "warning") ||
        (severityFilter === "info" && alert.type === "info") ||
        (severityFilter === "success" && alert.type === "success");

      return matchesSearch && matchesFilter;
    });
  }, [alerts, search, severityFilter]);

  const filterButtons = [
    { label: "All Alerts", value: "all" as const, count: counts.total },
    { label: "Critical", value: "critical" as const, count: counts.critical, variant: "destructive" },
    { label: "Warnings", value: "warning" as const, count: counts.warning, variant: "warning" },
    { label: "Info", value: "info" as const, count: counts.info, variant: "info" },
  ];

  return (
    <section className="module-page alerts-notifications-page">
      <div className="lab-page-header compact-lab-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="op-queue-icon" style={{ display: "grid", placeItems: "center", width: "64px", height: "64px", borderRadius: "12px", background: "linear-gradient(135deg, #f59e0b, #ef4444)", color: "white", fontSize: "30px", boxShadow: "0 10px 22px rgba(239, 68, 68, 0.24)" }}>
            🔔
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "28px", fontWeight: 800, color: "#0f172a" }}>Alerts & Notifications</h2>
            <p style={{ margin: "5px 0 0", color: "#475569", fontSize: "15px" }}>Monitor and manage real-time hospital event intelligence.</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {counts.unread > 0 && (
            <Button type="button" variant="secondary" onClick={handleMarkAllAsRead}>
              Mark all as read
            </Button>
          )}
          {alerts.length > 0 && (
            <Button type="button" variant="ghost" className="destructive" onClick={handleClearAll} style={{ color: "#a8263a" }}>
              Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="hosp-kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "0.5rem" }}>
        <Card className="panel" style={{ background: "linear-gradient(135deg, #eff6ff, #dbeafe)", borderColor: "#bfdbfe" }}>
          <CardContent style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#1e40af", textTransform: "uppercase" }}>Total Alerts</span>
            <h3 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#1e3a8a", margin: 0 }}>{counts.total}</h3>
            <span style={{ fontSize: "0.7rem", color: "#2563eb" }}>{counts.unread} unread notifications</span>
          </CardContent>
        </Card>
        <Card className="panel" style={{ background: "linear-gradient(135deg, #fef2f2, #fee2e2)", borderColor: "#fca5a5" }}>
          <CardContent style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>Critical</span>
            <h3 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#7f1d1d", margin: 0 }}>{counts.critical}</h3>
            <span style={{ fontSize: "0.7rem", color: "#dc2626" }}>Requires immediate attention</span>
          </CardContent>
        </Card>
        <Card className="panel" style={{ background: "linear-gradient(135deg, #fffbeb, #fef3c7)", borderColor: "#fde047" }}>
          <CardContent style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#854d0e", textTransform: "uppercase" }}>Warnings</span>
            <h3 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#713f12", margin: 0 }}>{counts.warning}</h3>
            <span style={{ fontSize: "0.7rem", color: "#d97706" }}>Maintenance & inventory notices</span>
          </CardContent>
        </Card>
        <Card className="panel" style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", borderColor: "#bbf7d0" }}>
          <CardContent style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>Operational Info</span>
            <h3 style={{ fontSize: "1.8rem", fontWeight: 800, color: "#14532d", margin: 0 }}>{counts.info}</h3>
            <span style={{ fontSize: "0.7rem", color: "#16a34a" }}>System and process logs</span>
          </CardContent>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="panel" style={{ padding: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {filterButtons.map((btn) => {
              const isActive = severityFilter === btn.value;
              return (
                <button
                  key={btn.value}
                  type="button"
                  onClick={() => setSeverityFilter(btn.value)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid",
                    borderColor: isActive ? "#0b8e92" : "#e2e8f0",
                    background: isActive ? "linear-gradient(130deg, #0b8e92 0%, #0d6fc2 100%)" : "white",
                    color: isActive ? "white" : "#475569",
                    fontWeight: 800,
                    fontSize: "0.82rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    boxShadow: isActive ? "0 4px 10px rgba(13, 111, 194, 0.2)" : "none",
                  }}
                >
                  {btn.label}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifycontent: "center",
                      background: isActive ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                      color: isActive ? "white" : "#475569",
                      padding: "0.1rem 0.35rem",
                      borderRadius: "6px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                  >
                    {btn.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ width: "min(320px, 100%)" }}>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search alert title or details..."
              style={{ height: "38px" }}
            />
          </div>
        </div>
      </Card>

      {/* Alerts List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.62rem" }}>
        {filteredAlerts.length === 0 ? (
          <Card className="panel" style={{ padding: "3rem", textAlign: "center" }}>
            <p className="muted" style={{ fontSize: "0.95rem" }}>
              {alerts.length === 0 ? "No active notifications on file." : "No alerts match your search/filter criteria."}
            </p>
          </Card>
        ) : (
          filteredAlerts.map((alert) => (
            <Card
              key={alert.id}
              className={`panel ${alert.read ? "read-alert" : ""}`}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                alignItems: "center",
                gap: "1.1rem",
                padding: "0.9rem 1.1rem",
                background: alert.read ? "#f8fafc" : "#ffffff",
                borderLeft: alert.read ? "1px solid #e2e8f0" : `4px solid ${
                  alert.type === "error" ? "#ef4444" : alert.type === "warning" ? "#f59e0b" : alert.type === "success" ? "#10b981" : "#3b82f6"
                }`,
                opacity: alert.read ? 0.76 : 1,
                transition: "all 0.16s ease",
              }}
            >
              <AlertGlyph icon={alert.icon} />
              <div style={{ display: "flex", flexDirection: "column", gap: "0.22rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h4 style={{ fontSize: "0.92rem", fontWeight: 800, color: "#1e293b", margin: 0 }}>
                    {alert.title}
                  </h4>
                  {!alert.read && (
                    <span style={{
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      fontSize: "0.62rem",
                      fontWeight: 800,
                      padding: "0.1rem 0.35rem",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em"
                    }}>
                      New
                    </span>
                  )}
                  {alert.module && (
                    <span style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      fontSize: "0.62rem",
                      fontWeight: 800,
                      padding: "0.1rem 0.35rem",
                      borderRadius: "4px",
                      textTransform: "uppercase"
                    }}>
                      {alert.module.replace(/-/g, " ")}
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#475569", lineHeight: 1.4 }}>
                  {alert.desc}
                </p>
                <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>
                  ⏰ {alert.time}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                {alert.module && (
                  <Button
                    type="button"
                    variant="primary"
                    className="ui-button-sm"
                    onClick={() => handleTakeAction(alert)}
                  >
                    Take Action →
                  </Button>
                )}
                {!alert.read && !alert.module && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="ui-button-sm"
                    onClick={() => handleMarkAsRead(alert.id)}
                  >
                    Mark read
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="destructive ui-button-sm"
                  onClick={() => handleDismiss(alert.id)}
                  style={{ color: "#a8263a" }}
                  title="Dismiss alert"
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </section>
  );
}
