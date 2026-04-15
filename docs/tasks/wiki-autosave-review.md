# 위키 자동저장·동시편집·히스토리 종합 검토 보고서

**작성일**: 2026-04-15
**작성 의도**: 위키 모듈의 자동저장/드래프트 복구 기능을 동시편집(Hocuspocus/CRDT) 및 버전 히스토리(wiki_versions)와 함께 면밀히 검토. 다른 에이전트가 단독으로 분석·수정 작업을 이어받을 수 있도록 범위·재현·파일 경로를 명시적으로 기록한다.
**검토 범위**: `apps/web/features/wiki/components/WikiView.tsx`, `apps/web/features/wiki/components/WikiEditor.tsx`, `packages/views/editor/content-editor.tsx`, `packages/core/api/client.ts`, `server/internal/handler/wiki.go`, `server/internal/handler/wiki_snapshot.go`, `server/internal/handler/wiki_history_policy.go`, `apps/collaboration/server.js`, 관련 마이그레이션.

> 본 문서는 **검토 결과/설계 리뷰** 문서다. 작업 지시서는 `docs/tasks/wiki-autosave-fix.md`에 이미 존재하며, 본 문서는 그 지시서가 다루지 않은 **추가 발견**과 **기존 항목의 정확성 검증** 결과를 포함한다.

---

## 1. Executive Summary

- **치명 결함(P0)**: 주기적 자동저장이 구현되지 않아 브라우저 크래시/OS 강제 종료 시 미저장 편집 내용이 전손된다. `pagehide` 이벤트와 위키 선택 변경 시 `flushDraftOnLeave`가 호출될 뿐이며, `WikiSnapshotScheduler`(서버)도 현재 **호출 경로가 존재하지 않아 dead code** 상태다.
- **복구·동시편집 교차 결함(P1)**: 드래프트 복구(`handleDraftRestore`)는 `coEditorCount`를 검사하지 않고 Hocuspocus CRDT를 덮어쓰는 Markdown 재주입을 수행한다. Yjs 서버 상태 및 다른 편집자의 로컬 변경분이 유실될 수 있다.
- **데이터 무결성 결함(P1)**: 드래프트 UPSERT 시 `binary_state`가 빈 문자열이면 기존 열을 `NULL`로 덮어쓴다. 에디터 준비 이전 `flushDraftOnLeave`가 실행되거나 멀티탭 상황에서 기존 Yjs 스냅샷이 파괴된다.
- **UX 결함(P1)**: `hasConflict`가 다이얼로그 렌더 시점에만 계산되며, 409 자동 force 재시도(`coEditorCount > 0`) 경로는 단일 사용자의 다중 탭 상황에서 의도치 않게 다른 편집자의 변경을 덮어쓸 수 있다.
- **설계 미완성(P1)**: Hocuspocus 웹훅(`apps/collaboration/server.js`)의 `transformer`가 content를 의도적으로 누락시키고, 서버 `CollaborationWebhook`은 "ignored"만 반환한다. 주석은 "Client-side autosave (10s debounce) handles DB persistence"라고 하지만 클라이언트에 10초 debounce 자동저장이 없다. **세 경로(클라 자동저장, 서버 스냅샷 스케줄러, Hocuspocus 웹훅) 중 어떤 것도 활성화되지 않은 상태**.
- **저위험 결함(P2-P3)**: `keepalive` fetch 완료 미보장, `sendBeacon` 폴백 부재, debounce(300ms) 잔여 입력 flush 누락, `draftPromptedRef` 비영속(같은 draft에 대해 새로고침마다 프롬프트), 새 문서(`selectedId === "new"`)는 드래프트 저장 없음.

---

## 2. 시스템 아키텍처 맵

### 2.1 데이터 영속화 경로 (3 레이어)

```
┌──────────────────────────────────────────────────────────────┐
│ ① wikis 테이블                                                │
│   - 정식 저장(Save 버튼/restore)만 반영                         │
│   - optimistic lock: version 컬럼 (WHERE version = $base)     │
│   - 저장 성공 시: 본인 wiki_drafts 행 삭제(타 사용자 drafts 유지) │
│   - 갱신 시 version += 1                                      │
├──────────────────────────────────────────────────────────────┤
│ ② wiki_versions 테이블 (히스토리)                              │
│   - UpdateWiki 트랜잭션 내에서 INSERT                          │
│   - WikiSnapshotScheduler는 존재하나 호출 지점 없음 (dead code) │
│   - binary_state(최근 10) + 최근 20 전체 + >30일 일 1개 유지     │
├──────────────────────────────────────────────────────────────┤
│ ③ wiki_drafts 테이블 (자동저장)                                │
│   - UNIQUE(workspace_id, wiki_id, user_id) → 사용자당 1행       │
│   - FK: wikis(id) ON DELETE CASCADE                            │
│   - PUT /api/wikis/{id}/draft (UPSERT)                         │
│   - PagehIde + selectedId 변경 시에만 클라이언트가 호출         │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 실시간 채널 (2개)

| 채널 | 포트/엔드포인트 | 용도 | 코드 위치 |
|------|----------------|------|----------|
| Hocuspocus WebSocket | `ws://localhost:8081` (NEXT_PUBLIC_COLLAB_URL) | Yjs CRDT 동기화 (문서 본문·awareness) | `apps/collaboration/server.js`, `WikiView.tsx:283-293` |
| 앱 WebSocket (`/ws`) | 백엔드 기본 포트 | 댓글·알림 등 이벤트 | `packages/core/realtime/use-realtime-sync.ts` |

