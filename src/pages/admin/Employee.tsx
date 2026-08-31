import React, { useState, useEffect } from "react";
import { Search, Plus, Calendar, Trash2, X, Lock, Clock, Printer, Eye, EyeOff, Pencil } from "lucide-react";
import { apiFetch } from "../../lib/apiFetch";

const today = new Date().toISOString().split("T")[0];
const EMPTY_EMP = { full_name: "", designation_tag: "", phone_number: "", salary_type_flag: "Monthly", base_compensation_rate: "", joining_date: "", last_working_date: "" };

function getNextSalaryDate(joiningDate: string, salaryType: string): string {
  if (!joiningDate) return "—";
  const now = new Date();
  if (salaryType === "Monthly") {
    const day = new Date(joiningDate).getDate();
    let next = new Date(now.getFullYear(), now.getMonth(), day);
    if (next <= now) next = new Date(now.getFullYear(), now.getMonth() + 1, day);
    return next.toLocaleDateString();
  }
  return "Daily";
}

function deriveEmployeePassword(emp: any): string {
  const rawName = String(emp?.full_name || emp?.name || "").trim();
  const firstName = rawName.split(/\s+/)[0] || "Emp";
  const loginId = String(emp?.login_id || "").trim();
  const suffix = loginId.match(/(\d+)$/)?.[1] || emp?.id?.match(/(\d+)$/)?.[1] || "";
  if (!suffix) return "—";
  return `${firstName}@${suffix}`;
}

