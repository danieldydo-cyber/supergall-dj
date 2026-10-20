'use strict';
/* Super Boost Beast 2077 G – v3.0 (Daniel Dydo) */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function log(m){const l=$('#log');l.innerHTML=`<div>[${new Date().toLocaleTimeString('pl-PL')}] ${esc(m)}</div>`+l.innerHTML}
const KEYS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','H'];
// ---------- radios (verified 2026-10-20 with curl+ffprobe; cors=true -> Access-Control-Allow-Origin present) ----------
const RADIOS=[
 {g:'techno',n:'Technolovers TECHNO',u:'https://stream.technolovers.fm/techno',cors:true},
 {g:'techno',n:'Technolovers Melodic House & Techno',u:'https://stream.technolovers.fm/melodic-house-techno',cors:true},
 {g:'techno',n:'RauteMusik TECHNO',u:'https://streams.rautemusik.fm/techno/mp3-192/',cors:true},
 {g:'techno',n:'RauteMusik TECHHOUSE',u:'https://techhouse-high.rautemusik.fm/',cors:true},
 {g:'techno',n:'181.FM Techno Club',u:'https://listen.181fm.com/181-technoclub_128k.mp3',cors:true},
 {g:'techno',n:'Frisky Radio',u:'https://stream.frisky.friskyradio.com/frisky_mp3_high',cors:true},
 {g:'techno',n:'UK Bass Radio',u:'https://www.ukbassradio.com/stream',cors:false},
 {g:'techno',n:'0N Electro',u:'https://0n-electro.radionetz.de/0n-electro.mp3',cors:false},
 {g:'techno',n:'Rinse UK',u:'https://admin.stream.rinse.fm/proxy/rinse_uk/stream',cors:false},
 {g:'hiphop',n:'181.FM The Beat (HipHop/R&B)',u:'https://listen.181fm.com/181-beat_128k.mp3',cors:true},
 {g:'hiphop',n:'RauteMusik TRAP',u:'https://trap-high.rautemusik.fm/',cors:true},
 {g:'hiphop',n:'RauteMusik BASS',u:'https://bass-high.rautemusik.fm/',cors:true},
 {g:'hiphop',n:'BreakZ HipHop & House',u:'https://breakz-high.rautemusik.fm/',cors:true},
 {g:'hiphop',n:'RauteMusik Deutschrap',u:'https://deutschrap-high.rautemusik.fm/',cors:true},
 {g:'hiphop',n:'RPR1 Old School Hip Hop',u:'https://streams.rpr1.de/rpr-hiphop-128-mp3',cors:false}];
