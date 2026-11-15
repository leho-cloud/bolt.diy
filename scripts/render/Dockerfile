FROM node:22-bookworm-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg tini fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
RUN npm install --no-audit --no-fund --save-exact @playwright/test@1.64.0 \
  && ./node_modules/.bin/playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*
COPY scripts/render/queue.mjs scripts/render/render-project.mjs scripts/render/worker.mjs /app/scripts/render/
USER node
ENV MUHELY_RENDER_QUEUE=/var/run/muhely-render
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/scripts/render/worker.mjs"]
