/* D7 SUPER hub v49 — unified Super Bot D + Daniel, bot builder, watchdog, shared memory */
(function(){
var $=function(i){return document.getElementById(i)},LS=localStorage;
function J(k,d){try{var v=JSON.parse(LS.getItem(k));return v==null?d:v}catch(e){return d}}
function S(k,v){try{LS.setItem(k,JSON.stringify(v))}catch(e){}}
document.querySelectorAll('[data-t]').forEach(function(b){b.onclick=function(){document.querySelectorAll('section').forEach(function(s){s.classList.toggle('on',s.id==b.dataset.t)})}});
/* shared memory (all bots) */
var MEM=J('d7s.mem',{hist:[],facts:{},topic:''});function saveMem(){MEM.hist=MEM.hist.slice(-60);S('d7s.mem',MEM)}
/* knowledge */
var KB=[];function addKB(t,s){if(t&&String(t).length>3)KB.push({t:String(t),s:s||''})}
function walk(o,p){if(o==null)return;if(typeof o=='string'){addKB(o,p);return}if(Array.isArray(o)){if(o.every(function(x){return typeof x=='string'}))addKB(o.join(' — '),p);else o.forEach(function(x){walk(x,p)});return}if(typeof o=='object')for(var k in o)walk(o[k],k)}
if(window.D7_GOOGLE_KNOWLEDGE)walk(window.D7_GOOGLE_KNOWLEDGE,'gk');
fetch('d-knowledge.json').then(function(r){return r.json()}).then(function(j){walk(j,'d')}).catch(function(){});
var s=document.createElement('script');s.src='js/google-knowledge.js';s.onload=function(){if(window.D7_GOOGLE_KNOWLEDGE)walk(window.D7_GOOGLE_KNOWLEDGE,'gk')};s.onerror=function(){};document.head.appendChild(s);
var BUILTIN=[['bpm tempo','BPM to liczba uderzeń na minutę; house ~120–128, techno ~125–140, hip-hop ~80–100.'],['milkdrop wizualizacja viz','MilkDrop to wizualizacja reagująca na dźwięk — dostępna w D7 DJ PRO8 (przycisk 🎧).'],['kali radio','Kali radio jest na stronie „📻 Kali radio”.'],['pioneer cue loop sync','Funkcje Pioneer (CUE, LOOP, SYNC, hot cue) są w D7 DJ PRO8 / Pioneer.'],['kreator bot','W „Kreator botów” dodasz dowolną liczbę botów: nazwa, rola, styl.']];
BUILTIN.forEach(function(b){addKB(b[0]+' :: '+b[1],'builtin')});
function norm(x){return String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/[^a-z0-9 ]/g,' ')}
function tri(w){var r={};w=' '+w+' ';for(var i=0;i<w.length-2;i++)r[w.substr(i,3)]=1;return r}
function search(q){var qw=norm(q).split(/\s+/).filter(function(w){return w.length>2&&STOP.indexOf(w)<0});if(!qw.length)return null;var best=null,bs=0;
 KB.forEach(function(e){var n=e.n||(e.n=norm(e.t)),sc=0;qw.forEach(function(w){if(n.indexOf(w)>=0)sc+=2;else{var t=tri(w),h=0,c=0;for(var g in t){c++;if(n.indexOf(g)>=0)h++}if(c&&h/c>.7)sc+=1}});sc/=qw.length;if(sc>bs){bs=sc;best=e}});return bs>=1?best:null}
var STOP='the and what jak jest czy co to sie nie dla ale who how are you mnie moje jaki jaka'.split(' ');
/* intents PL/EN */
var INT=[[/(wlacz|odpal|play|open|otworz).*(radio|kali)/,function(){go('kali-live.html');return'Otwieram Kali radio 📻'}],
[/(wlacz|odpal|open|otworz|start).*(dj|deck|pioneer|mix)/,function(){go('index.html');return'Otwieram D7 DJ PRO8 🎧'}],
[/(wizual|viz|milkdrop|fx)/,function(){go('index.html#viz');return'Wizualizacje MilkDrop są w D7 DJ PRO8 — otwieram.'}],
[/(stworz|utworz|dodaj|create|make).*(bot)\s+(.{8,})/,function(t,m){return 'Bot tworzy bota: '+genBot(m[3])+'. Zobacz „Kreator botów”.'}],
[/(stworz|utworz|dodaj|create|make).*(bot)/,function(t){var st=/rap/.test(t)?'rapper':/(fx|wizual)/.test(t)?'fx':/(app|aplik)/.test(t)?'app':/web/.test(t)?'web':'music';var m=t.match(/bot[a-z]*\s+([a-z0-9]+)/);addBot(m?m[1]:'Bot'+(BOTS.length+1),'utworzony z czatu',st);return'Utworzyłem bota ('+st+'). Zobacz „Kreator botów”.'}],
[/(generuj|wygeneruj|generate|zrob).*(muzyk|utwor|beat|song|track)/,function(t){$('mp').value=t;musicgen();return'Przekazuję do panelu Muzyka AI.'}],
[/(runda|wszystkie boty|all bots|sync)/,function(){setTimeout(round,10);return'Startuję rundę wszystkich botów 🔁'}],
[/(zapamietaj|remember)\s+(.+)/,function(t,m){MEM.facts[Date.now()]=m[2];saveMem();return'Zapamiętane: „'+m[2]+'”.'}],
[/(co pamietasz|what do you remember|pamiec)/,function(){var f=Object.values(MEM.facts);return f.length?'Pamiętam: '+f.slice(-8).join('; '):'Nic jeszcze nie zapisałem. Napisz „zapamiętaj …”.'}],
[/^(czesc|hej|siema|hello|hi|elo)\b/,function(){return'Cześć Daniel! Jestem D7 SUPER (Super Bot D + Daniel). Mogę otworzyć DJ, radio, wizualizacje, tworzyć boty i szukać w wiedzy offline.'}],
[/(pomoc|help|co umiesz)/,function(){return'Komendy: „włącz radio”, „otwórz DJ”, „wizualizacje”, „stwórz bota raper X”, „runda”, „zapamiętaj …”, „co pamiętasz”, „generuj muzykę …”, albo zadaj pytanie.'}]];
function go(u){setTimeout(function(){location.href=u},700)}
var STY={music:'🎵',fx:'🌈',rapper:'🎤',app:'📱',web:'🌐'};
function styleWrap(b,txt){if(b.style=='rapper')return txt+' — yo, D7 na bicie 🎤';if(b.style=='fx')return txt+' ✨';return txt}
/* brain */
var EP=LS.getItem('d7s.ep')||'';
function online(q,b){if(!navigator.onLine)return Promise.reject();var c=new AbortController();setTimeout(function(){c.abort()},12000);
 var sys='Jesteś '+(b?b.name+' ('+(b.role||b.style)+')':'D')+' w aplikacji D7 SUPER Daniela Dydo. Odpowiadaj po polsku, krótko. Nie wymyślaj faktów; jeśli nie wiesz, powiedz to.';
 var hist=MEM.hist.slice(-6).map(function(h){return{role:h.r=='u'?'user':'assistant',content:String(h.t).slice(0,400)}});
 if(EP)return fetch(EP,{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({q:q,bot:b&&{name:b.name,role:b.role,style:b.style},history:MEM.hist.slice(-10)})}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){var a=j.answer||j.reply||j.text;if(!a)throw 0;return a+' [źródło: Mózg AI '+EP+']'});
 var K=LS.getItem('d7s.key'),KU=LS.getItem('d7s.keyurl')||'https://api.openai.com/v1/chat/completions',KM=LS.getItem('d7s.keymodel')||'gpt-4o-mini';
 if(K&&$('pol').checked!==false&&LS.getItem('d7s.usekey')=='1')return fetch(KU,{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+K},body:JSON.stringify({model:KM,messages:[{role:'system',content:sys}].concat(hist,[{role:'user',content:q}])})}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){return j.choices[0].message.content+' [źródło: własny klucz API · '+KM+']'});
 if(!$('pol').checked)return Promise.reject();
 return fetch('https://text.pollinations.ai/openai',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'openai',messages:[{role:'system',content:sys}].concat(hist,[{role:'user',content:q}])})}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(j){var a=j.choices&&j.choices[0].message.content;if(!a)throw 0;return a.slice(0,1500)+' [źródło: Pollinations.ai (darmowe, bez klucza)]'})
  .catch(function(){return fetch('https://text.pollinations.ai/'+encodeURIComponent(sys+' Pytanie: '+q),{signal:c.signal}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(a){if(!a||a.length<2)throw 0;return a.slice(0,1500)+' [źródło: Pollinations.ai]'})})}
