import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const isNodeTest = process.env.NODE_TEST_CONTEXT !== undefined;
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (isNodeTest ? supabaseAnonKey : null);

if (!supabaseUrl || !supabaseAnonKey || !supabaseServerKey) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

// The service-role key stays server-side and is required for RLS-protected delivery tables.
export const supabase = createClient(supabaseUrl, supabaseServerKey);
