# Release Checklist — Release Candidate

## Pre-Release Verification

### 1. Test Suite
- [x] All 1369 tests passing (71 test files)
- [x] No flaky tests
- [x] Integration tests pass
- [x] Legacy migration tests pass

### 2. Security
- [x] No hardcoded API keys in source code
- [x] `OPENROUTER_API_KEY` reads from environment only
- [x] `SUPABASE_SERVICE_ROLE_KEY` reads from environment only
- [x] `WHATSAPP_TOKEN` reads from environment only
- [x] `WHATSAPP_APP_SECRET` reads from environment only
- [x] `JWT_SECRET` reads from environment only
- [x] `.env` and `.dev.vars` in `.gitignore`
- [x] `wrangler.toml` sanitized (placeholders instead of real values)
- [x] Admin panel `auth.js` sanitized

### 3. Architecture
- [x] Zero circular dependencies
- [x] No dead code (legacy files removed)
- [x] No duplicate modules (admin-ai-engine merged)
- [x] Interview v2 pipeline stable

### 4. Performance
- [x] Engine startup: < 0.02ms
- [x] ToolRegistry.get: < 0.001ms
- [x] ToolExecute sync: < 0.01ms
- [x] PlanningEngine.createPlan: < 0.03ms
- [x] ContextManager.getSession: < 0.001ms
- [x] ConversationManager.list(100): < 0.5ms

### 5. Memory
- [x] ConversationMemory: TTL prune + max entries limit
- [x] Chat handler: IN_FLIGHT, LAST_MESSAGE, RATE_LIMIT_MAP all cleaned up
- [x] No leaked timers or event listeners

### 6. Documentation
- [x] ARCHITECTURE.md updated
- [x] README.md created
- [x] .env.example updated
- [x] docs/architecture.md
- [x] docs/nexus-engine.md
- [x] docs/tools.md
- [x] docs/whatsapp.md
- [x] docs/crm.md

### 7. CI/CD
- [x] GitHub Actions workflow configured
- [x] Deploy step uses `wrangler deploy --env production`
- [x] Secrets managed via GitHub Actions secrets

## Deploy Steps

```bash
# 1. Configure secrets in GitHub
gh secret set OPENROUTER_API_KEY
gh secret set SUPABASE_SERVICE_ROLE_KEY
gh secret set WHATSAPP_TOKEN
gh secret set WHATSAPP_APP_SECRET
gh secret set JWT_SECRET
gh secret set CLOUDFLARE_API_TOKEN

# 2. Push to main (triggers auto-deploy via GitHub Actions)
git push origin main

# 3. Or deploy manually
cd backend/worker
npx wrangler deploy --env production

# 4. Verify
npx wrangler tail
```

## Post-Deploy Verification

- [ ] Webhook responds to Meta verification
- [ ] WhatsApp messages processed correctly
- [ ] Admin panel accessible and functional
- [ ] Interviews collect and save data
- [ ] Events flow through pipeline
- [ ] Notifications delivered
- [ ] Metrics visible in dashboard

## Rollback

```bash
npx wrangler rollback
# Or:
npx wrangler deploy --env production --version <previous-version>
```
