# QA Workspace

택소노미를 기준으로 이벤트와 어트리뷰트 로그를 검증하고, 발견한 이슈를 다음 검증까지 추적하는 협업 도구입니다.

QA 담당자는 앱에서 실행한 이벤트를 체크하고 Event User Log CSV와 어트리뷰트 스냅샷을 모은 뒤, 규칙·AI 분석 결과를 검토합니다. 기획자와 개발자는 같은 결과에서 댓글을 나누고 수정 상태를 관리할 수 있습니다.

## 문서

- [사용자 가이드](docs/USER_GUIDE.md): QA 담당자, 기획자, 개발자가 화면에서 수행할 작업을 설명합니다.
- [서비스 구조 설명](docs/ARCHITECTURE.md): 개발·운영자를 위한 시스템 구성, 데이터 흐름, 보안 경계를 설명합니다.

가장 짧은 사용 흐름은 다음과 같습니다.

```text
택소노미 준비 → QA 환경·채널 설정 → 라운드와 검증 실행 생성
→ 앱에서 이벤트 실행하며 체크 → 필요한 어트리뷰트 스냅샷 촬영
→ Event User Log CSV 업로드 → 분석 → 결과 확인 → 이슈 등록·처리
```

## 로컬 실행

Node.js와 npm이 필요합니다.

```sh
npm install
npm run dev
```

`.env`에는 사용하는 Supabase 프로젝트의 값을 설정합니다. 비밀 값은 저장소에 커밋하지 마세요.

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI 분석을 사용할 때 필요
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
```

클라이언트 번들에는 `VITE_SUPABASE_*` 값만 사용합니다. `SUPABASE_SERVICE_ROLE_KEY`와 `OPENAI_API_KEY`는 반드시 서버 환경에만 둡니다.

## 확인 명령

```sh
npm test
npm run build
npm run lint
```

## 주요 기술

- TanStack Start와 TanStack Router
- React, TypeScript, Tailwind CSS
- Supabase Auth와 Postgres/RLS
- OpenAI Responses API 기반 의미 검증
