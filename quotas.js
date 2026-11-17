"use strict";
/* =====================================================================
   QUOTAS — cálculo do que cada sócio deve, receber pagamentos,
            quadro do ano, lista de pagamentos e vinhetas
   Só se guardam os PAGAMENTOS; o que está em dívida é calculado.
   Desde a versão 5.0 há só QUOTA MENSAL: tudo se conta ao mês.
   Ao receber escolhe-se o nº de meses (1 = Mensal, 3 = Trimestre,
   6 = Semestre, 12 = Ano, outro = «N meses»), a partir do 1.º mês por pagar.
   ===================================================================== */
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesISO = (iso)=> String(iso || "").slice(0, 7);
const mesAtual = ()=> hojeISO().slice(0, 7);
function somaMes(m, n){ let [y, mm] = m.split("-").map(Number); mm += n;
  while(mm > 12){ mm -= 12; y++; } while(mm < 1){ mm += 12; y--; } return y + "-" + String(mm).padStart(2, "0"); }
const rotMes = (m)=> MESES[Number(m.slice(5, 7)) - 1] + "/" + m.slice(0, 4);
const mesPT = (m)=> m ? m.slice(5, 7) + "/" + m.slice(0, 4) : "";
const MAX_MESES = 120;

/* valores de um ano (se o ano não tiver valores, usa o último ano anterior que tenha) */
function valoresAno(ano){
  const c = clube(), v = c.valores || {};
  const anos = Object.keys(v).map(Number).sort((a, b)=>a - b);
  let k = anos.filter((a)=>a <= ano).pop(); if(k == null) k = anos[0];
  if(k != null) return {joia: 0, mensal: 0, ...v[k]};
  return {joia: c.joia || 0, mensal: c.quotaMensal || 0};
}
const valorMes = (m)=> valoresAno(Number(m.slice(0, 4))).mensal || 0;
const tipoIsento = (t)=> listas().tiposIsentos.includes(t);
/* o sócio estava inativo nesse mês? */
/* (os períodos em que o sócio esteve «inativo a pagar quotas» contam como meses normais) */
function inativoEm(s, m){
  const todos = s.inatividade || [], r = todos.filter((x)=>(x.situacao || "saiu") !== "paga");
  if(r.some((x)=>x.de <= m && (!x.ate || m <= x.ate))) return true;
  if(s.ativo === false && !todos.some((x)=>!x.ate) && situacaoSocio(s) !== "paga") return m > mesAtual();
  return false;
}
/* nome do «pacote» conforme o nº de meses */
const nomePacote = (n)=> ({1: "Mensal", 3: "Trimestre", 6: "Semestre", 12: "Ano"})[n] || `${n} meses`;
/* «Semestre — Jan/2027 a Jun/2027» */
function refMeses(meses){
  if(!meses.length) return "";
  const n = meses.length;
  return nomePacote(n) + " — " + (n === 1 ? rotMes(meses[0]) : rotMes(meses[0]) + " a " + rotMes(meses[n - 1]));
}
/* linhas de um pagamento para mostrar/imprimir: [[descrição, valor]] (os meses ficam numa só linha) */
function linhasPag(p){
  const itens = p.itens || [], out = [];
  for(const i of itens) if(i.tipo === "Joia") out.push(["Joia de inscrição", i.valor]);
  const mens = itens.filter((i)=>i.tipo === "Quota" && /^\d{4}-\d{2}$/.test(i.periodo)).sort((a, b)=>a.periodo.localeCompare(b.periodo));
  if(mens.length) out.push(["Quotas: " + refMeses(mens.map((i)=>i.periodo)), mens.reduce((t, i)=>t + i.valor, 0)]);
  for(const i of itens) if(i.tipo !== "Joia" && !mens.includes(i)) out.push([i.tipo === "Quota" ? "Quota " + i.rot : i.rot, i.valor]);
  return out;
}
/* texto curto «Referente a» (listas, mapas, Excel, tesouraria) */
const refPag = (p)=> linhasPag(p).map(([d])=>d === "Joia de inscrição" ? "Joia" : d.replace(/^Quotas: /, "")).join(", ");

