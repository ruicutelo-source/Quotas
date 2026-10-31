"use strict";
/* =====================================================================
   CLUBE — dados e valores, cargos, listas e utilizadores
   ===================================================================== */
let abaClube = "dados";
$("clube-abas").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ abaClube = b.dataset.aba; RENDER.clube(); });

RENDER.clube = function(){
  $("aba-utilizadores").style.display = eAdmin() ? "" : "none";
  if(abaClube === "utilizadores" && !eAdmin()) abaClube = "dados";
  $("clube-abas").querySelectorAll("button").forEach((b)=>b.classList.toggle("ativo", b.dataset.aba === abaClube));
  document.querySelectorAll("#ecra-clube .aba").forEach((a)=>a.classList.toggle("ativo", a.id === "aba-" + abaClube));
  ({dados: desenharDados, cargos: desenharCargos, listas: desenharListas, utilizadores: desenharUtilizadores})[abaClube]();
};

/* ---------- dados e valores ---------- */
const CAMPOS_CLUBE = [["clb-nome", "nome"], ["clb-nif", "nif"], ["clb-tel", "telefone"], ["clb-email", "email"],
                      ["clb-morada", "morada"], ["clb-cp", "codigoPostal"], ["clb-local", "localidade"]];
let logoEdit = null, versaoDadosDesenhada = null, valoresEdit = {};
function desenharDados(){
  const c = clube(), pode = eAdmin();
  $("clb-so-ler").style.display = pode ? "none" : "block";
  ["clb-gravar", "clb-logo-esc", "clb-logo-tirar"].forEach((id)=>$(id).style.display = pode ? "" : "none");
  // só volta a preencher o formulário se os dados mudaram (para não apagar o que se está a escrever)
  const assin = perfil + JSON.stringify(c);
  if(assin === versaoDadosDesenhada) return;
  versaoDadosDesenhada = assin;
  for(const [el, k] of CAMPOS_CLUBE){ $(el).value = c[k] || ""; $(el).disabled = !pode; }
  // valores por ano (a versão 1 tinha só um valor: passa a ser o do ano atual)
  valoresEdit = c.valores ? JSON.parse(JSON.stringify(c.valores))
    : {[hojeISO().slice(0, 4)]: {joia: c.joia || 0, mensal: c.quotaMensal || 0, anual: c.quotaAnual || 0}};
  desenharValores();
  logoEdit = c.logo || "";
  mostrarLogo();
}
function desenharValores(){
  const pode = eAdmin(), anos = Object.keys(valoresEdit).sort();
  $("clb-ano-add").style.display = pode ? "" : "none";
  const inp = (ano, k)=>`<input type="text" inputmode="decimal" id="val-${ano}-${k}" value="${eurCampo(valoresEdit[ano][k])}" ${pode ? "" : "disabled"} style="min-width:80px">`;
  $("clb-valores").innerHTML = `<table><thead><tr><th>Ano</th><th>Joia (€)</th><th>Mensal (€)</th><th>Anual (€)</th></tr></thead><tbody>
    ${anos.map((a)=>`<tr><td><b>${a}</b></td><td>${inp(a, "joia")}</td><td>${inp(a, "mensal")}</td><td>${inp(a, "anual")}</td></tr>`).join("")}</tbody></table>`;
}
/* lê a tabela de valores (devolve null e marca os campos se algum valor for inválido) */
function lerValores(){
  let ok = true; const v = {};
  for(const ano of Object.keys(valoresEdit)){
    v[ano] = {};
    for(const k of ["joia", "mensal", "anual"]){
      const el = $(`val-${ano}-${k}`), c = centimosDe(el.value);
      if(c === null){ el.classList.add("erro-campo"); ok = false; } else { el.classList.remove("erro-campo"); v[ano][k] = c; }
    }
  }
  return ok ? v : null;
}
$("clb-ano-add").onclick = ()=>{
  const atual = lerValores() || valoresEdit, anos = Object.keys(atual).sort();
  const ultimo = anos[anos.length - 1], novo = String(Number(ultimo || hojeISO().slice(0, 4)) + 1);
  valoresEdit = {...atual, [novo]: {...(atual[ultimo] || {joia: 0, mensal: 0, anual: 0})}};
  desenharValores(); toast(`Ano ${novo} acrescentado. Ajuste os valores e carregue em Gravar.`);
};
function mostrarLogo(){
  $("clb-logo-caixa").innerHTML = logoEdit ? `<img src="${esc(logoEdit)}" alt="Logótipo">` : `<span class="nota">Sem logótipo</span>`;
}
$("clb-logo-esc").onclick = ()=>$("clb-logo-fich").click();
$("clb-logo-tirar").onclick = ()=>{ logoEdit = ""; mostrarLogo(); };
$("clb-logo-fich").onchange = (e)=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  reduzirImagem(f, 256).then((url)=>{ logoEdit = url; mostrarLogo(); toast("Logótipo escolhido. Carregue em Gravar."); })
    .catch(()=>aviso("Não foi possível ler essa imagem."));
};
/* reduz a imagem (fica guardada dentro da base de dados, por isso tem de ser pequena) */
function reduzirImagem(ficheiro, max){
  return new Promise((ok, erro)=>{
    const img = new Image(), url = URL.createObjectURL(ficheiro);
    img.onload = ()=>{
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url); ok(cv.toDataURL("image/png"));
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); erro(); };
    img.src = url;
  });
}
$("clb-gravar").onclick = ()=>{
  const erros = [], d = {};
  document.querySelectorAll("#aba-dados .erro-campo").forEach((e)=>e.classList.remove("erro-campo"));
  for(const [el, k] of CAMPOS_CLUBE) d[k] = $(el).value.trim();
  if(!d.nome){ erros.push("Falta o nome do clube."); $("clb-nome").classList.add("erro-campo"); }
  if(d.nif && !nifValido(d.nif)){ erros.push("NIF do clube inválido."); $("clb-nif").classList.add("erro-campo"); }
  if(!emailValido(d.email)){ erros.push("Email inválido."); $("clb-email").classList.add("erro-campo"); }
  const cp = cpNormalizar(d.codigoPostal);
  if(cp === null){ erros.push("Código postal inválido (0000-000)."); $("clb-cp").classList.add("erro-campo"); } else d.codigoPostal = cp;
  const valores = lerValores();
  if(!valores) erros.push("Há valores inválidos na tabela (ex.: 12,50).");
  else d.valores = valores;
  if(erros.length){ aviso(erros.join("\n"), "Corrigir"); return; }
  d.logo = logoEdit || "";
  versaoDadosDesenhada = null;
  gravar([{tipo: "set", col: "config", id: "clube", dados: {...d, ...carimbo(false)}}]);
  toast("Dados do clube gravados.");
};

