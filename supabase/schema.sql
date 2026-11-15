-- =============================================================================
--  Smart Digital Queue Management System — Supabase Database Schema
--  File: supabase/schema.sql
-- =============================================================================
--
--  HOW TO APPLY THIS SCHEMA
--  ─────────────────────────
--  1. Log in to supabase.com → your project → SQL Editor
--  2. Paste the entire contents of this file and click "Run"
--  3. Verify each table appears in Table Editor
--  4. Do NOT run this file a second time without checking idempotency notes below.
--
--  IDEMPOTENCY
--  ───────────
--  • All CREATE TABLE statements use IF NOT EXISTS — safe to re-run on an
--    already-populated database.
--  • All CREATE INDEX statements use IF NOT EXISTS.
--  • CREATE TYPE statements will fail if the type already exists. If you need
--    to re-run: comment out the CREATE TYPE blocks first.
--  • Policies use DROP POLICY IF EXISTS before CREATE POLICY so they are
--    always refreshed safely.
--
--  ORDER OF EXECUTION
--  ──────────────────
--  1. Extensions
--  2. Custom types (enums)
--  3. Tables (in FK-dependency order)
--  4. Token-numbering function + trigger
--  5. Indexes
--  6. Row Level Security (RLS) enable + policies
--  7. Secure RPC functions for unauthenticated patient operations
--
-- =============================================================================


-- =============================================================================
-- SECTION 1 — EXTENSIONS
-- =============================================================================

-- uuid-ossp: generates UUID v4 primary keys (pre-installed on Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- SECTION 2 — CUSTOM ENUM TYPES
-- =============================================================================

-- ── Booking type ──────────────────────────────────────────────────────────────
-- Matches BOOKING_TYPE constants in src/doctor/mockDoctorData.js
-- Values are lowercase for consistent storage; display labels are in the UI.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_type') THEN
    CREATE TYPE booking_type AS ENUM (
      'online',   -- Patient booked via the web/app interface
      'phone'     -- Clinic staff added the patient via the Add Patient screen
    );
  END IF;
END
$$;

-- ── Token status ──────────────────────────────────────────────────────────────
-- Lifecycle: waiting → called → consulting → completed | skipped | no_show
-- Matches TOKEN_STATUS in mockDoctorData.js + the extended set requested.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'token_status') THEN
    CREATE TYPE token_status AS ENUM (
      'waiting',     -- In queue, not yet called
      'called',      -- Doctor clicked "Call Next" — patient is being summoned
      'consulting',  -- Consultation is in progress (was 'in_progress' in localStorage)
      'completed',   -- Consultation finished successfully
      'skipped',     -- Patient was present but skipped (e.g., requested to wait)
      'no_show'      -- Patient did not appear when called
    );
  END IF;
END
$$;

-- ── Clinic member role ────────────────────────────────────────────────────────
-- Matches the role concept in DoctorApp.jsx (doctor vs clinic admin/staff)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinic_member_role') THEN
    CREATE TYPE clinic_member_role AS ENUM (
      'doctor',        -- A practising doctor; has their own queue
      'clinic_admin'   -- Clinic staff / receptionist; can manage all queues
    );
  END IF;
END
$$;

-- ── Doctor availability status ────────────────────────────────────────────────
-- Matches DOCTOR_STATUS in mockDoctorData.js
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doctor_availability') THEN
    CREATE TYPE doctor_availability AS ENUM (
      'available',    -- Accepting patients
      'on_break',     -- Temporarily paused; queue held
      'unavailable'   -- Not working today / inactive
    );
  END IF;
END
$$;


-- =============================================================================
-- SECTION 3 — TABLES  (created in FK dependency order)
-- =============================================================================

-- ── 3.1 clinics ──────────────────────────────────────────────────────────────
--
--  Root entity. A clinic can have multiple doctors and multiple staff members.
--  Matches: CLINICS array in mockData.js + MOCK_CLINICS in mockDoctorData.js
--
CREATE TABLE IF NOT EXISTS public.clinics (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT          NOT NULL,
  place       TEXT          NOT NULL,                    -- locality / city description
  mobile      TEXT          NOT NULL,                    -- clinic contact number (digits only)
  active      BOOLEAN       NOT NULL DEFAULT TRUE,       -- soft-delete / disable clinic
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT clinics_name_not_empty   CHECK (TRIM(name)   <> ''),
  CONSTRAINT clinics_place_not_empty  CHECK (TRIM(place)  <> ''),
  CONSTRAINT clinics_mobile_not_empty CHECK (TRIM(mobile) <> '')
);

