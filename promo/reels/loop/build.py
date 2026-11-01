# Сборка рилса-петли 8–10 с. Длина — целое число тактов музыки, склейки в бит.
# Петля: якорный клип делится надвое — вторая половина открывает ролик, первая его закрывает, и последний кадр
# ролика переходит прямо в первый. Текст висит весь ролик, у якоря нет зума и тряски на шве, музыка в конце
# плавно перетекает в своё начало (хвост накладывается на первые 0,4 с), звуков через шов нет.
# Вход: script.json, text.png, stickers.json, st_*.png, user.mp4 (если якорь — свой клип). Выход: reel.mp4, cover.jpg.
import json, os, re, subprocess
D = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(D)
S = os.environ.get('FOOTAGE', os.path.join(R, 'footage.mp4'))
cat = json.load(open(os.path.join(R, 'catalog.json')))
s = json.load(open('script.json', encoding='utf8'))
stickers = json.load(open('stickers.json', encoding='utf8')) if os.path.exists('stickers.json') else {}
music = os.path.join(R, 'music', f"{s.get('music', 'energy')}.m4a")
if not os.path.exists(music): music = os.path.join(R, 'music', 'energy.m4a')
bpm = json.load(open(os.path.join(R, 'music', 'tempo.json'))).get(os.path.basename(music)[:-4]) or 120
beat = 60 / bpm; bar = 4 * beat
bars = max(1, round(9 / bar))
while bars * bar > 10.6 and bars > 1: bars -= 1
while bars * bar < 7.5: bars += 1
END = bars * bar; B = bars * 4
USER = s.get('anchor') == 'user'

def length(f):
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', f], capture_output=True, text=True).stderr
    h, m, sec = re.search(r'Duration: (\d+):(\d+):([\d.]+)', out).groups()
    return int(h) * 3600 + int(m) * 60 + float(sec)

# Якорь: свой клип (пропускаем первые полсекунды — там человек ещё ставит телефон) или яркий клип игры.
if USER: a_src, a_from, a_len, a_fx = 'user.mp4', 0.0, length('user.mp4'), []
else:
    c = cat[s['anchor']]; a_src, a_from, a_len, a_fx = S, c['from'], c['to'] - c['from'], c.get('fx', [])
