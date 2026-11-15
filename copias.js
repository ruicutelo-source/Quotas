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
  $("cp-fotos-cartao").style.display = eTes() ? "" : "none";
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
$("cp-json").onclick = ()=>{ toast("A preparar a cópia…"); descarregarCopia().then((n)=>toast("Cópia descarregada: " + n)).catch(()=>aviso("Não foi possível criar a cópia.")); };

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
      fecharJanela(); toast("A guardar a cópia do estado atual…");
      descarregarCopia().then(()=>{
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
      // fotos: apaga as que não estão na cópia e repõe as da cópia
      const fotosCopia = c.dados.fotos || [], idsFotos = new Set(fotosCopia.map((f)=>f.id));
      for(const x of D.socios) if(x.fotoMini && !idsFotos.has(x.id)) ops.push({tipo: "del", col: "fotos", id: x.id});
      for(const f of fotosCopia) if(f.id && f.img) ops.push({tipo: "set", col: "fotos", id: f.id, dados: {img: f.img}});
      toast("A restaurar…");
      return gravar(ops).then(()=>aviso("Cópia restaurada.", "Restaurar cópia"));
      }).catch(()=>aviso("Não foi possível restaurar a cópia.", "Restaurar cópia"));
    }}]);
  };
  leitor.readAsText(f);
};

/* ---------- importar sócios de uma folha Excel (Administrador) ----------
   Cria os sócios novos e ATUALIZA os que já existem (ligados pelo nome completo ou pelo nº).
   Na atualização só muda o que é diferente e não está vazio na folha (um campo vazio nunca apaga dados da app). */
const COLUNAS_IMPORT = {          // título da coluna (sem acentos, minúsculas) → campo
  numero: ["n.º", "nº", "n.o", "no", "numero", "n. socio", "nº socio", "numero de socio", "num"],
  foto: ["foto", "nº foto", "n.º foto"],
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
  pagoAte: ["quotas pagas ate", "pagas ate", "pago ate", "quotas ate"],
  tipo: ["tipo", "tipo de socio"]
};
const ROTULOS_IMPORT = {numero: "nº", nome: "nome", nomeAbreviado: "nome abreviado", morada: "morada", localidade: "localidade", codigoPostal: "código postal",
  email: "email", dataNascimento: "nascimento", telemovel: "telemóvel", telefone: "telefone", nif: "NIF", dataEntrada: "inscrição", pagoAte: "quotas pagas até",
  tipo: "tipo", ativo: "estado"};
