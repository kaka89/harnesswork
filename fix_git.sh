#!/bin/bash
exec > /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork/git_result.txt 2>&1

cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork

echo "=== Current HEAD ==="
cat .git/HEAD

echo "=== Rebase state ==="
ls -la .git/rebase-merge/ 2>/dev/null || echo "No rebase-merge dir"

echo "=== Aborting rebase ==="
GIT_EDITOR=true git rebase --abort 2>&1
echo "abort exit: $?"

echo "=== Post-abort HEAD ==="
cat .git/HEAD

echo "=== Post-abort rebase state ==="
ls -la .git/rebase-merge/ 2>/dev/null || echo "No rebase-merge dir"

echo "=== Branch ==="
git --no-pager branch -v

echo "=== Log ==="
git --no-pager log --oneline -5

echo "=== Status ==="
git --no-pager status

echo "=== DONE ==="
