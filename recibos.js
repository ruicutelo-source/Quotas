"use strict";
/* =====================================================================
   RECIBOS — numeração (2026/0001), valor por extenso e PDF A5
   ===================================================================== */

/* ---------- valor por extenso (português europeu) ---------- */
const EXT_UNI = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze",
                 "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
const EXT_DEZ = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const EXT_CEN = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
function ate999(n){
  if(n === 100) return "cem";
  const c = Math.floor(n / 100), r = n % 100, partes = [];
  if(c) partes.push(EXT_CEN[c]);
  if(r) partes.push(r < 20 ? EXT_UNI[r] : EXT_DEZ[Math.floor(r / 10)] + (r % 10 ? " e " + EXT_UNI[r % 10] : ""));
  return partes.join(" e ");
}
function inteiroExtenso(n){
  if(n === 0) return "zero";
  const grupos = [[Math.floor(n / 1e6), (g)=>g === 1 ? "um milhão" : ate999(g) + " milhões"],
                  [Math.floor((n % 1e6) / 1000), (g)=>g === 1 ? "mil" : ate999(g) + " mil"],
                  [n % 1000, (g)=>ate999(g)]].filter(([g])=>g > 0);
  let txt = "";
  grupos.forEach(([g, f], i)=>{
    // «e» antes do último grupo quando é menor que 100 ou um número redondo de centenas (mil e duzentos, dois mil e cinquenta)
    if(i > 0) txt += (i === grupos.length - 1 && (g < 100 || g % 100 === 0)) ? " e " : " ";
    txt += f(g);
  });
  return txt;
}
function eurosExtenso(centimos){
  const e = Math.floor(centimos / 100), c = centimos % 100, partes = [];
  if(e) partes.push(inteiroExtenso(e) + (e >= 1e6 && e % 1e6 === 0 ? " de euros" : e === 1 ? " euro" : " euros"));
  if(c) partes.push(inteiroExtenso(c) + (c === 1 ? " cêntimo" : " cêntimos"));
  return partes.length ? partes.join(" e ") : "zero euros";
}

/* ---------- numeração: dá nº a todos os pagamentos que ainda não têm (pela ordem em que foram registados) ---------- */
let numerando = null;
function numerarPendentes(){
  if(!eTes()) return Promise.resolve();
  if(numerando) return numerando;
  // cada aparelho numera os pagamentos que registou (evita disputas); um pagamento esquecido há mais de 10 min é numerado por qualquer um
  const eu = Store.utilizador(), agora = Date.now();
  const fila = D.pagamentos.filter((p)=>!p.recibo && (p.criadoPor === eu || agora - (p.criadoEm || 0) > 10 * 60000))
    .sort((a, b)=>(a.criadoEm || 0) - (b.criadoEm || 0)).map((p)=>p.id);
  if(!fila.length) return Promise.resolve();
  numerando = fila.reduce((pr, id)=>pr.then(()=>Store.numerarRecibo(id)), Promise.resolve())
    .catch(()=>{})                  // sem internet: tenta de novo quando a ligação voltar
    .finally(()=>{ numerando = null; });
  return numerando;
}
window.addEventListener("online", ()=>numerarPendentes());
setInterval(()=>{ if(D.pagamentos.some((p)=>!p.recibo)) numerarPendentes(); }, 60000);

