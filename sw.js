
const CACHE_NAME = 'mercearia-joao-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar requisições - Cache first para arquivos estáticos, Network first para API
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Para requisições de API (localhost:8000), usar network first
  if (url.hostname === 'localhost' && url.port === '8000') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cachear resposta bem-sucedida
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Em caso de erro de rede, tentar cache
          return caches.match(request) || new Response('Sem conexão', { status: 503 });
        })
    );
    return;
  }
  
  // Para arquivos estáticos, usar cache first
  event.respondWith(
    caches.match(request)
      .then(response => {
        // Retornar do cache se encontrado
        if (response) {
          return response;
        }
        
        // Caso contrário, buscar da rede
        return fetch(request).then(response => {
          // Não cachear respostas inválidas
          if (!response || response.status !== 200) {
            return response;
          }
          
          // Cachear resposta bem-sucedida
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          
          return response;
        });
      })
      .catch(() => {
        // Fallback para página offline se disponível
        return caches.match('/index.html');
      })
  );
});

// Limpeza de caches antigos na ativação
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