/* tudo o que o sócio devia pagar até ao mês «ate» (inclusive): [{tipo, periodo, valor, venc, rot}] */
function obrigacoes(s, ate){
  const out = [];
  if(!s.dataEntrada || tipoIsento(s.tipo)) return out;
  const ini = mesISO(s.dataEntrada), pagoAte = s.pagoAte || "";
  // joia: só para quem se inscreveu depois do «quotas pagas até» (sócio novo)
  if((!pagoAte || pagoAte < ini) && ini <= ate) out.push({tipo: "Joia", periodo: "joia", valor: valoresAno(Number(ini.slice(0, 4))).joia, venc: ini, rot: "Joia"});
  for(let m = pagoAte && pagoAte >= ini ? somaMes(pagoAte, 1) : ini; m <= ate; m = somaMes(m, 1)){
    if(inativoEm(s, m)) continue;
    out.push({tipo: "Quota", periodo: m, valor: valorMes(m), venc: m, rot: rotMes(m)});
  }
  return out.filter((o)=>o.valor > 0);
}
const estaPago = (s, periodo)=> !!(Idx.pagos.get(s.id) && Idx.pagos.get(s.id).has(periodo));
/* situação a hoje: o que está vencido e não pago */
function situacao(s){
  const falta = obrigacoes(s, mesAtual()).filter((o)=>!estaPago(s, o.periodo));
  return {falta, divida: falta.reduce((t, o)=>t + o.valor, 0)};
}
/* «Joia, 5 meses (Jul/2026 a Nov/2026)» */
function resumoFalta(falta){
  const j = falta.some((o)=>o.tipo === "Joia"), ms = falta.filter((o)=>o.tipo === "Quota").map((o)=>o.periodo);
  const meses = !ms.length ? "" : ms.length === 1 ? rotMes(ms[0]) : `${ms.length} meses (${rotMes(ms[0])} a ${rotMes(ms[ms.length - 1])})`;
  return [j ? "Joia" : "", meses].filter(Boolean).join(", ");
}
/* o mês já não precisa de ser pago? (antes da inscrição, pago antes da app, pago na app, inativo, ou a pagar agora) */
function mesCoberto(s, m, extra){
  return m < mesISO(s.dataEntrada) || (!!s.pagoAte && m <= s.pagoAte) || estaPago(s, m) || (!!extra && extra.has(m)) || inativoEm(s, m);
}
/* os próximos n meses por pagar, a começar no 1.º que falta (nunca ficam buracos) */
function proximosMeses(s, n){
  const out = [];
  if(!s.dataEntrada || tipoIsento(s.tipo) || n < 1) return out;
  let m = mesISO(s.dataEntrada);
  for(let guarda = 0; out.length < n && guarda < 2400; guarda++, m = somaMes(m, 1)) if(!mesCoberto(s, m)) out.push(m);
  return out;
}
/* último mês pago seguido (null = ainda nada pago) */
function pagoAteAgora(s){
  if(!s.dataEntrada || tipoIsento(s.tipo)) return null;
  let m = mesISO(s.dataEntrada), ultimo = null;
  for(let guarda = 0; guarda < 2400 && mesCoberto(s, m); guarda++){ if(m > somaMes(mesAtual(), 600)) break; ultimo = m; m = somaMes(m, 1); }
  return ultimo;
}
/* ---------- vinhetas (versão 5.2: uma vinheta por cada mês pago) ----------
   pagamento.vinhetas = ["2027-03", …] (os meses pagos) e pagamento.vinhetasEntregues = {"2027-03": {por, nome, em}, …}.
   Entregam-se mês a mês: as que faltam ficam «por entregar» até serem marcadas.
   (Nas versões de testes 5.0/5.1 era uma vinheta por ano: «2026» + vinhetaEntregue; continua a ser lida.) */
const rotVinheta = (m)=> m.length === 4 ? "Ano " + m : rotMes(m);
function vinhetasDe(p){
  if(p.anulado) return [];
  const ent = p.vinhetasEntregues || {};
  return (p.vinhetas || []).map((m)=>({mes: m, entregue: m.length === 4 ? (p.vinhetaEntregue || null) : (ent[m] || null)}));
}
const vinhetasFalta = (p)=> vinhetasDe(p).filter((v)=>!v.entregue).map((v)=>v.mes);
/* pagamentos com vinhetas por entregar (de um sócio ou de todos) */
const vinhetasPendentes = (socioId)=> D.pagamentos.filter((p)=>(!socioId || p.socioId === socioId) && vinhetasFalta(p).length)
  .sort((a, b)=>String(a.data).localeCompare(String(b.data)));
