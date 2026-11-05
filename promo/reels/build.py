# Сборка рилса. Хук звучит с первого кадра поверх самого яркого клипа, крупный текст хука «выпрыгивает»;
# дальше склейки по 1–2 клипа на реплику в бит музыки, с наездом и медленным зумом, рывок с размытием и «вжух»
# на смене фраз. Сочный цвет и виньетка; на ударах из catalog.json (fx) экран трясётся, на крупных моментах —
# цветной глитч и наклейка («КОМБО ×3», «ПОБЕДА!»). Субтитры по словам с подсветкой текущего слова, финальный
# экран с призывом, без затемнения в конце, чтобы рилс зацикливался.
# Вход: script.json, vo/N.wav, words.json, w_*.png, hook.png, end.png, stickers.json, st_*.png.
# Выход: reel.mp4, reel-voice.mp4 (только голос) и cover.jpg (обложка с хуком).
import array, json, os, re, subprocess, wave
D = os.path.dirname(os.path.abspath(__file__))
S = os.environ.get('FOOTAGE', os.path.join(D, 'footage.mp4'))
cat = json.load(open(os.path.join(D, 'catalog.json')))
s = json.load(open('script.json', encoding='utf8')); words = json.load(open('words.json', encoding='utf8'))
stickers = json.load(open('stickers.json', encoding='utf8')) if os.path.exists('stickers.json') else {}
music = os.path.join(D, 'music', f"{s.get('music', 'energy')}.m4a")
if not os.path.exists(music): music = os.path.join(D, 'music', 'energy.m4a')
bpm = json.load(open(os.path.join(D, 'music', 'tempo.json'))).get(os.path.basename(music)[:-4])
L = s['lines']; n = len(L)

def speech(f):
    """Длительность файла и где в нём начинается и кончается голос (тишину по краям не считаем)."""
    with wave.open(f) as w:
        sr, ch = w.getframerate(), w.getnchannels(); a = array.array('h', w.readframes(w.getnframes()))[::ch]
    hop = sr // 100; e = [max((abs(x) for x in a[k:k + hop]), default=0) for k in range(0, len(a), hop)]
    th = max(e, default=0) * 0.08; on = [k for k, v in enumerate(e) if v > th] or [0, len(e)]
    return len(a) / sr, on[0] / 100, (on[-1] + 1) / 100

sp = [speech(f'vo/{i}.wav') for i in range(1, n + 1)]
GAP = 0.06; t = 0.05; starts = []
for i in range(n):
    starts.append(t); dur, a, b = sp[i]
    t += dur + GAP - max(0, dur - b - 0.08)  # хвост тишины не ждём
END = t + 1.1; HOOK = starts[1]

# Нарезка: реплика делится между её клипами поровну, финальная реплика — на экране cta до конца.
segs = []
for i, l in enumerate(L):
    a = 0 if i == 0 else starts[i]; b = starts[i + 1] if i + 1 < n else END
    ids = l.get('clips') or ['cta']
    for k, cid in enumerate(ids):
        segs.append([cid, a + (b - a) * k / len(ids), a + (b - a) * (k + 1) / len(ids), i])
# Склейки в бит: границу клипов сдвигаем на ближайшую долю такта (до 0,25 с), если клипы не станут короче 0,5 с.
if bpm:
    beat = 60 / bpm
    for j in range(1, len(segs)):
        t0 = segs[j][1]; nb = round(t0 / beat) * beat
        if abs(nb - t0) <= 0.25 and nb - segs[j - 1][1] >= 0.5 and segs[j][2] - nb >= 0.5:
            segs[j - 1][2] = segs[j][1] = nb

# Каждый клип — отдельный вход с перемоткой (-ss): декодируем только нужный кусок, без буфера на весь ролик.
# Если клип длиннее склейки, берём кусок вокруг его главного момента (первое крупное событие fx).
fc = ''; ins = []; events = []  # события в времени ролика: (t, вид, текст)
for j, (cid, a, b, i) in enumerate(segs):
    c = cat[cid]; T = b - a; src = c['to'] - c['from']; fxs = c.get('fx', []); off = 0
    big = [e[0] for e in fxs if e[1] == 'big']
    if src > T and big: off = max(0, min(src - T, big[0] - 0.35 * T))
    ins += ['-ss', f"{c['from'] + off:.3f}", '-t', f'{src - off:.3f}', '-i', S]
    f = 'setpts=PTS-STARTPTS'; k = 1
    if src - off < T:  # короткий клип: чуть замедляем, остаток держим последним кадром
        k = min(T / (src - off), 1.3); f += f',setpts=PTS*{k:.4f},fps=30,tpad=stop_mode=clone:stop_duration={T - (src - off) * k + 0.1:.3f}'
    f += f',trim=0:{T:.3f},setpts=PTS-STARTPTS'
    for e in fxs:
        r = (e[0] - off) * k
        if 0 <= r < T - 0.1: events.append((a + r, e[1], e[2] if len(e) > 2 else None, b))
    if 'zoom' in c:  # мелкий план: увеличиваем вокруг точки действия
        z, zx, zy = c['zoom']; f += f',scale=iw*{z}:-2,crop=1080:1920:{max(0, zx * z - 540):.0f}:{max(0, zy * z - 960):.0f}'
    zin = j % 2 == 0  # медленный зум попеременно внутрь и наружу + резкий наезд в начале склейки
    slow = f'0.07*t/{T:.3f}' if zin else f'0.07*(1-t/{T:.3f})'
    punch = '' if cid == 'cta' else '+0.14*pow(max(0,1-t/0.22),2)'
    f += f",scale=w='2*trunc(540*(1.0+{slow}{punch}))':h=-2:eval=frame,crop=1080:1920,setsar=1,fps=30"
    fc += f'[{j}:v]{f}[c{j}];'