export default function AdminEmployee() {
  const [tab, setTab] = useState("directory");
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [loginSessions, setLoginSessions] = useState<any[]>([]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ ...EMPTY_EMP });
  const [addError, setAddError] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [attendanceDate, setAttendanceDate] = useState(today);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const [isLocked, setIsLocked] = useState(false);
  const [adminOverride, setAdminOverride] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [reportEmp, setReportEmp] = useState("");
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportData, setReportData] = useState<any[]>([]);

  const [showPhoneMap, setShowPhoneMap] = useState<Record<string, boolean>>({});
  const togglePhone = (id: string) => setShowPhoneMap(prev => ({ ...prev, [id]: !prev[id] }));
  const [createdCreds, setCreatedCreds] = useState<{ login_id: string; login_password: string; name: string } | null>(null);
  const [editEmp, setEditEmp] = useState<any | null>(null);
  const [editError, setEditError] = useState("");

  const fetchEmployees = () =>
    apiFetch("/api/employees").then(r => r.json()).then(d => setEmployees(Array.isArray(d) ? d : []));

  const fetchSessions = () =>
    apiFetch("/api/employee-sessions").then(r => r.json()).then(d => setLoginSessions(Array.isArray(d) ? d : []));

  const fetchAttendance = (date: string) => {
    apiFetch(`/api/attendance?date=${date}`).then(r => r.json()).then((records: any[]) => {
      const map: Record<string, string> = {};
      (Array.isArray(records) ? records : []).forEach(r => { map[r.employee_id] = r.status_flag; });
      setAttendanceMap(map);
    });
  };

  useEffect(() => {
    fetchEmployees();
    fetchSessions();
    // Load roles from localStorage immediately (set by Settings page on save)
    const cached = localStorage.getItem("accessPermissions");
    if (cached) {
      try { setRoles(Object.keys(JSON.parse(cached))); } catch {}
    }
    // Always fetch fresh from API to stay in sync
    apiFetch("/api/settings").then(r => r.json()).then(data => {
      const perms = data.permissions || {};
      setRoles(Object.keys(perms));
    });
  }, []);

  useEffect(() => {
    const isPast = attendanceDate < today;
    setIsLocked(isPast && !adminOverride);
    fetchAttendance(attendanceDate);
  }, [attendanceDate, adminOverride]);

  const filteredEmployees = employees.filter(e =>
    !search || e.full_name?.toLowerCase().includes(search.toLowerCase()) || e.id?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addSubmitting) return;
    setAddError("");
    if (!/^[A-Za-z\s]+$/.test(addForm.full_name)) { setAddError("Full name must contain alphabetic characters only."); return; }
    if (!/^\d{10}$/.test(addForm.phone_number)) { setAddError("Phone must be exactly 10 digits."); return; }
    if (!addForm.designation_tag) { setAddError("Please select a designation."); return; }
    if (!addForm.base_compensation_rate || Number(addForm.base_compensation_rate) <= 0) { setAddError("Enter a valid compensation rate."); return; }
    if (addForm.last_working_date && addForm.last_working_date <= addForm.joining_date) { setAddError("Last working date must be after joining date."); return; }
    setAddSubmitting(true);
    const res = await apiFetch("/api/employees", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, name: addForm.full_name, base_compensation_rate: Number(addForm.base_compensation_rate) })
    });
    const data = await res.json();
    setAddSubmitting(false);
    setShowAddModal(false);
    setAddForm({ ...EMPTY_EMP });
    fetchEmployees();
    if (data.login_id) setCreatedCreds({ login_id: data.login_id, login_password: data.login_password, name: data.full_name || data.name });
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm("Delete this employee?")) return;
    await apiFetch(`/api/employees/${id}`, { method: "DELETE" });
    fetchEmployees();
  };

  const handleAttendanceChange = (empId: string, status: string) => {
    if (isLocked) return;
    setAttendanceMap(prev => ({ ...prev, [empId]: status }));
  };

  const fetchAttendanceReport = async (empId: string, month: string) => {
    if (!empId || !month) return;
    const res = await apiFetch("/api/attendance");
    const all = await res.json();
    const filtered = (Array.isArray(all) ? all : []).filter((a: any) => a.employee_id === empId && a.calendar_date?.startsWith(month));
    setReportData(filtered);
  };

  const handleSaveAttendance = async () => {
    setSavingAttendance(true);
    await Promise.all(employees.map(emp =>
      apiFetch("/api/attendance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: emp.id, calendar_date: attendanceDate, status_flag: attendanceMap[emp.id] || "Present" })
      })
    ));
    setSavingAttendance(false);
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col min-h-0 flex-1">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <div className="flex gap-2">
            <button onClick={() => setTab("directory")} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === "directory" ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              Employee Directory
            </button>
            <button onClick={() => setTab("attendance")} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === "attendance" ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              Attendance Register
            </button>
            <button onClick={() => { setTab("sessions"); fetchSessions(); }} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === "sessions" ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              Login Sessions
            </button>
            <button onClick={() => setTab("report")} className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${tab === "report" ? "bg-maroon text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              Attendance Report
            </button>
          </div>
          {tab === "directory" && (
            <button onClick={() => { setShowAddModal(true); setAddError(""); setAddForm({ ...EMPTY_EMP }); }}
              className="bg-maroon hover:bg-maroon-light text-white px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2">
              <Plus size={16} /> Add Employee
            </button>
          )}
        </div>

        {tab === "directory" && (
          <>
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input type="text" placeholder="Search employees..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm" />
              </div>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-white border-b border-gray-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4">Emp ID</th>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Login ID</th>
                    <th className="py-3 px-4">Password</th>

                    <th className="py-3 px-4">Salary Type</th>
                    <th className="py-3 px-4">Rate (₹)</th>
                    <th className="py-3 px-4">Joined Date</th>
                    <th className="py-3 px-4">Next Salary</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map(emp => (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-mono text-xs">{emp.id}</td>
                      <td className="py-3 px-4 font-bold text-gray-800">{emp.full_name || emp.name}</td>
                      <td className="py-3 px-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{emp.designation_tag}</span></td>
                      <td className="py-3 px-4 font-mono text-xs font-bold text-maroon">
                        {showPhoneMap[emp.id] ? (emp.login_id || "—") : "••••••"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{showPhoneMap[emp.id] ? deriveEmployeePassword(emp) : "••••••••••"}</span>
                          <button onClick={() => togglePhone(emp.id)} className="text-gray-400 hover:text-maroon">
                            {showPhoneMap[emp.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">{emp.salary_type_flag}</td>
                      <td className="py-3 px-4 font-medium">{emp.base_compensation_rate}</td>
                      <td className="py-3 px-4 text-gray-500">{emp.joining_date}</td>
                      <td className="py-3 px-4 text-xs font-semibold text-maroon">{getNextSalaryDate(emp.joining_date, emp.salary_type_flag)}</td>
                      <td className="py-3 px-4 text-right flex items-center justify-end gap-1">
                        <button onClick={() => { setEditEmp({ ...emp, full_name: emp.full_name || emp.name || "" }); setEditError(""); }} className="text-maroon hover:bg-maroon/10 p-1.5 rounded" title="Edit Employee"><Pencil size={16} /></button>
                        <button onClick={() => handleDeleteEmployee(emp.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {filteredEmployees.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-gray-400 italic">No employees found.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "sessions" && (
          <div className="overflow-auto flex-1 p-4">
            <p className="text-xs text-gray-400 mb-3">All employee login/logout events — use this to check who was active at any given time.</p>
            <table className="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Login Time</th>
                  <th className="py-3 px-4">Logout Time</th>
                  <th className="py-3 px-4">Duration</th>
                </tr>
              </thead>
              <tbody>
                {loginSessions.map((s: any) => {
                  const emp = employees.find(e => e.id === s.employee_id);
                  const loginTime = s.login_time ? new Date(s.login_time) : null;
                  const logoutTime = s.logout_time ? new Date(s.logout_time) : null;
                  const duration = loginTime && logoutTime
                    ? (() => { const m = Math.floor((logoutTime.getTime() - loginTime.getTime()) / 60000); return `${Math.floor(m/60)}h ${m%60}m`; })()
                    : loginTime ? "Active" : "—";
                  return (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 font-bold text-gray-800">{emp?.full_name || emp?.name || s.employee_id}</td>
                      <td className="py-3 px-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{emp?.designation_tag || "—"}</span></td>
                      <td className="py-3 px-4 text-gray-600 text-xs flex items-center gap-1"><Clock size={12} className="text-green-500" />{loginTime ? loginTime.toLocaleString() : "—"}</td>
                      <td className="py-3 px-4 text-gray-600 text-xs">{logoutTime ? logoutTime.toLocaleString() : <span className="text-green-600 font-semibold animate-pulse">● Active</span>}</td>
                      <td className="py-3 px-4 text-xs font-medium">{duration}</td>
                    </tr>
                  );
                })}
                {loginSessions.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-gray-400 italic">No login sessions recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === "report" && (
          <div className="p-4 flex flex-col gap-4">
            <div className="flex gap-3 flex-wrap items-end">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Employee</label>
                <select value={reportEmp} onChange={e => { setReportEmp(e.target.value); fetchAttendanceReport(e.target.value, reportMonth); }}
                  className="block border border-gray-300 rounded px-3 py-2 text-sm mt-1 bg-white min-w-[200px]">
                  <option value="">— Select Employee —</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.full_name || e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Month</label>
                <input type="month" value={reportMonth} onChange={e => { setReportMonth(e.target.value); fetchAttendanceReport(reportEmp, e.target.value); }}
                  className="block border border-gray-300 rounded px-3 py-2 text-sm mt-1" />
              </div>
              {reportData.length > 0 && (
                <button onClick={() => {
                  const emp = employees.find(e => e.id === reportEmp);
                  const w = window.open("", "", "height=600,width=500");
                  if (!w) return;
                  const counts = reportData.reduce((acc: any, r: any) => { acc[r.status_flag] = (acc[r.status_flag] || 0) + 1; return acc; }, {});
                  w.document.write(`<html><head><title>Attendance Report</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head><body>
                    <h2>Attendance Report — ${emp?.full_name || emp?.name}</h2>
                    <p>Month: ${reportMonth} | Total Days: ${reportData.length}</p>
                    <p>Present: ${counts['Present']||0} | Absent: ${counts['Absent']||0} | Half-Day: ${counts['Half-Day']||0} | Paid Leave: ${counts['Paid Leave']||0}</p>
                    <table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>
                    ${reportData.sort((a,b)=>a.calendar_date.localeCompare(b.calendar_date)).map((r:any)=>`<tr><td>${r.calendar_date}</td><td>${r.status_flag}</td></tr>`).join('')}
                    </tbody></table></body></html>`);
                  w.document.close(); setTimeout(() => { w.print(); w.close(); }, 300);
                }} className="flex items-center gap-1 bg-maroon text-white px-3 py-2 rounded text-sm font-semibold hover:bg-maroon-light">
                  <Printer size={14} /> Print Report
                </button>
              )}
            </div>
            {reportData.length > 0 ? (
              <>
                <div className="flex gap-4 text-sm">
                  {Object.entries(reportData.reduce((acc: any, r: any) => { acc[r.status_flag] = (acc[r.status_flag] || 0) + 1; return acc; }, {})).map(([k, v]: any) => (
                    <span key={k} className="bg-gray-100 px-3 py-1 rounded font-semibold">{k}: <strong>{v}</strong></span>
                  ))}
                </div>
                <table className="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                    <tr><th className="py-3 px-4">Date</th><th className="py-3 px-4">Status</th></tr>
                  </thead>
                  <tbody>
                    {reportData.sort((a, b) => a.calendar_date.localeCompare(b.calendar_date)).map((r: any) => (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">{r.calendar_date}</td>
                        <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-xs font-bold ${
                          r.status_flag === "Present" ? "bg-green-100 text-green-700" :
                          r.status_flag === "Absent" ? "bg-red-100 text-red-700" :
                          r.status_flag === "Half-Day" ? "bg-yellow-100 text-yellow-700" : "bg-blue-100 text-blue-700"
                        }`}>{r.status_flag}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="text-gray-400 italic text-sm">{reportEmp ? "No attendance records for this month." : "Select an employee to view report."}</p>}
          </div>
        )}

        {tab === "attendance" && (
          <div className="p-4 flex flex-col flex-1">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2 border border-gray-300 rounded px-3 py-2 bg-white">
                <Calendar size={16} className="text-gray-500" />
                <input type="date" max={today} value={attendanceDate} onChange={e => { setAttendanceDate(e.target.value); setAdminOverride(false); }}
                  className="text-sm border-none focus:outline-none" />
              </div>
              {attendanceDate < today && (
                <button onClick={() => setAdminOverride(v => !v)}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-semibold border transition-colors ${adminOverride ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  <Lock size={14} /> {adminOverride ? "Override Active" : "Admin Override"}
                </button>
              )}
              {isLocked && (
                <span className="text-xs text-red-500 font-semibold flex items-center gap-1"><Lock size={12} /> Past date — locked. Use Admin Override to edit.</span>
              )}
              <button onClick={handleSaveAttendance} disabled={isLocked || savingAttendance}
                className="ml-auto bg-maroon text-white px-4 py-2 rounded text-sm font-semibold hover:bg-maroon-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {savingAttendance ? "Saving..." : "Save Attendance"}
              </button>
            </div>
            <table className="w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
              <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Attendance Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className={`border-b border-gray-100 ${isLocked ? "opacity-60" : "hover:bg-gray-50"}`}>
                    <td className="py-3 px-4 font-bold text-gray-800">{emp.full_name || emp.name} <span className="text-xs font-normal text-gray-500 ml-2">({emp.id})</span></td>
                    <td className="py-3 px-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{emp.designation_tag}</span></td>
                    <td className="py-3 px-4">
                      <select disabled={isLocked} value={attendanceMap[emp.id] || "Present"}
                        onChange={e => handleAttendanceChange(emp.id, e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm bg-white disabled:bg-gray-100 disabled:cursor-not-allowed">
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Half-Day">Half-Day</option>
                        <option value="Paid Leave">Paid Leave (PL)</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {employees.length === 0 && <tr><td colSpan={3} className="py-8 text-center text-gray-400 italic">No employees found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl sticky top-0">
              <h3 className="font-bold text-maroon text-lg">Add Employee</h3>
              <button onClick={() => setShowAddModal(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <form onSubmit={handleAddEmployee} className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Full Name (alphabetic only)</label>
                <input type="text" required value={addForm.full_name} onChange={e => setAddForm(p => ({ ...p, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Designation</label>
                <select required value={addForm.designation_tag} onChange={e => setAddForm(p => ({ ...p, designation_tag: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white">
                  <option value="">— Select Role —</option>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Roles are managed in Settings → Role Management.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Phone (10 digits)</label>
                <input type="text" maxLength={10} required value={addForm.phone_number} onChange={e => setAddForm(p => ({ ...p, phone_number: e.target.value.replace(/\D/g, "") }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Salary Type</label>
                <select value={addForm.salary_type_flag} onChange={e => setAddForm(p => ({ ...p, salary_type_flag: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white">
                  <option value="Monthly">Monthly</option>
                  <option value="Daily">Daily</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Base Compensation Rate (₹)</label>
                <input type="number" min="0" step="0.01" required value={addForm.base_compensation_rate} onChange={e => setAddForm(p => ({ ...p, base_compensation_rate: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Joining Date</label>
                <input type="date" required value={addForm.joining_date} onChange={e => setAddForm(p => ({ ...p, joining_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Last Working Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" value={addForm.last_working_date} onChange={e => setAddForm(p => ({ ...p, last_working_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              {addError && <p className="text-red-500 text-sm">{addError}</p>}
              <button type="submit" disabled={addSubmitting} className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors mt-2 disabled:opacity-60">{addSubmitting ? "Adding..." : "Add Employee"}</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editEmp && (
        <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl sticky top-0">
              <h3 className="font-bold text-maroon text-lg">Edit Employee</h3>
              <button onClick={() => setEditEmp(null)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Full Name</label>
                <input type="text" value={editEmp.full_name} onChange={e => setEditEmp((p: any) => ({ ...p, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Designation</label>
                <select value={editEmp.designation_tag} onChange={e => setEditEmp((p: any) => ({ ...p, designation_tag: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white">
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Phone</label>
                <input type="text" maxLength={10} value={editEmp.phone_number || ""} onChange={e => setEditEmp((p: any) => ({ ...p, phone_number: e.target.value.replace(/\D/g, "") }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Salary Type</label>
                <select value={editEmp.salary_type_flag} onChange={e => setEditEmp((p: any) => ({ ...p, salary_type_flag: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon bg-white">
                  <option value="Monthly">Monthly</option>
                  <option value="Daily">Daily</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Base Compensation Rate (₹)</label>
                <input type="number" min="0" step="0.01" value={editEmp.base_compensation_rate || ""} onChange={e => setEditEmp((p: any) => ({ ...p, base_compensation_rate: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Joining Date</label>
                <input type="date" value={editEmp.joining_date || ""} onChange={e => setEditEmp((p: any) => ({ ...p, joining_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Last Working Date <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="date" value={editEmp.last_working_date || ""} onChange={e => setEditEmp((p: any) => ({ ...p, last_working_date: e.target.value || null }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon" />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <label className="text-xs font-semibold text-gray-600 uppercase">Login ID</label>
                <input type="text" value={editEmp.login_id || ""} onChange={e => setEditEmp((p: any) => ({ ...p, login_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon font-mono" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase">Password</label>
                <input type="text" value={editEmp.login_password || ""} onChange={e => setEditEmp((p: any) => ({ ...p, login_password: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm mt-1 focus:outline-none focus:border-maroon font-mono" />
              </div>
              {editError && <p className="text-red-500 text-sm">{editError}</p>}
              <button onClick={async () => {
                if (!editEmp.full_name.trim()) { setEditError("Full name is required."); return; }
                if (editEmp.phone_number && !/^\d{10}$/.test(editEmp.phone_number)) { setEditError("Phone must be 10 digits."); return; }
                if (!editEmp.login_id?.trim() || !editEmp.login_password?.trim()) { setEditError("Login ID and Password are required."); return; }
                const res = await apiFetch(`/api/employees/${editEmp.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: editEmp.full_name.trim(),
                    full_name: editEmp.full_name.trim(),
                    designation_tag: editEmp.designation_tag,
                    phone_number: editEmp.phone_number || null,
                    salary_type_flag: editEmp.salary_type_flag,
                    base_compensation_rate: Number(editEmp.base_compensation_rate),
                    joining_date: editEmp.joining_date,
                    last_working_date: editEmp.last_working_date || null,
                    login_id: editEmp.login_id.trim(),
                    login_password: editEmp.login_password.trim(),
                  })
                });
                if (!res.ok) { setEditError("Failed to update. Try again."); return; }
                const updated = await res.json();
                setEmployees(prev => prev.map(e => e.id === editEmp.id ? { ...e, ...updated } : e));
                setEditEmp(null);
              }} className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors mt-2">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Modal — shown once after employee creation */}
      {createdCreds && (
        <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-maroon px-6 py-4 flex items-center justify-between">
              <h3 className="font-serif text-lg font-bold text-white">Employee Credentials</h3>
              <button onClick={() => setCreatedCreds(null)} className="text-white/70 hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-500">Share these login credentials with <span className="font-bold text-gray-800">{createdCreds.name}</span>. Save them now — the password won't be shown again.</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Login ID</span>
                  <span className="font-mono font-bold text-maroon text-lg">{createdCreds.login_id}</span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                  <span className="text-xs text-gray-500 uppercase font-semibold">Password</span>
                  <span className="font-mono font-bold text-gray-800 text-lg">{createdCreds.login_password}</span>
                </div>
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">⚠ Note these credentials before closing. The employee uses Login ID as username and this password to log in.</p>
              <button onClick={() => setCreatedCreds(null)} className="w-full bg-maroon text-white font-bold py-2.5 rounded hover:bg-maroon-light transition-colors">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
