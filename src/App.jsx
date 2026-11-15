/**
 * App.jsx
 * -------
 * The root component. It acts as a simple client-side router:
 * it holds the current SCREEN name in state and renders the
 * matching screen component.
 *
 * Screens (in order of the Get Token flow):
 *   home → patientDetails → clinicSelection → doctorSelection* → bookingConfirmation → tokenConfirmation
 *   home → checkToken
 *   (* skipped when clinic has exactly one doctor)
 *
 * All shared state (patient info, selected clinic/doctor, token)
 * lives here so each screen component stays focused and simple.
 *
 * ── Adding Supabase later ──────────────────────────────────────────
 * Replace `generateTokenNumber()` and storage calls with async Supabase calls.
 * The screen components don't need to change.
 */

import { useState } from 'react';
import { bookPatientToken } from './services/dbService';

import PageShell                 from './components/PageShell';
import HomeScreen                from './screens/HomeScreen';
import PatientDetailsScreen      from './screens/PatientDetailsScreen';
import ClinicSelectionScreen     from './screens/ClinicSelectionScreen';
import DoctorSelectionScreen     from './screens/DoctorSelectionScreen';
import BookingConfirmationScreen from './screens/BookingConfirmationScreen';
import TokenConfirmationScreen   from './screens/TokenConfirmationScreen';
import CheckTokenScreen          from './screens/CheckTokenScreen';

// All possible screen names — easy to extend
const SCREENS = {
  HOME:                 'home',
  PATIENT_DETAILS:      'patientDetails',
  CLINIC_SELECTION:     'clinicSelection',
  DOCTOR_SELECTION:     'doctorSelection',
  BOOKING_CONFIRMATION: 'bookingConfirmation',  // ← NEW: summary before token generation
  TOKEN_CONFIRMATION:   'tokenConfirmation',
  CHECK_TOKEN:          'checkToken',
};

