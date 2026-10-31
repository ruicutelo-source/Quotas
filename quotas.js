"use strict";
/* =====================================================================
   QUOTAS — cálculo do que cada sócio deve, receber pagamentos,
            quadro do ano e lista de pagamentos
   Só se guardam os PAGAMENTOS; o que está em dívida é calculado.
   ===================================================================== */
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const mesISO = (iso)=> String(iso || "").slice(0, 7);
const mesAtual = ()=> hojeISO().slice(0, 7);
function somaMes(m, n){ let [y, mm] = m.split("-").map(Number); mm += n;
  while(mm > 12){ mm -= 12; y++; } while(mm < 1){ mm += 12; y--; } return y + "-" + String(mm).padStart(2, "0"); }
const rotMes = (m)=> MESES[Number(m.slice(5, 7)) - 1] + "/" + m.slice(0, 4);
const mesPT = (m)=> m ? m.slice(5, 7) + "/" + m.slice(0, 4) : "";

/* valores de um ano (se o ano não tiver valores, usa o último ano anterior que tenha) */
function valoresAno(ano){
  const c = clube(), v = c.valores || {};
  const anos = Object.keys(v).map(Number).sort((a, b)=>a - b);
  let k = anos.filter((a)=>a <= ano).pop(); if(k == null) k = anos[0];
  if(k != null) return {joia: 0, mensal: 0, anual: 0, ...v[k]};
  return {joia: c.joia || 0, mensal: c.quotaMensal || 0, anual: c.quotaAnual || 0};
}
const tipoIsento = (t)=> listas().tiposIsentos.includes(t);
/* periodicidade num ano (uma mudança só conta a partir de janeiro do ano seguinte) */
function perAno(s, ano){
  const h = (s.perHist || []).filter((x)=>x.ano <= ano).sort((a, b)=>a.ano - b.ano);
  return h.length ? h[h.length - 1].per : (s.periodicidade || "Anual");
}
/* o sócio estava inativo nesse mês? */
function inativoEm(s, m){
  const r = s.inatividade || [];
  if(r.some((x)=>x.de <= m && (!x.ate || m <= x.ate))) return true;
  if(s.ativo === false && !r.some((x)=>!x.ate)) return m > mesAtual();
  return false;
}

/* tudo o que o sócio devia pagar até ao mês «ate» (inclusive): [{tipo, periodo, valor, venc, rot}] */
function obrigacoes(s, ate){
  const out = [];
  if(!s.dataEntrada || tipoIsento(s.tipo)) return out;
  const ini = mesISO(s.dataEntrada), pagoAte = s.pagoAte || "", anoIni = Number(ini.slice(0, 4));
  // joia: só para quem se inscreveu depois do «quotas pagas até» (sócio novo)
  if((!pagoAte || pagoAte < ini) && ini <= ate) out.push({tipo: "Joia", periodo: "joia", valor: valoresAno(anoIni).joia, venc: ini, rot: "Joia"});
  for(let ano = anoIni; ano <= Number(ate.slice(0, 4)); ano++){
    const v = valoresAno(ano), primeiro = ano === anoIni ? ini : ano + "-01";
    if(perAno(s, ano) === "Mensal"){
      for(let m = primeiro; m <= ate && m <= ano + "-12"; m = somaMes(m, 1)){
        if(pagoAte && m <= pagoAte) continue;
        if(inativoEm(s, m)) continue;
        out.push({tipo: "Quota", periodo: m, valor: v.mensal, venc: m, rot: rotMes(m)});
      }
    }else{
      let desde = primeiro;
      if(pagoAte && pagoAte >= desde) desde = somaMes(pagoAte, 1);
      if(desde > ano + "-12" || desde > ate || inativoEm(s, desde)) continue;
      // ano completo = quota anual; ano começado a meio = meses que faltam × quota mensal
      const meses = 13 - Number(desde.slice(5, 7));
      out.push({tipo: "Quota", periodo: String(ano), valor: meses === 12 ? v.anual : meses * v.mensal, venc: desde,
                rot: "Ano " + ano + (meses < 12 ? ` (${meses} ${meses === 1 ? "mês" : "meses"})` : "")});
    }
  }
  return out.filter((o)=>o.valor > 0);
}
const estaPago = (s, periodo)=> !!(Idx.pagos.get(s.id) && Idx.pagos.get(s.id).has(periodo));
/* situação a hoje: o que está vencido e não pago */
function situacao(s){
  const falta = obrigacoes(s, mesAtual()).filter((o)=>!estaPago(s, o.periodo));
  return {falta, divida: falta.reduce((t, o)=>t + o.valor, 0)};
}
const resumoFalta = (falta)=> falta.length > 4 ? falta.slice(0, 2).map((o)=>o.rot).join(", ") + ` … +${falta.length - 2}` : falta.map((o)=>o.rot).join(", ");

