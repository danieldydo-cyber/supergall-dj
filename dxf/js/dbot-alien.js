/* Super Bot D 53 — „D” the alien host on the home screen: an ORIGINAL character (teal-green space lounge alien, aviator shades,
 * gold chain with a D pendant, rings, bubble bath, glowing mic). Layered SVG + canvas:
 *  • background = live copy of the MilkDrop canvas + radio/deck spectrum (reacts to the radio through the v53 audio bridge)
 *  • mouth lip-sync to TTS (speechSynthesis boundary events + speaking flag), blinking, head bob on the BPM,
 *    listening / thinking / talking states from „Rozmowa na żywo” and the chat, sunglasses reflect the visualization.
 *  • wired to the same D chat (D7Chat / D7Super / team routing); 🎙 button starts the voice conversation. */
(function (global) {
  'use strict';
  var A = { avatar: (function () { try { return localStorage.getItem('dal.avatar54') || 'alien'; } catch (_) { return 'alien'; } })(), mounted: false, mouth: 0, mouthT: 0, speaking: false, blinkT: 0, state: 'idle', bpm: 120, t0: performance.now(), frames: 0 };
  function $(s, r) { return (r || document).querySelector(s); }
  // v54 „D” alien: ORIGINAL retro bath-time alien — brown wrinkly skin, long swaying neck, big eyes behind glossy aviators
  // (live MilkDrop reflection), gold chains with D pendant (shimmer), rings + bracelet, mic (no cigarette), bubble bath with
  // bubbles rising on the beat, retro rotary phone that rings when D delegates to a bot.
  var SVG = '' +
  '<svg viewBox="0 0 400 300" class="dal-svg" aria-hidden="true"><defs>' +
  '<radialGradient id="dalSkin" cx="42%" cy="32%" r="75%"><stop offset="0" stop-color="#c79a6b"/><stop offset=".55" stop-color="#8a5e3b"/><stop offset="1" stop-color="#4a2f1c"/></radialGradient>' +
  '<linearGradient id="dalNeck" x1="0" x2="1"><stop offset="0" stop-color="#5a3a22"/><stop offset=".45" stop-color="#a77a50"/><stop offset="1" stop-color="#4a2f1c"/></linearGradient>' +
  '<linearGradient id="dalGold" class="dal-shim" x1="0" x2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#9c6d12"/><stop offset=".42" stop-color="#e2b43a"/><stop offset=".5" stop-color="#fffbe0"/><stop offset=".58" stop-color="#e2b43a"/><stop offset="1" stop-color="#9c6d12"/></linearGradient>' +
  '<linearGradient id="dalTub" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf6e8"/><stop offset="1" stop-color="#d9c7a6"/></linearGradient>' +
  '<linearGradient id="dalGloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
  '<pattern id="dalRefl" patternUnits="objectBoundingBox" width="1" height="1"><image class="dal-refl" href="" x="0" y="0" width="70" height="48" preserveAspectRatio="xMidYMid slice"/></pattern>' +
  '<radialGradient id="dalGlow"><stop offset="0" stop-color="#ffb347" stop-opacity=".95"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>' +
  // retro rotary phone on the tub rim (rings on delegation)
  '<g class="dal-phone"><path d="M30 252 Q30 222 62 220 Q94 222 94 252Z" fill="#c4372f" stroke="#6d1712" stroke-width="2"/><circle cx="62" cy="240" r="11" fill="#f3e3c3" stroke="#6d1712"/>' +
  [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { var a = i * .7 - 2.2; return '<circle cx="' + (62 + Math.cos(a) * 7).toFixed(1) + '" cy="' + (240 + Math.sin(a) * 7).toFixed(1) + '" r="1.6" fill="#6d1712"/>'; }).join('') +
  '<g class="dal-handset"><path d="M26 222 Q62 204 98 222 L92 230 Q62 216 32 230Z" fill="#d8443a" stroke="#6d1712" stroke-width="2"/><ellipse cx="30" cy="226" rx="8" ry="5" fill="#d8443a"/><ellipse cx="94" cy="226" rx="8" ry="5" fill="#d8443a"/></g>' +
  '<path d="M94 248 Q120 270 112 290" stroke="#6d1712" stroke-width="2" fill="none" stroke-dasharray="3 2"/>' +
  '<g class="dal-ring" opacity="0" stroke="#ffd36b" stroke-width="3" fill="none" stroke-linecap="round"><path d="M18 210 Q12 222 18 234"/><path d="M8 204 Q0 222 8 240"/><path d="M106 210 Q112 222 106 234"/><path d="M116 204 Q124 222 116 240"/></g>' +
  '<text class="dal-call" x="62" y="198" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="13" fill="#ffd36b"></text></g>' +
  // body in the tub (shoulders) + chains
  '<g class="dal-body"><path d="M128 300 C130 246 160 228 200 228 C240 228 270 246 272 300Z" fill="url(#dalSkin)"/>' +
  '<path d="M150 262 Q170 270 186 262 M214 262 Q230 270 250 262" stroke="#4a2f1c" stroke-width="1.5" fill="none" opacity=".6"/>' +
  '<path d="M164 236 Q200 282 236 236" stroke="url(#dalGold)" stroke-width="6" fill="none" stroke-dasharray="8 3"/><path d="M172 238 Q200 266 228 238" stroke="url(#dalGold)" stroke-width="3.5" fill="none" stroke-dasharray="4 2"/>' +
  '<g class="dal-pend"><circle cx="200" cy="284" r="17" fill="url(#dalGold)" stroke="#7a520c" stroke-width="2"/><text x="200" y="292" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="22" fill="#5a3a00">X</text><circle class="dal-spark" cx="192" cy="276" r="2.5" fill="#fff"/></g>' +
  // arm with mic, bracelet + rings
  '<g class="dal-arm"><path d="M262 300 Q306 256 296 214" stroke="url(#dalNeck)" stroke-width="18" fill="none" stroke-linecap="round"/><path d="M276 270 l10 -6 M282 258 l10 -4" stroke="#4a2f1c" stroke-width="1.5"/>' +
  '<rect x="282" y="236" width="24" height="8" rx="3" fill="url(#dalGold)" transform="rotate(-20 294 240)"/>' +
  '<ellipse cx="296" cy="208" rx="14" ry="12" fill="url(#dalSkin)"/><circle cx="288" cy="210" r="4.5" fill="none" stroke="url(#dalGold)" stroke-width="3"/><circle cx="300" cy="213" r="4.5" fill="none" stroke="url(#dalGold)" stroke-width="3"/><circle cx="300" cy="208" r="2.4" fill="#ff4fa3"/>' +
  '<rect x="290" y="160" width="12" height="46" rx="5" fill="#1e1e1e" transform="rotate(12 296 183)"/><circle class="dal-mic" cx="290" cy="156" r="15" fill="#3a3a3a" stroke="url(#dalGold)" stroke-width="3"/><path d="M280 150 h20 M279 156 h22 M280 162 h20" stroke="#666" stroke-width="1.2"/><circle class="dal-micglow" cx="290" cy="156" r="30" fill="url(#dalGlow)" opacity=".5"/></g>' +
  '</g>' +
  // long neck + head sway together
  '<g class="dal-sway"><path d="M182 240 Q178 214 186 186 L214 186 Q222 214 218 240Z" fill="url(#dalNeck)"/>' +
  '<path d="M184 200 Q200 206 216 200 M182 214 Q200 221 218 214 M182 228 Q200 235 218 228" stroke="#3a2414" stroke-width="1.6" fill="none" opacity=".7"/>' +
  '<g class="dal-head">' +
  '<path d="M118 120 Q120 58 200 54 Q280 58 282 120 Q284 160 252 182 Q228 200 200 200 Q172 200 148 182 Q116 160 118 120Z" fill="url(#dalSkin)"/>' +
  // wrinkles: forehead, temples, cheeks
  '<path d="M156 76 Q200 64 244 76 M164 86 Q200 76 236 86 M146 96 Q154 90 162 96 M238 96 Q246 90 254 96" stroke="#4a2f1c" stroke-width="1.8" fill="none" opacity=".75" stroke-linecap="round"/>' +
  '<path d="M134 136 Q140 150 136 162 M266 136 Q260 150 264 162 M160 164 Q168 172 164 182 M240 164 Q232 172 236 182" stroke="#4a2f1c" stroke-width="1.5" fill="none" opacity=".6"/>' +
  '<ellipse cx="190" cy="150" rx="4" ry="2.5" fill="#3a2414"/><ellipse cx="210" cy="150" rx="4" ry="2.5" fill="#3a2414"/>' +
  // big eyes (peek around/under the shades) + lid for blink
  '<g class="dal-eyes"><ellipse cx="164" cy="121" rx="24" ry="16" fill="#1b2a3a"/><ellipse cx="236" cy="121" rx="24" ry="16" fill="#1b2a3a"/><circle cx="170" cy="116" r="5" fill="#bfe8ff"/><circle cx="242" cy="116" r="5" fill="#bfe8ff"/></g>' +
  '<path class="dal-lid" d="M150 108 h100 v0 h-100z" fill="#8a5e3b"/>' +
  // glossy aviators with MilkDrop reflection
  '<g class="dal-shades"><path d="M124 106 Q164 96 194 108 Q196 142 166 152 Q128 150 124 106Z" fill="url(#dalRefl)" stroke="url(#dalGold)" stroke-width="3.5" opacity=".9"/>' +
  '<path d="M276 106 Q236 96 206 108 Q204 142 234 152 Q272 150 276 106Z" fill="url(#dalRefl)" stroke="url(#dalGold)" stroke-width="3.5" opacity=".9"/>' +
  '<path d="M124 106 Q164 96 194 108 Q196 142 166 152 Q128 150 124 106Z" fill="url(#dalGloss)"/><path d="M276 106 Q236 96 206 108 Q204 142 234 152 Q272 150 276 106Z" fill="url(#dalGloss)"/>' +
  '<path d="M194 110 Q200 104 206 110" stroke="url(#dalGold)" stroke-width="3.5" fill="none"/><path d="M124 106 L112 112 M276 106 L288 112" stroke="url(#dalGold)" stroke-width="3"/></g>' +
  // mouth (lip sync) with lips
  '<g class="dal-mouthg"><path d="M172 175 Q200 168 228 175" stroke="#5a3a22" stroke-width="3" fill="none" stroke-linecap="round"/><path class="dal-mouth" d="M178 176 Q200 186 222 176 Q200 190 178 176Z" fill="#2a0e10" stroke="#5a3a22" stroke-width="2"/></g>' +
  '<g class="dal-think" opacity="0"><circle cx="290" cy="70" r="6" fill="#fff"/><circle cx="306" cy="52" r="9" fill="#fff"/><circle cx="330" cy="32" r="14" fill="#fff"/><text x="330" y="38" text-anchor="middle" font-size="14">💭</text></g>' +
  '<g class="dal-listen" opacity="0" stroke="#7fffd4" stroke-width="3" fill="none" stroke-linecap="round"><path d="M104 110 Q96 124 104 138"/><path d="M94 104 Q84 124 94 144"/></g>' +
  '</g></g>' +
  // bubble bath front + hand with rings on the rim
  '<g class="dal-tub"><rect x="20" y="256" width="360" height="56" rx="26" fill="url(#dalTub)" stroke="#b9a37f"/><g class="dal-foam" fill="#fff">' +
  [40, 74, 108, 140, 172, 230, 262, 296, 330, 362].map(function (x, i) { return '<circle cx="' + x + '" cy="' + (256 + (i % 2) * 6) + '" r="' + (14 + (i % 3) * 4) + '"/>'; }).join('') +
  '</g><g class="dal-hand"><ellipse cx="138" cy="252" rx="18" ry="9" fill="url(#dalSkin)"/><circle cx="128" cy="250" r="4.5" fill="none" stroke="url(#dalGold)" stroke-width="3"/><circle cx="141" cy="252" r="4.5" fill="none" stroke="url(#dalGold)" stroke-width="3"/><circle cx="141" cy="247" r="2.5" fill="#7fe0ff"/></g></g>' +
  '<g class="dal-bubbles" fill="rgba(255,255,255,.12)" stroke="#fff" stroke-opacity=".75"></g></svg>';
  var CSS = '.dal-stage{position:relative;height:clamp(200px,34vh,330px);margin:0 0 6px;border-radius:18px;overflow:hidden;background:#05060c;border:1px solid #3b2a7a;flex:0 0 auto}' +
    '.dal-bg{position:absolute;inset:0;width:100%;height:100%;opacity:.9}.dal-svg{position:absolute;left:50%;bottom:0;height:100%;transform:translateX(-50%);overflow:visible;filter:drop-shadow(0 0 14px #2fb89a88)}' +
    '.dal-say{position:absolute;left:10px;top:10px;max-width:46%;background:rgba(10,6,30,.82);color:#e9f;padding:8px 11px;border-radius:14px 14px 14px 4px;font:13px/1.35 system-ui;border:1px solid #7f5cff;max-height:62%;overflow:hidden}' +
    '.dal-say:empty{display:none}.dal-ctl{position:absolute;right:10px;top:10px;display:flex;gap:6px}.dal-ctl button{border-radius:20px;border:1px solid #7f5cff;background:#1a0f3a;color:#fff;padding:7px 12px;font:600 13px system-ui;cursor:pointer}' +
    '.dal-st{position:absolute;right:12px;bottom:10px;color:#9ff;font:12px system-ui;text-shadow:0 0 6px #000}.dal-stage.min{height:46px}.dal-stage.min .dal-svg,.dal-stage.min .dal-say{display:none}';

  // Moon party backdrop (original, inspired by a retro B/W moon-DJ scene): stars, Earth, lunar horizon, dancing alien
  // silhouettes on the BPM, turntables + MOON speakers; the MilkDrop picture and the spectrum glow over it.
  var STARS = []; for (var si = 0; si < 90; si++) STARS.push([Math.random(), Math.random() * .62, Math.random() * 1.2 + .3, Math.random() * 6]);
  function dancer(g, x, y, sc, ph, lvl) {
    var arm = Math.sin(ph * Math.PI * 2), hip = Math.sin(ph * Math.PI * 2 + 1) * 3 * sc;
    g.save(); g.translate(x + hip, y - Math.abs(arm) * 3 * sc); g.scale(sc, sc); g.fillStyle = g.strokeStyle = 'rgba(190,200,190,' + (.55 + lvl * .4) + ')'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.ellipse(0, -30, 7, 9, 0, 0, 7); g.fill(); g.fillStyle = '#05060c'; g.beginPath(); g.ellipse(-3, -30, 2.4, 3.6, -.4, 0, 7); g.ellipse(3, -30, 2.4, 3.6, .4, 0, 7); g.fill();
    g.beginPath(); g.moveTo(0, -21); g.lineTo(0, -2); g.moveTo(0, -17); g.lineTo(-9, -24 - arm * 10); g.moveTo(0, -17); g.lineTo(9, -24 + arm * 10); g.moveTo(0, -2); g.lineTo(-6 - arm * 3, 12); g.moveTo(0, -2); g.lineTo(6 - arm * 3, 12); g.stroke(); g.restore();
  }
  function scene(g, W, H, t, bpm, lvl) {
    var sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#020208'); sky.addColorStop(1, '#14141c'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (var i = 0; i < STARS.length; i++) { var s = STARS[i]; g.fillStyle = 'rgba(255,255,255,' + (.35 + .35 * Math.sin(t * 2 + s[3])) + ')'; g.fillRect(s[0] * W, s[1] * H, s[2], s[2]); }
    var ex = W * .18, ey = H * .26, er = H * .17; var eg = g.createRadialGradient(ex - er * .3, ey - er * .3, er * .1, ex, ey, er); eg.addColorStop(0, '#e8f2ff'); eg.addColorStop(.6, '#7d93b8'); eg.addColorStop(1, '#2a3346'); g.fillStyle = eg; g.beginPath(); g.arc(ex, ey, er, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 2; for (var k = 0; k < 3; k++) { g.beginPath(); g.arc(ex, ey, er * (.35 + k * .2), t * .2 + k, t * .2 + k + 1.6); g.stroke(); }
    g.fillStyle = '#4a4a52'; g.beginPath(); g.moveTo(0, H * .7); for (var x = 0; x <= W; x += 16) g.lineTo(x, H * .68 + Math.sin(x * .05) * 4 + Math.sin(x * .013) * 7); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; for (var c = 0; c < 7; c++) { g.beginPath(); g.ellipse((c * 53 + 20) % W, H * .8 + (c % 3) * 9, 12 + (c % 2) * 6, 3, 0, 0, 7); g.fill(); }
    var beat = (t * bpm / 60) % 1;
    [[.06, .8, .9], [.13, .76, .7], [.24, .79, .8], [.74, .78, .75], [.84, .8, .95], [.93, .76, .7]].forEach(function (d, i) { dancer(g, d[0] * W, d[1] * H, d[2] * H / 180, beat + i * .17, lvl); });
    g.fillStyle = '#222'; g.fillRect(0, H * .88, W * .12, H * .12); g.fillRect(W * .88, H * .88, W * .12, H * .12); g.fillStyle = '#555'; g.font = 'bold ' + Math.round(H * .045) + 'px Arial'; g.fillText('MOON', W * .015, H * .97); g.fillText('MOON', W * .89, H * .97);
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(W * .3, H * .93, W * .055, H * .03, 0, 0, 7); g.ellipse(W * .7, H * .93, W * .055, H * .03, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); var ang = t * 3.5; g.moveTo(W * .3, H * .93); g.lineTo(W * .3 + Math.cos(ang) * W * .05, H * .93 + Math.sin(ang) * H * .025); g.moveTo(W * .7, H * .93); g.lineTo(W * .7 + Math.cos(-ang) * W * .05, H * .93 + Math.sin(-ang) * H * .025); g.stroke();
  }

  // ===== Leśny Duch / Mędrzec (MAIN avatar): hooded forest spirit, white beard, eye patch, staff with a glowing orb, fur cloak,
  // two ravens (flap/caw to the beat, one flies off to deliver tasks to the team bots), misty mossy forest.
  var SVG_SAGE = '<svg viewBox="0 0 400 300" class="dal-svg" aria-hidden="true"><defs>' +
  '<radialGradient id="sgSkin" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#f1d2b4"/><stop offset="1" stop-color="#b48466"/></radialGradient>' +
  '<linearGradient id="sgHood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b4f45"/><stop offset="1" stop-color="#23261f"/></linearGradient>' +
  '<linearGradient id="sgFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b7a62"/><stop offset="1" stop-color="#4d3f2e"/></linearGradient>' +
  '<radialGradient id="dalGlow"><stop offset="0" class="sg-orbc" stop-color="#7fffd4" stop-opacity="1"/><stop offset="1" stop-color="#7fffd4" stop-opacity="0"/></radialGradient></defs>' +
  '<g class="dal-body"><path d="M95 300 C100 225 140 200 200 198 C260 200 300 225 305 300Z" fill="url(#sgHood)"/>' +
  '<path d="M118 240 Q200 205 282 240 L290 262 Q200 228 110 262Z" fill="url(#sgFur)"/>' +
  '<g class="dal-arm"><rect x="296" y="60" width="9" height="240" rx="4" fill="#5b3a1f" transform="rotate(4 300 180)"/><circle cx="306" cy="58" r="11" fill="#cfffee"/><circle class="dal-micglow" cx="306" cy="58" r="36" fill="url(#dalGlow)" opacity=".7"/>' +
  '<ellipse cx="292" cy="226" rx="16" ry="11" fill="url(#sgSkin)"/></g></g>' +
  '<g class="dal-head"><path d="M128 120 Q132 34 200 30 Q268 34 272 120 L262 200 Q200 214 138 200Z" fill="url(#sgHood)"/>' +
  '<ellipse cx="200" cy="122" rx="50" ry="56" fill="url(#sgSkin)"/>' +
  '<path d="M156 112 Q172 102 188 110" stroke="#eee" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M212 110 Q228 102 244 112" stroke="#eee" stroke-width="5" fill="none" stroke-linecap="round"/>' +
  '<g class="dal-eyes"><ellipse cx="226" cy="124" rx="9" ry="6" fill="#fff"/><circle cx="227" cy="124" r="3.6" fill="#2c5f8a"/></g>' +
  '<path class="dal-lid" d="M214 116 h26 v0 h-26z" fill="#d9b393"/>' +
  '<path d="M160 104 L206 140" stroke="#222" stroke-width="3"/><ellipse cx="174" cy="125" rx="13" ry="10" fill="#1b1b1b"/>' +
  '<path d="M196 128 Q200 146 206 128" fill="#c99677"/>' +
  // beard (lower part moves with the mouth) + moustache
  '<g class="dal-beard"><path d="M150 140 Q152 236 200 268 Q248 236 250 140 Q236 176 200 178 Q164 176 150 140Z" fill="#f2f2ee"/><path d="M168 200 Q172 236 186 252 M200 196 L200 262 M232 200 Q228 236 214 252" stroke="#cfcfc8" stroke-width="2" fill="none"/></g>' +
  '<g class="dal-mouthg"><path class="dal-mouth" d="M182 160 Q200 166 218 160 Q200 168 182 160Z" fill="#3b1d16"/></g>' +
  '<path d="M170 156 Q186 146 200 154 Q214 146 230 156 Q214 162 200 158 Q186 162 170 156Z" fill="#fff"/>' +
  '<g class="dal-think" opacity="0"><circle cx="110" cy="70" r="6" fill="#dfe"/><circle cx="92" cy="50" r="9" fill="#dfe"/><circle cx="70" cy="30" r="14" fill="#dfe"/><text x="70" y="36" text-anchor="middle" font-size="14">💭</text></g></g>' +
  // ravens: one on the shoulder, one on the staff top (messenger)
  '<g class="sg-raven sg-r1" transform="translate(120 196)"><path d="M0 0 Q12 -14 26 -6 L40 -8 L28 0 Q18 10 0 0Z" fill="#111"/><path class="sg-wing" d="M8 -4 Q18 -24 30 -10" fill="#1a1a1a"/><circle cx="31" cy="-7" r="1.6" fill="#f5c542"/></g>' +
  '<g class="sg-raven sg-r2" transform="translate(286 44)"><path d="M0 0 Q12 -14 26 -6 L40 -8 L28 0 Q18 10 0 0Z" fill="#111"/><path class="sg-wing" d="M8 -4 Q18 -24 30 -10" fill="#1a1a1a"/><circle cx="31" cy="-7" r="1.6" fill="#f5c542"/></g>' +
  '<text class="sg-bot" x="200" y="292" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="15" fill="#cfffee"></text></svg>';
  var FOG = []; for (var fi = 0; fi < 7; fi++) FOG.push([Math.random(), .45 + Math.random() * .5, .25 + Math.random() * .35, Math.random() * 6]);
  function forest(g, W, H, t, bpm, lvl) {
    var sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0d1712'); sky.addColorStop(1, '#1f3424'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (var layer = 0; layer < 3; layer++) { g.fillStyle = ['#1a2a1e', '#22382a', '#2c4a34'][layer]; for (var k = 0; k < 9; k++) { var x = ((k * 61 + layer * 37) % (W + 40)) - 20, w = 10 + layer * 7, sway = Math.sin(t * .4 + k) * 2; g.fillRect(x + sway, 0, w, H); g.beginPath(); g.moveTo(x - 22 + sway, H * (.25 + layer * .1)); g.lineTo(x + w / 2 + sway, H * (.05 + layer * .08)); g.lineTo(x + w + 22 + sway, H * (.25 + layer * .1)); g.fill(); } }
    g.fillStyle = '#3d5e32'; g.beginPath(); g.moveTo(0, H * .86); for (var x2 = 0; x2 <= W; x2 += 20) g.lineTo(x2, H * .84 + Math.sin(x2 * .07) * 5); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    var beat = (t * bpm / 60) % 1;
    for (var i = 0; i < FOG.length; i++) { var f = FOG[i], fx = ((f[0] + t * .01 * (i % 2 ? 1 : -1)) % 1 + 1) % 1 * W, r = f[2] * W * (1 + lvl * .6 + (1 - beat) * .05); var gr = g.createRadialGradient(fx, f[1] * H, 0, fx, f[1] * H, r); gr.addColorStop(0, 'hsla(' + ((150 + i * 25 + t * 20) % 360) + ',60%,75%,' + (.10 + lvl * .35) + ')'); gr.addColorStop(1, 'rgba(200,230,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  }
  var BOTCOL = { d: '#7fffd4', android: '#a4ff6b', apple: '#f0f0f0', desktop: '#7fb2ff', appbuilder: '#ffd36b', song: '#ff7fd8', dj: '#ff9b4a', looper: '#ffef5c', video: '#c58bff' };

  // ===== v55 SHOW mode: fullscreen MilkDrop (stronger preset cycling on beat/drop) + big transparent avatar overlay,
  // subtitles of what D says, mic for live conversation, bot delegation via phone ring / raven. Auto when the radio starts.
  var SHCSS = 'body.dal-showing{background:#000!important}body.dal-showing *{visibility:hidden!important}body.dal-showing #sx-viz,body.dal-showing .dal-sh,body.dal-showing .dal-sh *{visibility:visible!important}body.dal-showing .dal-sh .shsub:empty{visibility:hidden!important}body.dal-showing #sx-viz{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483100!important;display:block!important;opacity:1!important;visibility:visible!important;transform:none!important;filter:saturate(1.25) contrast(1.08)}' +
    '.dal-sh{position:fixed;inset:0;z-index:2147483200;pointer-events:none;font-family:system-ui}.dal-sh .dal-svg{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(92vw,112vh);height:auto;filter:drop-shadow(0 0 24px rgba(0,0,0,.6))}' +
    '.dal-sh .shc{position:absolute;right:16px;top:14px;display:flex;gap:8px;pointer-events:auto}.dal-sh .shc button{border-radius:24px;border:1px solid #fff6;background:rgba(10,6,30,.6);color:#fff;padding:10px 16px;font:700 15px system-ui;cursor:pointer;backdrop-filter:blur(4px)}' +
    '.dal-sh .shmic{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);pointer-events:auto;width:76px;height:76px;border-radius:50%;border:2px solid #fff;background:radial-gradient(#ff5cf0,#7b2cff);color:#fff;font-size:32px;box-shadow:0 0 30px #ff5cf0;cursor:pointer}.dal-sh .shmic.on{animation:shp 1s infinite}@keyframes shp{50%{box-shadow:0 0 60px #5cf0ff}}' +
    '.dal-sh .shsub{position:absolute;left:50%;top:64px;transform:translateX(-50%);max-width:min(900px,90vw);text-align:center;color:#fff;font:600 clamp(16px,2.6vw,28px)/1.3 system-ui;text-shadow:0 2px 6px #000,0 0 12px #000;background:rgba(0,0,0,.35);padding:8px 16px;border-radius:14px}.dal-sh .shsub:empty{display:none}' +
    '.dal-sh .shst{position:absolute;left:16px;top:16px;color:#fff;font:700 15px system-ui;text-shadow:0 0 8px #000;background:rgba(0,0,0,.35);padding:6px 12px;border-radius:12px}.dal-sh .shflash{position:absolute;inset:0;background:radial-gradient(circle,rgba(255,255,255,.35),transparent 70%);opacity:0}';
  var Show = { on: false, el: null, lastPreset: 0, beats: 0, lastBeat: -1, bassAvg: 0,
    auto: function () { try { return localStorage.getItem('dal.showAuto') !== '0'; } catch (_) { return true; } },
    adopt: function () { var svg = A.el && A.el.querySelector('.dal-svg'); if (svg && Show.el) Show.el.insertBefore(svg, Show.el.firstChild); },
    enter: function () {
      if (Show.on) return; Show.on = true;
      if (!document.getElementById('dal-shcss')) { var st = document.createElement('style'); st.id = 'dal-shcss'; st.textContent = SHCSS; document.head.appendChild(st); }
      var e = Show.el = document.createElement('div'); e.className = 'dal-sh';
      e.innerHTML = '<div class="shflash"></div><div class="shst"></div><div class="shc"><button type="button" class="shav" title="Zmień postać">' + (A.avatar === 'alien' ? '🌲' : '👽') + '</button><button type="button" class="shnext" title="Następny preset">✨</button><button type="button" class="shfs" title="Pełny ekran">⛶</button><button type="button" class="shx" title="Wyjdź z Show">✕</button></div><div class="shsub" aria-live="polite"></div><button type="button" class="shmic" title="Rozmowa na żywo z D">🎙</button>';
      document.body.appendChild(e); document.body.classList.add('dal-showing'); Show.adopt();
      e.querySelector('.shx').onclick = Show.exit;
      e.querySelector('.shnext').onclick = function () { Show.preset(); };
      e.querySelector('.shfs').onclick = function () { try { document.documentElement.requestFullscreen(); } catch (_) {} };
      e.querySelector('.shav').onclick = function () { var b = A.el && A.el.querySelector('.dal-av'); if (b) { var svg = Show.el.querySelector('.dal-svg'); if (svg) svg.remove(); b.click(); } this.textContent = A.avatar === 'alien' ? '🌲' : '👽'; };
      e.querySelector('.shmic').onclick = function () { var L = global.DBotTalk && global.DBotTalk.live; if (!L) return; if (L.on) L.stop(); else { L.start(); A.inline = true; setTimeout(function () { if (L.el) L.el.hidden = true; }, 50); } };
      try { global.dispatchEvent(new Event('resize')); } catch (_) {}
      try { var X = global.SpecialX.api; X.setAuto && X.setAuto(true); } catch (_) {}
      document.addEventListener('keydown', Show.key, true);
    },
    exit: function () {
      if (!Show.on) return; Show.on = false; Show.dismissed = true; setTimeout(function () { Show.dismissed = false; }, 1000 * 60 * 30); var svg = Show.el && Show.el.querySelector('.dal-svg'), cv = A.el && A.el.querySelector('.dal-bg');
      if (svg && cv) cv.parentNode.insertBefore(svg, cv.nextSibling); if (Show.el) Show.el.remove(); Show.el = null; document.body.classList.remove('dal-showing');
      document.removeEventListener('keydown', Show.key, true); try { global.dispatchEvent(new Event('resize')); } catch (_) {}
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) {}
    },
    key: function (ev) { if (ev.key === 'Escape') Show.exit(); else if (ev.key === ' ' && ev.target === document.body) { ev.preventDefault(); Show.preset(); } },
    preset: function () { try { global.SpecialX.api.presetRandom(); Show.lastPreset = performance.now(); Show.presets = (Show.presets || 0) + 1; } catch (_) {} },
    tick: function (now, t, s, beat) {
      if (!Show.on || !Show.el) return;
      // stronger cycling: every 8 beats, or immediately on a drop (bass jumps well above its running average)
      var bass = 0; if (A.fb) { for (var i = 1; i < 8; i++) bass += A.fb[i]; bass /= 7 * 255; }
      Show.bassAvg += (bass - Show.bassAvg) * .02; var drop = bass > .35 && bass > Show.bassAvg * 1.7;
      var bi = Math.floor(t * A.bpm / 60); if (bi !== Show.lastBeat) { Show.lastBeat = bi; Show.beats++; Show.flash = 1; if (Show.beats % 8 === 0 && now - Show.lastPreset > 2500) Show.preset(); }
      if (drop && now - Show.lastPreset > 1500) Show.preset();
      Show.flash = Math.max(0, (Show.flash || 0) - .08); var fl = Show.el.querySelector('.shflash'); if (fl) fl.style.opacity = (Show.flash * (.25 + (A.level || 0))).toFixed(2);
      var cv = document.getElementById('sx-viz'); if (cv) cv.style.transform = 'scale(' + (1 + (1 - beat) * .015 + (A.level || 0) * .04).toFixed(3) + ')';
      var sub = Show.el.querySelector('.shsub'), txt = (A.say ? A.say.textContent : '').split(/\n/).filter(function (l) { return l.trim() && !/^(👍|👎|⬇|Nie teraz)/.test(l.trim()); }).join(' ').replace(/⬇[^]*$/, '').replace(/\s*👍\s*👎\s*$/, '').slice(0, 180); if (sub.textContent !== txt) sub.textContent = txt;
      var L = global.DBotTalk && global.DBotTalk.live, mic = Show.el.querySelector('.shmic'); mic.classList.toggle('on', !!(L && L.on)); mic.textContent = L && L.on ? '⏹' : '🎙';
      var R = global.DBotV52 && global.DBotV52.roles, rb = R && R[A.bot || 'd'], src = 'beat'; try { src = A.level > .01 ? 'audio' : 'beat'; } catch (_) {}
      Show.el.querySelector('.shst').textContent = (A.stEl ? A.stEl.textContent.replace(/ · \d+ BPM$/, '') : '') + ' · ' + Math.round(A.bpm) + ' BPM · ' + (src === 'audio' ? '🔊 audio' : '🥁 beat') + (rb && A.bot !== 'd' ? ' · ' + rb.icon + ' ' + rb.name : '');
    }
  };
  var lastMusic = false;
  function autoShow() { var X = null; try { X = global.SpecialX.api.snapshot(); } catch (_) {} var radio = !!((X && X.radioPlaying) || (global.DBotGenre && global.DBotGenre.radio.playing && global.DBotGenre.radio.playing()));
    if (radio && !lastMusic && Show.auto() && !Show.on && !Show.dismissed) Show.enter(); lastMusic = radio; }
  setInterval(autoShow, 1000);
  function viz() { return document.getElementById('sx-viz'); }
  function audio() { try { return global.SpecialX && global.SpecialX.api && global.SpecialX.api.audio ? global.SpecialX.api.audio() : null; } catch (_) { return null; } }
  function musicOn() { try { var X = global.SpecialX.api.snapshot(); return !!(X.radioPlaying || (X.decks || []).some(function (d) { return d.playing; }) || (global.DBotGenre && global.DBotGenre.radio.playing())); } catch (_) { return false; } }
  function mount() {
    if (A.mounted) return true; var panel = document.getElementById('d7c-panel'), log = document.getElementById('d7c-log');
    if (!panel || !log) return false;
    if (!document.getElementById('dal-css')) { var st = document.createElement('style'); st.id = 'dal-css'; st.textContent = CSS; document.head.appendChild(st); }
    var d = document.createElement('div'); d.className = 'dal-stage'; d.id = 'dal-stage'; d.setAttribute('aria-label', A.avatar === 'alien' ? 'D — animowany kosmita, rozmawia z Tobą (X)' : 'Leśny Duch — mędrzec D, rozmawia z Tobą (X)');
    d.innerHTML = '<canvas class="dal-bg" width="480" height="270"></canvas>' + (A.avatar === 'alien' ? SVG : SVG_SAGE) + '<div class="dal-say" aria-live="polite"></div>' +
      '<div class="dal-ctl"><button type="button" class="dal-show" title="Show: pełny ekran MilkDrop + X">🎆 Show</button><button type="button" class="dal-sauto" title="Show włącza się samo, gdy gra radio"></button><button type="button" class="dal-talk">🎙 Pogadaj z X</button><button type="button" class="dal-av" title="Zmień postać: Leśny Duch / Kosmita D">' + (A.avatar === 'alien' ? '🌲' : '👽') + '</button><button type="button" class="dal-min" title="Zwiń / rozwiń postać">▾</button></div><div class="dal-st"></div>';
    log.parentNode.insertBefore(d, log); A.el = d; A.mounted = true;
    A.bg = $('.dal-bg', d); A.g = A.bg.getContext('2d'); A.head = $('.dal-head', d); A.mouthEl = $('.dal-mouth', d); A.lid = $('.dal-lid', d); A.think = $('.dal-think', d); A.say = $('.dal-say', d); A.stEl = $('.dal-st', d); A.refl = $('.dal-refl', d); A.glow = $('.dal-micglow', d); A.ants = d.querySelectorAll('.dal-ant'); A.ravens = d.querySelectorAll('.sg-raven'); A.wings = d.querySelectorAll('.sg-wing'); A.beard = $('.dal-beard', d); A.botEl = $('.sg-bot', d); A.orbc = $('.sg-orbc', d); A.sway = $('.dal-sway', d); A.handset = $('.dal-handset', d); A.ringEl = $('.dal-ring', d); A.callEl = $('.dal-call', d); A.bubG = $('.dal-bubbles', d); A.shim = $('.dal-shim', d); A.spark = $('.dal-spark', d); A.listenEl = $('.dal-listen', d); A.bubs = []; A.lastBeat = 0;
    A.rc = document.createElement('canvas'); A.rc.width = 96; A.rc.height = 60;
    $('.dal-talk', d).onclick = function () { var L = global.DBotTalk && global.DBotTalk.live; if (!L) return; if (L.on) { L.stop(); this.textContent = '🎙 Pogadaj z X'; } else { var r = L.start(); this.textContent = '⏹ Koniec rozmowy'; A.setSay(r || ''); setTimeout(function () { if (L.el) L.el.hidden = true; }, 50); A.inline = true; } };
    $('.dal-show', d).onclick = function () { Show.on ? Show.exit() : Show.enter(); };
    var sa = $('.dal-sauto', d); function saTxt() { sa.textContent = 'auto ' + (Show.auto() ? '✅' : '⬜'); } saTxt(); sa.onclick = function () { try { localStorage.setItem('dal.showAuto', Show.auto() ? '0' : '1'); } catch (_) {} saTxt(); };
    if (Show.on) setTimeout(function () { Show.adopt(); }, 0);
    $('.dal-av', d).onclick = function () { A.avatar = A.avatar === 'alien' ? 'sage' : 'alien'; try { localStorage.setItem('dal.avatar54', A.avatar); } catch (_) {} d.remove(); A.mounted = false; A.el = null; mount(); };
    $('.dal-min', d).onclick = function () { d.classList.toggle('min'); try { localStorage.setItem('dal.min', d.classList.contains('min') ? '1' : '0'); } catch (_) {} };
    try { if (localStorage.getItem('dal.min') === '1') d.classList.add('min'); } catch (_) {}
    watchChat(); requestAnimationFrame(frame); return true;
  }
  var BOTRE = [['android', /Android Builder/], ['apple', /Apple Builder/], ['desktop', /Desktop Builder/], ['appbuilder', /Web Builder|Zbudowałem offline/], ['song', /D Song/], ['dj', /DJ ?\/ ?Mix|DJ Mixer|AUTO MIX/], ['looper', /D Loop|MPC/], ['video', /D Video/]];
  function whichBot(t) { for (var i = 0; i < BOTRE.length; i++) if (BOTRE[i][1].test(t)) return BOTRE[i][0]; return 'd'; }
  A.setSay = function (t) { if (A.say) A.say.textContent = String(t || '').replace(/```[\s\S]*?```/g, '[kod]').slice(0, 220); };
  function watchChat() {
    var log = document.getElementById('d7c-log'); if (!log) return;
    new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) {
      if (!n.classList) return; if (n.classList.contains('bot') && !n.classList.contains('typing')) { A.setSay(n.textContent); A.bot = whichBot(n.textContent); if (A.bot !== 'd') A.flyUntil = performance.now() + 2600; A.talkUntil = performance.now() + Math.min(9000, 900 + (n.textContent || '').length * 45); }
      if (n.classList.contains('user')) { A.thinkUntil = performance.now() + 2500; }
    }); }); }).observe(log, { childList: true });
  }
  // TTS lip sync: boundary events open the mouth on every word; speaking flag keeps it moving
  (function hookTts() {
    try { var sp0 = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = function (u) { try { u.addEventListener('start', function () { A.speaking = true; }); u.addEventListener('end', function () { A.speaking = false; }); u.addEventListener('error', function () { A.speaking = false; }); u.addEventListener('boundary', function () { A.mouthT = performance.now(); }); } catch (_) {} return sp0(u); }; } catch (_) {}
  })();
  function state(now) {
    var L = global.DBotTalk && global.DBotTalk.live, ls = L && L.on ? L.state : '';
    if (ls === 'listening' || ls === 'hearing') return 'listening';
    if (ls === 'thinking' || now < (A.thinkUntil || 0)) return 'thinking';
    if (A.speaking || ls === 'speaking' || now < (A.talkUntil || 0)) return 'talking';
    return musicOn() ? 'dancing' : 'idle';
  }
  function frame(now) {
    if (!A.el || !document.body.contains(A.el)) { A.mounted = false; return; }
    requestAnimationFrame(frame); A.frames++;
    var t = (now - A.t0) / 1000, s = state(now); A.state = s; A.el.dataset.state = s;
    try { A.bpm = global.SpecialX.api.snapshot().bpm || 120; } catch (_) {}
    // background: MilkDrop copy + spectrum
    var g = A.g, W = A.bg.width, H = A.bg.height, v = viz(), au = audio(), lvl = 0;
    if (A.avatar === 'alien') scene(g, W, H, t, A.bpm, A.level || 0); else forest(g, W, H, t, A.bpm, A.level || 0);
    if (v && v.width) { try { g.globalCompositeOperation = 'screen'; g.globalAlpha = A.avatar === 'alien' ? .55 : .3; g.drawImage(v, 0, 0, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } catch (_) {} }
    if (au && au.analyser) { if (!A.fb) A.fb = new Uint8Array(au.analyser.frequencyBinCount); au.analyser.getByteFrequencyData(A.fb); var n = 48; for (var i = 0; i < n; i++) { var x = A.fb[Math.floor(i * A.fb.length / n / 2)] / 255; lvl += x; g.fillStyle = 'hsla(' + ((i * 7 + t * 40) % 360) + ',95%,60%,.55)'; g.fillRect(i * W / n, H - x * H * .9, W / n - 1, x * H * .9); } lvl /= n; }
    A.level = lvl;
    // reflection in the shades = the visualization
    if (A.refl && A.frames % 15 === 0) { try { var rg = A.rc.getContext('2d'); rg.drawImage(A.bg, 0, 0, 96, 60); A.refl.setAttribute('href', A.rc.toDataURL('image/jpeg', .6)); } catch (_) {} }
    // head bob on the beat (dancing), float otherwise
    var beat = (t * A.bpm / 60) % 1; var bob = s === 'dancing' ? Math.sin(beat * Math.PI * 2) * 7 + lvl * 10 : Math.sin(t * 1.3) * 3, tilt = s === 'listening' ? -8 : s === 'thinking' ? 6 : s === 'dancing' ? Math.sin(t * A.bpm / 120 * Math.PI) * 5 : 0;
    A.head.setAttribute('transform', 'translate(0 ' + bob.toFixed(1) + ') rotate(' + tilt.toFixed(1) + ' 200 200)');
    // mouth
    var open = 0;
    if (s === 'talking') { var sinceB = now - A.mouthT; open = sinceB < 220 ? 1 - sinceB / 220 : 0; open = Math.max(open, .35 + .35 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 4.3))); }
    else if (s === 'dancing') open = .15 + lvl * .6;
    A.mouth += (open - A.mouth) * .45; var my = 176 + A.mouth * 22;
    A.mouthEl.setAttribute('d', 'M178 176 Q200 ' + (178 - A.mouth * 3).toFixed(1) + ' 222 176 Q200 ' + my.toFixed(1) + ' 178 176Z');
    // blink
    if (now > A.blinkT) A.blinkT = now + 2200 + Math.random() * 3200; var bl = A.blinkT - now < 140 ? 1 : 0;
    A.lid.setAttribute('d', 'M150 108 h100 v' + (bl * 26) + ' h-100z');
    A.think.setAttribute('opacity', s === 'thinking' ? (.6 + .4 * Math.sin(t * 6)).toFixed(2) : '0');
    A.glow.setAttribute('opacity', (s === 'listening' ? .5 + .5 * Math.abs(Math.sin(t * 5)) : .3 + lvl).toFixed(2));
    for (var k = 0; k < A.ants.length; k++) A.ants[k].setAttribute('r', (7 + (s === 'dancing' ? (1 - beat) * 5 : Math.sin(t * 3 + k) * 1.5)).toFixed(1));
    if (A.beard) A.beard.setAttribute('transform', 'translate(0 ' + (A.mouth * 7).toFixed(1) + ')');
    if (A.wings) for (var w = 0; w < A.wings.length; w++) A.wings[w].setAttribute('transform', 'rotate(' + ((s === 'dancing' ? Math.sin(beat * Math.PI * 2 + w) * 25 : Math.sin(t * 2 + w) * 6)).toFixed(1) + ' 8 -4)');
    if (A.ravens && A.ravens[1]) { var fl = A.flyUntil && now < A.flyUntil ? 1 - (A.flyUntil - now) / 2600 : 0, arc = Math.sin(fl * Math.PI); A.ravens[1].setAttribute('transform', 'translate(' + (286 + fl * 160).toFixed(1) + ' ' + (44 - arc * 40).toFixed(1) + ')' + (fl ? ' scale(' + (1 - arc * .3).toFixed(2) + ')' : '')); if (A.wings[1] && fl) A.wings[1].setAttribute('transform', 'rotate(' + (Math.sin(t * 30) * 35).toFixed(1) + ' 8 -4)'); }
    if (A.orbc) { var col = BOTCOL[A.bot || 'd'] || BOTCOL.d; A.orbc.setAttribute('stop-color', col); }
    if (A.botEl) { var R = global.DBotV52 && global.DBotV52.roles, rb = R && R[A.bot || 'd']; A.botEl.textContent = rb ? (A.bot && A.bot !== 'd' ? '🐦‍⬛ → ' : '') + rb.icon + ' ' + rb.name : ''; }
    try { var LV = global.DBotTalk && global.DBotTalk.live; if (LV) { if (A.inline && LV.on && LV.el && !LV.el.hidden) LV.el.hidden = true; if (!LV.on) A.inline = false; var oi = LV.el && LV.el.querySelector('.dl-orb img'); if (oi && !oi.__dal) { oi.__dal = 1; oi.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent((A.avatar === 'alien' ? SVG : SVG_SAGE).replace('class="dal-svg"', 'xmlns="http://www.w3.org/2000/svg"')); } } } catch (_) {}
    if (A.sway) {
      var nk = s === 'dancing' ? Math.sin(t * A.bpm / 120 * Math.PI) * 6 : Math.sin(t * .9) * 2.5;
      A.sway.setAttribute('transform', 'rotate(' + nk.toFixed(2) + ' 200 250)');
      if (A.shim) A.shim.setAttribute('gradientTransform', 'translate(' + (((t * .35) % 2) - 1).toFixed(3) + ' 0)');
      if (A.spark) A.spark.setAttribute('opacity', (.3 + .7 * Math.abs(Math.sin(t * 2.2))).toFixed(2));
      if (A.listenEl) A.listenEl.setAttribute('opacity', s === 'listening' ? (.4 + .6 * Math.abs(Math.sin(t * 4))).toFixed(2) : '0');
      var ringing = A.flyUntil && now < A.flyUntil + 1400;
      if (A.handset) A.handset.setAttribute('transform', ringing ? 'translate(0 ' + (-3 - Math.abs(Math.sin(t * 40)) * 4).toFixed(1) + ') rotate(' + (Math.sin(t * 60) * 4).toFixed(1) + ' 62 222)' : '');
      if (A.ringEl) A.ringEl.setAttribute('opacity', ringing ? (Math.sin(t * 20) > 0 ? '1' : '.3') : '0');
      if (A.callEl) { var R2 = global.DBotV52 && global.DBotV52.roles, rr = R2 && R2[A.bot || 'd']; A.callEl.textContent = ringing && rr ? '☎ ' + rr.icon + ' ' + rr.name : ''; }
      // bubbles: a burst on every beat (more when loud), rising + wobbling
      var bi = Math.floor(t * A.bpm / 60);
      if (bi !== A.lastBeat) { A.lastBeat = bi; var nb = 1 + Math.round((A.level || 0) * 6) + (s === 'dancing' ? 1 : 0); for (var q = 0; q < nb && A.bubs.length < 40; q++) A.bubs.push({ x: 30 + Math.random() * 340, y: 262, r: 2 + Math.random() * 6, v: 18 + Math.random() * 30, p: Math.random() * 6, b: t }); }
      var dt = Math.min(.1, t - (A.lastT || t)); A.lastT = t; var hs = '';
      A.bubs = A.bubs.filter(function (b) { b.y -= b.v * dt; return b.y > -10; });
      if (A.frames % 2 === 0 && A.bubG) { A.bubs.forEach(function (b) { hs += '<circle cx="' + (b.x + Math.sin(t * 3 + b.p) * 4).toFixed(1) + '" cy="' + b.y.toFixed(1) + '" r="' + b.r.toFixed(1) + '"/>'; }); A.bubG.innerHTML = hs; }
    }
    try { Show.tick(now, t, s, beat); } catch (_) {}
    A.stEl.textContent = { idle: A.avatar === 'alien' ? '😎 X chilluje' : '🌲 Duch lasu czuwa', dancing: (A.avatar === 'alien' ? '🕺 X tańczy · ' : '🐦‍⬛ kruki tańczą · ') + Math.round(A.bpm) + ' BPM', talking: '🗣 X mówi', listening: '👂 X słucha…', thinking: '🧠 X myśli…' }[s];
  }
  var iv = setInterval(function () { if (mount()) clearInterval(iv); }, 600); setTimeout(function () { clearInterval(iv); }, 60000);
  global.DBotAlien = { state: function () { return A.state; }, avatar: function () { return A.avatar; }, show: Show, bot: function () { return A.bot || 'd'; }, frames: function () { return A.frames; }, mouth: function () { return A.mouth; }, level: function () { return A.level; }, say: function (t) { A.setSay(t); A.talkUntil = performance.now() + 3000; }, el: function () { return A.el; } };
})(window);