share = 0.3 if USER else 0.25  # доля каждой половины якоря, в долях ролика
half = round(B * share) * beat
avail = a_len - (0.5 if USER and a_len > 3 else 0)
if 2 * half > avail: half = max(beat, (avail // (2 * beat)) * beat)
d2 = d1 = half
mid = END - d1 - d2; mb = round(mid / beat); m1 = (mb // 2) * beat; m2 = mid - m1
# Окно якоря: вокруг первого крупного удара, иначе с начала (свой клип — с 0,5 с).
W = d1 + d2
big = [e[0] for e in a_fx if e[1] == 'big']
s0 = (min(max(0, big[0] - 0.5 * W), a_len - W) if big and a_len > W else 0) if not USER else min(0.5, max(0, a_len - W))

# Отрезки ролика: (вход, начало в источнике, длина в источнике, начало в ролике, длина в ролике, клип, якорь?)
segs = [(a_src, a_from + s0 + d1, d2, 0.0, d2, s['anchor'], True)]
t = d2
for cid, T in zip(s['middle'], (m1, m2)):
    c = cat[cid]; src = c['to'] - c['from']; off = 0
    bg = [e[0] for e in c.get('fx', []) if e[1] == 'big']
    if src > T and bg: off = max(0, min(src - T, bg[0] - 0.35 * T))
    segs.append((S, c['from'] + off, min(src - off, T * 1.3 + 1), t, T, cid, False)); t += T
segs.append((a_src, a_from + s0, d1, END - d1, d1, s['anchor'], True))

ins = []; fc = ''; events = []
COVER = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1'
for j, (f, a, ln, t0, T, cid, anchor) in enumerate(segs):
    ins += ['-ss', f'{a:.3f}', '-t', f'{ln:.3f}', '-i', f]
    flt = 'setpts=PTS-STARTPTS,fps=30'; k = 1
    if ln < T:  # короткий клип: чуть замедляем, остаток держим последним кадром
        k = min(T / ln, 1.3); flt += f',setpts=PTS*{k:.4f},tpad=stop_mode=clone:stop_duration={T - ln * k + 0.1:.3f}'
    flt += f',trim=0:{T:.3f},setpts=PTS-STARTPTS'
    c = cat.get(cid, {})
    if 'zoom' in c and not USER:
        z, zx, zy = c['zoom']; flt += f',scale=iw*{z}:-2,crop=1080:1920:{max(0, zx * z - 540):.0f}:{max(0, zy * z - 960):.0f}'
    flt += ',' + COVER
    if not anchor:  # середина: медленный зум и резкий наезд на склейке; у якоря кадр неподвижен, чтобы шов совпал
        slow = f'0.07*t/{T:.3f}' if j % 2 else f'0.07*(1-t/{T:.3f})'
        flt += f",scale=w='2*trunc(540*(1.0+{slow}+0.14*pow(max(0,1-t/0.22),2)))':h=-2:eval=frame,crop=1080:1920,setsar=1"
    fc += f'[{j}:v]{flt},fps=30,format=yuv420p[c{j}];'
    src_from = a - (a_from if anchor else cat[cid]['from'])
    for e in ([] if USER and anchor else c.get('fx', [])):
        r = (e[0] - src_from) * k
        if 0 <= r < T - 0.1 and 0.15 < t0 + r < END - 0.4: events.append((t0 + r, e[1], e[2] if len(e) > 2 else None, t0 + T))
events.sort()
cuts = [sg[3] for sg in segs[1:]]
fc += ''.join(f'[c{j}]' for j in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=0[v0];'
amp = '+'.join(f"{22 if kd == 'big' else 10}*max(0,1-(t-{t0:.3f})/{0.32 if kd == 'big' else 0.18})*between(t,{t0:.3f},{t0 + 0.32:.3f})" for t0, kd, *_ in events) or '0'
g = [f"drawbox=c=white@0.22:t=fill:enable='between(t,{c:.3f},{c + 0.05:.3f})'" for c in cuts]
g += [f"crop=1032:1834:x='24+({amp})*sin(t*97)':y='43+({amp})*cos(t*83)',scale=1080:1920"]
g += [f"rgbashift=rh=16:bh=-16:gv=6:enable='between(t,{t0:.3f},{t0 + 0.1:.3f})'" for t0, kd, *_ in events if kd == 'big']
fc += f"[v0]eq=saturation=1.28:contrast=1.07,vignette=angle=PI/5,format=yuv420p,{','.join(g)}[v1];"
idx = len(segs); prev = 'v1'
ins += ['-loop', '1', '-t', f'{END:.3f}', '-i', 'text.png']
fc += f'[{idx}:v]format=rgba[tx];[{prev}][tx]overlay=0:0:eof_action=pass[ot];'; prev = 'ot'; idx += 1
pops = []; last = -9
for t0, kd, txt, segend in events:
    d = min(1.0, segend - t0, END - 0.6 - t0)
    if kd != 'big' or not txt or txt not in stickers or t0 - last < 1.0 or d < 0.45: continue
    ins += ['-loop', '1', '-t', f'{d:.3f}', '-i', stickers[txt]]; last = t0; pops.append(t0)
    fc += (f"[{idx}:v]format=rgba,scale=w='2*trunc(540*(1+0.6*pow(max(0,1-t/0.14),2)))':h=-2:eval=frame,"
           f"fade=t=out:st={d - 0.15:.3f}:d=0.15:alpha=1,setpts=PTS+{t0:.3f}/TB[st{idx}];[{prev}][st{idx}]overlay=x='(W-w)/2':y='900-h/2':eof_action=pass[os{idx}];")
    prev = f'os{idx}'; idx += 1

# Музыка петлёй: хвост после END ложится на начало с плавным переходом, так конец звучит как начало.
X = 0.4
# Голова и хвост — два отдельных входа: asplit с atrim по разным местам одного входа обрывает звук.
ins += ['-t', f'{END:.3f}', '-i', music, '-ss', f'{END:.3f}', '-t', f'{X}', '-i', music]; mi = idx; idx += 2
fc += (f'[{mi}:a]aresample=48000,afade=t=in:d={X}[mh];[{mi + 1}:a]aresample=48000,asetpts=PTS-STARTPTS,afade=t=out:d={X}[mt];'
       f'[mh][mt]amix=inputs=2:normalize=0:duration=first[mus];')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.34:c=pink:r=48000:a=0.7', '-af',
                'bandpass=f=2400:width_type=h:w=3200,afade=t=in:d=0.18:curve=exp,afade=t=out:st=0.18:d=0.16,volume=0.45', '-ac', '2', 'whoosh.wav'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=52:d=0.6:r=48000', '-af',
                'volume=2.0,afade=t=out:st=0.03:d=0.55:curve=exp', '-ac', '2', 'boom.wav'], check=True)
fx = []
for k, (f, at) in enumerate([('whoosh.wav', c - 0.16) for c in cuts] + [('boom.wav', t0) for t0 in pops]):
    ms = max(0, int(at * 1000)); ins += ['-i', f]
    fc += f'[{idx}:a]adelay={ms}|{ms}[fx{k}];'; fx.append(f'[fx{k}]'); idx += 1
fc += ''.join(fx) + f'[mus]amix=inputs={len(fx) + 1}:normalize=0:duration=longest,atrim=0:{END:.3f},volume=1.25,alimiter=limit=0.89[a]'
subprocess.run(['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', fc, '-map', f'[{prev}]', '-map', '[a]', '-t', f'{END:.3f}',
                '-c:v', 'libx264', '-crf', '15', '-preset', os.environ.get('PRESET', 'slow'), '-profile:v', 'high', '-level', '4.2', '-maxrate', '25M', '-bufsize', '50M',
                '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', 'reel.mp4'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', '0.4', '-i', 'reel.mp4', '-frames:v', '1', '-q:v', '2', 'cover.jpg'], check=True)
print(f'reel.mp4 {END:.2f} с ({bars} такта по {bar:.2f} с), якорь {s["anchor"]} {d2:.2f}+{d1:.2f} с, середина {m1:.2f}+{m2:.2f} с, '
      f'ударов {len(events)}, наклеек {len(pops)}, музыка {os.path.basename(music)} {bpm} BPM')