const semAcentos = (t)=> String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/* data do Excel (nº de série, Date ou texto dd/mm/aaaa) → AAAA-MM-DD */
function dataDeExcel(v){
  if(v == null || v === "") return "";
  if(typeof v === "number" && v > 0){ const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); }
  if(v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString().slice(0, 10);
  const m = String(v).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
/* mês do Excel ("12/2025", data, nº de série) → AAAA-MM */
function mesDeExcel(v){
  if(v == null || v === "") return "";
  const t = String(v).trim().match(/^(\d{1,2})[\/.-](\d{4})$/);
  if(t) return `${t[2]}-${t[1].padStart(2, "0")}`;
  const d = dataDeExcel(v); return d ? d.slice(0, 7) : null;
}
const limpo = (v)=> String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const valTxt = (campo, v)=> v == null || v === "" ? "—" : campo === "dataNascimento" || campo === "dataEntrada" ? dataPT(v) : campo === "pagoAte" ? mesPT(v) : campo === "ativo" ? (v ? "Ativo" : "Inativo") : String(v);

/* lê a folha e prepara (sem gravar): {novos:[{dados, privado}], alterados:[{s, mudancas, dados, privado}], iguais, avisos, ignorados, colunas} */
function prepararImportacao(linhasFolha, ficheiro){
  const iCab = linhasFolha.findIndex((r)=>r.some((c)=>semAcentos(c) === "nome"));
  if(iCab < 0) return {erro: "Não encontrei a linha de títulos (tem de haver uma coluna «NOME»)."};
  const cab = linhasFolha[iCab].map(semAcentos), col = {};
  for(const [campo, nomes] of Object.entries(COLUNAS_IMPORT)){ const i = cab.findIndex((c)=>nomes.includes(c)); if(i >= 0) col[campo] = i; }
  const tipos = listas().tiposSocio, novos = [], alterados = [], avisos = [], ignorados = [];
  let iguais = 0;
  const porNum = new Map(D.socios.filter((s)=>s.numero != null).map((s)=>[String(s.numero), s]));
  const porNome = new Map(D.socios.map((s)=>[semAcentos(s.nome), s]));
  const numFolha = new Map(), nomesFolha = new Map(), tocados = new Set();
  const val = (r, c)=> col[c] == null ? "" : r[col[c]];
  linhasFolha.slice(iCab + 1).forEach((r, k)=>{
    const linha = iCab + k + 2;
    const nome = limpo(val(r, "nome"));
    if(!nome){ if(r.some((c)=>limpo(c))) ignorados.push(`Linha ${linha}: sem nome`); return; }
    const chaveNome = semAcentos(nome);
    if(nomesFolha.has(chaveNome)){ ignorados.push(`Linha ${linha}: ${nome} — nome repetido na folha (linha ${nomesFolha.get(chaveNome)})`); return; }
    nomesFolha.set(chaveNome, linha);
    const obs = [];
    // nº: inteiro, com letra, ou um texto como «FUNDADOR» (→ tipo); nesse caso usa a coluna «Foto», se houver
    const numBruto = limpo(val(r, "numero"));
    let numero = lerNumero(numBruto), tipo = limpo(val(r, "tipo")), numDaFoto = false;
    if(numero === undefined){
      const t = tipos.find((x)=>semAcentos(x) === semAcentos(numBruto));
      if(t) tipo = t; else obs.push("Nº na lista: " + numBruto);
      const nf = lerNumero(limpo(val(r, "foto")));
      numero = nf === undefined ? null : nf; numDaFoto = numero != null;
    }
    if(numero != null){
      const k2 = String(numero);
      if(numFolha.has(k2)){ ignorados.push(`Linha ${linha}: ${nome} — nº ${k2} repetido na folha (linha ${numFolha.get(k2)})`); return; }
      numFolha.set(k2, linha);
    }
    tipo = tipos.find((x)=>semAcentos(x) === semAcentos(tipo)) || "";
    // código postal / email / datas / contactos
    const cpBruto = limpo(val(r, "codigoPostal")), cp = cpNormalizar(cpBruto.replace(/\s/g, ""));
    if(cpBruto && cp === null){ obs.push("Código postal na lista: " + cpBruto); avisos.push(`Linha ${linha}: ${nome} — código postal «${cpBruto}» inválido (ficou vazio)`); }
    const emBruto = limpo(val(r, "email"));
    const email = emBruto && emailValido(emBruto) && !/\s/.test(emBruto) ? emBruto.toLowerCase() : "";
    if(emBruto && !email){ obs.push("Email na lista: " + emBruto); avisos.push(`Linha ${linha}: ${nome} — email «${emBruto}» inválido (ficou nas observações)`); }
    const nasc = dataDeExcel(val(r, "dataNascimento")), entrada = dataDeExcel(val(r, "dataEntrada")), pagoAte = mesDeExcel(val(r, "pagoAte"));
    if(nasc === null) avisos.push(`Linha ${linha}: ${nome} — data de nascimento «${limpo(val(r, "dataNascimento"))}» não reconhecida`);
    if(entrada === null) avisos.push(`Linha ${linha}: ${nome} — data de inscrição «${limpo(val(r, "dataEntrada"))}» não reconhecida`);
    if(pagoAte === null) avisos.push(`Linha ${linha}: ${nome} — «quotas pagas até» «${limpo(val(r, "pagoAte"))}» não reconhecido (use mês/ano, ex.: 12/2025)`);
    const falecido = /falec/i.test([nome, emBruto, limpo(val(r, "nomeAbreviado"))].join(" "));
    if(falecido) obs.unshift("Falecido (indicado na lista)");
    const tlm = telNormalizar(limpo(val(r, "telemovel"))), tel = telNormalizar(limpo(val(r, "telefone")));
    if(tlm === null){ obs.push("Telemóvel na lista: " + limpo(val(r, "telemovel"))); avisos.push(`Linha ${linha}: ${nome} — telemóvel inválido`); }
    if(tel === null){ obs.push("Telefone na lista: " + limpo(val(r, "telefone"))); avisos.push(`Linha ${linha}: ${nome} — telefone inválido`); }
    const nifB = limpo(val(r, "nif")).replace(/\s/g, ""), nif = nifB && nifValido(nifB) ? nifB : "";
    if(nifB && !nif){ obs.push("NIF na lista: " + nifB); avisos.push(`Linha ${linha}: ${nome} — NIF «${nifB}» inválido`); }
    const lido = {numero, nome, nomeAbreviado: limpo(val(r, "nomeAbreviado")), dataNascimento: nasc || "", telemovel: tlm || "", telefone: tel || "", email,
      morada: limpo(val(r, "morada")), codigoPostal: cp || "", localidade: limpo(val(r, "localidade")), dataEntrada: entrada || "", pagoAte: pagoAte || "", tipo};

    // já existe na app? (pelo nome completo; senão pelo nº)
    const existente = porNome.get(chaveNome) || (numero != null && !numDaFoto ? porNum.get(String(numero)) : null);
    if(existente){
      if(tocados.has(existente.id)){ ignorados.push(`Linha ${linha}: ${nome} — corresponde a um sócio já usado noutra linha`); return; }
      tocados.add(existente.id);
      const mud = [], upd = {};
      const mudar = (campo, novo)=>{ if(novo === "" || novo == null) return; const antigo = existente[campo] == null ? "" : existente[campo];
        if(String(antigo) !== String(novo)){ mud.push({campo, de: antigo, para: novo}); upd[campo] = novo; } };
      // nº: a importação só dá nº a quem ainda não tem (ex.: fundadores); um nº já existente só muda na ficha ou na renumeração
      if(numero != null && String(numero) !== String(existente.numero == null ? "" : existente.numero)){
        const dono = porNum.get(String(numero));
        if(existente.numero != null) avisos.push(`Linha ${linha}: ${nome} — na folha tem o nº ${numero}, na app tem o nº ${existente.numero}; fica o da app`);
        else if(dono && dono.id !== existente.id) avisos.push(`Linha ${linha}: ${nome} — o nº ${numero} já é de ${dono.nome}; ficou sem nº`);
        else { mud.push({campo: "numero", de: null, para: numero}); upd.numero = numero; }
      }
      if(existente.nome !== nome){ mudar("nome", nome);
        avisos.push(`Linha ${linha}: o nº ${existente.numero} tem na app o nome «${existente.nome}» e na folha «${nome}» — confirme que é a mesma pessoa`); }
      for(const c of ["nomeAbreviado", "morada", "localidade", "codigoPostal", "email", "dataNascimento", "telemovel", "telefone", "dataEntrada", "pagoAte", "tipo"]) mudar(c, lido[c]);
      if(falecido && existente.ativo !== false){ mud.push({campo: "ativo", de: true, para: false}); upd.ativo = false;
        upd.observacoes = ["Falecido (indicado na lista)", existente.observacoes].filter(Boolean).join("\n"); }
      let privado = null;
      const p = Idx.priv.get(existente.id) || {};
      if(nif && nif !== p.nif){ mud.push({campo: "nif", de: p.nif || "", para: nif}); privado = {nif, nib: p.nib || ""}; upd.nifMasc = nifMascara(nif); }
      if(mud.length) alterados.push({s: existente, linha, mudancas: mud, dados: upd, privado}); else iguais++;
      return;
    }
    if(numero != null && porNum.has(String(numero))){ ignorados.push(`Linha ${linha}: ${nome} — o nº ${numero} já é de ${porNum.get(String(numero)).nome} (nome diferente)`); return; }
    novos.push({linha, privado: {nif, nib: ""}, dados: {
      ...lido, tipo: tipo || "Efetivo", historicoNumeros: [], ativo: !falecido,
      periodicidade: "Anual", perHist: [{ano: 0, per: "Anual"}], inatividade: [], dataSaida: "",
      observacoes: obs.join("\n"), nifMasc: nifMascara(nif), nibMasc: "", agregado: [], fotoMini: "",
      importado: {ficheiro, linha, em: Date.now()}}});
  });
  return {novos, alterados, iguais, avisos, ignorados, colunas: Object.keys(col)};
}
const caixaLista = (tit, arr)=> arr.length ? `<div class="secao">${tit} (${arr.length})</div><div class="pequeno" style="max-height:180px;overflow-y:auto;background:#FAFBFC;border:1px solid var(--linha);border-radius:8px;padding:6px 10px">${arr.join("<br>")}</div>` : "";
$("imp-escolher").onclick = ()=>{ if(eAdmin()) $("imp-fich").click(); };
$("imp-fich").onchange = (e)=>{
  const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  toast("A ler a folha…");
  Promise.all([carregarScript(XLSX_URL), f.arrayBuffer()]).then(([, buf])=>{
    const wb = XLSX.read(buf), ws = wb.Sheets[wb.SheetNames[0]];
    const r = prepararImportacao(XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: ""}), f.name);
    if(r.erro){ aviso(r.erro, "Importar sócios"); return; }
    const n = r.novos.length, a = r.alterados.length;
    const inativos = r.novos.filter((x)=>!x.dados.ativo);
    const porTipo = new Map(); r.novos.forEach((x)=>porTipo.set(x.dados.tipo, (porTipo.get(x.dados.tipo) || 0) + 1));
    const listaAlt = r.alterados.sort((x, y)=>porNumero(x.s, y.s)).map((x)=>`<b>${esc(x.s.numero == null ? "—" : x.s.numero)} ${esc(x.s.nome)}</b>: ` +
      x.mudancas.map((m)=>`${ROTULOS_IMPORT[m.campo]} ${esc(valTxt(m.campo, m.de))} → <b>${esc(valTxt(m.campo, m.para))}</b>`).join("; "));
    const exemplo = r.novos.slice(0, 5).map((x)=>`<tr><td class="num">${x.dados.numero || "—"}</td><td>${esc(x.dados.nome)}</td><td>${esc(x.dados.nomeAbreviado)}</td><td>${esc(x.dados.localidade)}</td><td>${dataPT(x.dados.dataNascimento)}</td></tr>`);
    janela("Importar sócios", `<p>Folha <b>${esc(f.name)}</b>: <b>${n}</b> sócio(s) novo(s), <b>${a}</b> sócio(s) a atualizar, ${r.iguais} sem alterações.</p>
      <p class="pequeno">Colunas reconhecidas: ${r.colunas.map(esc).join(", ")}.</p>
      ${n ? `<p class="pequeno">Novos por tipo: ${[...porTipo.entries()].map(([t, k])=>`${esc(t)} ${k}`).join(" · ")}.
        ${inativos.length ? `<b>Inativos (falecidos segundo a lista): ${inativos.map((x)=>`${x.dados.numero || "—"} ${esc(x.dados.nome)}`).join("; ")}</b>.` : ""}
        Os novos ficam com quota <b>Anual</b>; sem data de inscrição as quotas não são calculadas.</p>
        <div class="rolar">${tabela([{t: "Nº", num: true}, {t: "Nome"}, {t: "Abreviado"}, {t: "Localidade"}, {t: "Nascimento"}], exemplo, "")}</div>` : ""}
      ${caixaLista("Alterações nos sócios que já existem (só o que muda; nada é apagado)", listaAlt)}
      ${caixaLista("Avisos (os dados com erro ficam nas observações da ficha)", r.avisos.map(esc))}${caixaLista("Não importados", r.ignorados.map(esc))}
      ${!n && !a ? `<div class="aviso">Nada a importar: a app já tem estes dados.</div>` : ""}`,
    [{texto: "Cancelar", classe: "sec", id: "imp-cancelar"}, ...(n || a ? [{texto: [n ? `criar ${n}` : "", a ? `atualizar ${a}` : ""].filter(Boolean).join(" e ").replace(/^./, (c)=>c.toUpperCase()), id: "imp-ok", classe: "verde", acao: ()=>{
      const ops = [];
      for(const x of r.novos){ const id = novoIdSocio();
        ops.push({tipo: "set", col: "socios", id, dados: {...x.dados, ...carimbo(true)}}, {tipo: "set", col: "sociosPrivado", id, dados: x.privado}); }
      for(const x of r.alterados){
        ops.push({tipo: "update", col: "socios", id: x.s.id, dados: {...x.dados, ...carimbo(false)}});
        if(x.privado) ops.push({tipo: "set", col: "sociosPrivado", id: x.s.id, dados: x.privado});
      }
      gravar(ops).then(()=>toast(`Importação feita: ${n} novo(s), ${a} atualizado(s).`)).catch(()=>{});
      toast("A gravar…");
    }}] : [])], true);
  }).catch(()=>aviso("Não foi possível ler esta folha. Confirme que é um ficheiro Excel (.xlsx) e que o aparelho tem internet na primeira vez.", "Importar sócios"));
};

