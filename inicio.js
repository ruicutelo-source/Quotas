"use strict";
/* =====================================================================
   INÍCIO — resumo dos sócios
   ===================================================================== */
RENDER.inicio = function(){
  const ano = hojeISO().slice(0, 4), mesNum = hojeISO().slice(5, 7);
  const ativos = D.socios.filter(socioAtivo);
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
  $("ini-period").innerHTML = contar("periodicidade", ["Mensal", "Anual"]);

  const aniv = ativos.filter((s)=>String(s.dataNascimento || "").slice(5, 7) === mesNum)
    .sort((a, b)=>a.dataNascimento.slice(8, 10) - b.dataNascimento.slice(8, 10));
  $("ini-aniv").innerHTML = tabela([{t: "Dia"}, {t: "Sócio"}, {t: "Idade", num: true}],
    aniv.map((s)=>{ const idade = Number(ano) - Number(s.dataNascimento.slice(0, 4));
      return `<tr class="clic" data-id="${esc(s.id)}"><td>${s.dataNascimento.slice(8, 10)}</td><td>${esc(s.nome)}</td><td class="num">${idade}</td></tr>`; }),
    "Nenhum aniversário este mês.");
  $("ini-aniv").querySelectorAll("tr.clic").forEach((tr)=>tr.onclick = ()=>abrirSocio(tr.dataset.id));
};
$("ini-div-cartao").onclick = $("ini-ndiv-cartao").onclick = ()=>{ abaQuotas = "divida"; mostrar("quotas"); };