function offline(q,b){var t=norm(q);LASTINT=0;for(var i=0;i<INT.length;i++){var m=t.match(INT[i][0]);if(m){LASTINT=1;return INT[i][1](t,m)}}
 var ctx=/^(a |i |a co|and|tez|więcej|wiecej|more)/.test(t)&&MEM.topic?MEM.topic+' '+q:q;var h=search(ctx);
 if(h){MEM.topic=q;var a=h.t.split('::').pop().trim();return(a.length>400?a.slice(0,400)+'…':a)+' [źródło: wiedza offline]'}
 return 'Nie mam tego w wiedzy offline i nie będę zgadywać. '+(EP?'Mózg AI online nie odpowiedział.':'Ustaw „Mózg AI”, by pytać online.')}
function websearch(q){if(!navigator.onLine||!$('web').checked)return Promise.reject();var c=new AbortController();setTimeout(function(){c.abort()},7000);
 var t=q.replace(/^(co to (jest|sa)|kim (jest|byl)|what is|who is|szukaj|wyszukaj|search)\s*/i,'').replace(/[?!.]+$/,'').trim();
 return fetch('https://pl.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch='+encodeURIComponent(t),{signal:c.signal}).then(function(r){return r.json()}).then(function(j){var h=j.query&&j.query.search[0];if(!h)throw 0;
  return fetch('https://pl.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(h.title.replace(/ /g,'_')),{signal:c.signal}).then(function(r){return r.json()}).then(function(p){if(!p.extract)throw 0;return p.extract.slice(0,500)+' [źródło: Wikipedia PL · '+((p.content_urls&&p.content_urls.desktop.page)||'pl.wikipedia.org')+']'})})
 .catch(function(){return fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(t.replace(/ /g,'_')),{signal:c.signal}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(p){if(!p.extract||p.type=='disambiguation')throw 0;return p.extract.slice(0,500)+' [źródło: '+p.content_urls.desktop.page+']'})})
 .catch(function(){return fetch('https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q='+encodeURIComponent(t),{signal:c.signal}).then(function(r){return r.json()}).then(function(d){if(!d.AbstractText)throw 0;return d.AbstractText.slice(0,500)+' [źródło: DuckDuckGo · '+(d.AbstractURL||'duckduckgo.com')+']'})})}
function learned(q){var n=norm(q),L=MEM.learn||{};return L[n]}
function ask(q,b){var L=learned(q);if(L)return Promise.resolve((b?styleWrap(b,L):L)+' [źródło: pamięć wspólna]');
 var off=offline(q,b),miss=/^Nie mam tego/.test(off);if(LASTINT)return Promise.resolve(b?styleWrap(b,off):off);
 return online(q,b).then(function(a){return a},function(){if(!miss)return off;return websearch(q).then(function(a){return a},function(){return off})})
 .then(function(a){if(!/^Nie mam tego/.test(a)&&!/(Otwieram|Utworzy|Startuj|Zapami)/.test(a)){MEM.learn=MEM.learn||{};var k=Object.keys(MEM.learn);if(k.length>500)delete MEM.learn[k[0]];MEM.learn[norm(q)]=a.replace(/ \[źródło:[^\]]*\]$/,'');saveMem()}return a}).then(function(a){return b?styleWrap(b,a):a})}
/* bots */
var BOTS=J('d7s.bots',null);if(!Array.isArray(BOTS))BOTS=[{id:'d',name:'D (Super Bot D + Daniel)',role:'główny hub',style:'music',core:1}];
function saveBots(){S('d7s.bots',BOTS)}
function addBot(n,r,st){BOTS.push({id:'b'+Date.now()+Math.random().toString(36).slice(2,5),name:n||'Bot',role:r||'',style:st||'music',ok:1,resets:0});saveBots();render()}
function render(){var w=$('who'),v=w.value;w.innerHTML=BOTS.map(function(b){return'<option value="'+b.id+'">'+(STY[b.style]||'🤖')+' '+esc(b.name)+'</option>'}).join('');w.value=v||'d';
 var L=$('blist');L.innerHTML='';BOTS.slice(0,200).forEach(function(b){var d=document.createElement('div');d.className='card';d.innerHTML=(STY[b.style]||'🤖')+' <b>'+esc(b.name)+'</b> · '+esc(b.style)+' · '+esc(b.role)+' · <span class="'+(b.ok?'ok':'bad')+'">'+(b.ok?'zdrowy':'reset')+'</span> (resety: '+(b.resets||0)+') '+' <button class=c>🧬 klon</button><button class=e>⚡ ewoluuj</button>'+(b.core?'':'<button class=x>🗑</button>');d.querySelector('.c').onclick=function(){cloneBot(b,0)};d.querySelector('.e').onclick=function(){cloneBot(b,1)};var x=d.querySelector('.x');if(x)x.onclick=function(){BOTS=BOTS.filter(function(y){return y!==b});saveBots();render()};L.appendChild(d)});
 if(BOTS.length>200)L.insertAdjacentHTML('beforeend','<div class="card">…i '+(BOTS.length-200)+' kolejnych (ukryte dla wydajności)</div>')}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return'&#'+c.charCodeAt(0)+';'})}
