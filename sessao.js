"use strict";
/* =====================================================================
   SESSÃO — quem está a usar, mudar palavra-passe, terminar sessão
   ===================================================================== */
RENDER.sessao = function(){
  $("ses-info").innerHTML = MODO_FIREBASE
    ? `Sessão: <b>${esc(Store.utilizador() || "—")}</b> · perfil <b>${esc(perfil)}</b> · dados partilhados (Firebase)`
    : `Dados <b>só neste aparelho</b> (modo local de testes) · perfil <b>${esc(perfil)}</b>`;
  $("ses-sair").style.display = MODO_FIREBASE ? "" : "none";
  $("ses-versao").textContent = "Quotas · versão " + VERSAO_APP;
};
$("ses-sair").onclick = ()=>confirmar("Terminar sessão", "<p>Terminar a sessão neste aparelho?</p>", "Terminar", ()=>Nuvem.sair());
$("ses-mudar").onclick = ()=>{
  const atual = $("ses-atual").value, nova = $("ses-nova").value, nova2 = $("ses-nova2").value, msg = $("ses-msg");
  msg.className = "nota verm";
  if(!MODO_FIREBASE){ msg.textContent = "No modo local não há palavra-passe."; return; }
  if(!atual || !nova){ msg.textContent = "Preencha os três campos."; return; }
  if(nova.length < 8){ msg.textContent = "A nova palavra-passe tem de ter pelo menos 8 caracteres."; return; }
  if(nova !== nova2){ msg.textContent = "As duas palavras-passe novas não são iguais."; return; }
  $("ses-mudar").disabled = true; msg.textContent = "";
  Nuvem.mudarPass(atual, nova).then(()=>{
    msg.className = "nota verde"; msg.textContent = "Palavra-passe mudada.";
    ["ses-atual", "ses-nova", "ses-nova2"].forEach((id)=>$(id).value = "");
  }).catch((e)=>{
    msg.textContent = e.code === "auth/wrong-password" || e.code === "auth/invalid-credential" || e.code === "auth/invalid-login-credentials"
      ? "A palavra-passe atual está errada." : e.code === "auth/network-request-failed" ? "Precisa de internet para mudar a palavra-passe."
      : "Não foi possível mudar: " + e.message;
  }).finally(()=>{ $("ses-mudar").disabled = false; });
};
