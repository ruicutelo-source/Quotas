"use strict";
/* =====================================================================
   MAPAS PARA IMPRIMIR (ou guardar em PDF pela janela de impressão)
   ===================================================================== */
function imprimir(titulo, subtitulo, corpo, paisagem){
  const c = clube();
  $("impressao").innerHTML = `<div class="mapa">
    <div class="m-cab">${c.logo ? `<img src="${esc(c.logo)}" alt="">` : ""}
      <div class="m-cab-txt"><div class="m-clube">${esc(c.nome || "")}</div><div class="m-tit">${esc(titulo)}</div>
        ${subtitulo ? `<div class="m-sub">${esc(subtitulo)}</div>` : ""}</div>
      <div class="m-data">Emitido em ${dataHoraPT(Date.now())}<br>por ${esc(nomeUtilizador || Store.utilizador() || "")}</div></div>
    ${corpo}</div>`;
  $("estilo-pagina").textContent = `@page{size:A4 ${paisagem ? "landscape" : "portrait"};margin:11mm}`;
  document.body.classList.add("a-imprimir");
  const fim = ()=>{ document.body.classList.remove("a-imprimir"); window.removeEventListener("afterprint", fim); };
  window.addEventListener("afterprint", fim);
  setTimeout(()=>window.print(), 80);     // dá tempo a desenhar o logótipo
}
const tabMapa = (cab, linhas, rodape)=> `<table class="m-tab"><thead><tr>${cab.map((c)=>`<th class="${c.num ? "num" : ""} ${c.c ? "c" : ""}">${c.t}</th>`).join("")}</tr></thead>
  <tbody>${linhas.join("") || `<tr><td colspan="${cab.length}" class="c">Sem registos.</td></tr>`}${rodape || ""}</tbody></table>`;

/* 1. Lista de sócios (com os filtros do ecrã Sócios) */
function mapaSocios(){
  const lista = sociosFiltrados(), est = {ativos: "Sócios ativos", inativos: "Sócios inativos", todos: "Todos os sócios"}[filtroSoc.estado];
  const filtros = [est, $("soc-tipo").value, $("soc-period").value, $("soc-pesq").value ? `pesquisa «${$("soc-pesq").value}»` : ""].filter(Boolean).join(" · ");
  imprimir("Lista de sócios", `${filtros} · ${lista.length} ${lista.length === 1 ? "sócio" : "sócios"}`, tabMapa(
    [{t: "Nº", num: true}, {t: "Nome"}, {t: "Tipo"}, {t: "Quota"}, {t: "Inscrição"}, {t: "Telemóvel"}, {t: "Email"}, {t: "Localidade"}, {t: "Estado"}],
    lista.map((s)=>`<tr><td class="num">${s.numero || "—"}</td><td><b>${esc(s.nome)}</b></td><td>${esc(s.tipo)}</td><td>${esc(s.periodicidade)}</td>
      <td>${dataPT(s.dataEntrada)}</td><td>${esc(s.telemovel)}</td><td>${esc(s.email)}</td><td>${esc(s.localidade)}</td><td>${socioAtivo(s) ? "Ativo" : "Inativo"}</td></tr>`)), true);
}

/* 2. Quadro de quotas do ano (igual ao do ecrã) */
function mapaQuadro(){
  desenharQuadro();
  const est = $("q-quadro-estado").value === "todos" ? "todos os sócios" : "só ativos";
  imprimir(`Quadro de quotas ${anoQuadro}`, `${est} · ✓ pago · ✗ em falta · · ainda não venceu · — não se aplica`,
    `<div class="m-quadro">${$("q-quadro").innerHTML}</div>`, true);
}

/* 3. Devedores */
function mapaDevedores(){
  const linhas = D.socios.map((s)=>({s, ...situacao(s)})).filter((x)=>x.divida > 0).sort((a, b)=>porNumero(a.s, b.s));
  const total = linhas.reduce((t, x)=>t + x.divida, 0);
  imprimir("Quotas em atraso", `Situação a ${dataPT(hojeISO())} · ${linhas.length} ${linhas.length === 1 ? "sócio" : "sócios"}`, tabMapa(
    [{t: "Nº", num: true}, {t: "Nome"}, {t: "Telemóvel"}, {t: "Em falta"}, {t: "Valor", num: true}],
    linhas.map((x)=>`<tr><td class="num">${x.s.numero || "—"}</td><td><b>${esc(x.s.nome)}</b>${socioAtivo(x.s) ? "" : " <i>(inativo)</i>"}</td><td>${esc(x.s.telemovel)}</td>
      <td class="m-peq">${esc(x.falta.map((o)=>o.rot).join(", "))}</td><td class="num">${eur(x.divida)}</td></tr>`),
    `<tr class="m-total"><td></td><td colspan="3">Total em dívida</td><td class="num">${eur(total)}</td></tr>`));
}