**중요**: 위키 본문은 오직 Hocuspocus 채널로만 실시간 동기화된다. `wiki.updated` 이벤트는 `UpdateWiki` 후 `h.Hub.BroadcastToWorkspace` 로 발행되지만(`wiki.go:284-294`), 클라이언트는 이 이벤트를 Yjs 상태와 병합하지 않는다.

### 2.3 Yjs 이중 저장 구조

```
Y.Doc(클라 메모리) → encodeStateAsUpdate → Base64 → binary_state (draft/version)
                 ↓ editor.getMarkdown()
                 → content (Markdown) → wikis.content / wiki_drafts.content / wiki_versions.content
```

- `draft.binary_state`는 **저장은 되지만 복구 시 현재 무시**된다 (`handleDraftRestore`에서 `setCurrentContent(draft.content)`만 사용).
- Markdown이 사실상 "정본(source of truth)" 역할을 한다.

---

## 3. 자동저장 트리거 인벤토리 (현재 구현 상태)

| 트리거 | 위치 | 저장 대상 | 비고 |
|--------|------|----------|------|
| `window.addEventListener('pagehide')` | `WikiView.tsx:607-617` | `wiki_drafts` | `keepalive: true`, silent |
| 컴포넌트 cleanup(언마운트/레이아웃 해제) | `WikiView.tsx:615` | `wiki_drafts` | 동일 |
| `handleSelect`(위키 선택 변경) | `WikiView.tsx:620` | `wiki_drafts` | 즉시, non-keepalive |
| `handleCreateNew`·`doCreateNew`(새 문서) | `WikiView.tsx:669` | `wiki_drafts` | 즉시 |
| `handleSave`(명시적 저장) | `WikiView.tsx:719` | `wikis` + `wiki_versions` | 성공 시 본인 draft 삭제 |
| `handleConflictForce`(충돌 force save) | `WikiView.tsx:833` | `wikis` + `wiki_versions` | `base_version` 생략 |
| 409 + coEditorCount>0 자동 force 재시도 | `WikiView.tsx:484-488` | `wikis` + `wiki_versions` | **사용자 개입 없음** |
| ~~주기적 자동저장(예: setInterval)~~ | **미구현** | — | P0 결함 |
| ~~Hocuspocus webhook → server snapshot scheduler~~ | **dead code** | — | `WikiSnapshots.Schedule(` 호출 지점 0 |

### 3.1 `WikiSnapshotScheduler` dead code 확인

- `server/internal/handler/handler.go:67`에서 인스턴스는 생성.
- `WikiSnapshots.Schedule(` 문자열 호출은 전체 레포에서 **0건** (`rg -n "WikiSnapshots\.Schedule"` 결과 없음).
- `wiki_snapshot.go:46 Schedule()`, `:64 Shutdown()`은 정의만 존재.
- `CollaborationWebhook`(`wiki.go:683-712`)은 `req.Content`가 서버에 도달하지 않는 경로다(아래 3.2 참조).

### 3.2 Hocuspocus 웹훅의 content 누락

`apps/collaboration/server.js:33-43`:

```javascript
transformer: (data) => {
  // NOTE: Proper markdown extraction from the Yjs document requires
  // @hocuspocus/transformer + TipTap extensions server-side, which are
  // not yet installed. For now, content is intentionally omitted — the
  // Go handler skips the UPDATE when content is empty, so no data loss
  // occurs. Client-side autosave (10s debounce) handles DB persistence.
  return { documentName: data.documentName, userId: data.context?.user?.id ?? "" };
},
```

→ 서버는 사용자의 편집 내용을 Hocuspocus로부터 알 방법이 없다. 주석에서 언급한 "Client-side autosave (10s debounce)"는 아직 **어느 코드에도 존재하지 않는다**.

---

## 4. 히스토리 생성 경로

### 4.1 수동 저장 경로 (현재 유일하게 동작)

`UpdateWiki`(`wiki.go:166-304`) 트랜잭션:

1. `wikis` 레코드 업데이트 (`version += 1`).
2. `base_version` 전달 시 WHERE 조건으로 낙관 잠금 → 0행 시 409 반환 + rollback.
3. 새 `version_number` 계산 (`MAX(version_number) + 1` — 전용 히스토리 카운터).
4. `wiki_versions`에 `INSERT` (title, content, binary_state, created_by).
5. `compactWikiHistory` 실행: 최근 20개 보존, 30일 후 일 1개, binary_state는 최근 10개에만.
6. `#hashtag` 파싱·동기화 (`wiki_tags`).
7. 커밋.
8. `wiki.updated` 이벤트 broadcast (앱 WS).
9. **자신의 `wiki_drafts` 삭제** (커밋 후 별도 쿼리; 실패 시 에러 처리 없음).

### 4.2 자동 스냅샷 (설계됐으나 미활성)

`WikiSnapshotScheduler`는 30초 debounce로 `wiki_versions` insert를 예약하는 구조지만, 앞서 3.1에서 확인한 대로 호출되지 않는다. 스케줄러의 `Shutdown()`도 호출되지 않아 서버 graceful shutdown 시 대기 중인 스냅샷은 그대로 소실된다.

### 4.3 히스토리 보관 정책

`wiki_history_policy.go:9-14`:

- `wikiHistoryRecentKeep = 20`
- `wikiHistoryBinaryKeep = 10`
- `wikiHistoryCompactAfter = 30 * 24h`
- `wikiHistoryDailyKeepCount = 1`

→ 30일 이상 된 버전은 하루에 한 개만 남고 나머지는 삭제. 30일 내 수백 번 저장해도 **최근 20개만 full** 유지되며 binary_state는 최근 10개에만 남음. 복구 시 Markdown은 유지되지만 CRDT 상태는 일부 버전에서만 복원 가능.

