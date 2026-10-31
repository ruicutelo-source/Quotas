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
  ({dados: desenharDados, cargos: desenharCargos, listas: desenharListas, utilizadores: desenharUtilizadores, copias: desenharCopias})[abaClube]();
};

/* ---------- dados e valores ---------- */
const CAMPOS_CLUBE = [["clb-nome", "nome"], ["clb-nif", "nif"], ["clb-tel", "telefone"], ["clb-email", "email"],
                      ["clb-morada", "morada"], ["clb-cp", "codigoPostal"], ["clb-local", "localidade"]];
let logoEdit = null, versaoDadosDesenhada = null, valoresEdit = {};
function desenharDados(){
  const c = clube(), pode = eAdmin();
  $("clb-so-ler").style.display = pode ? "none" : "block";
  ["clb-gravar", "clb-logo-esc", "clb-logo-tirar"].forEach((id)=>$(id).style.display = pode ? "" : "none");
  $("clb-perigo").style.display = (!MODO_FIREBASE || Store.utilizador() === ADMIN_PRINCIPAL) ? "block" : "none";
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
const LISTAS_DEF = [
  {chave: "tiposSocio", el: "ls-tipos", marca: {campo: "tiposIsentos", rot: "isento"}, uso: "socios"},
  {chave: "formasPagamento", el: "ls-formas", marca: {campo: "formasCaixa", rot: "caixa"}},
  {chave: "categoriasReceita", el: "ls-catrec", uso: "Receita"},
  {chave: "categoriasDespesa", el: "ls-catdes", uso: "Despesa"}
];
/* quantas fichas/movimentos usam cada valor (não se pode apagar um valor em uso) */
function usosLista(def){
  const m = new Map(), soma = (k)=>m.set(k, (m.get(k) || 0) + 1);
  if(def.uso === "socios") D.socios.forEach((s)=>soma(s.tipo));
  else if(def.uso) D.movimentos.filter((x)=>x.tipo === def.uso).forEach((x)=>soma(x.categoria));
  return m;
}
/* ao mudar o nome de um valor, muda também nas fichas/movimentos que o usam */
function opsRenomear(def, nome, novo){
  if(def.uso === "socios") return D.socios.filter((s)=>s.tipo === nome).map((s)=>({tipo: "update", col: "socios", id: s.id, dados: {tipo: novo, ...carimbo(false)}}));
  if(def.uso) return D.movimentos.filter((x)=>x.tipo === def.uso && x.categoria === nome).map((x)=>({tipo: "update", col: "movimentos", id: x.id, dados: {categoria: novo}}));
  return [];
}
function desenharListas(){
  const l = listas(), pode = eAdmin();
  for(const def of LISTAS_DEF){
    const usos = usosLista(def), chave = def.chave, el = def.el, mc = def.marca;
    $(el).innerHTML = `<div class="lista-itens">${l[chave].map((t, i)=>`<div class="item"><span>${esc(t)}</span>
      ${usos.get(t) ? `<span class="pequeno">${usos.get(t)} ${def.uso === "socios" ? "sócio(s)" : "mov."}</span>` : ""}
      ${mc ? `<label class="pequeno" style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-marca="${esc(t)}" ${l[mc.campo].includes(t) ? "checked" : ""} ${pode ? "" : "disabled"}> ${mc.rot}</label>` : ""}
      ${pode ? `<button class="link" data-i="${i}" data-acao="ren">Mudar nome</button><button class="lixo" data-i="${i}" data-acao="del" title="Apagar">✕</button>` : ""}</div>`).join("")}</div>`;
    $(el).querySelectorAll("input[data-marca]").forEach((c)=>c.onchange = ()=>{
      const t = c.dataset.marca, lista = l[mc.campo].filter((x)=>x !== t);
      if(c.checked) lista.push(t);
      gravarListas({...l, [mc.campo]: lista});
    });
    $(el).querySelectorAll("button").forEach((b)=>b.onclick = ()=>{
      const i = Number(b.dataset.i), nome = l[chave][i];
      if(b.dataset.acao === "del"){
        if(usos.get(nome)){ aviso(`«${nome}» está em uso em ${usos.get(nome)} ${def.uso === "socios" ? "ficha(s)" : "movimento(s)"}. Mude-os primeiro.`); return; }
        if(l[chave].length <= 1){ aviso("A lista tem de ter pelo menos um valor."); return; }
        const nl = {...l, [chave]: l[chave].filter((_, j)=>j !== i)};
        if(mc) nl[mc.campo] = l[mc.campo].filter((x)=>x !== nome);
        gravarListas(nl);
      }else{
        janela("Mudar nome", `<input type="text" id="ls-ren" value="${esc(nome)}">`, [{texto: "Cancelar", classe: "sec"},
          {texto: "Gravar", id: "ls-ren-ok", acao: ()=>{
            const novo = $("ls-ren").value.trim(); if(!novo || novo === nome) return;
            if(l[chave].includes(novo)){ aviso("Esse nome já existe na lista."); return; }
            const nl = {...l, [chave]: l[chave].map((x)=>x === nome ? novo : x)};
            if(mc) nl[mc.campo] = l[mc.campo].map((x)=>x === nome ? novo : x);
            gravarListas(nl, opsRenomear(def, nome, novo));
          }}]);
      }
    });
    $(el + "-add").style.display = pode ? "flex" : "none";
  }
}
function gravarListas(l, extra){
  const dados = {}; for(const k of Object.keys(LISTAS_INICIAIS)) dados[k] = l[k];
  gravar([{tipo: "set", col: "config", id: "listas", dados}, ...(extra || [])]);
  toast("Lista gravada.");
}
for(const def of LISTAS_DEF){
  const inp = def.el + "-novo", bt = def.el + "-bt";
  $(bt).onclick = ()=>{
    const v = $(inp).value.trim(), l = listas(); if(!v) return;
    if(l[def.chave].some((x)=>norm(x) === norm(v))){ aviso("Esse valor já existe na lista."); return; }
    $(inp).value = ""; gravarListas({...l, [def.chave]: [...l[def.chave], v]});
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

/* ---------- limpar dados (só o Administrador principal) ---------- */
function descarregarCopia(){
  const copia = {app: "Quotas", versao: VERSAO_APP, data: new Date().toISOString(), por: Store.utilizador(), dados: {}};
  for(const c of COLS) copia.dados[c] = D[c];
  const d = new Date(), z = (n)=>String(n).padStart(2, "0");
  const nome = `Quotas_copia_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 1)], {type: "application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
  return nome;
}
$("clb-limpar").onclick = ()=>{
  if(MODO_FIREBASE && Store.utilizador() !== ADMIN_PRINCIPAL) return;
  const n = {socios: D.socios.length, pagamentos: D.pagamentos.length, cargos: D.cargos.length, movimentos: D.movimentos.length, entidades: D.entidades.length};
  janela("Limpar dados", `<p>Vai apagar <b>${n.socios}</b> sócio(s), <b>${n.pagamentos}</b> pagamento(s), <b>${n.cargos}</b> cargo(s), <b>${n.movimentos}</b> movimento(s) de tesouraria e <b>${n.entidades}</b> fornecedor(es), com os NIF e NIB. A numeração dos recibos volta ao início.
      <b>Não se pode desfazer.</b></p>
    <p class="nota">Primeiro é descarregada uma cópia de tudo (ficheiro <b>Quotas_copia_….json</b> nas Transferências). Guarde-a.</p>
    <label class="campo">Para confirmar, escreva APAGAR</label><input type="text" id="limpar-conf" autocomplete="off">
    <div class="aviso" id="limpar-erro" style="display:none"></div>`,
  [{texto: "Cancelar", classe: "sec", id: "limpar-cancelar"}, {texto: "Descarregar cópia e apagar", classe: "verm", id: "limpar-ok", manter: true, acao: ()=>{
    if($("limpar-conf").value.trim() !== "APAGAR"){ $("limpar-erro").textContent = "Escreva APAGAR (em maiúsculas) para confirmar."; $("limpar-erro").style.display = "block"; return; }
    const ficheiro = descarregarCopia();
    const ops = [];
    for(const c of ["pagamentos", "sociosPrivado", "socios", "cargos", "movimentos", "entidades"]) for(const x of D[c]) ops.push({tipo: "del", col: c, id: x.id});
    // a numeração dos recibos volta ao início (próximo recibo = AAAA/0001)
    const anos = new Set(D.pagamentos.map((p)=>String(p.data).slice(0, 4)).concat(hojeISO().slice(0, 4)));
    for(const ano of anos) ops.push({tipo: "del", col: "contadores", id: "recibos-" + ano});
    fecharJanela();
    gravar(ops).then(()=>aviso(`Dados apagados. A cópia ficou guardada em ${ficheiro}.`, "Limpar dados")).catch(()=>{});
    toast("A apagar…");
  }}]);
};
