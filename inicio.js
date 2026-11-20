"use strict";
/* =====================================================================
   INÍCIO — resumo dos sócios
   ===================================================================== */
RENDER.inicio = function(){
  const ano = hojeISO().slice(0, 4), mesNum = hojeISO().slice(5, 7);
  const ativos = D.socios.filter(contaComoSocio);     // ativos + suspensos pela Direção
  $("ini-ativos").textContent = ativos.length;
  $("ini-total").textContent = D.socios.length;
  $("ini-rot-novos").textContent = "Entradas em " + ano;
  $("ini-rot-saidas").textContent = "Inativos";
  $("ini-novos").textContent = D.socios.filter((s)=>String(s.dataEntrada || "").startsWith(ano)).length;
  $("ini-saidas").textContent = D.socios.length - ativos.length;

  // quotas
  const mes = mesAtual();
  const valid = D.pagamentos.filter((p)=>!p.anulado);
  $("ini-rec-mes").textContent = eur(valid.filter((p)=>mesISO(p.data) === mes).reduce((t, p)=>t + p.total, 0));
  $("ini-rot-rec-ano").textContent = "Recebido em " + ano;
  $("ini-rec-ano").textContent = eur(valid.filter((p)=>String(p.data).startsWith(ano)).reduce((t, p)=>t + p.total, 0));
  const devedores = D.socios.map(situacao).filter((x)=>x.divida > 0);
  $("ini-divida").textContent = eur(devedores.reduce((t, x)=>t + x.divida, 0));
  $("ini-ndiv").textContent = devedores.length;

  const contar = (campo, ordem)=>{
    const m = new Map(); for(const s of ativos){ const k = s[campo] || "—"; m.set(k, (m.get(k) || 0) + 1); }
    const chaves = [...m.keys()].sort((a, b)=>{ const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || porTexto(a, b); });
    return tabela([{t: ""}, {t: "Sócios", num: true}], chaves.map((k)=>`<tr><td>${esc(k)}</td><td class="num">${m.get(k)}</td></tr>`), "Sem sócios ativos.");
  };
  $("ini-tipos").innerHTML = contar("tipo", listas().tiposSocio);
  // vinhetas por entregar, por sócio
  const porSocio = new Map();
  for(const p of vinhetasPendentes()) porSocio.set(p.socioId, (porSocio.get(p.socioId) || 0) + vinhetasFalta(p).length);
  const vin = [...porSocio.entries()].map(([id, n])=>({s: Idx.socio.get(id), n})).filter((x)=>x.s).sort((a, b)=>porNumero(a.s, b.s));
  $("ini-vin").innerHTML = tabela([{t: "Sócio"}, {t: "Vinhetas", num: true}],
    vin.slice(0, 8).map((x)=>`<tr><td>${esc(x.s.nome)} <span class="pequeno">(${numTxt(x.s)})</span></td><td class="num"><b>${x.n}</b></td></tr>`)
    .concat(vin.length > 8 ? [`<tr><td colspan="2" class="pequeno">… e mais ${vin.length - 8} sócio(s)</td></tr>`] : []),
    "Nenhuma vinheta por entregar.");

  // aniversariantes de hoje (quem nasceu a 29/fev festeja a 28/fev nos anos que não são bissextos)
  const hoje = hojeISO(), mdHoje = hoje.slice(5, 10), ehBissexto = (y)=> y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const fazAnosHoje = (s)=>{ const md = String(s.dataNascimento || "").slice(5, 10);
    return md === mdHoje || (md === "02-29" && mdHoje === "02-28" && !ehBissexto(Number(hoje.slice(0, 4)))); };
  const hojeAniv = ativos.filter(fazAnosHoje).sort(porNumero);
  $("ini-hoje-tit").textContent = hojeAniv.length ? `🎂 ANIVERSARIANTES DE HOJE (${hojeAniv.length})` : "🎂 ANIVERSARIANTES DE HOJE";
  $("ini-hoje").innerHTML = tabela([{t: "Nº", num: true}, {t: "Sócio"}, {t: "Faz", num: true}],
    hojeAniv.map((s)=>`<tr class="clic" data-id="${esc(s.id)}"><td class="num">${s.numero || "—"}</td><td><b>${esc(s.nome)}</b></td>
      <td class="num">${Number(hoje.slice(0, 4)) - Number(s.dataNascimento.slice(0, 4))} anos</td></tr>`),
    "Nenhum sócio faz anos hoje.");
  $("ini-hoje").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirSocio(tr.dataset.id));

  const aniv = ativos.filter((s)=>String(s.dataNascimento || "").slice(5, 7) === mesNum)
    .sort((a, b)=>a.dataNascimento.slice(8, 10) - b.dataNascimento.slice(8, 10));
  $("ini-aniv").innerHTML = tabela([{t: "Dia"}, {t: "Sócio"}, {t: "Idade", num: true}],
    aniv.map((s)=>{ const idade = Number(ano) - Number(s.dataNascimento.slice(0, 4));
      return `<tr class="clic" data-id="${esc(s.id)}"><td>${s.dataNascimento.slice(8, 10)}</td><td>${esc(s.nome)}</td><td class="num">${idade}</td></tr>`; }),
    "Nenhum aniversário este mês.");
  $("ini-aniv").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirSocio(tr.dataset.id));
};
$("ini-div-cartao").onclick = $("ini-ndiv-cartao").onclick = ()=>{ abaQuotas = "divida"; mostrar("quotas"); };
$("ini-vin-cartao").onclick = ()=>{ abaQuotas = "vinhetas"; mostrar("quotas"); };
