# expo-air Tasks Plan

## Task 1: Fix Init Next Steps
**Complexity:** Trivial | **Approval:** Not needed

### Problem
After `init` command, shows `npx expo-air start` instead of `npx expo-air fly`

### Plan
1. Edit `cli/commands/init.ts` line 137
2. Change `"npx expo-air start"` → `"npx expo-air fly"`

### Files
- `cli/commands/init.ts` (1 line change)

---

## Task 2: Folder Watch Bug
**Complexity:** Trivial | **Approval:** Not needed

### Problem
New folders don't show internal file changes in git status

### Plan
1. Edit `cli/server/promptServer.ts` line 51
2. Change `git status --porcelain` → `git status --porcelain -u`

### Files
- `cli/server/promptServer.ts` (1 line change)

---

## Task 3: Free Port Selection
**Complexity:** Small | **Approval:** Not needed

### Problem
Port 8081 might be busy, causing build to fail/stuck

### Plan
1. Create `cli/utils/ports.ts` with:
   - `isPortAvailable(port)` - check if port is free
   - `findFreePort(startPort)` - find next available port
2. Update `cli/commands/fly.ts`:
   - Import port utilities
   - Before starting services, resolve each port
   - Log warning if using different port than requested
3. Apply same changes to `cli/commands/start.ts`

### Files
- `cli/utils/ports.ts` (new ~40 lines)
- `cli/commands/fly.ts` (modify port assignment)
- `cli/commands/start.ts` (modify port assignment)

---

## Task 4: Smart Commit & PR
**Complexity:** Medium | **Approval:** Required

### Problem
Developers want to commit/create PRs with LLM-generated messages based on session context

### Plan

#### Phase 1: Message Types
Add to `cli/types/messages.ts`:
- `generate_commit`, `perform_commit`, `commit_preview`, `commit_result`
- `generate_pr`, `create_pr`, `pr_preview`, `pr_result`

#### Phase 2: Server Handlers
Add to `cli/server/promptServer.ts`:
- `getGitDiff()` - get full diff
- `generateCommitMessage()` - LLM generates from session + diff
- `generatePRDescription()` - LLM generates title/description
- `performCommit(message)` - stage all + commit
- `createPR(title, body)` - use `gh pr create`

#### Phase 3: WebSocket Client
Add to `widget/services/websocket.ts`:
- `requestGenerateCommit()`
- `requestPerformCommit(message)`
- `requestGeneratePR()`
- `requestCreatePR(title, description)`

#### Phase 4: Widget UI
Create `widget/components/CommitPRPanel.tsx`:
- Commit tab: Generate → Edit → Commit
- PR tab: Generate → Edit → Create PR
- Loading states, success/error feedback

Update `widget/components/GitChangesTab.tsx`:
- Add "Commit" and "Create PR" buttons

### Files
- `cli/types/messages.ts` (add 8 message types)
- `cli/server/promptServer.ts` (add handlers)
- `widget/services/websocket.ts` (add methods)
- `widget/components/CommitPRPanel.tsx` (new)
- `widget/components/GitChangesTab.tsx` (add buttons)
- `widget/BubbleContent.tsx` (integrate panel)

---

## Task 5: Production Validation
**Complexity:** Medium | **Approval:** Required

### Problem
Widget code and dev-only permissions might leak into production builds

### Current State (Good)
- iOS has `#if DEBUG` guards in Swift files
- Widget auto-show is dev-only

### Gaps Found
1. **Info.plist entries** - `serverUrl`, `widgetMetroUrl`, `appMetroUrl` written unconditionally
2. **ATS exceptions** - Tunnel domains added for all builds
3. **JS exports** - No `__DEV__` guards on widget methods
4. **Podspec** - `widget.jsbundle` included unconditionally

### Plan

#### Phase 1: Plugin Fixes (High Priority)
Edit `plugin/src/index.ts`:
- Only write URL keys when values exist (from `.expo-air.local.json`)
- Make ATS exceptions conditional on dev mode

#### Phase 2: JS Guards (Medium Priority)
Edit `src/index.ts`:
```typescript
const ExpoAir = __DEV__ ? ExpoAirModule : {
  show: () => {},
  hide: () => {},
  // ... no-ops
};
```

#### Phase 3: Documentation
- Document that widget is dev-only
- Add production build verification instructions

### Files
- `plugin/src/index.ts` (conditional Info.plist/ATS)
- `src/index.ts` (add `__DEV__` guards)
- `README.md` (document production behavior)

---

## Task 6: Extra Tunnels
**Complexity:** Medium | **Approval:** Required

### Problem
Developers need to expose additional local servers (e.g., API on port 3000) via tunnels

### Plan

#### Phase 1: CLI Option
Add to `cli/bin/expo-air.ts`:
```
--extra-tunnel <spec...>  // e.g., 3000 or 3000:api
```

#### Phase 2: Config Support
Add to `.expo-air.json`:
```json
{
  "extraTunnels": [
    { "port": 3000, "name": "api" }
  ]
}
```

#### Phase 3: Implementation
Edit `cli/commands/start.ts` and `fly.ts`:
- Parse CLI + config extra tunnels
- Create CloudflareTunnel for each
- Display URLs in output
- Save to `.expo-air.local.json`
- Clean up on shutdown

### Output Example
```
Extra tunnels:
  Port 3000 (api): https://xyz.trycloudflare.com
```

### Files
- `cli/bin/expo-air.ts` (add CLI option)
- `cli/commands/start.ts` (implement extra tunnels)
- `cli/commands/fly.ts` (implement extra tunnels)
- `cli/utils/config.ts` (optional: shared config helpers)

---

## Execution Order Recommendation

1. **Immediate** (no approval needed):
   - Task 1: Fix Init Next Steps
   - Task 2: Folder Watch Bug
   - Task 3: Free Port Selection

2. **After approval**:
   - Task 4: Smart Commit & PR
   - Task 5: Production Validation
   - Task 6: Extra Tunnels