---

## 5. 동시편집 동기화 경로

### 5.1 클라이언트 초기화

`WikiView.tsx:258-338`:

1. 선택 변경 시 기존 provider/ydoc `destroy()` 후 상태 초기화.
2. `new Y.Doc()` + `new HocuspocusProvider({ name: 'wiki-${id}', token, parameters })`.
3. `on('sync', ...)` → `collabConnected = true`.
4. `awareness.on('change', ...)` + 500ms debounce → `coEditorCount` 업데이트.
5. **`user`가 `useEffect` deps에 포함**되어 있음: `user` 객체가 재생성되면 provider 재초기화. `collabUser`는 `useMemo`로 안정화했지만 `user` 그 자체(authStore 반환값)는 별도 컴포넌트 리렌더링 시 새 참조일 수 있으니 주의.

### 5.2 ContentEditor 시딩

`content-editor.tsx:745-780`:

1. 즉시 `seed()` 호출 — 서버 연결 전이라도 빈 문서 방지.
2. `fragment.length === 0 || editor.isEmpty || forceDefaultRef.current` 이면 `setEditorContent(editor, defaultValue)`.
3. `provider.isSynced === false`이면 `on('sync', onSync)` 등록하여 **서버 동기화 직후 한 번 더 seed** 시도.
4. **`forceDefaultRef.current === true`인 경우에는 이미 채워진 fragment를 덮어씀** — 이것이 드래프트/버전 복구의 작동 원리이자 동시편집 위험의 근원.

### 5.3 저장 시점에서의 충돌 처리

`WikiView.tsx:438-497`(saveMutation):

| 상황 | 동작 |
|------|------|
| `coEditorCount === 0` | `base_version` 포함 → 409 시 사용자에게 충돌 다이얼로그 |
| `coEditorCount > 0` | `base_version` **생략** → 첫 저장부터 force overwrite |
| 409 + `coEditorCount > 0` | 자동 `{ ...variables, force: true }` 재시도 (무한 루프 우려: onError가 다시 force 요청 → 서버에서 다시 409는 발생하지 않음. 다만 네트워크 에러가 409로 잘못 분류되면 루프 가능) |

→ 두 개의 탭을 동일 사용자가 열어 놓기만 해도 `coEditorCount = 1`이 되어 낙관 잠금이 완전히 우회된다. 외부 도구(agent 등)의 동시 쓰기가 존재할 경우 데이터 손실.

### 5.4 Awareness·Remote Cursor

- 500ms debounce로 coEditorCount 업데이트 (`WikiView.tsx:313`).
- 사용자 접속 해제 시 provider.destroy() 이전에 `awareness.setLocalState(null)`로 즉시 제거 신호 전송 (`WikiView.tsx:271-272`).
- ContentEditor는 awareness change 시 added/updated/removed만 surgical 업데이트(`content-editor.tsx:623-692`). Grace period 1.5s.
- `document.visibilitychange` 시 로컬 커서 제거 → 탭이 포그라운드로 복귀하면 재전송(`content-editor.tsx:714-722`). 짧은 시간 내 coEditorCount가 `0`으로 내려갔다가 복귀할 수 있다.

---

## 6. 검증된 이슈 전수 조사

### 6.1 기존 작업지시서(wiki-autosave-fix.md) 재검증 결과

| # | 지시서 항목 | 실코드 검증 | 판정 |
|---|-------------|-------------|------|
| Bug 1 | 주기적 자동저장 없음 (`WikiView.tsx:606-617`) | `WikiView.tsx:607-617`의 useEffect는 `pagehide` 한 개만 등록. 맞음. | **정확** |
| Bug 2 | Discard 처리 순서 오류 (`WikiView.tsx:807-830`) | `handleDraftDiscard`는 먼저 `setDraftPrompt({open:false})` 후 `api.deleteWikiDraft` 호출(`WikiView.tsx:816-829`). 맞음. | **정확** |
| Bug 3 | 복구 후 Hocuspocus 재동기화로 덮어쓰기 | `content-editor.tsx:745-780` seed 로직 + provider 재사용 확인됨. `forceDefaultRef.current`가 true일 때 fragment를 덮어쓴다. 맞음. | **정확** |
| Bug 4 | 동시편집 중 복구 제안 자체가 위험 | `WikiView.tsx:405-436`에 coEditorCount 가드 없음. 맞음. | **정확** |
| Bug 5 | `hasConflict` 정적 스냅샷 | `WikiView.tsx:423-427` 한 번 계산 후 `draftPrompt.hasConflict` 유지. 맞음. | **정확** |
| Bug 6 | `keepalive` + `sendBeacon` 폴백 부재 | `client.ts:833-838`에 `keepalive: options?.keepalive`만 전달. 맞음. | **정확** |

결론: 기존 지시서의 6개 이슈는 **모두 실코드와 부합**하며 그대로 작업 대상이다.

### 6.2 추가 발견 이슈

#### [NEW-1 / P0] `WikiSnapshotScheduler`가 호출되지 않아 자동 스냅샷 미작동

