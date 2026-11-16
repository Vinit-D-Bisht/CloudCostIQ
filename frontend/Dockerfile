# Build static UI (strip optional Emergent remote packages that block public npm).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
# Remove platform-only remote tarballs so `npm install` works offline/public registries.
RUN node -e "\
  const fs=require('fs');\
  const p=JSON.parse(fs.readFileSync('package.json','utf8'));\
  for (const bag of ['dependencies','devDependencies']) {\
    if (!p[bag]) continue;\
    for (const k of Object.keys(p[bag])) {\
      if (k.startsWith('@emergentbase/')) delete p[bag][k];\
    }\
  }\
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2));\
"

COPY package-lock.json* yarn.lock* ./
RUN npm install --no-audit --no-fund

COPY . .
ENV DISABLE_VISUAL_EDITS=true \
    DISABLE_EMERGENT_OVERLAY=true
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
