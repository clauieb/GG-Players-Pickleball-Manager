// GG Players — offline app-shell cache.
//
// Strategy: cache-first, update-in-background ("stale-while-revalidate").
// Every GET request is answered from cache instantly if we have it (so the
// app opens even with zero signal), while a network request runs in the
// background to refresh the cache for next time. If there's no cache entry
// yet, it falls through to the network like normal.
//
// IMPORTANT: bump CACHE_NAME (e.g. v2 -> v3) whenever you push changes to
// index.html / manifest.json / icon.svg. Otherwise returning visitors keep
// seeing the old cached version until the background refresh catches up.

var CACHE_NAME = 'gg-players-cache-v1';

var CORE_ASSETS = [
  './',
  './index.html',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.13.2/firebase-database-compat.js'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(CORE_ASSETS.map(function(url){
        return cache.add(url).catch(function(err){
          // Don't let one failed asset (e.g. a flaky CDN fetch) block install.
          console.warn('SW: failed to pre-cache', url, err);
        });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  // Only handle simple GETs — never intercept Firebase's realtime sync
  // traffic (which uses WebSocket, not fetch, so this wouldn't touch it
  // anyway) or any write requests.
  if(req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(function(cached){
      var networkFetch = fetch(req).then(function(response){
        if(response && response.status === 200){
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return response;
      }).catch(function(){
        // Offline and nothing cached for this request — nothing more we can do.
        return cached;
      });
      // Serve cached instantly if we have it; otherwise wait on the network.
      return cached || networkFetch;
    })
  );
});