- **위치**: `server/internal/handler/wiki_snapshot.go`, `server/internal/handler/handler.go:67`, `apps/collaboration/server.js:33-43`.
- **문제**: Hocuspocus 웹훅 transformer가 `content`를 누락하고, `CollaborationWebhook` 핸들러도 해당 content 기반 `Schedule` 호출을 하지 않는다. `WikiSnapshots.Schedule(`의 호출 지점은 전체 레포에서 0건.
- **영향**: 사용자가 명시적으로 Save 버튼을 누르지 않으면 서버 측 `wiki_versions`에 어떤 스냅샷도 기록되지 않는다. 실시간 협업만으로 편집된 내용은 `wikis.content`에도, `wiki_versions`에도 반영되지 않는다 — **오직 메모리상 Y.Doc + Hocuspocus 내부 저장소(기본은 InMemory)**에만 남는다.
- **재현**: 탭 A·B 동시 편집 → 둘 다 Save 버튼 누르지 않고 종료 → Hocuspocus 서버 재시작 혹은 해당 문서 세션 idle → 편집 내용 전손 가능.
- **수정 방향**: (a) Hocuspocus 서버에 `@hocuspocus/transformer` 도입하여 content를 실제로 전달, (b) `CollaborationWebhook` 내에서 `h.WikiSnapshots.Schedule(wikiID, content, userID)` 호출, (c) 서버 shutdown hook에서 `h.WikiSnapshots.Shutdown()` 호출. 혹은 대안으로 서버측 스냅샷을 폐기하고 **클라이언트 주기적 자동저장(`Bug 1` 수정)에 일원화**하는 것이 현실적 해결책이다. 단, 여러 클라이언트가 동시 저장 시 `base_version` 충돌 및 `wiki_drafts` UPSERT 경쟁이 증가하는 점은 별도 검토 필요.

#### [NEW-2 / P1] 드래프트 `binary_state` 빈값 UPSERT 시 기존 값 손실

- **위치**: `server/internal/handler/wiki.go:331-352` (`SaveWikiDraft`).
- **코드**:
  ```go
  var binaryData []byte
  if req.BinaryState != "" { /* decode */ }
  // INSERT ... ON CONFLICT DO UPDATE SET binary_state = EXCLUDED.binary_state ...
  ```
- **문제**: `req.BinaryState == ""`이면 `binaryData`는 `nil` → UPSERT 시 기존 `binary_state`가 `NULL`로 덮어씌워짐.
- **클라 트리거 경로**: `WikiView.tsx:565`에서 `editorRef.current?.getBinaryState() ?? null`. 에디터가 아직 mount되지 않았거나 `ydoc`이 null이면(`content-editor.tsx:821-825`) null 반환 → 서버로 `binary_state: null`/`""` 전송.
- **재현**:
  1. 사용자 X가 탭 A 편집 → 드래프트 저장 시 binary_state 정상 기록.
  2. 사용자 X 같은 문서 탭 B로 재접속 → mount 직후 `editorRef.current` 아직 `null`.
  3. 동시에 빠르게 다른 위키로 이동 → `handleSelect → flushDraftOnLeave` → `persistDraftSnapshot` → `binary_state: null` UPSERT.
  4. 결과: 탭 A가 남긴 binary_state가 사라짐. 이후 복구 시 CRDT 상태 누락.
- **수정 방향**: 서버 핸들러에서 `req.BinaryState == ""`이면 UPDATE 절에서 `binary_state`를 **제외**(COALESCE 또는 컬럼 분기). 또는 클라이언트에서 binary_state가 null일 때 아예 필드 생략하고, 서버는 `IF ... THEN UPDATE ... binary_state = CASE WHEN $? = '' THEN binary_state ELSE $? END` 같은 구문 사용.

#### [NEW-3 / P1] 409 + `coEditorCount > 0` 자동 force 재시도의 위험성

- **위치**: `WikiView.tsx:483-488`.
- **문제**: `coEditorCount`는 실제 "다른 편집자 수"이므로 0 이상일 때 동일 사용자가 탭 2개를 열어 자기 자신과 충돌했을 때도 자동으로 force 저장된다. 이는 낙관 잠금의 의도를 우회하며, 브라우저 내 다중 인스턴스 또는 외부 시스템(agent)과의 충돌을 조용히 덮어쓴다.
- **수정 방향**: (a) 자동 force는 제거하고 `coEditorCount > 0`일 때도 사용자에게 명시적 선택을 제시, (b) 또는 `coEditorCount`를 "다른 *사용자 ID*가 접속 중인가" 기준으로 재정의해 같은 user.id를 가진 awareness 상태를 제외(현재 `awareness.clientID`만 비교).

#### [NEW-4 / P1] 같은 사용자 다중 탭 → 드래프트 상호 덮어쓰기

- **위치**: `wiki_drafts` UNIQUE(workspace_id, wiki_id, user_id) + `WikiView.tsx` 전반.
- **문제**: 한 사용자 기준 한 row만 존재하므로, 두 탭이 독립적으로 편집하면 마지막 저장자가 다른 탭의 드래프트를 완전히 덮어쓴다. 탭 B가 mount 직후 아직 현 서버 draft를 fetch하기 전에 `flushDraftOnLeave`가 호출되면 빈 내용 혹은 초기 wiki 본문으로 덮어쓸 수 있다.
- **보완재**: `lastDraftContentRef`가 초기 wiki 본문과 같으면 저장을 건너뛰는 가드가 있어 일부 경로는 방어된다(`WikiView.tsx:596-597`). 하지만 탭 B가 뭔가 작은 수정이라도 한 경우엔 여전히 탭 A의 편집이 사라진다.
- **수정 방향**: (a) UNIQUE 키에 `session_id` 또는 `tab_id` 추가 후 최신 `updated_at` 기반 복구, (b) 또는 `base_version`과 `updated_at` 둘 다 비교하여 본인이 쓴 draft가 "최신인지" 확인 후 UPSERT, (c) Hocuspocus awareness의 clientID를 draft row key에 포함.

#### [NEW-5 / P2] `onUpdate` debounce(300ms) 잔여분 flush 누락

