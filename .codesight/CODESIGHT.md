# multica — AI Context Map

> **Stack:** next-app | none | react | typescript
> **Monorepo:** @multica/collaboration, @multica/desktop, @multica/docs, @multica/web, @multica/core, @multica/eslint-config, @multica/tsconfig, @multica/ui, @multica/views

> 1 routes + 17 ws | 35 models | 163 components | 136 lib files | 72 env vars | 15 middleware | 50% test coverage
> **Token savings:** this file is ~16,600 tokens. Without it, AI exploration would cost ~128,200 tokens. **Saves ~111,600 tokens per conversation.**

---

# Routes

- `GET` `/favicon.ico`

## WebSocket Events

- `WS` `issue:updated` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `issue:created` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `issue:deleted` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `inbox:new` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `comment:created` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `comment:updated` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `comment:deleted` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `activity:created` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `reaction:added` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `reaction:removed` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `issue_reaction:added` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `issue_reaction:removed` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `subscriber:added` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `subscriber:removed` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `workspace:deleted` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `member:removed` — `packages/core/realtime/use-realtime-sync.ts`
- `WS` `member:added` — `packages/core/realtime/use-realtime-sync.ts`

---

# Schema

### user
- id: uuid (pk)
- name: text (required)
- email: text (unique)
- avatar_url: text

### workspace
- id: uuid (pk)
- name: text (required)
- slug: text (unique)
- description: text
- settings: jsonb (required)

### member
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- user_id: uuid (required, fk)
- role: text (required)

### agent
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- name: text (required)
- avatar_url: text
- runtime_mode: text (required)
- runtime_config: jsonb (required)
- visibility: text (required)
- status: text (required)
- max_concurrent_tasks: integer (required)
- owner_id: uuid (fk)

### issue
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- title: text (required)
- description: text
- status: text (required)
- priority: text (required)
- assignee_id: uuid (fk)
- creator_type: text (required)
- creator_id: uuid (required, fk)
- parent_issue_id: uuid (fk)
- acceptance_criteria: jsonb (required)
- context_refs: jsonb (required)
- position: float (required)
- due_date: timestamp(tz)

### issue_label
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- name: text (required)
- color: text (required)

### issue_to_label
- issue_id: uuid (required, fk)
- label_id: uuid (required, fk)

### issue_dependency
- id: uuid (pk)
- issue_id: uuid (required, fk)
- depends_on_issue_id: uuid (required, fk)
- type: text (required)

### comment
- id: uuid (pk)
- issue_id: uuid (required, fk)
- author_type: text (required)
- author_id: uuid (required, fk)
- content: text (required)
- type: text (required)

### inbox_item
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- recipient_type: text (required)
- recipient_id: uuid (required, fk)
- type: text (required)
- severity: text (required)
- issue_id: uuid (fk)
- title: text (required)
- body: text
- read: boolean (required)
- archived: boolean (required)

### agent_task_queue
- id: uuid (pk)
- agent_id: uuid (required, fk)
- issue_id: uuid (required, fk)
- status: text (required)
- priority: integer (required)
- dispatched_at: timestamp(tz)
- started_at: timestamp(tz)
- completed_at: timestamp(tz)
- result: jsonb
- error: text

### daemon_connection
- id: uuid (pk)
- agent_id: uuid (required, fk)
- daemon_id: text (required, fk)
- status: text (required)
- last_heartbeat_at: timestamp(tz)
- runtime_info: jsonb (required)

### activity_log
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- issue_id: uuid (fk)
- actor_id: uuid (fk)
- action: text (required)
- details: jsonb (required)

### agent_runtime
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- daemon_id: text (fk)
- name: text (required)
- runtime_mode: text (required)
- provider: text (required)
- status: text (required)
- device_info: text (required)
- metadata: jsonb (required)
- last_seen_at: timestamp(tz)

### daemon_pairing_session
- id: uuid (pk)
- token: text (required)
- daemon_id: text (required, fk)
- device_name: text (required)
- runtime_name: text (required)
- runtime_type: text (required)
- runtime_version: text (required)
- workspace_id: uuid (fk)
- approved_by: uuid (fk)
- status: text (required)
- approved_at: timestamp(tz)
- claimed_at: timestamp(tz)
- expires_at: timestamp(tz) (required)

### skill
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- name: text (required)
- description: text (required)
- content: text (required)
- config: jsonb (required)
- created_by: uuid (fk)

### skill_file
- id: uuid (pk)
- skill_id: uuid (required, fk)
- path: text (required)
- content: text (required)

### agent_skill
- agent_id: uuid (required, fk)
- skill_id: uuid (required, fk)

### verification_code
- id: uuid (pk)
- email: text (required)
- code: text (required)
- expires_at: timestamp(tz) (required)
- used: boolean (required)

### personal_access_token
- id: uuid (pk)
- user_id: uuid (required, fk)
- name: text (required)
- token_hash: text (required)
- token_prefix: text (required)
- expires_at: timestamp(tz)
- last_used_at: timestamp(tz)
- revoked: boolean (required)

### runtime_usage
- id: uuid (pk)
- runtime_id: uuid (required, fk)
- date: date (required)
- provider: text (required)
- model: text (required)
- input_tokens: bigint (required)
- output_tokens: bigint (required)
- cache_read_tokens: bigint (required)
- cache_write_tokens: bigint (required)

### issue_subscriber
- issue_id: uuid (required, fk)
- user_type: text (required)
- user_id: uuid (required, fk)
- reason: text (required)

### comment_reaction
- id: uuid (pk)
- comment_id: uuid (required, fk)
- workspace_id: uuid (required, fk)
- actor_type: text (required)
- actor_id: uuid (required, fk)
- emoji: text (required)

### task_message
- id: uuid (pk)
- task_id: uuid (required, fk)
- seq: integer (required)
- type: text (required)
- tool: text
- content: text
- input: jsonb
- output: text

### issue_reaction
- id: uuid (pk)
- issue_id: uuid (required, fk)
- workspace_id: uuid (required, fk)
- actor_type: text (required)
- actor_id: uuid (required, fk)
- emoji: text (required)

### attachment
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- issue_id: uuid (fk)
- comment_id: uuid (fk)
- uploader_type: text (required)
- uploader_id: uuid (required, fk)
- filename: text (required)
- url: text (required)
- content_type: text (required)
- size_bytes: bigint (required)

### daemon_token
- id: uuid (pk)
- token_hash: text (required)
- workspace_id: uuid (required, fk)
- daemon_id: text (required, fk)
- expires_at: timestamp(tz) (required)

### task_usage
- id: uuid (pk)
- task_id: uuid (required, fk)
- provider: text (required)
- model: text (required)
- input_tokens: bigint (required)
- output_tokens: bigint (required)
- cache_read_tokens: bigint (required)
- cache_write_tokens: bigint (required)

### chat_session
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- agent_id: uuid (required, fk)
- creator_id: uuid (required, fk)
- title: text (required)
- session_id: text (fk)
- work_dir: text
- status: text (required)

### chat_message
- id: uuid (pk)
- chat_session_id: uuid (required, fk)
- role: text (required)
- content: text (required)
- task_id: uuid (fk)

### project
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- title: text (required)
- description: text
- icon: text
- status: text (required)
- lead_id: uuid (fk)

### pinned_item
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- user_id: uuid (required, fk)
- item_type: text (required)
- item_id: uuid (required, fk)
- position: float (required)

### wikis
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- parent_id: uuid (fk)
- title: text (required)
- content: text (required)
- created_by: uuid (required)

### wiki_versions
- id: uuid (pk)
- wiki_id: uuid (required, fk)
- version_number: integer (required)
- title: text (required)
- content: text (required)
- created_by: uuid (required)

### wiki_tags
- id: uuid (pk)
- workspace_id: uuid (required, fk)
- wiki_id: uuid (required, fk)
- name: text (required)

