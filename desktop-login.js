// Page de retour de la connexion Google pour l'application Windows POS Pro.
// Elle transmet à l'application (lien pospro://) les paramètres de connexion reçus du serveur.
(function () {
  var params = window.location.search + window.location.hash;
  var hasLogin = /(^|[#?&])(access_token|code|error)=/.test(params);
  var msg = document.getElementById('msg');
  var button = document.getElementById('open');
  if (!hasLogin) {
    msg.textContent = 'Cette page sert uniquement au retour de la connexion vers l’application POS Pro. Ouvrez l’application pour vous connecter.';
    return;
  }
  var link = 'pospro://auth' + params;
  button.href = link;
  button.hidden = false;
  window.location.replace(link);
})();
