"use strict";
/* =====================================================================
   NÚCLEO — configuração, base de dados, login, perfis e navegação
   ===================================================================== */

/* Projeto Firebase do clube. Com os campos vazios a app funciona em MODO LOCAL
   (dados só neste aparelho), que só serve para testes. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtd4jnnje--bz72YDFhc8EMS6mUKD_QdY",
  authDomain: "quotas-clube.firebaseapp.com",
  projectId: "quotas-clube",
  storageBucket: "quotas-clube.firebasestorage.app",
  messagingSenderId: "1042881769887",
  appId: "1:1042881769887:web:6b3796aa2b52ceae078daa"
};
const VERSAO_APP = "4.1";

/* Administrador principal: tem sempre acesso total, mesmo sem ficha em Utilizadores.
   Tem de ser igual ao email escrito nas regras do Firestore. */
const ADMIN_PRINCIPAL = "administrador@quotas-clube.pt";

const MODO_FIREBASE = !!(FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);
const PERFIS = ["Administrador", "Tesoureiro", "Consulta"];

/* ---------------------------------------------------------------------
   DADOS (coleções na base de dados) — valores em euros guardados em CÊNTIMOS
   config/clube:        {nome, nif, telefone, email, morada, codigoPostal, localidade, logo,
                         valores:{"2026": {joia, mensal, anual}, ...}}   (joia/quotaMensal/quotaAnual: versão 1, só leitura)
   config/listas:       {tiposSocio:[...], tiposIsentos:[...], formasPagamento:[...]}
   cargos/{id}:         {orgao, cargo, socioId, nome, mandato}
   socios/{id}:         {numero (inteiro, texto com letra como "203A", ou null = sem nº), historicoNumeros:[{numero, ate}], ativo, nome, nomeAbreviado, dataNascimento, telemovel, telefone, email, morada, codigoPostal, localidade,
                         tipo, periodicidade, perHist:[{ano, per}], pagoAte ("AAAA-MM"), inatividade:[{de, ate}],
                         dataEntrada, dataSaida, observacoes, nifMasc, nibMasc,
                         agregado:[{id, relacao}], criadoPor, criadoEm, alteradoPor, alteradoEm}
   sociosPrivado/{id}:  {nif, nib}   (só Administrador e Tesoureiro conseguem ler)
   utilizadores/{email}: {nome, perfil, ativo}
   pagamentos/{id}:     {socioId, numeroSocio, nomeSocio, data, forma, itens:[{tipo, periodo, rot, valor}],
                         subtotal, desconto, total, obs, anulado:{por, em, motivo}|null, recebidoPorNome,
                         recibo:{ano, num, txt:"2026/0001", em}|null, criadoPor, criadoEm}
   movimentos/{id}:     {tipo: Receita|Despesa|Transferência, data, categoria, descricao, valor, conta (Caixa|Banco), contaDestino,
                         entidadeId, entidadeNome, documento, estado (pago|porPagar), prazo, dataPag, obs, anulado, criadoPor, criadoEm}
   entidades/{id}:      {nome, nif, telefone, email, morada, obs}   (fornecedores)
   config/tesouraria:   {dataInicial, saldoInicial:{Caixa, Banco}}
   contadores/recibos-2026: {ultimo}   (último nº de recibo do ano; só se mexe numa transação)
   --------------------------------------------------------------------- */
