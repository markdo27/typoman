
// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const graphCanvas = document.getElementById('graphCanvas');
const gCtx = graphCanvas.getContext('2d');
const spectrumFill = document.getElementById('spectrumFill');
const warpOverlay = document.getElementById('warpOverlay');
const warpCtx = warpOverlay.getContext('2d');

// ═══════════════════════════════════════════════════════════════════════
// MATH & GENERATIVE UTILS (Kinetic Constructivism)
// ═══════════════════════════════════════════════════════════════════════
const E = {
  sine: t => 1 - Math.cos((t * Math.PI) / 2),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  bounce: t => { const n1 = 7.5625, d1 = 2.75; if (t < 1 / d1) return n1 * t * t; if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75; if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375; return n1 * (t -= 2.625 / d1) * t + 0.984375; },
  elastic: t => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
  spring: t => { const c4 = (2 * Math.PI) / 3; return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; }
};

let noiseData = new Float32Array(256 * 256);
for(let i=0; i<noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
function getNoise(x, y) {
  const ix = Math.floor(Math.abs(x) % 256), iy = Math.floor(Math.abs(y) % 256);
  return noiseData[iy * 256 + ix];
}

const motionPresets = {
  wave: (t, i, n, I) => Math.sin(t * 3 + i * 0.5) * (0.4 * I) + 0.6,
  accordion: (t, i, n, I) => { const ph = (t * 2 + i * 0.3) % 4; const v = ph < 2 ? 0.3 + ph * 0.7 : 1.7 - (ph - 2) * 0.7; return 1 + (v - 1) * I; },
  cascade: (t, i, n, I) => { const delay = i * 0.15, p = (t * 0.8 - delay) % 2.5; const v = p < 0 ? 0.2 : p < 0.4 ? 0.2 + (p/0.4)*1.1 : p < 1.0 ? 1.3 - ((p-0.4)/0.6)*1.1 : 0.2; return 1 + (v - 1) * I; },
  warpFlow: (t, i, n, I) => 0.7 + (Math.sin(t * 1.5 + i * 0.8) + Math.sin(t * 4.2 + i * 1.2) * 0.3) * (0.4 * I),
  blockIn: (t, i, n, I) => { const c = (t * 0.8) % 3; const v = c < 1 ? E.outQuint(c) : c < 2 ? 1.0 : 1.0 - E.outQuint(c - 2); return 1 + (v - 1) * I; },
  bounce: (t, i, n, I) => { const tt = (t * 1.2 + i * 0.1) % 2; const v = tt < 1 ? E.bounce(tt) : 1 - E.bounce(tt - 1); return 1 + (v - 1) * I; },
  spring: (t, i, n, I) => { const tt = (t * 0.7 + i * 0.05) % 2.5; const v = tt < 1.5 ? E.spring(tt/1.5) : 1; return 1 + (v - 1) * I; },
  breathe: (t, i, n, I) => 0.8 + Math.sin(t * 1.2) * (0.35 * I),
  typewriter: (t, i, n, I) => (t * 0.8 - i * 0.05) % 2 < 1 ? 1 : 0.01,
  elastic: (t, i, n, I) => { const tt = (t * 0.6 + i * 0.1) % 2; const v = tt < 1 ? E.elastic(tt) : 1 - E.elastic(tt - 1); return 1 + (v - 1) * I; },
  entropy: (t, i, n, I) => 1.0 + (getNoise(i * 10, t * 2) * 0.5 + getNoise(t * 1.5, i * 8) * 0.5) * I,
  quantum: (t, i, n, I) => 1.0 + (Math.sin(t * 3.5 + i * 0.4) * Math.sin(t * 7.2 + i * 0.9) * 0.5) * I
};

let words = ['TYPO', 'MAN'];
let wordColors = [null, null];
let wordFonts = [null, null];
let wordSkew = [0, 0];
let wordCondense = [1.0, 1.0];
let wordAlign = ['fill', 'fill'];
let lineScales = [1.0, 1.0];
let canvasW = 500, canvasH = 500;
let bgColor = '#0a0a0f', textColor = '#ffffff';
let letterSpacing = 0, rowPadPx = 0;
let currentFont = "'Anton', sans-serif";
let animFrame = null, activePreset = null;
let animTime = 0, lastTimestamp = null, motionSpeed = 1, motionIntensity = 0.6;
let textCase = 'upper';
let fillMode = 'solid';
let gradColor1 = '#ff4757', gradColor2 = '#6c5ce7', gradAngle = 0;
let stripeWidth = 8, stripeAngle = 45;
let bgPattern = 'none';
let patOpacity = 0.15, patScale = 1.0;
let sidebarEnabled = false, sidebarText = 'TYPOMAN', sidebarPos = 'left', sidebarWidth = 36;
let audioCtx = null, analyser = null, audioSource = null, audioActive = false;
let audioData = new Uint8Array(0), audioLevel = 0;
let webcamActive = false, webcamStream = null;
const webcamVideo = document.getElementById('webcamVideo');
let noiseCanvas = null;
let exportRes = 1;
let activeFx = null, fxStrength = 0.5;

// Warp state
let warpEnabled = false, warpOpacity = 0.7;
let warpPoints = []; // [{x,y,dx,dy}]
const WARP_RADIUS = 60;

// Custom fonts
let customFonts = []; // [{name, css, url}]
let customFontCounter = 0;

// ═══════════════════════════════════════════════════════════════════════
// FONT SYSTEM
// ═══════════════════════════════════════════════════════════════════════
const ALL_FONTS = [
  {name:'Anton', css:"'Anton', sans-serif"},
  {name:'Bebas', css:"'Bebas Neue', sans-serif"},
  {name:'Oswald', css:"'Oswald', sans-serif"},
  {name:'Playfair', css:"'Playfair Display', serif"},
  {name:'Righteous', css:"'Righteous', sans-serif"},
  {name:'Archivo', css:"'Archivo Black', sans-serif"},
  {name:'Russo', css:"'Russo One', sans-serif"},
  {name:'Impact', css:"Impact, sans-serif"},
  {name:'Monoton', css:"'Monoton', sans-serif"},
  {name:'Rubik', css:"'Rubik Mono One', sans-serif"},
  {name:'BlackOps', css:"'Black Ops One', sans-serif"},
  {name:'Bungee', css:"'Bungee', sans-serif"},
  {name:'Ultra', css:"'Ultra', serif"},
];

function getAllFonts() { return [...ALL_FONTS, ...customFonts]; }
function getFontName(css) {
  if (!css) return 'Global';
  const f = getAllFonts().find(f => f.css === css);
  return f ? f.name : 'Global';
}
function getNextFont(css) {
  const fonts = getAllFonts();
  const idx = fonts.findIndex(f => f.css === css);
  if (idx === -1) return fonts[0].css;
  return fonts[(idx + 1) % fonts.length].css;
}

// Font upload
const MAX_FONT_SIZE = 10 * 1024 * 1024; // 10MB security limit
document.getElementById('fontFileInput').addEventListener('change', async e => {
  for (const file of e.target.files) {
    if (file.size > MAX_FONT_SIZE) {
      console.warn(`Font too large: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB, max 10MB)`);
      continue;
    }
    const name = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '').replace(/[<>"'&]/g, '');
    const familyName = 'Custom_' + (++customFontCounter) + '_' + name.replace(/[^a-zA-Z0-9]/g,'');
    const url = URL.createObjectURL(file);
    const face = new FontFace(familyName, `url(${url})`);
    try {
      const loaded = await face.load();
      document.fonts.add(loaded);
      const fontEntry = { name, css: `'${familyName}', sans-serif`, url };
      customFonts.push(fontEntry);

      // Also add a preset button
      const btn = document.createElement('button');
      btn.className = 'fpbtn';
      btn.dataset.font = fontEntry.css;
      btn.textContent = name;
      btn.style.borderColor = 'rgba(46,213,115,0.3)';
      document.getElementById('fontPresets').appendChild(btn);

      buildCustomFontsList();
      if (!activePreset) draw();
    } catch (err) {
      console.warn('Font load failed:', err);
      const notice = document.createElement('div');
      notice.textContent = `⚠ Failed to load: ${name}`;
      notice.style.cssText = 'font-size:10px;color:var(--danger);padding:2px 8px;margin-top:2px;';
      document.getElementById('customFontsList').appendChild(notice);
      setTimeout(() => notice.remove(), 4000);
    }
  }
  e.target.value = '';
});

function buildCustomFontsList() {
  const el = document.getElementById('customFontsList');
  el.innerHTML = '';
  customFonts.forEach((f, i) => {
    const tag = document.createElement('span');
    tag.className = 'custom-font-tag';
    tag.appendChild(document.createTextNode(f.name + ' '));
    const closeBtn = document.createElement('span');
    closeBtn.className = 'cfx';
    closeBtn.textContent = '×';
    tag.appendChild(closeBtn);
    closeBtn.addEventListener('click', () => {
      customFonts.splice(i, 1);
      // Remove preset button too
      const btn = document.querySelector(`.fpbtn[data-font="${f.css}"]`);
      if (btn) btn.remove();
      buildCustomFontsList();
      if (!activePreset) draw();
    });
    el.appendChild(tag);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// TEXT CASE
// ═══════════════════════════════════════════════════════════════════════
function applyCase(text) {
  switch(textCase) {
    case 'upper': return text.toUpperCase();
    case 'lower': return text.toLowerCase();
    case 'title': return text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    case 'alt': return [...text].map((c, i) => i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()).join('');
    case 'none': default: return text;
  }
}
document.getElementById('caseRow').addEventListener('click', e => {
  const btn = e.target.closest('.case-btn'); if (!btn) return;
  document.querySelectorAll('.case-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  textCase = btn.dataset.case;
  if (!activePreset) draw();
});


// ═══════════════════════════════════════════════════════════════════════
// SLIDER ↔ NUMBER SYNC
// ═══════════════════════════════════════════════════════════════════════
function linkSN(slider, numEl, dec, cb) {
  slider.addEventListener('input', () => { const v = parseFloat(slider.value); numEl.value = v.toFixed(dec); cb(v); });
  numEl.addEventListener('change', () => { let v = parseFloat(numEl.value)||0; v = Math.max(parseFloat(slider.min), Math.min(parseFloat(slider.max), v)); slider.value=v; numEl.value=v.toFixed(dec); cb(v); });
}
linkSN(document.getElementById('cw'), document.getElementById('cwn'), 0, v=>{ canvasW=v; if(!activePreset) draw(); });
linkSN(document.getElementById('ch'), document.getElementById('chn'), 0, v=>{ canvasH=v; if(!activePreset) draw(); });
linkSN(document.getElementById('letterSpacing'), document.getElementById('lsn'), 3, v=>{ letterSpacing=v; if(!activePreset) draw(); });
linkSN(document.getElementById('rowPad'), document.getElementById('rpn'), 0, v=>{ rowPadPx=parseInt(v); if(!activePreset) draw(); });
linkSN(document.getElementById('motionSpeed'), document.getElementById('motionSpeedN'), 2, v=>{ motionSpeed=v; });
linkSN(document.getElementById('motionIntensity'), document.getElementById('motionIntN'), 2, v=>{ motionIntensity=v; });
linkSN(document.getElementById('patOpacity'), document.getElementById('patOpN'), 2, v=>{ patOpacity=v; if(!activePreset) draw(); });
linkSN(document.getElementById('patScale'), document.getElementById('patScN'), 1, v=>{ patScale=v; if(!activePreset) draw(); });
linkSN(document.getElementById('stripeW'), document.getElementById('stripeWN'), 0, v=>{ stripeWidth=v; if(!activePreset) draw(); });
linkSN(document.getElementById('stripeA'), document.getElementById('stripeAN'), 0, v=>{ stripeAngle=v; if(!activePreset) draw(); });
linkSN(document.getElementById('sideW'), document.getElementById('sideWN'), 0, v=>{ sidebarWidth=v; if(!activePreset) draw(); });
linkSN(document.getElementById('fxStr'), document.getElementById('fxStrN'), 2, v=>{ fxStrength=v; if(!activePreset) draw(); });
linkSN(document.getElementById('warpOpacity'), document.getElementById('warpOpN'), 2, v=>{ warpOpacity=v; drawWarpOverlay(); });

document.getElementById('grad1').addEventListener('input', e=>{ gradColor1=e.target.value; if(!activePreset) draw(); });
document.getElementById('grad2').addEventListener('input', e=>{ gradColor2=e.target.value; if(!activePreset) draw(); });
document.getElementById('gradAngle').addEventListener('change', e=>{ gradAngle=parseInt(e.target.value)||0; if(!activePreset) draw(); });

// Flip W/H
document.getElementById('flipBtn').addEventListener('click', () => {
  [canvasW, canvasH] = [canvasH, canvasW];
  document.getElementById('cw').value=canvasW; document.getElementById('cwn').value=canvasW;
  document.getElementById('ch').value=canvasH; document.getElementById('chn').value=canvasH;
  noiseCanvas=null; if(!activePreset) draw();
});

// Fill mode
document.getElementById('fillRow').addEventListener('click', e=>{ const btn=e.target.closest('.fill-btn'); if(!btn)return; document.querySelectorAll('.fill-btn').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); fillMode=btn.dataset.fill; document.getElementById('gradOpts').style.display=fillMode==='gradient'?'':'none'; document.getElementById('stripeOpts').style.display=fillMode==='stripe'?'':'none'; if(!activePreset) draw(); });

// BG pattern
document.getElementById('patRow').addEventListener('click', e=>{ const btn=e.target.closest('.pat-btn'); if(!btn)return; document.querySelectorAll('.pat-btn').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); bgPattern=btn.dataset.pat; if(!activePreset) draw(); });

// Export resolution
document.getElementById('resRow').addEventListener('click', e=>{ const btn=e.target.closest('.res-btn'); if(!btn)return; document.querySelectorAll('.res-btn').forEach(b=>b.classList.remove('on')); btn.classList.add('on'); exportRes=parseInt(btn.dataset.res); });

// ═══════════════════════════════════════════════════════════════════════
// COLOR SYSTEM
// ═══════════════════════════════════════════════════════════════════════
const BG_PRESETS = ['#0a0a0f','#ffffff','#1a1a2e','#0f3460','#e94560','#16213e','#533483','#2c3333','#ffd369','#CDFF00','#FF6B35','#00ff87'];
const TEXT_PRESETS = ['#ffffff','#000000','#FF4D00','#FF2D55','#6c5ce7','#00d2d3','#feca57','#ff6b6b','#48dbfb','#2ed573','#a29bfe','#fd79a8'];
let activeBgIdx=0, activeTextIdx=0;

function hexLum(hex) { if(!hex||hex.length<7) return 0.5; const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255; return 0.2126*r+0.7152*g+0.0722*b; }
function contrast(a,b) { const la=hexLum(a),lb=hexLum(b); return(Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); }
function hslToHex(h,s,l) { s/=100;l/=100;const a=s*Math.min(l,1-l);const f=n=>{const k=(n+h/30)%12;const c=l-a*Math.max(-1,Math.min(k-3,9-k,1));return Math.round(255*c).toString(16).padStart(2,'0');};return`#${f(0)}${f(8)}${f(4)}`; }
function randHex() { return '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); }

function buildColorPresets() {
  ['bgPresets','textPresets'].forEach((id,ci)=>{
    const el=document.getElementById(id); el.innerHTML='';
    const colors=ci===0?BG_PRESETS:TEXT_PRESETS;
    const active=ci===0?activeBgIdx:activeTextIdx;
    colors.forEach((c,i)=>{
      const s=document.createElement('div'); s.className='swatch'+(i===active?' active':''); s.setAttribute('role','button'); s.setAttribute('aria-label','Select color '+c);
      const lum=hexLum(c);
      s.style.cssText=`background:${c};border-color:${i===active?'rgba(255,255,255,0.85)':(lum>0.6?'rgba(0,0,0,0.2)':'rgba(255,255,255,0.1)')};`;
      s.addEventListener('click',()=>{ if(ci===0){bgColor=c;activeBgIdx=i;noiseCanvas=null;}else{textColor=c;activeTextIdx=i;} buildColorPresets();if(!activePreset)draw(); });
      el.appendChild(s);
    });
    // Hex input
    const hi=document.createElement('input'); hi.className='hex-input'; hi.value=ci===0?bgColor:textColor;
    hi.addEventListener('change',()=>{
      const v=hi.value.startsWith('#')?hi.value:'#'+hi.value;
      if(/^#[0-9a-f]{6}$/i.test(v)){
        if(ci===0){bgColor=v;activeBgIdx=-1;noiseCanvas=null;}else{textColor=v;activeTextIdx=-1;}
        buildColorPresets();if(!activePreset)draw();
      }
    });
    el.appendChild(hi);
  });
}

document.getElementById('randomBtn').addEventListener('click', randomColors);
document.getElementById('swapBtn').addEventListener('click',()=>{ [bgColor,textColor]=[textColor,bgColor]; noiseCanvas=null; buildColorPresets(); if(!activePreset)draw(); });
function randomColors() {
  const bh=Math.random()*360,bs=65+Math.random()*35,bl=Math.random()<0.5?8+Math.random()*25:60+Math.random()*30;
  bgColor=hslToHex(bh,bs,bl); noiseCanvas=null;
  let tries=0;
  do{ const th=(bh+90+Math.random()*180)%360,ts=55+Math.random()*40,tl=bl>45?8+Math.random()*30:65+Math.random()*30; textColor=hslToHex(th,ts,tl); tries++; }
  while(contrast(bgColor,textColor)<4.5&&tries<30);
  activeBgIdx=-1;activeTextIdx=-1;buildColorPresets();if(!activePreset)draw();
}

// ═══════════════════════════════════════════════════════════════════════
// RATIO & SIZE
// ═══════════════════════════════════════════════════════════════════════
document.getElementById('ratioRow').addEventListener('click',e=>{
  const btn=e.target.closest('.rbtn'); if(!btn)return;
  document.querySelectorAll('.rbtn').forEach(b=>b.classList.remove('on')); btn.classList.add('on');
  canvasW=parseInt(btn.dataset.w);canvasH=parseInt(btn.dataset.h);
  document.getElementById('cw').value=canvasW;document.getElementById('cwn').value=canvasW;
  document.getElementById('ch').value=canvasH;document.getElementById('chn').value=canvasH;
  noiseCanvas=null;if(!activePreset)draw();
});

// ═══════════════════════════════════════════════════════════════════════
// WORD CHIPS
// ═══════════════════════════════════════════════════════════════════════
let dragSrc=null;
function ensureArrays(){const n=words.length;while(wordColors.length<n)wordColors.push(null);while(wordFonts.length<n)wordFonts.push(null);while(wordSkew.length<n)wordSkew.push(0);while(wordCondense.length<n)wordCondense.push(1);while(wordAlign.length<n)wordAlign.push('fill');while(lineScales.length<n)lineScales.push(1);wordColors.length=wordFonts.length=wordSkew.length=wordCondense.length=wordAlign.length=lineScales.length=n;}

function rebuildChips(){
  ensureArrays();
  const wrap=document.getElementById('chipsWrap');wrap.innerHTML='';
  words.forEach((w,i)=>{
    const chip=document.createElement('div');chip.className='chip';chip.draggable=true;
    const colorDot=document.createElement('div');colorDot.className='chip-color';
    colorDot.style.background=wordColors[i]||textColor;
    colorDot.title='Click to set per-word color';
    colorDot.addEventListener('click',e=>{e.stopPropagation();const c=prompt('Hex color for "'+w+'" (empty = global):',wordColors[i]||'');if(c===null)return;wordColors[i]=c&&/^#?[0-9a-f]{3,6}$/i.test(c)?(c.startsWith('#')?c:'#'+c):null;rebuildChips();if(!activePreset)draw();});

    const fontBadge=document.createElement('span');fontBadge.className='chip-font';
    fontBadge.textContent=getFontName(wordFonts[i]);fontBadge.title='Click to cycle font';
    fontBadge.addEventListener('click',e=>{e.stopPropagation();if(!wordFonts[i])wordFonts[i]=currentFont;wordFonts[i]=getNextFont(wordFonts[i]);fontBadge.textContent=getFontName(wordFonts[i]);if(!activePreset)draw();});
    fontBadge.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();wordFonts[i]=null;fontBadge.textContent='Global';if(!activePreset)draw();});

    const span=document.createElement('span');span.className='chip-text';span.contentEditable='true';span.spellcheck=false;span.textContent=w;
    span.addEventListener('input',()=>{words[i]=span.textContent.trim()||'';buildLineControls();buildTransformControls();if(!activePreset)draw();});
    span.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();span.blur();}});

    const x=document.createElement('span');x.className='chip-x';x.textContent='×';
    x.addEventListener('click',e=>{e.stopPropagation();words.splice(i,1);wordColors.splice(i,1);wordFonts.splice(i,1);wordSkew.splice(i,1);wordCondense.splice(i,1);wordAlign.splice(i,1);lineScales.splice(i,1);rebuildChips();buildLineControls();buildTransformControls();if(!activePreset)draw();});

    chip.appendChild(colorDot);chip.appendChild(fontBadge);chip.appendChild(span);chip.appendChild(x);
    chip.addEventListener('dragstart',e=>{dragSrc=i;chip.classList.add('dragging-chip');e.dataTransfer.effectAllowed='move';});
    chip.addEventListener('dragend',()=>{chip.classList.remove('dragging-chip');document.querySelectorAll('.chip').forEach(c=>c.classList.remove('drag-over'));});
    chip.addEventListener('dragover',e=>{e.preventDefault();chip.classList.add('drag-over');});
    chip.addEventListener('dragleave',()=>chip.classList.remove('drag-over'));
    chip.addEventListener('drop',e=>{e.preventDefault();chip.classList.remove('drag-over');if(dragSrc===null||dragSrc===i)return;const splice=(arr,f,t)=>{const it=arr.splice(f,1)[0];arr.splice(t,0,it);};[words,wordColors,wordFonts,wordSkew,wordCondense,wordAlign,lineScales].forEach(a=>splice(a,dragSrc,i));rebuildChips();buildLineControls();buildTransformControls();if(!activePreset)draw();dragSrc=null;});
    wrap.appendChild(chip);
  });
}

document.getElementById('chipAddBtn').addEventListener('click',()=>{words.push('NEW');ensureArrays();rebuildChips();buildLineControls();buildTransformControls();if(!activePreset)draw();const chips=document.querySelectorAll('.chip-text');if(chips.length)chips[chips.length-1].focus();});

// Font presets
document.getElementById('fontPresets').addEventListener('click',e=>{const btn=e.target.closest('.fpbtn');if(!btn)return;document.querySelectorAll('.fpbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentFont=btn.dataset.font;if(!activePreset)draw();});

// ═══════════════════════════════════════════════════════════════════════
// LINE CONTROLS
// ═══════════════════════════════════════════════════════════════════════
function getLines(){return words.filter(w=>w.trim()!=='');}
function buildLineControls(){const lines=getLines();while(lineScales.length<lines.length)lineScales.push(1);lineScales=lineScales.slice(0,lines.length);const list=document.getElementById('linesList');list.innerHTML='';lines.forEach((line,i)=>{const row=document.createElement('div');row.className='line-row';const lbl=document.createElement('span');lbl.className='ll';lbl.textContent=line;const sl=document.createElement('input');sl.type='range';sl.min='0.1';sl.max='1.8';sl.step='0.05';sl.value=lineScales[i];sl.style.flex='1';sl.style.minWidth='0';const ni=document.createElement('input');ni.type='text';ni.className='ni';ni.readOnly=true;ni.style.width='34px';const updatePct=()=>{const tot=lineScales.reduce((a,s)=>a+(s||1),0);ni.value=Math.round((lineScales[i]||1)/tot*100)+'%';};updatePct();sl.addEventListener('input',()=>{lineScales[i]=parseFloat(sl.value);updatePct();document.querySelectorAll('#linesList .ni').forEach((el,j)=>{const tot=lineScales.reduce((a,s)=>a+(s||1),0);el.value=Math.round((lineScales[j]||1)/tot*100)+'%';});if(!activePreset)draw();});row.appendChild(lbl);row.appendChild(sl);row.appendChild(ni);list.appendChild(row);});}
document.getElementById('resetScalesBtn').addEventListener('click',()=>{lineScales=lineScales.map(()=>1);buildLineControls();draw();});

// Transform controls
function buildTransformControls(){const lines=getLines();ensureArrays();const list=document.getElementById('transformList');list.innerHTML='';lines.forEach((line,i)=>{const row=document.createElement('div');row.className='tr-row';const lbl=document.createElement('span');lbl.className='tr-label';lbl.textContent=line;const skewSl=document.createElement('input');skewSl.type='range';skewSl.min='-25';skewSl.max='25';skewSl.step='1';skewSl.value=wordSkew[i]||0;skewSl.className='tr-mini-slider';skewSl.title='Skew';skewSl.addEventListener('input',()=>{wordSkew[i]=parseInt(skewSl.value);if(!activePreset)draw();});const condSl=document.createElement('input');condSl.type='range';condSl.min='0.3';condSl.max='1.5';condSl.step='0.05';condSl.value=wordCondense[i]||1;condSl.className='tr-mini-slider';condSl.title='Condense';condSl.addEventListener('input',()=>{wordCondense[i]=parseFloat(condSl.value);if(!activePreset)draw();});const alignDiv=document.createElement('div');alignDiv.className='align-btns';['◀','▣','▶','⬛'].forEach((icon,ai)=>{const modes=['left','center','right','fill'];const ab=document.createElement('button');ab.className='align-btn'+(wordAlign[i]===modes[ai]?' on':'');ab.textContent=icon;ab.title=modes[ai];ab.addEventListener('click',()=>{wordAlign[i]=modes[ai];alignDiv.querySelectorAll('.align-btn').forEach((b,bi)=>b.classList.toggle('on',bi===ai));if(!activePreset)draw();});alignDiv.appendChild(ab);});row.appendChild(lbl);row.appendChild(skewSl);row.appendChild(condSl);row.appendChild(alignDiv);list.appendChild(row);});}
document.getElementById('resetTransBtn').addEventListener('click',()=>{wordSkew=wordSkew.map(()=>0);wordCondense=wordCondense.map(()=>1);wordAlign=wordAlign.map(()=>'fill');buildTransformControls();if(!activePreset)draw();});

// Sidebar
document.getElementById('sideToggle').addEventListener('click',()=>{sidebarEnabled=!sidebarEnabled;const btn=document.getElementById('sideToggle');btn.classList.toggle('on',sidebarEnabled);btn.textContent=sidebarEnabled?'Enabled':'Enable';if(!activePreset)draw();});
document.getElementById('sideText').addEventListener('input',e=>{sidebarText=e.target.value;if(!activePreset)draw();});
document.querySelectorAll('.side-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.side-btn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');sidebarPos=btn.dataset.pos;if(!activePreset)draw();});});
function drawSidebarText(dctx,W,H){if(!sidebarEnabled||!sidebarText)return;const sw=sidebarWidth;const x=sidebarPos==='left'?0:W-sw;dctx.save();dctx.fillStyle=textColor;dctx.globalAlpha=0.95;dctx.fillRect(x,0,sw,H);dctx.translate(x+sw/2,H/2);dctx.rotate(-Math.PI/2);const sz=Math.round(sw*0.65);dctx.font=`900 ${sz}px ${currentFont}`;dctx.fillStyle=bgColor;dctx.globalAlpha=1;dctx.textAlign='center';dctx.textBaseline='middle';dctx.fillText(applyCase(sidebarText),0,0);dctx.restore();}

// BG pattern
function drawBgPattern(dctx,W,H){if(bgPattern==='none')return;dctx.save();dctx.globalAlpha=patOpacity;const sc=patScale;const patColor=hexLum(bgColor)>0.5?'rgba(0,0,0,':'rgba(255,255,255,';if(bgPattern==='grid'){const gap=Math.round(20*sc);dctx.strokeStyle=patColor+'1)';dctx.lineWidth=0.5;for(let x=0;x<=W;x+=gap){dctx.beginPath();dctx.moveTo(x,0);dctx.lineTo(x,H);dctx.stroke();}for(let y=0;y<=H;y+=gap){dctx.beginPath();dctx.moveTo(0,y);dctx.lineTo(W,y);dctx.stroke();}}else if(bgPattern==='dots'){const gap=Math.round(16*sc);const r=Math.max(1,1.5*sc);dctx.fillStyle=patColor+'1)';for(let x=gap/2;x<W;x+=gap)for(let y=gap/2;y<H;y+=gap){dctx.beginPath();dctx.arc(x,y,r,0,Math.PI*2);dctx.fill();}}else if(bgPattern==='noise'){if(!noiseCanvas||noiseCanvas.width!==W||noiseCanvas.height!==H){noiseCanvas=document.createElement('canvas');noiseCanvas.width=W;noiseCanvas.height=H;const nctx=noiseCanvas.getContext('2d');const id=nctx.createImageData(W,H);for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=40;}nctx.putImageData(id,0,0);}dctx.drawImage(noiseCanvas,0,0);}else if(bgPattern==='pixels'){const bs=Math.round(12*sc);dctx.fillStyle=patColor+'1)';const cols=Math.ceil(W/bs),rows=Math.ceil(H/bs);for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(Math.random()>0.7){dctx.globalAlpha=patOpacity*(0.3+Math.random()*0.7);dctx.fillRect(c*bs,r*bs,bs-1,bs-1);}}else if(bgPattern==='lines'){const gap=Math.round(6*sc);dctx.strokeStyle=patColor+'1)';dctx.lineWidth=1;for(let i=-H;i<W+H;i+=gap){dctx.beginPath();dctx.moveTo(i,0);dctx.lineTo(i+H,H);dctx.stroke();}}dctx.restore();}