events.sort()
fc += ''.join(f'[c{j}]' for j in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=0[vv0];'
# Сочный цвет: насыщенность, контраст, виньетка. На смене фразы — рывок с размытием и лёгкая вспышка.
g = [f"gblur=sigma=40:sigmaV=0.5:enable='between(t,{starts[i] - 0.05:.3f},{starts[i] + 0.06:.3f})'" for i in range(1, n)]
g += [f"drawbox=c=white@0.28:t=fill:enable='between(t,{starts[i]:.3f},{starts[i] + 0.06:.3f})'" for i in range(1, n)]
# Тряска на ударах (крупные сильнее и дольше) и цветной глитч на крупных.
amp = '+'.join(f"{22 if kind == 'big' else 10}*max(0,1-(t-{t0:.3f})/{0.32 if kind == 'big' else 0.18})*between(t,{t0:.3f},{t0 + 0.32:.3f})" for t0, kind, *_ in events) or '0'
g += [f"crop=1032:1834:x='24+({amp})*sin(t*97)':y='43+({amp})*cos(t*83)',scale=1080:1920"]
g += [f"rgbashift=rh=16:bh=-16:gv=6:enable='between(t,{t0:.3f},{t0 + 0.1:.3f})'" for t0, kind, *_ in events if kind == 'big']
fc += f"[vv0]eq=saturation=1.28:contrast=1.07,vignette=angle=PI/5,format=yuv420p,{','.join(g)}[vv1];"
prev = 'vv1'; idx = len(segs)

def over(png, x, y, a, b):
    global prev, idx, ins, fc
    ins += ['-i', png]; fc += f"[{prev}][{idx}:v]overlay={x}:{y}:enable='between(t,{a:.3f},{b:.3f})'[o{idx}];"; prev = f'o{idx}'; idx += 1

# Субтитры по словам: время слова — по его длине внутри звучащей части реплики.
# Все куски склеиваем в одну прозрачную дорожку (ffconcat) и накладываем один раз — так в разы быстрее.
def weight(w):
    v = len(re.findall(r'[аеёиоуыэюяaeiouy]', w.lower())) + 2 * len(re.findall(r'\d', w))
    return max(1, v) + 0.6
track = []  # (файл, начало, конец); на последней реплике титров нет — там свой финальный экран
for i in range(1, n - 1):
    ws = words[i - 1]
    if not ws: continue
    dur, a, b = sp[i]; a += starts[i]; b += starts[i]
    W = [weight(x['w']) for x in ws]; tot = sum(W); t0 = a
    nxt = starts[i + 1] - 0.02 if i + 1 < n else END
    for k, x in enumerate(ws):
        t1 = t0 + (b - a) * W[k] / tot
        track.append((x['f'], t0, nxt if k == len(ws) - 1 else t1)); t0 = t1
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black@0:s=1080x420,format=rgba', '-frames:v', '1', 'blank.png'], check=True)
with open('caps.txt', 'w') as f:
    f.write('ffconcat version 1.0\n'); t = 0
    for png, a, b in track:
        if a > t + 0.001: f.write(f"file blank.png\nduration {a - t:.3f}\n")
        f.write(f"file {png}\nduration {b - a:.3f}\n"); t = b
    f.write(f"file blank.png\nduration {max(0.1, END - t):.3f}\nfile blank.png\n")
ins += ['-f', 'concat', '-i', 'caps.txt']
fc += f'[{idx}:v]fps=30,format=rgba[cap];[{prev}][cap]overlay=0:1060:eof_action=pass[ocap];'; prev = 'ocap'; idx += 1
# Хук: текст выпрыгивает (масштаб 1.25 → 1 за 0.18 с) и исчезает к первой склейке.
ins += ['-loop', '1', '-t', f'{HOOK:.3f}', '-i', 'hook.png']
fc += (f"[{idx}:v]format=rgba,scale=w='2*trunc(540*(1+0.25*pow(max(0,1-t/0.18),2)))':h=-2:eval=frame,"
       f"fade=t=out:st={HOOK - 0.12:.3f}:d=0.12:alpha=1[hk];[{prev}][hk]overlay=x='(W-w)/2':y='480*(1-h/1920)':eof_action=pass[oh];")
prev = 'oh'; idx += 1
# Наклейки: выпрыгивают с отскоком и гаснут к концу своего клипа (не дольше секунды);
# не во время хука и финала, не внахлёст.
pops = []; last = -9
for t0, kind, txt, segend in events:
    d = min(1.0, segend - t0)
    if kind != 'big' or not txt or txt not in stickers or t0 < HOOK or t0 > starts[-1] - 0.6 or t0 - last < 1.0 or d < 0.45: continue
    ins += ['-loop', '1', '-t', f'{d:.3f}', '-i', stickers[txt]]; last = t0; pops.append(t0)
    fc += (f"[{idx}:v]format=rgba,scale=w='2*trunc(540*(1+0.6*pow(max(0,1-t/0.14),2)))':h=-2:eval=frame,"
           f"fade=t=out:st={d - 0.15:.3f}:d=0.15:alpha=1,setpts=PTS+{t0:.3f}/TB[st{idx}];[{prev}][st{idx}]overlay=x='(W-w)/2':y='760-h/2':eof_action=pass[os{idx}];")
    prev = f'os{idx}'; idx += 1
over('end.png', 0, 560, starts[-1] + 0.15, END)

# Звук: музыка с первой секунды (без раскачки) под голосом, «вжух» на склейках, удар на хуке и финале.
ins += ['-stream_loop', '-1', '-t', f'{END:.3f}', '-i', music]; mi = idx; idx += 1; vo = []
for i in range(n):
    ms = int(starts[i] * 1000); ins += ['-i', f'vo/{i + 1}.wav']
    fc += f'[{idx}:a]aresample=48000,adelay={ms}|{ms}[vo{i}];'; vo.append(f'[vo{i}]'); idx += 1
cuts = [sg[1] for sg in segs[1:]]
# Звуки отдельными файлами: генераторы lavfi прямо в общем графе с asplit/adelay вешают ffmpeg.
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.34:c=pink:r=48000:a=0.7', '-af',
                'bandpass=f=2400:width_type=h:w=3200,afade=t=in:d=0.18:curve=exp,afade=t=out:st=0.18:d=0.16,volume=0.55', '-ac', '2', 'whoosh.wav'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=f=52:d=0.6:r=48000', '-af',
                'volume=2.2,afade=t=out:st=0.03:d=0.55:curve=exp', '-ac', '2', 'boom.wav'], check=True)