const COLS = ["config", "cargos", "socios", "sociosPrivado", "utilizadores", "pagamentos", "contadores", "movimentos", "entidades"];
let D = {}; for(const c of COLS) D[c] = [];
const Idx = {socio: new Map(), priv: new Map(), pagos: new Map(), pagSocio: new Map()};
function reindexar(){
  Idx.socio = new Map(D.socios.map((s)=>[s.id, s]));
  Idx.priv = new Map(D.sociosPrivado.map((p)=>[p.id, p]));
  // períodos pagos por sócio (pagamentos anulados não contam)
  Idx.pagos = new Map(); Idx.pagSocio = new Map();
  for(const p of D.pagamentos){
    if(!Idx.pagSocio.has(p.socioId)) Idx.pagSocio.set(p.socioId, []);
    Idx.pagSocio.get(p.socioId).push(p);
    if(p.anulado) continue;
    if(!Idx.pagos.has(p.socioId)) Idx.pagos.set(p.socioId, new Set());
    for(const it of p.itens || []) Idx.pagos.get(p.socioId).add(it.periodo);
  }
  for(const l of Idx.pagSocio.values()) l.sort((a, b)=>String(b.data).localeCompare(String(a.data)) || (b.criadoEm || 0) - (a.criadoEm || 0));
}
const LISTAS_INICIAIS = {
  tiposSocio: ["Efetivo", "Fundador", "Honorário", "Sócio de Formação", "Atleta", "Outro"],
  tiposIsentos: ["Honorário"],
  formasPagamento: ["Dinheiro", "Multibanco", "MB WAY", "Transferência Bancária", "Cheque"],
  formasCaixa: ["Dinheiro"],
  categoriasReceita: ["Eventos", "Donativos", "Patrocínios", "Merchandising", "Outras receitas"],
  categoriasDespesa: ["Eventos", "Sede e renda", "Água, luz e comunicações", "Material e equipamento", "Seguros", "Despesas bancárias", "Outras despesas"]
};
const CLUBE_INICIAL = {nome: "", nif: "", telefone: "", email: "", morada: "", codigoPostal: "", localidade: "",
                       logo: "", joia: 0, quotaMensal: 0, quotaAnual: 0};
const clube = ()=> ({...CLUBE_INICIAL, ...(D.config.find((c)=>c.id === "clube") || {})});
const listas = ()=>{ const l = D.config.find((c)=>c.id === "listas") || {};
  const r = {}; for(const k of Object.keys(LISTAS_INICIAIS)) r[k] = l[k] || LISTAS_INICIAIS[k];
  return r; };
/* código interno fixo do sócio (o nº de sócio pode mudar nas renumerações; o código nunca muda) */
const novoIdSocio = ()=> "S" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numTxt = (s)=> s && s.numero ? "nº " + s.numero : "sem nº";
const socioAtivo = (s)=> s.ativo !== false;          // escolhido à mão na ficha (a data de saída é só informativa)

let nomeUtilizador = "";       // nome de quem está a usar a app (vai nos recibos: «Recebido por»)
let renderAgendado = false;
function agendarRender(){ if(renderAgendado) return; renderAgendado = true; requestAnimationFrame(()=>{ renderAgendado = false; render(); }); }

/* ---------- modo local (testes): localStorage ---------- */
const Local = {
  CHAVE: "quotas_app_v1_dados",
  ler(){ try{ const t = localStorage.getItem(this.CHAVE); if(t) return JSON.parse(t); }catch(e){} return null; },
  gravar(){ try{ localStorage.setItem(this.CHAVE, JSON.stringify(D)); }catch(e){ aviso("Não foi possível guardar os dados neste aparelho: " + e.message); } },
  iniciar(){
    const d = this.ler(); if(d) for(const c of COLS) D[c] = d[c] || [];
    reindexar();
    const p = new URLSearchParams(location.search).get("perfil");
    nomeUtilizador = "Modo local";
    entrouUtilizador("modo-local", PERFIS.find((x)=>x.toLowerCase() === String(p).toLowerCase()) || "Administrador");
    if(!D.config.find((c)=>c.id === "listas")) this.aplicar([{tipo: "set", col: "config", id: "listas", dados: {...LISTAS_INICIAIS}}]);
    window.addEventListener("storage", (e)=>{ if(e.key === this.CHAVE){ const n = this.ler(); if(n){ for(const c of COLS) D[c] = n[c] || []; reindexar(); render(); } } });
  },
  aplicar(ops){
    for(const o of ops){
      const arr = D[o.col], i = arr.findIndex((x)=>x.id === o.id);
      if(o.tipo === "set"){ const obj = {...o.dados, id: o.id}; if(i >= 0) arr[i] = obj; else arr.push(obj); }
      else if(o.tipo === "update"){ if(i >= 0) Object.assign(arr[i], o.dados); }
      else if(o.tipo === "del"){ if(i >= 0) arr.splice(i, 1); }
    }
    reindexar(); this.gravar(); agendarRender();
    return Promise.resolve();
  },
  numerarRecibo(id){
    const p = D.pagamentos.find((x)=>x.id === id);
    if(!p || p.recibo) return Promise.resolve(null);
    const ano = String(p.data).slice(0, 4), cid = "recibos-" + ano;
    const n = ((D.contadores.find((c)=>c.id === cid) || {}).ultimo || 0) + 1;
    return this.aplicar([{tipo: "set", col: "contadores", id: cid, dados: {ultimo: n}},
      {tipo: "update", col: "pagamentos", id, dados: {recibo: {ano: Number(ano), num: n, txt: ano + "/" + String(n).padStart(4, "0"), em: Date.now()}}}]).then(()=>n);
  },
  utilizador(){ return "modo-local"; }
};

