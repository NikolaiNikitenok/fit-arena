#!/usr/bin/env bash
# SaluteSpeech: строки lines.tsv -> vo/N.wav голосом $VOICE, плюс образцы всех голосов.
set -euo pipefail
curl -sSf -o ca.crt https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
TOKEN=$(curl -sSf --cacert ca.crt -X POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth \
  -H "Authorization: Basic $SALUTE_SPEECH_KEY" -H "RqUID: $(cat /proc/sys/kernel/random/uuid)" \
  -H 'Content-Type: application/x-www-form-urlencoded' -d "scope=${SALUTE_SCOPE:-SALUTE_SPEECH_PERS}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).access_token))')
say() { curl -sSf --cacert ca.crt -X POST "https://smartspeech.sber.ru/rest/v1/text:synthesize?format=wav16&voice=$1" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/text' --data-binary "$2" -o "$3"; }
mkdir -p vo samples
i=0; while IFS=$'\t' read -r text sub; do i=$((i+1)); say "$VOICE" "$text" vo/$i.wav; done < lines.tsv
S="Отжимания, приседания и пресс. Каждый чистый повтор — удар по боссу. Камера телефона сама считает повторы."
for v in Bys_24000 Tur_24000 Pon_24000 Nec_24000 May_24000 Ost_24000; do say $v "$S" samples/$v.wav; done