---

# Components

- **App** — `apps/desktop/src/renderer/src/App.tsx`
- **DesktopShell** — `apps/desktop/src/renderer/src/components/desktop-layout.tsx`
- **TabBar** — `apps/desktop/src/renderer/src/components/tab-bar.tsx`
- **TabContent** — `apps/desktop/src/renderer/src/components/tab-content.tsx`
- **IssueDetailPage** — `apps/desktop/src/renderer/src/pages/issue-detail-page.tsx`
- **DesktopLoginPage** — `apps/desktop/src/renderer/src/pages/login.tsx`
- **ProjectDetailPage** — `apps/desktop/src/renderer/src/pages/project-detail-page.tsx`
- **DesktopNavigationProvider** — `apps/desktop/src/renderer/src/platform/navigation.tsx`
- **TabNavigationProvider** — props: router — `apps/desktop/src/renderer/src/platform/navigation.tsx`
- **TitleSync** — `apps/desktop/src/renderer/src/routes.tsx`
- **Layout** — `apps/docs/app/(home)/layout.tsx`
- **HomePage** — `apps/docs/app/(home)/page.tsx`
- **Page** — props: params — `apps/docs/app/docs/[[...slug]]/page.tsx`
- **Layout** — `apps/docs/app/docs/layout.tsx`
- **Layout** — `apps/docs/app/layout.tsx`
- **Page** [client] — `apps/web/app/(auth)/login/page.tsx`
- **IssueDetailPage** [client] — props: params — `apps/web/app/(dashboard)/issues/[id]/page.tsx`
- **Page** [client] — `apps/web/app/(dashboard)/issues/page.tsx`
- **Layout** [client] — `apps/web/app/(dashboard)/layout.tsx`
- **DashboardLoading** — `apps/web/app/(dashboard)/loading.tsx`
- **Page** [client] — `apps/web/app/(dashboard)/my-issues/page.tsx`
- **ProjectDetailPage** [client] — props: params — `apps/web/app/(dashboard)/projects/[id]/page.tsx`
- **Page** [client] — `apps/web/app/(dashboard)/projects/page.tsx`
- **WikiPage** [client] — `apps/web/app/(dashboard)/wiki/page.tsx`
- **AboutPage** — `apps/web/app/(landing)/about/page.tsx`
- **ChangelogPage** — `apps/web/app/(landing)/changelog/page.tsx`
- **HomepagePage** — `apps/web/app/(landing)/homepage/page.tsx`
- **LandingLayout** — `apps/web/app/(landing)/layout.tsx`
- **LandingPage** — `apps/web/app/(landing)/page.tsx`
- **CallbackPage** [client] — `apps/web/app/auth/callback/page.tsx`
- **RootLayout** — `apps/web/app/layout.tsx`
- **LocaleSync** [client] — `apps/web/components/locale-sync.tsx`
- **WebProviders** [client] — `apps/web/components/web-providers.tsx`
- **AboutPageClient** [client] — `apps/web/features/landing/components/about-page-client.tsx`
- **ChangelogPageClient** [client] — `apps/web/features/landing/components/changelog-page-client.tsx`
- **FAQSection** [client] — `apps/web/features/landing/components/faq-section.tsx`
- **FeaturesSection** [client] — `apps/web/features/landing/components/features-section.tsx`
- **HowItWorksSection** [client] — `apps/web/features/landing/components/how-it-works-section.tsx`
- **LandingFooter** [client] — `apps/web/features/landing/components/landing-footer.tsx`
- **LandingHeader** [client] — props: variant — `apps/web/features/landing/components/landing-header.tsx`
- **LandingHero** [client] — `apps/web/features/landing/components/landing-hero.tsx`
- **MulticaLanding** [client] — `apps/web/features/landing/components/multica-landing.tsx`
- **OpenSourceSection** [client] — `apps/web/features/landing/components/open-source-section.tsx`
- **GitHubMark** — props: className — `apps/web/features/landing/components/shared.tsx`
- **XMark** — props: className — `apps/web/features/landing/components/shared.tsx`
- **ImageIcon** — props: className — `apps/web/features/landing/components/shared.tsx`
- **ClaudeCodeLogo** — props: className — `apps/web/features/landing/components/shared.tsx`
- **CodexLogo** — props: className — `apps/web/features/landing/components/shared.tsx`
- **OpenClawLogo** — props: className — `apps/web/features/landing/components/shared.tsx`
- **OpenCodeLogo** — props: className — `apps/web/features/landing/components/shared.tsx`
- **LocaleProvider** [client] — props: initialLocale — `apps/web/features/landing/i18n/context.tsx`
- **WikiEditor** — props: id, title, content, ancestors, onNavigateTo, onUpdateTitle, onUpdateContent, onSave, onUploadFile, onDelete — `apps/web/features/wiki/components/WikiEditor.tsx`
- **WikiPropertySidebar** [client] — props: wikiId, createdBy, updatedBy, createdAt, updatedAt, onRestore — `apps/web/features/wiki/components/WikiPropertySidebar.tsx`
- **WikiSidebar** [client] — props: nodes, isLoading, onCreateNew, onSelect, selectedId, isCollaborating, onDeleteMultiple, onDuplicateMultiple, onMove — `apps/web/features/wiki/components/WikiSidebar.tsx`
- **WikiView** [client] — `apps/web/features/wiki/components/WikiView.tsx`
- **WebNavigationProvider** [client] — `apps/web/platform/navigation.tsx`
- **WorkspaceIdProvider** [client] — props: wsId — `packages/core/hooks.tsx`
- **ViewStoreProvider** [client] — props: store — `packages/core/issues/stores/view-store-context.tsx`
- **AuthInitializer** [client] — props: onLogin, onLogout, storage — `packages/core/platform/auth-initializer.tsx`
- **CoreProvider** [client] — props: apiBaseUrl, wsUrl, storage, onLogin, onLogout — `packages/core/platform/core-provider.tsx`
- **QueryProvider** [client] — props: showDevtools — `packages/core/provider.tsx`
- **WSProvider** [client] — props: wsUrl, authStore, workspaceStore, storage, onToast — `packages/core/realtime/provider.tsx`
- **AgentDetail** [client] — props: agent, runtimes, onUpdate, onArchive, onRestore — `packages/views/agents/components/agent-detail.tsx`
- **AgentListItem** [client] — props: agent, isSelected, onClick — `packages/views/agents/components/agent-list-item.tsx`
- **AgentsPage** [client] — `packages/views/agents/components/agents-page.tsx`
- **CreateAgentDialog** [client] — props: runtimes, runtimesLoading, onClose, onCreate — `packages/views/agents/components/create-agent-dialog.tsx`
- **InstructionsTab** [client] — props: agent, onSave — `packages/views/agents/components/tabs/instructions-tab.tsx`
- **SettingsTab** [client] — props: agent, runtimes, onSave — `packages/views/agents/components/tabs/settings-tab.tsx`
- **SkillsTab** [client] — props: agent — `packages/views/agents/components/tabs/skills-tab.tsx`
- **TasksTab** [client] — props: agent — `packages/views/agents/components/tabs/tasks-tab.tsx`
- **LoginPage** [client] — props: logo, onSuccess, google, cliCallback, lastWorkspaceId, onTokenObtained — `packages/views/auth/login-page.tsx`
- **ChatFab** [client] — `packages/views/chat/components/chat-fab.tsx`
- **ChatInput** [client] — props: onSend, onStop, isRunning, disabled — `packages/views/chat/components/chat-input.tsx`
- **ChatMessageList** [client] — props: messages, agent, timelineItems, isWaiting — `packages/views/chat/components/chat-message-list.tsx`
- **ChatSessionHistory** [client] — `packages/views/chat/components/chat-session-history.tsx`
- **ChatWindow** [client] — `packages/views/chat/components/chat-window.tsx`
- **ActorAvatar** [client] — props: actorType, actorId, size, className — `packages/views/common/actor-avatar.tsx`
- **Markdown** [client] — `packages/views/common/markdown.tsx`
- **PageListHeader** — props: title, count, actions, className — `packages/views/common/page-list-header.tsx`
- **ContentEditor** — props: defaultValue, onUpdate, placeholder, editable, className, debounceMs, onSubmit, onBlur, onUploadFile, showToolbar — `packages/views/editor/content-editor.tsx`
- **CodeBlockView** [client] — props: node, editor — `packages/views/editor/extensions/code-block-view.tsx`
- **FileCardExtension** [client] — `packages/views/editor/extensions/file-card.tsx`
- **ImageLightbox** [client] — props: src, alt, onClose — `packages/views/editor/extensions/image-view.tsx`
- **MentionList** [client] — props: items, command — `packages/views/editor/extensions/mention-suggestion.tsx`
- **MentionView** [client] — props: node — `packages/views/editor/extensions/mention-view.tsx`
- **FileDropOverlay** — `packages/views/editor/file-drop-overlay.tsx`
- **MermaidViewer** [client] — props: content — `packages/views/editor/mermaid-viewer.tsx`
- **ReadonlyContent** [client] — props: content, className — `packages/views/editor/readonly-content.tsx`
- **SingleLineDocument** [client] — props: defaultValue, placeholder, className, autoFocus, onSubmit, onBlur, onChange — `packages/views/editor/title-editor.tsx`
- **InboxDetailLabel** [client] — props: item — `packages/views/inbox/components/inbox-detail-label.tsx`
- **InboxListItem** [client] — props: item, isSelected, onClick, onArchive — `packages/views/inbox/components/inbox-list-item.tsx`
- **InboxPage** [client] — `packages/views/inbox/components/inbox-page.tsx`
- **AgentLiveCard** [client] — props: issueId — `packages/views/issues/components/agent-live-card.tsx`
- **TaskRunHistory** [client] — props: issueId — `packages/views/issues/components/agent-live-card.tsx`
- **AgentTranscriptDialog** [client] — props: open, onOpenChange, task, items, agentName, isLive — `packages/views/issues/components/agent-transcript-dialog.tsx`
- **BatchActionToolbar** [client] — `packages/views/issues/components/batch-action-toolbar.tsx`
- **BoardCardContent** [client] — props: issue, editable, childProgress — `packages/views/issues/components/board-card.tsx`
- **DraggableBoardCard** [client] — props: issue, childProgress — `packages/views/issues/components/board-card.tsx`
- **BoardColumn** [client] — props: status, issueIds, issueMap, childProgressMap, totalCount, footer — `packages/views/issues/components/board-column.tsx`
- **BoardView** [client] — props: issues, allIssues, visibleStatuses, hiddenStatuses, onMoveIssue, childProgressMap, doneTotalOverride, myIssuesScope, myIssuesFilter — `packages/views/issues/components/board-view.tsx`
- **DeleteCommentDialog** [client] — props: issueId, entry, allReplies, currentUserId, onReply, onEdit, onDelete, onToggleReaction, highlightedCommentId — `packages/views/issues/components/comment-card.tsx`
- **CommentInput** [client] — props: issueId, onSubmit — `packages/views/issues/components/comment-input.tsx`
- **InfiniteScrollSentinel** [client] — props: onVisible, loading — `packages/views/issues/components/infinite-scroll-sentinel.tsx`
- **IssueDetail** [client] — props: issueId, onDelete, defaultSidebarOpen, layoutId, highlightCommentId — `packages/views/issues/components/issue-detail.tsx`
- **IssueMentionCard** [client] — props: issueId, fallbackLabel — `packages/views/issues/components/issue-mention-card.tsx`
- **IssuesHeader** [client] — props: scopedIssues — `packages/views/issues/components/issues-header.tsx`
- **IssuesPage** [client] — `packages/views/issues/components/issues-page.tsx`
- **ListRow** [client] — props: issue, childProgress — `packages/views/issues/components/list-row.tsx`
- **ListView** [client] — props: issues, visibleStatuses, childProgressMap, doneTotalOverride, myIssuesScope, myIssuesFilter — `packages/views/issues/components/list-view.tsx`
- **AssigneePicker** [client] — props: assigneeType, assigneeId, onUpdate, customTrigger, triggerRender, controlledOpen, controlledOnOpenChange, align — `packages/views/issues/components/pickers/assignee-picker.tsx`
- **DueDatePicker** [client] — props: dueDate, onUpdate, customTrigger, triggerRender, align — `packages/views/issues/components/pickers/due-date-picker.tsx`
- **PriorityPicker** [client] — props: priority, onUpdate, customTrigger, triggerRender, controlledOpen, controlledOnOpenChange, align — `packages/views/issues/components/pickers/priority-picker.tsx`
- **PropertyPicker** [client] — props: open, onOpenChange, trigger, triggerRender, width, align, searchable, searchPlaceholder, onSearchChange — `packages/views/issues/components/pickers/property-picker.tsx`
- **PickerItem** [client] — props: selected, disabled, onClick, hoverClassName — `packages/views/issues/components/pickers/property-picker.tsx`
- **PickerSection** [client] — props: label — `packages/views/issues/components/pickers/property-picker.tsx`
- **PickerEmpty** [client] — `packages/views/issues/components/pickers/property-picker.tsx`
- **StatusPicker** [client] — props: status, onUpdate, customTrigger, triggerRender, controlledOpen, controlledOnOpenChange, align — `packages/views/issues/components/pickers/status-picker.tsx`
- **PriorityIcon** — props: priority, className, inheritColor — `packages/views/issues/components/priority-icon.tsx`
- **ProgressRing** — props: done, total, size — `packages/views/issues/components/progress-ring.tsx`
- **ReplyInput** [client] — props: issueId, placeholder, avatarType, avatarId, onSubmit, size — `packages/views/issues/components/reply-input.tsx`
- **StatusIcon** — props: status, className, inheritColor — `packages/views/issues/components/status-icon.tsx`
- **AppSidebar** [client] — props: topSlot, searchSlot, headerClassName, headerStyle — `packages/views/layout/app-sidebar.tsx`
- **DashboardGuard** [client] — props: loginPath, loadingFallback — `packages/views/layout/dashboard-guard.tsx`
- **DashboardLayout** [client] — props: extra, searchSlot, loadingIndicator — `packages/views/layout/dashboard-layout.tsx`
- **CreateIssueModal** [client] — props: onClose, data — `packages/views/modals/create-issue.tsx`
- **CreateWorkspaceModal** [client] — props: onClose — `packages/views/modals/create-workspace.tsx`
- **ModalRegistry** [client] — `packages/views/modals/registry.tsx`
- **MyIssuesHeader** [client] — props: allIssues — `packages/views/my-issues/components/my-issues-header.tsx`
- **MyIssuesPage** [client] — `packages/views/my-issues/components/my-issues-page.tsx`
- **AppLink** [client] — props: href, onClick — `packages/views/navigation/app-link.tsx`
- **NavigationProvider** [client] — props: value — `packages/views/navigation/context.tsx`
- **ProjectDetail** [client] — props: projectId — `packages/views/projects/components/project-detail.tsx`
- **ProjectPicker** [client] — props: projectId, onUpdate, triggerRender, align — `packages/views/projects/components/project-picker.tsx`
- **ProjectsPage** [client] — `packages/views/projects/components/projects-page.tsx`
- **ActivityHeatmap** — props: usage — `packages/views/runtimes/components/charts/activity-heatmap.tsx`
- **DailyCostChart** — props: data — `packages/views/runtimes/components/charts/daily-cost-chart.tsx`
- **DailyTokenChart** — props: data — `packages/views/runtimes/components/charts/daily-token-chart.tsx`
- **HourlyActivityChart** — props: runtimeId — `packages/views/runtimes/components/charts/hourly-activity-chart.tsx`
- **ModelDistributionChart** — props: data — `packages/views/runtimes/components/charts/model-distribution-chart.tsx`
- **PingSection** — props: runtimeId — `packages/views/runtimes/components/ping-section.tsx`
- **ProviderLogo** — props: provider, className — `packages/views/runtimes/components/provider-logo.tsx`
- **RuntimeDetail** [client] — props: runtime — `packages/views/runtimes/components/runtime-detail.tsx`
- **RuntimeList** — props: runtimes, selectedId, onSelect, filter, onFilterChange, ownerFilter, onOwnerFilterChange, updatableIds — `packages/views/runtimes/components/runtime-list.tsx`
- **RuntimesPage** [client] — `packages/views/runtimes/components/runtimes-page.tsx`
- **RuntimeModeIcon** — props: mode — `packages/views/runtimes/components/shared.tsx`
- **StatusBadge** — props: status — `packages/views/runtimes/components/shared.tsx`
- **InfoField** — props: label, value, mono — `packages/views/runtimes/components/shared.tsx`
- **TokenCard** — props: label, value — `packages/views/runtimes/components/shared.tsx`
- **UpdateSection** — props: runtimeId, currentVersion, isOnline — `packages/views/runtimes/components/update-section.tsx`
- **UsageSection** [client] — props: runtimeId — `packages/views/runtimes/components/usage-section.tsx`
- **SearchCommand** [client] — `packages/views/search/search-command.tsx`
- **SearchTrigger** [client] — `packages/views/search/search-trigger.tsx`
- **AccountTab** [client] — `packages/views/settings/components/account-tab.tsx`
- **AppearanceTab** [client] — `packages/views/settings/components/appearance-tab.tsx`
- **MembersTab** [client] — `packages/views/settings/components/members-tab.tsx`
- **RepositoriesTab** [client] — `packages/views/settings/components/repositories-tab.tsx`
- **SettingsPage** [client] — `packages/views/settings/components/settings-page.tsx`
- **TokensTab** [client] — `packages/views/settings/components/tokens-tab.tsx`
- **WorkspaceTab** [client] — `packages/views/settings/components/workspace-tab.tsx`
- **FileTree** [client] — props: filePaths, selectedPath, onSelect — `packages/views/skills/components/file-tree.tsx`
- **FileViewer** [client] — props: path, content, onChange — `packages/views/skills/components/file-viewer.tsx`
- **SkillsPage** [client] — `packages/views/skills/components/skills-page.tsx`
- **WorkspaceAvatar** — props: name, size, className — `packages/views/workspace/workspace-avatar.tsx`

