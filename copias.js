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
  $("cp-importar-cartao").style.display = eAdmin() ? "" : "none";
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
      ["Nº", "Nome", "Nome abreviado", "Estado", "Tipo", "Quota", "Inscrição", "Saída", "Quotas pagas até", "Nascimento", "NIF", "NIB/IBAN", "Telemóvel", "Telefone", "Email", "Morada", "Código postal", "Localidade", "Em dívida", "Observações"],
      socios.map((s)=>{ const p = Idx.priv.get(s.id) || {};
        return [s.numero || "", s.nome, s.nomeAbreviado || "", socioAtivo(s) ? "Ativo" : "Inativo", s.tipo, s.periodicidade, dataXL(s.dataEntrada), dataXL(s.dataSaida), s.pagoAte ? mesPT(s.pagoAte) : "",
          dataXL(s.dataNascimento), tes ? p.nif || "" : s.nifMasc || "", tes ? (p.nib ? ibanFormatar(p.nib) : "") : s.nibMasc || "", s.telemovel, s.telefone, s.email, s.morada,
          s.codigoPostal, s.localidade, euroXL(situacao(s).divida), s.observacoes || ""]; }),
      [18], [6, 7, 9], [6, 30, 18, 9, 16, 8, 11, 11, 10, 11, 11, 30, 12, 12, 26, 30, 10, 16, 11, 30]), "Sócios");
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

