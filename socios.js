"use strict";
/* =====================================================================
   SÓCIOS — lista, ficha e agregado familiar
   ===================================================================== */
const RELACOES = ["Cônjuge", "Filho(a)", "Pai/Mãe", "Irmão(ã)", "Neto(a)", "Avô/Avó", "Outro"];
const RELACAO_INVERSA = {"Cônjuge": "Cônjuge", "Filho(a)": "Pai/Mãe", "Pai/Mãe": "Filho(a)", "Irmão(ã)": "Irmão(ã)",
                         "Neto(a)": "Avô/Avó", "Avô/Avó": "Neto(a)", "Outro": "Outro"};
const filtroSoc = {estado: "ativos"};

/* ---------- lista ---------- */
RENDER.socios = function(){
  $("soc-novo").style.display = eTes() ? "" : "none";
  const selT = $("soc-tipo"), atual = selT.value;
  const tipos = [...new Set(listas().tiposSocio.concat(D.socios.map((s)=>s.tipo).filter(Boolean)))];
  selT.innerHTML = `<option value="">Todos os tipos</option>` + tipos.map((t)=>`<option>${esc(t)}</option>`).join("");
  selT.value = tipos.includes(atual) ? atual : "";

  const q = norm($("soc-pesq").value), tipo = selT.value, per = $("soc-period").value;
  const lista = D.socios.filter((s)=>{
    const at = socioAtivo(s);
    if(filtroSoc.estado === "ativos" && !at) return false;
    if(filtroSoc.estado === "inativos" && at) return false;
    if(tipo && s.tipo !== tipo) return false;
    if(per && s.periodicidade !== per) return false;
    if(q){
      const p = Idx.priv.get(s.id) || {};
      const txt = norm([s.numero, s.nome, s.telemovel, s.telefone, s.email, s.localidade, p.nif].join(" "));
      if(!q.split(/\s+/).every((t)=>txt.includes(t))) return false;
    }
    return true;
  }).sort((a, b)=>a.numero - b.numero);
  $("soc-n").textContent = lista.length + (lista.length === 1 ? " sócio" : " sócios");
  $("soc-lista").innerHTML = tabela(
    [{t: "Nº", num: true}, {t: "Nome"}, {t: "Tipo", cl: "so-largo"}, {t: "Quota"}, {t: "Telemóvel", cl: "so-largo"}, {t: "Localidade", cl: "so-largo"}, {t: "Estado"}],
    lista.map((s)=>`<tr class="clic" data-id="${esc(s.id)}"><td class="num">${s.numero}</td><td>${esc(s.nome)}</td>
      <td class="so-largo">${esc(s.tipo)}</td><td>${esc(s.periodicidade)}</td><td class="so-largo">${esc(s.telemovel)}</td>
      <td class="so-largo">${esc(s.localidade)}</td>
      <td>${socioAtivo(s) ? `<span class="chip verde">Ativo</span>` : `<span class="chip verm">Saiu</span>`}</td></tr>`),
    D.socios.length ? "Nenhum sócio corresponde à pesquisa." : (eTes() ? "Ainda não há sócios. Carregue em «+ Novo sócio»." : "Ainda não há sócios."));
  $("soc-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirSocio(tr.dataset.id));
};
$("soc-pesq").addEventListener("input", ()=>RENDER.socios());
$("soc-tipo").onchange = ()=>RENDER.socios();
$("soc-period").onchange = ()=>RENDER.socios();
$("soc-estado").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{
  filtroSoc.estado = b.dataset.v;
  $("soc-estado").querySelectorAll("button").forEach((x)=>x.classList.toggle("ativo", x === b));
  RENDER.socios();
});
$("soc-novo").onclick = ()=>abrirSocio(null);

/* ---------- ficha ---------- */
let F = null;     // ficha aberta: {id, agregado, avisoNif}
function proximoNumero(){ return D.socios.reduce((m, s)=>Math.max(m, Number(s.numero) || 0), 0) + 1; }