---

# Libraries

- `apps/desktop/src/renderer/src/hooks/use-document-title.ts` — function useDocumentTitle: (title) => void
- `apps/desktop/src/renderer/src/hooks/use-tab-history.ts` — function useTabHistory: () => void, const popDirectionHints
- `apps/desktop/src/renderer/src/hooks/use-tab-router-sync.ts` — function useTabRouterSync: (tabId, router) => void
- `apps/desktop/src/renderer/src/hooks/use-tab-sync.ts` — function useActiveTitleSync: () => void
- `apps/desktop/src/renderer/src/stores/tab-store.ts`
  - function resolveRouteIcon: (pathname) => string
  - interface Tab
  - const useTabStore
- `apps/web/features/auth/auth-cookie.ts` — function setLoggedInCookie: () => void, function clearLoggedInCookie: () => void
- `apps/web/proxy.ts` — function proxy: (request) => void, const config
- `e2e/fixtures.ts` — class TestApiClient
- `e2e/helpers.ts`
  - function loginAsDefault: (page) => void
  - function createTestApi: () => Promise<TestApiClient>
  - function openWorkspaceMenu: (page) => void
- `packages/core/api/client.ts`
  - class ApiClient
  - interface ApiClientOptions
  - interface LoginResponse
- `packages/core/api/index.ts`
  - function setApiInstance: (instance) => void
  - function getApi: () => ApiClientType
  - const api
