let playlist = [];
let currentIndex = 0;
let wavesurfer;

// Initialize WaveSurfer
function initWaveSurfer(url) {
  if (wavesurfer) {
    wavesurfer.destroy();
  }
  wavesurfer = WaveSurfer.create({
    container: "#waveform",
    waveColor: "#4F4A85",
    progressColor: "#383351",
    height: 100,
    responsive: true,
    url: url
  });
}

// Playlist management
const playlistContainer = document.getElementById("playlist");
const playPauseBtn = document.getElementById("playPauseBtn");

function addToPlaylist(file, analysis) {
  const track = {
    file,
    analysis,
    url: URL.createObjectURL(file)
  };
  playlist.push(track);
  renderPlaylist();
}

function renderPlaylist() {
  playlistContainer.innerHTML = "";
  playlist.forEach((track, index) => {
    const item = document.createElement("div");
    item.innerHTML = `
      <p>
        <strong>${track.file.name}</strong> 
        (${track.analysis?.bpm ?? "?"} BPM, ${track.analysis?.key ?? "?"})
        <button onclick="playTrack(${index})">Play</button>
      </p>
    `;
    playlistContainer.appendChild(item);
  });
}

function playTrack(index) {
  currentIndex = index;
  initWaveSurfer(playlist[index].url);
  wavesurfer.on("ready", () => {
    wavesurfer.play();
  });
}

playPauseBtn.addEventListener("click", () => {
  if (wavesurfer) {
    wavesurfer.playPause();
  }
});
