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
  patient_name?: string;
  age?: number;
  gender?: string;
  visit_id?: string;
  doctor_name?: string;
  department?: string;
  visit_type?: string;
  test_name: string;
  amount: number;
  paid_amount?: number;
  due_amount?: number;
  status?: string;
  sample_barcode?: string;
  order_status?: string;
  bill_date?: string;
  due_date?: string;
  payment_mode?: string;
  transaction_id?: string;
  discount_percentage?: number;
  discount_amount?: number;
  tax_percentage?: number;
  tax_amount?: number;
  report_delivery_mode?: string;
  report_delivery_date?: string;
  remarks?: string;
  created_at?: string;
};

const LAB_CATEGORIES = ["Hematology", "Biochemistry", "Microbiology", "Pathology", "Serology"];
const DIAGNOSTIC_CATEGORIES = ["X-Ray", "Ultrasound", "CT Scan", "MRI", "ECG"];
const PAYMENT_MODES = ["Cash", "Card", "Online", "Cheque", "UPI"];
const DELIVERY_MODES = ["Email", "Physical", "Both"];

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0);
}

function getCurrentDate() {
  return new Date().toISOString().split("T")[0];
}

function compactDate() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function buildInvoiceNo(type: "lab" | "diagnostic", index: number) {
  const prefix = type === "lab" ? "LAB" : "DIA";
  return `${prefix}-${compactDate()}-${String(Date.now()).slice(-5)}-${index + 1}`;
}