- **위치**: `content-editor.tsx:290-299`, `WikiView.tsx:605-617`.
- **문제**: `onUpdate`는 300ms debounce로 `currentContent`를 업데이트. `pagehide` 직전 ~300ms 내 타이핑은 debounceRef가 `clearTimeout` + 컴포넌트 언마운트로 flush 없이 소실된다.
- **수정 방향**: `ContentEditor`에 `flushPendingUpdate()` 메서드 추가(현재 pending timer를 즉시 실행)하고 `persistDraftSnapshot` 앞에서 호출. 또는 `editor.on('update')`에서 debounce 없이 즉시 ref에 쓰고, 비즈니스 레벨 debounce만 currentContent state에 적용.

#### [NEW-6 / P2] `compactWikiHistory`가 UpdateWiki 트랜잭션 내에서 실행

- **위치**: `wiki.go:261`, `wiki_history_policy.go:25-78`.
- **문제**: 히스토리 압축(최대 수백 행 스캔·삭제)이 저장 트랜잭션과 함께 수행되어 일반 저장 지연이 늘고, 롤백 시 압축도 함께 취소된다.
- **영향**: 저장이 피크 때 수 초 걸리고 다른 트랜잭션과 락 경합 가능.
- **수정 방향**: 트랜잭션 외부에서 best-effort로 비동기 실행, 또는 `CompactWikiHistory` 엔드포인트(주기 작업)로 위임.

#### [NEW-7 / P2] `flushDraftOnLeave`가 cleanup에서 두 번 호출될 수 있음

- **위치**: `WikiView.tsx:607-617`.
- **코드 흐름**: `pagehide` 핸들러는 등록되어 있고, cleanup 함수도 `flushDraftOnLeave` 호출. `pagehide` 후 곧바로 컴포넌트가 unmount되면 동일 snapshot 2회 전송 가능.
- **영향**: 서버 UPSERT는 idempotent이므로 데이터 손상은 없으나, `keepalive` fetch 쿼터 소비·로그 중복.
- **수정 방향**: 마지막 snapshot 해시 기반 dedup 또는 `beforeunload`로 통합.

#### [NEW-8 / P2] 드래프트 복구 시 에디터 리마운트가 동시편집 세션에 전파

- **위치**: `WikiView.tsx:793-805`, `WikiEditor.tsx:312` (`key={`content-${id}-${ydoc?.clientID ?? "static"}-${restoreKey}`}`).
- **문제**: `restoreKey`를 바꾸면 ContentEditor는 리마운트되지만 `ydoc`, `provider`, awareness는 WikiView 레벨에 유지된다. 리마운트 직후 새 에디터가 `forceDefault=true` 상태로 `setEditorContent(editor, draft.content)`을 호출 → Yjs 트랜잭션으로 CRDT에 반영 → **Hocuspocus가 서버로 전파 → 다른 사용자 에디터에도 덮어쓰기**.
- **영향**: 동시편집 다른 사용자의 로컬 변경이 날아갈 수 있다.
- **수정 방향**: 복구 전에 `provider.disconnect()` + `ydoc.destroy()`로 세션 종료, 로컬 Yjs 재생성, 그 후 재연결. 또는 Bug 4 해결(복구 차단)로 회피. 혹은 더 엄격하게, 드래프트 복구 전 서버에 "새 기준 버전 생성(force-save)"을 먼저 수행하고 그 후 편집 계속.

#### [NEW-9 / P3] 새 문서(`selectedId === "new"`)의 드래프트 부재

- **위치**: `WikiView.tsx:560-561`, `WikiView.tsx:582-583` (`if (!id || id === "new") return`).
- **문제**: 새 문서를 작성하다 브라우저가 종료되면 임시저장 불가 → 전손.
- **영향**: 기대치와 다름. 사용자는 "편집 중이면 자동저장된다"라고 일반적으로 기대.
- **수정 방향**: 세션 로컬(IndexedDB/localStorage, core의 StorageAdapter)에 "새 문서 초안"을 보관하거나, 첫 입력 시점에 자동으로 CreateWiki를 호출해 정식 id 할당.

#### [NEW-10 / P3] `draftPromptedRef`가 session-local → 새로고침 시 프롬프트 재출현

- **위치**: `WikiView.tsx:241`.
- **문제**: `Map`은 메모리에만 있어 페이지 리로드 시 재초기화되고, 같은 draft에 대해 또 프롬프트가 뜬다.
- **수정 방향**: (a) discard 했는데 서버 DELETE 실패 → 재출현(Bug 2)과 별도로 봐야 함. (b) 선택: `draftPrompt`의 `updated_at`을 localStorage의 "이미 응답한 draft" 인덱스에 기록. 단, 다중 기기 UX 충돌 가능.

#### [NEW-11 / P3] `draft.binary_state`를 복구에서 사용하지 않는다

- **위치**: `WikiView.tsx:793-805`.
- **문제**: 서버는 binary_state를 저장/반환하지만 클라이언트 복구 경로는 Markdown만 활용. Yjs 상태의 "세밀한 구조(테이블 스타일, 리스트 레벨 등)"가 손실될 수 있다.
- **수정 방향**: 복구 시 (a) `ydoc` 교체 + `Y.applyUpdate(ydoc, binary_state)` 또는 (b) 현재처럼 Markdown 재주입 (간단하지만 CRDT 메타 손실). 선택은 UX 요구사항에 따른다.

#### [NEW-12 / P3] HocuspocusProvider 재초기화 시 awareness 깜빡임

