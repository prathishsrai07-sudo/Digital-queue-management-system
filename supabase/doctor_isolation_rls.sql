-- ============================================================================
-- STRICT PER-DOCTOR ISOLATION & RLS POLICIES
-- File: supabase/doctor_isolation_rls.sql
-- ============================================================================
-- In the Doctor Portal, one doctor must NEVER see, switch to, or manage
-- another doctor's queue, tokens, or settings, even in the same clinic.
--
-- 1. tokens RLS:
--    - Doctors (authenticated) can SELECT ONLY tokens where doctor_id belongs to auth.uid().
--    - Doctors can UPDATE (call, start, complete, skip) ONLY tokens where doctor_id belongs to auth.uid().
--    - Clinic Admins & Platform Admins retain multi-doctor oversight.
--
-- 2. doctors RLS:
--    - Doctors (authenticated) can SELECT ONLY their own doctor record (auth_user_id = auth.uid()).
--    - Doctors can UPDATE ONLY their own operational schedule and availability.
--
-- 3. doctor_update_schedule RPC:
--    - Validates caller identity: auth.uid() must match the doctor's auth_user_id.
-- ============================================================================

-- ── 1. TOKENS RLS: STRICT PER-DOCTOR QUEUE ISOLATION ────────────────────────

DROP POLICY IF EXISTS tokens_select_own_clinic ON public.tokens;
DROP POLICY IF EXISTS tokens_select_doctor_isolation ON public.tokens;

CREATE POLICY tokens_select_doctor_isolation
  ON public.tokens
  FOR SELECT
  TO authenticated
  USING (
    -- Platform Admin can view all tokens
    EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
    OR
    -- Clinic Admin can view tokens for their clinic
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid() AND role = 'clinic_admin'
    )
    OR
    -- Doctor can ONLY view their own assigned tokens
    doctor_id IN (
      SELECT id FROM public.doctors
      WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tokens_update_own_clinic ON public.tokens;
DROP POLICY IF EXISTS tokens_update_doctor_isolation ON public.tokens;

CREATE POLICY tokens_update_doctor_isolation
  ON public.tokens
  FOR UPDATE
  TO authenticated
  USING (
    -- Platform Admin can update tokens
    EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
    OR
    -- Clinic Admin can update tokens for their clinic
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid() AND role = 'clinic_admin'
    )
    OR
    -- Doctor can ONLY call/consult/skip/complete their own assigned tokens
    doctor_id IN (
      SELECT id FROM public.doctors
      WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
    OR
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid() AND role = 'clinic_admin'
    )
    OR
    doctor_id IN (
      SELECT id FROM public.doctors
      WHERE auth_user_id = auth.uid()
    )
  );


-- ── 2. DOCTORS RLS: ISOLATED DOCTOR PROFILE ACCESS ──────────────────────────

DROP POLICY IF EXISTS doctors_select_own_clinic ON public.doctors;
DROP POLICY IF EXISTS doctors_select_isolated ON public.doctors;

CREATE POLICY doctors_select_isolated
  ON public.doctors
  FOR SELECT
  TO authenticated
  USING (
    -- Platform Admin can see all doctors
    EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
    OR
    -- Clinic Admin can see all doctors in their clinic
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid() AND role = 'clinic_admin'
    )
    OR
    -- Doctor can ONLY see their own doctor record
    auth_user_id = auth.uid()
  );

DROP POLICY IF EXISTS doctors_update_self ON public.doctors;
DROP POLICY IF EXISTS doctors_update_isolated ON public.doctors;

CREATE POLICY doctors_update_isolated
  ON public.doctors
  FOR UPDATE
  TO authenticated
  USING (
    -- Platform Admin can update
    EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
    OR
    -- Clinic Admin can update doctors in their clinic
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid() AND role = 'clinic_admin'
    )
    OR
    -- Doctor can ONLY update their own record
    auth_user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid())
    OR
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE auth_user_id = auth.uid() AND role = 'clinic_admin'
    )
    OR
    auth_user_id = auth.uid()
  );


-- ── 3. SECURED RPC: doctor_update_schedule ──────────────────────────────────
-- Enforces that caller auth.uid() matches the doctor's auth_user_id.

CREATE OR REPLACE FUNCTION public.doctor_update_schedule(
  p_doctor_id UUID,
  p_duty_start TIME,
  p_duty_end TIME,
  p_break_start TIME DEFAULT NULL,
  p_break_end TIME DEFAULT NULL,
  p_average_consultation_minutes INT DEFAULT 10,
  p_working_days TEXT[] DEFAULT ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
  p_availability doctor_availability DEFAULT 'available'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_updated public.doctors;
BEGIN
  -- Strict caller verification: prevent modifying another doctor's schedule
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.doctors
      WHERE id = p_doctor_id
        AND (auth_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_user_id = auth.uid()))
    ) THEN
      RAISE EXCEPTION 'Access Denied: You can only configure your own doctor schedule.';
    END IF;
  END IF;

  -- Validations
  IF p_average_consultation_minutes <= 0 OR p_average_consultation_minutes > 120 THEN
    RAISE EXCEPTION 'Average consultation minutes must be between 1 and 120.';
  END IF;

  IF p_duty_end <= p_duty_start THEN
    RAISE EXCEPTION 'Duty end time must be after duty start time.';
  END IF;

  IF (p_break_start IS NOT NULL AND p_break_end IS NULL) OR (p_break_start IS NULL AND p_break_end IS NOT NULL) THEN
    RAISE EXCEPTION 'Both break start and break end must be specified, or both left empty.';
  END IF;

  IF p_break_start IS NOT NULL AND p_break_end IS NOT NULL AND p_break_end <= p_break_start THEN
    RAISE EXCEPTION 'Break end time must be after break start time.';
  END IF;

  UPDATE public.doctors
  SET
    duty_start = p_duty_start,
    duty_end = p_duty_end,
    break_start = p_break_start,
    break_end = p_break_end,
    average_consultation_minutes = p_average_consultation_minutes,
    working_days = p_working_days,
    availability = p_availability
  WHERE id = p_doctor_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Doctor with ID % not found.', p_doctor_id;
  END IF;

  RETURN row_to_json(v_updated);
END;
$$;

COMMENT ON FUNCTION public.doctor_update_schedule(UUID, TIME, TIME, TIME, TIME, INT, TEXT[], doctor_availability) IS
  'Doctor Portal: Allows a doctor to configure only their own operational schedule and clinical timings.';

GRANT EXECUTE ON FUNCTION public.doctor_update_schedule(UUID, TIME, TIME, TIME, TIME, INT, TEXT[], doctor_availability) TO authenticated, anon;
