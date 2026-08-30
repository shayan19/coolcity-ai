FROM node:24.19.0-alpine

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --global "npm@11.17.0" \
    && npm ci

COPY frontend ./
COPY data /app/data

ARG NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL} \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
