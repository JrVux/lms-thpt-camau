import { createClient } from '@supabase/supabase-js';

const isNodeTest = process.env.NODE_TEST_CONTEXT !== undefined || process.env.NODE_ENV === 'test';
const supabaseUrl = process.env.SUPABASE_URL || (isNodeTest ? 'https://example.supabase.co' : null);
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || (isNodeTest ? 'dummy-anon-key' : null);
const supabaseServerKey = process.env.SUPABASE_SERVICE_ROLE_KEY || (isNodeTest ? 'dummy-service-role-key' : null);

if (!supabaseUrl || !supabaseAnonKey || !supabaseServerKey) {
  throw new Error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

// The service-role key stays server-side and is required for RLS-protected delivery tables.
export const supabase = createClient(supabaseUrl, supabaseServerKey);