// ═══════════════════════════════════════════════════════════════════════
// GRID & WARP
// ═══════════════════════════════════════════════════════════════════════
document.getElementById('gridToggle').addEventListener('click',()=>{
  warpEnabled=!warpEnabled;
  const btn=document.getElementById('gridToggle');
  btn.textContent=warpEnabled?'Grid on':'Grid off';
  btn.classList.toggle('on',warpEnabled);
  warpOverlay.classList.toggle('active',warpEnabled);
  drawWarpOverlay();
});
document.getElementById('resetWarpBtn').addEventListener('click',()=>{warpPoints=[];drawWarpOverlay();if(!activePreset)draw();});

function drawWarpOverlay(){
  const rect=document.getElementById('canvasWrap').getBoundingClientRect();
  const cRect=canvas.getBoundingClientRect();
  warpOverlay.width=cRect.width;warpOverlay.height=cRect.height;
  warpOverlay.style.left=(cRect.left-rect.left)+'px';
  warpOverlay.style.top=(cRect.top-rect.top)+'px';
  warpOverlay.style.width=cRect.width+'px';
  warpOverlay.style.height=cRect.height+'px';

  warpCtx.clearRect(0,0,warpOverlay.width,warpOverlay.height);
  if(!warpEnabled)return;

  // Draw grid
  const gw=warpOverlay.width,gh=warpOverlay.height;
  const cols=8,rows=8;
  const cellW=gw/cols,cellH=gh/rows;
  warpCtx.strokeStyle=`rgba(255,255,255,${warpOpacity*0.3})`;
  warpCtx.lineWidth=0.5;
  for(let c=0;c<=cols;c++){
    warpCtx.beginPath();
    for(let r=0;r<=rows;r++){
      let x=c*cellW,y=r*cellH;
      // Apply warp displacement
      warpPoints.forEach(wp=>{
        const ddx=x-wp.x*gw,ddy=y-wp.y*gh;
        const dist=Math.sqrt(ddx*ddx+ddy*ddy);
        if(dist<WARP_RADIUS){const f=1-dist/WARP_RADIUS;x+=wp.dx*gw*f*0.3;y+=wp.dy*gh*f*0.3;}
      });
      r===0?warpCtx.moveTo(x,y):warpCtx.lineTo(x,y);
    }
    warpCtx.stroke();
  }
  for(let r=0;r<=rows;r++){
    warpCtx.beginPath();
    for(let c=0;c<=cols;c++){
      let x=c*cellW,y=r*cellH;
      warpPoints.forEach(wp=>{
        const ddx=x-wp.x*gw,ddy=y-wp.y*gh;
        const dist=Math.sqrt(ddx*ddx+ddy*ddy);
        if(dist<WARP_RADIUS){const f=1-dist/WARP_RADIUS;x+=wp.dx*gw*f*0.3;y+=wp.dy*gh*f*0.3;}
      });
      c===0?warpCtx.moveTo(x,y):warpCtx.lineTo(x,y);
    }
    warpCtx.stroke();
  }
  // Draw warp handles
  warpPoints.forEach(wp=>{
    warpCtx.beginPath();warpCtx.arc(wp.x*gw,wp.y*gh,5,0,Math.PI*2);
    warpCtx.fillStyle='rgba(255,71,87,0.8)';warpCtx.fill();
    warpCtx.strokeStyle='rgba(255,255,255,0.6)';warpCtx.lineWidth=1;warpCtx.stroke();
  });
}

