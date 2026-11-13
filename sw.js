/* 牛马谷：离线缓存 + 自动更新。一般不用改这个文件。
   它会读 index.html 里 NMJS 列出的所有 .js 文件，一起下载、一起比较、一起更新。 */
var CACHE='niuma-cache';
var STATIC=['manifest.webmanifest','icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png'];
function abs(f){return new URL(f,self.registration.scope).href}
function fresh(u){return fetch(u+(u.indexOf('?')<0?'?':'&')+'nm='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw r.status;return r})}
/* index.html 里 NMJS=[...] 列出的就是全部游戏代码文件 */
function scriptsOf(html){var m=/NMJS=\[([^\]]*)\]/.exec(html),a=[],re=/'([^']+)'/g,q;if(m)while((q=re.exec(m[1])))a.push(q[1]);return a}
function buildOf(t){var m=/NMBUILD='([^']*)'/.exec(t);return m?m[1]:''}
/* 从网站下载 index.html 和它用到的全部 .js；只要有一个下载失败就整体放弃，避免新旧文件混在一起 */
function download(){var iu=abs('index.html');
  return fresh(iu).then(function(r){return r.clone().text().then(function(t){
    return Promise.all(scriptsOf(t).map(abs).map(function(u){return fresh(u).then(function(r2){return r2.clone().text().then(function(t2){return{u:u,r:r2,t:t2}})})}))
      .then(function(fs){return[{u:iu,r:r,t:t}].concat(fs)})})})}
function putStatic(c,force){return Promise.all(STATIC.map(function(f){var u=abs(f);return c.match(u).then(function(h){if(h&&!force)return;return fresh(u).then(function(r){return c.put(u,r)})}).catch(function(){})}))}

/* 第一次安装：把游戏存到手机里。已经存过一个版本的话先不动，交给 check() 去比较并提示 */
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.match(abs('index.html')).then(function(hit){if(hit)return;return download().then(function(fs){return Promise.all(fs.map(function(f){return c.put(f.u,f.r)}))})})
      .then(function(){return putStatic(c)})
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}));
});

/* 打开游戏：先用手机里存的（没网也能玩），手机里没有的才上网拿 */
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var url=new URL(req.url);if(url.origin!==location.origin)return;
  var page=req.mode==='navigate'||url.href===self.registration.scope;
  var key=page?abs('index.html'):url.origin+url.pathname;
  e.respondWith(caches.open(CACHE).then(function(c){return c.match(key).then(function(hit){
    if(hit)return hit;
    return fetch(page?key:req).then(function(r){if(r.ok)c.put(key,r.clone());return r})
      .catch(function(){return new Response('没有网络，游戏也还没下载过。连上网再打开一次。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})});
  })}));
});

/* 游戏打开后来问“有没有新版本”：后台把网站上的文件全部下载下来比较，有不一样的就整体换上，再让游戏弹提示 */
function check(){return caches.open(CACHE).then(function(c){return download().then(function(fs){
  return Promise.all(fs.map(function(f){return c.match(f.u).then(function(h){return h?h.text():null})})).then(function(olds){
    putStatic(c,true);
    var changed=fs.some(function(f,i){return olds[i]!==f.t});if(!changed)return null;
    return Promise.all(fs.map(function(f){return c.put(f.u,f.r)})).then(function(){return olds[0]!==null?{build:buildOf(fs[0].t)}:null})})})})}
self.addEventListener('message',function(e){
  var d=e.data||{};if(d.type!=='nm-check')return;var src=e.source;
  e.waitUntil(check().then(function(r){if(!src)return;if(r)src.postMessage({type:'nm-update',build:r.build});else src.postMessage({type:'nm-none'})}).catch(function(){if(src)src.postMessage({type:'nm-fail'})}));
});