function abrirSocio(id){
  const s = id ? Idx.socio.get(id) : null;
  if(id && !s) return;
  const novo = !s, pode = eTes();
  const p = s ? (Idx.priv.get(s.id) || {}) : {};
  F = {id: s ? s.id : null, agregado: s ? (s.agregado || []).map((a)=>({...a})) : [], avisoNif: null};
  const v = (k, def)=> esc(s ? (s[k] == null ? "" : s[k]) : (def == null ? "" : def));
  const tipos = listas().tiposSocio.slice(); if(s && s.tipo && !tipos.includes(s.tipo)) tipos.push(s.tipo);
  const opt = (arr, sel)=> arr.map((t)=>`<option ${t === sel ? "selected" : ""}>${esc(t)}</option>`).join("");
  const dis = pode ? "" : "disabled";
  const nif = pode ? `<input type="text" id="f-nif" inputmode="numeric" maxlength="9" value="${esc(p.nif || "")}" ${dis}>`
                   : `<input type="text" class="mascara" value="${esc(s && s.nifMasc || "")}" disabled>`;
  const nib = pode ? `<input type="text" id="f-nib" value="${esc(p.nib ? ibanFormatar(p.nib) : "")}" placeholder="PT50 …" ${dis}>`
                   : `<input type="text" class="mascara" value="${esc(s && s.nibMasc || "")}" disabled>`;
  const corpo = `
    <div class="secao">Identificação</div>
    <div class="ficha-grid">
      <div><label class="campo">Nº de sócio</label><input type="number" id="f-numero" min="1" step="1" value="${novo ? proximoNumero() : s.numero}" ${novo && pode ? "" : "disabled"}></div>
      <div class="s2"><label class="campo">Nome completo *</label><input type="text" id="f-nome" value="${v("nome")}" ${dis}></div>
      <div><label class="campo">Data de nascimento</label><input type="date" id="f-nasc" value="${v("dataNascimento")}" ${dis}></div>
      <div><label class="campo">NIF</label>${nif}</div>
      <div class="s2"><label class="campo">NIB / IBAN</label>${nib}</div>
    </div>
    <div class="secao">Contactos</div>
    <div class="ficha-grid">
      <div><label class="campo">Telemóvel</label><input type="text" id="f-telemovel" inputmode="tel" value="${v("telemovel")}" ${dis}></div>
      <div><label class="campo">Telefone</label><input type="text" id="f-telefone" inputmode="tel" value="${v("telefone")}" ${dis}></div>
      <div class="s2"><label class="campo">Email</label><input type="email" id="f-email" value="${v("email")}" ${dis}></div>
      <div class="s2"><label class="campo">Morada</label><input type="text" id="f-morada" value="${v("morada")}" ${dis}></div>
      <div><label class="campo">Código postal</label><input type="text" id="f-cp" maxlength="8" placeholder="0000-000" value="${v("codigoPostal")}" ${dis}></div>
      <div><label class="campo">Localidade</label><input type="text" id="f-localidade" value="${v("localidade")}" ${dis}></div>
    </div>
    <div class="secao">Sócio</div>
    <div class="ficha-grid">
      <div><label class="campo">Tipo de sócio *</label><select id="f-tipo" ${dis}>${opt(tipos, s ? s.tipo : tipos[0])}</select></div>
      <div><label class="campo">Quota *</label><select id="f-period" ${dis}>${opt(["Mensal", "Anual"], s ? s.periodicidade : "Anual")}</select></div>
      <div><label class="campo">Data de entrada *</label><input type="date" id="f-entrada" value="${v("dataEntrada", hojeISO())}" ${dis}></div>
      <div><label class="campo">Data de saída</label><input type="date" id="f-saida" value="${v("dataSaida")}" ${dis}></div>
    </div>
    <div class="secao">Agregado familiar</div>
    <div id="f-agregado"></div>
    <div class="secao">Observações</div>
    <textarea id="f-obs" ${dis} style="min-height:70px">${v("observacoes")}</textarea>
    ${s ? `<div class="nota">Criado por ${esc(s.criadoPor || "—")} em ${dataHoraPT(s.criadoEm)} · última alteração por ${esc(s.alteradoPor || "—")} em ${dataHoraPT(s.alteradoEm)}</div>` : ""}
    ${!pode ? `<div class="nota">Perfil Consulta: só leitura. O NIF e o NIB aparecem ocultos.</div>` : ""}
    <div class="aviso" id="f-erros" style="display:none"></div>`;
  const acoes = [{texto: pode ? "Cancelar" : "Fechar", classe: "sec", id: "f-cancelar"}];
  if(s && eAdmin()) acoes.unshift({texto: "Apagar", classe: "sec verm-txt", id: "f-apagar", manter: true, acao: ()=>apagarSocio(s.id)});
  if(pode) acoes.push({texto: "Gravar", id: "f-gravar", manter: true, acao: gravarSocio});
  janela(novo ? "Novo sócio" : `Sócio nº ${s.numero} · ${s.nome}`, corpo, acoes, true);
  desenharAgregado();
  if(novo) setTimeout(()=>$("f-nome").focus(), 50);
}

