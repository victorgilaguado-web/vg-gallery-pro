import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rdzjbvkzpusegtyudhtn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkempidmt6cHVzZWd0eXVkaHRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTU0MDEsImV4cCI6MjA5MDc5MTQwMX0.25id5riBB8LHywjLcXOZC8te62MnL-LvICF6Dfv9jDI';

export const supabase = createClient(supabaseUrl, supabaseKey);
