# Монтаж рилса от персонажа. vlog: размытая игра фоном + персонаж крупно; corner: игра чётко + персонаж в углу.
# Сверху титры (на первой реплике — хук), имя говорящего при его первом появлении, музыка под голосом.
# Вход: script.json, timing.json, vo/N.wav, frames/N/*.png, band_NN.png, subs.json, hook.png, name_*.png, glow.png.
# Выход: reel.mp4 и reel-voice.mp4 (только голос).
import json, os, subprocess
D = os.path.dirname(os.path.abspath(__file__)); R = os.path.join(D, '..', 'reels')
S = os.environ.get('FOOTAGE', os.path.join(R, 'footage.mp4'))
cat = json.load(open(os.path.join(R, 'catalog.json')))
s = json.load(open('script.json', encoding='utf8')); tm = json.load(open('timing.json')); subs = json.load(open('subs.json', encoding='utf8'))
L = s['lines']; n = len(L); cuts = tm['cuts']; starts = tm['starts']; END = tm['end']; FPS = tm['fps']
CW, CH = 600, 760; CX, CY = 1080 - CW + 30, 1920 - CH - 40  # угол: справа снизу, чуть за край

def clip(i, T):
    """Клип каталога длиной T: обрезка или замедление до полутора раз с удержанием последнего кадра."""
    c = cat[L[i]['clip']]; a, b = c['from'], c['to']; src = b - a
    if src >= T: return f'trim={a}:{a + T:.3f},setpts=PTS-STARTPTS'
    k = min(T / src, 1.5)
    return f'trim={a}:{b},setpts=(PTS-STARTPTS)*{k:.4f},fps=30,tpad=stop_mode=clone:stop_duration={T - src * k + 0.1:.3f},trim=0:{T:.3f}'

ins = ['-i', S]; fc = ''; idx = 1
ins += ['-i', 'glow.png']; glow = idx; idx += 1
for i, l in enumerate(L):
    T = cuts[i + 1] - cuts[i]
    ins += ['-framerate', str(FPS), '-i', f'frames/{i}/%04d.png']; fr = idx; idx += 1
    if l['layout'] == 'vlog':
        # Игра за спиной: увеличена, размыта и притемнена, как задний план на фронталке.
        fc += f'[0:v]{clip(i, T)},scale=1296:-2,crop=1080:1920,boxblur=22:2,eq=brightness=-0.10:saturation=1.15,setsar=1[b{i}];'
        fc += f'[b{i}][{fr}:v]overlay=0:0:eof_action=repeat,fps=30[c{i}];'
    else:
        z = '1+0.10*pow(max(0,1-t/0.35),2)'  # наезд в начале клипа, как в обычных рилсах
        fc += f"[0:v]{clip(i, T)},scale=w='2*trunc(540*({z}))':h=-2:eval=frame,crop=1080:1920,setsar=1[b{i}];"
        # На финальном экране персонаж меньше, чтобы не закрывать кнопку бота.
        sc = 0.62 if l['clip'] == 'cta' else 1; w, h = int(CW * sc) // 2 * 2, int(CH * sc) // 2 * 2; x, y = 1080 - w + 20, 1920 - h + 20
        fc += f'[{glow}:v]loop=-1:1,trim=0:{T:.3f},setpts=PTS-STARTPTS,scale={w}:{h}[g{i}];[{fr}:v]scale={w}:{h}[f{i}];'
        fc += f'[b{i}][g{i}]overlay={x}:{y}:shortest=1[bg{i}];[bg{i}][f{i}]overlay={x}:{y}:eof_action=repeat,fps=30[c{i}];'
fc += ''.join(f'[c{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0[v0];'
prev = 'v0'

def over(png, x, y, a, b, fade=True):
    global prev, idx, ins, fc
    ins += ['-loop', '1', '-t', f'{b:.3f}', '-i', png]
    f = f'format=rgba,fade=t=in:st={a:.3f}:d=0.15:alpha=1' if fade else 'format=rgba'
    fc += f"[{idx}:v]{f}[p{idx}];[{prev}][p{idx}]overlay={x}:{y}:enable='between(t,{a:.3f},{b:.3f})'[o{idx}];"
    prev = f'o{idx}'; idx += 1

# Титры: каждая реплика делится на куски пропорционально длине.
k = 0
for i, l in enumerate(L):
    if i == 0: continue
    w = [len(x) + 6 for x in l['subs']]; a = starts[i]; d0 = tm['dur'][i]
    for j, x in enumerate(w):
        b = a + d0 * x / sum(w)
        if j == len(w) - 1: b = cuts[i + 1]
        over(f'band_{k:02d}.png', 0, 0, a, b, fade=False); a = b; k += 1
over('hook.png', 0, 0, 0, cuts[1], fade=False)
# Имя — при первом появлении каждого персонажа; во влоге внизу, в углу — над персонажем.
seen = set()
for i, l in enumerate(L):
    if l['who'] in seen: continue
    seen.add(l['who']); a = starts[i]
    over(f"name_{l['who']}.png", 40 if l['layout'] == 'vlog' else 330, 1560 if l['layout'] == 'vlog' else CY - 130, a, min(a + 2.6, cuts[i + 1]))

music = os.path.join(R, 'music', f"{s.get('music', 'energy')}.m4a")
if not os.path.exists(music): music = os.path.join(R, 'music', 'energy.m4a')
ins += ['-stream_loop', '-1', '-i', music]; mi = idx; idx += 1; vo = []
for i in range(n):
    ms = int(starts[i] * 1000); ins += ['-i', f'vo/{i + 1}.wav']
    fc += f'[{idx}:a]aresample=48000,adelay={ms}|{ms}[v{i}];'; vo.append(f'[v{i}]'); idx += 1
fc += ''.join(vo) + f'amix=inputs={n}:normalize=0,apad,atrim=0:{END:.3f},highpass=f=70,acompressor=threshold=-20dB:ratio=3,asplit=3[voice][sc][vonly];'
fc += f'[{mi}:a]atrim=0:{END:.3f},volume=0.4,afade=t=out:st={END - 1.2:.3f}:d=1.2[mus];[mus][sc]sidechaincompress=threshold=0.03:ratio=5:attack=20:release=250[duck];'
fc += '[voice][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a];[vonly]loudnorm=I=-14:TP=-1.5,aresample=48000[av]'
subprocess.run(['ffmpeg', '-y', '-v', 'error', *ins, '-filter_complex', fc, '-map', f'[{prev}]', '-map', '[a]', '-t', f'{END:.3f}',
                '-c:v', 'libx264', '-crf', '15', '-preset', os.environ.get('PRESET', 'slow'), '-profile:v', 'high', '-level', '4.2',
                '-maxrate', '25M', '-bufsize', '50M', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
                '-movflags', '+faststart', 'reel.mp4', '-map', '[av]', '-c:a', 'pcm_s16le', 'voice.wav'], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'reel.mp4', '-i', 'voice.wav', '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', 'reel-voice.mp4'], check=True)
print(f'reel.mp4 {END:.1f} с, музыка {os.path.basename(music)}')
