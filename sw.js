/* ---------------------------------------------------------------------------
   sw.js — lớp lưu ngoại tuyến cho trang liên kết Smartlog

   Nguyên tắc: ƯU TIÊN MẠNG. Luôn thử tải bản mới trước, chờ tối đa 1,5 giây.
   Quá hạn hoặc mất sóng mới dùng bản đã lưu, VÀ báo rõ cho người dùng biết.
   Chỉ lưu đúng một thứ: chính trang index.html (các nút đã nằm sẵn trong đó).

   Muốn gỡ sạch trên MỌI máy còn mạng: đổi KILL thành true rồi tải file này lên.
   Muốn gỡ trên đúng một máy: mở trang với ?nosw=1
   --------------------------------------------------------------------------- */

var VERSION  = 'v1';                 // đổi khi sửa LOGIC file này (không cần đổi khi sửa link)
var CACHE    = 'sl-hub-' + VERSION;
var TIMEOUT  = 1500;                 // ms
var KILL     = false;
var SAVED_AT = 'x-saved-at';

// Dòng duy nhất phụ thuộc nơi lưu trữ. Tự suy ra từ scope nên GitHub Pages,
// Cloudflare Pages hay hosting công ty đặt trong thư mục con đều chạy y nguyên.
var SHELL = new URL('./', self.registration.scope).href;

self.addEventListener('install', function(){ self.skipWaiting(); });

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    if(KILL){ await wipe(); await self.registration.unregister(); await reloadAll(); return; }
    var names = await caches.keys();
    await Promise.all(names.filter(function(n){return n!==CACHE}).map(function(n){return caches.delete(n)}));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;

  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;      // link landing page: không can thiệp

  // cửa thoát hiểm cho đúng một máy
  if(url.searchParams.has('nosw')){
    e.respondWith((async function(){
      await wipe();
      await self.registration.unregister();
      return fetch(req, {cache:'no-store'});
    })());
    return;
  }

  if(req.mode !== 'navigate') return;                  // chỉ lo việc mở trang
  if(/admin\.html$/.test(url.pathname)) return;        // trang quản trị luôn lấy từ mạng

  e.respondWith(handle(e, req));
});

async function handle(event, req){
  var fromNet = fetchAndStore(event, req);
  event.waitUntil(fromNet.catch(function(){}));        // tải nốt ở nền dù đã trả bản lưu

  var raced = await Promise.race([
    fromNet.catch(function(){ return null; }),
    wait(TIMEOUT).then(function(){ return 'timeout'; })
  ]);
  if(raced && raced !== 'timeout') return raced;

  var cached = await caches.match(SHELL, {ignoreSearch:true});
  if(cached) return markStale(cached);

  try{ var late = await fromNet; if(late) return late; }catch(e){}
  return offlinePage();
}

function fetchAndStore(event, req){
  // no-store: bỏ qua cache của trình duyệt/CDN, luôn hỏi thẳng server
  return fetch(req, {cache:'no-store'}).then(function(res){
    // 404/500 KHÔNG được coi là thành công — tuyệt đối không ghi đè bản tốt
    if(!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : 0));
    event.waitUntil(store(res.clone()));
    return res;
  });
}

async function store(res){
  var body = await res.blob();
  var h = new Headers(res.headers);
  h.set(SAVED_AT, String(Date.now()));
  var c = await caches.open(CACHE);
  await c.put(SHELL, new Response(body, {status:200, headers:h}));
}

async function markStale(res){
  var savedAt = res.headers.get(SAVED_AT) || '';
  var html = await res.text();

  if(html.indexOf('data-cache="live"') !== -1){
    html = html.replace('data-cache="live"', 'data-cache="stale" data-saved-at="' + savedAt + '"');
  }else{
    // phòng khi dấu hiệu trong HTML bị xoá: vẫn phải cảnh báo, không được im lặng
    html = html.replace(/<body([^>]*)>/i,
      '<body$1><div style="background:#8a4b00;color:#fff;font:600 14px/1.4 system-ui,sans-serif;' +
      'padding:9px 14px;text-align:center">Đang xem bản lưu — link có thể đã cũ</div>');
  }

  return new Response(html, {
    status:200,
    headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}
  });
}

function offlinePage(){
  var html = '<!doctype html><html lang="vi"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Không có mạng</title></head>' +
    '<body style="margin:0;display:grid;place-items:center;min-height:100dvh;background:#f4f6f8;color:#151b26;' +
    'font:400 17px/1.45 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">' +
    '<div style="text-align:center;padding:24px;max-width:340px">' +
    '<p style="font-weight:600;font-size:19px;margin:0 0 8px">Chưa mở được trang</p>' +
    '<p style="color:#5b6775;margin:0 0 20px">Máy này chưa có bản lưu và hiện không có mạng. ' +
    'Hãy bật dữ liệu di động hoặc tìm chỗ có sóng rồi mở lại.</p>' +
    '<button onclick="location.reload()" style="font:600 17px system-ui;padding:13px 22px;border:0;' +
    'border-radius:10px;background:#3543f6;color:#fff">Thử lại</button></div></body></html>';
  return new Response(html, {status:200, headers:{'Content-Type':'text/html; charset=utf-8'}});
}

function wait(ms){ return new Promise(function(r){ setTimeout(r, ms) }); }

async function wipe(){
  var names = await caches.keys();
  await Promise.all(names.map(function(n){ return caches.delete(n) }));
}

async function reloadAll(){
  var list = await self.clients.matchAll({type:'window'});
  list.forEach(function(c){ c.navigate(c.url) });
}