function desenharAgregado(){
  const pode = eTes();
  const linhas = F.agregado.map((a, i)=>{ const o = Idx.socio.get(a.id);
    return `<div class="item"><span>${o ? `<b>${esc(o.nome)}</b> <span class="pequeno">(nº ${o.numero})</span>` : `<span class="pequeno">sócio apagado</span>`}</span>
      <span class="chip">${esc(a.relacao)}</span>${pode ? `<button class="lixo" data-i="${i}" title="Retirar">✕</button>` : ""}</div>`; });
  const outros = D.socios.filter((o)=>o.id !== F.id && !F.agregado.some((a)=>a.id === o.id)).sort((a, b)=>porTexto(a.nome, b.nome));
  const add = pode ? `<div class="linha quebra" style="margin-top:6px">
      <select id="f-ag-socio" class="cresce" style="min-width:200px"><option value="">— escolher sócio —</option>${outros.map((o)=>`<option value="${esc(o.id)}">${esc(o.nome)} (nº ${o.numero})</option>`).join("")}</select>
      <select id="f-ag-rel" style="width:auto">${RELACOES.map((r)=>`<option>${esc(r)}</option>`).join("")}</select>
      <button class="bt sec peq" id="f-ag-add">Adicionar</button></div>
      <div class="nota">A relação é a da pessoa escolhida em relação a este sócio (ex.: «Filho(a)» = é filho deste sócio). A ficha do familiar é atualizada ao gravar.</div>` : "";
  $("f-agregado").innerHTML = `<div class="lista-itens">${linhas.join("") || `<div class="vazio" style="padding:6px">Sem familiares ligados.</div>`}</div>${add}`;
  $("f-agregado").querySelectorAll("button.lixo").forEach((b)=>b.onclick = ()=>{ F.agregado.splice(Number(b.dataset.i), 1); desenharAgregado(); });
  if(pode) $("f-ag-add").onclick = ()=>{
    const id = $("f-ag-socio").value; if(!id) return;
    F.agregado.push({id, relacao: $("f-ag-rel").value}); desenharAgregado();
  };
}

