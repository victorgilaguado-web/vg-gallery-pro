import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bmifwcatknllsemgwvku.supabase.co';
const supabaseKey = 'sb_publishable_u8PhVtefEZfMlSejMKD5Tg_E_oNMJ-T';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Exportados para envíos con keepalive (auto-submit al cerrar la pestaña)
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_KEY = supabaseKey;
