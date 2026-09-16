# React demo: one Dockerfile, two targets.
#   dev   : Vite dev server with HMR (source is bind-mounted by the dev overlay)
#   prod  : static production build served by a small nginx on :80
# Both listen on container port 80 so the reverse proxy config is identical.

# ---- base deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# ---- dev ----
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 80
CMD ["npm", "run", "dev"]

# ---- build ----
FROM node:20-alpine AS build
ARG VITE_STUDY_ALIGN_URL
ENV VITE_STUDY_ALIGN_URL=$VITE_STUDY_ALIGN_URL
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod ----
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Vite base is /react/, so serve the build under that path.
COPY --from=build /app/dist /usr/share/nginx/html/react