- `packages/core/api/ws-client.ts` — class WSClient
- `packages/core/auth/index.ts` — function registerAuthStore: (store) => void, const useAuthStore: AuthStoreInstance
- `packages/core/auth/store.ts`
  - function createAuthStore: (options) => void
  - interface AuthStoreOptions
  - interface AuthState
- `packages/core/chat/index.ts` — function registerChatStore: (store) => void, const useChatStore: ChatStoreInstance
- `packages/core/chat/mutations.ts` — function useCreateChatSession: () => void, function useArchiveChatSession: () => void
- `packages/core/chat/queries.ts`
  - function chatSessionsOptions: (wsId) => void
  - function allChatSessionsOptions: (wsId) => void
  - function chatSessionOptions: (wsId, id) => void
  - function chatMessagesOptions: (sessionId) => void
  - const chatKeys
- `packages/core/chat/store.ts`
  - function createChatStore: (options) => void
  - interface ChatTimelineItem
  - interface ChatState
  - interface ChatStoreOptions
- `packages/core/hooks/use-file-upload.ts`
  - function useFileUpload: (api, onError?) => void
  - interface UploadResult
  - interface UploadContext
- `packages/core/inbox/mutations.ts`
  - function useMarkInboxRead: () => void
  - function useArchiveInbox: () => void
  - function useMarkAllInboxRead: () => void
  - function useArchiveAllInbox: () => void
  - function useArchiveAllReadInbox: () => void
  - function useArchiveCompletedInbox: () => void
- `packages/core/inbox/queries.ts`
  - function inboxListOptions: (wsId) => void
  - function deduplicateInboxItems: (items) => InboxItem[]
  - const inboxKeys
- `packages/core/inbox/ws-updaters.ts`
  - function onInboxNew: (qc, wsId, _item) => void
  - function onInboxIssueStatusChanged: (qc, wsId, issueId, status) => void
  - function onInboxInvalidate: (qc, wsId) => void
- `packages/core/issues/mutations.ts`
  - function useLoadMoreDoneIssues: (myIssues?) => void
  - function useCreateIssue: () => void
  - function useUpdateIssue: () => void
  - function useDeleteIssue: () => void
  - function useBatchUpdateIssues: () => void
  - function useBatchDeleteIssues: () => void
  - _...8 more_
- `packages/core/issues/queries.ts`
  - function issueListOptions: (wsId) => void
  - function myIssueListOptions: (wsId, scope, filter) => void
  - function issueDetailOptions: (wsId, id) => void
  - function childIssuesOptions: (wsId, id) => void
  - function issueTimelineOptions: (issueId) => void
  - function issueReactionsOptions: (issueId) => void
  - _...5 more_
- `packages/core/issues/stores/view-store.ts`
  - function createIssueViewStore: (persistKey) => StoreApi<IssueViewState>
  - function registerViewStoreForWorkspaceSync: (store, subscribeToWorkspace?) => void
  - function viewStoreSlice
  - function viewStorePersistOptions
  - function initFilterWorkspaceSync
  - interface CardProperties
  - _...8 more_
- `packages/core/issues/ws-updaters.ts`
  - function onIssueCreated: (qc, wsId, issue) => void
  - function onIssueUpdated: (qc, wsId, issue) => void
  - function onIssueDeleted: (qc, wsId, issueId) => void
- `packages/core/logger.ts`
  - function createLogger: (namespace) => Logger
  - interface Logger
  - const noopLogger: Logger
- `packages/core/pins/mutations.ts`
  - function useCreatePin: () => void
  - function useDeletePin: () => void
  - function useReorderPins: () => void