export default function App() {
  // ── Navigation state ─────────────────────────────────────────────
  const [screen, setScreen] = useState(SCREENS.HOME);

  // ── Shared data state ────────────────────────────────────────────
  const [patient, setPatient] = useState(null);  // { name, mobile, place }
  const [clinic,  setClinic]  = useState(null);  // clinic object from mockData
  const [doctor,  setDoctor]  = useState(null);  // doctor object from mockData
  const [token,   setToken]   = useState(null);  // { tokenNumber, clinic, doctor }

  // ── Guard & status for booking ──────────────────────────────────
  const [isBooked, setIsBooked] = useState(false);
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  // ── Navigation helpers ───────────────────────────────────────────
  const goTo = (s) => setScreen(s);

  const goHome = () => {
    // Reset all state when going back to home
    setPatient(null);
    setClinic(null);
    setDoctor(null);
    setToken(null);
    setIsBooked(false);
    setIsBookingLoading(false);
    setBookingError(null);
    setScreen(SCREENS.HOME);
  };

  // ── Handler: Patient Details submitted ──────────────────────────
  // When the patient edits their details (via the "Edit" link on booking
  // confirmation), reset isBooked so they can book again after correcting.
  const handlePatientContinue = (patientData) => {
    setPatient(patientData);
    setIsBooked(false);   // editing details resets the booking lock
    setBookingError(null);
    goTo(SCREENS.CLINIC_SELECTION);
  };

  // ── Handler: Clinic selected ─────────────────────────────────────
  // NOTE: No token is generated here. We just store the clinic and
  //       either auto-select the only doctor or show doctor selection.
  //       Both paths lead to the Booking Confirmation screen.
  const handleClinicSelect = (selectedClinic) => {
    setClinic(selectedClinic);
    setIsBooked(false); // reset guard if patient re-selects clinic
    setBookingError(null);

    const docList = selectedClinic.doctors || [];
    if (docList.length === 1) {
      // Only one doctor → auto-select, skip doctor screen, go to confirmation
      const autoDoctor = docList[0];
      setDoctor(autoDoctor);
      goTo(SCREENS.BOOKING_CONFIRMATION);
    } else {
      // Multiple doctors → let patient choose first
      goTo(SCREENS.DOCTOR_SELECTION);
    }
  };

  // ── Handler: Doctor selected ──────────────────────────────────────
  // NOTE: No token generated here either — just store and show confirmation.
  const handleDoctorSelect = (selectedDoctor) => {
    setDoctor(selectedDoctor);
    setIsBooked(false); // reset guard if patient re-selects doctor
    setBookingError(null);
    goTo(SCREENS.BOOKING_CONFIRMATION);
  };

  // ── Handler: "Book Token" button clicked on confirmation screen ──
  // This is the ONLY place a token is ever generated.
  // isBooked and isBookingLoading guards prevent duplicate tokens from rapid clicks.
  const handleBookToken = async () => {
    if (isBooked || isBookingLoading) return; // already booked or in-flight
    setIsBookingLoading(true);
    setBookingError(null);

    const { data, error } = await bookPatientToken({ patient, clinic, doctor });

    if (error) {
      setIsBookingLoading(false);
      setBookingError(error.message || 'Failed to book token. Please try again.');
      return;
    }

    setIsBooked(true);
    setIsBookingLoading(false);

    const newToken = {
      id: data.id,
      tokenNumber: data.token_number || data.tokenNumber,
      clinic: {
        ...clinic,
        name: data.clinic_name || data.clinicName || clinic.name,
        place: data.clinic_place || data.clinicPlace || data.place || clinic.place,
        mobile: data.clinic_mobile || data.clinicMobile || clinic.mobile,
      },
      doctor: {
        ...doctor,
        name: data.doctor_name || data.doctorName || doctor.name,
        specialisation: data.doctor_spec || data.doctorSpec || data.specialization || doctor.specialisation || doctor.specialization,
        specialization: data.doctor_spec || data.doctorSpec || data.specialization || doctor.specialisation || doctor.specialization,
        availability: data.doctor_availability || data.doctorAvailability || doctor.availability,
      },
      doctorAvailability: data.doctor_availability || data.doctorAvailability || doctor.availability,
      bookedAt: data.booked_at || data.issuedAt,
    };

    setToken(newToken);
    goTo(SCREENS.TOKEN_CONFIRMATION);
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <PageShell>
      {screen === SCREENS.HOME && (
        <HomeScreen
          onGetToken={() => goTo(SCREENS.PATIENT_DETAILS)}
          onCheckToken={() => goTo(SCREENS.CHECK_TOKEN)}
        />
      )}

      {screen === SCREENS.PATIENT_DETAILS && (
        <PatientDetailsScreen
          onBack={goHome}
          onContinue={handlePatientContinue}
          initialValues={patient}
        />
      )}

      {screen === SCREENS.CLINIC_SELECTION && (
        <ClinicSelectionScreen
          onBack={() => goTo(SCREENS.PATIENT_DETAILS)}
          onSelectClinic={handleClinicSelect}
        />
      )}

      {screen === SCREENS.DOCTOR_SELECTION && clinic && (
        <DoctorSelectionScreen
          clinic={clinic}
          onBack={() => goTo(SCREENS.CLINIC_SELECTION)}
          onSelectDoctor={handleDoctorSelect}
        />
      )}

      {screen === SCREENS.BOOKING_CONFIRMATION && patient && clinic && doctor && (
        <BookingConfirmationScreen
          patient={patient}
          clinic={clinic}
          doctor={doctor}
          isBooked={isBooked}
          isLoading={isBookingLoading}
          error={bookingError}
          onBook={handleBookToken}
          onBack={() => {
            // "Go Back / Edit Details" — return to the right previous screen
            if ((clinic.doctors || []).length === 1) {
              // Single-doctor clinic: doctor screen was skipped, go back to clinic list
              goTo(SCREENS.CLINIC_SELECTION);
            } else {
              // Multi-doctor clinic: go back to doctor selection
              goTo(SCREENS.DOCTOR_SELECTION);
            }
          }}
          onEditPatient={() => {
            setBookingError(null);
            goTo(SCREENS.PATIENT_DETAILS);
          }}
        />
      )}

      {screen === SCREENS.TOKEN_CONFIRMATION && token && patient && (
        <TokenConfirmationScreen
          token={token}
          patient={patient}
          onDone={goHome}
        />
      )}

      {screen === SCREENS.CHECK_TOKEN && (
        <CheckTokenScreen onBack={goHome} />
      )}
    </PageShell>
  );
}