const totalVinhetasFalta = (socioId)=> vinhetasPendentes(socioId).reduce((t, p)=>t + vinhetasFalta(p).length, 0);
/* «Mar/2027 a Set/2027» ou «Mar/2027, Mai/2027 e Jun/2027» */
function listaMeses(ms){
  if(!ms.length) return "";
  if(ms.length === 1) return rotVinheta(ms[0]);
  const seguidos = ms.every((m, i)=>!i || m.length === 7 && somaMes(ms[i - 1], 1) === m);
  if(seguidos && ms.length > 2) return rotVinheta(ms[0]) + " a " + rotVinheta(ms[ms.length - 1]);
  return ms.slice(0, -1).map(rotVinheta).join(", ") + " e " + rotVinheta(ms[ms.length - 1]);
}
const nVinhetas = (n)=> n + (n === 1 ? " vinheta" : " vinhetas");
function entregarVinhetas(pagId, meses){
  if(!eTes()) return;
  const p = D.pagamentos.find((x)=>x.id === pagId); if(!p || !meses.length) return;
  const quem = {por: Store.utilizador(), nome: nomeUtilizador || "", em: Date.now()};
  const legado = meses.filter((m)=>m.length === 4), mensais = meses.filter((m)=>m.length === 7);
  const dados = {};
  if(mensais.length){ const ent = {...(p.vinhetasEntregues || {})}; for(const m of mensais) ent[m] = quem; dados.vinhetasEntregues = ent; }
  if(legado.length) dados.vinhetaEntregue = quem;
  gravar([{tipo: "update", col: "pagamentos", id: pagId, dados}]);
  toast(meses.length === 1 ? `Vinheta ${rotVinheta(meses[0])} entregue.` : `${meses.length} vinhetas entregues.`);
}
/* botões dos meses por entregar: cada um marca a sua; «Todas» marca as do pagamento */
function htmlBotoesVinhetas(p){
  const falta = vinhetasFalta(p);
  return `<span class="vin-meses">${falta.map((m)=>eTes() ? `<button class="vin-mes" data-vin-pag="${esc(p.id)}" data-vin-mes="${esc(m)}" title="Marcar como entregue">${esc(rotVinheta(m))}</button>`
      : `<span class="vin-mes so-ver">${esc(rotVinheta(m))}</span>`).join("")}</span>
    ${eTes() && falta.length > 1 ? `<button class="bt peq" data-vin-todas="${esc(p.id)}">Entregar as ${falta.length}</button>` : ""}`;
}
/* liga os botões das vinhetas dentro de um elemento */
function ligarVinhetas(el){
  if(!el) return;
  el.querySelectorAll("[data-vin-mes]").forEach((b)=>b.onclick = (e)=>{
    e.stopPropagation(); entregarVinhetas(b.dataset.vinPag, [b.dataset.vinMes]);
    b.outerHTML = `<span class="vin-mes ok">${esc(b.textContent)} ✓</span>`;
  });
  el.querySelectorAll("[data-vin-todas]").forEach((b)=>b.onclick = (e)=>{
    e.stopPropagation(); const p = D.pagamentos.find((x)=>x.id === b.dataset.vinTodas); if(!p) return;
    entregarVinhetas(p.id, vinhetasFalta(p));
    const caixa = b.parentElement; caixa.querySelectorAll(`[data-vin-pag="${CSS.escape(p.id)}"]`).forEach((x)=>{ x.outerHTML = `<span class="vin-mes ok">${esc(x.textContent)} ✓</span>`; });
    b.remove();
  });
}
const htmlVinhetasPend = (lista)=> lista.map((p)=>{ const n = vinhetasFalta(p).length;
  return `<div class="vinheta-pend"><div>🏷️ <b>${nVinhetas(n)} por entregar</b> <span class="pequeno">(pago em ${dataPT(p.data)}${p.recibo ? ", recibo " + esc(p.recibo.txt) : ""})</span></div>
    <div class="vin-linha">${htmlBotoesVinhetas(p)}</div></div>`; }).join("");

/* ---------- ecrã Quotas ---------- */
let pagAberto = null;      // pagamento aberto na janela (atualiza-se quando recebe o nº de recibo)
let abaQuotas = "divida", anoQuadro = Number(hojeISO().slice(0, 4)), mesPag = "";
$("quotas-abas").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ abaQuotas = b.dataset.aba; RENDER.quotas(); });
RENDER.quotas = function(){
  $("quotas-abas").querySelectorAll("button").forEach((b)=>b.classList.toggle("ativo", b.dataset.aba === abaQuotas));
  document.querySelectorAll("#ecra-quotas .aba").forEach((a)=>a.classList.toggle("ativo", a.id === "aba-q-" + abaQuotas));
  $("q-receber").style.display = eTes() ? "" : "none";
  const nv = totalVinhetasFalta();
  $("q-aba-vinhetas").textContent = "Vinhetas" + (nv ? ` (${nv})` : "");
  ({divida: desenharDivida, quadro: desenharQuadro, pagamentos: desenharPagamentos, vinhetas: desenharVinhetas})[abaQuotas]();
};
$("q-receber").onclick = ()=>abrirReceber(null);

function desenharDivida(){
  const q = norm($("q-pesq").value);
  const linhas = D.socios.map((s)=>({s, ...situacao(s)})).filter((x)=>x.divida > 0)
    .filter((x)=>!q || norm([x.s.numero, x.s.nome].join(" ")).includes(q))
    .sort((a, b)=>b.divida - a.divida || porNumero(a.s, b.s));
  const total = linhas.reduce((t, x)=>t + x.divida, 0);
  $("q-div-tit").textContent = `${linhas.length} ${linhas.length === 1 ? "sócio" : "sócios"} · ${eur(total)}`;
  $("q-div-lista").innerHTML = tabela([{t: "Nº", num: true}, {t: "Nome"}, {t: "Em falta", cl: "so-largo"}, {t: "Valor", num: true}, {t: ""}],
    linhas.map((x)=>`<tr class="clic" data-id="${esc(x.s.id)}"><td class="num">${x.s.numero || "—"}</td><td>${esc(x.s.nome)}${socioAtivo(x.s) ? "" : " " + estadoChip(x.s)}</td>
      <td class="so-largo itens">${esc(resumoFalta(x.falta))}</td><td class="num verm"><b>${eur(x.divida)}</b></td>
      <td>${eTes() ? `<button class="bt peq" data-receber="${esc(x.s.id)}">Receber</button>` : ""}</td></tr>`),
    "Ninguém tem quotas em atraso. 👍");
  $("q-div-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = (e)=>{
    if(e.target.dataset.receber) abrirReceber(e.target.dataset.receber); else abrirSocio(tr.dataset.id);
  });
}
$("q-pesq").addEventListener("input", ()=>desenharDivida());