- `packages/core/pins/queries.ts` — function pinListOptions: (wsId) => void, const pinKeys
- `packages/core/platform/persist-storage.ts` — function createPersistStorage: (adapter) => StateStorage
- `packages/core/platform/storage-cleanup.ts` — function clearWorkspaceStorage: (adapter, wsId) => void
- `packages/core/platform/workspace-storage.ts`
  - function setCurrentWorkspaceId: (wsId) => void
  - function registerForWorkspaceRehydration: (fn) => void
  - function rehydrateAllWorkspaceStores: () => void
  - function getCurrentWorkspaceId: () => string | null
  - function createWorkspaceAwareStorage: (adapter) => StateStorage
- `packages/core/projects/mutations.ts`
  - function useCreateProject: () => void
  - function useUpdateProject: () => void
  - function useDeleteProject: () => void
- `packages/core/projects/queries.ts`
  - function projectListOptions: (wsId) => void
  - function projectDetailOptions: (wsId, id) => void
  - const projectKeys
- `packages/core/query-client.ts` — function createQueryClient: () => QueryClient
- `packages/core/realtime/hooks.ts` — function useWSEvent: (event, handler) => void, function useWSReconnect: (callback) => void
- `packages/core/realtime/use-realtime-sync.ts` — function useRealtimeSync: (ws, stores, onToast?, type?) => void, interface RealtimeSyncStores
- `packages/core/runtimes/hooks.ts` — function useMyRuntimesNeedUpdate: (wsId) => boolean, function useUpdatableRuntimeIds: (wsId) => Set<string>
- `packages/core/runtimes/mutations.ts` — function useDeleteRuntime: (wsId) => void
- `packages/core/runtimes/queries.ts`
  - function runtimeListOptions: (wsId, owner?) => void
  - function latestCliVersionOptions: () => void
  - const runtimeKeys
- `packages/core/utils.ts` — function timeAgo: (dateStr) => string
- `packages/core/workspace/hooks.ts` — function useActorName: () => void
- `packages/core/workspace/index.ts` — function registerWorkspaceStore: (store) => void, const useWorkspaceStore: WorkspaceStoreInstance
- `packages/core/workspace/mutations.ts`
  - function useCreateWorkspace: () => void
  - function useLeaveWorkspace: () => void
  - function useDeleteWorkspace: () => void
- `packages/core/workspace/queries.ts`
  - function workspaceListOptions: () => void
  - function memberListOptions: (wsId) => void
  - function agentListOptions: (wsId) => void
  - function skillListOptions: (wsId) => void
  - function assigneeFrequencyOptions: (wsId) => void
  - const workspaceKeys
- `packages/core/workspace/store.ts` — function createWorkspaceStore: (api, options?) => void, type WorkspaceStore
- `packages/ui/hooks/use-auto-scroll.ts` — function useAutoScroll: (ref) => void
- `packages/ui/hooks/use-mobile.ts` — function useIsMobile: () => void
- `packages/ui/hooks/use-scroll-fade.ts` — function useScrollFade: (ref, fadeSize) => CSSProperties | undefined
- `packages/ui/lib/utils.ts` — function cn: (...inputs) => void
- `packages/ui/markdown/linkify.ts`
  - function detectLinks: (text) => DetectedLink[]
  - function preprocessLinks: (text) => string
  - function hasLinks: (text) => boolean
- `packages/ui/markdown/mentions.ts` — function preprocessMentionShortcodes: (text) => string
- `server/cmd/server/router.go` — function NewRouter: (pool *pgxpool.Pool, hub *realtime.Hub, bus *events.Bus) chi.Router
- `server/internal/auth/cloudfront.go` — function NewCloudFrontSignerFromEnv: () *CloudFrontSigner, class CloudFrontSigner
- `server/internal/auth/jwt.go`
  - function JWTSecret: () []byte
  - function GeneratePATToken: () (string, error)
  - function GenerateDaemonToken: () (string, error)
  - function HashToken: (token string) string
- `server/internal/cli/client.go` — function NewAPIClient: (baseURL, workspaceID, token string) *APIClient, class APIClient
- `server/internal/cli/config.go`
  - function CLIConfigPath: () (string, error)
  - function CLIConfigPathForProfile: (profile string) (string, error)
  - function ProfileDir: (profile string) (string, error)
  - function LoadCLIConfig: () (CLIConfig, error)
  - function LoadCLIConfigForProfile: (profile string) (CLIConfig, error)
  - function SaveCLIConfig: (cfg CLIConfig) error
  - _...3 more_
- `server/internal/cli/flags.go` — function FlagOrEnv: (cmd *cobra.Command, flagName, envKey, fallback string) string
- `server/internal/cli/output.go` — function PrintTable: (w io.Writer, headers []string, rows [][]string), function PrintJSON: (w io.Writer, v any) error
- `server/internal/cli/update.go`
  - function FetchLatestRelease: () (*GitHubRelease, error)
  - function IsBrewInstall: () bool
  - function GetBrewPrefix: () string
  - function UpdateViaBrew: () (string, error)
  - function UpdateViaDownload: (targetVersion string) (string, error)
  - class GitHubRelease
- `server/internal/daemon/client.go`
  - function NewClient: (baseURL string) *Client
  - class Client
  - class TaskMessageData
  - class HeartbeatResponse
  - class PendingPing
  - class PendingUpdate
  - _...2 more_
- `server/internal/daemon/config.go`
  - function LoadConfig: (overrides Overrides) (Config, error)
  - function NormalizeServerBaseURL: (raw string) (string, error)
  - class Config
  - class Overrides
- `server/internal/daemon/daemon.go` — function New: (cfg Config, logger *slog.Logger) *Daemon, class Daemon
- `server/internal/daemon/execenv/execenv.go`
  - function Prepare: (params PrepareParams, logger *slog.Logger) (*Environment, error)
  - function Reuse: (workDir, provider string, task TaskContextForEnv, logger *slog.Logger) *Environment
  - class RepoContextForEnv
  - class PrepareParams
  - class TaskContextForEnv
  - class SkillContextForEnv
  - _...2 more_
- `server/internal/daemon/execenv/runtime_config.go` — function InjectRuntimeConfig: (workDir, provider string, ctx TaskContextForEnv) error
- `server/internal/daemon/health.go` — class HealthResponse
- `server/internal/daemon/prompt.go` — function BuildPrompt: (task Task) string
- `server/internal/daemon/repocache/cache.go`
  - function New: (root string, logger *slog.Logger) *Cache
  - class RepoInfo
  - class CachedRepo
  - class Cache
  - class WorktreeParams
  - class WorktreeResult
- `server/internal/daemon/types.go`
  - class AgentEntry
  - class Runtime
  - class RepoData
  - class Task
  - class AgentData
  - class SkillData
  - _...3 more_
- `server/internal/daemon/usage/scanner.go`
  - function NewScanner: (logger *slog.Logger) *Scanner
  - class Record
  - class Scanner
- `server/internal/events/bus.go`
  - function New: () *Bus
  - class Event
  - class Bus
- `server/internal/handler/activity.go` — class TimelineEntry, class AssigneeFrequencyEntry
- `server/internal/handler/agent.go`
  - class AgentResponse
  - class RepoData
  - class AgentTaskResponse
  - class TaskAgentData
  - class CreateAgentRequest
  - class UpdateAgentRequest
- `server/internal/handler/auth.go`
  - class UserResponse
  - class LoginResponse
  - class SendCodeRequest
  - class VerifyCodeRequest
  - class UpdateMeRequest
  - class GoogleLoginRequest
- `server/internal/handler/chat.go`
  - class CreateChatSessionRequest
  - class SendChatMessageRequest
  - class SendChatMessageResponse
  - class ChatSessionResponse
  - class ChatMessageResponse
