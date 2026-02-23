FROM node:20-bullseye

# Install only the tools you actually need
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv ffmpeg sox sqlite3 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

# Python venv setup
RUN python3 -m venv venv && \
    . venv/bin/activate && \
    pip install --upgrade pip && \
    pip install -r requirements.txt

EXPOSE 8080

CMD ["node", "index.js"]
