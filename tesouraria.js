"use strict";
/* =====================================================================
   TESOURARIA — Caixa e Banco, receitas, despesas (pagas e por pagar),
                transferências, fornecedores, painel e relatório de contas
   ===================================================================== */
const CONTAS = ["Caixa", "Banco"];
const contaDaForma = (forma)=> listas().formasCaixa.includes(forma) ? "Caixa" : "Banco";
const tesConfig = ()=>{ const t = D.config.find((c)=>c.id === "tesouraria") || {};
  return {dataInicial: t.dataInicial || "", saldoInicial: {Caixa: 0, Banco: 0, ...(t.saldoInicial || {})}}; };
const contaPeriodo = (data)=>{ const di = tesConfig().dataInicial; return !di || String(data) >= di; };

/* todas as entradas e saídas de dinheiro (só o que conta para o saldo):
   {data, conta, valor (+ entra / − sai), tipo, categoria, descricao, partes, ref:{col, id}} */
function fluxos(){
  const out = [];
  for(const p of D.pagamentos){
    if(p.anulado || !contaPeriodo(p.data)) continue;
    const joias = Math.min(p.total, (p.itens || []).filter((i)=>i.tipo === "Joia").reduce((t, i)=>t + i.valor, 0));
    out.push({data: p.data, conta: contaDaForma(p.forma), valor: p.total, tipo: "Quotas", categoria: joias === p.total ? "Joias" : "Quotas",
      descricao: `${p.nomeSocio} — ${(p.itens || []).map((i)=>i.rot).join(", ")}`, recibo: p.recibo ? p.recibo.txt : "",
      partes: [["Quotas", p.total - joias], ["Joias", joias]].filter((x)=>x[1]), ref: {col: "pagamentos", id: p.id}, criadoEm: p.criadoEm});
  }
  for(const m of D.movimentos){
    if(m.anulado) continue;
    if(m.tipo === "Receita" && contaPeriodo(m.data))
      out.push({data: m.data, conta: m.conta, valor: m.valor, tipo: "Receita", categoria: m.categoria, descricao: m.descricao, partes: [[m.categoria, m.valor]], ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
    else if(m.tipo === "Despesa" && m.estado === "pago" && contaPeriodo(m.dataPag))
      out.push({data: m.dataPag, conta: m.conta, valor: -m.valor, tipo: "Despesa", categoria: m.categoria,
        descricao: [m.entidadeNome, m.descricao].filter(Boolean).join(" — ") + (m.documento ? ` (doc. ${m.documento})` : ""), partes: [[m.categoria, m.valor]], ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
    else if(m.tipo === "Transferência" && contaPeriodo(m.data)){
      out.push({data: m.data, conta: m.conta, valor: -m.valor, tipo: "Transferência", categoria: "Transferência", descricao: `${m.descricao || "Transferência"} (para ${m.contaDestino})`, ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
      out.push({data: m.data, conta: m.contaDestino, valor: m.valor, tipo: "Transferência", categoria: "Transferência", descricao: `${m.descricao || "Transferência"} (de ${m.conta})`, ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
    }
  }
  return out.sort((a, b)=>String(a.data).localeCompare(String(b.data)) || (a.criadoEm || 0) - (b.criadoEm || 0));
}
/* saldo de uma conta (ou das duas) até uma data, inclusive; sem data = tudo */
function saldoAte(conta, ate, F){
  const ini = tesConfig().saldoInicial, contas = conta ? [conta] : CONTAS;
  let s = contas.reduce((t, c)=>t + (ini[c] || 0), 0);
  for(const f of F || fluxos()) if(contas.includes(f.conta) && (!ate || f.data <= ate)) s += f.valor;
  return s;
}
const despesasPorPagar = ()=> D.movimentos.filter((m)=>m.tipo === "Despesa" && m.estado === "porPagar" && !m.anulado)
  .sort((a, b)=>String(a.prazo || "9999").localeCompare(String(b.prazo || "9999")));

/* resumo de um ano: receitas e despesas por categoria e por mês */
function resumoAno(Y, F){
  const rec = new Map(), des = new Map(), meses = Array.from({length: 12}, ()=>({quotas: 0, receitas: 0, despesas: 0}));
  for(const f of F) if(String(f.data).startsWith(Y + "-") && f.tipo !== "Transferência"){
    const m = meses[Number(f.data.slice(5, 7)) - 1];
    for(const [cat, v] of f.partes || []){
      if(f.tipo === "Despesa"){ des.set(cat, (des.get(cat) || 0) + v); m.despesas += v; }
      else { rec.set(cat, (rec.get(cat) || 0) + v); if(f.tipo === "Quotas") m.quotas += v; else m.receitas += v; }
    }
  }
  const totRec = [...rec.values()].reduce((a, b)=>a + b, 0), totDes = [...des.values()].reduce((a, b)=>a + b, 0);
  return {rec, des, meses, totRec, totDes};
}
const ordenarCat = (mapa, ordem)=> [...mapa.entries()].sort((a, b)=>{ const ia = ordem.indexOf(a[0]), ib = ordem.indexOf(b[0]);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || porTexto(a[0], b[0]); });

/* ---------- ecrã ---------- */
let abaTes = "painel", anoTes = Number(hojeISO().slice(0, 4)), perExt = "";
$("tes-abas").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ abaTes = b.dataset.aba; RENDER.tesouraria(); });
RENDER.tesouraria = function(){
  $("tes-abas").querySelectorAll("button").forEach((b)=>b.classList.toggle("ativo", b.dataset.aba === abaTes));
  document.querySelectorAll("#ecra-tesouraria .aba").forEach((a)=>a.classList.toggle("ativo", a.id === "aba-t-" + abaTes));
  $("tes-novos").style.display = eTes() ? "flex" : "none";
  $("t-forn-novo").style.display = eTes() ? "" : "none";
  ({painel: desenharPainelTes, extrato: desenharExtrato, porpagar: desenharPorPagar, fornecedores: desenharFornecedores, contas: desenharContas})[abaTes]();
};
$("tes-receita").onclick = ()=>abrirMovimento("Receita", null);
$("tes-despesa").onclick = ()=>abrirMovimento("Despesa", null);
$("tes-transf").onclick = ()=>abrirMovimento("Transferência", null);

function desenharPainelTes(){
  const F = fluxos(), Y = anoTes, hoje = hojeISO();
  $("t-saldo").textContent = eur(saldoAte(null, null, F));
  $("t-caixa").textContent = eur(saldoAte("Caixa", null, F));
  $("t-banco").textContent = eur(saldoAte("Banco", null, F));
  const pp = despesasPorPagar(), venc = pp.filter((m)=>m.prazo && m.prazo < hoje);
  $("t-pp").textContent = eur(pp.reduce((t, m)=>t + m.valor, 0));
  $("t-pp-venc").textContent = venc.length ? `${venc.length} vencida(s)` : (pp.length ? `${pp.length} em aberto` : "");
  $("t-ano").textContent = Y;
  $("t-ano-seg").disabled = Y >= Number(hoje.slice(0, 4));
  const r = resumoAno(Y, F);
  let acum = saldoAte(null, (Y - 1) + "-12-31", F);
  const linhas = r.meses.map((m, i)=>{
    acum += m.quotas + m.receitas - m.despesas;
    const futuro = `${Y}-${String(i + 1).padStart(2, "0")}` > mesAtual();
    return `<tr><td>${MESES[i]}</td><td class="num">${m.quotas ? eur(m.quotas) : ""}</td><td class="num">${m.receitas ? eur(m.receitas) : ""}</td>
      <td class="num verm">${m.despesas ? eur(m.despesas) : ""}</td><td class="num ${m.quotas + m.receitas - m.despesas < 0 ? "verm" : ""}">${m.quotas || m.receitas || m.despesas ? eur(m.quotas + m.receitas - m.despesas) : ""}</td>
      <td class="num"><b>${futuro ? "" : eur(acum)}</b></td></tr>`;
  });
  const tq = r.meses.reduce((t, m)=>t + m.quotas, 0), tr = r.meses.reduce((t, m)=>t + m.receitas, 0);
  $("t-meses").innerHTML = `<table><thead><tr><th>Mês</th><th class="num">Quotas e joias</th><th class="num">Outras receitas</th><th class="num">Despesas</th><th class="num">Resultado</th><th class="num">Saldo</th></tr></thead>
    <tbody>${linhas.join("")}<tr class="total"><td>${Y}</td><td class="num">${eur(tq)}</td><td class="num">${eur(tr)}</td><td class="num">${eur(r.totDes)}</td><td class="num">${eur(r.totRec - r.totDes)}</td><td></td></tr></tbody></table>`;
  const catTab = (mapa, ordem, tot)=> tabela([{t: "Categoria"}, {t: "Valor", num: true}],
    ordenarCat(mapa, ordem).map(([c, v])=>`<tr><td>${esc(c)}</td><td class="num">${eur(v)}</td></tr>`).concat(mapa.size ? [`<tr class="total"><td>Total</td><td class="num">${eur(tot)}</td></tr>`] : []), "Sem registos neste ano.");
  $("t-cat-rec").innerHTML = catTab(r.rec, ["Quotas", "Joias"].concat(listas().categoriasReceita), r.totRec);
  $("t-cat-des").innerHTML = catTab(r.des, listas().categoriasDespesa, r.totDes);
  const t = tesConfig();
  $("t-nota-inicio").textContent = t.dataInicial ? `Saldos contados a partir de ${dataPT(t.dataInicial)} (Caixa ${eur(t.saldoInicial.Caixa)}, Banco ${eur(t.saldoInicial.Banco)}).`
    : "Ainda não foram indicados os saldos iniciais (separador «Saldos iniciais»).";
}
$("t-ano-ant").onclick = ()=>{ anoTes--; desenharPainelTes(); };
$("t-ano-seg").onclick = ()=>{ anoTes++; desenharPainelTes(); };
$("t-pp-cartao").onclick = ()=>{ abaTes = "porpagar"; RENDER.tesouraria(); };

/* ---------- movimentos (extrato) ---------- */
function linhasExtrato(){
  const conta = $("t-ext-conta").value, tipo = $("t-ext-tipo").value, per = perExt || mesAtual();
  const dentro = (d)=> per === "todos" || (per.length === 4 ? String(d).startsWith(per + "-") : mesISO(d) === per);
  const F = fluxos();
  const inicioPer = per === "todos" ? null : per.length === 4 ? per + "-01-01" : per + "-01";
  let saldo = conta ? (inicioPer ? saldoAte(conta, somaDia(inicioPer, -1), F) : tesConfig().saldoInicial[conta] || 0) : null;
  const saldoAbertura = saldo;
  const linhas = [];
  for(const f of F){
    if(conta && f.conta !== conta) continue;
    if(!dentro(f.data)) continue;
    if(tipo && f.tipo !== tipo) continue;
    if(conta) saldo += f.valor;
    linhas.push({...f, saldo});
  }
  // movimentos anulados (não contam, mas aparecem riscados)
  for(const m of D.movimentos) if(m.anulado && dentro(m.data) && (!tipo || m.tipo === tipo) && (!conta || m.conta === conta || m.contaDestino === conta))
    linhas.push({data: m.data, conta: m.conta, valor: 0, tipo: m.tipo, categoria: m.categoria || m.tipo, descricao: m.descricao, anulado: true, ref: {col: "movimentos", id: m.id}});
  linhas.sort((a, b)=>String(a.data).localeCompare(String(b.data)));
  return {linhas, conta, per, saldoAbertura, saldoFecho: saldo};
}
function somaDia(iso, n){ const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function desenharExtrato(){
  const sel = $("t-ext-per");
  const datas = D.movimentos.map((m)=>m.data).concat(D.movimentos.map((m)=>m.dataPag).filter(Boolean), D.pagamentos.map((p)=>p.data));
  const meses = [...new Set(datas.map(mesISO).concat(mesAtual()))].sort().reverse(), anos = [...new Set(meses.map((m)=>m.slice(0, 4)))];
  if(!perExt) perExt = mesAtual();
  sel.innerHTML = `<optgroup label="Mês">${meses.map((m)=>`<option value="${m}">${rotMes(m)}</option>`).join("")}</optgroup>
    <optgroup label="Ano">${anos.map((a)=>`<option value="${a}">Ano ${a}</option>`).join("")}</optgroup><option value="todos">Todos</option>`;
  sel.value = perExt;
  const {linhas, conta, saldoAbertura, saldoFecho} = linhasExtrato();
  const ent = linhas.reduce((t, l)=>t + (l.valor > 0 ? l.valor : 0), 0), sai = linhas.reduce((t, l)=>t + (l.valor < 0 ? -l.valor : 0), 0);
  $("t-ext-tit").textContent = `entradas ${eur(ent)} · saídas ${eur(sai)}`;
  const cab = [{t: "Data"}, {t: "Descrição"}, {t: "Categoria", cl: "so-largo"}].concat(conta ? [] : [{t: "Conta", cl: "so-largo"}])
    .concat([{t: "Entrada", num: true}, {t: "Saída", num: true}]).concat(conta ? [{t: "Saldo", num: true}] : []);
  const abertura = conta ? [`<tr class="total"><td></td><td>Saldo anterior</td><td class="so-largo"></td><td></td><td></td><td class="num">${eur(saldoAbertura)}</td></tr>`] : [];
  $("t-ext").innerHTML = tabela(cab, abertura.concat(linhas.map((l)=>`<tr class="clic ${l.anulado ? "anulado" : ""}" data-col="${l.ref.col}" data-id="${esc(l.ref.id)}">
    <td>${dataPT(l.data)}</td><td>${esc(l.descricao)}${l.recibo ? ` <span class="pequeno">(${esc(l.recibo)})</span>` : ""}</td><td class="so-largo pequeno">${esc(l.anulado ? "Anulado" : l.categoria)}</td>
    ${conta ? "" : `<td class="so-largo">${esc(l.conta)}</td>`}
    <td class="num verde">${l.valor > 0 ? eur(l.valor) : ""}</td><td class="num verm">${l.valor < 0 ? eur(-l.valor) : ""}</td>
    ${conta ? `<td class="num">${l.anulado ? "" : eur(l.saldo)}</td>` : ""}</tr>`)), "Sem movimentos neste período.");
  $("t-ext").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>{
    if(tr.dataset.col === "pagamentos") abrirPagamento(tr.dataset.id); else abrirMovimentoExistente(tr.dataset.id);
  });
}
$("t-ext-per").onchange = ()=>{ perExt = $("t-ext-per").value; desenharExtrato(); };
$("t-ext-conta").onchange = ()=>desenharExtrato();
$("t-ext-tipo").onchange = ()=>desenharExtrato();

/* ---------- por pagar ---------- */
function desenharPorPagar(){
  const pp = despesasPorPagar(), hoje = hojeISO();
  $("t-pp-tit").textContent = `${pp.length} · ${eur(pp.reduce((t, m)=>t + m.valor, 0))}`;
  $("t-pp-lista").innerHTML = tabela([{t: "Prazo"}, {t: "Fornecedor"}, {t: "Documento", cl: "so-largo"}, {t: "Descrição", cl: "so-largo"}, {t: "Valor", num: true}, {t: ""}],
    pp.map((m)=>`<tr class="clic" data-id="${esc(m.id)}"><td>${m.prazo ? dataPT(m.prazo) : "—"} ${m.prazo && m.prazo < hoje ? `<span class="chip verm">Vencida</span>` : ""}</td>
      <td>${esc(m.entidadeNome || "—")}</td><td class="so-largo">${esc(m.documento)}</td><td class="so-largo">${esc(m.descricao)}</td>
      <td class="num"><b>${eur(m.valor)}</b></td><td>${eTes() ? `<button class="bt peq verde" data-pagar="${esc(m.id)}">Pagar</button>` : ""}</td></tr>`),
    "Não há despesas por pagar. 👍");
  $("t-pp-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = (e)=>{
    if(e.target.dataset.pagar) pagarDespesa(e.target.dataset.pagar); else abrirMovimentoExistente(tr.dataset.id);
  });
}
function pagarDespesa(id){
  const m = D.movimentos.find((x)=>x.id === id); if(!m || !eTes()) return;
  janela("Pagar despesa", `<p><b>${esc(m.entidadeNome || m.descricao)}</b> · ${eur(m.valor)}${m.documento ? ` · doc. ${esc(m.documento)}` : ""}</p>
    <div class="ficha-grid"><div class="s2"><label class="campo">Data do pagamento</label><input type="date" id="pg-data" value="${hojeISO()}"></div>
    <div class="s2"><label class="campo">Pago por</label><select id="pg-conta">${CONTAS.map((c)=>`<option ${c === "Banco" ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
    <div class="aviso" id="pg-erro" style="display:none"></div>`,
  [{texto: "Cancelar", classe: "sec"}, {texto: "Marcar como paga", id: "pg-ok", classe: "verde", manter: true, acao: ()=>{
    const d = $("pg-data").value;
    if(!d || d > hojeISO()){ $("pg-erro").textContent = "Data inválida (não pode ser no futuro)."; $("pg-erro").style.display = "block"; return; }
    fecharJanela();
    gravar([{tipo: "update", col: "movimentos", id, dados: {estado: "pago", dataPag: d, conta: $("pg-conta").value, alteradoPor: Store.utilizador(), alteradoEm: Date.now()}}]);
    toast("Despesa paga.");
  }}]);
}

/* ---------- receita / despesa / transferência ---------- */
function abrirMovimentoExistente(id){ const m = D.movimentos.find((x)=>x.id === id); if(m) abrirMovimento(m.tipo, m); }
function abrirMovimento(tipo, m){
  const pode = eTes() && !(m && m.anulado), dis = pode ? "" : "disabled", L = listas();
  const v = (k, def)=> esc(m ? (m[k] == null ? "" : m[k]) : (def == null ? "" : def));
  const opt = (arr, sel)=> arr.map((x)=>`<option ${x === sel ? "selected" : ""}>${esc(x)}</option>`).join("");
  let corpo = "";
  if(tipo === "Receita"){
    const cats = L.categoriasReceita.slice(); if(m && !cats.includes(m.categoria)) cats.push(m.categoria);
    corpo = `<div class="ficha-grid">
      <div class="s2"><label class="campo">Data</label><input type="date" id="mv-data" value="${v("data", hojeISO())}" ${dis}></div>
      <div class="s2"><label class="campo">Categoria</label><select id="mv-cat" ${dis}>${opt(cats, m && m.categoria)}</select></div>
      <div class="s4"><label class="campo">Descrição *</label><input type="text" id="mv-desc" value="${v("descricao")}" placeholder="ex.: Inscrições no passeio de primavera" ${dis}></div>
      <div class="s2"><label class="campo">Valor (€) *</label><input type="text" id="mv-valor" inputmode="decimal" value="${m ? eurCampo(m.valor) : ""}" ${dis}></div>
      <div class="s2"><label class="campo">Entrou em</label><select id="mv-conta" ${dis}>${opt(CONTAS, m ? m.conta : "Caixa")}</select></div></div>`;
  }else if(tipo === "Despesa"){
    const cats = L.categoriasDespesa.slice(); if(m && !cats.includes(m.categoria)) cats.push(m.categoria);
    const ents = D.entidades.slice().sort((a, b)=>porTexto(a.nome, b.nome));
    const paga = m ? m.estado === "pago" : true;
    corpo = `<div class="ficha-grid">
      <div class="s2"><label class="campo">Fornecedor</label><select id="mv-ent" ${dis}><option value="">— nenhum —</option>${ents.map((e)=>`<option value="${esc(e.id)}" ${m && m.entidadeId === e.id ? "selected" : ""}>${esc(e.nome)}</option>`).join("")}</select></div>
      <div><label class="campo">Nº documento</label><input type="text" id="mv-doc" value="${v("documento")}" placeholder="ex.: FT 2026/123" ${dis}></div>
      <div><label class="campo">Data do documento</label><input type="date" id="mv-data" value="${v("data", hojeISO())}" ${dis}></div>
      <div class="s2"><label class="campo">Categoria</label><select id="mv-cat" ${dis}>${opt(cats, m && m.categoria)}</select></div>
      <div class="s2"><label class="campo">Valor (€) *</label><input type="text" id="mv-valor" inputmode="decimal" value="${m ? eurCampo(m.valor) : ""}" ${dis}></div>
      <div class="s4"><label class="campo">Descrição *</label><input type="text" id="mv-desc" value="${v("descricao")}" placeholder="ex.: Seguro de responsabilidade civil" ${dis}></div>
      <div class="s4"><label class="campo">Estado</label><div class="seletor" id="mv-estado">
        <button type="button" data-v="pago" class="${paga ? "ativo" : ""}" ${dis}>Já paga</button><button type="button" data-v="porPagar" class="${paga ? "" : "ativo"}" ${dis}>Por pagar</button></div></div>
      <div class="s2 mv-pago"><label class="campo">Data do pagamento</label><input type="date" id="mv-datapag" value="${v("dataPag", hojeISO())}" ${dis}></div>
      <div class="s2 mv-pago"><label class="campo">Pago por</label><select id="mv-conta" ${dis}>${opt(CONTAS, m ? m.conta : "Banco")}</select></div>
      <div class="s2 mv-porpagar"><label class="campo">Prazo de pagamento</label><input type="date" id="mv-prazo" value="${v("prazo")}" ${dis}></div></div>`;
  }else{
    corpo = `<div class="ficha-grid">
      <div class="s2"><label class="campo">Data</label><input type="date" id="mv-data" value="${v("data", hojeISO())}" ${dis}></div>
      <div class="s2"><label class="campo">Valor (€) *</label><input type="text" id="mv-valor" inputmode="decimal" value="${m ? eurCampo(m.valor) : ""}" ${dis}></div>
      <div class="s2"><label class="campo">De</label><select id="mv-conta" ${dis}>${opt(CONTAS, m ? m.conta : "Caixa")}</select></div>
      <div class="s2"><label class="campo">Para</label><select id="mv-destino" ${dis}>${opt(CONTAS, m ? m.contaDestino : "Banco")}</select></div>
      <div class="s4"><label class="campo">Descrição</label><input type="text" id="mv-desc" value="${v("descricao", "Depósito do dinheiro em caixa")}" ${dis}></div></div>`;
  }
  corpo += `<label class="campo">Observações</label><input type="text" id="mv-obs" value="${v("obs")}" ${dis}>
    ${m ? `<div class="nota">Registado por ${esc(m.criadoPor || "—")} em ${dataHoraPT(m.criadoEm)}${m.alteradoEm ? ` · alterado por ${esc(m.alteradoPor)} em ${dataHoraPT(m.alteradoEm)}` : ""}</div>` : ""}
    ${m && m.anulado ? `<div class="aviso">Anulado por ${esc(m.anulado.por)} em ${dataHoraPT(m.anulado.em)}. Motivo: ${esc(m.anulado.motivo)}</div>` : ""}
    ${m && pode ? `<div id="mv-anular-zona" style="display:none"><label class="campo">Motivo da anulação *</label><input type="text" id="mv-anular-motivo"></div>` : ""}
    <div class="aviso" id="mv-erro" style="display:none"></div>`;
  const acoes = [{texto: pode ? "Cancelar" : "Fechar", classe: "sec", id: "mv-cancelar"}];
  if(m && pode) acoes.unshift({texto: "Anular", classe: "sec verm-txt", id: "mv-anular", manter: true, acao: ()=>anularMovimento(m)});
  if(pode) acoes.push({texto: "Gravar", id: "mv-gravar", classe: tipo === "Receita" ? "verde" : tipo === "Despesa" ? "verm" : "", manter: true, acao: ()=>gravarMovimento(tipo, m)});
  janela((m ? "" : "Nova ") + (tipo === "Receita" ? "receita" : tipo === "Despesa" ? "despesa" : "transferência entre contas"), corpo, acoes, true);
  if(tipo === "Despesa"){
    const mostrarEstado = ()=>{ const pago = $("mv-estado").querySelector(".ativo").dataset.v === "pago";
      document.querySelectorAll(".mv-pago").forEach((e)=>e.style.display = pago ? "" : "none");
      document.querySelectorAll(".mv-porpagar").forEach((e)=>e.style.display = pago ? "none" : ""); };
    $("mv-estado").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ if(!pode) return;
      $("mv-estado").querySelectorAll("button").forEach((x)=>x.classList.toggle("ativo", x === b)); mostrarEstado(); });
    mostrarEstado();
  }
}
function gravarMovimento(tipo, m){
  const erro = (t)=>{ $("mv-erro").textContent = t; $("mv-erro").style.display = "block"; };
  const valor = centimosDe($("mv-valor").value), data = $("mv-data").value, desc = $("mv-desc").value.trim();
  if(!valor) return erro("Indique o valor (ex.: 25,50).");
  if(!data) return erro("Indique a data.");
  const d = {tipo, data, valor, descricao: desc, obs: $("mv-obs").value.trim(), anulado: null};
  if(tipo === "Receita"){
    if(!desc) return erro("Indique a descrição.");
    if(data > hojeISO()) return erro("A data não pode ser no futuro.");
    Object.assign(d, {categoria: $("mv-cat").value, conta: $("mv-conta").value});
  }else if(tipo === "Despesa"){
    if(!desc) return erro("Indique a descrição.");
    const ent = D.entidades.find((e)=>e.id === $("mv-ent").value);
    const estado = $("mv-estado").querySelector(".ativo").dataset.v;
    Object.assign(d, {categoria: $("mv-cat").value, entidadeId: ent ? ent.id : "", entidadeNome: ent ? ent.nome : "", documento: $("mv-doc").value.trim(), estado});
    if(estado === "pago"){
      const dp = $("mv-datapag").value;
      if(!dp || dp > hojeISO()) return erro("Data do pagamento inválida (não pode ser no futuro).");
      Object.assign(d, {dataPag: dp, conta: $("mv-conta").value, prazo: ""});
    }else Object.assign(d, {dataPag: "", conta: "", prazo: $("mv-prazo").value});
  }else{
    if(data > hojeISO()) return erro("A data não pode ser no futuro.");
    if($("mv-conta").value === $("mv-destino").value) return erro("Escolha contas diferentes.");
    Object.assign(d, {categoria: "Transferência", conta: $("mv-conta").value, contaDestino: $("mv-destino").value, descricao: desc || "Transferência"});
  }
  const id = m ? m.id : "M" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dados = m ? {...d, criadoPor: m.criadoPor || "", criadoEm: m.criadoEm || 0, alteradoPor: Store.utilizador(), alteradoEm: Date.now()}
                  : {...d, criadoPor: Store.utilizador(), criadoEm: Date.now()};
  fecharJanela();
  gravar([{tipo: "set", col: "movimentos", id, dados}]);
  toast(m ? "Movimento alterado." : (tipo === "Despesa" && d.estado === "porPagar" ? "Despesa por pagar registada." : tipo + " registada."));
}
function anularMovimento(m){
  const z = $("mv-anular-zona");
  if(z.style.display === "none"){ z.style.display = "block"; $("mv-anular").textContent = "Confirmar anulação"; $("mv-anular-motivo").focus(); return; }
  const motivo = $("mv-anular-motivo").value.trim();
  if(!motivo){ $("mv-erro").textContent = "Indique o motivo da anulação."; $("mv-erro").style.display = "block"; return; }
  fecharJanela();
  gravar([{tipo: "update", col: "movimentos", id: m.id, dados: {anulado: {por: Store.utilizador(), em: Date.now(), motivo}}}]);
  toast("Movimento anulado.");
}

/* ---------- fornecedores ---------- */
function desenharFornecedores(){
  const q = norm($("t-forn-pesq").value);
  const lista = D.entidades.filter((e)=>!q || norm([e.nome, e.nif, e.email].join(" ")).includes(q)).sort((a, b)=>porTexto(a.nome, b.nome));
  $("t-forn-lista").innerHTML = tabela([{t: "Nome"}, {t: "NIF", cl: "so-largo"}, {t: "Telefone", cl: "so-largo"}, {t: "Despesas", num: true}, {t: "Total", num: true}],
    lista.map((e)=>{ const ds = D.movimentos.filter((m)=>m.entidadeId === e.id && !m.anulado);
      return `<tr class="clic" data-id="${esc(e.id)}"><td>${esc(e.nome)}</td><td class="so-largo">${esc(e.nif)}</td><td class="so-largo">${esc(e.telefone)}</td>
        <td class="num">${ds.length}</td><td class="num">${eur(ds.reduce((t, m)=>t + m.valor, 0))}</td></tr>`; }),
    D.entidades.length ? "Nenhum fornecedor corresponde à pesquisa." : "Ainda não há fornecedores.");
  $("t-forn-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirEntidade(tr.dataset.id));
}
$("t-forn-pesq").addEventListener("input", ()=>desenharFornecedores());
$("t-forn-novo").onclick = ()=>abrirEntidade(null);
function abrirEntidade(id){
  const e = id ? D.entidades.find((x)=>x.id === id) : null, pode = eTes(), dis = pode ? "" : "disabled";
  const v = (k)=> esc(e ? e[k] || "" : "");
  const usos = e ? D.movimentos.filter((m)=>m.entidadeId === e.id).length : 0;
  janela(e ? e.nome : "Novo fornecedor", `<div class="ficha-grid">
      <div class="s4"><label class="campo">Nome *</label><input type="text" id="en-nome" value="${v("nome")}" ${dis}></div>
      <div><label class="campo">NIF</label><input type="text" id="en-nif" inputmode="numeric" maxlength="9" value="${v("nif")}" ${dis}></div>
      <div><label class="campo">Telefone</label><input type="text" id="en-tel" value="${v("telefone")}" ${dis}></div>
      <div class="s2"><label class="campo">Email</label><input type="email" id="en-email" value="${v("email")}" ${dis}></div>
      <div class="s4"><label class="campo">Morada</label><input type="text" id="en-morada" value="${v("morada")}" ${dis}></div>
      <div class="s4"><label class="campo">Observações</label><input type="text" id="en-obs" value="${v("obs")}" ${dis}></div></div>
    ${e ? `<div class="nota">${usos} despesa(s) registada(s).</div>` : ""}<div class="aviso" id="en-erro" style="display:none"></div>`,
  [...(e && pode ? [{texto: "Apagar", classe: "sec verm-txt", id: "en-apagar", manter: true, acao: ()=>{
      if(usos){ $("en-erro").textContent = "Este fornecedor tem despesas registadas e não pode ser apagado."; $("en-erro").style.display = "block"; return; }
      fecharJanela(); gravar([{tipo: "del", col: "entidades", id: e.id}]); toast("Fornecedor apagado."); }}] : []),
   {texto: pode ? "Cancelar" : "Fechar", classe: "sec"},
   ...(pode ? [{texto: "Gravar", id: "en-gravar", manter: true, acao: ()=>{
      const erro = (t)=>{ $("en-erro").textContent = t; $("en-erro").style.display = "block"; };
      const nome = $("en-nome").value.trim(), nif = $("en-nif").value.trim(), email = $("en-email").value.trim();
      if(!nome) return erro("Indique o nome.");
      if(nif && !nifValido(nif)) return erro("NIF inválido.");
      if(!emailValido(email)) return erro("Email inválido.");
      const eid = e ? e.id : "E" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const ops = [{tipo: "set", col: "entidades", id: eid, dados: {nome, nif, telefone: $("en-tel").value.trim(), email, morada: $("en-morada").value.trim(), obs: $("en-obs").value.trim()}}];
      // o nome do fornecedor também está guardado nas despesas: atualiza
      if(e && e.nome !== nome) for(const m of D.movimentos.filter((x)=>x.entidadeId === eid)) ops.push({tipo: "update", col: "movimentos", id: m.id, dados: {entidadeNome: nome}});
      fecharJanela(); gravar(ops); toast("Fornecedor gravado.");
   }}] : [])], true);
}

/* ---------- saldos iniciais ---------- */
let assinContas = null;
function desenharContas(){
  const t = tesConfig(), pode = eAdmin(), a = perfil + JSON.stringify(t);
  $("t-ini-gravar").style.display = pode ? "" : "none"; $("t-ini-so-ler").style.display = pode ? "none" : "block";
  ["t-ini-data", "t-ini-caixa", "t-ini-banco"].forEach((id)=>$(id).disabled = !pode);
  if(a === assinContas) return; assinContas = a;
  $("t-ini-data").value = t.dataInicial; $("t-ini-caixa").value = eurCampo(t.saldoInicial.Caixa); $("t-ini-banco").value = eurCampo(t.saldoInicial.Banco);
}
$("t-ini-gravar").onclick = ()=>{
  const c = centimosDe($("t-ini-caixa").value), b = centimosDe($("t-ini-banco").value), d = $("t-ini-data").value;
  if(c === null || b === null){ aviso("Valor inválido (ex.: 150,00)."); return; }
  if(!d){ aviso("Indique a data de início."); return; }
  assinContas = null;
  gravar([{tipo: "set", col: "config", id: "tesouraria", dados: {dataInicial: d, saldoInicial: {Caixa: c, Banco: b}, ...carimbo(false)}}]);
  toast("Saldos iniciais gravados.");
};

/* ---------- mapas ---------- */
function mapaRelatorio(){
  const Y = anoTes, F = fluxos(), r = resumoAno(Y, F), fimAnt = (Y - 1) + "-12-31", fim = Y + "-12-31";
  const ini = Object.fromEntries(CONTAS.map((c)=>[c, saldoAte(c, fimAnt, F)])), fin = Object.fromEntries(CONTAS.map((c)=>[c, saldoAte(c, fim, F)]));
  const tIni = ini.Caixa + ini.Banco, tFin = fin.Caixa + fin.Banco;
  // despesas do ano (ou antes) ainda por pagar no fim do ano
  const ppFim = D.movimentos.filter((m)=>m.tipo === "Despesa" && !m.anulado && m.data <= fim && (m.estado === "porPagar" || (m.dataPag && m.dataPag > fim)));
  const linhasCat = (mapa, ordem)=> ordenarCat(mapa, ordem).map(([c, v])=>`<tr><td>${esc(c)}</td><td class="num">${eur(v)}</td></tr>`);
  imprimir(`Relatório de contas ${Y}`, `Período de 01/01/${Y} a 31/12/${Y}${tesConfig().dataInicial > Y + "-01-01" ? ` · registos a partir de ${dataPT(tesConfig().dataInicial)}` : ""}`, `
    ${tabMapa([{t: "Saldo inicial (1 de janeiro)"}, {t: "", num: true}], [`<tr><td>Caixa</td><td class="num">${eur(ini.Caixa)}</td></tr>`, `<tr><td>Banco</td><td class="num">${eur(ini.Banco)}</td></tr>`],
      `<tr class="m-total"><td>Total</td><td class="num">${eur(tIni)}</td></tr>`)}
    <div class="m-duas">
      <div>${tabMapa([{t: "Receitas"}, {t: "Valor", num: true}], linhasCat(r.rec, ["Quotas", "Joias"].concat(listas().categoriasReceita)),
        `<tr class="m-total"><td>Total de receitas</td><td class="num">${eur(r.totRec)}</td></tr>`)}</div>
      <div>${tabMapa([{t: "Despesas"}, {t: "Valor", num: true}], linhasCat(r.des, listas().categoriasDespesa),
        `<tr class="m-total"><td>Total de despesas</td><td class="num">${eur(r.totDes)}</td></tr>`)}</div>
    </div>
    ${tabMapa([{t: "Resultado e saldo final"}, {t: "", num: true}], [
      `<tr><td>Resultado do ano (receitas − despesas)</td><td class="num"><b>${eur(r.totRec - r.totDes)}</b></td></tr>`,
      `<tr><td>Saldo final em Caixa (31 de dezembro)</td><td class="num">${eur(fin.Caixa)}</td></tr>`,
      `<tr><td>Saldo final no Banco (31 de dezembro)</td><td class="num">${eur(fin.Banco)}</td></tr>`],
      `<tr class="m-total"><td>Saldo final total</td><td class="num">${eur(tFin)}</td></tr>`)}
    ${ppFim.length ? `<h3>Despesas por pagar no fim do ano</h3>` + tabMapa([{t: "Data"}, {t: "Fornecedor"}, {t: "Documento"}, {t: "Descrição"}, {t: "Valor", num: true}],
      ppFim.map((m)=>`<tr><td>${dataPT(m.data)}</td><td>${esc(m.entidadeNome)}</td><td>${esc(m.documento)}</td><td>${esc(m.descricao)}</td><td class="num">${eur(m.valor)}</td></tr>`),
      `<tr class="m-total"><td colspan="4">Total por pagar</td><td class="num">${eur(ppFim.reduce((t, m)=>t + m.valor, 0))}</td></tr>`) : ""}
    <div class="m-assin"><div>O Tesoureiro<br><br>______________________________</div><div>O Presidente da Direção<br><br>______________________________</div></div>`, false);
}
function mapaExtrato(){
  const {linhas, conta, per, saldoAbertura, saldoFecho} = linhasExtrato();
  const nomePer = per === "todos" ? "Todos os movimentos" : per.length === 4 ? "Ano " + per : rotMes(per);
  const ent = linhas.reduce((t, l)=>t + (l.valor > 0 ? l.valor : 0), 0), sai = linhas.reduce((t, l)=>t + (l.valor < 0 ? -l.valor : 0), 0);
  const cab = [{t: "Data"}, {t: "Descrição"}, {t: "Categoria"}].concat(conta ? [] : [{t: "Conta"}]).concat([{t: "Entrada", num: true}, {t: "Saída", num: true}]).concat(conta ? [{t: "Saldo", num: true}] : []);
  imprimir("Movimentos de tesouraria", `${nomePer} · ${conta || "Caixa e Banco"}${$("t-ext-tipo").value ? " · " + $("t-ext-tipo").value : ""}`, tabMapa(cab,
    (conta ? [`<tr><td></td><td><b>Saldo anterior</b></td><td></td><td></td><td></td><td class="num">${eur(saldoAbertura)}</td></tr>`] : []).concat(
    linhas.map((l)=>`<tr class="${l.anulado ? "m-anulado" : ""}"><td>${dataPT(l.data)}</td><td class="m-peq">${esc(l.descricao)}${l.recibo ? ` (${esc(l.recibo)})` : ""}</td><td>${esc(l.anulado ? "Anulado" : l.categoria)}</td>
      ${conta ? "" : `<td>${esc(l.conta)}</td>`}<td class="num">${l.valor > 0 ? eur(l.valor) : ""}</td><td class="num">${l.valor < 0 ? eur(-l.valor) : ""}</td>${conta ? `<td class="num">${l.anulado ? "" : eur(l.saldo)}</td>` : ""}</tr>`)),
    `<tr class="m-total"><td></td><td colspan="${conta ? 2 : 3}">Totais</td><td class="num">${eur(ent)}</td><td class="num">${eur(sai)}</td>${conta ? `<td class="num">${eur(saldoFecho)}</td>` : ""}</tr>`), false);
}
$("t-relatorio").onclick = mapaRelatorio;
$("t-ext-imprimir").onclick = mapaExtrato;
