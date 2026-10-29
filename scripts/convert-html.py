#!/usr/bin/env python3
"""Convert reimagined home + zip interior pages to Next.js JSX.
Preserves original CSS/classes/copy. No color changes.
Output: app/globals.css, components/SiteHeader.tsx, components/SiteFooter.tsx,
app/page.tsx, app/how/page.tsx, app/departments/page.tsx, app/<zip-slug>/page.tsx
"""
import pathlib, re, html
from html.parser import HTMLParser

HOME = pathlib.Path.home()
SRC = HOME / "workspace/user/files/unsaid_memories_marketplace_home_reimagined.html"
ZIPD = pathlib.Path("/tmp/htmls/unsaid_memories_fixed_html_pages")
APP = HOME / "workspace/unsaid-app/app"
COMP = HOME / "workspace/unsaid-app/components"
COMP.mkdir(exist_ok=True)

HASH_MAP = {
    "#home": "/", "#departments": "/departments", "#store": "/departments",
    "#shop": "/shop", "#products": "/shop", "#how": "/how",
    "#how-it-works": "/how", "#the-box": "/how", "#preserve-it": "/how",
    "#share-it": "/memory-links", "#find-my-box": "/gift-finder",
    "#gift-it": "/bundles-gifts", "#b2b": "/organizations-corporate-gifting",
    "#newsletter": "/#newsletter",
}
DEPT_MAP = {
    "drinkware": "/shop/drinkware", "apparel": "/shop/apparel",
    "decor": "/shop/home-and-living", "fragrance": "/shop/wellness",
    "textiles": "/shop/home-and-living", "kitchen": "/shop/home-and-living",
    "stationery": "/shop/office", "jewelry": "/shop/jewelry",
    "games": "/shop", "pet": "/shop", "memorylink": "/shop/digital-and-memory",
}
FOOTER_LABEL_MAP = {
    "store departments": "/departments", "shop all products": "/shop",
    "how it works": "/how", "memory links": "/memory-links",
    "find my box": "/gift-finder", "guides & stories": "/guides-stories",
    "unsaid signature line": "/signature", "our story": "/our-story",
    "contact us": "/help-contact", "shipping & returns": "/help-shipping-returns",
    "warranty & repairs": "/help-faq", "accessibility": "/accessibility",
    "privacy & legacy": "/privacy-policy", "funeral homes": "/organizations-funeral-homes",
    "senior living": "/organizations-senior-living", "schools & hospitals": "/organizations-schools-hospitals",
    "wedding planners": "/organizations-wedding-planners", "corporate gifting": "/organizations-corporate-gifting",
    "privacy": "/privacy-policy", "terms": "/terms-of-service",
}
VOID = {"area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"}
CAMEL = {"class":"className","for":"htmlFor","tabindex":"tabIndex","stroke-width":"strokeWidth",
         "stroke-linecap":"strokeLinecap","stroke-linejoin":"strokeLinejoin",
         "fill-rule":"fillRule","clip-rule":"clipRule","stroke-dasharray":"strokeDasharray",
         "stroke-dashoffset":"strokeDashoffset","font-family":"fontFamily","font-size":"fontSize",
         "text-anchor":"textAnchor","viewbox":"viewBox","gradientunits":"gradientUnits",
         "gradienttransform":"gradientTransform","patternunits":"patternUnits"}
SVG_CASE = {"lineargradient":"linearGradient","radialgradient":"radialGradient",
            "clippath":"clipPath","textpath":"textPath","foreignobject":"foreignObject"}

def style_to_jsx(v):
    parts=[]
    for decl in v.split(";"):
        decl=decl.strip()
        if not decl or ":" not in decl: continue
        k,val=decl.split(":",1)
        k=k.strip(); val=val.strip()
        camel=re.sub(r"-([a-z])", lambda m: m.group(1).upper(), k)
        parts.append(f"{camel}: '{val}'")
    return "{{" + ", ".join(parts) + "}}" if parts else None

