// Configuration du mode cloud.
//
//  enabled: true -> mode LOCAL : tout reste dans ce navigateur (localStorage), comptes locaux.
//  enabled: true  -> mode CLOUD : Supabase est la source de vérité, chaque personne se
//                    connecte avec son propre compte (voir SUPABASE_SETUP.md).
//
// La clé « publishable » ci-dessous est faite pour être publique : ce qui protège les
// données, ce sont les règles RLS de la base. Ne mettez JAMAIS la clé « service_role » ici.
window.POS_SUPABASE_CONFIG = {
  enabled: true,
  url: "https://lofweqqyhveusxehxqvx.supabase.co",
  anonKey: "sb_publishable_1-3qmJF8uLxOFLCOmrvzrQ_NlWzv_Eo"
};
