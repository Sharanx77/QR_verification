import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Activity, Building2, ChevronLeft, ChevronRight, Download, History, LayoutDashboard, LogIn, LogOut, Menu, QrCode, Search, ShieldCheck, Upload, UserPlus, Users } from "lucide-react";
import QRCode from "qrcode";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import toast from "react-hot-toast";
import { api } from "./api";

type Organizer = { id: string; username: string; role: "administrator" | "organizer"; is_active: boolean };

function Header({ organizer }: { organizer?: Organizer }) {
  return <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6"><Link to="/" className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-navy-950 text-white"><Building2 size={20}/></div><div><p className="text-sm font-bold text-navy-950">College Inauguration</p><p className="text-xs text-slate-500">Attendance Portal</p></div></Link><nav className="flex items-center gap-2"><Link to="/" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block">Home</Link><Link to="/participant" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:block">Participant Access</Link><Link to={organizer ? "/admin" : "/login"} className="button-primary h-10 px-4 text-sm"><LogIn size={16}/>{organizer ? "Dashboard" : "Admin Login"}</Link></nav></div></header>;
}

function Home() {
  return <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><section className="grid min-h-[520px] items-center gap-10 rounded-3xl bg-navy-950 px-6 py-14 text-white sm:px-12 lg:grid-cols-[1.15fr_.85fr]"><div><span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest">Inauguration 2026</span><h1 className="mt-6 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">Secure attendance, simplified.</h1><p className="mt-5 max-w-xl text-lg text-slate-300">Generate your unique entry QR or open the organizer console to verify registered participants.</p><div className="mt-8 flex flex-wrap gap-3"><Link to="/participant" className="button h-12 bg-white px-6 text-navy-950 hover:bg-slate-100">Get My QR <QrCode size={18}/></Link><Link to="/login" className="button h-12 border border-white/25 px-6 text-white hover:bg-white/10">Organizer Login</Link></div></div><div className="mx-auto grid h-72 w-72 place-items-center rounded-full border border-white/10 bg-white/[0.04] sm:h-80 sm:w-80"><div className="grid h-52 w-52 place-items-center rounded-3xl border border-white/15 bg-white/10"><QrCode size={150} strokeWidth={1.2}/></div></div></section></main>;
}

function Participant() {
  const [usn, setUsn] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ usn: string; token: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (result && canvasRef.current) QRCode.toCanvas(canvasRef.current, result.token, { width: 300, margin: 2 }).catch(() => toast.error("Could not render QR")); }, [result]);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setResult(null); try { setResult(await api<{ usn: string; token: string }>("/participant/qr", { method: "POST", body: JSON.stringify({ usn }) })); } catch (error) { toast.error(error instanceof Error ? error.message : "QR generation failed"); } finally { setLoading(false); } }
  function download() { if (!canvasRef.current || !result) return; const link = document.createElement("a"); link.download = `${result.usn}-QR.png`; link.href = canvasRef.current.toDataURL("image/png"); link.click(); }
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6"><div className="card px-5 py-8 sm:px-10"><div className="text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-navy-950"><QrCode size={24}/></div><h1 className="mt-4 text-2xl font-bold text-navy-950">Participant QR Access</h1><p className="mt-2 text-sm text-slate-500">Enter your registered USN to retrieve your entry QR.</p></div><form onSubmit={submit} className="mx-auto mt-8 max-w-md"><label className="mb-2 block text-sm font-semibold text-slate-700">USN</label><input className="input uppercase" value={usn} onChange={e => setUsn(e.target.value)} placeholder="Example: USN220001" required/><button className="button-primary mt-4 w-full" disabled={loading || !usn.trim()}><QrCode size={18}/>{loading ? "Checking..." : "Generate My QR"}</button></form>{result && <section className="mt-8 border-t border-slate-200 pt-8 text-center"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Your USN</p><p className="mt-1 text-xl font-bold text-navy-950">{result.usn}</p><canvas ref={canvasRef} className="mx-auto mt-5 max-w-full rounded-xl border border-slate-200 p-3"/><button onClick={download} className="button-primary mt-5"><Download size={18}/>Download QR</button></section>}</div></main>;
}

