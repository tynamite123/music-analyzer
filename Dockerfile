FROM node:18-bullseye

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-dev \
    build-essential libyaml-dev libfftw3-dev \
    libavcodec-dev libavformat-dev libavutil-dev \
    libsamplerate0-dev libtag1-dev libflac-dev libogg-dev libvorbis-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Node deps
COPY package*.json ./
RUN npm install

# Copy Python deps
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of the app
COPY . .

EXPOSE 8080
ENV PORT=8080

CMD ["node", "index.js"]
