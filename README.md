# MOP Calendar 자동 등록 (Calendar Automation)

MOP 일정표(엑셀/메일/PDF의 표)를 붙여넣으면 **Google 캘린더에 일정을 자동으로 등록**해 주는 데스크톱 앱입니다. 매달 반복되는 수작업 일정 입력을 없애기 위해 만들었습니다.

표를 복사해서 붙여넣고 버튼만 누르면, 표에서 **날짜 · Datahall · System/Equipment** 컬럼을 읽어 Google Calendar에 한 건씩 등록합니다.

---

## 주요 기능

- **3단계 워크플로우**: ① Google 로그인 → ② 표 붙여넣기 → ③ 확인 후 등록
- **다양한 입력 형식 지원**
  - 탭 구분 표 (엑셀 · 워드에서 복사 → 붙여넣기)
  - 줄 단위 표 (메일 본문에서 복사)
  - 파일 드래그&드롭: `.csv` · `.txt` · `.tsv`
  - **PDF 표 자동 파싱** (좌표 기반으로 컬럼을 복원)
- **유연한 날짜 인식**: `2026-12-07`, `2026-12-01 ~ 2026-12-30`, `Jun.18 ~ 19`, `Jun.01` 등
- **주말 · 한국 공휴일 자동 제외**: 고정 공휴일 + 음력 공휴일(설날·추석, 2025~2027년) 반영
- **기간 일정의 주 단위 묶음**: 한 달 전체처럼 연속된 기간 작업은 평일을 주 단위 기간 일정으로 깔끔하게 등록
- **캘린더 선택 및 ID 저장**: 여러 캘린더를 선택하고, 캘린더 ID는 로컬에 저장
- **Client ID 로컬 저장**: 매번 입력할 필요 없이 자동 복원
- **등록 진행 로그 / 성공·실패 집계** 표시

---

## 기술 스택

- **Electron** — 데스크톱 셸 (로컬 정적 서버 `localhost:8765`에서 UI 로드)
- **Google Identity Services (GIS)** — OAuth 2.0 토큰 클라이언트 (implicit flow)
- **Google Calendar API v3** — 일정 등록
- **pdf.js** — PDF 표 파싱
- 빌드 없는 순수 HTML/CSS/JS (프레임워크 없음)

---

## 프로젝트 구조

```
.
├── main.js            # Electron 메인 프로세스 (로컬 서버 + 윈도우 생성)
├── index.html         # UI 마크업
├── css/
│   └── styles.css     # 스타일
├── js/
│   ├── holidays.js    # 한국 공휴일 · 날짜 계산 유틸 (순수 함수)
│   ├── state.js       # 전역 공유 상태 + 캘린더 ID 저장소
│   ├── calendar.js    # Client ID/캘린더 ID 관리, Google 인증, 캘린더 등록
│   ├── parse.js       # 표/PDF 파싱, 드래그&드롭, 일정 평탄화
│   ├── ui.js          # 단계(STEP) 네비게이션, 상태 표시, 로그
│   └── app.js         # 시작 부트스트랩
├── icon.png
└── package.json
```

---

## 실행 방법

> Node.js와 npm이 필요합니다.

```bash
# 의존성 설치
npm install

# 개발 실행
npm start

# Windows 실행 파일(.exe) 빌드 → dist/ 에 생성
npm run build-win
```

빌드 후 `dist/MOP-Calendar-win32-x64/MOP Calendar.exe` 를 실행하면 됩니다.

---

## Google OAuth 설정 (최초 1회)

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials** 에서 **OAuth 2.0 Client ID**(웹 애플리케이션) 생성
2. **승인된 JavaScript 출처**에 `http://localhost:8765` 등록
3. **Google Calendar API** 사용 설정
4. 앱이 **테스트 게시 상태**라면 **OAuth 동의 화면 → 테스트 사용자**에 로그인할 구글 계정을 추가
   - ⚠️ 테스트 사용자에 없는 계정은 로그인 시 `access_denied` 오류가 납니다. 인증 실패의 가장 흔한 원인입니다.
5. 앱 첫 화면에 발급받은 **Client ID** 입력 후 로그인

> 🔒 **보안**: OAuth **Client Secret**은 저장소에 포함하지 않습니다(`.gitignore`로 제외). 시크릿은 절대 공개 저장소에 올리지 마세요. 참고로 이 앱은 GIS 토큰 클라이언트(implicit flow)를 사용하므로 클라이언트 시크릿이 필요하지 않습니다.

---

## 동작 규칙

- 인식 컬럼: **Date · Datahall · System/Equipment** (No., Description은 무시)
- 일정은 **종일(all-day) 일정**으로 등록되며 제목은 `[Datahall] 장비명` 형식
- 기간 일정은 주말·공휴일을 제외한 뒤, **연속된 평일끼리 하나의 기간 일정**으로 묶여 등록됩니다
  (예: 한 달 작업 → 첫째 주 월\~금, 둘째 주 월\~금 … 식의 연속 기간)
- 같은 표를 두 번 등록하면 **중복 일정이 생성**됩니다 (현재 중복 방지 기능 없음). 잘못 등록 시 Google 캘린더에서 직접 삭제해야 합니다.

---

## 업데이트 히스토리

### v1.2 — 코드 구조 리팩터링 (2026-06-26)
- 단일 `index.html`에 뭉쳐 있던 CSS/JS를 역할별 모듈로 분리
  (`css/styles.css`, `js/holidays.js · state.js · calendar.js · parse.js · ui.js · app.js`)
- 동작 변경 없음 — 유지보수성 개선 목적
- `.gitignore` 추가(클라이언트 시크릿·node_modules·빌드 산출물 제외), README 작성

### v1.1 — 기간 일정의 주 단위 묶음 등록 (2026-06-26)
- 기존: 1일\~말일 같은 연속 기간 작업이 평일마다 **하루씩 개별 등록**되어 캘린더가 지저분해짐
- 변경: 주말·공휴일로 끊긴 **연속 평일을 하나의 기간 일정으로 묶어** 등록
  (예: 8/1이 일요일이면 8/3\~8/7, 8/10\~8/14 … 식의 주 단위 블록)
- 등록 진행 로그가 기간(시작\~종료)을 함께 표시하도록 개선

### v1.0 — 최초 버전
- 표 붙여넣기 → Google 캘린더 자동 등록 (3단계 워크플로우)
- 탭 구분 / 줄 단위 / CSV·TXT·TSV / **PDF** 표 파싱 지원
- 다양한 날짜 형식 인식, 주말·한국 공휴일(고정+음력) 자동 제외
- 캘린더 선택 및 ID 저장, Client ID 로컬 저장
- 등록 진행률·성공/실패 집계 표시

---

## 라이선스

사내/개인용 도구입니다.
