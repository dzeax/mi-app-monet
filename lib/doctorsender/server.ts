import { supabaseAdmin } from '@/lib/supabase/admin';

import {
  DoctorSenderDefaults,
  mergeDoctorSenderDefaults,
  normaliseDatabaseKey,
  resolveStaticDoctorSenderDefaults,
  sanitizeDoctorSenderDefaultsInput,
} from '@/lib/doctorsender/defaults';

export async function loadDoctorSenderDefaults(database: string): Promise<DoctorSenderDefaults> {
  const staticDefaults = resolveStaticDoctorSenderDefaults(database);
  const admin = supabaseAdmin();
  const key = normaliseDatabaseKey(database);

  try {
    const { data, error } = await admin
      .from('doctor_sender_defaults')
      .select('config')
      .eq('database_key', key)
      .maybeSingle();

    if (error) {
      console.error('doctor_sender_defaults fetch error', error);
      return staticDefaults;
    }

    if (!data?.config) {
      return staticDefaults;
    }

    const overrides = sanitizeDoctorSenderDefaultsInput(data.config);
    return mergeDoctorSenderDefaults(staticDefaults, overrides);
  } catch (error) {
    console.error('doctor_sender_defaults unexpected error', error);
    return staticDefaults;
  }
}