var PRESET=[['diablo','D Diablo (Bot D Diablo · orkiestrator)','główny orkiestrator i szybki budowniczy, silnik AI 7777','app'],['d','D (Bot D „Daniel”, główny bot D7 DJ)','główny hub D7 DJ','music'],['supergrok','SuperGrok (Super Bot D „Daniel”)','super bot hub','web'],['b77','77','bot 77','music'],['dargonmoon','DargonMoon','wielojęzyczny budowniczy aplikacji Android+Mac, social','app'],['autofix','AutoFix','ciągła naprawa aplikacji i botów','app'],['supercharger','SuperCharger','łączy wszystkie boty','web'],['superbotd','SuperBotD','techno, steruje botami i D7 DJ','music'],['mrdfluid','Mr D Fluid','czat strony','web'],['pamiec','Bot Pamięć','pamięć (samples/memory-public.json)','web'],['dragon','Dragon','bot Dragon','fx']];
PRESET.forEach(function(p){if(!BOTS.some(function(b){return b.id==p[0]}))BOTS.push({id:p[0],name:p[1],role:p[2],style:p[3],core:1,ok:1,resets:0})});saveBots();
fetch('samples/memory-public.json').then(function(r){return r.json()}).then(function(j){walk(j,'pamiec')}).catch(function(){});

