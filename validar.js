"use strict";
/* =====================================================================
   VALIDAÇÕES E FORMATOS (NIF, IBAN/NIB, código postal, euros)
   ===================================================================== */

/* NIF português: 9 dígitos com dígito de controlo */
function nifValido(nif){
  const s = String(nif || "").replace(/\s/g, "");
  if(!/^\d{9}$/.test(s)) return false;
  if(!/^(1|2|3|5|6|8|9|45|70|71|72|74|75|77|79|90|91|98|99)/.test(s)) return false;
  let soma = 0;
  for(let i = 0; i < 8; i++) soma += Number(s[i]) * (9 - i);
  const r = soma % 11, ctrl = r < 2 ? 0 : 11 - r;
  return ctrl === Number(s[8]);
}

/* IBAN (aceita também o NIB português de 21 dígitos, que passa a PT50 + NIB).
   Devolve o IBAN normalizado (sem espaços, maiúsculas) ou null se for inválido. */
function ibanNormalizar(txt){
  let s = String(txt || "").replace(/[\s.-]/g, "").toUpperCase();
  if(/^\d{21}$/.test(s)) s = "PT50" + s;
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return null;
  if(s.startsWith("PT") && s.length !== 25) return null;
  const mov = s.slice(4) + s.slice(0, 4);
  let resto = 0;
  for(const c of mov){
    const v = /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c;
    for(const d of v) resto = (resto * 10 + Number(d)) % 97;
  }
  return resto === 1 ? s : null;
}
const ibanFormatar = (s)=> String(s || "").replace(/(.{4})/g, "$1 ").trim();

/* versões mascaradas (o perfil Consulta só vê isto) */
const nifMascara = (s)=> s ? "••••••" + String(s).slice(-3) : "";
const ibanMascara = (s)=> s ? String(s).slice(0, 4) + " •••• •••• " + String(s).slice(-4) : "";

/* código postal 0000-000 (aceita 7 dígitos seguidos) */
function cpNormalizar(txt){
  const s = String(txt || "").trim();
  if(!s) return "";
  const m = s.match(/^(\d{4})-?(\d{3})$/);
  return m ? m[1] + "-" + m[2] : null;
}
function emailValido(s){ return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim()); }
function telNormalizar(txt){
  const s = String(txt || "").replace(/[\s.-]/g, "");
  if(!s) return "";
  return /^(\+\d{1,3})?\d{9,12}$/.test(s) ? s : null;
}

/* euros: os valores são guardados em CÊNTIMOS inteiros (sem erros de arredondamento) */
function centimosDe(txt){
  const s = String(txt == null ? "" : txt).trim().replace(/\s|€/g, "").replace(",", ".");
  if(s === "") return 0;
  if(!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, d = ""] = s.split(".");
  return Number(i) * 100 + Number((d + "00").slice(0, 2));
}
const eur = (c)=> (c == null || !isFinite(c)) ? "—"
  : (c / 100).toLocaleString("pt-PT", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " €";
const eurCampo = (c)=> (c == null || !isFinite(c)) ? "" : (c / 100).toFixed(2).replace(".", ",");

/* datas guardadas como texto AAAA-MM-DD */
const hojeISO = ()=>{ const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dataPT = (iso)=> iso ? iso.split("-").reverse().join("/") : "";
const dataHoraPT = (ts)=> ts ? new Date(ts).toLocaleString("pt-PT", {day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"}) : "";
