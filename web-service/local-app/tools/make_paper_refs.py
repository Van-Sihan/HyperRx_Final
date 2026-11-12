"""Builds paper_refs.json: one APA 7 reference per paper in the team DB, from the PubMed records saved when the papers were
collected (efetch XML, paper_corpus/PUBMED_RAW/DX2_239/raw/*.xml, retrieved 2026-10-22). No network call.

    python tools/make_paper_refs.py <folder with batch_*.xml> [paper_refs.json]

Journal articles: Author, A. A., & Author, B. B. (Year). Title. Journal, Volume(Issue), pages. https://doi.org/...
Bookshelf chapters (StatPearls): Author, A. A. (Year). Title. In Book. Publisher. https://www.ncbi.nlm.nih.gov/books/NBK.../
Bookshelf reports (Statistical Brief #n): Author, A. A. (Year). Title (Statistical Brief No. n). Publisher. URL
Article titles are kept as PubMed records them. APA asks for sentence case, but proper nouns (Oklahoma, MEPS, COVID-19)
cannot be told apart automatically, so the title is not re-cased. Journal names are put in title case."""
import sys,re,json,glob,os
import xml.etree.ElementTree as ET

# Journals whose own styling title case cannot produce.
OFFICIAL={'plos one':'PLOS ONE','plos medicine':'PLOS Medicine'}
MINOR={'a','an','the','and','but','or','nor','for','so','yet','as','at','by','in','of','off','on','per','to','up','via','de','la','le','et','du','des','der','die','und'}

def text(node):
 return re.sub(r'\s+',' ',''.join(node.itertext())).strip() if node is not None else ''

def initials(fore,given_initials):
 """APA initials from the forename: "Christopher G." -> "C. G.", "Jean-Pierre" -> "J.-P."; falls back to PubMed initials."""
 if fore:
  out=[]
  for word in re.split(r'\s+',fore.strip()):
   parts=[p for p in word.split('-') if p]
   if parts:out.append('-'.join(p[0].upper()+'.' for p in parts))
  if out:return ' '.join(out)
 return ' '.join(c+'.' for c in (given_initials or ''))

def author_names(author_list):
 names=[]
 for a in (author_list.findall('Author') if author_list is not None else []):
  if a.get('ValidYN')=='N':continue
  group=a.findtext('CollectiveName')
  if group:names.append(group.strip());continue
  last=(a.findtext('LastName') or '').strip()
  if not last:continue
  name=last+', '+initials(a.findtext('ForeName'),a.findtext('Initials'))
  suffix=(a.findtext('Suffix') or '').strip()
  names.append(f'{name}, {suffix}.' if suffix and not suffix.endswith('.') else f'{name}, {suffix}' if suffix else name)
 return names

def apa_authors(names):
 """APA 7: up to 20 authors with "&" before the last; 21 or more: the first 19, an ellipsis, then the last."""
 names=[n.rstrip() for n in names]
 if not names:return ''
 if len(names)==1:return names[0]
 if len(names)<=20:return ', '.join(names[:-1])+', & '+names[-1]
 return ', '.join(names[:19])+', . . . '+names[-1]

def journal_title(raw):
 """PubMed's full journal title in title case, without the trailing subtitle or place ("Clinical infectious diseases : an official
 publication of ..." -> "Clinical Infectious Diseases", "Methods in molecular biology (Clifton, N.J.)" -> "Methods in Molecular Biology")."""
 t=re.split(r'\s+:\s+',raw.strip())[0]
 t=re.sub(r'\s*\([^)]*\)\s*$','',t).strip().rstrip('.')
 if t.lower() in OFFICIAL:return OFFICIAL[t.lower()]
 words=t.split(' ');out=[]
 for i,w in enumerate(words):
  core=w.strip('()[],')
  if i and core.lower() in MINOR and not (out and out[-1].endswith(':')):out.append(w.lower())
  elif any(c.isupper() for c in core[1:]) or core.isupper():out.append(w) # acronyms and mixed case (JAMA, BMJ, eLife) stay
  else:
   # Each part of a hyphenated or slashed word is capitalized too ("Health-System", "Thrombosis/Hemostasis", "Disease-a-Month").
   segs=re.split(r'([-/])',w)
   out.append(''.join(x if x in '-/' or (k and x.lower() in MINOR) else re.sub(r'[A-Za-z]',lambda m:m.group(0).upper(),x,count=1) for k,x in enumerate(segs)))
 return ' '.join(out)

def end_title(t):
 t=t.strip()
 return t if re.search(r'[.?!]$',t) else t+'.'

def pages(raw):
 """"1243-50" -> "1243–1250"; an article number such as "e0263221" -> "Article e0263221"."""
 raw=(raw or '').strip()
 if not raw:return ''
 if re.fullmatch(r'[A-Za-z]+\d+',raw) and not raw.upper().startswith('S'):return 'Article '+raw
 def expand(m):
  a,b=m.group(1),m.group(2)
  pa,na=re.match(r'([A-Za-z]*)(\d+)',a).groups();pb,nb=re.match(r'([A-Za-z]*)(\d+)',b).groups()
  if not pb and len(nb)<len(na):nb=na[:len(na)-len(nb)]+nb;pb=pa
  return f'{pa}{na}–{pb or ""}{nb}'
 return re.sub(r'([A-Za-z]*\d+)\s*-\s*([A-Za-z]*\d+)',expand,raw)

