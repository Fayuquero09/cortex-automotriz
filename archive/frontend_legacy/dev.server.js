// Minimal static server + API/WS proxy for Cortex Automotriz
// Usage examples:
//   BACKEND_URL=http://127.0.0.1:8000 node dev.server.js
//   HOST=0.0.0.0 PORT=5174 BACKEND_URL=http://192.168.1.10:8000 node dev.server.js

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || '0.0.0.0';
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

// Proxy API and WS endpoints to backend
const apiRoutes = [
  '/config', '/options', '/catalog', '/compare', '/auto_competitors',
  '/ws', '/ws/*', '/_audit/*'
];
app.use(apiRoutes, createProxyMiddleware({
  target: BACKEND,
  changeOrigin: true,
  ws: true,
  logLevel: 'warn',
}));

// Serve built assets
app.use('/assets', express.static(path.join(__dirname, 'dist', 'assets'), {
  maxAge: '1h', etag: true,
}));

app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'logo_refacciones_digitales.png'));
});

// Serve the built index.html without any extra injections
app.get('/', (_req, res) => {
  try {
    const htmlPath = path.join(__dirname, 'dist', 'index.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    const inserts = [];
    if (process.env.DEFAULT_FILTERS === '1') {
      const js = `\n<script id="cortex-default-filters">\n(function(){\n  function norm(s){ try{ return (s||'').toString().toLowerCase().normalize('NFD').replace(/\\p{Diacritic}+/gu,''); }catch(e){ return (s||'').toString().toLowerCase(); } }\n  function setCheckByText(token, val){\n    try {\n      var nt = norm(token);\n      var inputs = Array.from(document.querySelectorAll('input[type=checkbox]'));
      for (var i=0;i<inputs.length;i++){
        var inp = inputs[i];
        var label = inp.closest('label');
        var txt = '';
        if (label) txt = norm(label.textContent||'');
        else {
          // try sibling text
          var p = inp.parentElement; if(p) txt = norm(p.textContent||'');
        }
        if (txt && txt.indexOf(nt)!==-1){
          if (inp.checked !== !!val){ inp.checked = !!val; try{ inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){} }
        }
      }
    } catch(e){}
  }
  function apply(){
    setCheckByText('mismo segmento', true);
    setCheckByText('misma propulsion', true); // sin acento para el normalizado
    setCheckByText('incluir misma marca', false);
  }
  function start(){ apply(); var obs=new MutationObserver(apply); obs.observe(document.documentElement,{childList:true,subtree:true}); var n=0; var iv=setInterval(function(){ apply(); if(++n>25){ clearInterval(iv); try{obs.disconnect();}catch(e){} } }, 800); }
  if(document.readyState!=='loading') start(); else document.addEventListener('DOMContentLoaded', start);
})();\n</script>\n`;
      inserts.push(js);
    }
    // Removed legacy "plantillas" UI tweaks
    if (process.env.FIX_SELECTS === '1') {
      const js = `\n<script id="cortex-fix-selects">\n(function(){\n  function q(){\n    var sel = (s)=>document.querySelector(s);\n    var brand = sel('select[aria-label="Marca"], select[title*="Marca" i]');\n    var model = sel('select[aria-label="Modelo"], select[title*="Modelo" i]');\n    var year  = sel('select[aria-label="Año"], select[aria-label="Año modelo"], select[title*="Año" i]');\n    var version = sel('select[aria-label="Versión"], select[title*="Vers" i]');\n    return {brand, model, year, version};\n  }\n  function enable(x){ if(!x) return; try{ x.disabled=false; x.removeAttribute('disabled'); x.style.pointerEvents='auto'; x.style.opacity=1; }catch(e){} }\n  function disable(x){ if(!x) return; try{ x.disabled=true; x.setAttribute('disabled','disabled'); x.style.pointerEvents='none'; x.style.opacity=0.65; }catch(e){} }\n  function apply(){\n    var s = q(); if(!s.model) return;\n    enable(s.model); // permitir Modelo primero\n    var hasMY = !!(s.model && s.model.value && s.year && s.year.value);\n    if (s.version) { if (hasMY) enable(s.version); else disable(s.version); }\n  }\n  if(document.readyState!=='loading'){ apply(); var obs=new MutationObserver(apply); obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true}); setInterval(apply, 1000); }\n  else { document.addEventListener('DOMContentLoaded', function(){ apply(); var obs=new MutationObserver(apply); obs.observe(document.documentElement,{childList:true,subtree:true,attributes:true}); setInterval(apply, 1000); }); }\n})();\n</script>\n`;
      inserts.push(js);
    }
    if (process.env.AUTOFILL_BRAND === '1') {
      const js = `\n<script id="cortex-autofill-brand">\n(function(){\n  function sel(q){ return document.querySelector(q); }\n  function finds(){\n    var brand = sel('select[aria-label="Marca"], select[title*="Marca" i]');\n    var model = sel('select[aria-label="Modelo"], select[title*="Modelo" i]');\n    var year  = sel('select[aria-label="Año modelo"], select[aria-label="Año"], select[title*="Año" i]');\n    var version = sel('select[aria-label="Versión"], select[title*="Vers" i]');\n    return {brand, model, year, version};\n  }\n  function populate(sel, items, ph){ if(!sel || !Array.isArray(items)) return; var cur=sel.value; sel.innerHTML=''; var o=document.createElement('option'); o.value=''; o.textContent=ph||'—'; sel.appendChild(o); items.forEach(v=>{ var e=document.createElement('option'); e.value=v; e.textContent=v; sel.appendChild(e); }); if(cur && items.includes(cur)) sel.value=cur; }\n  function setVal(sel, v){ if(!sel) return; var t=String(v||''); if(!t) return; var found=Array.from(sel.options).some(o=>o.value===t); if(!found){ var o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o);} sel.value=t; try{ sel.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){} }\n  async function onModel(){ var s=finds(); if(!s.model) return; var m=s.model.value; if(!m) return; try{ var r=await fetch('/options?model='+encodeURIComponent(m)); var p=await r.json(); var mk=(p.autofill && p.autofill.make_from_model) || (p.selected && p.selected.make) || ''; if(mk && s.brand) setVal(s.brand, mk); var yrs=(p.years||[]); if(yrs && s.year){ populate(s.year, yrs, 'Año'); if(p.autofill && p.autofill.default_year) setVal(s.year, p.autofill.default_year); } if(s.version){ var y=s.year && s.year.value ? parseInt(s.year.value,10):null; var url='/options?model='+encodeURIComponent(m); if(mk) url += '&make='+encodeURIComponent(mk); if(y) url += '&year='+y; var rv=await fetch(url); var pv=await rv.json(); populate(s.version, (pv.versions||[]), 'Versión'); } }catch(e){} }\n  function wire(){ var s=finds(); if(s.model && !s.model.__cortex_autofill){ s.model.__cortex_autofill=true; s.model.addEventListener('change', onModel); } }\n  function init(){ wire(); var obs=new MutationObserver(wire); obs.observe(document.documentElement,{childList:true,subtree:true}); }\n  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);\n})();\n</script>\n`;
      inserts.push(js);
    }
   var parent = label.parentElement; var removed=false;\n    function findInput(scope){ try{ return (scope && (scope.querySelector('input,textarea'))) || null; }catch(e){ return null; } }\n    var inp = findInput(parent) || findInput(parent && parent.nextElementSibling) || findInput(parent && parent.nextElementSibling && parent.nextElementSibling.nextElementSibling);
   if (inp){ var blk = inp.closest('div') || inp; removeEl(blk); removed=true; }
   // remove the label container itself
   removeEl(label.closest('div')||label);
 }\n  if(document.readyState!=='loading'){ apply(); var obs=new MutationObserver(apply); obs.observe(document.documentElement,{childList:true,subtree:true}); setTimeout(function(){ try{obs.disconnect();}catch(e){} }, 4000); } else { document.addEventListener('DOMContentLoaded', function(){ apply(); var obs=new MutationObserver(apply); obs.observe(document.documentElement,{childList:true,subtree:true}); setTimeout(function(){ try{obs.disconnect();}catch(e){} }, 4000); }); }\n})();\n</script>\n`;
    
    if (inserts.length) {
      html = html.replace('</head>', `${inserts.join('\n')}\n</head>`);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (e) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }
});

// SPA fallback
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, HOST, () => {
  const urlHost = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  console.log(`Frontend: http://${urlHost}:${PORT}`);
  console.log(`Proxying API and WS to: ${BACKEND}`);
});
