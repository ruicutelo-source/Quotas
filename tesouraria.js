"use strict";
/* =====================================================================
   TESOURARIA (versão 5.3) — uma só conta:
     entradas = quotas e joias dos sócios (vêm sozinhas dos pagamentos)
     saídas   = registadas aqui (data, descrição, valor, forma, motivo)
   A contabilidade do clube é feita noutra app.
   (Das versões anteriores ainda se leem: receitas manuais e despesas pagas;
    transferências entre Caixa e Banco deixam de contar — era tudo do clube.)
   ===================================================================== */
const tesConfig = ()=>{ const t = D.config.find((c)=>c.id === "tesouraria") || {};
  const si = t.saldoInicial;
  const valor = typeof si === "number" ? si : si && typeof si === "object" ? Object.values(si).reduce((a, b)=>a + (Number(b) || 0), 0) : 0;
  return {dataInicial: t.dataInicial || "", saldoInicial: valor}; };
const contaPeriodo = (data)=>{ const di = tesConfig().dataInicial; return !di || String(data) >= di; };
const motivoSaida = (m)=> m.motivo || [m.entidadeNome, m.documento ? "doc. " + m.documento : ""].filter(Boolean).join(" — ");

/* todas as entradas e saídas de dinheiro (só o que conta para o saldo):
   {data, valor (+ entra / − sai), tipo: Entrada|Saída, descricao, forma, recibo, quotas, joias, ref:{col, id}} */