// ---------- audio core ----------
let ctx,master,an,revIR,BPM=128,decks={},noiseBuf;
function mkIR(c,sec){const L=Math.floor(c.sampleRate*sec),b=c.createBuffer(2,L,c.sampleRate);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<L;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/L,2.5)}return b}
function mkNoise(c){const b=c.createBuffer(1,c.sampleRate,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;return b}
const FXT=['echo','flanger','phaser','roll','trans','filter','spiral','reverb'],FRAC=[['1/8',.125],['1/4',.25],['1/2',.5],['3/4',.75],['1',1],['2',2],['4',4]];
class Deck{
 constructor(id){this.id=id;this.el=new Audio();this.el.crossOrigin='anonymous';this.el.preservesPitch=true;this.el.preload='auto';this.plain=new Audio();this.plain.preload='none';
  this.src=ctx.createMediaElementSource(this.el);this.buf=null;this.bpm=0;this.off=0;this.cues=[null,null,null,null];this.loop=null;this.range=.08;this.pitch=0;this.kind='';this.title='—';this.peaks=null;this.chroma=new Float32Array(12);this.vinyl=true;this.bend=0;
  const B=(t,f,g)=>{const n=ctx.createBiquadFilter();n.type=t;n.frequency.value=f;if(g!==undefined)n.gain.value=g;return n};
  this.trim=ctx.createGain();this.lo=B('lowshelf',250,0);this.mid=B('peaking',1000,0);this.mid.Q.value=.8;this.hi=B('highshelf',4000,0);this.hp=B('highpass',10);this.lp=B('lowpass',20000);
  this.fxIn=ctx.createGain();this.dry=ctx.createGain();this.wet=ctx.createGain();this.wet.gain.value=0;this.fxOut=ctx.createGain();this.vol=ctx.createGain();this.xg=ctx.createGain();this.meter=ctx.createAnalyser();this.meter.fftSize=4096;
  this.src.connect(this.trim);this.trim.connect(this.lo).connect(this.mid).connect(this.hi).connect(this.hp).connect(this.lp).connect(this.fxIn);
  this.fxIn.connect(this.dry).connect(this.fxOut);this.wet.connect(this.fxOut);this.fxOut.connect(this.vol).connect(this.xg).connect(master);this.vol.connect(this.meter);
  this.fx={type:'echo',frac:.5,on:false,mix:.5,nodes:[],lfos:[]};this.buildFx();
  this.el.addEventListener('error',()=>{if(this.kind)log(`Deck ${id}: błąd odtwarzania (${this.title})`)});}
 get rate(){return Math.max(.1,1+this.pitch*this.range+this.bend)}
 get ebpm(){return this.bpm?this.bpm*this.rate:0}
 get playing(){return this.kind=='plain'?!this.plain.paused:!this.el.paused}
 applyRate(){this.el.playbackRate=this.rate;this.el.preservesPitch=$(`#kl${this.id}`).classList.contains('on');ui.pitch(this)}
 stopAll(){this.el.pause();this.plain.pause();this.plain.removeAttribute('src');this.plain.load()}
 async loadFile(file){this.stopAll();this.kind='file';this.title=file.name;this.loop=null;this.cues=[null,null,null,null];const ab=await file.arrayBuffer();const tag=readTags(ab,file.name);
  this.meta=tag;this.title=(tag.artist?tag.artist+' – ':'')+(tag.title||file.name);this.el.src=URL.createObjectURL(file);
  try{this.buf=await ctx.decodeAudioData(ab.slice(0));const a=analyse(this.buf);this.bpm=tag.bpm&&tag.bpm>60&&tag.bpm<200?tag.bpm:a.bpm;this.off=a.off;this.key=tag.key||keyFrom(a.chroma);this.peaks=peaks(this.buf)}catch(e){this.buf=null;this.bpm=0;log('Deck '+this.id+': nie można zdekodować pliku')}
  ui.recog(this);ui.info(this);log(`Deck ${this.id}: ${this.title} · ${this.bpm?this.bpm.toFixed(1)+' BPM':''} ${this.key||''}`)}
 async loadBuffer(buf,title,bpm){this.stopAll();this.kind='gen';this.buf=buf;this.title=title;this.bpm=bpm;this.off=0;this.loop=null;this.peaks=peaks(buf);this.key=KEYS[gen.key]+' moll';this.meta={title,source:'Generator 2077'};
  this.el.src=URL.createObjectURL(wav(buf));this.el.loop=true;ui.info(this);ui.recog(this)}
 loadRadio(st){this.stopAll();this.buf=null;this.peaks=null;this.bpm=0;this.loop=null;this.title=st.n;this.meta={title:st.n,source:'Radio'+(st.cors?' (FX)':' (plain)')};this.el.loop=false;
  if(st.cors){this.kind='radio';this.el.src=st.u;this.el.play().catch(()=>{log('Radio '+st.n+': CORS/odtwarzanie zablokowane → tryb PLAIN');this.kind='plain';this.plain.src=st.u;this.plain.play().catch(e=>log('Radio błąd: '+e.message))})}
  else{this.kind='plain';this.el.removeAttribute('src');this.plain.src=st.u;this.plain.play().catch(e=>log('Radio błąd: '+e.message))}
  this.updPlain();ui.info(this);ui.recog(this);log(`Deck ${this.id}: 📻 ${st.n} (${st.cors?'routing FX':'plain'})`)}
 play(){if(this.kind=='plain'){this.plain.play();return}if(!this.el.src)return;this.applyRate();this.el.play().catch(e=>log('Play: '+e.message))}
 pause(){this.el.pause();this.plain.pause()}
 toggle(){this.playing?this.pause():this.play();ui.info(this)}
 updPlain(){const v=+$(`#vol${this.id}`).value*xfGain(this.id)*(+$('#mvol').value);this.plain.volume=Math.max(0,Math.min(1,v))}
 cue(i,del){if(del){this.cues[i]=null;ui.cues(this);return}if(this.cues[i]==null){this.cues[i]=this.el.currentTime;log(`Deck ${this.id}: hot cue ${'ABCD'[i]} = ${this.cues[i].toFixed(2)}s`)}else{this.el.currentTime=this.cues[i];if(this.el.paused)this.play()}ui.cues(this)}
 autoLoop(beats){if(!this.bpm)return log('Deck '+this.id+': brak BPM – pętla niedostępna');if(this.loop&&this.loop.b==beats){this.loop=null;ui.loops(this);return}
  const bl=60/this.bpm,t=this.el.currentTime,s=this.off+Math.floor((t-this.off)/bl)*bl;this.loop={s,e:s+beats*bl,b:beats};ui.loops(this)}
 sync(){const o=decks[this.id=='A'?'B':'A'];const tgt=o.playing&&o.ebpm?o:null;const tb=tgt?tgt.ebpm:BPM;if(!this.bpm)return log('Deck '+this.id+': brak BPM do SYNC');
  let need=(tb/this.bpm-1);const rs=[.08,.16,.5];if(Math.abs(need)>this.range){this.range=rs.find(r=>r>=Math.abs(need))||.5;$(`#rng${this.id}`).value=this.range}
  this.pitch=Math.max(-1,Math.min(1,need/this.range));this.applyRate();
  if(tgt&&tgt.bpm){const myB=60/this.bpm,oB=60/tgt.bpm,ph=((this.el.currentTime-this.off)/myB)%1,oph=((tgt.el.currentTime-tgt.off)/oB)%1;let d=ph-oph;if(d>.5)d-=1;if(d<-.5)d+=1;this.el.currentTime=Math.max(0,this.el.currentTime-d*myB)}
  log(`Deck ${this.id}: SYNC → ${tb.toFixed(1)} BPM`)}
 // ---- beat FX ----
 beatSec(){return 60/(this.ebpm||BPM)}
 buildFx(){const f=this.fx;f.nodes.forEach(n=>{try{n.disconnect()}catch(e){}});f.lfos.forEach(o=>{try{o.stop()}catch(e){}});f.nodes=[];f.lfos=[];try{this.fxIn.disconnect(this.wetIn)}catch(e){}
  const T=this.beatSec()*f.frac,N=x=>{f.nodes.push(x);return x},L=(freq,depth,target,type)=>{const o=ctx.createOscillator();o.type=type||'sine';o.frequency.value=freq;const g=N(ctx.createGain());g.gain.value=depth;o.connect(g).connect(target);o.start();f.lfos.push(o);N(o);return o};
  const inp=N(ctx.createGain());this.wetIn=inp;this.fxIn.connect(inp);let out=inp;
  if(f.type=='echo'||f.type=='roll'||f.type=='spiral'){const d=N(ctx.createDelay(5));d.delayTime.value=Math.min(4.9,T);const fb=N(ctx.createGain());fb.gain.value=f.type=='roll'?.92:f.type=='spiral'?.75:.5;inp.connect(d);d.connect(fb).connect(d);
   if(f.type=='spiral'){const lp=N(ctx.createBiquadFilter());lp.type='bandpass';lp.frequency.value=1200;lp.Q.value=.7;d.connect(lp);L(1/(T*4),900,lp.frequency);out=lp}else out=d}
  else if(f.type=='flanger'){const d=N(ctx.createDelay(.05));d.delayTime.value=.004;const fb=N(ctx.createGain());fb.gain.value=.6;inp.connect(d);d.connect(fb).connect(d);L(1/(T*4),.003,d.delayTime);const mix=N(ctx.createGain());inp.connect(mix);d.connect(mix);out=mix}
  else if(f.type=='phaser'){let n=inp;for(let i=0;i<4;i++){const ap=N(ctx.createBiquadFilter());ap.type='allpass';ap.frequency.value=700+i*300;L(1/(T*4),600,ap.frequency);n.connect(ap);n=ap}const mix=N(ctx.createGain());inp.connect(mix);n.connect(mix);out=mix}
  else if(f.type=='trans'){const g=N(ctx.createGain());g.gain.value=.5;inp.connect(g);L(1/T,.5,g.gain,'square');out=g}
  else if(f.type=='filter'){const bq=N(ctx.createBiquadFilter());bq.type='bandpass';bq.Q.value=4;bq.frequency.value=1500;inp.connect(bq);L(1/(T*2),1300,bq.frequency);out=bq}
  else if(f.type=='reverb'){const cv=N(ctx.createConvolver());cv.buffer=revIR;inp.connect(cv);out=cv}
  out.connect(this.wet);this.fxMix()}
 fxMix(){const f=this.fx,t=ctx.currentTime,w=f.on?f.mix:0;const dryKill=f.on&&f.type=='roll';this.wet.gain.setTargetAtTime(w,t,.02);this.dry.gain.setTargetAtTime(dryKill?1-f.mix:1,t,.02)}
 setFx(o){Object.assign(this.fx,o);if(o.type||o.frac)this.buildFx();else this.fxMix();ui.fx(this)}
}
function xfGain(id){const v=+$('#xf').value;return id=='A'?Math.cos(v*Math.PI/2):Math.cos((1-v)*Math.PI/2)}
function setXf(v){$('#xf').value=v;for(const k in decks){decks[k].xg.gain.setTargetAtTime(xfGain(k),ctx.currentTime,.02);decks[k].updPlain()}}
// ---------- analysis: BPM / key / peaks ----------
function analyse(buf){const sr=buf.sampleRate,d=buf.getChannelData(0),hop=Math.floor(sr/200),N=Math.min(Math.floor(d.length/hop),200*90);const env=new Float32Array(N);let lp=0;
 for(let i=0;i<N;i++){let s=0;for(let j=0;j<hop;j++){const x=d[i*hop+j]||0;lp+=.05*(x-lp);s+=lp*lp}env[i]=Math.sqrt(s/hop)}
 const on=new Float32Array(N);for(let i=1;i<N;i++)on[i]=Math.max(0,env[i]-env[i-1]);let best=0,bl=0;
 for(let lag=Math.floor(200*60/180);lag<=Math.floor(200*60/70);lag++){let s=0;for(let i=lag;i<N;i++)s+=on[i]*on[i-lag];if(s>best){best=s;bl=lag}}
 let bpm=bl?12000/bl:120;while(bpm<85)bpm*=2;while(bpm>175)bpm/=2;const bs=12000/bpm;let bo=0,bv=-1;for(let o=0;o<bs;o++){let s=0;for(let i=o;i<N;i+=bs)s+=on[Math.floor(i)];if(s>bv){bv=s;bo=o}}
 return {bpm:Math.round(bpm*10)/10,off:bo/200,chroma:chromaOf(buf)}}
function chromaOf(buf){const sr=buf.sampleRate,d=buf.getChannelData(0),ch=new Float32Array(12),W=4096;const start=Math.floor(d.length*.2),frames=24;
 for(let f=0;f<frames;f++){const o=start+Math.floor(f*(d.length*.6)/frames);if(o+W>d.length)break;for(let p=36;p<84;p++){const fr=440*Math.pow(2,(p-69)/12),w=2*Math.PI*fr/sr;let re=0,im=0;for(let i=0;i<W;i+=2){const x=d[o+i];re+=x*Math.cos(w*i);im+=x*Math.sin(w*i)}ch[p%12]+=Math.sqrt(re*re+im*im)}}return ch}
const KMAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88],KMIN=[6.33,2.68,3.52,5.38,2.6,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function keyFrom(ch){let best=-9,k='';const corr=(a,b)=>{const ma=a.reduce((x,y)=>x+y)/12,mb=b.reduce((x,y)=>x+y)/12;let n=0,da=0,db=0;for(let i=0;i<12;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}return n/Math.sqrt(da*db||1)};
 for(let r=0;r<12;r++){const rot=[...Array(12)].map((_,i)=>ch[(i+r)%12]);const a=corr(rot,KMAJ),b=corr(rot,KMIN);if(a>best){best=a;k=KEYS[r]+' dur'}if(b>best){best=b;k=KEYS[r]+' moll'}}return k}
function peaks(buf){const d=buf.getChannelData(0),n=Math.min(20000,Math.floor(buf.duration*100)),s=Math.max(1,Math.floor(d.length/n)),p=new Float32Array(n);for(let i=0;i<n;i++){let m=0;for(let j=i*s;j<(i+1)*s;j+=4){const v=Math.abs(d[j]||0);if(v>m)m=v}p[i]=m}return p}
// ---------- tags ----------
function readTags(ab,name){const u=new Uint8Array(ab),r={};const dec=(b,enc)=>{try{if(enc==1||enc==2)return new TextDecoder(enc==2?'utf-16be':'utf-16').decode(b).replace(/\0/g,'');return new TextDecoder(enc==3?'utf-8':'latin1').decode(b).replace(/\0/g,'')}catch(e){return ''}};
 if(u[0]==0x49&&u[1]==0x44&&u[2]==0x33){const v=u[3],sz=(u[6]<<21)|(u[7]<<14)|(u[8]<<7)|u[9];let p=10;while(p<sz+10&&p+10<u.length){const id=String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]);if(!/^[A-Z0-9]{4}$/.test(id))break;
  const fs=v==4?((u[p+4]<<21)|(u[p+5]<<14)|(u[p+6]<<7)|u[p+7]):((u[p+4]<<24)|(u[p+5]<<16)|(u[p+6]<<8)|u[p+7]);if(fs<=0||p+10+fs>u.length)break;const body=u.subarray(p+10,p+10+fs);
  if(id[0]=='T'){const t=dec(body.subarray(1),body[0]).trim();if(id=='TIT2')r.title=t;else if(id=='TPE1')r.artist=t;else if(id=='TBPM')r.bpm=parseFloat(t);else if(id=='TKEY')r.key=t;else if(id=='TALB')r.album=t}p+=10+fs}if(r.title||r.artist)r.source='ID3v2'}
 if(!r.title&&u.length>128){const t=u.subarray(u.length-128);if(t[0]==84&&t[1]==65&&t[2]==71){r.title=dec(t.subarray(3,33),0).trim();r.artist=dec(t.subarray(33,63),0).trim();r.source='ID3v1'}}
 if(!r.title){const b=name.replace(/\.[^.]+$/,'').replace(/[_]+/g,' ');const m=b.split(/\s+[-–]\s+/);if(m.length>1){r.artist=m[0].trim();r.title=m.slice(1).join(' - ').trim()}else r.title=b;r.source='nazwa pliku'}return r}
