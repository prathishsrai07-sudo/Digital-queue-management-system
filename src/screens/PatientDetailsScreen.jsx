/**
 * PatientDetailsScreen.jsx
 * ------------------------
 * Step 1 of the "Get Token" flow.
 * Collects: Name, Mobile Number, Place.
 * Validates inputs before allowing the patient to continue.
 *
 * FIX: Accepts an `initialValues` prop so that when the patient
 * clicks "Edit Patient Details" from the booking confirmation screen,
 * the form is pre-filled with their previously entered data instead
 * of starting blank.
 */
import { useState } from 'react';
import Card from '../components/Card';
import Button from '../components/Button';
import InputField from '../components/InputField';
import StepHeader from '../components/StepHeader';

export default function PatientDetailsScreen({ onBack, onContinue, initialValues }) {
  // Seed form from initialValues if provided (edit flow), otherwise start blank (new flow)
  const [form, setForm] = useState({
    name:   initialValues?.name   ?? '',
    mobile: initialValues?.mobile ?? '',
    place:  initialValues?.place  ?? '',
  });
  // Validation error messages
  const [errors, setErrors] = useState({});

  // Update a single form field by key
  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear the error for this field as soon as user starts typing
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  // Validate all fields and return true if everything is OK
  const validate = () => {
    const newErrors = {};

    if (!form.name.trim()) {
      newErrors.name = 'Please enter your name.';
    }

    const mobileRegex = /^[6-9]\d{9}$/;
    if (!form.mobile.trim()) {
      newErrors.mobile = 'Please enter your mobile number.';
    } else if (!mobileRegex.test(form.mobile.trim())) {
      newErrors.mobile = 'Enter a valid 10-digit Indian mobile number.';
    }

    if (!form.place.trim()) {
      newErrors.place = 'Please enter your place / town.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = () => {
    if (validate()) {
      // Pass the validated patient data up to App.jsx
      onContinue({
        name:   form.name.trim(),
        mobile: form.mobile.trim(),
        place:  form.place.trim(),
      });
    }
  };

  return (
    <Card>
      <StepHeader
        title="Patient Details"
        subtitle="Please tell us a bit about yourself to continue."
        onBack={onBack}
      />

      <div className="flex flex-col gap-5">
        <InputField
          id="name"
          label="Full Name"
          type="text"
          placeholder="e.g. Rahul Kumar"
          value={form.name}
          onChange={handleChange('name')}
          error={errors.name}
          autoFocus
        />

        <InputField
          id="mobile"
          label="Mobile Number"
          type="tel"
          placeholder="10-digit mobile number"
          maxLength={10}
          value={form.mobile}
          onChange={handleChange('mobile')}
          error={errors.mobile}
        />

        <InputField
          id="place"
          label="Place / Town"
          type="text"
          placeholder="e.g. Koramangala"
          value={form.place}
          onChange={handleChange('place')}
          error={errors.place}
        />

        <Button onClick={handleContinue} className="w-full mt-2">
          Continue
        </Button>
      </div>
    </Card>
  );
}
