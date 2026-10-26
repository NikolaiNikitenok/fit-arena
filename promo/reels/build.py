# Сборка рилса: тайминги по озвучке, клипы из footage.mp4 с наездом на склейках, хук-карточка, полоса титров,
# музыка промо под голосом. Вход: script.json, subs.json, vo/N.wav, band_NN.png, hook.png. Выход: reel.mp4.
import json, os, subprocess, wave
D = os.path.dirname(os.path.abspath(__file__))
S = os.environ.get('FOOTAGE', os.path.join(D, 'footage.mp4'))
cat = json.load(open(os.path.join(D, 'catalog.json')))
s = json.load(open('script.json', encoding='utf8')); subs = json.load(open('subs.json', encoding='utf8'))

def wdur(f):
    with wave.open(f) as w: return w.getnframes() / w.getframerate()
dur = [wdur(f'vo/{i}.wav') for i in range(1, len(s['lines']) + 1)]

# Тайминги: хук держим чуть дольше, между репликами короткая пауза; титры делят реплику по длине кусков.
GAP = 0.12; t = 0.1; starts = []; bands = []; k = 0
for i, l in enumerate(s['lines']):
    starts.append(t)
    if i > 0:
        w = [len(x) + 6 for x in l['subs']]; a = t
        for x in w:
            d = dur[i] * x / sum(w); bands.append([k, a, a + d]); a += d; k += 1
    t += dur[i] + GAP + (0.25 if i == 0 else 0)
END = t + 0.8; HOOK = starts[1] - 0.05
for j in range(len(bands) - 1): bands[j][2] = bands[j + 1][1]
bands[-1][2] = END
cuts = [0] + starts[1:] + [END]

fc = ''; n = len(s['lines'])
for i, l in enumerate(s['lines']):
    c = cat[l['clip']]; a, b = c['from'], c['to']; T = cuts[i + 1] - cuts[i]; src = b - a
    if src >= T: f = f'trim={a}:{a + T:.3f},setpts=PTS-STARTPTS'
    else:
        k2 = min(T / src, 1.5)  # замедляем не больше чем в полтора раза, остаток держим последним кадром
        f = f'trim={a}:{b},setpts=(PTS-STARTPTS)*{k2:.4f},fps=30,tpad=stop_mode=clone:stop_duration={T - src * k2 + 0.1:.3f},trim=0:{T:.3f}'
    z = '1+0.12*pow(max(0,1-t/0.35),2)'  # резкий наезд в начале клипа
    f += f",scale=w='2*trunc(540*({z}))':h=-2:eval=frame,crop=1080:1920,setsar=1"
    fc += f'[0:v]{f}[c{i}];'
fc += ''.join(f'[c{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0[v0];'
ins = ['-i', S]; prev = 'v0'; idx = 1
for j, a, b in bands:
    ins += ['-i', f'band_{j:02d}.png']; fc += f"[{prev}][{idx}:v]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})'[o{j}];"; prev = f'o{j}'; idx += 1
ins += ['-loop', '1', '-t', f'{HOOK:.3f}', '-i', 'hook.png']
fc += f'[{idx}:v]format=rgba,fade=t=out:st={HOOK - 0.15:.3f}:d=0.15:alpha=1[hk];[{prev}][hk]overlay=0:0:eof_action=pass[oh];'; prev = 'oh'; idx += 1
# Музыка из библиотеки (music/<id>.m4a), по умолчанию — бодрый бит.
music = os.path.join(D, 'music', f"{s.get('music', 'energy')}.m4a")
if not os.path.exists(music): music = os.path.join(D, 'music', 'energy.m4a')
ins += ['-stream_loop', '-1', '-i', music]; mi = idx; idx += 1; vo = []
for i in range(n):
    ms = int(starts[i] * 1000); ins += ['-i', f'vo/{i + 1}.wav']
    fc += f'[{idx}:a]aresample=48000,adelay={ms}|{ms}[v{i}];'; vo.append(f'[v{i}]'); idx += 1
fc += ''.join(vo) + f'amix=inputs={n}:normalize=0,apad,atrim=0:{END:.3f},highpass=f=80,acompressor=threshold=-20dB:ratio=3,asplit=3[voice][sc][vonly];'
fc += f'[{mi}:a]atrim=0:{END:.3f},volume=0.45,afade=t=out:st={END - 1.2:.3f}:d=1.2[mus];[mus][sc]sidechaincompress=threshold=0.03:ratio=5:attack=20:release=250[duck];'
fc += '[voice][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a];[vonly]loudnorm=I=-14:TP=-1.5,aresample=48000[av]'
subprocess.run(['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', fc, '-map', f'[{prev}]', '-map', '[a]', '-t', f'{END:.3f}',
                '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-profile:v', 'high', '-level', '4.2', '-maxrate', '25M', '-bufsize', '50M',
                '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', 'reel.mp4',
                '-map', '[av]', '-c:a', 'pcm_s16le', 'voice.wav'], check=True)
# Вторая версия: тот же видеоряд, только голос — под трендовый трек из библиотеки Instagram.
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'reel.mp4', '-i', 'voice.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', 'reel-voice.mp4'], check=True)
print(f'reel.mp4 {END:.1f} с, музыка {os.path.basename(music)}')
