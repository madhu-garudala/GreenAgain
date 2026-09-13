FROM public.ecr.aws/docker/library/node:22-slim
WORKDIR /app
COPY dist/worker/index.js /app/index.js
USER node
CMD ["node", "index.js"]