/* v50: bots create bots, clone, evolve */
function genBot(desc){var t=norm(desc),st=/rap/.test(t)?'rapper':/(fx|wizual|visual|viz)/.test(t)?'fx':/(app|aplik|android|mac|ios)/.test(t)?'app':/(web|szuk|search|smart)/.test(t)?'web':'music';
 var w=t.split(/\s+/).filter(function(x){return x.length>3&&STOP.indexOf(x)<0&&x!='bota'&&x!='bot'});var nm=(w[0]||'Nowy').replace(/^./,function(c){return c.toUpperCase()})+'Bot';
 var know=search(desc);addBot(nm,desc+(know?' · wiedza: '+know.t.slice(0,80):''),st);return nm+' ('+st+')'}
function cloneBot(b,evo){var c=JSON.parse(JSON.stringify(b));c.id='b'+Date.now()+Math.random().toString(36).slice(2,5);c.core=0;c.gen=(b.gen||1)+1;c.name=b.name.split(' ')[0]+(evo?' Evo'+c.gen:' kopia');
 if(evo){var ks=Object.keys(MEM.learn||{}).slice(-3);c.role=(b.role||'')+(ks.length?' · uczy się: '+ks.join(', '):' · ewolucja '+c.gen)}BOTS.push(c);saveBots();render();return c.name}
