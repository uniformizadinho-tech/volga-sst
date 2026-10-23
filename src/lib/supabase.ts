import { createClient } from "@supabase/supabase-js";
// Projeto Supabase original da equipe (dados compartilhados). Chave publicável — segura no navegador.
const supabaseUrl = "https://zohjkwbhdtjhqtsimfvd.supabase.co";
const supabaseKey = "sb_publishable_0ts5NfjdqhaOaQtY1UuNZA_AqLff7yb";
export const isSupabaseConfigured = true;
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
