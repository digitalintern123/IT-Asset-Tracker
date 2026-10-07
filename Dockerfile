# ==============================================================================
# Multi-stage Docker build for ENCALM Asset Tracker (Expo Web + Node.js)
# ==============================================================================

# Stage 1: Build Expo Web bundle
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy application source code
COPY . .

# Export production web bundle
ENV NODE_ENV=production
RUN npx expo export -p web --output-dir web-build --clear

# Ensure index.html exists in web-build
RUN if [ ! -f web-build/index.html ]; then cp web-build/login.html web-build/index.html 2>/dev/null || true; fi

# Ensure Encalm favicon and brand assets are in web-build root
RUN cp favicon.ico web-build/favicon.ico 2>/dev/null || true
RUN cp assets/brand/encalm-favicon.png web-build/favicon.png 2>/dev/null || true
RUN cp assets/brand/favicon-32.png web-build/favicon-32.png 2>/dev/null || true
RUN cp assets/brand/apple-touch-icon.png web-build/apple-touch-icon.png 2>/dev/null || true

# Copy font assets into web-build/fonts/
RUN mkdir -p web-build/fonts && cp fonts/*.ttf web-build/fonts/

# Rewrite bundle font URLs to /fonts/
RUN node -e '\
const fs = require("fs");\
const path = require("path");\
const dir = "web-build/_expo/static/js/web";\
let patched = 0;\
if (fs.existsSync(dir)) {\
  fs.readdirSync(dir).filter(f => f.endsWith(".js")).forEach(file => {\
    const p = path.join(dir, file);\
    let c = fs.readFileSync(p, "utf8");\
    const before = c;\
    c = c.replace(/assets\/[^"]*Feather\.[^"]*\.ttf/g, "fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf");\
    c = c.replace(/assets\/[^"]*MaterialIcons\.[^"]*\.ttf/g, "fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf");\
    c = c.replace(/assets\/[^"]*Ionicons\.[^"]*\.ttf/g, "fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf");\
    c = c.replace(/assets\/[^"]*FontAwesome\.[^"]*\.ttf/g, "fonts/FontAwesome.b06871f281fee6b241d60582ae9369b9.ttf");\
    if (/"(?!fonts\/)[^"]*(Feather|MaterialIcons|Ionicons|FontAwesome)\.[0-9a-f]+\.ttf"/.test(c)) { console.error("UNPATCHED ICON FONT PATHS in " + file); process.exit(1); }\
    if (c === before) return;\
    fs.writeFileSync(p, c);\
    patched++;\
    console.log("Patched font paths in:", file);\
  });\
}\
if (patched === 0) console.log("No vector-icon font paths in bundle; nothing to patch.");\
'

# Stage 2: Runtime container (lightweight Node.js server)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000
ENV STATIC_DIR=web-build

# Copy server and static build
COPY server ./server
COPY --from=builder /app/web-build ./web-build

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:10000/health || exit 1

CMD ["node", "server/serve-web.js"]