window.D7S={genBot:genBot,cloneBot:cloneBot};
/* watchdog */
function health(){var ch=0;BOTS=BOTS.filter(function(b){return b&&typeof b=='object'});BOTS.forEach(function(b){var ok=typeof b.name=='string'&&b.name&&STY[b.style]&&typeof b.id=='string';if(!ok){b.name=String(b.name||'Bot naprawiony');b.style=STY[b.style]?b.style:'music';b.id=typeof b.id=='string'?b.id:'b'+Date.now();b.role=String(b.role||'');b.resets=(b.resets||0)+1;ch=1}b.ok=1});
 PRESET.forEach(function(p){if(!BOTS.some(function(b){return b.id==p[0]})){BOTS.push({id:p[0],name:p[1],role:p[2],style:p[3],core:1,ok:1,resets:1});ch=1}});
 if(!MEM||!Array.isArray(MEM.hist)){MEM={hist:[],facts:{},topic:''};ch=1}if(ch){saveBots();saveMem();render()}}
setInterval(health,15000);window.addEventListener('storage',function(e){if(e.key=='d7s.bots'){BOTS=J('d7s.bots',BOTS);render()}if(e.key=='d7s.mem')MEM=J('d7s.mem',MEM)});
/* chat */
function out(c,t){var d=document.createElement('div');d.className='m '+c;d.textContent=t;$('log').appendChild(d);$('log').scrollTop=1e9}
function send(){var q=$('q').value.trim();if(!q)return;$('q').value='';out('u','Ty: '+q);MEM.hist.push({r:'u',t:q});var b=BOTS.find(function(x){return x.id==$('who').value})||BOTS[0];
 ask(q,b).then(function(a){out('b',b.name+': '+a);MEM.hist.push({r:b.id,t:a});saveMem();speak(a)})}
function round(){var q=MEM.hist.filter(function(h){return h.r=='u'}).pop();q=q?q.t:'przedstaw się';var i=0;(function next(){if(i>=BOTS.length||i>=50){out('b','— koniec rundy ('+i+' botów) —');return}var b=BOTS[i++];
 ask(q,b).then(function(a){out('b',b.name+' ['+b.style+']: '+(b.core?a:'('+(b.role||b.style)+') '+a));setTimeout(next,60)},function(){b.ok=0;next()})})()}
$('send').onclick=send;$('q').onkeydown=function(e){if(e.key=='Enter')send()};$('round').onclick=round;$('clr').onclick=function(){$('log').innerHTML='';MEM.hist=[];saveMem()};
$('badd').onclick=function(){addBot($('bn').value.trim(),$('br').value.trim(),$('bs').value);$('bn').value='';$('br').value=''};
function speak(t){try{speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(t.slice(0,300));u.lang='pl-PL';speechSynthesis.speak(u)}catch(e){}}
$('mic').onclick=function(){var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){out('b','Mikrofon: rozpoznawanie mowy niedostępne w tej przeglądarce.');return}var r=new R();r.lang='pl-PL';r.onresult=function(e){$('q').value=e.results[0][0].transcript;send()};r.start()};
/* music */
function musicgen(){var p=$('mp').value.trim(),o=$('mout');o.textContent='Sprawdzam /api/musicgen…';fetch('/api/musicgen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:p})}).then(function(r){if(!r.ok)throw r.status;return r.json()}).then(function(j){if(j.url)o.innerHTML='<audio controls src="'+esc(j.url)+'"></audio>';else throw 0}).catch(function(){o.textContent='Generowanie muzyki AI jest niedostępne (offline lub brak endpointu na serwerze). Nie korzystamy z płatnych usług. Możesz użyć sampli w D7 DJ PRO8.'})}
$('mgo').onclick=musicgen;
/* v50: free browser music generator (procedural WebAudio, not Suno) */
var AC=null,PLAY=null;function synth(p){var t=norm(p),bpm=+(t.match(/(\d{2,3})\s*bpm/)||[])[1]||(/techno/.test(t)?130:/house/.test(t)?124:/(hip|rap|trap)/.test(t)?90:/trance/.test(t)?138:/(dnb|drum)/.test(t)?172:120);
 var minor=/(mrocz|dark|smut|minor)/.test(t)||/techno/.test(t),sc=minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],root=/(trap|hip|rap)/.test(t)?43:45;
 AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(PLAY)clearInterval(PLAY);var step=60/bpm/4,i=0,seed=0;for(var k=0;k<p.length;k++)seed=(seed*31+p.charCodeAt(k))>>>0;
 function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}var mel=[];for(k=0;k<16;k++)mel.push(rnd()<.55?sc[Math.floor(rnd()*7)]+12*Math.floor(rnd()*2):null);
 function tone(f,d,ty,v,at){var o=AC.createOscillator(),g=AC.createGain();o.type=ty;o.frequency.setValueAtTime(f,at);g.gain.setValueAtTime(v,at);g.gain.exponentialRampToValueAtTime(.001,at+d);o.connect(g);g.connect(AC.destination);o.start(at);o.stop(at+d)}
 function kick(at){var o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(150,at);o.frequency.exponentialRampToValueAtTime(40,at+.15);g.gain.setValueAtTime(.9,at);g.gain.exponentialRampToValueAtTime(.001,at+.3);o.connect(g);g.connect(AC.destination);o.start(at);o.stop(at+.3)}
 function hat(at){var b=AC.createBuffer(1,2205,44100),d=b.getChannelData(0);for(var j=0;j<d.length;j++)d[j]=(Math.random()*2-1)*(1-j/d.length);var s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();f.type='highpass';f.frequency.value=7000;g.gain.value=.25;s.buffer=b;s.connect(f);f.connect(g);g.connect(AC.destination);s.start(at)}
 var hz=function(n){return 440*Math.pow(2,(n-69)/12)},four=!/(hip|rap|trap)/.test(t);
 PLAY=setInterval(function(){var at=AC.currentTime+.05,x=i%16;if(four?x%4==0:(x==0||x==10))kick(at);if(x%2==1)hat(at);if(!four&&(x==4||x==12))hat(at);
  if(x%4==2)tone(hz(root+sc[(Math.floor(i/16)%2)?4:0]-12),step*1.5,'sawtooth',.12,at);if(mel[x]!=null)tone(hz(root+24+mel[x]),step*.9,/(trance|ambient)/.test(t)?'triangle':'square',.06,at);i++},step*1000);
 return bpm}