/* ---------- modo partilhado: Firebase (Firestore + login) ---------- */
const Nuvem = {
  db: null, auth: null, subs: [], subPerfil: null, emailAtual: null,
  iniciar(){
    firebase.initializeApp(FIREBASE_CONFIG);
    this.auth = firebase.auth();
    this.db = firebase.firestore();
    if(location.search.includes("emu=1")){ this.auth.useEmulator("http://127.0.0.1:9099"); this.db.useEmulator("127.0.0.1", 8080); }   // só para testes
    this.db.enablePersistence({synchronizeTabs: true}).catch(()=>{});     // funciona sem internet
    this.auth.onAuthStateChanged((u)=>{
      this.parar();
      if(u){ this.emailAtual = String(u.email || "").toLowerCase(); this.vigiarPerfil(); }
      else { this.emailAtual = null; for(const c of COLS) D[c] = []; reindexar(); saiuUtilizador(); }
      render();
    });
  },
  /* o perfil vem da ficha em utilizadores/{email} (o Administrador principal tem sempre acesso) */
  vigiarPerfil(){
    const email = this.emailAtual;
    if(email === ADMIN_PRINCIPAL){ nomeUtilizador = "Administrador"; this.comecar(email, "Administrador"); return; }
    let anterior;          // undefined = ainda não se sabe (null = sem acesso)
    this.subPerfil = this.db.collection("utilizadores").doc(email).onSnapshot((d)=>{
      const u = d.exists ? d.data() : null;
      const p = u && u.ativo === true && PERFIS.includes(u.perfil) ? u.perfil : null;
      nomeUtilizador = (u && u.nome) || email;
      if(p === anterior) return;
      anterior = p; this.pararDados();
      if(p) this.comecar(email, p);
      else semAcesso(u ? "A sua conta (" + email + ") está desativada. Fale com o Administrador."
                       : "A conta " + email + " ainda não foi autorizada na app. Peça ao Administrador para a adicionar em Clube → Utilizadores.");
    }, (err)=>semAcesso("Não foi possível confirmar o seu acesso (" + err.code + "). Na primeira utilização o aparelho precisa de internet."));
  },
  comecar(email, p){
    entrouUtilizador(email, p);
    this.subscrever(p);
    if(p === "Administrador") this.semear();
  },
  subscrever(p){
    this.pararDados();
    const cols = ["config", "cargos", "socios", "pagamentos", "movimentos", "entidades"];
    if(p !== "Consulta") cols.push("sociosPrivado");
    if(p === "Administrador") cols.push("utilizadores");
    for(const c of COLS) if(!cols.includes(c)) D[c] = [];
    for(const c of cols){
      this.subs.push(this.db.collection(c).onSnapshot((snap)=>{
        D[c] = snap.docs.map((d)=>({...d.data(), id: d.id}));
        reindexar(); agendarRender();
        if(c === "pagamentos") setTimeout(()=>numerarPendentes(), 0);     // dá nº aos recibos que ainda não têm
      }, (err)=>aviso("Sem acesso aos dados (" + c + ": " + err.code + "). Confirme as regras do Firestore.")));
    }
  },
  /* cria as listas e a ficha do clube na primeira vez (só se ainda não existirem no servidor) */
  semear(){
    const iniciais = {listas: LISTAS_INICIAIS, clube: CLUBE_INICIAL};
    for(const id of Object.keys(iniciais)){
      const ref = this.db.collection("config").doc(id);
      this.db.runTransaction((t)=>t.get(ref).then((d)=>{ if(!d.exists) t.set(ref, iniciais[id]); })).catch(()=>{});
    }
  },
  pararDados(){ this.subs.forEach((u)=>u()); this.subs = []; },
  parar(){ this.pararDados(); if(this.subPerfil){ this.subPerfil(); this.subPerfil = null; } },
  aplicar(ops){
    const promessas = [];
    for(let i = 0; i < ops.length; i += 400){
      const lote = this.db.batch();
      for(const o of ops.slice(i, i + 400)){
        const ref = this.db.collection(o.col).doc(o.id);
        if(o.tipo === "set") lote.set(ref, o.dados); else if(o.tipo === "update") lote.update(ref, o.dados); else lote.delete(ref);
      }
      // sem internet fica em fila e é enviado quando a ligação voltar
      promessas.push(lote.commit().catch((e)=>{ aviso("Não foi possível gravar na base de dados: " + e.message); throw e; }));
    }
    return Promise.all(promessas);
  },
  /* nº de recibo sem saltos nem repetições, mesmo com vários aparelhos: transação no contador do ano (precisa de internet) */
  numerarRecibo(id){
    const ref = this.db.collection("pagamentos").doc(id);
    return this.db.runTransaction((t)=>t.get(ref).then((d)=>{
      if(!d.exists || d.data().recibo) return null;
      const ano = String(d.data().data).slice(0, 4), cref = this.db.collection("contadores").doc("recibos-" + ano);
      return t.get(cref).then((c)=>{
        const n = ((c.exists && c.data().ultimo) || 0) + 1;
        t.set(cref, {ultimo: n});
        t.update(ref, {recibo: {ano: Number(ano), num: n, txt: ano + "/" + String(n).padStart(4, "0"), em: Date.now()}});
        return n;
      });
    }));
  },
  mudarPass(atual, nova){
    const u = this.auth.currentUser;
    const cred = firebase.auth.EmailAuthProvider.credential(u.email, atual);
    return u.reauthenticateWithCredential(cred).then(()=>u.updatePassword(nova));
  },
  utilizador(){ return this.emailAtual; },
  entrar(email, pass){ return this.auth.signInWithEmailAndPassword(email, pass); },
  sair(){ return this.auth.signOut(); }
};
const Store = MODO_FIREBASE ? Nuvem : Local;
const gravar = (ops)=> ops.length ? Store.aplicar(ops) : Promise.resolve();
const carimbo = (novo)=>{ const r = {alteradoPor: Store.utilizador(), alteradoEm: Date.now()};
  if(novo){ r.criadoPor = r.alteradoPor; r.criadoEm = r.alteradoEm; } return r; };

