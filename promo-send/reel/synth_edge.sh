#!/usr/bin/env bash
# Нейроголоса Microsoft Edge (edge-tts, без ключа): lines.tsv -> vo/N.wav голосом $VOICE + образцы голосов.
set -euo pipefail
pip install -q -U edge-tts
pip show edge-tts | grep Version || true
edge-tts --list-voices > /tmp/voices.txt 2>&1 || true; grep -i ru-RU /tmp/voices.txt || tail -5 /tmp/voices.txt
edge-tts --voice en-US-AriaNeural --text 'Hello' --write-media /tmp/t.mp3 && echo 'en ok' || echo 'en fail'
edge-tts --voice "$VOICE" --text 'Привет' --write-media /tmp/t.mp3 && echo 'ru plain ok' || echo 'ru plain fail'
say() { edge-tts --voice "$1" --text "$2" --write-media "$3.mp3" && ffmpeg -v error -y -i "$3.mp3" -ar 24000 -ac 1 "$3" && rm "$3.mp3"; }
mkdir -p vo samples
i=0; while IFS=$'\t' read -r text sub; do i=$((i+1)); say "$VOICE" "$text" vo/$i.wav; done < lines.tsv
S="Отжимания, приседания и пресс. Каждый чистый повтор — удар по боссу. Камера телефона сама считает повторы."
for v in ru-RU-DmitryNeural ru-RU-SvetlanaNeural ru-RU-DariyaNeural; do say $v "$S" samples/$v.wav; done