// Warp drag interaction
let warpDragging=null,warpStartX=0,warpStartY=0;
warpOverlay.addEventListener('mousedown',e=>{
  if(!warpEnabled)return;
  const rect=warpOverlay.getBoundingClientRect();
  const mx=(e.clientX-rect.left)/rect.width,my=(e.clientY-rect.top)/rect.height;
  // Check if clicking existing point
  const existing=warpPoints.findIndex(wp=>{const dx=wp.x-mx,dy=wp.y-my;return Math.sqrt(dx*dx+dy*dy)<0.04;});
  if(existing>=0){warpDragging=existing;warpStartX=mx;warpStartY=my;}
  else{warpPoints.push({x:mx,y:my,dx:0,dy:0});warpDragging=warpPoints.length-1;warpStartX=mx;warpStartY=my;}
  drawWarpOverlay();
});
warpOverlay.addEventListener('mousemove',e=>{
  if(warpDragging===null)return;
  const rect=warpOverlay.getBoundingClientRect();
  const mx=(e.clientX-rect.left)/rect.width,my=(e.clientY-rect.top)/rect.height;
  warpPoints[warpDragging].dx=mx-warpPoints[warpDragging].x;
  warpPoints[warpDragging].dy=my-warpPoints[warpDragging].y;
  drawWarpOverlay();
  if(!activePreset)draw();
});
warpOverlay.addEventListener('mouseup',()=>{warpDragging=null;});
warpOverlay.addEventListener('mouseleave',()=>{warpDragging=null;});

