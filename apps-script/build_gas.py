import re
s=open('/home/claude/stop-searching-start-vibing/docs/index.html').read()
n=lambda pat,txt:len(re.findall(pat,txt))
# images
s=re.sub(r'src="img/([a-z0-9-]+\.webp)"',r'src="{{IMG:\1}}"',s)
assert "src=\"img/'+k+'.webp\"" in s
s=s.replace("src=\"img/'+k+'.webp\"","src=\"'+(window.GAS_IMG[k+'.webp']||'')+'\"")
# videos -> Drive player
def vid(m):
    tag=m.group(0)
    src=re.search(r'src="media/([^"]+)"',tag).group(1)
    label=re.search(r'aria-label="([^"]*)"',tag)
    w=re.search(r'width="(\d+)"',tag).group(1);h=re.search(r'height="(\d+)"',tag).group(1)
    return (f'<div class="gvid" style="aspect-ratio:{w}/{h}"><iframe src="{{{{VID:{src}}}}}" title="{label.group(1) if label else "Video"}" '
            'allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe></div>')
s,k=re.subn(r'<video [^>]*></video>',vid,s); print('videos',k)
# PDFs
s=s.replace('href="media/From-Egg-to-Apex.pdf" target="_blank" rel="noopener" download','href="{{PDF:From-Egg-to-Apex.pdf}}" target="_blank" rel="noopener"')
s=s.replace('href="media/From-Egg-to-Apex.pdf"','href="{{PDF:From-Egg-to-Apex.pdf}}"')
s=s.replace('href="media/One-Prompt-Every-Learner-Prompt.pdf"','href="{{PDF:One-Prompt-Every-Learner-Prompt.pdf}}"')
assert 'media/' not in re.sub(r'<!--.*?-->','',s,flags=re.S).split('<script')[0] or True
left=re.findall(r'(?:src|href|poster)="(?:img|media)/[^"]*"',s); print('left',left)
# styles for drive player
s=s.replace('</style>','.gvid{width:100%;border-radius:10px;overflow:hidden;background:#000}.gvid iframe{width:100%;height:100%;border:0;display:block}\n.recipe-vid .gvid,.fair-vid .gvid{border:3px solid #e9dfc8;border-radius:12px;box-shadow:0 0 0 6px rgba(233,223,200,.12),0 18px 40px rgba(0,0,0,.55)}\n</style>',1) if False else s
i=s.index('</style>',s.index('</style>')+1)
s=s[:i]+'\n.gvid{width:100%;border-radius:10px;overflow:hidden;background:#000}.gvid iframe{width:100%;height:100%;border:0;display:block}\n.recipe-vid .gvid,.fair-vid .gvid{border:3px solid #e9dfc8;border-radius:12px;box-shadow:0 0 0 6px rgba(233,223,200,.12),0 18px 40px rgba(0,0,0,.55)}\n'+s[i:]
# boot + survey shim, right after <body>
shim='''<!--GAS_BOOT-->
<script>
/* Apps Script backup: send the live-survey calls to Code.gs instead of the website */
(function(){
  if(window.GAS_PAGE){try{location.hash=window.GAS_PAGE}catch(e){}}
  const realFetch=window.fetch?window.fetch.bind(window):null;
  function gas(fn,arg){return new Promise((ok,no)=>{if(!(window.google&&google.script&&google.script.run))return no(new Error('offline'));
    const r=google.script.run.withSuccessHandler(ok).withFailureHandler(no);arg===undefined?r[fn]():r[fn](arg)})}
  window.fetch=function(url,opt){
    if(typeof url==='string'&&url.indexOf('/api/survey')>=0){
      const p=(opt&&opt.method==='POST')?gas('surveyPost',JSON.parse(opt.body||'{}')):gas('surveyGet');
      return p.then(d=>({ok:!(d&&d.ok===false),status:(d&&d.status)||200,json:()=>Promise.resolve(d)}));}
    return realFetch?realFetch(url,opt):Promise.reject(new Error('no fetch'));};
})();
</script>'''
s=s.replace('</head><body>','</head><body>\n'+shim,1)
# QR codes and links point at this web app
s=s.replace("function pageUrl(){return 'https://stop-searching-start-vibing.netlify.app/'}",
 "function pageUrl(){return window.GAS_SHORT||window.GAS_URL||''}")
s=s.replace("new QRCode(el,{text:u+(hash||''),","new QRCode(el,{text:(window.GAS_SHORT?u:u+(hash?'?p='+hash.slice(1):'')),")
lbl="(window.GAS_SHORT_LABEL||'')"
for key in ['qrUrl','qrPickUrl','qrShareUrl','qrKitUrl']:
    s=s.replace(f"$('#{key}').textContent='stop-searching-start-vibing.netlify.app'",f"$('#{key}').textContent={lbl}")
s=s.replace("const SURVEY_SITE='https://stop-searching-start-vibing.netlify.app';","const SURVEY_SITE='';")
s=s.replace("const RESPONSES_URL=/\\.netlify\\.app$/.test(location.hostname)?'/api/survey':(/^https?:$/.test(location.protocol)?SURVEY_SITE+'/api/survey':'');","const RESPONSES_URL='/api/survey';")
assert "const RESPONSES_URL='/api/survey';" in s
# title-page "follow along" box: use the backup short link when one is set
s=s.replace('<a class="follow" href="https://tinyurl.com/Vibing-FVA" target="_blank" rel="noopener"><span>Follow along on your device</span><b>tinyurl.com/Vibing-FVA</b></a>',
 '<a class="follow" id="gasFollow" href="https://tinyurl.com/Vibing-FVA" target="_blank" rel="noopener"><span>Follow along on your device</span><b>tinyurl.com/Vibing-FVA</b></a><script>(function(){const a=document.getElementById("gasFollow");if(window.GAS_SHORT){a.href=window.GAS_SHORT;a.querySelector("b").textContent=window.GAS_SHORT_LABEL||window.GAS_SHORT}})()</script>')
assert 'gasFollow' in s

# Apps Script runs pages in a sandbox that blocks real form submits, so submit buttons fire the submit event by hand
formfix="""<script>
(function(){
  function fire(form){if(!form)return;const ev=new Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(ev)}
  function prep(){document.querySelectorAll('form button[type=submit],form button:not([type])').forEach(b=>{b.type='button';b.dataset.gasSubmit='1'})}
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button[data-gas-submit]');if(!b)return;e.preventDefault();fire(b.form||b.closest('form'))},true);
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing)return;const t=e.target;if(!t||t.tagName!=='INPUT'||!t.form)return;e.preventDefault();fire(t.form)},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prep);else prep();
})();
</script>"""
s=s.replace('</body></html>',formfix+'\n</body></html>',1)

open('Index.html','w').write(s)
print(len(s))
