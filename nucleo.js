"use strict";
/* =====================================================================
   NÚCLEO — configuração, base de dados, login, perfis e navegação
   ===================================================================== */

/* A ligação à base de dados (FIREBASE_CONFIG) está no ficheiro config.js:
   - versão do clube: config.js com os dados do projeto Firebase do clube;
   - versão de testes: config.js vazio → MODO LOCAL (dados só neste computador, sem login). */
const VERSAO_APP = "5.4";

/* Administrador principal: tem sempre acesso total, mesmo sem ficha em Utilizadores.
   Tem de ser igual ao email escrito nas regras do Firestore. */
const ADMIN_PRINCIPAL = "administrador@quotas-clube.pt";

const MODO_FIREBASE = !!(FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);
const PERFIS = ["Administrador", "Tesoureiro", "Consulta"];

/* ---------------------------------------------------------------------
   DADOS (coleções na base de dados) — valores em euros guardados em CÊNTIMOS
   config/clube:        {nome, nif, telefone, email, morada, codigoPostal, localidade, logo,
                         valores:{"2026": {joia, mensal}, ...}}   (joia/quotaMensal: versão 1, só leitura; «anual» das versões 1–4 já não se usa)
   config/listas:       {tiposSocio:[...], tiposIsentos:[...], formasPagamento:[...]}
   cargos/{id}:         {orgao, cargo, socioId, nome, mandato}
   socios/{id}:         {numero (inteiro, texto com letra como "203A", ou null = sem nº), historicoNumeros:[{numero, ate}], ativo, nome, nomeAbreviado, dataNascimento, telemovel, telefone, email, morada, codigoPostal, localidade,
                         tipo, pagoAte ("AAAA-MM"), inatividade:[{de, ate, situacao}], situacao (saiu|suspenso|paga, só nos inativos),   (periodicidade/perHist: versões 1–4, já não se usam)
                         dataEntrada, dataSaida, observacoes, nifMasc, nibMasc,
                         agregado:[{id, relacao}], criadoPor, criadoEm, alteradoPor, alteradoEm}
   sociosPrivado/{id}:  {nif, nib}   (só Administrador e Tesoureiro conseguem ler)
   utilizadores/{email}: {nome, perfil, ativo}
   pagamentos/{id}:     {socioId, numeroSocio, nomeSocio, data, forma, itens:[{tipo: Joia|Quota, periodo: "joia"|"AAAA-MM", rot, valor}],
                         meses, total, obs, anulado:{por, em, motivo}|null, recebidoPorNome,
                         vinhetas:["2027", ...], vinhetaEntregue:{por, nome, em}|null,   (subtotal/desconto: versões 1–4)
                         recibo:{ano, num, txt:"2026/0001", em}|null, criadoPor, criadoEm}
   movimentos/{id}:     {tipo: "Saída", data, descricao, valor, forma, motivo, anulado, criadoPor, criadoNome, criadoEm}   (versão 5.3: só saídas de valores)
                        (versões 1–5.2: tipo Receita|Despesa|Transferência, com conta Caixa|Banco, fornecedor, estado pago|porPagar… — ainda se leem)
   entidades/{id}:      fornecedores das versões 1–5.2 (já não se usam)
   fotos/{socioId}:     {img}  (foto da ficha, ~360×480 JPEG; só se lê ao abrir a ficha. A miniatura fica em socios.fotoMini)
   config/tesouraria:   {dataInicial, saldoInicial:{Caixa, Banco}}
   contadores/recibos-2026: {ultimo}   (último nº de recibo do ano; só se mexe numa transação)
   --------------------------------------------------------------------- */
const COLS = ["config", "cargos", "socios", "sociosPrivado", "utilizadores", "pagamentos", "contadores", "movimentos", "entidades", "fotos"];
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
    for(const it of p.itens || []){
      Idx.pagos.get(p.socioId).add(it.periodo);
      // pagamentos antigos (até à versão 4) com o ano inteiro («2026»): contam como os 12 meses pagos
      if(/^\d{4}$/.test(it.periodo)) for(let m = 1; m <= 12; m++) Idx.pagos.get(p.socioId).add(it.periodo + "-" + String(m).padStart(2, "0"));
    }
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
                       logo: "", joia: 0, quotaMensal: 0};
const clube = ()=> ({...CLUBE_INICIAL, ...(D.config.find((c)=>c.id === "clube") || {})});
const listas = ()=>{ const l = D.config.find((c)=>c.id === "listas") || {};
  const r = {}; for(const k of Object.keys(LISTAS_INICIAIS)) r[k] = l[k] || LISTAS_INICIAIS[k];
  return r; };
/* código interno fixo do sócio (o nº de sócio pode mudar nas renumerações; o código nunca muda) */
const novoIdSocio = ()=> "S" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const numTxt = (s)=> s && s.numero ? "nº " + s.numero : "sem nº";
const socioAtivo = (s)=> s.ativo !== false;          // escolhido à mão na ficha (a data de saída é só informativa)
/* situação de um sócio INATIVO (versão 5.2):
   saiu     — saiu / desistiu: não paga quotas e perde o nº na renumeração (o que acontecia antes);
   suspenso — suspenso pela Direção (ex.: doença prolongada): não paga, mantém o nº e a antiguidade e conta como sócio nas listagens;
   paga     — inativo a pagar quotas: paga como um ativo e mantém o nº. */