COMMENT ON TABLE  public.clinics              IS 'Healthcare clinics and health camps registered in the system.';
COMMENT ON COLUMN public.clinics.mobile       IS 'Clinic contact number, stored as digit string (no spaces/dashes).';
COMMENT ON COLUMN public.clinics.active       IS 'FALSE = soft-deleted; clinic no longer appears in patient search.';


-- ── 3.2 doctors ──────────────────────────────────────────────────────────────
--
--  A doctor belongs to exactly one clinic.
--  auth_user_id links to Supabase Auth once authentication is wired up.
--  Passwords are NEVER stored here — Supabase Auth handles credentials.
--
--  Matches fields in: mockDoctorData.js MOCK_CLINICS[*].doctors[]
--
CREATE TABLE IF NOT EXISTS public.doctors (
  id                          UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id                   UUID              NOT NULL
                                                REFERENCES public.clinics(id)
                                                ON DELETE RESTRICT,   -- prevent accidental clinic deletion with live doctors
  auth_user_id                UUID              UNIQUE,               -- nullable until Supabase Auth is wired; references auth.users(id)
  name                        TEXT              NOT NULL,
  specialization              TEXT              NOT NULL,             -- e.g. 'General Physician', 'Gynaecologist'
  username                    TEXT              NOT NULL UNIQUE,      -- application login username (e.g. 'arun.kumar')
  average_consultation_minutes INT              NOT NULL DEFAULT 10
                                                CHECK (average_consultation_minutes > 0
                                                   AND average_consultation_minutes <= 120),
  duty_start                  TIME              NOT NULL DEFAULT '09:00',   -- e.g. '09:00'
  duty_end                    TIME              NOT NULL DEFAULT '17:00',   -- e.g. '17:00'
  break_start                 TIME,                                         -- optional break start
  break_end                   TIME,                                         -- optional break end
  working_days                TEXT[]            NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
                                                -- Array of abbreviated day names: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  availability                doctor_availability NOT NULL DEFAULT 'available',
  created_at                  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT doctors_name_not_empty           CHECK (TRIM(name)           <> ''),
  CONSTRAINT doctors_specialization_not_empty CHECK (TRIM(specialization) <> ''),
  CONSTRAINT doctors_username_not_empty       CHECK (TRIM(username)       <> ''),
  CONSTRAINT doctors_duty_order               CHECK (duty_end > duty_start),
  CONSTRAINT doctors_break_order              CHECK (
    (break_start IS NULL AND break_end IS NULL) OR
    (break_start IS NOT NULL AND break_end IS NOT NULL AND break_end > break_start)
  )
);

COMMENT ON TABLE  public.doctors                       IS 'Doctors registered under a clinic. Passwords are managed by Supabase Auth, not stored here.';
COMMENT ON COLUMN public.doctors.auth_user_id          IS 'Supabase Auth user UUID. Populated when doctor account is created via Auth. NULL until then.';
COMMENT ON COLUMN public.doctors.username              IS 'Application-level login username (e.g. arun.kumar). Used for mock auth; will map to Auth email when migrating.';
COMMENT ON COLUMN public.doctors.working_days          IS 'Array of abbreviated weekday strings, e.g. [''Mon'',''Tue'',''Fri''].';
COMMENT ON COLUMN public.doctors.average_consultation_minutes IS 'Used for estimated time-range calculation. Range: 1–120 minutes.';


-- ── 3.3 clinic_members ───────────────────────────────────────────────────────
--
--  Junction table: which Supabase Auth users are authorized for which clinic.
--  Supports multiple roles (doctor, clinic_admin) per clinic.
--  A clinic_admin can be a non-doctor receptionist (auth_user_id not in doctors).
--
CREATE TABLE IF NOT EXISTS public.clinic_members (
  id            UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id     UUID                NOT NULL
                                    REFERENCES public.clinics(id)
                                    ON DELETE CASCADE,    -- if clinic is deleted, remove membership records
  auth_user_id  UUID                NOT NULL,             -- references auth.users(id) — enforced by Supabase
  role          clinic_member_role  NOT NULL DEFAULT 'doctor',
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  -- Each auth user can have at most one role per clinic
  CONSTRAINT clinic_members_unique_user_clinic UNIQUE (clinic_id, auth_user_id)
);

COMMENT ON TABLE  public.clinic_members              IS 'Maps authenticated clinic staff (doctors + admins) to their authorized clinic(s).';
COMMENT ON COLUMN public.clinic_members.auth_user_id IS 'Supabase Auth user UUID. Used for RLS policy enforcement.';
COMMENT ON COLUMN public.clinic_members.role         IS 'doctor = practising doctor with their own queue; clinic_admin = receptionist / staff with full clinic access.';