// Apply warp to canvas image
function applyWarp(dctx,W,H){
  if(!warpPoints.length)return;
  const imgData=dctx.getImageData(0,0,W,H);
  const src=new Uint8ClampedArray(imgData.data);
  const dst=imgData.data;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      let sx=x,sy=y;
      warpPoints.forEach(wp=>{
        const wpx=wp.x*W,wpy=wp.y*H;
        const ddx=x-wpx,ddy=y-wpy;
        const dist=Math.sqrt(ddx*ddx+ddy*ddy);
        const r=WARP_RADIUS*(W/500);
        if(dist<r){const f=(1-dist/r);sx-=wp.dx*W*f*0.5;sy-=wp.dy*H*f*0.5;}
      });
      sx=Math.round(Math.max(0,Math.min(W-1,sx)));
      sy=Math.round(Math.max(0,Math.min(H-1,sy)));
      const di=(y*W+x)*4,si=(sy*W+sx)*4;
      dst[di]=src[si];dst[di+1]=src[si+1];dst[di+2]=src[si+2];dst[di+3]=src[si+3];
    }
  }
  dctx.putImageData(imgData,0,0);
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER ENGINE
// ═══════════════════════════════════════════════════════════════════════
function computeLayout(scales){
  const lines=getLines();if(!lines.length)return[];
  const n=lines.length,total=scales.reduce((a,s)=>a+(s||1),0);
  const sideW=sidebarEnabled?sidebarWidth:0;
  const usableW=canvasW-sideW;
  const totalPad=rowPadPx*(n-1);
  const unitH=(canvasH-totalPad)/Math.max(total,0.001);
  let y=0;
  return lines.map((line,i)=>{const lineH=unitH*(scales[i]||1);const gap=i<n-1?rowPadPx:0;const xOffset=sidebarEnabled&&sidebarPos==='left'?sideW:0;const r={y,lineH,text:line.trim()||' ',gap,xOffset,usableW};y+=lineH+gap;return r;});
}