const SITUACOES = {saiu: "Saiu / desistiu", suspenso: "Suspenso pela Direção (não paga, mantém o nº)", paga: "Inativo a pagar quotas (mantém o nº)"};
const situacaoSocio = (s)=> socioAtivo(s) ? "" : (SITUACOES[s.situacao] ? s.situacao : "saiu");
const mantemNumero = (s)=> socioAtivo(s) || situacaoSocio(s) !== "saiu";
const contaComoSocio = (s)=> socioAtivo(s) || situacaoSocio(s) === "suspenso";     // ativos + suspensos (listagens e contagens)
const estadoTxt = (s)=> socioAtivo(s) ? "Ativo" : ({suspenso: "Suspenso", paga: "Inativo (paga)"})[situacaoSocio(s)] || "Inativo";
const estadoChip = (s)=> socioAtivo(s) ? `<span class="chip verde">Ativo</span>` : situacaoSocio(s) === "suspenso" ? `<span class="chip amarelo">Suspenso</span>`
  : `<span class="chip verm">${esc(estadoTxt(s))}</span>`;

let nomeUtilizador = "";       // nome de quem está a usar a app (vai nos recibos: «Recebido por»)
let renderAgendado = false;
function agendarRender(){ if(renderAgendado) return; renderAgendado = true; requestAnimationFrame(()=>{ renderAgendado = false; render(); }); }

/* ---------- modo local (versão de testes): base de dados interna do Chrome (IndexedDB) ----------
   Grava tudo no próprio computador, sem limite prático de espaço (aguenta todos os sócios e fotos).
   Cada coleção é guardada inteira numa linha; as fotos ficam uma a uma (para não regravar todas de cada vez). */
