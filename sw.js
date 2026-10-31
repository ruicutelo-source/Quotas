// Service worker: guarda a app no aparelho para funcionar sem internet.
// Ao publicar uma versão nova, aumente o número da versão abaixo.
const PREFIXO = "quotas-app-";
const VERSAO = PREFIXO + "3.0.0";
const FICHEIROS = ["./", "./index.html", "./estilo.css", "./validar.js", "./nucleo.js", "./inicio.js", "./socios.js", "./quotas.js", "./recibos.js", "./mapas.js",
                   "./clube.js", "./sessao.js", "./manifest.json", "./icon-192.png", "./icon-512.png",
                   "./icon-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  const SDK = ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]
    .map((f) => "https://www.gstatic.com/firebasejs/10.14.1/" + f);
  e.waitUntil(caches.open(VERSAO)
    .then((c) => c.addAll(FICHEIROS).then(() => c.addAll(SDK.concat(["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"])).catch(() => {})))
    .then(() => self.skipWaiting()));
});

// Só apaga as cópias antigas DESTA app (não toca nas das apps Pedidos e Stock, que usam o mesmo endereço)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith(PREFIXO) && n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro (para receber atualizações); sem rede, usa a cópia guardada.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = e.request.url;
  // a base de dados e o login passam sempre diretamente pela rede (o Firebase trata o modo offline)
  if (!url.startsWith(self.location.origin) && !url.includes("gstatic.com/firebasejs") && !url.includes("cdnjs.cloudflare.com/ajax/libs/jspdf")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSAO).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request, {ignoreSearch: true}).then((r) => r || caches.match("./index.html")))
  );
});
