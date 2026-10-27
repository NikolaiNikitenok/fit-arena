# Озвучка рилса от персонажа: у каждого свой тембр (мужской голос edge-tts со сдвигом тона и темпа из script.json cast),
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

def say(i, line):
    c = s['cast'][line['who']]; mp3 = f'vo/{i}.mp3'
    # Мужской голос в edge-tts один; если он упорно молчит, последний шанс — тот же текст без сдвига тона.
    tries = [(t, c['pitch'], c['rate']) for t in variants(line['say'])] + [(variants(line['say'])[-1], '+0Hz', '+10%')]
    for n, (text, pitch, rate) in enumerate([x for x in tries for _ in range(2)], 1):
        if os.path.exists(mp3): os.remove(mp3)
        r = subprocess.run(['edge-tts', '--voice', 'ru-RU-DmitryNeural', f'--pitch={pitch}', f'--rate={rate}', '--text', text,
                            '--write-media', mp3], capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(mp3) and os.path.getsize(mp3) > 0:
            if n > 1: print(f'реплика {i} озвучена с попытки {n}: «{text}»', flush=True)
            break
        print(f'повтор {n}: {text} — {(r.stderr.strip().splitlines() or ["?"])[-1]}', flush=True); time.sleep(min(n, 4) * 2)
    else: sys.exit(f'не озвучилось: {line["say"]}')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '24000', '-ac', '1', f'vo/{i}.wav'], check=True)

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
        for i, l in enumerate(s['lines'], 1): say(i, l)
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
