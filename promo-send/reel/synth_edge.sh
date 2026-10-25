#!/usr/bin/env bash
# Нейроголоса Microsoft Edge (edge-tts, без ключа): lines.tsv -> vo/N.wav голосом $VOICE + образцы голосов.
set -euo pipefail
pip install -q -U edge-tts
t() { edge-tts --voice "$1" --text "$2" --write-media /tmp/t.mp3 >/dev/null 2>&1 && echo "OK  $1: $2" || echo "BAD $1: $2"; }
t ru-RU-DmitryNeural 'Привет'
t ru-RU-DmitryNeural 'Привет, как дела'
t ru-RU-DmitryNeural 'Почему тренировки дома'
t ru-RU-DmitryNeural 'Почему тренировки дома бросают через неделю'
t ru-RU-SvetlanaNeural 'Почему тренировки дома бросают через неделю?'
t en-US-AriaNeural 'Why do people quit home workouts after just one week of training?'
t en-US-AriaNeural 'Hello'
say() {
  for n in 1 2 3 4 5; do edge-tts --voice "$1" --text "$2" --write-media "$3.mp3" 2>/dev/null && break; echo "повтор $n: $2"; sleep $((n*3)); done
  [ -s "$3.mp3" ] || { echo "не вышло: $2"; exit 1; }
  ffmpeg -v error -y -i "$3.mp3" -ar 24000 -ac 1 "$3" && rm "$3.mp3"; }
mkdir -p vo samples
i=0; while IFS=$'\t' read -r text sub; do i=$((i+1)); say "$VOICE" "$text" vo/$i.wav; done < lines.tsv
S="Отжимания, приседания и пресс. Каждый чистый повтор — удар по боссу. Камера телефона сама считает повторы."
for v in ru-RU-DmitryNeural ru-RU-SvetlanaNeural; do say $v "$S" samples/$v.wav; done
