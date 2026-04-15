# 작업지시서: 위키 자동저장 & 복구 기능 버그 수정 (동시편집 포함)

**작성일:** 2026-04-15  
**우선순위:** P0 → P1 → P2 순서로 처리  
**수정 대상:** `apps/web/features/wiki/components/WikiView.tsx`, `packages/core/api/client.ts`

---

## 1. 시스템 아키텍처 이해 (반드시 먼저 읽을 것)

### 1.1 두 가지 실시간 채널

위키는 두 개의 독립된 실시간 채널을 동시에 사용한다.

| 채널 | 용도 | 기술 |
|------|------|------|
| **Hocuspocus WebSocket** (`ws://...:8081`) | 문서 내용(CRDT) 동기화 | Yjs + HocuspocusProvider |
| **앱 WebSocket** (`/ws`) | 코멘트·알림 등 이벤트 | `use-realtime-sync.ts` |

위키 **콘텐츠**는 Hocuspocus만 담당한다. 앱 WebSocket으로 위키 내용 이벤트는 오지 않는다.

### 1.2 Yjs 이중 저장 구조

편집 내용은 두 가지 형태로 병행 저장된다.

```
┌──────────────────────────────┐
│ Yjs Y.Doc (메모리)            │  ← Hocuspocus가 실시간 CRDT 동기화
│  └─ Y.XmlFragment            │
│       └─ ProseMirror state   │
└──────────────────────────────┘
         ↓ Y.encodeStateAsUpdate()
┌──────────────────────────────┐
│ binary_state (Base64)        │  ← wiki_drafts.binary_state 에 저장
│                              │     (현재 복구 시 미사용 — Markdown이 정본)
└──────────────────────────────┘
         ↓ editor.getMarkdown()
┌──────────────────────────────┐
│ content (Markdown string)    │  ← wiki_drafts.content, wikis.content 에 저장
│                              │     (복구 시 이 값 사용)
└──────────────────────────────┘
```

### 1.3 동시편집 여부에 따른 저장 동작 차이

`WikiView.tsx:448` — `coEditorCount`(다른 접속자 수)로 분기:

| 상태 | 저장 방식 | 409 충돌 처리 |
|------|-----------|---------------|
| 단독 편집 (`coEditorCount === 0`) | `base_version` 포함 → 낙관적 잠금 | 충돌 다이얼로그 표시 (수동 결정) |
| 동시 편집 (`coEditorCount > 0`) | `base_version` 생략 → 강제 저장 | 자동 force retry (사용자 개입 없음) |

### 1.4 드래프트 복구 시 Yjs 상태

`handleDraftRestore` (`WikiView.tsx:793`) — 드래프트 복구 시:

1. `setCurrentContent(draft.content)` → Markdown 복원
2. `setRestoreKey(k + 1)` → ContentEditor 강제 리마운트
3. `forceDefault=true` → `setEditorContent(editor, markdownContent)` 호출
4. **`draft.binary_state`는 현재 무시됨** (저장은 되지만 복구에 미사용)
5. 리마운트 직후 Hocuspocus가 서버 Yjs 상태를 다시 sync → **복원한 Markdown이 Yjs 서버 상태에 덮어씌워질 수 있음**

이것이 동시편집 환경에서 드래프트 복구가 위험한 이유다.

---

## 2. 발견된 버그 목록

### Bug 1 (P0): 주기적 자동저장 없음 → 브라우저 크래시 시 데이터 전손

**위치:** `WikiView.tsx:606-617`

드래프트는 `pagehide` 이벤트와 위키 선택 변경 시에만 저장된다.
브라우저 크래시, 배터리 방전, 강제 종료 시 미저장 내용이 전부 사라진다.

---

### Bug 2 (P0): Discard 처리 순서 오류 → 실패 시 드래프트 재출현

**위치:** `WikiView.tsx:807-830`