/* ---------- importar fotos em lote: o nome do ficheiro é o nº de sócio (119.jpg, 203A.jpg) ou o nome ---------- */
$("fot-escolher").onclick = ()=>{ if(eTes()) $("fot-fich").click(); };
$("fot-fich").onchange = (e)=>{
  const fichs = [...e.target.files].filter((f)=>/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)); e.target.value = "";
  if(!fichs.length) return;
  const porNum = new Map(D.socios.filter((s)=>s.numero != null).map((s)=>[String(s.numero), s]));
  const porNome = new Map(); for(const s of D.socios){ porNome.set(semAcentos(s.nome), s); if(s.nomeAbreviado) porNome.set(semAcentos(s.nomeAbreviado), s); }
  const ligadas = [], semSocio = [], repetidas = [], usados = new Map();
  for(const f of fichs){
    const base = f.name.replace(/\.[^.]+$/, "").trim();
    const n = lerNumero(base), s = (n != null && n !== undefined ? porNum.get(String(n)) : null) || porNome.get(semAcentos(base));
    if(!s){ semSocio.push(f.name); continue; }
    if(usados.has(s.id)){ repetidas.push(`${f.name} (o sócio ${numTxt(s)} já tem ${usados.get(s.id)})`); continue; }
    usados.set(s.id, f.name); ligadas.push({f, s});
  }
  const jaTem = ligadas.filter((x)=>x.s.fotoMini);
  const semFoto = D.socios.filter((s)=>socioAtivo(s) && !s.fotoMini && !usados.has(s.id));
  janela("Importar fotos", `<p><b>${fichs.length}</b> imagem(ns): <b>${ligadas.length}</b> ligada(s) a sócios${jaTem.length ? `, das quais ${jaTem.length} de sócios que já têm foto` : ""}.</p>
    ${jaTem.length ? `<label class="campo" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fot-subst" style="width:22px;height:22px"> Substituir as fotos que já existem (${jaTem.length})</label>` : ""}
    ${caixaLista("Ficheiros sem sócio correspondente", semSocio.map(esc))}${caixaLista("Ficheiros repetidos (ignorados)", repetidas.map(esc))}
    ${caixaLista("Sócios ativos que vão continuar sem foto", semFoto.sort(porNumero).map((s)=>esc(`${s.numero == null ? "—" : s.numero} ${s.nome}`)))}
    <div class="nota">Cada foto é recortada em retrato e reduzida (fica com 10 a 30 KB). As fotos originais ficam na sua pasta.</div>
    <div id="fot-prog" class="nota" style="display:none"></div><div class="aviso" id="fot-erro" style="display:none"></div>`,
  [{texto: "Cancelar", classe: "sec", id: "fot-cancelar"}, ...(ligadas.length ? [{texto: "Importar fotos", id: "fot-ok", classe: "verde", manter: true, acao: ()=>{
    const subst = $("fot-subst") ? $("fot-subst").checked : false;
    const lista = ligadas.filter((x)=>subst || !x.s.fotoMini);
    if(!lista.length){ $("fot-erro").textContent = "Não há fotos novas para importar (marque «Substituir» para trocar as existentes)."; $("fot-erro").style.display = "block"; return; }
    $("fot-ok").disabled = true; $("fot-cancelar").disabled = true;
    const prog = $("fot-prog"); prog.style.display = "block";
    let feitas = 0, falhadas = [];
    // prepara e grava aos poucos (lotes de 40 fotos)
    const lotes = []; for(let i = 0; i < lista.length; i += 40) lotes.push(lista.slice(i, i + 40));
    lotes.reduce((pr, lote)=>pr.then(()=>Promise.all(lote.map((x)=>prepararFoto(x.f).then((ft)=>({x, ft})).catch(()=>{ falhadas.push(x.f.name); return null; })))
      .then((res)=>{
        const ops = [];
        for(const r of res.filter(Boolean)){
          ops.push({tipo: "set", col: "fotos", id: r.x.s.id, dados: {img: r.ft.img}});
          ops.push({tipo: "update", col: "socios", id: r.x.s.id, dados: {fotoMini: r.ft.mini}});
        }
        feitas += lote.length; prog.textContent = `A importar… ${feitas} de ${lista.length}`;
        return ops.length ? gravar(ops) : null;
      })), Promise.resolve())
      .then(()=>{ fecharJanela(); aviso(`${lista.length - falhadas.length} foto(s) importada(s).` + (falhadas.length ? `\nNão foi possível ler: ${falhadas.join(", ")}` : ""), "Importar fotos"); })
      .catch(()=>{ $("fot-erro").textContent = "Houve um erro a gravar. As fotos já gravadas ficam; pode repetir para as restantes."; $("fot-erro").style.display = "block"; $("fot-cancelar").disabled = false; });
  }}] : [])], true);
};