/* ---------- utilitários de ecrã ---------- */
const $ = (id)=>document.getElementById(id);
const norm = (s)=> String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const esc = (s)=> String(s == null ? "" : s).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const porTexto = (a, b)=> String(a).localeCompare(String(b), "pt");

function tabela(cab, linhas, vazioTxt){
  if(!linhas.length) return `<div class="vazio">${vazioTxt}</div>`;
  return `<table><thead><tr>${cab.map((c)=>`<th class="${c.num ? "num" : ""} ${c.cl || ""}">${c.t}</th>`).join("")}</tr></thead>
          <tbody>${linhas.join("")}</tbody></table>`;
}

/* ---------- janela / avisos ---------- */
function janela(tit, corpoHtml, acoes, larga){
  $("modal-tit").textContent = tit; $("modal-corpo").innerHTML = corpoHtml;
  $("modal").querySelector(".modal").classList.toggle("larga", !!larga);
  const z = $("modal-acoes"); z.innerHTML = "";
  for(const a of acoes){
    const b = document.createElement("button"); b.className = "bt " + (a.classe || ""); b.textContent = a.texto;
    if(a.id) b.id = a.id;
    b.onclick = ()=>{ if(a.manter){ a.acao && a.acao(); return; } fecharJanela(); a.acao && a.acao(); };
    z.appendChild(b);
  }
  $("modal").classList.add("aberto");
  $("modal").scrollTop = 0;
}
function fecharJanela(){ $("modal").classList.remove("aberto"); }
function confirmar(tit, html, txtOk, acao, classe){
  janela(tit, html, [{texto: "Cancelar", classe: "sec", id: "modal-cancelar"}, {texto: txtOk, classe: classe || "", id: "modal-ok", acao}]);
}
function aviso(txt, tit){ janela(tit || "Aviso", "<p>" + esc(txt).replace(/\n/g, "<br>") + "</p>", [{texto: "OK", id: "modal-ok"}]); }
let toastT;
function toast(txt){ const t = $("toast"); t.textContent = txt; t.style.display = "block"; clearTimeout(toastT); toastT = setTimeout(()=>t.style.display = "none", 2800); }