- `server/internal/handler/comment.go` — class CommentResponse, class CreateCommentRequest
- `server/internal/handler/daemon.go`
  - class DaemonRegisterRequest
  - class DaemonHeartbeatRequest
  - class TaskProgressRequest
  - class TaskCompleteRequest
  - class TaskUsagePayload
  - class TaskFailRequest
  - _...2 more_
- `server/internal/handler/file.go` — class AttachmentResponse
- `server/internal/handler/handler.go` — function New: (queries *db.Queries, txStarter txStarter, hub *realtime.Hub, bus *events.Bus, emailService *service.EmailService, s3 *storage.S3Storage, cfSigner *auth.CloudFrontSigner) *Handler, class Handler
- `server/internal/handler/inbox.go` — class InboxItemResponse
- `server/internal/handler/issue.go`
  - class IssueResponse
  - class SearchIssueResponse
  - class CreateIssueRequest
  - class UpdateIssueRequest
  - class BatchUpdateIssuesRequest
  - class BatchDeleteIssuesRequest
- `server/internal/handler/issue_reaction.go` — class IssueReactionResponse
- `server/internal/handler/personal_access_token.go`
  - class PersonalAccessTokenResponse
  - class CreatePATResponse
  - class CreatePATRequest
- `server/internal/handler/pin.go`
  - class PinnedItemResponse
  - class CreatePinRequest
  - class ReorderPinsRequest
  - class ReorderItem
- `server/internal/handler/project.go`
  - class ProjectResponse
  - class CreateProjectRequest
  - class UpdateProjectRequest
  - class SearchProjectResponse
- `server/internal/handler/reaction.go` — class ReactionResponse
- `server/internal/handler/runtime.go`
  - class AgentRuntimeResponse
  - class RuntimeUsageEntry
  - class RuntimeUsageResponse
- `server/internal/handler/runtime_ping.go`
  - function NewPingStore: () *PingStore
  - class PingRequest
  - class PingStore
- `server/internal/handler/runtime_update.go`
  - function NewUpdateStore: () *UpdateStore
  - class UpdateRequest
  - class UpdateStore
- `server/internal/handler/skill.go`
  - class SkillResponse
  - class SkillFileResponse
  - class SkillWithFilesResponse
  - class CreateSkillRequest
  - class CreateSkillFileRequest
  - class UpdateSkillRequest
  - _...2 more_
- `server/internal/handler/subscriber.go` — class SubscriberResponse
- `server/internal/handler/wiki.go`
  - class WikiResponse
  - class WikiVersionResponse
  - class CreateWikiRequest
  - class CollaborationWebhookRequest
- `server/internal/handler/wiki_snapshot.go` — function NewWikiSnapshotScheduler: (db dbExecutor) *WikiSnapshotScheduler, class WikiSnapshotScheduler
- `server/internal/handler/workspace.go`
  - class WorkspaceResponse
  - class MemberResponse
  - class CreateWorkspaceRequest
  - class UpdateWorkspaceRequest
  - class MemberWithUserResponse
  - class CreateMemberRequest
  - _...1 more_
- `server/internal/logger/logger.go`
  - function Init: ()
  - function NewLogger: (component string) *slog.Logger
  - function RequestAttrs: (r *http.Request) []any
- `server/internal/mention/expand.go`
  - function ExpandIssueIdentifiers: (ctx context.Context, resolver Resolver, workspaceID pgtype.UUID, content string) string
  - interface IssueResolver
  - interface PrefixResolver
  - interface Resolver
- `server/internal/middleware/auth.go` — function Auth: (queries *db.Queries) func(http.Handler) http.Handler
- `server/internal/middleware/cloudfront.go` — function RefreshCloudFrontCookies: (signer *auth.CloudFrontSigner) func(http.Handler) http.Handler
- `server/internal/middleware/daemon_auth.go`
  - function DaemonWorkspaceIDFromContext: (ctx context.Context) string
  - function DaemonIDFromContext: (ctx context.Context) string
  - function DaemonAuth: (queries *db.Queries) func(http.Handler) http.Handler
- `server/internal/middleware/request_logger.go` — function RequestLogger: (next http.Handler) http.Handler
- `server/internal/middleware/workspace.go`
  - function MemberFromContext: (ctx context.Context) (db.Member, bool)
  - function WorkspaceIDFromContext: (ctx context.Context) string
  - function SetMemberContext: (ctx context.Context, workspaceID string, member db.Member) context.Context
  - function RequireWorkspaceMember: (queries *db.Queries) func(http.Handler) http.Handler
  - function RequireWorkspaceRole: (queries *db.Queries, roles ...string) func(http.Handler) http.Handler
  - function RequireWorkspaceMemberFromURL: (queries *db.Queries, param string) func(http.Handler) http.Handler
  - _...1 more_
- `server/internal/realtime/hub.go`
  - function NewHub: () *Hub
  - function HandleWebSocket: (hub *Hub, mc MembershipChecker, pr PATResolver, w http.ResponseWriter, r *http.Request)
  - class Client
  - class Hub
  - interface MembershipChecker
  - interface PATResolver
- `server/internal/service/email.go` — function NewEmailService: () *EmailService, class EmailService
- `server/internal/service/task.go`
  - function NewTaskService: (q *db.Queries, hub *realtime.Hub, bus *events.Bus) *TaskService
  - class TaskService
  - class AgentSkillData
  - class AgentSkillFileData
- `server/internal/storage/s3.go` — function NewS3StorageFromEnv: () *S3Storage, class S3Storage
- `server/internal/util/mention.go`
  - function ParseMentions: (content string) []Mention
  - function HasMentionAll: (mentions []Mention) bool
  - class Mention
- `server/internal/util/pgx.go`
  - function ParseUUID: (s string) pgtype.UUID
  - function UUIDToString: (u pgtype.UUID) string
  - function TextToPtr: (t pgtype.Text) *string
  - function PtrToText: (s *string) pgtype.Text
  - function StrToText: (s string) pgtype.Text
  - function TimestampToString: (t pgtype.Timestamptz) string
  - _...2 more_
- `server/pkg/agent/agent.go`
  - function New: (agentType string, cfg Config) (Backend, error)
  - function DetectVersion: (ctx context.Context, executablePath string) (string, error)
  - class ExecOptions
  - class Session
  - class Message
  - class TokenUsage
  - _...3 more_
- `server/pkg/agent/version.go` — function CheckMinVersion: (agentType, detectedVersion string) error
- `server/pkg/db/generated/activity.sql.go`
  - class CountAssigneeChangesByActorParams
  - class CountAssigneeChangesByActorRow
  - class CreateActivityParams
  - class ListActivitiesParams
- `server/pkg/db/generated/agent.sql.go`
  - class ArchiveAgentParams
  - class CompleteAgentTaskParams
  - class CreateAgentParams
  - class CreateAgentTaskParams
  - class FailAgentTaskParams
  - class FailStaleTasksParams
  - _...7 more_
- `server/pkg/db/generated/attachment.sql.go`
  - class CreateAttachmentParams
  - class DeleteAttachmentParams
  - class GetAttachmentParams
  - class LinkAttachmentsToCommentParams
  - class LinkAttachmentsToIssueParams
  - class ListAttachmentsByCommentParams
  - _...1 more_
- `server/pkg/db/generated/chat.sql.go`
  - class CreateChatMessageParams
  - class CreateChatSessionParams
  - class CreateChatTaskParams
  - class GetChatSessionInWorkspaceParams
  - class GetLastChatTaskSessionRow
  - class ListAllChatSessionsByCreatorParams
  - _...3 more_
- `server/pkg/db/generated/comment.sql.go`
  - class CountCommentsParams
  - class CreateCommentParams
  - class GetCommentInWorkspaceParams
  - class ListCommentsParams
  - class ListCommentsPaginatedParams
  - class ListCommentsSinceParams
  - _...2 more_
