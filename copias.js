"use strict";
/* =====================================================================
   CÓPIAS — exportar para Excel, cópia de segurança (.json) e restaurar
   ===================================================================== */
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const COLS_COPIA = ["config", "cargos", "socios", "sociosPrivado", "utilizadores", "pagamentos", "movimentos", "entidades"];
const ehPrincipal = ()=> !MODO_FIREBASE || Store.utilizador() === ADMIN_PRINCIPAL;

function desenharCopias(){
  $("cp-json-cartao").style.display = eAdmin() ? "" : "none";
  $("cp-restaurar-cartao").style.display = ehPrincipal() ? "block" : "none";
}

/* ---------- Excel ---------- */
/* datas como nº de série do Excel (evita o erro de fuso horário das datas JavaScript) */
const dataXL = (iso)=>{ if(!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const euroXL = (c)=> c == null || c === "" ? "" : Math.round(c) / 100;
function folha(cab, linhas, colsEuro, colsData, larguras){
  const ws = XLSX.utils.aoa_to_sheet([cab, ...linhas]);
  const ref = XLSX.utils.decode_range(ws["!ref"]);
  for(let r = 1; r <= ref.e.r; r++){
    for(const c of colsEuro){ const cel = ws[XLSX.utils.encode_cell({r, c})]; if(cel && cel.t === "n") cel.z = '#,##0.00 "€"'; }
    for(const c of colsData){ const cel = ws[XLSX.utils.encode_cell({r, c})]; if(cel && cel.t === "n") cel.z = "dd/mm/yyyy"; }
  }
  ws["!cols"] = (larguras || cab.map((h)=>Math.max(10, String(h).length + 2))).map((w)=>({wch: w}));
  ws["!autofilter"] = {ref: XLSX.utils.encode_range({s: {r: 0, c: 0}, e: {r: ref.e.r, c: cab.length - 1}})};
  return ws;
}
function exportarExcel(){
  toast("A preparar o ficheiro Excel…");
  carregarScript(XLSX_URL).then(()=>{
    const wb = XLSX.utils.book_new(), tes = eTes();
    const socios = D.socios.slice().sort(porNumero);
    XLSX.utils.book_append_sheet(wb, folha(
      ["Nº", "Nome", "Estado", "Tipo", "Quota", "Inscrição", "Saída", "Quotas pagas até", "Nascimento", "NIF", "NIB/IBAN", "Telemóvel", "Telefone", "Email", "Morada", "Código postal", "Localidade", "Em dívida", "Observações"],
      socios.map((s)=>{ const p = Idx.priv.get(s.id) || {};
        return [s.numero || "", s.nome, socioAtivo(s) ? "Ativo" : "Inativo", s.tipo, s.periodicidade, dataXL(s.dataEntrada), dataXL(s.dataSaida), s.pagoAte ? mesPT(s.pagoAte) : "",
          dataXL(s.dataNascimento), tes ? p.nif || "" : s.nifMasc || "", tes ? (p.nib ? ibanFormatar(p.nib) : "") : s.nibMasc || "", s.telemovel, s.telefone, s.email, s.morada,
          s.codigoPostal, s.localidade, euroXL(situacao(s).divida), s.observacoes || ""]; }),
      [17], [5, 6, 8], [6, 30, 9, 16, 8, 11, 11, 10, 11, 11, 30, 12, 12, 26, 30, 10, 16, 11, 30]), "Sócios");
    const pags = D.pagamentos.slice().sort((a, b)=>String(a.data).localeCompare(String(b.data)) || (a.recibo ? a.recibo.num : 0) - (b.recibo ? b.recibo.num : 0));
    XLSX.utils.book_append_sheet(wb, folha(
      ["Data", "Recibo", "Nº sócio", "Sócio", "Referente a", "Forma", "Conta", "Subtotal", "Desconto", "Total", "Anulado", "Motivo", "Recebido por"],
      pags.map((p)=>[dataXL(p.data), p.recibo ? p.recibo.txt : "", p.numeroSocio || "", p.nomeSocio, (p.itens || []).map((i)=>i.rot).join(", "), p.forma, contaDaForma(p.forma),
        euroXL(p.subtotal), euroXL(p.desconto), euroXL(p.total), p.anulado ? "Sim" : "", p.anulado ? p.anulado.motivo : "", p.recebidoPorNome || p.criadoPor || ""]),
      [7, 8, 9], [0], [11, 11, 8, 28, 40, 16, 8, 10, 10, 10, 8, 24, 18]), "Pagamentos");
    const movs = D.movimentos.slice().sort((a, b)=>String(a.data).localeCompare(String(b.data)));
    XLSX.utils.book_append_sheet(wb, folha(
      ["Data", "Tipo", "Categoria", "Descrição", "Conta", "Para", "Fornecedor", "Documento", "Estado", "Prazo", "Data pagamento", "Valor", "Anulado", "Motivo"],
      movs.map((m)=>[dataXL(m.data), m.tipo, m.categoria || "", m.descricao, m.conta || "", m.contaDestino || "", m.entidadeNome || "", m.documento || "",
        m.tipo === "Despesa" ? (m.estado === "pago" ? "Paga" : "Por pagar") : "", dataXL(m.prazo), dataXL(m.dataPag), euroXL(m.valor), m.anulado ? "Sim" : "", m.anulado ? m.anulado.motivo : ""]),
      [11], [0, 9, 10], [11, 13, 22, 36, 8, 8, 22, 14, 10, 11, 13, 11, 8, 24]), "Tesouraria");
    XLSX.utils.book_append_sheet(wb, folha(["Nome", "NIF", "Telefone", "Email", "Morada", "Observações"],
      D.entidades.slice().sort((a, b)=>porTexto(a.nome, b.nome)).map((e)=>[e.nome, e.nif || "", e.telefone || "", e.email || "", e.morada || "", e.obs || ""]),
      [], [], [30, 11, 13, 26, 34, 30]), "Fornecedores");
    // contas do ano
    const Y = Number(hojeISO().slice(0, 4)), F = fluxos(), r = resumoAno(Y, F);
    const linhas = [["Receitas", ""]].concat(ordenarCat(r.rec, ["Quotas", "Joias"].concat(listas().categoriasReceita)).map(([c, v])=>["   " + c, euroXL(v)]))
      .concat([["Total de receitas", euroXL(r.totRec)], ["", ""], ["Despesas", ""]])
      .concat(ordenarCat(r.des, listas().categoriasDespesa).map(([c, v])=>["   " + c, euroXL(v)]))
      .concat([["Total de despesas", euroXL(r.totDes)], ["", ""], ["Resultado do ano", euroXL(r.totRec - r.totDes)], ["", ""],
        ["Saldo atual em Caixa", euroXL(saldoAte("Caixa", null, F))], ["Saldo atual no Banco", euroXL(saldoAte("Banco", null, F))], ["Saldo atual total", euroXL(saldoAte(null, null, F))]]);
    XLSX.utils.book_append_sheet(wb, folha(["Contas " + Y, "Valor"], linhas, [1], [], [34, 14]), "Contas " + Y);
    const d = new Date(), z = (n)=>String(n).padStart(2, "0");
    XLSX.writeFile(wb, `Quotas_${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}.xlsx`);
  }).catch(()=>aviso("Não foi possível criar o ficheiro Excel. Na primeira vez o aparelho precisa de internet."));
}
$("cp-excel").onclick = exportarExcel;
$("cp-json").onclick = ()=>{ const n = descarregarCopia(); toast("Cópia descarregada: " + n); };

/* ---------- restaurar (só o Administrador principal) ---------- */
$("cp-restaurar").onclick = ()=>{ if(ehPrincipal()) $("cp-fich").click(); };
$("cp-fich").onchange = (e)=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  const leitor = new FileReader();
  leitor.onload = ()=>{
    let c = null; try{ c = JSON.parse(leitor.result); }catch(err){}
    if(!c || c.app !== "Quotas" || !c.dados || !Array.isArray(c.dados.socios)){ aviso("Este ficheiro não é uma cópia da app Quotas."); return; }
    const n = (col)=> (c.dados[col] || []).length;
    janela("Restaurar cópia", `<p>Cópia de <b>${dataHoraPT(Date.parse(c.data))}</b>${c.por ? ` (feita por ${esc(c.por)})` : ""}, versão ${esc(c.versao || "?")}:</p>
      <p>${n("socios")} sócio(s), ${n("pagamentos")} pagamento(s), ${n("movimentos")} movimento(s), ${n("entidades")} fornecedor(es), ${n("cargos")} cargo(s), ${n("utilizadores")} utilizador(es).</p>
      <p><b>Todos os dados atuais são substituídos.</b> Antes disso é descarregada uma cópia do estado atual.</p>
      <label class="campo">Para confirmar, escreva APAGAR</label><input type="text" id="rest-conf" autocomplete="off">
      <div class="aviso" id="rest-erro" style="display:none"></div>`,
    [{texto: "Cancelar", classe: "sec", id: "rest-cancelar"}, {texto: "Restaurar", classe: "verm", id: "rest-ok", manter: true, acao: ()=>{
      if($("rest-conf").value.trim() !== "APAGAR"){ $("rest-erro").textContent = "Escreva APAGAR (em maiúsculas) para confirmar."; $("rest-erro").style.display = "block"; return; }
      descarregarCopia();
      const ops = [];
      for(const col of COLS_COPIA){
        const novos = c.dados[col] || [], ids = new Set(novos.map((x)=>x.id));
        for(const x of D[col]) if(!ids.has(x.id)) ops.push({tipo: "del", col, id: x.id});
        for(const x of novos){ const {id, ...dados} = x; if(id) ops.push({tipo: "set", col, id, dados}); }
      }
      // numeração dos recibos: continua a partir do maior nº de cada ano da cópia
      const maxAno = {};
      for(const p of c.dados.pagamentos || []) if(p.recibo) maxAno[p.recibo.ano] = Math.max(maxAno[p.recibo.ano] || 0, p.recibo.num);
      const anosAtuais = new Set(D.pagamentos.map((p)=>String(p.data).slice(0, 4)).concat(hojeISO().slice(0, 4)));
      for(const ano of anosAtuais) if(!maxAno[ano]) ops.push({tipo: "del", col: "contadores", id: "recibos-" + ano});
      for(const [ano, n] of Object.entries(maxAno)) ops.push({tipo: "set", col: "contadores", id: "recibos-" + ano, dados: {ultimo: n}});
      fecharJanela();
      gravar(ops).then(()=>aviso("Cópia restaurada.", "Restaurar cópia")).catch(()=>{});
      toast("A restaurar…");
    }}]);
  };
  leitor.readAsText(f);
};