-- ── 3.4 patients ─────────────────────────────────────────────────────────────
--
--  Patients have NO accounts. No passwords, OTPs, or auth.
--  We use mobile number as the natural lookup key.
--  Duplicate mobiles are allowed (same patient visiting multiple clinics on the
--  same day) — deduplication is handled at the service layer if needed.
--
--  Matches: tokenStorage.js record fields (mobile, patientName, place)
--
CREATE TABLE IF NOT EXISTS public.patients (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL,
  -- Mobile is required for online (patient) bookings; NULL is allowed for
  -- walk-in / phone-booked patients added by clinic staff with no phone.
  mobile      TEXT,                    -- 10-digit Indian mobile or NULL; validated by check below
  place       TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT patients_name_not_empty   CHECK (TRIM(name) <> ''),
  -- Mobile must be exactly 10 digits when provided; NULL is fine for walk-ins.
  CONSTRAINT patients_mobile_format    CHECK (mobile IS NULL OR mobile ~ '^[0-9]{10}$')
);

-- Index on mobile for fast "Check Token" lookups
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON public.patients (mobile);

COMMENT ON TABLE  public.patients        IS 'Patients who have booked tokens. No authentication — looked up by mobile number.';
COMMENT ON COLUMN public.patients.mobile IS 'NULL for walk-in patients added by staff without a phone. Otherwise exactly 10 digits (no spaces/dashes).';


-- ── 3.5 tokens ───────────────────────────────────────────────────────────────
--
--  Central table. Every visit generates exactly one token.
--  token_number is auto-generated by the database function below (section 4).
--
--  Tracks the full lifecycle: booked → called → consulting → completed/skipped/no_show
--  Matches: tokenStorage.js record + INITIAL_MOCK_QUEUE entries in mockDoctorData.js
--
CREATE TABLE IF NOT EXISTS public.tokens (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Token display number — generated by generate_token_number() below
  -- Format: T001 … T999 (per clinic, per doctor, per day, then resets)
  token_number            TEXT          NOT NULL,

  -- Relationships
  patient_id              UUID          NOT NULL
                                        REFERENCES public.patients(id)
                                        ON DELETE RESTRICT,   -- keep token history even if patient record is cleaned up
  clinic_id               UUID          NOT NULL
                                        REFERENCES public.clinics(id)
                                        ON DELETE RESTRICT,
  doctor_id               UUID          NOT NULL
                                        REFERENCES public.doctors(id)
                                        ON DELETE RESTRICT,

  -- Booking metadata
  booking_type            booking_type  NOT NULL DEFAULT 'online',
  status                  token_status  NOT NULL DEFAULT 'waiting',

  -- Lifecycle timestamps — populated progressively as status changes
  booked_at               TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  called_at               TIMESTAMPTZ,               -- when doctor clicked "Call Next"
  consultation_started_at TIMESTAMPTZ,               -- when doctor clicked "Start Consultation"
  completed_at            TIMESTAMPTZ,               -- when doctor clicked "Complete"
  skipped_at              TIMESTAMPTZ,               -- when doctor clicked "Skip / No-show"

  -- Clinic-local calendar date of the booking (Asia/Kolkata = IST).
  -- Stored as a plain DATE so the unique index on (clinic_id, doctor_id,
  -- token_number, booked_date) uses only plain-column references, satisfying
  -- PostgreSQL's requirement that all index expressions are IMMUTABLE.
  -- Populated explicitly by book_token() and add_phone_patient() — never rely
  -- on a computed expression inside the index itself.
  booked_date             DATE          NOT NULL
                                        DEFAULT (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE,

  -- NOTE: daily token-number uniqueness is enforced by the UNIQUE index
  -- idx_tokens_unique_number_per_day (Section 5) on the plain booked_date column.

  -- Consistency: a token can only have one terminal status
  CONSTRAINT tokens_terminal_timestamps CHECK (
    (status IN ('completed') AND completed_at IS NOT NULL) OR
    (status IN ('skipped', 'no_show') AND skipped_at IS NOT NULL) OR
    (status NOT IN ('completed', 'skipped', 'no_show'))
  )
);

COMMENT ON TABLE  public.tokens                      IS 'One row per clinic visit / queue slot. Token number is system-generated.';
COMMENT ON COLUMN public.tokens.token_number         IS 'Display token, e.g. T001. Auto-generated per clinic+doctor+day. Never entered manually.';
COMMENT ON COLUMN public.tokens.booking_type         IS 'online = patient booked via app; phone = staff added via Add Patient screen.';
COMMENT ON COLUMN public.tokens.status               IS 'Lifecycle: waiting → called → consulting → completed | skipped | no_show.';
COMMENT ON COLUMN public.tokens.booked_at            IS 'UTC timestamp when the token was created (used for queue ordering).';
COMMENT ON COLUMN public.tokens.booked_date          IS 'Clinic-local calendar date of the booking (Asia/Kolkata / IST). Used for the daily token-number uniqueness constraint. Populated explicitly by book_token() and add_phone_patient().';


-- =============================================================================
-- SECTION 4 — TOKEN NUMBER GENERATION (race-condition safe)
-- =============================================================================
--
--  Problem: if two patients book simultaneously, a naive counter in JS can
--  produce the same token number (race condition).
--
--  Solution: use a PostgreSQL SEQUENCE per (clinic, doctor, date) managed
--  inside a database FUNCTION called via RPC. The database serialises all
--  concurrent calls — no two calls ever return the same number.
--
--  Token format: T001, T002, … T999  (resets at midnight each day)
--
-- ── 4.1 Per-clinic-doctor-day counter table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.token_counters (
  clinic_id   UUID      NOT NULL REFERENCES public.clinics(id)  ON DELETE CASCADE,
  doctor_id   UUID      NOT NULL REFERENCES public.doctors(id)  ON DELETE CASCADE,
  token_date  DATE      NOT NULL DEFAULT CURRENT_DATE,
  last_number INT       NOT NULL DEFAULT 0,

  PRIMARY KEY (clinic_id, doctor_id, token_date),

  CONSTRAINT token_counters_last_number_positive CHECK (last_number >= 0)
);

COMMENT ON TABLE public.token_counters IS 'Atomic per-clinic-per-doctor-per-day counter for token number generation. Never update this directly — use generate_token_number().';

-- ── 4.2 Token number generator function ─────────────────────────────────────
--
--  Called as: SELECT generate_token_number(clinic_uuid, doctor_uuid)
--  Returns:   'T001', 'T002', … 'T999'
--
--  Uses FOR UPDATE to lock the row and prevent concurrent duplicates.
--  Resets automatically each calendar day (token_date = CURRENT_DATE).
--
CREATE OR REPLACE FUNCTION public.generate_token_number(
  p_clinic_id  UUID,
  p_doctor_id  UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER    -- runs with elevated privileges so anon callers can write to token_counters
AS $$
DECLARE
  v_next  INT;
BEGIN
  -- Insert a new day-row if it doesn't exist; otherwise increment atomically.
  INSERT INTO public.token_counters (clinic_id, doctor_id, token_date, last_number)
  VALUES (p_clinic_id, p_doctor_id, CURRENT_DATE, 1)
  ON CONFLICT (clinic_id, doctor_id, token_date)
  DO UPDATE
    SET last_number = token_counters.last_number + 1
  RETURNING last_number INTO v_next;

  -- Format as T001 … T999
  RETURN 'T' || LPAD(v_next::TEXT, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.generate_token_number(UUID, UUID) IS
  'Atomically generates the next token number for a clinic+doctor on today''s date. '
  'Returns T001..T999. Resets each calendar day. Race-condition safe.';


-- =============================================================================
-- SECTION 5 — INDEXES
-- =============================================================================
--
--  Optimises the three most common query patterns:
--    A) Patient checks active token by mobile number
--    B) Doctor loads their live queue
--    C) Clinic admin views all doctors