function gravarSocio(){
  const erros = [], marcar = (id)=>$(id).classList.add("erro-campo");
  document.querySelectorAll("#modal .erro-campo").forEach((e)=>e.classList.remove("erro-campo"));
  const novo = !F.id;
  const numero = Number($("f-numero").value);
  if(novo && !(Number.isInteger(numero) && numero > 0)){ erros.push("Nº de sócio inválido."); marcar("f-numero"); }
  else if(novo && Idx.socio.has(idSocio(numero))){ erros.push(`O nº ${numero} já pertence a ${Idx.socio.get(idSocio(numero)).nome}.`); marcar("f-numero"); }
  const nome = $("f-nome").value.trim().replace(/\s+/g, " ");
  if(!nome){ erros.push("Falta o nome."); marcar("f-nome"); }
  const nif = $("f-nif").value.replace(/\s/g, "");
  if(nif && !nifValido(nif)){ erros.push("NIF inválido (o dígito de controlo não confere)."); marcar("f-nif"); }
  const nibTxt = $("f-nib").value.trim(), nib = nibTxt ? ibanNormalizar(nibTxt) : "";
  if(nib === null){ erros.push("NIB/IBAN inválido."); marcar("f-nib"); }
  const telemovel = telNormalizar($("f-telemovel").value), telefone = telNormalizar($("f-telefone").value);
  if(telemovel === null){ erros.push("Telemóvel inválido."); marcar("f-telemovel"); }
  if(telefone === null){ erros.push("Telefone inválido."); marcar("f-telefone"); }
  const email = $("f-email").value.trim();
  if(!emailValido(email)){ erros.push("Email inválido."); marcar("f-email"); }
  const cp = cpNormalizar($("f-cp").value);
  if(cp === null){ erros.push("Código postal inválido (formato 0000-000)."); marcar("f-cp"); }
  const entrada = $("f-entrada").value, saida = $("f-saida").value, nasc = $("f-nasc").value;
  if(!entrada){ erros.push("Falta a data de entrada."); marcar("f-entrada"); }
  if(saida && entrada && saida < entrada){ erros.push("A data de saída é anterior à de entrada."); marcar("f-saida"); }
  if(nasc && nasc > hojeISO()){ erros.push("A data de nascimento está no futuro."); marcar("f-nasc"); }
  const caixa = $("f-erros");
  if(erros.length){ caixa.innerHTML = erros.map(esc).join("<br>"); caixa.style.display = "block"; caixa.scrollIntoView({block: "nearest"}); return; }

  const id = novo ? idSocio(numero) : F.id;
  // aviso (uma vez) se o NIF já estiver noutro sócio
  const dupNif = nif && D.sociosPrivado.find((p)=>p.nif === nif && p.id !== id);
  if(dupNif && F.avisoNif !== nif){
    const o = Idx.socio.get(dupNif.id);
    F.avisoNif = nif;
    caixa.innerHTML = `Atenção: o NIF ${esc(nif)} já está na ficha de <b>${esc(o ? o.nome : dupNif.id)}</b>. Carregue em Gravar outra vez para gravar mesmo assim.`;
    caixa.style.display = "block"; caixa.scrollIntoView({block: "nearest"}); return;
  }

  const antigo = novo ? null : Idx.socio.get(id);
  const dados = {
    numero: novo ? numero : antigo.numero, nome, dataNascimento: nasc, telemovel, telefone, email,
    morada: $("f-morada").value.trim(), codigoPostal: cp, localidade: $("f-localidade").value.trim(),
    tipo: $("f-tipo").value, periodicidade: $("f-period").value, dataEntrada: entrada, dataSaida: saida,
    observacoes: $("f-obs").value.trim(), nifMasc: nifMascara(nif), nibMasc: ibanMascara(nib),
    agregado: F.agregado.filter((a)=>Idx.socio.has(a.id)),
    ...(novo ? carimbo(true) : {criadoPor: antigo.criadoPor || "", criadoEm: antigo.criadoEm || 0, ...carimbo(false)})
  };
  const privado = {nif, nib};
  const opsFamilia = opsAgregado(id, antigo ? (antigo.agregado || []) : [], dados.agregado);
  $("f-gravar").disabled = true;
  const feito = novo
    ? Store.criarSocio(id, dados, privado).then(()=>gravar(opsFamilia))
    : gravar([{tipo: "set", col: "socios", id, dados}, {tipo: "set", col: "sociosPrivado", id, dados: privado}, ...opsFamilia]);
  if(!MODO_FIREBASE || !novo){ fecharJanela(); toast(novo ? "Sócio criado." : "Ficha gravada."); }   // as alterações aparecem logo (mesmo sem internet)
  feito.then(()=>{ if(novo && MODO_FIREBASE){ fecharJanela(); toast("Sócio criado."); } })
    .catch((e)=>{
      if(!novo) return;            // o erro já foi mostrado
      const b = $("f-gravar"); if(b) b.disabled = false;
      caixa.style.display = "block";
      caixa.textContent = e.message === "EXISTE" ? `O nº ${numero} acabou de ser usado noutro aparelho. Escolha outro número.`
        : "Não foi possível criar o sócio: " + (e.code === "unavailable" || !navigator.onLine ? "criar sócios precisa de internet." : e.message);
    });
}

/* atualiza as fichas dos familiares para a ligação ficar nos dois sentidos */
function opsAgregado(id, antes, depois){
  const ops = [], mexidos = new Set([...antes, ...depois].map((a)=>a.id));
  for(const outroId of mexidos){
    const o = Idx.socio.get(outroId); if(!o) continue;
    const novoRel = depois.find((a)=>a.id === outroId);
    let lista = (o.agregado || []).filter((a)=>a.id !== id);
    if(novoRel) lista.push({id, relacao: RELACAO_INVERSA[novoRel.relacao] || "Outro"});
    const igual = JSON.stringify(lista) === JSON.stringify(o.agregado || []);
    if(!igual) ops.push({tipo: "update", col: "socios", id: outroId, dados: {agregado: lista, ...carimbo(false)}});
  }
  return ops;
}

function apagarSocio(id){
  const s = Idx.socio.get(id); if(!s) return;
  confirmar("Apagar sócio", `<p>Apagar a ficha de <b>${esc(s.nome)}</b> (nº ${s.numero})?</p>
    <p class="nota">Se o sócio deixou o clube, é melhor preencher a <b>data de saída</b>: a ficha fica guardada como inativa.
    Apagar só para fichas criadas por engano.</p>`, "Apagar", ()=>{
    const ops = [{tipo: "del", col: "socios", id}, {tipo: "del", col: "sociosPrivado", id}, ...opsAgregado(id, s.agregado || [], [])];
    for(const c of D.cargos) if(c.socioId === id) ops.push({tipo: "update", col: "cargos", id: c.id, dados: {socioId: ""}});
    gravar(ops).then(()=>toast("Sócio apagado."));
  }, "verm");
}
