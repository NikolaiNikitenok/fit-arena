import json, wave
lines=[l.rstrip('\n').split('\t') for l in open('lines.tsv',encoding='utf8')]
def wdur(f):
    with wave.open(f) as w: return w.getnframes()/w.getframerate()
dur=[wdur(f'vo/{i+1}.wav') for i in range(len(lines))]
GAP=0.12; t=0.1; ev=[]; subs=[]; hook=None
for i,(say,sub) in enumerate(lines):
    ev.append((i+1,t,dur[i]))
    if sub=='HOOK': hook=(0,t+dur[i]+0.25)
    else:
        parts=sub.split('|'); w=[len(p)+6 for p in parts]; s=t
        for j,(p,wi) in enumerate(zip(parts,w)):
            d=dur[i]*wi/sum(w); subs.append([p,s,s+d,j==len(parts)-1 and len(parts)>1]); s+=d
    t+=dur[i]+GAP
    if sub=='HOOK': t+=0.25
for k in range(len(subs)-1): subs[k][2]=subs[k+1][1]
subs[-1][2]=t+0.8
json.dump({'vo':ev,'subs':subs,'hook':hook,'end':t+0.8},open('plan.json','w'),ensure_ascii=False)
print(round(t+0.8,2), hook)