- **위치**: `WikiView.tsx:258-338` (useEffect의 deps `[selectedId, user]`).
- **문제**: `user` 참조가 바뀌면 provider 전체 재생성 → 다른 클라이언트에 disconnect→connect 이벤트가 반복 발생 → `coEditorCount` 값이 깜빡이고 드래프트 프롬프트 useEffect가 재평가.
- **수정 방향**: deps를 `[selectedId, user?.id, user?.name]`로 바꾸거나 `authUser`는 ref로만 읽기.

#### [NEW-13 / P3] `wiki.updated` 앱 WS 이벤트가 클라에서 무시됨

- **위치**: `wiki.go:284-294` (broadcast), 클라이언트에 대응되는 리스너 없음.
- **문제**: 다른 사용자가 Save 버튼으로 정식 저장해 `wikis.version`이 증가해도, 현재 편집 중인 탭의 `currentVersionRef`는 갱신되지 않는다. 이후 본인이 Save하면 409 발생 → 충돌 다이얼로그. 알림을 실시간 제공하면 사용자 경험이 개선된다.
- **수정 방향**: `use-realtime-sync.ts`에 `wiki.updated` 핸들러 추가해 해당 wikiId의 쿼리 invalidate + `currentVersionRef` 갱신.

---

## 7. 재현 시나리오 카탈로그

> 각 시나리오는 수동 재현 시간 1-3분 내외.

### S1. 주기적 자동저장 없음으로 인한 전손 (Bug 1 + NEW-1)

1. 위키 하나를 열고 2-3분간 타이핑만 지속 (Save 금지).
2. 도구 모음의 Save indicator는 `idle`에 머무름.
3. macOS `kill -9 $(pgrep 'Google Chrome')` 또는 OS 크래시 재현.
4. 재접속 → 드래프트 프롬프트도 뜨지 않음(마지막 `pagehide`가 실행되지 않았으니 draft 없음) → 본문 내용 전손.

### S2. Discard 실패 후 재출현 (Bug 2)

1. 위키 A 편집 후 브라우저 탭 이동 → draft 저장.
2. 같은 위키 재접속 → 복구 프롬프트.
3. DevTools Network tab: "Offline" 토글 ON.
4. `Discard` 클릭 → 다이얼로그 닫힘.
5. Online 복구 → 새로고침 → 복구 프롬프트 재출현.

### S3. 동시편집 중 복구로 원격 변경 유실 (Bug 4 + NEW-8)

1. 탭 A 위키 X 편집 → draft 저장된 상태에서 탭 닫음.
2. 탭 B에서 위키 X 열고 편집 시작(저장 X).
3. 탭 A에서 위키 X 재접속 → `coEditorCount=1`이지만 복구 프롬프트가 여전히 떠 있음 (가드 없음).
4. 탭 A에서 `Restore` 클릭 → `restoreKey` 증가 → ContentEditor 리마운트 → `setEditorContent` 호출 → Yjs 트랜잭션으로 CRDT 덮어쓰기 → 탭 B 화면의 편집 내용이 draft 내용으로 교체됨.

### S4. `hasConflict` stale → 잘못된 경고 부재 (Bug 5)

1. 탭 A에서 복구 프롬프트 열린 상태 유지 (draft.base_version = 3, wiki.version = 3, hasConflict=false).
2. 탭 B에서 같은 위키를 명시적으로 Save → `wiki.version = 4`.
3. 탭 A 다이얼로그는 여전히 "Recover auto-saved draft?" 문구 표시 → 사용자는 충돌을 인지하지 못한 채 Restore.

### S5. `binary_state` 무의식적 NULL 덮어쓰기 (NEW-2)

1. 탭 A에서 위키 X 편집, 드래프트 저장되어 `binary_state != NULL`.
2. 새 탭 B를 여는 동시에 즉시 다른 위키로 이동(100-200ms 내).
3. B mount 시 `editorRef.current`가 null → `getBinaryState()` = null → draft PUT with `binary_state: ""` → `ON CONFLICT DO UPDATE SET binary_state = NULL`.
4. 결과: 이전에 저장된 Yjs 상태 파괴. 이후 복구 시 Markdown만 남음 → CRDT 세부 메타 일부 손실.

### S6. 멀티탭 자기 자신과 force overwrite (NEW-3 + NEW-4)

1. 같은 사용자가 위키 X를 탭 A와 탭 B 동시에 열기.
2. 각 탭에서 서로 다른 문장 추가.
3. 탭 A에서 Save → `coEditorCount=1` → `base_version` 생략 → 성공 저장.
4. 탭 B에서 Save → 409 → **자동 force retry** → 탭 A 저장 내용이 사라짐.

### S7. 서버 스냅샷 미동작 (NEW-1)

1. 탭 A, B 동시 편집 (실시간 동기화 OK).
2. 둘 다 Save 없이 창 닫음.
3. Hocuspocus 서버 재시작 (혹은 in-memory 세션 만료).
4. 탭 A만 재접속 → `wikis.content`는 마지막 명시적 Save 상태 → 중간 편집 소실. 단, 클라이언트 draft(pagehide)가 있었다면 부분 복구 가능.

---

## 8. 수정 전략 및 우선순위

### 8.1 단기(즉시 적용, 대안 없음)

1. **Bug 1 (주기적 자동저장)** — 기존 지시서 "작업 A"대로 30초 interval.
2. **Bug 2 (Discard 순서)** — 기존 지시서 "작업 B" + `AlertDialogCancel`의 `onClick`에서 `e.preventDefault()`.
3. **NEW-2 (binary_state NULL 덮어쓰기)** — 서버측 conditional UPDATE.
4. **NEW-3 (자동 force retry 제거)** — 명시적 사용자 선택으로 변경 + coEditorCount 정의 재검토(같은 user.id 제외).