function getFont(sz,idx){const font=(idx!==undefined&&wordFonts[idx])?wordFonts[idx]:currentFont;return`900 ${sz}px ${font}`;}
function createTextFill(oc,color,W,H,y,lineH){if(fillMode==='gradient'){const rad=gradAngle*Math.PI/180;const dx=Math.cos(rad)*W,dy=Math.sin(rad)*lineH;const grad=oc.createLinearGradient(0,0,dx,dy);grad.addColorStop(0,gradColor1);grad.addColorStop(1,gradColor2);return grad;}return color;}

function renderScene(dctx,W,H,scales,forExport){
  dctx.fillStyle=bgColor;dctx.fillRect(0,0,W,H);
  drawBgPattern(dctx,W,H);
  if(webcamActive&&!forExport&&webcamVideo.readyState>=2){dctx.save();const vw=webcamVideo.videoWidth,vh=webcamVideo.videoHeight;const scale=Math.max(W/vw,H/vh);const sw=vw*scale,sh=vh*scale;dctx.drawImage(webcamVideo,(W-sw)/2,(H-sh)/2,sw,sh);dctx.restore();}
  
  const textCanvas=document.createElement('canvas');
  textCanvas.width=W;textCanvas.height=H;
  const tctx=textCanvas.getContext('2d');
  
  const layout=computeLayout(scales);

  layout.forEach((row,i)=>{
    const{y,lineH,text,xOffset,usableW:rW}=row;
    const displayText=applyCase(text);
    const sz=Math.max(Math.ceil(lineH*1.15),10);
    const ls=letterSpacing*sz;
    const color=wordColors[i]||textColor;
    const chars=[...displayText];
    const skewDeg=wordSkew[i]||0;
    const condense=wordCondense[i]||1;
    const align=wordAlign[i]||'fill';

    const off=document.createElement('canvas');
    const tH=Math.max(Math.ceil(sz*2),4);
    off.width=rW;off.height=tH;
    const oc=off.getContext('2d');
    oc.font=getFont(sz,i);
    const charWidths=chars.map(c=>oc.measureText(c).width);
    let nw=0;charWidths.forEach((w,k)=>{nw+=w+(k<chars.length-1?ls:0);});nw=Math.max(nw,1);

    let scaleX,drawX=0;
    if(align==='fill'){scaleX=(rW/nw)*condense;if(condense<1)drawX=(rW-rW*condense)/2;}
    else{scaleX=condense;if(align==='center')drawX=(rW-nw*condense)/2;else if(align==='right')drawX=rW-nw*condense;}

    const fillStyle=createTextFill(oc,color,rW,H,y,lineH);
    oc.fillStyle=fillStyle;oc.textBaseline='top';oc.save();
    oc.scale(scaleX,1);
    let cx=0;chars.forEach((c,k)=>{oc.fillText(c,cx,0);cx+=charWidths[k]+(k<chars.length-1?ls:0);});oc.restore();

    if(fillMode==='stripe'){oc.save();oc.globalCompositeOperation='source-atop';const sA=stripeAngle*Math.PI/180;oc.fillStyle=bgColor;oc.fillRect(0,0,rW,tH);oc.strokeStyle=color;oc.lineWidth=stripeWidth*0.6;const diag=Math.sqrt(rW*rW+tH*tH);oc.translate(rW/2,tH/2);oc.rotate(sA);for(let s=-diag;s<diag;s+=stripeWidth){oc.beginPath();oc.moveTo(s,-diag);oc.lineTo(s,diag);oc.stroke();}oc.restore();}

    const id=oc.getImageData(0,0,rW,tH);const px=id.data;
    let minR=tH,maxR=0;
    for(let py=0;py<tH;py++)for(let px2=0;px2<rW;px2++)if(px[(py*rW+px2)*4+3]>8){if(py<minR)minR=py;if(py>maxR)maxR=py;}
    if(minR>maxR){minR=0;maxR=Math.ceil(lineH);}
    const glyphH=maxR-minR+1;

    tctx.save();
    if(skewDeg!==0){const skewRad=skewDeg*Math.PI/180;tctx.transform(1,0,Math.tan(skewRad),1,xOffset+drawX,0);tctx.drawImage(off,0,minR,rW,glyphH,0,y,rW,lineH);}
    else tctx.drawImage(off,0,minR,rW,glyphH,xOffset+drawX,y,rW,lineH);
    tctx.restore();
  });

  applyFx(tctx,W,H);
  dctx.drawImage(textCanvas,0,0);
  if(warpPoints.length&&!webcamActive)applyWarp(dctx,W,H);

  if(webcamActive&&!forExport){dctx.clearRect(0,0,W,H);dctx.fillStyle=bgColor;dctx.fillRect(0,0,W,H);drawBgPattern(dctx,W,H);const offMask=document.createElement('canvas');offMask.width=W;offMask.height=H;const mCtx=offMask.getContext('2d');if(webcamVideo.readyState>=2){const vw=webcamVideo.videoWidth,vh=webcamVideo.videoHeight;const scale=Math.max(W/vw,H/vh);const sw=vw*scale,sh=vh*scale;mCtx.drawImage(webcamVideo,(W-sw)/2,(H-sh)/2,sw,sh);}mCtx.globalCompositeOperation='destination-in';layout.forEach((row,i)=>{const{y,lineH,text,xOffset,usableW:rW}=row;const displayText=applyCase(text);const sz=Math.max(Math.ceil(lineH*1.15),10);const ls=letterSpacing*sz;const chars=[...displayText];const condense=wordCondense[i]||1;const align=wordAlign[i]||'fill';const off=document.createElement('canvas');const tH=Math.max(Math.ceil(sz*2),4);off.width=rW;off.height=tH;const oc=off.getContext('2d');oc.font=getFont(sz,i);const cw2=chars.map(c=>oc.measureText(c).width);let nw2=0;cw2.forEach((w,k)=>{nw2+=w+(k<chars.length-1?ls:0);});let sx2;if(align==='fill')sx2=(rW/Math.max(nw2,1))*condense;else sx2=condense;oc.fillStyle='#fff';oc.textBaseline='top';oc.save();oc.scale(sx2,1);let cx2=0;chars.forEach((c,k)=>{oc.fillText(c,cx2,0);cx2+=cw2[k]+(k<chars.length-1?ls:0);});oc.restore();const id2=oc.getImageData(0,0,rW,tH);const px2=id2.data;let mr=tH,xr=0;for(let py=0;py<tH;py++)for(let px3=0;px3<rW;px3++)if(px2[(py*rW+px3)*4+3]>8){if(py<mr)mr=py;if(py>xr)xr=py;}if(mr>xr){mr=0;xr=Math.ceil(lineH);}mCtx.drawImage(off,0,mr,rW,xr-mr+1,xOffset,y,rW,lineH);});dctx.drawImage(offMask,0,0);}
  drawSidebarText(dctx,W,H);
}