// ---------- WAV ----------
function wav(b){const ch=b.numberOfChannels,len=b.length*ch*2+44,v=new DataView(new ArrayBuffer(len));let o=0;const ws=s=>{for(const c of s)v.setUint8(o++,c.charCodeAt(0))},u32=x=>{v.setUint32(o,x,true);o+=4},u16=x=>{v.setUint16(o,x,true);o+=2};
 ws('RIFF');u32(len-8);ws('WAVEfmt ');u32(16);u16(1);u16(ch);u32(b.sampleRate);u32(b.sampleRate*ch*2);u16(ch*2);u16(16);ws('data');u32(len-44);const cs=[...Array(ch)].map((_,i)=>b.getChannelData(i));
 for(let i=0;i<b.length;i++)for(let c=0;c<ch;c++){const s=Math.max(-1,Math.min(1,cs[c][i]));v.setInt16(o,s*32767,true);o+=2}return new Blob([v],{type:'audio/wav'})}
function saveBlob(blob,name){if(window.AndroidSave){const fr=new FileReader();fr.onload=()=>{try{log('💾 '+AndroidSave.save(name,String(fr.result).split(',')[1],blob.type))}catch(e){log('Zapis: '+e.message)}};fr.readAsDataURL(blob)}else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove()}}
// ---------- loop generator ----------
const GS={
 trap:{bpm:140,sw:0,gl:true,K:['x......x..x.....','x.....x...x..x..','x..x......x.....'],S:['........x.......'],C:['........x.......',''],H:['x.x.x.x.x.x.x.x.','xxx.x.xrx.x.xxr.','x.xrx.x.x.xrx.x.'],O:['..............x.',''],P:['','...x.......x....'],B:'K',M:['x.......x.......','']},
 boombap:{bpm:90,sw:.25,gl:false,K:['x.......x.x.....','x..x....x..x.x..','x.....x.x.......'],S:['....x.......x...'],C:[''],H:['x.x.x.x.x.x.x.x.','x.xxx.x.x.xxx.x.'],O:['......x.......x.',''],P:['..x.....','.......x.......x'],B:'K',M:['x.......x.......']},
 drill:{bpm:142,sw:0,gl:true,K:['x.....x...x..x..','x......x.x......','x..x...x..x.....'],S:['........x.....x.','......x.......x.'],C:[''],H:['x..x..x..x..x.x.','x.x.xx.x.x.xx.x.','x..xr.x..x..xr..'],O:[''],P:['...x......x.....',''],B:'K',M:['x..x..x.........','']},
 lofi:{bpm:82,sw:.3,gl:false,K:['x......x..x.....','x.......x.......'],S:['....x.......x...'],C:[''],H:['x.x.x.x.x.x.x.x.','..x...x...x...x.'],O:[''],P:['.......x.......x',''],B:'K',M:['x.......x.......']},
 techno:{bpm:130,sw:0,gl:false,K:['x...x...x...x...'],S:[''],C:['....x.......x...',''],H:['..x...x...x...x.','.xx..xx..xx..xx.'],O:['..x...x...x...x.',''],P:['...x..x....x..x.','..x.....x.x.....'],B:'.xx..xx..xx..xx.',M:['','x.....x.....x...']},
 minimal:{bpm:124,sw:.1,gl:false,K:['x...x...x...x...'],S:[''],C:['....x.......x...',''],H:['..x...x.x.x...x.','..x...x...x...x.'],O:[''],P:['..x.....x..x....','.x....x....x..x.'],B:'x......x..x.....',M:['..........x.....','']},
 hardtechno:{bpm:150,sw:0,gl:false,K:['x...x...x...x...'],S:[''],C:['....x.......x...'],H:['xxxxxxxxxxxxxxxx','x.xxx.xxx.xxx.xx'],O:['..x...x...x...x.'],P:['x..x..x..x..x...',''],B:'..x...x...x...x.',M:['']},
 melodic:{bpm:124,sw:0,gl:false,K:['x...x...x...x...'],S:[''],C:['....x.......x...'],H:['..x...x...x...x.'],O:['..x...x...x...x.',''],P:[''],B:'x.xx.xx.x.xx.xx.',M:['x.xx.x.xx.x.x.xx','x..x..x..x..x.x.']}};