export default function LabPage({ setNotice }: Props) {
  const [activeTab, setActiveTab] = useState<"lab" | "diagnostic" | null>(null);
  const [labItems, setLabItems] = useState<ServiceItem[]>([]);
  const [diagnosticItems, setDiagnosticItems] = useState<ServiceItem[]>([]);
  const [records, setRecords] = useState<DiagnosticRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  
  // Patient & Visit Information
  const [patientUhid, setPatientUhid] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [visitId, setVisitId] = useState("");
  const [department, setDepartment] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [visitType, setVisitType] = useState("");
  const [visitDateTime, setVisitDateTime] = useState("");
  const [reportDeliveryMode, setReportDeliveryMode] = useState("");
  const [reportDeliveryDate, setReportDeliveryDate] = useState("");
  const [remarks, setRemarks] = useState("");
  
  // Payment & Billing Information
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [taxPercentage, setTaxPercentage] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [billNotes, setBillNotes] = useState("");

  const labTotal = useMemo(() => labItems.reduce((sum, item) => sum + item.rate * item.quantity, 0), [labItems]);
  const diagnosticTotal = useMemo(() => diagnosticItems.reduce((sum, item) => sum + item.rate * item.quantity, 0), [diagnosticItems]);
  const subtotal = labTotal + diagnosticTotal;
  const discountAmount = (subtotal * Number(discountPercentage || 0)) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = (afterDiscount * Number(taxPercentage || 0)) / 100;
  const grandTotal = afterDiscount + taxAmount;
  const balanceAmount = grandTotal - Number(paidAmount || 0);

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
      setPatientAge(patient.age?.toString() || "");
      setPatientGender(patient.gender || "Male");
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
          patient_name: patientName.trim() || undefined,
          age: patientAge ? Number(patientAge) : undefined,
          gender: patientGender,
          visit_id: visitId.trim() || undefined,
          doctor_name: doctorName.trim() || undefined,
          department: department.trim() || undefined,
          visit_type: visitType,
          test_name: `${type === "lab" ? "Lab" : "Diagnostic"} - ${item.name.trim()}`,
          amount: item.rate * item.quantity,
          paid_amount: 0,
          sample_barcode: item.code.trim() || undefined,
          order_status: "ordered",
          bill_date: billDate,
          due_date: dueDate,
          payment_mode: paymentMode,
          transaction_id: transactionId.trim() || undefined,
          discount_percentage: Number(discountPercentage || 0),
          discount_amount: discountAmount,
          tax_percentage: Number(taxPercentage || 0),
          tax_amount: taxAmount,
          report_delivery_mode: reportDeliveryMode,
          report_delivery_date: reportDeliveryDate,
          remarks: remarks.trim() || undefined,
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
      setNotice({ type: "success", message: "Lab and diagnostic bill saved successfully." });
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Unable to save lab bill.");
    } finally {
      setSavingBill(false);
    }
  };

  const saveBillAndPrint = async () => {
    await saveBill();
    setTimeout(() => window.print(), 500);
  };

  const resetForm = () => {
    setPatientUhid("");
    setPatientName("");
    setPatientAge("");
    setPatientGender("");
    setVisitId("");
    setDepartment("");
    setDoctorName("");
    setVisitType("");
    setVisitDateTime("");
    setReportDeliveryMode("");
    setReportDeliveryDate("");
    setRemarks("");
    setBillDate("");
    setDueDate("");
    setPaymentMode("");
    setTransactionId("");
    setTaxPercentage("");
    setDiscountPercentage("");
    setPaidAmount("");
    setBillNotes("");
    setLabItems([]);
    setDiagnosticItems([]);
    setActiveTab(null);
    setNotice({ type: "info", message: "Form reset." });
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
          <button className="lab-delete-btn" type="button" onClick={() => removeItem(type, index)} aria-label="Delete row">×</button>
        </td>
      </tr>
    ));
  };

  return (
    <section className="module-page lab-billing-page">
      <div className="lab-page-header compact-lab-header">
        <div className="lab-header-icon">📋</div>
        <div>
          <h2>Lab & Diagnostic Billing Process</h2>
          <p>Create and manage billing for laboratory tests and diagnostic procedures</p>
        </div>
      </div>

      <div className="lab-layout single-column-lab">
        <div className="lab-card lab-services-card provided-services-card">
          
          {/* 1. PATIENT & VISIT INFORMATION */}
          <h3 className="lab-section-header">1. Patient & Visit Information</h3>
          <div className="lab-patient-grid">
            <div className="lab-field">
              <label>UHID / Patient ID *</label>
              <Input 
                value={patientUhid} 
                onChange={(event) => { setPatientUhid(event.target.value); setPatientName(""); }} 
                onBlur={(event) => void fillBillingPatient(event.target.value)} 
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void fillBillingPatient((event.currentTarget as HTMLInputElement).value); } }} 
                placeholder="Enter UHID or last 4 digits" 
                aria-label="Patient UHID" 
              />
            </div>
            <div className="lab-field">
              <label>Visit / Administration ID</label>
              <Input 
                value={visitId}
                onChange={(event) => setVisitId(event.target.value)}
                placeholder="e.g., VISIT78910"
                aria-label="Visit ID"
              />
            </div>
            <div className="lab-field">
              <label>Visit Type *</label>
              <Select value={visitType} onChange={(event) => setVisitType(event.target.value)} aria-label="Visit Type">
                <option value="OPD">OPD</option>
                <option value="IPD">IPD</option>
                <option value="Emergency">Emergency</option>
              </Select>
            </div>
            <div className="lab-field">
              <label>Date / Time</label>
              <Input 
                type="datetime-local"
                value={visitDateTime}
                onChange={(event) => setVisitDateTime(event.target.value)}
                aria-label="Visit Date Time"
              />
            </div>

            <div className="lab-field">
              <label>Patient Name *</label>
              <Input 
                value={patientName} 
                onChange={(event) => setPatientName(event.target.value)} 
                placeholder="Auto-filled" 
                aria-label="Patient name" 
              />
            </div>
            <div className="lab-field">
              <label>Age</label>
              <Input 
                type="number"
                value={patientAge}
                onChange={(event) => setPatientAge(event.target.value)}
                placeholder="Auto-filled"
                aria-label="Age"
              />
            </div>
            <div className="lab-field">
              <label>Gender</label>
              <Select value={patientGender} onChange={(event) => setPatientGender(event.target.value)} aria-label="Gender">
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </Select>
            </div>
            <div className="lab-field">
              <label>Report Delivery Mode</label>
              <Select value={reportDeliveryMode} onChange={(event) => setReportDeliveryMode(event.target.value)} aria-label="Delivery Mode">
                {DELIVERY_MODES.map(mode => <option key={mode}>{mode}</option>)}
              </Select>
            </div>

            <div className="lab-field">
              <label>Department</label>
              <Input 
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="e.g., Pathology"
                aria-label="Department"
              />
            </div>
            <div className="lab-field">
              <label>Doctor *</label>
              <Input 
                value={doctorName} 
                onChange={(event) => setDoctorName(event.target.value)} 
                placeholder="Referring doctor name" 
                aria-label="Doctor name" 
              />
            </div>
            <div className="lab-field">
              <label>Report Delivery Date</label>
              <Input 
                type="date"
                value={reportDeliveryDate}
                onChange={(event) => setReportDeliveryDate(event.target.value)}
                aria-label="Report Delivery Date"
              />
            </div>
            <div className="lab-field">
              <label>Remarks</label>
              <Input 
                value={remarks}
                onChange={(event) => setRemarks(event.target.value)}
                placeholder="Additional remarks (if any)"
                aria-label="Remarks"
              />
            </div>
          </div>

          {/* 2. SELECT SERVICES */}
          <h3 className="lab-section-header">2. Select Services</h3>
          <div className="lab-tabs">
            <button className={activeTab === "lab" ? "active" : ""} type="button" onClick={() => setActiveTab("lab")}>Lab Tests</button>
            <button className={activeTab === "diagnostic" ? "active diagnostic" : "diagnostic"} type="button" onClick={() => { setActiveTab("diagnostic"); }}>Diagnostic (Imaging)</button>
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
                <tr><th>#</th><th>Test Code</th><th>Test Name</th><th>Category</th><th>Rate (₹)</th><th>Qty</th><th>Amount (₹)</th><th>Action</th></tr>
              </thead>
              <tbody>{renderRows("lab", labItems)}</tbody>
            </table>
            <div className="lab-total-row"><span>Total Lab Tests Amount</span><strong>₹ {formatAmount(labTotal)}</strong></div>
          </div>

          <div className="lab-table-section purple-section">
            <div className="lab-section-title">Diagnostic Imaging</div>
            <table className="lab-billing-table">
              <thead>
                <tr><th>#</th><th>Procedure Code</th><th>Procedure Name</th><th>Category</th><th>Rate (₹)</th><th>Qty</th><th>Amount (₹)</th><th>Action</th></tr>
              </thead>
              <tbody>{renderRows("diagnostic", diagnosticItems)}</tbody>
            </table>
            <div className="lab-total-row purple"><span>Total Diagnostic Amount</span><strong>₹ {formatAmount(diagnosticTotal)}</strong></div>
          </div>

          {/* 3. PAYMENT & BILLING INFORMATION */}
          <h3 className="lab-section-header">3. Payment & Billing Information</h3>
          <div className="lab-patient-grid">
            <div className="lab-field">
              <label>Bill Date</label>
              <Input 
                type="date"
                value={billDate}
                onChange={(event) => setBillDate(event.target.value)}
                aria-label="Bill Date"
              />
            </div>
            <div className="lab-field">
              <label>Due Date</label>
              <Input 
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                aria-label="Due Date"
              />
            </div>
            <div className="lab-field">
              <label>Payment Mode *</label>
              <Select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)} aria-label="Payment Mode">
                {PAYMENT_MODES.map(mode => <option key={mode}>{mode}</option>)}
              </Select>
            </div>
            <div className="lab-field">
              <label>Paid Amount (₹) *</label>
              <Input 
                type="number"
                min={0}
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                placeholder="0.00"
                aria-label="Paid Amount"
              />
            </div>

            <div className="lab-field">
              <label>Transaction / Reference No.</label>
              <Input 
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                placeholder="e.g., TXN123456789"
                aria-label="Transaction ID"
              />
            </div>
            <div className="lab-field">
              <label>Discount Type</label>
              <Select aria-label="Discount Type">
                <option value="">Percentage (%)</option>
                <option value="">Fixed Amount</option>
              </Select>
            </div>
            <div className="lab-field">
              <label>Percentage / Discount (%) *</label>
              <Input 
                type="number"
                min={0}
                value={discountPercentage}
                onChange={(event) => setDiscountPercentage(event.target.value)}
                placeholder="0"
                aria-label="Discount Percentage"
              />
            </div>
            <div className="lab-field">
              <label>Discount Amount (₹)</label>
              <Input 
                type="text"
                value={formatAmount(discountAmount)}
                disabled
                aria-label="Discount Amount"
              />
            </div>

            <div className="lab-field">
              <label>Tax (%)</label>
              <Input 
                type="number"
                min={0}
                value={taxPercentage}
                onChange={(event) => setTaxPercentage(event.target.value)}
                placeholder="5"
                aria-label="Tax Percentage"
              />
            </div>
            <div className="lab-field" style={{gridColumn: "span 3"}}>
              <label>Notes</label>
              <Input 
                value={billNotes}
                onChange={(event) => setBillNotes(event.target.value)}
                placeholder="Enter notes (if any)"
                aria-label="Bill Notes"
              />
            </div>
          </div>

          {/* 4. BILL SUMMARY */}
          <h3 className="lab-section-header">4. Bill Summary</h3>
          <div className="lab-bill-summary">
            <div className="summary-row">
              <span>Total Lab Tests Amount (₹)</span>
              <strong>{formatAmount(labTotal)}</strong>
            </div>
            <div className="summary-row">
              <span>Total Diagnostic Amount (₹)</span>
              <strong>{formatAmount(diagnosticTotal)}</strong>
            </div>
            <div className="summary-row">
              <span>Sub Total (₹)</span>
              <strong>{formatAmount(subtotal)}</strong>
            </div>
            <div className="summary-row">
              <span>Discount (₹)</span>
              <strong>-{formatAmount(discountAmount)}</strong>
            </div>
            <div className="summary-row">
              <span>Tax ({taxPercentage}%) (₹)</span>
              <strong>{formatAmount(taxAmount)}</strong>
            </div>
            <div className="summary-row summary-total">
              <span>Total Amount (₹)</span>
              <strong>{formatAmount(grandTotal)}</strong>
            </div>
            <div className="summary-row summary-paid">
              <span>Paid Amount (₹)</span>
              <strong>{formatAmount(Number(paidAmount || 0))}</strong>
            </div>
            <div className="summary-row summary-balance">
              <span>Balance Amount (₹)</span>
              <strong>{formatAmount(Math.max(balanceAmount, 0))}</strong>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="lab-action-buttons">
            <Button className="btn-generate" type="button" onClick={() => void saveBill()} disabled={savingBill}>
              {savingBill ? "Generating..." : "📄 Generate Bill"}
            </Button>
            <Button className="btn-save-print" type="button" onClick={() => void saveBillAndPrint()} disabled={savingBill}>
              💾 Save & Print
            </Button>
            <Button className="btn-print" variant="secondary" type="button" onClick={() => window.print()}>
              🖨️ Print Bill
            </Button>
            <Button className="btn-email" variant="secondary" type="button" onClick={() => setNotice({ type: "info", message: "Email feature coming soon." })}>
              ✉️ Send via Email
            </Button>
            <Button className="btn-reset" variant="ghost" type="button" onClick={resetForm}>
              ⟲ Reset
            </Button>
          </div>
        </div>

        {/* EXISTING RECORDS */}
        <div className="lab-card lab-services-card provided-services-card">
          <h3>Existing Lab and Diagnostic Records</h3>
          <div className="lab-table-section blue-section" style={{maxHeight: "400px", overflowY: "auto"}}>
            <table className="lab-billing-table">
              <thead>
                <tr><th>Invoice</th><th>UHID</th><th>Patient</th><th>Doctor</th><th>Test</th><th>Amount (₹)</th><th>Paid (₹)</th><th>Due (₹)</th><th>Status</th></tr>
              </thead>
              <tbody>
                {loadingRecords ? (
                  <tr><td colSpan={9} className="lab-empty-row">Loading records...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={9} className="lab-empty-row">No lab or diagnostic records available.</td></tr>
                ) : (
                  records.slice(0, 50).map((record) => (
                    <tr key={record.id}>
                      <td>{record.invoice_no || `DIAG-${record.id}`}</td>
                      <td>{record.patient_id || "-"}</td>
                      <td>{record.patient_name || "-"}</td>
                      <td>{record.doctor_name || "-"}</td>
                      <td>{record.test_name}</td>
                      <td>{formatAmount(Number(record.amount || 0))}</td>
                      <td>{formatAmount(Number(record.paid_amount || 0))}</td>
                      <td>{formatAmount(Number(record.due_amount || 0))}</td>
                      <td><span className={`status-badge status-${record.status || "due"}`}>{record.status || "due"}</span></td>
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