function draw(){canvas.width=canvasW;canvas.height=canvasH;renderScene(ctx,canvasW,canvasH,lineScales,false);drawGraph();drawWarpOverlay();}

// ═══════════════════════════════════════════════════════════════════════
// ANIMATION LOOP (with Warp Flow skew support)
// ═══════════════════════════════════════════════════════════════════════
let motionSkews = []; // per-row animated skew for warpFlow

function animLoop(ts){
  if(!lastTimestamp)lastTimestamp=ts;
  const dt=Math.min((ts-lastTimestamp)/1000,0.05);
  animTime+=dt*motionSpeed;lastTimestamp=ts;
  const lines=getLines(),n=lines.length,I=motionIntensity;
  const period=3.5,cycleT=(animTime/period)%1;

  let audioScales=null;
  if(audioActive&&analyser){analyser.getByteFrequencyData(audioData);const bands=n||1;audioScales=[];const bandSize=Math.floor(audioData.length/bands);let totalLevel=0;for(let b=0;b<bands;b++){let sum=0;for(let j=b*bandSize;j<(b+1)*bandSize&&j<audioData.length;j++)sum+=audioData[j];const avg=sum/bandSize/255;totalLevel+=avg;audioScales.push(1+avg*I*1.5);}audioLevel=totalLevel/bands;spectrumFill.style.width=(audioLevel*100)+'%';}else{spectrumFill.style.width='0%';}

  let finalScales;
  if(audioActive&&audioScales){finalScales=lines.map((_,i)=>Math.max(0.05,(lineScales[i]||1)*(audioScales[i]||1)));}
  else{const fn=motionPresets[activePreset];if(fn){finalScales=lines.map((_,i)=>Math.max(0.05,(lineScales[i]||1)*fn(cycleT,i,n,I)));}else{finalScales=lineScales.slice();}}

  // Animated skew for warpFlow
  if(activePreset==='warpFlow'){
    motionSkews=lines.map((_,i)=>{
      const ph=i/Math.max(n,1)*0.4;
      const raw=(cycleT-ph+10)%1;
      return Math.sin(raw*Math.PI*2)*I*12;
    });
  } else if(activePreset==='blockIn'){
    motionSkews=lines.map((_,i)=>{
      const ph=i/Math.max(n,1)*0.7;
      const raw=((cycleT-ph+10)%1);
      const dir=i%2===0?1:-1;
      return raw<0.3?dir*(1-E.outQuint(raw/0.3))*I*20:0;
    });
  } else {
    motionSkews=[];
  }

  canvas.width=canvasW;canvas.height=canvasH;

  // Override wordSkew temporarily for motion
  const savedSkew=[...wordSkew];
  if(motionSkews.length){
    for(let i=0;i<n;i++) wordSkew[i]=(savedSkew[i]||0)+(motionSkews[i]||0);
  }
  renderScene(ctx,canvasW,canvasH,finalScales,false);
  wordSkew.splice(0,wordSkew.length,...savedSkew);

  drawGraph();
  animFrame=requestAnimationFrame(animLoop);
}

function stopAnim(){if(animFrame){cancelAnimationFrame(animFrame);animFrame=null;}lastTimestamp=null;activePreset=null;motionSkews=[];document.querySelectorAll('.pbtn').forEach(b=>b.classList.remove('active'));document.getElementById('stopBtn').style.display='none';document.getElementById('liveDot').classList.remove('on');draw();}
function startPreset(preset){if(activePreset===preset){stopAnim();return;}stopAnim();activePreset=preset;animTime=0;lastTimestamp=null;document.querySelectorAll('.pbtn').forEach(b=>b.classList.toggle('active',b.dataset.preset===preset));document.getElementById('stopBtn').style.display='';document.getElementById('liveDot').classList.add('on');animFrame=requestAnimationFrame(animLoop);}
document.getElementById('presets').addEventListener('click',e=>{const btn=e.target.closest('.pbtn');if(!btn)return;startPreset(btn.dataset.preset);});
document.getElementById('stopBtn').addEventListener('click',stopAnim);

// Audio & Webcam
document.getElementById('audioBtn').addEventListener('click',async()=>{const btn=document.getElementById('audioBtn');if(audioActive){audioActive=false;btn.classList.remove('active');btn.textContent='🎤 Audio';if(audioSource){audioSource.disconnect();audioSource=null;}document.getElementById('liveDot').classList.remove('on');return;}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();analyser=audioCtx.createAnalyser();analyser.fftSize=256;audioData=new Uint8Array(analyser.frequencyBinCount);audioSource=audioCtx.createMediaStreamSource(stream);audioSource.connect(analyser);audioActive=true;btn.classList.add('active');btn.textContent='🎤 Live';document.getElementById('liveDot').classList.add('on');if(!animFrame){activePreset=activePreset||'wave';lastTimestamp=null;animFrame=requestAnimationFrame(animLoop);}}catch(err){console.warn('Mic denied:',err);btn.textContent='🎤 Denied';setTimeout(()=>btn.textContent='🎤 Audio',2000);}});
document.getElementById('maskBtn').addEventListener('click',async()=>{const btn=document.getElementById('maskBtn');if(webcamActive){webcamActive=false;btn.classList.remove('active');webcamVideo.style.display='none';if(webcamStream){webcamStream.getTracks().forEach(t=>t.stop());webcamStream=null;}if(!activePreset&&!audioActive)draw();return;}try{webcamStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:480}});webcamVideo.srcObject=webcamStream;webcamActive=true;btn.classList.add('active');if(!animFrame){activePreset=activePreset||'breathe';lastTimestamp=null;document.querySelectorAll('.pbtn').forEach(b=>b.classList.toggle('active',b.dataset.preset===activePreset));document.getElementById('stopBtn').style.display='';document.getElementById('liveDot').classList.add('on');animFrame=requestAnimationFrame(animLoop);}}catch(err){console.warn('Camera denied:',err);btn.textContent='📷 Denied';setTimeout(()=>btn.textContent='📷 Mask',2000);}});