/* ---------- importar sócios de uma folha Excel (Administrador) ---------- */
const COLUNAS_IMPORT = {          // título da coluna (sem acentos, minúsculas) → campo
  numero: ["n.º", "nº", "n.o", "no", "numero", "n. socio", "nº socio", "numero de socio", "num"],
  nome: ["nome", "nome completo"],
  nomeAbreviado: ["nome abreviado", "abreviado"],
  morada: ["morada", "endereco"],
  localidade: ["localidade", "cidade"],
  codigoPostal: ["codigo postal", "cod. postal", "cp"],
  email: ["email", "e-mail", "correio eletronico"],
  dataNascimento: ["data nasc.", "data nasc", "data de nascimento", "nascimento"],
  telemovel: ["telemovel", "tlm", "telemovel/telefone"],
  telefone: ["telefone", "tel"],
  nif: ["nif", "contribuinte"],
  dataEntrada: ["data de inscricao", "data inscricao", "inscricao", "data de entrada", "admissao"],
  tipo: ["tipo", "tipo de socio"]
};
const semAcentos = (t)=> String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/* data do Excel (nº de série, Date ou texto dd/mm/aaaa) → AAAA-MM-DD */
function dataDeExcel(v){
  if(v == null || v === "") return "";
  if(typeof v === "number" && v > 0){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); }
  if(v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  const m = String(v).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const limpo = (v)=> String(v == null ? "" : v).replace(/\s+/g, " ").trim();

/* lê a folha e prepara os sócios (sem gravar): {socios:[{dados, privado, linha}], avisos:[], ignorados:[]} */
function prepararImportacao(linhasFolha, ficheiro){
  const iCab = linhasFolha.findIndex((r)=>r.some((c)=>semAcentos(c) === "nome"));
  if(iCab < 0) return {erro: "Não encontrei a linha de títulos (tem de haver uma coluna «NOME»)."};
  const cab = linhasFolha[iCab].map(semAcentos), col = {};
  for(const [campo, nomes] of Object.entries(COLUNAS_IMPORT)){ const i = cab.findIndex((c)=>nomes.includes(c)); if(i >= 0) col[campo] = i; }
  const tipos = listas().tiposSocio, socios = [], avisos = [], ignorados = [], usados = new Map();
  const existentes = new Map(D.socios.filter((s)=>s.numero != null).map((s)=>[String(s.numero), s]));
  const nomesExistentes = new Map(D.socios.map((s)=>[semAcentos(s.nome), s])), nomesFolha = new Map();
  const val = (r, c)=> col[c] == null ? "" : r[col[c]];
  linhasFolha.slice(iCab + 1).forEach((r, k)=>{
    const linha = iCab + k + 2;
    const nome = limpo(val(r, "nome"));
    if(!nome){ if(r.some((c)=>limpo(c))) ignorados.push(`Linha ${linha}: sem nome`); return; }
    const obs = [];
    // o mesmo nome completo já está na app (ou repetido na folha): não importa, para não duplicar
    const chaveNome = semAcentos(nome);
    if(nomesExistentes.has(chaveNome)){ const o = nomesExistentes.get(chaveNome); ignorados.push(`Linha ${linha}: ${nome} — já existe na app (${numTxt(o)})`); return; }
    if(nomesFolha.has(chaveNome)){ ignorados.push(`Linha ${linha}: ${nome} — nome repetido na folha (linha ${nomesFolha.get(chaveNome)})`); return; }
    // nº (inteiro, com letra, ou um texto como «FUNDADOR» → sem nº; se for um tipo de sócio, fica esse tipo)
    const numBruto = limpo(val(r, "numero"));
    let numero = lerNumero(numBruto), tipo = limpo(val(r, "tipo"));
    if(numero === undefined){
      const t = tipos.find((x)=>semAcentos(x) === semAcentos(numBruto));
      if(t) tipo = t; else obs.push("Nº na lista: " + numBruto);
      numero = null;
    }
    if(numero != null){
      const k2 = String(numero);
      if(existentes.has(k2)){ ignorados.push(`Linha ${linha}: ${nome} — o nº ${k2} já existe na app (${existentes.get(k2).nome})`); return; }
      if(usados.has(k2)){ ignorados.push(`Linha ${linha}: ${nome} — nº ${k2} repetido na folha (linha ${usados.get(k2)})`); return; }
      usados.set(k2, linha);
    }
    nomesFolha.set(chaveNome, linha);
    tipo = tipos.find((x)=>semAcentos(x) === semAcentos(tipo)) || "Efetivo";
    // código postal
    const cpBruto = limpo(val(r, "codigoPostal")), cp = cpNormalizar(cpBruto.replace(/\s/g, ""));
    if(cpBruto && cp === null){ obs.push("Código postal na lista: " + cpBruto); avisos.push(`Linha ${linha}: ${nome} — código postal «${cpBruto}» inválido (ficou vazio)`); }
    // email
    const emBruto = limpo(val(r, "email"));
    const email = emBruto && emailValido(emBruto) && !/\s/.test(emBruto) ? emBruto.toLowerCase() : "";
    if(emBruto && !email){ obs.push("Email na lista: " + emBruto); avisos.push(`Linha ${linha}: ${nome} — email «${emBruto}» inválido (ficou nas observações)`); }
    // datas
    const nasc = dataDeExcel(val(r, "dataNascimento")), entrada = dataDeExcel(val(r, "dataEntrada"));
    if(nasc === null) avisos.push(`Linha ${linha}: ${nome} — data de nascimento «${limpo(val(r, "dataNascimento"))}» não reconhecida`);
    if(entrada === null) avisos.push(`Linha ${linha}: ${nome} — data de inscrição «${limpo(val(r, "dataEntrada"))}» não reconhecida`);
    // sócio marcado como falecido na lista (no nome, no email ou no nome abreviado): fica inativo
    const falecido = /falec/i.test([nome, emBruto, limpo(val(r, "nomeAbreviado"))].join(" "));
    if(falecido) obs.unshift("Falecido (indicado na lista)");
    // telemóvel / NIF (se a folha os tiver)
    const tlm = telNormalizar(limpo(val(r, "telemovel"))), tel = telNormalizar(limpo(val(r, "telefone")));
    if(tlm === null){ obs.push("Telemóvel na lista: " + limpo(val(r, "telemovel"))); avisos.push(`Linha ${linha}: ${nome} — telemóvel inválido`); }
    if(tel === null){ obs.push("Telefone na lista: " + limpo(val(r, "telefone"))); avisos.push(`Linha ${linha}: ${nome} — telefone inválido`); }
    const nifB = limpo(val(r, "nif")).replace(/\s/g, ""), nif = nifB && nifValido(nifB) ? nifB : "";
    if(nifB && !nif){ obs.push("NIF na lista: " + nifB); avisos.push(`Linha ${linha}: ${nome} — NIF «${nifB}» inválido`); }
    socios.push({linha, privado: {nif, nib: ""}, dados: {
      numero, historicoNumeros: [], ativo: !falecido, nome, nomeAbreviado: limpo(val(r, "nomeAbreviado")),
      dataNascimento: nasc || "", telemovel: tlm || "", telefone: tel || "", email,
      morada: limpo(val(r, "morada")), codigoPostal: cp || "", localidade: limpo(val(r, "localidade")),
      tipo, periodicidade: "Anual", perHist: [{ano: 0, per: "Anual"}], pagoAte: "", inatividade: [],
      dataEntrada: entrada || "", dataSaida: "", observacoes: obs.join("\n"), nifMasc: nifMascara(nif), nibMasc: "", agregado: [],
      importado: {ficheiro, linha, em: Date.now()}}});
  });
  return {socios, avisos, ignorados, colunas: Object.keys(col)};
}
$("imp-escolher").onclick = ()=>{ if(eAdmin()) $("imp-fich").click(); };
$("imp-fich").onchange = (e)=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  toast("A ler a folha…");
  Promise.all([carregarScript(XLSX_URL), f.arrayBuffer()]).then(([, buf])=>{
    const wb = XLSX.read(buf), ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: ""});
    const r = prepararImportacao(linhas, f.name);
    if(r.erro){ aviso(r.erro, "Importar sócios"); return; }
    const inativos = r.socios.filter((x)=>!x.dados.ativo);
    const n = r.socios.length, semNum = r.socios.filter((x)=>x.dados.numero == null), comLetra = r.socios.filter((x)=>typeof x.dados.numero === "string");
    const porTipo = new Map(); r.socios.forEach((x)=>porTipo.set(x.dados.tipo, (porTipo.get(x.dados.tipo) || 0) + 1));
    const lista = (tit, arr)=> arr.length ? `<div class="secao">${tit} (${arr.length})</div><div class="pequeno" style="max-height:160px;overflow-y:auto;background:#FAFBFC;border:1px solid var(--linha);border-radius:8px;padding:6px 10px">${arr.map(esc).join("<br>")}</div>` : "";
    const exemplo = r.socios.slice(0, 5).map((x)=>`<tr><td class="num">${x.dados.numero || "—"}</td><td>${esc(x.dados.nome)}</td><td>${esc(x.dados.nomeAbreviado)}</td><td>${esc(x.dados.localidade)}</td><td>${dataPT(x.dados.dataNascimento)}</td></tr>`);
    janela("Importar sócios", `<p>Folha <b>${esc(f.name)}</b>: <b>${n}</b> sócio(s) para importar.</p>
      <p class="pequeno">Colunas reconhecidas: ${r.colunas.map(esc).join(", ")}.<br>
        Por tipo: ${[...porTipo.entries()].map(([t, k])=>`${esc(t)} ${k}`).join(" · ")} · sem nº: ${semNum.length} · nº com letra: ${comLetra.map((x)=>x.dados.numero).join(", ") || "nenhum"}.<br>
        ${inativos.length ? `<b>Inativos (falecidos segundo a lista): ${inativos.map((x)=>`${x.dados.numero || "—"} ${esc(x.dados.nome)}`).join("; ")}</b>.<br>` : ""}
        Os restantes ficam <b>ativos</b>; todos com quota <b>Anual</b>, sem data de inscrição e sem «quotas pagas até» (as quotas só são calculadas depois de preencher a data de inscrição).</p>
      <div class="rolar">${tabela([{t: "Nº", num: true}, {t: "Nome"}, {t: "Abreviado"}, {t: "Localidade"}, {t: "Nascimento"}], exemplo, "")}</div>
      ${lista("Avisos (os dados com erro ficam nas observações da ficha)", r.avisos)}${lista("Não importados", r.ignorados)}
      <div class="aviso" id="imp-erro" style="display:none"></div>`,
    [{texto: "Cancelar", classe: "sec", id: "imp-cancelar"}, ...(n ? [{texto: `Importar ${n} sócios`, id: "imp-ok", classe: "verde", acao: ()=>{
      const ops = [];
      for(const x of r.socios){
        const id = novoIdSocio();
        ops.push({tipo: "set", col: "socios", id, dados: {...x.dados, ...carimbo(true)}});
        ops.push({tipo: "set", col: "sociosPrivado", id, dados: x.privado});
      }
      gravar(ops).then(()=>toast(`${n} sócios importados.`)).catch(()=>{});
      toast("A importar…");
    }}] : [])], true);
  }).catch(()=>aviso("Não foi possível ler esta folha. Confirme que é um ficheiro Excel (.xlsx) e que o aparelho tem internet na primeira vez.", "Importar sócios"));
};