/* ---------- ecrã Quotas ---------- */
let abaQuotas = "divida", anoQuadro = Number(hojeISO().slice(0, 4)), mesPag = "";
$("quotas-abas").querySelectorAll("button").forEach((b)=>b.onclick = ()=>{ abaQuotas = b.dataset.aba; RENDER.quotas(); });
RENDER.quotas = function(){
  $("quotas-abas").querySelectorAll("button").forEach((b)=>b.classList.toggle("ativo", b.dataset.aba === abaQuotas));
  document.querySelectorAll("#ecra-quotas .aba").forEach((a)=>a.classList.toggle("ativo", a.id === "aba-q-" + abaQuotas));
  $("q-receber").style.display = eTes() ? "" : "none";
  ({divida: desenharDivida, quadro: desenharQuadro, pagamentos: desenharPagamentos})[abaQuotas]();
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
    linhas.map((x)=>`<tr class="clic" data-id="${esc(x.s.id)}"><td class="num">${x.s.numero || "—"}</td><td>${esc(x.s.nome)}${socioAtivo(x.s) ? "" : ` <span class="chip verm">Inativo</span>`}</td>
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
  const socios = D.socios.filter((s)=>est === "todos" || socioAtivo(s)).filter((s)=>mesISO(s.dataEntrada) <= Y + "-12").sort(porNumero);
  const cel = (s, periodo, ob)=>{
    if(estaPago(s, periodo)) return `<td class="c ok" title="Pago">✓</td>`;
    if(!ob) return `<td class="c na">—</td>`;
    return ob.venc <= hoje ? `<td class="c falta" title="Em falta: ${eur(ob.valor)}">✗</td>` : `<td class="c fut" title="Ainda não venceu">·</td>`;
  };
  const linhas = socios.map((s)=>{
    const obs = new Map(obrigacoes(s, Y + "-12").map((o)=>[o.periodo, o]));
    const mens = MESES.map((_, i)=>cel(s, Y + "-" + String(i + 1).padStart(2, "0"), obs.get(Y + "-" + String(i + 1).padStart(2, "0"))));
    return `<tr class="clic" data-id="${esc(s.id)}"><td class="num">${s.numero || "—"}</td><td class="nome">${esc(s.nome)}</td>
      <td class="pequeno">${tipoIsento(s.tipo) ? "Isento" : perAno(s, Y)}</td>${mens.join("")}${cel(s, String(Y), obs.get(String(Y)))}</tr>`;
  });
  // recebido por mês (data do pagamento)
  const rec = Array(12).fill(0);
  for(const p of D.pagamentos) if(!p.anulado && String(p.data).startsWith(Y + "-")) rec[Number(p.data.slice(5, 7)) - 1] += p.total;
  const totAno = rec.reduce((a, b)=>a + b, 0);
  const rodape = `<tr class="total"><td></td><td>Recebido</td><td></td>${rec.map((v)=>`<td class="c pequeno">${v ? eurCurto(v) : ""}</td>`).join("")}<td class="c pequeno"><b>${eurCurto(totAno)}</b></td></tr>`;
  $("q-quadro").innerHTML = socios.length ? `<table class="quadro"><thead><tr><th class="num">Nº</th><th>Nome</th><th>Quota</th>${MESES.map((m)=>`<th class="c">${m}</th>`).join("")}<th class="c">Anual</th></tr></thead>
    <tbody>${linhas.join("")}${rodape}</tbody></table>` : `<div class="vazio">Sem sócios neste ano.</div>`;
  $("q-quadro").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirSocio(tr.dataset.id));
  $("q-ano-seg").disabled = Y > anoHoje;
}
const eurCurto = (c)=> (c / 100).toLocaleString("pt-PT", {maximumFractionDigits: 0}) + " €";
$("q-ano-ant").onclick = ()=>{ anoQuadro--; desenharQuadro(); };
$("q-ano-seg").onclick = ()=>{ anoQuadro++; desenharQuadro(); };
$("q-quadro-estado").onchange = ()=>desenharQuadro();

function desenharPagamentos(){
  const sel = $("q-pag-mes"), meses = [...new Set(D.pagamentos.map((p)=>mesISO(p.data)))].concat(mesAtual());
  const lista = [...new Set(meses)].sort().reverse();
  if(!mesPag) mesPag = mesAtual();
  sel.innerHTML = lista.map((m)=>`<option value="${m}">${rotMes(m)}</option>`).join("") + `<option value="todos">Todos</option>`;
  sel.value = mesPag;
  const pags = D.pagamentos.filter((p)=>mesPag === "todos" || mesISO(p.data) === mesPag)
    .sort((a, b)=>String(b.data).localeCompare(String(a.data)) || (b.criadoEm || 0) - (a.criadoEm || 0));
  const tot = pags.filter((p)=>!p.anulado).reduce((t, p)=>t + p.total, 0);
  $("q-pag-tit").textContent = `${pags.length} ${pags.length === 1 ? "pagamento" : "pagamentos"} · ${eur(tot)}`;
  $("q-pag-lista").innerHTML = tabela([{t: "Data"}, {t: "Sócio"}, {t: "Referente a", cl: "so-largo"}, {t: "Forma", cl: "so-largo"}, {t: "Total", num: true}],
    pags.map((p)=>{ const s = Idx.socio.get(p.socioId);
      return `<tr class="clic ${p.anulado ? "anulado" : ""}" data-id="${esc(p.id)}"><td>${dataPT(p.data)}</td>
        <td>${esc(s ? s.nome : p.nomeSocio)} <span class="pequeno">(${s ? numTxt(s) : "nº " + (p.numeroSocio || "—")})</span></td>
        <td class="so-largo itens">${esc((p.itens || []).map((i)=>i.rot).join(", "))}</td><td class="so-largo">${esc(p.forma)}</td>
        <td class="num">${p.anulado ? "Anulado" : eur(p.total)}</td></tr>`; }),
    "Sem pagamentos neste período.");
  $("q-pag-lista").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirPagamento(tr.dataset.id));
}
$("q-pag-mes").onchange = ()=>{ mesPag = $("q-pag-mes").value; desenharPagamentos(); };

/* ---------- receber pagamento ---------- */
let R = null;   // {socioId, itens:[{...ob, marcado}]}
function abrirReceber(socioId){
  if(!eTes()) return;
  const socios = D.socios.slice().sort(porNumero);
  janela("Receber pagamento", `
    <label class="campo">Sócio</label>
    <select id="r-socio"><option value="">— escolher sócio —</option>${socios.map((s)=>`<option value="${esc(s.id)}" ${s.id === socioId ? "selected" : ""}>${s.numero ? s.numero + " · " : ""}${esc(s.nome)}${socioAtivo(s) ? "" : " (inativo)"}</option>`).join("")}</select>
    <div id="r-itens"></div>
    <div class="ficha-grid">
      <div><label class="campo">Data</label><input type="date" id="r-data" value="${hojeISO()}"></div>
      <div><label class="campo">Forma de pagamento</label><select id="r-forma">${listas().formasPagamento.map((f)=>`<option>${esc(f)}</option>`).join("")}</select></div>
      <div><label class="campo">Desconto (€)</label><input type="text" id="r-desc" inputmode="decimal" placeholder="0,00"></div>
      <div><label class="campo">Observações</label><input type="text" id="r-obs"></div>
    </div>
    <div class="pvp" style="margin-top:12px"><span>Total a receber</span><span class="val" id="r-total">0,00 €</span></div>
    <div class="aviso" id="r-erro" style="display:none"></div>`,
  [{texto: "Cancelar", classe: "sec", id: "r-cancelar"}, {texto: "Gravar pagamento", id: "r-gravar", classe: "verde", manter: true, acao: gravarRecebimento}], true);
  $("r-socio").onchange = ()=>carregarItens($("r-socio").value);
  $("r-desc").addEventListener("input", totalReceber);
  carregarItens(socioId);
}
function carregarItens(socioId){
  const s = socioId ? Idx.socio.get(socioId) : null;
  R = {socioId: s ? s.id : null, itens: []};
  if(!s){ $("r-itens").innerHTML = ""; totalReceber(); return; }
  const hoje = mesAtual();
  // o que está vencido (marcado) e o que se pode adiantar (até 12 meses / ano seguinte)
  const obs = obrigacoes(s, somaMes(hoje, 12)).filter((o)=>!estaPago(s, o.periodo));
  R.itens = obs.map((o)=>({...o, marcado: o.venc <= hoje}));
  const grupo = (tit, lista)=> lista.length ? `<div class="secao">${tit}</div><div class="lista-itens">${lista.map((o)=>{ const i = R.itens.indexOf(o);
    return `<div class="item"><label style="display:flex;gap:10px;align-items:center;flex:1;cursor:pointer"><input type="checkbox" data-i="${i}" ${o.marcado ? "checked" : ""} style="width:22px;height:22px">
      <span>${esc(o.rot)}</span></label><span class="num">${eur(o.valor)}</span></div>`; }).join("")}</div>` : "";
  const venc = R.itens.filter((o)=>o.venc <= hoje), fut = R.itens.filter((o)=>o.venc > hoje);
  const info = tipoIsento(s.tipo) ? `<div class="aviso">O tipo «${esc(s.tipo)}» está isento de quotas.</div>`
    : !R.itens.length ? `<div class="aviso">Este sócio não tem nada por pagar.</div>` : "";
  $("r-itens").innerHTML = info + grupo("Em atraso", venc) + grupo("Adiantar", fut);
  $("r-itens").querySelectorAll("input[type=checkbox]").forEach((c)=>c.onchange = ()=>{ R.itens[Number(c.dataset.i)].marcado = c.checked; totalReceber(); });
  totalReceber();
}
function totalReceber(){
  if(!$("r-total")) return;
  const sub = R ? R.itens.filter((o)=>o.marcado).reduce((t, o)=>t + o.valor, 0) : 0;
  const d = centimosDe($("r-desc").value);
  $("r-total").textContent = eur(Math.max(0, sub - (d || 0)));
}
function gravarRecebimento(){
  const erro = (t)=>{ $("r-erro").textContent = t; $("r-erro").style.display = "block"; };
  const s = R && R.socioId ? Idx.socio.get(R.socioId) : null;
  if(!s) return erro("Escolha o sócio.");
  const itens = R.itens.filter((o)=>o.marcado);
  if(!itens.length) return erro("Marque pelo menos uma quota ou a joia.");
  const desconto = centimosDe($("r-desc").value);
  const subtotal = itens.reduce((t, o)=>t + o.valor, 0);
  if(desconto === null || desconto > subtotal) return erro("Desconto inválido.");
  const data = $("r-data").value;
  if(!data || data > hojeISO()) return erro("Data inválida (não pode ser no futuro).");
  const id = "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dados = {socioId: s.id, numeroSocio: s.numero || null, nomeSocio: s.nome, data, forma: $("r-forma").value,
    itens: itens.map((o)=>({tipo: o.tipo, periodo: o.periodo, rot: o.rot, valor: o.valor})),
    subtotal, desconto, total: subtotal - desconto, obs: $("r-obs").value.trim(), anulado: null, ...carimbo(true)};
  fecharJanela();
  gravar([{tipo: "set", col: "pagamentos", id, dados}]);
  toast(`Pagamento de ${eur(dados.total)} registado.`);
}

/* ---------- ver / anular pagamento ---------- */
function abrirPagamento(id){
  const p = D.pagamentos.find((x)=>x.id === id); if(!p) return;
  const s = Idx.socio.get(p.socioId);
  const corpo = `<p><b>${esc(s ? s.nome : p.nomeSocio)}</b> (${s ? numTxt(s) : "nº " + (p.numeroSocio || "—")}) · ${dataPT(p.data)} · ${esc(p.forma)}</p>
    ${tabela([{t: "Referente a"}, {t: "Valor", num: true}], (p.itens || []).map((i)=>`<tr><td>${esc(i.rot)}</td><td class="num">${eur(i.valor)}</td></tr>`)
      .concat(p.desconto ? [`<tr><td>Desconto</td><td class="num">−${eur(p.desconto)}</td></tr>`] : [])
      .concat([`<tr class="total"><td>Total</td><td class="num">${eur(p.total)}</td></tr>`]), "")}
    ${p.obs ? `<p class="nota">Obs.: ${esc(p.obs)}</p>` : ""}
    <p class="nota">Registado por ${esc(p.criadoPor || "—")} em ${dataHoraPT(p.criadoEm)}</p>
    ${p.anulado ? `<div class="aviso">Anulado por ${esc(p.anulado.por)} em ${dataHoraPT(p.anulado.em)}. Motivo: ${esc(p.anulado.motivo)}</div>` : ""}
    ${!p.anulado && eTes() ? `<div id="anular-zona" style="display:none"><label class="campo">Motivo da anulação *</label><input type="text" id="anular-motivo">
      <div class="aviso" id="anular-erro" style="display:none"></div></div>` : ""}`;
  const acoes = [{texto: "Fechar", classe: "sec", id: "pag-fechar"}];
  if(!p.anulado && eTes()) acoes.unshift({texto: "Anular pagamento", classe: "sec verm-txt", id: "pag-anular", manter: true, acao: ()=>{
    const z = $("anular-zona");
    if(z.style.display === "none"){ z.style.display = "block"; $("pag-anular").textContent = "Confirmar anulação"; $("anular-motivo").focus(); return; }
    const motivo = $("anular-motivo").value.trim();
    if(!motivo){ $("anular-erro").textContent = "Indique o motivo."; $("anular-erro").style.display = "block"; return; }
    fecharJanela();
    gravar([{tipo: "update", col: "pagamentos", id: p.id, dados: {anulado: {por: Store.utilizador(), em: Date.now(), motivo}}}]);
    toast("Pagamento anulado.");
  }});
  janela("Pagamento", corpo, acoes, true);
}

/* ---------- zona Quotas dentro da ficha do sócio ---------- */
function htmlQuotasSocio(s){
  if(!s) return `<div class="nota">As quotas aparecem depois de gravar a ficha.</div>`;
  const sit = situacao(s), pags = (Idx.pagSocio.get(s.id) || []).slice(0, 6);
  const estado = tipoIsento(s.tipo) ? `<span class="chip">Isento (${esc(s.tipo)})</span>`
    : sit.divida ? `<span class="chip verm">Em dívida: ${eur(sit.divida)}</span> <span class="pequeno">${esc(resumoFalta(sit.falta))}</span>`
    : `<span class="chip verde">Quotas em dia</span>`;
  return `<div class="linha quebra" style="justify-content:space-between">${estado}
      ${eTes() ? `<button class="bt sec peq" id="f-receber">Receber pagamento</button>` : ""}</div>
    ${pags.length ? `<div class="rolar" style="margin-top:6px">${tabela([{t: "Data"}, {t: "Referente a"}, {t: "Total", num: true}],
      pags.map((p)=>`<tr class="${p.anulado ? "anulado" : ""}"><td>${dataPT(p.data)}</td><td class="itens">${esc((p.itens || []).map((i)=>i.rot).join(", "))}</td>
        <td class="num">${p.anulado ? "Anulado" : eur(p.total)}</td></tr>`), "")}</div>` : `<div class="nota">Ainda sem pagamentos registados.</div>`}`;
}