-- ── A) Check Token by mobile (patients table + tokens join) ──────────────────
-- idx_patients_mobile already created under the patients table above.

-- Active tokens for a mobile number (filter: status not terminal)
CREATE INDEX IF NOT EXISTS idx_tokens_patient_id
  ON public.tokens (patient_id);

-- Composite: the exact query pattern for "Check Token"
-- Looks up all active tokens for a patient, newest first
CREATE INDEX IF NOT EXISTS idx_tokens_patient_status
  ON public.tokens (patient_id, status, booked_at DESC);

-- ── B) Doctor's live queue ────────────────────────────────────────────────────
-- Most frequent query on the Doctor Side: load waiting+consulting tokens in order
CREATE INDEX IF NOT EXISTS idx_tokens_doctor_status_booked
  ON public.tokens (doctor_id, status, booked_at ASC);

-- Also supports clinic-wide queue view for clinic_admins
CREATE INDEX IF NOT EXISTS idx_tokens_clinic_status_booked
  ON public.tokens (clinic_id, status, booked_at ASC);

-- ── Token number daily uniqueness ────────────────────────────────────────────
-- Uses the plain booked_date DATE column (populated by book_token / add_phone_patient)
-- so that the index references only stored columns, satisfying PostgreSQL's
-- IMMUTABLE requirement for index expressions.  Token numbers are guaranteed
-- unique per clinic, per doctor, per IST calendar day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_unique_number_per_day
  ON public.tokens (clinic_id, doctor_id, token_number, booked_date);

-- ── C) Clinic doctors list ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doctors_clinic_id
  ON public.doctors (clinic_id);

