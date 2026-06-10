# 자산 기록 기반 연금 시뮬레이터 배포

이 폴더는 정적 HTML과 서버리스 가격 API를 함께 포함합니다.

## 권장 배포

Vercel에 이 폴더를 그대로 배포하면 됩니다.

- `/` -> `pension-simulator.html`
- `/api/search` -> 종목명 검색
- `/api/close` -> 종가 조회
- `/api/gold` -> 금 1g 가격 조회
- `/api/health` -> API 상태 확인

배포 후에는 PC에서 `cmd` 파일을 켤 필요 없이 웹사이트에서 바로 종가 업데이트를 사용할 수 있습니다.

## 로컬 사용

로컬 파일로 쓸 때는 `open_pension_tool.cmd`를 실행하면 가격 프록시와 HTML이 함께 열립니다.

## 지원 종목명 예시

- `SK하이닉스` -> `000660.KS`
- `TIGER 미국S&P500` -> `360750.KS`
- `SOL 미국S&P500미국채혼합50` -> `0080X0.KS`