const Local = {
  BD: "quotas_app_testes", CHAVE_ANTIGA: "quotas_app_v1_dados", db: null,
  canal: typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("quotas_app_testes") : null,
  abrir(){
    return new Promise((ok, erro)=>{
      const r = indexedDB.open(this.BD, 1);
      r.onupgradeneeded = ()=>{ const db = r.result; db.createObjectStore("colecoes"); db.createObjectStore("fotos"); };
      r.onsuccess = ()=>ok(r.result); r.onerror = ()=>erro(r.error);
    });
  },
  tx(stores, modo, fn){
    return new Promise((ok, erro)=>{ const t = this.db.transaction(stores, modo); fn(t); t.oncomplete = ()=>ok(); t.onerror = t.onabort = ()=>erro(t.error); });
  },
  pedir(req){ return new Promise((ok, erro)=>{ req.onsuccess = ()=>ok(req.result); req.onerror = ()=>erro(req.error); }); },
  carregar(){
    const t = this.db.transaction(["colecoes", "fotos"], "readonly");
    const cols = COLS.filter((c)=>c !== "fotos");
    return Promise.all([...cols.map((c)=>this.pedir(t.objectStore("colecoes").get(c))), this.pedir(t.objectStore("fotos").getAll())])
      .then((res)=>{ cols.forEach((c, i)=>{ D[c] = res[i] || []; }); D.fotos = res[res.length - 1] || []; reindexar(); });
  },
  /* grava as coleções mexidas (e as fotos uma a uma) */
  guardar(cols, fotosMexidas){
    const lista = [...cols].filter((c)=>c !== "fotos");
    return this.tx(["colecoes", "fotos"], "readwrite", (t)=>{
      for(const c of lista) t.objectStore("colecoes").put(D[c], c);
      for(const id of fotosMexidas){ const f = D.fotos.find((x)=>x.id === id);
        if(f) t.objectStore("fotos").put(f, id); else t.objectStore("fotos").delete(id); }
    });
  },
  /* passa para a base de dados interna os dados de testes antigos (versões até à 5.0, guardados no localStorage) */
  migrarAntigo(){
    let d = null; try{ const t = localStorage.getItem(this.CHAVE_ANTIGA); if(t) d = JSON.parse(t); }catch(e){}
    if(!d) return Promise.resolve();
    for(const c of COLS) D[c] = d[c] || [];
    return this.guardar(new Set(COLS), new Set(D.fotos.map((f)=>f.id))).then(()=>{ try{ localStorage.removeItem(this.CHAVE_ANTIGA); }catch(e){} });
  },
  iniciar(){
    return this.abrir().then((db)=>{ this.db = db; return this.carregar(); })
      .then(()=> D.socios.length || D.config.length ? null : this.migrarAntigo())
      .then(()=>{
        reindexar();
        const p = new URLSearchParams(location.search).get("perfil");
        nomeUtilizador = "Modo local";
        entrouUtilizador("modo-local", PERFIS.find((x)=>x.toLowerCase() === String(p).toLowerCase()) || "Administrador");
        if(!D.config.find((c)=>c.id === "listas")) this.aplicar([{tipo: "set", col: "config", id: "listas", dados: {...LISTAS_INICIAIS}}]);
        // outro separador com a app aberta gravou: volta a ler
        if(this.canal) this.canal.onmessage = ()=>this.carregar().then(()=>render());
      })
      .catch((e)=>aviso("Não foi possível abrir a base de dados interna deste computador: " + (e && e.message ? e.message : e)));
  },
  aplicar(ops){
    const cols = new Set(), fotos = new Set();
    for(const o of ops){
      const arr = D[o.col], i = arr.findIndex((x)=>x.id === o.id);
      if(o.tipo === "set"){ const obj = {...o.dados, id: o.id}; if(i >= 0) arr[i] = obj; else arr.push(obj); }
      else if(o.tipo === "update"){ if(i >= 0) Object.assign(arr[i], o.dados); }
      else if(o.tipo === "del"){ if(i >= 0) arr.splice(i, 1); }
      cols.add(o.col); if(o.col === "fotos") fotos.add(o.id);
    }
    reindexar(); agendarRender();
    return this.guardar(cols, fotos)
      .then(()=>{ if(this.canal) this.canal.postMessage("mudou"); })
      .catch((e)=>{ aviso("Não foi possível guardar os dados neste computador: " + (e && e.message ? e.message : e)); throw e; });
  },
  numerarRecibo(id){
    const p = D.pagamentos.find((x)=>x.id === id);
    if(!p || p.recibo) return Promise.resolve(null);
    const ano = String(p.data).slice(0, 4), cid = "recibos-" + ano;
    const n = ((D.contadores.find((c)=>c.id === cid) || {}).ultimo || 0) + 1;
    return this.aplicar([{tipo: "set", col: "contadores", id: cid, dados: {ultimo: n}},
      {tipo: "update", col: "pagamentos", id, dados: {recibo: {ano: Number(ano), num: n, txt: ano + "/" + String(n).padStart(4, "0"), em: Date.now()}}}]).then(()=>n);
  },
  lerFoto(id){ return Promise.resolve(D.fotos.find((f)=>f.id === id) || null); },
  lerFotos(){ return Promise.resolve(D.fotos.slice()); },
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
  /* as fotos não se carregam todas: só a da ficha que se abre */
  lerFoto(id){ return this.db.collection("fotos").doc(id).get().then((d)=>d.exists ? {...d.data(), id} : null); },
  lerFotos(){ return this.db.collection("fotos").get().then((q)=>q.docs.map((d)=>({...d.data(), id: d.id}))); },
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
function fecharJanela(){ $("modal").classList.remove("aberto"); limparPesquisas(); }

/* ---------- caixas de pesquisa ----------
   Depois de cada função (fechar uma janela: gravar, cancelar, ver; ou imprimir) as pesquisas ficam vazias.
   Enter numa pesquisa abre o primeiro resultado da lista. */
const PESQUISAS = {"soc-pesq": "soc-lista", "q-pesq": "q-div-lista", "q-quadro-pesq": "q-quadro", "q-pag-pesq": "q-pag-lista",
                   "q-vin-pesq": "q-vin-lista", "t-ext-pesq": "t-ext", "t-forn-pesq": "t-forn-lista"};
function limparPesquisas(){
  let mudou = false;
  for(const id of Object.keys(PESQUISAS)){ const el = $(id); if(el && el.value){ el.value = ""; mudou = true; } }
  if(mudou && perfil) agendarRender();
}
/* a pesquisa corresponde? (todas as palavras escritas aparecem nos campos) */
function corresponde(q, ...campos){
  q = norm(q); if(!q) return true;
  const t = norm(campos.join(" "));
  return q.split(/\s+/).every((x)=>t.includes(x));
}
document.addEventListener("keydown", (e)=>{
  if(e.key !== "Enter" || !PESQUISAS[e.target.id]) return;
  const tr = document.querySelector("#" + PESQUISAS[e.target.id] + " tr.clic");
  if(tr){ e.preventDefault(); tr.click(); }
});
/* ao clicar num campo que já tem valor, fica tudo selecionado: o que se escrever substitui o que lá estava */
const SELECIONAVEIS = ["text", "search", "number", "email", "tel", "url"];
document.addEventListener("focusin", (e)=>{
  const el = e.target;
  if(el.tagName !== "INPUT" || !SELECIONAVEIS.includes(el.type) || el.readOnly || el.disabled || !el.value) return;
  try{ el.select(); el._selecionado = true; }catch(err){}
});
document.addEventListener("mouseup", (e)=>{ if(e.target._selecionado){ e.preventDefault(); e.target._selecionado = false; } }, true);
document.addEventListener("focusout", (e)=>{ e.target._selecionado = false; });
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
    // versão de testes: cabeçalho cor de laranja com a indicação, para nunca se confundir com a do clube
    document.body.classList.add("modo-teste");
    Store.iniciar();
  }
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(()=>{});
}