def map_href(v, label="", dept=None, footer=False):
    if dept and dept in DEPT_MAP: return DEPT_MAP[dept]
    if footer and label.strip().lower() in FOOTER_LABEL_MAP: return FOOTER_LABEL_MAP[label.strip().lower()]
    if v in HASH_MAP: return HASH_MAP[v]
    if v.endswith(".html"):
        name=v[:-5]
        return "/" if name=="index" else "/"+name
    return v

class JSX(HTMLParser):
    def __init__(self, footer=False):
        super().__init__(convert_charrefs=False)
        self.out=[]; self.stack=[]; self.footer=footer; self.cur_label=""; self.in_a=False
    def handle_starttag(self, tag, attrs):
        if tag in ("script","style","head","html","body","title","meta","link"):
            self.stack.append(("skip",tag)); return
        if tag == "main":
            self.stack.append(("transparent",tag)); return
        d=dict(attrs)
        # special buttons in header
        if tag=="button" and d.get("id")=="searchBtn":
            self.out.append('<a href="/shop" className="icon-btn desktop-action" aria-label="Search">'); self.stack.append(("a",tag)); return
        if tag=="button" and d.get("id")=="accountBtn":
            self.out.append('<a href="/admin" className="icon-btn desktop-action" aria-label="My account">'); self.stack.append(("a",tag)); return
        if tag=="button" and d.get("id")=="cartBtn":
            self.out.append('<a href="/checkout" className="icon-btn" aria-label="Shopping bag">'); self.stack.append(("a",tag)); return
        label=""
        if tag=="a":
            self.in_a=True
        dept=d.get("data-store-dept") or d.get("data-menu-department")
        out_attrs=[]
        for k,v in attrs:
            if k in ("data-spa-page",): continue
            if v is None:
                out_attrs.append(CAMEL.get(k, k)); continue
            if k=="href":
                v=map_href(v, label="", dept=dept, footer=self.footer)
                out_attrs.append(f'href="{v}"')
            elif k=="class": out_attrs.append(f'className="{v}"')
            elif k=="style":
                s=style_to_jsx(v)
                if s: out_attrs.append(f'style={s}')
            elif k in CAMEL: out_attrs.append(f'{CAMEL[k]}="{v}"')
            elif k.startswith("data-") or k.startswith("aria-"): out_attrs.append(f'{k}="{v}"')
            elif k in ("id","type","placeholder","required","name","value","alt","src","loading","rel","target","role","viewBox","fill","stroke","stroke-width","width","height","min","max","step","accept","multiple","checked","selected","disabled","readOnly","autoComplete","inputMode","pattern","title","tabIndex","colSpan","rowSpan","method","action","encType","charSet","crossOrigin"):
                out_attrs.append(f'{k}="{v}"' if v!="" else k)
            else:
                # generic: keep kebab as-is only if valid JSX attr (aria/data handled); otherwise camelize
                ck=re.sub(r"-([a-z])", lambda m: m.group(1).upper(), k)
                out_attrs.append(f'{ck}="{v}"' if v!="" else ck)
        # footer label mapping needs label text, which we don't know yet; fix later via post-pass on <a> text
        s=f"<{tag}" + (" "+" ".join(out_attrs) if out_attrs else "") + ("/>" if tag in VOID else ">")
        self.out.append(s); self.stack.append((tag,tag))
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and not self.stack or True:
            # parser calls handle_starttag then we need close if not void
            if tag not in VOID:
                # pop the pushed entry if it was not skip
                if self.stack and self.stack[-1][1]==tag:
                    self.stack.pop()
                self.out.append(f"</{tag}>")
    def handle_endtag(self, tag):
        if tag in ("script","style","head","html","body","title","meta","link"):
            if self.stack and self.stack[-1]==("skip",tag): self.stack.pop()
            return
        out_tag = tag
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][1]==tag:
                out_tag = self.stack[i][0]
                del self.stack[i:]
                break
        if out_tag == "transparent": return
        if tag=="a": self.in_a=False
        self.out.append(f"</{out_tag}>")
    def handle_data(self, data):
        if not data.strip(): return
        if self.stack and self.stack[-1][0]=="skip": return
        txt=data.replace("{","&#123;").replace("}","&#125;")
        self.out.append(txt)
    def handle_comment(self, data): pass
    def handle_entityref(self, name): self.out.append(f"&{name};")
    def handle_charref(self, name): self.out.append(f"&#{name};")
    def get(self): return "".join(self.out)