const TR=['K','S','C','H','O','P','B','M'],TRN={K:'KICK',S:'SNARE',C:'CLAP',H:'HAT',O:'OPEN',P:'PERC',B:'808/BAS',M:'MELO'};
const SCALE=[0,2,3,5,7,8,10];
let gen={style:'trap',bpm:140,sw:0,gl:true,key:5,tr:{},play:false,step:0,nt:0};
const pick=a=>a[Math.floor(Math.random()*a.length)];
function genRandom(style){const S=GS[style||gen.style];gen.style=style||gen.style;gen.bpm=S.bpm;gen.sw=S.sw;gen.gl=S.gl;const tr={};
 for(const t of ['K','S','C','H','O','P']){const s=pick(S[t])||'';tr[t]=[...Array(16)].map((_,i)=>s[i]=='x'?1:s[i]=='r'?2:0);if(t!='K'&&t!='S'&&t!='C')tr[t]=tr[t].map(v=>v==0&&Math.random()<.06?1:v)}
 const deg=()=>12*(Math.random()<.2?1:0)+SCALE[pick([0,0,0,2,3,4,5,6])];
 if(S.B=='K'){let last=0;tr.B=tr.K.map((k,i)=>{if(k){last=Math.random()<.65?0:deg();return 36+last}return 0})}else{const s=S.B;const r=pick([0,0,7,5,3]);tr.B=[...Array(16)].map((_,i)=>s[i]=='x'?36+r+(Math.random()<.15?12:0):0)}
 const ms=pick(S.M)||'';tr.M=[...Array(16)].map((_,i)=>ms[i]=='x'?60+SCALE[Math.floor(Math.random()*7)]+(Math.random()<.3?12:0):0);gen.tr=tr;genUI();log(`🎲 Generator: ${style||gen.style} · ${gen.bpm} BPM`)}
function genMutate(){const t=pick(['K','H','P','B','M','O','C']),i=Math.floor(Math.random()*16);const tr=gen.tr;
 for(let n=0;n<3;n++){const k=pick(TR),j=Math.floor(Math.random()*16);if(k=='B')tr.B[j]=tr.B[j]?0:36+SCALE[Math.floor(Math.random()*7)];else if(k=='M')tr.M[j]=tr.M[j]?0:60+SCALE[Math.floor(Math.random()*7)];else if(k!='K'||j%4)tr[k][j]=tr[k][j]?0:1}genUI();log('🧬 Mutacja wzorca')}
// synth voices (work in any BaseAudioContext)
function vKick(c,o,t,st,nb){const s=c.createOscillator(),g=c.createGain();const hard=st=='hardtechno',hip=['trap','drill','boombap','lofi'].includes(st);s.frequency.setValueAtTime(hard?190:hip?120:155,t);s.frequency.exponentialRampToValueAtTime(hip?42:48,t+(hard?.06:.1));
 g.gain.setValueAtTime(1,t);g.gain.exponentialRampToValueAtTime(.001,t+(hip?.32:.42));let n=s.connect(g);if(hard){const w=c.createWaveShaper(),cv=new Float32Array(512);for(let i=0;i<512;i++){const x=i/256-1;cv[i]=Math.tanh(x*6)}w.curve=cv;n=g.connect(w)}n.connect(o);s.start(t);s.stop(t+.5)}