/* ---------- perfis e navegação ---------- */
let perfil = null;            // "Administrador" | "Tesoureiro" | "Consulta"
const eAdmin = ()=> perfil === "Administrador";
const eTes = ()=> perfil === "Administrador" || perfil === "Tesoureiro";
let ecraAtual = null;
const ECRAS = [["inicio", "📊", "Início"], ["socios", "👥", "Sócios"], ["quotas", "💶", "Quotas"], ["tesouraria", "🏦", "Tesouraria"], ["clube", "🏛️", "Clube"], ["sessao", "👤", "Sessão"]];
const RENDER = {};           // cada ecrã regista aqui a sua função de desenho

function entrouUtilizador(email, p){
  perfil = p;
  $("ecra-login").style.display = "none"; $("ecra-semacesso").style.display = "none";
  $("nav").innerHTML = ECRAS.map(([id, ic, t])=>`<button data-ecra="${id}"><span class="ic">${ic}</span>${t}</button>`).join("");
  $("nav").querySelectorAll("button").forEach((b)=>b.onclick = ()=>mostrar(b.dataset.ecra));
  mostrar(ecraAtual || "inicio", true);
}
function saiuUtilizador(){
  perfil = null; $("nav").innerHTML = ""; fecharJanela();
  ecraAtual = null; abaClube = "dados";          // a próxima sessão começa no Início
  $("ecra-semacesso").style.display = "none"; $("ecra-login").style.display = "flex";
}
function semAcesso(txt){
  perfil = null; $("nav").innerHTML = ""; fecharJanela();
  for(const c of COLS) D[c] = []; reindexar();
  $("semacesso-txt").textContent = txt;
  $("ecra-login").style.display = "none"; $("ecra-semacesso").style.display = "flex";
}
function mostrar(e, semScroll){
  if(!perfil) return;
  ecraAtual = e;
  document.querySelectorAll(".ecra").forEach((s)=>s.classList.toggle("ativo", s.id === "ecra-" + e));
  document.querySelectorAll("#nav button").forEach((b)=>b.classList.toggle("ativo", b.dataset.ecra === e));
  render(); if(!semScroll) window.scrollTo(0, 0);
}
function render(){
  const c = clube();
  $("hdr-tit").textContent = c.nome ? c.nome : "Quotas";
  const logo = $("hdr-logo");
  if(c.logo){ if(logo.getAttribute("src") !== c.logo) logo.src = c.logo; logo.style.display = "block"; } else logo.style.display = "none";
  $("hdr-user").textContent = perfil ? (Store.utilizador() || "") : "";
  $("hdr-perfil").textContent = perfil || "";
  if(perfil && ecraAtual && RENDER[ecraAtual]) RENDER[ecraAtual]();
  if(perfil) atualizarJanelaPagamento();
}

/* ---------- login ---------- */
$("login-entrar").onclick = ()=>{
  const email = $("login-email").value.trim(), pass = $("login-pass").value;
  $("login-erro").textContent = "";
  if(!email || !pass){ $("login-erro").textContent = "Indique o email e a palavra-passe."; return; }
  $("login-entrar").disabled = true;
  Nuvem.entrar(email, pass).then(()=>{ $("login-pass").value = ""; }).catch((e)=>{ $("login-erro").textContent =
      e.code === "auth/network-request-failed" ? "Sem ligação à internet. O primeiro login precisa de internet."
    : e.code === "auth/too-many-requests" ? "Demasiadas tentativas. Espere uns minutos e tente de novo."
    : "Email ou palavra-passe errados."; })
    .finally(()=>{ $("login-entrar").disabled = false; });
};
$("login-pass").addEventListener("keydown", (e)=>{ if(e.key === "Enter") $("login-entrar").click(); });
$("semacesso-sair").onclick = ()=>Nuvem.sair();

/* ---------- arranque ---------- */
const SDK = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]
  .map((f)=>"https://www.gstatic.com/firebasejs/10.14.1/" + f);
function carregarScript(src){ return new Promise((ok, erro)=>{ const s = document.createElement("script"); s.src = src; s.onload = ok;
  s.onerror = ()=>erro(new Error(src)); document.head.appendChild(s); }); }
function arrancar(){
  if(MODO_FIREBASE){
    SDK.reduce((p, src)=>p.then(()=>carregarScript(src)), Promise.resolve())
      .then(()=>Nuvem.iniciar())
      .catch(()=>aviso("Não foi possível carregar o Firebase. Na primeira utilização o aparelho precisa de internet."));
  }else{
    Store.iniciar();
  }
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
}