### 8.2 중기(설계 결정 수반)

5. **Bug 3·4 + NEW-8 (드래프트 복구와 동시편집의 교차)** — (a) `coEditorCount > 0`에서 복구 금지(Bug 4 해결), 이 경우 draft는 사용자가 모두 나간 후에만 프롬프트. (b) NEW-8은 복구 순서를 "provider 단절 → ydoc 재생성 → setEditorContent → 재연결(`provider = new HocuspocusProvider(...)`)"으로 명시적으로 수행하는 것을 권장. 또는 복구 대신 "서버에 새 base_version으로 force-save 후 계속 편집" 경로를 제안.
6. **Bug 5 (hasConflict 실시간)** — 지시서 "작업 D"대로 useMemo 파생.
7. **NEW-4 (멀티탭 drafts 경쟁)** — UNIQUE 키에 `tab_session_id` 추가 혹은 Yjs awareness.clientID 사용.
8. **NEW-13 (wiki.updated broadcast 소비)** — 실시간 version 반영.

### 8.3 장기(구조적 결정)

9. **NEW-1 (서버 스냅샷 경로 결정)** — 세 옵션 중 택일:
   - (A) Hocuspocus 서버에 `@hocuspocus/transformer` 및 TipTap 서버사이드 렌더링 도입 → `WikiSnapshots.Schedule` 활성화. 가장 원래 설계에 가깝다.
   - (B) 서버 스냅샷을 폐기하고 클라이언트 30초 autosave로 일원화(Bug 1 해결이 이 경로의 주춧돌).
   - (C) Hocuspocus가 binary_state만 저장/로드하는 별도 엔드포인트를 두고, 별도 cron으로 Y.Doc → Markdown 변환.
10. **NEW-6 (compact 비동기화)**, **NEW-11 (binary_state 기반 복구)**, **NEW-9 (새 문서 drafts)** 는 기능 개선 카테고리.

### 8.4 기존 지시서(wiki-autosave-fix.md)와의 매핑

| 지시서 작업 | 본 검토의 대응 항목 | 변경 의견 |
|-------------|---------------------|----------|
| 작업 A (30초 interval) | 8.1-#1 | 적용 권장. 다만 NEW-5(debounce flush) 같이 해결하면 완성도↑ |
| 작업 B (Discard 순서) | 8.1-#2 | 적용 권장. `e.preventDefault()` 필수 |
| 작업 C (복구 차단) | 8.2-#5 | 적용 권장. 추가로 `handleDraftRestore` 내부에도 guard |
| 작업 D (hasConflict) | 8.2-#6 | 적용 권장. 추가로 wiki.updated 구독과 연계 고려 |
| 작업 E (sendBeacon) | 8.1-#? (부수) | 서버 인증 방식 확인 후 조건부 적용. X-Workspace-ID가 쿠키가 아닌 헤더이므로 sendBeacon 불가 → 대안: workspace ID를 쿼리 파라미터 허용하도록 서버 수정 후 적용 |

---

## 9. 핵심 코드 위치 참조

| 심볼 / 개념 | 파일:라인 |
|------------|----------|
| WikiView 루트 | `apps/web/features/wiki/components/WikiView.tsx:171` |
| HocuspocusProvider 초기화 | `WikiView.tsx:258-338` |
| `coEditorCount` 업데이트 | `WikiView.tsx:311-322` |
| `collabConnected` 관리 | `WikiView.tsx:302-306` |
| 위키 목록 / 트리 | `WikiView.tsx:341-347` |
| currentVersionRef 동기화 | `WikiView.tsx:363-382` |
| 드래프트 프롬프트 useEffect | `WikiView.tsx:405-436` |
| saveMutation (낙관 잠금/force) | `WikiView.tsx:438-497` |
| discardedDraftSnapshots / BroadcastChannel | `WikiView.tsx:524-557` |
| `persistDraftSnapshot` | `WikiView.tsx:559-578` |
| `flushDraftOnLeave` | `WikiView.tsx:580-604` |
| `pagehide` 리스너 | `WikiView.tsx:607-617` |
| `handleSelect` | `WikiView.tsx:619-639` |
| `handleSave` | `WikiView.tsx:719-737` |
| 버전 복원 `doRestore` | `WikiView.tsx:757-787` |
| `handleDraftRestore` | `WikiView.tsx:793-805` |
| `handleDraftDiscard` | `WikiView.tsx:807-830` |
| `handleConflictForce` / `handleConflictDiscard` | `WikiView.tsx:833-857` |
| draft recovery AlertDialog | `WikiView.tsx:992-1013` |
| WikiEditor (툴바·레이아웃) | `apps/web/features/wiki/components/WikiEditor.tsx` |
| WikiEditor → ContentEditor key 구성 | `WikiEditor.tsx:312` |
| ContentEditor 시딩 | `packages/views/editor/content-editor.tsx:745-780` |
| `setEditorContent` 헬퍼 | `content-editor.tsx:184-194` |
| `getBinaryState`/`restoreBinaryState` | `content-editor.tsx:821-830` |
| debounce(onUpdate 300ms) | `content-editor.tsx:290-299` |
| API: saveWikiDraft/getWikiDraft/deleteWikiDraft/updateWiki | `packages/core/api/client.ts:804-864` |
| 서버: UpdateWiki 트랜잭션 | `server/internal/handler/wiki.go:166-304` |
| 서버: SaveWikiDraft UPSERT | `wiki.go:306-360` |
| 서버: GetWikiDraft | `wiki.go:362-403` |
| 서버: DeleteWikiDraft | `wiki.go:405-422` |
| 서버: CollaborationWebhook (현재 no-op) | `wiki.go:677-712` |
| 서버: 히스토리 GET/Compact | `wiki.go:547-624` |
| 서버: WikiSnapshotScheduler (dead code) | `server/internal/handler/wiki_snapshot.go` |
| 서버: 히스토리 보관 정책 | `server/internal/handler/wiki_history_policy.go` |
| 서버: Handler 구조체 와이어링 | `server/internal/handler/handler.go:46-68` |
| 서버: 라우트 | `server/cmd/server/router.go:342-364` |
| Hocuspocus 서버 | `apps/collaboration/server.js` |
| 마이그레이션: wiki_drafts | `server/migrations/20260414000100_wiki_drafts.up.sql` |
| 마이그레이션: wiki_versions(binary_state) | `server/migrations/20260411000200_wiki_binary_snapshots.up.sql` |