/* ---------- cargos ---------- */
const ORGAOS = ["Direção", "Assembleia Geral", "Conselho Fiscal", "Outro"];
const CARGOS_SUGERIDOS = ["Presidente", "Vice-Presidente", "Secretário", "Tesoureiro", "Vogal", "Relator", "Suplente"];
const ordemCargo = (c)=>{ const i = CARGOS_SUGERIDOS.findIndex((x)=>norm(c).startsWith(norm(x))); return i < 0 ? 99 : i; };
function desenharCargos(){
  $("cg-novo").style.display = eAdmin() ? "" : "none";
  const lista = D.cargos.slice().sort((a, b)=>ORGAOS.indexOf(a.orgao) - ORGAOS.indexOf(b.orgao) || ordemCargo(a.cargo) - ordemCargo(b.cargo) || porTexto(a.cargo, b.cargo));
  $("cg-lista").innerHTML = tabela([{t: "Órgão"}, {t: "Cargo"}, {t: "Nome"}, {t: "Mandato"}],
    lista.map((c)=>{ const s = c.socioId ? Idx.socio.get(c.socioId) : null;
      return `<tr class="${eAdmin() ? "clic" : ""}" data-id="${esc(c.id)}"><td>${esc(c.orgao)}</td><td>${esc(c.cargo)}</td>
        <td>${esc(s ? s.nome : c.nome)}${s ? ` <span class="pequeno">(${numTxt(s)})</span>` : ""}</td><td>${esc(c.mandato)}</td></tr>`; }),
    "Ainda não há cargos registados.");
  if(eAdmin()) $("cg-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirCargo(tr.dataset.id));
}
$("cg-novo").onclick = ()=>abrirCargo(null);
function abrirCargo(id){
  const c = id ? D.cargos.find((x)=>x.id === id) : null;
  const socios = D.socios.filter(socioAtivo).sort((a, b)=>porTexto(a.nome, b.nome));
  const ultimoMandato = D.cargos.map((x)=>x.mandato).filter(Boolean).sort().pop() || "";
  janela(c ? "Editar cargo" : "Novo cargo", `
    <label class="campo">Órgão</label><select id="cg-orgao">${ORGAOS.map((o)=>`<option ${c && c.orgao === o ? "selected" : ""}>${o}</option>`).join("")}</select>
    <label class="campo">Cargo</label><input type="text" id="cg-cargo" list="cg-sug" value="${esc(c ? c.cargo : "")}">
    <datalist id="cg-sug">${CARGOS_SUGERIDOS.map((x)=>`<option value="${x}">`).join("")}</datalist>
    <label class="campo">Sócio</label><select id="cg-socio"><option value="">— não é sócio / escrever o nome —</option>
      ${socios.map((s)=>`<option value="${esc(s.id)}" ${c && c.socioId === s.id ? "selected" : ""}>${esc(s.nome)} (${numTxt(s)})</option>`).join("")}</select>
    <label class="campo">Nome (se não for sócio)</label><input type="text" id="cg-nome" value="${esc(c && !c.socioId ? c.nome : "")}">
    <label class="campo">Mandato</label><input type="text" id="cg-mandato" placeholder="ex.: 2025-2027" value="${esc(c ? c.mandato : ultimoMandato)}">
    <div class="aviso" id="cg-erro" style="display:none"></div>`,
  [...(c ? [{texto: "Apagar", classe: "sec verm-txt", id: "cg-apagar", acao: ()=>gravar([{tipo: "del", col: "cargos", id: c.id}]).then(()=>toast("Cargo apagado."))}] : []),
   {texto: "Cancelar", classe: "sec"},
   {texto: "Gravar", id: "cg-gravar", manter: true, acao: ()=>{
     const socioId = $("cg-socio").value, s = socioId ? Idx.socio.get(socioId) : null;
     const d = {orgao: $("cg-orgao").value, cargo: $("cg-cargo").value.trim(), socioId,
                nome: s ? s.nome : $("cg-nome").value.trim(), mandato: $("cg-mandato").value.trim()};
     if(!d.cargo || !d.nome){ $("cg-erro").textContent = "Indique o cargo e o sócio (ou o nome)."; $("cg-erro").style.display = "block"; return; }
     fecharJanela();
     gravar([{tipo: "set", col: "cargos", id: c ? c.id : "C" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dados: d}]);
     toast("Cargo gravado.");
   }}]);
}

/* ---------- listas ---------- */
function desenharListas(){
  const l = listas(), pode = eAdmin();
  const emUso = new Map(); for(const s of D.socios) emUso.set(s.tipo, (emUso.get(s.tipo) || 0) + 1);
  const desenhar = (chave, el, usos)=>{
    $(el).innerHTML = `<div class="lista-itens">${l[chave].map((t, i)=>`<div class="item"><span>${esc(t)}</span>
      ${usos && usos.get(t) ? `<span class="pequeno">${usos.get(t)} sócio(s)</span>` : ""}
      ${chave === "tiposSocio" ? `<label class="pequeno" style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-isento="${esc(t)}" ${l.tiposIsentos.includes(t) ? "checked" : ""} ${pode ? "" : "disabled"}> isento</label>` : ""}
      ${pode ? `<button class="link" data-i="${i}" data-acao="ren">Mudar nome</button><button class="lixo" data-i="${i}" data-acao="del" title="Apagar">✕</button>` : ""}</div>`).join("")}</div>`;
    $(el).querySelectorAll("input[data-isento]").forEach((c)=>c.onchange = ()=>{
      const t = c.dataset.isento, isentos = l.tiposIsentos.filter((x)=>x !== t);
      if(c.checked) isentos.push(t);
      gravarListas({...l, tiposIsentos: isentos});
    });
    $(el).querySelectorAll("button").forEach((b)=>b.onclick = ()=>{
      const i = Number(b.dataset.i), nome = l[chave][i];
      if(b.dataset.acao === "del"){
        if(usos && usos.get(nome)){ aviso(`O tipo «${nome}» está em uso em ${usos.get(nome)} ficha(s). Mude primeiro essas fichas.`); return; }
        if(l[chave].length <= 1){ aviso("A lista tem de ter pelo menos um valor."); return; }
        const nova = l[chave].filter((_, j)=>j !== i);
        gravarListas({...l, [chave]: nova, tiposIsentos: l.tiposIsentos.filter((x)=>x !== nome)});
      }else{
        janela("Mudar nome", `<input type="text" id="ls-ren" value="${esc(nome)}">`, [{texto: "Cancelar", classe: "sec"},
          {texto: "Gravar", id: "ls-ren-ok", acao: ()=>{
            const novo = $("ls-ren").value.trim(); if(!novo || novo === nome) return;
            if(l[chave].includes(novo)){ aviso("Esse nome já existe na lista."); return; }
            const nova = l[chave].map((x)=>x === nome ? novo : x);
            const extra = chave === "tiposSocio" ? D.socios.filter((s)=>s.tipo === nome)
              .map((s)=>({tipo: "update", col: "socios", id: s.id, dados: {tipo: novo, ...carimbo(false)}})) : [];
            gravarListas({...l, [chave]: nova, tiposIsentos: l.tiposIsentos.map((x)=>x === nome ? novo : x)}, extra);
          }}]);
      }
    });
  };
  desenhar("tiposSocio", "ls-tipos", emUso);
  desenhar("formasPagamento", "ls-formas", null);
  $("ls-tipos-add").style.display = pode ? "flex" : "none";
  $("ls-formas-add").style.display = pode ? "flex" : "none";
}
function gravarListas(l, extra){
  gravar([{tipo: "set", col: "config", id: "listas", dados: {tiposSocio: l.tiposSocio, tiposIsentos: l.tiposIsentos, formasPagamento: l.formasPagamento}}, ...(extra || [])]);
  toast("Lista gravada.");
}
for(const [chave, inp, bt] of [["tiposSocio", "ls-tipos-novo", "ls-tipos-bt"], ["formasPagamento", "ls-formas-novo", "ls-formas-bt"]]){
  $(bt).onclick = ()=>{
    const v = $(inp).value.trim(), l = listas(); if(!v) return;
    if(l[chave].some((x)=>norm(x) === norm(v))){ aviso("Esse valor já existe na lista."); return; }
    $(inp).value = ""; gravarListas({...l, [chave]: [...l[chave], v]});
  };
  $(inp).addEventListener("keydown", (e)=>{ if(e.key === "Enter") $(bt).click(); });
}

/* ---------- utilizadores (só Administrador) ---------- */
function desenharUtilizadores(){
  const lista = D.utilizadores.slice().sort((a, b)=>PERFIS.indexOf(a.perfil) - PERFIS.indexOf(b.perfil) || porTexto(a.id, b.id));
  const linhas = [`<tr><td>${esc(ADMIN_PRINCIPAL)}</td><td>Administrador principal</td><td>Administrador</td><td><span class="chip verde">Ativo</span></td></tr>`]
    .concat(lista.filter((u)=>u.id !== ADMIN_PRINCIPAL).map((u)=>`<tr class="clic" data-id="${esc(u.id)}"><td>${esc(u.id)}</td><td>${esc(u.nome)}</td>
      <td>${esc(u.perfil)}</td><td>${u.ativo ? `<span class="chip verde">Ativo</span>` : `<span class="chip verm">Desativado</span>`}</td></tr>`));
  $("ut-lista").innerHTML = tabela([{t: "Email"}, {t: "Nome"}, {t: "Perfil"}, {t: "Estado"}], linhas, "");
  $("ut-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirUtilizador(tr.dataset.id));
}
$("ut-novo").onclick = ()=>abrirUtilizador(null);
function abrirUtilizador(id){
  const u = id ? D.utilizadores.find((x)=>x.id === id) : null;
  janela(u ? "Editar utilizador" : "Novo utilizador", `
    <label class="campo">Email (igual ao da conta no Firebase)</label><input type="email" id="ut-email" value="${esc(u ? u.id : "")}" ${u ? "disabled" : ""}>
    <label class="campo">Nome</label><input type="text" id="ut-nome" value="${esc(u ? u.nome : "")}">
    <label class="campo">Perfil</label><select id="ut-perfil">${PERFIS.map((p)=>`<option ${u && u.perfil === p ? "selected" : (!u && p === "Consulta" ? "selected" : "")}>${p}</option>`).join("")}</select>
    <label class="campo" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ut-ativo" ${!u || u.ativo ? "checked" : ""} style="width:22px;height:22px"> Ativo (pode entrar na app)</label>
    <div class="aviso" id="ut-erro" style="display:none"></div>`,
  [...(u ? [{texto: "Apagar", classe: "sec verm-txt", id: "ut-apagar", acao: ()=>gravar([{tipo: "del", col: "utilizadores", id: u.id}]).then(()=>toast("Utilizador apagado."))}] : []),
   {texto: "Cancelar", classe: "sec"},
   {texto: "Gravar", id: "ut-gravar", manter: true, acao: ()=>{
     const email = (u ? u.id : $("ut-email").value.trim()).toLowerCase();
     const erro = (t)=>{ $("ut-erro").textContent = t; $("ut-erro").style.display = "block"; };
     if(!emailValido(email) || !email){ erro("Email inválido."); return; }
     if(email === ADMIN_PRINCIPAL){ erro("O Administrador principal já tem acesso total."); return; }
     if(!u && D.utilizadores.some((x)=>x.id === email)){ erro("Esse email já está na lista."); return; }
     fecharJanela();
     gravar([{tipo: "set", col: "utilizadores", id: email, dados: {nome: $("ut-nome").value.trim(), perfil: $("ut-perfil").value, ativo: $("ut-ativo").checked}}]);
     toast("Utilizador gravado.");
   }}]);
}