def convert(fragment, footer=False):
    p=JSX(footer=footer); p.feed(fragment); p.close(); out=p.get()
    for low, camel in SVG_CASE.items():
        out=out.replace(f"<{low}", f"<{camel}").replace(f"</{low}>", f"</{camel}>")
    return out

def fix_footer_links(jsx):
    # label-based mapping: <a href="...">Label</a> -> replace href if label matches
    def repl(m):
        href, inner = m.group(1), m.group(2)
        label=re.sub(r"<[^>]+>","",inner).strip().lower()
        if label in FOOTER_LABEL_MAP:
            return f'<a href="{FOOTER_LABEL_MAP[label]}">{inner}</a>'
        return m.group(0)
    return re.sub(r'<a href="([^"]+)">(.*?)</a>', repl, jsx)

def extract_sections(body):
    secs={}
    for m in re.finditer(r'<section[^>]*data-spa-page="(\w+)"[^>]*>(.*?)</section>', body, re.S):
        secs.setdefault(m.group(1),[]).append(m.group(0))
    return secs

t=SRC.read_text()
style=re.search(r'<style[^>]*>(.*?)</style>', t, re.S).group(1)
body=re.search(r'<body[^>]*>(.*)</body>', t, re.S).group(1)
secs=extract_sections(body)

# globals.css: original CSS + full-bleed override + legacy .grid/.card for existing shop/admin pages
full_bleed="""
/* --- FULL BLEED ONLY: layout, no color, font, copy, or brand changes --- */
html,body{overflow-x:hidden}
.wrap{width:100% !important;max-width:none !important;margin-left:0 !important;margin-right:0 !important;padding-left:clamp(20px,4vw,64px) !important;padding-right:clamp(20px,4vw,64px) !important}
.hero{padding:0 !important}
.hero-grid{border-radius:0 !important;width:100% !important}
.manifesto{padding-left:0 !important;padding-right:0 !important}
.manifesto-panel{border-radius:0 !important;width:100% !important}
.quiz-panel{border-radius:0 !important}
.infra-panel{border-radius:0 !important}
.section,.quiz-section,.newsletter,.footer,.marketplace-home,.market-rail,.holiday-band,.infrastructure{width:100%}
/* legacy scaffold helpers used by existing shop/admin pages */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{border:1px solid #ddd;border-radius:12px;padding:16px}
"""
(APP/"globals.css").write_text(style + full_bleed)
print("globals.css", len(style))

# Header: body start -> first hero section, plus mobile-shop div
hero_idx=body.find('<section class="hero"')
header_html=body[:hero_idx]
mobile_m=re.search(r'<div class="mobile-shop".*?</div>\s*(?=<div class="modal"|</body>|<script|$)', body, re.S)
# mobile-shop is a div with nested a's; take from its start to the quiz modal / script start more robustly:
ms_idx=body.find('<div class="mobile-shop"')
if ms_idx>=0:
    # find matching close by counting divs
    seg=body[ms_idx:ms_idx+3000]
    header_html += seg.split('<div class="modal"')[0].rsplit('</div>',1)[0] + '</div>' if '<div class="modal"' in seg else seg
