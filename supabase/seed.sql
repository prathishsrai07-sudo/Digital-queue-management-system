-- =============================================================================
--  Smart Digital Queue Management System — Initial Demonstration Seed Script
--  File: supabase/seed.sql
-- =============================================================================
--
--  PURPOSE:
--  Inserts one sample clinic and one sample doctor linked to that clinic.
--  Matches the exact schema constraints in supabase/schema.sql.
--
--  SAFETY & IDEMPOTENCY:
--  • Safe to run multiple times — will NOT create duplicates.
--  • Does NOT drop, truncate, or delete any data.
--  • Does NOT modify the database schema.
--
-- =============================================================================

DO $$
DECLARE
  v_clinic_id UUID;
BEGIN
  -- ── 1. Insert sample clinic (if not already present) ───────────────────────
  SELECT id INTO v_clinic_id
  FROM public.clinics
  WHERE name = 'Sunrise Health Clinic'
  LIMIT 1;

  IF v_clinic_id IS NULL THEN
    INSERT INTO public.clinics (
      name,
      place,
      mobile,
      active
    )
    VALUES (
      'Sunrise Health Clinic',
      'Koramangala, Bengaluru',
      '9800010001',
      TRUE
    )
    RETURNING id INTO v_clinic_id;

    RAISE NOTICE 'Created sample clinic with ID: %', v_clinic_id;
  ELSE
    RAISE NOTICE 'Sample clinic already exists with ID: %', v_clinic_id;
  END IF;

  -- ── 2. Insert sample doctor linked to this clinic (if not present) ────────
  IF NOT EXISTS (
    SELECT 1 FROM public.doctors WHERE username = 'arun.kumar'
  ) THEN
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
      v_clinic_id,
      'Dr. Arun Kumar',
      'General Medicine',
      'arun.kumar',
      10,
      '09:00'::TIME,
      '17:00'::TIME,
      '13:00'::TIME,
      '14:00'::TIME,
      ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      'available'::doctor_availability
    );

    RAISE NOTICE 'Created sample doctor: Dr. Arun Kumar (username: arun.kumar)';
  ELSE
    RAISE NOTICE 'Sample doctor with username arun.kumar already exists.';
  END IF;

END $$;

-- ── 3. Verification Query ───────────────────────────────────────────────────
-- Displays the seeded records directly in the SQL Editor results panel.
SELECT 
  c.id               AS clinic_id,
  c.name             AS clinic_name,
  c.place            AS clinic_place,
  c.mobile           AS clinic_mobile,
  c.active           AS clinic_active,
  d.id               AS doctor_id,
  d.name             AS doctor_name,
  d.specialization   AS doctor_specialization,
  d.username         AS doctor_username,
  d.availability     AS doctor_availability,
  d.duty_start,
  d.duty_end
FROM public.clinics c
JOIN public.doctors d ON d.clinic_id = c.id
WHERE c.name = 'Sunrise Health Clinic';