---

## 10. 검증 체크리스트 (수정 후 확인)

### 10.1 자동화

```bash
pnpm --filter @multica/web exec vitest run features/wiki        # TS 단위 (현재 없을 수 있음 — 필요 시 생성)
pnpm --filter @multica/views exec vitest run editor              # 에디터 시딩·seed 재진입 테스트
pnpm exec playwright test e2e/tests/wiki*.spec.ts                # E2E (wiki 관련 스펙이 있다면)
cd server && go test ./internal/handler/ -run Wiki               # UpdateWiki·SaveWikiDraft 트랜잭션 테스트
```

### 10.2 수동 시나리오

- [ ] S1 자동저장: 30초 대기 후 `PUT /api/wikis/{id}/draft` 1회 발생, 변경 없으면 무호출.
- [ ] S2 Discard 실패(Offline) 시 다이얼로그 유지 + 버튼 disabled.
- [ ] S3 `coEditorCount > 0`에서 복구 다이얼로그 차단.
- [ ] S4 다이얼로그 열린 중 다른 탭 저장 → 타이틀 즉시 "version changed".
- [ ] S5 mount 직후 selection 변경 → 서버에서 `binary_state` 보존 확인.
- [ ] S6 멀티탭 Save → 두 번째 Save가 명시적 충돌 다이얼로그로 귀결(자동 force 미수행).
- [ ] S7 Hocuspocus만으로 편집 후 Save 없이 세션 종료 → 스냅샷 경로가 결정된 옵션대로 복구 가능 여부.
- [ ] 변경 없는 Save 버튼 연타가 불필요한 version 증가 없이 처리되는지.
- [ ] 버전 Restore 시 Hocuspocus sync로 인한 이중 적용 없는지(NEW-8).

### 10.3 회귀 지점

- 드래프트 프롬프트가 다중 탭/다중 세션에서 정확히 한 번만 뜨는가.
- `handleSelect`가 이전 위키 draft를 올바르게 flush하는가(콘텐츠 변경 없을 때 생략 포함).
- `wiki.updated` 이벤트 수신 시 currentVersionRef 업데이트(NEW-13 적용 후).
- 새 문서(`selectedId === "new"`) 생성 직후 즉시 Save하는 경로 정상 동작.

---

## 11. 미해결 질문 (의사 결정 필요)

1. 서버측 실시간 스냅샷(NEW-1)의 방향성: A/B/C 중 어느 옵션을 채택할 것인가?
2. 멀티탭 동일 사용자 드래프트(NEW-4): draft 모델을 1:N(탭별)로 확장할 것인가, 아니면 탭 간 단일 draft를 사용자가 인지하도록 UX만 개선할 것인가?
3. 드래프트 복구 시 binary_state 활용(NEW-11): Markdown 기반으로 계속 갈 것인가, CRDT 완전 복원으로 전환할 것인가?
4. `coEditorCount > 0`에서의 저장 전략(NEW-3): force-save 자동 vs 사용자 선택 vs 항상 낙관 잠금 강제.
5. `wiki.updated` 이벤트 소비(NEW-13)를 추가할 것인가, 아니면 Hocuspocus awareness 기반으로 대체할 것인가?

---

## 부록 A — 환경 변수 및 설정

- `NEXT_PUBLIC_COLLAB_URL` — 클라이언트에서 사용하는 Hocuspocus URL (기본 `ws://localhost:8081`, `WikiView.tsx:284`).
- `COLLABORATION_WEBHOOK_SECRET` — 서버·Hocuspocus 간 공유 비밀 (`wiki.go:685`, `apps/collaboration/server.js:31`).
- `BACKEND_URL` — Hocuspocus가 호출할 Go 서버 주소 (`apps/collaboration/server.js:29`).

## 부록 B — 스키마 요약

- `wikis(id, workspace_id, parent_id, title, content, version, sort_order, created_by, updated_by, created_at, updated_at)`
- `wiki_versions(id, wiki_id, version_number, title, content, binary_state, created_by, created_at)`
- `wiki_drafts(id, workspace_id, wiki_id, user_id, title, content, binary_state, base_version, created_at, updated_at)` + UNIQUE(workspace_id, wiki_id, user_id) + FK ON DELETE CASCADE

## 부록 C — 관련 파일 변경 이력 확인 명령

```bash
git log --oneline -- apps/web/features/wiki/components/WikiView.tsx
git log --oneline -- server/internal/handler/wiki.go
git log --oneline -- server/internal/handler/wiki_snapshot.go
git log --oneline -- apps/collaboration/server.js
```

---
*이 문서는 다른 에이전트가 본 분석을 기반으로 수정을 이어가기 위한 입력 문서이며, 구현 지시 문장(imperative)은 기존 `docs/tasks/wiki-autosave-fix.md`에 있다. 두 문서는 상호보완 관계다.*
