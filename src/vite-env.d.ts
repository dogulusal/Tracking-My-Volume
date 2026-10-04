/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_SHEETS_AUTO_SYNC_ENABLED?: string;
	/** 'antrenor' only in the coach-mode demo build. */
	readonly VITE_DEMO?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
