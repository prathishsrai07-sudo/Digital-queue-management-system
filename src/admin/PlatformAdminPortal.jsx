/**
 * PlatformAdminPortal.jsx
 * -----------------------
 * Private Platform Administration System for creating and managing clinics and doctors.
 *
 * Route: /platform-admin  (Strictly hidden, direct URL access only)
 *
 * Security:
 *   - Only authenticated users belonging to `public.platform_admins` can access.
 *   - Non-platform admins are immediately rejected with an unauthorized error.
 *
 * Core Capabilities:
 *   1. Clinics Management:
 *      - View all clinics (both active and inactive) with live stats
 *      - Add New Clinic modal
 *      - Edit Clinic details (Name, Place, Mobile)
 *      - Toggle Clinic Active / Inactive status
 *   2. Clinic Doctors & Credentials Management:
 *      - View doctors under each clinic
 *      - Onboard New Doctor with Admin-assigned Password in one click
 *      - Reset Doctor's Login Password
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  ShieldCheck,
  Plus,
  Pencil,
  KeyRound,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Power,
  LogOut,
  RefreshCw,
  Clock,
  Phone,
  MapPin,
  Loader2,
  Check,
  Calendar,
  Lock,
  Trash2,
} from 'lucide-react';
import {
  getPlatformAdminSession,
  platformAdminLogin,
  platformAdminLogout,
  adminListAllClinicsAndDoctors,
  adminUpsertClinic,
  adminToggleClinicActive,
  adminDeleteClinic,
  adminCreateDoctorWithPassword,
  adminResetDoctorPassword,
  adminDeleteDoctor,
} from '../services/dbService';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PlatformAdminPortal() {
  // ── Auth State ─────────────────────────────────────────────────────────────
  const [adminUser, setAdminUser]         = useState(null);
  const [checkingAuth, setCheckingAuth]   = useState(true);
  const [loginForm, setLoginForm]         = useState({ identifier: '', password: '' });
  const [loginLoading, setLoginLoading]   = useState(false);
  const [loginError, setLoginError]       = useState('');

  // ── Portal Data State ──────────────────────────────────────────────────────
  const [clinics, setClinics]             = useState([]);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const [selectedClinicId, setSelectedClinicId] = useState('all');
  const [activeTab, setActiveTab]         = useState('clinics'); // 'clinics' | 'doctors'
  const [flashMessage, setFlashMessage]   = useState(null);

  // ── Modals State ───────────────────────────────────────────────────────────
  const [showClinicModal, setShowClinicModal] = useState(false);
  const [editingClinic, setEditingClinic]     = useState(null);
  const [clinicForm, setClinicForm]           = useState({ name: '', place: '', mobile: '', active: true });
  const [clinicSubmitting, setClinicSubmitting] = useState(false);
  const [clinicError, setClinicError]         = useState('');

  const [deleteClinicTarget, setDeleteClinicTarget] = useState(null);
  const [deleteClinicSubmitting, setDeleteClinicSubmitting] = useState(false);
  const [deleteClinicError, setDeleteClinicError]   = useState('');

  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [doctorForm, setDoctorForm]           = useState({
    clinicId: '',
    name: '',
    specialization: '',
    username: '',
    password: '',
  });
  const [doctorSubmitting, setDoctorSubmitting] = useState(false);
  const [doctorError, setDoctorError]         = useState('');

  const [resetDoctorTarget, setResetDoctorTarget] = useState(null);
  const [newPassword, setNewPassword]             = useState('');
  const [resetSubmitting, setResetSubmitting]     = useState(false);
  const [resetError, setResetError]               = useState('');

  const [deleteDoctorTarget, setDeleteDoctorTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting]     = useState(false);
  const [deleteError, setDeleteError]               = useState('');

  const showFlash = (text, type = 'success') => {
    setFlashMessage({ text, type });
    setTimeout(() => setFlashMessage(null), 4000);
  };

  // ── 1. Check existing Platform Admin session on mount ──────────────────────
  useEffect(() => {
    async function initAuth() {
      try {
        const session = await getPlatformAdminSession();
        if (session?.user) {
          setAdminUser(session.user);
        }
      } catch (e) {
        console.error('Admin auth check failed:', e);
      } finally {
        setCheckingAuth(false);
      }
    }
    initAuth();
  }, []);

  // ── 2. Load clinics and doctors ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingClinics(true);
    const res = await adminListAllClinicsAndDoctors();
    setLoadingClinics(false);
    if (res?.data) {
      setClinics(prev => {
        return res.data.map(freshClinic => {
          const prevClinic = prev.find(p => p.id === freshClinic.id);
          const prevDocs = prevClinic?.doctors || [];
          const freshDocs = freshClinic.doctors || [];
          const mergedDocs = [...freshDocs];
          prevDocs.forEach(pd => {
            if (!mergedDocs.some(fd => fd.id === pd.id || fd.username === pd.username)) {
              mergedDocs.push(pd);
            }
          });
          return {
            ...freshClinic,
            doctor_count: mergedDocs.length,
            doctors: mergedDocs,
          };
        });
      });
    }
  }, []);

  useEffect(() => {
    if (adminUser) {
      loadData();
    }
  }, [adminUser, loadData]);

  // ── 3. Login & Logout ──────────────────────────────────────────────────────
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.identifier.trim() || !loginForm.password) {
      setLoginError('Please enter your administrator username or email and password.');
      return;
    }
    setLoginLoading(true);
    setLoginError('');

    const res = await platformAdminLogin(loginForm.identifier, loginForm.password);
    setLoginLoading(false);

    if (res?.error) {
      setLoginError(res.error.message || 'Login failed. Verify your platform administrator credentials.');
      return;
    }

    setAdminUser(res.data.user);
  };

  const handleLogout = async () => {
    await platformAdminLogout();
    setAdminUser(null);
    setClinics([]);
  };

  // ── 4. Clinic Actions ──────────────────────────────────────────────────────
  const openAddClinic = () => {
    setEditingClinic(null);
    setClinicForm({ name: '', place: '', mobile: '', active: true });
    setClinicError('');
    setShowClinicModal(true);
  };

  const openEditClinic = (c) => {
    setEditingClinic(c);
    setClinicForm({ name: c.name, place: c.place, mobile: c.mobile, active: c.active !== false });
    setClinicError('');
    setShowClinicModal(true);
  };

  const handleSaveClinic = async (e) => {
    e.preventDefault();
    if (!clinicForm.name.trim() || !clinicForm.place.trim() || !clinicForm.mobile.trim()) {
      setClinicError('Please fill in all required clinic details.');
      return;
    }

    setClinicSubmitting(true);
    setClinicError('');

    const res = await adminUpsertClinic({
      id: editingClinic ? editingClinic.id : undefined,
      name: clinicForm.name.trim(),
      place: clinicForm.place.trim(),
      mobile: clinicForm.mobile.trim(),
      active: clinicForm.active,
    });

    setClinicSubmitting(false);

    if (res?.error) {
      setClinicError(res.error.message || 'Failed to save clinic.');
      return;
    }

    // Immediately update local React state if new clinic
    if (!editingClinic && res?.data) {
      const newClinicObj = {
        id: res.data.id,
        name: res.data.name,
        place: res.data.place,
        mobile: res.data.mobile,
        active: res.data.active !== false,
        created_at: res.data.created_at || new Date().toISOString(),
        doctor_count: 0,
        active_token_count: 0,
        doctors: [],
      };
      setClinics(prev => prev.some(c => c.id === newClinicObj.id) ? prev : [...prev, newClinicObj]);
      setSelectedClinicId(newClinicObj.id);
    }

    setShowClinicModal(false);
    showFlash(editingClinic ? 'Clinic updated successfully!' : 'New clinic created successfully!');
    await loadData();
  };

  const handleToggleClinicActive = async (clinic) => {
    const newStatus = !(clinic.active !== false);

    // Optimistically update local state immediately so clinic NEVER disappears or lags
    setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, active: newStatus } : c));

    const res = await adminToggleClinicActive(clinic.id, newStatus);

    if (res?.data) {
      showFlash(`Clinic "${clinic.name}" is now ${newStatus ? 'Active' : 'Inactive / Deactivated'}.`);
      setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, active: res.data.active !== false } : c));
    } else {
      // Revert on error
      setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, active: !newStatus } : c));
      showFlash(res?.error?.message || 'Failed to update clinic status', 'error');
    }
  };

  const handleDeleteClinic = async () => {
    if (!deleteClinicTarget) return;

    setDeleteClinicSubmitting(true);
    setDeleteClinicError('');

    const res = await adminDeleteClinic(deleteClinicTarget.id);
    setDeleteClinicSubmitting(false);

    if (res?.error) {
      setDeleteClinicError(res.error.message || 'Failed to delete clinic.');
      return;
    }

    // Immediately remove from local state
    setClinics(prev => prev.filter(c => c.id !== deleteClinicTarget.id));
    if (selectedClinicId === deleteClinicTarget.id) {
      setSelectedClinicId('all');
    }

    showFlash(`Clinic "${deleteClinicTarget.name}" and all associated doctors and tokens were deleted permanently.`);
    setDeleteClinicTarget(null);
    await loadData();
  };

  // ── 5. Doctor Actions ──────────────────────────────────────────────────────
  const openAddDoctor = (preselectedClinicId) => {
    const defaultClinic = preselectedClinicId || (clinics[0]?.id ?? '');
    setDoctorForm({
      clinicId: defaultClinic,
      name: '',
      specialization: '',
      username: '',
      password: '',
    });
    setDoctorError('');
    setShowDoctorModal(true);
  };

  const handleSaveDoctor = async (e) => {
    e.preventDefault();
    if (!doctorForm.clinicId) {
      setDoctorError('Please select a clinic.');
      return;
    }
    if (!doctorForm.name.trim() || !doctorForm.specialization.trim() || !doctorForm.username.trim()) {
      setDoctorError('Doctor Name, Specialization, and Username are required.');
      return;
    }
    if (!doctorForm.password || doctorForm.password.length < 6) {
      setDoctorError('Password must be at least 6 characters long.');
      return;
    }

    setDoctorSubmitting(true);
    setDoctorError('');

    const res = await adminCreateDoctorWithPassword({
      clinicId: doctorForm.clinicId,
      name: doctorForm.name.trim(),
      specialization: doctorForm.specialization.trim(),
      username: doctorForm.username.trim().toLowerCase(),
      password: doctorForm.password,
    });

    setDoctorSubmitting(false);

    if (res?.error) {
      setDoctorError(res.error.message || 'Failed to create doctor account.');
      return;
    }

    const createdDoctorData = res.data;
    const newDocFormatted = {
      id: createdDoctorData?.id || `d_${Date.now()}`,
      clinic_id: doctorForm.clinicId,
      name: doctorForm.name.trim(),
      specialization: doctorForm.specialization.trim(),
      username: doctorForm.username.trim().toLowerCase(),
      average_consultation_minutes: 10,
      duty_start: '09:00',
      duty_end: '17:00',
      break_start: '13:00',
      break_end: '14:00',
      working_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      availability: 'available',
      auth_user_id: createdDoctorData?.auth_user_id || null,
      has_login_account: true,
      created_at: createdDoctorData?.created_at || new Date().toISOString(),
    };

    // Immediately update local React state so doctor appears under the clinic instantly without reload!
    setClinics(prev => prev.map(c => {
      if (c.id === doctorForm.clinicId) {
        const existing = c.doctors || [];
        const deduped = existing.filter(d => d.id !== newDocFormatted.id && d.username !== newDocFormatted.username);
        const updated = [...deduped, newDocFormatted];
        return {
          ...c,
          doctor_count: updated.length,
          doctors: updated,
        };
      }
      return c;
    }));

    setShowDoctorModal(false);
    showFlash(`Doctor ${doctorForm.name} created and credentials linked successfully!`);
    await loadData();
  };

  const handleDeleteDoctor = async () => {
    if (!deleteDoctorTarget) return;

    setDeleteSubmitting(true);
    setDeleteError('');

    const res = await adminDeleteDoctor(deleteDoctorTarget.id);
    setDeleteSubmitting(false);

    if (res?.error) {
      setDeleteError(res.error.message || 'Failed to delete doctor.');
      return;
    }

    // Immediately update local React state
    setClinics(prev => prev.map(c => {
      if (c.id === deleteDoctorTarget.clinic_id) {
        const updated = (c.doctors || []).filter(d => d.id !== deleteDoctorTarget.id);
        return {
          ...c,
          doctor_count: updated.length,
          doctors: updated,
        };
      }
      return c;
    }));

    showFlash(`Doctor ${deleteDoctorTarget.name} has been deleted permanently.`);
    setDeleteDoctorTarget(null);
    await loadData();
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setResetError('New password must be at least 6 characters long.');
      return;
    }

    setResetSubmitting(true);
    setResetError('');

    const res = await adminResetDoctorPassword(resetDoctorTarget.id, newPassword);
    setResetSubmitting(false);

    if (res?.error) {
      setResetError(res.error.message || 'Failed to reset password.');
      return;
    }

    setResetDoctorTarget(null);
    setNewPassword('');
    showFlash(`Password for ${resetDoctorTarget.name} reset successfully!`);
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 font-sans">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-indigo-400" />
          <span className="text-sm">Connecting to Platform Administration…</span>
        </div>
      </div>
    );
  }

  // ── Unauthenticated / Login Screen ─────────────────────────────────────────
  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-4 font-sans">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck size={26} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Platform Administration</h1>
              <p className="text-xs text-slate-400">Platform Team & Infrastructure Console</p>
            </div>
          </div>

          <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-3.5 mb-6 text-xs text-amber-300 flex items-start gap-2.5">
            <Lock size={16} className="flex-shrink-0 mt-0.5 text-amber-400" />
            <span>
              Restricted area. Only authorized platform engineers and system administrators can log in.
            </span>
          </div>

          {loginError && (
            <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3.5 mb-5 text-xs text-red-200 flex items-start gap-2.5">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Admin Username or Email
              </label>
              <input
                type="text"
                placeholder="e.g. arun.kumar or admin@clinic.org"
                value={loginForm.identifier}
                onChange={(e) => setLoginForm(f => ({ ...f, identifier: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="mt-2 w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              {loginLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying Platform Authorization…
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  Sign In to Platform Console
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <a
              href="/"
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Return to public patient website
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Authenticated Platform Admin Portal ────────────────────────────────────
  const filteredClinics = selectedClinicId === 'all'
    ? clinics
    : clinics.filter(c => c.id === selectedClinicId);

  const allDoctors = clinics.flatMap(c => (c.doctors || []).map(d => ({ ...d, clinicName: c.name, clinicId: c.id })));
  const filteredDoctors = selectedClinicId === 'all'
    ? allDoctors
    : allDoctors.filter(d => d.clinicId === selectedClinicId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16">
      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base tracking-tight">Platform Admin</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                  Internal System
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Smart Digital Queue Management Infrastructure</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loadingClinics}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5"
              title="Refresh data"
            >
              <RefreshCw size={14} className={loadingClinics ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-200">{adminUser.email}</span>
              <span className="text-[10px] text-indigo-400">Platform Engineer</span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 sm:px-3 sm:py-2 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">

        {/* Flash Message */}
        {flashMessage && (
          <div className={`mb-6 p-4 rounded-xl border flex items-center gap-3 text-sm shadow-lg ${
            flashMessage.type === 'error'
              ? 'bg-red-950/80 border-red-800 text-red-200'
              : 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
          }`}>
            {flashMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{flashMessage.text}</span>
          </div>
        )}

        {/* ── Stats Overview ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Clinics</span>
              <Building2 size={18} className="text-indigo-400" />
            </div>
            <div className="text-3xl font-bold text-white">{clinics.length}</div>
            <div className="text-xs text-slate-500 mt-1">
              {clinics.filter(c => c.active !== false).length} active • {clinics.filter(c => c.active === false).length} inactive
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Registered Doctors</span>
              <Users size={18} className="text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-white">{allDoctors.length}</div>
            <div className="text-xs text-slate-500 mt-1">
              Across all {clinics.length} healthcare clinics
            </div>
          </div>
        </div>

        {/* ── Tabs & Filter Controls ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('clinics')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'clinics'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Clinics ({clinics.length})
            </button>
            <button
              onClick={() => setActiveTab('doctors')}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'doctors'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Doctors & Credentials ({allDoctors.length})
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* Clinic Filter */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
              <span className="text-slate-500">Filter:</span>
              <select
                value={selectedClinicId}
                onChange={(e) => setSelectedClinicId(e.target.value)}
                className="dark-select bg-slate-900 text-slate-100 text-xs font-semibold focus:outline-none cursor-pointer rounded-lg px-2 py-1 border border-slate-700/80"
                style={{ colorScheme: 'dark', backgroundColor: '#0f172a', color: '#f8fafc' }}
              >
                <option value="all" className="dark-option" style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                  All Clinics
                </option>
                {clinics.map(c => (
                  <option key={c.id} value={c.id} className="dark-option" style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Add Buttons */}
            {activeTab === 'clinics' ? (
              <button
                onClick={openAddClinic}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-indigo-600/20"
              >
                <Plus size={15} /> Add New Clinic
              </button>
            ) : (
              <button
                onClick={() => openAddDoctor(selectedClinicId !== 'all' ? selectedClinicId : '')}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-emerald-600/20"
              >
                <Plus size={15} /> Onboard Doctor
              </button>
            )}
          </div>
        </div>

        {/* ── TAB 1: Clinics Management ────────────────────────────────────── */}
        {activeTab === 'clinics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredClinics.map(c => {
              const isActive = c.active !== false;
              const docCount = (c.doctors || []).length;

              return (
                <div
                  key={c.id}
                  className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between transition-all ${
                    isActive
                      ? 'border-slate-800 hover:border-slate-700 shadow-md'
                      : 'border-amber-900/50 bg-slate-900/95 hover:border-amber-700/60 shadow-md'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="font-bold text-white text-lg leading-snug">{c.name}</h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                          <MapPin size={13} className="text-slate-500 flex-shrink-0" />
                          <span>{c.place}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                        isActive
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                          : 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                      }`}>
                        {isActive ? 'Active' : 'Inactive / Deactivated'}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-400 my-4 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Phone size={12} /> Contact:
                        </span>
                        <span className="font-mono text-slate-300">{c.mobile}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-slate-500">
                          <Users size={12} /> Doctors:
                        </span>
                        <span className="font-semibold text-slate-300">{docCount} doctor{docCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => handleToggleClinicActive(c)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          : 'bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border-emerald-800/50'
                      }`}
                    >
                      <Power size={13} />
                      {isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openAddDoctor(c.id)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/40 text-emerald-300 transition-all flex items-center gap-1"
                      >
                        <Plus size={13} /> Doctor
                      </button>
                      <button
                        onClick={() => openEditClinic(c)}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all flex items-center gap-1"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => {
                          setDeleteClinicTarget(c);
                          setDeleteClinicError('');
                        }}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 transition-all flex items-center gap-1 shadow-xs"
                        title="Permanently delete clinic and all its doctors/tokens"
                      >
                        <Trash2 size={13} /> Delete Clinic
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TAB 2: Doctors & Credentials Management ──────────────────────── */}
        {activeTab === 'doctors' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredDoctors.map(doc => (
              <div
                key={doc.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-base">{doc.name}</h4>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${
                          doc.has_login_account
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                            : 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                        }`}>
                          {doc.has_login_account ? 'Auth Linked' : 'No Auth User'}
                        </span>
                      </div>
                      <p className="text-xs text-indigo-400 font-medium mt-0.5">{doc.specialization}</p>
                    </div>

                    <span className="text-xs text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-medium">
                      {doc.clinicName}
                    </span>
                  </div>

                  <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/60 my-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Doctor Username:</span>
                      <span className="font-mono text-emerald-300 font-semibold">@{doc.username}</span>
                    </div>
                    {doc.login_email && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Auth Email:</span>
                        <span className="font-mono text-slate-300">{doc.login_email}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Duty Timings:</span>
                      <span className="text-slate-300 font-medium">{doc.duty_start} – {doc.duty_end}</span>
                    </div>
                    {doc.break_start && doc.break_end && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Break Timings:</span>
                        <span className="text-amber-400 font-medium">{doc.break_start} – {doc.break_end}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Avg. Consultation:</span>
                      <span className="text-slate-300 font-medium">{doc.average_consultation_minutes} mins</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800 flex-wrap gap-2">
                  <span className="text-[11px] text-slate-500 font-mono">
                    ID: {doc.id.slice(0, 8)}…
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setResetDoctorTarget(doc);
                        setNewPassword('');
                        setResetError('');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-950/50 hover:bg-amber-900/60 border border-amber-800/40 text-amber-300 text-xs font-semibold transition-all shadow-sm"
                    >
                      <KeyRound size={13} /> Reset Password
                    </button>
                    <button
                      onClick={() => {
                        setDeleteDoctorTarget(doc);
                        setDeleteError('');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 text-xs font-semibold transition-all shadow-sm"
                      title="Permanently remove doctor from this clinic"
                    >
                      <Trash2 size={13} /> Delete Doctor
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── MODAL: Add / Edit Clinic ───────────────────────────────────────── */}
      {showClinicModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-white text-lg">
                {editingClinic ? 'Edit Clinic Details' : 'Add New Clinic'}
              </h3>
              <button
                onClick={() => setShowClinicModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {clinicError && (
              <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3 mb-4 text-xs text-red-200">
                {clinicError}
              </div>
            )}

            <form onSubmit={handleSaveClinic} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Clinic Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apollo Urban Health Clinic"
                  value={clinicForm.name}
                  onChange={(e) => setClinicForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Place / Locality *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Indiranagar, Bangalore"
                  value={clinicForm.place}
                  onChange={(e) => setClinicForm(f => ({ ...f, place: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Contact Mobile Number *
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={clinicForm.mobile}
                  onChange={(e) => setClinicForm(f => ({ ...f, mobile: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activeClinicCheckbox"
                  checked={clinicForm.active}
                  onChange={(e) => setClinicForm(f => ({ ...f, active: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="activeClinicCheckbox" className="text-xs text-slate-300 cursor-pointer">
                  Clinic is Active (visible in patient search and token booking)
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowClinicModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={clinicSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
                >
                  {clinicSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingClinic ? 'Update Clinic' : 'Create Clinic'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Onboard Doctor with Password ─────────────────────────────── */}
      {showDoctorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl my-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-white text-lg">Onboard Doctor with Credentials</h3>
                <p className="text-xs text-slate-400">Creates doctor profile, assigns unique password, and links Supabase Auth</p>
              </div>
              <button
                onClick={() => setShowDoctorModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {doctorError && (
              <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3 mb-4 text-xs text-red-200">
                {doctorError}
              </div>
            )}

            <form onSubmit={handleSaveDoctor} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Clinic *
                </label>
                <select
                  value={doctorForm.clinicId}
                  onChange={(e) => setDoctorForm(f => ({ ...f, clinicId: e.target.value }))}
                  className="dark-select w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                  style={{ colorScheme: 'dark', backgroundColor: '#0f172a', color: '#f8fafc' }}
                  required
                >
                  <option value="" className="dark-option" style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
                    Select Clinic…
                  </option>
                  {clinics.map(c => (
                    <option key={c.id} value={c.id} className="dark-option" style={{ backgroundColor: '#1e293b', color: '#f8fafc' }}>
                      {c.name} ({c.place})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Doctor Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Sneha Rao"
                    value={doctorForm.name}
                    onChange={(e) => setDoctorForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Specialization *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Pediatrician, Cardiologist"
                    value={doctorForm.specialization}
                    onChange={(e) => setDoctorForm(f => ({ ...f, specialization: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/60 p-4 rounded-xl border border-indigo-900/30">
                <div>
                  <label className="text-xs font-semibold text-indigo-300 block mb-1">
                    Doctor Login Username *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. sneha.rao"
                    value={doctorForm.username}
                    onChange={(e) => setDoctorForm(f => ({ ...f, username: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">Used by doctor on `/doctor` login screen</span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-indigo-300 block mb-1">
                    Assigned Password * (min 6 chars)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DoctorPass@2026"
                    value={doctorForm.password}
                    onChange={(e) => setDoctorForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">Encrypted via pgcrypto into Supabase Auth</span>
                </div>
              </div>

              <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3.5 text-xs text-indigo-300 flex items-start gap-2.5">
                <Clock size={16} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Schedule & Timings Separation:</strong> Duty hours, break schedule, working days, and average consultation minutes are managed directly by the doctor in the <strong>Doctor Portal</strong>. Standard operational defaults (09:00 – 17:00, 7 days/week) are applied automatically upon creation.
                </span>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDoctorModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={doctorSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
                >
                  {doctorSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Create Doctor & Auth Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Reset Password ─────────────────────────────────────────── */}
      {resetDoctorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <KeyRound size={18} className="text-amber-400" />
                Reset Doctor Password
              </h3>
              <button
                onClick={() => setResetDoctorTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Assign a new login password for <strong>{resetDoctorTarget.name}</strong> (@{resetDoctorTarget.username}).
            </p>

            {resetError && (
              <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3 mb-4 text-xs text-red-200">
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  New Password (min 6 chars)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NewSecret2026"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetDoctorTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
                >
                  {resetSubmitting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  Set New Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Delete Clinic Confirmation ───────────────────────────── */}
      {deleteClinicTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-900/40 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5 text-rose-400">
                <Trash2 size={20} />
                <h3 className="font-bold text-white text-lg">Delete Clinic</h3>
              </div>
              <button
                onClick={() => setDeleteClinicTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {deleteClinicError && (
              <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3 mb-4 text-xs text-red-200">
                {deleteClinicError}
              </div>
            )}

            <p className="text-sm text-slate-300 mb-2">
              Are you sure you want to permanently delete <strong>{deleteClinicTarget.name}</strong> ({deleteClinicTarget.place}) and all its doctors and tokens? This cannot be undone.
            </p>

            <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-3 mb-5 text-xs text-rose-200 leading-relaxed">
              ⚠️ <strong>Warning:</strong> All doctors registered under this clinic, their login accounts, patient queue history, daily token counters, and tokens will be permanently removed.
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteClinicTarget(null)}
                disabled={deleteClinicSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClinic}
                disabled={deleteClinicSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
              >
                {deleteClinicSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Yes, Delete Clinic
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Delete Doctor Confirmation ─────────────────────────────── */}
      {deleteDoctorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-rose-900/40 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5 text-rose-400">
                <Trash2 size={20} />
                <h3 className="font-bold text-white text-lg">Delete Doctor</h3>
              </div>
              <button
                onClick={() => setDeleteDoctorTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {deleteError && (
              <div className="bg-red-950/60 border border-red-800/60 rounded-xl p-3 mb-4 text-xs text-red-200">
                {deleteError}
              </div>
            )}

            <p className="text-sm text-slate-300 mb-2">
              Are you sure you want to permanently delete <strong>{deleteDoctorTarget.name}</strong> ({deleteDoctorTarget.specialization || 'Doctor'}) from this clinic?
            </p>

            <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-3 mb-5 text-xs text-rose-200 leading-relaxed">
              ⚠️ <strong>Warning:</strong> This will permanently delete the doctor record, their linked login credentials, and cleanly clean up any associated queue tokens and clinic membership. This action cannot be undone.
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setDeleteDoctorTarget(null)}
                disabled={deleteSubmitting}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-semibold hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteDoctor}
                disabled={deleteSubmitting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
              >
                {deleteSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Yes, Delete Doctor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
