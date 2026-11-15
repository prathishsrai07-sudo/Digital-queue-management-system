-- ============================================================================
-- UPDATE: check_token_by_mobile
-- ============================================================================
-- Updates check_token_by_mobile RPC so patients can see their token card
-- if it was marked 'skipped' or 'no_show' today, along with active tokens.
-- ============================================================================

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
        'doctor_name',   d.name,
        'doctor_spec',   d.specialization,
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

GRANT EXECUTE ON FUNCTION public.check_token_by_mobile(TEXT) TO anon, authenticated;
