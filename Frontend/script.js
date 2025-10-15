const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const resultsDiv = document.getElementById("results");

async function uploadAndAnalyzeFile(file) {
  const formData = new FormData();
  formData.append("track", file);

  try {
    const response = await fetch("http://localhost:8080/upload", {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error(`Server error: ${response.status}`);

    const result = await response.json();

    // Find analysis for this file
    const analysis =
      result.analysis?.find(item => item.filename === file.name) ||
      result.analysis?.[0];

    if (!analysis) {
      console.warn("No analysis returned for", file.name);
      return null;
    }

    displayResult(analysis);
    return analysis;
  } catch (err) {
    console.error("Upload failed:", err);
    resultsDiv.innerHTML = `<p style="color:red">Upload failed: ${err.message}</p>`;
    return null;
  }
}

function displayResult(analysis) {
  const div = document.createElement("div");
  div.innerHTML = `
    <h3>Analysis Result</h3>
    <p><strong>Filename:</strong> ${analysis.filename}</p>
    <p>BPM: ${analysis.bpm}</p>
    <p>Key: ${analysis.key}</p>
    <p>Energy: ${analysis.energy}</p>
    <p>Loudness: ${analysis.loudness}</p>
    <p>Danceability: ${analysis.danceability}</p>
    <p>Spectral Centroid: ${analysis.spectral_centroid}</p>
    <p>Spectral Bandwidth: ${analysis.spectral_bandwidth}</p>
    <p>Spectral Rolloff: ${analysis.spectral_rolloff}</p>
  `;
  resultsDiv.appendChild(div);
}

uploadBtn.addEventListener("click", async () => {
  const files = fileInput.files;
  if (!files.length) {
    alert("Please select at least one file!");
    return;
  }

  for (const file of files) {
    const analysis = await uploadAndAnalyzeFile(file);
    if (analysis) {
      addToPlaylist(file, analysis); // from player.js
    }
  }
});
