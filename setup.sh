#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# FamilyWin — Automated Setup Script
# Run this once after unzipping the project:  bash setup.sh
# Claude Code can also run this autonomously
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Stop on any error

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FamilyWin — Project Setup            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/6] Checking Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found. Install from nodejs.org first.${NC}"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js version must be 18+. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# ── 2. Check Java ─────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] Checking Java...${NC}"
if ! command -v java &> /dev/null; then
    echo -e "${RED}✗ Java not found. Install JDK 17 from adoptium.net${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Java found${NC}"

# ── 3. Install dependencies ───────────────────────────────────────────────────
echo -e "${YELLOW}[3/6] Installing npm dependencies...${NC}"
npm install
echo -e "${GREEN}✓ npm install complete${NC}"

# ── 4. Install Firebase CLI if not present ────────────────────────────────────
echo -e "${YELLOW}[4/6] Checking Firebase CLI...${NC}"
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}  Firebase CLI not found — installing...${NC}"
    npm install -g firebase-tools
fi
echo -e "${GREEN}✓ Firebase CLI $(firebase --version)${NC}"

# ── 5. Install Cloud Function dependencies ────────────────────────────────────
echo -e "${YELLOW}[5/6] Installing Cloud Function dependencies...${NC}"
if [ -d "firebase/functions" ]; then
    cd firebase/functions && npm install && cd ../..
    echo -e "${GREEN}✓ Cloud Functions dependencies installed${NC}"
else
    echo -e "${YELLOW}  firebase/functions not found — skipping${NC}"
fi

# ── 6. Check for google-services.json ────────────────────────────────────────
echo -e "${YELLOW}[6/6] Checking Firebase config...${NC}"
if [ ! -f "google-services.json" ]; then
    echo ""
    echo -e "${RED}⚠️  MISSING: google-services.json${NC}"
    echo -e "${YELLOW}   You need to:${NC}"
    echo -e "${YELLOW}   1. Create a Firebase project at console.firebase.google.com${NC}"
    echo -e "${YELLOW}   2. Add an Android app (package: com.familywin.app)${NC}"
    echo -e "${YELLOW}   3. Download google-services.json${NC}"
    echo -e "${YELLOW}   4. Place it in this folder (FamilyWin root)${NC}"
    echo -e "${YELLOW}   5. Also copy it to android/app/ after running prebuild${NC}"
    echo ""
    echo -e "${YELLOW}   Also update lib/googleAuth.ts line 20 with your Web Client ID${NC}"
    echo ""
else
    echo -e "${GREEN}✓ google-services.json found${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""

if [ ! -f "google-services.json" ]; then
    echo -e "  ${RED}1. Get google-services.json from Firebase Console (REQUIRED)${NC}"
    echo -e "  ${RED}2. Set WEB_CLIENT_ID in lib/googleAuth.ts (REQUIRED)${NC}"
    echo -e "  3. Run: ${BLUE}npx expo prebuild --platform android${NC}"
    echo -e "  4. Open ${BLUE}android/${NC} folder in Android Studio"
    echo -e "  5. Connect phone → press ▶ Run"
else
    echo -e "  1. Run: ${BLUE}npx expo prebuild --platform android${NC}"
    echo -e "  2. Open ${BLUE}android/${NC} folder in Android Studio"
    echo -e "  3. Connect phone → press ▶ Run"
fi

echo ""
echo -e "  ${YELLOW}Full setup guide: FIREBASE_SETUP.md${NC}"
echo -e "  ${YELLOW}Deployment guide: android-deployment-guide.html${NC}"
echo ""
