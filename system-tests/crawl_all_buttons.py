import sys, json, time, re
from playwright.sync_api import sync_playwright
base, email, label = sys.argv[1], sys.argv[2], sys.argv[3]
paths = sys.argv[4].split(',')
PW='Fsm@2026!'
issues=[]; stats={'pages':0,'clicks':0,'dead':[]}
def add(kind,page,el,detail): issues.append({'kind':kind,'page':page,'el':el,'detail':str(detail)[:250]}); 
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page()
    cur={'page':'','el':''}; net=[0]
    pg.on('dialog', lambda d: d.accept())
    pg.on('pageerror', lambda e: add('pageerror',cur['page'],cur['el'],e))
    pg.on('console', lambda m: m.type=='error' and 'Failed to load resource' not in m.text and add('console',cur['page'],cur['el'],m.text))
    def onresp(r):
        net[0]+=1
        if '/api/' in r.url and r.status>=400:
            add('http5xx' if r.status>=500 else 'http4xx',cur['page'],cur['el'],f"{r.request.method} {r.url.split('/api')[1][:70]} {r.status}")
    pg.on('response', onresp)
    if email:
        import urllib.request
        rq=urllib.request.Request(base+'/api/auth/login',data=json.dumps({'email':email,'password':PW}).encode(),headers={'Content-Type':'application/json'})
        tok=json.loads(urllib.request.urlopen(rq).read())['token']
        pg.goto(base+'/login'); pg.evaluate("t=>localStorage.setItem('fsm_token',t)",tok)
    for path in paths:
        cur['page']=path; cur['el']='(load)'
        try: pg.goto(base+path, wait_until='networkidle', timeout=20000)
        except Exception as e: add('load',path,'',e); continue
        pg.wait_for_timeout(500); stats['pages']+=1
        body=pg.inner_text('body')
        if re.search(r'Something went wrong|Cannot read|undefined|\[object Object\]|NaN',body) : add('render',path,'',re.findall(r'Something went wrong|Cannot read[^\n]*|undefined|\[object Object\]|NaN',body)[:3])
        if re.search(r'\b(nav|staff|home)\.[a-z_]+\b|\b[a-z]+\.[a-z_]+\.[a-z_]+\b',body) and re.search(r'(?<![\w@/.])(?:common|staff|nav|home|deal|car|auth|account)\.[a-z_]+(?:\.[a-z_]+)?(?![\w@/.])',body): add('i18n-key',path,'',re.findall(r'(?<![\w@/.])(?:common|staff|nav|home|deal|car|auth|account)\.[a-z_]+(?:\.[a-z_]+)?(?![\w@/.])',body)[:3])
        sel='button:visible, a[href]:visible, [role=button]:visible, [role=tab]:visible, summary:visible, select:visible, input[type=checkbox]:visible, input[type=radio]:visible'
        n=pg.locator(sel).count(); seen=set(); i=0
        while i<min(n,60):
            loc=pg.locator(sel).nth(i); i+=1
            try:
                tag=loc.evaluate('e=>e.tagName'); txt=(loc.inner_text(timeout=800) or loc.get_attribute('aria-label') or loc.get_attribute('href') or '')[:40].replace('\n',' ')
                href=loc.get_attribute('href') or ''
                key=(tag,txt,href)
                if key in seen or href.startswith('mailto:') or href.startswith('tel:') or href.startswith('http') or href.endswith('.csv') or '/files/' in href or 'download' in (loc.get_attribute('download') or 'download') and loc.get_attribute('download') is not None: continue
                seen.add(key)
                if re.search(r'sign out|log ?out|تسجيل الخروج|^العربية$|^English$|^EN$|^AR$|^عربي',txt,re.I): continue
                if not loc.is_enabled(): continue
                cur['el']=f'{tag}:{txt}'; url0=pg.url; n0=net[0]
                pg.evaluate('window.__m=0; if(window.__o)window.__o.disconnect(); window.__o=new MutationObserver(l=>window.__m+=l.length); window.__o.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true})')
                if tag=='SELECT':
                    opts=loc.locator('option').count()
                    if opts>1: loc.select_option(index=1,timeout=1500)
                else: loc.click(timeout=2000,no_wait_after=True)
                pg.wait_for_timeout(450); stats['clicks']+=1
                changed = pg.url!=url0 or net[0]!=n0 or pg.evaluate('window.__m')>0
                if not changed and tag!='SELECT': stats['dead'].append(f'{path} | {tag}:{txt}')
                if pg.locator('text=Something went wrong').count() and 'Something went wrong' not in body: add('crash',path,cur['el'],'error boundary')
                if pg.url!=url0:
                    pg.goto(base+path, wait_until='networkidle', timeout=20000); pg.wait_for_timeout(300)
                elif pg.locator('[role=dialog]:visible, .modal:visible').count() or pg.locator('input:visible[type=text]:visible').count()!=0 and False:
                    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            except Exception as e:
                if 'Timeout' in str(e) or 'detached' in str(e) or 'not attached' in str(e): 
                    try: pg.goto(base+path, wait_until='networkidle', timeout=20000)
                    except Exception: pass
                else: add('crawl-exc',path,cur['el'],str(e)[:120])
            if i%10==0:
                pg.goto(base+path, wait_until='networkidle', timeout=20000); pg.wait_for_timeout(300)
    b.close()
json.dump({'label':label,'stats':stats,'issues':issues},open(f'/home/claude/crawl/out-{label}.json','w'),indent=1)
print(label,stats['pages'],stats['clicks'],len(issues),'dead',len(stats['dead']))
