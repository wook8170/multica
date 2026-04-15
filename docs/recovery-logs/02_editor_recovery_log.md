# [기록] 위키 및 에디터 소스 정밀 복구 내역

**일시:** 2026-04-14
**작업 내용:** 특정 폴더 강제 복구 (Selective Restore)
**상태:** UI 계층 복구 완료 / API 계층 검토 중

---

## 1. 복구 대상 (Restored Paths)
다음 폴더들을 `backup/stable-wiki` 브랜치로부터 강제로 가져와 현재 `main` 브랜치에 덮어씀:
- `apps/web/features/wiki/`: 위키 전용 로직 및 UI 컴포넌트
- `packages/views/editor/`: 공통 에디터, 확장 기능, 테이블 관리 로직 및 CSS

## 2. 복구 결과 (Results)
- **에디터 스타일:** 공식 소스와의 충돌로 인해 깨졌던 CSS가 사용자 커스텀 버전으로 복구됨.
- **테이블 기능:** `upstream` 병합 시 유실되었던 테이블 우클릭 메뉴 및 추가/삭제 버튼 로직 복구됨.
- **협업 기능:** Yjs 기반의 협업 커서 및 상태 보존 로직이 사용자 의도대로 원복됨.

## 3. 남은 과제 및 조치 완료 내역
- **API 클라이언트 복구 검토:** 타입 체크 결과 정상으로 판단되어 추가 복구 보류.
- **에이전트 지원 복구 (완료):**
    - `provider-logo.tsx`: Gemini 로고 아이콘 추가 (OpenCode/OpenClaw는 기존 유지 확인).
    - `settings-tab.tsx`: Gemini(`GOOGLE_API_KEY`) 및 OpenCode(`OPENCODE_API_KEY`) 환경 변수 안내 문구 추가.
- **최종 검증:** 복구된 UI와 공식 소스의 신규 서버 기능(Gemini, OpenCode 등) 간의 상호작용 테스트 완료.
