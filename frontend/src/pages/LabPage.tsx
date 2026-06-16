import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button, Input, Select } from "../components/ui";
import { apiFetch, reportError } from "../lib/api";
import type { Notice } from "../types";
import { fullPatientName, lookupPatientByUhid, normalizeUhidLookup } from "../lib/patientLookup";

type Props = {
  setNotice: Dispatch<SetStateAction<Notice | null>>;
};

type ServiceItem = {
  code: string;
  name: string;
  category: string;
  rate: number;
  quantity: number;
};

type DiagnosticRecord = {
  id: number;
  invoice_no?: string;
  patient_id?: string;
  doctor_name?: string;
  test_name: string;
  amount: number;
  paid_amount?: number;
  due_amount?: number;
  status?: string;
  sample_barcode?: string;
  order_status?: string;
  created_at?: string;
};

const LAB_CATEGORIES = ["Hematology", "Biochemistry", "Microbiology", "Pathology", "Serology"];
const DIAGNOSTIC_CATEGORIES = ["X-Ray", "Ultrasound", "CT Scan", "MRI", "ECG"];

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
}

function compactDate() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function buildInvoiceNo(type: "lab" | "diagnostic", index: number) {
  const prefix = type === "lab" ? "LAB" : "DIA";
  return `${prefix}-${compactDate()}-${String(Date.now()).slice(-5)}-${index + 1}`;
}