- `server/pkg/db/generated/daemon_token.sql.go` — class CreateDaemonTokenParams, class DeleteDaemonTokensByWorkspaceAndDaemonParams
- `server/pkg/db/generated/db.go`
  - function New: (db DBTX) *Queries
  - class Queries
  - interface DBTX
- `server/pkg/db/generated/inbox.sql.go`
  - class ArchiveAllInboxParams
  - class ArchiveAllReadInboxParams
  - class ArchiveCompletedInboxParams
  - class ArchiveInboxByIssueParams
  - class CountUnreadInboxParams
  - class CreateInboxItemParams
  - _...4 more_
- `server/pkg/db/generated/issue.sql.go`
  - class CountCreatedIssueAssigneesParams
  - class CountCreatedIssueAssigneesRow
  - class CountIssuesParams
  - class CreateIssueParams
  - class GetIssueByNumberParams
  - class GetIssueInWorkspaceParams
  - _...6 more_
- `server/pkg/db/generated/issue_reaction.sql.go` — class AddIssueReactionParams, class RemoveIssueReactionParams
- `server/pkg/db/generated/member.sql.go`
  - class CreateMemberParams
  - class GetMemberByUserAndWorkspaceParams
  - class ListMembersWithUserRow
  - class UpdateMemberRoleParams
- `server/pkg/db/generated/models.go`
  - class ActivityLog
  - class Agent
  - class AgentRuntime
  - class AgentSkill
  - class AgentTaskQueue
  - class Attachment
  - _...25 more_
- `server/pkg/db/generated/personal_access_token.sql.go` — class CreatePersonalAccessTokenParams, class RevokePersonalAccessTokenParams
- `server/pkg/db/generated/pinned_item.sql.go`
  - class CreatePinnedItemParams
  - class DeletePinnedItemParams
  - class DeletePinnedItemsByItemParams
  - class GetMaxPinnedItemPositionParams
  - class ListPinnedItemsParams
  - class UpdatePinnedItemPositionParams
- `server/pkg/db/generated/project.sql.go`
  - class CreateProjectParams
  - class GetProjectInWorkspaceParams
  - class GetProjectIssueStatsRow
  - class ListProjectsParams
  - class UpdateProjectParams
- `server/pkg/db/generated/reaction.sql.go` — class AddReactionParams, class RemoveReactionParams
- `server/pkg/db/generated/runtime.sql.go`
  - class FailTasksForOfflineRuntimesRow
  - class GetAgentRuntimeForWorkspaceParams
  - class ListAgentRuntimesByOwnerParams
  - class MarkStaleRuntimesOfflineRow
  - class UpsertAgentRuntimeParams
- `server/pkg/db/generated/runtime_usage.sql.go`
  - class GetRuntimeTaskHourlyActivityRow
  - class GetRuntimeUsageSummaryRow
  - class ListRuntimeUsageParams
  - class UpsertRuntimeUsageParams
- `server/pkg/db/generated/skill.sql.go`
  - class AddAgentSkillParams
  - class CreateSkillParams
  - class GetSkillInWorkspaceParams
  - class ListAgentSkillsByWorkspaceRow
  - class RemoveAgentSkillParams
  - class UpdateSkillParams
  - _...1 more_
- `server/pkg/db/generated/subscriber.sql.go`
  - class AddIssueSubscriberParams
  - class IsIssueSubscriberParams
  - class RemoveIssueSubscriberParams
- `server/pkg/db/generated/task_message.sql.go` — class CreateTaskMessageParams, class ListTaskMessagesSinceParams
- `server/pkg/db/generated/task_usage.sql.go`
  - class GetIssueUsageSummaryRow
  - class GetWorkspaceUsageByDayParams
  - class GetWorkspaceUsageByDayRow
  - class GetWorkspaceUsageSummaryParams
  - class GetWorkspaceUsageSummaryRow
  - class UpsertTaskUsageParams
- `server/pkg/db/generated/user.sql.go` — class CreateUserParams, class UpdateUserParams
- `server/pkg/db/generated/verification_code.sql.go` — class CreateVerificationCodeParams
- `server/pkg/db/generated/workspace.sql.go` — class CreateWorkspaceParams, class UpdateWorkspaceParams
- `server/pkg/protocol/messages.go`
  - class Message
  - class TaskDispatchPayload
  - class TaskProgressPayload
  - class TaskCompletedPayload
  - class TaskMessagePayload
  - class DaemonRegisterPayload
  - _...4 more_
- `server/pkg/redact/redact.go` — function InputMap: (m map[string]any) map[string]any, function Text: (s string) string

---

# Config

## Environment Variables

