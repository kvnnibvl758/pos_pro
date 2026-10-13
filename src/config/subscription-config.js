// Réglages de l'abonnement (affichés dans Paramètres → Abonnement). Modifiez ce fichier, pas le code.
//
//  priceLabel   : le tarif affiché, ex. "500 000 GNF par an". Laissez vide pour ne rien afficher.
//  payLink      : lien de paiement en ligne (carte / Orange Money) fourni par votre prestataire
//                 (CinetPay, Paycard...). Laissez vide tant que vous n'en avez pas : le bouton est alors masqué.
//  onlinePayment: true une fois les fonctions de paiement Djomy déployées (voir PAIEMENT_DJOMY.md) :
//                 le bouton « Payer en ligne » démarre alors le paiement et l'abonnement s'active tout seul.
//  instructions : texte expliquant comment payer autrement (ex. numéro Orange Money du marchand).
//
// Sans paiement en ligne, un paiement n'active pas l'abonnement tout seul : vous l'activez depuis
// Paramètres → Administration (voir SUBSCRIPTION.md).
window.POS_SUBSCRIPTION_CONFIG = {
  priceLabel: "45 000 GNF par mois",
  payLink: "",
  onlinePayment: true,
  instructions: ""
};