-- ── D) Auth / membership lookups ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_doctors_auth_user_id
  ON public.doctors (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_members_auth_user_id
  ON public.clinic_members (auth_user_id);

CREATE INDEX IF NOT EXISTS idx_clinic_members_clinic_id
  ON public.clinic_members (clinic_id);

-- ── E) General / admin ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tokens_booked_at
  ON public.tokens (booked_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinics_active
  ON public.clinics (active)
  WHERE active = TRUE;


-- =============================================================================
-- SECTION 6 — ROW LEVEL SECURITY (RLS)
-- =============================================================================
--
--  DESIGN PRINCIPLES
--  ─────────────────
--  1. RLS is ENABLED on every table — never disabled.
--  2. Clinic staff can only see and modify data for THEIR clinic.
--  3. Patients are unauthenticated (anon role). They get NO direct table access.
--     All patient operations go through SECURITY DEFINER RPC functions (Section 7).
--  4. The 'service_role' key (backend/admin only) bypasses RLS by design.
--     Never expose service_role to the frontend.
--
--  AUTH HELPER
--  ───────────
--  auth.uid()        → UUID of the currently authenticated Supabase user
--  auth.role()       → 'anon' | 'authenticated' | 'service_role'
--
--  POLICY NAMING CONVENTION
--  ────────────────────────
--  {table}_{operation}_{subject}
--  e.g. tokens_select_own_clinic, doctors_insert_clinic_admin

-- ── Enable RLS on all tables ─────────────────────────────────────────────────
ALTER TABLE public.clinics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_counters   ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- 6.1 — clinics table policies
-- =============================================================================

-- Drop and recreate so re-runs are safe
DROP POLICY IF EXISTS clinics_select_own    ON public.clinics;
DROP POLICY IF EXISTS clinics_update_admin  ON public.clinics;

-- Authenticated clinic staff can see their own clinic
CREATE POLICY clinics_select_own
  ON public.clinics
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
    )
  );

-- Only clinic_admins can update clinic details
CREATE POLICY clinics_update_admin
  ON public.clinics
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  );

-- NOTE: Patients need to see the list of active clinics to book a token.
-- This is handled via the get_active_clinics() RPC function in Section 7
-- (SECURITY DEFINER) so we do NOT add a broad anon SELECT policy here.


-- =============================================================================
-- 6.2 — doctors table policies
-- =============================================================================

DROP POLICY IF EXISTS doctors_select_own_clinic   ON public.doctors;
DROP POLICY IF EXISTS doctors_select_self          ON public.doctors;
DROP POLICY IF EXISTS doctors_update_self          ON public.doctors;
DROP POLICY IF EXISTS doctors_insert_clinic_admin  ON public.doctors;
DROP POLICY IF EXISTS doctors_update_clinic_admin  ON public.doctors;

-- Any clinic member can see all doctors in their clinic (for doctor-selection UI)
CREATE POLICY doctors_select_own_clinic
  ON public.doctors
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
    )
  );

-- A doctor can update their own availability/break status
CREATE POLICY doctors_update_self
  ON public.doctors
  FOR UPDATE
  TO authenticated
  USING      (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Clinic admins can insert new doctors into their clinic
CREATE POLICY doctors_insert_clinic_admin
  ON public.doctors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  );

-- Clinic admins can update any doctor in their clinic
CREATE POLICY doctors_update_clinic_admin
  ON public.doctors
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  );


-- =============================================================================
-- 6.3 — clinic_members table policies
-- =============================================================================

DROP POLICY IF EXISTS clinic_members_select_own  ON public.clinic_members;
DROP POLICY IF EXISTS clinic_members_insert_admin ON public.clinic_members;
DROP POLICY IF EXISTS clinic_members_delete_admin ON public.clinic_members;

-- Members can see the membership list for their own clinic
CREATE POLICY clinic_members_select_own
  ON public.clinic_members
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members cm2
      WHERE cm2.auth_user_id = auth.uid()
    )
  );

-- Clinic admins can add new members to their clinic
CREATE POLICY clinic_members_insert_admin
  ON public.clinic_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  );

-- Clinic admins can remove members from their clinic
CREATE POLICY clinic_members_delete_admin
  ON public.clinic_members
  FOR DELETE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
  );


-- =============================================================================
-- 6.4 — patients table policies
-- =============================================================================
--
--  Patients have NO accounts. The 'anon' role has NO direct access.
--  All patient reads/writes go through SECURITY DEFINER RPC functions.
--  Clinic staff can read patient info for patients who have tokens at their clinic.

DROP POLICY IF EXISTS patients_select_clinic_member ON public.patients;

-- Clinic members can read patient details for their clinic's tokens
CREATE POLICY patients_select_clinic_member
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT t.patient_id FROM public.tokens t
      JOIN public.clinic_members cm ON cm.clinic_id = t.clinic_id
      WHERE cm.auth_user_id = auth.uid()
    )
  );

