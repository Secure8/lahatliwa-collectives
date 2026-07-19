import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

export const DISABLED_EDITORIAL_FLAGS = Object.freeze({
  moduleEnabled: false,
  publicPortalEnabled: false,
  homepageTourismEnabled: false,
  editorialStudioEnabled: false,
  publicInquiriesEnabled: false,
  editorialMediaUploadsEnabled: false,
});

export function normalizeEditorialFlags(row = {}) {
  const moduleEnabled = row.module_enabled === true;
  return Object.freeze({
    moduleEnabled,
    publicPortalEnabled: moduleEnabled && row.public_portal_enabled === true,
    homepageTourismEnabled: moduleEnabled && row.public_portal_enabled === true && row.homepage_tourism_enabled === true,
    editorialStudioEnabled: moduleEnabled && row.editorial_studio_enabled === true,
    publicInquiriesEnabled: moduleEnabled && row.public_inquiries_enabled === true,
    editorialMediaUploadsEnabled: moduleEnabled && row.editorial_media_uploads_enabled === true,
  });
}

export async function loadEditorialFlags(client = supabase) {
  try {
    const { data, error } = await client.from('editorial_feature_flags').select('module_enabled,public_portal_enabled,homepage_tourism_enabled,editorial_studio_enabled,public_inquiries_enabled,editorial_media_uploads_enabled').eq('singleton', true).maybeSingle();
    if (error || !data) return DISABLED_EDITORIAL_FLAGS;
    return normalizeEditorialFlags(data);
  } catch {
    return DISABLED_EDITORIAL_FLAGS;
  }
}

export function useEditorialFlags() {
  const [state, setState] = useState({ flags: DISABLED_EDITORIAL_FLAGS, loading: true });
  useEffect(() => {
    let active = true;
    loadEditorialFlags().then((flags) => { if (active) setState({ flags, loading: false }); });
    return () => { active = false; };
  }, []);
  return state;
}