function desenharQuadro(){
  const Y = anoQuadro, anoHoje = Number(hojeISO().slice(0, 4)), hoje = mesAtual();
  $("q-ano").textContent = Y;
  const est = $("q-quadro-estado").value;
  const q = $("q-quadro-pesq").value;
  const socios = D.socios.filter((s)=>est === "todos" || contaComoSocio(s)).filter((s)=>mesISO(s.dataEntrada) <= Y + "-12")
    .filter((s)=>corresponde(q, s.numero, s.nome)).sort(porNumero);
  const cel = (s, m, ob)=>{
    if(estaPago(s, m)) return `<td class="c ok" title="Pago">✓</td>`;
    if(s.pagoAte && m <= s.pagoAte && m >= mesISO(s.dataEntrada) && !tipoIsento(s.tipo)) return `<td class="c ok antes" title="Pago antes da app">✓</td>`;
    if(!ob) return `<td class="c na">—</td>`;
    return ob.venc <= hoje ? `<td class="c falta" title="Em falta: ${eur(ob.valor)}">✗</td>` : `<td class="c fut" title="Ainda não venceu">·</td>`;
  };
  const linhas = socios.map((s)=>{
    const obs = new Map(obrigacoes(s, Y + "-12").map((o)=>[o.periodo, o]));
    const mens = MESES.map((_, i)=>{ const m = Y + "-" + String(i + 1).padStart(2, "0"); return cel(s, m, obs.get(m)); });
    return `<tr class="clic" data-id="${esc(s.id)}"><td class="num">${s.numero || "—"}</td><td class="nome">${esc(s.nome)}${tipoIsento(s.tipo) ? ` <span class="pequeno">(isento)</span>` : ""}</td>${mens.join("")}</tr>`;
  });
  // recebido por mês (data do pagamento)
  const rec = Array(12).fill(0);
  for(const p of D.pagamentos) if(!p.anulado && String(p.data).startsWith(Y + "-")) rec[Number(p.data.slice(5, 7)) - 1] += p.total;
  const totAno = rec.reduce((a, b)=>a + b, 0);
  const rodape = `<tr class="total"><td></td><td>Recebido no mês · total ${eurCurto(totAno)}</td>${rec.map((v)=>`<td class="c pequeno">${v ? eurCurto(v) : ""}</td>`).join("")}</tr>`;
  $("q-quadro").innerHTML = socios.length ? `<table class="quadro"><thead><tr><th class="num">Nº</th><th>Nome</th>${MESES.map((m)=>`<th class="c">${m}</th>`).join("")}</tr></thead>
    <tbody>${linhas.join("")}${rodape}</tbody></table>` : `<div class="vazio">${q ? "Nenhum sócio corresponde à pesquisa." : "Sem sócios neste ano."}</div>`;
  $("q-quadro").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirSocio(tr.dataset.id));
  $("q-ano-seg").disabled = Y > anoHoje;
}
const eurCurto = (c)=> (c / 100).toLocaleString("pt-PT", {maximumFractionDigits: 0}) + " €";
$("q-ano-ant").onclick = ()=>{ anoQuadro--; desenharQuadro(); };
$("q-ano-seg").onclick = ()=>{ anoQuadro++; desenharQuadro(); };
$("q-quadro-estado").onchange = ()=>desenharQuadro();
$("q-quadro-pesq").addEventListener("input", ()=>desenharQuadro());

