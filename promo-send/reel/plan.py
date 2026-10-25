import json, subprocess, wave
lines=[l.rstrip('\n').split('\t') for l in open('lines.tsv',encoding='utf8')]
def wdur(f):
    with wave.open(f) as w: return w.getnframes()/w.getframerate()
dur=[wdur(f'vo/{i+1}.wav') for i in range(len(lines))]
GAP=0.3; t=0.25; ev=[]; subs=[]
for i,(say,sub) in enumerate(lines):
    ev.append((i+1,t,dur[i]))
    parts=sub.split('|'); w=[len(p)+6 for p in parts]; s=t
    for j,(p,wi) in enumerate(zip(parts,w)):
        d=dur[i]*wi/sum(w); subs.append((p,s,s+d,j==len(parts)-1 and len(parts)>1)); s+=d
    t+=dur[i]+GAP
# subs persist until next starts
for k in range(len(subs)-1): subs[k]=(subs[k][0],subs[k][1],subs[k+1][1],subs[k][3])
subs[-1]=(subs[-1][0],subs[-1][1],t+0.6,True)
json.dump({'vo':ev,'subs':subs,'end':t+0.6},open('plan.json','w'),ensure_ascii=False,indent=0)
print(t+0.6)