header_jsx=convert(header_html)
header_tsx = ("'use client';\nimport { useEffect } from 'react';\n"
"export default function SiteHeader() {\n"
"  useEffect(() => {\n"
"    const toggle = document.getElementById('menuToggle');\n"
"    const mega = document.getElementById('megaMenu');\n"
"    const closeBtn = document.getElementById('mobileMenuClose');\n"
"    const open = () => mega?.classList.add('open');\n"
"    const close = () => mega?.classList.remove('open');\n"
"    const onToggle = () => (mega?.classList.contains('open') ? close() : open());\n"
"    toggle?.addEventListener('click', onToggle);\n"
"    closeBtn?.addEventListener('click', close);\n"
"    document.querySelectorAll('[data-route-link]').forEach((el) => el.addEventListener('click', close));\n"
"    return () => { toggle?.removeEventListener('click', onToggle); closeBtn?.removeEventListener('click', close); };\n"
"  }, []);\n"
"  return (<>" + header_jsx + "</>);\n}\n")
(COMP/"SiteHeader.tsx").write_text(header_tsx)
print("SiteHeader", len(header_tsx))

# Footer
fm=re.search(r'<footer.*?</footer>', body, re.S)
footer_jsx=fix_footer_links(convert(fm.group(0), footer=True))
footer_jsx=footer_jsx.replace('href="#"', 'href="/"', 1)  # footer logo -> home, socials stay as placeholders
(COMP/"SiteFooter.tsx").write_text(f"export default function SiteFooter() {{\n  return (<>{footer_jsx}</>);\n}}\n")
print("SiteFooter", len(footer_jsx))

# Trust strip + newsletter
trust_m=re.search(r'<div class="wrap trust-strip">.*?</div>\s*(?=<section)', body, re.S)
trust_html=trust_m.group(0) if trust_m else ""
news_m=re.search(r'<section class="newsletter".*?</section>', body, re.S)
news_html=news_m.group(0) if news_m else ""

def page_file(path, jsx, title):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"export const metadata = {{ title: '{title} | Unsaid Memories' }};\nexport default function Page() {{\n  return (<>{jsx}</>);\n}}\n")
    print(path, len(jsx))

# Home: hero + trust + home sections + newsletter
home_html="".join(secs.get("home",[]))
# hero is first home section; trust strip sits before marketplace section in original order - approximate by putting trust after hero
home_parts=[]
if secs.get("home"):
    home_parts.append(secs["home"][0])
    if trust_html: home_parts.append(trust_html)
    home_parts.extend(secs["home"][1:])
home_jsx=convert("".join(home_parts)+news_html)
page_file(APP/"page.tsx", home_jsx, "Unsaid Memories")

# How
how_jsx=convert("".join(secs.get("how",[])))
page_file(APP/"how/page.tsx", how_jsx, "How it works")

# Departments (reimagined store section)
dept_jsx=convert("".join(secs.get("departments",[])))
page_file(APP/"departments/page.tsx", dept_jsx, "Store Departments")

# Zip pages
skip={"index","shop","departments"}
count=0
for f in sorted(ZIPD.glob("*.html")):
    slug=f.stem
    if slug in skip: continue
    zt=f.read_text(errors="ignore")
    title_m=re.search(r'<title>(.*?)</title>', zt, re.S)
    title=html.unescape(re.sub(r"<[^>]+>","",title_m.group(1)) if title_m else slug).replace(" | Unsaid Memories","").replace("&amp;","&").replace("'","\\'")
    main_m=re.search(r'<main[^>]*>(.*?)</main>', zt, re.S)
    if not main_m: print("skip no main", slug); continue
    main=main_m.group(1)
    # zip pages use their own .wrap/.page-hero etc; shared reimagined CSS covers most, zip CSS is same design system family
    jsx=convert(main)
    page_file(APP/f"{slug}/page.tsx", jsx, title)
    count+=1
print("zip pages", count)