function vNoise(c,o,t,type,f,v,d,nb){const n=c.createBufferSource();n.buffer=nb;const fl=c.createBiquadFilter();fl.type=type;fl.frequency.value=f;const g=c.createGain();g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);n.connect(fl).connect(g).connect(o);n.start(t,Math.random()*.5);n.stop(t+d+.02)}
function vSnare(c,o,t,st,nb){vNoise(c,o,t,'bandpass',st=='lofi'||st=='boombap'?1500:2200,.7,.18,nb);const s=c.createOscillator(),g=c.createGain();s.frequency.value=st=='drill'?230:190;g.gain.setValueAtTime(.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);s.connect(g).connect(o);s.start(t);s.stop(t+.12)}
function vClap(c,o,t,st,nb){for(let i=0;i<3;i++)vNoise(c,o,t+i*.011,'bandpass',1100,.45,.14,nb)}
function vHat(c,o,t,open,v,nb){vNoise(c,o,t,'highpass',8000,v,open?.28:.045,nb)}
function vPerc(c,o,t,st){const s=c.createOscillator(),g=c.createGain();s.type='triangle';s.frequency.value=st.includes('techno')||st=='minimal'?820:1200;g.gain.setValueAtTime(.25,t);g.gain.exponentialRampToValueAtTime(.001,t+.06);s.connect(g).connect(o);s.start(t);s.stop(t+.08)}
const mtof=m=>440*Math.pow(2,(m-69)/12);
function v808(c,o,t,note,dur,next,glide,st){const s=c.createOscillator(),g=c.createGain(),w=c.createWaveShaper(),cv=new Float32Array(256);for(let i=0;i<256;i++){const x=i/128-1;cv[i]=Math.tanh(x*2.5)}w.curve=cv;
 const hip=['trap','drill','boombap','lofi'].includes(st);if(!hip){s.type='sawtooth';const f=c.createBiquadFilter();f.type='lowpass';f.Q.value=st=='hardtechno'?8:5;f.frequency.setValueAtTime(st=='hardtechno'?600:1400,t);f.frequency.exponentialRampToValueAtTime(140,t+dur*.9);
  s.frequency.value=mtof(note-12);g.gain.setValueAtTime(.35,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(f).connect(g).connect(o);s.start(t);s.stop(t+dur+.02);return}
 s.type='sine';s.frequency.setValueAtTime(mtof(note-12)*1.5,t);s.frequency.exponentialRampToValueAtTime(mtof(note-12),t+.03);if(glide&&next)s.frequency.exponentialRampToValueAtTime(mtof(next-12),t+dur);
 g.gain.setValueAtTime(.9,t);g.gain.setTargetAtTime(.0001,t+dur*.8,dur*.25);s.connect(w).connect(g).connect(o);s.start(t);s.stop(t+dur+.3)}
function vMel(c,o,t,note,dur,st){const hip=['trap','drill','boombap','lofi'].includes(st);const s=c.createOscillator(),g=c.createGain();s.type=hip?'triangle':'square';s.frequency.value=mtof(note);
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(hip?.18:.07,t+.005);g.gain.exponentialRampToValueAtTime(.001,t+dur*(hip?2:1));const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=st=='lofi'?1800:4000;s.connect(f).connect(g).connect(o);s.start(t);s.stop(t+dur*2+.05)}
function genStep(c,o,i,t,nb,bpm){const tr=gen.tr,st=gen.style,sx=60/bpm/4,k=KEYS.length,tp=gen.key-5;if(!tr.K)return;
 if(tr.K[i])vKick(c,o,t,st,nb);if(tr.S[i])vSnare(c,o,t,st,nb);if(tr.C[i])vClap(c,o,t,st,nb);if(tr.H[i]==1)vHat(c,o,t,false,.22,nb);else if(tr.H[i]==2){vHat(c,o,t,false,.2,nb);vHat(c,o,t+sx/2,false,.14,nb)}
 if(tr.O[i])vHat(c,o,t,true,.15,nb);if(tr.P[i])vPerc(c,o,t,st);
 if(tr.B[i]){let j=i+1,len=1;while(j<16&&!tr.B[j]&&!(tr.K[j]&&['trap','drill','boombap','lofi'].includes(st))){len++;j++}const nx=j<16?tr.B[j]:0;v808(c,o,t,tr.B[i]+tp,Math.min(len,8)*sx,nx?nx+tp:0,gen.gl,st)}
 if(tr.M[i])vMel(c,o,t,tr.M[i]+tp,sx*1.5,st);if(st=='lofi'&&i%4==0)vNoise(c,o,t,'highpass',3000,.02,.2,nb)}
function stepTime(i,t0,bpm){const sx=60/bpm/4;return t0+i*sx+(i%2?gen.sw*sx*.66:0)}
let genOut=null;
function genTick(){if(!gen.play)return;const sx=60/gen.bpm/4;while(gen.nt<ctx.currentTime+.12){const i=gen.step,t=gen.nt+(i%2?gen.sw*sx*.66:0);genStep(ctx,genOut,i,t,noiseBuf,gen.bpm);const s=i;setTimeout(()=>{$$('.gc.cur').forEach(e=>e.classList.remove('cur'));$$(`.gc[data-s="${s}"]`).forEach(e=>e.classList.add('cur'))},Math.max(0,(t-ctx.currentTime)*1000));gen.nt+=sx;gen.step=(i+1)%16}}
async function genRender(bars){const bpm=gen.bpm,sr=44100,dur=bars*4*60/bpm,oc=new OfflineAudioContext(2,Math.ceil(sr*dur),sr),nb=mkNoise(oc),o=oc.createGain();o.gain.value=.8;o.connect(oc.destination);
 for(let b=0;b<bars;b++)for(let i=0;i<16;i++){const t=b*4*60/bpm+i*60/bpm/4+(i%2?gen.sw*60/bpm/4*.66:0);if(t<dur)genStep(oc,o,i,t,nb,bpm)}return oc.startRendering()}
// ---------- shared pads (IndexedDB of Super G App) ----------
function idbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open('supergapp',1);r.onupgradeneeded=()=>r.result.createObjectStore('pads');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function toPad(i,name,ab){const db=await idbOpen();await new Promise((res,rej)=>{const tx=db.transaction('pads','readwrite');tx.objectStore('pads').put({name,data:ab},i);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
// ---------- mic analysis (only on explicit click) ----------
async function micAnalyse(){const r=$('#micRes');if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){r.textContent='Mikrofon niedostępny w tej przeglądarce.';return}
 let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false}})}catch(e){r.textContent='Brak zgody na mikrofon: '+e.message;return}
 r.textContent='🎤 Słucham 8 s…';const rec=new MediaRecorder(stream),ch=[];rec.ondataavailable=e=>ch.push(e.data);rec.start();await new Promise(z=>setTimeout(z,8000));rec.stop();await new Promise(z=>rec.onstop=z);stream.getTracks().forEach(t=>t.stop());
 try{const buf=await ctx.decodeAudioData(await new Blob(ch).arrayBuffer());const a=analyse(buf);r.innerHTML=`Wynik: ~<b>${a.bpm}</b> BPM · tonacja <b>${keyFrom(a.chroma)}</b>. Rozpoznanie tytułu z mikrofonu wymaga zewnętrznej bazy (np. AcoustID + Chromaprint) – niedostępne offline. Mikrofon wyłączony.`;log('🎤 Analiza mikrofonu: '+a.bpm+' BPM')}catch(e){r.textContent='Błąd analizy: '+e.message}}
