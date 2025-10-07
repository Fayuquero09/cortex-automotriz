FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
