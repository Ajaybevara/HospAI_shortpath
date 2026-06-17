import { useEffect, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import DocumentUploadDropzone from "../components/DocumentUploadDropzone";
import MarkdownReport from "../components/MarkdownReport";
import { Alert, Button, Checkbox, Input, Label, Select, Textarea } from "../components/ui";
import {
  API_BASE,
  DOC_TYPES,
  EMPTY_PATIENT_FORM,
  SUPPORTED_DOCUMENT_ACCEPT,
  SUPPORTED_DOCUMENT_EXTENSIONS,
  isSupportedDocumentFile,
} from "../lib/constants";
import { apiFetch, reportError } from "../lib/api";
import type { Notice, Patient, PatientForm } from "../types";

type Props = {
  onCreate: (
    payload: Record<string, unknown>,
    setForm: Dispatch<SetStateAction<PatientForm>>,
    setDuplicateInfo: Dispatch<SetStateAction<any>>,
    refreshPatientId: () => Promise<void>
  ) => Promise<{ patient_id: string; admission_id?: string } | null>;
  selectedPatient: Patient | null;
  ocrLanguage: string;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  onDocumentSaved?: (patientId?: string) => Promise<void>;
};

type OcrResultMap = Record<string, { text?: string; file?: File }>;

const IMAGE_NAME_PATTERN = /\.(png|jpe?g|webp|bmp|gif|tiff?|heic|heif)$/i;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function validatePatientForm(form: PatientForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "First name is required.";
  if (!form.last_name.trim()) errors.last_name = "Last name is required.";
  if (!form.dob && !form.age) errors.age = "Enter date of birth or age.";
  if (form.age && (Number(form.age) < 0 || Number(form.age) > 150)) errors.age = "Age must be between 0 and 150.";
  if (!form.gender.trim()) errors.gender = "Gender is required.";
  if (!form.phone.trim()) errors.phone = "Primary mobile number is required.";
  else if (!/^\d{10}$/.test(form.phone.trim())) errors.phone = "Primary mobile must be exactly 10 digits.";
  if (!form.address.trim()) errors.address = "Address is required.";
  if (!form.marital_status.trim()) errors.marital_status = "Marital status is required.";
  if (!form.nationality.trim()) errors.nationality = "Nationality is required.";
  if (form.family_mobile.trim() && !/^\d{10}$/.test(form.family_mobile.trim())) {
    errors.family_mobile = "Family mobile must be 10 digits if entered.";
  }
  return errors;
}

function calculateAgeFromDob(dob: string): string {
  if (!dob) return "";
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const birthdayPassed = monthDiff > 0 || (monthDiff === 0 && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) {
    age -= 1;
  }
  if (age < 0) return "";
  return String(age);
}

function normalizeDateToIso(raw: string): string | null {
  const cleaned = raw.replace(/[.]/g, "/").replace(/-/g, "/").trim();
  const parts = cleaned.split("/").map((part) => part.trim());
  if (parts.length !== 3) return null;

  let day = 0;
  let month = 0;
  let year = 0;

  if (parts[0].length === 4) {
    year = Number(parts[0]);
    month = Number(parts[1]);
    day = Number(parts[2]);
  } else if (parts[2].length === 4) {
    day = Number(parts[0]);
    month = Number(parts[1]);
    year = Number(parts[2]);
  } else {
    return null;
  }

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = new Date(Date.UTC(year, month - 1, day));
  const valid =
    candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
  if (!valid) return null;

  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (candidate.getTime() > utcToday.getTime()) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractDobFromText(text: string): string | null {
  const labeledPatterns = [
    /(?:date\s*of\s*birth|dob|d\.o\.b)\s*[:\-]?\s*((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})|(?:\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}))/i,
    /(?:birth\s*date)\s*[:\-]?\s*((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})|(?:\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}))/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const iso = normalizeDateToIso(match[1]);
    if (iso) return iso;
  }

  const genericDatePattern = /\b((?:\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})|(?:\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}))\b/g;
  const matches = text.match(genericDatePattern) || [];
  for (const raw of matches) {
    const iso = normalizeDateToIso(raw);
    if (iso) return iso;
  }
  return null;
}