// ---------- UI ----------
const ui={
 build(){$('#deckRow').innerHTML=['A','mix','B'].map(id=>id=='mix'?`<div class="panel mixer"><h2>MIKSER</h2>
 ${['A','B'].map(k=>`<div><b style="color:var(--c)">${k}</b><label>HI</label><input type="range" min="-24" max="12" step=".5" value="0" data-eq="${k}hi"><label>MID</label><input type="range" min="-24" max="12" step=".5" value="0" data-eq="${k}mid"><label>LOW</label><input type="range" min="-24" max="12" step=".5" value="0" data-eq="${k}lo"><label>FILTR (LP ⟷ HP)</label><input type="range" min="-1" max="1" step=".01" value="0" data-flt="${k}"><label>GŁOŚNOŚĆ</label><input type="range" min="0" max="1.2" step=".01" value="0.9" id="vol${k}"><div class="meter"><i id="mt${k}"></i></div></div>`).join('<hr style="border-color:#222">')}
 <label>CROSSFADER A ⟷ B</label><input type="range" id="xf" min="0" max="1" step=".01" value="0"><label>MASTER</label><input type="range" id="mvol" min="0" max="1" step=".01" value="0.85"></div>`:
 `<div class="panel deck" id="deck${id}"><h2>DECK ${id} <span id="st${id}" class="small"></span></h2><div class="info" id="in${id}">—</div>
 <canvas class="wave ov" id="ov${id}" width="520" height="28"></canvas><canvas class="wave" id="wv${id}" width="520" height="70"></canvas>
 <div class="grid2"><div><canvas class="jog" id="jog${id}" width="170" height="170"></canvas><div style="text-align:center"><button id="vin${id}" class="on">VINYL</button><button id="pl${id}" class="hot">▶/❚❚</button><button id="sy${id}">SYNC</button><button id="kl${id}" class="on">KEY LOCK</button></div></div>
 <div><label>PITCH <b id="pv${id}">0.00%</b> <select id="rng${id}"><option value="0.08">±8%</option><option value="0.16">±16%</option><option value="0.5">±50%</option></select></label><input type="range" id="pf${id}" min="-1" max="1" step=".001" value="0"><button id="pr${id}">RESET</button>
 <label>HOT CUE (×: usuń)</label><div class="cues">${[0,1,2,3].map(i=>`<button data-cue="${id}${i}">${'ABCD'[i]}</button>`).join('')}<button data-cuex="${id}">×</button></div>
 <label>AUTO LOOP (beaty)</label><div class="loops">${[['1/4',.25],['1/2',.5],['1',1],['2',2],['4',4],['8',8],['16',16]].map(([b,v])=>`<button data-loop="${id}" data-b="${v}">${b}</button>`).join('')}</div>
 <label>WCZYTAJ</label><input type="file" id="f${id}" accept="audio/*" style="width:100%"></div></div>
 <label>BEAT FX</label><div>${FXT.map(t=>`<button data-fxt="${id}" data-t="${t}">${t}</button>`).join('')}</div>
 <div>${FRAC.map(([n,v])=>`<button data-fxf="${id}" data-v="${v}">${n}</button>`).join('')} <button id="fxon${id}" class="hot">FX ON</button></div><label>WET/DRY</label><input type="range" id="fxm${id}" min="0" max="1" step=".01" value=".5"></div>`).join('')},
 bind(){for(const k of ['A','B']){const d=decks[k];$(`#f${k}`).onchange=e=>{const f=e.target.files[0];if(f)d.loadFile(f)};$(`#pl${k}`).onclick=()=>d.toggle();$(`#sy${k}`).onclick=()=>d.sync();
  $(`#kl${k}`).onclick=e=>{e.target.classList.toggle('on');d.applyRate()};$(`#vin${k}`).onclick=e=>{e.target.classList.toggle('on');d.vinyl=e.target.classList.contains('on')};
  $(`#pf${k}`).oninput=e=>{d.pitch=+e.target.value;d.applyRate()};$(`#rng${k}`).onchange=e=>{d.range=+e.target.value;d.applyRate()};$(`#pr${k}`).onclick=()=>{d.pitch=0;$(`#pf${k}`).value=0;d.applyRate()};
  $(`#vol${k}`).oninput=e=>{d.vol.gain.value=+e.target.value;d.updPlain()};$(`#fxm${k}`).oninput=e=>d.setFx({mix:+e.target.value});$(`#fxon${k}`).onclick=()=>d.setFx({on:!d.fx.on});jog(d);ui.fx(d)}
  document.addEventListener('click',e=>{const t=e.target.dataset;if(!t)return;if(t.cue){const d=decks[t.cue[0]];d.cue(+t.cue[1],d.cueDel);d.cueDel=false;$(`[data-cuex="${t.cue[0]}"]`).classList.remove('on')}
   else if(t.cuex){const d=decks[t.cuex];d.cueDel=!d.cueDel;e.target.classList.toggle('on',d.cueDel)}else if(t.loop)decks[t.loop].autoLoop(+t.b);else if(t.fxt)decks[t.fxt].setFx({type:t.t});else if(t.fxf)decks[t.fxf].setFx({frac:+t.v})});
  document.addEventListener('input',e=>{const t=e.target.dataset;if(t.eq){const d=decks[t.eq[0]];d[t.eq.slice(1)].gain.value=+e.target.value}else if(t.flt){const d=decks[t.flt],v=+e.target.value;d.lp.frequency.value=v<0?20000*Math.pow(.01,-v):20000;d.hp.frequency.value=v>0?10*Math.pow(800,v):10}});
  $('#xf').oninput=e=>setXf(+e.target.value);$('#mvol').oninput=e=>{master.gain.value=+e.target.value;for(const k in decks)decks[k].updPlain()}},
 info(d){$(`#in${d.id}`).innerHTML=`${esc(d.title)}<br><span class="small">${d.kind=='plain'?'📻 PLAIN (bez FX)':d.kind=='radio'?'📻 radio · FX':d.kind=='gen'?'🎛 loop generatora':d.kind?'💿 plik':''} ${d.bpm?'· '+d.bpm.toFixed(1)+' BPM':''} ${d.key?'· '+esc(d.key):''}</span>`},
 pitch(d){$(`#pv${d.id}`).textContent=((d.rate-1)*100).toFixed(2)+'%'},
 cues(d){$$(`[data-cue^="${d.id}"]`).forEach(b=>b.classList.toggle('on',d.cues[+b.dataset.cue[1]]!=null))},
 loops(d){$$(`[data-loop="${d.id}"]`).forEach(b=>b.classList.toggle('on',!!d.loop&&+b.dataset.b==d.loop.b))},
 fx(d){$$(`[data-fxt="${d.id}"]`).forEach(b=>b.classList.toggle('on',b.dataset.t==d.fx.type));$$(`[data-fxf="${d.id}"]`).forEach(b=>b.classList.toggle('on',+b.dataset.v==d.fx.frac));$(`#fxon${d.id}`).classList.toggle('on',d.fx.on);$(`#fxm${d.id}`).value=d.fx.mix},
 recog(d){const m=d.meta||{};$('#recog').innerHTML=['A','B'].map(k=>{const x=decks[k],mm=x.meta||{};return `<div><b style="color:var(--c)">Deck ${k}:</b> ${mm.title?`<b>${esc(mm.artist?mm.artist+' – ':'')}${esc(mm.title)}</b>${mm.album?' · '+esc(mm.album):''} <span class="tag">${esc(mm.source||'')}</span>`:'—'} ${x.bpm?'· '+x.bpm.toFixed(1)+' BPM':''} ${x.key?'· '+esc(x.key):''}</div>`}).join('')}};
function jog(d){const c=$(`#jog${d.id}`),g=c.getContext('2d');let down=false,la=0,lt=0;const ang=e=>{const r=c.getBoundingClientRect();return Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)};
 c.onpointerdown=e=>{down=true;la=ang(e);lt=performance.now();c.setPointerCapture(e.pointerId);d.wasPlaying=!d.el.paused;if(d.vinyl&&d.buf)d.el.pause()};
 c.onpointermove=e=>{if(!down)return;const a=ang(e);let da=a-la;if(da>Math.PI)da-=2*Math.PI;if(da<-Math.PI)da+=2*Math.PI;la=a;const now=performance.now(),dt=Math.max(1,now-lt)/1000;lt=now;
  if(d.vinyl&&d.buf){const sec=da/(2*Math.PI)*1.8;d.el.currentTime=Math.max(0,Math.min(d.buf.duration-.05,d.el.currentTime+sec));const v=Math.min(4,Math.abs(sec/dt));if(v>.05){const s=ctx.createBufferSource();s.buffer=d.buf;s.playbackRate.value=Math.max(.1,v);const gg=ctx.createGain();gg.gain.value=.9;s.connect(gg).connect(d.trim);s.start(0,d.el.currentTime,.05)}}
  else{d.bend=Math.max(-.2,Math.min(.2,da*2));d.applyRate();clearTimeout(d.bt);d.bt=setTimeout(()=>{d.bend=0;d.applyRate()},120)}};
 c.onpointerup=c.onpointercancel=()=>{down=false;if(d.vinyl&&d.buf&&d.wasPlaying)d.play()};
 d.drawJog=()=>{const W=c.width,R=W/2;g.clearRect(0,0,W,W);g.fillStyle='#0b0b14';g.beginPath();g.arc(R,R,R-2,0,7);g.fill();g.strokeStyle=d.playing?'#fcee0a':'#00f0ff';g.lineWidth=4;g.shadowColor=g.strokeStyle;g.shadowBlur=12;g.beginPath();g.arc(R,R,R-6,0,7);g.stroke();g.shadowBlur=0;
  const a=(d.el.currentTime/1.8)*2*Math.PI;g.strokeStyle='#ff003c';g.lineWidth=5;g.beginPath();g.moveTo(R,R);g.lineTo(R+Math.cos(a)*(R-14),R+Math.sin(a)*(R-14));g.stroke();g.fillStyle='#000';g.beginPath();g.arc(R,R,R*.28,0,7);g.fill();g.fillStyle='#fcee0a';g.font='bold 18px monospace';g.textAlign='center';g.fillText(d.id,R,R+6)}}
