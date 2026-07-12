// ===========================================
// Настройки Supabase
// ===========================================

const SUPABASE_URL = "https://bipfjejggduhhlsmttyv.supabase.co";

const SUPABASE_KEY = "sb_publishable_sTM8PkYcSFc4aVJ0refI7Q_GizjcQR3";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);