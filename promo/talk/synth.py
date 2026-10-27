# Озвучка рилса от персонажа: у каждого свой тембр (мужской голос edge-tts со сдвигом тона и темпа из script.json cast,
# запасной — локальный Piper),
# затем тайминги всего ролика и громкость голоса по кадрам (по ней открывается рот).
# Вход: script.json. Выход: vo/N.wav, timing.json {starts, cuts, end, fps, env:[[0..1 по кадрам реплики]]}.
import json, os, re, subprocess, sys, time, wave, array, math
s = json.load(open('script.json', encoding='utf8'))
FPS = 15  # кадры персонажа: рот в мультфильмах тоже двигается 12–15 раз в секунду
os.makedirs('vo', exist_ok=True)

def variants(t):
    soft = re.sub(r'\s*[:;—–]\s*', ', ', t)
    plain = re.sub(r'[?!…]+', '.', soft)
    return list(dict.fromkeys([t, soft, plain]))

def edge(i, line):
    """Edge-tts (лучше звучит), но мужской голос там один и временами молчит: несколько попыток с паузами."""
    c = s['cast'][line['who']]; mp3 = f'vo/{i}.mp3'
    for n, text in enumerate([t for t in variants(line['say']) for _ in range(3)], 1):
        if os.path.exists(mp3): os.remove(mp3)
        r = subprocess.run(['edge-tts', '--voice', 'ru-RU-DmitryNeural', f"--pitch={c['pitch']}", f"--rate={c['rate']}", '--text', text,
                            '--write-media', mp3], capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(mp3) and os.path.getsize(mp3) > 0:
            if n > 1: print(f'реплика {i} озвучена с попытки {n}', flush=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '24000', '-ac', '1', f'vo/{i}.wav'], check=True)
            return True
        print(f'реплика {i}, повтор {n}: {(r.stderr.strip().splitlines() or ["?"])[-1]}', flush=True); time.sleep(min(n * 3, 15))
    return False

PIPER = os.path.join(os.path.expanduser('~'), 'piper')
def piper(i, line):
    """Запасной голос: Piper локально (русские мужские dmitri, denis, ruslan), тембр сдвигаем ffmpeg."""
    voice, shift = s['cast'][line['who']]['piper']; m = os.path.join(PIPER, f'ru_RU-{voice}-medium.onnx')
    if not os.path.exists(m):
        os.makedirs(PIPER, exist_ok=True); u = f'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/{voice}/medium/ru_RU-{voice}-medium.onnx'
        for x in ('', '.json'): subprocess.run(['curl', '-sSfL', '--retry', '3', '-o', m + x, u + x], check=True)
    subprocess.run(['piper', '--model', m, '--length_scale', '0.9', '--output_file', f'vo/{i}.raw.wav'],
                   input=line['say'], text=True, check=True, capture_output=True)
    with wave.open(f'vo/{i}.raw.wav') as w: sr = w.getframerate()
    af = f'asetrate={sr}*{shift},aresample=24000,atempo={1 / shift:.4f}' if shift != 1 else 'aresample=24000'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f'vo/{i}.raw.wav', '-af', af, '-ac', '1', f'vo/{i}.wav'], check=True)

def voice_all():
    # Если персонаж не озвучился в edge-tts, все его реплики переозвучиваем Piper, чтобы голос не менялся посреди ролика.
    fallback = {w for w in s['cast'] if os.environ.get('FORCE_PIPER')}
    for i, l in enumerate(s['lines'], 1):
        if l['who'] not in fallback and not edge(i, l):
            print(f"{s['cast'][l['who']]['name']}: edge-tts молчит, переходим на запасной голос", flush=True); fallback.add(l['who'])
    for i, l in enumerate(s['lines'], 1):
        if l['who'] in fallback: piper(i, l)

def envelope(f):
    """Громкость по кадрам 0..1: RMS окнами по 1/FPS с, нормировка по громким слогам, быстро открыть — плавнее закрыть."""
    with wave.open(f) as w:
        sr = w.getframerate(); a = array.array('h', w.readframes(w.getnframes()))
    step = sr // FPS; rms = []
    for k in range(0, len(a), step):
        x = a[k:k + step]; rms.append(math.sqrt(sum(v * v for v in x) / max(1, len(x))))
    top = sorted(rms)[int(len(rms) * 0.9)] or 1; out = []; prev = 0
    for r in rms:
        v = min(1, max(0, (r / top - 0.12) / 0.88))
        prev = v if v > prev else prev * 0.45 + v * 0.55
        out.append(round(prev, 3))
    return out

if __name__ == '__main__':
    if not os.environ.get('SKIP_TTS'):
        voice_all()
    dur = []
    for i in range(1, len(s['lines']) + 1):
        with wave.open(f'vo/{i}.wav') as w: dur.append(w.getnframes() / w.getframerate())
    # Хук держим чуть дольше; при смене говорящего пауза длиннее, как в живом разговоре.
    t = 0.1; starts = []
    for i, l in enumerate(s['lines']):
        if i and l['who'] != s['lines'][i - 1]['who']: t += 0.18
        starts.append(round(t, 3)); t += dur[i] + 0.12 + (0.25 if i == 0 else 0)
    end = round(t + 0.8, 3)
    cuts = [0] + starts[1:] + [end]
    json.dump({'fps': FPS, 'starts': starts, 'cuts': cuts, 'end': end, 'dur': dur,
               'env': [envelope(f'vo/{i}.wav') for i in range(1, len(s['lines']) + 1)]}, open('timing.json', 'w'))
    print(f'озвучка {end:.1f} с')
