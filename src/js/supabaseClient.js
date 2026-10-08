// ===== CLIENT SUPABASE =====
export const cloudConfig = window.POS_SUPABASE_CONFIG || { enabled: false, url: '', anonKey: '' };

export const cloudClient = cloudConfig.enabled && window.supabase && cloudConfig.url && cloudConfig.anonKey
  ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey)
  : null;

// Le mode est décidé par la configuration, pas par la disponibilité du client :
// si le cloud est activé mais que Supabase n'a pas pu être chargé, l'application
// refuse de fonctionner (au lieu de basculer en silence en local et de diverger).
export const isCloudMode = () => Boolean(cloudConfig.enabled);
