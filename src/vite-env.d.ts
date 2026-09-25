/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_SHEETS_AUTO_SYNC_ENABLED?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