function drawWave(d){const o=$(`#ov${d.id}`),w=$(`#wv${d.id}`),go=o.getContext('2d'),gw=w.getContext('2d');go.fillStyle='#000';go.fillRect(0,0,o.width,o.height);gw.fillStyle='#000';gw.fillRect(0,0,w.width,w.height);
 if(d.peaks&&d.buf){const p=d.peaks,n=p.length,dur=d.buf.duration,t=d.el.currentTime;go.fillStyle='#00f0ff';for(let x=0;x<o.width;x++){const v=p[Math.floor(x/o.width*n)]*o.height;go.fillRect(x,(o.height-v)/2,1,v)}go.fillStyle='#fcee0a';go.fillRect(t/dur*o.width,0,2,o.height);
  const span=8,pps=n/dur,x0=t-span/2;for(let x=0;x<w.width;x++){const tt=x0+x/w.width*span;if(tt<0||tt>dur)continue;const v=p[Math.floor(tt*pps)]*w.height;gw.fillStyle=x<w.width/2?'#b026ff':'#00f0ff';gw.fillRect(x,(w.height-v)/2,1,v)}
  if(d.bpm){const bl=60/d.bpm;let b=d.off+Math.ceil((x0-d.off)/bl)*bl;for(;b<x0+span;b+=bl){const x=(b-x0)/span*w.width,bi=Math.round((b-d.off)/bl);gw.fillStyle=bi%4==0?'#ff003c':'#ffffff44';gw.fillRect(x,0,bi%4==0?2:1,w.height)}}
  if(d.loop){gw.fillStyle='#fcee0a33';gw.fillRect((d.loop.s-x0)/span*w.width,0,(d.loop.e-d.loop.s)/span*w.width,w.height)}d.cues.forEach((c,i)=>{if(c==null)return;go.fillStyle='#ff003c';go.fillRect(c/dur*o.width,0,2,o.height)});gw.fillStyle='#fff';gw.fillRect(w.width/2,0,2,w.height)}
 else if(d.kind){gw.fillStyle='#00f0ff';gw.font='14px monospace';gw.fillText(d.kind=='plain'?'📻 RADIO (PLAIN) – brak dostępu do sygnału':'📻 STRUMIEŃ NA ŻYWO',10,40)}
 const m=new Uint8Array(256);d.meter.getByteTimeDomainData(m);let pk=0;for(const v of m)pk=Math.max(pk,Math.abs(v-128));$(`#mt${d.id}`).style.width=(d.kind=='plain'&&d.playing?40:pk/128*100)+'%';
 $(`#st${d.id}`).textContent=(d.playing?'▶ ':'❚❚ ')+(d.buf?fmt(d.el.currentTime)+' / '+fmt(d.buf.duration):'')+(d.ebpm?' · '+d.ebpm.toFixed(1)+' BPM':'')}