function Login({ onLogin }: { onLogin: (organizer: Organizer) => void }) {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setLoading(true); try { const data = await api<{ organizer: Organizer }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }); onLogin(data.organizer); toast.success("Signed in"); navigate("/admin"); } catch (error) { toast.error(error instanceof Error ? error.message : "Login failed"); } finally { setLoading(false); } }
  return <main className="grid min-h-[calc(100vh-64px)] place-items-center px-4"><form onSubmit={submit} className="card w-full max-w-md p-7"><div className="grid h-11 w-11 place-items-center rounded-xl bg-navy-950 text-white"><ShieldCheck size={22}/></div><h1 className="mt-5 text-2xl font-bold text-navy-950">Organizer Login</h1><p className="mt-1 text-sm text-slate-500">Authorized college staff only</p><label className="mt-7 block text-sm font-semibold">Username</label><input className="input mt-2" value={username} onChange={e => setUsername(e.target.value)} required/><label className="mt-4 block text-sm font-semibold">Password</label><input className="input mt-2" type="password" value={password} onChange={e => setPassword(e.target.value)} required/><button className="button-primary mt-6 w-full" disabled={loading}>{loading ? "Signing in..." : "Sign In"}</button></form></main>;
}

const navItems = [
  ["Overview", "overview", LayoutDashboard],
  ["Upload Participants", "upload", Upload],
  ["Participant Database", "participants", Users],
  ["QR Scanner", "scanner", QrCode],
  ["Attendance Records", "attendance", Activity],
  ["Scan History", "history", History],
  ["Organizer Management", "organizers", UserPlus]
] as const;

function StatCard({ title, value, icon: Icon }: { title: string; value: number | string; icon: typeof Users }) {
  return <div className="card p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{title}</p><p className="mt-2 text-3xl font-bold text-navy-950">{value}</p></div><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-navy-800"><Icon size={20}/></div></div></div>;
}

function Overview() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api<any>("/organizer/overview").then(setStats).catch(error => toast.error(error.message)); }, []);
  if (!stats) return <p className="text-sm text-slate-500">Loading overview...</p>;
  return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><StatCard title="Eligible participants" value={stats.totalEligible} icon={Users}/><StatCard title="QR codes generated" value={stats.totalQrGenerated} icon={QrCode}/><StatCard title="Checked in" value={stats.checkedIn} icon={ShieldCheck}/><StatCard title="Remaining" value={stats.remaining} icon={Activity}/><StatCard title="Duplicate attempts" value={stats.duplicateAttempts} icon={History}/><StatCard title="Attendance" value={`${stats.attendancePercentage}%`} icon={LayoutDashboard}/></div><div className="card mt-5 p-6"><div className="flex justify-between text-sm"><strong>Attendance progress</strong><span>{stats.checkedIn} / {stats.totalEligible}</span></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-navy-800" style={{ width: `${stats.attendancePercentage}%` }}/></div></div></>;
}

