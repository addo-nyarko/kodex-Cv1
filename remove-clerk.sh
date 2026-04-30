#!/usr/bin/env bash
# ============================================================
# remove-clerk.sh — Find and remove all Clerk references
# Run from your project root:  bash remove-clerk.sh
# ============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Clerk Removal Script for Kodex${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ----------------------------------------------------------
# 1. Remove Clerk from package.json
# ----------------------------------------------------------
echo -e "${YELLOW}[1/6] Checking package.json for Clerk packages...${NC}"
if grep -i "clerk" package.json 2>/dev/null; then
  echo -e "${RED}  ^^^ Found Clerk in package.json! Removing...${NC}"
  npm uninstall @clerk/nextjs @clerk/themes @clerk/types @clerk/clerk-react @clerk/backend 2>/dev/null || true
  echo -e "${GREEN}  Done.${NC}"
else
  echo -e "${GREEN}  No Clerk packages found.${NC}"
fi
echo ""

# ----------------------------------------------------------
# 2. Comment out Clerk env vars in .env files
# ----------------------------------------------------------
echo -e "${YELLOW}[2/6] Checking .env files...${NC}"
FOUND_ENV=0
for f in .env .env.local .env.production .env.development .env.example; do
  if [ -f "$f" ]; then
    if grep -in "clerk" "$f"; then
      FOUND_ENV=1
      sed -i.bak '/[Cc][Ll][Ee][Rr][Kk]/s/^/# REMOVED: /' "$f"
      echo -e "${GREEN}  Commented out Clerk lines in $f${NC}"
    fi
  fi
done
[ "$FOUND_ENV" -eq 0 ] && echo -e "${GREEN}  No Clerk env vars found.${NC}"
echo ""

# ----------------------------------------------------------
# 3. Replace middleware if it imports Clerk
# ----------------------------------------------------------
echo -e "${YELLOW}[3/6] Checking middleware files...${NC}"
for f in middleware.ts middleware.js src/middleware.ts src/middleware.js; do
  if [ -f "$f" ]; then
    if grep -in "clerk" "$f"; then
      echo -e "${RED}  Clerk found in $f — replacing with no-op${NC}"
      cp "$f" "${f}.clerk-backup"
      cat > "$f" << 'MIDDLEWARE_EOF'
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: [] };
MIDDLEWARE_EOF
      echo -e "${GREEN}  Replaced $f (backup saved as ${f}.clerk-backup)${NC}"
    else
      echo -e "${GREEN}  $f exists but has no Clerk references.${NC}"
    fi
  fi
done
echo ""

# ----------------------------------------------------------
# 4. Scan ALL source files for Clerk imports/usage
# ----------------------------------------------------------
echo -e "${YELLOW}[4/6] Scanning all source files for Clerk references...${NC}"
echo -e "${CYAN}  (Excluding node_modules, .next, .git)${NC}"
echo ""

MATCHES=$(grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  -e "@clerk" -e "ClerkProvider" -e "clerkMiddleware" -e "authMiddleware" \
  -e "clerkClient" -e "currentUser" -e "useUser" -e "useAuth" -e "useClerk" \
  -e "UserButton" -e "SignedIn" -e "SignedOut" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  --exclude="*.backup" --exclude="*.bak" --exclude="remove-clerk.sh" \
  . 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo -e "${RED}  Found Clerk references:${NC}"
  echo ""
  echo "$MATCHES" | while IFS= read -r line; do
    CONTENT=$(echo "$line" | cut -d: -f3-)
    # Skip lines that are just regex pattern matches (e.g. in a scanner)
    if echo "$CONTENT" | grep -qE '/clerk|regex|pattern|\.test\(|\.some\('; then
      echo -e "  ${YELLOW}[SKIP - regex/pattern only]${NC} $line"
    else
      echo -e "  ${RED}[ACTION NEEDED]${NC} $line"
    fi
  done
  echo ""
  echo -e "${YELLOW}  >>> Manually edit files marked [ACTION NEEDED]:${NC}"
  echo -e "  - Remove 'import ... from \"@clerk/nextjs\"' lines"
  echo -e "  - Replace <ClerkProvider>{children}</ClerkProvider> with <>{children}</>"
  echo -e "  - Replace auth()/currentUser() with your own auth logic"
  echo -e "  - Remove <UserButton/>, <SignIn/>, <SignUp/> components"
  echo -e "  - Files marked [SKIP] are just string patterns (safe to keep)"
else
  echo -e "${GREEN}  No Clerk references found in source files!${NC}"
fi
echo ""

# ----------------------------------------------------------
# 5. Clean lock file of residual Clerk entries
# ----------------------------------------------------------
echo -e "${YELLOW}[5/6] Checking lock file for residual Clerk packages...${NC}"
if [ -f "package-lock.json" ] && grep -q "clerk" package-lock.json 2>/dev/null; then
  echo -e "${RED}  Clerk still in package-lock.json. Running clean install...${NC}"
  rm -rf node_modules package-lock.json
  npm install
  echo -e "${GREEN}  Clean install complete.${NC}"
elif [ -f "yarn.lock" ] && grep -q "clerk" yarn.lock 2>/dev/null; then
  echo -e "${RED}  Clerk still in yarn.lock. Running clean install...${NC}"
  rm -rf node_modules yarn.lock
  yarn install
  echo -e "${GREEN}  Clean install complete.${NC}"
else
  echo -e "${GREEN}  Lock file is clean.${NC}"
fi
echo ""

# ----------------------------------------------------------
# 6. Clear .next build cache
# ----------------------------------------------------------
echo -e "${YELLOW}[6/6] Clearing .next build cache...${NC}"
rm -rf .next
echo -e "${GREEN}  Build cache cleared.${NC}"
echo ""

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  COMPLETE — Next steps${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  1. Fix any files marked ${RED}[ACTION NEEDED]${NC} above"
echo -e "  2. Run:  ${CYAN}npm run build${NC}"
echo -e "  3. If build passes:  ${CYAN}git add -A && git commit -m 'Remove Clerk' && git push${NC}"
echo ""