function fluxos(){
  const out = [];
  for(const p of D.pagamentos){
    if(p.anulado || !contaPeriodo(p.data)) continue;
    const joias = Math.min(p.total, (p.itens || []).filter((i)=>i.tipo === "Joia").reduce((t, i)=>t + i.valor, 0));
    out.push({data: p.data, valor: p.total, tipo: "Entrada", descricao: `${p.nomeSocio} — ${refPag(p)}`, forma: p.forma, recibo: p.recibo ? p.recibo.txt : "",
      quotas: p.total - joias, joias, ref: {col: "pagamentos", id: p.id}, criadoEm: p.criadoEm});
  }
  for(const m of D.movimentos){
    if(m.anulado) continue;
    if(m.tipo === "Saída" && contaPeriodo(m.data))
      out.push({data: m.data, valor: -m.valor, tipo: "Saída", descricao: m.descricao, motivo: m.motivo, forma: m.forma, ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
    // versões anteriores
    else if(m.tipo === "Receita" && contaPeriodo(m.data))
      out.push({data: m.data, valor: m.valor, tipo: "Entrada", descricao: m.descricao, forma: m.conta || "", outras: m.valor, ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
    else if(m.tipo === "Despesa" && m.estado === "pago" && contaPeriodo(m.dataPag))
      out.push({data: m.dataPag, valor: -m.valor, tipo: "Saída", descricao: m.descricao, motivo: motivoSaida(m), forma: m.conta || "", ref: {col: "movimentos", id: m.id}, criadoEm: m.criadoEm});
  }
  return out.sort((a, b)=>String(a.data).localeCompare(String(b.data)) || (a.criadoEm || 0) - (b.criadoEm || 0));
}
/* saldo até uma data, inclusive (sem data = tudo) */
function saldoAte(ate, F){
  let s = tesConfig().saldoInicial;
  for(const f of F || fluxos()) if(!ate || f.data <= ate) s += f.valor;
  return s;
}
/* resumo de um ano, mês a mês */
function resumoAno(Y, F){
  const meses = Array.from({length: 12}, ()=>({quotas: 0, joias: 0, outras: 0, saidas: 0}));
  for(const f of F) if(String(f.data).startsWith(Y + "-")){
    const m = meses[Number(f.data.slice(5, 7)) - 1];
    if(f.tipo === "Saída") m.saidas += -f.valor;
    else { m.quotas += f.quotas || 0; m.joias += f.joias || 0; m.outras += f.outras || 0; }
  }
  const soma = (k)=> meses.reduce((t, m)=>t + m[k], 0);
  const tot = {quotas: soma("quotas"), joias: soma("joias"), outras: soma("outras"), saidas: soma("saidas")};
  tot.entradas = tot.quotas + tot.joias + tot.outras;
  return {meses, tot};
}
function somaDia(iso, n){ const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* ---------- ecrã ---------- */
let abaTes = "painel", anoTes = Number(hojeISO().slice(0, 4)), perExt = "";
$("tes-abas").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ abaTes = b.dataset.aba; RENDER.tesouraria(); });
RENDER.tesouraria = function(){
  $("tes-abas").querySelectorAll("button").forEach((b)=>b.classList.toggle("ativo", b.dataset.aba === abaTes));
  document.querySelectorAll("#ecra-tesouraria .aba").forEach((a)=>a.classList.toggle("ativo", a.id === "aba-t-" + abaTes));
  $("tes-novos").style.display = eTes() ? "flex" : "none";
  ({painel: desenharPainelTes, extrato: desenharExtrato, contas: desenharContas})[abaTes]();
};
$("tes-saida").onclick = ()=>abrirSaida(null);

function desenharPainelTes(){
  const F = fluxos(), Y = anoTes, hoje = hojeISO(), r = resumoAno(Y, F);
  $("t-saldo").textContent = eur(saldoAte(null, F));
  $("t-entradas").textContent = eur(r.tot.entradas);
  $("t-saidas").textContent = eur(r.tot.saidas);
  document.querySelectorAll(".t-ano-txt").forEach((e)=>e.textContent = Y);
  $("t-ano").textContent = Y;
  $("t-ano-seg").disabled = Y >= Number(hoje.slice(0, 4));
  let acum = saldoAte((Y - 1) + "-12-31", F);
  const temOutras = r.tot.outras > 0;
  const linhas = r.meses.map((m, i)=>{
    const ent = m.quotas + m.joias + m.outras, res = ent - m.saidas;
    acum += res;
    const futuro = `${Y}-${String(i + 1).padStart(2, "0")}` > mesAtual();
    return `<tr><td>${MESES[i]}</td><td class="num">${m.quotas ? eur(m.quotas) : ""}</td><td class="num">${m.joias ? eur(m.joias) : ""}</td>
      ${temOutras ? `<td class="num">${m.outras ? eur(m.outras) : ""}</td>` : ""}
      <td class="num verm">${m.saidas ? eur(m.saidas) : ""}</td><td class="num ${res < 0 ? "verm" : ""}">${ent || m.saidas ? eur(res) : ""}</td>
      <td class="num"><b>${futuro ? "" : eur(acum)}</b></td></tr>`;
  });
  $("t-meses").innerHTML = `<table><thead><tr><th>Mês</th><th class="num">Quotas</th><th class="num">Joias</th>${temOutras ? `<th class="num">Outras entradas</th>` : ""}
    <th class="num">Saídas</th><th class="num">Resultado</th><th class="num">Saldo</th></tr></thead>
    <tbody>${linhas.join("")}<tr class="total"><td>${Y}</td><td class="num">${eur(r.tot.quotas)}</td><td class="num">${eur(r.tot.joias)}</td>${temOutras ? `<td class="num">${eur(r.tot.outras)}</td>` : ""}
      <td class="num">${eur(r.tot.saidas)}</td><td class="num">${eur(r.tot.entradas - r.tot.saidas)}</td><td></td></tr></tbody></table>`;
  const t = tesConfig();
  $("t-nota-inicio").textContent = t.dataInicial ? `Saldo contado a partir de ${dataPT(t.dataInicial)}, com saldo inicial de ${eur(t.saldoInicial)}.`
    : t.saldoInicial ? `Saldo inicial: ${eur(t.saldoInicial)}.` : "Sem saldo inicial (pode indicá-lo no separador «Saldo inicial»).";
}
$("t-ano-ant").onclick = ()=>{ anoTes--; desenharPainelTes(); };
$("t-ano-seg").onclick = ()=>{ anoTes++; desenharPainelTes(); };

/* ---------- movimentos ---------- */
function linhasExtrato(){
  const tipo = $("t-ext-tipo").value, per = perExt || mesAtual(), q = $("t-ext-pesq").value;
  const dentro = (d)=> per === "todos" || (per.length === 4 ? String(d).startsWith(per + "-") : mesISO(d) === per);
  const F = fluxos();
  const inicioPer = per === "todos" ? null : per.length === 4 ? per + "-01-01" : per + "-01";
  const saldoAbertura = inicioPer ? saldoAte(somaDia(inicioPer, -1), F) : tesConfig().saldoInicial;
  let saldo = saldoAbertura;
  const linhas = [];
  for(const f of F){
    if(!dentro(f.data)) continue;
    saldo += f.valor;                                       // o saldo de cada linha é o saldo real depois desse movimento
    if(tipo && f.tipo !== tipo) continue;
    if(!corresponde(q, f.descricao, f.motivo, f.forma, f.recibo)) continue;
    linhas.push({...f, saldo});
  }
  // saídas anuladas (não contam, mas aparecem riscadas)
  for(const m of D.movimentos) if(m.anulado && dentro(m.data) && (!tipo || tipo === "Saída") && corresponde(q, m.descricao, m.motivo, "anulado"))
    linhas.push({data: m.data, valor: 0, tipo: "Saída", descricao: m.descricao, motivo: m.motivo || "", forma: m.forma || "", anulado: true, ref: {col: "movimentos", id: m.id}});
  linhas.sort((a, b)=>String(a.data).localeCompare(String(b.data)));
  return {linhas, per, saldoAbertura, saldoFecho: saldo};
}
function desenharExtrato(){
  const sel = $("t-ext-per");
  const datas = D.movimentos.map((m)=>m.data).concat(D.movimentos.map((m)=>m.dataPag).filter(Boolean), D.pagamentos.map((p)=>p.data));
  const meses = [...new Set(datas.map(mesISO).concat(mesAtual()))].sort().reverse(), anos = [...new Set(meses.map((m)=>m.slice(0, 4)))];
  if(!perExt) perExt = mesAtual();
  sel.innerHTML = `<optgroup label="Mês">${meses.map((m)=>`<option value="${m}">${rotMes(m)}</option>`).join("")}</optgroup>
    <optgroup label="Ano">${anos.map((a)=>`<option value="${a}">Ano ${a}</option>`).join("")}</optgroup><option value="todos">Todos</option>`;
  sel.value = perExt;
  const {linhas, saldoAbertura, saldoFecho} = linhasExtrato();
  const ent = linhas.reduce((t, l)=>t + (l.valor > 0 ? l.valor : 0), 0), sai = linhas.reduce((t, l)=>t + (l.valor < 0 ? -l.valor : 0), 0);
  $("t-ext-tit").textContent = `entradas ${eur(ent)} · saídas ${eur(sai)}`;
  const filtrado = $("t-ext-tipo").value || $("t-ext-pesq").value;
  $("t-ext").innerHTML = tabela([{t: "Data"}, {t: "Descrição"}, {t: "Forma", cl: "so-largo"}, {t: "Entrada", num: true}, {t: "Saída", num: true}, {t: "Saldo", num: true}],
    [`<tr class="total"><td></td><td>Saldo anterior</td><td class="so-largo"></td><td></td><td></td><td class="num">${eur(saldoAbertura)}</td></tr>`]
    .concat(linhas.map((l)=>`<tr class="clic ${l.anulado ? "anulado" : ""}" data-col="${l.ref.col}" data-id="${esc(l.ref.id)}">
      <td>${dataPT(l.data)}</td><td>${esc(l.descricao)}${l.recibo ? ` <span class="pequeno">(${esc(l.recibo)})</span>` : ""}${l.anulado ? ` <span class="chip verm">Anulada</span>` : ""}
        ${l.tipo === "Saída" && l.motivo ? `<div class="pequeno">Motivo: ${esc(l.motivo)}</div>` : ""}</td>
      <td class="so-largo pequeno">${esc(l.forma || "")}</td>
      <td class="num verde">${l.valor > 0 ? eur(l.valor) : ""}</td><td class="num verm">${l.valor < 0 ? eur(-l.valor) : ""}</td>
      <td class="num">${l.anulado ? "" : eur(l.saldo)}</td></tr>`))
    .concat(filtrado ? [] : [`<tr class="total"><td></td><td>Saldo no fim do período</td><td class="so-largo"></td><td></td><td></td><td class="num">${eur(saldoFecho)}</td></tr>`]),
    "Sem movimentos neste período.");
  $("t-ext").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>{
    if(tr.dataset.col === "pagamentos") abrirPagamento(tr.dataset.id); else abrirSaidaExistente(tr.dataset.id);
  });
}
$("t-ext-per").onchange = ()=>{ perExt = $("t-ext-per").value; desenharExtrato(); };
$("t-ext-tipo").onchange = ()=>desenharExtrato();
$("t-ext-pesq").addEventListener("input", ()=>desenharExtrato());

/* ---------- saída de valores ---------- */
function abrirSaidaExistente(id){ const m = D.movimentos.find((x)=>x.id === id); if(m) abrirSaida(m); }
function abrirSaida(m){
  const antigo = m && m.tipo !== "Saída";                   // receita/despesa das versões anteriores: só se vê (e anula)
  const pode = eTes() && !(m && m.anulado), editar = pode && !antigo, dis = editar ? "" : "disabled";
  const v = (k, def)=> esc(m ? (m[k] == null ? "" : m[k]) : (def == null ? "" : def));
  const formas = listas().formasPagamento.slice(); if(m && m.forma && !formas.includes(m.forma)) formas.push(m.forma);
  const corpo = `<div class="ficha-grid">
      <div class="s2"><label class="campo">Data</label><input type="date" id="sd-data" value="${m ? esc(m.tipo === "Despesa" ? m.dataPag || m.data : m.data) : hojeISO()}" ${dis}></div>
      <div class="s2"><label class="campo">Valor (€) *</label><input type="text" id="sd-valor" inputmode="decimal" value="${m ? eurCampo(m.valor) : ""}" ${dis}></div>
      <div class="s4"><label class="campo">Descrição *</label><input type="text" id="sd-desc" value="${v("descricao")}" placeholder="ex.: Compra de material para o passeio" ${dis}></div>
      <div class="s2"><label class="campo">Forma</label><select id="sd-forma" ${dis}>${formas.map((f)=>`<option ${m && (m.forma || "") === f ? "selected" : ""}>${esc(f)}</option>`).join("")}</select></div>
      <div class="s4"><label class="campo">Motivo da saída * <span class="pequeno">(escrito por quem levanta o dinheiro)</span></label>
        <textarea id="sd-motivo" rows="3" ${dis}>${m ? esc(m.tipo === "Saída" ? m.motivo || "" : motivoSaida(m)) : ""}</textarea></div></div>
    ${antigo ? `<div class="nota">Registo de uma versão anterior da app (${esc(m.tipo.toLowerCase())}): só se pode ver ou anular.</div>` : ""}
    ${m ? `<div class="nota">Registado por ${esc(m.criadoNome || m.criadoPor || "—")} em ${dataHoraPT(m.criadoEm)}${m.alteradoEm ? ` · alterado por ${esc(m.alteradoPor)} em ${dataHoraPT(m.alteradoEm)}` : ""}</div>` : ""}
    ${m && m.anulado ? `<div class="aviso">Anulada por ${esc(m.anulado.por)} em ${dataHoraPT(m.anulado.em)}. Motivo: ${esc(m.anulado.motivo)}</div>` : ""}
    ${m && pode ? `<div id="sd-anular-zona" style="display:none"><label class="campo">Motivo da anulação *</label><input type="text" id="sd-anular-motivo"></div>` : ""}
    <div class="aviso" id="sd-erro" style="display:none"></div>`;
  const acoes = [{texto: editar ? "Cancelar" : "Fechar", classe: "sec", id: "sd-cancelar"}];
  if(m && pode) acoes.unshift({texto: "Anular", classe: "sec verm-txt", id: "sd-anular", manter: true, acao: ()=>anularSaida(m)});
  if(editar) acoes.push({texto: "Gravar saída", id: "sd-gravar", classe: "verm", manter: true, acao: ()=>gravarSaida(m)});
  janela(m ? (antigo ? m.tipo : "Saída de valores") : "Nova saída de valores", corpo, acoes, true);
}
function gravarSaida(m){
  const erro = (t)=>{ $("sd-erro").textContent = t; $("sd-erro").style.display = "block"; };
  const valor = centimosDe($("sd-valor").value), data = $("sd-data").value, descricao = $("sd-desc").value.trim(), motivo = $("sd-motivo").value.trim();
  if(!data || data > hojeISO()) return erro("Data inválida (não pode ser no futuro).");
  if(!valor || valor <= 0) return erro("Indique o valor (ex.: 25,50).");
  if(!descricao) return erro("Indique a descrição.");
  if(!motivo) return erro("Indique o motivo da saída.");
  const d = {tipo: "Saída", data, valor, descricao, forma: $("sd-forma").value, motivo, anulado: null};
  const id = m ? m.id : "M" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dados = m ? {...d, criadoPor: m.criadoPor || "", criadoNome: m.criadoNome || "", criadoEm: m.criadoEm || 0, alteradoPor: Store.utilizador(), alteradoEm: Date.now()}
                  : {...d, criadoPor: Store.utilizador(), criadoNome: nomeUtilizador || "", criadoEm: Date.now()};
  fecharJanela();
  gravar([{tipo: "set", col: "movimentos", id, dados}]);
  toast(m ? "Saída alterada." : `Saída de ${eur(valor)} registada.`);
}
function anularSaida(m){
  const z = $("sd-anular-zona");
  if(z.style.display === "none"){ z.style.display = "block"; $("sd-anular").textContent = "Confirmar anulação"; $("sd-anular-motivo").focus(); return; }
  const motivo = $("sd-anular-motivo").value.trim();
  if(!motivo){ $("sd-erro").textContent = "Indique o motivo da anulação."; $("sd-erro").style.display = "block"; return; }
  fecharJanela();
  gravar([{tipo: "update", col: "movimentos", id: m.id, dados: {anulado: {por: Store.utilizador(), em: Date.now(), motivo}}}]);
  toast("Saída anulada.");
}

/* ---------- saldo inicial (opcional) ---------- */
let assinContas = null;
function desenharContas(){
  const t = tesConfig(), pode = eAdmin(), a = perfil + JSON.stringify(t);
  $("t-ini-gravar").style.display = pode ? "" : "none"; $("t-ini-so-ler").style.display = pode ? "none" : "block";
  ["t-ini-data", "t-ini-valor"].forEach((id)=>$(id).disabled = !pode);
  if(a === assinContas) return; assinContas = a;
  $("t-ini-data").value = t.dataInicial; $("t-ini-valor").value = t.saldoInicial || t.dataInicial ? eurCampo(t.saldoInicial) : "";
}
$("t-ini-gravar").onclick = ()=>{
  const txt = $("t-ini-valor").value.trim(), v = txt === "" ? 0 : centimosDe(txt), d = $("t-ini-data").value;
  if(v === null){ aviso("Valor inválido (ex.: 150,00)."); return; }
  if(!d){ aviso("Indique a data de início."); return; }
  assinContas = null;
  gravar([{tipo: "set", col: "config", id: "tesouraria", dados: {dataInicial: d, saldoInicial: v, ...carimbo(false)}}]);
  toast("Saldo inicial gravado.");
};

/* ---------- mapas ---------- */
function mapaRelatorio(){
  const Y = anoTes, F = fluxos(), r = resumoAno(Y, F), ini = saldoAte((Y - 1) + "-12-31", F), fin = saldoAte(Y + "-12-31", F);
  const saidas = F.filter((f)=>f.tipo === "Saída" && String(f.data).startsWith(Y + "-"));
  imprimir(`Relatório de tesouraria ${Y}`, `Período de 01/01/${Y} a 31/12/${Y}${tesConfig().dataInicial > Y + "-01-01" ? ` · registos a partir de ${dataPT(tesConfig().dataInicial)}` : ""}`, `
    ${tabMapa([{t: "Resumo do ano"}, {t: "", num: true}], [
      `<tr><td>Saldo inicial (1 de janeiro)</td><td class="num">${eur(ini)}</td></tr>`,
      `<tr><td>Entradas — quotas dos sócios</td><td class="num">${eur(r.tot.quotas)}</td></tr>`,
      `<tr><td>Entradas — joias</td><td class="num">${eur(r.tot.joias)}</td></tr>`]
      .concat(r.tot.outras ? [`<tr><td>Outras entradas (versões anteriores)</td><td class="num">${eur(r.tot.outras)}</td></tr>`] : [])
      .concat([`<tr><td>Saídas de valores</td><td class="num">− ${eur(r.tot.saidas)}</td></tr>`]),
      `<tr class="m-total"><td>Saldo final (31 de dezembro)</td><td class="num">${eur(fin)}</td></tr>`)}
    <h3>Saídas de valores</h3>
    ${tabMapa([{t: "Data"}, {t: "Descrição"}, {t: "Motivo"}, {t: "Forma"}, {t: "Valor", num: true}],
      saidas.map((f)=>`<tr><td>${dataPT(f.data)}</td><td>${esc(f.descricao)}</td><td class="m-peq">${esc(f.motivo || "")}</td><td>${esc(f.forma || "")}</td><td class="num">${eur(-f.valor)}</td></tr>`),
      `<tr class="m-total"><td colspan="4">Total de saídas</td><td class="num">${eur(r.tot.saidas)}</td></tr>`)}
    <div class="m-assin"><div>O Tesoureiro<br><br>______________________________</div><div>O Presidente da Direção<br><br>______________________________</div></div>`, false);
}
function mapaExtrato(){
  const {linhas, per, saldoAbertura, saldoFecho} = linhasExtrato();
  const nomePer = per === "todos" ? "Todos os movimentos" : per.length === 4 ? "Ano " + per : rotMes(per);
  const ent = linhas.reduce((t, l)=>t + (l.valor > 0 ? l.valor : 0), 0), sai = linhas.reduce((t, l)=>t + (l.valor < 0 ? -l.valor : 0), 0);
  const tipo = $("t-ext-tipo").value, q = $("t-ext-pesq").value;
  imprimir("Movimentos de tesouraria", [nomePer, tipo ? (tipo === "Entrada" ? "só entradas" : "só saídas") : "", q ? `pesquisa «${q}»` : ""].filter(Boolean).join(" · "),
    tabMapa([{t: "Data"}, {t: "Descrição"}, {t: "Forma"}, {t: "Entrada", num: true}, {t: "Saída", num: true}, {t: "Saldo", num: true}],
    [`<tr><td></td><td><b>Saldo anterior</b></td><td></td><td></td><td></td><td class="num">${eur(saldoAbertura)}</td></tr>`].concat(
    linhas.map((l)=>`<tr class="${l.anulado ? "m-anulado" : ""}"><td>${dataPT(l.data)}</td><td class="m-peq">${esc(l.descricao)}${l.recibo ? ` (${esc(l.recibo)})` : ""}${l.tipo === "Saída" && l.motivo ? `<br>Motivo: ${esc(l.motivo)}` : ""}${l.anulado ? " — ANULADA" : ""}</td>
      <td>${esc(l.forma || "")}</td><td class="num">${l.valor > 0 ? eur(l.valor) : ""}</td><td class="num">${l.valor < 0 ? eur(-l.valor) : ""}</td><td class="num">${l.anulado ? "" : eur(l.saldo)}</td></tr>`)),
    `<tr class="m-total"><td></td><td colspan="2">Totais</td><td class="num">${eur(ent)}</td><td class="num">${eur(sai)}</td><td class="num">${tipo || q ? "" : eur(saldoFecho)}</td></tr>`), false);
}
$("t-relatorio").onclick = mapaRelatorio;
$("t-ext-imprimir").onclick = mapaExtrato;
