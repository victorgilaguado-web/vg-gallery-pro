import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://eanfxoyloqcqmkhkigdh.supabase.co';
const supabaseKey = 'sb_publishable_J3NANOEBgGxKGDTSs5rs7Q_mSqNG4Ny';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Exportados para envíos con keepalive (auto-submit al cerrar la pestaña)
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_KEY = supabaseKey;