function desenharPagamentos(){
  const sel = $("q-pag-mes"), meses = [...new Set(D.pagamentos.map((p)=>mesISO(p.data)).concat(mesAtual()))].sort().reverse();
  const anos = [...new Set(meses.map((m)=>m.slice(0, 4)))];
  if(!mesPag) mesPag = mesAtual();
  sel.innerHTML = `<optgroup label="Mês">${meses.map((m)=>`<option value="${m}">${rotMes(m)}</option>`).join("")}</optgroup>
    <optgroup label="Ano">${anos.map((a)=>`<option value="${a}">Ano ${a}</option>`).join("")}</optgroup><option value="todos">Todos</option>`;
  sel.value = mesPag;
  const q = $("q-pag-pesq").value;
  const pags = pagamentosDoPeriodo(mesPag).filter((p)=>{ const s = Idx.socio.get(p.socioId);
      return corresponde(q, s ? s.nome : p.nomeSocio, s ? s.numero : p.numeroSocio, p.recibo ? p.recibo.txt : ""); })
    .sort((a, b)=>String(b.data).localeCompare(String(a.data)) || (b.criadoEm || 0) - (a.criadoEm || 0));
  const tot = pags.filter((p)=>!p.anulado).reduce((t, p)=>t + p.total, 0);
  $("q-pag-tit").textContent = `${pags.length} ${pags.length === 1 ? "pagamento" : "pagamentos"} · ${eur(tot)}`;
  $("q-pag-lista").innerHTML = tabela([{t: "Data"}, {t: "Recibo"}, {t: "Sócio"}, {t: "Referente a", cl: "so-largo"}, {t: "Forma", cl: "so-largo"}, {t: "Total", num: true}],
    pags.map((p)=>{ const s = Idx.socio.get(p.socioId);
      return `<tr class="clic ${p.anulado ? "anulado" : ""}" data-id="${esc(p.id)}"><td>${dataPT(p.data)}</td><td>${p.recibo ? esc(p.recibo.txt) : `<span class="pequeno verm">a aguardar</span>`}</td>
        <td>${esc(s ? s.nome : p.nomeSocio)} <span class="pequeno">(${s ? numTxt(s) : "nº " + (p.numeroSocio || "—")})</span></td>
        <td class="so-largo itens">${esc(refPag(p))}</td><td class="so-largo">${esc(p.forma)}</td>
        <td class="num">${p.anulado ? "Anulado" : eur(p.total)}</td></tr>`; }),
    q ? "Nenhum pagamento corresponde à pesquisa." : "Sem pagamentos neste período.");
  $("q-pag-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirPagamento(tr.dataset.id));
}
$("q-pag-mes").onchange = ()=>{ mesPag = $("q-pag-mes").value; desenharPagamentos(); };
$("q-pag-pesq").addEventListener("input", ()=>desenharPagamentos());

function desenharVinhetas(){
  const q = $("q-vin-pesq").value;
  const lista = vinhetasPendentes().filter((p)=>{ const s = Idx.socio.get(p.socioId); return corresponde(q, s ? s.nome : p.nomeSocio, s ? s.numero : p.numeroSocio); });
  const total = lista.reduce((t, p)=>t + vinhetasFalta(p).length, 0);
  $("q-vin-tit").textContent = `${nVinhetas(total)} por entregar`;
  $("q-vin-lista").innerHTML = tabela([{t: "Nº", num: true}, {t: "Sócio"}, {t: "Vinhetas por entregar (toque no mês quando a entregar)"}, {t: "Pago em", cl: "so-largo"}, {t: "Recibo", cl: "so-largo"}],
    lista.slice().sort((a, b)=>porNumero(Idx.socio.get(a.socioId) || {}, Idx.socio.get(b.socioId) || {}) || String(a.data).localeCompare(String(b.data))).map((p)=>{ const s = Idx.socio.get(p.socioId);
      return `<tr class="clic" data-id="${esc(p.id)}"><td class="num">${s ? s.numero || "—" : p.numeroSocio || "—"}</td><td>${esc(s ? s.nome : p.nomeSocio)}</td>
        <td class="vin-linha">${htmlBotoesVinhetas(p)}</td><td class="so-largo">${dataPT(p.data)}</td><td class="so-largo">${p.recibo ? esc(p.recibo.txt) : "—"}</td></tr>`; }),
    q ? "Nenhuma vinheta corresponde à pesquisa." : "Não há vinhetas por entregar. 👍");
  ligarVinhetas($("q-vin-lista"));
  $("q-vin-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirPagamento(tr.dataset.id));
}
$("q-vin-pesq").addEventListener("input", ()=>desenharVinhetas());

/* ---------- receber pagamento ---------- */
let R = null;   // {socioId, pode (pode pagar meses), joia (valor da joia por pagar ou 0)}
function abrirReceber(socioId){
  if(!eTes()) return;
  janela("Receber pagamento", `
    <label class="campo">Sócio</label>
    ${htmlEscolherSocio("r-socio", socioId)}
    <div id="r-info"></div>
    <div class="ficha-grid">
      <div><label class="campo">Data do pagamento</label><input type="date" id="r-data" value="${hojeISO()}"></div>
      <div><label class="campo">Nº de meses a pagar</label><input type="number" id="r-meses" min="0" max="${MAX_MESES}" step="1" inputmode="numeric" placeholder="ex.: 12"></div>
      <div><label class="campo">Forma de pagamento</label><select id="r-forma">${listas().formasPagamento.map((f)=>`<option>${esc(f)}</option>`).join("")}</select></div>
      <div><label class="campo">Observações</label><input type="text" id="r-obs"></div>
    </div>
    <div id="r-ref"></div>
    <div id="r-vinheta"></div>
    <div class="pvp" style="margin-top:12px"><span>Total a receber</span><span class="val" id="r-total">0,00 €</span></div>
    <div class="aviso" id="r-erro" style="display:none"></div>`,
  [{texto: "Cancelar", classe: "sec", id: "r-cancelar"}, {texto: "Gravar pagamento", id: "r-gravar", classe: "verde", manter: true, acao: gravarRecebimento}], true);
  ligarEscolherSocio("r-socio", D.socios, (id)=>carregarSocioReceber(id));
  $("r-meses").addEventListener("input", atualizarReceber);
  carregarSocioReceber(socioId);
  if(!socioId) $("r-socio-txt").focus();
}
function carregarSocioReceber(socioId){
  const s = socioId ? Idx.socio.get(socioId) : null;
  R = {socioId: s ? s.id : null, pode: false, joia: 0};
  $("r-erro").style.display = "none";
  let info = "";
  if(s){
    const pend = vinhetasPendentes(s.id);
    if(tipoIsento(s.tipo)) info = `<div class="aviso">O tipo «${esc(s.tipo)}» está isento de quotas.</div>`;
    else if(!s.dataEntrada) info = `<div class="aviso forte">Este sócio não tem data de inscrição. Preencha a ficha para calcular as quotas.
      <div style="margin-top:6px"><button class="bt sec peq" id="r-abrir-ficha">Abrir a ficha</button></div></div>`;
    else{
      R.pode = true;
      const sit = situacao(s), ate = pagoAteAgora(s);
      const ini = mesISO(s.dataEntrada);
      R.joia = (!s.pagoAte || s.pagoAte < ini) && !estaPago(s, "joia") ? valoresAno(Number(ini.slice(0, 4))).joia || 0 : 0;
      info = `<div class="r-estado"><span>Quotas pagas até: <b>${ate ? rotMes(ate) : "ainda nada pago"}</b></span>${sit.divida ? "" : `<span class="chip verde">Quotas em dia</span>`}</div>`
        + (sit.divida ? `<div class="atraso">QUOTAS EM ATRASO: <b>${esc(resumoFalta(sit.falta))}</b> — <b>${eur(sit.divida)}</b></div>` : "")
        + (R.joia ? `<label class="r-joia"><input type="checkbox" id="r-joia" checked style="width:22px;height:22px"> Joia de inscrição <b>${eur(R.joia)}</b></label>` : "");
    }
    info += htmlVinhetasPend(pend);
  }
  $("r-info").innerHTML = info;
  ligarVinhetas($("r-info"));
  if($("r-abrir-ficha")) $("r-abrir-ficha").onclick = ()=>{ fecharJanela(); abrirSocio(s.id); };
  if($("r-joia")) $("r-joia").onchange = atualizarReceber;
  $("r-meses").value = "";       // vem sempre vazio: escreve-se o nº de meses que o sócio paga
  $("r-meses").disabled = !R.pode;
  atualizarReceber();
}
/* lê o formulário e calcula o que vai ser pago */
function calcReceber(){
  const s = R && R.socioId ? Idx.socio.get(R.socioId) : null;
  const txt = $("r-meses").value.trim(), n = txt === "" ? 0 : Number(txt);
  const nOk = Number.isInteger(n) && n >= 0 && n <= MAX_MESES;
  const meses = s && R.pode && nOk ? proximosMeses(s, n) : [];
  const joia = !!($("r-joia") && $("r-joia").checked) ? R.joia : 0;
  const total = meses.reduce((t, m)=>t + valorMes(m), 0) + joia;
  return {s, n, nOk, meses, joia, total};
}
function atualizarReceber(){
  if(!$("r-total")) return;
  const c = calcReceber();
  // meses já marcados como entregues (para não se perderem ao mudar o nº de meses)
  const marcados = new Set([...document.querySelectorAll("#r-vinheta input[data-mes]:checked")].map((x)=>x.dataset.mes));
  $("r-ref").innerHTML = !c.nOk ? `<div class="aviso">O nº de meses tem de ser um número inteiro entre 0 e ${MAX_MESES}.</div>`
    : c.meses.length || c.joia ? `<div class="r-ref">Referente a: <b>${esc([c.joia ? "Joia" : "", refMeses(c.meses)].filter(Boolean).join(" + "))}</b></div>` : "";
  const n = c.meses.length;
  $("r-vinheta").innerHTML = n ? `<div class="vinheta-faixa">🏷️ ENTREGAR ${n === 1 ? "1 VINHETA" : n + " VINHETAS"} — ${esc(listaMeses(c.meses))}
      <div class="pequeno">Marque as vinhetas que entrega agora; as outras ficam por entregar.</div>
      <div class="vin-grelha">${c.meses.map((m)=>`<label><input type="checkbox" data-mes="${m}" ${marcados.has(m) ? "checked" : ""}> ${esc(rotMes(m))}</label>`).join("")}</div>
      ${n > 1 ? `<button class="bt sec peq" id="r-vin-todas" type="button">Marcar todas</button>` : ""}</div>` : "";
  if($("r-vin-todas")) $("r-vin-todas").onclick = ()=>{
    const cx = [...document.querySelectorAll("#r-vinheta input[data-mes]")], todas = cx.every((x)=>x.checked);
    cx.forEach((x)=>{ x.checked = !todas; }); $("r-vin-todas").textContent = todas ? "Marcar todas" : "Desmarcar todas";
  };
  $("r-total").textContent = eur(c.total);
}
function gravarRecebimento(){
  const erro = (t)=>{ $("r-erro").textContent = t; $("r-erro").style.display = "block"; };
  const c = calcReceber(), s = c.s;
  if(!s) return erro("Escolha o sócio.");
  if(tipoIsento(s.tipo)) return erro(`O tipo «${s.tipo}» está isento de quotas.`);
  if(!s.dataEntrada) return erro("Este sócio não tem data de inscrição. Preencha a ficha primeiro.");
  if(!c.nOk) return erro(`O nº de meses tem de ser um número inteiro entre 0 e ${MAX_MESES}.`);
  if(!c.meses.length && !c.joia) return erro("Indique o nº de meses a pagar.");
  if(c.meses.length < c.n) return erro(`Só é possível pagar ${c.meses.length} ${c.meses.length === 1 ? "mês" : "meses"} a este sócio.`);
  const data = $("r-data").value;
  if(!data || data > hojeISO()) return erro("Data inválida (não pode ser no futuro).");
  const itens = (c.joia ? [{tipo: "Joia", periodo: "joia", rot: "Joia", valor: c.joia}] : [])
    .concat(c.meses.map((m)=>({tipo: "Quota", periodo: m, rot: rotMes(m), valor: valorMes(m)})));
  const quem = {por: Store.utilizador(), nome: nomeUtilizador || "", em: Date.now()}, entregues = {};
  document.querySelectorAll("#r-vinheta input[data-mes]:checked").forEach((x)=>{ if(c.meses.includes(x.dataset.mes)) entregues[x.dataset.mes] = quem; });
  const nFalta = c.meses.length - Object.keys(entregues).length;
  const id = "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dados = {socioId: s.id, numeroSocio: s.numero || null, nomeSocio: s.nome, data, forma: $("r-forma").value,
    itens, meses: c.meses.length, total: c.total, obs: $("r-obs").value.trim(), anulado: null,
    vinhetas: c.meses, vinhetasEntregues: entregues,
    recebidoPorNome: nomeUtilizador, recibo: null, ...carimbo(true)};
  fecharJanela();
  // grava; quando chegar ao servidor recebe o nº de recibo (sem internet fica à espera)
  gravar([{tipo: "set", col: "pagamentos", id, dados}]).then(()=>numerarPendentes()).catch(()=>{});
  toast(`Pagamento de ${eur(dados.total)} registado.` + (nFalta ? ` ${nVinhetas(nFalta)} por entregar.` : ""));
  abrirPagamento(id, dados);
}

/* ---------- ver / anular pagamento ---------- */
function abrirPagamento(id, provisorio){
  // logo depois de gravar o pagamento pode ainda não estar na lista: usa os dados acabados de gravar
  const p = D.pagamentos.find((x)=>x.id === id) || (provisorio ? {...provisorio, id} : null); if(!p) return;
  const s = Idx.socio.get(p.socioId);
  pagAberto = {id, assin: JSON.stringify([p.recibo, p.anulado, p.vinhetaEntregue, p.vinhetasEntregues])};
  const recTxt = p.recibo ? `<span class="chip">Recibo nº ${esc(p.recibo.txt)}</span>`
    : `<span class="chip verm">Recibo a aguardar nº</span> <span class="pequeno">(recebe o nº quando houver internet)</span>`;
  const vs = vinhetasDe(p), ent = vs.filter((v)=>v.entregue), falta = vs.filter((v)=>!v.entregue);
  const vin = !vs.length ? "" : `<div class="vinheta-pend"><div>🏷️ <b>${nVinhetas(vs.length)}</b>: ${ent.length ? `${ent.length} entregue${ent.length === 1 ? "" : "s"}` : "nenhuma entregue"}${falta.length ? ` · <b>${falta.length} por entregar</b>` : " ✓"}</div>
      ${ent.length ? `<div class="pequeno">Entregues: ${esc(listaMeses(ent.map((v)=>v.mes)))}</div>` : ""}
      ${falta.length ? `<div class="vin-linha">${htmlBotoesVinhetas(p)}</div>` : ""}</div>`;
  const corpo = `<p>${recTxt}</p>
    <p><b>${esc(s ? s.nome : p.nomeSocio)}</b> (${s ? numTxt(s) : "nº " + (p.numeroSocio || "—")}) · ${dataPT(p.data)} · ${esc(p.forma)}</p>
    ${tabela([{t: "Referente a"}, {t: "Valor", num: true}], linhasPag(p).map(([d, v])=>`<tr><td>${esc(d)}</td><td class="num">${eur(v)}</td></tr>`)
      .concat([`<tr class="total"><td>Total</td><td class="num">${eur(p.total)}</td></tr>`]), "")}
    ${vin}
    ${p.obs ? `<p class="nota">Obs.: ${esc(p.obs)}</p>` : ""}
    <p class="nota">Registado por ${esc(p.recebidoPorNome || p.criadoPor || "—")} em ${dataHoraPT(p.criadoEm)}</p>
    ${p.anulado ? `<div class="aviso">Anulado por ${esc(p.anulado.por)} em ${dataHoraPT(p.anulado.em)}. Motivo: ${esc(p.anulado.motivo)}</div>` : ""}
    ${!p.anulado && eTes() ? `<div id="anular-zona" style="display:none"><label class="campo">Motivo da anulação *</label><input type="text" id="anular-motivo">
      <div class="aviso" id="anular-erro" style="display:none"></div></div>` : ""}`;
  const acoes = [{texto: "Fechar", classe: "sec", id: "pag-fechar", acao: ()=>{ pagAberto = null; }}];
  if(p.recibo){
    if(podePartilharFicheiros()) acoes.push({texto: "Partilhar recibo", classe: "sec", id: "pag-partilhar", manter: true, acao: ()=>reciboPDF(p.id, true)});
    acoes.push({texto: "Recibo PDF", id: "pag-pdf", manter: true, acao: ()=>reciboPDF(p.id, false)});
  }
  if(!p.anulado && eTes()) acoes.unshift({texto: "Anular pagamento", classe: "sec verm-txt", id: "pag-anular", manter: true, acao: ()=>{
    const z = $("anular-zona");
    if(z.style.display === "none"){ z.style.display = "block"; $("pag-anular").textContent = "Confirmar anulação"; $("anular-motivo").focus(); return; }
    const motivo = $("anular-motivo").value.trim();
    if(!motivo){ $("anular-erro").textContent = "Indique o motivo."; $("anular-erro").style.display = "block"; return; }
    fecharJanela(); pagAberto = null;
    gravar([{tipo: "update", col: "pagamentos", id: p.id, dados: {anulado: {por: Store.utilizador(), em: Date.now(), motivo}}}]);
    toast("Pagamento anulado.");
  }});
  janela("Pagamento", corpo, acoes, true);
  ligarVinhetas($("modal-corpo"));
}

/* ---------- zona Quotas dentro da ficha do sócio ---------- */
function htmlQuotasSocio(s){
  if(!s) return `<div class="nota">As quotas aparecem depois de gravar a ficha.</div>`;
  const sit = situacao(s), pags = (Idx.pagSocio.get(s.id) || []).slice(0, 6), ate = pagoAteAgora(s);
  const estado = tipoIsento(s.tipo) ? `<span class="chip">Isento (${esc(s.tipo)})</span>`
    : !s.dataEntrada ? `<span class="chip">Sem data de inscrição</span> <span class="pequeno">as quotas só são calculadas depois de a preencher</span>`
    : (sit.divida ? `<span class="chip verm">Em dívida: ${eur(sit.divida)}</span> <span class="pequeno">${esc(resumoFalta(sit.falta))}</span>`
      : `<span class="chip verde">Quotas em dia</span>`) + ` <span class="pequeno">· pagas até <b>${ate ? rotMes(ate) : "—"}</b></span>`;
  return `<div class="linha quebra" style="justify-content:space-between"><span>${estado}</span>
      ${eTes() ? `<button class="bt sec peq" id="f-receber">Receber pagamento</button>` : ""}</div>
    ${htmlVinhetasPend(vinhetasPendentes(s.id))}
    ${pags.length ? `<div class="rolar" style="margin-top:6px">${tabela([{t: "Data"}, {t: "Referente a"}, {t: "Total", num: true}],
      pags.map((p)=>`<tr class="clic ${p.anulado ? "anulado" : ""}" data-pag="${esc(p.id)}"><td>${dataPT(p.data)}${p.recibo ? `<div class="pequeno">${esc(p.recibo.txt)}</div>` : ""}</td><td class="itens">${esc(refPag(p))}</td>
        <td class="num">${p.anulado ? "Anulado" : eur(p.total)}</td></tr>`), "")}</div>` : `<div class="nota">Ainda sem pagamentos registados.</div>`}`;
}

/* pagamentos de um período: "AAAA-MM", "AAAA" ou "todos" */
function pagamentosDoPeriodo(per){
  return D.pagamentos.filter((p)=>per === "todos" || (per.length === 4 ? String(p.data).startsWith(per + "-") : mesISO(p.data) === per));
}
/* se a janela do pagamento está aberta e o recibo mudou (recebeu nº, foi anulado ou a vinheta foi entregue), volta a desenhá-la */
function atualizarJanelaPagamento(){
  if(!pagAberto || !$("modal").classList.contains("aberto") || !$("pag-fechar")) return;
  const p = D.pagamentos.find((x)=>x.id === pagAberto.id);
  if(p && JSON.stringify([p.recibo, p.anulado, p.vinhetaEntregue, p.vinhetasEntregues]) !== pagAberto.assin && !($("anular-zona") && $("anular-zona").style.display === "block")) abrirPagamento(p.id);
}