-- No anon SELECT/INSERT/UPDATE/DELETE — handled by SECURITY DEFINER RPCs below.


-- =============================================================================
-- 6.5 — tokens table policies
-- =============================================================================

DROP POLICY IF EXISTS tokens_select_own_clinic    ON public.tokens;
DROP POLICY IF EXISTS tokens_update_own_clinic    ON public.tokens;

-- Clinic members can see all tokens for their clinic (for the live queue)
CREATE POLICY tokens_select_own_clinic
  ON public.tokens
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
    )
  );

-- Clinic members can update token status (call next, complete, skip)
-- Doctor-role: only their own doctor_id tokens
-- Clinic-admin-role: all tokens for the clinic
CREATE POLICY tokens_update_own_clinic
  ON public.tokens
  FOR UPDATE
  TO authenticated
  USING (
    -- Clinic admin: any token in their clinic
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
        AND role = 'clinic_admin'
    )
    OR
    -- Doctor: only their own tokens
    doctor_id IN (
      SELECT id FROM public.doctors
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid()
    )
  );

-- No anon INSERT — patient token creation goes through book_token() RPC below.


-- =============================================================================
-- 6.6 — token_counters table policies
-- =============================================================================
--
--  token_counters is an internal table. Direct access from the frontend is
--  never needed — generate_token_number() (SECURITY DEFINER) manages it.
--  No policies needed beyond RLS being enabled.
--  (SECURITY DEFINER functions bypass RLS for the tables they touch.)

-- No policies added intentionally — fully protected by RLS + SECURITY DEFINER.


-- =============================================================================
-- SECTION 7 — SECURE RPC FUNCTIONS FOR UNAUTHENTICATED PATIENT OPERATIONS
-- =============================================================================
--
--  These functions run as SECURITY DEFINER (elevated role) so the anon user
--  can call them via supabase.rpc() without needing direct table access.
--
--  All patient-facing operations go through these functions:
--    get_active_clinics()           → patient clinic search
--    book_token(...)                → patient token booking
--    check_token_by_mobile(mobile)  → patient Check Token screen
--
--  Security model:
--    • The anon key calls these functions — no direct table SELECT/INSERT.
--    • Functions validate inputs and enforce business rules before writing.
--    • No sensitive data (doctor passwords, clinic_members) is returned to anon.


-- ── 7.1 get_active_clinics() ──────────────────────────────────────────────────
--
--  Returns the list of active clinics with their doctors for the patient's
--  clinic-selection screen. No authentication required.
--
--  Returns: JSON array of clinics with embedded doctors array.
--
CREATE OR REPLACE FUNCTION public.get_active_clinics()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE      -- result can be cached within a transaction
AS $$
  SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'id',      c.id,
      'name',    c.name,
      'place',   c.place,
      'mobile',  c.mobile,
      'doctors', (
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',             d.id,
            'name',           d.name,
            'specialisation', d.specialization,
            'availability',   d.availability
          )
          ORDER BY d.name
        )
        FROM public.doctors d
        WHERE d.clinic_id = c.id
          AND d.availability <> 'unavailable'
      )
    )
    ORDER BY c.name
  )
  FROM public.clinics c
  WHERE c.active = TRUE;
$$;

COMMENT ON FUNCTION public.get_active_clinics() IS
  'Public (anon-callable) function. Returns active clinics + available doctors for the patient booking flow. No sensitive data exposed.';

-- Grant execute to the anon role (unauthenticated patients)
GRANT EXECUTE ON FUNCTION public.get_active_clinics() TO anon;