다이얼로그를 먼저 닫고 삭제 API를 비동기 호출한다.
삭제 실패 시 다음 재접속에서 드래프트가 다시 나타난다.

---

### Bug 3 (P1): 드래프트 복구 후 Hocuspocus 재동기화 → 복원 내용 덮어쓰기

**위치:** `WikiView.tsx:793-805`, `content-editor.tsx:757-780`

드래프트를 복원하면 `setRestoreKey`로 에디터를 리마운트하지만,
Hocuspocus 연결은 유지된다. 리마운트 직후 Hocuspocus의 `"sync"` 이벤트가
서버 Yjs 상태를 에디터에 적용하여 방금 복원한 Markdown을 덮어쓸 수 있다.

특히 `collabConnected`가 `true`인 상태(이미 연결됨)에서 발생할 가능성이 높다.

---

### Bug 4 (P1): 동시편집 중 드래프트 복구 제안 자체가 위험

**위치:** `WikiView.tsx:405-436`, `WikiView.tsx:793`

`coEditorCount > 0`인 상태에서 드래프트 복구를 허용하면,
복원된 로컬 Markdown이 Yjs CRDT 상태와 충돌하고 다른 편집자들의 변경을 날릴 수 있다.
현재 복구 다이얼로그는 동시편집 여부를 전혀 고려하지 않는다.

---

### Bug 5 (P1): `hasConflict` 정적 스냅샷 — 다이얼로그 열린 중 버전 변경 미반영

**위치:** `WikiView.tsx:423-427`

```typescript
setDraftPrompt({
  open: true,
  draft,
  hasConflict: draft.base_version !== (wiki.version ?? 1), // 한 번만 계산
});
```

다이얼로그가 열려 있는 동안 다른 사용자가 저장하면 충돌 상태가 업데이트되지 않는다.

---

### Bug 6 (P2): `keepalive` fetch 미보장 + `sendBeacon` 폴백 없음

**위치:** `packages/core/api/client.ts:833-838`

페이지 언로드 시 `keepalive: true` fetch가 완료되지 않을 수 있다.
`navigator.sendBeacon` 폴백이 없다. 단, sendBeacon은 커스텀 헤더를 지원하지 않으므로
서버 인증 방식 확인 후 적용 가능 여부를 판단한다.

---

## 3. 수정 명세

### 작업 A (P0): 30초 주기적 자동저장

**파일:** `apps/web/features/wiki/components/WikiView.tsx`

기존 `pagehide` useEffect (`WikiView.tsx:606`) 바로 아래에 추가한다.

**조건:**
- `selectedId`가 유효하고 `"new"`가 아닐 것
- `viewingVersionId === null`일 것 (버전 뷰어 모드에서는 저장 안 함)
- 콘텐츠가 이전 드래프트와 동일하면 API 호출 안 함

**동시편집 처리:**
- `coEditorCount > 0`이어도 드래프트 저장은 수행한다.
  (Markdown 스냅샷 보존용 — 복구 시 충돌 경고가 표시됨)
- 단, 저장 주기를 단독 편집(30초)과 동일하게 유지한다.
  Hocuspocus가 실시간 CRDT를 담당하므로 드래프트는 최후 보험 용도.

**구현:**

```typescript
// Periodic auto-save every 30 seconds while in editing mode
useEffect(() => {
  if (!selectedId || selectedId === "new" || viewingVersionId) return;

  const intervalId = setInterval(() => {
    const title = currentTitleRef.current;
    const content = currentContentRef.current;

    // Skip if content unchanged since last draft save
    const currentHash = hashDraftSnapshot(title, content);
    const last = lastDraftContentRef.current;
    if (last && hashDraftSnapshot(last.title, last.content) === currentHash) return;

    // Skip if matches persisted server content (nothing to save)
    const persisted = persistedWikiContentRef.current.get(selectedId);
    if (persisted && persisted.title === title && persisted.content === content) return;

    void persistDraftSnapshot().catch((err: unknown) => {
      console.warn("[wiki] periodic auto-save failed", err);
    });
  }, 30_000);

  return () => clearInterval(intervalId);
}, [selectedId, viewingVersionId, persistDraftSnapshot]);
```