var mb=document.createElement('div');mb.className='row';mb.innerHTML='<button id="msyn">🎹 Stwórz utwór w przeglądarce (darmowe)</button><button id="mstop">⏹ Stop</button>';$('mout').parentNode.insertBefore(mb,$('mout'));
$('msyn').onclick=function(){var b=synth($('mp').value||'techno 128 bpm');$('mout').textContent='Gra prosty generator proceduralny WebAudio ('+b+' BPM, styl z opisu). To nie jest Suno ani AI-wokal — darmowy syntezator w przeglądarce.'};
$('mstop').onclick=function(){var was=!!PLAY;if(PLAY)clearInterval(PLAY);PLAY=null;$('mout').textContent=was?'⏹ Zatrzymane.':'Nic teraz nie gra — kliknij „🎹 Stwórz utwór”.'};
var ig=document.createElement('div');ig.className='card';ig.innerHTML='<b>🖼 Obraz AI (Pollinations.ai, darmowe)</b><div class="row"><input id="igq" style="flex:1" placeholder="np. okładka techno neon"><button id="iggo">Generuj obraz</button></div><div id="igo"></div>';$('muzyka').appendChild(ig);
$('iggo').onclick=function(){var p=$('igq').value.trim()||$('mp').value||'D7 DJ neon';if(!navigator.onLine){$('igo').textContent='Offline — generowanie obrazów wymaga internetu.';return}$('igo').innerHTML='<img style="max-width:100%;border-radius:10px" alt="ładowanie…" src="https://image.pollinations.ai/prompt/'+encodeURIComponent(p)+'?width=768&height=768&nologo=true&seed='+Date.now()%1e6+'"><br><small>źródło: image.pollinations.ai</small>'};
var ku=document.createElement('div');ku.className='card';ku.innerHTML='<b>🔑 Własne klucze API (opcjonalne, zapis tylko lokalnie)</b><div class="row"><input id="kk" type="password" placeholder="klucz API"><input id="ku" size="38" placeholder="URL (OpenAI-zgodny)"><input id="km" placeholder="model"><label><input type="checkbox" id="kuse"> używaj</label><button id="ksave">Zapisz</button></div>';$('ust').appendChild(ku);
$('kk').value=LS.getItem('d7s.key')||'';$('ku').value=LS.getItem('d7s.keyurl')||'https://api.openai.com/v1/chat/completions';$('km').value=LS.getItem('d7s.keymodel')||'gpt-4o-mini';$('kuse').checked=LS.getItem('d7s.usekey')=='1';
$('ksave').onclick=function(){LS.setItem('d7s.key',$('kk').value.trim());LS.setItem('d7s.keyurl',$('ku').value.trim());LS.setItem('d7s.keymodel',$('km').value.trim());LS.setItem('d7s.usekey',$('kuse').checked?'1':'0');$('epst').textContent='Zapisano klucze lokalnie.'};
/* v50: AI 7777 engine — D Diablo orchestrates all bots */
var ep7=document.createElement('section');ep7.id='e7777';ep7.innerHTML='<div class="card"><b>😈 D Diablo · silnik AI 7777</b><div class="row"><input id="e7q" style="flex:1" placeholder="Co budujemy? np. „aplikacja radio techno z czatem”"><button id="e7go">🚀 Orkiestruj wszystkie boty</button></div><div id="e7out"></div><small>Orkiestracja lokalna: każdy bot dokłada część planu wg swojej roli; D Diablo składa plan. Bez online AI to plan/szkic, nie gotowy kod.</small></div>';document.body.appendChild(ep7);
var nb=document.createElement('button');nb.dataset.t='e7777';nb.textContent='😈 AI 7777';document.querySelector('nav').prepend(nb);nb.onclick=function(){document.querySelectorAll('section').forEach(function(s){s.classList.toggle('on',s.id=='e7777')})};
var PART={music:'dźwięk/beaty i playlista',fx:'wizualizacje FX i UI',rapper:'teksty i hasła',app:'architektura aplikacji (Android/Mac/web), build',web:'wyszukiwanie, dane i API'};
$('e7go').onclick=function(){var q=$('e7q').value.trim()||'nowa funkcja D7';var o=$('e7out');o.innerHTML='';var plan=[];BOTS.slice(0,50).forEach(function(b,ix){var li=document.createElement('div');li.className='m b';li.textContent=(ix+1)+'. '+b.name+' → '+PART[b.style]+(b.role?' ('+b.role.slice(0,60)+')':'');o.appendChild(li);plan.push(b.name+': '+PART[b.style])});
 var d=document.createElement('div');d.className='m u';d.textContent='D Diablo: plan „'+q+'” złożony z '+plan.length+' botów. Zapisano w pamięci wspólnej.';o.appendChild(d);MEM.facts[Date.now()]='Plan 7777: '+q;saveMem();
 if(EP)online('Zbuduj plan: '+q+'. Role: '+plan.join('; '),{name:'D Diablo',role:'orkiestrator',style:'app'}).then(function(a){var x=document.createElement('div');x.className='m b';x.textContent='Mózg AI: '+a;o.appendChild(x)},function(){})};