/* ---------- PDF (A5) ---------- */
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
function carregarJsPDF(){
  if(window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return carregarScript(JSPDF_URL).then(()=>window.jspdf.jsPDF);
}
/* muitas mensalidades seguidas cabem numa linha («Quotas Jan/2026 a Dez/2026 (12 meses)») */
function linhasRecibo(itens){
  if(itens.length <= 14) return itens.map((i)=>[descItem(i), i.valor]);
  const mensais = itens.filter((i)=>i.tipo === "Quota" && /^\d{4}-\d{2}$/.test(i.periodo)), outros = itens.filter((i)=>!mensais.includes(i));
  const l = outros.map((i)=>[descItem(i), i.valor]);
  if(mensais.length) l.push([`Quotas ${mensais[0].rot} a ${mensais[mensais.length - 1].rot} (${mensais.length} meses)`, mensais.reduce((t, i)=>t + i.valor, 0)]);
  return l;
}
const descItem = (i)=> i.tipo === "Joia" ? "Joia de inscrição" : i.tipo === "Quota" ? "Quota " + i.rot : i.rot;

function gerarReciboPDF(p){
  return carregarJsPDF().then((jsPDF)=>{
    const c = clube(), s = Idx.socio.get(p.socioId);
    const doc = new jsPDF({unit: "mm", format: "a5"});
    const W = 148, M = 12, D2 = W - M;
    const cinza = ()=>doc.setTextColor(90, 100, 115), preto = ()=>doc.setTextColor(25, 30, 40), navy = ()=>doc.setTextColor(31, 56, 100);
    // cabeçalho: logótipo + dados do clube
    let x = M;
    if(c.logo){ try{ doc.addImage(c.logo, c.logo.includes("image/png") ? "PNG" : "JPEG", M, 10, 22, 22); x = M + 26; }catch(e){} }
    navy(); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(doc.splitTextToSize(c.nome || "Clube", 62), x, 15);
    cinza(); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const linhasClube = [c.nif ? "NIF " + c.nif : "", c.morada, [c.codigoPostal, c.localidade].filter(Boolean).join(" "), [c.telefone, c.email].filter(Boolean).join(" · ")].filter(Boolean);
    doc.text(linhasClube, x, 21);
    // título
    navy(); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("RECIBO", D2, 15, {align: "right"});
    doc.setFontSize(11); preto(); doc.text("Nº " + (p.recibo ? p.recibo.txt : "—"), D2, 21, {align: "right"});
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Data: " + dataPT(p.data), D2, 26, {align: "right"});
    doc.setDrawColor(31, 56, 100); doc.setLineWidth(0.6); doc.line(M, 36, D2, 36);
    // anulado: nota logo abaixo do cabeçalho
    if(p.anulado){
      doc.setTextColor(192, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(`ANULADO em ${dataHoraPT(p.anulado.em)} por ${p.anulado.por}. Motivo: ${p.anulado.motivo}`, D2 - M), M, 41);
      doc.setFont("helvetica", "normal");
    }
    // sócio
    let y = p.anulado ? 50 : 44;
    cinza(); doc.setFontSize(8.5); doc.text("Recebemos de", M, y);
    preto(); doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(doc.splitTextToSize(p.nomeSocio || (s && s.nome) || "", 90), M, y + 5.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.text("Sócio nº " + (p.numeroSocio || (s && s.numero) || "—"), D2, y + 5.5, {align: "right"});
    // tabela
    y += 14;
    doc.setFillColor(217, 225, 242); doc.rect(M, y, D2 - M, 6.5, "F");
    navy(); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text("Descrição", M + 2, y + 4.4); doc.text("Valor", D2 - 2, y + 4.4, {align: "right"});
    y += 6.5; preto(); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    doc.setDrawColor(208, 215, 225); doc.setLineWidth(0.2);
    for(const [desc, v] of linhasRecibo(p.itens || [])){
      y += 5.6; doc.text(doc.splitTextToSize(desc, 95)[0], M + 2, y - 1.4); doc.text(eur(v), D2 - 2, y - 1.4, {align: "right"});
      doc.line(M, y, D2, y);
    }
    if(p.desconto){ y += 5.6; doc.text("Desconto", M + 2, y - 1.4); doc.text("-" + eur(p.desconto), D2 - 2, y - 1.4, {align: "right"}); doc.line(M, y, D2, y); }
    y += 2;
    doc.setFillColor(31, 56, 100); doc.rect(D2 - 52, y, 52, 8, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Total", D2 - 50, y + 5.5); doc.text(eur(p.total), D2 - 2, y + 5.5, {align: "right"});
    // por extenso e restantes dados
    y += 15; preto(); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
    const ext = doc.splitTextToSize("A quantia de " + eurosExtenso(p.total) + ".", D2 - M);
    doc.text(ext, M, y); y += ext.length * 4.6 + 2;
    doc.text("Forma de pagamento: " + (p.forma || "—"), M, y); y += 5;
    if(p.obs){ const o = doc.splitTextToSize("Obs.: " + p.obs, D2 - M); doc.text(o, M, y); y += o.length * 4.6; }
    doc.text("Recebido por: " + (p.recebidoPorNome || p.criadoPor || "—"), M, y);
    // assinatura
    const ya = Math.max(y + 22, 180);
    doc.setFontSize(9.5); doc.text("O Tesoureiro:", M, ya); doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3); doc.line(M + 24, ya, M + 90, ya);
    cinza(); doc.setFontSize(7.5);
    doc.text("Processado por computador - " + (c.nome || ""), W / 2, 202, {align: "center"});
    // anulado: carimbo semitransparente por cima
    if(p.anulado){
      try{ doc.setGState(new doc.GState({opacity: 0.3})); }catch(e){}
      doc.setTextColor(192, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(58);
      doc.text("ANULADO", W / 2 - 34, 150, {angle: 35});
      try{ doc.setGState(new doc.GState({opacity: 1})); }catch(e){}
    }
    const nome = `Recibo_${p.recibo ? p.recibo.txt.replace("/", "-") : "sem-numero"}_${norm(p.nomeSocio || "").replace(/[^a-z0-9]+/g, "_").slice(0, 30)}.pdf`;
    return {blob: doc.output("blob"), nome};
  });
}
function descarregarBlob(blob, nome){
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}
function reciboPDF(id, partilhar){
  const p = D.pagamentos.find((x)=>x.id === id); if(!p) return;
  if(!p.recibo){ toast("Este pagamento ainda não tem nº de recibo (precisa de internet)."); return; }
  toast("A preparar o recibo…");
  gerarReciboPDF(p).then(({blob, nome})=>{
    const f = new File([blob], nome, {type: "application/pdf"});
    if(partilhar && navigator.canShare && navigator.canShare({files: [f]}))
      navigator.share({files: [f], title: "Recibo " + p.recibo.txt}).catch(()=>{});
    else descarregarBlob(blob, nome);
  }).catch(()=>aviso("Não foi possível criar o PDF. Na primeira vez o aparelho precisa de internet para carregar o gerador de PDF."));
}
const podePartilharFicheiros = ()=> !!(navigator.canShare && navigator.canShare({files: [new File(["x"], "x.pdf", {type: "application/pdf"})]}));