-- ── 7.2 book_token(...) ───────────────────────────────────────────────────────
--
--  Creates a patient record (if new) and issues a token atomically.
--  Called from the patient's "Book Token" confirmation screen.
--
--  Returns: JSON with { token_number, clinic_name, doctor_name, booked_at }
--
--  Business rules enforced here:
--    • Clinic must be active.
--    • Doctor must exist in that clinic and be available.
--    • Token number is generated atomically (no duplicates possible).
--    • booking_type is hardcoded to 'online' for patient-initiated bookings.
--
CREATE OR REPLACE FUNCTION public.book_token(
  p_patient_name  TEXT,
  p_mobile        TEXT,
  p_place         TEXT,
  p_clinic_id     UUID,
  p_doctor_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patient_id          UUID;
  v_token_id            UUID;
  v_token_number        TEXT;
  v_clinic_name         TEXT;
  v_doctor_name         TEXT;
  v_doctor_availability TEXT;
BEGIN
  -- ── Validate inputs ─────────────────────────────────────────────────────────
  IF TRIM(p_patient_name) = '' THEN
    RAISE EXCEPTION 'Patient name is required.';
  END IF;

  IF p_mobile !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'Mobile number must be exactly 10 digits.';
  END IF;

  -- ── Validate clinic + doctor ─────────────────────────────────────────────────
  SELECT name INTO v_clinic_name
  FROM public.clinics
  WHERE id = p_clinic_id AND active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found or inactive.';
  END IF;

  SELECT name, availability INTO v_doctor_name, v_doctor_availability
  FROM public.doctors
  WHERE id = p_doctor_id
    AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor not found in this clinic.';
  END IF;

  -- ── Create patient record (upsert on mobile) ─────────────────────────────────
  -- If the same mobile books again, we create a new patient row each time
  -- (visit-based model). The service layer can deduplicate if needed.
  INSERT INTO public.patients (name, mobile, place)
  VALUES (TRIM(p_patient_name), p_mobile, COALESCE(TRIM(p_place), ''))
  RETURNING id INTO v_patient_id;

  -- ── Generate race-safe token number ─────────────────────────────────────────
  v_token_number := public.generate_token_number(p_clinic_id, p_doctor_id);

  -- ── Insert the token ─────────────────────────────────────────────────────────
  INSERT INTO public.tokens (
    token_number, patient_id, clinic_id, doctor_id,
    booking_type, status, booked_at, booked_date
  )
  VALUES (
    v_token_number, v_patient_id, p_clinic_id, p_doctor_id,
    'online', 'waiting', NOW(),
    -- IST date at the moment of booking — drives daily uniqueness
    (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
  )
  RETURNING id INTO v_token_id;

  -- ── Return summary to the patient UI ────────────────────────────────────────
  RETURN JSON_BUILD_OBJECT(
    'id',                  v_token_id,
    'token_number',        v_token_number,
    'clinic_name',         v_clinic_name,
    'doctor_name',         v_doctor_name,
    'doctor_availability', COALESCE(v_doctor_availability, 'available'),
    'booked_at',           NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.book_token(TEXT, TEXT, TEXT, UUID, UUID) IS
  'Anon-callable. Validates inputs, creates patient + token atomically. Returns token summary. Token number is race-safe via generate_token_number().';

GRANT EXECUTE ON FUNCTION public.book_token(TEXT, TEXT, TEXT, UUID, UUID) TO anon;


-- ── 7.3 check_token_by_mobile(mobile) ────────────────────────────────────────
--
--  Returns all active tokens for a given mobile number.
--  Used by the "Check Token" screen on the Patient Side.
--
--  Active = status IN ('waiting', 'called', 'consulting')
--  Returns ONLY the fields the patient needs — no internal IDs or auth data.
--
CREATE OR REPLACE FUNCTION public.check_token_by_mobile(
  p_mobile TEXT
)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    JSON_AGG(
      JSON_BUILD_OBJECT(
        'token_number',  t.token_number,
        'status',        t.status,
        'booking_type',  t.booking_type,
        'booked_at',     t.booked_at,
        'clinic_name',   c.name,
        'clinic_place',  c.place,
        'clinic_mobile', c.mobile,
        'doctor_name',         d.name,
        'doctor_spec',         d.specialization,
        'doctor_availability', COALESCE(d.availability, 'available'),
        -- queue_position: how many 'waiting' tokens are ahead of this one
        'queue_position', (
          SELECT COUNT(*)
          FROM public.tokens t2
          WHERE t2.clinic_id = t.clinic_id
            AND t2.doctor_id = t.doctor_id
            AND t2.status = 'waiting'
            AND t2.booked_at < t.booked_at
        )
      )
      ORDER BY t.booked_at ASC
    ),
    '[]'::JSON
  )
  FROM public.tokens t
  JOIN public.patients  p ON p.id = t.patient_id
  JOIN public.clinics   c ON c.id = t.clinic_id
  JOIN public.doctors   d ON d.id = t.doctor_id
  WHERE p.mobile = p_mobile
    AND (
      t.status IN ('waiting', 'called', 'consulting')
      OR (t.status IN ('skipped', 'no_show') AND t.booked_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE)
    );
$$;

COMMENT ON FUNCTION public.check_token_by_mobile(TEXT) IS
  'Anon-callable. Returns active token summary for a patient mobile number. No passwords, auth IDs, or clinic_members data returned.';

GRANT EXECUTE ON FUNCTION public.check_token_by_mobile(TEXT) TO anon;


-- ── 7.4 add_phone_patient(...) ────────────────────────────────────────────────
--
--  Allows authenticated clinic staff to add a walk-in / phone-booked patient.
--  booking_type is hardcoded to 'phone'.
--  Callable only by authenticated users (not anon).
--
CREATE OR REPLACE FUNCTION public.add_phone_patient(
  p_patient_name  TEXT,
  p_mobile        TEXT,   -- may be empty string for anonymous walk-ins
  p_place         TEXT,
  p_clinic_id     UUID,
  p_doctor_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_patient_id    UUID;
  v_token_id      UUID;
  v_token_number  TEXT;
  v_caller_clinic UUID;
BEGIN
  -- ── Confirm caller is a member of this clinic ────────────────────────────────
  SELECT clinic_id INTO v_caller_clinic
  FROM public.clinic_members
  WHERE auth_user_id = auth.uid()
    AND clinic_id = p_clinic_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: you are not a member of this clinic.';
  END IF;

  -- ── Validate inputs ─────────────────────────────────────────────────────────
  IF TRIM(p_patient_name) = '' THEN
    RAISE EXCEPTION 'Patient name is required.';
  END IF;

  -- Mobile can be empty for walk-in patients without a phone
  IF p_mobile <> '' AND p_mobile !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'Mobile number must be exactly 10 digits or left empty.';
  END IF;

  -- Validate doctor belongs to clinic
  IF NOT EXISTS (
    SELECT 1 FROM public.doctors
    WHERE id = p_doctor_id AND clinic_id = p_clinic_id
  ) THEN
    RAISE EXCEPTION 'Doctor not found in this clinic.';
  END IF;

  -- ── Create patient record ────────────────────────────────────────────────────
  -- Store NULL when mobile is empty (walk-in without a phone), not empty string.
  INSERT INTO public.patients (name, mobile, place)
  VALUES (TRIM(p_patient_name), NULLIF(TRIM(p_mobile), ''), COALESCE(TRIM(p_place), ''))
  RETURNING id INTO v_patient_id;

  -- ── Generate token number ────────────────────────────────────────────────────
  v_token_number := public.generate_token_number(p_clinic_id, p_doctor_id);

  -- ── Insert token ─────────────────────────────────────────────────────────────
  INSERT INTO public.tokens (
    token_number, patient_id, clinic_id, doctor_id,
    booking_type, status, booked_at, booked_date
  )
  VALUES (
    v_token_number, v_patient_id, p_clinic_id, p_doctor_id,
    'phone', 'waiting', NOW(),
    -- IST date at the moment of booking — drives daily uniqueness
    (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE
  )
  RETURNING id INTO v_token_id;

  RETURN JSON_BUILD_OBJECT(
    'id',           v_token_id,
    'token_number', v_token_number,
    'patient_name', p_patient_name,
    'booking_type', 'phone'
  );
END;
$$;

COMMENT ON FUNCTION public.add_phone_patient(TEXT, TEXT, TEXT, UUID, UUID) IS
  'Authenticated-only. Clinic staff add walk-in/phone patients. Validates caller is a member of the target clinic.';

-- Only authenticated users (clinic staff) — NOT anon
GRANT EXECUTE ON FUNCTION public.add_phone_patient(TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;


-- =============================================================================
-- SECTION 8 — VERIFIED GRANT SUMMARY
-- =============================================================================
--
--  anon role receives:
--    EXECUTE on: get_active_clinics(), book_token(), check_token_by_mobile()
--    NO direct table SELECT / INSERT / UPDATE / DELETE
--
--  authenticated role receives:
--    Table access controlled by RLS policies (sections 6.1 – 6.5)
--    EXECUTE on: add_phone_patient()
--
--  service_role (backend / server-side only):
--    Bypasses RLS by design — never expose this key in frontend code.
--
-- =============================================================================


-- =============================================================================
-- SECTION 9 — NOTES FOR SUPABASE DASHBOARD ACTIONS
-- =============================================================================
--
--  The following CANNOT be done via SQL alone and require the Supabase Dashboard:
--
--  1. CREATE AUTH USERS
--     Go to: Authentication → Users → "Invite user" or "Add user"
--     Create one Auth user per doctor/clinic-admin.
--     Copy the resulting auth.users.id UUID.
--
--  2. LINK AUTH USERS TO DOCTORS
--     After creating Auth users, run:
--       UPDATE public.doctors SET auth_user_id = '<auth-user-uuid>'
--       WHERE username = 'arun.kumar';
--     (Repeat for each doctor.)
--
--  3. POPULATE clinic_members
--     INSERT INTO public.clinic_members (clinic_id, auth_user_id, role)
--     VALUES ('<clinic-uuid>', '<auth-user-uuid>', 'doctor');
--     (One row per doctor or admin, per clinic.)
--
--  4. REALTIME (optional, for future live-queue auto-refresh)
--     Go to: Database → Replication → Add table → tokens
--     This enables supabase.channel().on('postgres_changes') subscriptions.
--
--  5. STORAGE (not needed yet — no file uploads in this app)
--
-- =============================================================================


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
