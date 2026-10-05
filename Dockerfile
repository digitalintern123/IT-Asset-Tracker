# ==============================================================================
# Multi-stage Docker build for ENCALM Asset Tracker (Expo Web + Node.js)
# ==============================================================================

# Stage 1: Build Expo Web bundle
FROM node:20-bullseye-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copy application source code
COPY . .

# Export production web bundle
ENV NODE_ENV=production
RUN npx expo export -p web --output-dir web-build --clear

# Copy font assets into web-build/fonts/
RUN mkdir -p web-build/fonts && cp fonts/*.ttf web-build/fonts/

# Rewrite bundle font URLs to /fonts/
RUN node -e '\
const fs = require("fs");\
const path = require("path");\
const dir = "web-build/_expo/static/js/web";\
if (fs.existsSync(dir)) {\
  fs.readdirSync(dir).filter(f => f.endsWith(".js")).forEach(file => {\
    const p = path.join(dir, file);\
    let c = fs.readFileSync(p, "utf8");\
    c = c.replace(/assets\/__node_modules[^"]*Feather\.[^"]*\.ttf/g, "fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf");\
    c = c.replace(/assets\/__node_modules[^"]*MaterialIcons\.[^"]*\.ttf/g, "fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf");\
    c = c.replace(/assets\/__node_modules[^"]*Ionicons\.[^"]*\.ttf/g, "fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf");\
    c = c.replace(/assets\/__node_modules[^"]*FontAwesome\.[^"]*\.ttf/g, "fonts/FontAwesome.b06871f281fee6b241d60582ae9369b9.ttf");\
    fs.writeFileSync(p, c);\
    console.log("Patched font paths in:", file);\
  });\
}\
'

# Stage 2: Runtime container (lightweight Node.js server)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000
ENV STATIC_DIR=web-build

# Copy server and static build
COPY server/serve-web.js ./server/
COPY --from=builder /app/web-build ./web-build

EXPOSE 10000

CMD ["node", "server/serve-web.js"]