/* 4. Recebimentos de um período (o escolhido no separador Pagamentos) */
function mapaRecebimentos(){
  const per = mesPag || mesAtual();
  const nomePer = per === "todos" ? "Todos os pagamentos" : per.length === 4 ? "Ano " + per : rotMes(per);
  const pags = pagamentosDoPeriodo(per).sort((a, b)=>String(a.data).localeCompare(String(b.data)) || (a.recibo ? a.recibo.num : 1e9) - (b.recibo ? b.recibo.num : 1e9));
  const validos = pags.filter((p)=>!p.anulado), total = validos.reduce((t, p)=>t + p.total, 0);
  const porForma = new Map(); for(const p of validos) porForma.set(p.forma, (porForma.get(p.forma) || 0) + p.total);
  const resumo = tabMapa([{t: "Forma de pagamento"}, {t: "Pagamentos", num: true}, {t: "Valor", num: true}],
    [...porForma.entries()].sort((a, b)=>b[1] - a[1]).map(([f, v])=>`<tr><td>${esc(f)}</td><td class="num">${validos.filter((p)=>p.forma === f).length}</td><td class="num">${eur(v)}</td></tr>`),
    `<tr class="m-total"><td>Total recebido</td><td class="num">${validos.length}</td><td class="num">${eur(total)}</td></tr>`);
  const anul = pags.length - validos.length;
  imprimir("Recebimentos", `${nomePer} · ${validos.length} ${validos.length === 1 ? "pagamento" : "pagamentos"}${anul ? ` · ${anul} anulado(s)` : ""}`,
    `<div class="m-resumo">${resumo}</div>` + tabMapa(
    [{t: "Data"}, {t: "Recibo"}, {t: "Sócio"}, {t: "Referente a"}, {t: "Forma"}, {t: "Total", num: true}],
    pags.map((p)=>`<tr class="${p.anulado ? "m-anulado" : ""}"><td>${dataPT(p.data)}</td><td>${p.recibo ? esc(p.recibo.txt) : "—"}</td>
      <td>${esc(p.nomeSocio)} (nº ${p.numeroSocio || "—"})</td><td class="m-peq">${esc((p.itens || []).map((i)=>i.rot).join(", "))}</td>
      <td>${esc(p.forma)}</td><td class="num">${p.anulado ? "Anulado" : eur(p.total)}</td></tr>`),
    `<tr class="m-total"><td colspan="5">Total recebido (sem anulados)</td><td class="num">${eur(total)}</td></tr>`));
}

/* 5. Ficha do sócio */
function mapaFicha(id){
  const s = Idx.socio.get(id); if(!s) return;
  const p = Idx.priv.get(id) || {}, sit = situacao(s);
  const campo = (r, v)=> `<tr><th>${r}</th><td>${v || "—"}</td></tr>`;
  const nif = eTes() ? esc(p.nif || "") : esc(s.nifMasc || ""), nib = eTes() ? esc(p.nib ? ibanFormatar(p.nib) : "") : esc(s.nibMasc || "");
  const agregado = (s.agregado || []).map((a)=>{ const o = Idx.socio.get(a.id); return o ? `${esc(o.nome)} (${numTxt(o)}) — ${esc(a.relacao)}` : ""; }).filter(Boolean).join("<br>");
  const pags = Idx.pagSocio.get(id) || [];
  imprimir("Ficha de sócio", `${numTxt(s)} · ${s.nome}`, `
    <div class="m-duas">
      <table class="m-ficha">${campo("Nº de sócio", s.numero)}${campo("Nome", `<b>${esc(s.nome)}</b>`)}${campo("Data de nascimento", dataPT(s.dataNascimento))}
        ${campo("NIF", nif)}${campo("NIB / IBAN", nib)}${campo("Telemóvel", esc(s.telemovel))}${campo("Telefone", esc(s.telefone))}${campo("Email", esc(s.email))}</table>
      <table class="m-ficha">${campo("Morada", esc(s.morada))}${campo("Código postal", esc([s.codigoPostal, s.localidade].filter(Boolean).join(" ")))}
        ${campo("Estado", socioAtivo(s) ? "Ativo" : "Inativo")}${campo("Tipo de sócio", esc(s.tipo))}${campo("Quota", esc(s.periodicidade))}
        ${campo("Inscrição", dataPT(s.dataEntrada))}${campo("Saída", dataPT(s.dataSaida))}${campo("Quotas pagas até (antes da app)", s.pagoAte ? mesPT(s.pagoAte) : "")}</table>
    </div>
    ${agregado ? `<h3>Agregado familiar</h3><p>${agregado}</p>` : ""}
    ${s.observacoes ? `<h3>Observações</h3><p style="white-space:pre-wrap">${esc(s.observacoes)}</p>` : ""}
    <h3>Quotas</h3>
    <p>${tipoIsento(s.tipo) ? "Isento de quotas (" + esc(s.tipo) + ")." : sit.divida ? `<b>Em dívida: ${eur(sit.divida)}</b> — ${esc(sit.falta.map((o)=>o.rot).join(", "))}` : "Quotas em dia."}</p>
    ${tabMapa([{t: "Data"}, {t: "Recibo"}, {t: "Referente a"}, {t: "Forma"}, {t: "Total", num: true}],
      pags.map((x)=>`<tr class="${x.anulado ? "m-anulado" : ""}"><td>${dataPT(x.data)}</td><td>${x.recibo ? esc(x.recibo.txt) : "—"}</td>
        <td class="m-peq">${esc((x.itens || []).map((i)=>i.rot).join(", "))}</td><td>${esc(x.forma)}</td><td class="num">${x.anulado ? "Anulado" : eur(x.total)}</td></tr>`))}`, false);
}

$("soc-imprimir").onclick = mapaSocios;
$("q-div-imprimir").onclick = mapaDevedores;
$("q-quadro-imprimir").onclick = mapaQuadro;
$("q-pag-imprimir").onclick = mapaRecebimentos;
