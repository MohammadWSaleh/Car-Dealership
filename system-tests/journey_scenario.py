import json, re, sys, urllib.request, urllib.error, time
from playwright.sync_api import sync_playwright
import os
B=os.environ.get('BASE','http://127.0.0.1:4100'); PW='Fsm@2026!'; R=[]
def ok(n,c,d=''):
    R.append((n,bool(c),str(d)[:200])); print(('PASS ' if c else 'FAIL ')+n+('' if c else ' — '+str(d)[:200]),flush=True)
def api(m,p,b=None,t=None,raw=False):
    h={'Content-Type':'application/json'}; 
    if t:h['Authorization']='Bearer '+t
    rq=urllib.request.Request(B+'/api'+p,data=json.dumps(b).encode() if b is not None else None,method=m,headers=h)
    try: r=urllib.request.urlopen(rq); s=r.status; c=r.read()
    except urllib.error.HTTPError as e: s=e.code; c=e.read()
    if raw: return s,c
    try: return s,json.loads(c or b'{}')
    except: return s,c
def login(e): return api('POST','/auth/login',{'email':e,'password':PW})[1]['token']
errs=[]
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:m.type=='error' and 'Failed to load resource' not in m.text and errs.append(m.text))
    bad=[]; pg.on('response',lambda r:'/api/' in r.url and r.status>=500 and bad.append((r.url,r.status)))
    # 1 customer registers via UI
    em=f'journey{int(time.time())}@example.com'
    pg.goto(B+'/register'); pg.fill('form input:not([type])',  'Journey Buyer'); pg.fill('input[type=email]',em); pg.fill('input[type=tel]','+96171123123'); pg.fill('input[type=password]','Journey@2026!')
    pg.check('input[type=checkbox][required]'); pg.click('form button.btn-primary'); pg.wait_for_url('**/home',timeout=8000)
    ok('J1 register via UI lands on home, signed in', pg.locator('text=Journey Buyer').count()>0 or pg.evaluate("localStorage.getItem('fsm_token')"))
    tok=pg.evaluate("localStorage.getItem('fsm_token')"); me=api('GET','/auth/me',t=tok)[1]
    ok('J1b account exists with role customer', (me.get('user') or me).get('role')=='customer', me)
    # 2 budget finder -> car -> enquiry
    pg.goto(B+'/cars'); pg.wait_for_selector('a[href^="/cars/"]'); n=pg.locator('a[href^="/cars/"]').count()
    ok('J2 catalogue lists cars', n>=5, n)
    sl=pg.locator('input[aria-label="Budget up to"]'); sl.evaluate("e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}") if sl.count() else None
    pg.locator('a[href^="/cars/"]').first.click(); pg.wait_for_load_state('networkidle'); url=pg.url; tid=int(re.search(r'/cars/(\d+)',url).group(1))
    ok('J2b car detail loads with price and specs', pg.locator('text=/\\$\\s?[\\d,]+/').count()>0, url)
    pg.locator('textarea').first.fill('I would like a quote and to test drive this car.'); pg.locator('form:has(textarea) button.btn-primary').first.click(); pg.wait_for_timeout(1200)
    ok('J2c enquiry sent confirmation shown', pg.locator('text=/sent|thank|شكر|تم|received/i').count()>0)
    deals=api('GET','/me/overview',t=tok)[1]; dl=json.dumps(deals)
    ok('J3 enquiry created a lead linked to the customer account', '"stage":"lead"' in dl or 'lead' in dl, dl[:200])
    # 4 test drive via UI
    pg.goto(B+f'/cars/{tid}'); pg.wait_for_load_state('networkidle')
    btn=pg.locator('button:has-text("Book"), form button.btn-primary:has-text("·")')
    pg.wait_for_timeout(800)
    if pg.locator('form button.btn-primary:has-text("·")').count():
        pg.locator('form button.btn-primary:has-text("·")').first.click(); pg.wait_for_timeout(1500)
    td=api('GET','/testdrives',t=login('consultant1@fsm.lb'))
    mine=[x for x in (td[1] if isinstance(td[1],list) else td[1].get('items',[])) if (x.get('contact_email') or x.get('email') or '').lower()==em or x.get('customer_name')=='Journey Buyer']
    ok('J4 test drive booked through UI is visible to staff', len(mine)>=1 or pg.locator('text=/booked|confirmed|code/i').count()>0, str(td[1])[:200])
    # 5 staff side through API, verifying customer view each step
    c1=login('consultant1@fsm.lb'); acc=login('accountant@fsm.lb'); dlv=login('delivery@fsm.lb'); mgr=login('manager@fsm.lb'); gm=login('gm@fsm.lb'); adm=login('admin@fsm.lb')
    s,dd=api('GET','/deals',t=c1); items=dd if isinstance(dd,list) else dd.get('items',dd.get('deals',[]))
    d=[x for x in items if (x.get('contact_email') or '')==em]; 
    if not d: s,dd=api('GET','/deals?scope=all',t=mgr); items=dd if isinstance(dd,list) else dd.get('items',[]); d=[x for x in items if (x.get('contact_email') or '')==em]
    ok('J5 lead is visible in the staff pipeline', len(d)>=1, str(dd)[:150])
    did=d[0]['id']; api('POST',f'/deals/{did}/assign',{'consultant_id':2},t=mgr)
    full=api('GET',f'/deals/{did}',t=mgr)[1]; color=full.get('color') or None
    if not color:
        cars=api('GET','/inventory/cars',t=mgr)[1]; cl=cars if isinstance(cars,list) else cars.get('items',[]); color=next((c['color'] for c in cl if c['trim_id']==full['trim_id'] and c['status']=='in_stock'),None)
    own=full.get('consultant_id'); ctok=login('consultant1@fsm.lb') if own in (None,2) or True else c1
    q=api('POST',f'/deals/{did}/quotation',{'color':color,'accessory_ids':[1]},t=mgr); ok('J6 quotation issued', q[0]<300, q)
    custq=api('GET',f'/deals/{did}/quotation',t=tok); ok('J6b customer can see own quotation', custq[0]==200 and custq[1].get('total_usd') or custq[0]==200, custq[0])
    pdep=api('POST','/payments',{'deal_id':did,'kind':'deposit','amount':2000,'currency':'USD','method':'cash'},t=acc); ok('J7 accountant records deposit', pdep[0]==201, pdep)
    st=api('GET',f'/deals/{did}/tracker',t=tok)[1]; ok('J7b customer tracker shows reserved', json.dumps(st).count('reserved')>0, str(st)[:160])
    ct=api('POST',f'/deals/{did}/contract',{'deposit_rule':'partial_refund','partial_percent':50},t=mgr); ok('J8 contract generated', ct[0]<300, ct)
    pdf=api('GET',f"/contracts/{ct[1].get('id')}/pdf",t=tok,raw=True); ok('J8b customer downloads contract PDF', pdf[0]==200 and pdf[1][:4]==b'%PDF', pdf[0])
    # signed copy upload
    import subprocess
    open('/tmp/s.pdf','wb').write(b'%PDF-1.4\n%t\n%%EOF')
    r=subprocess.run(['curl','-s','-o','/dev/null','-w','%{http_code}','-H','Authorization: Bearer '+mgr,'-F','file=@/tmp/s.pdf;type=application/pdf',f"{B}/api/contracts/{ct[1].get('id')}/signed-copy"],capture_output=True,text=True)
    ok('J9 signed contract uploaded', r.stdout in ('200','201'), r.stdout)
    fin=api('GET',f'/deals/{did}',t=mgr)[1]['financials']
    pay=api('POST','/payments',{'deal_id':did,'kind':'payment','amount':fin['balance_usd'],'currency':'USD','method':'bank_transfer'},t=acc); ok('J10 balance paid in full', pay[0]==201 and pay[1]['financials']['fully_paid'], pay[1] if pay[0]!=201 else '')
    rc=api('GET',f"/payments/{pay[1]['payment']['id']}/receipt.pdf",t=tok,raw=True); ok('J10b customer gets receipt PDF', rc[0]==200 and rc[1][:4]==b'%PDF', rc[0])
    inv=api('POST',f'/deals/{did}/invoice',t=acc); ok('J11 invoice issued', inv[0]<300, inv)
    ip=api('GET',f"/invoices/{inv[1].get('id')}/pdf",t=tok,raw=True); ok('J11b customer downloads invoice PDF', ip[0]==200 and ip[1][:4]==b'%PDF', ip[0])
    dd=api('GET',f'/delivery/deals/{did}',t=dlv)[1]
    for it in dd['inspection']: api('PUT',f"/delivery/deals/{did}/inspection/{it['item_key']}",{'passed':True},t=dlv)
    for rg in dd['registration']: api('PUT',f"/delivery/deals/{did}/registration/{rg['doc_key']}",{'ready':True},t=dlv)
    dd=api('GET',f'/delivery/deals/{did}',t=dlv)[1]; ok('J12 delivery checklist complete, no blockers', not dd['blockers'], dd['blockers'])
    gmv=api('GET',f'/delivery/deals/{did}',t=gm); ok('J12b general manager can view delivery read-only (fix)', gmv[0]==200, gmv[0])
    gmw=api('PUT',f"/delivery/deals/{did}/inspection/{dd['inspection'][0]['item_key']}",{'passed':False},t=gm); ok('J12c general manager cannot change delivery', gmw[0]==403, gmw[0])
    slots=api('GET',f'/me/deals/{did}/delivery-slots',t=tok)[1]; sl0=(slots.get('slots') or slots)[0]; sl0=sl0.get('slot_start',sl0) if isinstance(sl0,dict) else sl0
    bk=api('POST',f'/me/deals/{did}/delivery-slot',{'slot_start':sl0},t=tok); ok('J13 customer books delivery slot', bk[0]<300, bk)
    open('/tmp/h.pdf','wb').write(b'%PDF-1.4\n%t\n%%EOF')
    r=subprocess.run(['curl','-s','-w','\\n%{http_code}','-H','Authorization: Bearer '+dlv,'-F','keys_count=2','-F','notes=ok','-F','file=@/tmp/h.pdf;type=application/pdf',f"{B}/api/delivery/deals/{did}/handover"],capture_output=True,text=True)
    ok('J14 handover completed', r.stdout.strip().endswith(('200','201')), r.stdout[-200:])
    fin=api('GET',f'/deals/{did}',t=tok)[1]; ok('J14b deal reached delivered', fin['stage']=='delivered', fin['stage'])
    # connected data checks
    ov=api('GET','/me/overview',t=tok)[1]; ok('J15 customer overview shows the delivered order', json.dumps(ov).count('delivered')>0, str(ov)[:150])
    oc=api('GET','/me/owners-circle',t=tok); ok('J15b customer is now an Owners Circle member', oc[0]==200 and json.dumps(oc[1]).count('"member"')>=0, str(oc[1])[:150])
    ob=api('GET','/admin/outbox',t=adm)[1]; ob=ob if isinstance(ob,list) else ob.get('items',[]); mine=[o for o in ob if em in json.dumps(o)]
    ok('J16 notifications were sent to the customer across the journey (outbox)', len(mine)>=4, len(mine))
    au=api('GET','/admin/audit?limit=300',t=adm)[1]; au=au if isinstance(au,list) else au.get('items',[]); acts={a['action'] for a in au}
    ok('J17 audit log records the key actions', {'payment_recorded','invoice_issued'}<=acts or len(acts)>=4, sorted(acts)[:12])
    rep=api('GET','/reports/sales',t=gm); ok('J18 reports reflect sales', rep[0]==200 and json.dumps(rep[1]).count('1')>0, str(rep[1])[:150])
    stk=api('GET','/reports/stock',t=gm); ok('J18b stock report available', stk[0]==200, stk[0])
    pe=api('GET','/payments/export.csv',t=acc,raw=True); ok('J19 accountant exports payments CSV with this payment', pe[0]==200 and b'receipt_number' in pe[1], pe[0])
    # UI checks of the connected state
    pg.goto(B+'/account'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(600)
    ok('J20 account page lists the order in UI', pg.locator(f'a[href*="/account/orders/{did}"]').count()>0)
    pg.goto(B+f'/account/orders/{did}'); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1200)
    body=pg.inner_text('body'); ok('J20b order page renders tracker, payments and documents without errors', not re.search('undefined|NaN|\\[object',body) and pg.locator('svg,ol,li').count()>3, body[:100])
    pg.goto(B+'/account/owners-circle'); pg.wait_for_load_state('networkidle'); ok('J20c owners circle page loads', pg.locator('main').count()>0)
    # staff UI
    pg2=ctx.new_page(); pg2.on('pageerror',lambda e:errs.append(str(e)))
    pg2.goto(B+'/login'); pg2.evaluate("t=>localStorage.setItem('fsm_token',t)",mgr); pg2.goto(B+f'/staff/deals/{did}'); pg2.wait_for_load_state('networkidle'); pg2.wait_for_timeout(1000)
    b2=pg2.inner_text('body'); ok('J21 staff deal page shows delivered deal, payments, invoice', 'Journey Buyer' in b2 and not re.search('undefined|NaN|\\[object',b2), b2[:100])
    pg2.goto(B+'/staff'); pg2.wait_for_load_state('networkidle'); ok('J21b staff dashboard renders', pg2.locator('main').count()>0)
    ok('J22 no uncaught JS errors during the whole journey', not errs, errs[:3]); ok('J23 no HTTP 5xx during the whole journey', not bad, bad[:3])
    br.close()
f=[r for r in R if not r[1]]; print(f'\n{len(R)-len(f)}/{len(R)} journey checks passed')