**검증:**
1. 위키 열고 텍스트 입력 → 30초 대기
2. DevTools Network 탭: `PUT /api/wikis/{id}/draft` 요청 확인
3. 동일 내용 유지 → 다음 30초 인터벌에 요청 없음 확인
4. 브라우저 강제 종료 후 재접속 → 복구 다이얼로그 출현 확인

---

### 작업 B (P0): Discard 처리 순서 수정

**파일:** `apps/web/features/wiki/components/WikiView.tsx`

**Step 1:** state 추가 (기존 `useState` 선언부 근처):

```typescript
const [isDraftDiscarding, setIsDraftDiscarding] = useState(false);
```

**Step 2:** `handleDraftDiscard` 교체 (`WikiView.tsx:807`):

```typescript
const handleDraftDiscard = useCallback(async () => {
  const id = selectedId;
  if (!id || id === "new") {
    setDraftPrompt({ open: false, draft: null, hasConflict: false });
    return;
  }

  setIsDraftDiscarding(true);
  rememberDiscardedDraft(id, currentTitleRef.current, currentContentRef.current, true);

  try {
    await api.deleteWikiDraft(id);
    lastDraftContentRef.current = {
      title: currentTitleRef.current,
      content: currentContentRef.current,
    };
    queryClient.invalidateQueries({ queryKey: ["wiki-draft", id] });
    setDraftPrompt({ open: false, draft: null, hasConflict: false }); // 성공 후 닫음
    toast.info("Discarded auto-saved draft.");
  } catch {
    discardedDraftSnapshotsRef.current.delete(id);
    toast.error("Failed to discard draft.");
  } finally {
    setIsDraftDiscarding(false);
  }
}, [selectedId, rememberDiscardedDraft, queryClient]);
```

**Step 3:** AlertDialog Discard 버튼 수정 (렌더링 하단 AlertDialog 블록):

```tsx
// 기존
<AlertDialogCancel onClick={handleDraftDiscard}>Discard</AlertDialogCancel>

// 수정
<AlertDialogCancel
  onClick={(e) => {
    e.preventDefault(); // AlertDialog 기본 닫기 막기
    void handleDraftDiscard();
  }}
  disabled={isDraftDiscarding}
>
  {isDraftDiscarding ? "Discarding..." : "Discard"}
</AlertDialogCancel>
```

**검증:**
1. 편집 후 이탈 → 재진입 → 복구 다이얼로그 표시
2. Discard 클릭 → 버튼 "Discarding..." 표시 확인
3. 삭제 완료 후 다이얼로그 닫힘 확인
4. 새로고침 후 복구 다이얼로그 재출현 없음 확인

---

### 작업 C (P1): 동시편집 중 드래프트 복구 차단

**파일:** `apps/web/features/wiki/components/WikiView.tsx`

`coEditorCount > 0`인 상태에서는 드래프트 복구 다이얼로그를 표시하지 않는다.
Hocuspocus가 이미 서버 CRDT 상태를 동기화하고 있으므로, 오래된 드래프트를 복원하면
다른 편집자의 변경을 덮어쓸 수 있다.

**Step 1:** 드래프트 조회 effect에 guard 추가 (`WikiView.tsx:405`):

```typescript
useEffect(() => {
  if (!selectedId || selectedId === "new" || !mounted) {
    setDraftPrompt({ open: false, draft: null, hasConflict: false });
    return;
  }

  // Do not prompt for draft recovery during active collaborative session.
  // Hocuspocus already syncs the authoritative CRDT state; restoring a stale
  // draft would overwrite other editors' concurrent changes.
  if (coEditorCount > 0) return;

  const wiki = (rawWikis as any[]).find((w: any) => w.id === selectedId);
  if (!wiki) return;

  // ... 기존 로직 유지
}, [selectedId, mounted, rawWikis, coEditorCount]);
```

