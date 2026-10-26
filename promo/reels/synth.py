# Озвучка реплик script.json нейроголосом Microsoft (edge-tts, без ключа) -> vo/N.wav. Голос: $VOICE.
import json, os, subprocess, sys, time
s = json.load(open('script.json', encoding='utf8'))
voice = os.environ.get('VOICE', 'ru-RU-SvetlanaNeural')
os.makedirs('vo', exist_ok=True)
for i, l in enumerate(s['lines'], 1):
    mp3 = f'vo/{i}.mp3'
    for n in range(1, 6):  # сервис изредка не отвечает — повторяем
        r = subprocess.run(['edge-tts', '--voice', voice, '--rate=+15%', '--text', l['say'], '--write-media', mp3], capture_output=True)
        if r.returncode == 0 and os.path.getsize(mp3) > 0: break
        print(f'повтор {n}: {l["say"]}'); time.sleep(n * 3)
    else:
        sys.exit(f'не озвучилось: {l["say"]}')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '24000', '-ac', '1', f'vo/{i}.wav'], check=True)
