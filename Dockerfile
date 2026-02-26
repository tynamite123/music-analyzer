FROM node:20-bullseye

# Install Python, sox, sqlite, and lightweight ffmpeg
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv sox sqlite3 curl wget && \
    wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    tar -xf ffmpeg-release-amd64-static.tar.xz && \
    mv ffmpeg-*-static/ffmpeg /usr/local/bin/ && \
    mv ffmpeg-*-static/ffprobe /usr/local/bin/ && \
    rm -rf ffmpeg-*-static ffmpeg-release-amd64-static.tar.xz && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy app files
COPY . .

# Copy only the required Essentia WASM runtime files
RUN mkdir -p public/essentia
RUN cp node_modules/essentia.js/dist/essentia.js-core.es.js public/essentia/
RUN cp node_modules/essentia.js/dist/essentia-wasm.es.js public/essentia/
RUN cp node_modules/essentia.js/dist/essentia-wasm.wasm public/essentia/

# Python venv setup
RUN python3 -m venv venv && \
    . venv/bin/activate && \
    pip install --upgrade pip && \
    pip install -r requirements.txt

EXPOSE 8080

CMD ["node", "index.js"]
