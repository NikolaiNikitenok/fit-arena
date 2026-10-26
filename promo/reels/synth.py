# Озвучка реплик script.json нейроголосом Microsoft (edge-tts, без ключа) -> vo/N.wav. Голос: $VOICE.
# Сервис иногда упорно не озвучивает конкретную фразу (двоеточие, вопрос в конце), поэтому при неудаче
# пробуем упрощённую пунктуацию, а затем запасной голос.
import json, os, re, subprocess, sys, time
s = json.load(open('script.json', encoding='utf8'))
voice = os.environ.get('VOICE', 'ru-RU-SvetlanaNeural')
spare = 'ru-RU-DmitryNeural' if voice != 'ru-RU-DmitryNeural' else 'ru-RU-SvetlanaNeural'
os.makedirs('vo', exist_ok=True)

def variants(t):
    soft = re.sub(r'\s*[:;—–]\s*', ', ', t)  # двоеточия и тире — в запятые
    plain = re.sub(r'[?!…]+', '.', soft)      # вопрос/восклицание — в точку
    out = []
    for v in (voice, spare):
        for x in (t, soft, plain):
            if (v, x) not in out: out.append((v, x))
    return out

for i, l in enumerate(s['lines'], 1):
    mp3 = f'vo/{i}.mp3'; ok = False
    for n, (v, text) in enumerate([p for p in variants(l['say']) for _ in range(2)], 1):
        if os.path.exists(mp3): os.remove(mp3)
        r = subprocess.run(['edge-tts', '--voice', v, '--rate=+15%', '--text', text, '--write-media', mp3], capture_output=True, text=True)
        if r.returncode == 0 and os.path.exists(mp3) and os.path.getsize(mp3) > 0:
            ok = True
            if n > 1: print(f'реплика {i} озвучена с попытки {n}: {v} «{text}»', flush=True)
            break
        err = (r.stderr.strip().splitlines() or ['?'])[-1]
        print(f'повтор {n} ({v}): {text} — {err}', flush=True); time.sleep(min(n, 4) * 2)
    if not ok: sys.exit(f'не озвучилось: {l["say"]}')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '24000', '-ac', '1', f'vo/{i}.wav'], check=True)