**Step 2:** `handleDraftRestore`에도 guard 추가 (`WikiView.tsx:793`):

```typescript
const handleDraftRestore = useCallback(() => {
  // Safety guard: refuse restore if collaborative session is active
  if (coEditorCount > 0) {
    setDraftPrompt({ open: false, draft: null, hasConflict: false });
    toast.warning("Cannot restore draft while others are editing.");
    return;
  }

  const draft = draftPrompt.draft;
  if (!draft) return;

  // 기존 복원 로직 유지
  setCurrentTitle(draft.title);
  setCurrentContent(draft.content);
  setRestoreKey((k) => k + 1);
  if (selectedId && selectedId !== "new") {
    discardedDraftSnapshotsRef.current.delete(selectedId);
  }
  lastDraftContentRef.current = { title: draft.title, content: draft.content };
  setDraftPrompt({ open: false, draft: null, hasConflict: false });
  toast.info("Recovered your auto-saved draft.");
}, [draftPrompt, selectedId, coEditorCount]);
```

**검증:**
1. 탭 A + 탭 B 동시에 같은 위키 열기 (coEditorCount = 1)
2. 탭 A에서 다른 탭으로 이탈했다가 돌아올 때 복구 다이얼로그가 표시되지 않음 확인
3. 탭 B를 닫아 coEditorCount = 0 이 된 후 재진입 시 복구 다이얼로그 정상 표시 확인

---

### 작업 D (P1): `hasConflict` 실시간 파생값으로 교체

**파일:** `apps/web/features/wiki/components/WikiView.tsx`

**Step 1:** `draftPrompt` state 타입에서 `hasConflict` 제거:

```typescript
// 기존
const [draftPrompt, setDraftPrompt] = useState<{
  open: boolean;
  draft: { ... } | null;
  hasConflict: boolean;
}>({ open: false, draft: null, hasConflict: false });

// 수정 (hasConflict 제거)
const [draftPrompt, setDraftPrompt] = useState<{
  open: boolean;
  draft: { title: string; content: string; base_version: number; updated_at: string } | null;
}>({ open: false, draft: null });
```

**Step 2:** `useMemo`로 실시간 파생 (`WikiView.tsx` 상단 hooks 선언부 근처):

```typescript
const draftHasConflict = useMemo(() => {
  if (!draftPrompt.draft || !selectedId) return false;
  const wiki = (rawWikis as any[]).find((w: any) => w.id === selectedId);
  return draftPrompt.draft.base_version !== (wiki?.version ?? 1);
}, [draftPrompt.draft, selectedId, rawWikis]);
```

**Step 3:** 렌더링에서 교체:

```tsx
// 기존
{draftPrompt.hasConflict ? "Auto-saved draft found (version changed)" : "Recover auto-saved draft?"}
{draftPrompt.hasConflict ? "The document has newer..." : "We found an auto-saved draft..."}

// 수정 (draftHasConflict 사용)
{draftHasConflict ? "Auto-saved draft found (version changed)" : "Recover auto-saved draft?"}
{draftHasConflict ? "The document has newer..." : "We found an auto-saved draft..."}
```

**Step 4:** `setDraftPrompt` 호출부 전체에서 `hasConflict` 필드 제거:

파일 전체에서 `hasConflict:` 키를 검색하여 모두 제거한다.
타입 오류가 안내해 줄 것이다.

**검증:**
1. 탭 A에서 복구 다이얼로그가 열린 상태 유지
2. 탭 B에서 같은 위키 저장 (version 증가)
3. 탭 A의 다이얼로그 제목이 즉시 "version changed"로 변경되는지 확인

---

### 작업 E (P2): `sendBeacon` 적용 가능 여부 조사 및 폴백 추가

**파일:** `packages/core/api/client.ts`