// Graph
function drawGraph(){const gw=graphCanvas.offsetWidth||400,gh=graphCanvas.offsetHeight||48;if(graphCanvas.width!==gw)graphCanvas.width=gw;if(graphCanvas.height!==gh)graphCanvas.height=gh;gCtx.fillStyle='rgba(10,10,15,0.9)';gCtx.fillRect(0,0,gw,gh);if(!activePreset&&!audioActive){gCtx.fillStyle='rgba(255,255,255,0.1)';gCtx.font='10px Inter,sans-serif';gCtx.textAlign='center';gCtx.textBaseline='middle';gCtx.fillText('Select a motion preset or enable audio',gw/2,gh/2);return;}const lines=getLines(),n=Math.max(lines.length,1),I=motionIntensity;const period=3.5,loopSecs=period/motionSpeed;if(audioActive&&analyser){analyser.getByteFrequencyData(audioData);const barW=gw/audioData.length;for(let i=0;i<audioData.length;i++){const h=(audioData[i]/255)*gh;const hue=(i/audioData.length)*120+220;gCtx.fillStyle=`hsla(${hue},80%,65%,0.6)`;gCtx.fillRect(i*barW,gh-h,barW-1,h);}return;}const fn=motionPresets[activePreset];if(!fn)return;const rc=Math.min(n,4);for(let ri=0;ri<rc;ri++){const alpha=ri===0?0.6:Math.max(0.08,0.18-ri*0.04);const hue=260+ri*30;gCtx.strokeStyle=`hsla(${hue},70%,70%,${alpha})`;gCtx.lineWidth=ri===0?1.5:0.8;gCtx.beginPath();for(let px=0;px<=gw;px++){const tv=(px/gw)*loopSecs+animTime-loopSecs;const cyc=(tv/period)%1;const v=fn(cyc,ri,n,I);const y=gh-((v-0.5)*gh*0.7+gh*0.5);px===0?gCtx.moveTo(px,y):gCtx.lineTo(px,y);}gCtx.stroke();}gCtx.strokeStyle='rgba(108,92,231,0.3)';gCtx.lineWidth=1;gCtx.setLineDash([3,3]);gCtx.beginPath();gCtx.moveTo(gw,0);gCtx.lineTo(gw,gh);gCtx.stroke();gCtx.setLineDash([]);const v0=fn((animTime/period)%1,0,n,I);const cy=gh-((v0-0.5)*gh*0.7+gh*0.5);gCtx.beginPath();gCtx.arc(gw,cy,5,0,Math.PI*2);gCtx.fillStyle='rgba(108,92,231,0.3)';gCtx.fill();gCtx.beginPath();gCtx.arc(gw,cy,3,0,Math.PI*2);gCtx.fillStyle='#a29bfe';gCtx.fill();}

// Sections
document.querySelectorAll('.sh').forEach(h=>{h.addEventListener('click',()=>{const body=document.getElementById('sec-'+h.dataset.sec);const open=h.classList.toggle('open');body.classList.toggle('hidden',!open);});});

// ═══════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════
document.getElementById('dlPng').addEventListener('click',()=>{const r=exportRes;const maxPx=8000*8000;if(canvasW*r*canvasH*r>maxPx){alert(`Export too large (${canvasW*r}×${canvasH*r}px). Reduce resolution or canvas size.`);return;}const exp=document.createElement('canvas');exp.width=canvasW*r;exp.height=canvasH*r;const ectx=exp.getContext('2d');ectx.scale(r,r);renderScene(ectx,canvasW,canvasH,lineScales,true);const a=document.createElement('a');a.download=`typoman-${canvasW*r}x${canvasH*r}.png`;a.href=exp.toDataURL('image/png');a.click();});

document.getElementById('dlSvg').addEventListener('click',()=>{
  const svg=buildSvgString();
  const blob=new Blob([svg],{type:'image/svg+xml'});
  const a=document.createElement('a');const svgUrl=URL.createObjectURL(blob);a.download=`typoman-${canvasW}x${canvasH}.svg`;a.href=svgUrl;a.click();setTimeout(()=>URL.revokeObjectURL(svgUrl),5000);
});

document.getElementById('dlCopySvg').addEventListener('click',()=>{
  const svg=buildSvgString();
  navigator.clipboard.writeText(svg).then(()=>{const btn=document.getElementById('dlCopySvg');const orig=btn.textContent;btn.textContent='✓ Copied';setTimeout(()=>btn.textContent=orig,1800);});
});