function extractAgeFromText(text: string): string {
  const match = text.match(/(?:age|aged)\s*[:\-]?\s*(\d{1,3})\b/i);
  if (!match?.[1]) return "";
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value < 0 || value > 150) return "";
  return String(value);
}

function OriginalDocumentPreview({ file }: { file?: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!file || !url) {
    return <p className="muted">No source document available.</p>;
  }

  const mime = (file.type || "").toLowerCase();
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = mime.startsWith("image/") || IMAGE_NAME_PATTERN.test(file.name);

  if (isImage) {
    return <img className="ocr-source-image" src={url} alt={file.name} />;
  }

  if (isPdf) {
    return <iframe className="ocr-source-pdf" src={url} title={`Preview ${file.name}`} />;
  }

  return (
    <a className="link" href={url} target="_blank" rel="noreferrer">
      Open original document
    </a>
  );
}

export default function AddPatientPage({ onCreate, selectedPatient, ocrLanguage, setNotice, onDocumentSaved }: Props) {
  const registrationFormId = "patient-registration-form";
  const [form, setForm] = useState<PatientForm>(EMPTY_PATIENT_FORM);
  const [patientId, setPatientId] = useState("");
  const [duplicateInfo, setDuplicateInfo] = useState<any>(null);
  const [docFiles, setDocFiles] = useState<Record<string, File>>({});
  const [ocrResults, setOcrResults] = useState<OcrResultMap>({});
  const [ocrStatus, setOcrStatus] = useState<Record<string, string>>({});
  const [downloadReady, setDownloadReady] = useState<Record<string, Record<string, boolean>>>({});
  const [admissionId, setAdmissionId] = useState(selectedPatient?.admission_id || "");
  const [currentPatientName, setCurrentPatientName] = useState("");
  const [demographicsOcrStatus, setDemographicsOcrStatus] = useState("");
  const [isDemographicsOcrRunning, setIsDemographicsOcrRunning] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);

  const EMPTY_APPOINTMENT_FORM = {
    departmentMaster: "",
    search: "",
    patientType: "",
    appointmentPatientId: "",
    appointmentPatientName: "",
    appointmentDateTime: "",
    department: "",
    doctor: "",
    visitType: "",
    appointmentKind: "",
    chiefComplaint: "",
    bp: "",
    temperature: "",
    pulse: "",
    spo2: "",
    weight: "",
    height: "",
    consultationFee: "",
    paymentMode: "",
    additionalNotes: "",
  };
  const [appointment, setAppointment] = useState(EMPTY_APPOINTMENT_FORM);
  const handleAppointmentChange = (field: keyof typeof EMPTY_APPOINTMENT_FORM) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setAppointment((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const refreshPatientId = async () => {
    try {
      const data = await apiFetch<{ patient_id?: string }>("/api/patients/next-id");
      setPatientId(data.patient_id || "");
    } catch {
      setPatientId("");
    }
  };

  useEffect(() => {
    refreshPatientId();
  }, []);

  useEffect(() => {
    if (selectedPatient?.admission_id) {
      setAdmissionId(selectedPatient.admission_id);
    }
    if (selectedPatient?.name) {
      setCurrentPatientName(`${selectedPatient.name} ${selectedPatient.middle_name || ""} ${selectedPatient.last_name || ""}`.trim());
    }
  }, [selectedPatient]);

  const uploadDocument = async (
    targetPatientId: string,
    docType: string,
    file: File,
    targetAdmissionId?: string,
    ocrText = ""
  ) => {
    const body = new FormData();
    body.append("file", file);
    body.append("doc_type", docType);
    body.append("admission_id", targetAdmissionId || "");
    body.append("ocr_text", ocrText);
    body.append("ocr_language", ocrLanguage);
    const response = await fetch(`${API_BASE}/api/patients/${targetPatientId}/documents`, {
      method: "POST",
      body,
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Document upload failed.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = validatePatientForm(form);
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setNotice({ type: "warning", message: "Please complete the highlighted mandatory patient details." });
      return;
    }
    const allergies = [form.allergy1, form.allergy2, form.allergy3].filter(Boolean).join(", ");
    const payload: Record<string, unknown> = {
      ...form,
      allergies,
    };
    delete payload.allergy1;
    delete payload.allergy2;
    delete payload.allergy3;
    setCurrentPatientName(`${form.name} ${form.middle_name || ""} ${form.last_name}`.trim());
    const createdPatient = await onCreate(payload, setForm, setDuplicateInfo, refreshPatientId);
    if (!createdPatient?.patient_id) return;

    const docsToUpload = DOC_TYPES.filter((doc) => docFiles[doc.value]).map((doc) => doc.value);
    if (docsToUpload.length > 0) {
      let uploadedCount = 0;
      for (const docType of docsToUpload) {
        const file = docFiles[docType];
        if (!file) continue;
        try {
          await uploadDocument(
            createdPatient.patient_id,
            docType,
            file,
            createdPatient.admission_id,
            ocrResults[docType]?.text || ""
          );
          uploadedCount += 1;
        } catch {
          setOcrStatus((prev) => ({ ...prev, [docType]: "Upload failed during registration." }));
        }
      }

      if (uploadedCount > 0) {
        await onDocumentSaved?.(createdPatient.patient_id);
        setNotice({
          type: "success",
          message: `Patient ${createdPatient.patient_id} registered with ${uploadedCount} document${uploadedCount > 1 ? "s" : ""}.`,
        });
      }
    }

    clearSelectedDocuments();
    setValidationErrors({});
    setMatchedPatients([]);
  };

  const handleChange = (field: keyof PatientForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let value = field === "pregnant" ? (event.target as HTMLInputElement).checked : event.target.value;
    if ((field === "phone" || field === "family_mobile") && typeof value === "string") {
      value = onlyDigits(value);
    }
    setValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setForm((prev) => {
      if (field === "dob") {
        return {
          ...prev,
          dob: typeof value === "string" ? value : prev.dob,
          age: typeof value === "string" ? calculateAgeFromDob(value) : prev.age,
        };
      }
      return { ...prev, [field]: value };
    });
  };


  useEffect(() => {
    const query = form.phone.trim() || `${form.name} ${form.last_name}`.trim();
    if (query.length < 3) {
      setMatchedPatients([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      apiFetch<{ patients?: Patient[] }>(`/api/patients?q=${encodeURIComponent(query)}`)
        .then((data) => setMatchedPatients((data.patients || []).slice(0, 5)))
        .catch(() => setMatchedPatients([]));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [form.phone, form.name, form.last_name]);

  const handleFileSelect = (docType: string) => (file: File | null) => {
    if (!file) {
      setDocFiles((prev) => {
        const next = { ...prev };
        delete next[docType];
        return next;
      });
      setOcrResults((prev) => {
        if (!prev[docType]) return prev;
        const next = { ...prev };
        delete next[docType];
        return next;
      });
      setOcrStatus((prev) => ({ ...prev, [docType]: "" }));
      return;
    }

    if (!isSupportedDocumentFile(file)) {
      setOcrStatus((prev) => ({ ...prev, [docType]: "Unsupported file type. Use PDF, JPG, PNG, WEBP, TIFF, BMP, GIF, HEIC, or HEIF." }));
      setDocFiles((prev) => {
        const next = { ...prev };
        delete next[docType];
        return next;
      });
      return;
    }
    setOcrStatus((prev) => ({ ...prev, [docType]: "" }));
    setDocFiles((prev) => ({ ...prev, [docType]: file }));
  };

  const handleOCR = async (docType: string) => {
    const file = docFiles[docType];
    if (!file) return;
    setOcrStatus((prev) => ({ ...prev, [docType]: "Processing OCR..." }));
    const body = new FormData();
    body.append("file", file);
    body.append("language", ocrLanguage);
    body.append("doc_type", docType);

    try {
      const response = await fetch(`${API_BASE}/api/ocr`, { method: "POST", body, credentials: "include" });
      const data = await response.json();
      setOcrResults((prev) => ({
        ...prev,
        [docType]: { text: data.text || "", file },
      }));
      setOcrStatus((prev) => ({ ...prev, [docType]: "OCR complete. You can edit and save." }));
    } catch {
      setOcrStatus((prev) => ({ ...prev, [docType]: "OCR failed." }));
    }
  };

  const saveExtractedDemographicsForPatient = async (targetPatientId: string, dob: string, age: string) => {
    const detail = await apiFetch<{ patient?: Patient }>(`/api/patients/${targetPatientId}`);
    const patient = detail.patient;
    if (!patient) {
      throw new Error("Patient not found while saving OCR demographics.");
    }

    const payload = {
      name: patient.name || selectedPatient?.name || "",
      middle_name: patient.middle_name || selectedPatient?.middle_name || "",
      last_name: patient.last_name || selectedPatient?.last_name || "",
      dob: dob || patient.dob || "",
      age: age || String(patient.age || ""),
      weight: patient.weight == null ? "" : String(patient.weight),
      height: patient.height == null ? "" : String(patient.height),
      gender: patient.gender || "Female",
      pregnant: Boolean(patient.pregnant),
      allergies: patient.allergies || "",
      symptoms: patient.symptoms || "",
      phone: patient.phone || "",
    };

    await apiFetch(`/api/patients/${targetPatientId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await onDocumentSaved?.(targetPatientId);
  };

  const handleDemographicsOCR = async () => {
    const docEntries = DOC_TYPES.map((doc) => ({ docType: doc.value, file: docFiles[doc.value], text: ocrResults[doc.value]?.text || "" })).filter(
      (item) => item.file || item.text
    );
    if (docEntries.length === 0) {
      setDemographicsOcrStatus("Upload at least one document first.");
      return;
    }

    setIsDemographicsOcrRunning(true);
    setDemographicsOcrStatus("Processing OCR for DOB/Age...");

    try {
      let extractedDob = "";
      let extractedAge = "";

      for (const entry of docEntries) {
        let text = entry.text;
        if (!text && entry.file) {
          const body = new FormData();
          body.append("file", entry.file);
          body.append("language", ocrLanguage);
          body.append("doc_type", entry.docType);
          const response = await fetch(`${API_BASE}/api/ocr`, { method: "POST", body, credentials: "include" });
          if (!response.ok) {
            continue;
          }
          const data = await response.json();
          text = data.text || "";
          setOcrResults((prev) => ({
            ...prev,
            [entry.docType]: { text, file: entry.file },
          }));
        }

        if (!text) continue;
        if (!extractedDob) extractedDob = extractDobFromText(text) || "";
        if (!extractedAge) extractedAge = extractAgeFromText(text);
        if (extractedDob && !extractedAge) {
          extractedAge = calculateAgeFromDob(extractedDob);
        }
        if (extractedDob || extractedAge) break;
      }

      if (!extractedDob && !extractedAge) {
        setDemographicsOcrStatus("OCR completed, but DOB/Age was not detected.");
        return;
      }

      setForm((prev) => ({
        ...prev,
        dob: extractedDob || prev.dob,
        age: extractedAge || prev.age,
      }));

      if (selectedPatient?.patient_id) {
        await saveExtractedDemographicsForPatient(selectedPatient.patient_id, extractedDob, extractedAge);
        setDemographicsOcrStatus("DOB/Age extracted and saved to database.");
      } else {
        setDemographicsOcrStatus("DOB/Age extracted. They will be saved when you register the patient.");
      }
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Failed to process demographic OCR.");
      setDemographicsOcrStatus("Failed to process DOB/Age OCR.");
    } finally {
      setIsDemographicsOcrRunning(false);
    }
  };

  const handleOcrTextChange = (docType: string) => (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setOcrResults((prev) => ({
      ...prev,
      [docType]: { ...prev[docType], text: value },
    }));
  };

  const handleSaveDoc = async (docType: string) => {
    const ocrEntry = ocrResults[docType];
    if (!selectedPatient?.patient_id || !ocrEntry?.text || !ocrEntry?.file) return;
    const body = new FormData();
    body.append("file", ocrEntry.file);
    body.append("doc_type", docType);
    body.append("admission_id", admissionId || "");
    body.append("ocr_text", ocrEntry.text);
    body.append("ocr_language", ocrLanguage);
    try {
      const response = await fetch(`${API_BASE}/api/patients/${selectedPatient.patient_id}/documents`, {
        method: "POST",
        body,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Document upload failed.");
      }
      setDownloadReady((prev) => ({ ...prev, [docType]: { pdf: false, word: false } }));
      await onDocumentSaved?.(selectedPatient.patient_id);
      setNotice({ type: "success", message: "Document saved." });
    } catch (error) {
      reportError(setNotice, error as { message?: string; status?: number }, "Failed to save document.");
    }
  };

  const handlePrepareDownload = (docType: string, kind: "pdf" | "word") => {
    setDownloadReady((prev) => ({
      ...prev,
      [docType]: { ...(prev[docType] || {}), [kind]: true },
    }));
  };

  const handleDownload = async (docType: string, kind: "pdf" | "word") => {
    const ocrEntry = ocrResults[docType];
    if (!ocrEntry?.text) return;
    const payload = {
      patient_name: currentPatientName || "Patient",
      doc_type: docType,
      ocr_text: ocrEntry.text,
    };
    const response = await fetch(`${API_BASE}/api/export/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedPatient?.patient_id || "document"}_${docType}.${kind === "pdf" ? "pdf" : "docx"}`;
    link.click();
    window.URL.revokeObjectURL(url);
    setDownloadReady((prev) => ({
      ...prev,
      [docType]: { ...(prev[docType] || {}), [kind]: false },
    }));
  };

  const clearOcrEntry = (docType: string) => {
    setOcrResults((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
    setDownloadReady((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
  };

  const clearSelectedDocuments = () => {
    setOcrResults({});
    setDocFiles({});
    setDownloadReady({});
    setOcrStatus({});
    setDemographicsOcrStatus("");
  };

  const handleClearForm = () => {
    setForm(EMPTY_PATIENT_FORM);
    setDuplicateInfo(null);
    setValidationErrors({});
    setMatchedPatients([]);
    setAppointment(EMPTY_APPOINTMENT_FORM);
    void refreshPatientId();
    clearSelectedDocuments();
  };

  return (
    <section className="form-layout patient-registration-module">
      <div className="panel patient-registration-card">
        <h3>Patient Registration</h3>
        <p className="muted">Patient ID: {patientId || "Will be generated on save"}</p>
        {duplicateInfo && <Alert variant="warning">Possible duplicate found: {duplicateInfo.name} {duplicateInfo.last_name} (ID: {duplicateInfo.patient_id})</Alert>}
        {matchedPatients.length > 0 && <Alert variant="warning">Existing matching profile found: {matchedPatients[0].patient_id} · {matchedPatients[0].name} {matchedPatients[0].last_name} · {matchedPatients[0].phone || "No phone"}</Alert>}
        <form id={registrationFormId} className="grid-form patient-grid-form exact-patient-form" onSubmit={handleSubmit}>
          <Label>First Name *<Input value={form.name} onChange={handleChange("name")} required placeholder="Enter first name" />{validationErrors.name && <span className="field-error">{validationErrors.name}</span>}</Label>
          <Label>Middle Name<Input value={form.middle_name} onChange={handleChange("middle_name")} placeholder="Enter middle name (optional)" /></Label>
          <Label>Last Name *<Input value={form.last_name} onChange={handleChange("last_name")} required placeholder="Enter last name" />{validationErrors.last_name && <span className="field-error">{validationErrors.last_name}</span>}</Label>
          <Label>Date of Birth *<Input type="date" value={form.dob} onChange={handleChange("dob")} /></Label>
          <Label>Age *<Input type="number" value={form.age} onChange={handleChange("age")} placeholder="Enter age if DOB unknown" />{validationErrors.age && <span className="field-error">{validationErrors.age}</span>}</Label>
          <Label>Gender *<Select value={form.gender} onChange={handleChange("gender")}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></Select>{validationErrors.gender && <span className="field-error">{validationErrors.gender}</span>}</Label>
          <Label>Marital Status *<Select value={form.marital_status} onChange={handleChange("marital_status")}><option value="">Select marital status</option><option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option></Select>{validationErrors.marital_status && <span className="field-error">{validationErrors.marital_status}</span>}</Label>
          <Label>Nationality *<Select value={form.nationality} onChange={handleChange("nationality")}><option value="">Select nationality</option><option>Indian</option><option>NRI</option><option>Other</option></Select>{validationErrors.nationality && <span className="field-error">{validationErrors.nationality}</span>}</Label>
          <Label>Primary Mobile *<Input value={form.phone} onChange={handleChange("phone")} placeholder="10-digit mobile number" inputMode="numeric" maxLength={10} />{validationErrors.phone && <span className="field-error">{validationErrors.phone}</span>}</Label>
          <Label>Email (optional)<Input type="email" value={form.email || ""} onChange={handleChange("email" as keyof PatientForm)} placeholder="Enter email address" /></Label>
          <Label>Alternate Mobile (optional)<Input value={form.family_mobile} onChange={handleChange("family_mobile")} placeholder="Enter alternate mobile number" inputMode="numeric" maxLength={10} />{validationErrors.family_mobile && <span className="field-error">{validationErrors.family_mobile}</span>}</Label>
          <Label>Address *<Textarea value={form.address} onChange={handleChange("address")} rows={2} placeholder="Enter complete address" />{validationErrors.address && <span className="field-error">{validationErrors.address}</span>}</Label>
          <Label>Emergency Contact Name<Input value={form.emergency_contact} onChange={handleChange("emergency_contact")} placeholder="Guardian / family member name" /></Label>
          <Label>Relationship<Select value={form.emergency_relation} onChange={handleChange("emergency_relation")}><option value="">Select relationship</option><option>Father</option><option>Mother</option><option>Spouse</option><option>Son</option><option>Daughter</option><option>Friend</option><option>Other</option></Select></Label>
          <Label>Emergency Contact Mobile<Input value={form.emergency_mobile || ""} onChange={handleChange("emergency_mobile" as keyof PatientForm)} placeholder="10-digit mobile number" inputMode="numeric" maxLength={10} /></Label>
          <Label>Allergy 1<Input value={form.allergy1} onChange={handleChange("allergy1")} placeholder="e.g., Penicillin" /></Label>
          <Label>Allergy 2 (optional)<Input value={form.allergy2} onChange={handleChange("allergy2")} placeholder="e.g., Gluten" /></Label>
          <Label>Allergy 3 (optional)<Input value={form.allergy3} onChange={handleChange("allergy3")} placeholder="e.g., Pollen" /></Label>
          <Label>Medical History / Chronic Illness (optional)<Input value={form.medical_history || ""} onChange={handleChange("medical_history" as keyof PatientForm)} placeholder="e.g., Diabetes, Hypertension" /></Label>
          <Label>Current Medication (optional)<Input value={form.current_medication || ""} onChange={handleChange("current_medication" as keyof PatientForm)} placeholder="e.g., Atorvastatin" /></Label>
          <Label>Blood Group (optional)<Select value={form.blood_group || ""} onChange={handleChange("blood_group" as keyof PatientForm)}><option value="">Select blood group</option><option>A+</option><option>A-</option><option>B+</option><option>B-</option><option>AB+</option><option>AB-</option><option>O+</option><option>O-</option></Select></Label>
          <Label className="span-3">Symptoms<Textarea value={form.symptoms} onChange={handleChange("symptoms")} rows={3} placeholder="Symptoms / visit notes" /></Label>
        </form>
        <div className="form-actions patient-form-actions patient-actions-bottom"><Button variant="primary" type="submit" form={registrationFormId}>Register Patient</Button><Button variant="secondary" type="button" onClick={handleClearForm}>Clear</Button></div>
      </div>
      <div className="appointment-shell">
        <div className="appointment-title-bar">Appointment In</div>
        <div className="panel patient-registration-card appointment-card"><h3>Department Master</h3><Input value={appointment.departmentMaster} onChange={handleAppointmentChange("departmentMaster")} placeholder="Add new department" /><div className="form-actions"><Button variant="secondary" type="button">Add Department</Button></div></div>
        <div className="panel patient-registration-card appointment-card"><h3>Patient Search & Appointment Intake</h3><Input value={appointment.search} onChange={handleAppointmentChange("search")} placeholder="Search by Patient ID / Mobile / Aadhaar / Name" /><div className="form-actions"><Button variant="secondary" type="button" onClick={handleSearchPatient}>Search Patient</Button><Button variant="ghost" type="button" onClick={() => setAppointment(EMPTY_APPOINTMENT_FORM)}>New Patient</Button></div></div>
        <div className="panel patient-registration-card appointment-card"><h3>Schedule Appointment</h3><div className="grid-form appointment-grid-form">
          <Label>Patient Type<Select value={appointment.patientType} onChange={handleAppointmentChange("patientType")}><option>New Patient</option><option>Existing Patient</option></Select></Label><Label>Patient ID<Input value={appointment.appointmentPatientId} onChange={handleAppointmentChange("appointmentPatientId")} placeholder="Auto-filled for existing patient" /></Label><Label>Patient Name<Input value={appointment.appointmentPatientName} onChange={handleAppointmentChange("appointmentPatientName")} placeholder="Walk-in or existing patient" /></Label><Label>Appointment Date & Time<Input type="datetime-local" value={appointment.appointmentDateTime} onChange={handleAppointmentChange("appointmentDateTime")} /></Label><Label>Department<Select value={appointment.department} onChange={handleAppointmentChange("department")}><option value="">Select department</option><option>General Medicine</option><option>Pathology</option><option>Cardiology</option><option>Orthopedics</option></Select></Label><Label>Doctor<Input value={appointment.doctor} onChange={handleAppointmentChange("doctor")} placeholder="Type doctor name (guest allowed)" /></Label><Label>Visit Type<Select value={appointment.visitType} onChange={handleAppointmentChange("visitType")}><option>OP</option><option>IP</option><option>Emergency</option></Select></Label><Label>Appointment Kind<Select value={appointment.appointmentKind} onChange={handleAppointmentChange("appointmentKind")}><option>New</option><option>Follow Up</option><option>Review</option></Select></Label><Label className="span-2">Chief Complaint / Reason for Visit<Textarea value={appointment.chiefComplaint} onChange={handleAppointmentChange("chiefComplaint")} rows={3} placeholder="Fever since 3 days, body pains, headache..." /></Label><Label>BP<Input value={appointment.bp} onChange={handleAppointmentChange("bp")} placeholder="120/80" /></Label><Label>Temperature<Input value={appointment.temperature} onChange={handleAppointmentChange("temperature")} placeholder="98.6 F" /></Label><Label>Pulse<Input value={appointment.pulse} onChange={handleAppointmentChange("pulse")} placeholder="72 bpm" /></Label><Label>SPO2<Input value={appointment.spo2} onChange={handleAppointmentChange("spo2")} placeholder="98%" /></Label><Label>Weight (kg)<Input value={appointment.weight} onChange={handleAppointmentChange("weight")} /></Label><Label>Height (cm)<Input value={appointment.height} onChange={handleAppointmentChange("height")} /></Label><Label>Consultation Fee<Input value={appointment.consultationFee} onChange={handleAppointmentChange("consultationFee")} placeholder="0" /></Label><Label>Payment Mode<Select value={appointment.paymentMode} onChange={handleAppointmentChange("paymentMode")}><option>UPI</option><option>Cash</option><option>Card</option><option>Razorpay</option></Select></Label><Label className="span-2">Additional Notes<Textarea value={appointment.additionalNotes} onChange={handleAppointmentChange("additionalNotes")} rows={3} /></Label>
        </div><div className="form-actions appointment-actions"><Button variant="secondary" type="button">Save Appointment & Generate Token</Button><Button variant="primary" type="button">Pay via Razorpay & Schedule</Button><Button variant="ghost" type="button">Print Token</Button></div><p className="muted">Razorpay payments are disabled until backend keys are configured.</p></div>
      </div>
    </section>
  );
}