**사전 조건 확인:**
서버 인증이 쿠키 기반인지 헤더 기반인지 먼저 확인한다.

- `server/internal/handler/auth.go` 에서 인증 방식 확인
- `sendBeacon`은 `Content-Type: text/plain` 또는 `application/x-www-form-urlencoded` 만 지원.
  `application/json` blob은 preflight 없이 전송되나 커스텀 헤더 불가.
- `X-Workspace-ID` 헤더가 필수라면 sendBeacon 사용 불가 → 이 작업 스킵.
- 쿠키로 workspace ID를 전달하거나, URL 파라미터로 대체 가능하다면 적용.

**적용 가능 시 구현 (`client.ts:821`):**

```typescript
async saveWikiDraft(
  id: string,
  data: {
    title: string;
    content: string;
    binary_state?: string | null;
    base_version: number;
  },
  options?: {
    keepalive?: boolean;
    beacon?: boolean;
  },
): Promise<void> {
  if (options?.beacon && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    // sendBeacon: fire-and-forget, guaranteed to complete on page unload
    // workspaceId passed as query param since custom headers are not supported
    const url = `/api/wikis/${id}/draft${this.workspaceId ? `?wsId=${this.workspaceId}` : ""}`;
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  await this.fetch(`/api/wikis/${id}/draft`, {
    method: "PUT",
    headers: this.workspaceId ? { "X-Workspace-ID": this.workspaceId } : {},
    body: JSON.stringify(data),
    keepalive: options?.keepalive,
  });
}
```

서버에서 `?wsId=` 파라미터를 읽도록 `wiki.go` `SaveWikiDraft`도 수정 필요.
작업량 대비 효과가 작으므로 작업 A~D 완료 후 판단한다.

---

## 4. 작업 순서 및 의존성

```
작업 B (Discard 버그)        ← 독립, 가장 단순
작업 A (주기적 자동저장)      ← 독립
작업 C (동시편집 복구 차단)   ← A 완료 후 진행 권장
작업 D (hasConflict 실시간)   ← C 완료 후 진행 (draftPrompt 타입 공유)
작업 E (sendBeacon)          ← 사전 조사 후 판단
```

---

## 5. 타입 검사 & 테스트

```bash
pnpm typecheck        # TypeScript 오류 전체
pnpm test             # Vitest 단위 테스트
```

TypeScript 엄격 모드가 켜져 있으므로 `hasConflict` 필드 제거 시
`setDraftPrompt` 호출부 타입 오류로 누락된 곳을 자동으로 찾을 수 있다.

---

## 6. 핵심 파일 위치 참조

| 심볼 | 파일:라인 |
|------|----------|
| `persistDraftSnapshot` | `WikiView.tsx:559` |
| `flushDraftOnLeave` | `WikiView.tsx:580` |
| `handleDraftRestore` | `WikiView.tsx:793` |
| `handleDraftDiscard` | `WikiView.tsx:807` |
| `hashDraftSnapshot` | `WikiView.tsx` (상단 util 함수) |
| `coEditorCount` state | `WikiView.tsx:188` |
| `draftPrompt` state | `WikiView.tsx` (useState 선언부) |
| `lastDraftContentRef` | `WikiView.tsx` (useRef) |
| `persistedWikiContentRef` | `WikiView.tsx` (useRef) |
| `discardedDraftSnapshotsRef` | `WikiView.tsx` (useRef) |
| `viewingVersionId` | `WikiView.tsx` (useState) |
| `saveWikiDraft` | `packages/core/api/client.ts:821` |
| `getWikiDraft` | `packages/core/api/client.ts:841` |
| `deleteWikiDraft` | `packages/core/api/client.ts:859` |
| `getBinaryState` | `packages/views/editor/content-editor.tsx:821` |
| `HocuspocusProvider` 초기화 | `WikiView.tsx:280` |
| `updateCoEditorCount` | `WikiView.tsx:313` |