function escapeXml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function buildSvgString(){
  const lines=getLines();const layout=computeLayout(lineScales);
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">`;
  svg+=`<rect width="${canvasW}" height="${canvasH}" fill="${escapeXml(bgColor)}"/>`;
  layout.forEach((row,i)=>{const color=escapeXml(wordColors[i]||textColor);const font=escapeXml((wordFonts[i]||currentFont).replace(/'/g,''));const displayText=escapeXml(applyCase(row.text));const skew=wordSkew[i]?` transform="skewX(${wordSkew[i]})"`:'';;svg+=`<text x="${row.xOffset+row.usableW/2}" y="${row.y+row.lineH*0.78}" text-anchor="middle" fill="${color}" font-family="${font}" font-weight="900" font-size="${row.lineH*1.1}" textLength="${row.usableW}" lengthAdjust="spacingAndGlyphs"${skew}>${displayText}</text>`;});
  svg+='</svg>';return svg;
}

// Record loop as WebM
let isRecording=false,recordedChunks=[];
document.getElementById('recordBtn').addEventListener('click',()=>{
  if(isRecording)return;
  if(!activePreset){alert('Start a motion preset first!');return;}
  const btn=document.getElementById('recordBtn');
  btn.classList.add('recording');btn.textContent='⏺ Recording...';isRecording=true;

  const stream=canvas.captureStream(30);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});
  recordedChunks=[];
  recorder.ondataavailable=e=>{if(e.data.size>0)recordedChunks.push(e.data);};
  recorder.onstop=()=>{
    const blob=new Blob(recordedChunks,{type:'video/webm'});
    const a=document.createElement('a');const webmUrl=URL.createObjectURL(blob);a.download=`typoman-loop.webm`;a.href=webmUrl;a.click();setTimeout(()=>URL.revokeObjectURL(webmUrl),5000);
    btn.classList.remove('recording');btn.textContent='⏺ Record loop';isRecording=false;
  };
  recorder.start();
  // Record for one full loop cycle
  const loopDuration=(3.5/motionSpeed)*1000;
  setTimeout(()=>recorder.stop(),loopDuration);
});

// ═══════════════════════════════════════════════════════════════════════
// EFFECTS
// ═══════════════════════════════════════════════════════════════════════
document.querySelectorAll('.fxbtn').forEach(btn=>{btn.addEventListener('click',()=>{const fx=btn.dataset.fx;if(activeFx===fx){activeFx=null;btn.classList.remove('on');}else{document.querySelectorAll('.fxbtn').forEach(b=>b.classList.remove('on'));btn.classList.add('on');activeFx=fx;}if(!activePreset)draw();});});

function applyFx(dctx,W,H){
  if(!activeFx)return;const s=fxStrength;
  if(activeFx==='shadow'){dctx.save();dctx.globalCompositeOperation='destination-over';dctx.shadowColor='rgba(0,0,0,'+(0.6*s)+')';dctx.shadowBlur=20*s;dctx.shadowOffsetX=6*s;dctx.shadowOffsetY=6*s;dctx.drawImage(dctx.canvas,0,0);dctx.restore();}
  else if(activeFx==='glow'){dctx.save();dctx.globalCompositeOperation='lighter';dctx.filter=`blur(${Math.round(12*s)}px)`;dctx.globalAlpha=0.4*s;dctx.drawImage(dctx.canvas,0,0);dctx.restore();dctx.filter='none';}
  else if(activeFx==='outline'){dctx.save();dctx.globalCompositeOperation='destination-over';dctx.filter=`blur(${Math.max(1,Math.round(3*s))}px)`;dctx.globalAlpha=0.8;dctx.drawImage(dctx.canvas,2*s,2*s);dctx.drawImage(dctx.canvas,-2*s,-2*s);dctx.drawImage(dctx.canvas,2*s,-2*s);dctx.drawImage(dctx.canvas,-2*s,2*s);dctx.restore();dctx.filter='none';}
  else if(activeFx==='double'){dctx.save();dctx.globalAlpha=0.25*s;dctx.globalCompositeOperation='lighter';dctx.drawImage(dctx.canvas,Math.round(8*s),Math.round(8*s));dctx.restore();}
  else if(activeFx==='glitch'){const sliceCount=Math.round(8+12*s);const maxDisp=Math.round(25*s);const snapshot=dctx.getImageData(0,0,W,H);for(let sl=0;sl<sliceCount;sl++){const y=Math.floor(Math.random()*H);const h=Math.floor(3+Math.random()*15*s);const dx=Math.round((Math.random()-0.5)*2*maxDisp);if(y+h<=H){const strip=dctx.getImageData(0,y,W,h);dctx.putImageData(snapshot,0,0);dctx.putImageData(strip,dx,y);}}for(let l=0;l<Math.round(3*s);l++){const y=Math.floor(Math.random()*H);dctx.fillStyle=Math.random()>0.5?'rgba(255,0,80,0.3)':'rgba(0,200,255,0.3)';dctx.fillRect(0,y,W,1+Math.random()*2);}}
  else if(activeFx==='chromatic'){const offR=Math.round(4*s);const offB=Math.round(-4*s);const imgData=dctx.getImageData(0,0,W,H);const src=new Uint8ClampedArray(imgData.data);const dst=imgData.data;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const idx=(y*W+x)*4;const rx=Math.min(W-1,Math.max(0,x+offR));dst[idx]=src[(y*W+rx)*4];dst[idx+1]=src[idx+1];const bx=Math.min(W-1,Math.max(0,x+offB));dst[idx+2]=src[(y*W+bx)*4+2];dst[idx+3]=src[idx+3];}dctx.putImageData(imgData,0,0);}
  else if(activeFx==='smear'){
    const steps=Math.max(15,Math.round(150*s));
    const snapshot=document.createElement('canvas');snapshot.width=W;snapshot.height=H;
    snapshot.getContext('2d').drawImage(dctx.canvas,0,0);
    const mask=document.createElement('canvas');mask.width=W;mask.height=H;const mctx=mask.getContext('2d');
    dctx.save();dctx.globalCompositeOperation='destination-over';
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      const waveOffset=Math.sin(t*Math.PI*2);
      const dx=waveOffset*120*s*t;
      const dy=i*0.1*150*s;
      mctx.clearRect(0,0,W,H);mctx.drawImage(snapshot,0,0);
      mctx.globalCompositeOperation='source-in';
      mctx.fillStyle=`hsl(${t*900},100%,50%)`;
      mctx.fillRect(0,0,W,H);
      mctx.globalCompositeOperation='source-over';
      dctx.save();dctx.translate(dx,dy);
      dctx.globalAlpha=0.15;dctx.globalCompositeOperation='lighter';
      dctx.drawImage(mask,0,0);dctx.restore();
    }
    dctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CRAZY & SHUFFLE
// ═══════════════════════════════════════════════════════════════════════
let crazyMode=false,crazyTimer=null;
const PRESETS_LIST=Object.keys(motionPresets);
const FONTS_LIST_FN=()=>getAllFonts().map(f=>f.css);

function runCrazyStep(){if(!crazyMode)return;randomColors();lineScales=lineScales.map(()=>0.3+Math.random()*1.4);buildLineControls();const spd=0.3+Math.random()*2.5;motionSpeed=spd;document.getElementById('motionSpeed').value=spd;document.getElementById('motionSpeedN').value=spd.toFixed(2);const inten=0.2+Math.random()*1.6;motionIntensity=inten;document.getElementById('motionIntensity').value=inten;document.getElementById('motionIntN').value=inten.toFixed(2);const p=PRESETS_LIST[Math.floor(Math.random()*PRESETS_LIST.length)];activePreset=p;animTime=Math.random()*10;document.querySelectorAll('.pbtn').forEach(b=>b.classList.toggle('active',b.dataset.preset===p));document.getElementById('stopBtn').style.display='';document.getElementById('liveDot').classList.add('on');if(!animFrame){lastTimestamp=null;animFrame=requestAnimationFrame(animLoop);}const fl=FONTS_LIST_FN();if(fl.length){currentFont=fl[Math.floor(Math.random()*fl.length)];document.querySelectorAll('.fpbtn').forEach(b=>b.classList.toggle('active',b.dataset.font===currentFont));    if(Math.random()>0.5){const fxOpts=['shadow','glow','outline','double','glitch','chromatic','smear'];activeFx=fxOpts[Math.floor(Math.random()*fxOpts.length)];document.querySelectorAll('.fxbtn').forEach(b=>b.classList.toggle('on',b.dataset.fx===activeFx));fxStrength=0.3+Math.random()*0.7;document.getElementById('fxStr').value=fxStrength;document.getElementById('fxStrN').value=fxStrength.toFixed(2);}else{activeFx=null;document.querySelectorAll('.fxbtn').forEach(b=>b.classList.remove('on'));}crazyTimer=setTimeout(runCrazyStep,1500+Math.random()*1500);}
document.getElementById('crazyBtn').addEventListener('click',()=>{crazyMode=!crazyMode;document.getElementById('crazyBtn').classList.toggle('active',crazyMode);if(crazyMode)runCrazyStep();else clearTimeout(crazyTimer);});

document.getElementById('shuffleBtn').addEventListener('click',()=>{
  randomColors();const fl=FONTS_LIST_FN();
  wordFonts=words.map(()=>Math.random()>0.4?fl[Math.floor(Math.random()*fl.length)]:null);
  wordColors=words.map(()=>Math.random()>0.5?randHex():null);
  lineScales=words.map(()=>0.2+Math.random()*1.6);
  wordSkew=words.map(()=>Math.random()>0.6?Math.round((Math.random()-0.5)*30):0);
  wordCondense=words.map(()=>0.5+Math.random()*0.8);
  wordAlign=words.map(()=>{const o=['fill','fill','fill','left','center','right'];return o[Math.floor(Math.random()*o.length)];});
  const fillOpts=['solid','solid','solid','gradient','stripe'];fillMode=fillOpts[Math.floor(Math.random()*fillOpts.length)];document.querySelectorAll('.fill-btn').forEach(b=>b.classList.toggle('on',b.dataset.fill===fillMode));document.getElementById('gradOpts').style.display=fillMode==='gradient'?'':'none';document.getElementById('stripeOpts').style.display=fillMode==='stripe'?'':'none';
  if(fillMode==='gradient'){gradColor1=randHex();gradColor2=randHex();gradAngle=Math.floor(Math.random()*360);document.getElementById('grad1').value=gradColor1;document.getElementById('grad2').value=gradColor2;document.getElementById('gradAngle').value=gradAngle;}
  const cases=['upper','lower','title','none'];textCase=cases[Math.floor(Math.random()*cases.length)];document.querySelectorAll('.case-btn').forEach(b=>b.classList.toggle('on',b.dataset.case===textCase));
  const pats=['none','none','grid','dots','pixels','lines'];bgPattern=pats[Math.floor(Math.random()*pats.length)];document.querySelectorAll('.pat-btn').forEach(b=>b.classList.toggle('on',b.dataset.pat===bgPattern));patOpacity=0.05+Math.random()*0.25;document.getElementById('patOpacity').value=patOpacity;document.getElementById('patOpN').value=patOpacity.toFixed(2);
  if(Math.random()>0.4){const fxOpts=['shadow','glow','outline','double','glitch','chromatic','smear'];activeFx=fxOpts[Math.floor(Math.random()*fxOpts.length)];fxStrength=0.3+Math.random()*0.7;}else{activeFx=null;}document.querySelectorAll('.fxbtn').forEach(b=>b.classList.toggle('on',b.dataset.fx===activeFx));document.getElementById('fxStr').value=fxStrength;document.getElementById('fxStrN').value=fxStrength.toFixed(2);
  sidebarEnabled=Math.random()>0.65;document.getElementById('sideToggle').classList.toggle('on',sidebarEnabled);document.getElementById('sideToggle').textContent=sidebarEnabled?'Enabled':'Enable';
  currentFont=fl[Math.floor(Math.random()*fl.length)];document.querySelectorAll('.fpbtn').forEach(b=>b.classList.toggle('active',b.dataset.font===currentFont));
  rowPadPx=Math.round((Math.random()-0.3)*20);document.getElementById('rowPad').value=rowPadPx;document.getElementById('rpn').value=rowPadPx;
  noiseCanvas=null;rebuildChips();buildLineControls();buildTransformControls();if(!activePreset)draw();
});

// Keyboard shortcuts
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||e.target.contentEditable==='true')return;if(e.code==='Space'){e.preventDefault();if(activePreset||animFrame)stopAnim();else startPreset('wave');}if(e.code==='KeyR'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();randomColors();}if(e.code==='KeyM'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();document.getElementById('audioBtn').click();}if(e.code==='KeyC'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();document.getElementById('crazyBtn').click();}if(e.code==='KeyS'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();document.getElementById('shuffleBtn').click();}});

// INIT
// Section header a11y: add role, tabindex, aria-expanded, keyboard handler
document.querySelectorAll('.sh').forEach(sh => {
  sh.setAttribute('role', 'button');
  sh.setAttribute('tabindex', '0');
  sh.setAttribute('aria-expanded', sh.classList.contains('open') ? 'true' : 'false');
  sh.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sh.click(); }
  });
  sh.addEventListener('click', () => {
    sh.setAttribute('aria-expanded', sh.classList.contains('open') ? 'true' : 'false');
  });
});

buildColorPresets();rebuildChips();buildLineControls();buildTransformControls();draw();

// Custom Cursor Logic
const cursor = document.createElement('div');
cursor.className = 'cursor';
document.body.appendChild(cursor);
document.addEventListener('mousemove', e => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top = e.clientY + 'px';
});
document.addEventListener('mousedown', () => cursor.classList.add('active'));
document.addEventListener('mouseup', () => cursor.classList.remove('active'));
