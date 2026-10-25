import json, subprocess
P=json.load(open('plan.json')); S='src.mp4'
st=[v[1] for v in P['vo']]; st[0]=0; st.append(P['end'])
slot=lambda a,b:(st[a-1],st[b])  # lines a..b inclusive
F7=slot(7,7); mid=(F7[0]+F7[1])/2
clips=[ (0.0,3.25,*slot(1,2)), (3.3,6.3,*slot(3,3)), (32.4,36.4,*slot(4,4)), (14.0,16.9,*slot(5,5)),
 (6.6,11.0,*slot(6,6)), (22.4,24.6,F7[0],mid), (18.3,20.5,mid,F7[1]), (29.0,32.1,*slot(8,8)), (50.8,54.5,*slot(9,9))]
ins=[];fc='';n=0
for k,(a,b,t0,t1) in enumerate(clips):
    T=t1-t0; src=b-a
    if k==len(clips)-1: f=f'trim={a}:{b},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={max(0,T-src)+0.1},trim=0:{T}'
    elif src>=T: f=f'trim={a}:{a+T},setpts=PTS-STARTPTS'
    else: f=f'trim={a}:{b},setpts=(PTS-STARTPTS)*{T/src:.4f},fps=30'
    fc+=f'[0:v]{f},setsar=1[c{k}];'
fc+=''.join(f'[c{k}]' for k in range(len(clips)))+f'concat=n={len(clips)}:v=1:a=0[v0];'
ins=['-i',S]; prev='v0'
for i,(txt,a,b,_) in enumerate(P['subs']):
    ins+=['-i',f'band_{i:02d}.png']; fc+=f"[{prev}][{i+1}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[o{i}];"; prev=f'o{i}'
na=len(P['subs'])+1
ins+=['-i',S]; mi=na; na+=1
vo=[]
for j,(i,t,d) in enumerate(P['vo']):
    ins+=['-i',f'vo/{i}.wav']; ms=int(t*1000); fc+=f'[{na}:a]aresample=48000,adelay={ms}|{ms}[v{j}];'; vo.append(f'[v{j}]'); na+=1
E=P['end']
fc+=''.join(vo)+f'amix=inputs={len(vo)}:normalize=0,apad,atrim=0:{E:.3f},highpass=f=80,acompressor=threshold=-20dB:ratio=3,asplit=2[voice][sc];'
fc+=f'[{mi}:a]atrim=0:{E:.3f},volume=0.35,afade=t=out:st={E-1.5:.3f}:d=1.5[mus];[mus][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[duck];'
fc+=f'[voice][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a]'
subprocess.run(['ffmpeg','-y','-v','error',*ins,'-filter_complex',fc,'-map',f'[{prev}]','-map','[a]','-t',f'{E:.3f}','-c:v','libx264','-crf','18','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','reel.mp4'],check=True)
