-- ============================================================================
-- RPC: upsert_clinic_doctor
-- ============================================================================
-- Allows authorized clinic staff (both 'doctor' and 'clinic_admin' roles)
-- to add new doctors to their clinic and update existing doctors' duty timings,
-- break timings, average consultation minutes, and availability.
--
-- Security:
--   Runs as SECURITY DEFINER to allow doctor additions/updates while strictly
--   verifying that the calling user belongs to the target clinic in clinic_members.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_clinic_doctor(
  p_doctor_id UUID,                     -- pass NULL to INSERT a new doctor, or a UUID to UPDATE
  p_clinic_id UUID,
  p_name TEXT,
  p_specialization TEXT,
  p_username TEXT,
  p_average_consultation_minutes INT,
  p_duty_start TIME,
  p_duty_end TIME,
  p_break_start TIME DEFAULT NULL,
  p_break_end TIME DEFAULT NULL,
  p_working_days TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  p_availability doctor_availability DEFAULT 'available'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_clinic UUID;
  v_result public.doctors;
BEGIN
  -- 1. Verify caller is an active member of this clinic
  SELECT clinic_id INTO v_caller_clinic
  FROM public.clinic_members
  WHERE auth_user_id = auth.uid()
    AND clinic_id = p_clinic_id;

  IF v_caller_clinic IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: You are not authorized to manage doctors for this clinic.';
  END IF;

  -- 2. Validate input constraints (matching DB check constraints)
  IF TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Doctor name cannot be empty.';
  END IF;

  IF TRIM(p_specialization) = '' THEN
    RAISE EXCEPTION 'Specialization cannot be empty.';
  END IF;

  IF TRIM(p_username) = '' THEN
    RAISE EXCEPTION 'Username cannot be empty.';
  END IF;

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

  -- 3. Insert or Update
  IF p_doctor_id IS NULL THEN
    INSERT INTO public.doctors (
      clinic_id,
      name,
      specialization,
      username,
      average_consultation_minutes,
      duty_start,
      duty_end,
      break_start,
      break_end,
      working_days,
      availability
    )
    VALUES (
      p_clinic_id,
      TRIM(p_name),
      TRIM(p_specialization),
      LOWER(TRIM(p_username)),
      p_average_consultation_minutes,
      p_duty_start,
      p_duty_end,
      p_break_start,
      p_break_end,
      p_working_days,
      p_availability
    )
    RETURNING * INTO v_result;
  ELSE
    UPDATE public.doctors
    SET
      name = TRIM(p_name),
      specialization = TRIM(p_specialization),
      username = LOWER(TRIM(p_username)),
      average_consultation_minutes = p_average_consultation_minutes,
      duty_start = p_duty_start,
      duty_end = p_duty_end,
      break_start = p_break_start,
      break_end = p_break_end,
      working_days = p_working_days,
      availability = p_availability
    WHERE id = p_doctor_id
      AND clinic_id = p_clinic_id
    RETURNING * INTO v_result;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Doctor with ID % was not found for this clinic.', p_doctor_id;
    END IF;
  END IF;

  RETURN ROW_TO_JSON(v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_clinic_doctor TO authenticated;
