import React, { useEffect, useState } from 'react';
import { getDoctorProfile, updateDoctorProfile } from '../../api/doctorApi';
import { useAuth } from '../../contexts/useAuth';

export const ProfilePage: React.FC = () => {
  const { updateDoctor } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getDoctorProfile();
        setProfile(data);
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
        setRegistrationNumber(data.registration_number || '');
        setIssuingAuthority(data.issuing_authority || '');
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const updated = await updateDoctorProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
      } as any);

      setProfile(updated);
      updateDoctor(updated);
      setSuccessMsg('Profile updated successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to update profile details.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-xs text-inkmute">Loading profile...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif opsz-96 font-medium text-2xl md:text-3xl text-ink">Physician Profile</h1>
        <p className="text-xs text-inkmute mt-1">
          Manage your clinical identity and professional registration credentials.
        </p>
      </div>

      {successMsg && (
        <div className="bg-magenta/10 border border-magenta/20 text-magenta p-3 rounded-xl text-xs flex items-center gap-2">
          <iconify-icon icon="ph:check-circle-fill" width="16" height="16"></iconify-icon>
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-magenta/10 border border-magenta/25 text-magentadeep p-3 rounded-xl text-xs flex items-center gap-2">
          <iconify-icon icon="ph:warning-circle-fill" width="16" height="16"></iconify-icon>
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="bg-creamdeep rounded-2xl border border-ink/8 p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-4 border-b border-ink/10 pb-5">
          <div className="w-14 h-14 rounded-full bg-ink text-cream flex items-center justify-center font-serif opsz-72 text-xl font-bold">
            {profile?.full_name?.charAt(0) || 'D'}
          </div>
          <div>
            <h2 className="font-serif opsz-72 text-lg font-semibold text-ink">{profile?.full_name}</h2>
            <p className="text-xs text-inkmute">{profile?.email}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="bg-magenta/10 text-magenta text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase border border-magenta/20">
                {profile?.status}
              </span>
              {profile?.is_admin && (
                <span className="bg-ink text-cream text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  System Admin
                </span>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-ink mb-1.5">Full Name & Title</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-ink mb-1.5">Email Address (Read-only)</label>
              <input
                type="email"
                disabled
                value={profile?.email || ''}
                className="w-full border border-ink/10 bg-cream/50 text-inkmute rounded-xl px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1.5">Contact Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full border border-ink/14 rounded-xl px-3.5 py-2 text-sm bg-cream text-ink focus:outline-none focus:ring-2 focus:ring-magenta/20 focus:border-magenta transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-ink mb-1.5">Registration Number</label>
              <input
                type="text"
                disabled
                value={registrationNumber || 'Not provided'}
                className="w-full border border-ink/10 bg-cream/50 text-inkmute rounded-xl px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1.5">Issuing Authority</label>
              <input
                type="text"
                disabled
                value={issuingAuthority || 'Not provided'}
                className="w-full border border-ink/10 bg-cream/50 text-inkmute rounded-xl px-3.5 py-2 text-sm"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-ink/10 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="pill pill-ink px-6 py-2.5 text-xs font-medium"
            >
              <iconify-icon icon="ph:floppy-disk-bold" width="14" height="14"></iconify-icon>
              <span>{isSaving ? 'Saving Changes...' : 'Save Profile Details'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
