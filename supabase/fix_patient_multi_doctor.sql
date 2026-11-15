-- ============================================================================
-- FIX PATIENT MULTI-DOCTOR SELECTION & WEEKEND VISIBILITY
-- File: supabase/fix_patient_multi_doctor.sql
-- ============================================================================
-- 1. Updates get_active_clinics() RPC to return ALL registered doctors of
--    active clinics so multi-doctor clinics always list all doctors on the
--    Patient Portal and open the Doctor Selection screen.
-- 2. Updates all existing doctor rows in public.doctors so their working_days
--    includes all 7 days (including Saturday and Sunday) and availability is 'available'.
-- ============================================================================

-- 1. Update all existing doctors in public.doctors to include all 7 days & available
UPDATE public.doctors
SET
  working_days = ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  availability = 'available';

-- 2. Update get_active_clinics() RPC (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_active_clinics()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT JSON_AGG(
    JSON_BUILD_OBJECT(
      'id',      c.id,
      'name',    c.name,
      'place',   c.place,
      'mobile',  c.mobile,
      'doctors', COALESCE((
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'id',             d.id,
            'name',           d.name,
            'specialisation', d.specialization,
            'specialization', d.specialization,
            'availability',   COALESCE(d.availability, 'available'),
            'duty_start',     d.duty_start,
            'duty_end',       d.duty_end,
            'working_days',   d.working_days
          )
          ORDER BY d.created_at ASC, d.name ASC
        )
        FROM public.doctors d
        WHERE d.clinic_id = c.id
      ), '[]'::json)
    )
    ORDER BY c.created_at ASC, c.name ASC
  )
  FROM public.clinics c
  WHERE c.active = TRUE;
$$;

COMMENT ON FUNCTION public.get_active_clinics() IS
  'Public anon-callable function. Returns active clinics and all their registered doctors for the patient booking flow.';

GRANT EXECUTE ON FUNCTION public.get_active_clinics() TO anon, authenticated;

-- 3. Verification Query: View all active clinics and their doctors
SELECT
  c.name AS clinic_name,
  d.name AS doctor_name,
  d.specialization,
  d.availability,
  d.working_days
FROM public.clinics c
JOIN public.doctors d ON d.clinic_id = c.id
WHERE c.active = TRUE
ORDER BY c.name, d.name;