$('ep').value=EP;$('eps').onclick=function(){EP=$('ep').value.trim();LS.setItem('d7s.ep',EP);$('epst').textContent='Sprawdzam…';online('ping',null).then(function(){$('epst').innerHTML='<span class="ok">Mózg AI online działa</span>'},function(){$('epst').innerHTML='<span class="bad">Brak odpowiedzi — tryb offline (wiedza lokalna)</span>'})};
$('ggen').onclick=function(){var d=$('gdesc').value.trim();if(!d){d=($('br').value.trim()||$('bs').options[$('bs').selectedIndex].text)+' bot';}out('b','D: utworzyłem '+genBot(d));$('gdesc').value='';document.querySelector('[data-t=hub]').click()};
document.querySelectorAll('[data-m]').forEach(function(b){b.onclick=function(){$('mframe').src=b.dataset.m}});
health();render();out('b','D: Cześć! Napisz „pomoc”, żeby zobaczyć komendy.');
})();

/* v53: remember hub options (Pollinations / web search / rozmówca) */
(function(){try{var L=localStorage;['pol','web'].forEach(function(id){var e=document.getElementById(id);if(!e)return;var v=L.getItem('d7s.opt.'+id);if(v!=null)e.checked=v==='1';e.addEventListener('change',function(){L.setItem('d7s.opt.'+id,e.checked?'1':'0')})});var w=document.getElementById('who');if(w){var v=L.getItem('d7s.opt.who');if(v&&[].some.call(w.options,function(o){return o.value==v}))w.value=v;w.addEventListener('change',function(){L.setItem('d7s.opt.who',w.value)})}}catch(e){}})();