const fmt=s=>{s=Math.max(0,s||0);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')};
function genUI(){const g=$('#gen');g.innerHTML=TR.map(t=>`<div class="gl">${TRN[t]}</div>`+[...Array(16)].map((_,i)=>{const v=gen.tr[t]?gen.tr[t][i]:0;return `<div class="gc ${v?(t=='B'||t=='M'?'n':v==2?'r':'a'):''}" data-t="${t}" data-s="${i}" title="${t=='B'||t=='M'?(v?KEYS[(v+gen.key-5+120)%12]:''):''}"></div>`}).join('')).join('');
 $('#gStyle').value=gen.style;$('#gBpm').value=gen.bpm;$('#gSwing').value=gen.sw;$('#gGlide').checked=gen.gl}
function radiosUI(f){$('#radios').innerHTML=RADIOS.map((r,i)=>f=='all'||r.g==f?`<div class="st"><span><b>${esc(r.n)}</b><span class="tag" style="color:${r.cors?'var(--y)':'#889'}">${r.cors?'FX':'PLAIN'}</span><span class="tag">${r.g=='techno'?'techno':'hip-hop'}</span></span><span><button data-ra="${i}" data-dk="A">A</button><button data-ra="${i}" data-dk="B">B</button></span></div>`:'').join('')}
// ---------- visualizer ----------
let flash=0,lastBeat=-1;
function viz(){requestAnimationFrame(viz);const c=$('#viz'),g=c.getContext('2d'),W=c.width,H=c.height;g.fillStyle='rgba(5,5,10,.4)';g.fillRect(0,0,W,H);if(!an)return;
 const f=new Uint8Array(an.frequencyBinCount);an.getByteFrequencyData(f);let bass=0;for(let i=0;i<10;i++)bass+=f[i];bass/=2550;const bt=Math.floor(ctx.currentTime/(60/BPM));if(bt!=lastBeat){lastBeat=bt;flash=1}flash*=.9;
 g.strokeStyle=`rgba(176,38,255,${.3+flash*.5})`;g.lineWidth=1;for(let i=0;i<12;i++){const y=H*.55+Math.pow(i/12,2)*H*.45;g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke()}for(let i=-10;i<=10;i++){g.beginPath();g.moveTo(W/2+i*20,H*.55);g.lineTo(W/2+i*140,H);g.stroke()}
 const N=110,bw=W/N;for(let i=0;i<N;i++){const v=f[Math.floor(i*f.length/N/2.2)]/255,h=v*H*.55;g.fillStyle=i%2?'#00f0ff':'#fcee0a';g.globalAlpha=.85;g.fillRect(i*bw,H*.55-h,bw-2,h);g.globalAlpha=.25;g.fillRect(i*bw,H*.55,bw-2,h*.4)}g.globalAlpha=1;
 const t=performance.now()/1000;g.strokeStyle='#ff003c';g.shadowColor='#ff003c';g.shadowBlur=14;g.lineWidth=5+bass*14;g.beginPath();for(let i=0;i<=80;i++){const x=W*.05+i*W*.9/80,y=H*.3+Math.sin(i*.22+t*3)*(18+bass*55)*Math.sin(i/80*Math.PI);i?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();g.shadowBlur=0;
 g.fillStyle=`rgba(252,238,10,${flash*.12})`;g.fillRect(0,0,W,H);g.fillStyle='#fcee0a';g.font='bold 13px monospace';g.fillText('BEAST 2077 · '+BPM.toFixed(1)+' BPM'+(ad.on?' · AUTO DJ':''),10,16)}
// ---------- Auto DJ ----------
const ad={on:false,next:0,bars:0,nextBarT:0,mix:null,flip:false,count:0};
function masterDeck(){const v=+$('#xf').value;return v<.5?decks.A:decks.B}
function tickBar(){if(!ctx)return;const md=masterDeck();BPM=md.playing&&md.ebpm?md.ebpm:(gen.play?gen.bpm:BPM);$('#bpmG').textContent=BPM.toFixed(1);const bl=4*60/BPM;
 if(ctx.currentTime>=ad.nextBarT){ad.nextBarT=Math.max(ad.nextBarT+bl,ctx.currentTime);ad.bars++;if(ad.on)adBar()}}
function adGenre(){const g=$('#adGenre').value;if(g!='mix')return g;return ad.count%2?'hiphop':'techno'}
async function adPrepare(d,genre){const src=$('#adSrc').value;const r=Math.random();
 if(src=='radio'||(src=='all'&&r<.3)){const list=RADIOS.filter(x=>x.g==genre&&x.cors);const st=pick(list.length?list:RADIOS.filter(x=>x.g==genre));d.loadRadio(st);return 'radio '+st.n}
 const styles=genre=='techno'?['techno','minimal','hardtechno','melodic']:['trap','boombap','drill','lofi'];genRandom(pick(styles));if(genre=='techno'&&masterDeck().ebpm)gen.bpm=Math.round(masterDeck().ebpm);genUI();
 const buf=await genRender(4);await d.loadBuffer(buf,'GEN '+gen.style+' '+gen.bpm,gen.bpm);d.play();return 'generator '+gen.style}
async function adBar(){if(ad.mix){const m=ad.mix,p=(ad.bars-m.start)/m.len;const v=m.from+(m.to-m.from)*Math.min(1,p);setXf(v);
  if(p>=.75&&!m.fx){m.fx=1;m.out.setFx({type:pick(['echo','filter','spiral','reverb']),frac:pick([.5,1]),mix:.6,on:true})}
  if(p>=1){m.out.setFx({on:false});m.out.pause();if(m.out.loop)m.out.loop=null;ad.mix=null;ad.next=ad.bars+ +$('#adBars').value;log('🤖 Miks zakończony → Deck '+m.inn.id)}return}
 if(ad.bars<ad.next)return;const out=masterDeck(),inn=decks[out.id=='A'?'B':'A'];const genre=adGenre();ad.count++;
 const what=await adPrepare(inn,genre);if(inn.bpm&&out.playing&&out.ebpm&&genre=='techno')inn.sync();
 if(out.playing&&Math.random()<.35){out.setFx({type:'roll',frac:.25,mix:.7,on:true});setTimeout(()=>out.setFx({on:false}),60/BPM*4*1000)}
 const len=out.playing?8:1;ad.mix={start:ad.bars,len,from:+$('#xf').value,to:inn.id=='B'?1:0,out,inn,fx:0};log(`🤖 AUTO DJ: ${genre} · Deck ${inn.id} ← ${what} · crossfade ${len} taktów`)}
// ---------- start ----------
$('#go').onclick=()=>{ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.85;an=ctx.createAnalyser();an.fftSize=2048;master.connect(an).connect(ctx.destination);revIR=mkIR(ctx,2.6);noiseBuf=mkNoise(ctx);genOut=ctx.createGain();genOut.gain.value=.8;genOut.connect(master);
 ui.build();decks.A=new Deck('A');decks.B=new Deck('B');ui.bind();setXf(0);$('#start').style.display='none';
 $('#gKey').innerHTML=KEYS.map((k,i)=>`<option value="${i}">${k}</option>`).join('');$('#gKey').value=gen.key;$('#gPad').innerHTML=[...Array(8)].map((_,i)=>`<option value="${i}">${i+1}</option>`).join('');
 genRandom('trap');radiosUI('all');ui.recog(decks.A);setInterval(()=>{genTick();tickBar()},25);(function loop(){requestAnimationFrame(loop);for(const k in decks){const d=decks[k];if(d.loop&&d.el.currentTime>=d.loop.e)d.el.currentTime=d.loop.s;drawWave(d);d.drawJog&&d.drawJog()}})();viz();log('⚡ Beast 2077 online. Mikrofon wyłączony.')};
$('#gStyle').onchange=e=>genRandom(e.target.value);$('#gRand').onclick=()=>genRandom($('#gStyle').value);$('#gMut').onclick=genMutate;
$('#gPlay').onclick=e=>{gen.play=!gen.play;e.target.classList.toggle('on',gen.play);if(gen.play){gen.step=0;gen.nt=ctx.currentTime+.05}};
$('#gBpm').onchange=e=>gen.bpm=Math.max(60,Math.min(200,+e.target.value));$('#gSwing').oninput=e=>gen.sw=+e.target.value;$('#gGlide').onchange=e=>gen.gl=e.target.checked;$('#gKey').onchange=e=>{gen.key=+e.target.value;genUI()};
$('#gen').onclick=e=>{const c=e.target.closest('.gc');if(!c)return;const t=c.dataset.t,i=+c.dataset.s,a=gen.tr[t];if(t=='B')a[i]=a[i]?0:36;else if(t=='M')a[i]=a[i]?0:63;else if(t=='H')a[i]=(a[i]+1)%3;else a[i]=a[i]?0:1;genUI()};
$('#gWav').onclick=async()=>{const b=await genRender(+$('#gBars').value);saveBlob(wav(b),`beast2077-${gen.style}-${gen.bpm}bpm.wav`);log('⬇ Eksport WAV '+gen.style)};
for(const k of ['A','B'])$('#gTo'+k).onclick=async()=>{const b=await genRender(+$('#gBars').value);await decks[k].loadBuffer(b,'GEN '+gen.style+' '+gen.bpm,gen.bpm);decks[k].play();log('🎛 Loop → Deck '+k)};
$('#gToPad').onclick=async()=>{const b=await genRender(1),i=+$('#gPad').value,ab=await wav(b).arrayBuffer();await toPad(i,`2077-${gen.style}.wav`,ab);log('🥁 Loop → sample pad '+(i+1)+' (Super G App)')};
document.addEventListener('click',e=>{const t=e.target.dataset;if(t.ra!==undefined)decks[t.dk].loadRadio(RADIOS[+t.ra]);if(t.rg){$$('[data-rg]').forEach(b=>b.classList.toggle('on',b==e.target));radiosUI(t.rg)}});
$('#micBtn').onclick=()=>micAnalyse();
$('#autoDj').onclick=e=>{ad.on=!ad.on;e.target.classList.toggle('on',ad.on);if(ad.on){ad.next=ad.bars+1;log('🤖 AUTO DJ 2077 WŁĄCZONY')}else{ad.mix=null;log('🤖 AUTO DJ wyłączony')}};
window.Beast2077={decks:()=>decks,gen,genRandom,genRender,ad,RADIOS,readTags,analyse,keyFrom};
