# Сборка рилса: клипы из промо v2 по строкам озвучки, наезды на склейках, хук-титр, полоса субтитров, музыка под голосом.
import json, subprocess, os
P=json.load(open('plan.json')); S=os.environ.get('SRC','src.mp4')
st=[v[1] for v in P['vo']]; st[0]=0; st.append(P['end'])
CL={1:(27.1,29.3),2:(36.7,39.3),3:(0.0,3.25),4:(3.3,6.3),5:(29.3,32.1),6:(32.4,36.4),7:(18.3,22.0),8:(14.0,16.9),9:(50.8,54.5)}
fc=''; n=len(CL)
for k in range(1,n+1):
    a,b=CL[k]; T=st[k]-st[k-1]; src=b-a
    if k==n: f=f'trim={a}:{b},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration={max(0,T-src)+0.1},trim=0:{T}'
    elif src>=T: f=f'trim={a}:{a+T},setpts=PTS-STARTPTS'
    else: f=f'trim={a}:{b},setpts=(PTS-STARTPTS)*{T/src:.4f},fps=30'
    z="1+0.12*pow(max(0,1-t/0.35),2)"  # наезд в начале клипа
    f+=f",scale=w='2*trunc(540*({z}))':h=-2:eval=frame,crop=1080:1920,setsar=1"
    if k==1: f+=f",eq=brightness=-0.05"
    fc+=f'[0:v]{f}[c{k}];'
fc+=''.join(f'[c{k}]' for k in range(1,n+1))+f'concat=n={n}:v=1:a=0[v0];'
ins=['-i',S]; prev='v0'; idx=1
for i,(txt,a,b,_) in enumerate(P['subs']):
    ins+=['-i',f'band_{i:02d}.png']; fc+=f"[{prev}][{idx}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[o{i}];"; prev=f'o{i}'; idx+=1
h0,h1=P['hook']; ins+=['-loop','1','-t',f'{h1:.3f}','-i','hook.png']
fc+=f"[{idx}:v]format=rgba,fade=t=out:st={h1-0.15:.3f}:d=0.15:alpha=1[hk];[{prev}][hk]overlay=0:0:eof_action=pass[oh];"; prev='oh'; idx+=1
ins+=['-i',S]; mi=idx; idx+=1; vo=[]
for j,(i,t,d) in enumerate(P['vo']):
    ins+=['-i',f'vo/{i}.wav']; ms=int(t*1000); fc+=f'[{idx}:a]aresample=48000,adelay={ms}|{ms}[v{j}];'; vo.append(f'[v{j}]'); idx+=1
E=P['end']
fc+=''.join(vo)+f'amix=inputs={len(vo)}:normalize=0,apad,atrim=0:{E:.3f},highpass=f=80,acompressor=threshold=-20dB:ratio=3,asplit=2[voice][sc];'
fc+=f'[{mi}:a]atrim=0:{E:.3f},volume=0.45,afade=t=out:st={E-1.2:.3f}:d=1.2[mus];[mus][sc]sidechaincompress=threshold=0.03:ratio=5:attack=20:release=250[duck];'
fc+=f'[voice][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a]'
subprocess.run(['ffmpeg','-y','-v','error',*ins,'-filter_complex',fc,'-map',f'[{prev}]','-map','[a]','-t',f'{E:.3f}',
  '-c:v','libx264','-crf','14','-preset','slow','-profile:v','high','-level','4.2','-maxrate','25M','-bufsize','50M','-pix_fmt','yuv420p','-r','30',
  '-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','reel.mp4'],check=True)
