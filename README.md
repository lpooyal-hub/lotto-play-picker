# Lotto Play Picker

과거 로또 6/45 당첨 번호를 참고해서 매주 재미로 5개 조합을 뽑아보는 취미용 도구입니다.

로또는 무작위 추첨이므로 이 도구는 당첨 확률을 보장하지 않습니다.

## CLI

```bash
python3 lotto_picker.py
```

## Frontend

정적 웹페이지:

```bash
python3 -m http.server 8092 --directory frontend
```

브라우저:

```text
http://localhost:8092
```

브라우저에서 동행복권 API가 CORS로 막히면, 먼저 로컬 히스토리 JSON을 생성합니다.

```bash
python3 export_history.py --history 300
python3 -m http.server 8092 --directory frontend
```

그러면 프론트는 `frontend/lotto_history.json`을 먼저 읽고 번호를 생성합니다.