def article_number(pii):
 """An article number given only as the publisher's id ("afaf300", "e0263221"); long publisher ids such as Elsevier's
 "S0002-9149(23)00123-4" are not article numbers and are left out."""
 pii=(pii or '').strip()
 return 'Article '+pii if re.fullmatch(r'[A-Za-z]{0,6}\d+',pii) else ''

def year_of(date):
 if date is None:return ''
 y=date.findtext('Year')
 if y:return y
 m=re.search(r'\d{4}',date.findtext('MedlineDate') or '')
 return m.group(0) if m else ''

def article_ref(a):
 cit=a.find('MedlineCitation');art=cit.find('Article');journal=art.find('Journal')
 issue=journal.find('JournalIssue')
 doi=a.findtext(".//PubmedData/ArticleIdList/ArticleId[@IdType='doi']") or art.findtext("ELocationID[@EIdType='doi']") or ''
 ref={'pmid':cit.findtext('PMID'),'kind':'article','authors':apa_authors(author_names(art.find('AuthorList'))),
  'year':year_of(issue.find('PubDate') if issue is not None else None) or year_of(art.find('ArticleDate')),
  'title':end_title(text(art.find('ArticleTitle'))),'container':journal_title(journal.findtext('Title') or journal.findtext('ISOAbbreviation') or ''),
  'volume':(issue.findtext('Volume') or '').strip() if issue is not None else '','issue':re.sub(r'\s+','',issue.findtext('Issue') or '') if issue is not None else '',
  'pages':pages(art.findtext('Pagination/MedlinePgn')) or article_number(art.findtext("ELocationID[@EIdType='pii']")),'doi':doi.strip(),'url':f"https://doi.org/{doi.strip()}" if doi.strip() else f"https://pubmed.ncbi.nlm.nih.gov/{cit.findtext('PMID')}/"}
 return ref

def book_ref(b):
 doc=b.find('BookDocument');book=doc.find('Book')
 nbk=doc.findtext("ArticleIdList/ArticleId[@IdType='bookaccession']") or ''
 label=doc.findtext("LocationLabel") or ''
 report=re.match(r'(.+?)\s*#\s*(\S+)$',label.strip())
 year=year_of(doc.find('ContributionDate')) if report else year_of(book.find('PubDate'))
 return {'pmid':doc.findtext('PMID'),'kind':'report' if report else 'chapter','authors':apa_authors(author_names(doc.find('AuthorList'))),
  'year':year or year_of(book.find('PubDate')),'title':end_title(text(doc.find('ArticleTitle'))) if not report else text(doc.find('ArticleTitle')).rstrip('.'),
  'container':text(book.find('BookTitle')),'report':f'{report.group(1)} No. {report.group(2)}' if report else '',
  'publisher':re.sub(r'\s*\((US|UK)\)$','',(book.findtext('Publisher/PublisherName') or '').strip()),
  'url':f'https://www.ncbi.nlm.nih.gov/books/{nbk}/' if nbk else f"https://pubmed.ncbi.nlm.nih.gov/{doc.findtext('PMID')}/",'doi':''}

def apa_text(r):
 """Plain-text APA reference (italics are added by the screen from the same fields)."""
 year=r['year'] or 'n.d.'
 if r['kind']=='article':
  src=r['container']+(f", {r['volume']}" if r['volume'] else '')+(f"({r['issue']})" if r['issue'] else '')+(f", {r['pages']}" if r['pages'] else '')
  # Without authors APA moves the title to the author position: "Title. (Year). Journal ..."
  lead=f"{r['authors']} ({year}). {r['title']}" if r['authors'] else f"{r['title']} ({year})."
  return f"{lead} {src}. {r['url']}"
 head=f"{r['authors']} ({year}). " if r['authors'] else ''
 if r['kind']=='report':
  return f"{head}{r['title']} ({r['report']}). {r['publisher']}. {r['url']}"
 return f"{head}{r['title']} In {r['container']}. {r['publisher']}. {r['url']}"

def build(folder):
 refs={}
 for f in sorted(glob.glob(os.path.join(folder,'*.xml'))):
  root=ET.parse(f).getroot()
  for a in root.iter('PubmedArticle'):
   r=article_ref(a);refs[r['pmid']]=r
  for b in root.iter('PubmedBookArticle'):
   r=book_ref(b);refs[r['pmid']]=r
 for r in refs.values():r['text']=apa_text(r)
 return refs

if __name__=='__main__':
 folder=sys.argv[1];out=sys.argv[2] if len(sys.argv)>2 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'paper_refs.json')
 refs=build(folder)
 meta={'_note':'APA 7 references for the papers in the team DB, built by tools/make_paper_refs.py from PubMed efetch XML retrieved 2026-10-22 (paper_corpus/PUBMED_RAW/DX2_239). Titles are kept as PubMed records them.','count':len(refs)}
 with open(out,'w',encoding='utf-8') as h:json.dump({**meta,'refs':dict(sorted(refs.items()))},h,ensure_ascii=False,indent=1)
 print(len(refs),'references ->',out)
