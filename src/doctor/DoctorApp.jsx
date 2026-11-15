/**
 * DoctorApp.jsx
 * -------------
 * Root component for the Doctor / Clinic Side.
 *
 * Responsibilities:
 *   1. Authentication gate (Supabase Auth session, shows LoginScreen until logged in)
 *   2. Load and manage real database state strictly for the logged-in doctor
 *   3. Enforce complete per-doctor isolation:
 *      - Zero access, switching, or visibility of another doctor's queue, tokens, or schedule
 *   4. Route between: Dashboard, Live Queue, Add Patient, My Schedule, Settings
 */

import React, { useState, useEffect, useCallback, Component } from 'react';
import {
  doctorLogout,
  getDoctorAuthSession,
  getLoggedInDoctorProfile,
  getLiveDoctorQueue,
  callPatientToken,
  startConsultationToken,
  completePatientToken,
  skipPatientToken,
  restorePatientToken,
  setDoctorAvailability,
  getDoctorStatsToday,
  addPhonePatient,
  upsertClinicDoctor,
} from '../services/dbService';
import { supabase } from '../lib/supabase';

import DoctorPageShell   from './components/DoctorPageShell';
import LoginScreen       from './screens/LoginScreen';
import DashboardScreen   from './screens/DashboardScreen';
import LiveQueueScreen   from './screens/LiveQueueScreen';
import AddPatientScreen  from './screens/AddPatientScreen';
import DoctorsScreen     from './screens/DoctorsScreen';
import SettingsScreen    from './screens/SettingsScreen';

class DoctorPortalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[DoctorPortalErrorBoundary] Runtime error caught:', error, errorInfo);
  }

  handleResetSession = () => {
    try {
      localStorage.removeItem('sdqms_verified_doctor_session');
    } catch (_) {}
    window.location.href = '/doctor';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white max-w-md w-full p-6 rounded-2xl shadow-xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">
              !
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Doctor Portal Recovery</h2>
            <p className="text-sm text-slate-500 mb-5">
              The portal encountered an unexpected display issue. Your medical data is safe in the database.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleResetSession}
                className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-all shadow-sm"
              >
                Clear Stored Session & Return to Login
              </button>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-all"
              >
                Reload Page
              </button>
            </div>
            {this.state.error?.message && (
              <p className="mt-4 text-[11px] text-slate-400 font-mono text-left bg-slate-50 p-2.5 rounded-lg border border-slate-100 overflow-x-auto">
                {this.state.error.message}
              </p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const VIEWS = {
  DASHBOARD:   'dashboard',
  QUEUE:       'queue',
  ADD_PATIENT: 'addPatient',
  DOCTORS:     'doctors',
  SETTINGS:    'settings',
};

function DoctorAppContent() {
  // ── Authentication & Initial Load State ───────────────────────
  const [session, setSession] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [view, setView] = useState(VIEWS.DASHBOARD);

  // ── Single Logged-In Doctor State (Strict Isolation) ─────────
  const [currentDoctor, setCurrentDoctor] = useState(null);
  const [queue, setQueue] = useState([]);
  const [servedToday, setServedToday] = useState(0);
  const [doctorStatus, setDoctorStatusState] = useState('available');

  // ── 1. Check existing session on mount ────────────────────────
  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const activeSession = await getDoctorAuthSession();
        if (mounted) {
          if (activeSession && (activeSession.doctorId || activeSession.id)) {
            setSession(activeSession);
            setDoctorStatusState(activeSession.availability || 'available');

            // Fetch only the logged-in doctor's row
            const targetDocId = activeSession.doctorId || activeSession.id;
            const targetAuthId = activeSession.authUserId;
            if (targetDocId || targetAuthId) {
              const { data: doc } = await getLoggedInDoctorProfile(targetDocId, targetAuthId);
              if (doc && mounted) {
                setCurrentDoctor(doc);
                setDoctorStatusState(doc.availability || activeSession.availability || 'available');
              }
            }
          } else {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('sdqms_verified_doctor_session');
            }
            setSession(null);
          }
          setIsInitializing(false);
        }
      } catch (err) {
        console.error('[DoctorApp] checkAuth error:', err);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('sdqms_verified_doctor_session');
        }
        if (mounted) {
          setSession(null);
          setIsInitializing(false);
        }
      }
    }
    checkAuth();

    // Listen to Supabase auth state changes
    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
          if (mounted) {
            setSession(null);
            setCurrentDoctor(null);
            setQueue([]);
            setServedToday(0);
            setView(VIEWS.DASHBOARD);
          }
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    }

    return () => { mounted = false; };
  }, []);

  // ── 2. Refresh Queue & Stats Strictly for Logged-In Doctor ───
  const refreshQueueData = useCallback(async (currentSession) => {
    const s = currentSession || session;
    if (!s || !s.clinicId || !s.doctorId) return;

    // Fetch active queue strictly for this doctor
    const { data: qData } = await getLiveDoctorQueue({
      clinicId: s.clinicId,
      doctorId: s.doctorId,
    });
    if (qData) {
      setQueue(qData);
    }

    // Fetch completed stats for today for this doctor
    const { data: statsData } = await getDoctorStatsToday(s.clinicId, s.doctorId);
    if (statsData) {
      setServedToday(statsData.servedToday || 0);
    }
  }, [session]);

  // Periodic polling for live queue updates (every 5 seconds when logged in)
  useEffect(() => {
    if (!session || !session.doctorId) return;
    refreshQueueData(session);

    const interval = setInterval(() => {
      refreshQueueData(session);
    }, 5000);

    return () => clearInterval(interval);
  }, [session, refreshQueueData]);

  // ── 3. Login & Logout Handlers ────────────────────────────────
  const handleLoginSuccess = useCallback(async (newSession) => {
    setSession(newSession);
    setDoctorStatusState(newSession.availability || 'available');
    setView(VIEWS.DASHBOARD);

    if (newSession.doctorId || newSession.authUserId) {
      const { data: doc } = await getLoggedInDoctorProfile(newSession.doctorId, newSession.authUserId);
      if (doc) {
        setCurrentDoctor(doc);
        setDoctorStatusState(doc.availability || 'available');
      }
    }
    refreshQueueData(newSession);
  }, [refreshQueueData]);

  const handleLogout = useCallback(async () => {
    await doctorLogout();
    setSession(null);
    setCurrentDoctor(null);
    setQueue([]);
    setServedToday(0);
    setDoctorStatusState('available');
    setView(VIEWS.DASHBOARD);
  }, []);

  // ── 4. Availability Status Change for Logged-In Doctor ────────
  const handleStatusChange = useCallback(async (newStatus) => {
    if (!session?.doctorId) return;

    setDoctorStatusState(newStatus);
    setCurrentDoctor(prev => prev ? { ...prev, availability: newStatus, available: newStatus === 'available' } : prev);

    await setDoctorAvailability(session.doctorId, newStatus);
  }, [session]);

  // ── 5. Edit Own Schedule Handler ──────────────────────────────
  const handleSaveDoctor = useCallback(async (doctorData) => {
    if (!session?.clinicId || !session?.doctorId) {
      return { error: { message: 'No authenticated doctor session found.' } };
    }

    // Lock update strictly to session.doctorId
    const payload = {
      ...doctorData,
      id: session.doctorId,
      clinicId: session.clinicId,
      name: currentDoctor?.name || session.doctorName,
      specialization: currentDoctor?.specialization || session.specialisation,
      username: currentDoctor?.username || session.username,
    };

    const res = await upsertClinicDoctor(payload);

    if (res.data) {
      const { data: freshDoc } = await getLoggedInDoctorProfile(session.doctorId, session.authUserId);
      if (freshDoc) {
        setCurrentDoctor(freshDoc);
        if (freshDoc.availability) {
          setDoctorStatusState(freshDoc.availability);
        }
      }
      await refreshQueueData(session);
    }

    return res;
  }, [session, currentDoctor, refreshQueueData]);

  // ── 6. Queue Actions Execution (Locked to Own Tokens) ─────────
  const handleQueueAction = useCallback(async (action, targetTokenId) => {
    if (!session || !session.doctorId) return;

    if (action === 'callNext' && targetTokenId) {
      await callPatientToken(targetTokenId);
    } else if (action === 'start' && targetTokenId) {
      await startConsultationToken(targetTokenId);
    } else if (action === 'complete' && targetTokenId) {
      await completePatientToken(targetTokenId);
    } else if (action === 'skip' && targetTokenId) {
      await skipPatientToken(targetTokenId, 'skipped');
    } else if (action === 'no_show' && targetTokenId) {
      await skipPatientToken(targetTokenId, 'no_show');
    } else if (action === 'restore' && targetTokenId) {
      await restorePatientToken(targetTokenId);
    }

    // Immediately reload latest state
    await refreshQueueData(session);
  }, [session, refreshQueueData]);

  // ── Loading state while checking session on initial load ──────
  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        <p className="text-sm">Connecting to portal…</p>
      </div>
    );
  }

  // ── Not logged in → show login ────────────────────────────────
  if (!session) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const activeDocDisplay = currentDoctor || {
    id: session?.doctorId,
    name: session?.doctorName || 'Doctor',
    specialization: session?.specialisation || session?.specialization || 'General',
    specialisation: session?.specialisation || session?.specialization || 'General',
    dutyStart: session?.dutyStart || '09:00',
    dutyEnd: session?.dutyEnd || '17:00',
    breakStart: session?.breakStart || '',
    breakEnd: session?.breakEnd || '',
    workingDays: session?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    availability: session?.availability || doctorStatus || 'available',
  };

  // ── Logged in → show portal ───────────────────────────────────
  return (
    <DoctorPageShell
      activeNav={view}
      onNav={setView}
      onLogout={handleLogout}
      doctorName={session?.doctorName || currentDoctor?.name || 'Doctor'}
      clinicName={session?.clinicName || 'Clinic'}
    >
      {view === VIEWS.DASHBOARD && (
        <DashboardScreen
          session={session}
          currentDoctor={activeDocDisplay}
          queue={queue}
          doctorStatus={doctorStatus}
          servedToday={servedToday}
          onStatusChange={handleStatusChange}
          onNav={setView}
        />
      )}

      {view === VIEWS.QUEUE && (
        <LiveQueueScreen
          session={session}
          currentDoctor={activeDocDisplay}
          queue={queue}
          doctorStatus={doctorStatus}
          onAction={handleQueueAction}
          onStatusChange={handleStatusChange}
        />
      )}

      {view === VIEWS.ADD_PATIENT && (
        <AddPatientScreen
          session={session}
          clinic={{ id: session?.clinicId, name: session?.clinicName || 'Clinic' }}
          currentDoctor={activeDocDisplay}
          onAddPatient={async (patientData) => {
            // Strictly enforce booking under logged-in doctor
            if (!session?.clinicId || !session?.doctorId) {
              return { error: { message: 'Invalid session. Please sign in again.' } };
            }
            const res = await addPhonePatient({
              clinicId: session.clinicId,
              doctorId: session.doctorId,
              name: patientData.name,
              mobile: patientData.mobile,
              place: patientData.place,
            });
            if (res.data) {
              await refreshQueueData(session);
            }
            return res;
          }}
          onViewQueue={() => setView(VIEWS.QUEUE)}
        />
      )}

      {view === VIEWS.DOCTORS && (
        <DoctorsScreen
          session={session}
          currentDoctor={activeDocDisplay}
          onSaveDoctor={handleSaveDoctor}
        />
      )}

      {view === VIEWS.SETTINGS && (
        <SettingsScreen
          session={session}
          currentDoctor={activeDocDisplay}
          onSaveDoctor={handleSaveDoctor}
        />
      )}
    </DoctorPageShell>
  );
}

export default function DoctorApp() {
  return (
    <DoctorPortalErrorBoundary>
      <DoctorAppContent />
    </DoctorPortalErrorBoundary>
  );
}