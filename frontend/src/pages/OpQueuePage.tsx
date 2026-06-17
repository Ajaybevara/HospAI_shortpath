import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Select } from "../components/ui";
import { apiFetch } from "../lib/api";
import type { Notice } from "../types";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
};

type QueuePatient = {
  token: string;
  uhid: string;
  name: string;
  ageGender: string;
  visitType: string;
  arrivedAt: string;
  status: "In Queue" | "In Consultation" | "Completed" | "Yet to Come";
  mobile: string;
};

const mapAppointmentStatus = (status?: string): QueuePatient["status"] => {
  if (status === "completed") return "Completed";
  if (status === "in_consultation") return "In Consultation";
  if (status === "checked_in" || status === "scheduled") return "In Queue";
  return "Yet to Come";
};

export default function OpQueuePage({ setNotice }: Props) {
  const [queue, setQueue] = useState<QueuePatient[]>([]);
  const [selectedToken, setSelectedToken] = useState("");
  const [search, setSearch] = useState("");
  const selectedPatient = queue.find((patient) => patient.token === selectedToken) || queue[0];

  const loadQueueFromPatients = async () => {
    try {
      const data = await apiFetch<{ appointments?: Array<any> }>("/api/appointments");
      const readmitQueue = JSON.parse(localStorage.getItem("hospai_op_queue") || "[]");
      const readmitEntries = (Array.isArray(readmitQueue) ? readmitQueue : [])
        .filter((item) => item && item.status !== "Completed")
        .map((item) => ({
          token: String(item.token || `RA-${String(Date.now()).slice(-6)}`),
          uhid: String(item.uhid || ""),
          name: String(item.name || item.uhid || "Patient"),
          ageGender: String(item.ageGender || "- / -"),
          visitType: String(item.visitType || "Readmission"),
          arrivedAt: String(item.arrivedAt || "--"),
          status: (item.status || "In Queue") as QueuePatient["status"],
          mobile: String(item.mobile || ""),
        }));
      const mapped = (data.appointments || [])
        .filter((appointment) => !["completed", "cancelled"].includes(String(appointment.status || "").toLowerCase()))
        .filter((appointment) => !readmitEntries.some((entry) => entry.uhid === appointment.patient_id))
        .map((appointment, index) => ({
          token: appointment.token_no ? `GM-${String(appointment.token_no).padStart(3, "0")}` : `GM-${String(index + 1).padStart(3, "0")}`,
          uhid: appointment.patient_id || "",
          name: appointment.patient_name || appointment.patient_id || "Patient",
          ageGender: "- / -",
          visitType: appointment.appointment_kind || appointment.visit_type || "OP",
          arrivedAt: appointment.appointment_date ? new Date(appointment.appointment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--",
          status: mapAppointmentStatus(appointment.status),
          mobile: "",
        }));
      const nextQueue = [...readmitEntries, ...mapped];
      setQueue(nextQueue);
      setSelectedToken(nextQueue[0]?.token || "");
    } catch (error) {
      setQueue([]);
      setSelectedToken("");
      setNotice({ type: "warning", message: "Unable to load live OP queue." });
    }
  };

  useEffect(() => {
    void loadQueueFromPatients();
  }, []);
  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return queue;
    return queue.filter((patient) => [patient.token, patient.uhid, patient.name, patient.mobile].some((value) => value.toLowerCase().includes(term)));
  }, [queue, search]);

  const counts = useMemo(() => ({
    total: queue.length,
    completed: queue.filter((patient) => patient.status === "Completed").length,
    inConsultation: queue.filter((patient) => patient.status === "In Consultation").length,
    inQueue: queue.filter((patient) => patient.status === "In Queue").length,
    yet: queue.filter((patient) => patient.status === "Yet to Come").length,
  }), [queue]);


  const getStatusBadgeClass = (status?: QueuePatient["status"]) => {
    if (status === "Completed") return "queue-badge completed";
    if (status === "In Consultation") return "queue-badge consultation";
    if (status === "Yet to Come") return "queue-badge hold";
    return "queue-badge";
  };

  const callNext = () => {
    if (!selectedPatient) {
      setNotice({ type: "warning", message: "No patient is currently in the OP queue." });
      return;
    }
    setNotice({ type: "success", message: `Calling next patient: ${selectedPatient.name}.` });
  };
  const saveReadmitQueueState = (nextQueue: QueuePatient[]) => {
    const readmitOnly = nextQueue.filter((patient) => patient.token.startsWith("RA-"));
    localStorage.setItem("hospai_op_queue", JSON.stringify(readmitOnly));
  };

  const updateSelectedStatus = (status: QueuePatient["status"]) => {
    if (!selectedToken) {
      setNotice({ type: "warning", message: "Select a queue token first." });
      return;
    }
    setQueue((current) => {
      const next = current.map((patient) => patient.token === selectedToken ? { ...patient, status } : patient);
      saveReadmitQueueState(next);
      return next;
    });
    setNotice({ type: "success", message: `${selectedToken} moved to ${status}.` });
  };
  const removeToken = () => {
    if (!selectedToken) {
      setNotice({ type: "warning", message: "Select a queue token first." });
      return;
    }
    const nextQueue = queue.filter((patient) => patient.token !== selectedToken);
    setQueue(nextQueue);
    saveReadmitQueueState(nextQueue);
    setSelectedToken(nextQueue[0]?.token || "");
    setNotice({ type: "success", message: `${selectedToken} removed from queue.` });
  };

  const transferSelectedToken = () => {
    if (!selectedToken) {
      setNotice({ type: "warning", message: "Select a queue token first." });
      return;
    }
    setNotice({ type: "success", message: `${selectedToken} is ready to transfer. Select target doctor from Doctor dropdown.` });
  };

  const printSelectedSlip = () => {
    if (!selectedPatient) {
      setNotice({ type: "warning", message: "Select a queue token before printing." });
      return;
    }
    window.print();
  };

  return (
    <section className="module-page op-queue-page">
      <div className="op-queue-header">
        <div className="op-queue-title-wrap">
          <div className="op-queue-icon">♙</div>
          <div>
            <h2>OP Queue Management</h2>
            <p>Manage OP patient queue and consult status</p>
          </div>
        </div>
        <div className="op-header-actions">
          <Button type="button" className="purple-action" onClick={callNext}>🔔 Call Next</Button>
          <Button type="button" onClick={() => void loadQueueFromPatients()}>⟳ Refresh</Button>
          <Button type="button" className="green-action" onClick={() => setNotice({ type: "success", message: `Queue Summary: ${counts.total} total, ${counts.inQueue} waiting, ${counts.inConsultation} in consultation, ${counts.completed} completed.` })}>▥ Queue Summary</Button>
          <Button type="button" variant="ghost" onClick={printSelectedSlip}>▣ Print Queue Slip</Button>
        </div>
      </div>

      <div className="op-card queue-filters-card">
        <div className="op-filter-grid">
          <label><span className="op-filter-label">Department <b>*</b></span><Select defaultValue="General Medicine"><option>General Medicine</option><option>Cardiology</option><option>Orthopedics</option></Select></label>
          <label><span className="op-filter-label">Doctor <b>*</b></span><Select defaultValue="Dr. Amit Verma"><option>Dr. Amit Verma</option><option>Dr. Priya Rao</option></Select></label>
          <label><span className="op-filter-label">Clinic / Room <b>*</b></span><Select defaultValue="OPD - 1"><option>OPD - 1</option><option>OPD - 2</option></Select></label>
          <label><span className="op-filter-label">Visit Date <b>*</b></span><Input type="date" defaultValue="2024-05-24" /></label>
          <label><span className="op-filter-label">Visit Type</span><Select defaultValue="OPD"><option>OPD</option><option>Emergency</option></Select></label>
          <label><span className="op-filter-label">Queue Type</span><Select defaultValue="All"><option>All</option><option>New</option><option>Follow Up</option></Select></label>
          <label><span className="op-filter-label">Status</span><Select defaultValue="All"><option>All</option><option>In Queue</option><option>Completed</option></Select></label>
          <label className="op-search-label"><span className="op-filter-label">Search Patient (UHID / Name / Mobile) <b>*</b></span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search here..." /></label>
        </div>
        <aside className="queue-summary-box">
          <h3>Today's Queue Summary</h3>
          <p><span>◴ Total Tokens</span><strong>{counts.total}</strong></p>
          <p className="green"><span>✓ Completed</span><strong>{counts.completed}</strong></p>
          <p className="orange"><span>⚠ In Queue</span><strong>{counts.inQueue}</strong></p>
          <p className="blue"><span>♙ In Consultation</span><strong>{counts.inConsultation}</strong></p>
          <p className="blue"><span>◷ Yet to Come</span><strong>{counts.yet}</strong></p>
        </aside>
      </div>

      <div className="op-main-grid">
        <div>
          <div className="op-card queue-list-card">
            <h3>2. OP Queue List</h3>
            <div className="queue-tabs"><button className="active">♙ In Queue ({counts.inQueue})</button><button>♙ In Consultation ({counts.inConsultation})</button><button>✓ Completed ({counts.completed})</button><button>♧ Yet to Come ({counts.yet})</button></div>
            <table className="op-queue-table">
              <thead><tr><th>#</th><th>Token No.</th><th>UHID</th><th>Patient Name</th><th>Age / Gender</th><th>Visit Type</th><th>Arrived At</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {filteredQueue.length ? filteredQueue.map((patient, index) => (
                  <tr key={patient.token} className={patient.token === selectedToken ? "selected" : ""} onClick={() => setSelectedToken(patient.token)}>
                    <td>{index + 1}</td><td>{patient.token}</td><td>{patient.uhid}</td><td>{patient.name}</td><td>{patient.ageGender}</td><td>{patient.visitType}</td><td>{patient.arrivedAt}</td><td><span className={getStatusBadgeClass(patient.status)}>{patient.status}</span></td><td><button>🔊</button><button>👁</button></td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className="lab-empty-row">No active OP queue entries.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="queue-pagination"><span>Showing 1 to {filteredQueue.length} of {queue.length} entries</span><div><button>‹</button><button className="active">1</button><button>2</button><button>3</button><button>4</button><button>›</button></div></div>
          </div>

          <div className="op-card queue-actions-card">
            <h3>4. Queue Actions</h3>
            <div className="queue-action-grid">
              <button className="queue-action green" onClick={callNext}><b>📣 Call Next Patient</b><small>Call next patient in queue</small><span>›</span></button>
              <button className="queue-action blue" onClick={() => updateSelectedStatus("In Consultation")}><b>♙ Start Consultation</b><small>Move patient to consultation</small><span>›</span></button>
              <button className="queue-action teal" onClick={() => updateSelectedStatus("Completed")}><b>✓ Finish Consultation</b><small>Mark consultation as completed</small><span>›</span></button>
              <button className="queue-action orange" onClick={() => updateSelectedStatus("Yet to Come")}><b>◷ Hold / Skip Token</b><small>Hold or skip this token</small><span>›</span></button>
              <button className="queue-action purple" onClick={transferSelectedToken}><b>⇄ Transfer Token</b><small>Transfer to another doctor</small><span>›</span></button>
              <button className="queue-action red" onClick={removeToken}><b>⊗ Remove Token</b><small>Remove from queue</small><span>›</span></button>
            </div>
          </div>
        </div>

        <div>
          <div className="op-card patient-details-card">
            <h3>3. Patient Details</h3>
            <div className="patient-summary-panel"><div className="patient-avatar">●</div><div className="patient-detail-grid"><span>Token No.</span><b>{selectedPatient?.token || "-"}</b><span>Visit Type</span><b>{selectedPatient?.visitType || "-"}</b><span>Patient Name</span><b>{selectedPatient?.name || "-"}</b><span>Department</span><b>-</b><span>UHID</span><b>{selectedPatient?.uhid || "-"}</b><span>Doctor</span><b>-</b><span>Age / Gender</span><b>{selectedPatient?.ageGender || "-"}</b><span>Arrived At</span><b>{selectedPatient?.arrivedAt || "-"}</b><span>Mobile</span><b>{selectedPatient?.mobile || "-"}</b><span>Status</span><b className={getStatusBadgeClass(selectedPatient?.status)}>{selectedPatient?.status || "-"}</b></div></div>
            <div className="clinical-panel"><h4>Visit / Clinical Information</h4><label>Chief Complaint<Input defaultValue="" /></label><label>Visit Reason<Input defaultValue="" /></label><label>Previous Visit<Input defaultValue="" /></label><label>Referred By<Input defaultValue="" /></label></div>
          </div>
          <div className="op-card print-slip-card"><h3>5. Print Queue Slip</h3><div className="print-slip-grid"><label>Token No.<Input value={selectedToken} onChange={(event) => setSelectedToken(event.target.value)} /></label><label>Print Format<Select defaultValue="Queue Slip"><option>Queue Slip</option><option>Doctor Copy</option></Select></label><Button type="button" className="yellow-action" onClick={printSelectedSlip}>▣ Print Slip</Button></div></div>
        </div>
      </div>

      <div className="queue-note">ⓘ <b>Note:</b> Queue is based on token arrival time. Please call patient as per queue order to ensure smooth OPD flow.</div>
    </section>
  );
}