fx = []
for k, (f, at) in enumerate([('whoosh.wav', c - 0.16) for c in cuts] + [('boom.wav', 0), ('boom.wav', starts[-1])] + [('boom.wav', t0) for t0 in pops]):
    ms = max(0, int(at * 1000)); ins += ['-i', f]
    fc += f'[{idx}:a]adelay={ms}|{ms}[fx{k}];'; fx.append(f'[fx{k}]'); idx += 1
fc += ''.join(fx) + f'amix=inputs={len(fx)}:normalize=0,apad,atrim=0:{END:.3f}[sfx];'
fc += ''.join(vo) + f'amix=inputs={n}:normalize=0,apad,atrim=0:{END:.3f},highpass=f=80,acompressor=threshold=-20dB:ratio=3,asplit=3[voice][sc][vonly];'
fc += f'[{mi}:a]atrim=0:{END:.3f},volume=0.5[mus];[mus][sc]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=220[duck];'
fc += '[voice][duck][sfx]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5[a];[vonly]loudnorm=I=-14:TP=-1.5,aresample=48000[av]'
# Bound parallelism and execution time on hosted runners. Keep quality at CRF 15
# with a faster encoder preset; emit progress so slow renders can be diagnosed.
subprocess.run(['ffmpeg', '-y', '-v', 'warning', '-stats', '-stats_period', '10', '-filter_complex_threads', '2', *ins, '-filter_complex', fc, '-map', f'[{prev}]', '-map', '[a]', '-t', f'{END:.3f}',
                '-c:v', 'libx264', '-threads', '2', '-crf', '15', '-preset', os.environ.get('PRESET', 'fast'), '-profile:v', 'high', '-level', '4.2', '-maxrate', '25M', '-bufsize', '50M',
                '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', 'reel.mp4',
                '-map', '[av]', '-t', f'{END:.3f}', '-c:a', 'pcm_s16le', 'voice.wav'], check=True, timeout=360)
# Вторая версия: тот же видеоряд, только голос — под трендовый трек из библиотеки Instagram.
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'reel.mp4', '-i', 'voice.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', 'reel-voice.mp4'], check=True)
# Обложка: кадр с хуком, когда текст уже встал на место.
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{min(0.5, HOOK - 0.2):.2f}', '-i', 'reel.mp4', '-frames:v', '1', '-q:v', '2', 'cover.jpg'], check=True)
print(f'reel.mp4 {END:.1f} с, {len(segs)} склеек, {len(events)} ударов, наклейки {len(pops)}, музыка {os.path.basename(music)} {bpm or "?"} BPM')