- `APP_ENV` **required** — server/internal/handler/auth.go
- `AWS_ACCESS_KEY_ID` (has default) — .env.example
- `AWS_SECRET_ACCESS_KEY` (has default) — .env.example
- `BACKEND_URL` (has default) — .env
- `CLAUDE_CONFIG_DIR` **required** — server/internal/daemon/usage/claude.go
- `CLOUDFRONT_DOMAIN` **required** — .env.example
- `CLOUDFRONT_KEY_PAIR_ID` **required** — .env.example
- `CLOUDFRONT_PRIVATE_KEY` **required** — .env.example
- `CLOUDFRONT_PRIVATE_KEY_SECRET` (has default) — .env.example
- `CODEX_HOME` **required** — server/internal/daemon/execenv/codex_home.go
- `COLLABORATION_PORT` (has default) — .env.example
- `COLLABORATION_WEBHOOK_SECRET` (has default) — .env.example
- `COOKIE_DOMAIN` **required** — .env.example
- `CORS_ALLOWED_ORIGINS` **required** — apps/web/next.config.ts
- `DATABASE_URL` (has default) — .env.example
- `ELECTRON_RENDERER_URL` **required** — apps/desktop/src/main/index.ts
- `FRONTEND_ORIGIN` (has default) — .env.example
- `FRONTEND_PORT` (has default) — .env.example
- `GOOGLE_CLIENT_ID` **required** — .env.example
- `GOOGLE_CLIENT_SECRET` **required** — .env.example
- `GOOGLE_REDIRECT_URI` (has default) — .env.example
- `JWT_SECRET` (has default) — .env.example
- `LOG_LEVEL` **required** — server/internal/logger/logger.go
- `MINIO_CONSOLE_PORT` (has default) — .env.example
- `MINIO_DATA_DIR` (has default) — .env.example
- `MINIO_PORT` (has default) — .env.example
- `MINIO_ROOT_PASSWORD` (has default) — .env.example
- `MINIO_ROOT_USER` (has default) — .env.example
- `MULTICA_AGENT_ID` **required** — server/cmd/multica/cmd_agent.go
- `MULTICA_AGENT_NAME` **required** — server/cmd/multica/cmd_repo.go
- `MULTICA_APP_URL` (has default) — .env.example
- `MULTICA_CLAUDE_MODEL` **required** — server/internal/daemon/config.go
- `MULTICA_CODEX_MODEL` **required** — .env.example
- `MULTICA_CODEX_PATH` (has default) — .env.example
- `MULTICA_CODEX_TIMEOUT` (has default) — .env.example
- `MULTICA_CODEX_WORKDIR` **required** — .env.example
- `MULTICA_DAEMON_CONFIG` **required** — .env.example
- `MULTICA_DAEMON_DEVICE_NAME` **required** — .env.example
- `MULTICA_DAEMON_HEARTBEAT_INTERVAL` (has default) — .env.example
- `MULTICA_DAEMON_ID` **required** — .env.example
- `MULTICA_DAEMON_POLL_INTERVAL` (has default) — .env.example
- `MULTICA_DAEMON_PORT` **required** — server/cmd/multica/cmd_repo.go
- `MULTICA_HERMES_MODEL` **required** — server/internal/daemon/config.go
- `MULTICA_KEEP_ENV_AFTER_TASK` **required** — server/internal/daemon/config.go
- `MULTICA_OPENCLAW_MODEL` **required** — server/internal/daemon/config.go
- `MULTICA_OPENCODE_MODEL` **required** — server/internal/daemon/config.go
- `MULTICA_SERVER_URL` (has default) — .env.example
- `MULTICA_TASK_ID` **required** — server/cmd/multica/cmd_agent.go
- `MULTICA_TOKEN` **required** — server/cmd/multica/cmd_auth.go
- `MULTICA_WORKSPACE_ID` **required** — .env.example
- `MULTICA_WORKSPACES_ROOT` **required** — server/internal/daemon/config.go
- `NEXT_PUBLIC_API_URL` (has default) — .env.example
- `NEXT_PUBLIC_COLLAB_URL` (has default) — .env
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` **required** — .env.example
- `NEXT_PUBLIC_WS_URL` (has default) — .env.example
- `NODE_ENV` **required** — apps/web/components/theme-provider.tsx
- `PATH` **required** — server/internal/daemon/daemon.go
- `PLAYWRIGHT_BASE_URL` **required** — playwright.config.ts
- `PORT` (has default) — .env.example
- `POSTGRES_DB` (has default) — .env.example
- `POSTGRES_PASSWORD` (has default) — .env.example
- `POSTGRES_PORT` (has default) — .env.example
- `POSTGRES_USER` (has default) — .env.example
- `REMOTE_API_URL` **required** — apps/web/next.config.ts
- `RESEND_API_KEY` **required** — .env.example
- `RESEND_FROM_EMAIL` (has default) — .env.example
- `S3_BUCKET` (has default) — .env.example
- `S3_ENDPOINT` (has default) — .env.example
- `S3_REGION` (has default) — .env.example
- `STANDALONE` **required** — apps/web/next.config.ts
- `VITE_API_URL` **required** — apps/desktop/src/renderer/src/App.tsx
- `VITE_WS_URL` **required** — apps/desktop/src/renderer/src/App.tsx

## Config Files

- `.env.example`
- `Dockerfile`
- `apps/docs/next.config.mjs`
- `apps/web/next.config.ts`
- `docker-compose.yml`

---

# Middleware

## auth
- auth-cookie — `apps/web/features/auth/auth-cookie.ts`
- auth.spec — `e2e/auth.spec.ts`
- auth-initializer — `packages/core/platform/auth-initializer.tsx`
- dashboard-guard — `packages/views/layout/dashboard-guard.tsx`
- use-dashboard-guard — `packages/views/layout/use-dashboard-guard.ts`
- auth — `server/internal/handler/auth.go`
- auth — `server/internal/middleware/auth.go`
- auth_test — `server/internal/middleware/auth_test.go`
- cloudfront — `server/internal/middleware/cloudfront.go`
- daemon_auth — `server/internal/middleware/daemon_auth.go`

## logging
- request_logger — `server/internal/middleware/request_logger.go`

## custom
- workspace — `server/internal/middleware/workspace.go`
- 022_task_lifecycle_guards.down — `server/migrations/022_task_lifecycle_guards.down.sql`
- 022_task_lifecycle_guards.up — `server/migrations/022_task_lifecycle_guards.up.sql`
- migrate_binary — `server/scratch/migrate_binary.go`

---

# Dependency Graph

## Most Imported Files (change these carefully)

- `encoding/json` — imported by **54** files
- `net/http` — imported by **49** files
- `log/slog` — imported by **48** files
- `packages/core/types/index.ts` — imported by **23** files
- `path/filepath` — imported by **20** files
- `packages/views/common/actor-avatar.tsx` — imported by **19** files
- `packages/core/api/index.ts` — imported by **16** files
- `packages/views/navigation/index.ts` — imported by **15** files
- `os/exec` — imported by **12** files
- `apps/web/features/landing/i18n/index.ts` — imported by **10** files
- `packages/core/types/storage.ts` — imported by **10** files
- `packages/core/platform/storage.ts` — imported by **9** files
- `apps/web/features/landing/components/shared.tsx` — imported by **8** files
- `packages/core/platform/workspace-storage.ts` — imported by **8** files
- `packages/views/issues/components/status-icon.tsx` — imported by **8** files
- `packages/views/issues/components/index.ts` — imported by **8** files
- `packages/views/editor/index.ts` — imported by **8** files
- `packages/views/runtimes/utils.ts` — imported by **8** files
- `net/http/httptest` — imported by **8** files
- `packages/core/logger.ts` — imported by **7** files

## Import Map (who imports what)

- `encoding/json` ← `server/cmd/multica/cmd_agent.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_issue_test.go`, `server/cmd/multica/cmd_repo.go`, `server/cmd/multica/cmd_skill.go` +49 more
- `net/http` ← `server/cmd/multica/cmd_auth.go`, `server/cmd/multica/cmd_daemon.go`, `server/cmd/multica/cmd_issue_test.go`, `server/cmd/multica/cmd_repo.go`, `server/cmd/server/comment_trigger_integration_test.go` +44 more
- `log/slog` ← `server/cmd/migrate/main.go`, `server/cmd/server/activity_listeners.go`, `server/cmd/server/listeners.go`, `server/cmd/server/main.go`, `server/cmd/server/notification_listeners.go` +43 more
- `packages/core/types/index.ts` ← `packages/core/auth/store.ts`, `packages/core/chat/store.ts`, `packages/core/hooks/use-file-upload.ts`, `packages/core/inbox/mutations.ts`, `packages/core/inbox/queries.ts` +18 more
- `path/filepath` ← `server/cmd/migrate/main.go`, `server/cmd/multica/cmd_attachment.go`, `server/internal/cli/client.go`, `server/internal/cli/config.go`, `server/internal/cli/update.go` +15 more
- `packages/views/common/actor-avatar.tsx` ← `packages/views/agents/components/agent-detail.tsx`, `packages/views/agents/components/agent-list-item.tsx`, `packages/views/agents/components/tabs/settings-tab.tsx`, `packages/views/editor/extensions/mention-suggestion.tsx`, `packages/views/inbox/components/inbox-list-item.tsx` +14 more
- `packages/core/api/index.ts` ← `packages/core/chat/mutations.ts`, `packages/core/chat/queries.ts`, `packages/core/inbox/mutations.ts`, `packages/core/inbox/queries.ts`, `packages/core/issues/mutations.ts` +11 more
- `packages/views/navigation/index.ts` ← `packages/views/editor/extensions/mention-view.tsx`, `packages/views/editor/readonly-content.tsx`, `packages/views/inbox/components/inbox-page.tsx`, `packages/views/issues/components/board-card.tsx`, `packages/views/issues/components/issue-detail.tsx` +10 more
- `os/exec` ← `server/cmd/multica/cmd_auth.go`, `server/cmd/multica/cmd_daemon.go`, `server/internal/cli/update.go`, `server/internal/daemon/config.go`, `server/internal/daemon/execenv/git.go` +7 more
- `apps/web/features/landing/i18n/index.ts` ← `apps/web/features/landing/components/about-page-client.tsx`, `apps/web/features/landing/components/changelog-page-client.tsx`, `apps/web/features/landing/components/faq-section.tsx`, `apps/web/features/landing/components/features-section.tsx`, `apps/web/features/landing/components/features-section.tsx` +5 more

---

# Test Coverage

> **50%** of routes and models are covered by tests
> 49 test files found

## Covered Routes

- WS:issue:updated
- WS:issue:created
- WS:issue:deleted
- WS:comment:deleted

## Covered Models

- user
- workspace
- member
- agent
- issue
- comment
- inbox_item
- agent_task_queue
- activity_log
- agent_runtime
- skill
- verification_code
- issue_subscriber
- project

---

_Generated by [codesight](https://github.com/Houseofmvps/codesight) — see your codebase clearly_