function UploadParticipants() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [manualUsn, setManualUsn] = useState("");

  async function addManual(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/organizer/participants/manual", { method: "POST", body: JSON.stringify({ usn: manualUsn }) });
      toast.success("Participant added");
      setManualUsn("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add participant");
    }
  }

  async function previewUpload() {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      setPreview(await api("/organizer/participants/preview", { method: "POST", body: form }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    }
  }

  async function confirmImport() {
    if (!file) return;
    setImporting(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await api<any>("/organizer/participants/import", { method: "POST", body: form });
      toast.success(`Imported ${result.imported} participants`);
      setPreview(null);
      setFile(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <section className="card p-6">
        <h2 className="text-lg font-bold">Bulk USN Upload</h2>
        <p className="mt-1 text-sm text-slate-500">Upload a CSV or Excel file with a single <strong>USN</strong> column.</p>
        <label className="mt-6 flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
          <Upload size={32} className="text-slate-400"/>
          <span className="mt-3 text-sm font-bold">{file?.name || "Choose CSV, XLS, or XLSX"}</span>
          <input type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}/>
        </label>
        <div className="mt-4 flex gap-3">
          <button onClick={previewUpload} disabled={!file} className="button-primary">Preview Import</button>
          <a href="/sample_participant_template.csv" download className="button-secondary"><Download size={16}/>Download Template</a>
        </div>
      </section>
      {preview && (
        <aside className="card p-6">
          <h3 className="font-bold">Import Preview</h3>
          <div className="mt-4 space-y-3 text-sm">
            {[["Total rows", preview.totalRows], ["Valid USNs", preview.validUsns], ["Duplicate USNs", preview.duplicateUsns], ["Invalid entries", preview.invalidEntries], ["Already existing", preview.alreadyExisting]].map(([label, value]) =>
              <div key={label as string} className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">{label}</span><strong>{value}</strong></div>
            )}
          </div>
          {preview.preview?.length > 0 && <p className="mt-4 text-xs text-slate-500">First entries: {preview.preview.join(", ")}</p>}
          <button onClick={confirmImport} disabled={importing || preview.validUsns === 0} className="button-primary mt-5 w-full">{importing ? "Importing..." : "Confirm Import"}</button>
        </aside>
      )}
      <form onSubmit={addManual} className="card p-6 lg:col-start-2">
        <h3 className="font-bold">Add Individual USN</h3>
        <label className="mt-4 block text-sm font-semibold">USN</label>
        <input className="input mt-2 uppercase" value={manualUsn} onChange={e => setManualUsn(e.target.value)} placeholder="USN220001" required/>
        <button className="button-primary mt-4 w-full">Add Participant</button>
      </form>
    </div>
  );
}

function ParticipantsTable() {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [page, setPage] = useState(1);
  const [data, setData] = useState<{ participants: any[]; total: number }>({ participants: [], total: 0 });
  useEffect(() => { api<{ participants: any[]; total: number }>(`/organizer/participants?page=${page}&limit=25&search=${encodeURIComponent(search)}&status=${status}`).then(setData).catch(error => toast.error(error.message)); }, [page, search, status]);
  const pages = Math.max(1, Math.ceil(data.total / 25));
  return <section className="card overflow-hidden"><div className="flex flex-wrap gap-3 border-b border-slate-200 p-4"><div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18}/><input className="input pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search USN"/></div>  <select className="input w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="all">All statuses</option><option value="present">Present</option><option value="absent">Absent</option></select><a href="/api/organizer/export/participants" className="button-secondary h-12"><Download size={16}/>Export CSV</a></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Serial","USN","QR Status","Attendance","Check-in Time","Verified By"].map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{data.participants.map((row, i) => <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3">{(page - 1) * 25 + i + 1}</td><td className="px-4 py-3 font-bold">{row.usn}</td><td className="px-4 py-3">{row.qrStatus}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${row.attendanceStatus === "PRESENT" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>{row.attendanceStatus}</span></td><td className="px-4 py-3">{row.checkedInAt ? new Date(row.checkedInAt).toLocaleString() : "-"}</td><td className="px-4 py-3">{row.verifiedBy || "-"}</td></tr>)}</tbody></table></div>{!data.participants.length && <p className="p-8 text-center text-sm text-slate-500">No participants found.</p>}<div className="flex items-center justify-between border-t border-slate-200 p-4"><span className="text-sm text-slate-500">{data.total} participants</span><div className="flex gap-2"><button className="button-secondary h-9 px-3" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={16}/></button><span className="grid h-9 min-w-9 place-items-center text-sm">{page}/{pages}</span><button className="button-secondary h-9 px-3" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={16}/></button></div></div></section>;
}

function Scanner() {
  const [token, setToken] = useState(""); const [result, setResult] = useState<any>(null); const [cameras, setCameras] = useState<Array<{id:string;label:string}>>([]); const [cameraId,setCameraId]=useState(""); const [scanning,setScanning]=useState(false);
  const scannerRef = useRef<Html5Qrcode|null>(null); const cooldownRef=useRef(false);
  useEffect(()=>{ Html5Qrcode.getCameras().then(devices=>setCameras(devices.map(d=>({id:d.id,label:d.label})))).catch(()=>{}); return ()=>{ if(scannerRef.current?.isScanning) scannerRef.current.stop().catch(()=>{}); }; },[]);
  async function verify(value:string){ if(!value||cooldownRef.current)return; cooldownRef.current=true; try{setResult(await api("/organizer/verify",{method:"POST",body:JSON.stringify({token:value})}));}catch(error){setResult({status:"error",message:error instanceof Error?error.message:"Verification failed. Please retry.",usn:null});}setTimeout(()=>{cooldownRef.current=false;},1600);}
  async function start(){ const scanner=scannerRef.current??new Html5Qrcode("qr-reader",{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false}); scannerRef.current=scanner; try{await scanner.start(cameraId?{deviceId:{exact:cameraId}}:{facingMode:"environment"},{fps:10,qrbox:{width:250,height:250}},text=>verify(text),()=>{});setScanning(true);}catch{toast.error("Camera unavailable. Use HTTPS or allow camera permission.");}}
  async function stop(){if(scannerRef.current?.isScanning)await scannerRef.current.stop();setScanning(false);}
  const tone=result?.status==="valid"?"border-green-200 bg-green-50 text-green-800":result?.status==="duplicate"?"border-red-200 bg-red-50 text-red-800":"border-amber-200 bg-amber-50 text-amber-800";
  async function manual(event:FormEvent){event.preventDefault();await verify(token);}
  return <div className="grid gap-5 xl:grid-cols-[1fr_380px]"><section className="card p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Camera Scanner</h2>{cameras.length>1&&<select className="input h-10 max-w-xs" value={cameraId} onChange={e=>setCameraId(e.target.value)}><option value="">Default camera</option>{cameras.map(c=><option key={c.id} value={c.id}>{c.label||c.id}</option>)}</select>}</div><div id="qr-reader" className="mx-auto min-h-[280px] max-w-xl overflow-hidden rounded-xl bg-slate-950"/><div className="mt-4">{!scanning?<button onClick={start} className="button-primary"><QrCode size={18}/>Start Scanner</button>:<button onClick={stop} className="button-secondary">Stop Scanner</button>}</div></section><aside className="space-y-5">{result&&<div className={`rounded-2xl border p-5 ${tone}`}><p className="text-xl font-bold">{result.message}</p>{result.usn&&<p className="mt-3 font-bold">USN: {result.usn}</p>}<p className="mt-2 text-sm">Status: {result.status==="valid"?"PRESENT":result.status==="duplicate"?"ALREADY CHECKED IN":"NOT VERIFIED"}</p>{result.verifiedBy&&<p className="mt-1 text-sm">Verified by: {result.verifiedBy}</p>}{result.checkedInAt&&<p className="mt-1 text-sm">Check-in: {new Date(result.checkedInAt).toLocaleString()}</p>}{result.previousSuccessfulCheckIns>0&&<p className="mt-1 text-sm">Previous successful check-ins: {result.previousSuccessfulCheckIns}</p>}<button className="button-secondary mt-4" onClick={()=>setResult(null)}>Clear Result</button></div>}<form onSubmit={manual} className="card p-5"><h3 className="font-bold">Manual Verification</h3><input className="input mt-3" value={token} onChange={e=>setToken(e.target.value)} placeholder="USN or QR token"/><button className="button-primary mt-3 w-full">Verify</button></form></aside></div>;
}

function SimpleList({ kind }: { kind:"attendance"|"history" }) {
  const [data,setData]=useState<any[]>([]);
  useEffect(()=>{api<any>(kind==="attendance"?"/organizer/attendance?limit=200":"/organizer/scan-history?limit=200").then(value=>setData(kind==="attendance"?value.attendance:value.logs)).catch(error=>toast.error(error.message));},[kind]);
  return <section className="card overflow-hidden">{kind==="attendance"&&<div className="flex justify-end border-b border-slate-200 p-3"><a href="/api/organizer/export/attendance" className="button-secondary h-10"><Download size={16}/>Export CSV</a></div>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{(kind==="attendance"?["USN","Check-in time","Verified by"]:["USN","Token","Organizer","Time","Result","Type"]).map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{data.map((row:any)=><tr key={row.id} className="border-t border-slate-100">{kind==="attendance"?<><td className="px-4 py-3 font-bold">{row.participants?.usn||"-"}</td><td className="px-4 py-3">{new Date(row.checked_in_at).toLocaleString()}</td><td className="px-4 py-3">{row.organizers?.username||"-"}</td></>:<><td className="px-4 py-3 font-bold">{row.participants?.usn||"-"}</td><td className="px-4 py-3">{row.qr_token_identifier||"-"}</td><td className="px-4 py-3">{row.organizers?.username||"-"}</td><td className="px-4 py-3">{new Date(row.scanned_at).toLocaleString()}</td><td className="px-4 py-3">{row.result}</td><td className="px-4 py-3">{row.successful?"Successful":"Duplicate/Invalid"}</td></>}</tr>)}</tbody></table></div>{!data.length&&<p className="p-8 text-center text-sm text-slate-500">No records found.</p>}</section>;
}

function OrganizerManagement() {
  const [organizers,setOrganizers]=useState<any[]>([]); const [username,setUsername]=useState(""); const [password,setPassword]=useState(""); const [role,setRole]=useState("organizer");
  async function load(){try{setOrganizers((await api<{organizers:any[]}>("/organizer/organizers")).organizers);}catch(error:any){toast.error(error.message);}}
  useEffect(()=>{load();},[]);
  async function add(event:FormEvent){event.preventDefault();try{await api("/organizer/organizers",{method:"POST",body:JSON.stringify({username,password,role})});toast.success("Organizer added");setUsername("");setPassword("");load();}catch(error){toast.error(error instanceof Error?error.message:"Could not add organizer");}}
  async function toggle(row:any){try{await api(`/organizer/organizers/${row.id}`,{method:"PATCH",body:JSON.stringify({is_active:!row.is_active})});load();}catch(error){toast.error(error instanceof Error?error.message:"Could not update");}}
  return <div className="grid gap-5 lg:grid-cols-[380px_1fr]"><form onSubmit={add} className="card h-fit p-5"><h2 className="font-bold">Add Organizer</h2><label className="mt-4 block text-sm font-semibold">Username</label><input className="input mt-2" value={username} onChange={e=>setUsername(e.target.value)} required/><label className="mt-4 block text-sm font-semibold">Password</label><input className="input mt-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><label className="mt-4 block text-sm font-semibold">Role</label><select className="input mt-2" value={role} onChange={e=>setRole(e.target.value)}><option value="organizer">Organizer</option><option value="administrator">Administrator</option></select><button className="button-primary mt-5 w-full">Create Account</button></form><section className="card overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Username</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{organizers.map(row=><tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3 font-bold">{row.username}</td><td className="px-4 py-3">{row.role}</td><td className="px-4 py-3">{row.is_active?"Active":"Disabled"}</td><td className="px-4 py-3"><button onClick={()=>toggle(row)} className="button-secondary h-9 px-3">{row.is_active?"Disable":"Enable"}</button></td></tr>)}</tbody></table></section></div>;
}

function AdminDashboard({ organizer,setOrganizer }:{organizer:Organizer;setOrganizer:(value?:Organizer)=>void}) {
  const [section,setSection]=useState("overview"); const [open,setOpen]=useState(false); const navigate=useNavigate();
  async function logout(){await api("/auth/logout",{method:"POST"});setOrganizer(undefined);navigate("/login");toast.success("Signed out");}
  const content=section==="overview"?<Overview/>:section==="upload"?<UploadParticipants/>:section==="participants"?<ParticipantsTable/>:section==="scanner"?<Scanner/>:section==="attendance"?<SimpleList kind="attendance"/>:section==="history"?<SimpleList kind="history"/>:<OrganizerManagement />;
  return <div className="min-h-[calc(100vh-64px)] bg-slate-50 lg:flex"><aside className={`fixed inset-y-16 left-0 z-20 w-72 border-r border-slate-200 bg-white p-4 transition lg:static lg:translate-x-0 ${open?"translate-x-0":"-translate-x-full"}`}><div className="mb-5 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Signed in as</p><p className="mt-1 font-bold">{organizer.username}</p><p className="text-xs capitalize text-slate-500">{organizer.role}</p></div><nav className="space-y-1">{navItems.map(([label,key,Icon])=>(key!=="organizers"||organizer.role==="administrator")&&<button key={key} onClick={()=>{setSection(key);setOpen(false);}} className={`nav-item ${section===key?"active":""}`}><Icon size={18}/>{label}</button>)}</nav><button onClick={logout} className="nav-item mt-5 border-t border-slate-100 text-red-600"><LogOut size={18}/>Logout</button></aside><main className="min-w-0 flex-1 p-4 sm:p-6"><div className="mb-5 flex items-center gap-3"><button onClick={()=>setOpen(v=>!v)} className="button-secondary h-10 px-3 lg:hidden"><Menu size={18}/></button><h1 className="text-2xl font-bold text-navy-950">{navItems.find(item=>item[1]===section)?.[0]}</h1></div>{content}</main></div>;
}

export default function App() {
  const [organizer,setOrganizer]=useState<Organizer>();
  useEffect(()=>{api<{organizer:Organizer}>("/auth/me").then(data=>setOrganizer(data.organizer)).catch(()=>setOrganizer(undefined));},[]);
  return <><Header organizer={organizer}/><Routes><Route path="/" element={<Home/>}/><Route path="/participant" element={<Participant/>}/><Route path="/login" element={organizer?<Navigate to="/admin" replace/>:<Login onLogin={setOrganizer}/>}/><Route path="/admin" element={organizer?<AdminDashboard organizer={organizer} setOrganizer={setOrganizer}/>:<Navigate to="/login" replace/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></>;
}