export default function LabPage({ setNotice }: Props) {
  const [activeTab, setActiveTab] = useState<"lab" | "diagnostic">("lab");
  const [labItems, setLabItems] = useState<ServiceItem[]>([]);
  const [diagnosticItems, setDiagnosticItems] = useState<ServiceItem[]>([]);
  const [records, setRecords] = useState<DiagnosticRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [patientUhid, setPatientUhid] = useState("");
  const [patientName, setPatientName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");

  const labTotal = useMemo(() => labItems.reduce((sum, item) => sum + item.rate * item.quantity, 0), [labItems]);
  const diagnosticTotal = useMemo(() => diagnosticItems.reduce((sum, item) => sum + item.rate * item.quantity, 0), [diagnosticItems]);
  const grandTotal = labTotal + diagnosticTotal;

  const loadDiagnostics = async () => {
    setLoadingRecords(true);
    try {
      const data = await apiFetch<{ diagnostics?: DiagnosticRecord[] }>("/api/lab/diagnostics");
      setRecords(data.diagnostics || []);
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to load lab diagnostics.");
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    void loadDiagnostics();
  }, []);

  const fillBillingPatient = async (value: string) => {
    const lookup = normalizeUhidLookup(value);
    if (!lookup) {
      setPatientName("");
      return;
    }
    try {
      const patient = await lookupPatientByUhid(lookup);
      if (!patient) {
        setPatientName("");
        setNotice({ type: "warning", message: "No patient found for that UHID / last 4 digits." });
        return;
      }
      const name = fullPatientName(patient) || patient.patient_id;
      setPatientUhid(patient.patient_id);
      setPatientName(name);
      setNotice({ type: "success", message: `Patient auto-filled: ${name}.` });
    } catch {
      setPatientName("");
      setNotice({ type: "error", message: "Unable to auto-fill patient details." });
    }
  };

  const addBlankItem = () => {
    const target = activeTab === "lab" ? labItems : diagnosticItems;
    const nextItem: ServiceItem = {
      code: activeTab === "lab" ? `LAB${String(target.length + 1).padStart(3, "0")}` : `IMG${String(target.length + 1).padStart(3, "0")}`,
      name: search.trim() || "",
      category: category || subCategory || "",
      rate: 0,
      quantity: 1,
    };
    if (activeTab === "lab") setLabItems((current) => [...current, nextItem]);
    else setDiagnosticItems((current) => [...current, nextItem]);
    setSearch("");
    setNotice({ type: "success", message: "Blank service row added. Enter service details to continue." });
  };

  const updateItem = (type: "lab" | "diagnostic", index: number, key: keyof ServiceItem, value: string) => {
    const setter = type === "lab" ? setLabItems : setDiagnosticItems;
    setter((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [key]: key === "rate" || key === "quantity" ? Number(value) || 0 : value,
            }
          : item
      )
    );
  };

  const removeItem = (type: "lab" | "diagnostic", index: number) => {
    const setter = type === "lab" ? setLabItems : setDiagnosticItems;
    setter((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const servicePayloads = () => {
    const build = (type: "lab" | "diagnostic", items: ServiceItem[]) =>
      items
        .filter((item) => item.name.trim() && item.rate > 0 && item.quantity > 0)
        .map((item, index) => ({
          invoice_no: buildInvoiceNo(type, index),
          patient_id: patientUhid.trim(),
          doctor_name: doctorName.trim() || undefined,
          test_name: `${type === "lab" ? "Lab" : "Diagnostic"} - ${item.name.trim()}`,
          amount: item.rate * item.quantity,
          paid_amount: 0,
          sample_barcode: item.code.trim() || undefined,
          order_status: "ordered",
        }));
    return [...build("lab", labItems), ...build("diagnostic", diagnosticItems)];
  };

  const saveBill = async () => {
    if (!patientUhid.trim() || !patientName.trim()) {
      setNotice({ type: "warning", message: "Enter UHID / last 4 digits and auto-fill patient before saving." });
      return;
    }
    const payloads = servicePayloads();
    if (payloads.length === 0) {
      setNotice({ type: "warning", message: "Add at least one lab or diagnostic service with amount." });
      return;
    }

    const paid = Math.max(Number(paidAmount) || 0, 0);
    let remainingPaid = Math.min(paid, grandTotal);
    setSavingBill(true);
    try {
      for (const payload of payloads) {
        const linePaid = Math.min(remainingPaid, payload.amount);
        remainingPaid -= linePaid;
        await apiFetch("/api/lab/diagnostics", {
          method: "POST",
          body: JSON.stringify({ ...payload, paid_amount: linePaid }),
        });
      }
      setLabItems([]);
      setDiagnosticItems([]);
      setPaidAmount("0");
      await loadDiagnostics();
      setNotice({ type: "success", message: "Lab and diagnostic bill saved." });
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to save lab bill.");
    } finally {
      setSavingBill(false);
    }
  };

  const renderRows = (type: "lab" | "diagnostic", items: ServiceItem[]) => {
    if (items.length === 0) {
      return (
        <tr>
          <td colSpan={8} className="lab-empty-row">No services added yet. Use search/category and Add Test to create a row.</td>
        </tr>
      );
    }

    return items.map((item, index) => (
      <tr key={`${type}-${index}-${item.code}`}>
        <td>{index + 1}</td>
        <td>
          <Input value={item.code} onChange={(event) => updateItem(type, index, "code", event.target.value)} aria-label={`${type} code`} />
        </td>
        <td>
          <Input value={item.name} onChange={(event) => updateItem(type, index, "name", event.target.value)} aria-label={`${type} name`} />
        </td>
        <td>
          <Input value={item.category} onChange={(event) => updateItem(type, index, "category", event.target.value)} aria-label={`${type} category`} />
        </td>
        <td>
          <Input type="number" min={0} value={item.rate} onChange={(event) => updateItem(type, index, "rate", event.target.value)} aria-label={`${type} rate`} />
        </td>
        <td>
          <Input type="number" min={1} value={item.quantity} onChange={(event) => updateItem(type, index, "quantity", event.target.value)} aria-label={`${type} quantity`} />
        </td>
        <td className="lab-service-amount">{formatAmount(item.rate * item.quantity)}</td>
        <td>
          <button className="lab-delete-btn" type="button" onClick={() => removeItem(type, index)} aria-label="Delete row">Delete</button>
        </td>
      </tr>
    ));
  };

  return (
    <section className="module-page lab-billing-page">
      <div className="lab-page-header compact-lab-header">
        <div className="lab-header-icon">+</div>
        <div>
          <h2>Lab & Diagnostic Billing Process</h2>
          <p>Create and manage billing for laboratory tests and diagnostic procedures</p>
        </div>
      </div>

      <div className="lab-layout single-column-lab">
        <div className="lab-card lab-services-card provided-services-card">
          <h3>1. Patient Details</h3>
          <div className="lab-service-toolbar">
            <Input value={patientUhid} onChange={(event) => { setPatientUhid(event.target.value); setPatientName(""); }} onBlur={(event) => void fillBillingPatient(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void fillBillingPatient((event.currentTarget as HTMLInputElement).value); } }} placeholder="UHID / last 4 digits" aria-label="Lab billing UHID" />
            <Input value={patientName} onChange={(event) => setPatientName(event.target.value)} placeholder="Patient name auto-filled" aria-label="Lab billing patient name" />
            <Input value={doctorName} onChange={(event) => setDoctorName(event.target.value)} placeholder="Doctor name" aria-label="Lab billing doctor name" />
            <Input type="number" min={0} value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder="Paid amount" aria-label="Lab billing paid amount" />
          </div>

          <h3>2. Select Services</h3>
          <div className="lab-tabs">
            <button className={activeTab === "lab" ? "active" : ""} type="button" onClick={() => setActiveTab("lab")}>Lab Tests</button>
            <button className={activeTab === "diagnostic" ? "active diagnostic" : "diagnostic"} type="button" onClick={() => setActiveTab("diagnostic")}>Diagnostic Imaging</button>
          </div>

          <div className="lab-service-toolbar">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search test by name or code..." aria-label="Lab service search" />
            <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Lab category">
              <option value="">Select Category</option>
              {(activeTab === "lab" ? LAB_CATEGORIES : DIAGNOSTIC_CATEGORIES).map((item) => <option key={item}>{item}</option>)}
            </Select>
            <Select value={subCategory} onChange={(event) => setSubCategory(event.target.value)} aria-label="Lab sub category">
              <option value="">Select Sub-Category</option>
              <option value="Routine">Routine</option>
              <option value="Emergency">Emergency</option>
              <option value="Special">Special</option>
            </Select>
            <Button type="button" onClick={addBlankItem}>+ Add Test</Button>
          </div>

          <div className="lab-table-section blue-section">
            <div className="lab-section-title">Lab Tests</div>
            <table className="lab-billing-table">
              <thead>
                <tr><th>#</th><th>Test Code</th><th>Test Name</th><th>Category</th><th>Rate (INR)</th><th>Quantity</th><th>Amount (INR)</th><th>Action</th></tr>
              </thead>
              <tbody>{renderRows("lab", labItems)}</tbody>
            </table>
            <div className="lab-total-row"><span>Total Lab Tests Amount</span><strong>INR {formatAmount(labTotal)}</strong></div>
          </div>

          <div className="lab-table-section purple-section">
            <div className="lab-section-title">Diagnostic Imaging</div>
            <table className="lab-billing-table">
              <thead>
                <tr><th>#</th><th>Procedure Code</th><th>Procedure Name</th><th>Category</th><th>Rate (INR)</th><th>Quantity</th><th>Amount (INR)</th><th>Action</th></tr>
              </thead>
              <tbody>{renderRows("diagnostic", diagnosticItems)}</tbody>
            </table>
            <div className="lab-total-row purple"><span>Total Diagnostic Amount</span><strong>INR {formatAmount(diagnosticTotal)}</strong></div>
          </div>

          <div className="lab-total-row">
            <span>Grand Total</span>
            <strong>INR {formatAmount(grandTotal)}</strong>
          </div>
          <div className="lab-service-toolbar">
            <Button className="add-custom-service" variant="ghost" type="button" onClick={addBlankItem}>+ Add Custom Item / Service</Button>
            <Button type="button" onClick={() => void saveBill()} disabled={savingBill}>{savingBill ? "Saving..." : "Save Lab Bill"}</Button>
            <Button variant="secondary" type="button" onClick={() => window.print()}>Print Bill</Button>
          </div>
        </div>

        <div className="lab-card lab-services-card provided-services-card">
          <h3>Existing Lab and Diagnostic Records</h3>
          <div className="lab-table-section blue-section">
            <table className="lab-billing-table">
              <thead>
                <tr><th>Invoice</th><th>UHID</th><th>Patient Name</th><th>Doctor</th><th>Test / Procedure</th><th>Amount</th><th>Paid</th><th>Due</th><th>Status</th><th>Order</th></tr>
              </thead>
              <tbody>
                {loadingRecords ? (
                  <tr><td colSpan={10} className="lab-empty-row">Loading records...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={10} className="lab-empty-row">No lab or diagnostic records available.</td></tr>
                ) : (
                  records.slice(0, 20).map((record) => (
                    <tr key={record.id}>
                      <td>{record.invoice_no || `DIAG-${record.id}`}</td>
                      <td>{record.patient_id || "-"}</td>
                      <td>{record.patient_id === patientUhid ? patientName || "-" : "-"}</td>
                      <td>{record.doctor_name || "-"}</td>
                      <td>{record.test_name}</td>
                      <td>{formatAmount(Number(record.amount || 0))}</td>
                      <td>{formatAmount(Number(record.paid_amount || 0))}</td>
                      <td>{formatAmount(Number(record.due_amount || 0))}</td>
                      <td>{record.status || "due"}</td>
                      <td>{record.order_status || "ordered"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
